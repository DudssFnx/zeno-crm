import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  companies, users, whatsappAccounts, contacts, tags, contactTags,
  conversations, messages, webhookConfigs, automationLogs, cannedResponses,
  macros, macroExecutions,
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
  deleteContact(id: string): Promise<void>;
  deleteContacts(ids: string[]): Promise<void>;

  // Tags
  createTag(data: InsertTag): Promise<Tag>;
  getTag(id: string): Promise<Tag | undefined>;
  getTags(companyId: string): Promise<Tag[]>;
  updateTag(id: string, data: Partial<InsertTag>): Promise<Tag | undefined>;
  deleteTag(id: string): Promise<void>;

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
    // REGRA: Sempre normalizar o número para garantir formato consistente
    const normalizedInput = normalizePhone(phoneNumber);
    
    // Get all contacts for this company and find match
    const allContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.companyId, companyId));
    
    // Find contact where normalized phone numbers match
    const contact = allContacts.find(c => {
      const normalizedStored = normalizePhone(c.phoneNumber);
      // Comparação exata após normalização
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

  async deleteContact(id: string): Promise<void> {
    // Find all conversations for this contact
    const contactConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.contactId, id));
    
    // Delete messages for each conversation
    for (const conv of contactConversations) {
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
    }
    
    // Delete conversations
    await db.delete(conversations).where(eq(conversations.contactId, id));
    
    // Delete related contact_tags
    await db.delete(contactTags).where(eq(contactTags.contactId, id));
    
    // Finally delete the contact
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
    return db.select().from(tags).where(eq(tags.companyId, companyId));
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
      // Verify conversation belongs to company
      const [conv] = await db.select().from(conversations)
        .where(and(eq(conversations.id, convId), eq(conversations.companyId, companyId)));
      
      if (conv) {
        // Delete messages first
        await db.delete(messages).where(eq(messages.conversationId, convId));
        // Delete conversation
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
  }): Promise<ConversationWithDetails[]> {
    let query = db
      .select()
      .from(conversations)
      .where(eq(conversations.companyId, companyId))
      .orderBy(desc(conversations.lastMessageAt));

    const allConvs = await query;

    const filtered = allConvs.filter((conv) => {
      if (filters?.status && conv.status !== filters.status) return false;
      if (filters?.whatsappAccountId && conv.whatsappAccountId !== filters.whatsappAccountId) return false;
      if (filters?.assignedToUserId && conv.assignedToUserId !== filters.assignedToUserId) return false;
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
}

export const storage = new DatabaseStorage();
