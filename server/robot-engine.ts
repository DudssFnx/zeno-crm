import { db } from "./db";
import { robots, robotExecutions, conversations, contacts, messages, contactTags, tags, contactAttributes, scheduledMessages, robotConversationState } from "@shared/schema";
import type { Robot, RobotAction, RobotExecution, RobotTrigger, IntentRoute, Contact, Conversation } from "@shared/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { storage } from "./storage";

const logger = {
  info: (data: any, msg?: string) => console.log(`[RobotEngine] ${msg || ""}`, data),
  warn: (data: any, msg?: string) => console.warn(`[RobotEngine] ${msg || ""}`, data),
  error: (data: any, msg?: string) => console.error(`[RobotEngine] ${msg || ""}`, data),
  debug: (data: any, msg?: string) => console.log(`[RobotEngine] ${msg || ""}`, data),
};

interface ExecutionContext {
  conversationId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  whatsappAccountId: string;
  companyId: string;
  executedBy?: string;
  lastMessage?: string;
  messageContent?: string;
  actions?: RobotAction[];
}

interface AutoMessageContext {
  conversationId: string;
  contactId: string;
  companyId: string;
  whatsappAccountId: string;
  messageContent: string;
  messageDirection: "incoming" | "outgoing";
  isFirstMessage: boolean;
  contact: Contact;
  conversation: Conversation;
}

interface IntentMatch {
  route: IntentRoute;
  matchedKeywords: string[];
  confidence: number;
}

interface ExtractedContactData {
  name?: string;
  city?: string;
  state?: string;
  [key: string]: string | undefined;
}

interface RobotProgressData {
  executionId: string;
  robotId: string;
  robotName: string;
  conversationId: string;
  currentStep: number;
  totalSteps: number;
  currentActionType: string;
  currentActionLabel: string;
  status: "running" | "completed" | "failed" | "cancelled";
}

type OnProgressCallback = (data: RobotProgressData) => void;

class RobotEngine {
  private activeExecutions: Map<string, { cancelled: boolean }> = new Map();

  generateHumanizedDelay(baseMs: number = 800): number {
    const jitter = Math.random() * 400 - 200;
    return Math.max(400, baseMs + jitter);
  }

  generateFastDelay(): number {
    return Math.floor(Math.random() * 200) + 100;
  }

  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private delay(ms: number): Promise<void> {
    return this.sleep(ms);
  }

  private getNextTextAction(actions: RobotAction[], currentAction: RobotAction): RobotAction | undefined {
    const currentIndex = actions.findIndex(a => a.id === currentAction.id);
    if (currentIndex === -1) return undefined;
    
    for (let i = currentIndex + 1; i < actions.length; i++) {
      if (actions[i].type === "send_text" && actions[i].content) {
        return actions[i];
      }
    }
    return undefined;
  }

  private getActionLabel(type: string): string {
    const labels: Record<string, string> = {
      "send_text": "Enviando texto",
      "send_image": "Enviando imagem",
      "send_audio": "Enviando audio",
      "send_video": "Enviando video",
      "send_document": "Enviando documento",
      "simulate_typing": "Digitando...",
      "simulate_recording": "Gravando...",
      "delay": "Aguardando",
      "random_delay": "Aguardando tempo aleatorio",
      "add_tag": "Adicionando etiqueta",
      "remove_tag": "Removendo etiqueta",
      "remove_all_tags": "Removendo todas etiquetas",
      "add_attribute": "Adicionando atributo",
      "remove_attribute": "Removendo atributo",
      "remove_all_attributes": "Removendo todos atributos",
      "set_status": "Alterando status",
      "assign_agent": "Atribuindo atendente",
      "transfer": "Transferindo",
      "smart_typing": "Digitacao inteligente",
      "human_delay": "Pausa humanizada",
      "wait_response": "Aguardando resposta",
      "conditional": "Avaliando condicao",
      "ask_question": "Fazendo pergunta",
      "button_choice": "Enviando opcoes",
      "goto_robot": "Transferindo para robo",
      "webhook": "Executando webhook",
    };
    return labels[type] || type;
  }

  async executeRobot(
    robotId: string,
    context: ExecutionContext,
    sendMessage: (conversationId: string, content: string, mediaType?: string, mediaUrl?: string) => Promise<void>,
    sendPresence: (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => Promise<void>,
    onProgress?: OnProgressCallback
  ): Promise<{ success: boolean; error?: string }> {
    const robot = await db.select().from(robots).where(eq(robots.id, robotId)).limit(1);
    
    if (!robot[0]) {
      return { success: false, error: "Robô não encontrado" };
    }

    if (!robot[0].isActive) {
      return { success: false, error: "Robô desativado" };
    }

    const actions = robot[0].actions as RobotAction[];
    const flowEdges = (robot[0].flowEdges || []) as Array<{ id: string; source: string; target: string; sourceHandle?: string }>;
    
    if (actions.length === 0) {
      return { success: false, error: "Robô não possui ações configuradas" };
    }

    const [execution] = await db.insert(robotExecutions).values({
      robotId,
      conversationId: context.conversationId,
      executedBy: context.executedBy,
      status: "running",
      currentActionIndex: 0,
    }).returning();

    const executionId = execution.id;
    this.activeExecutions.set(executionId, { cancelled: false });

    logger.info({ robotId, executionId, conversationId: context.conversationId, hasFlowEdges: flowEdges.length > 0 }, "Iniciando execução do robô");

    const emitProgress = (currentStep: number, actionType: string, status: "running" | "completed" | "failed" | "cancelled") => {
      if (onProgress) {
        onProgress({
          executionId,
          robotId,
          robotName: robot[0].name,
          conversationId: context.conversationId,
          currentStep,
          totalSteps: actions.length,
          currentActionType: actionType,
          currentActionLabel: this.getActionLabel(actionType),
          status,
        });
      }
    };

    const enrichedContext: ExecutionContext = {
      ...context,
      actions,
    };

    try {
      // Se tem flowEdges, usa execução baseada em grafo
      if (flowEdges.length > 0) {
        return await this.executeRobotGraph(
          robot[0], actions, flowEdges, enrichedContext, executionId, 
          sendMessage, sendPresence, emitProgress
        );
      }
      
      // Fallback: execução linear para robôs sem flowEdges
      let skipUntilNextCondition = false;
      let executedConditionalBlock = false;
      let foundFirstCondition = false;
      let lastConditionWasTrue = false;
      
      for (let i = 0; i < actions.length; i++) {
        const controlState = this.activeExecutions.get(executionId);
        if (controlState?.cancelled) {
          await db.update(robotExecutions)
            .set({ status: "cancelled", completedAt: new Date() })
            .where(eq(robotExecutions.id, executionId));
          
          this.activeExecutions.delete(executionId);
          emitProgress(i + 1, actions[i].type, "cancelled");
          return { success: false, error: "Execução cancelada" };
        }

        const action = actions[i];
        
        if (action.type === "conditional" && executedConditionalBlock) {
          logger.debug({ actionId: action.id }, "Parando fluxo - já executou um bloco condicional com sucesso");
          break;
        }
        
        if (action.type === "conditional") {
          skipUntilNextCondition = false;
          foundFirstCondition = true;
          lastConditionWasTrue = false;
        }
        
        if (skipUntilNextCondition && action.type !== "conditional") {
          logger.debug({ actionId: action.id, actionType: action.type }, "Pulando ação (condição anterior falsa)");
          continue;
        }

        await db.update(robotExecutions)
          .set({ currentActionIndex: i })
          .where(eq(robotExecutions.id, executionId));

        emitProgress(i + 1, action.type, "running");
        const result = await this.executeAction(action, enrichedContext, sendMessage, sendPresence);
        
        if (action.type === "conditional") {
          if (result.conditionMet === false) {
            skipUntilNextCondition = true;
            lastConditionWasTrue = false;
            logger.debug({ actionId: action.id }, "Condição falsa - pulando ações até próxima condição");
          } else {
            skipUntilNextCondition = false;
            lastConditionWasTrue = true;
            logger.debug({ actionId: action.id }, "Condição verdadeira - executando bloco");
          }
        } else if (foundFirstCondition && lastConditionWasTrue && !skipUntilNextCondition) {
          executedConditionalBlock = true;
        }
        
        if (result.waitForResponse) {
          logger.info({ actionId: action.id, nextNodeId: result.nextNodeId }, "Fluxo pausado - aguardando resposta do cliente");
          
          await db.insert(robotConversationState).values({
            conversationId: context.conversationId,
            robotId: robotId,
            currentNodeId: result.nextNodeId || action.id,
            waitingForInput: true,
            isAwaitingResponse: true,
            lastRobotMessageAt: new Date(),
          }).onConflictDoUpdate({
            target: robotConversationState.conversationId,
            set: {
              robotId: robotId,
              currentNodeId: result.nextNodeId || action.id,
              waitingForInput: true,
              isAwaitingResponse: true,
              lastRobotMessageAt: new Date(),
              updatedAt: new Date(),
            }
          });
          
          await db.update(robotExecutions)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(robotExecutions.id, executionId));
          this.activeExecutions.delete(executionId);
          return { success: true };
        }
      }

      await db.update(robotExecutions)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(robotExecutions.id, executionId));

      this.activeExecutions.delete(executionId);
      emitProgress(actions.length, actions[actions.length - 1].type, "completed");
      logger.info({ robotId, executionId }, "Robô executado com sucesso");
      
      return { success: true };
    } catch (error: any) {
      await db.update(robotExecutions)
        .set({ status: "failed", error: error.message, completedAt: new Date() })
        .where(eq(robotExecutions.id, executionId));

      this.activeExecutions.delete(executionId);
      emitProgress(0, "", "failed");
      logger.error({ robotId, executionId, error: error.message }, "Erro ao executar robô");
      
      return { success: false, error: error.message };
    }
  }

  // Nova função: execução baseada em grafo usando flowEdges
  private async executeRobotGraph(
    robot: any,
    actions: RobotAction[],
    flowEdges: Array<{ id: string; source: string; target: string; sourceHandle?: string }>,
    context: ExecutionContext,
    executionId: string,
    sendMessage: (conversationId: string, content: string, mediaType?: string, mediaUrl?: string) => Promise<void>,
    sendPresence: (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => Promise<void>,
    emitProgress: (currentStep: number, actionType: string, status: "running" | "completed" | "failed" | "cancelled") => void
  ): Promise<{ success: boolean; error?: string }> {
    // Cria mapa de ações por ID
    const actionMap = new Map<string, RobotAction>();
    actions.forEach(a => actionMap.set(a.id, a));
    
    // Cria mapa de conexões: source -> { target, sourceHandle }
    const edgeMap = new Map<string, Array<{ target: string; sourceHandle?: string }>>();
    flowEdges.forEach(e => {
      const existing = edgeMap.get(e.source) || [];
      existing.push({ target: e.target, sourceHandle: e.sourceHandle });
      edgeMap.set(e.source, existing);
    });
    
    // Encontra o nó inicial (sem conexões entrando)
    const targetNodes = new Set(flowEdges.map(e => e.target));
    let startNode = actions.find(a => !targetNodes.has(a.id));
    if (!startNode && actions.length > 0) {
      startNode = actions[0];
    }
    
    if (!startNode) {
      return { success: false, error: "Não foi possível encontrar o nó inicial" };
    }
    
    logger.info({ startNodeId: startNode.id, startNodeType: startNode.type }, "Iniciando execução em grafo");
    
    let currentNode: RobotAction | undefined = startNode;
    let stepCount = 0;
    const maxSteps = 100; // Previne loops infinitos
    
    while (currentNode && stepCount < maxSteps) {
      stepCount++;
      
      const controlState = this.activeExecutions.get(executionId);
      if (controlState?.cancelled) {
        await db.update(robotExecutions)
          .set({ status: "cancelled", completedAt: new Date() })
          .where(eq(robotExecutions.id, executionId));
        this.activeExecutions.delete(executionId);
        emitProgress(stepCount, currentNode.type, "cancelled");
        return { success: false, error: "Execução cancelada" };
      }
      
      logger.debug({ nodeId: currentNode.id, nodeType: currentNode.type, step: stepCount }, "Executando nó");
      emitProgress(stepCount, currentNode.type, "running");
      
      const result = await this.executeAction(currentNode, context, sendMessage, sendPresence);
      
      // Se precisa aguardar resposta, para aqui
      if (result.waitForResponse) {
        logger.info({ nodeId: currentNode.id }, "Fluxo pausado - aguardando resposta");
        
        await db.insert(robotConversationState).values({
          conversationId: context.conversationId,
          robotId: robot.id,
          currentNodeId: result.nextNodeId || currentNode.id,
          waitingForInput: true,
          isAwaitingResponse: true,
          lastRobotMessageAt: new Date(),
        }).onConflictDoUpdate({
          target: robotConversationState.conversationId,
          set: {
            robotId: robot.id,
            currentNodeId: result.nextNodeId || currentNode.id,
            waitingForInput: true,
            isAwaitingResponse: true,
            lastRobotMessageAt: new Date(),
            updatedAt: new Date(),
          }
        });
        
        await db.update(robotExecutions)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(robotExecutions.id, executionId));
        this.activeExecutions.delete(executionId);
        return { success: true };
      }
      
      // Encontra próximo nó baseado nas conexões
      const outgoingEdges = edgeMap.get(currentNode.id) || [];
      
      if (outgoingEdges.length === 0) {
        // Sem conexões saindo - fim do fluxo
        logger.info({ nodeId: currentNode.id }, "Fim do fluxo - sem conexões saindo");
        break;
      }
      
      // Se for condicional, escolhe a saída correta baseada no resultado
      if (currentNode.type === "conditional") {
        const conditionMet = result.conditionMet;
        // Procura edge com sourceHandle correspondente
        const trueEdge = outgoingEdges.find(e => e.sourceHandle === "true" || e.sourceHandle === undefined || e.sourceHandle === null);
        const falseEdge = outgoingEdges.find(e => e.sourceHandle === "false");
        
        let nextEdge;
        if (conditionMet) {
          nextEdge = trueEdge;
          logger.debug({ nodeId: currentNode.id }, "Condição verdadeira - seguindo caminho true");
        } else {
          nextEdge = falseEdge;
          logger.debug({ nodeId: currentNode.id }, "Condição falsa - seguindo caminho false");
        }
        
        if (nextEdge) {
          currentNode = actionMap.get(nextEdge.target);
        } else {
          // Sem saída para este resultado - fim do fluxo
          logger.info({ nodeId: currentNode.id, conditionMet }, "Fim do fluxo - condição sem saída correspondente");
          break;
        }
      } else {
        // Não é condicional - segue a primeira conexão
        const nextEdge = outgoingEdges[0];
        currentNode = actionMap.get(nextEdge.target);
      }
      
      if (!currentNode) {
        logger.warn({ step: stepCount }, "Próximo nó não encontrado - fim do fluxo");
        break;
      }
    }
    
    if (stepCount >= maxSteps) {
      logger.warn({ robotId: robot.id }, "Limite de passos atingido - possível loop infinito");
    }
    
    await db.update(robotExecutions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(robotExecutions.id, executionId));
    
    this.activeExecutions.delete(executionId);
    emitProgress(stepCount, "completed", "completed");
    logger.info({ robotId: robot.id, executionId, steps: stepCount }, "Robô executado com sucesso (grafo)");
    
    return { success: true };
  }

  private async executeAction(
    action: RobotAction,
    context: ExecutionContext,
    sendMessage: (conversationId: string, content: string, mediaType?: string, mediaUrl?: string) => Promise<void>,
    sendPresence: (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => Promise<void>
  ): Promise<{ skip?: boolean; skipUntilCondition?: boolean; conditionMet?: boolean; waitForResponse?: boolean; nextNodeId?: string }> {
    const { type } = action;
    
    logger.debug({ actionType: type, actionId: action.id }, "Executando ação do robô");

    switch (type) {
      case "simulate_typing": {
        const duration = action.delayMs || this.generateHumanizedDelay(3000);
        await sendPresence(context.whatsappAccountId, context.contactPhone, "composing");
        await this.sleep(duration);
        await sendPresence(context.whatsappAccountId, context.contactPhone, "paused");
        break;
      }

      case "simulate_recording": {
        const duration = action.delayMs || this.generateHumanizedDelay(5000);
        await sendPresence(context.whatsappAccountId, context.contactPhone, "recording");
        await this.sleep(duration);
        await sendPresence(context.whatsappAccountId, context.contactPhone, "paused");
        break;
      }

      case "delay": {
        const delay = action.delayMs || this.generateHumanizedDelay();
        await this.sleep(delay);
        break;
      }

      case "random_delay": {
        // Tempo randômico entre 15 e 45 segundos para parecer mais natural
        const minDelay = 15000; // 15 segundos
        const maxDelay = 45000; // 45 segundos
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        logger.info({ randomDelay: randomDelay / 1000 }, "Aguardando tempo randomico");
        await this.sleep(randomDelay);
        break;
      }

      case "send_text": {
        logger.info({ actionContent: action.content }, "Executing send_text action");
        if (action.content) {
          const processedContent = this.processTemplateVariables(action.content, context);
          logger.info({ processedContent: processedContent.substring(0, 50) }, "Sending text message via robot");
          await sendMessage(context.conversationId, processedContent);
          await this.sleep(this.generateFastDelay());
          logger.info("Text message sent successfully");
        } else {
          logger.warn("send_text action has no content - skipping");
        }
        break;
      }

      case "send_image": {
        if (action.mediaUrl) {
          const caption = action.content ? this.processTemplateVariables(action.content, context) : "";
          await sendMessage(context.conversationId, caption, "image", action.mediaUrl);
          await this.sleep(this.generateFastDelay());
        }
        break;
      }

      case "send_audio": {
        logger.info({ mediaUrl: action.mediaUrl }, "Executing send_audio action");
        if (action.mediaUrl) {
          logger.info({ audioUrl: action.mediaUrl }, "Sending audio via robot");
          await sendMessage(context.conversationId, "", "audio", action.mediaUrl);
          await this.sleep(this.generateFastDelay());
          logger.info("Audio sent successfully");
        } else {
          logger.warn("send_audio action has no mediaUrl - skipping");
        }
        break;
      }

      case "send_video": {
        if (action.mediaUrl) {
          const caption = action.content ? this.processTemplateVariables(action.content, context) : "";
          await sendMessage(context.conversationId, caption, "video", action.mediaUrl);
          await this.sleep(this.generateFastDelay());
        }
        break;
      }

      case "send_document": {
        if (action.mediaUrl) {
          const fileName = action.fileName ? this.processTemplateVariables(action.fileName, context) : "document";
          await sendMessage(context.conversationId, fileName, "document", action.mediaUrl);
          await this.sleep(this.generateFastDelay());
        }
        break;
      }

      case "add_tag": {
        if (action.tagId) {
          const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
          if (conv) {
            const existing = await db.select().from(contactTags)
              .where(and(
                eq(contactTags.contactId, conv.contactId),
                eq(contactTags.tagId, action.tagId)
              ));
            
            if (existing.length === 0) {
              await db.insert(contactTags).values({
                contactId: conv.contactId,
                tagId: action.tagId,
              });
            }
          }
        }
        break;
      }

      case "remove_tag": {
        if (action.tagId) {
          const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
          if (conv) {
            await db.delete(contactTags).where(and(
              eq(contactTags.contactId, conv.contactId),
              eq(contactTags.tagId, action.tagId)
            ));
          }
        }
        break;
      }

      case "remove_all_tags": {
        const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
        if (conv) {
          await db.delete(contactTags).where(eq(contactTags.contactId, conv.contactId));
          logger.info({ contactId: conv.contactId }, "Todas as etiquetas removidas do contato");
        }
        break;
      }

      case "set_status": {
        if (action.status) {
          await db.update(conversations)
            .set({ status: action.status })
            .where(eq(conversations.id, context.conversationId));
        }
        break;
      }

      case "assign_agent": {
        if (action.agentId) {
          await db.update(conversations)
            .set({ assignedToUserId: action.agentId })
            .where(eq(conversations.id, context.conversationId));
        }
        break;
      }

      case "transfer": {
        logger.info({ conversationId: context.conversationId, departmentId: action.departmentId }, "Transferindo conversa");
        break;
      }

      case "add_attribute": {
        if (action.attributeId) {
          const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
          if (conv) {
            const [attr] = await db.select().from(contactAttributes).where(eq(contactAttributes.id, action.attributeId));
            if (attr) {
              const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
              if (contact) {
                const currentAttrs = contact.attributes || [];
                if (!currentAttrs.includes(attr.name)) {
                  await db.update(contacts)
                    .set({ attributes: [...currentAttrs, attr.name] })
                    .where(eq(contacts.id, conv.contactId));
                  logger.info({ contactId: conv.contactId, attribute: attr.name }, "Atributo adicionado ao contato");
                }
              }
            }
          }
        }
        break;
      }

      case "remove_attribute": {
        if (action.attributeId) {
          const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
          if (conv) {
            const [attr] = await db.select().from(contactAttributes).where(eq(contactAttributes.id, action.attributeId));
            if (attr) {
              const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
              if (contact) {
                const currentAttrs = contact.attributes || [];
                const newAttrs = currentAttrs.filter(a => a !== attr.name);
                await db.update(contacts)
                  .set({ attributes: newAttrs })
                  .where(eq(contacts.id, conv.contactId));
                logger.info({ contactId: conv.contactId, attribute: attr.name }, "Atributo removido do contato");
              }
            }
          }
        }
        break;
      }

      case "remove_all_attributes": {
        const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
        if (conv) {
          await db.update(contacts)
            .set({ attributes: [] })
            .where(eq(contacts.id, conv.contactId));
          logger.info({ contactId: conv.contactId }, "Todos os atributos removidos do contato");
        }
        break;
      }

      case "move_stage": {
        if (action.stageId) {
          await db.update(conversations)
            .set({ stageId: action.stageId, stageEnteredAt: new Date() })
            .where(eq(conversations.id, context.conversationId));
          logger.info({ conversationId: context.conversationId, stageId: action.stageId }, "Conversa movida para estagio");
        }
        break;
      }

      case "extract_data": {
        const extractionRule = action.extractionRule as any;
        if (extractionRule?.pattern && context.lastMessage) {
          try {
            const regex = new RegExp(extractionRule.pattern, "i");
            const match = context.lastMessage.match(regex);
            if (match) {
              const updateData: any = {};
              if (extractionRule.extractName && match[1]) {
                updateData.name = match[1].trim();
              }
              if (extractionRule.extractCity && match[2]) {
                updateData.city = match[2].trim();
              }
              if (extractionRule.extractState && match[3]) {
                updateData.state = match[3].trim();
              }
              if (Object.keys(updateData).length > 0) {
                const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
                if (conv) {
                  await db.update(contacts)
                    .set(updateData)
                    .where(eq(contacts.id, conv.contactId));
                  logger.info({ contactId: conv.contactId, data: updateData }, "Dados extraidos e atualizados no contato");
                }
              }
            }
          } catch (error) {
            logger.error({ error }, "Erro ao extrair dados com regex");
          }
        }
        break;
      }

      case "schedule_followup": {
        if (action.followupDelayMinutes && action.content) {
          const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
          if (conv) {
            const scheduledFor = new Date(Date.now() + action.followupDelayMinutes * 60 * 1000);
            const processedContent = this.processTemplateVariables(action.content, context);
            
            await db.insert(scheduledMessages).values({
              companyId: context.companyId,
              conversationId: context.conversationId,
              contactId: conv.contactId,
              whatsappAccountId: context.whatsappAccountId,
              content: processedContent,
              mediaUrl: null,
              mediaType: null,
              scheduledFor,
              status: "pending",
              createdBy: null,
            });
            logger.info({ scheduledFor, delayMinutes: action.followupDelayMinutes }, "Follow-up agendado");
          }
        }
        break;
      }

      case "smart_typing": {
        const nextAction = this.getNextTextAction(context.actions || [], action);
        if (nextAction && nextAction.content) {
          const charCount = nextAction.content.length;
          const msPerChar = 50 + Math.random() * 30;
          const typingTime = Math.min(Math.max(charCount * msPerChar, 1000), 8000);
          await sendPresence(context.whatsappAccountId, context.contactPhone, "composing");
          await this.delay(typingTime);
          await sendPresence(context.whatsappAccountId, context.contactPhone, "paused");
          logger.info({ charCount, typingTime: Math.round(typingTime) }, "Digitacao inteligente simulada");
        }
        break;
      }

      case "human_delay": {
        const minDelay = (action as any).minDelayMs || 1000;
        const maxDelay = (action as any).maxDelayMs || 3000;
        const jitter = Math.random();
        const actualDelay = minDelay + (maxDelay - minDelay) * jitter;
        await this.delay(actualDelay);
        logger.info({ minDelay, maxDelay, actualDelay: Math.round(actualDelay) }, "Pausa humana executada");
        break;
      }

      case "wait_response": {
        const nextNodeId = (action as any).nextNodeId || action.id;
        logger.info({ 
          timeout: (action as any).waitTimeoutSeconds || 60,
          fallback: (action as any).fallbackAction || "continue",
          nextNodeId
        }, "Aguardando resposta do cliente - pausando fluxo");
        return { waitForResponse: true, nextNodeId };
      }

      case "conditional": {
        const conditionType = (action as any).conditionType || "keyword";
        const conditionValue = (action as any).conditionValue || "";
        let conditionMet = false;

        // Usa messageContent (mensagem atual) ou lastMessage como fallback
        const messageToCheck = context.messageContent || context.lastMessage;
        
        if (conditionType === "keyword" && messageToCheck) {
          const normalizedMessage = this.normalizeText(messageToCheck);
          const normalizedKeyword = this.normalizeText(conditionValue);
          conditionMet = normalizedMessage.includes(normalizedKeyword);
          logger.debug({ messageToCheck, normalizedMessage, normalizedKeyword, conditionMet }, "Keyword condition check");
        } else if (conditionType === "has_tag" || conditionType === "no_tag") {
          const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
          if (conv) {
            const contactTagsList = await db.select().from(contactTags)
              .innerJoin(tags, eq(tags.id, contactTags.tagId))
              .where(eq(contactTags.contactId, conv.contactId));
            const hasTag = contactTagsList.some(t => t.tags.name.toLowerCase() === conditionValue.toLowerCase());
            conditionMet = conditionType === "has_tag" ? hasTag : !hasTag;
          }
        } else if (conditionType === "has_attribute") {
          const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
          if (conv) {
            const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
            if (contact?.attributes) {
              conditionMet = contact.attributes.some(a => a.toLowerCase() === conditionValue.toLowerCase());
            }
          }
        } else if (conditionType === "first_message") {
          // Verifica se é a primeira mensagem (sem tag FILA ainda)
          const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
          if (conv) {
            const contactTagsList = await db.select().from(contactTags)
              .innerJoin(tags, eq(tags.id, contactTags.tagId))
              .where(eq(contactTags.contactId, conv.contactId));
            conditionMet = !contactTagsList.some(t => t.tags.name.toLowerCase() === "fila");
          }
        }

        logger.info({ conditionType, conditionValue, conditionMet }, "Condicao avaliada");
        return { conditionMet };
      }

      case "ask_question": {
        if (action.content) {
          const processedContent = this.processTemplateVariables(action.content, context);
          await sendPresence(context.whatsappAccountId, context.contactPhone, "composing");
          await this.delay(1500);
          await sendMessage(context.conversationId, processedContent);
          await sendPresence(context.whatsappAccountId, context.contactPhone, "paused");
          logger.info({ 
            variableName: (action as any).variableName,
            timeout: (action as any).waitTimeoutSeconds || 60
          }, "Pergunta enviada - aguardando resposta");
          return { waitForResponse: true, nextNodeId: action.id };
        }
        break;
      }

      case "button_choice": {
        if (action.content) {
          const buttons = (action as any).buttons || [];
          let buttonMessage = this.processTemplateVariables(action.content, context);
          if (buttons.length > 0) {
            buttonMessage += "\n\n";
            buttons.forEach((btn: string, idx: number) => {
              buttonMessage += `*${idx + 1}* - ${btn}\n`;
            });
          }
          await sendPresence(context.whatsappAccountId, context.contactPhone, "composing");
          await this.delay(1500);
          await sendMessage(context.conversationId, buttonMessage);
          await sendPresence(context.whatsappAccountId, context.contactPhone, "paused");
          logger.info({ buttons, variableName: (action as any).variableName }, "Botoes enviados - aguardando escolha");
          return { waitForResponse: true, nextNodeId: action.id };
        }
        break;
      }

      case "goto_robot": {
        const gotoRobotId = (action as any).gotoRobotId;
        if (gotoRobotId) {
          logger.info({ gotoRobotId }, "Transferindo para outro robo");
        }
        break;
      }

      case "webhook": {
        const webhookUrl = (action as any).webhookUrl;
        const webhookMethod = (action as any).webhookMethod || "POST";
        if (webhookUrl) {
          try {
            const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
            const [contact] = conv ? await db.select().from(contacts).where(eq(contacts.id, conv.contactId)) : [null];
            
            const payload = {
              conversationId: context.conversationId,
              contactId: context.contactId,
              contactName: context.contactName,
              contactPhone: context.contactPhone,
              companyId: context.companyId,
              lastMessage: context.lastMessage,
              timestamp: new Date().toISOString(),
            };
            
            const response = await fetch(webhookUrl, {
              method: webhookMethod,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            
            logger.info({ webhookUrl, status: response.status }, "Webhook executado");
          } catch (error: any) {
            logger.error({ webhookUrl, error: error.message }, "Erro ao executar webhook");
          }
        }
        break;
      }

      case "no_attribute": {
        const [conv] = await db.select().from(conversations).where(eq(conversations.id, context.conversationId));
        if (conv) {
          const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
          const conditionValue = (action as any).conditionValue || "";
          const conditionMet = !contact?.attributes?.some(a => a.toLowerCase() === conditionValue.toLowerCase());
          return { conditionMet };
        }
        break;
      }

      default:
        logger.warn({ actionType: type }, "Tipo de ação desconhecido");
    }
    
    return {};
  }

  private processTemplateVariables(content: string, context: ExecutionContext): string {
    // Variações de período do dia (baseado no horário atual)
    const periodoVariacoes = [
      "um bom dia",
      "bom dia",
      "um boom dia",
      "um ótimo dia",
      "um excelente dia",
      "um belo dia",
      "um ótimo bom dia",
      "um dia abençoado",
      "um dia incrível",
      "um dia produtivo"
    ];
    
    const periodoTardeVariacoes = [
      "uma boa tarde",
      "boa tarde",
      "uma ótima tarde",
      "uma excelente tarde",
      "uma tarde abençoada",
      "uma tarde incrível",
      "uma tarde produtiva"
    ];
    
    const periodoNoiteVariacoes = [
      "uma boa noite",
      "boa noite",
      "uma ótima noite",
      "uma excelente noite",
      "uma noite abençoada",
      "uma noite tranquila"
    ];
    
    // Variações de saudação
    const saudacaoVariacoes = [
      "Olá, tudo bem?",
      "Oi, tudo bem?",
      "Olá, tudo bem com você?",
      "Oi, tudo bem por aí?",
      "Oi, tudo certo?",
      "Olá, tudo certo?"
    ];
    
    // Determinar período do dia
    const hora = new Date().getHours();
    let periodoVariacao: string[];
    if (hora >= 5 && hora < 12) {
      periodoVariacao = periodoVariacoes;
    } else if (hora >= 12 && hora < 18) {
      periodoVariacao = periodoTardeVariacoes;
    } else {
      periodoVariacao = periodoNoiteVariacoes;
    }
    
    // Selecionar variação aleatória
    const periodoDoDia = periodoVariacao[Math.floor(Math.random() * periodoVariacao.length)];
    const saudacao = saudacaoVariacoes[Math.floor(Math.random() * saudacaoVariacoes.length)];
    
    return content
      .replace(/\{\{nome\}\}/gi, context.contactName)
      .replace(/\{\{telefone\}\}/gi, context.contactPhone)
      .replace(/\{\{primeiro_nome\}\}/gi, context.contactName.split(" ")[0] || context.contactName)
      .replace(/\{\{periodo_do_dia\}\}/gi, periodoDoDia)
      .replace(/\{\{saudacao\}\}/gi, saudacao);
  }

  cancelExecution(executionId: string): boolean {
    const state = this.activeExecutions.get(executionId);
    if (state) {
      state.cancelled = true;
      return true;
    }
    return false;
  }

  async getActiveExecutions(conversationId: string): Promise<RobotExecution[]> {
    return db.select()
      .from(robotExecutions)
      .where(and(
        eq(robotExecutions.conversationId, conversationId),
        eq(robotExecutions.status, "running")
      ));
  }

  async processIncomingMessage(
    context: AutoMessageContext,
    sendMessage: (conversationId: string, content: string, mediaType?: string, mediaUrl?: string) => Promise<void>,
    sendPresence: (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => Promise<void>
  ): Promise<void> {
    logger.info({ conversationId: context.conversationId }, "Processing incoming message for automatic robots");

    try {
      const allRobots = await db.select().from(robots)
        .where(and(
          eq(robots.companyId, context.companyId),
          eq(robots.isActive, true),
          eq(robots.isAutomatic, true)
        ))
        .orderBy(desc(robots.priority));

      if (allRobots.length === 0) {
        logger.debug({}, "No automatic robots configured");
        return;
      }

      for (const robot of allRobots) {
        if (robot.whatsappAccountId && robot.whatsappAccountId !== context.whatsappAccountId) {
          continue;
        }

        const shouldTrigger = await this.checkTriggers(robot, context);
        if (shouldTrigger) {
          logger.info({ robotId: robot.id, robotName: robot.name }, "Triggering automatic robot");
          await this.executeAutomaticRobot(robot, context, sendMessage, sendPresence);

          if (robot.stopOnMatch) {
            logger.debug({}, "Stop on match - skipping remaining robots");
            break;
          }
        }
      }
    } catch (error) {
      logger.error({ error }, "Error processing incoming message for robots");
    }
  }

  // Normalizar texto: remover acentos, pontuação e converter para minúsculo
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .replace(/[^\w\s]/g, "") // Remove pontuação
      .trim();
  }

  private async checkTriggers(robot: Robot, context: AutoMessageContext): Promise<boolean> {
    // Robôs manuais não devem ser processados automaticamente
    if (!robot.isAutomatic) {
      return false;
    }

    const triggers = (robot.triggers as RobotTrigger[]) || [];

    if (triggers.length === 0) {
      return false;
    }

    for (const trigger of triggers) {
      switch (trigger.type) {
        case "first_message":
          // Primeira mensagem do contato (novo contato)
          if (context.isFirstMessage) return true;
          break;

        case "first_message_of_day":
          // Primeira mensagem do dia (mesmo contato, novo dia)
          if (await this.isFirstMessageOfDay(context)) return true;
          break;

        case "any_message":
          // Qualquer mensagem recebida
          if (context.messageDirection === "incoming") return true;
          break;

        case "keyword":
          // Mensagem contém palavras-chave específicas
          if (trigger.keywords && trigger.keywords.length > 0) {
            // Normalizar mensagem: remover acentos, pontuação e converter para minúsculo
            const messageNormalized = this.normalizeText(context.messageContent);
            const matched = trigger.keywords.some(kw => {
              const kwNormalized = this.normalizeText(kw);
              // Match exato para números (1, 2, 3, etc) ou parcial para palavras
              if (/^\d+$/.test(kwNormalized)) {
                // Para números, aceitar variações como "1", "1.", "1,", "1!", etc
                const words = messageNormalized.split(/\s+/);
                return words.some(w => this.normalizeText(w) === kwNormalized);
              }
              return messageNormalized.includes(kwNormalized);
            });
            if (matched) return true;
          }
          break;

        case "response":
          // Qualquer resposta do cliente (não é primeira mensagem)
          if (context.messageDirection === "incoming" && !context.isFirstMessage) return true;
          break;

        case "manual":
          // Gatilho manual - não dispara automaticamente
          break;

        case "no_response":
          // Tratado pelo scheduler, não aqui
          break;

        case "scheduled":
          // Tratado pelo scheduler, não aqui
          break;
      }
    }

    return false;
  }

  private async isFirstMessageOfDay(context: AutoMessageContext): Promise<boolean> {
    try {
      // Buscar a última mensagem incoming do contato antes de hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const lastInboundDate = context.conversation.lastInboundAt;
      if (!lastInboundDate) {
        // Se não tem lastInboundAt, é a primeira mensagem
        return true;
      }

      const lastInbound = new Date(lastInboundDate);
      lastInbound.setHours(0, 0, 0, 0);

      // Se a última mensagem foi antes de hoje, é primeira do dia
      return lastInbound.getTime() < today.getTime();
    } catch (error) {
      logger.error({ error }, "Error checking first message of day");
      return false;
    }
  }

  private async executeAutomaticRobot(
    robot: Robot,
    context: AutoMessageContext,
    sendMessage: (conversationId: string, content: string, mediaType?: string, mediaUrl?: string) => Promise<void>,
    sendPresence: (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => Promise<void>
  ): Promise<void> {
    const intentRoutes = (robot.intentRoutes as IntentRoute[]) || [];
    if (intentRoutes.length > 0) {
      const intentMatch = this.detectIntent(context.messageContent, intentRoutes);
      if (intentMatch) {
        logger.info({ intent: intentMatch.route.name, confidence: intentMatch.confidence }, "Detected intent");
        await this.applyIntentRoute(intentMatch.route, context, sendMessage, sendPresence);
      }
    }

    const extractionRules = (robot.dataExtractionRules as any[]) || [];
    for (const rule of extractionRules) {
      const extracted = this.extractContactData(context.messageContent, rule);
      if (Object.keys(extracted).length > 0) {
        await this.updateContactWithExtractedData(context.contactId, extracted);
      }
    }

    // Usa executeRobot para respeitar flowEdges (execução em grafo)
    const execContext: ExecutionContext = {
      conversationId: context.conversationId,
      contactId: context.contactId,
      contactName: context.contact.name,
      contactPhone: context.contact.phoneNumber,
      whatsappAccountId: context.whatsappAccountId,
      companyId: context.companyId,
      messageContent: context.messageContent,
    };

    // Chamar executeRobot que usará executeRobotGraph se houver flowEdges
    await this.executeRobot(robot.id, execContext, sendMessage, sendPresence);

    const scheduledMsgs = (robot.scheduledMessages as any[]) || [];
    for (const scheduled of scheduledMsgs) {
      await this.scheduleFollowup(scheduled, context);
    }
  }

  private detectIntent(messageContent: string, routes: IntentRoute[]): IntentMatch | null {
    const messageLC = messageContent.toLowerCase();
    let bestMatch: IntentMatch | null = null;
    let maxMatches = 0;

    for (const route of routes) {
      const matchedKeywords = route.keywords.filter(kw =>
        messageLC.includes(kw.toLowerCase())
      );

      if (matchedKeywords.length > maxMatches) {
        maxMatches = matchedKeywords.length;
        bestMatch = {
          route,
          matchedKeywords,
          confidence: matchedKeywords.length / route.keywords.length,
        };
      }
    }

    return bestMatch;
  }

  private async applyIntentRoute(
    route: IntentRoute,
    context: AutoMessageContext,
    sendMessage: (conversationId: string, content: string, mediaType?: string, mediaUrl?: string) => Promise<void>,
    sendPresence: (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => Promise<void>
  ): Promise<void> {
    if (route.tagId) {
      const existing = await db.select().from(contactTags)
        .where(and(
          eq(contactTags.contactId, context.contactId),
          eq(contactTags.tagId, route.tagId)
        ));
      if (existing.length === 0) {
        await db.insert(contactTags).values({
          contactId: context.contactId,
          tagId: route.tagId,
        });
      }
      logger.info({ tagId: route.tagId }, "Added tag to contact via intent route");
    }

    if (route.stageId) {
      await db.update(conversations)
        .set({ stageId: route.stageId, stageEnteredAt: new Date() })
        .where(eq(conversations.id, context.conversationId));
      logger.info({ stageId: route.stageId }, "Moved conversation to stage via intent route");
    }

    if (route.agentId) {
      await db.update(conversations)
        .set({ assignedToUserId: route.agentId, status: "open" })
        .where(eq(conversations.id, context.conversationId));
      logger.info({ agentId: route.agentId }, "Assigned conversation to agent via intent route");
    }

    if (route.responseMessage) {
      const processedMessage = this.processAutoTemplateVariables(route.responseMessage, context);
      await sendPresence(context.whatsappAccountId, context.contact.phoneNumber, "composing");
      await this.sleep(this.generateHumanizedDelay(1500));
      await sendPresence(context.whatsappAccountId, context.contact.phoneNumber, "paused");
      await sendMessage(context.conversationId, processedMessage);
      logger.info({}, "Sent intent response message");
    }
  }

  private extractContactData(messageContent: string, rule: any): ExtractedContactData {
    const result: ExtractedContactData = {};

    try {
      const regex = new RegExp(rule.pattern, "i");
      const match = messageContent.match(regex);

      if (match) {
        if (rule.extractName && match[1]) {
          result.name = match[1].trim();
        }
        if (rule.extractCity && match[2]) {
          result.city = match[2].trim();
        }
        if (rule.extractState && match[3]) {
          result.state = match[3].trim();
        }

        if (rule.customFields) {
          for (const field of rule.customFields) {
            if (match[field.groupIndex]) {
              result[field.fieldName] = match[field.groupIndex].trim();
            }
          }
        }
      }
    } catch (error) {
      logger.error({ error }, "Error in data extraction");
    }

    return result;
  }

  private async updateContactWithExtractedData(contactId: string, data: ExtractedContactData): Promise<void> {
    const updateData: any = {};

    if (data.name) updateData.name = data.name;
    if (data.city) updateData.city = data.city;
    if (data.state) updateData.state = data.state;

    if (Object.keys(updateData).length > 0) {
      await db.update(contacts)
        .set(updateData)
        .where(eq(contacts.id, contactId));
      logger.info({ contactId, data: updateData }, "Updated contact with extracted data");
    }
  }

  private async scheduleFollowup(scheduled: any, context: AutoMessageContext): Promise<void> {
    const scheduledFor = new Date(Date.now() + scheduled.delayMinutes * 60 * 1000);

    await db.insert(scheduledMessages).values({
      companyId: context.companyId,
      conversationId: context.conversationId,
      contactId: context.contactId,
      whatsappAccountId: context.whatsappAccountId,
      content: this.processAutoTemplateVariables(scheduled.message, context),
      mediaUrl: scheduled.mediaUrl || null,
      mediaType: scheduled.mediaType || null,
      scheduledFor,
      status: "pending",
      createdBy: null,
    });

    logger.info({ scheduledFor, delayMinutes: scheduled.delayMinutes }, "Scheduled followup message");
  }

  private processAutoTemplateVariables(content: string, context: AutoMessageContext): string {
    const contact = context.contact;
    const hora = new Date().getHours();

    const periodoVariacoes = hora >= 5 && hora < 12
      ? ["bom dia", "um bom dia", "um ótimo dia"]
      : hora >= 12 && hora < 18
        ? ["boa tarde", "uma boa tarde", "uma ótima tarde"]
        : ["boa noite", "uma boa noite", "uma ótima noite"];

    const saudacaoVariacoes = [
      "Olá, tudo bem?",
      "Oi, tudo bem?",
      "Olá, como vai?",
    ];

    const periodoDoDia = periodoVariacoes[Math.floor(Math.random() * periodoVariacoes.length)];
    const saudacao = saudacaoVariacoes[Math.floor(Math.random() * saudacaoVariacoes.length)];

    return content
      .replace(/\{\{nome\}\}/gi, contact.name || "")
      .replace(/\{\{telefone\}\}/gi, contact.phoneNumber || "")
      .replace(/\{\{primeiro_nome\}\}/gi, contact.name?.split(" ")[0] || contact.name || "")
      .replace(/\{\{cidade\}\}/gi, contact.city || "")
      .replace(/\{\{estado\}\}/gi, contact.state || "")
      .replace(/\{\{periodo_do_dia\}\}/gi, periodoDoDia)
      .replace(/\{\{saudacao\}\}/gi, saudacao);
  }

  getDefaultIntentRoutes(): IntentRoute[] {
    return [
      {
        id: "comercial",
        name: "Comercial",
        keywords: ["preço", "valor", "atacado", "comprar", "orçamento", "cotação", "quanto custa"],
        responseMessage: "Você foi direcionado para o setor Comercial. Um atendente irá te responder em breve.",
      },
      {
        id: "financeiro",
        name: "Financeiro",
        keywords: ["pedido", "nota", "boleto", "pagamento", "pix", "fatura", "cobrança"],
        responseMessage: "Você foi direcionado para o setor Financeiro. Um atendente irá te responder em breve.",
      },
      {
        id: "posvenda",
        name: "Pós-venda",
        keywords: ["troca", "problema", "defeito", "garantia", "devolução", "reclamação", "erro"],
        responseMessage: "Você foi direcionado para o setor de Pós-venda. Um atendente irá te responder em breve.",
      },
      {
        id: "saudacao",
        name: "Saudação",
        keywords: ["oi", "olá", "bom dia", "boa tarde", "boa noite", "hey", "eae"],
        responseMessage: "Olá! Seja bem-vindo! Como posso te ajudar hoje?",
      },
    ];
  }
}

export const robotEngine = new RobotEngine();
