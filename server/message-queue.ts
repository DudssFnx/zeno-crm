import NodeCache from "node-cache";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { normalizePhone } from "./jid-utils";
import { dispatchWebhook } from "./webhook-dispatcher";
import { whatsappBaileys, MediaInfo } from "./whatsapp-baileys";
import { processFlowMessage } from "./flow-processor";
import { triageEngine } from "./triage-engine";
import fs from "fs";
import path from "path";
import { proto } from "@whiskeysockets/baileys";

// Cache TTL: 5 minutos para contacts/conversations, 1 hora para accounts
const accountCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const contactCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const conversationCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Filas de processamento
const messageQueue: QueuedMessage[] = [];
const avatarQueue: AvatarTask[] = [];
const mediaQueue: MediaDownloadTask[] = [];
let isProcessingMessages = false;
let isProcessingAvatars = false;
let isProcessingMedia = false;
let io: SocketServer | null = null;

// Rastrear mensagens enviadas pelo CRM para evitar duplicação
// Mensagens enviadas pelo celular NÃO estarão neste Set
const sentByCrmMessageIds = new Set<string>();

export function markMessageSentByCrm(messageId: string) {
  sentByCrmMessageIds.add(messageId);
  // Limpar após 5 minutos para não crescer infinitamente
  setTimeout(() => sentByCrmMessageIds.delete(messageId), 5 * 60 * 1000);
}

export function wasMessageSentByCrm(messageId: string): boolean {
  return sentByCrmMessageIds.has(messageId);
}

// Uploads directory
const UPLOADS_DIR = "./uploads";

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
  mediaInfo?: MediaInfo;
  messageId?: string;
  isGroup?: boolean; // true if message is from a WhatsApp group
}

interface AvatarTask {
  accountId: string;
  phoneNumber: string;
  companyId: string;
  contactId: string;
}

interface MediaDownloadTask {
  accountId: string;
  companyId: string;
  dbMessageId: string;
  conversationId: string;
  mediaInfo: MediaInfo;
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
      let avatarUrl: string | null = null;
      
      // Para contatos com LID, tentar buscar usando o JID @lid
      if (task.phoneNumber.startsWith("LID_")) {
        const lidNumber = task.phoneNumber.replace("LID_", "");
        const lidJid = `${lidNumber}@lid`;
        console.log(`[Avatar] Trying to fetch avatar for LID contact: ${lidJid}`);
        avatarUrl = await whatsappBaileys.getProfilePicture(task.accountId, lidJid);
      } else {
        // Buscar avatar via Baileys com número normal
        avatarUrl = await whatsappBaileys.getProfilePicture(task.accountId, task.phoneNumber);
      }
      
      if (avatarUrl) {
        // Atualizar contato no banco
        await storage.updateContact(task.contactId, {
          avatarUrl,
          avatarUpdatedAt: new Date(),
        });
        
        console.log(`[Avatar] Updated avatar for contact ${task.contactId}: ${avatarUrl.substring(0, 50)}...`);
        
        // Emitir evento de atualização de contato
        if (io) {
          const companyRoom = `company:${task.companyId}`;
          io.to(companyRoom).emit("contact:updated", {
            companyId: task.companyId,
            contactId: task.contactId,
            avatarUrl,
          });
        }
      } else {
        console.log(`[Avatar] No avatar available for ${task.phoneNumber}`);
      }
    } catch (error) {
      console.error(`[Avatar] Error fetching avatar for ${task.phoneNumber}:`, error);
    }
  }
  
  isProcessingAvatars = false;
}

// Adicionar tarefa de media download à fila
export function queueMediaDownload(task: MediaDownloadTask) {
  mediaQueue.push(task);
  processMediaQueue();
}

// Obter extensão de arquivo a partir do mimetype
function getExtensionFromMimetype(mimetype: string): string {
  // Extrair o mimetype base (sem parâmetros como "; codecs=opus")
  const baseMimetype = mimetype.split(";")[0].trim();
  
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "video/quicktime": "mov",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/opus": "opus",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt",
  };
  return mimeToExt[baseMimetype] || "bin";
}

// Processar fila de media em background
async function processMediaQueue() {
  if (isProcessingMedia || mediaQueue.length === 0) return;
  
  isProcessingMedia = true;
  
  while (mediaQueue.length > 0) {
    const task = mediaQueue.shift();
    if (!task) continue;
    
    try {
      await processMediaDownload(task);
    } catch (error) {
      console.error("[Media] Error processing media download:", error);
    }
  }
  
  isProcessingMedia = false;
}

// Processar download de media individual
async function processMediaDownload(task: MediaDownloadTask) {
  const { accountId, companyId, dbMessageId, conversationId, mediaInfo } = task;
  
  try {
    console.log(`[Media] Starting download for message ${dbMessageId}, type: ${mediaInfo.mediaType}`);
    
    // Download media from WhatsApp
    const buffer = await whatsappBaileys.downloadMedia(
      accountId,
      mediaInfo.messageKey,
      mediaInfo.message
    );
    
    if (!buffer) {
      console.error(`[Media] Failed to download media for message ${dbMessageId}`);
      return;
    }
    
    // Create uploads directory if it doesn't exist
    const uploadsPath = path.join(UPLOADS_DIR, accountId);
    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
    }
    
    // Determine file extension
    const extension = getExtensionFromMimetype(mediaInfo.mimetype);
    const fileName = mediaInfo.fileName || `${dbMessageId}.${extension}`;
    const filePath = path.join(uploadsPath, `${dbMessageId}.${extension}`);
    
    // Save file to disk
    fs.writeFileSync(filePath, buffer);
    
    const fileSize = buffer.length;
    const mediaUrl = `/uploads/${accountId}/${dbMessageId}.${extension}`;
    
    console.log(`[Media] Saved media to ${filePath} (${fileSize} bytes)`);
    
    // Update message in database with media info
    await storage.updateMessage(dbMessageId, {
      mediaUrl,
      mediaType: mediaInfo.mediaType,
      fileName,
      mimetype: mediaInfo.mimetype,
      fileSize: String(fileSize),
    });
    
    console.log(`[Media] Updated message ${dbMessageId} with media info`);
    
    // Emit socket event for media ready
    if (io) {
      const companyRoom = `company:${companyId}`;
      io.to(companyRoom).emit("message:media_ready", {
        companyId,
        conversationId,
        messageId: dbMessageId,
        mediaUrl,
        mediaType: mediaInfo.mediaType,
        fileName,
        mimetype: mediaInfo.mimetype,
        fileSize,
      });
      
      console.log(`[Media] Emitted message:media_ready for message ${dbMessageId}`);
    }
    
  } catch (error) {
    console.error(`[Media] Error downloading media for message ${dbMessageId}:`, error);
  }
}

// Processamento real da mensagem (DB operations)
async function processMessageInBackground(msg: QueuedMessage) {
  const { accountId, companyId, phoneNumber, contactName, content, direction, senderDisplayName, avatarUrl, mediaInfo, messageId, isGroup } = msg;
  
  // IMPORTANT: Only skip outgoing messages that were sent by CRM (to avoid duplicates)
  // Outgoing messages from phone/linked device should be processed normally
  if (direction === "outgoing" && messageId && wasMessageSentByCrm(messageId)) {
    console.log(`[Queue] Skipping CRM outgoing message echo: ${messageId}`);
    return;
  }
  
  // ENTRY POINT LOG - all messages that reach here should be processed
  console.log(`[MessageHandler] ENTRY: direction=${direction} rawPhone=${phoneNumber} pushName="${contactName || 'undefined'}" content="${content.substring(0, 30)}"`);

  try {
    const logPrefix = direction === "outgoing" ? "[PHONE_MSG]" : "[INBOUND]";
    const normalizedPhone = normalizePhone(phoneNumber);
    
    // Log normalization result
    console.log(`[MessageHandler] Normalized phone: ${phoneNumber} -> ${normalizedPhone}`);
    
    // ATOMIC: getOrCreateContact to avoid race conditions
    let contact = getContactFromCache(companyId, normalizedPhone) as any;
    let contactCreated = false;
    let contactFromCache = !!contact;
    
    if (!contact) {
      // Determine contact name: use pushName if available, otherwise use phone number
      // Handle special cases: empty string, undefined, or null pushName
      let finalContactName = normalizedPhone; // Default: use phone number
      if (contactName && contactName.trim() && contactName.trim() !== normalizedPhone) {
        finalContactName = contactName.trim();
      } else if (normalizedPhone.startsWith("LID_")) {
        // For LID contacts without pushName, use a descriptive name
        finalContactName = `Contato ${normalizedPhone}`;
      } else {
        // For regular numbers, format with +55
        finalContactName = `Contato +${normalizedPhone}`;
      }
      
      console.log(`[MessageHandler] Creating/finding contact: name="${finalContactName}" phone="${normalizedPhone}" pushName="${contactName || 'undefined'}"`);
      
      // Use atomic getOrCreateContact - handles race conditions with DB unique index
      const result = await storage.getOrCreateContact({
        companyId,
        whatsappAccountId: accountId,
        name: finalContactName,
        phoneNumber: normalizedPhone,
        avatarUrl,
        source: "whatsapp",
        isGroup: isGroup || false,
      });
      contact = result.contact;
      contactCreated = result.created;
      setContactInCache(companyId, normalizedPhone, contact);
      
      if (contactCreated) {
        // REQUIRED LOG FORMAT
        console.log(`[Contact] Created: ${contact.name} - ${normalizedPhone}`);
        console.log(`${logPrefix} phone=${normalizedPhone} → CREATED NEW CONTACT: ${contact.id}`);
        // Enfileirar busca de avatar em background
        queueAvatarFetch({
          accountId,
          companyId,
          contactId: contact.id,
          phoneNumber: normalizedPhone,
        });
      } else {
        console.log(`[Contact] Found existing: ${contact.name} - ${normalizedPhone} (id: ${contact.id})`);
        console.log(`${logPrefix} phone=${normalizedPhone} → FOUND EXISTING CONTACT: ${contact.id}`);
      }
    } else {
      console.log(`[Contact] From cache: ${contact.name} - ${normalizedPhone} (id: ${contact.id})`);
    }
    
    // ATOMIC: getOrCreateConversation to avoid race conditions
    let conversation = getConversationFromCache(contact.id) as any;
    let conversationCreated = false;
    
    if (!conversation) {
      // Use atomic getOrCreateConversation - handles race conditions with DB unique index
      const result = await storage.getOrCreateConversation({
        companyId,
        whatsappAccountId: accountId,
        contactId: contact.id,
        status: "pending",
        inbox: "whatsapp",
      });
      conversation = result.conversation;
      conversationCreated = result.created;
      setConversationInCache(contact.id, conversation);
      
      if (conversationCreated) {
        // REQUIRED LOG FORMAT
        console.log(`[Conversation] Created for contact: ${contact.id}`);
        console.log(`${logPrefix} phone=${normalizedPhone} → CREATED NEW CONVERSATION: ${conversation.id}`);
      } else {
        console.log(`[Conversation] Found existing for contact: ${contact.id} (conv: ${conversation.id})`);
        console.log(`${logPrefix} phone=${normalizedPhone} → FOUND EXISTING CONVERSATION: ${conversation.id}`);
      }
    } else {
      console.log(`[Conversation] From cache for contact: ${contact.id} (conv: ${conversation.id})`);
    }
    
    // Criar mensagem no banco (include mediaType if media is present, but not mediaUrl yet)
    // Note: For outgoing messages from phone, senderDisplayName is "Celular" (set in whatsapp-baileys.ts)
    const savedMessage = await storage.createMessage({
      conversationId: conversation.id,
      direction,
      content,
      senderDisplayName: direction === "outgoing" ? (senderDisplayName || "Celular") : undefined,
      mediaType: mediaInfo?.mediaType,
      fileName: mediaInfo?.fileName,
      mimetype: mediaInfo?.mimetype,
      fileSize: mediaInfo?.fileSize ? String(mediaInfo.fileSize) : undefined,
    });
    
    // If message has media, queue download in background
    if (mediaInfo) {
      queueMediaDownload({
        accountId,
        companyId,
        dbMessageId: savedMessage.id,
        conversationId: conversation.id,
        mediaInfo,
      });
      console.log(`[Queue] Queued media download for message ${savedMessage.id}`);
    }
    
    // Atualizar timestamp da conversa e campos de inatividade
    const now = new Date();
    const updateData: { lastMessageAt: Date; lastInboundAt?: Date; lastOutboundAt?: Date } = {
      lastMessageAt: now,
    };
    if (direction === "incoming") {
      updateData.lastInboundAt = now;
    } else if (direction === "outgoing") {
      updateData.lastOutboundAt = now;
    }
    await storage.updateConversation(conversation.id, updateData);
    
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
        mediaType: mediaInfo?.mediaType,
      }).catch(err => console.error("[Webhook] Error:", err));
      
      // Processar triagem automática (menu numérico)
      let triageHandled = false;
      try {
        const isFirstMessage = conversationCreated;
        const triageResult = await triageEngine.processIncomingMessage(
          conversation.id,
          companyId,
          accountId,
          content,
          isFirstMessage
        );
        
        if (triageResult.action !== "no_menu" && triageResult.action !== "already_routed") {
          triageHandled = true;
          console.log(`[TriageEngine] Action: ${triageResult.action} for conversation ${conversation.id}`);
          
          if (triageResult.message) {
            // Usar delay humanizado antes de enviar
            const delay = 1500 + Math.floor(Math.random() * 2000);
            console.log(`[TriageEngine] Sending response after ${delay}ms delay`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            await whatsappBaileys.sendMessage(accountId, phoneNumber, triageResult.message);
            console.log(`[TriageEngine] Sent: "${triageResult.message.substring(0, 50)}..."`);
          }
          
          if (triageResult.action === "route_to_department" && triageResult.departmentId) {
            console.log(`[TriageEngine] Routed to department: ${triageResult.departmentId}, agent: ${triageResult.agentId || 'none'}`);
          }
        }
      } catch (triageErr) {
        console.error("[TriageEngine] Error processing triage:", triageErr);
      }
      
      // Processar fluxos conversacionais (auto-atendimento) apenas se triagem não tratou
      if (!triageHandled) {
        try {
          const flowResult = await processFlowMessage(storage, conversation, savedMessage, accountId);
          if (flowResult.processed && flowResult.responses.length > 0) {
            console.log(`[FlowProcessor] Sending ${flowResult.responses.length} flow responses`);
            for (const responseText of flowResult.responses) {
              // Enviar mensagem via WhatsApp
              await whatsappBaileys.sendMessage(accountId, phoneNumber, responseText);
            }
          }
        } catch (flowErr) {
          console.error("[FlowProcessor] Error processing flow:", flowErr);
        }
      }
    }
    
    console.log(`[ZERO_LOSS] SAVED: msgId=${savedMessage.id} convId=${conversation.id} phone=${phoneNumber} content="${content.substring(0, 30)}"`);
    
  } catch (error) {
    console.error("[ZERO_LOSS] ERROR in processMessageInBackground:", error);
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
    mediaInfo?: MediaInfo;
    messageId?: string;
  }
) {
  // LOG CRÍTICO: Toda mensagem que chega aqui DEVE ser processada
  console.log(`[ZERO_LOSS] RECEIVED: phone=${message.phoneNumber} direction=${message.direction} content="${message.content.substring(0, 50)}" contact="${message.contactName}" msgId=${message.messageId || "none"}`);
  
  // Verificar se é uma mensagem outgoing enviada pelo CRM (evitar duplicação)
  // Mensagens enviadas do celular (dispositivo vinculado) NÃO estão no Set e devem ser processadas
  if (message.direction === "outgoing" && message.messageId && wasMessageSentByCrm(message.messageId)) {
    console.log(`[ZERO_LOSS] SKIP_OUTGOING: eco de mensagem enviada pelo CRM, msgId=${message.messageId}`);
    return;
  }
  
  // Log para mensagens outgoing do celular (estas serão processadas)
  if (message.direction === "outgoing") {
    console.log(`[ZERO_LOSS] PROCESSING_OUTGOING: mensagem enviada do celular/dispositivo vinculado`);
  }
  
  // Buscar account do cache ou DB
  let account = getAccountFromCache(accountId) as any;
  
  if (!account) {
    account = await storage.getWhatsappAccount(accountId);
    if (account) {
      setAccountInCache(accountId, account);
    }
  }
  
  if (!account) {
    console.error("[ZERO_LOSS] CRITICAL: Account not found:", accountId);
    return;
  }
  
  const companyId = account.companyId;
  const phoneNumber = normalizePhone(message.phoneNumber);
  console.log(`[ZERO_LOSS] PROCESSING: phone=${phoneNumber} company=${companyId}`);
  
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
          mediaType: message.mediaInfo?.mediaType,
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
    mediaInfo: message.mediaInfo,
    messageId: message.messageId,
    isGroup: message.isGroup,
  });
}

// Limpar caches periodicamente
setInterval(() => {
  console.log(`[Cache] Stats - Accounts: ${accountCache.keys().length}, Contacts: ${contactCache.keys().length}, Conversations: ${conversationCache.keys().length}`);
}, 60000);
