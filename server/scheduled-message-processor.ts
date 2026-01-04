import { storage } from "./storage";
import { whatsappBaileys } from "./whatsapp-baileys";

let processingInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

const PROCESS_INTERVAL_MS = 30000;

export function initScheduledMessageProcessor() {
  if (processingInterval) {
    clearInterval(processingInterval);
  }
  
  processingInterval = setInterval(processScheduledMessages, PROCESS_INTERVAL_MS);
  
  setTimeout(processScheduledMessages, 5000);
  
  console.log("[ScheduledMessages] Processor initialized, checking every 30 seconds");
}

async function processScheduledMessages() {
  if (isProcessing) return;
  
  isProcessing = true;
  
  try {
    const pendingMessages = await storage.getPendingScheduledMessages();
    
    if (pendingMessages.length === 0) {
      isProcessing = false;
      return;
    }
    
    console.log(`[ScheduledMessages] Processing ${pendingMessages.length} pending messages`);
    
    for (const msg of pendingMessages) {
      try {
        const contact = msg.contactId ? await storage.getContact(msg.contactId) : null;
        if (!contact) {
          console.error(`[ScheduledMessages] Contact not found for message ${msg.id}`);
          await storage.updateScheduledMessage(msg.id, {
            status: "failed",
            sentAt: new Date(),
            errorMessage: "Contact not found",
          } as any);
          continue;
        }
        
        const account = msg.whatsappAccountId ? await storage.getWhatsappAccount(msg.whatsappAccountId) : null;
        if (!account || account.status !== "connected") {
          console.error(`[ScheduledMessages] WhatsApp account not connected for message ${msg.id}`);
          await storage.updateScheduledMessage(msg.id, {
            status: "failed",
            sentAt: new Date(),
            errorMessage: "WhatsApp account not connected",
          } as any);
          continue;
        }
        
        let result;
        
        if (msg.mediaUrl && msg.mediaType && msg.mediaType !== "text") {
          result = await whatsappBaileys.sendMessage(
            account.id,
            contact.phoneNumber,
            msg.content || "",
            undefined,
            {
              mediaUrl: msg.mediaUrl,
              mediaType: msg.mediaType as "image" | "audio" | "document" | "video",
            }
          );
        } else {
          result = await whatsappBaileys.sendMessage(
            account.id,
            contact.phoneNumber,
            msg.content || ""
          );
        }
        
        if (result.success) {
          console.log(`[ScheduledMessages] Message ${msg.id} sent successfully to ${contact.phoneNumber}`);
          
          await storage.updateScheduledMessage(msg.id, {
            status: "sent",
            sentAt: new Date(),
          } as any);
          
          if (msg.conversationId) {
            try {
              await storage.createMessage({
                conversationId: msg.conversationId,
                direction: "outgoing",
                content: msg.content || "",
                mediaType: msg.mediaType || null,
                mediaUrl: msg.mediaUrl || null,
              });
              
              await storage.updateConversation(msg.conversationId, {
                lastMessageAt: new Date(),
                lastOutboundAt: new Date(),
              });
            } catch (err) {
              console.error(`[ScheduledMessages] Error creating message record:`, err);
            }
          }
        } else {
          console.error(`[ScheduledMessages] Failed to send message ${msg.id}: ${result.error}`);
          await storage.updateScheduledMessage(msg.id, {
            status: "failed",
            sentAt: new Date(),
            errorMessage: result.error || "Unknown error",
          } as any);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`[ScheduledMessages] Error processing message ${msg.id}:`, error);
        try {
          await storage.updateScheduledMessage(msg.id, {
            status: "failed",
            sentAt: new Date(),
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          } as any);
        } catch (updateError) {
          console.error(`[ScheduledMessages] Error updating message status:`, updateError);
        }
      }
    }
    
  } catch (error) {
    console.error("[ScheduledMessages] Error in processor:", error);
  } finally {
    isProcessing = false;
  }
}

export function stopScheduledMessageProcessor() {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
  console.log("[ScheduledMessages] Processor stopped");
}
