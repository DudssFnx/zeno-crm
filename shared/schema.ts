import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Company
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  whatsappAccounts: many(whatsappAccounts),
  contacts: many(contacts),
  tags: many(tags),
  conversations: many(conversations),
  webhookConfigs: many(webhookConfigs),
}));

// User
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("operator"), // master | admin | operator
  displayName: text("display_name"), // Name shown in messages
  prefixMode: text("prefix_mode").notNull().default("prefix"), // prefix | firstLine | none
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, { fields: [users.companyId], references: [companies.id] }),
  assignedConversations: many(conversations),
  sentMessages: many(messages),
}));

// WhatsApp Account
export const whatsappAccounts = pgTable("whatsapp_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  status: text("status").notNull().default("disconnected"), // connected | disconnected | pending_qr | error
  lastConnectionAt: timestamp("last_connection_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const whatsappAccountsRelations = relations(whatsappAccounts, ({ one, many }) => ({
  company: one(companies, { fields: [whatsappAccounts.companyId], references: [companies.id] }),
  contacts: many(contacts),
  conversations: many(conversations),
}));

// Contact
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  whatsappAccountId: varchar("whatsapp_account_id").references(() => whatsappAccounts.id),
  name: text("name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  avatarUrl: text("avatar_url"),
  avatarUpdatedAt: timestamp("avatar_updated_at"),
  notes: text("notes"),
  attribute: text("attribute"), // CLIENTE | FORNECEDOR | etc. - shown as badge
  source: text("source").default("whatsapp"), // whatsapp | instagram | site | google | manual
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  whatsappAccount: one(whatsappAccounts, { fields: [contacts.whatsappAccountId], references: [whatsappAccounts.id] }),
  contactTags: many(contactTags),
  conversations: many(conversations),
}));

// Tag
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6B7280"),
  stageOrder: text("stage_order"), // Order for Kanban stages (1, 2, 3, etc.)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tagsRelations = relations(tags, ({ one, many }) => ({
  company: one(companies, { fields: [tags.companyId], references: [companies.id] }),
  contactTags: many(contactTags),
}));

// Contact Tag (junction)
export const contactTags = pgTable("contact_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, { fields: [contactTags.contactId], references: [contacts.id] }),
  tag: one(tags, { fields: [contactTags.tagId], references: [tags.id] }),
}));

// Conversation
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  whatsappAccountId: varchar("whatsapp_account_id").notNull().references(() => whatsappAccounts.id),
  contactId: varchar("contact_id").notNull().references(() => contacts.id),
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
  stageId: varchar("stage_id"), // Kanban stage (references stages.id)
  status: text("status").notNull().default("open"), // open | pending | resolved | closed
  inbox: text("inbox").notNull().default("whatsapp"),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  company: one(companies, { fields: [conversations.companyId], references: [companies.id] }),
  whatsappAccount: one(whatsappAccounts, { fields: [conversations.whatsappAccountId], references: [whatsappAccounts.id] }),
  contact: one(contacts, { fields: [conversations.contactId], references: [contacts.id] }),
  assignedTo: one(users, { fields: [conversations.assignedToUserId], references: [users.id] }),
  messages: many(messages),
}));

// Message
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(), // incoming | outgoing | internal_note
  senderUserId: varchar("sender_user_id").references(() => users.id),
  senderDisplayName: text("sender_display_name"), // Agent display name snapshot
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"), // text | image | audio | document | video
  fileName: text("file_name"),
  mimetype: text("mimetype"),
  fileSize: text("file_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  sender: one(users, { fields: [messages.senderUserId], references: [users.id] }),
}));

// Webhook Config
export const webhookConfigs = pgTable("webhook_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  url: text("url").notNull(),
  secret: text("secret"),
  events: jsonb("events").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const webhookConfigsRelations = relations(webhookConfigs, ({ one }) => ({
  company: one(companies, { fields: [webhookConfigs.companyId], references: [companies.id] }),
}));

// Automation Log
export const automationLogs = pgTable("automation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  type: text("type").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull(), // success | error
  responseStatusCode: text("response_status_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Macros (atalhos com ações automáticas)
export const macros = pgTable("macros", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  description: text("description"),
  messageTemplate: text("message_template"),
  actions: jsonb("actions").notNull().default([]), // [{type: "ADD_TAG", tagId}, {type: "REMOVE_TAG", tagId}, {type: "SET_STATUS", status}]
  isGlobal: boolean("is_global").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const macrosRelations = relations(macros, ({ one, many }) => ({
  company: one(companies, { fields: [macros.companyId], references: [companies.id] }),
  creator: one(users, { fields: [macros.createdBy], references: [users.id] }),
  executions: many(macroExecutions),
}));

// Macro Executions (log de execuções)
export const macroExecutions = pgTable("macro_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  macroId: varchar("macro_id").notNull().references(() => macros.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").notNull(),
  contactId: varchar("contact_id").references(() => contacts.id),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  renderedMessage: text("rendered_message"),
  actionsApplied: jsonb("actions_applied").notNull().default([]),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
});

export const macroExecutionsRelations = relations(macroExecutions, ({ one }) => ({
  macro: one(macros, { fields: [macroExecutions.macroId], references: [macros.id] }),
  contact: one(contacts, { fields: [macroExecutions.contactId], references: [contacts.id] }),
  conversation: one(conversations, { fields: [macroExecutions.conversationId], references: [conversations.id] }),
  user: one(users, { fields: [macroExecutions.userId], references: [users.id] }),
}));

// Canned Responses (Respostas Rápidas)
export const cannedResponses = pgTable("canned_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  shortcut: text("shortcut").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cannedResponsesRelations = relations(cannedResponses, ({ one }) => ({
  company: one(companies, { fields: [cannedResponses.companyId], references: [companies.id] }),
}));

// Kanban Stages (Estágios do Funil)
export const stages = pgTable("stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6B7280"),
  order: text("order").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stagesRelations = relations(stages, ({ one }) => ({
  company: one(companies, { fields: [stages.companyId], references: [companies.id] }),
}));

// Insert schemas
export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappAccountSchema = createInsertSchema(whatsappAccounts).omit({ id: true, createdAt: true, updatedAt: true, lastConnectionAt: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTagSchema = createInsertSchema(tags).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContactTagSchema = createInsertSchema(contactTags).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, updatedAt: true, lastMessageAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertWebhookConfigSchema = createInsertSchema(webhookConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAutomationLogSchema = createInsertSchema(automationLogs).omit({ id: true, createdAt: true });
export const insertCannedResponseSchema = createInsertSchema(cannedResponses).omit({ id: true, createdAt: true });
export const insertMacroSchema = createInsertSchema(macros).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMacroExecutionSchema = createInsertSchema(macroExecutions).omit({ id: true, executedAt: true });
export const insertStageSchema = createInsertSchema(stages).omit({ id: true, createdAt: true, updatedAt: true });

// Macro action types
export const macroActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ADD_TAG"), tagId: z.string() }),
  z.object({ type: z.literal("REMOVE_TAG"), tagId: z.string() }),
  z.object({ type: z.literal("SET_STATUS"), status: z.enum(["open", "pending", "resolved", "closed"]) }),
  z.object({ type: z.literal("ASSIGN_AGENT"), agentId: z.string().optional() }),
  z.object({ type: z.literal("SEND_MESSAGE"), message: z.string() }),
  z.object({ type: z.literal("SET_ATTRIBUTE"), attribute: z.string() }),
]);

export type MacroAction = z.infer<typeof macroActionSchema>;

// Types
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type WhatsappAccount = typeof whatsappAccounts.$inferSelect;
export type InsertWhatsappAccount = z.infer<typeof insertWhatsappAccountSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

export type ContactTag = typeof contactTags.$inferSelect;
export type InsertContactTag = z.infer<typeof insertContactTagSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type InsertWebhookConfig = z.infer<typeof insertWebhookConfigSchema>;

export type AutomationLog = typeof automationLogs.$inferSelect;
export type InsertAutomationLog = z.infer<typeof insertAutomationLogSchema>;

export type CannedResponse = typeof cannedResponses.$inferSelect;
export type InsertCannedResponse = z.infer<typeof insertCannedResponseSchema>;

export type Macro = typeof macros.$inferSelect;
export type InsertMacro = z.infer<typeof insertMacroSchema>;

export type MacroExecution = typeof macroExecutions.$inferSelect;
export type InsertMacroExecution = z.infer<typeof insertMacroExecutionSchema>;

export type Stage = typeof stages.$inferSelect;
export type InsertStage = z.infer<typeof insertStageSchema>;

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  companyName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

// Extended types for frontend
export type ConversationWithDetails = Conversation & {
  contact: Contact;
  whatsappAccount: WhatsappAccount;
  assignedTo?: User;
  lastMessage?: Message;
  tags?: Tag[];
};

export type ContactWithTags = Contact & {
  tags: Tag[];
};

export type MessageWithSender = Message & {
  sender?: User;
};
