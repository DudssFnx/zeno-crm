import puppeteer, { Browser, Page } from "puppeteer";
import { Server as SocketServer } from "socket.io";
import fs from "fs";
import path from "path";

const SESSION_DIR = "./whatsapp-sessions";
const SESSION_STATUS_FILE = "./whatsapp-sessions/session-status.json";

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

interface SavedSessionStatus {
  accountId: string;
  wasConnected: boolean;
  lastConnectedAt: string;
}

export interface IncomingMessage {
  phoneNumber: string;
  contactName: string;
  content: string;
  timestamp: string;
  avatarUrl?: string;
  direction?: "incoming" | "outgoing";
}

export type MessageHandler = (accountId: string, message: IncomingMessage) => Promise<void>;
export type StatusUpdateHandler = (accountId: string, status: string) => Promise<void>;

class WhatsAppPuppeteerGateway {
  private sessions: Map<string, WhatsAppSession> = new Map();
  private io: SocketServer | null = null;
  private messageHandler: MessageHandler | null = null;
  private statusUpdateHandler: StatusUpdateHandler | null = null;
  private isInitialized: boolean = false;

  setMessageHandler(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  setStatusUpdateHandler(handler: StatusUpdateHandler) {
    this.statusUpdateHandler = handler;
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

  private saveSessionStatus(accountId: string, wasConnected: boolean): void {
    try {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

      let statuses: SavedSessionStatus[] = [];
      if (fs.existsSync(SESSION_STATUS_FILE)) {
        const data = fs.readFileSync(SESSION_STATUS_FILE, 'utf-8');
        statuses = JSON.parse(data);
      }

      const existingIndex = statuses.findIndex(s => s.accountId === accountId);
      const newStatus: SavedSessionStatus = {
        accountId,
        wasConnected,
        lastConnectedAt: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        statuses[existingIndex] = newStatus;
      } else {
        statuses.push(newStatus);
      }

      fs.writeFileSync(SESSION_STATUS_FILE, JSON.stringify(statuses, null, 2));
      console.log(`[WhatsApp] Saved session status for ${accountId}: connected=${wasConnected}`);
    } catch (error) {
      console.error('[WhatsApp] Error saving session status:', error);
    }
  }

  private loadSavedSessions(): SavedSessionStatus[] {
    try {
      if (fs.existsSync(SESSION_STATUS_FILE)) {
        const data = fs.readFileSync(SESSION_STATUS_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[WhatsApp] Error loading saved sessions:', error);
    }
    return [];
  }

  async initializeAndReconnect(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    console.log('[WhatsApp] Checking for sessions to auto-reconnect...');
    
    const savedSessions = this.loadSavedSessions();
    const sessionsToReconnect = savedSessions.filter(s => s.wasConnected);

    if (sessionsToReconnect.length === 0) {
      console.log('[WhatsApp] No sessions to auto-reconnect');
      return;
    }

    console.log(`[WhatsApp] Found ${sessionsToReconnect.length} session(s) to auto-reconnect`);

    for (const savedSession of sessionsToReconnect) {
      console.log(`[WhatsApp] Auto-reconnecting session: ${savedSession.accountId}`);
      
      try {
        await this.startSession(savedSession.accountId);
      } catch (error) {
        console.error(`[WhatsApp] Failed to auto-reconnect ${savedSession.accountId}:`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
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
        
        // Save session status for auto-reconnect on restart
        this.saveSessionStatus(accountId, true);
        console.log(`[WhatsApp] Session ${accountId} connected and saved for persistence`);
        
        // Update database status
        if (this.statusUpdateHandler) {
          await this.statusUpdateHandler(accountId, "connected");
        }
        
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
          console.log(`[WhatsApp] Stopping message listener for ${accountId} - session not connected`);
          clearInterval(interval);
          if (currentSession) {
            currentSession.messageListenerInterval = null;
            this.sessions.set(accountId, currentSession);
          }
          return;
        }

        const page = currentSession.page;
        
        // Check if page is still valid before evaluating
        if (page.isClosed()) {
          console.log(`[WhatsApp] Page closed for ${accountId}, stopping listener`);
          clearInterval(interval);
          currentSession.messageListenerInterval = null;
          this.sessions.set(accountId, currentSession);
          return;
        }

        const allChats = await page.evaluate(() => {
          const chatItemSelectors = [
            '[data-testid="cell-frame-container"]',
            '[data-testid="list-item-container"]',
            'div[role="listitem"]',
            '#pane-side > div > div > div > div',
          ];
          
          let chatItems: NodeListOf<Element> | null = null;
          for (const selector of chatItemSelectors) {
            chatItems = document.querySelectorAll(selector);
            if (chatItems && chatItems.length > 0) break;
          }
          
          if (!chatItems) return [];
          
          const chats: Array<{
            name: string;
            phoneOrId: string;
            isUnread: boolean;
            lastMessage: string;
            time: string;
            avatarUrl: string | null;
            isOutgoing: boolean;
          }> = [];

          chatItems.forEach((chat) => {
            const nameSelectors = [
              '[data-testid="cell-frame-title"] span',
              '[data-testid="conversation-info-header-chat-title"]',
              'span[dir="auto"][title]',
              'span[title]',
            ];
            
            let nameEl: Element | null = null;
            for (const sel of nameSelectors) {
              nameEl = chat.querySelector(sel);
              if (nameEl?.textContent) break;
            }
            
            const name = nameEl?.textContent || "";
            if (!name) return;
            
            const lastMsgSelectors = [
              '[data-testid="last-msg-status"]',
              '[data-testid="conversation-last-message"]',
              'span[data-testid="last-msg-status"]',
            ];
            
            let lastMsgEl: Element | null = null;
            let lastMsgContainer: Element | null = null;
            for (const sel of lastMsgSelectors) {
              lastMsgEl = chat.querySelector(sel);
              if (lastMsgEl) {
                lastMsgContainer = lastMsgEl.parentElement || lastMsgEl;
                break;
              }
            }
            
            const lastMessage = lastMsgContainer?.textContent || "";
            if (!lastMessage) return;
            
            const timeEl = chat.querySelector('[data-testid="cell-frame-primary-detail"]') || 
                           chat.querySelector('div[class*="time"]') ||
                           chat.querySelector('span[class*="time"]');
            
            const avatarSelectors = [
              'img[data-testid="user-avatar"]',
              'img[data-testid="default-user"]',
              'img[data-testid="image-thumb"]',
              '[data-testid="cell-frame-photo"] img',
              'div[data-testid="avatar"] img',
              'img[src*="pps.whatsapp.net"]',
            ];
            
            let avatarImg: HTMLImageElement | null = null;
            for (const sel of avatarSelectors) {
              avatarImg = chat.querySelector(sel) as HTMLImageElement | null;
              if (avatarImg?.src) break;
            }
            
            const time = timeEl?.textContent || "";
            const avatarUrl = avatarImg?.src || null;
            
            const phoneMatch = name.match(/\+?\d[\d\s-]{8,}/);
            const phoneOrId = phoneMatch ? phoneMatch[0].replace(/[\s-]/g, "") : name;
            
            const unreadBadge = chat.querySelector('[data-testid="icon-unread-count"]');
            const unreadSpan = chat.querySelector('span[aria-label*="unread"]');
            const unreadCount2 = chat.querySelector('[data-testid="unread-count"]');
            const isUnread = !!(unreadBadge || unreadSpan || unreadCount2);
            
            const msgStatusIcon = chat.querySelector('[data-testid="msg-dblcheck"]') ||
                                  chat.querySelector('[data-testid="msg-check"]') ||
                                  chat.querySelector('[data-testid="msg-time"]') ||
                                  chat.querySelector('[data-icon="msg-dblcheck"]') ||
                                  chat.querySelector('[data-icon="msg-check"]') ||
                                  chat.querySelector('[data-icon="msg-time"]') ||
                                  chat.querySelector('span[data-icon*="status"]');
            const isOutgoing = !!msgStatusIcon;

            chats.push({
              name,
              phoneOrId,
              isUnread,
              lastMessage,
              time,
              avatarUrl,
              isOutgoing,
            });
          });

          return chats;
        });

        for (const chat of allChats) {
          const direction = chat.isOutgoing ? "outgoing" : "incoming";
          const messageKey = `${chat.phoneOrId}:${chat.lastMessage}:${chat.time}:${direction}`;
          
          if (!currentSession.processedMessages.has(messageKey) && chat.lastMessage) {
            currentSession.processedMessages.add(messageKey);
            
            const dirLabel = chat.isOutgoing ? "enviada para" : "recebida de";
            console.log(`Mensagem ${dirLabel} ${chat.name}: ${chat.lastMessage.substring(0, 50)}`);

            if (this.messageHandler) {
              const phoneNumber = chat.phoneOrId.replace(/\D/g, "");
              
              await this.messageHandler(accountId, {
                phoneNumber: phoneNumber || chat.name,
                contactName: chat.name,
                content: chat.lastMessage,
                timestamp: new Date().toISOString(),
                avatarUrl: chat.avatarUrl || undefined,
                direction: direction,
              });
            }

            this.emitMessages(accountId, [{
              text: chat.lastMessage,
              time: chat.time,
              incoming: !chat.isOutgoing,
              from: chat.name,
              phone: chat.phoneOrId,
            }]);
          }
        }

        if (currentSession.processedMessages.size > 1000) {
          const messages = Array.from(currentSession.processedMessages);
          currentSession.processedMessages = new Set(messages.slice(-500));
        }

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Stop listener on fatal errors (detached frame, page closed, etc.)
        if (errorMessage.includes("detached") || 
            errorMessage.includes("closed") || 
            errorMessage.includes("Target closed") ||
            errorMessage.includes("Session closed") ||
            errorMessage.includes("Protocol error")) {
          console.log(`[WhatsApp] Fatal error for ${accountId}, stopping listener: ${errorMessage.substring(0, 100)}`);
          clearInterval(interval);
          const currentSession = this.sessions.get(accountId);
          if (currentSession) {
            currentSession.messageListenerInterval = null;
            currentSession.status = "disconnected";
            this.sessions.set(accountId, currentSession);
            this.emitStatus(accountId, "disconnected", "Conexão perdida");
            if (this.statusUpdateHandler) {
              this.statusUpdateHandler(accountId, "disconnected").catch(console.error);
            }
          }
          return;
        }
        
        console.error("Message listener error:", errorMessage.substring(0, 200));
      }
    }, 2000);

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
    console.log(`[WhatsApp] Attempting to send message to ${phoneNumber} via account ${accountId}`);
    
    const session = this.sessions.get(accountId);
    
    if (!session) {
      console.log(`[WhatsApp] No session found for account ${accountId}`);
      return { success: false, message: "Sessão do WhatsApp não encontrada. Conecte a conta primeiro." };
    }
    
    if (session.status !== "connected") {
      console.log(`[WhatsApp] Session status is ${session.status}, not connected`);
      return { success: false, message: `WhatsApp não conectado. Status atual: ${session.status}` };
    }
    
    if (!session.page) {
      console.log(`[WhatsApp] No page available for session`);
      return { success: false, message: "Página do WhatsApp não disponível" };
    }

    try {
      const page = session.page;
      
      // Check if page is still valid
      if (page.isClosed()) {
        session.status = "disconnected";
        this.sessions.set(accountId, session);
        return { success: false, message: "Conexão perdida. Reconecte a conta." };
      }
      
      const cleanNumber = phoneNumber.replace(/\D/g, "");
      console.log(`[WhatsApp] Using fast send method via search bar`);
      
      // Method: Use search bar to open chat (NO page navigation - stays stable)
      // Step 1: Click on search button/new chat button
      const newChatSelectors = [
        '[data-testid="chat-list-search"]',
        '[data-testid="menu-bar-search"]',
        'span[data-icon="search"]',
        '[aria-label="Pesquisar ou começar uma nova conversa"]',
        '[aria-label="Search or start new chat"]',
        '#side header button',
      ];
      
      let searchOpened = false;
      for (const selector of newChatSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn) {
            await btn.click();
            searchOpened = true;
            console.log(`[WhatsApp] Opened search with: ${selector}`);
            break;
          }
        } catch { /* continue */ }
      }
      
      // Step 2: Type the phone number in search
      await new Promise(r => setTimeout(r, 300));
      
      const searchInputSelectors = [
        '[data-testid="chat-list-search"]',
        'div[contenteditable="true"][data-tab="3"]',
        '#side div[contenteditable="true"]',
        '[aria-label="Pesquisar ou começar uma nova conversa"]',
        '[aria-label="Search or start new chat"]',
        'div[role="textbox"][data-tab="3"]',
      ];
      
      let searchInput = null;
      for (const selector of searchInputSelectors) {
        try {
          searchInput = await page.$(selector);
          if (searchInput) {
            console.log(`[WhatsApp] Found search input: ${selector}`);
            break;
          }
        } catch { /* continue */ }
      }
      
      if (!searchInput) {
        // Fallback: Just type and hope the search is focused
        console.log(`[WhatsApp] Search input not found, typing directly...`);
      } else {
        await searchInput.click();
        await new Promise(r => setTimeout(r, 200));
      }
      
      // Clear any existing text and type phone number
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.type(cleanNumber, { delay: 10 });
      
      // Wait for search results
      await new Promise(r => setTimeout(r, 500));
      
      // Step 3: Try to find and click on the contact/chat result
      // Look for the search result with matching number
      const chatFound = await page.evaluate((phoneNum: string) => {
        // Try to find a chat result that matches the phone number
        const results = Array.from(document.querySelectorAll('[data-testid="cell-frame-container"]'));
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const text = result.textContent || '';
          // Check if the number is in the result
          if (text.includes(phoneNum) || text.replace(/\D/g, '').includes(phoneNum)) {
            (result as HTMLElement).click();
            return true;
          }
        }
        
        // If exact match not found, click first result
        const firstResult = document.querySelector('[data-testid="cell-frame-container"]');
        if (firstResult) {
          (firstResult as HTMLElement).click();
          return true;
        }
        
        return false;
      }, cleanNumber.slice(-8)); // Use last 8 digits for matching
      
      if (!chatFound) {
        // Try pressing Enter to open the number as new chat
        console.log(`[WhatsApp] No search result found, trying Enter...`);
        await page.keyboard.press('Enter');
      }
      
      // Wait for chat to open
      await new Promise(r => setTimeout(r, 400));
      
      // Step 4: Find the message input and type the message
      const messageInputSelectors = [
        '#main footer div[contenteditable="true"]',
        'div[data-testid="conversation-compose-box-input"]',
        'footer div[contenteditable="true"][data-tab="10"]',
        'div[contenteditable="true"][title="Digite uma mensagem"]',
        'div[contenteditable="true"][title="Type a message"]',
        'div.lexical-rich-text-input div[contenteditable="true"]',
      ];
      
      let messageInput = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        for (const selector of messageInputSelectors) {
          try {
            messageInput = await page.$(selector);
            if (messageInput) {
              console.log(`[WhatsApp] Found message input: ${selector}`);
              break;
            }
          } catch { /* continue */ }
        }
        if (messageInput) break;
        await new Promise(r => setTimeout(r, 300));
      }
      
      if (!messageInput) {
        // Check for invalid number popup
        const popup = await page.$('div[data-testid="popup-contents"]');
        if (popup) {
          const text = await page.evaluate(el => el?.textContent || '', popup);
          if (text.includes("inválido") || text.includes("invalid")) {
            return { success: false, message: "Número de telefone inválido ou não está no WhatsApp" };
          }
        }
        return { success: false, message: "Não foi possível abrir a conversa. Verifique se o número está correto." };
      }
      
      // Click on message input and type the message
      await messageInput.click();
      await new Promise(r => setTimeout(r, 100));
      await page.keyboard.type(message, { delay: 10 });
      
      // Step 5: Send the message
      await new Promise(r => setTimeout(r, 200));
      
      const sendButtonSelectors = [
        'button[data-testid="send"]',
        'span[data-testid="send"]',
        '[data-testid="send"]',
        'button[aria-label="Enviar"]',
        'button[aria-label="Send"]',
        'span[data-icon="send"]',
      ];
      
      let sendClicked = false;
      for (const selector of sendButtonSelectors) {
        try {
          const sendBtn = await page.$(selector);
          if (sendBtn) {
            await sendBtn.click();
            sendClicked = true;
            console.log(`[WhatsApp] Clicked send button: ${selector}`);
            break;
          }
        } catch { /* continue */ }
      }
      
      if (!sendClicked) {
        // Fallback: Press Enter to send
        console.log(`[WhatsApp] Send button not found, pressing Enter...`);
        await page.keyboard.press('Enter');
      }
      
      // Quick verify - wait just a bit for send
      await new Promise(r => setTimeout(r, 100));
      
      console.log(`[WhatsApp] Message sent successfully (fast method)`);
      return { success: true, message: "Mensagem enviada" };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[WhatsApp] Send error: ${errorMessage}`);
      
      // Check for fatal errors
      if (errorMessage.includes("detached") || 
          errorMessage.includes("closed") || 
          errorMessage.includes("Target closed")) {
        session.status = "disconnected";
        this.sessions.set(accountId, session);
        this.emitStatus(accountId, "disconnected", "Conexão perdida");
        return { success: false, message: "Conexão perdida. Reconecte a conta." };
      }
      
      return { success: false, message: `Erro ao enviar: ${errorMessage.substring(0, 100)}` };
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
      
      // Save disconnected status
      this.saveSessionStatus(accountId, false);
      
      // Update database status
      if (this.statusUpdateHandler) {
        await this.statusUpdateHandler(accountId, "disconnected");
      }
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
