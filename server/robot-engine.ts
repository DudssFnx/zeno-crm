import { db } from "./db";
import { robots, robotExecutions, conversations, contacts, messages, contactTags, tags } from "@shared/schema";
import type { Robot, RobotAction, RobotExecution } from "@shared/schema";
import { eq, and } from "drizzle-orm";

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
}

class RobotEngine {
  private activeExecutions: Map<string, { cancelled: boolean }> = new Map();

  generateHumanizedDelay(baseMs: number = 2000): number {
    const jitter = Math.random() * 1000 - 500;
    return Math.max(1500, baseMs + jitter);
  }

  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async executeRobot(
    robotId: string,
    context: ExecutionContext,
    sendMessage: (conversationId: string, content: string, mediaType?: string, mediaUrl?: string) => Promise<void>,
    sendPresence: (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => Promise<void>
  ): Promise<{ success: boolean; error?: string }> {
    const robot = await db.select().from(robots).where(eq(robots.id, robotId)).limit(1);
    
    if (!robot[0]) {
      return { success: false, error: "Robô não encontrado" };
    }

    if (!robot[0].isActive) {
      return { success: false, error: "Robô desativado" };
    }

    const actions = robot[0].actions as RobotAction[];
    
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

    logger.info({ robotId, executionId, conversationId: context.conversationId }, "Iniciando execução do robô");

    try {
      for (let i = 0; i < actions.length; i++) {
        const controlState = this.activeExecutions.get(executionId);
        if (controlState?.cancelled) {
          await db.update(robotExecutions)
            .set({ status: "cancelled", completedAt: new Date() })
            .where(eq(robotExecutions.id, executionId));
          
          this.activeExecutions.delete(executionId);
          return { success: false, error: "Execução cancelada" };
        }

        await db.update(robotExecutions)
          .set({ currentActionIndex: i })
          .where(eq(robotExecutions.id, executionId));

        const action = actions[i];
        await this.executeAction(action, context, sendMessage, sendPresence);
      }

      await db.update(robotExecutions)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(robotExecutions.id, executionId));

      this.activeExecutions.delete(executionId);
      logger.info({ robotId, executionId }, "Robô executado com sucesso");
      
      return { success: true };
    } catch (error: any) {
      await db.update(robotExecutions)
        .set({ status: "failed", error: error.message, completedAt: new Date() })
        .where(eq(robotExecutions.id, executionId));

      this.activeExecutions.delete(executionId);
      logger.error({ robotId, executionId, error: error.message }, "Erro ao executar robô");
      
      return { success: false, error: error.message };
    }
  }

  private async executeAction(
    action: RobotAction,
    context: ExecutionContext,
    sendMessage: (conversationId: string, content: string, mediaType?: string, mediaUrl?: string) => Promise<void>,
    sendPresence: (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => Promise<void>
  ): Promise<void> {
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

      case "send_text": {
        if (action.content) {
          const processedContent = this.processTemplateVariables(action.content, context);
          await sendMessage(context.conversationId, processedContent);
          await this.sleep(this.generateHumanizedDelay(500));
        }
        break;
      }

      case "send_image": {
        if (action.mediaUrl) {
          const caption = action.content ? this.processTemplateVariables(action.content, context) : "";
          await sendMessage(context.conversationId, caption, "image", action.mediaUrl);
          await this.sleep(this.generateHumanizedDelay(1000));
        }
        break;
      }

      case "send_audio": {
        if (action.mediaUrl) {
          await sendMessage(context.conversationId, "", "audio", action.mediaUrl);
          await this.sleep(this.generateHumanizedDelay(1000));
        }
        break;
      }

      case "send_video": {
        if (action.mediaUrl) {
          const caption = action.content ? this.processTemplateVariables(action.content, context) : "";
          await sendMessage(context.conversationId, caption, "video", action.mediaUrl);
          await this.sleep(this.generateHumanizedDelay(1000));
        }
        break;
      }

      case "send_document": {
        if (action.mediaUrl) {
          const fileName = action.fileName ? this.processTemplateVariables(action.fileName, context) : "document";
          await sendMessage(context.conversationId, fileName, "document", action.mediaUrl);
          await this.sleep(this.generateHumanizedDelay(1000));
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

      default:
        logger.warn({ actionType: type }, "Tipo de ação desconhecido");
    }
  }

  private processTemplateVariables(content: string, context: ExecutionContext): string {
    return content
      .replace(/\{\{nome\}\}/gi, context.contactName)
      .replace(/\{\{telefone\}\}/gi, context.contactPhone)
      .replace(/\{\{primeiro_nome\}\}/gi, context.contactName.split(" ")[0] || context.contactName);
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
}

export const robotEngine = new RobotEngine();
