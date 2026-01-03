import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
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
  attributes: text("attributes").array(), // Array de atributos (máximo 3)
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

// Contact Attribute (customizable per company)
export const contactAttributes = pgTable("contact_attributes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(), // Display name (e.g., "CLIENTE", "FORNECEDOR")
  color: text("color").notNull().default("#6B7280"), // Badge color
  displayOrder: text("display_order"), // Optional ordering
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contactAttributesRelations = relations(contactAttributes, ({ one }) => ({
  company: one(companies, { fields: [contactAttributes.companyId], references: [companies.id] }),
}));

export const insertContactAttributeSchema = createInsertSchema(contactAttributes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContactAttribute = z.infer<typeof insertContactAttributeSchema>;
export type ContactAttribute = typeof contactAttributes.$inferSelect;

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

// Contact Attribute Counts (tracks how many times each attribute was applied)
export const contactAttributeCounts = pgTable("contact_attribute_counts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  attributeName: text("attribute_name").notNull(), // The attribute name (e.g., "CLIENTE ATIVO")
  count: integer("count").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contactAttributeCountsRelations = relations(contactAttributeCounts, ({ one }) => ({
  contact: one(contacts, { fields: [contactAttributeCounts.contactId], references: [contacts.id] }),
}));

export const insertContactAttributeCountSchema = createInsertSchema(contactAttributeCounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContactAttributeCount = z.infer<typeof insertContactAttributeCountSchema>;
export type ContactAttributeCount = typeof contactAttributeCounts.$inferSelect;

// Conversation
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  whatsappAccountId: varchar("whatsapp_account_id").notNull().references(() => whatsappAccounts.id),
  contactId: varchar("contact_id").notNull().references(() => contacts.id),
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
  stageId: varchar("stage_id"), // Kanban stage (references stages.id)
  status: text("status").notNull().default("pending"), // pending | open | resolved | closed
  inbox: text("inbox").notNull().default("whatsapp"),
  isUnread: boolean("is_unread").notNull().default(false), // Marcado como não lido (fica no topo)
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  lastInboundAt: timestamp("last_inbound_at"), // Última msg RECEBIDA do cliente (para follow-up)
  lastOutboundAt: timestamp("last_outbound_at"), // Última msg ENVIADA por nós
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
  sortOrder: integer("sort_order").default(0),
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
  attributes: text("attributes").array(), // Array de atributos (máximo 3)
  tagIds: text("tag_ids").array(), // Array de IDs de etiquetas a aplicar
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
  tagId: varchar("tag_id").references(() => tags.id), // Tag associada ao estágio
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stagesRelations = relations(stages, ({ one }) => ({
  company: one(companies, { fields: [stages.companyId], references: [companies.id] }),
  tag: one(tags, { fields: [stages.tagId], references: [tags.id] }),
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
  z.object({ type: z.literal("REMOVE_ALL_TAGS") }),
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

// ============ AUTOMAÇÃO HÍBRIDA (Anti-Ban + Triagem Inteligente) ============

// Setores/Departamentos para roteamento
export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(), // Vendas, Financeiro, Suporte, etc.
  description: text("description"),
  keywords: text("keywords").array(), // Palavras-chave para roteamento automático
  isDefault: boolean("is_default").notNull().default(false), // Setor padrão
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Fila de atendentes por setor (para round-robin)
export const departmentAgents = pgTable("department_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  departmentId: varchar("department_id").notNull().references(() => departments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
  lastAssignedAt: timestamp("last_assigned_at"), // Para round-robin
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Menu de triagem configurável
export const triageMenus = pgTable("triage_menus", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  whatsappAccountId: varchar("whatsapp_account_id").references(() => whatsappAccounts.id),
  name: text("name").notNull(),
  welcomeMessage: text("welcome_message").notNull(), // "Olá! Como posso te ajudar hoje?"
  options: jsonb("options").notNull().default([]), // [{key: "1", label: "Vendas", departmentId: "...", keywords: ["comprar","preço"]}]
  humanOptionKey: text("human_option_key").default("0"), // Tecla para falar com humano
  invalidMessage: text("invalid_message").default("Desculpe, não entendi. Por favor, escolha uma opção válida."),
  timeoutMinutes: integer("timeout_minutes").default(30), // Timeout da sessão
  isActive: boolean("is_active").notNull().default(true),
  triggerOnFirstMessage: boolean("trigger_on_first_message").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sessão de triagem por conversa
export const triageSessions = pgTable("triage_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  menuId: varchar("menu_id").notNull().references(() => triageMenus.id),
  state: text("state").notNull().default("awaiting_choice"), // awaiting_choice | routed | human_handoff | expired
  chosenOption: text("chosen_option"),
  departmentId: varchar("department_id").references(() => departments.id),
  invalidAttempts: integer("invalid_attempts").notNull().default(0), // Count of invalid option attempts
  menuSentAt: timestamp("menu_sent_at").defaultNow().notNull(),
  lastInteractionAt: timestamp("last_interaction_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Regras de automação Zoho-like
export const automationRules = pgTable("automation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  description: text("description"),
  triggerEvent: text("trigger_event").notNull(), // message_received | conversation_created | tag_added | stage_changed | inactivity
  triggerFilters: jsonb("trigger_filters").default({}), // {tagId: "...", stageId: "...", inactivityDays: 3}
  conditions: jsonb("conditions").default([]), // [{field: "message", operator: "contains", value: "boleto"}]
  actions: jsonb("actions").notNull().default([]), // [{type: "add_tag", tagId: "..."}, {type: "assign_department", departmentId: "..."}]
  priority: integer("priority").default(0), // Maior = executa primeiro
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Log de execução de automações
export const automationExecutions = pgTable("automation_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: varchar("rule_id").references(() => automationRules.id),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  contactId: varchar("contact_id").references(() => contacts.id),
  triggerEvent: text("trigger_event").notNull(),
  actionsExecuted: jsonb("actions_executed").default([]),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Controle anti-spam (evita banimento)
export const antiSpamLogs = pgTable("anti_spam_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  messageHash: text("message_hash").notNull(), // Hash do conteúdo para evitar repetição
  messageType: text("message_type").notNull(), // triage_menu | auto_reply | rule_action
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  delayUsedMs: integer("delay_used_ms"), // Delay aplicado
});

// Mensagens agendadas
export const scheduledMessages = pgTable("scheduled_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  contactId: varchar("contact_id").references(() => contacts.id),
  whatsappAccountId: varchar("whatsapp_account_id").references(() => whatsappAccounts.id),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | failed | cancelled
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const departmentsRelations = relations(departments, ({ one, many }) => ({
  company: one(companies, { fields: [departments.companyId], references: [companies.id] }),
  agents: many(departmentAgents),
}));

export const departmentAgentsRelations = relations(departmentAgents, ({ one }) => ({
  department: one(departments, { fields: [departmentAgents.departmentId], references: [departments.id] }),
  user: one(users, { fields: [departmentAgents.userId], references: [users.id] }),
}));

export const triageMenusRelations = relations(triageMenus, ({ one, many }) => ({
  company: one(companies, { fields: [triageMenus.companyId], references: [companies.id] }),
  whatsappAccount: one(whatsappAccounts, { fields: [triageMenus.whatsappAccountId], references: [whatsappAccounts.id] }),
  sessions: many(triageSessions),
}));

export const triageSessionsRelations = relations(triageSessions, ({ one }) => ({
  conversation: one(conversations, { fields: [triageSessions.conversationId], references: [conversations.id] }),
  menu: one(triageMenus, { fields: [triageSessions.menuId], references: [triageMenus.id] }),
  department: one(departments, { fields: [triageSessions.departmentId], references: [departments.id] }),
}));

export const automationRulesRelations = relations(automationRules, ({ one, many }) => ({
  company: one(companies, { fields: [automationRules.companyId], references: [companies.id] }),
  executions: many(automationExecutions),
}));

export const automationExecutionsRelations = relations(automationExecutions, ({ one }) => ({
  rule: one(automationRules, { fields: [automationExecutions.ruleId], references: [automationRules.id] }),
  conversation: one(conversations, { fields: [automationExecutions.conversationId], references: [conversations.id] }),
  contact: one(contacts, { fields: [automationExecutions.contactId], references: [contacts.id] }),
}));

export const scheduledMessagesRelations = relations(scheduledMessages, ({ one }) => ({
  company: one(companies, { fields: [scheduledMessages.companyId], references: [companies.id] }),
  conversation: one(conversations, { fields: [scheduledMessages.conversationId], references: [conversations.id] }),
  contact: one(contacts, { fields: [scheduledMessages.contactId], references: [contacts.id] }),
  whatsappAccount: one(whatsappAccounts, { fields: [scheduledMessages.whatsappAccountId], references: [whatsappAccounts.id] }),
  createdByUser: one(users, { fields: [scheduledMessages.createdBy], references: [users.id] }),
}));

// ============ Types & Schemas ============

// Tipos de eventos de trigger
export const triggerEvents = [
  "message_received",
  "conversation_created", 
  "tag_added",
  "tag_removed",
  "stage_changed",
  "inactivity",
  "assignment_changed",
] as const;

export type TriggerEvent = typeof triggerEvents[number];

// Tipos de ações de automação
export const automationActionTypes = [
  "add_tag",
  "remove_tag",
  "set_stage",
  "assign_department",
  "assign_agent",
  "send_message",
  "notify_operator",
  "set_status",
] as const;

export type AutomationActionType = typeof automationActionTypes[number];

// Schema de opção do menu de triagem
export const triageOptionSchema = z.object({
  key: z.string(), // "1", "2", "3", etc.
  label: z.string(), // "Vendas", "Financeiro", etc.
  response: z.string().optional(), // Mensagem automática enviada quando o cliente escolhe essa opção
  departmentId: z.string().optional(),
  keywords: z.array(z.string()).optional(), // Palavras-chave alternativas
  stageId: z.string().optional(), // Move para stage específico
  tagId: z.string().optional(), // Adiciona tag
});

export type TriageOption = z.infer<typeof triageOptionSchema>;

// Schema de condição de automação
export const automationConditionSchema = z.object({
  field: z.string(), // "message", "tag", "stage", "department", "contact.attributes"
  operator: z.enum(["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"]),
  value: z.string(),
});

export type AutomationCondition = z.infer<typeof automationConditionSchema>;

// Schema de ação de automação
export const automationActionSchema = z.object({
  type: z.enum(["add_tag", "remove_tag", "set_stage", "assign_department", "assign_agent", "send_message", "notify_operator", "set_status"]),
  tagId: z.string().optional(),
  stageId: z.string().optional(),
  departmentId: z.string().optional(),
  userId: z.string().optional(),
  message: z.string().optional(),
  status: z.string().optional(),
});

export type AutomationAction = z.infer<typeof automationActionSchema>;

// Configuração de nó ASSIGN_QUEUE/ASSIGN_AGENT
export const assignConfigSchema = z.object({
  userId: z.string().optional(), // Para ASSIGN_AGENT
  queueName: z.string().optional(), // Para ASSIGN_QUEUE
});

// Configuração de nó SEND_MEDIA
export const sendMediaConfigSchema = z.object({
  mediaUrl: z.string(),
  mediaType: z.enum(["image", "video", "audio", "document"]),
  caption: z.string().optional(),
});

// Configuração de nó HANDOFF_TO_HUMAN
export const handoffConfigSchema = z.object({
  message: z.string().optional(), // Mensagem antes do handoff
  assignToUserId: z.string().optional(), // Atribuir a um agente específico
});

// Menu option type (para ASK_INPUT com menu)
export const menuOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  nextStepId: z.string().optional(),
  tagId: z.string().optional(),
  assignUserId: z.string().optional(),
  setStatus: z.enum(["open", "pending", "resolved"]).optional(),
});

export type MenuOption = z.infer<typeof menuOptionSchema>;

// ============ Insert Schemas ============

export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

export const insertDepartmentAgentSchema = createInsertSchema(departmentAgents).omit({ id: true, createdAt: true });
export type InsertDepartmentAgent = z.infer<typeof insertDepartmentAgentSchema>;
export type DepartmentAgent = typeof departmentAgents.$inferSelect;

export const insertTriageMenuSchema = createInsertSchema(triageMenus).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTriageMenu = z.infer<typeof insertTriageMenuSchema>;
export type TriageMenu = typeof triageMenus.$inferSelect;

export const insertTriageSessionSchema = createInsertSchema(triageSessions).omit({ id: true, menuSentAt: true, lastInteractionAt: true, completedAt: true });
export type InsertTriageSession = z.infer<typeof insertTriageSessionSchema>;
export type TriageSession = typeof triageSessions.$inferSelect;

export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type AutomationRule = typeof automationRules.$inferSelect;

export const insertAutomationExecutionSchema = createInsertSchema(automationExecutions).omit({ id: true, createdAt: true });
export type InsertAutomationExecution = z.infer<typeof insertAutomationExecutionSchema>;
export type AutomationExecution = typeof automationExecutions.$inferSelect;

export const insertAntiSpamLogSchema = createInsertSchema(antiSpamLogs).omit({ id: true, sentAt: true });
export type InsertAntiSpamLog = z.infer<typeof insertAntiSpamLogSchema>;
export type AntiSpamLog = typeof antiSpamLogs.$inferSelect;

export const insertScheduledMessageSchema = createInsertSchema(scheduledMessages).omit({ id: true, createdAt: true, sentAt: true });
export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;

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

// ============ Robô (Auto Atendimento Scripts) ============

// Ações disponíveis no robô
export const robotActionSchema = z.object({
  id: z.string(),
  type: z.enum([
    "send_text",        // Enviar texto
    "send_image",       // Enviar imagem
    "send_audio",       // Enviar áudio
    "send_video",       // Enviar vídeo
    "send_document",    // Enviar documento
    "simulate_typing",  // Simular digitando
    "simulate_recording", // Simular gravando áudio
    "delay",            // Aguardar tempo
    "add_tag",          // Adicionar tag
    "remove_tag",       // Remover tag
    "remove_all_tags",  // Remover todas as tags
    "set_status",       // Alterar status da conversa
    "assign_agent",     // Atribuir atendente
    "transfer",         // Transferir atendimento
  ]),
  // Campos específicos por tipo de ação
  content: z.string().optional(),         // Texto da mensagem ou URL do arquivo
  mediaUrl: z.string().optional(),        // URL do arquivo de mídia
  fileName: z.string().optional(),        // Nome do arquivo
  delayMs: z.number().optional(),         // Delay em ms (para delay/simulate)
  tagId: z.string().optional(),           // ID da tag
  status: z.enum(["open", "pending", "resolved"]).optional(),
  agentId: z.string().optional(),         // ID do agente
  departmentId: z.string().optional(),    // ID do departamento para transferência
});

export type RobotAction = z.infer<typeof robotActionSchema>;

// Tabela de robôs
export const robots = pgTable("robots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  description: text("description"),
  actions: jsonb("actions").notNull().default([]), // Array de RobotAction
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Execuções de robô
export const robotExecutions = pgTable("robot_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  robotId: varchar("robot_id").notNull().references(() => robots.id),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  executedBy: varchar("executed_by").references(() => users.id),
  status: text("status").notNull().default("running"), // running | completed | failed | cancelled
  currentActionIndex: integer("current_action_index").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertRobotSchema = createInsertSchema(robots).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRobot = z.infer<typeof insertRobotSchema>;
export type Robot = typeof robots.$inferSelect;

export const insertRobotExecutionSchema = createInsertSchema(robotExecutions).omit({ id: true, startedAt: true, completedAt: true });
export type InsertRobotExecution = z.infer<typeof insertRobotExecutionSchema>;
export type RobotExecution = typeof robotExecutions.$inferSelect;
