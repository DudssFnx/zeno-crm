import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { whatsappBaileys } from "./whatsapp-baileys";
import { normalizeJid } from "./jid-utils";
import { markMessageSentByCrm } from "./message-queue";
import type { AutoResponse, Contact, Conversation } from "@shared/schema";

let io: SocketServer | null = null;

export function setAutoResponseSocket(socketServer: SocketServer) {
  io = socketServer;
}

interface AutoResponseContext {
  accountId: string;
  companyId: string;
  contact: Contact;
  conversation: Conversation;
  messageContent: string;
  isFirstMessageEver: boolean;
  isFirstMessageToday: boolean;
}

function renderTemplate(template: string, context: {
  nome: string;
  telefone: string;
  primeiro_nome: string;
}): string {
  return template
    .replace(/\{\{nome\}\}/g, context.nome)
    .replace(/\{\{telefone\}\}/g, context.telefone)
    .replace(/\{\{primeiro_nome\}\}/g, context.primeiro_nome);
}

function isWithinSchedule(autoResponse: AutoResponse): boolean {
  if (!autoResponse.scheduleEnabled) return true;
  
  const now = new Date();
  const currentDay = String(now.getDay());
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  
  // Check day of week
  const scheduleDays = autoResponse.scheduleDays || [];
  if (scheduleDays.length > 0 && !scheduleDays.includes(currentDay)) {
    return false;
  }
  
  // Check time range
  if (autoResponse.scheduleStartTime && currentTime < autoResponse.scheduleStartTime) {
    return false;
  }
  if (autoResponse.scheduleEndTime && currentTime > autoResponse.scheduleEndTime) {
    return false;
  }
  
  return true;
}

function normalizeText(text: string): string {
  // Remove accents/diacritics and convert to lowercase
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(content: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  
  const normalizedContent = normalizeText(content);
  const contentWords = normalizedContent.split(" ");
  
  return keywords.some(keyword => {
    const normalizedKeyword = normalizeText(keyword);
    // Match as whole word anywhere in content
    return contentWords.includes(normalizedKeyword) ||
           normalizedContent === normalizedKeyword ||
           normalizedContent.includes(` ${normalizedKeyword} `) ||
           normalizedContent.startsWith(`${normalizedKeyword} `) ||
           normalizedContent.endsWith(` ${normalizedKeyword}`);
  });
}

async function shouldTrigger(
  autoResponse: AutoResponse,
  context: AutoResponseContext
): Promise<boolean> {
  // Check schedule
  if (!isWithinSchedule(autoResponse)) {
    console.log(`[AutoResponse] ${autoResponse.name}: Outside schedule`);
    return false;
  }
  
  // Check skip conditions
  if (autoResponse.skipIfConversationOpen && context.conversation.status === "open") {
    // Only skip if there's an assigned agent (meaning it's being handled)
    if (context.conversation.assignedToUserId) {
      console.log(`[AutoResponse] ${autoResponse.name}: Skipping - conversation is open with assigned agent`);
      return false;
    }
  }
  
  if (autoResponse.skipIfConversationResolved && context.conversation.status === "resolved") {
    console.log(`[AutoResponse] ${autoResponse.name}: Skipping - conversation is resolved`);
    return false;
  }
  
  // Check if should only trigger on first message of the day
  if (autoResponse.onlyFirstMessageDay && !context.isFirstMessageToday) {
    console.log(`[AutoResponse] ${autoResponse.name}: Skipping - not first message of the day`);
    return false;
  }
  
  // Check trigger type
  switch (autoResponse.triggerType) {
    case "any_message":
      return true;
      
    case "keyword":
      const matches = matchesKeyword(context.messageContent, autoResponse.keywords || []);
      console.log(`[AutoResponse] ${autoResponse.name}: Keyword match = ${matches}`);
      return matches;
      
    case "first_message_day":
      return context.isFirstMessageToday;
      
    case "first_message_ever":
      return context.isFirstMessageEver;
      
    default:
      return false;
  }
}

async function executeActions(
  autoResponse: AutoResponse,
  context: AutoResponseContext
): Promise<void> {
  const actions = autoResponse.actions as any[] || [];
  
  console.log(`[AutoResponse] Executing ${actions.length} actions for "${autoResponse.name}"`);
  
  for (const action of actions) {
    try {
      // Apply delay if specified
      if (action.delayMs && action.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, action.delayMs));
      }
      
      switch (action.type) {
        case "send_text":
          if (action.content) {
            const contactName = context.contact.name || "";
            const renderedContent = renderTemplate(action.content, {
              nome: contactName,
              telefone: context.contact.phoneNumber,
              primeiro_nome: contactName.split(" ")[0] || "",
            });
            
            const chatId = normalizeJid(context.contact.phoneNumber);
            const result = await whatsappBaileys.sendMessage(
              context.accountId,
              chatId,
              renderedContent
            );
            
            if (result.success) {
              if (result.messageId) {
                markMessageSentByCrm(result.messageId);
              }
              
              // Save message to database
              const savedMsg = await storage.createMessage({
                conversationId: context.conversation.id,
                direction: "outgoing",
                content: renderedContent,
                senderDisplayName: "Auto Atendimento",
              });
              
              // Emit socket event
              if (io) {
                io.to(`company:${context.companyId}`).emit("message:created", {
                  companyId: context.companyId,
                  conversationId: context.conversation.id,
                  message: savedMsg,
                });
              }
              
              console.log(`[AutoResponse] Sent text message: "${renderedContent.substring(0, 50)}..."`);
            } else {
              console.error(`[AutoResponse] Failed to send text: ${result.error}`);
            }
          }
          break;
          
        case "add_tag":
          if (action.tagId) {
            const existingTags = await storage.getContactTags(context.contact.id);
            const hasTag = existingTags.some(t => t.id === action.tagId);
            
            if (!hasTag) {
              await storage.addContactTag(context.contact.id, action.tagId);
              
              if (io) {
                io.to(`company:${context.companyId}`).emit("contact:tags_updated", {
                  contactId: context.contact.id,
                  action: "added",
                  tagId: action.tagId,
                });
              }
              
              console.log(`[AutoResponse] Added tag: ${action.tagId}`);
            }
          }
          break;
          
        case "remove_tag":
          if (action.tagId) {
            await storage.removeContactTag(context.contact.id, action.tagId);
            
            if (io) {
              io.to(`company:${context.companyId}`).emit("contact:tags_updated", {
                contactId: context.contact.id,
                action: "removed",
                tagId: action.tagId,
              });
            }
            
            console.log(`[AutoResponse] Removed tag: ${action.tagId}`);
          }
          break;
          
        case "set_status":
          if (action.status) {
            await storage.updateConversation(context.conversation.id, {
              status: action.status,
            });
            
            if (io) {
              io.to(`company:${context.companyId}`).emit("conversation:updated", {
                companyId: context.companyId,
                conversationId: context.conversation.id,
                status: action.status,
              });
            }
            
            console.log(`[AutoResponse] Set status to: ${action.status}`);
          }
          break;
          
        case "assign_agent":
          if (action.agentId) {
            await storage.updateConversation(context.conversation.id, {
              assignedToUserId: action.agentId,
            });
            
            if (io) {
              io.to(`company:${context.companyId}`).emit("conversation:updated", {
                companyId: context.companyId,
                conversationId: context.conversation.id,
                assignedToUserId: action.agentId,
              });
            }
            
            console.log(`[AutoResponse] Assigned to agent: ${action.agentId}`);
          }
          break;
          
        default:
          console.log(`[AutoResponse] Unknown action type: ${action.type}`);
      }
    } catch (actionError) {
      console.error(`[AutoResponse] Error executing action ${action.type}:`, actionError);
    }
  }
}

export async function processAutoResponses(
  accountId: string,
  companyId: string,
  contact: Contact,
  conversation: Conversation,
  messageContent: string
): Promise<void> {
  try {
    // Get active auto responses for this account
    const autoResponses = await storage.getActiveAutoResponses(companyId, accountId);
    
    if (autoResponses.length === 0) {
      return;
    }
    
    console.log(`[AutoResponse] Checking ${autoResponses.length} auto responses for message: "${messageContent.substring(0, 30)}..."`);
    
    // Simple heuristic for new contact: if contact was just created (within last minute)
    const isNewContact = contact.createdAt && 
      (new Date().getTime() - new Date(contact.createdAt).getTime()) < 60000;
    
    // Process auto responses in priority order (only first matching one triggers)
    for (const autoResponse of autoResponses) {
      try {
        // Check first_message flags per auto response (each has its own history)
        const hasReceivedEver = await storage.hasContactEverReceivedAutoResponse(contact.id, autoResponse.id);
        const hasReceivedToday = await storage.hasContactReceivedAutoResponseToday(contact.id, autoResponse.id);
        
        const context: AutoResponseContext = {
          accountId,
          companyId,
          contact,
          conversation,
          messageContent,
          isFirstMessageEver: isNewContact || !hasReceivedEver,
          isFirstMessageToday: !hasReceivedToday,
        };
        
        const shouldRun = await shouldTrigger(autoResponse, context);
        
        if (shouldRun) {
          console.log(`[AutoResponse] Triggered: "${autoResponse.name}"`);
          
          try {
            // Execute actions
            await executeActions(autoResponse, context);
            
            // Log successful execution
            await storage.createAutoResponseLog({
              autoResponseId: autoResponse.id,
              contactId: contact.id,
              conversationId: conversation.id,
              triggerMessage: messageContent,
              actionsTaken: autoResponse.actions as any,
            });
            
            console.log(`[AutoResponse] Successfully executed: "${autoResponse.name}"`);
          } catch (execError) {
            // Log failed execution
            console.error(`[AutoResponse] Execution failed for "${autoResponse.name}":`, execError);
            
            await storage.createAutoResponseLog({
              autoResponseId: autoResponse.id,
              contactId: contact.id,
              conversationId: conversation.id,
              triggerMessage: messageContent,
              actionsTaken: [{
                error: true,
                message: execError instanceof Error ? execError.message : String(execError),
                attemptedActions: autoResponse.actions,
              }] as any,
            });
          }
          
          // Only execute first matching auto response (by priority)
          break;
        }
      } catch (perResponseError) {
        console.error(`[AutoResponse] Error checking auto response "${autoResponse.name}":`, perResponseError);
        // Continue to next auto response
      }
    }
  } catch (error) {
    console.error("[AutoResponse] Error processing auto responses:", error);
  }
}
