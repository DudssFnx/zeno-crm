import puppeteer, { Browser, Page } from "puppeteer";
import { Server as SocketServer } from "socket.io";
import fs from "fs";
import path from "path";

const SESSION_DIR = "./whatsapp-sessions";

interface WhatsAppSession {
  accountId: string;
  browser: Browser | null;
  page: Page | null;
  status: "disconnected" | "pending_qr" | "connected" | "connecting";
  qrCode: string | null;
  lastError: string | null;
  messageListenerInterval: NodeJS.Timeout | null;
  companyId?: string;
  processedMessages: Set<string>;
}

export interface IncomingMessage {
  phoneNumber: string;
  contactName: string;
  content: string;
  timestamp: string;
}

export type MessageHandler = (accountId: string, message: IncomingMessage) => Promise<void>;

class WhatsAppPuppeteerGateway {
  private sessions: Map<string, WhatsAppSession> = new Map();
  private io: SocketServer | null = null;
  private messageHandler: MessageHandler | null = null;

  setMessageHandler(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  setSocketServer(io: SocketServer) {
    this.io = io;
  }

  private getSessionPath(accountId: string): string {
    return path.join(SESSION_DIR, accountId);
  }

  private ensureSessionDir(accountId: string) {
    const sessionPath = this.getSessionPath(accountId);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
  }

  async startSession(accountId: string): Promise<{ success: boolean; message: string }> {
    try {
      let session = this.sessions.get(accountId);
      
      if (session?.status === "connected") {
        return { success: true, message: "Already connected" };
      }

      if (session?.status === "connecting" || session?.status === "pending_qr") {
        return { success: true, message: "Connection in progress" };
      }

      this.ensureSessionDir(accountId);

      session = {
        accountId,
        browser: null,
        page: null,
        status: "connecting",
        qrCode: null,
        lastError: null,
        messageListenerInterval: null,
        processedMessages: new Set<string>(),
      };
      this.sessions.set(accountId, session);

      this.emitStatus(accountId, "connecting");

      const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--window-size=1280,800",
          "--disable-software-rasterizer",
        ],
        userDataDir: this.getSessionPath(accountId),
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      session.browser = browser;
      session.page = page;
      this.sessions.set(accountId, session);

      await page.goto("https://web.whatsapp.com", {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      await this.waitForQROrConnection(accountId);

      return { success: true, message: "Session started" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`WhatsApp session error for ${accountId}:`, errorMessage);
      
      await this.cleanupSession(accountId);
      
      const session = this.sessions.get(accountId);
      if (session) {
        session.status = "disconnected";
        session.lastError = errorMessage;
        this.sessions.set(accountId, session);
      }
      
      this.emitStatus(accountId, "disconnected", errorMessage);
      return { success: false, message: errorMessage };
    }
  }

  private async waitForQROrConnection(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session?.page) return;

    const page = session.page;

    const checkConnection = async (): Promise<boolean> => {
      try {
        const isConnected = await page.evaluate(() => {
          // Multiple selectors to detect successful connection
          const selectors = [
            '[data-testid="chat-list"]',
            '[aria-label="Chat list"]',
            '[data-testid="chatlist-header"]',
            '[data-testid="menu-bar-menu"]',
            'div[data-tab="3"]', // Chat tab
            '#pane-side', // Main side panel
            '[data-testid="default-user"]', // User profile area
            'header span[data-testid]', // Header with user info
          ];
          
          for (const selector of selectors) {
            if (document.querySelector(selector)) {
              return true;
            }
          }
          
          // Check if QR code is NOT present (means we're connected)
          const qrCanvas = document.querySelector('canvas');
          const loginScreen = document.querySelector('[data-testid="qrcode"]');
          const isOnLoginScreen = !!(qrCanvas || loginScreen);
          
          // If there's no QR/login screen AND there's some content
          const hasContent = document.querySelector('div[role="application"]');
          if (!isOnLoginScreen && hasContent) {
            return true;
          }
          
          return false;
        });
        return isConnected;
      } catch {
        return false;
      }
    };

    const getQRCode = async (): Promise<string | null> => {
      try {
        const qrCanvas = await page.$('canvas[aria-label="Scan this QR code to link a device!"]');
        if (qrCanvas) {
          const qrDataUrl = await page.evaluate((canvas) => {
            return (canvas as HTMLCanvasElement).toDataURL("image/png");
          }, qrCanvas);
          return qrDataUrl;
        }

        const qrCode = await page.evaluate(() => {
          const canvas = document.querySelector("canvas");
          if (canvas) {
            return canvas.toDataURL("image/png");
          }
          return null;
        });
        return qrCode;
      } catch {
        return null;
      }
    };

    let attempts = 0;
    const maxAttempts = 120;

    while (attempts < maxAttempts) {
      const currentSession = this.sessions.get(accountId);
      if (!currentSession || currentSession.status === "disconnected") {
        break;
      }

      if (await checkConnection()) {
        session.status = "connected";
        session.qrCode = null;
        this.sessions.set(accountId, session);
        this.emitStatus(accountId, "connected");
        
        this.startMessageListener(accountId);
        break;
      }

      const qrCode = await getQRCode();
      if (qrCode && qrCode !== session.qrCode) {
        session.status = "pending_qr";
        session.qrCode = qrCode;
        this.sessions.set(accountId, session);
        this.emitQRCode(accountId, qrCode);
        this.emitStatus(accountId, "pending_qr");
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      await this.cleanupSession(accountId);
      session.status = "disconnected";
      session.lastError = "Connection timeout";
      this.sessions.set(accountId, session);
      this.emitStatus(accountId, "disconnected", "Connection timeout");
    }
  }

  private startMessageListener(accountId: string): void {
    const session = this.sessions.get(accountId);
    if (!session?.page) return;

    if (session.messageListenerInterval) {
      clearInterval(session.messageListenerInterval);
    }

    console.log(`Starting message listener for account ${accountId}`);

    const interval = setInterval(async () => {
      try {
        const currentSession = this.sessions.get(accountId);
        if (!currentSession || currentSession.status !== "connected" || !currentSession.page) {
          clearInterval(interval);
          return;
        }

        const page = currentSession.page;

        const unreadChats = await page.evaluate(() => {
          const chatItems = document.querySelectorAll('[data-testid="cell-frame-container"]');
          const unread: Array<{
            name: string;
            phoneOrId: string;
            unreadCount: number;
            lastMessage: string;
            time: string;
          }> = [];

          chatItems.forEach((chat) => {
            const unreadBadge = chat.querySelector('[data-testid="icon-unread-count"]');
            const unreadSpan = chat.querySelector('span[aria-label*="unread"]');
            
            if (unreadBadge || unreadSpan) {
              const nameEl = chat.querySelector('[data-testid="cell-frame-title"] span');
              const lastMsgEl = chat.querySelector('[data-testid="last-msg-status"]')?.parentElement;
              const timeEl = chat.querySelector('[data-testid="cell-frame-primary-detail"]');
              
              const name = nameEl?.textContent || "";
              const lastMessage = lastMsgEl?.textContent || "";
              const time = timeEl?.textContent || "";
              
              const phoneMatch = name.match(/\+?\d[\d\s-]{8,}/);
              const phoneOrId = phoneMatch ? phoneMatch[0].replace(/[\s-]/g, "") : name;
              
              const countText = unreadSpan?.getAttribute("aria-label") || "";
              const countMatch = countText.match(/(\d+)/);
              const unreadCount = countMatch ? parseInt(countMatch[1]) : 1;

              unread.push({
                name,
                phoneOrId,
                unreadCount,
                lastMessage,
                time,
              });
            }
          });

          return unread;
        });

        for (const chat of unreadChats) {
          const messageKey = `${chat.phoneOrId}:${chat.lastMessage}:${chat.time}`;
          
          if (!currentSession.processedMessages.has(messageKey) && chat.lastMessage) {
            currentSession.processedMessages.add(messageKey);
            
            console.log(`New message from ${chat.name}: ${chat.lastMessage}`);

            if (this.messageHandler) {
              const phoneNumber = chat.phoneOrId.replace(/\D/g, "");
              
              await this.messageHandler(accountId, {
                phoneNumber: phoneNumber || chat.name,
                contactName: chat.name,
                content: chat.lastMessage,
                timestamp: new Date().toISOString(),
              });
            }

            this.emitMessages(accountId, [{
              text: chat.lastMessage,
              time: chat.time,
              incoming: true,
              from: chat.name,
              phone: chat.phoneOrId,
            }]);
          }
        }

        if (currentSession.processedMessages.size > 1000) {
          const messages = Array.from(currentSession.processedMessages);
          currentSession.processedMessages = new Set(messages.slice(-500));
        }

      } catch (error) {
        console.error("Message listener error:", error);
      }
    }, 3000);

    session.messageListenerInterval = interval;
    this.sessions.set(accountId, session);
  }

  async getQRCode(accountId: string): Promise<string | null> {
    const session = this.sessions.get(accountId);
    return session?.qrCode || null;
  }

  getStatus(accountId: string): string {
    const session = this.sessions.get(accountId);
    return session?.status || "disconnected";
  }

  async sendMessage(
    accountId: string,
    phoneNumber: string,
    message: string
  ): Promise<{ success: boolean; message: string }> {
    const session = this.sessions.get(accountId);
    
    if (!session || session.status !== "connected" || !session.page) {
      return { success: false, message: "WhatsApp not connected" };
    }

    try {
      const page = session.page;
      
      const cleanNumber = phoneNumber.replace(/\D/g, "");
      const chatUrl = `https://web.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
      
      await page.goto(chatUrl, { waitUntil: "networkidle2", timeout: 30000 });

      await page.waitForSelector('[data-testid="conversation-compose-box-input"]', { timeout: 15000 });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      await page.click('[data-testid="send"]');

      await new Promise((resolve) => setTimeout(resolve, 1000));

      return { success: true, message: "Message sent" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to send message";
      console.error("Send message error:", errorMessage);
      return { success: false, message: errorMessage };
    }
  }

  async disconnect(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (session) {
      if (session.messageListenerInterval) {
        clearInterval(session.messageListenerInterval);
        session.messageListenerInterval = null;
      }
      
      try {
        if (session.browser) {
          await session.browser.close();
        }
      } catch (error) {
        console.error("Error closing browser:", error);
      }
      
      session.status = "disconnected";
      session.browser = null;
      session.page = null;
      session.qrCode = null;
      this.sessions.set(accountId, session);
      this.emitStatus(accountId, "disconnected");
    }
  }

  private async cleanupSession(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (session) {
      if (session.messageListenerInterval) {
        clearInterval(session.messageListenerInterval);
        session.messageListenerInterval = null;
      }
      
      try {
        if (session.browser) {
          await session.browser.close();
        }
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
      
      session.browser = null;
      session.page = null;
    }
  }

  private emitStatus(accountId: string, status: string, error?: string) {
    if (this.io) {
      this.io.to(`whatsapp:${accountId}`).emit(`whatsapp:status:${accountId}`, { status, error });
    }
  }

  private emitQRCode(accountId: string, qrCode: string) {
    if (this.io) {
      this.io.to(`whatsapp:${accountId}`).emit(`whatsapp:qr:${accountId}`, { qrCode });
    }
  }

  private emitMessages(accountId: string, messages: any[]) {
    if (this.io) {
      this.io.to(`whatsapp:${accountId}`).emit(`whatsapp:messages:${accountId}`, { messages });
    }
  }

  joinRoom(socketId: string, accountId: string) {
    if (this.io) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.join(`whatsapp:${accountId}`);
        console.log(`Socket ${socketId} joined room whatsapp:${accountId}`);
      }
    }
  }

  leaveRoom(socketId: string, accountId: string) {
    if (this.io) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(`whatsapp:${accountId}`);
        console.log(`Socket ${socketId} left room whatsapp:${accountId}`);
      }
    }
  }
}

export const whatsappPuppeteer = new WhatsAppPuppeteerGateway();
