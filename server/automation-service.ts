import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { whatsappBaileys } from "./whatsapp-baileys";
import type {
  ChatFlow,
  ChatFlowNode,
  ChatFlowEdge,
  ChatFlowSession,
  Contact,
  Conversation,
  Message,
  User,
  Tag,
} from "@shared/schema";

type NodeConfig = Record<string, unknown>;

interface ExecuteNodeResult {
  nextNodeId: string | null;
  shouldWait: boolean;
}

class AutomationService {
  private io: SocketServer | null = null;

  setSocketServer(socketServer: SocketServer) {
    this.io = socketServer;
    console.log("[AutomationService] Socket.IO server connected");
  }

  private emitEvent(companyId: string, event: string, data: Record<string, unknown>) {
    if (this.io) {
      const companyRoom = `company:${companyId}`;
      this.io.to(companyRoom).emit(event, data);
      console.log(`[AutomationService] Emitted ${event} to ${companyRoom}`);
    }
  }

  async startFlow(
    flowId: string,
    conversationId: string,
    contactId: string
  ): Promise<ChatFlowSession | null> {
    console.log(`[AutomationService] Starting flow ${flowId} for conversation ${conversationId}`);

    try {
      const flow = await storage.getChatFlow(flowId);
      if (!flow || !flow.isActive || flow.status !== "published") {
        console.log(`[AutomationService] Flow ${flowId} is not active or published`);
        return null;
      }

      if (!flow.startNodeId) {
        console.log(`[AutomationService] Flow ${flowId} has no start node`);
        return null;
      }

      const existingSession = await storage.getActiveSessionByConversation(conversationId);
      if (existingSession) {
        console.log(`[AutomationService] Active session already exists for conversation ${conversationId}`);
        return existingSession;
      }

      const session = await storage.createChatFlowSession({
        flowId,
        conversationId,
        contactId,
        currentNodeId: flow.startNodeId,
        variables: {},
        state: "active",
      });

      console.log(`[AutomationService] Created session ${session.id}`);

      const conversation = await storage.getConversation(conversationId);
      if (conversation) {
        this.emitEvent(conversation.companyId, "automation_started", {
          sessionId: session.id,
          flowId,
          conversationId,
          contactId,
        });
      }

      const startNode = await storage.getChatFlowNode(flow.startNodeId);
      if (startNode) {
        await this.runFlowLoop(session, startNode);
      }

      return session;
    } catch (error) {
      console.error(`[AutomationService] Error starting flow:`, error);
      return null;
    }
  }

  async processMessage(conversationId: string, message: Message): Promise<boolean> {
    console.log(`[AutomationService] Processing message for conversation ${conversationId}`);

    try {
      if (message.direction !== "incoming") {
        return false;
      }

      const session = await storage.getActiveSessionByConversation(conversationId);
      if (!session) {
        console.log(`[AutomationService] No active session for conversation ${conversationId}`);
        return false;
      }

      if (session.state !== "waiting_input") {
        console.log(`[AutomationService] Session ${session.id} is not waiting for input (state: ${session.state})`);
        return false;
      }

      if (!session.currentNodeId) {
        console.log(`[AutomationService] Session ${session.id} has no current node`);
        return false;
      }

      const currentNode = await storage.getChatFlowNode(session.currentNodeId);
      if (!currentNode) {
        console.log(`[AutomationService] Current node not found: ${session.currentNodeId}`);
        return false;
      }

      const inputValue = message.content || "";
      const config = (currentNode.config || {}) as NodeConfig;

      if (currentNode.type === "ASK_INPUT") {
        const variableName = config.variableName as string || "input";
        const variables = { ...(session.variables as Record<string, unknown> || {}), [variableName]: inputValue };

        await storage.updateChatFlowSession(session.id, {
          variables,
          state: "active",
          lastInteractionAt: new Date(),
        });

        const updatedSession = await storage.getChatFlowSession(session.id);
        if (!updatedSession) return false;

        const nextNodeId = await this.findNextNode(updatedSession, currentNode, inputValue);
        if (nextNodeId) {
          const nextNode = await storage.getChatFlowNode(nextNodeId);
          if (nextNode) {
            await storage.updateChatFlowSession(session.id, { currentNodeId: nextNodeId });
            const refreshedSession = await storage.getChatFlowSession(session.id);
            if (refreshedSession) {
              await this.runFlowLoop(refreshedSession, nextNode);
            }
          }
        } else {
          await this.stopSession(session.id);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error(`[AutomationService] Error processing message:`, error);
      return false;
    }
  }

  private async runFlowLoop(session: ChatFlowSession, startNode: ChatFlowNode): Promise<void> {
    let currentSession = session;
    let currentNode: ChatFlowNode | null = startNode;

    while (currentNode) {
      console.log(`[AutomationService] Executing node ${currentNode.id} (${currentNode.type})`);

      const result = await this.executeNode(currentSession, currentNode);

      const conversation = await storage.getConversation(currentSession.conversationId);
      if (conversation) {
        this.emitEvent(conversation.companyId, "automation_step", {
          sessionId: currentSession.id,
          nodeId: currentNode.id,
          nodeType: currentNode.type,
        });
      }

      if (result.shouldWait) {
        console.log(`[AutomationService] Session ${currentSession.id} is now waiting for input`);
        break;
      }

      if (!result.nextNodeId) {
        console.log(`[AutomationService] No next node, ending flow`);
        await this.stopSession(currentSession.id);
        break;
      }

      const nextNode = await storage.getChatFlowNode(result.nextNodeId);
      if (!nextNode) {
        console.log(`[AutomationService] Next node not found: ${result.nextNodeId}`);
        await this.stopSession(currentSession.id);
        break;
      }

      await storage.updateChatFlowSession(currentSession.id, {
        currentNodeId: result.nextNodeId,
        lastInteractionAt: new Date(),
      });

      const updatedSession = await storage.getChatFlowSession(currentSession.id);
      if (!updatedSession) break;

      currentSession = updatedSession;
      currentNode = nextNode;
    }
  }

  async executeNode(session: ChatFlowSession, node: ChatFlowNode): Promise<ExecuteNodeResult> {
    const config = (node.config || {}) as NodeConfig;

    try {
      switch (node.type) {
        case "SEND_TEXT":
          return await this.handleSendText(session, config);

        case "ASK_INPUT":
          return await this.handleAskInput(session, config);

        case "CONDITION":
          return await this.handleCondition(session, node, config);

        case "SET_TAG":
          return await this.handleSetTag(session, config);

        case "MOVE_STAGE":
          return await this.handleMoveStage(session, config);

        case "ASSIGN_QUEUE":
          return await this.handleAssignQueue(session, config);

        case "ASSIGN_AGENT":
          return await this.handleAssignAgent(session, config);

        case "SEND_MEDIA":
          return await this.handleSendMedia(session, config);

        case "HANDOFF_TO_HUMAN":
          return await this.handleHandoffToHuman(session, node);

        case "END":
          return await this.handleEnd(session);

        default:
          console.log(`[AutomationService] Unknown node type: ${node.type}`);
          return { nextNodeId: await this.findNextNode(session, node), shouldWait: false };
      }
    } catch (error) {
      console.error(`[AutomationService] Error executing node ${node.id}:`, error);
      await this.stopSession(session.id);
      return { nextNodeId: null, shouldWait: false };
    }
  }

  async findNextNode(
    session: ChatFlowSession,
    currentNode: ChatFlowNode,
    inputValue?: string
  ): Promise<string | null> {
    try {
      const edges = await storage.getOutgoingEdges(currentNode.id);
      if (!edges || edges.length === 0) {
        return null;
      }

      const sortedEdges = [...edges].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      if (currentNode.type === "CONDITION") {
        for (const edge of sortedEdges) {
          const condition = edge.condition as Record<string, unknown> | null;
          if (!condition) continue;

          const matches = this.evaluateEdgeCondition(session, condition, inputValue);
          if (matches) {
            return edge.toNodeId;
          }
        }
        return sortedEdges[sortedEdges.length - 1]?.toNodeId || null;
      }

      if (currentNode.type === "ASK_INPUT" && inputValue !== undefined) {
        for (const edge of sortedEdges) {
          const condition = edge.condition as Record<string, unknown> | null;
          if (condition && condition.value) {
            if (String(condition.value).toLowerCase() === inputValue.toLowerCase()) {
              return edge.toNodeId;
            }
          }
        }
      }

      return sortedEdges[0]?.toNodeId || null;
    } catch (error) {
      console.error(`[AutomationService] Error finding next node:`, error);
      return null;
    }
  }

  private evaluateEdgeCondition(
    session: ChatFlowSession,
    condition: Record<string, unknown>,
    inputValue?: string
  ): boolean {
    const variables = (session.variables || {}) as Record<string, unknown>;
    const variable = condition.variable as string;
    const operator = condition.operator as string;
    const conditionValue = String(condition.value || "");

    let actualValue = variable === "_input" ? inputValue : String(variables[variable] || "");
    actualValue = actualValue || "";

    switch (operator) {
      case "equals":
        return actualValue.toLowerCase() === conditionValue.toLowerCase();
      case "contains":
        return actualValue.toLowerCase().includes(conditionValue.toLowerCase());
      case "startsWith":
        return actualValue.toLowerCase().startsWith(conditionValue.toLowerCase());
      case "endsWith":
        return actualValue.toLowerCase().endsWith(conditionValue.toLowerCase());
      case "greaterThan":
        return Number(actualValue) > Number(conditionValue);
      case "lessThan":
        return Number(actualValue) < Number(conditionValue);
      default:
        return false;
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    console.log(`[AutomationService] Stopping session ${sessionId}`);

    try {
      const session = await storage.getChatFlowSession(sessionId);
      if (!session) return;

      await storage.updateChatFlowSession(sessionId, {
        state: "ended",
        completedAt: new Date(),
      });

      const conversation = await storage.getConversation(session.conversationId);
      if (conversation) {
        this.emitEvent(conversation.companyId, "automation_ended", {
          sessionId,
          conversationId: session.conversationId,
        });
      }
    } catch (error) {
      console.error(`[AutomationService] Error stopping session:`, error);
    }
  }

  async handoffToHuman(session: ChatFlowSession, node: ChatFlowNode): Promise<void> {
    const config = (node.config || {}) as NodeConfig;

    try {
      await storage.updateChatFlowSession(session.id, {
        state: "handoff",
        completedAt: new Date(),
      });

      const assignToUserId = config.assignToUserId as string | undefined;
      if (assignToUserId) {
        await storage.updateConversation(session.conversationId, {
          assignedToUserId: assignToUserId,
        });
      }

      const handoffMessage = config.message as string | undefined;
      if (handoffMessage) {
        const conversation = await storage.getConversation(session.conversationId);
        const contact = await storage.getContact(session.contactId);
        if (conversation && contact) {
          const processedMessage = await this.replaceTemplateVariables(handoffMessage, contact, conversation);
          const account = await storage.getWhatsappAccount(conversation.whatsappAccountId);
          if (account) {
            await whatsappBaileys.sendMessage(conversation.whatsappAccountId, contact.phoneNumber, processedMessage);
          }
        }
      }

      const conversation = await storage.getConversation(session.conversationId);
      if (conversation) {
        this.emitEvent(conversation.companyId, "automation_handoff", {
          sessionId: session.id,
          conversationId: session.conversationId,
          contactId: session.contactId,
          assignedToUserId: assignToUserId,
        });
      }
    } catch (error) {
      console.error(`[AutomationService] Error in handoff:`, error);
    }
  }

  async checkTriggers(
    companyId: string,
    conversationId: string,
    messageText: string,
    isFirstMessage: boolean
  ): Promise<ChatFlow | null> {
    console.log(`[AutomationService] Checking triggers for conversation ${conversationId}`);

    try {
      const flows = await storage.getChatFlows(companyId);
      const activeFlows = flows.filter(f => f.isActive && f.status === "published");

      const conversation = await storage.getConversation(conversationId);

      for (const flow of activeFlows) {
        if (flow.whatsappAccountId && conversation && flow.whatsappAccountId !== conversation.whatsappAccountId) {
          continue;
        }

        if (isFirstMessage && flow.triggerOnFirstMessage) {
          console.log(`[AutomationService] Flow ${flow.name} triggered by first message`);
          return flow;
        }

        if (flow.triggerKeywords && flow.triggerKeywords.length > 0) {
          const lowerMessage = messageText.toLowerCase().trim();
          for (const keyword of flow.triggerKeywords) {
            if (lowerMessage.includes(keyword.toLowerCase())) {
              console.log(`[AutomationService] Flow ${flow.name} triggered by keyword: ${keyword}`);
              return flow;
            }
          }
        }

        if (flow.triggerOnStageNew && conversation) {
          const stageId = conversation.stageId;
          if (!stageId) {
            console.log(`[AutomationService] Flow ${flow.name} triggered by new stage (no stage assigned)`);
            return flow;
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`[AutomationService] Error checking triggers:`, error);
      return null;
    }
  }

  private async replaceTemplateVariables(
    text: string,
    contact: Contact,
    conversation: Conversation
  ): Promise<string> {
    if (!text) return text;

    let result = text;

    const firstName = contact.name?.split(" ")[0] || "";
    result = result.replace(/\{\{nome\}\}/gi, contact.name || "");
    result = result.replace(/\{\{primeiro_nome\}\}/gi, firstName);
    result = result.replace(/\{\{telefone\}\}/gi, contact.phoneNumber || "");

    try {
      const company = await storage.getCompany(conversation.companyId);
      result = result.replace(/\{\{empresa\}\}/gi, company?.name || "");
    } catch {
      result = result.replace(/\{\{empresa\}\}/gi, "");
    }

    try {
      const contactTags = await storage.getContactTags(contact.id);
      const tagNames = contactTags.map(t => t.name).join(", ");
      result = result.replace(/\{\{tags\}\}/gi, tagNames);
    } catch {
      result = result.replace(/\{\{tags\}\}/gi, "");
    }

    try {
      if (conversation.assignedToUserId) {
        const user = await storage.getUser(conversation.assignedToUserId);
        result = result.replace(/\{\{atendente\}\}/gi, user?.displayName || user?.name || "");
      } else {
        result = result.replace(/\{\{atendente\}\}/gi, "");
      }
    } catch {
      result = result.replace(/\{\{atendente\}\}/gi, "");
    }

    return result;
  }

  private async handleSendText(session: ChatFlowSession, config: NodeConfig): Promise<ExecuteNodeResult> {
    const text = config.text as string;
    if (!text) {
      console.log(`[AutomationService] SEND_TEXT: No text configured`);
      return { nextNodeId: null, shouldWait: false };
    }

    const conversation = await storage.getConversation(session.conversationId);
    const contact = await storage.getContact(session.contactId);

    if (!conversation || !contact) {
      console.log(`[AutomationService] SEND_TEXT: Conversation or contact not found`);
      return { nextNodeId: null, shouldWait: false };
    }

    const processedText = await this.replaceTemplateVariables(text, contact, conversation);

    const delay = config.delay as number | undefined;
    if (delay && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    await whatsappBaileys.sendMessage(
      conversation.whatsappAccountId,
      contact.phoneNumber,
      processedText
    );

    console.log(`[AutomationService] SEND_TEXT: Sent message to ${contact.phoneNumber}`);

    const currentNode = await storage.getChatFlowNode(session.currentNodeId!);
    const nextNodeId = currentNode ? await this.findNextNode(session, currentNode) : null;

    return { nextNodeId, shouldWait: false };
  }

  private async handleAskInput(session: ChatFlowSession, config: NodeConfig): Promise<ExecuteNodeResult> {
    const prompt = config.prompt as string;
    if (!prompt) {
      console.log(`[AutomationService] ASK_INPUT: No prompt configured`);
      return { nextNodeId: null, shouldWait: false };
    }

    const conversation = await storage.getConversation(session.conversationId);
    const contact = await storage.getContact(session.contactId);

    if (!conversation || !contact) {
      console.log(`[AutomationService] ASK_INPUT: Conversation or contact not found`);
      return { nextNodeId: null, shouldWait: false };
    }

    const processedPrompt = await this.replaceTemplateVariables(prompt, contact, conversation);

    await whatsappBaileys.sendMessage(
      conversation.whatsappAccountId,
      contact.phoneNumber,
      processedPrompt
    );

    await storage.updateChatFlowSession(session.id, {
      state: "waiting_input",
    });

    console.log(`[AutomationService] ASK_INPUT: Sent prompt and waiting for input`);

    return { nextNodeId: null, shouldWait: true };
  }

  private async handleCondition(
    session: ChatFlowSession,
    node: ChatFlowNode,
    config: NodeConfig
  ): Promise<ExecuteNodeResult> {
    const variable = config.variable as string;
    const operator = config.operator as string;
    const value = config.value as string;

    const variables = (session.variables || {}) as Record<string, unknown>;
    const actualValue = String(variables[variable] || "");

    let conditionMet = false;
    switch (operator) {
      case "equals":
        conditionMet = actualValue.toLowerCase() === value.toLowerCase();
        break;
      case "contains":
        conditionMet = actualValue.toLowerCase().includes(value.toLowerCase());
        break;
      case "startsWith":
        conditionMet = actualValue.toLowerCase().startsWith(value.toLowerCase());
        break;
      case "endsWith":
        conditionMet = actualValue.toLowerCase().endsWith(value.toLowerCase());
        break;
      case "greaterThan":
        conditionMet = Number(actualValue) > Number(value);
        break;
      case "lessThan":
        conditionMet = Number(actualValue) < Number(value);
        break;
    }

    console.log(`[AutomationService] CONDITION: ${variable} ${operator} ${value} = ${conditionMet}`);

    const edges = await storage.getOutgoingEdges(node.id);
    const sortedEdges = [...edges].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    for (const edge of sortedEdges) {
      const edgeCondition = edge.condition as Record<string, unknown> | null;
      if (edgeCondition) {
        const edgeValue = edgeCondition.value as string;
        if (edgeValue === "true" && conditionMet) {
          return { nextNodeId: edge.toNodeId, shouldWait: false };
        }
        if (edgeValue === "false" && !conditionMet) {
          return { nextNodeId: edge.toNodeId, shouldWait: false };
        }
      }
    }

    return { nextNodeId: sortedEdges[0]?.toNodeId || null, shouldWait: false };
  }

  private async handleSetTag(session: ChatFlowSession, config: NodeConfig): Promise<ExecuteNodeResult> {
    const tagId = config.tagId as string;
    const action = (config.action as string) || "add";

    if (!tagId) {
      console.log(`[AutomationService] SET_TAG: No tagId configured`);
    } else {
      try {
        if (action === "add") {
          await storage.addContactTag(session.contactId, tagId);
          console.log(`[AutomationService] SET_TAG: Added tag ${tagId} to contact ${session.contactId}`);
        } else if (action === "remove") {
          await storage.removeContactTag(session.contactId, tagId);
          console.log(`[AutomationService] SET_TAG: Removed tag ${tagId} from contact ${session.contactId}`);
        }
      } catch (error) {
        console.error(`[AutomationService] SET_TAG: Error:`, error);
      }
    }

    const currentNode = await storage.getChatFlowNode(session.currentNodeId!);
    const nextNodeId = currentNode ? await this.findNextNode(session, currentNode) : null;

    return { nextNodeId, shouldWait: false };
  }

  private async handleMoveStage(session: ChatFlowSession, config: NodeConfig): Promise<ExecuteNodeResult> {
    const stageId = config.stageId as string;

    if (!stageId) {
      console.log(`[AutomationService] MOVE_STAGE: No stageId configured`);
    } else {
      try {
        await storage.updateConversationStage(session.conversationId, stageId);
        console.log(`[AutomationService] MOVE_STAGE: Moved conversation ${session.conversationId} to stage ${stageId}`);
      } catch (error) {
        console.error(`[AutomationService] MOVE_STAGE: Error:`, error);
      }
    }

    const currentNode = await storage.getChatFlowNode(session.currentNodeId!);
    const nextNodeId = currentNode ? await this.findNextNode(session, currentNode) : null;

    return { nextNodeId, shouldWait: false };
  }

  private async handleAssignQueue(session: ChatFlowSession, config: NodeConfig): Promise<ExecuteNodeResult> {
    const queueName = config.queueName as string;
    console.log(`[AutomationService] ASSIGN_QUEUE: Would assign to queue "${queueName}" (placeholder)`);

    const currentNode = await storage.getChatFlowNode(session.currentNodeId!);
    const nextNodeId = currentNode ? await this.findNextNode(session, currentNode) : null;

    return { nextNodeId, shouldWait: false };
  }

  private async handleAssignAgent(session: ChatFlowSession, config: NodeConfig): Promise<ExecuteNodeResult> {
    const userId = config.userId as string;

    if (!userId) {
      console.log(`[AutomationService] ASSIGN_AGENT: No userId configured`);
    } else {
      try {
        await storage.updateConversation(session.conversationId, {
          assignedToUserId: userId,
        });
        console.log(`[AutomationService] ASSIGN_AGENT: Assigned conversation ${session.conversationId} to user ${userId}`);
      } catch (error) {
        console.error(`[AutomationService] ASSIGN_AGENT: Error:`, error);
      }
    }

    const currentNode = await storage.getChatFlowNode(session.currentNodeId!);
    const nextNodeId = currentNode ? await this.findNextNode(session, currentNode) : null;

    return { nextNodeId, shouldWait: false };
  }

  private async handleSendMedia(session: ChatFlowSession, config: NodeConfig): Promise<ExecuteNodeResult> {
    const mediaUrl = config.mediaUrl as string;
    const mediaType = config.mediaType as "image" | "video" | "audio" | "document";
    const caption = config.caption as string | undefined;

    if (!mediaUrl || !mediaType) {
      console.log(`[AutomationService] SEND_MEDIA: No mediaUrl or mediaType configured`);
      const currentNode = await storage.getChatFlowNode(session.currentNodeId!);
      const nextNodeId = currentNode ? await this.findNextNode(session, currentNode) : null;
      return { nextNodeId, shouldWait: false };
    }

    const conversation = await storage.getConversation(session.conversationId);
    const contact = await storage.getContact(session.contactId);

    if (!conversation || !contact) {
      console.log(`[AutomationService] SEND_MEDIA: Conversation or contact not found`);
      return { nextNodeId: null, shouldWait: false };
    }

    let processedCaption = caption;
    if (caption) {
      processedCaption = await this.replaceTemplateVariables(caption, contact, conversation);
    }

    await whatsappBaileys.sendMessage(
      conversation.whatsappAccountId,
      contact.phoneNumber,
      processedCaption || "",
      undefined,
      {
        mediaUrl,
        mediaType,
      }
    );

    console.log(`[AutomationService] SEND_MEDIA: Sent ${mediaType} to ${contact.phoneNumber}`);

    const currentNode = await storage.getChatFlowNode(session.currentNodeId!);
    const nextNodeId = currentNode ? await this.findNextNode(session, currentNode) : null;

    return { nextNodeId, shouldWait: false };
  }

  private async handleHandoffToHuman(session: ChatFlowSession, node: ChatFlowNode): Promise<ExecuteNodeResult> {
    await this.handoffToHuman(session, node);
    return { nextNodeId: null, shouldWait: false };
  }

  private async handleEnd(session: ChatFlowSession): Promise<ExecuteNodeResult> {
    await this.stopSession(session.id);
    return { nextNodeId: null, shouldWait: false };
  }
}

export const automationService = new AutomationService();
