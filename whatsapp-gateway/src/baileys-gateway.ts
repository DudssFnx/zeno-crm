import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  useMultiFileAuthState,
  WASocket,
} from "@whiskeysockets/baileys";
import fs from "fs";
import NodeCache from "node-cache";
import path from "path";
import pino from "pino";
import QRCode from "qrcode";
import { config } from "./config";
import {
  extractPhoneFromJid,
  normalizeJid,
  normalizePhone,
} from "./jid-utils";
import {
  sendMessageCreatedEvent,
  sendQRCodeEvent,
  sendStatusUpdateEvent,
} from "./webhook";

interface BaileysSession {
  accountId: string;
  socket: WASocket | null;
  status: "disconnected" | "pending_qr" | "connected" | "connecting";
  qrCode: string | null;
  lastError: string | null;
  processedMessages: Set<string>;
  reconnectAttempts: number;
}

class BaileysGateway {
  private sessions = new Map<string, BaileysSession>();
  private msgRetryCounterCache = new NodeCache();
  private logger = pino({ level: "silent" });

  private ensureSessionDir(accountId: string) {
    const dir = path.join(config.sessionDir, accountId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async startSession(accountId: string) {
    if (this.sessions.has(accountId)) {
      return { success: true, message: "Already running" };
    }

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
    await this.connect(accountId, session);

    return { success: true, message: "Connection started" };
  }

  private async connect(accountId: string, session: BaileysSession) {
    const sessionDir = this.ensureSessionDir(accountId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: this.logger,
      printQRInTerminal: true,
      msgRetryCounterCache: this.msgRetryCounterCache,
      getMessage: async () => proto.Message.fromObject({}),
    });

    session.socket = sock;
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.status = "pending_qr";
        session.qrCode = await QRCode.toDataURL(qr);
        await sendQRCodeEvent(accountId, session.qrCode);
      }

      if (connection === "open") {
        session.status = "connected";
        session.qrCode = null;
        await sendStatusUpdateEvent(accountId, "connected");
      }

      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        session.status = "disconnected";
        await sendStatusUpdateEvent(accountId, "disconnected");

        if (shouldReconnect && session.reconnectAttempts < 5) {
          session.reconnectAttempts++;
          setTimeout(
            () => this.connect(accountId, session),
            5000
          );
        }
      }
    });

    sock.ev.on("messages.upsert", ({ messages }) => {
      messages.forEach((msg) =>
        this.processMessage(accountId, msg).catch(console.error)
      );
    });
  }

  private async processMessage(
    accountId: string,
    msg: proto.IWebMessageInfo
  ) {
    if (!msg.message || !msg.key?.remoteJid) return;

    const phone = normalizePhone(
      extractPhoneFromJid(msg.key.remoteJid)
    );

    const content =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    await sendMessageCreatedEvent(accountId, {
      phoneNumber: phone,
      contactName: msg.pushName || "",
      content,
      timestamp: new Date().toISOString(),
      direction: msg.key.fromMe ? "outgoing" : "incoming",
      messageId: msg.key.id ?? undefined,
    });
  }

  async sendMessage(
    accountId: string,
    phoneNumber: string,
    content: string
  ) {
    const session = this.sessions.get(accountId);
    if (!session?.socket || session.status !== "connected") {
      return { success: false, error: "Not connected" };
    }

    const jid = normalizeJid(phoneNumber);
    const result = await session.socket.sendMessage(jid, { text: content });

    return { success: true, messageId: result?.key?.id };
  }

  async disconnect(accountId: string) {
    const session = this.sessions.get(accountId);
    if (!session) return;

    try {
      session.socket?.end(undefined);
    } catch {}

    this.sessions.delete(accountId);
    await sendStatusUpdateEvent(accountId, "disconnected");
  }

  getStatus(accountId: string) {
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

  getAllSessions() {
    return Array.from(this.sessions.entries()).map(
      ([accountId, session]) => ({
        accountId,
        status: session.status,
        hasQR: Boolean(session.qrCode),
      })
    );
  }
}

export const baileysGateway = new BaileysGateway();
