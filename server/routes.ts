import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { authMiddleware, adminMiddleware, generateToken, hashPassword, comparePassword, type AuthRequest } from "./auth";
import { whatsappGateway } from "./whatsapp-gateway";
import { whatsappBaileys } from "./whatsapp-baileys";
import { dispatchWebhook } from "./webhook-dispatcher";
import { loginSchema, insertTagSchema, insertWebhookConfigSchema } from "@shared/schema";
import { normalizePhone, normalizeJid, isValidPhoneNumber } from "./jid-utils";
import * as messageQueue from "./message-queue";

// Seed master user on startup
async function seedMasterUser() {
  const masterEmail = "mike@mike.com.br";
  const existingUser = await storage.getUserByEmail(masterEmail);
  
  if (!existingUser) {
    console.log("Creating master user...");
    const company = await storage.createCompany({ name: "Master Company" });
    const passwordHash = await hashPassword("123456");
    await storage.createUser({
      companyId: company.id,
      name: "Mike",
      email: masterEmail,
      passwordHash,
      role: "master",
      displayName: "Mike",
    });
    console.log("Master user created: mike@mike.com.br / 123456");
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up Socket.IO
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Connect Baileys gateway to Socket.IO
  whatsappBaileys.setSocketServer(io);
  
  // Conectar o módulo de filas ao Socket.IO
  messageQueue.setSocketServer(io);

  // Set up status update handler to sync database with WhatsApp connection status
  whatsappBaileys.setStatusUpdateHandler(async (accountId, status) => {
    try {
      await storage.updateWhatsappAccount(accountId, { status });
      // Atualizar cache
      const account = await storage.getWhatsappAccount(accountId);
      if (account) {
        messageQueue.setAccountInCache(accountId, account);
      }
      console.log(`[WhatsApp] Updated database status for ${accountId}: ${status}`);
    } catch (error) {
      console.error(`[WhatsApp] Failed to update database status for ${accountId}:`, error);
    }
  });

  // HANDLER OTIMIZADO: Emite imediatamente e processa em background
  whatsappBaileys.setMessageHandler(async (accountId, message) => {
    const startTime = Date.now();
    
    try {
      // Verificar se é LID - se for, ignorar (muito lento para resolver)
      if (message.phoneNumber.startsWith("LID_")) {
        console.log(`[FastHandler] Skipping LID message: ${message.phoneNumber}`);
        return;
      }
      
      // Usar o handler rápido que emite imediatamente e processa em background
      await messageQueue.handleMessageFast(accountId, {
        phoneNumber: message.phoneNumber,
        contactName: message.contactName,
        content: message.content,
        direction: message.direction || "incoming",
        senderDisplayName: message.senderDisplayName,
        avatarUrl: message.avatarUrl,
        timestamp: message.timestamp,
      });
      
      console.log(`[FastHandler] Processed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[FastHandler] Error:`, error);
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      console.error("SESSION_SECRET not configured - Socket.IO authentication disabled");
      return next(new Error("Server configuration error"));
    }
    
    try {
      const jwt = await import("jsonwebtoken");
      const decoded = jwt.default.verify(token, sessionSecret) as { userId: string; companyId: string };
      socket.data.userId = decoded.userId;
      socket.data.companyId = decoded.companyId;
      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id, "Company:", socket.data.companyId);
    
    // Join company-specific room for multi-tenant isolation
    const companyRoom = `company:${socket.data.companyId}`;
    socket.join(companyRoom);
    console.log(`Socket ${socket.id} joined room ${companyRoom}`);

    socket.on("whatsapp:join", async (accountId: string) => {
      const account = await storage.getWhatsappAccount(accountId);
      if (!account || account.companyId !== socket.data.companyId) {
        console.log(`Unauthorized join attempt for account ${accountId} by company ${socket.data.companyId}`);
        return;
      }
      whatsappBaileys.joinRoom(socket.id, accountId);
    });

    socket.on("whatsapp:leave", (accountId: string) => {
      whatsappBaileys.leaveRoom(socket.id, accountId);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // Seed master user
  await seedMasterUser();
  
  // Auto-reconnect WhatsApp sessions that were connected before restart
  setTimeout(async () => {
    try {
      await whatsappBaileys.initializeAndReconnect();
    } catch (error) {
      console.error('[WhatsApp] Auto-reconnect error:', error);
    }
  }, 3000);
  
  // Auth routes (no public registration - only admin can create users)
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
      const { name, email, password, role, displayName } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email and password are required" });
      }

      // Validate role
      const validRoles = ["admin", "operator"];
      const userRole = validRoles.includes(role) ? role : "operator";
      
      // Only master can create admin users
      if (userRole === "admin" && req.user!.role !== "master") {
        return res.status(403).json({ message: "Only master can create admin users" });
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
        role: userRole,
        displayName: displayName || name,
      });

      res.json({ ...user, passwordHash: undefined });
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put("/api/users/:id", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, email, password, role, displayName } = req.body;
      const updateData: Record<string, any> = {};
      
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (displayName !== undefined) updateData.displayName = displayName;
      if (password) updateData.passwordHash = await hashPassword(password);
      
      // Validate role changes
      if (role) {
        const validRoles = ["admin", "operator"];
        if (validRoles.includes(role)) {
          // Only master can assign admin role
          if (role === "admin" && req.user!.role !== "master") {
            return res.status(403).json({ message: "Only master can assign admin role" });
          }
          updateData.role = role;
        }
      }

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
      const accountId = req.params.id;
      
      // Start Puppeteer session (async, will emit events via Socket.IO)
      whatsappBaileys.startSession(accountId).then(async (result) => {
        if (result.success) {
          const status = whatsappBaileys.getStatus(accountId);
          await storage.updateWhatsappAccount(accountId, { 
            status: status === "connected" ? "connected" : "pending_qr" 
          });
        }
      });
      
      await storage.updateWhatsappAccount(accountId, { status: "pending_qr" });
      res.json({ success: true, message: "Session starting... QR code will appear via WebSocket" });
    } catch (error) {
      console.error("Start session error:", error);
      res.status(500).json({ message: "Failed to start session" });
    }
  });

  app.get("/api/whatsapp-accounts/:id/qr", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const accountId = req.params.id;
      const qrCode = await whatsappBaileys.getQRCode(accountId);
      const status = whatsappBaileys.getStatus(accountId);
      
      if (status === "connected") {
        await storage.updateWhatsappAccount(accountId, { 
          status: "connected",
          lastConnectionAt: new Date(),
        });
        return res.json({ status: "connected", qrData: null });
      }
      
      if (qrCode) {
        return res.json({ qrData: qrCode, status });
      }
      
      return res.json({ qrData: null, status, message: "Waiting for QR code..." });
    } catch (error) {
      console.error("Get QR error:", error);
      res.status(500).json({ message: "Failed to get QR code" });
    }
  });

  app.post("/api/whatsapp-accounts/:id/disconnect", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      await whatsappBaileys.disconnect(req.params.id);
      await storage.updateWhatsappAccount(req.params.id, { status: "disconnected" });
      res.json({ success: true });
    } catch (error) {
      console.error("Disconnect error:", error);
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });

  // Contacts routes
  app.get("/api/contacts", authMiddleware(storage), async (req: AuthRequest, res) => {
    const { search } = req.query;
    let contacts = await storage.getContacts(req.user!.companyId);
    
    // Filter by search term if provided
    if (search && typeof search === "string") {
      const searchLower = search.toLowerCase();
      contacts = contacts.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.phoneNumber.includes(search)
      );
    }
    
    res.json(contacts);
  });

  app.get("/api/contacts/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    const contact = await storage.getContactWithTags(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }
    res.json(contact);
  });

  // Start conversation by phone number
  app.post("/api/contacts/start-conversation", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { phoneNumber: rawPhone, whatsappAccountId, name } = req.body;
      
      if (!rawPhone || !whatsappAccountId) {
        return res.status(400).json({ message: "Phone number and WhatsApp account are required" });
      }

      // REGRA: Sempre normalizar o número de telefone
      const phoneNumber = normalizePhone(rawPhone);

      // Check if account exists and is connected
      const account = await storage.getWhatsappAccount(whatsappAccountId);
      if (!account || account.status !== "connected") {
        return res.status(400).json({ message: "WhatsApp account not connected" });
      }

      // Find or create contact usando número normalizado
      let contact = await storage.getContactByPhone(req.user!.companyId, phoneNumber);
      if (!contact) {
        contact = await storage.createContact({
          companyId: req.user!.companyId,
          whatsappAccountId,
          name: name || phoneNumber,
          phoneNumber, // Número já normalizado
        });
      }

      // Find or create conversation
      let conversation = await storage.getOpenConversationByContact(contact.id);
      if (!conversation) {
        conversation = await storage.createConversation({
          companyId: req.user!.companyId,
          whatsappAccountId,
          contactId: contact.id,
          assignedToUserId: req.user!.id,
          status: "open",
          inbox: "whatsapp",
        });
      }

      res.json({ contact, conversation });
    } catch (error) {
      console.error("Start conversation error:", error);
      res.status(500).json({ message: "Failed to start conversation" });
    }
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

  // Delete single contact
  app.delete("/api/contacts/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      await storage.deleteContact(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete contact error:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // Delete multiple contacts
  app.delete("/api/contacts", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Contact IDs are required" });
      }
      await storage.deleteContacts(ids);
      res.json({ success: true, count: ids.length });
    } catch (error) {
      console.error("Delete contacts error:", error);
      res.status(500).json({ message: "Failed to delete contacts" });
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
  app.delete("/api/conversations/bulk", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "IDs are required" });
      }
      const count = await storage.deleteConversations(req.user!.companyId, ids);
      console.log(`[API] Deleted ${count} conversations for company ${req.user!.companyId}`);
      res.json({ success: true, deleted: count });
    } catch (error) {
      console.error("Delete conversations error:", error);
      res.status(500).json({ message: "Failed to delete conversations" });
    }
  });

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

      // Get agent display name
      const senderDisplayName = req.user!.displayName || req.user!.name;

      // Save message to database FIRST for instant response
      const message = await storage.createMessage({
        conversationId: req.params.id,
        direction: "outgoing",
        senderUserId: req.user!.id,
        senderDisplayName,
        content,
      });

      // Update conversation lastMessageAt
      await storage.updateConversation(req.params.id, {});

      // Respond immediately to the client
      res.json(message);

      // Send via WhatsApp in background (fire-and-forget)
      whatsappBaileys.sendMessage(
        conversation.whatsappAccountId,
        contact.phoneNumber,
        content
      ).then(sendResult => {
        if (!sendResult.success) {
          console.error(`[WhatsApp] Background send failed for message ${message.id}:`, sendResult.error);
        } else {
          console.log(`[WhatsApp] Message ${message.id} sent successfully`);
        }
      }).catch(error => {
        console.error(`[WhatsApp] Background send error for message ${message.id}:`, error);
      });

    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Falha ao enviar mensagem" });
    }
  });

  app.post("/api/conversations/:id/internal-notes", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ message: "Content is required" });
      }

      // Get agent display name for internal notes too
      const senderDisplayName = req.user!.displayName || req.user!.name;

      const message = await storage.createMessage({
        conversationId: req.params.id,
        direction: "internal_note",
        senderUserId: req.user!.id,
        senderDisplayName,
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

  // Canned Responses routes
  app.get("/api/canned-responses", authMiddleware(storage), async (req: AuthRequest, res) => {
    const responses = await storage.getCannedResponses(req.user!.companyId);
    res.json(responses);
  });

  app.post("/api/canned-responses", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { shortcut, content } = req.body;
      if (!shortcut || !content) {
        return res.status(400).json({ message: "Shortcut and content are required" });
      }

      const response = await storage.createCannedResponse({
        companyId: req.user!.companyId,
        shortcut,
        content,
      });

      res.json(response);
    } catch (error) {
      console.error("Create canned response error:", error);
      res.status(500).json({ message: "Failed to create canned response" });
    }
  });

  app.put("/api/canned-responses/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { shortcut, content } = req.body;
      const updateData: Record<string, any> = {};
      
      if (shortcut !== undefined) updateData.shortcut = shortcut;
      if (content !== undefined) updateData.content = content;

      const response = await storage.updateCannedResponse(req.params.id, updateData);
      if (!response) {
        return res.status(404).json({ message: "Canned response not found" });
      }

      res.json(response);
    } catch (error) {
      console.error("Update canned response error:", error);
      res.status(500).json({ message: "Failed to update canned response" });
    }
  });

  app.delete("/api/canned-responses/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      await storage.deleteCannedResponse(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete canned response error:", error);
      res.status(500).json({ message: "Failed to delete canned response" });
    }
  });

  // ================== MACROS ==================
  
  // Template engine para variáveis nas mensagens
  function renderTemplate(template: string, context: {
    nome?: string;
    telefone?: string;
    primeiro_nome?: string;
    empresa?: string;
    tags?: string;
    atendente?: string;
  }): string {
    return template
      .replace(/\{\{nome\}\}/g, context.nome || "")
      .replace(/\{\{telefone\}\}/g, context.telefone || "")
      .replace(/\{\{primeiro_nome\}\}/g, context.primeiro_nome || context.nome?.split(" ")[0] || "")
      .replace(/\{\{empresa\}\}/g, context.empresa || "")
      .replace(/\{\{tags\}\}/g, context.tags || "")
      .replace(/\{\{atendente\}\}/g, context.atendente || "");
  }

  // GET /api/macros - Listar macros (todos podem ver)
  app.get("/api/macros", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const macrosList = await storage.getMacros(req.user!.companyId);
      res.json(macrosList);
    } catch (error) {
      console.error("Get macros error:", error);
      res.status(500).json({ message: "Failed to get macros" });
    }
  });

  // GET /api/macros/:id - Obter macro específica
  app.get("/api/macros/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const macro = await storage.getMacro(req.params.id);
      if (!macro || macro.companyId !== req.user!.companyId) {
        return res.status(404).json({ message: "Macro not found" });
      }
      res.json(macro);
    } catch (error) {
      console.error("Get macro error:", error);
      res.status(500).json({ message: "Failed to get macro" });
    }
  });

  // POST /api/macros - Criar macro (admin/master only)
  app.post("/api/macros", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, description, messageTemplate, actions } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const macro = await storage.createMacro({
        companyId: req.user!.companyId,
        name,
        description: description || null,
        messageTemplate: messageTemplate || null,
        actions: actions || [],
        isGlobal: true,
        createdBy: req.user!.id,
      });

      res.json(macro);
    } catch (error) {
      console.error("Create macro error:", error);
      res.status(500).json({ message: "Failed to create macro" });
    }
  });

  // PUT /api/macros/:id - Atualizar macro (admin/master only)
  app.put("/api/macros/:id", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, description, messageTemplate, actions } = req.body;
      const existingMacro = await storage.getMacro(req.params.id);
      
      if (!existingMacro || existingMacro.companyId !== req.user!.companyId) {
        return res.status(404).json({ message: "Macro not found" });
      }

      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (messageTemplate !== undefined) updateData.messageTemplate = messageTemplate;
      if (actions !== undefined) updateData.actions = actions;

      const macro = await storage.updateMacro(req.params.id, updateData);
      res.json(macro);
    } catch (error) {
      console.error("Update macro error:", error);
      res.status(500).json({ message: "Failed to update macro" });
    }
  });

  // DELETE /api/macros/:id - Deletar macro (admin/master only)
  app.delete("/api/macros/:id", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const existingMacro = await storage.getMacro(req.params.id);
      if (!existingMacro || existingMacro.companyId !== req.user!.companyId) {
        return res.status(404).json({ message: "Macro not found" });
      }

      await storage.deleteMacro(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete macro error:", error);
      res.status(500).json({ message: "Failed to delete macro" });
    }
  });

  // POST /api/macros/execute - Executar macro (todos podem executar)
  app.post("/api/macros/execute", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { macroId, conversationId } = req.body;
      
      if (!macroId || !conversationId) {
        return res.status(400).json({ message: "macroId and conversationId are required" });
      }

      // Buscar macro
      const macro = await storage.getMacro(macroId);
      if (!macro || macro.companyId !== req.user!.companyId) {
        return res.status(404).json({ message: "Macro not found" });
      }

      // Buscar conversa com detalhes
      const conversation = await storage.getConversationWithDetails(conversationId);
      if (!conversation || conversation.companyId !== req.user!.companyId) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const contact = conversation.contact;
      const contactTags = await storage.getContactTags(contact.id);
      const actionsApplied: any[] = [];
      const actions = (macro.actions as any[]) || [];

      // Executar ações
      for (const action of actions) {
        try {
          switch (action.type) {
            case "ADD_TAG":
              if (action.tagId) {
                const existingTag = contactTags.find(t => t.id === action.tagId);
                if (!existingTag) {
                  await storage.addContactTag(contact.id, action.tagId);
                  actionsApplied.push({ type: "ADD_TAG", tagId: action.tagId, success: true });
                  
                  // Emitir evento de atualização de tag
                  io.to(`company:${req.user!.companyId}`).emit("contact:tags_updated", {
                    contactId: contact.id,
                    action: "added",
                    tagId: action.tagId,
                  });
                }
              }
              break;
              
            case "REMOVE_TAG":
              if (action.tagId) {
                await storage.removeContactTag(contact.id, action.tagId);
                actionsApplied.push({ type: "REMOVE_TAG", tagId: action.tagId, success: true });
                
                io.to(`company:${req.user!.companyId}`).emit("contact:tags_updated", {
                  contactId: contact.id,
                  action: "removed",
                  tagId: action.tagId,
                });
              }
              break;
              
            case "SET_STATUS":
              if (action.status) {
                await storage.updateConversation(conversationId, { status: action.status });
                actionsApplied.push({ type: "SET_STATUS", status: action.status, success: true });
                
                io.to(`company:${req.user!.companyId}`).emit("conversation:updated", {
                  companyId: req.user!.companyId,
                  conversationId,
                  status: action.status,
                });
              }
              break;
              
            case "ASSIGN_AGENT":
              if (action.agentId) {
                await storage.updateConversation(conversationId, { assignedToUserId: action.agentId });
                actionsApplied.push({ type: "ASSIGN_AGENT", agentId: action.agentId, success: true });
              }
              break;
              
            case "SEND_MESSAGE":
              if (action.message) {
                // Buscar tags atualizadas para template
                const currentTags = await storage.getContactTags(contact.id);
                const currentTagNames = currentTags.map(t => t.name).join(", ");
                
                const contactName = contact.name || "";
                const messageContext = {
                  nome: contactName,
                  telefone: contact.phoneNumber || "",
                  primeiro_nome: contactName ? contactName.split(" ")[0] : "",
                  empresa: "",
                  tags: currentTagNames,
                  atendente: req.user!.displayName || req.user!.name || "",
                };
                
                const messageToSend = renderTemplate(action.message, messageContext);
                
                // Enviar mensagem via WhatsApp
                const msgChatId = normalizeJid(contact.phoneNumber);
                const msgSent = await whatsappBaileys.sendMessage(
                  conversation.whatsappAccountId,
                  msgChatId,
                  messageToSend
                );
                
                if (msgSent) {
                  // Salvar mensagem no banco
                  const actionMessage = await storage.createMessage({
                    conversationId,
                    direction: "outgoing",
                    content: messageToSend,
                    senderId: req.user!.id,
                    senderDisplayName: req.user!.displayName || req.user!.name,
                  });
                  
                  // Emitir evento de nova mensagem
                  io.to(`company:${req.user!.companyId}`).emit("message:created", {
                    conversationId,
                    messageId: actionMessage.id,
                    direction: "outgoing",
                    content: messageToSend,
                  });
                  
                  actionsApplied.push({ type: "SEND_MESSAGE", message: messageToSend, success: true });
                } else {
                  actionsApplied.push({ type: "SEND_MESSAGE", success: false, error: "Failed to send" });
                }
              }
              break;
          }
        } catch (actionError) {
          console.error(`Error executing action ${action.type}:`, actionError);
          actionsApplied.push({ ...action, success: false, error: String(actionError) });
        }
      }

      // Enviar mensagem se template existir
      let renderedMessage: string | null = null;
      let sentMessage = null;
      
      if (macro.messageTemplate) {
        const updatedTags = await storage.getContactTags(contact.id);
        const tagNames = updatedTags.map(t => t.name).join(", ");
        
        const templateContactName = contact.name || "";
        const context = {
          nome: templateContactName,
          telefone: contact.phoneNumber || "",
          primeiro_nome: templateContactName ? templateContactName.split(" ")[0] : "",
          empresa: "",
          tags: tagNames,
          atendente: req.user!.displayName || req.user!.name || "",
        };
        
        renderedMessage = renderTemplate(macro.messageTemplate, context);
        
        // Enviar mensagem via WhatsApp
        const chatId = normalizeJid(contact.phoneNumber);
        const sent = await whatsappBaileys.sendMessage(
          conversation.whatsappAccountId,
          chatId,
          renderedMessage
        );
        
        if (sent) {
          // Salvar mensagem no banco
          sentMessage = await storage.createMessage({
            conversationId,
            direction: "outgoing",
            content: renderedMessage,
            senderId: req.user!.id,
            senderDisplayName: req.user!.displayName || req.user!.name,
          });
          
          // Emitir evento de nova mensagem
          io.to(`company:${req.user!.companyId}`).emit("message:created", {
            companyId: req.user!.companyId,
            conversationId,
            contactId: contact.id,
            message: sentMessage,
          });
        }
      }

      // Registrar execução
      const execution = await storage.createMacroExecution({
        macroId,
        chatId: normalizeJid(contact.phoneNumber),
        contactId: contact.id,
        conversationId,
        userId: req.user!.id,
        renderedMessage,
        actionsApplied,
      });

      res.json({
        success: true,
        execution,
        actionsApplied,
        message: sentMessage,
      });
    } catch (error) {
      console.error("Execute macro error:", error);
      res.status(500).json({ message: "Failed to execute macro" });
    }
  });

  // Dev endpoint: Simulate incoming message
  app.post("/api/dev/simulate-incoming-message", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { whatsappAccountId, phoneNumber: rawPhone, content } = req.body;
      
      if (!whatsappAccountId || !rawPhone || !content) {
        return res.status(400).json({ message: "whatsappAccountId, phoneNumber, and content are required" });
      }

      // REGRA: Sempre normalizar o número de telefone
      const phoneNumber = normalizePhone(rawPhone);

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
          phoneNumber, // Número já normalizado
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
