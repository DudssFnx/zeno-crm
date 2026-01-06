import { db } from "./db";
import { 
  triageMenus, 
  triageSessions, 
  departments,
  departmentAgents,
  antiSpamLogs,
  conversations,
  contacts,
  contactTags,
  users,
  type TriageMenu,
  type TriageSession,
  type TriageOption,
  type Department,
} from "@shared/schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import crypto from "crypto";
import pino from "pino";

const logger = pino({ name: "triage-engine" });

interface TriageResult {
  action: "send_menu" | "route_to_department" | "human_handoff" | "invalid_choice" | "already_routed" | "no_menu";
  message?: string;
  departmentId?: string;
  agentId?: string;
}

export class TriageEngine {
  private sendMessageFn: ((conversationId: string, content: string, delayMs?: number) => Promise<void>) | null = null;

  setSendMessageFunction(fn: (conversationId: string, content: string, delayMs?: number) => Promise<void>) {
    this.sendMessageFn = fn;
  }

  private generateHumanizedDelay(): number {
    const baseDelay = 1500;
    const randomJitter = Math.floor(Math.random() * 2000);
    return baseDelay + randomJitter;
  }

  private hashMessage(content: string): string {
    return crypto.createHash("md5").update(content).digest("hex");
  }

  private async checkAntiSpam(
    companyId: string, 
    conversationId: string, 
    messageHash: string
  ): Promise<boolean> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentSimilar = await db
      .select()
      .from(antiSpamLogs)
      .where(
        and(
          eq(antiSpamLogs.companyId, companyId),
          eq(antiSpamLogs.conversationId, conversationId),
          eq(antiSpamLogs.messageHash, messageHash),
          sql`${antiSpamLogs.sentAt} > ${fiveMinutesAgo}`
        )
      )
      .limit(1);

    return recentSimilar.length === 0;
  }

  private async logAntiSpam(
    companyId: string,
    conversationId: string,
    content: string,
    messageType: string,
    delayMs: number
  ): Promise<void> {
    await db.insert(antiSpamLogs).values({
      companyId,
      conversationId,
      messageHash: this.hashMessage(content),
      messageType,
      delayUsedMs: delayMs,
    });
  }

  async getActiveMenuForAccount(
    companyId: string,
    whatsappAccountId?: string
  ): Promise<TriageMenu | null> {
    const menus = await db
      .select()
      .from(triageMenus)
      .where(
        and(
          eq(triageMenus.companyId, companyId),
          eq(triageMenus.isActive, true),
          whatsappAccountId 
            ? eq(triageMenus.whatsappAccountId, whatsappAccountId)
            : isNull(triageMenus.whatsappAccountId)
        )
      )
      .limit(1);

    if (menus.length > 0) return menus[0];

    const globalMenus = await db
      .select()
      .from(triageMenus)
      .where(
        and(
          eq(triageMenus.companyId, companyId),
          eq(triageMenus.isActive, true),
          isNull(triageMenus.whatsappAccountId)
        )
      )
      .limit(1);

    return globalMenus[0] || null;
  }

  async getActiveSession(conversationId: string): Promise<TriageSession | null> {
    const sessions = await db
      .select()
      .from(triageSessions)
      .where(
        and(
          eq(triageSessions.conversationId, conversationId),
          eq(triageSessions.state, "awaiting_choice")
        )
      )
      .orderBy(desc(triageSessions.menuSentAt))
      .limit(1);

    return sessions[0] || null;
  }

  buildMenuMessage(menu: TriageMenu): string {
    const options = menu.options as TriageOption[];
    let message = menu.welcomeMessage + "\n\n";

    for (const option of options) {
      message += `${option.key} - ${option.label}\n`;
    }

    if (menu.humanOptionKey) {
      message += `${menu.humanOptionKey} - Falar com atendente`;
    }

    return message.trim();
  }

  async processIncomingMessage(
    conversationId: string,
    companyId: string,
    whatsappAccountId: string,
    messageContent: string,
    isFirstMessage: boolean
  ): Promise<TriageResult> {
    const existingSession = await this.getActiveSession(conversationId);

    if (existingSession) {
      return this.processChoice(existingSession, messageContent, companyId, conversationId);
    }

    // Check for any session in the last 24 hours (menu only once per day)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSessions = await db
      .select()
      .from(triageSessions)
      .where(
        and(
          eq(triageSessions.conversationId, conversationId),
          sql`${triageSessions.menuSentAt} > ${twentyFourHoursAgo}`
        )
      )
      .orderBy(desc(triageSessions.menuSentAt))
      .limit(1);

    if (recentSessions.length > 0) {
      const recentSession = recentSessions[0];
      // If already routed or handed off, skip automation
      if (recentSession.state === "routed" || recentSession.state === "human_handoff") {
        logger.info({ conversationId }, "Session already completed in last 24h, skipping menu");
        return { action: "already_routed" };
      }
      // If awaiting choice but session exists, skip sending menu again
      logger.info({ conversationId }, "Menu already sent in last 24h, skipping");
      return { action: "already_routed" };
    }

    const menu = await this.getActiveMenuForAccount(companyId, whatsappAccountId);
    if (!menu) {
      return { action: "no_menu" };
    }

    if (!menu.triggerOnFirstMessage && isFirstMessage) {
      return { action: "no_menu" };
    }

    const options = menu.options as TriageOption[];
    const keywordMatch = this.findKeywordMatch(messageContent, options);
    
    if (keywordMatch) {
      return this.routeToDepartment(
        conversationId, 
        companyId, 
        menu.id, 
        keywordMatch,
        messageContent
      );
    }

    const menuMessage = this.buildMenuMessage(menu);
    const messageHash = this.hashMessage(menuMessage);
    
    const canSend = await this.checkAntiSpam(companyId, conversationId, messageHash);
    if (!canSend) {
      logger.warn({ conversationId }, "Anti-spam: Menu already sent recently, skipping");
      return { action: "already_routed" };
    }

    await db.insert(triageSessions).values({
      conversationId,
      menuId: menu.id,
      state: "awaiting_choice",
      invalidAttempts: 0,
    });

    const delay = this.generateHumanizedDelay();
    await this.logAntiSpam(companyId, conversationId, menuMessage, "triage_menu", delay);

    return {
      action: "send_menu",
      message: menuMessage,
    };
  }

  private findKeywordMatch(message: string, options: TriageOption[]): TriageOption | null {
    const lowerMessage = message.toLowerCase().trim();

    for (const option of options) {
      if (option.keywords && option.keywords.length > 0) {
        for (const keyword of option.keywords) {
          if (lowerMessage.includes(keyword.toLowerCase())) {
            return option;
          }
        }
      }
    }

    return null;
  }

  private async processChoice(
    session: TriageSession,
    messageContent: string,
    companyId: string,
    conversationId: string
  ): Promise<TriageResult> {
    const menu = await db
      .select()
      .from(triageMenus)
      .where(eq(triageMenus.id, session.menuId))
      .limit(1);

    if (!menu[0]) {
      return { action: "no_menu" };
    }

    const options = menu[0].options as TriageOption[];
    const userChoice = messageContent.trim();

    // Human option selected
    if (menu[0].humanOptionKey && userChoice === menu[0].humanOptionKey) {
      await db
        .update(triageSessions)
        .set({ 
          state: "human_handoff", 
          chosenOption: userChoice,
          completedAt: new Date(),
          lastInteractionAt: new Date(),
        })
        .where(eq(triageSessions.id, session.id));

      return {
        action: "human_handoff",
        message: "Entendido! Um atendente irá te responder em breve. Por favor, aguarde.",
      };
    }

    const matchedOption = options.find(opt => opt.key === userChoice);
    
    if (!matchedOption) {
      // Try keyword match first
      const keywordMatch = this.findKeywordMatch(messageContent, options);
      if (keywordMatch) {
        return this.routeToDepartment(conversationId, companyId, menu[0].id, keywordMatch, userChoice);
      }

      // Invalid choice - increment counter
      const currentAttempts = (session.invalidAttempts || 0) + 1;
      
      // After 2 invalid attempts, auto-route to human
      if (currentAttempts >= 2) {
        await db
          .update(triageSessions)
          .set({ 
            state: "human_handoff", 
            invalidAttempts: currentAttempts,
            completedAt: new Date(),
            lastInteractionAt: new Date(),
          })
          .where(eq(triageSessions.id, session.id));

        logger.info({ conversationId, invalidAttempts: currentAttempts }, "Auto-routing to human after 2 invalid attempts");

        return {
          action: "human_handoff",
          message: "Percebi que você está com dificuldades. Vou te direcionar para um atendente que poderá te ajudar melhor. Aguarde um momento.",
        };
      }

      // First invalid attempt - show warning and update counter
      await db
        .update(triageSessions)
        .set({ 
          invalidAttempts: currentAttempts,
          lastInteractionAt: new Date(),
        })
        .where(eq(triageSessions.id, session.id));

      const invalidMessage = menu[0].invalidMessage || "Desculpe, não entendi. Por favor, digite apenas o número da opção desejada.";
      const messageHash = this.hashMessage(invalidMessage);
      
      const canSend = await this.checkAntiSpam(companyId, conversationId, messageHash);
      if (!canSend) {
        return { action: "already_routed" };
      }

      const delay = this.generateHumanizedDelay();
      await this.logAntiSpam(companyId, conversationId, invalidMessage, "invalid_choice", delay);

      return {
        action: "invalid_choice",
        message: invalidMessage,
      };
    }

    return this.routeToDepartment(conversationId, companyId, menu[0].id, matchedOption, userChoice);
  }

  private async routeToDepartment(
    conversationId: string,
    companyId: string,
    menuId: string,
    option: TriageOption,
    chosenOption: string
  ): Promise<TriageResult> {
    let agentId: string | undefined;

    // Treat empty strings as null for foreign key constraints
    const departmentId = option.departmentId && option.departmentId.trim() !== "" ? option.departmentId : null;
    const tagId = option.tagId && option.tagId.trim() !== "" ? option.tagId : null;
    const stageId = option.stageId && option.stageId.trim() !== "" ? option.stageId : null;

    if (departmentId) {
      agentId = await this.assignNextAgent(departmentId);
    }

    const existingSession = await this.getActiveSession(conversationId);
    
    if (existingSession) {
      await db
        .update(triageSessions)
        .set({
          state: "routed",
          chosenOption,
          departmentId: departmentId,
          completedAt: new Date(),
          lastInteractionAt: new Date(),
        })
        .where(eq(triageSessions.id, existingSession.id));
    } else {
      await db.insert(triageSessions).values({
        conversationId,
        menuId,
        state: "routed",
        chosenOption,
        departmentId: departmentId,
        completedAt: new Date(),
      });
    }

    if (tagId) {
      try {
        const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
        if (conv && conv.contactId) {
          const existingTag = await db.select().from(contactTags)
            .where(and(eq(contactTags.contactId, conv.contactId), eq(contactTags.tagId, tagId)))
            .limit(1);
          
          if (existingTag.length === 0) {
            await db.insert(contactTags).values({
              contactId: conv.contactId,
              tagId: tagId,
            });
            logger.info({ conversationId, contactId: conv.contactId, tagId }, "Tag applied to contact");
          } else {
            logger.info({ conversationId, tagId }, "Tag already exists on contact");
          }
        }
      } catch (err) {
        logger.error({ conversationId, tagId, error: err }, "Failed to apply tag");
      }
    }

    if (stageId) {
      await db
        .update(conversations)
        .set({ stageId: stageId, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }

    if (agentId) {
      await db
        .update(conversations)
        .set({ assignedToUserId: agentId, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }

    const confirmationMessage = option.response || `Perfeito! Você foi direcionado para ${option.label}. Um atendente irá te responder em breve.`;

    return {
      action: "route_to_department",
      message: confirmationMessage,
      departmentId: option.departmentId,
      agentId,
    };
  }

  private async assignNextAgent(departmentId: string): Promise<string | undefined> {
    const agents = await db
      .select({
        id: departmentAgents.id,
        userId: departmentAgents.userId,
        lastAssignedAt: departmentAgents.lastAssignedAt,
      })
      .from(departmentAgents)
      .where(
        and(
          eq(departmentAgents.departmentId, departmentId),
          eq(departmentAgents.isActive, true)
        )
      )
      .orderBy(departmentAgents.lastAssignedAt);

    if (agents.length === 0) return undefined;

    const nextAgent = agents[0];

    await db
      .update(departmentAgents)
      .set({ lastAssignedAt: new Date() })
      .where(eq(departmentAgents.id, nextAgent.id));

    return nextAgent.userId;
  }

  async getDepartments(companyId: string): Promise<Department[]> {
    return db
      .select()
      .from(departments)
      .where(eq(departments.companyId, companyId))
      .orderBy(departments.displayOrder);
  }
}

export const triageEngine = new TriageEngine();
