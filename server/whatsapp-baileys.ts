import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  getContentType,
  jidNormalizedUser,
  isLidUser,
  jidDecode,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { Server as SocketServer } from "socket.io";
import fs from "fs";
import path from "path";
import pino from "pino";
import NodeCache from "node-cache";
import QRCode from "qrcode";
import { normalizeJid, extractPhoneFromJid, isValidChatJid, isValidPhoneNumber, normalizePhone } from "./jid-utils";

const SESSION_DIR = "./whatsapp-sessions-baileys";
const SESSION_STATUS_FILE = "./whatsapp-sessions-baileys/session-status.json";
const LID_MAPPING_FILE = "./whatsapp-sessions-baileys/lid-mapping.json";

interface LidMapping {
  [lid: string]: string; // LID -> phoneNumber
}

interface BaileysSession {
  accountId: string;
  socket: WASocket | null;
  status: "disconnected" | "pending_qr" | "connected" | "connecting";
  qrCode: string | null;
  lastError: string | null;
  companyId?: string;
  processedMessages: Set<string>;
  reconnectAttempts: number;
}

interface SavedSessionStatus {
  accountId: string;
  wasConnected: boolean;
  lastConnectedAt: string;
}

export interface MediaInfo {
  mediaType: "image" | "audio" | "document" | "video";
  mimetype: string;
  fileName?: string;
  fileSize?: number;
  messageKey: proto.IMessageKey;
  message: proto.IMessage;
}

export interface IncomingMessage {
  phoneNumber: string;
  contactName: string;
  content: string;
  timestamp: string;
  avatarUrl?: string;
  direction?: "incoming" | "outgoing";
  senderDisplayName?: string;
  mediaInfo?: MediaInfo;
  messageId?: string;
}

export type MessageHandler = (accountId: string, message: IncomingMessage) => Promise<void>;
export type StatusUpdateHandler = (accountId: string, status: string) => Promise<void>;

class WhatsAppBaileysGateway {
  private sessions: Map<string, BaileysSession> = new Map();
  private io: SocketServer | null = null;
  private messageHandler: MessageHandler | null = null;
  private statusUpdateHandler: StatusUpdateHandler | null = null;
  private isInitialized: boolean = false;
  private msgRetryCounterCache = new NodeCache();
  private logger = pino({ level: "silent" });
  private lidMapping: LidMapping = {};

  constructor() {
    this.loadLidMapping();
  }

  private loadLidMapping(): void {
    try {
      if (fs.existsSync(LID_MAPPING_FILE)) {
        const data = fs.readFileSync(LID_MAPPING_FILE, "utf-8");
        this.lidMapping = JSON.parse(data);
        console.log(`[Baileys] Loaded ${Object.keys(this.lidMapping).length} LID mappings`);
      }
    } catch (error) {
      console.error("[Baileys] Error loading LID mapping:", error);
      this.lidMapping = {};
    }
  }

  private saveLidMapping(): void {
    try {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }
      fs.writeFileSync(LID_MAPPING_FILE, JSON.stringify(this.lidMapping, null, 2));
    } catch (error) {
      console.error("[Baileys] Error saving LID mapping:", error);
    }
  }

  storeLidToPhoneMapping(lid: string, phoneNumber: string): void {
    const cleanLid = lid.replace("@lid", "").replace(/\D/g, "");
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    if (cleanLid && cleanPhone && !this.lidMapping[cleanLid]) {
      this.lidMapping[cleanLid] = cleanPhone;
      this.saveLidMapping();
      console.log(`[Baileys] Stored LID mapping: ${cleanLid} -> ${cleanPhone}`);
    }
  }

  getPhoneFromLid(lid: string): string | null {
    const cleanLid = lid.replace("@lid", "").replace(/\D/g, "");
    return this.lidMapping[cleanLid] || null;
  }

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
        const data = fs.readFileSync(SESSION_STATUS_FILE, "utf-8");
        statuses = JSON.parse(data);
      }

      const existingIndex = statuses.findIndex((s) => s.accountId === accountId);
      const newStatus: SavedSessionStatus = {
        accountId,
        wasConnected,
        lastConnectedAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        statuses[existingIndex] = newStatus;
      } else {
        statuses.push(newStatus);
      }

      fs.writeFileSync(SESSION_STATUS_FILE, JSON.stringify(statuses, null, 2));
      console.log(`[Baileys] Saved session status for ${accountId}: connected=${wasConnected}`);
    } catch (error) {
      console.error("[Baileys] Error saving session status:", error);
    }
  }

  private loadSavedSessions(): SavedSessionStatus[] {
    try {
      if (fs.existsSync(SESSION_STATUS_FILE)) {
        const data = fs.readFileSync(SESSION_STATUS_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("[Baileys] Error loading saved sessions:", error);
    }
    return [];
  }

  async initializeAndReconnect(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    console.log("[Baileys] Checking for sessions to auto-reconnect...");

    const savedSessions = this.loadSavedSessions();
    const sessionsToReconnect = savedSessions.filter((s) => s.wasConnected);

    if (sessionsToReconnect.length === 0) {
      console.log("[Baileys] No sessions to auto-reconnect");
      return;
    }

    console.log(`[Baileys] Found ${sessionsToReconnect.length} session(s) to auto-reconnect`);

    for (const session of sessionsToReconnect) {
      console.log(`[Baileys] Auto-reconnecting session: ${session.accountId}`);
      try {
        await this.startSession(session.accountId);
      } catch (error) {
        console.error(`[Baileys] Failed to auto-reconnect ${session.accountId}:`, error);
      }
    }
  }

  async startSession(accountId: string): Promise<{ success: boolean; message: string }> {
    const existingSession = this.sessions.get(accountId);
    if (existingSession?.status === "connected") {
      return { success: true, message: "Already connected" };
    }

    this.ensureSessionDir(accountId);

    const session: BaileysSession = {
      accountId,
      socket: null,
      status: "connecting",
      qrCode: null,
      lastError: null,
      processedMessages: new Set(),
      reconnectAttempts: 0,
    };

    this.sessions.set(accountId, session);
    this.emitStatus(accountId, "connecting");

    try {
      await this.connectWithBaileys(accountId, session);
      return { success: true, message: "Connection started" };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      session.status = "disconnected";
      session.lastError = errorMsg;
      this.emitStatus(accountId, "disconnected", errorMsg);
      return { success: false, message: errorMsg };
    }
  }

  private async connectWithBaileys(accountId: string, session: BaileysSession): Promise<void> {
    const sessionPath = this.getSessionPath(accountId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: this.logger,
      printQRInTerminal: true,
      msgRetryCounterCache: this.msgRetryCounterCache,
      markOnlineOnConnect: false,
      getMessage: async () => {
        return proto.Message.fromObject({});
      },
    });

    session.socket = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.status = "pending_qr";
        await this.emitQRCode(accountId, qr);
        this.emitStatus(accountId, "pending_qr");
        console.log(`[Baileys] QR Code generated for ${accountId}`);
      }

      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log(`[Baileys] Connection closed for ${accountId}, reconnect: ${shouldReconnect}`);

        session.status = "disconnected";
        this.emitStatus(accountId, "disconnected");

        if (this.statusUpdateHandler) {
          await this.statusUpdateHandler(accountId, "disconnected");
        }

        if (shouldReconnect && session.reconnectAttempts < 5) {
          session.reconnectAttempts++;
          console.log(`[Baileys] Reconnecting ${accountId} (attempt ${session.reconnectAttempts})`);
          setTimeout(() => this.connectWithBaileys(accountId, session), 5000);
        } else {
          this.saveSessionStatus(accountId, false);
        }
      } else if (connection === "open") {
        console.log(`[Baileys] Connected successfully: ${accountId}`);
        session.status = "connected";
        session.qrCode = null;
        session.reconnectAttempts = 0;

        this.saveSessionStatus(accountId, true);
        this.emitStatus(accountId, "connected");

        if (this.statusUpdateHandler) {
          await this.statusUpdateHandler(accountId, "connected");
        }
      }
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      // IMPORTANTE: Não usar await aqui para não bloquear o event loop
      console.log(`[Baileys] Messages upsert: ${messages.length} messages, type: ${type}`);

      for (const msg of messages) {
        // Processar cada mensagem de forma assíncrona sem bloquear
        setImmediate(() => {
          this.processMessage(accountId, msg, type).catch(error => {
            console.error(`[Baileys] Error processing message:`, error);
          });
        });
      }
    });

    sock.ev.on("messages.update", (updates) => {
      for (const update of updates) {
        console.log(`[Baileys] Message update: ${update.key.id} - ${JSON.stringify(update.update)}`);
      }
    });
  }

  private async processMessage(
    accountId: string,
    msg: proto.IWebMessageInfo,
    type: string
  ): Promise<void> {
    if (!msg.message) return;
    if (!msg.key) return;
    if (!msg.key.remoteJid) return;
    
    const rawJid = msg.key.remoteJid;
    
    // Ignorar status, broadcast, newsletter e grupos
    if (!isValidChatJid(rawJid)) {
      console.log(`[Baileys] Ignorando JID inválido: ${rawJid}`);
      return;
    }

    const messageId = msg.key.id;
    if (!messageId) return;

    const session = this.sessions.get(accountId);
    if (!session) return;

    if (session.processedMessages.has(messageId)) {
      return;
    }

    session.processedMessages.add(messageId);

    if (session.processedMessages.size > 10000) {
      const oldest = Array.from(session.processedMessages).slice(0, 5000);
      oldest.forEach((id) => session.processedMessages.delete(id));
    }

    // REGRA DE OURO: Usar remoteJid normalizado como chave única
    // Primeiro, tentar normalizar usando Baileys
    let chatId = jidNormalizedUser(rawJid);
    let phoneNumber = extractPhoneFromJid(chatId);
    
    // Check if this is a LID (Linked Device ID)
    const isLid = isLidUser(rawJid);
    
    if (isLid) {
      // Para LIDs, tentar resolver do cache
      const mappedPhone = this.getPhoneFromLid(rawJid);
      if (mappedPhone) {
        console.log(`[Baileys] Resolvido LID ${rawJid} -> ${mappedPhone} do cache`);
        phoneNumber = normalizePhone(mappedPhone);
        chatId = normalizeJid(phoneNumber);
      } else {
        console.log(`[Baileys] LID não mapeado: ${rawJid}, pushName: ${msg.pushName}`);
        // Marcar como LID para tratamento especial no routes.ts
        phoneNumber = `LID_${phoneNumber}`;
      }
    } else {
      // Para números normais, normalizar garantindo formato correto
      phoneNumber = normalizePhone(phoneNumber);
      chatId = normalizeJid(phoneNumber);
    }
    
    // Validar número de telefone (ignorar se for LID não mapeado)
    if (!phoneNumber.startsWith("LID_") && !isValidPhoneNumber(phoneNumber)) {
      console.log(`[Baileys] Ignorando número inválido: ${phoneNumber}`);
      return;
    }

    const messageType = getContentType(msg.message);
    let content = "";
    let mediaInfo: MediaInfo | undefined;

    switch (messageType) {
      case "conversation":
        content = msg.message.conversation || "";
        break;
      case "extendedTextMessage":
        content = msg.message.extendedTextMessage?.text || "";
        break;
      case "imageMessage":
        content = msg.message.imageMessage?.caption || "[Imagem]";
        mediaInfo = {
          mediaType: "image",
          mimetype: msg.message.imageMessage?.mimetype || "image/jpeg",
          fileName: undefined,
          fileSize: msg.message.imageMessage?.fileLength ? Number(msg.message.imageMessage.fileLength) : undefined,
          messageKey: msg.key,
          message: msg.message,
        };
        break;
      case "videoMessage":
        content = msg.message.videoMessage?.caption || "[Video]";
        mediaInfo = {
          mediaType: "video",
          mimetype: msg.message.videoMessage?.mimetype || "video/mp4",
          fileName: undefined,
          fileSize: msg.message.videoMessage?.fileLength ? Number(msg.message.videoMessage.fileLength) : undefined,
          messageKey: msg.key,
          message: msg.message,
        };
        break;
      case "audioMessage":
        content = "[Audio]";
        mediaInfo = {
          mediaType: "audio",
          mimetype: msg.message.audioMessage?.mimetype || "audio/ogg",
          fileName: undefined,
          fileSize: msg.message.audioMessage?.fileLength ? Number(msg.message.audioMessage.fileLength) : undefined,
          messageKey: msg.key,
          message: msg.message,
        };
        break;
      case "documentMessage":
        content = msg.message.documentMessage?.fileName || "[Documento]";
        mediaInfo = {
          mediaType: "document",
          mimetype: msg.message.documentMessage?.mimetype || "application/octet-stream",
          fileName: msg.message.documentMessage?.fileName || undefined,
          fileSize: msg.message.documentMessage?.fileLength ? Number(msg.message.documentMessage.fileLength) : undefined,
          messageKey: msg.key,
          message: msg.message,
        };
        break;
      case "stickerMessage":
        content = "[Sticker]";
        break;
      case "contactMessage":
        content = "[Contato]";
        break;
      case "locationMessage":
        content = "[Localizacao]";
        break;
      default:
        content = `[${messageType || "Mensagem"}]`;
    }

    if (!content) return;

    const direction = msg.key.fromMe ? "outgoing" : "incoming";
    const contactName = msg.pushName || phoneNumber;

    console.log(
      `[Baileys] ${direction === "outgoing" ? "Enviada" : "Recebida"} [${chatId}]: ${contactName}: ${content.substring(0, 50)}${mediaInfo ? ` [${mediaInfo.mediaType}]` : ""}`
    );

    if (this.messageHandler) {
      await this.messageHandler(accountId, {
        phoneNumber,
        contactName,
        content,
        timestamp: new Date().toISOString(),
        direction,
        senderDisplayName: direction === "outgoing" ? "Celular" : undefined,
        mediaInfo,
        messageId: messageId || undefined,
      });
    }
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
    content: string,
    senderDisplayName?: string,
    mediaOptions?: {
      mediaUrl?: string;
      mediaType?: "image" | "audio" | "document" | "video";
      fileName?: string;
      mimetype?: string;
    }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const session = this.sessions.get(accountId);
    if (!session?.socket || session.status !== "connected") {
      return { success: false, error: "Session not connected" };
    }

    try {
      const jid = normalizeJid(phoneNumber);
      let result;

      if (mediaOptions?.mediaUrl && mediaOptions?.mediaType) {
        const localPath = mediaOptions.mediaUrl.startsWith("/uploads/")
          ? path.join(".", mediaOptions.mediaUrl)
          : mediaOptions.mediaUrl;

        if (!fs.existsSync(localPath)) {
          return { success: false, error: `File not found: ${localPath}` };
        }

        const buffer = fs.readFileSync(localPath);
        const mimetype = mediaOptions.mimetype || "application/octet-stream";
        const fileName = mediaOptions.fileName || path.basename(localPath);

        switch (mediaOptions.mediaType) {
          case "image":
            result = await session.socket.sendMessage(jid, {
              image: buffer,
              caption: content || undefined,
              mimetype: mimetype as any,
            });
            console.log(`[Baileys] Imagem enviada para ${jid}: ${fileName}`);
            break;

          case "video":
            result = await session.socket.sendMessage(jid, {
              video: buffer,
              caption: content || undefined,
              mimetype: mimetype as any,
            });
            console.log(`[Baileys] Video enviado para ${jid}: ${fileName}`);
            break;

          case "audio":
            result = await session.socket.sendMessage(jid, {
              audio: buffer,
              mimetype: mimetype as any,
              ptt: mimetype.includes("ogg"),
            });
            console.log(`[Baileys] Audio enviado para ${jid}: ${fileName}`);
            break;

          case "document":
            result = await session.socket.sendMessage(jid, {
              document: buffer,
              mimetype: mimetype as any,
              fileName: fileName,
            });
            console.log(`[Baileys] Documento enviado para ${jid}: ${fileName}`);
            break;

          default:
            return { success: false, error: `Unsupported media type: ${mediaOptions.mediaType}` };
        }
      } else {
        result = await session.socket.sendMessage(jid, { text: content });
        console.log(`[Baileys] Mensagem enviada para ${jid}: ${content.substring(0, 50)}`);
      }

      return { success: true, messageId: result?.key?.id || undefined };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Baileys] Erro ao enviar mensagem:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  async disconnect(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) return;

    try {
      if (session.socket) {
        session.socket.end(undefined);
      }
    } catch (error) {
      console.error(`[Baileys] Error disconnecting ${accountId}:`, error);
    }

    session.socket = null;
    session.status = "disconnected";
    session.qrCode = null;

    this.saveSessionStatus(accountId, false);
    this.emitStatus(accountId, "disconnected");

    if (this.statusUpdateHandler) {
      await this.statusUpdateHandler(accountId, "disconnected");
    }

    console.log(`[Baileys] Session ${accountId} disconnected`);
  }

  private emitStatus(accountId: string, status: string, error?: string) {
    if (this.io) {
      this.io.to(`whatsapp:${accountId}`).emit("whatsapp:status", { accountId, status, error });
    }
  }

  private async emitQRCode(accountId: string, qrCode: string) {
    if (this.io) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qrCode, {
          errorCorrectionLevel: 'M',
          width: 256,
          margin: 2,
        });
        const session = this.sessions.get(accountId);
        if (session) {
          session.qrCode = qrDataUrl;
        }
        this.io.to(`whatsapp:${accountId}`).emit("whatsapp:qr", { qrCode: qrDataUrl });
      } catch (error) {
        console.error(`[Baileys] Error generating QR code image:`, error);
        this.io.to(`whatsapp:${accountId}`).emit("whatsapp:qr", { qrCode });
      }
    }
  }

  joinRoom(socketId: string, accountId: string) {
    if (this.io) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.join(`whatsapp:${accountId}`);
        console.log(`[Baileys] Socket ${socketId} joined room whatsapp:${accountId}`);
      }
    }
  }

  leaveRoom(socketId: string, accountId: string) {
    if (this.io) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(`whatsapp:${accountId}`);
        console.log(`[Baileys] Socket ${socketId} left room whatsapp:${accountId}`);
      }
    }
  }

  async downloadMedia(
    accountId: string,
    messageKey: proto.IMessageKey,
    message: proto.IMessage
  ): Promise<Buffer | null> {
    const session = this.sessions.get(accountId);
    if (!session?.socket || session.status !== "connected") {
      console.error(`[Baileys] Cannot download media: session not connected`);
      return null;
    }

    try {
      const buffer = await downloadMediaMessage(
        { key: messageKey, message } as any,
        "buffer",
        {},
        {
          logger: this.logger,
          reuploadRequest: session.socket.updateMediaMessage,
        }
      );
      return buffer as Buffer;
    } catch (error) {
      console.error(`[Baileys] Error downloading media:`, error);
      return null;
    }
  }

  getSocketIO(): SocketServer | null {
    return this.io;
  }
}

export const whatsappBaileys = new WhatsAppBaileysGateway();
