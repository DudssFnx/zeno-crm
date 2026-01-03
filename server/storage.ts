import { db } from "./db";
import { eq, and, desc, sql, asc, lte, or, inArray } from "drizzle-orm";
import {
  companies, users, whatsappAccounts, contacts, tags, contactTags,
  conversations, messages, webhookConfigs, automationLogs, cannedResponses,
  macros, macroExecutions, stages, contactAttributes,
  departments, departmentAgents, triageMenus, triageSessions,
  automationRules, automationExecutions, antiSpamLogs, scheduledMessages,
  type Company, type InsertCompany, type User, type InsertUser,
  type WhatsappAccount, type InsertWhatsappAccount,
  type Contact, type InsertContact, type Tag, type InsertTag,
  type ContactTag, type InsertContactTag,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type WebhookConfig, type InsertWebhookConfig,
  type CannedResponse, type InsertCannedResponse,
  type Macro, type InsertMacro,
  type MacroExecution, type InsertMacroExecution,
  type Stage, type InsertStage,
  type ContactAttribute, type InsertContactAttribute,
  type Department, type InsertDepartment,
  type DepartmentAgent, type InsertDepartmentAgent,
  type TriageMenu, type InsertTriageMenu,
  type TriageSession, type InsertTriageSession,
  type AutomationRule, type InsertAutomationRule,
  type AutomationExecution, type InsertAutomationExecution,
  type AntiSpamLog, type InsertAntiSpamLog,
  type ScheduledMessage, type InsertScheduledMessage,
  type ConversationWithDetails, type ContactWithTags, type MessageWithSender,
} from "@shared/schema";
import { normalizePhone } from "./jid-utils";

export interface IStorage {
  // Companies
  createCompany(data: InsertCompany): Promise<Company>;
  getCompany(id: string): Promise<Company | undefined>;

  // Users
  createUser(data: InsertUser): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsers(companyId: string): Promise<User[]>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

  // WhatsApp Accounts
  createWhatsappAccount(data: InsertWhatsappAccount): Promise<WhatsappAccount>;
  getWhatsappAccount(id: string): Promise<WhatsappAccount | undefined>;
  getWhatsappAccounts(companyId: string): Promise<WhatsappAccount[]>;
  updateWhatsappAccount(id: string, data: Partial<WhatsappAccount>): Promise<WhatsappAccount | undefined>;
  deleteWhatsappAccount(id: string): Promise<void>;

  // Contacts
  createContact(data: InsertContact): Promise<Contact>;
  getContact(id: string): Promise<Contact | undefined>;
  getContactWithTags(id: string): Promise<ContactWithTags | undefined>;
  getContactByPhone(companyId: string, phoneNumber: string): Promise<Contact | undefined>;
  getContacts(companyId: string): Promise<Contact[]>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  updateContactsByLid(companyId: string, lidPhoneNumber: string, realPhoneNumber: string): Promise<number>;
  deleteContact(id: string): Promise<void>;
  deleteContacts(ids: string[]): Promise<void>;

  // Tags
  createTag(data: InsertTag): Promise<Tag>;
  getTag(id: string): Promise<Tag | undefined>;
  getTags(companyId: string): Promise<Tag[]>;
  updateTag(id: string, data: Partial<InsertTag>): Promise<Tag | undefined>;
  deleteTag(id: string): Promise<void>;
  reorderTags(companyId: string, tagIds: string[]): Promise<Tag[]>;

  // Contact Tags
  addContactTag(contactId: string, tagId: string): Promise<ContactTag>;
  removeContactTag(contactId: string, tagId: string): Promise<void>;
  getContactTags(contactId: string): Promise<Tag[]>;

  // Conversations
  deleteConversations(companyId: string, ids: string[]): Promise<number>;
  createConversation(data: InsertConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationWithDetails(id: string): Promise<ConversationWithDetails | undefined>;
  getConversations(companyId: string, filters?: {
    status?: string;
    whatsappAccountId?: string;
    assignedToUserId?: string;
    inactiveMinDays?: number;
    inactiveMaxDays?: number;
    inactivePreset?: string; // "0_1" | "2_3" | "4_7" | "8_15" | "16_30" | "30_plus" | "never_inbound"
  }): Promise<ConversationWithDetails[]>;
  getOpenConversationByContact(contactId: string): Promise<Conversation | undefined>;
  updateConversation(id: string, data: Partial<InsertConversation> & { updatedAt?: Date; lastMessageAt?: Date }): Promise<Conversation | undefined>;

  // Messages
  createMessage(data: InsertMessage): Promise<Message>;
  getMessages(conversationId: string): Promise<MessageWithSender[]>;
  getLastMessage(conversationId: string): Promise<Message | undefined>;
  updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message | undefined>;

  // Webhooks
  createWebhookConfig(data: InsertWebhookConfig): Promise<WebhookConfig>;
  getWebhookConfig(id: string): Promise<WebhookConfig | undefined>;
  getWebhookConfigs(companyId: string): Promise<WebhookConfig[]>;
  updateWebhookConfig(id: string, data: Partial<InsertWebhookConfig>): Promise<WebhookConfig | undefined>;
  deleteWebhookConfig(id: string): Promise<void>;

  // Canned Responses
  createCannedResponse(data: InsertCannedResponse): Promise<CannedResponse>;
  getCannedResponse(id: string): Promise<CannedResponse | undefined>;
  getCannedResponses(companyId: string): Promise<CannedResponse[]>;
  updateCannedResponse(id: string, data: Partial<InsertCannedResponse>): Promise<CannedResponse | undefined>;
  deleteCannedResponse(id: string): Promise<void>;

  // Macros
  createMacro(data: InsertMacro): Promise<Macro>;
  getMacro(id: string): Promise<Macro | undefined>;
  getMacros(companyId: string): Promise<Macro[]>;
  updateMacro(id: string, data: Partial<InsertMacro>): Promise<Macro | undefined>;
  deleteMacro(id: string): Promise<void>;
  
  // Macro Executions
  createMacroExecution(data: InsertMacroExecution): Promise<MacroExecution>;
  getMacroExecutions(macroId: string): Promise<MacroExecution[]>;

  // Stages
  createStage(data: InsertStage): Promise<Stage>;
  getStage(id: string): Promise<Stage | undefined>;
  getStages(companyId: string): Promise<Stage[]>;
  updateStage(id: string, data: Partial<InsertStage>): Promise<Stage | undefined>;
  deleteStage(id: string): Promise<void>;
  reorderStages(companyId: string, stageIds: string[]): Promise<Stage[]>;
  updateConversationStage(conversationId: string, stageId: string | null): Promise<Conversation | undefined>;

  // Contact Attributes
  createContactAttribute(data: InsertContactAttribute): Promise<ContactAttribute>;
  getContactAttribute(id: string): Promise<ContactAttribute | undefined>;
  getContactAttributes(companyId: string): Promise<ContactAttribute[]>;
  updateContactAttribute(id: string, data: Partial<InsertContactAttribute>): Promise<ContactAttribute | undefined>;
  deleteContactAttribute(id: string): Promise<void>;

  // Departments
  createDepartment(data: InsertDepartment): Promise<Department>;
  getDepartment(id: string, companyId: string): Promise<Department | undefined>;
  getDepartments(companyId: string): Promise<Department[]>;
  updateDepartment(id: string, data: Partial<InsertDepartment>, companyId: string): Promise<Department | undefined>;
  deleteDepartment(id: string, companyId: string): Promise<void>;

  // Department Agents
  addDepartmentAgent(data: InsertDepartmentAgent): Promise<DepartmentAgent>;
  removeDepartmentAgent(departmentId: string, userId: string): Promise<void>;
  getDepartmentAgents(departmentId: string): Promise<DepartmentAgent[]>;

  // Triage Menus
  createTriageMenu(data: InsertTriageMenu): Promise<TriageMenu>;
  getTriageMenu(id: string, companyId: string): Promise<TriageMenu | undefined>;
  getTriageMenus(companyId: string): Promise<TriageMenu[]>;
  updateTriageMenu(id: string, data: Partial<InsertTriageMenu>, companyId: string): Promise<TriageMenu | undefined>;
  deleteTriageMenu(id: string, companyId: string): Promise<void>;

  // Triage Sessions
  createTriageSession(data: InsertTriageSession): Promise<TriageSession>;
  getTriageSession(id: string): Promise<TriageSession | undefined>;
  getActiveTriageSession(conversationId: string): Promise<TriageSession | undefined>;
  updateTriageSession(id: string, data: Partial<TriageSession>): Promise<TriageSession | undefined>;

  // Automation Rules
  createAutomationRule(data: InsertAutomationRule): Promise<AutomationRule>;
  getAutomationRule(id: string, companyId: string): Promise<AutomationRule | undefined>;
  getAutomationRules(companyId: string): Promise<AutomationRule[]>;
  updateAutomationRule(id: string, data: Partial<InsertAutomationRule>, companyId: string): Promise<AutomationRule | undefined>;
  deleteAutomationRule(id: string, companyId: string): Promise<void>;

  // Automation Executions
  logAutomationExecution(data: InsertAutomationExecution): Promise<AutomationExecution>;
  getAutomationExecutions(companyId: string, limit?: number): Promise<AutomationExecution[]>;

  // Scheduled Messages
  createScheduledMessage(data: InsertScheduledMessage): Promise<ScheduledMessage>;
  getScheduledMessage(id: string): Promise<ScheduledMessage | undefined>;
  getScheduledMessages(companyId: string): Promise<ScheduledMessage[]>;
  getPendingScheduledMessages(): Promise<ScheduledMessage[]>;
  updateScheduledMessage(id: string, data: Partial<InsertScheduledMessage>): Promise<ScheduledMessage | undefined>;
  deleteScheduledMessage(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Companies
  async createCompany(data: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(data).returning();
    return company;
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  // Users
  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUsers(companyId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.companyId, companyId));
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // WhatsApp Accounts
  async createWhatsappAccount(data: InsertWhatsappAccount): Promise<WhatsappAccount> {
    const [account] = await db.insert(whatsappAccounts).values(data).returning();
    return account;
  }

  async getWhatsappAccount(id: string): Promise<WhatsappAccount | undefined> {
    const [account] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.id, id));
    return account;
  }

  async getWhatsappAccounts(companyId: string): Promise<WhatsappAccount[]> {
    return db.select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId));
  }

  async updateWhatsappAccount(id: string, data: Partial<WhatsappAccount>): Promise<WhatsappAccount | undefined> {
    const [account] = await db
      .update(whatsappAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(whatsappAccounts.id, id))
      .returning();
    return account;
  }

  async deleteWhatsappAccount(id: string): Promise<void> {
    await db.delete(whatsappAccounts).where(eq(whatsappAccounts.id, id));
  }

  // Contacts
  async createContact(data: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(data).returning();
    return contact;
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async getContactWithTags(id: string): Promise<ContactWithTags | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    if (!contact) return undefined;
    const contactTagsList = await this.getContactTags(id);
    return { ...contact, tags: contactTagsList };
  }

  async getContactByPhone(companyId: string, phoneNumber: string): Promise<Contact | undefined> {
    const normalizedInput = normalizePhone(phoneNumber);
    
    const allContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.companyId, companyId));
    
    const contact = allContacts.find(c => {
      const normalizedStored = normalizePhone(c.phoneNumber);
      return normalizedStored === normalizedInput;
    });
    
    return contact;
  }

  async getContacts(companyId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.companyId, companyId));
  }

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [contact] = await db
      .update(contacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    return contact;
  }

  async updateContactsByLid(companyId: string, lidPhoneNumber: string, realPhoneNumber: string): Promise<number> {
    const result = await db
      .update(contacts)
      .set({ phoneNumber: realPhoneNumber, updatedAt: new Date() })
      .where(and(
        eq(contacts.companyId, companyId),
        eq(contacts.phoneNumber, lidPhoneNumber)
      ))
      .returning({ id: contacts.id });
    return result.length;
  }

  async deleteContact(id: string): Promise<void> {
    const contactConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.contactId, id));
    
    for (const conv of contactConversations) {
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
    }
    
    await db.delete(conversations).where(eq(conversations.contactId, id));
    await db.delete(contactTags).where(eq(contactTags.contactId, id));
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  async deleteContacts(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteContact(id);
    }
  }

  // Tags
  async createTag(data: InsertTag): Promise<Tag> {
    const [tag] = await db.insert(tags).values(data).returning();
    return tag;
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    return tag;
  }

  async getTags(companyId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.companyId, companyId)).orderBy(tags.stageOrder);
  }

  async updateTag(id: string, data: Partial<InsertTag>): Promise<Tag | undefined> {
    const [tag] = await db
      .update(tags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tags.id, id))
      .returning();
    return tag;
  }

  async deleteTag(id: string): Promise<void> {
    await db.delete(tags).where(eq(tags.id, id));
  }

  async reorderTags(companyId: string, tagIds: string[]): Promise<Tag[]> {
    const result: Tag[] = [];
    for (let i = 0; i < tagIds.length; i++) {
      const [tag] = await db
        .update(tags)
        .set({ stageOrder: String(i), updatedAt: new Date() })
        .where(and(eq(tags.id, tagIds[i]), eq(tags.companyId, companyId)))
        .returning();
      if (tag) result.push(tag);
    }
    return result;
  }

  // Contact Tags
  async addContactTag(contactId: string, tagId: string): Promise<ContactTag> {
    const [contactTag] = await db
      .insert(contactTags)
      .values({ contactId, tagId })
      .returning();
    return contactTag;
  }

  async removeContactTag(contactId: string, tagId: string): Promise<void> {
    await db
      .delete(contactTags)
      .where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)));
  }

  async getContactTags(contactId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(contactTags)
      .innerJoin(tags, eq(contactTags.tagId, tags.id))
      .where(eq(contactTags.contactId, contactId));
    return result.map((r) => r.tag);
  }

  // Conversations
  async deleteConversations(companyId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    let deleted = 0;
    for (const convId of ids) {
      const [conv] = await db.select().from(conversations)
        .where(and(eq(conversations.id, convId), eq(conversations.companyId, companyId)));
      
      if (conv) {
        await db.delete(messages).where(eq(messages.conversationId, convId));
        await db.delete(conversations).where(eq(conversations.id, convId));
        deleted++;
      }
    }
    
    return deleted;
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values(data).returning();
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationWithDetails(id: string): Promise<ConversationWithDetails | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) return undefined;

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
    const [account] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.id, conv.whatsappAccountId));
    
    let assignedTo: User | undefined;
    if (conv.assignedToUserId) {
      [assignedTo] = await db.select().from(users).where(eq(users.id, conv.assignedToUserId));
    }

    const lastMsg = await this.getLastMessage(id);
    const contactTagsList = await this.getContactTags(conv.contactId);

    return {
      ...conv,
      contact,
      whatsappAccount: account,
      assignedTo,
      lastMessage: lastMsg,
      tags: contactTagsList,
    };
  }

  async getConversations(companyId: string, filters?: {
    status?: string;
    whatsappAccountId?: string;
    assignedToUserId?: string;
    inactiveMinDays?: number;
    inactiveMaxDays?: number;
    inactivePreset?: string;
  }): Promise<ConversationWithDetails[]> {
    let query = db
      .select()
      .from(conversations)
      .where(eq(conversations.companyId, companyId))
      .orderBy(desc(conversations.lastMessageAt));

    const allConvs = await query;

    // Parse preset to min/max days
    let minDays = filters?.inactiveMinDays;
    let maxDays = filters?.inactiveMaxDays;
    let neverInbound = false;
    
    if (filters?.inactivePreset) {
      switch (filters.inactivePreset) {
        case "0_1": minDays = 0; maxDays = 1; break;
        case "2_3": minDays = 2; maxDays = 3; break;
        case "4_7": minDays = 4; maxDays = 7; break;
        case "8_15": minDays = 8; maxDays = 15; break;
        case "16_30": minDays = 16; maxDays = 30; break;
        case "30_plus": minDays = 30; maxDays = undefined; break;
        case "never_inbound": neverInbound = true; break;
      }
    }

    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    const filtered = allConvs.filter((conv) => {
      if (filters?.status && conv.status !== filters.status) return false;
      if (filters?.whatsappAccountId && conv.whatsappAccountId !== filters.whatsappAccountId) return false;
      if (filters?.assignedToUserId && conv.assignedToUserId !== filters.assignedToUserId) return false;
      
      // Filtro de inatividade
      if (neverInbound) {
        return conv.lastInboundAt === null;
      }
      
      if (minDays !== undefined || maxDays !== undefined) {
        if (!conv.lastInboundAt) return false; // Sem msg recebida = não entra no filtro de dias
        const inactiveDays = (now - new Date(conv.lastInboundAt).getTime()) / msPerDay;
        if (minDays !== undefined && inactiveDays < minDays) return false;
        if (maxDays !== undefined && inactiveDays > maxDays) return false;
      }
      
      return true;
    });

    const result: ConversationWithDetails[] = [];
    for (const conv of filtered) {
      const details = await this.getConversationWithDetails(conv.id);
      if (details) result.push(details);
    }
    return result;
  }

  async getOpenConversationByContact(contactId: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.contactId, contactId), eq(conversations.status, "open")));
    return conversation;
  }

  async updateConversation(id: string, data: Partial<InsertConversation> & { updatedAt?: Date; lastMessageAt?: Date }): Promise<Conversation | undefined> {
    const [conversation] = await db
      .update(conversations)
      .set({ ...data, updatedAt: data.updatedAt || new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return conversation;
  }

  // Messages
  async createMessage(data: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.id, data.conversationId));

    return message;
  }

  async getMessages(conversationId: string): Promise<MessageWithSender[]> {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    const result: MessageWithSender[] = [];
    for (const msg of msgs) {
      let sender: User | undefined;
      if (msg.senderUserId) {
        [sender] = await db.select().from(users).where(eq(users.id, msg.senderUserId));
      }
      result.push({ ...msg, sender });
    }
    return result;
  }

  async getLastMessage(conversationId: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return message;
  }

  async updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message | undefined> {
    const [message] = await db
      .update(messages)
      .set(data)
      .where(eq(messages.id, id))
      .returning();
    return message;
  }

  // Webhooks
  async createWebhookConfig(data: InsertWebhookConfig): Promise<WebhookConfig> {
    const [webhook] = await db.insert(webhookConfigs).values(data).returning();
    return webhook;
  }

  async getWebhookConfig(id: string): Promise<WebhookConfig | undefined> {
    const [webhook] = await db.select().from(webhookConfigs).where(eq(webhookConfigs.id, id));
    return webhook;
  }

  async getWebhookConfigs(companyId: string): Promise<WebhookConfig[]> {
    return db.select().from(webhookConfigs).where(eq(webhookConfigs.companyId, companyId));
  }

  async updateWebhookConfig(id: string, data: Partial<InsertWebhookConfig>): Promise<WebhookConfig | undefined> {
    const [webhook] = await db
      .update(webhookConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(webhookConfigs.id, id))
      .returning();
    return webhook;
  }

  async deleteWebhookConfig(id: string): Promise<void> {
    await db.delete(webhookConfigs).where(eq(webhookConfigs.id, id));
  }

  // Canned Responses
  async createCannedResponse(data: InsertCannedResponse): Promise<CannedResponse> {
    const [response] = await db.insert(cannedResponses).values(data).returning();
    return response;
  }

  async getCannedResponse(id: string): Promise<CannedResponse | undefined> {
    const [response] = await db.select().from(cannedResponses).where(eq(cannedResponses.id, id));
    return response;
  }

  async getCannedResponses(companyId: string): Promise<CannedResponse[]> {
    return db.select().from(cannedResponses).where(eq(cannedResponses.companyId, companyId));
  }

  async updateCannedResponse(id: string, data: Partial<InsertCannedResponse>): Promise<CannedResponse | undefined> {
    const [response] = await db
      .update(cannedResponses)
      .set(data)
      .where(eq(cannedResponses.id, id))
      .returning();
    return response;
  }

  async deleteCannedResponse(id: string): Promise<void> {
    await db.delete(cannedResponses).where(eq(cannedResponses.id, id));
  }

  // Macros
  async createMacro(data: InsertMacro): Promise<Macro> {
    const [macro] = await db.insert(macros).values(data).returning();
    return macro;
  }

  async getMacro(id: string): Promise<Macro | undefined> {
    const [macro] = await db.select().from(macros).where(eq(macros.id, id));
    return macro;
  }

  async getMacros(companyId: string): Promise<Macro[]> {
    return db.select().from(macros).where(eq(macros.companyId, companyId)).orderBy(desc(macros.createdAt));
  }

  async updateMacro(id: string, data: Partial<InsertMacro>): Promise<Macro | undefined> {
    const [macro] = await db
      .update(macros)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(macros.id, id))
      .returning();
    return macro;
  }

  async deleteMacro(id: string): Promise<void> {
    await db.delete(macros).where(eq(macros.id, id));
  }

  // Macro Executions
  async createMacroExecution(data: InsertMacroExecution): Promise<MacroExecution> {
    const [execution] = await db.insert(macroExecutions).values(data).returning();
    return execution;
  }

  async getMacroExecutions(macroId: string): Promise<MacroExecution[]> {
    return db.select().from(macroExecutions).where(eq(macroExecutions.macroId, macroId)).orderBy(desc(macroExecutions.executedAt));
  }

  // Stages
  async createStage(data: InsertStage): Promise<Stage> {
    const existingStages = await this.getStages(data.companyId);
    const maxOrder = existingStages.length > 0 
      ? Math.max(...existingStages.map(s => parseInt(s.order || "0"))) 
      : -1;
    const [stage] = await db.insert(stages).values({
      ...data,
      order: String(maxOrder + 1),
    }).returning();
    return stage;
  }

  async getStage(id: string): Promise<Stage | undefined> {
    const [stage] = await db.select().from(stages).where(eq(stages.id, id));
    return stage;
  }

  async getStages(companyId: string): Promise<Stage[]> {
    return db.select().from(stages)
      .where(eq(stages.companyId, companyId))
      .orderBy(asc(stages.order));
  }

  async updateStage(id: string, data: Partial<InsertStage>): Promise<Stage | undefined> {
    const [stage] = await db
      .update(stages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stages.id, id))
      .returning();
    return stage;
  }

  async deleteStage(id: string): Promise<void> {
    await db.update(conversations)
      .set({ stageId: null })
      .where(eq(conversations.stageId, id));
    await db.delete(stages).where(eq(stages.id, id));
  }

  async reorderStages(companyId: string, stageIds: string[]): Promise<Stage[]> {
    const result: Stage[] = [];
    for (let i = 0; i < stageIds.length; i++) {
      const [stage] = await db
        .update(stages)
        .set({ order: String(i), updatedAt: new Date() })
        .where(and(eq(stages.id, stageIds[i]), eq(stages.companyId, companyId)))
        .returning();
      if (stage) result.push(stage);
    }
    return result;
  }

  async updateConversationStage(conversationId: string, stageId: string | null): Promise<Conversation | undefined> {
    const [conversation] = await db
      .update(conversations)
      .set({ stageId, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
      .returning();
    return conversation;
  }

  // Contact Attributes
  async createContactAttribute(data: InsertContactAttribute): Promise<ContactAttribute> {
    const existingAttrs = await this.getContactAttributes(data.companyId);
    const maxOrder = existingAttrs.length > 0 
      ? Math.max(...existingAttrs.map(a => parseInt(a.displayOrder || "0"))) 
      : -1;
    const [attr] = await db.insert(contactAttributes).values({
      ...data,
      displayOrder: String(maxOrder + 1),
    }).returning();
    return attr;
  }

  async getContactAttribute(id: string): Promise<ContactAttribute | undefined> {
    const [attr] = await db.select().from(contactAttributes).where(eq(contactAttributes.id, id));
    return attr;
  }

  async getContactAttributes(companyId: string): Promise<ContactAttribute[]> {
    return db.select().from(contactAttributes)
      .where(eq(contactAttributes.companyId, companyId))
      .orderBy(asc(contactAttributes.displayOrder));
  }

  async updateContactAttribute(id: string, data: Partial<InsertContactAttribute>): Promise<ContactAttribute | undefined> {
    const [attr] = await db
      .update(contactAttributes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contactAttributes.id, id))
      .returning();
    return attr;
  }

  async deleteContactAttribute(id: string): Promise<void> {
    await db.delete(contactAttributes).where(eq(contactAttributes.id, id));
  }

  // Departments
  async createDepartment(data: InsertDepartment): Promise<Department> {
    const [dept] = await db.insert(departments).values(data).returning();
    return dept;
  }

  async getDepartment(id: string, companyId: string): Promise<Department | undefined> {
    const [dept] = await db.select().from(departments)
      .where(and(eq(departments.id, id), eq(departments.companyId, companyId)));
    return dept;
  }

  async getDepartments(companyId: string): Promise<Department[]> {
    return db.select().from(departments)
      .where(eq(departments.companyId, companyId))
      .orderBy(asc(departments.name));
  }

  async updateDepartment(id: string, data: Partial<InsertDepartment>, companyId: string): Promise<Department | undefined> {
    const [dept] = await db
      .update(departments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(departments.id, id), eq(departments.companyId, companyId)))
      .returning();
    return dept;
  }

  async deleteDepartment(id: string, companyId: string): Promise<void> {
    const [existing] = await db.select().from(departments)
      .where(and(eq(departments.id, id), eq(departments.companyId, companyId)));
    if (!existing) return;
    await db.delete(departmentAgents).where(eq(departmentAgents.departmentId, id));
    await db.delete(departments).where(and(eq(departments.id, id), eq(departments.companyId, companyId)));
  }

  // Department Agents
  async addDepartmentAgent(data: InsertDepartmentAgent): Promise<DepartmentAgent> {
    const [agent] = await db.insert(departmentAgents).values(data).returning();
    return agent;
  }

  async removeDepartmentAgent(departmentId: string, userId: string): Promise<void> {
    await db.delete(departmentAgents)
      .where(and(
        eq(departmentAgents.departmentId, departmentId),
        eq(departmentAgents.userId, userId)
      ));
  }

  async getDepartmentAgents(departmentId: string): Promise<DepartmentAgent[]> {
    return db.select().from(departmentAgents)
      .where(eq(departmentAgents.departmentId, departmentId));
  }

  // Triage Menus
  async createTriageMenu(data: InsertTriageMenu): Promise<TriageMenu> {
    const [menu] = await db.insert(triageMenus).values(data).returning();
    return menu;
  }

  async getTriageMenu(id: string, companyId: string): Promise<TriageMenu | undefined> {
    const [menu] = await db.select().from(triageMenus)
      .where(and(eq(triageMenus.id, id), eq(triageMenus.companyId, companyId)));
    return menu;
  }

  async getTriageMenus(companyId: string): Promise<TriageMenu[]> {
    return db.select().from(triageMenus)
      .where(eq(triageMenus.companyId, companyId))
      .orderBy(desc(triageMenus.createdAt));
  }

  async updateTriageMenu(id: string, data: Partial<InsertTriageMenu>, companyId: string): Promise<TriageMenu | undefined> {
    const [menu] = await db
      .update(triageMenus)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(triageMenus.id, id), eq(triageMenus.companyId, companyId)))
      .returning();
    return menu;
  }

  async deleteTriageMenu(id: string, companyId: string): Promise<void> {
    await db.delete(triageMenus).where(and(eq(triageMenus.id, id), eq(triageMenus.companyId, companyId)));
  }

  // Triage Sessions
  async createTriageSession(data: InsertTriageSession): Promise<TriageSession> {
    const [session] = await db.insert(triageSessions).values(data).returning();
    return session;
  }

  async getTriageSession(id: string): Promise<TriageSession | undefined> {
    const [session] = await db.select().from(triageSessions).where(eq(triageSessions.id, id));
    return session;
  }

  async getActiveTriageSession(conversationId: string): Promise<TriageSession | undefined> {
    const [session] = await db.select().from(triageSessions)
      .where(and(
        eq(triageSessions.conversationId, conversationId),
        eq(triageSessions.status, "active")
      ));
    return session;
  }

  async updateTriageSession(id: string, data: Partial<TriageSession>): Promise<TriageSession | undefined> {
    const [session] = await db
      .update(triageSessions)
      .set(data)
      .where(eq(triageSessions.id, id))
      .returning();
    return session;
  }

  // Automation Rules
  async createAutomationRule(data: InsertAutomationRule): Promise<AutomationRule> {
    const [rule] = await db.insert(automationRules).values(data).returning();
    return rule;
  }

  async getAutomationRule(id: string, companyId: string): Promise<AutomationRule | undefined> {
    const [rule] = await db.select().from(automationRules)
      .where(and(eq(automationRules.id, id), eq(automationRules.companyId, companyId)));
    return rule;
  }

  async getAutomationRules(companyId: string): Promise<AutomationRule[]> {
    return db.select().from(automationRules)
      .where(eq(automationRules.companyId, companyId))
      .orderBy(asc(automationRules.priority), desc(automationRules.createdAt));
  }

  async updateAutomationRule(id: string, data: Partial<InsertAutomationRule>, companyId: string): Promise<AutomationRule | undefined> {
    const [rule] = await db
      .update(automationRules)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(automationRules.id, id), eq(automationRules.companyId, companyId)))
      .returning();
    return rule;
  }

  async deleteAutomationRule(id: string, companyId: string): Promise<void> {
    await db.delete(automationRules).where(and(eq(automationRules.id, id), eq(automationRules.companyId, companyId)));
  }

  // Automation Executions
  async logAutomationExecution(data: InsertAutomationExecution): Promise<AutomationExecution> {
    const [execution] = await db.insert(automationExecutions).values(data).returning();
    return execution;
  }

  async getAutomationExecutions(companyId: string, limit?: number): Promise<AutomationExecution[]> {
    let query = db.select().from(automationExecutions)
      .where(eq(automationExecutions.companyId, companyId))
      .orderBy(desc(automationExecutions.executedAt));
    
    if (limit) {
      return query.limit(limit);
    }
    return query;
  }

  // Scheduled Messages
  async createScheduledMessage(data: InsertScheduledMessage): Promise<ScheduledMessage> {
    const [msg] = await db.insert(scheduledMessages).values(data).returning();
    return msg;
  }

  async getScheduledMessage(id: string): Promise<ScheduledMessage | undefined> {
    const [msg] = await db.select().from(scheduledMessages).where(eq(scheduledMessages.id, id));
    return msg;
  }

  async getScheduledMessages(companyId: string): Promise<ScheduledMessage[]> {
    return db.select().from(scheduledMessages)
      .where(eq(scheduledMessages.companyId, companyId))
      .orderBy(asc(scheduledMessages.scheduledFor));
  }

  async getPendingScheduledMessages(): Promise<ScheduledMessage[]> {
    return db.select().from(scheduledMessages)
      .where(and(
        eq(scheduledMessages.status, "pending"),
        lte(scheduledMessages.scheduledFor, new Date())
      ))
      .orderBy(asc(scheduledMessages.scheduledFor));
  }

  async updateScheduledMessage(id: string, data: Partial<InsertScheduledMessage>): Promise<ScheduledMessage | undefined> {
    const [msg] = await db
      .update(scheduledMessages)
      .set(data)
      .where(eq(scheduledMessages.id, id))
      .returning();
    return msg;
  }

  async deleteScheduledMessage(id: string): Promise<void> {
    await db.delete(scheduledMessages).where(eq(scheduledMessages.id, id));
  }
}

export const storage = new DatabaseStorage();
