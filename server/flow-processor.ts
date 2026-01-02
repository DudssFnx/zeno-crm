import type { IStorage } from "./storage";
import type {
  Conversation,
  Message,
  Contact,
  ChatFlow,
  ChatFlowStep,
  ChatFlowSession,
  MenuOption,
} from "@shared/schema";

export interface FlowProcessResult {
  processed: boolean;
  responses: string[];
}

function replaceTemplateVariables(text: string, contact: Contact): string {
  if (!text) return text;
  
  const firstName = contact.name?.split(" ")[0] || "";
  
  return text
    .replace(/\{\{nome\}\}/gi, contact.name || "")
    .replace(/\{\{primeiro_nome\}\}/gi, firstName)
    .replace(/\{\{telefone\}\}/gi, contact.phoneNumber || "");
}

function formatMenuOptions(options: MenuOption[]): string {
  if (!options || options.length === 0) return "";
  
  const lines = options.map((opt) => `${opt.value} - ${opt.label}`);
  return "Digite:\n" + lines.join("\n");
}

async function applyMenuOptionActions(
  storage: IStorage,
  option: MenuOption,
  conversation: Conversation,
  contact: Contact
): Promise<void> {
  console.log(`[FlowProcessor] Applying actions for menu option: ${option.value} - ${option.label}`);
  
  if (option.tagId) {
    console.log(`[FlowProcessor] Adding tag: ${option.tagId}`);
    try {
      await storage.addContactTag(contact.id, option.tagId);
    } catch (error) {
      console.error(`[FlowProcessor] Error adding tag: ${error}`);
    }
  }
  
  if (option.assignUserId) {
    console.log(`[FlowProcessor] Assigning user: ${option.assignUserId}`);
    try {
      await storage.updateConversation(conversation.id, {
        assignedToUserId: option.assignUserId,
      });
    } catch (error) {
      console.error(`[FlowProcessor] Error assigning user: ${error}`);
    }
  }
  
  if (option.setStatus) {
    console.log(`[FlowProcessor] Setting status: ${option.setStatus}`);
    try {
      await storage.updateConversation(conversation.id, {
        status: option.setStatus,
      });
    } catch (error) {
      console.error(`[FlowProcessor] Error setting status: ${error}`);
    }
  }
}

async function executeStepAction(
  storage: IStorage,
  step: ChatFlowStep,
  conversation: Conversation,
  contact: Contact,
  session: ChatFlowSession
): Promise<{ endFlow: boolean }> {
  const actionType = step.actionType;
  const payload = (step.actionPayload || {}) as Record<string, unknown>;
  
  console.log(`[FlowProcessor] Executing action: ${actionType}`, payload);
  
  switch (actionType) {
    case "assign_agent":
      if (payload.userId) {
        await storage.updateConversation(conversation.id, {
          assignedToUserId: payload.userId as string,
        });
      }
      break;
      
    case "add_tag":
      if (payload.tagId) {
        try {
          await storage.addContactTag(contact.id, payload.tagId as string);
        } catch (error) {
          console.error(`[FlowProcessor] Error adding tag: ${error}`);
        }
      }
      break;
      
    case "set_status":
      if (payload.status) {
        await storage.updateConversation(conversation.id, {
          status: payload.status as string,
        });
      }
      break;
      
    case "end_flow":
      console.log(`[FlowProcessor] Ending flow for session: ${session.id}`);
      await storage.updateChatFlowSession(session.id, {
        status: "completed",
      });
      return { endFlow: true };
  }
  
  return { endFlow: false };
}

async function processStep(
  storage: IStorage,
  step: ChatFlowStep,
  conversation: Conversation,
  contact: Contact,
  session: ChatFlowSession
): Promise<{ responses: string[]; waitForInput: boolean; nextStepId: string | null }> {
  const responses: string[] = [];
  let waitForInput = false;
  let nextStepId: string | null = step.nextStepId || null;
  
  console.log(`[FlowProcessor] Processing step type: ${step.type}, id: ${step.id}`);
  
  switch (step.type) {
    case "message":
      if (step.message) {
        const message = replaceTemplateVariables(step.message, contact);
        responses.push(message);
      }
      break;
      
    case "menu":
      if (step.message) {
        const message = replaceTemplateVariables(step.message, contact);
        responses.push(message);
      }
      const menuOptions = (step.menuOptions || []) as MenuOption[];
      if (menuOptions.length > 0) {
        responses.push(formatMenuOptions(menuOptions));
      }
      waitForInput = true;
      break;
      
    case "input":
      if (step.message) {
        const message = replaceTemplateVariables(step.message, contact);
        responses.push(message);
      }
      waitForInput = true;
      break;
      
    case "action":
      const { endFlow } = await executeStepAction(storage, step, conversation, contact, session);
      if (endFlow) {
        return { responses, waitForInput: false, nextStepId: null };
      }
      break;
  }
  
  return { responses, waitForInput, nextStepId };
}

async function getFirstStep(storage: IStorage, flowId: string): Promise<ChatFlowStep | undefined> {
  const steps = await storage.getChatFlowSteps(flowId);
  if (!steps || steps.length === 0) return undefined;
  
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  return sorted[0];
}

async function shouldStartFlow(
  storage: IStorage,
  flow: ChatFlow,
  conversation: Conversation,
  messageContent: string
): Promise<boolean> {
  if (flow.triggerOnFirstMessage) {
    const messages = await storage.getMessages(conversation.id);
    const incomingMessages = messages.filter((m) => m.direction === "incoming");
    if (incomingMessages.length <= 1) {
      console.log(`[FlowProcessor] Flow ${flow.name} triggered on first message`);
      return true;
    }
  }
  
  if (flow.triggerKeywords && flow.triggerKeywords.length > 0) {
    const lowerContent = messageContent.toLowerCase().trim();
    for (const keyword of flow.triggerKeywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        console.log(`[FlowProcessor] Flow ${flow.name} triggered by keyword: ${keyword}`);
        return true;
      }
    }
  }
  
  return false;
}

export async function processFlowMessage(
  storage: IStorage,
  conversation: Conversation,
  message: Message,
  whatsappAccountId: string
): Promise<FlowProcessResult> {
  console.log(`[FlowProcessor] Processing message for conversation: ${conversation.id}`);
  
  const responses: string[] = [];
  
  if (message.direction !== "incoming") {
    console.log(`[FlowProcessor] Skipping non-incoming message`);
    return { processed: false, responses };
  }
  
  const contact = await storage.getContact(conversation.contactId);
  if (!contact) {
    console.log(`[FlowProcessor] Contact not found: ${conversation.contactId}`);
    return { processed: false, responses };
  }
  
  const messageContent = message.content || "";
  
  let session = await storage.getActiveSessionByConversation(conversation.id);
  
  if (session) {
    console.log(`[FlowProcessor] Found active session: ${session.id}, step: ${session.currentStepId}`);
    
    if (!session.currentStepId) {
      console.log(`[FlowProcessor] Session has no current step, ending flow`);
      await storage.updateChatFlowSession(session.id, { status: "completed" });
      return { processed: false, responses };
    }
    
    const currentStep = await storage.getChatFlowStep(session.currentStepId);
    if (!currentStep) {
      console.log(`[FlowProcessor] Current step not found: ${session.currentStepId}`);
      await storage.updateChatFlowSession(session.id, { status: "abandoned" });
      return { processed: false, responses };
    }
    
    let nextStepId: string | null = null;
    
    if (currentStep.type === "menu") {
      const menuOptions = (currentStep.menuOptions || []) as MenuOption[];
      const selectedOption = menuOptions.find(
        (opt) => opt.value === messageContent.trim()
      );
      
      if (!selectedOption) {
        console.log(`[FlowProcessor] Invalid menu option: ${messageContent}`);
        responses.push("Opção inválida. Por favor, escolha uma das opções disponíveis.");
        responses.push(formatMenuOptions(menuOptions));
        
        await storage.updateChatFlowSession(session.id, {
          lastInteractionAt: new Date(),
        } as any);
        
        return { processed: true, responses };
      }
      
      console.log(`[FlowProcessor] Menu option selected: ${selectedOption.value} - ${selectedOption.label}`);
      
      await applyMenuOptionActions(storage, selectedOption, conversation, contact);
      
      nextStepId = selectedOption.nextStepId || currentStep.nextStepId || null;
    } else if (currentStep.type === "input") {
      const inputField = currentStep.inputField || "input";
      const capturedData = (session.capturedData || {}) as Record<string, unknown>;
      capturedData[inputField] = messageContent;
      
      console.log(`[FlowProcessor] Captured input for field: ${inputField}`);
      
      await storage.updateChatFlowSession(session.id, {
        capturedData,
      } as any);
      
      nextStepId = currentStep.nextStepId || null;
    } else {
      nextStepId = currentStep.nextStepId || null;
    }
    
    if (nextStepId) {
      const nextStep = await storage.getChatFlowStep(nextStepId);
      if (nextStep) {
        const result = await processStep(storage, nextStep, conversation, contact, session);
        responses.push(...result.responses);
        
        if (result.waitForInput) {
          await storage.updateChatFlowSession(session.id, {
            currentStepId: nextStep.id,
            lastInteractionAt: new Date(),
          } as any);
        } else if (result.nextStepId) {
          await storage.updateChatFlowSession(session.id, {
            currentStepId: result.nextStepId,
            lastInteractionAt: new Date(),
          } as any);
          
          let continueProcessing = true;
          let currentStepIdToProcess = result.nextStepId;
          
          while (continueProcessing && currentStepIdToProcess) {
            const stepToProcess = await storage.getChatFlowStep(currentStepIdToProcess);
            if (!stepToProcess) break;
            
            const stepResult = await processStep(storage, stepToProcess, conversation, contact, session);
            responses.push(...stepResult.responses);
            
            if (stepResult.waitForInput) {
              await storage.updateChatFlowSession(session.id, {
                currentStepId: stepToProcess.id,
                lastInteractionAt: new Date(),
              } as any);
              continueProcessing = false;
            } else if (stepResult.nextStepId) {
              currentStepIdToProcess = stepResult.nextStepId;
              await storage.updateChatFlowSession(session.id, {
                currentStepId: currentStepIdToProcess,
                lastInteractionAt: new Date(),
              } as any);
            } else {
              await storage.updateChatFlowSession(session.id, {
                status: "completed",
                currentStepId: null,
              } as any);
              continueProcessing = false;
            }
          }
        } else {
          await storage.updateChatFlowSession(session.id, {
            status: "completed",
            currentStepId: null,
          } as any);
        }
      } else {
        console.log(`[FlowProcessor] Next step not found: ${nextStepId}`);
        await storage.updateChatFlowSession(session.id, {
          status: "completed",
          currentStepId: null,
        } as any);
      }
    } else {
      console.log(`[FlowProcessor] No next step, completing flow`);
      await storage.updateChatFlowSession(session.id, {
        status: "completed",
        currentStepId: null,
      } as any);
    }
    
    return { processed: responses.length > 0, responses };
  }
  
  console.log(`[FlowProcessor] No active session, checking for flows to start`);
  
  const flows = await storage.getChatFlows(conversation.companyId);
  const activeFlows = flows.filter((f) => f.isActive);
  
  if (activeFlows.length === 0) {
    console.log(`[FlowProcessor] No active flows found for company: ${conversation.companyId}`);
    return { processed: false, responses };
  }
  
  const matchingFlows = activeFlows.filter((flow) => {
    if (flow.whatsappAccountId && flow.whatsappAccountId !== whatsappAccountId) {
      return false;
    }
    return true;
  });
  
  for (const flow of matchingFlows) {
    const shouldStart = await shouldStartFlow(storage, flow, conversation, messageContent);
    
    if (shouldStart) {
      console.log(`[FlowProcessor] Starting flow: ${flow.name} (${flow.id})`);
      
      const firstStep = await getFirstStep(storage, flow.id);
      if (!firstStep) {
        console.log(`[FlowProcessor] Flow has no steps: ${flow.id}`);
        continue;
      }
      
      const newSession = await storage.createChatFlowSession({
        flowId: flow.id,
        conversationId: conversation.id,
        contactId: contact.id,
        currentStepId: firstStep.id,
        capturedData: {},
        status: "active",
      });
      
      console.log(`[FlowProcessor] Created new session: ${newSession.id}`);
      
      const result = await processStep(storage, firstStep, conversation, contact, newSession);
      responses.push(...result.responses);
      
      if (!result.waitForInput && result.nextStepId) {
        await storage.updateChatFlowSession(newSession.id, {
          currentStepId: result.nextStepId,
        } as any);
        
        let continueProcessing = true;
        let currentStepIdToProcess = result.nextStepId;
        
        while (continueProcessing && currentStepIdToProcess) {
          const stepToProcess = await storage.getChatFlowStep(currentStepIdToProcess);
          if (!stepToProcess) break;
          
          const stepResult = await processStep(storage, stepToProcess, conversation, contact, newSession);
          responses.push(...stepResult.responses);
          
          if (stepResult.waitForInput) {
            await storage.updateChatFlowSession(newSession.id, {
              currentStepId: stepToProcess.id,
            } as any);
            continueProcessing = false;
          } else if (stepResult.nextStepId) {
            currentStepIdToProcess = stepResult.nextStepId;
            await storage.updateChatFlowSession(newSession.id, {
              currentStepId: currentStepIdToProcess,
            } as any);
          } else {
            await storage.updateChatFlowSession(newSession.id, {
              status: "completed",
              currentStepId: null,
            } as any);
            continueProcessing = false;
          }
        }
      } else if (!result.waitForInput && !result.nextStepId) {
        await storage.updateChatFlowSession(newSession.id, {
          status: "completed",
          currentStepId: null,
        } as any);
      }
      
      return { processed: true, responses };
    }
  }
  
  console.log(`[FlowProcessor] No matching flow found for message`);
  return { processed: false, responses };
}
