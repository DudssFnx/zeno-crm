import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  getContentType,
  jidNormalizedUser,
  isLidUser,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";
import pino from "pino";
import NodeCache from "node-cache";
import QRCode from "qrcode";
import { config } from "./config";
import { sendMessageCreatedEvent, sendStatusUpdateEvent, sendQRCodeEvent } from "./webhook";
import { normalizeJid, extractPhoneFromJid, normalizePhone, isValidChatJid } from "./jid-utils";

const SESSION_STATUS_FILE = path.join(config.sessionDir, "session-status.json");
const LID_MAPPING_FILE = path.join(config.sessionDir, "lid-mapping.json");

interface LidMapping {
  [lid: string]: string;
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

class BaileysGateway {
  private sessions: Map<string, BaileysSession> = new Map();
  private isInitialized: boolean = false;
  private msgRetryCounterCache = new NodeCache();
  private logger = pino({ level: "silent" });
  private lidMapping: LidMapping = {};

  constructor() {
    this.ensureSessionDir();
    this.loadLidMapping();
  }

  private ensureSessionDir(): void {
    if (!fs.existsSync(config.sessionDir)) {
      fs.mkdirSync(config.sessionDir, { recursive: true });
    }
  }

  private loadLidMapping(): void {
    try {
      if (fs.existsSync(LID_MAPPING_FILE)) {
        const data = fs.readFileSync(LID_MAPPING_FILE, "utf-8");
        this.lidMapping = JSON.parse(data);
        console.log(`[Gateway] Loaded ${Object.keys(this.lidMapping).length} LID mappings`);
      }
    } catch (error) {
      console.error("[Gateway] Error loading LID mapping:", error);
      this.lidMapping = {};
    }
  }

  private saveLidMapping(): void {
    try {
      fs.writeFileSync(LID_MAPPING_FILE, JSON.stringify(this.lidMapping, null, 2));
    } catch (error) {
      console.error("[Gateway] Error saving LID mapping:", error);
    }
  }

  storeLidToPhoneMapping(lid: string, phoneNumber: string): void {
    const cleanLid = lid.replace("@lid", "").replace(/\D/g, "");
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    if (cleanLid && cleanPhone && !this.lidMapping[cleanLid]) {
      this.lidMapping[cleanLid] = cleanPhone;
      this.saveLidMapping();
      console.log(`[Gateway] Stored LID mapping: ${cleanLid} -> ${cleanPhone}`);
    }
  }

  getPhoneFromLid(lid: string): string | null {
    const cleanLid = lid.replace("@lid", "").replace(/\D/g, "");
    return this.lidMapping[cleanLid] || null;
  }

  private getSessionPath(accountId: string): string {
    return path.join(config.sessionDir, accountId);
  }

  private ensureAccountSessionDir(accountId: string): void {
    const sessionPath = this.getSessionPath(accountId);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
  }

  private saveSessionStatus(accountId: string, wasConnected: boolean): void {
    try {
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
      console.log(`[Gateway] Saved session status for ${accountId}: connected=${wasConnected}`);
    } catch (error) {
      console.error("[Gateway] Error saving session status:", error);
    }
  }

  private loadSavedSessions(): SavedSessionStatus[] {
    try {
      if (fs.existsSync(SESSION_STATUS_FILE)) {
        const data = fs.readFileSync(SESSION_STATUS_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("[Gateway] Error loading saved sessions:", error);
    }
    return [];
  }

  async initializeAndReconnect(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    console.log("[Gateway] Checking for sessions to auto-reconnect...");

    const savedSessions = this.loadSavedSessions();
    const sessionsToReconnect = savedSessions.filter((s) => s.wasConnected);

    if (sessionsToReconnect.length === 0) {
      console.log("[Gateway] No sessions to auto-reconnect");
      return;
    }

    console.log(`[Gateway] Found ${sessionsToReconnect.length} session(s) to auto-reconnect`);

    for (const session of sessionsToReconnect) {
      console.log(`[Gateway] Auto-reconnecting session: ${session.accountId}`);
      try {
        await this.startSession(session.accountId);
      } catch (error) {
        console.error(`[Gateway] Failed to auto-reconnect ${session.accountId}:`, error);
      }
    }
  }

  async startSession(accountId: string): Promise<{ success: boolean; message: string }> {
    const existingSession = this.sessions.get(accountId);
    if (existingSession?.status === "connected") {
      return { success: true, message: "Already connected" };
    }

    this.ensureAccountSessionDir(accountId);

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
    await sendStatusUpdateEvent(accountId, "connecting");

    try {
      await this.connectWithBaileys(accountId, session);
      return { success: true, message: "Connection started" };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      session.status = "disconnected";
      session.lastError = errorMsg;
      await sendStatusUpdateEvent(accountId, "disconnected", errorMsg);
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
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: "M",
            width: 256,
            margin: 2,
          });
          session.qrCode = qrDataUrl;
          await sendQRCodeEvent(accountId, qrDataUrl);
        } catch (error) {
          console.error("[Gateway] Error generating QR code:", error);
        }
        await sendStatusUpdateEvent(accountId, "pending_qr");
        console.log(`[Gateway] QR Code generated for ${accountId}`);
      }

      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log(`[Gateway] Connection closed for ${accountId}, reconnect: ${shouldReconnect}`);

        session.status = "disconnected";
        await sendStatusUpdateEvent(accountId, "disconnected");

        if (shouldReconnect && session.reconnectAttempts < 5) {
          session.reconnectAttempts++;
          console.log(`[Gateway] Reconnecting ${accountId} (attempt ${session.reconnectAttempts})`);
          setTimeout(() => this.connectWithBaileys(accountId, session), 5000);
        } else {
          this.saveSessionStatus(accountId, false);
        }
      } else if (connection === "open") {
        console.log(`[Gateway] Connected successfully: ${accountId}`);
        session.status = "connected";
        session.qrCode = null;
        session.reconnectAttempts = 0;

        this.saveSessionStatus(accountId, true);
        await sendStatusUpdateEvent(accountId, "connected");
      }
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      console.log(`[Gateway] Messages upsert: ${messages.length} messages, type: ${type}`);

      for (const msg of messages) {
        setImmediate(() => {
          this.processMessage(accountId, msg, type).catch((error) => {
            console.error(`[Gateway] Error processing message:`, error);
          });
        });
      }
    });

    sock.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        this.processContactForLidMapping(contact);
      }
    });

    sock.ev.on("contacts.update", (contacts) => {
      for (const contact of contacts) {
        this.processContactForLidMapping(contact as any);
      }
    });
  }

  private processContactForLidMapping(contact: any): void {
    const jid = contact.id;
    const lid = contact.lid || contact.lidJid;

    if (!jid) return;

    if (lid) {
      const phoneNumber = extractPhoneFromJid(jid);
      const lidNumber = extractPhoneFromJid(lid);
      if (phoneNumber && lidNumber) {
        this.storeLidToPhoneMapping(lidNumber, phoneNumber);
      }
    }
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

    if (!isValidChatJid(rawJid)) {
      console.log(`[Gateway] Ignoring invalid JID: ${rawJid}`);
      return;
    }

    const session = this.sessions.get(accountId);
    if (!session) return;

    const messageId = msg.key.id;
    if (!messageId) return;

    const dupKey = `${accountId}:${messageId}`;
    if (session.processedMessages.has(dupKey)) {
      console.log(`[Gateway] Duplicate message: ${messageId}`);
      return;
    }
    session.processedMessages.add(dupKey);

    if (session.processedMessages.size > 1000) {
      const entries = Array.from(session.processedMessages);
      session.processedMessages = new Set(entries.slice(-500));
    }

    const isFromMe = msg.key.fromMe === true;
    const direction: "incoming" | "outgoing" = isFromMe ? "outgoing" : "incoming";

    let chatIdResolved = rawJid;
    const isLid = isLidUser(rawJid) || rawJid.includes("@lid");

    if (isLid) {
      const altJid = (msg.key as any).remoteJidAlt;
      if (altJid && typeof altJid === "string" && altJid.endsWith("@s.whatsapp.net")) {
        chatIdResolved = altJid;
        const lidNumber = extractPhoneFromJid(rawJid);
        const phoneNumber = extractPhoneFromJid(altJid);
        if (lidNumber && phoneNumber) {
          this.storeLidToPhoneMapping(lidNumber, phoneNumber);
        }
      } else {
        const mappedPhone = this.getPhoneFromLid(rawJid);
        if (mappedPhone) {
          chatIdResolved = normalizeJid(mappedPhone);
        }
      }
    }

    chatIdResolved = jidNormalizedUser(chatIdResolved);

    let phoneNumber: string;
    if (chatIdResolved.endsWith("@s.whatsapp.net")) {
      phoneNumber = normalizePhone(extractPhoneFromJid(chatIdResolved));
    } else if (chatIdResolved.endsWith("@lid")) {
      const lidDigits = extractPhoneFromJid(chatIdResolved);
      phoneNumber = `LID_${lidDigits}`;
    } else {
      phoneNumber = extractPhoneFromJid(chatIdResolved);
    }

    const msgType = getContentType(msg.message);
    let textContent = "";
    let mediaInfo: MediaInfo | undefined;

    if (msgType === "conversation") {
      textContent = msg.message.conversation || "";
    } else if (msgType === "extendedTextMessage") {
      textContent = msg.message.extendedTextMessage?.text || "";
    } else if (msgType === "imageMessage") {
      const img = msg.message.imageMessage!;
      textContent = img.caption || "";
      mediaInfo = {
        mediaType: "image",
        mimetype: img.mimetype || "image/jpeg",
        fileName: "image.jpg",
        fileSize: img.fileLength ? Number(img.fileLength) : undefined,
        messageKey: msg.key,
        message: msg.message,
      };
    } else if (msgType === "audioMessage") {
      const audio = msg.message.audioMessage!;
      textContent = "";
      mediaInfo = {
        mediaType: "audio",
        mimetype: audio.mimetype || "audio/ogg",
        fileName: "audio.ogg",
        fileSize: audio.fileLength ? Number(audio.fileLength) : undefined,
        messageKey: msg.key,
        message: msg.message,
      };
    } else if (msgType === "videoMessage") {
      const video = msg.message.videoMessage!;
      textContent = video.caption || "";
      mediaInfo = {
        mediaType: "video",
        mimetype: video.mimetype || "video/mp4",
        fileName: "video.mp4",
        fileSize: video.fileLength ? Number(video.fileLength) : undefined,
        messageKey: msg.key,
        message: msg.message,
      };
    } else if (msgType === "documentMessage" || msgType === "documentWithCaptionMessage") {
      const doc =
        msgType === "documentMessage"
          ? msg.message.documentMessage!
          : msg.message.documentWithCaptionMessage?.message?.documentMessage!;
      if (doc) {
        textContent = doc.caption || "";
        mediaInfo = {
          mediaType: "document",
          mimetype: doc.mimetype || "application/octet-stream",
          fileName: doc.fileName || "document",
          fileSize: doc.fileLength ? Number(doc.fileLength) : undefined,
          messageKey: msg.key,
          message: msg.message,
        };
      }
    } else if (msgType === "stickerMessage") {
      textContent = "[Sticker]";
    } else if (msgType === "contactMessage") {
      textContent = "[Contact]";
    } else if (msgType === "locationMessage") {
      textContent = "[Location]";
    }

    if (!textContent && !mediaInfo) {
      console.log(`[Gateway] No content for message type: ${msgType}`);
      return;
    }

    const pushName = msg.pushName || "";
    const timestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    await sendMessageCreatedEvent(accountId, {
      phoneNumber,
      contactName: pushName,
      content: textContent,
      timestamp,
      direction,
      messageId,
      mediaInfo: mediaInfo
        ? {
            mediaType: mediaInfo.mediaType,
            mimetype: mediaInfo.mimetype,
            fileName: mediaInfo.fileName,
            fileSize: mediaInfo.fileSize,
          }
        : undefined,
    });
  }

  async sendMessage(
    accountId: string,
    phoneNumber: string,
    content: string,
    mediaUrl?: string,
    mediaType?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const session = this.sessions.get(accountId);
    if (!session?.socket || session.status !== "connected") {
      return { success: false, error: "Not connected" };
    }

    try {
      const jid = normalizeJid(phoneNumber);
      let result: proto.WebMessageInfo;

      if (mediaUrl && mediaType) {
        const mediaBuffer = await this.fetchMediaBuffer(mediaUrl);
        if (!mediaBuffer) {
          return { success: false, error: "Failed to fetch media" };
        }

        if (mediaType === "image") {
          result = await session.socket.sendMessage(jid, {
            image: mediaBuffer,
            caption: content || undefined,
          });
        } else if (mediaType === "audio") {
          result = await session.socket.sendMessage(jid, {
            audio: mediaBuffer,
            mimetype: "audio/mp4",
            ptt: true,
          });
        } else if (mediaType === "video") {
          result = await session.socket.sendMessage(jid, {
            video: mediaBuffer,
            caption: content || undefined,
          });
        } else {
          result = await session.socket.sendMessage(jid, {
            document: mediaBuffer,
            fileName: path.basename(mediaUrl) || "file",
            mimetype: "application/octet-stream",
            caption: content || undefined,
          });
        }
      } else {
        result = await session.socket.sendMessage(jid, { text: content });
      }

      console.log(`[Gateway] Message sent to ${phoneNumber}: ${content.substring(0, 30)}...`);
      return { success: true, messageId: result.key.id || undefined };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Gateway] Error sending message:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  private async fetchMediaBuffer(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[Gateway] Failed to fetch media: ${response.status}`);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`[Gateway] Error fetching media:`, error);
      return null;
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
      console.error(`[Gateway] Error disconnecting ${accountId}:`, error);
    }

    session.socket = null;
    session.status = "disconnected";
    session.qrCode = null;

    this.saveSessionStatus(accountId, false);
    await sendStatusUpdateEvent(accountId, "disconnected");

    console.log(`[Gateway] Session ${accountId} disconnected`);
  }

  getStatus(accountId: string): { status: string; qrCode: string | null; error: string | null } {
    const session = this.sessions.get(accountId);
    if (!session) {
      return { status: "disconnected", qrCode: null, error: null };
    }
    return {
      status: session.status,
      qrCode: session.qrCode,
      error: session.lastError,
    };
  }

  getAllSessions(): Array<{
    accountId: string;
    status: string;
    hasQR: boolean;
  }> {
    const result: Array<{ accountId: string; status: string; hasQR: boolean }> = [];
    for (const [accountId, session] of this.sessions) {
      result.push({
        accountId,
        status: session.status,
        hasQR: !!session.qrCode,
      });
    }
    return result;
  }

  async downloadMedia(
    accountId: string,
    messageKey: proto.IMessageKey,
    message: proto.IMessage
  ): Promise<Buffer | null> {
    const session = this.sessions.get(accountId);
    if (!session?.socket || session.status !== "connected") {
      console.error(`[Gateway] Cannot download media: session not connected`);
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
      console.error(`[Gateway] Error downloading media:`, error);
      return null;
    }
  }
}

export const baileysGateway = new BaileysGateway();
