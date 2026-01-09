import { db } from "./db";
import { eq, and, desc, sql, asc, lte, or, inArray } from "drizzle-orm";
import {
  companies, users, whatsappAccounts, contacts, tags, contactTags,
  conversations, messages, webhookConfigs, automationLogs, cannedResponses,
  macros, macroExecutions, stages, contactAttributes, contactAttributeCounts,
  departments, departmentAgents, triageMenus, triageSessions,
  automationRules, automationExecutions, antiSpamLogs, scheduledMessages,
  robots, robotExecutions,
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
  type ContactAttributeCount,
  type Department, type InsertDepartment,
  type DepartmentAgent, type InsertDepartmentAgent,
  type TriageMenu, type InsertTriageMenu,
  type TriageSession, type InsertTriageSession,
  type AutomationRule, type InsertAutomationRule,
  type AutomationExecution, type InsertAutomationExecution,
  type AntiSpamLog, type InsertAntiSpamLog,
  type ScheduledMessage, type InsertScheduledMessage,
  type Robot, type InsertRobot,
  type ConversationWithDetails, type ContactWithTags, type MessageWithSender,
} from "@shared/schema";
import { normalizePhone, getPhoneVariants } from "./jid-utils";

export interface IStorage {
  // Companies
  createCompany(data: InsertCompany): Promise<Company>;
  getCompany(id: string): Promise<Company | undefined>;
  getCompanyByDomain(domain: string): Promise<Company | undefined>;
  getAllCompanies(): Promise<Company[]>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;
  getCompanyStats(id: string): Promise<{ userCount: number; whatsappAccountCount: number; contactCount: number }>;

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
  getContactByPhoneAndAccount(whatsappAccountId: string, phoneNumber: string): Promise<Contact | undefined>;
  getContacts(companyId: string): Promise<Contact[]>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  updateContactsByLid(companyId: string, lidPhoneNumber: string, realPhoneNumber: string): Promise<number>;
  deleteContact(id: string): Promise<void>;
  deleteContacts(ids: string[]): Promise<void>;
  getOrCreateContact(data: InsertContact): Promise<{ contact: Contact; created: boolean }>;

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
  getAllContactTagsByCompany(companyId: string): Promise<ContactTag[]>;

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
    isUnread?: boolean;
    limit?: number;
  }): Promise<ConversationWithDetails[]>;
  getOpenConversationByContact(contactId: string): Promise<Conversation | undefined>;
  getOpenConversationByAccountAndContact(whatsappAccountId: string, contactId: string): Promise<Conversation | undefined>;
  updateConversation(id: string, data: Partial<InsertConversation> & { updatedAt?: Date; lastMessageAt?: Date }): Promise<Conversation | undefined>;
  getOrCreateConversation(data: InsertConversation): Promise<{ conversation: Conversation; created: boolean }>;

  // Messages
  createMessage(data: InsertMessage): Promise<Message>;
  getMessages(conversationId: string, options?: { limit?: number; before?: string }): Promise<{ messages: MessageWithSender[]; hasMore: boolean }>;
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
  reorderMacros(companyId: string, macroIds: string[]): Promise<Macro[]>;
  
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

  // Contact Attribute Counts
  getContactAttributeCounts(contactId: string): Promise<ContactAttributeCount[]>;
  incrementContactAttributeCount(contactId: string, attributeName: string): Promise<ContactAttributeCount>;
  resetContactAttributeCount(contactId: string, attributeName: string): Promise<void>;
  resetAllContactAttributeCounts(contactId: string): Promise<void>;

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
  getActiveSessionByConversation(conversationId: string): Promise<TriageSession | undefined>;
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

  // Robots (Auto Atendimento)
  createRobot(data: InsertRobot): Promise<Robot>;
  getRobot(id: string): Promise<Robot | undefined>;
  getRobots(companyId: string): Promise<Robot[]>;
  updateRobot(id: string, data: Partial<InsertRobot>): Promise<Robot | undefined>;
  deleteRobot(id: string): Promise<void>;

  // Backup - Batch delete by company
  deleteTagsByCompany(companyId: string): Promise<void>;
  deleteContactAttributesByCompany(companyId: string): Promise<void>;
  deleteStagesByCompany(companyId: string): Promise<void>;
  deleteCannedResponsesByCompany(companyId: string): Promise<void>;
  deleteMacrosByCompany(companyId: string): Promise<void>;
  deleteWebhooksByCompany(companyId: string): Promise<void>;
  deleteRobotsByCompany(companyId: string): Promise<void>;
  deleteTriageMenusByCompany(companyId: string): Promise<void>;
  deleteDepartmentsByCompany(companyId: string): Promise<void>;
  deleteAutomationRulesByCompany(companyId: string): Promise<void>;
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

  async getCompanyByDomain(domain: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.domain, domain));
    return company;
  }

  async getAllCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db
      .update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return company;
  }

  async deleteCompany(id: string): Promise<void> {
    await db.delete(companies).where(eq(companies.id, id));
  }

  async getCompanyStats(id: string): Promise<{ userCount: number; whatsappAccountCount: number; contactCount: number }> {
    const [userResult] = await db.select({ count: sql<string>`count(*)::int` }).from(users).where(eq(users.companyId, id));
    const [accountResult] = await db.select({ count: sql<string>`count(*)::int` }).from(whatsappAccounts).where(eq(whatsappAccounts.companyId, id));
    const [contactResult] = await db.select({ count: sql<string>`count(*)::int` }).from(contacts).where(eq(contacts.companyId, id));
    return {
      userCount: parseInt(String(userResult?.count || 0), 10),
      whatsappAccountCount: parseInt(String(accountResult?.count || 0), 10),
      contactCount: parseInt(String(contactResult?.count || 0), 10),
    };
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

  async getContactByPhoneAndAccount(whatsappAccountId: string, phoneNumber: string): Promise<Contact | undefined> {
    // Gerar variantes do número (com e sem 9º dígito)
    const phoneVariants = getPhoneVariants(phoneNumber);
    console.log(`[Storage] getContactByPhoneAndAccount: variants=${phoneVariants.join(", ")}`);
    
    // Buscar contato usando qualquer variante do número
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.whatsappAccountId, whatsappAccountId),
        inArray(contacts.phoneNumber, phoneVariants)
      ));
    
    if (contact) {
      console.log(`[Storage] Found contact with phone variant: stored=${contact.phoneNumber}`);
    }
    
    return contact;
  }

  async getOrCreateContact(data: InsertContact): Promise<{ contact: Contact; created: boolean }> {
    if (!data.whatsappAccountId) {
      throw new Error("whatsappAccountId is required for getOrCreateContact");
    }
    
    const normalizedPhone = normalizePhone(data.phoneNumber);
    console.log(`[Storage] getOrCreateContact: phone=${normalizedPhone} name="${data.name}" account=${data.whatsappAccountId}`);
    
    const existing = await this.getContactByPhoneAndAccount(data.whatsappAccountId, normalizedPhone);
    if (existing) {
      console.log(`[Storage] Contact exists: id=${existing.id} name="${existing.name}" phone=${existing.phoneNumber}`);
      
      // For groups, update name and avatar if they were fetched from WhatsApp metadata
      if (existing.isGroup && (data.name || data.avatarUrl)) {
        const updates: Partial<InsertContact> = {};
        
        // Update group name if provided and different from placeholder
        if (data.name && !data.name.startsWith("Grupo ") && data.name !== existing.name) {
          updates.name = data.name;
          console.log(`[Storage] Updating group name: "${existing.name}" -> "${data.name}"`);
        }
        
        // Update avatar if provided and different
        if (data.avatarUrl && data.avatarUrl !== existing.avatarUrl) {
          updates.avatarUrl = data.avatarUrl;
          console.log(`[Storage] Updating group avatar`);
        }
        
        if (Object.keys(updates).length > 0) {
          const updated = await this.updateContact(existing.id, updates);
          if (updated) {
            return { contact: updated, created: false };
          }
        }
      }
      
      return { contact: existing, created: false };
    }
    
    console.log(`[Storage] Contact not found, creating new contact...`);
    
    try {
      const [contact] = await db
        .insert(contacts)
        .values({ ...data, phoneNumber: normalizedPhone })
        .onConflictDoNothing()
        .returning();
      
      if (contact) {
        console.log(`[Storage] Contact CREATED: id=${contact.id} name="${contact.name}" phone=${contact.phoneNumber}`);
        return { contact, created: true };
      }
      
      console.log(`[Storage] Insert returned empty (conflict?), retrying fetch...`);
      const retryContact = await this.getContactByPhoneAndAccount(data.whatsappAccountId, normalizedPhone);
      if (retryContact) {
        console.log(`[Storage] Contact found on retry: id=${retryContact.id} name="${retryContact.name}"`);
        return { contact: retryContact, created: false };
      }
      
      console.error(`[Storage] CRITICAL: Failed to create or find contact for phone ${normalizedPhone}`);
      throw new Error(`Failed to create or find contact for phone ${normalizedPhone}`);
    } catch (error: any) {
      if (error.code === '23505') {
        console.log(`[Storage] Unique constraint violation (23505), fetching existing...`);
        const retryContact = await this.getContactByPhoneAndAccount(data.whatsappAccountId, normalizedPhone);
        if (retryContact) {
          console.log(`[Storage] Contact found after conflict: id=${retryContact.id}`);
          return { contact: retryContact, created: false };
        }
      }
      console.error(`[Storage] Error creating contact:`, error);
      throw error;
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
    // Check if tag already exists for this contact (prevent duplicates)
    const existing = await db
      .select()
      .from(contactTags)
      .where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)))
      .limit(1);
    
    if (existing.length > 0) {
      return existing[0]; // Return existing instead of creating duplicate
    }
    
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

  async getAllContactTagsByCompany(companyId: string): Promise<ContactTag[]> {
    const result = await db
      .select({ contactTag: contactTags })
      .from(contactTags)
      .innerJoin(contacts, eq(contactTags.contactId, contacts.id))
      .where(eq(contacts.companyId, companyId));
    return result.map((r) => r.contactTag);
  }

  // Conversations
  async deleteConversations(companyId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    let deleted = 0;
    for (const convId of ids) {
      const [conv] = await db.select().from(conversations)
        .where(and(eq(conversations.id, convId), eq(conversations.companyId, companyId)));
      
      if (conv) {
        // Delete related records first to avoid foreign key constraints
        await db.delete(antiSpamLogs).where(eq(antiSpamLogs.conversationId, convId));
        await db.delete(triageSessions).where(eq(triageSessions.conversationId, convId));
        await db.delete(automationExecutions).where(eq(automationExecutions.conversationId, convId));
        await db.delete(robotExecutions).where(eq(robotExecutions.conversationId, convId));
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

    // Execute all queries in parallel for better performance
    const [contactResult, accountResult, assignedToResult, lastMsg, contactTagsList] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.id, conv.contactId)),
      db.select().from(whatsappAccounts).where(eq(whatsappAccounts.id, conv.whatsappAccountId)),
      conv.assignedToUserId 
        ? db.select().from(users).where(eq(users.id, conv.assignedToUserId))
        : Promise.resolve([]),
      this.getLastMessage(id),
      this.getContactTags(conv.contactId),
    ]);

    return {
      ...conv,
      contact: contactResult[0],
      whatsappAccount: accountResult[0],
      assignedTo: assignedToResult[0],
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
    isUnread?: boolean;
    limit?: number;
  }): Promise<ConversationWithDetails[]> {
    // Build conditions for SQL filtering
    const conditions = [eq(conversations.companyId, companyId)];
    
    if (filters?.status) {
      conditions.push(eq(conversations.status, filters.status));
    }
    if (filters?.whatsappAccountId) {
      conditions.push(eq(conversations.whatsappAccountId, filters.whatsappAccountId));
    }
    if (filters?.assignedToUserId) {
      conditions.push(eq(conversations.assignedToUserId, filters.assignedToUserId));
    }
    if (filters?.isUnread !== undefined) {
      conditions.push(eq(conversations.isUnread, filters.isUnread));
    }

    let query = db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.lastMessageAt));
    
    // Apply limit if specified
    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }

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

    // Apply inactivity filters in memory (only for special cases)
    const filtered = allConvs.filter((conv) => {
      // Filtro de inatividade
      if (neverInbound) {
        return conv.lastInboundAt === null;
      }
      
      if (minDays !== undefined || maxDays !== undefined) {
        if (!conv.lastInboundAt) return false;
        const inactiveDays = (now - new Date(conv.lastInboundAt).getTime()) / msPerDay;
        if (minDays !== undefined && inactiveDays < minDays) return false;
        if (maxDays !== undefined && inactiveDays > maxDays) return false;
      }
      
      return true;
    });

    if (filtered.length === 0) return [];

    // OPTIMIZED: Batch fetch all related data in single queries instead of N+1
    const convIds = filtered.map(c => c.id);
    const contactIds = Array.from(new Set(filtered.map(c => c.contactId)));
    const accountIds = Array.from(new Set(filtered.map(c => c.whatsappAccountId)));

    // Fetch all contacts at once
    const allContacts = await db
      .select()
      .from(contacts)
      .where(inArray(contacts.id, contactIds));
    const contactMap = new Map(allContacts.map(c => [c.id, c]));

    // Fetch all WhatsApp accounts at once
    const allAccounts = await db
      .select()
      .from(whatsappAccounts)
      .where(inArray(whatsappAccounts.id, accountIds));
    const accountMap = new Map(allAccounts.map(a => [a.id, a]));

    // Fetch last message for each conversation using a subquery
    const lastMessages = await db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .orderBy(desc(messages.createdAt));
    
    // Group messages by conversation, keep only the latest
    const lastMessageMap = new Map<string, typeof lastMessages[0]>();
    for (const msg of lastMessages) {
      if (!lastMessageMap.has(msg.conversationId)) {
        lastMessageMap.set(msg.conversationId, msg);
      }
    }

    // Fetch all contact tags at once
    const allContactTagRels = await db
      .select()
      .from(contactTags)
      .where(inArray(contactTags.contactId, contactIds));
    
    const tagIds = Array.from(new Set(allContactTagRels.map(ct => ct.tagId)));
    const allTags = tagIds.length > 0 
      ? await db.select().from(tags).where(inArray(tags.id, tagIds))
      : [];
    const tagMap = new Map(allTags.map(t => [t.id, t]));

    // Group tags by contact
    const contactTagsMap = new Map<string, typeof allTags>();
    for (const ct of allContactTagRels) {
      const tag = tagMap.get(ct.tagId);
      if (tag) {
        if (!contactTagsMap.has(ct.contactId)) {
          contactTagsMap.set(ct.contactId, []);
        }
        contactTagsMap.get(ct.contactId)!.push(tag);
      }
    }

    // Build result
    const result: ConversationWithDetails[] = filtered.map(conv => {
      const contact = contactMap.get(conv.contactId);
      const account = accountMap.get(conv.whatsappAccountId);
      const lastMessage = lastMessageMap.get(conv.id);
      const convTags = contactTagsMap.get(conv.contactId) || [];

      return {
        ...conv,
        contact: contact || null,
        whatsappAccount: account || null,
        lastMessage: lastMessage || null,
        tags: convTags,
      } as ConversationWithDetails;
    });

    return result;
  }

  async getOpenConversationByContact(contactId: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.contactId, contactId), eq(conversations.status, "open")));
    return conversation;
  }

  async getOpenConversationByAccountAndContact(whatsappAccountId: string, contactId: string): Promise<Conversation | undefined> {
    // Buscar conversas abertas OU pendentes (ambas são conversas ativas)
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.whatsappAccountId, whatsappAccountId),
        eq(conversations.contactId, contactId),
        or(eq(conversations.status, "open"), eq(conversations.status, "pending"))
      ))
      .orderBy(desc(conversations.updatedAt))
      .limit(1);
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

  async getOrCreateConversation(data: InsertConversation): Promise<{ conversation: Conversation; created: boolean }> {
    const existing = await this.getOpenConversationByAccountAndContact(data.whatsappAccountId, data.contactId);
    if (existing) {
      return { conversation: existing, created: false };
    }
    
    try {
      const [conversation] = await db
        .insert(conversations)
        .values(data)
        .onConflictDoNothing()
        .returning();
      
      if (conversation) {
        return { conversation, created: true };
      }
      
      const retryConversation = await this.getOpenConversationByAccountAndContact(data.whatsappAccountId, data.contactId);
      if (retryConversation) {
        return { conversation: retryConversation, created: false };
      }
      
      throw new Error(`Failed to create or find conversation for contact ${data.contactId}`);
    } catch (error: any) {
      if (error.code === '23505') {
        const retryConversation = await this.getOpenConversationByAccountAndContact(data.whatsappAccountId, data.contactId);
        if (retryConversation) {
          return { conversation: retryConversation, created: false };
        }
      }
      throw error;
    }
  }

  // Messages
  async createMessage(data: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    
    // Atualiza conversa: se incoming = não lida
    // Marcar como lida acontece apenas quando o usuário ABRE a conversa (via endpoint mark-read)
    const updateData: Record<string, any> = { 
      lastMessageAt: new Date(), 
      updatedAt: new Date() 
    };
    
    // Mensagem do cliente (incoming) = marcar como não lida
    if (data.direction === "incoming") {
      updateData.isUnread = true;
    }
    // Mensagens outgoing NÃO alteram status de lido - só abrir a conversa marca como lida
    
    await db
      .update(conversations)
      .set(updateData)
      .where(eq(conversations.id, data.conversationId));

    return message;
  }

  async getMessages(conversationId: string, options?: { limit?: number; before?: string }): Promise<{ messages: MessageWithSender[]; hasMore: boolean }> {
    const limit = options?.limit || 50;
    
    // Build query conditions
    const conditions = [eq(messages.conversationId, conversationId)];
    
    if (options?.before) {
      // Get the createdAt of the "before" message
      const [beforeMsg] = await db.select().from(messages).where(eq(messages.id, options.before));
      if (beforeMsg) {
        conditions.push(sql`${messages.createdAt} < ${beforeMsg.createdAt}`);
      }
    }
    
    // Get limit + 1 to check if there are more messages
    const msgs = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);
    
    const hasMore = msgs.length > limit;
    const messagesToReturn = hasMore ? msgs.slice(0, limit) : msgs;
    
    // Get unique sender IDs to batch fetch
    const senderIds = Array.from(new Set(messagesToReturn.filter(m => m.senderUserId).map(m => m.senderUserId!)));
    const senders = senderIds.length > 0 
      ? await db.select().from(users).where(inArray(users.id, senderIds))
      : [];
    const senderMap = new Map(senders.map(s => [s.id, s]));

    const result: MessageWithSender[] = messagesToReturn.map(msg => ({
      ...msg,
      sender: msg.senderUserId ? senderMap.get(msg.senderUserId) : undefined,
    }));
    
    // Return in chronological order (oldest first)
    return { messages: result.reverse(), hasMore };
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
    return db.select().from(macros).where(eq(macros.companyId, companyId)).orderBy(asc(macros.sortOrder), asc(macros.createdAt));
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

  async reorderMacros(companyId: string, macroIds: string[]): Promise<Macro[]> {
    const result: Macro[] = [];
    for (let i = 0; i < macroIds.length; i++) {
      const [macro] = await db
        .update(macros)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(macros.id, macroIds[i]), eq(macros.companyId, companyId)))
        .returning();
      if (macro) result.push(macro);
    }
    return result;
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
    // Obtém a conversa atual para saber o stage anterior e o contactId
    const [currentConv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!currentConv) return undefined;

    const contactId = currentConv.contactId;
    const oldStageId = currentConv.stageId;

    // Busca a tag do stage anterior (se existir)
    let oldTagId: string | null = null;
    if (oldStageId) {
      const [oldStage] = await db.select().from(stages).where(eq(stages.id, oldStageId));
      if (oldStage?.tagId) {
        oldTagId = oldStage.tagId;
      }
    }

    // Busca a tag do novo stage (se existir)
    let newTagId: string | null = null;
    if (stageId) {
      const [newStage] = await db.select().from(stages).where(eq(stages.id, stageId));
      if (newStage?.tagId) {
        newTagId = newStage.tagId;
      }
    }

    // Remove a tag do stage anterior do contato (se diferente da nova)
    if (oldTagId && oldTagId !== newTagId) {
      await db.delete(contactTags).where(
        and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, oldTagId))
      );
    }

    // Adiciona a tag do novo stage ao contato (se não existir)
    if (newTagId && newTagId !== oldTagId) {
      const existingTag = await db.select().from(contactTags)
        .where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, newTagId)));
      if (existingTag.length === 0) {
        await db.insert(contactTags).values({ contactId, tagId: newTagId });
      }
    }

    // Atualiza o stage da conversa (e stageEnteredAt se mudou de stage)
    const updateData: any = { stageId, updatedAt: new Date() };
    if (stageId !== oldStageId) {
      updateData.stageEnteredAt = new Date();
    }
    const [conversation] = await db
      .update(conversations)
      .set(updateData)
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

  // Contact Attribute Counts
  async getContactAttributeCounts(contactId: string): Promise<ContactAttributeCount[]> {
    return db.select().from(contactAttributeCounts)
      .where(eq(contactAttributeCounts.contactId, contactId));
  }

  async incrementContactAttributeCount(contactId: string, attributeName: string): Promise<ContactAttributeCount> {
    // Check if count record exists
    const [existing] = await db.select().from(contactAttributeCounts)
      .where(and(
        eq(contactAttributeCounts.contactId, contactId),
        eq(contactAttributeCounts.attributeName, attributeName)
      ));

    if (existing) {
      // Increment existing count
      const [updated] = await db.update(contactAttributeCounts)
        .set({ 
          count: existing.count + 1,
          updatedAt: new Date()
        })
        .where(eq(contactAttributeCounts.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new count record with count = 1
      const [created] = await db.insert(contactAttributeCounts)
        .values({
          contactId,
          attributeName,
          count: 1,
        })
        .returning();
      return created;
    }
  }

  async resetContactAttributeCount(contactId: string, attributeName: string): Promise<void> {
    await db.delete(contactAttributeCounts)
      .where(and(
        eq(contactAttributeCounts.contactId, contactId),
        eq(contactAttributeCounts.attributeName, attributeName)
      ));
  }

  async resetAllContactAttributeCounts(contactId: string): Promise<void> {
    await db.delete(contactAttributeCounts)
      .where(eq(contactAttributeCounts.contactId, contactId));
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
        eq(triageSessions.state, "awaiting_choice")
      ));
    return session;
  }

  async getActiveSessionByConversation(conversationId: string): Promise<TriageSession | undefined> {
    return this.getActiveTriageSession(conversationId);
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
    // Note: automationExecutions doesn't have companyId, get all and filter or use join
    let query = db.select().from(automationExecutions)
      .orderBy(desc(automationExecutions.createdAt));
    
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

  // Robots (Auto Atendimento)
  async createRobot(data: InsertRobot): Promise<Robot> {
    const [robot] = await db.insert(robots).values(data).returning();
    return robot;
  }

  async getRobot(id: string): Promise<Robot | undefined> {
    const [robot] = await db.select().from(robots).where(eq(robots.id, id));
    return robot;
  }

  async getRobots(companyId: string): Promise<Robot[]> {
    return db.select().from(robots)
      .where(eq(robots.companyId, companyId))
      .orderBy(desc(robots.createdAt));
  }

  async updateRobot(id: string, data: Partial<InsertRobot>): Promise<Robot | undefined> {
    const [robot] = await db
      .update(robots)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(robots.id, id))
      .returning();
    return robot;
  }

  async deleteRobot(id: string): Promise<void> {
    // Delete robot executions first (foreign key constraint)
    await db.delete(robotExecutions).where(eq(robotExecutions.robotId, id));
    await db.delete(robots).where(eq(robots.id, id));
  }

  // Backup - Batch delete by company
  async deleteTagsByCompany(companyId: string): Promise<void> {
    const companyTags = await this.getTags(companyId);
    for (const tag of companyTags) {
      await db.delete(contactTags).where(eq(contactTags.tagId, tag.id));
    }
    await db.delete(tags).where(eq(tags.companyId, companyId));
  }

  async deleteContactAttributesByCompany(companyId: string): Promise<void> {
    await db.delete(contactAttributes).where(eq(contactAttributes.companyId, companyId));
  }

  async deleteStagesByCompany(companyId: string): Promise<void> {
    await db.delete(stages).where(eq(stages.companyId, companyId));
  }

  async deleteCannedResponsesByCompany(companyId: string): Promise<void> {
    await db.delete(cannedResponses).where(eq(cannedResponses.companyId, companyId));
  }

  async deleteMacrosByCompany(companyId: string): Promise<void> {
    const companyMacros = await this.getMacros(companyId);
    for (const macro of companyMacros) {
      await db.delete(macroExecutions).where(eq(macroExecutions.macroId, macro.id));
    }
    await db.delete(macros).where(eq(macros.companyId, companyId));
  }

  async deleteWebhooksByCompany(companyId: string): Promise<void> {
    await db.delete(webhookConfigs).where(eq(webhookConfigs.companyId, companyId));
  }

  async deleteRobotsByCompany(companyId: string): Promise<void> {
    const companyRobots = await this.getRobots(companyId);
    for (const robot of companyRobots) {
      await db.delete(robotExecutions).where(eq(robotExecutions.robotId, robot.id));
    }
    await db.delete(robots).where(eq(robots.companyId, companyId));
  }

  async deleteTriageMenusByCompany(companyId: string): Promise<void> {
    const menus = await this.getTriageMenus(companyId);
    for (const menu of menus) {
      await db.delete(triageSessions).where(eq(triageSessions.menuId, menu.id));
    }
    await db.delete(triageMenus).where(eq(triageMenus.companyId, companyId));
  }

  async deleteDepartmentsByCompany(companyId: string): Promise<void> {
    const deps = await this.getDepartments(companyId);
    for (const dep of deps) {
      await db.delete(departmentAgents).where(eq(departmentAgents.departmentId, dep.id));
    }
    await db.delete(departments).where(eq(departments.companyId, companyId));
  }

  async deleteAutomationRulesByCompany(companyId: string): Promise<void> {
    const rules = await this.getAutomationRules(companyId);
    for (const rule of rules) {
      await db.delete(automationExecutions).where(eq(automationExecutions.ruleId, rule.id));
    }
    await db.delete(automationRules).where(eq(automationRules.companyId, companyId));
  }
}

export const storage = new DatabaseStorage();
