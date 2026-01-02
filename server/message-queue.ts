import NodeCache from "node-cache";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { normalizePhone } from "./jid-utils";
import { dispatchWebhook } from "./webhook-dispatcher";

// Cache TTL: 5 minutos para contacts/conversations, 1 hora para accounts
const accountCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const contactCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const conversationCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Filas de processamento
const messageQueue: QueuedMessage[] = [];
const avatarQueue: AvatarTask[] = [];
let isProcessingMessages = false;
let isProcessingAvatars = false;
let io: SocketServer | null = null;

interface QueuedMessage {
  accountId: string;
  companyId: string;
  phoneNumber: string;
  contactName: string;
  content: string;
  direction: "incoming" | "outgoing";
  senderDisplayName?: string;
  avatarUrl?: string;
  timestamp: string;
}

interface AvatarTask {
  accountId: string;
  phoneNumber: string;
  companyId: string;
}

export function setSocketServer(socketServer: SocketServer) {
  io = socketServer;
}

export function getAccountFromCache(accountId: string) {
  return accountCache.get(accountId);
}

export function setAccountInCache(accountId: string, account: any) {
  accountCache.set(accountId, account);
}

export function getContactFromCache(companyId: string, phoneNumber: string) {
  const key = `${companyId}:${normalizePhone(phoneNumber)}`;
  return contactCache.get(key);
}

export function setContactInCache(companyId: string, phoneNumber: string, contact: any) {
  const key = `${companyId}:${normalizePhone(phoneNumber)}`;
  contactCache.set(key, contact);
}

export function getConversationFromCache(contactId: string) {
  return conversationCache.get(contactId);
}

export function setConversationInCache(contactId: string, conversation: any) {
  conversationCache.set(contactId, conversation);
}

export function invalidateContactCache(companyId: string, phoneNumber: string) {
  const key = `${companyId}:${normalizePhone(phoneNumber)}`;
  contactCache.del(key);
}

export function invalidateConversationCache(contactId: string) {
  conversationCache.del(contactId);
}

// Emitir mensagem IMEDIATAMENTE para o frontend
export async function emitMessageInstant(
  companyId: string,
  message: {
    conversationId?: string;
    contactId?: string;
    phoneNumber: string;
    contactName: string;
    content: string;
    direction: "incoming" | "outgoing";
    timestamp: string;
  }
) {
  if (!io) return;
  
  const companyRoom = `company:${companyId}`;
  
  // Emitir evento de nova mensagem com dados mínimos
  io.to(companyRoom).emit("message:created", {
    companyId,
    conversationId: message.conversationId,
    contactId: message.contactId,
    message: {
      id: `temp_${Date.now()}`,
      conversationId: message.conversationId,
      direction: message.direction,
      content: message.content,
      createdAt: message.timestamp,
    },
  });
  
  // Emitir atualização de conversa
  io.to(companyRoom).emit("conversation:updated", {
    companyId,
    conversationId: message.conversationId,
    lastMessage: message.content,
    lastMessageAt: message.timestamp,
  });
}

// Adicionar mensagem à fila para processamento em background
export function queueMessage(message: QueuedMessage) {
  messageQueue.push(message);
  processMessageQueue();
}

// Adicionar tarefa de avatar à fila
export function queueAvatarFetch(task: AvatarTask) {
  // Evitar duplicatas
  const exists = avatarQueue.some(
    t => t.phoneNumber === task.phoneNumber && t.companyId === task.companyId
  );
  if (!exists) {
    avatarQueue.push(task);
    processAvatarQueue();
  }
}

// Processar fila de mensagens em background
async function processMessageQueue() {
  if (isProcessingMessages || messageQueue.length === 0) return;
  
  isProcessingMessages = true;
  
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    if (!msg) continue;
    
    try {
      await processMessageInBackground(msg);
    } catch (error) {
      console.error("[Queue] Error processing message:", error);
    }
  }
  
  isProcessingMessages = false;
}

// Processar fila de avatares em background
async function processAvatarQueue() {
  if (isProcessingAvatars || avatarQueue.length === 0) return;
  
  isProcessingAvatars = true;
  
  while (avatarQueue.length > 0) {
    const task = avatarQueue.shift();
    if (!task) continue;
    
    try {
      // Avatar fetch será implementado via Baileys
      console.log(`[Avatar] Would fetch avatar for ${task.phoneNumber}`);
    } catch (error) {
      console.error("[Queue] Error fetching avatar:", error);
    }
  }
  
  isProcessingAvatars = false;
}

// Processamento real da mensagem (DB operations)
async function processMessageInBackground(msg: QueuedMessage) {
  const { accountId, companyId, phoneNumber, contactName, content, direction, senderDisplayName, avatarUrl } = msg;
  
  try {
    // Buscar ou criar contato (usar cache)
    let contact = getContactFromCache(companyId, phoneNumber) as any;
    
    if (!contact) {
      contact = await storage.getContactByPhone(companyId, phoneNumber);
      if (contact) {
        setContactInCache(companyId, phoneNumber, contact);
      }
    }
    
    if (!contact) {
      contact = await storage.createContact({
        companyId,
        whatsappAccountId: accountId,
        name: contactName || phoneNumber,
        phoneNumber: normalizePhone(phoneNumber),
        avatarUrl,
      });
      setContactInCache(companyId, phoneNumber, contact);
    }
    
    // Buscar ou criar conversa (usar cache)
    let conversation = getConversationFromCache(contact.id) as any;
    
    if (!conversation) {
      conversation = await storage.getOpenConversationByContact(contact.id);
      if (conversation) {
        setConversationInCache(contact.id, conversation);
      }
    }
    
    if (!conversation) {
      conversation = await storage.createConversation({
        companyId,
        whatsappAccountId: accountId,
        contactId: contact.id,
        status: "open",
        inbox: "whatsapp",
      });
      setConversationInCache(contact.id, conversation);
    }
    
    // Criar mensagem no banco
    const savedMessage = await storage.createMessage({
      conversationId: conversation.id,
      direction,
      content,
      senderDisplayName: senderDisplayName || (direction === "outgoing" ? "Celular" : undefined),
    });
    
    // Atualizar timestamp da conversa
    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date(),
    });
    
    // Invalidar cache da conversa
    invalidateConversationCache(contact.id);
    
    // Emitir evento final com dados completos
    if (io) {
      const companyRoom = `company:${companyId}`;
      
      io.to(companyRoom).emit("message:created", {
        companyId,
        conversationId: conversation.id,
        contactId: contact.id,
        message: savedMessage,
      });
      
      io.to(companyRoom).emit("conversation:updated", {
        companyId,
        conversationId: conversation.id,
        lastMessage: content,
        lastMessageAt: new Date().toISOString(),
      });
    }
    
    // Webhook para mensagens recebidas
    if (direction === "incoming") {
      // Fire and forget - não aguardar
      dispatchWebhook(companyId, "message.incoming", {
        conversationId: conversation.id,
        contactId: contact.id,
        messageId: savedMessage.id,
        content,
        phoneNumber,
      }).catch(err => console.error("[Webhook] Error:", err));
    }
    
    console.log(`[Queue] Message processed: ${direction} to ${phoneNumber}`);
    
  } catch (error) {
    console.error("[Queue] Error in processMessageInBackground:", error);
  }
}

// Handler rápido para mensagens - emite imediatamente e enfileira
export async function handleMessageFast(
  accountId: string,
  message: {
    phoneNumber: string;
    contactName: string;
    content: string;
    direction: "incoming" | "outgoing";
    senderDisplayName?: string;
    avatarUrl?: string;
    timestamp: string;
  }
) {
  // Buscar account do cache ou DB
  let account = getAccountFromCache(accountId) as any;
  
  if (!account) {
    account = await storage.getWhatsappAccount(accountId);
    if (account) {
      setAccountInCache(accountId, account);
    }
  }
  
  if (!account) {
    console.error("[Queue] Account not found:", accountId);
    return;
  }
  
  const companyId = account.companyId;
  const phoneNumber = normalizePhone(message.phoneNumber);
  
  // Tentar buscar conversa existente do cache para emitir imediatamente
  let contact = getContactFromCache(companyId, phoneNumber) as any;
  let conversation = contact ? getConversationFromCache(contact.id) as any : null;
  
  // EMITIR IMEDIATAMENTE para o frontend (mesmo sem dados completos)
  if (io) {
    const companyRoom = `company:${companyId}`;
    const room = io.sockets.adapter.rooms.get(companyRoom);
    
    if (room && room.size > 0) {
      // Emitir preview da mensagem
      io.to(companyRoom).emit("message:created", {
        companyId,
        conversationId: conversation?.id || null,
        contactId: contact?.id || null,
        phoneNumber,
        contactName: message.contactName,
        message: {
          id: `preview_${Date.now()}`,
          conversationId: conversation?.id || null,
          direction: message.direction,
          content: message.content,
          createdAt: message.timestamp,
          isPreview: true,
        },
      });
      
      console.log(`[Queue] Emitted preview to ${room.size} clients`);
    }
  }
  
  // Enfileirar para processamento em background
  queueMessage({
    accountId,
    companyId,
    phoneNumber,
    contactName: message.contactName,
    content: message.content,
    direction: message.direction,
    senderDisplayName: message.senderDisplayName,
    avatarUrl: message.avatarUrl,
    timestamp: message.timestamp,
  });
}

// Limpar caches periodicamente
setInterval(() => {
  console.log(`[Cache] Stats - Accounts: ${accountCache.keys().length}, Contacts: ${contactCache.keys().length}, Conversations: ${conversationCache.keys().length}`);
}, 60000);
