import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { authMiddleware, adminMiddleware, generateToken, hashPassword, comparePassword, type AuthRequest } from "./auth";
import { whatsappGateway } from "./whatsapp-gateway";
import { dispatchWebhook } from "./webhook-dispatcher";
import { registerSchema, loginSchema, insertTagSchema, insertWebhookConfigSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { companyName, name, email, password } = parsed.data;

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const company = await storage.createCompany({ name: companyName });
      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        companyId: company.id,
        name,
        email,
        passwordHash,
        role: "admin",
      });

      const token = generateToken(user);
      res.json({ token, user: { ...user, passwordHash: undefined } });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { email, password } = parsed.data;
      const user = await storage.getUserByEmail(email);
      
      if (!user || !(await comparePassword(password, user.passwordHash))) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const token = generateToken(user);
      res.json({ token, user: { ...user, passwordHash: undefined } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", authMiddleware(storage), async (req: AuthRequest, res) => {
    res.json({ user: { ...req.user, passwordHash: undefined } });
  });

  // Users routes (admin only)
  app.get("/api/users", authMiddleware(storage), async (req: AuthRequest, res) => {
    const users = await storage.getUsers(req.user!.companyId);
    res.json(users.map((u) => ({ ...u, passwordHash: undefined })));
  });

  app.post("/api/users", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, email, password, role } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email and password are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        companyId: req.user!.companyId,
        name,
        email,
        passwordHash,
        role: role || "agent",
      });

      res.json({ ...user, passwordHash: undefined });
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put("/api/users/:id", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, email, password, role } = req.body;
      const updateData: Record<string, any> = {};
      
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (role) updateData.role = role;
      if (password) updateData.passwordHash = await hashPassword(password);

      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ ...user, passwordHash: undefined });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // WhatsApp Accounts routes
  app.get("/api/whatsapp-accounts", authMiddleware(storage), async (req: AuthRequest, res) => {
    const accounts = await storage.getWhatsappAccounts(req.user!.companyId);
    res.json(accounts);
  });

  app.post("/api/whatsapp-accounts", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { name, phoneNumber } = req.body;
      if (!name || !phoneNumber) {
        return res.status(400).json({ message: "Name and phone number are required" });
      }

      const account = await storage.createWhatsappAccount({
        companyId: req.user!.companyId,
        name,
        phoneNumber,
        status: "disconnected",
      });

      res.json(account);
    } catch (error) {
      console.error("Create account error:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.put("/api/whatsapp-accounts/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { name, phoneNumber } = req.body;
      const account = await storage.updateWhatsappAccount(req.params.id, { name, phoneNumber });
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      console.error("Update account error:", error);
      res.status(500).json({ message: "Failed to update account" });
    }
  });

  app.delete("/api/whatsapp-accounts/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      await storage.deleteWhatsappAccount(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  app.post("/api/whatsapp-accounts/:id/start-session", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      await whatsappGateway.startSession(req.params.id);
      await storage.updateWhatsappAccount(req.params.id, { status: "pending_qr" });
      res.json({ success: true });
    } catch (error) {
      console.error("Start session error:", error);
      res.status(500).json({ message: "Failed to start session" });
    }
  });

  app.get("/api/whatsapp-accounts/:id/qr", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { qrData } = await whatsappGateway.getQrCode(req.params.id);
      
      setTimeout(async () => {
        await storage.updateWhatsappAccount(req.params.id, { 
          status: "connected",
          lastConnectionAt: new Date(),
        });
      }, 2000);

      res.json({ qrData });
    } catch (error) {
      console.error("Get QR error:", error);
      res.status(500).json({ message: "Failed to get QR code" });
    }
  });

  app.post("/api/whatsapp-accounts/:id/disconnect", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      await whatsappGateway.disconnectSession(req.params.id);
      await storage.updateWhatsappAccount(req.params.id, { status: "disconnected" });
      res.json({ success: true });
    } catch (error) {
      console.error("Disconnect error:", error);
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });

  // Contacts routes
  app.get("/api/contacts", authMiddleware(storage), async (req: AuthRequest, res) => {
    const contacts = await storage.getContacts(req.user!.companyId);
    res.json(contacts);
  });

  app.get("/api/contacts/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    const contact = await storage.getContactWithTags(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }
    res.json(contact);
  });

  app.put("/api/contacts/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { name, notes, avatarUrl } = req.body;
      const contact = await storage.updateContact(req.params.id, { name, notes, avatarUrl });
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      console.error("Update contact error:", error);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  // Tags routes
  app.get("/api/tags", authMiddleware(storage), async (req: AuthRequest, res) => {
    const tags = await storage.getTags(req.user!.companyId);
    res.json(tags);
  });

  app.post("/api/tags", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { name, color } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const tag = await storage.createTag({
        companyId: req.user!.companyId,
        name,
        color: color || "#3B82F6",
      });

      res.json(tag);
    } catch (error) {
      console.error("Create tag error:", error);
      res.status(500).json({ message: "Failed to create tag" });
    }
  });

  app.put("/api/tags/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { name, color } = req.body;
      const tag = await storage.updateTag(req.params.id, { name, color });
      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }
      res.json(tag);
    } catch (error) {
      console.error("Update tag error:", error);
      res.status(500).json({ message: "Failed to update tag" });
    }
  });

  app.delete("/api/tags/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      await storage.deleteTag(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete tag error:", error);
      res.status(500).json({ message: "Failed to delete tag" });
    }
  });

  // Contact Tags routes
  app.post("/api/contacts/:id/tags", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { tagId } = req.body;
      if (!tagId) {
        return res.status(400).json({ message: "Tag ID is required" });
      }

      const contact = await storage.getContactWithTags(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const oldTags = contact.tags.map((t) => t.id);
      await storage.addContactTag(req.params.id, tagId);
      const updatedContact = await storage.getContactWithTags(req.params.id);
      const newTags = updatedContact!.tags.map((t) => t.id);

      await dispatchWebhook(req.user!.companyId, "contact.tag.changed", {
        contactId: req.params.id,
        oldTags,
        newTags,
        userId: req.user!.id,
      });

      res.json(updatedContact);
    } catch (error) {
      console.error("Add tag error:", error);
      res.status(500).json({ message: "Failed to add tag" });
    }
  });

  app.delete("/api/contacts/:id/tags/:tagId", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const contact = await storage.getContactWithTags(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const oldTags = contact.tags.map((t) => t.id);
      await storage.removeContactTag(req.params.id, req.params.tagId);
      const updatedContact = await storage.getContactWithTags(req.params.id);
      const newTags = updatedContact!.tags.map((t) => t.id);

      await dispatchWebhook(req.user!.companyId, "contact.tag.changed", {
        contactId: req.params.id,
        oldTags,
        newTags,
        userId: req.user!.id,
      });

      res.json(updatedContact);
    } catch (error) {
      console.error("Remove tag error:", error);
      res.status(500).json({ message: "Failed to remove tag" });
    }
  });

  // Conversations routes
  app.get("/api/conversations", authMiddleware(storage), async (req: AuthRequest, res) => {
    const { status, whatsappAccountId, assignedToUserId } = req.query;
    const conversations = await storage.getConversations(req.user!.companyId, {
      status: status as string | undefined,
      whatsappAccountId: whatsappAccountId as string | undefined,
      assignedToUserId: assignedToUserId as string | undefined,
    });
    res.json(conversations);
  });

  app.get("/api/conversations/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    const conversation = await storage.getConversationWithDetails(req.params.id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    res.json(conversation);
  });

  app.post("/api/conversations/:id/assign", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { userId } = req.body;
      const conversation = await storage.updateConversation(req.params.id, {
        assignedToUserId: userId || null,
      });
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      console.error("Assign conversation error:", error);
      res.status(500).json({ message: "Failed to assign conversation" });
    }
  });

  app.post("/api/conversations/:id/status", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;
      const oldConv = await storage.getConversation(req.params.id);
      const oldStatus = oldConv?.status;

      const conversation = await storage.updateConversation(req.params.id, { status });
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      if (oldStatus !== status) {
        await dispatchWebhook(req.user!.companyId, "conversation.status.changed", {
          conversationId: req.params.id,
          oldStatus,
          newStatus: status,
          userId: req.user!.id,
        });
      }

      res.json(conversation);
    } catch (error) {
      console.error("Update status error:", error);
      res.status(500).json({ message: "Failed to update status" });
    }
  });

  // Messages routes
  app.get("/api/conversations/:id/messages", authMiddleware(storage), async (req: AuthRequest, res) => {
    const messages = await storage.getMessages(req.params.id);
    res.json(messages);
  });

  app.post("/api/conversations/:id/messages", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ message: "Content is required" });
      }

      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const contact = await storage.getContact(conversation.contactId);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      await whatsappGateway.sendMessage(
        conversation.whatsappAccountId,
        contact.phoneNumber,
        content
      );

      const message = await storage.createMessage({
        conversationId: req.params.id,
        direction: "outgoing",
        senderUserId: req.user!.id,
        content,
      });

      res.json(message);
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.post("/api/conversations/:id/internal-notes", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ message: "Content is required" });
      }

      const message = await storage.createMessage({
        conversationId: req.params.id,
        direction: "internal_note",
        senderUserId: req.user!.id,
        content,
      });

      res.json(message);
    } catch (error) {
      console.error("Create note error:", error);
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  // Webhooks routes
  app.get("/api/webhooks", authMiddleware(storage), async (req: AuthRequest, res) => {
    const webhooks = await storage.getWebhookConfigs(req.user!.companyId);
    res.json(webhooks);
  });

  app.post("/api/webhooks", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { url, secret, events, isActive } = req.body;
      if (!url || !events || events.length === 0) {
        return res.status(400).json({ message: "URL and at least one event are required" });
      }

      const webhook = await storage.createWebhookConfig({
        companyId: req.user!.companyId,
        url,
        secret: secret || null,
        events,
        isActive: isActive !== false,
      });

      res.json(webhook);
    } catch (error) {
      console.error("Create webhook error:", error);
      res.status(500).json({ message: "Failed to create webhook" });
    }
  });

  app.put("/api/webhooks/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { url, secret, events, isActive } = req.body;
      const updateData: Record<string, any> = {};
      
      if (url !== undefined) updateData.url = url;
      if (secret !== undefined) updateData.secret = secret;
      if (events !== undefined) updateData.events = events;
      if (isActive !== undefined) updateData.isActive = isActive;

      const webhook = await storage.updateWebhookConfig(req.params.id, updateData);
      if (!webhook) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      res.json(webhook);
    } catch (error) {
      console.error("Update webhook error:", error);
      res.status(500).json({ message: "Failed to update webhook" });
    }
  });

  app.delete("/api/webhooks/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      await storage.deleteWebhookConfig(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete webhook error:", error);
      res.status(500).json({ message: "Failed to delete webhook" });
    }
  });

  // Dev endpoint: Simulate incoming message
  app.post("/api/dev/simulate-incoming-message", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { whatsappAccountId, phoneNumber, content } = req.body;
      
      if (!whatsappAccountId || !phoneNumber || !content) {
        return res.status(400).json({ message: "whatsappAccountId, phoneNumber, and content are required" });
      }

      const account = await storage.getWhatsappAccount(whatsappAccountId);
      if (!account) {
        return res.status(404).json({ message: "WhatsApp account not found" });
      }

      let contact = await storage.getContactByPhone(req.user!.companyId, phoneNumber);
      if (!contact) {
        contact = await storage.createContact({
          companyId: req.user!.companyId,
          whatsappAccountId,
          name: phoneNumber,
          phoneNumber,
        });
      }

      let conversation = await storage.getOpenConversationByContact(contact.id);
      if (!conversation) {
        conversation = await storage.createConversation({
          companyId: req.user!.companyId,
          whatsappAccountId,
          contactId: contact.id,
          status: "open",
          inbox: "whatsapp",
        });
      }

      const message = await storage.createMessage({
        conversationId: conversation.id,
        direction: "incoming",
        content,
      });

      await dispatchWebhook(req.user!.companyId, "message.incoming", {
        conversationId: conversation.id,
        contactId: contact.id,
        messageId: message.id,
        content,
        phoneNumber,
      });

      res.json({ contact, conversation, message });
    } catch (error) {
      console.error("Simulate message error:", error);
      res.status(500).json({ message: "Failed to simulate message" });
    }
  });

  return httpServer;
}
