import type { Request, Response, NextFunction } from "express";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { verifyGatewaySignature } from "./gateway-client";
import { normalizePhone } from "./jid-utils";
import { dispatchWebhook } from "./webhook-dispatcher";

let io: SocketServer | null = null;

export function setSocketServer(socketServer: SocketServer) {
  io = socketServer;
}

export function gatewayWebhookAuth(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers["x-gateway-signature"] as string;
  const timestamp = req.headers["x-gateway-timestamp"] as string;
  
  if (!signature || !timestamp) {
    res.status(401).json({ error: "Missing authentication headers" });
    return;
  }
  
  const timestampMs = parseInt(timestamp, 10);
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  if (Math.abs(now - timestampMs) > fiveMinutes) {
    res.status(401).json({ error: "Request expired" });
    return;
  }
  
  const payload = JSON.stringify(req.body);
  
  if (!verifyGatewaySignature(payload, signature, timestamp)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  
  next();
}

interface MessageCreatedEvent {
  type: "message.created";
  accountId: string;
  timestamp: string;
  data: {
    phoneNumber: string;
    contactName: string;
    content: string;
    timestamp: string;
    direction: "incoming" | "outgoing";
    messageId?: string;
    avatarUrl?: string;
    mediaInfo?: {
      mediaType: string;
      mimetype: string;
      fileName?: string;
      fileSize?: number;
    };
  };
}

interface StatusUpdatedEvent {
  type: "status.updated";
  accountId: string;
  timestamp: string;
  data: {
    status: string;
    error?: string;
  };
}

interface QRGeneratedEvent {
  type: "qr.generated";
  accountId: string;
  timestamp: string;
  data: {
    qrCode: string;
  };
}

type GatewayEvent = MessageCreatedEvent | StatusUpdatedEvent | QRGeneratedEvent;

export async function handleGatewayWebhook(req: Request, res: Response): Promise<void> {
  const event = req.body as GatewayEvent;
  
  console.log(`[GatewayWebhook] Received event: ${event.type} for account ${event.accountId}`);
  
  try {
    switch (event.type) {
      case "message.created":
        await handleMessageCreated(event);
        break;
      case "status.updated":
        await handleStatusUpdated(event);
        break;
      case "qr.generated":
        await handleQRGenerated(event);
        break;
      default:
        console.log(`[GatewayWebhook] Unknown event type: ${(event as any).type}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error(`[GatewayWebhook] Error handling event:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleMessageCreated(event: MessageCreatedEvent): Promise<void> {
  const { accountId, data } = event;
  const { phoneNumber, contactName, content, direction, messageId, avatarUrl, mediaInfo } = data;
  
  const account = await storage.getWhatsappAccount(accountId);
  if (!account) {
    console.error(`[GatewayWebhook] Account not found: ${accountId}`);
    return;
  }
  
  const companyId = account.companyId;
  
  const normalizedPhone = normalizePhone(phoneNumber);
  let contact = await storage.getContactByPhone(companyId, normalizedPhone);
  
  if (!contact) {
    contact = await storage.createContact({
      companyId,
      whatsappAccountId: accountId,
      phoneNumber: normalizedPhone,
      name: contactName || "Contato",
      avatarUrl: avatarUrl || null,
    });
    console.log(`[GatewayWebhook] Created new contact: ${contact.id}`);
  } else if (contactName && contact.name === "Contato") {
    await storage.updateContact(contact.id, { name: contactName });
  }
  
  let conversation = await storage.getOpenConversationByContact(contact.id);
  
  if (!conversation) {
    conversation = await storage.createConversation({
      companyId,
      contactId: contact.id,
      whatsappAccountId: accountId,
      status: "open",
      assignedToUserId: null,
      stageId: null,
      isUnread: direction === "incoming",
    });
    console.log(`[GatewayWebhook] Created new conversation: ${conversation.id}`);
  } else if (direction === "incoming") {
    await storage.updateConversation(conversation.id, {
      status: "open",
      isUnread: true,
      lastMessageAt: new Date(),
    });
  }
  
  const message = await storage.createMessage({
    conversationId: conversation.id,
    senderUserId: null,
    content: content || "",
    direction,
    mediaType: mediaInfo?.mediaType || null,
    mediaUrl: null,
    fileName: mediaInfo?.fileName || null,
    mimetype: mediaInfo?.mimetype || null,
    fileSize: mediaInfo?.fileSize?.toString() || null,
  });
  
  console.log(`[GatewayWebhook] Created message: ${message.id}, direction: ${direction}`);
  
  if (io) {
    io.emit("message:created", {
      companyId,
      conversationId: conversation.id,
      contactId: contact.id,
      message: {
        id: message.id,
        content: message.content,
        direction: message.direction,
        createdAt: message.createdAt,
      },
    });
    
    io.emit("conversation:updated", {
      companyId,
      conversationId: conversation.id,
      lastMessage: content || `[${mediaInfo?.mediaType || "media"}]`,
      lastMessageAt: new Date().toISOString(),
    });
  }
  
  if (direction === "incoming") {
    dispatchWebhook(companyId, "message.incoming", {
      conversationId: conversation.id,
      contactId: contact.id,
      contactPhone: phoneNumber,
      contactName: contactName,
      messageContent: content,
      messageId: message.id,
    });
  }
}

async function handleStatusUpdated(event: StatusUpdatedEvent): Promise<void> {
  const { accountId, data } = event;
  const { status, error } = data;
  
  console.log(`[GatewayWebhook] Status update for ${accountId}: ${status}`);
  
  try {
    await storage.updateWhatsappAccount(accountId, { status });
    
    if (io) {
      io.to(`whatsapp:${accountId}`).emit("whatsapp:status", {
        accountId,
        status,
        error,
      });
    }
  } catch (err) {
    console.error(`[GatewayWebhook] Error updating status:`, err);
  }
}

async function handleQRGenerated(event: QRGeneratedEvent): Promise<void> {
  const { accountId, data } = event;
  const { qrCode } = data;
  
  console.log(`[GatewayWebhook] QR code received for ${accountId}`);
  
  if (io) {
    io.to(`whatsapp:${accountId}`).emit("whatsapp:qr", {
      qrCode,
    });
  }
}
