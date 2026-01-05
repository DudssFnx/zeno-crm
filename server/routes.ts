import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { authMiddleware, adminMiddleware, masterMiddleware, notOperatorMiddleware, generateToken, hashPassword, comparePassword, type AuthRequest } from "./auth";
import { whatsappGateway } from "./whatsapp-gateway";
import { whatsappBaileys } from "./whatsapp-baileys";
import { dispatchWebhook } from "./webhook-dispatcher";
import { loginSchema, insertTagSchema, insertWebhookConfigSchema } from "@shared/schema";
import { normalizePhone, normalizeJid, isValidPhoneNumber } from "./jid-utils";
import * as messageQueue from "./message-queue";
import { initScheduledMessageProcessor } from "./scheduled-message-processor";
import { isRemoteGatewayEnabled, remoteConnect, remoteDisconnect, remoteSendMessage, remoteGetStatus } from "./gateway-client";
import { gatewayWebhookAuth, handleGatewayWebhook, setSocketServer as setGatewaySocketServer } from "./gateway-webhook-handler";
import multer from "multer";
import path from "path";
import fs from "fs";

// Geocoding cache to avoid repeated requests
const geocodeCache = new Map<string, { latitude: number; longitude: number; state?: string }>();
let lastGeocodeRequest = 0;

async function geocodeCity(cityInput: string): Promise<{ latitude: number; longitude: number; state?: string } | null> {
  const cacheKey = cityInput.toLowerCase().trim();
  
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }
  
  const now = Date.now();
  const timeSinceLastRequest = now - lastGeocodeRequest;
  if (timeSinceLastRequest < 1100) {
    await new Promise(resolve => setTimeout(resolve, 1100 - timeSinceLastRequest));
  }
  lastGeocodeRequest = Date.now();
  
  try {
    const searchQuery = cityInput.includes("Brasil") || cityInput.includes("Brazil") 
      ? cityInput 
      : `${cityInput}, Brasil`;
    
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ZENO-CRM/1.0 (contact@zeno.com.br)",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });
    
    if (!response.ok) {
      console.error(`[Geocode] Nominatim returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.log(`[Geocode] No results for: ${cityInput}`);
      return null;
    }
    
    const result = data[0];
    const geocoded = {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      state: result.address?.state || result.address?.state_district || undefined,
    };
    
    geocodeCache.set(cacheKey, geocoded);
    console.log(`[Geocode] Found: ${cityInput} -> ${geocoded.latitude}, ${geocoded.longitude}`);
    
    return geocoded;
  } catch (error) {
    console.error("[Geocode] Error:", error);
    return null;
  }
}

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
  
  // Connect gateway webhook handler to Socket.IO
  setGatewaySocketServer(io);
  
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
      // Processar LID: usar o identificador LID como phoneNumber temporário
      // O contato será criado com o LID e pode ser atualizado posteriormente
      // quando o mapeamento LID -> phone for descoberto
      let phoneNumber = message.phoneNumber;
      if (phoneNumber.startsWith("LID_")) {
        // Usar o LID limpo como identificador único
        console.log(`[FastHandler] Processing LID message: ${phoneNumber}, contact: ${message.contactName}`);
      }
      
      // Usar o handler rápido que emite imediatamente e processa em background
      await messageQueue.handleMessageFast(accountId, {
        phoneNumber: phoneNumber,
        contactName: message.contactName,
        content: message.content,
        direction: message.direction || "incoming",
        senderDisplayName: message.senderDisplayName,
        avatarUrl: message.avatarUrl,
        timestamp: message.timestamp,
        mediaInfo: message.mediaInfo,
        messageId: message.messageId,
      });
      
      console.log(`[FastHandler] Processed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[FastHandler] Error:`, error);
    }
  });

  // Handler para quando um mapeamento LID -> phone é descoberto
  // Isso atualiza contatos que foram criados com LID_ para usar o número real
  whatsappBaileys.setLidMappingDiscoveredHandler(async (accountId, lid, phoneNumber) => {
    try {
      console.log(`[LidMapping] Discovered mapping: LID_${lid} -> ${phoneNumber}`);
      
      // Buscar contatos que têm o LID como phoneNumber
      const lidPhoneNumber = `LID_${lid}`;
      const account = await storage.getWhatsappAccount(accountId);
      if (!account) return;

      // Atualizar contatos com LID para usar o número real
      const updatedCount = await storage.updateContactsByLid(account.companyId, lidPhoneNumber, phoneNumber);
      
      if (updatedCount > 0) {
        console.log(`[LidMapping] Updated ${updatedCount} contact(s) from ${lidPhoneNumber} to ${phoneNumber}`);
        
        // Emitir evento para atualizar o frontend
        io.to(`company:${account.companyId}`).emit("contacts:lid_resolved", {
          oldPhoneNumber: lidPhoneNumber,
          newPhoneNumber: phoneNumber,
        });
      }
    } catch (error) {
      console.error(`[LidMapping] Error updating contacts:`, error);
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

  // Multer configuration for file uploads
  const storage_config = multer.diskStorage({
    destination: (req: AuthRequest, file, cb) => {
      const companyId = req.user?.companyId || "default";
      const uploadPath = path.join("uploads", companyId);
      
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req: AuthRequest, file, cb) => {
      const sanitizedName = file.originalname.replace(/[^a-z0-9.]/gi, "_").toLowerCase();
      const timestamp = Date.now();
      cb(null, `${timestamp}_${sanitizedName}`);
    },
  });

  const upload = multer({
    storage: storage_config,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  });

  // Seed master user
  await seedMasterUser();
  
  // Initialize scheduled message processor
  initScheduledMessageProcessor();
  
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

  // Public registration (no validation required)
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { companyName, name, email, password, role } = req.body;
      
      // Validate required fields
      if (!companyName || typeof companyName !== "string" || companyName.trim().length < 2) {
        return res.status(400).json({ message: "Company name must be at least 2 characters" });
      }
      
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({ message: "Name must be at least 2 characters" });
      }
      
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      
      if (!password || typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }
      
      // Create company
      const company = await storage.createCompany({ name: companyName.trim() });
      
      // Validate role
      const validRoles = ["admin", "operator"];
      const userRole = validRoles.includes(role) ? role : "admin";
      
      // Create user
      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        companyId: company.id,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        role: userRole,
        displayName: name.trim(),
      });
      
      console.log(`[Registration] New user registered: ${email} (${userRole}) for company: ${companyName}`);
      
      // Generate token and return
      const token = generateToken(user);
      res.json({ 
        token, 
        user: { ...user, passwordHash: undefined },
        company 
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Gateway webhook endpoint (for Railway WhatsApp Gateway)
  // This endpoint receives events from the remote gateway and processes them
  if (isRemoteGatewayEnabled()) {
    console.log("[Gateway] Remote gateway enabled - registering webhook endpoint");
    app.post("/api/gateway-webhook", gatewayWebhookAuth, handleGatewayWebhook);
  }

  // Media upload endpoint
  app.post("/api/upload", authMiddleware(storage), upload.single("file"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const companyId = req.user!.companyId;
      const fileName = req.file.filename;
      const url = `/uploads/${companyId}/${fileName}`;

      res.json({
        url,
        fileName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // ==========================================
  // MASTER PANEL - Company Management Routes
  // ==========================================
  
  // List all companies (master only)
  app.get("/api/master/companies", authMiddleware(storage), masterMiddleware, async (req: AuthRequest, res) => {
    try {
      const companies = await storage.getAllCompanies();
      // Enrich with stats
      const companiesWithStats = await Promise.all(
        companies.map(async (company) => {
          const stats = await storage.getCompanyStats(company.id);
          return { ...company, ...stats };
        })
      );
      res.json(companiesWithStats);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ message: "Failed to fetch companies" });
    }
  });

  // Get single company with stats (master only)
  app.get("/api/master/companies/:id", authMiddleware(storage), masterMiddleware, async (req: AuthRequest, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      const stats = await storage.getCompanyStats(company.id);
      res.json({ ...company, ...stats });
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ message: "Failed to fetch company" });
    }
  });

  // Create new company with admin user (master only)
  app.post("/api/master/companies", authMiddleware(storage), masterMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, domain, plan, maxUsers, maxWhatsappAccounts, expiresAt, adminEmail, adminName, adminPassword } = req.body;
      
      // Validate required fields
      if (!name || typeof name !== "string" || name.length < 2) {
        return res.status(400).json({ message: "Company name must have at least 2 characters" });
      }

      // Validate plan
      const validPlans = ["basic", "pro", "enterprise"];
      if (plan && !validPlans.includes(plan)) {
        return res.status(400).json({ message: "Invalid plan" });
      }

      // Check if domain is already in use
      if (domain) {
        const existingDomain = await storage.getCompanyByDomain(domain);
        if (existingDomain) {
          return res.status(400).json({ message: "Domain is already in use" });
        }
      }

      // Check if admin email is already in use
      if (adminEmail) {
        const existingUser = await storage.getUserByEmail(adminEmail);
        if (existingUser) {
          return res.status(400).json({ message: "Admin email is already registered" });
        }
      }

      // Parse expiresAt safely
      let parsedExpiresAt: Date | null = null;
      if (expiresAt && expiresAt !== "") {
        const dateObj = new Date(expiresAt);
        if (!isNaN(dateObj.getTime())) {
          parsedExpiresAt = dateObj;
        }
      }

      // Create company
      const company = await storage.createCompany({
        name,
        domain: domain || null,
        plan: plan || "basic",
        maxUsers: typeof maxUsers === "number" ? maxUsers : parseInt(maxUsers) || 5,
        maxWhatsappAccounts: typeof maxWhatsappAccounts === "number" ? maxWhatsappAccounts : parseInt(maxWhatsappAccounts) || 2,
        expiresAt: parsedExpiresAt,
        isActive: true,
      });

      // Create admin user if provided
      let adminUser = null;
      if (adminEmail && adminName && adminPassword) {
        const passwordHash = await hashPassword(adminPassword);
        adminUser = await storage.createUser({
          companyId: company.id,
          name: adminName,
          email: adminEmail,
          passwordHash,
          role: "admin",
          displayName: adminName,
        });
      }

      res.json({ 
        company, 
        adminUser: adminUser ? { ...adminUser, passwordHash: undefined } : null 
      });
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(500).json({ message: "Failed to create company" });
    }
  });

  // Update company (master only)
  app.put("/api/master/companies/:id", authMiddleware(storage), masterMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, domain, plan, maxUsers, maxWhatsappAccounts, expiresAt, isActive } = req.body;

      // Validate required fields
      if (!name || typeof name !== "string" || name.length < 2) {
        return res.status(400).json({ message: "Company name must have at least 2 characters" });
      }

      // Validate plan
      const validPlans = ["basic", "pro", "enterprise"];
      if (plan && !validPlans.includes(plan)) {
        return res.status(400).json({ message: "Invalid plan" });
      }

      // Check if domain is already in use by another company
      if (domain) {
        const existingDomain = await storage.getCompanyByDomain(domain);
        if (existingDomain && existingDomain.id !== req.params.id) {
          return res.status(400).json({ message: "Domain is already in use" });
        }
      }

      // Parse expiresAt safely
      let parsedExpiresAt: Date | null = null;
      if (expiresAt && expiresAt !== "") {
        const dateObj = new Date(expiresAt);
        if (!isNaN(dateObj.getTime())) {
          parsedExpiresAt = dateObj;
        }
      }

      const company = await storage.updateCompany(req.params.id, {
        name,
        domain: domain || null,
        plan: plan || "basic",
        maxUsers: typeof maxUsers === "number" ? maxUsers : parseInt(maxUsers) || 5,
        maxWhatsappAccounts: typeof maxWhatsappAccounts === "number" ? maxWhatsappAccounts : parseInt(maxWhatsappAccounts) || 2,
        expiresAt: parsedExpiresAt,
        isActive: typeof isActive === "boolean" ? isActive : true,
      });

      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      const stats = await storage.getCompanyStats(company.id);
      res.json({ ...company, ...stats });
    } catch (error) {
      console.error("Error updating company:", error);
      res.status(500).json({ message: "Failed to update company" });
    }
  });

  // Delete company (master only)
  app.delete("/api/master/companies/:id", authMiddleware(storage), masterMiddleware, async (req: AuthRequest, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      // Check if trying to delete own company
      if (company.id === req.user!.companyId) {
        return res.status(400).json({ message: "Cannot delete your own company" });
      }

      await storage.deleteCompany(req.params.id);
      res.json({ message: "Company deleted successfully" });
    } catch (error) {
      console.error("Error deleting company:", error);
      res.status(500).json({ message: "Failed to delete company" });
    }
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

  // User settings routes (users can update their own settings)
  app.get("/api/users/me/settings", authMiddleware(storage), async (req: AuthRequest, res) => {
    res.json({
      id: req.user!.id,
      name: req.user!.name,
      displayName: req.user!.displayName,
      prefixMode: req.user!.prefixMode || "prefix",
      avatarUrl: (req.user as any).avatarUrl || null,
    });
  });

  app.put("/api/users/me/settings", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { prefixMode, avatarUrl } = req.body;
      const updateData: Record<string, any> = {};
      
      if (prefixMode !== undefined) {
        const validModes = ["prefix", "firstLine", "none"];
        if (validModes.includes(prefixMode)) {
          updateData.prefixMode = prefixMode;
        }
      }
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

      const user = await storage.updateUser(req.user!.id, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ 
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        prefixMode: user.prefixMode,
        avatarUrl: (user as any).avatarUrl,
      });
    } catch (error) {
      console.error("Update user settings error:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // WhatsApp Accounts routes
  app.get("/api/whatsapp-accounts", authMiddleware(storage), async (req: AuthRequest, res) => {
    const accounts = await storage.getWhatsappAccounts(req.user!.companyId);
    res.json(accounts);
  });

  app.post("/api/whatsapp-accounts", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
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

  app.put("/api/whatsapp-accounts/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
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

  app.delete("/api/whatsapp-accounts/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
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
    
    if (search && typeof search === "string") {
      const searchLower = search.toLowerCase();
      contacts = contacts.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.phoneNumber.includes(search)
      );
    }
    
    res.json(contacts);
  });

  app.get("/api/contacts/with-location", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const contacts = await storage.getContacts(req.user!.companyId);
      const contactsWithLocation = contacts.filter(c => c.latitude && c.longitude);
      res.json(contactsWithLocation);
    } catch (error) {
      console.error("Get contacts with location error:", error);
      res.status(500).json({ message: "Failed to get contacts" });
    }
  });

  app.get("/api/contacts/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    const contact = await storage.getContactWithTags(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }
    res.json(contact);
  });

  // Get contact attribute counts
  app.get("/api/contacts/:id/attribute-counts", authMiddleware(storage), async (req: AuthRequest, res) => {
    // Verify contact belongs to user's company
    const contact = await storage.getContact(req.params.id);
    if (!contact || contact.companyId !== req.user!.companyId) {
      return res.status(404).json({ message: "Contact not found" });
    }
    const counts = await storage.getContactAttributeCounts(req.params.id);
    res.json(counts);
  });

  // Reset contact attribute count (when attribute is removed)
  app.delete("/api/contacts/:id/attribute-counts/:attributeName", authMiddleware(storage), async (req: AuthRequest, res) => {
    // Verify contact belongs to user's company
    const contact = await storage.getContact(req.params.id);
    if (!contact || contact.companyId !== req.user!.companyId) {
      return res.status(404).json({ message: "Contact not found" });
    }
    await storage.resetContactAttributeCount(req.params.id, decodeURIComponent(req.params.attributeName));
    res.json({ success: true });
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
      let contactCreated = false;
      if (!contact) {
        contact = await storage.createContact({
          companyId: req.user!.companyId,
          whatsappAccountId,
          name: name || phoneNumber,
          phoneNumber, // Número já normalizado
        });
        contactCreated = true;
      }
      
      // Queue avatar fetch for new contacts or contacts without avatar
      if (contactCreated || !contact.avatarUrl) {
        messageQueue.queueAvatarFetch({
          accountId: whatsappAccountId,
          companyId: req.user!.companyId,
          contactId: contact.id,
          phoneNumber,
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
      const { name, notes, avatarUrl, attributes } = req.body;
      
      // Operators can only update notes
      if (req.user!.role === "operator") {
        if (name !== undefined || avatarUrl !== undefined || attributes !== undefined) {
          return res.status(403).json({ message: "Operadores só podem editar observações do contato" });
        }
        const contact = await storage.updateContact(req.params.id, { notes });
        if (!contact) {
          return res.status(404).json({ message: "Contact not found" });
        }
        
        io.to(`company:${req.user!.companyId}`).emit("contact:updated", {
          companyId: req.user!.companyId,
          contactId: contact.id,
          notes: contact.notes,
          updatedBy: req.user!.name,
          updatedAt: new Date().toISOString(),
        });
        
        return res.json(contact);
      }
      
      // Validar máximo de 3 atributos
      if (attributes && Array.isArray(attributes) && attributes.length > 3) {
        return res.status(400).json({ message: "Máximo de 3 atributos por contato" });
      }
      
      const contact = await storage.updateContact(req.params.id, { name, notes, avatarUrl, attributes });
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      io.to(`company:${req.user!.companyId}`).emit("contact:updated", {
        companyId: req.user!.companyId,
        contactId: contact.id,
        notes: contact.notes,
        updatedBy: req.user!.name,
        updatedAt: new Date().toISOString(),
      });
      
      res.json(contact);
    } catch (error) {
      console.error("Update contact error:", error);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  // Update contact city with geocoding
  app.put("/api/contacts/:id/city", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { city } = req.body;
      const contactId = req.params.id;
      
      const existingContact = await storage.getContact(contactId);
      if (!existingContact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      if (existingContact.companyId !== req.user!.companyId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      let updateData: { city: string; state?: string; latitude?: number; longitude?: number; geocodedAt?: Date } = { 
        city: city || null 
      };
      
      if (city && city.trim()) {
        try {
          const geocodeResult = await geocodeCity(city.trim());
          if (geocodeResult) {
            updateData = {
              ...updateData,
              state: geocodeResult.state || null,
              latitude: geocodeResult.latitude,
              longitude: geocodeResult.longitude,
              geocodedAt: new Date(),
            };
          }
        } catch (geoError) {
          console.error("[Geocode] Error geocoding city:", geoError);
        }
      } else {
        updateData = {
          city: null,
          state: null,
          latitude: null,
          longitude: null,
          geocodedAt: null,
        };
      }
      
      const contact = await storage.updateContact(contactId, updateData);
      res.json(contact);
    } catch (error) {
      console.error("Update contact city error:", error);
      res.status(500).json({ message: "Failed to update city" });
    }
  });

  // Delete single contact (admin/master only)
  app.delete("/api/contacts/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const contactId = req.params.id;
      const contact = await storage.getContact(contactId);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      if (contact.companyId !== req.user!.companyId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      await storage.deleteContact(contactId);
      console.log(`[API] Deleted contact ${contactId} for company ${req.user!.companyId}`);
      
      // Emit socket event to update UI in real-time
      io.to(`company:${req.user!.companyId}`).emit("contact:deleted", {
        companyId: req.user!.companyId,
        contactId,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete contact error:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // Delete multiple contacts (admin/master only)
  app.delete("/api/contacts", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Contact IDs are required" });
      }
      await storage.deleteContacts(ids);
      console.log(`[API] Deleted ${ids.length} contacts for company ${req.user!.companyId}`);
      
      // Emit socket events for each deleted contact
      for (const contactId of ids) {
        io.to(`company:${req.user!.companyId}`).emit("contact:deleted", {
          companyId: req.user!.companyId,
          contactId,
        });
      }
      
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

  app.post("/api/tags", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
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

  app.put("/api/tags/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
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

  app.delete("/api/tags/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteTag(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete tag error:", error);
      res.status(500).json({ message: "Failed to delete tag" });
    }
  });

  app.put("/api/tags/reorder", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const { tagIds } = req.body;
      if (!tagIds || !Array.isArray(tagIds)) {
        return res.status(400).json({ message: "tagIds é obrigatório" });
      }

      const tags = await storage.reorderTags(req.user!.companyId, tagIds);
      res.json(tags);
    } catch (error) {
      console.error("Reorder tags error:", error);
      res.status(500).json({ message: "Falha ao reordenar etiquetas" });
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
  
  // Delete multiple conversations (bulk) - MUST come before /:id route
  app.delete("/api/conversations/bulk", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "IDs are required" });
      }
      const count = await storage.deleteConversations(req.user!.companyId, ids);
      console.log(`[API] Deleted ${count} conversations for company ${req.user!.companyId}`);
      
      // Emit socket events for each deleted conversation
      for (const conversationId of ids) {
        io.to(`company:${req.user!.companyId}`).emit("conversation:deleted", {
          companyId: req.user!.companyId,
          conversationId,
        });
      }
      
      res.json({ success: true, deleted: count });
    } catch (error) {
      console.error("Delete conversations error:", error);
      res.status(500).json({ message: "Failed to delete conversations" });
    }
  });
  
  // Delete single conversation (admin/master only)
  app.delete("/api/conversations/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const conversationId = req.params.id;
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.companyId !== req.user!.companyId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const count = await storage.deleteConversations(req.user!.companyId, [conversationId]);
      console.log(`[API] Deleted conversation ${conversationId} for company ${req.user!.companyId}`);
      
      // Emit socket event to update UI in real-time
      io.to(`company:${req.user!.companyId}`).emit("conversation:deleted", {
        companyId: req.user!.companyId,
        conversationId,
      });
      
      res.json({ success: true, deleted: count });
    } catch (error) {
      console.error("Delete conversation error:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  app.get("/api/conversations", authMiddleware(storage), async (req: AuthRequest, res) => {
    const { status, whatsappAccountId, assignedToUserId, inactiveMinDays, inactiveMaxDays, inactivePreset } = req.query;
    const conversations = await storage.getConversations(req.user!.companyId, {
      status: status as string | undefined,
      whatsappAccountId: whatsappAccountId as string | undefined,
      assignedToUserId: assignedToUserId as string | undefined,
      inactiveMinDays: inactiveMinDays ? parseInt(inactiveMinDays as string) : undefined,
      inactiveMaxDays: inactiveMaxDays ? parseInt(inactiveMaxDays as string) : undefined,
      inactivePreset: inactivePreset as string | undefined,
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
      
      // Operators can only self-assign or unassign from themselves
      if (req.user!.role === "operator") {
        const conversation = await storage.getConversation(req.params.id);
        if (!conversation) {
          return res.status(404).json({ message: "Conversation not found" });
        }
        
        // Operator can only assign to themselves or unassign (if currently assigned to them)
        const isSelfAssigning = userId === req.user!.id;
        const isUnassigningFromSelf = !userId && conversation.assignedToUserId === req.user!.id;
        
        if (!isSelfAssigning && !isUnassigningFromSelf && userId !== null) {
          return res.status(403).json({ message: "Operadores só podem atribuir conversas a si mesmos" });
        }
      }
      
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

  // Mark conversation as opened (pending -> open)
  app.post("/api/conversations/:id/open", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Only change from pending to open
      if (conversation.status === "pending") {
        const updated = await storage.updateConversation(req.params.id, { 
          status: "open" 
        });
        
        // Emit real-time event
        io.to(`company:${req.user!.companyId}`).emit("conversation:updated", {
          conversationId: req.params.id,
          status: "open"
        });

        await dispatchWebhook(req.user!.companyId, "conversation.status.changed", {
          conversationId: req.params.id,
          oldStatus: "pending",
          newStatus: "open",
          userId: req.user!.id,
        });

        return res.json(updated);
      }

      res.json(conversation);
    } catch (error) {
      console.error("Open conversation error:", error);
      res.status(500).json({ message: "Failed to open conversation" });
    }
  });

  // Toggle unread status
  app.post("/api/conversations/:id/toggle-unread", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const updated = await storage.updateConversation(req.params.id, { 
        isUnread: !conversation.isUnread 
      });
      
      // Emit real-time event
      io.to(`company:${req.user!.companyId}`).emit("conversation:updated", {
        conversationId: req.params.id,
        isUnread: updated?.isUnread
      });

      res.json(updated);
    } catch (error) {
      console.error("Toggle unread error:", error);
      res.status(500).json({ message: "Failed to toggle unread status" });
    }
  });

  // Messages routes
  app.get("/api/conversations/:id/messages", authMiddleware(storage), async (req: AuthRequest, res) => {
    const messages = await storage.getMessages(req.params.id);
    res.json(messages);
  });

  app.post("/api/conversations/:id/messages", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { content, mediaUrl, mediaType, fileName, mimetype } = req.body;
      if (!content && !mediaUrl) {
        return res.status(400).json({ message: "Content or media is required" });
      }

      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const contact = await storage.getContact(conversation.contactId);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      // Get agent display name and prefix mode
      const senderDisplayName = req.user!.displayName || req.user!.name;
      const prefixMode = req.user!.prefixMode || "prefix";

      // Format message content based on prefixMode
      const formatMessageWithOperator = (msg: string, operatorName: string, mode: string): string => {
        if (!msg || mode === "none") return msg;
        switch (mode) {
          case "prefix":
            return `[${operatorName}]: ${msg}`;
          case "firstLine":
            return `${operatorName}:\n${msg}`;
          default:
            return msg;
        }
      };

      // Determine display content for database (without operator prefix for clean storage)
      let displayContent = content || "";
      if (mediaUrl && mediaType) {
        const mediaLabels: Record<string, string> = {
          image: "[Imagem]",
          video: "[Video]",
          audio: "[Audio]",
          document: fileName ? `[Documento: ${fileName}]` : "[Documento]",
        };
        if (!displayContent) {
          displayContent = mediaLabels[mediaType] || "[Media]";
        }
      }

      // Save message to database FIRST for instant response
      const message = await storage.createMessage({
        conversationId: req.params.id,
        direction: "outgoing",
        senderUserId: req.user!.id,
        senderDisplayName,
        content: displayContent,
        mediaUrl,
        mediaType,
        fileName,
        mimetype,
        fileSize: req.body.fileSize || req.body.size, // Supporting both common field names
      });

      // Update conversation lastMessageAt and lastOutboundAt
      const now = new Date();
      await storage.updateConversation(req.params.id, {
        lastMessageAt: now,
        lastOutboundAt: now,
      });

      // Respond immediately to the client
      res.json(message);

      // Build media options if provided
      const mediaOptions = mediaUrl && mediaType ? {
        mediaUrl,
        mediaType: mediaType as "image" | "audio" | "document" | "video",
        fileName,
        mimetype,
      } : undefined;

      // Format message content for WhatsApp with operator identification
      const formattedContent = formatMessageWithOperator(content || "", senderDisplayName, prefixMode);

      // Send via WhatsApp in background (fire-and-forget)
      whatsappBaileys.sendMessage(
        conversation.whatsappAccountId,
        contact.phoneNumber,
        formattedContent,
        senderDisplayName,
        mediaOptions
      ).then(sendResult => {
        if (!sendResult.success) {
          console.error(`[WhatsApp] Background send failed for message ${message.id}:`, sendResult.error);
        } else {
          console.log(`[WhatsApp] Message ${message.id} sent successfully${mediaType ? ` (${mediaType})` : ""}`);
          // Marcar messageId como enviado pelo CRM para evitar duplicação quando o eco do WhatsApp chegar
          if (sendResult.messageId) {
            messageQueue.markMessageSentByCrm(sendResult.messageId);
          }
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

  // Webhooks routes (admin/master only)
  app.get("/api/webhooks", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    const webhooks = await storage.getWebhookConfigs(req.user!.companyId);
    res.json(webhooks);
  });

  app.post("/api/webhooks", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
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

  app.put("/api/webhooks/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
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

  app.delete("/api/webhooks/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
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
      const { shortcut, content, attributes, tagIds } = req.body;
      if (!shortcut || !content) {
        return res.status(400).json({ message: "Shortcut and content are required" });
      }

      const response = await storage.createCannedResponse({
        companyId: req.user!.companyId,
        shortcut,
        content,
        attributes: attributes || null,
        tagIds: tagIds || null,
      });

      res.json(response);
    } catch (error) {
      console.error("Create canned response error:", error);
      res.status(500).json({ message: "Failed to create canned response" });
    }
  });

  app.put("/api/canned-responses/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { shortcut, content, attributes, tagIds } = req.body;
      const updateData: Record<string, any> = {};
      
      if (shortcut !== undefined) updateData.shortcut = shortcut;
      if (content !== undefined) updateData.content = content;
      if (attributes !== undefined) updateData.attributes = attributes;
      if (tagIds !== undefined) updateData.tagIds = tagIds;

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

  // ================== SCHEDULED MESSAGES ==================

  // GET /api/scheduled-messages - Listar mensagens agendadas
  app.get("/api/scheduled-messages", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const messages = await storage.getScheduledMessages(req.user!.companyId);
      res.json(messages);
    } catch (error) {
      console.error("Get scheduled messages error:", error);
      res.status(500).json({ message: "Falha ao buscar mensagens agendadas" });
    }
  });

  // POST /api/scheduled-messages - Criar mensagem agendada
  app.post("/api/scheduled-messages", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { conversationId, contactId, whatsappAccountId, content, mediaUrl, mediaType, scheduledFor } = req.body;
      if (!content || !scheduledFor) {
        return res.status(400).json({ message: "Conteúdo e data de agendamento são obrigatórios" });
      }
      const message = await storage.createScheduledMessage({
        companyId: req.user!.companyId,
        conversationId: conversationId || null,
        contactId: contactId || null,
        whatsappAccountId: whatsappAccountId || null,
        content,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        scheduledFor: new Date(scheduledFor),
        status: "pending",
        createdBy: req.user!.id,
      });
      res.json(message);
    } catch (error) {
      console.error("Create scheduled message error:", error);
      res.status(500).json({ message: "Falha ao criar mensagem agendada" });
    }
  });

  // DELETE /api/scheduled-messages/:id - Cancelar mensagem agendada
  app.delete("/api/scheduled-messages/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const message = await storage.getScheduledMessage(req.params.id);
      if (!message || message.companyId !== req.user!.companyId) {
        return res.status(404).json({ message: "Mensagem não encontrada" });
      }
      if (message.status !== "pending") {
        return res.status(400).json({ message: "Apenas mensagens pendentes podem ser canceladas" });
      }
      await storage.updateScheduledMessage(req.params.id, { status: "cancelled" });
      res.json({ success: true });
    } catch (error) {
      console.error("Cancel scheduled message error:", error);
      res.status(500).json({ message: "Falha ao cancelar mensagem agendada" });
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

  // PUT /api/macros/reorder - Reordenar macros (admin/master only)
  // IMPORTANTE: Esta rota deve vir ANTES de /api/macros/:id para evitar conflito
  app.put("/api/macros/reorder", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { macroIds } = req.body;
      const companyId = req.user!.companyId;

      if (!Array.isArray(macroIds) || macroIds.length === 0) {
        return res.status(400).json({ message: "macroIds must be a non-empty array" });
      }

      // Verificar que todos os macros pertencem à empresa
      const macros = await storage.getMacros(companyId);
      const companyMacroIds = new Set(macros.map(m => m.id));

      for (const id of macroIds) {
        if (!companyMacroIds.has(id)) {
          return res.status(403).json({ message: "Forbidden: macro does not belong to company" });
        }
      }

      const reorderedMacros = await storage.reorderMacros(companyId, macroIds);
      res.json(reorderedMacros);
    } catch (error) {
      console.error("Reorder macros error:", error);
      res.status(500).json({ message: "Failed to reorder macros" });
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
              
            case "REMOVE_ALL_TAGS":
              // Remove all tags from contact
              for (const existingTag of contactTags) {
                await storage.removeContactTag(contact.id, existingTag.id);
              }
              actionsApplied.push({ type: "REMOVE_ALL_TAGS", success: true, tagsRemoved: contactTags.length });
              
              io.to(`company:${req.user!.companyId}`).emit("contact:tags_updated", {
                contactId: contact.id,
                action: "all_removed",
              });
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
              
            case "SET_ATTRIBUTE":
              if (action.attribute !== undefined) {
                // Converter para array e combinar com existentes (máx 3)
                const currentAttrs = contact.attributes || [];
                const newAttr = action.attribute;
                let updatedAttrs = [...currentAttrs];
                
                if (newAttr && !currentAttrs.includes(newAttr)) {
                  if (updatedAttrs.length < 3) {
                    updatedAttrs.push(newAttr);
                  }
                }
                
                await storage.updateContact(contact.id, { attributes: updatedAttrs });
                
                // Incrementar contagem do atributo
                if (newAttr) {
                  await storage.incrementContactAttributeCount(contact.id, newAttr);
                }
                
                actionsApplied.push({ type: "SET_ATTRIBUTE", attribute: action.attribute, success: true });
                
                io.to(`company:${req.user!.companyId}`).emit("contact:updated", {
                  companyId: req.user!.companyId,
                  contactId: contact.id,
                  attributes: updatedAttrs,
                });
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
                
                if (msgSent.success) {
                  // Marcar messageId como enviado pelo CRM
                  if (msgSent.messageId) {
                    messageQueue.markMessageSentByCrm(msgSent.messageId);
                  }
                  
                  // Salvar mensagem no banco
                  const actionMessage = await storage.createMessage({
                    conversationId,
                    direction: "outgoing",
                    content: messageToSend,
                    senderUserId: req.user!.id,
                    senderDisplayName: req.user!.displayName || req.user!.name,
                  });
                  
                  // Emitir evento de nova mensagem
                  io.to(`company:${req.user!.companyId}`).emit("message:created", {
                    conversationId,
                    messageId: actionMessage.id,
                    direction: "outgoing",
                    content: messageToSend,
                  });
                  
                  // Atualizar lastOutboundAt para limpar badge de prioridade
                  const msgNow = new Date();
                  await storage.updateConversation(conversationId, {
                    lastMessageAt: msgNow,
                    lastOutboundAt: msgNow,
                  });
                  
                  actionsApplied.push({ type: "SEND_MESSAGE", message: messageToSend, success: true });
                } else {
                  actionsApplied.push({ type: "SEND_MESSAGE", success: false, error: msgSent.error || "Failed to send" });
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
        
        if (sent.success) {
          // Marcar messageId como enviado pelo CRM
          if (sent.messageId) {
            messageQueue.markMessageSentByCrm(sent.messageId);
          }
          
          // Salvar mensagem no banco
          sentMessage = await storage.createMessage({
            conversationId,
            direction: "outgoing",
            content: renderedMessage,
            senderUserId: req.user!.id,
            senderDisplayName: req.user!.displayName || req.user!.name,
          });
          
          // Emitir evento de nova mensagem
          io.to(`company:${req.user!.companyId}`).emit("message:created", {
            companyId: req.user!.companyId,
            conversationId,
            contactId: contact.id,
            message: sentMessage,
          });
          
          // Atualizar lastOutboundAt para limpar badge de prioridade
          const macroNow = new Date();
          await storage.updateConversation(conversationId, {
            lastMessageAt: macroNow,
            lastOutboundAt: macroNow,
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

  // ============ ROBOTS (Auto Atendimento) ============
  app.get("/api/robots", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const robotsList = await storage.getRobots(req.user!.companyId);
      res.json(robotsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch robots" });
    }
  });

  app.get("/api/robots/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const robot = await storage.getRobot(req.params.id);
      if (!robot || robot.companyId !== req.user!.companyId) {
        return res.status(404).json({ error: "Robot not found" });
      }
      res.json(robot);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch robot" });
    }
  });

  app.post("/api/robots", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, description, actions, isActive } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Robot name is required" });
      }
      const robot = await storage.createRobot({
        companyId: req.user!.companyId,
        name,
        description,
        actions: actions || [],
        isActive: isActive !== false,
      });
      res.status(201).json(robot);
    } catch (error) {
      res.status(500).json({ error: "Failed to create robot" });
    }
  });

  app.put("/api/robots/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, description, actions, isActive } = req.body;
      const existing = await storage.getRobot(req.params.id);
      if (!existing || existing.companyId !== req.user!.companyId) {
        return res.status(404).json({ error: "Robot not found" });
      }
      const updated = await storage.updateRobot(req.params.id, { name, description, actions, isActive });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update robot" });
    }
  });

  app.delete("/api/robots/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getRobot(req.params.id);
      if (!existing || existing.companyId !== req.user!.companyId) {
        return res.status(404).json({ error: "Robot not found" });
      }
      await storage.deleteRobot(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting robot:", error);
      res.status(500).json({ error: "Failed to delete robot" });
    }
  });

  // Execute robot on conversation
  app.post("/api/robots/execute", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { robotId, conversationId } = req.body;
      
      if (!robotId || !conversationId) {
        return res.status(400).json({ error: "robotId and conversationId are required" });
      }

      const robot = await storage.getRobot(robotId);
      if (!robot || robot.companyId !== req.user!.companyId) {
        return res.status(404).json({ error: "Robot not found" });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.companyId !== req.user!.companyId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const contact = await storage.getContact(conversation.contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }

      // Import robot engine
      const { robotEngine } = await import("./robot-engine");

      // Define message sender function
      const sendMessage = async (convId: string, content: string, mediaType?: string, mediaUrl?: string) => {
        const chatId = normalizeJid(contact.phoneNumber);
        
        if (mediaType && mediaUrl) {
          // Send media
          const sent = await whatsappBaileys.sendMedia(
            conversation.whatsappAccountId,
            chatId,
            mediaUrl,
            mediaType,
            content || undefined
          );
          
          if (sent.success && sent.messageId) {
            messageQueue.markMessageSentByCrm(sent.messageId);
          }
          
          // Save message
          const msg = await storage.createMessage({
            conversationId: convId,
            direction: "outgoing",
            content: content || "",
            mediaType,
            mediaUrl,
            senderUserId: req.user!.id,
            senderDisplayName: req.user!.displayName || req.user!.name,
          });
          
          io.to(`company:${req.user!.companyId}`).emit("message:created", {
            companyId: req.user!.companyId,
            conversationId: convId,
            contactId: contact.id,
            message: msg,
          });
          
          // Atualizar lastOutboundAt para limpar badge de prioridade
          const robotMediaNow = new Date();
          await storage.updateConversation(convId, {
            lastMessageAt: robotMediaNow,
            lastOutboundAt: robotMediaNow,
          });
        } else {
          // Send text
          console.log(`[Robot] Sending text message to ${chatId}: "${content.substring(0, 50)}..."`);
          const sent = await whatsappBaileys.sendMessage(
            conversation.whatsappAccountId,
            chatId,
            content
          );
          console.log(`[Robot] WhatsApp sendMessage result:`, JSON.stringify(sent));
          
          if (sent.success && sent.messageId) {
            messageQueue.markMessageSentByCrm(sent.messageId);
            console.log(`[Robot] Text message sent successfully: ${sent.messageId}`);
          } else {
            console.error(`[Robot] Text message send failed:`, sent.error);
          }
          
          // Save message
          const msg = await storage.createMessage({
            conversationId: convId,
            direction: "outgoing",
            content,
            senderUserId: req.user!.id,
            senderDisplayName: req.user!.displayName || req.user!.name,
          });
          
          io.to(`company:${req.user!.companyId}`).emit("message:created", {
            companyId: req.user!.companyId,
            conversationId: convId,
            contactId: contact.id,
            message: msg,
          });
          
          // Atualizar lastOutboundAt para limpar badge de prioridade
          const robotTextNow = new Date();
          await storage.updateConversation(convId, {
            lastMessageAt: robotTextNow,
            lastOutboundAt: robotTextNow,
          });
        }
      };

      // Define presence sender function
      const sendPresence = async (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => {
        const chatId = normalizeJid(contactPhone);
        await whatsappBaileys.sendPresenceUpdate(whatsappAccountId, chatId, type);
      };

      // Define progress callback
      const onProgress = (data: any) => {
        io.to(`company:${req.user!.companyId}`).emit("robot:progress", data);
      };

      // Execute robot asynchronously
      robotEngine.executeRobot(
        robotId,
        {
          conversationId,
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: contact.phoneNumber,
          whatsappAccountId: conversation.whatsappAccountId,
          companyId: req.user!.companyId,
          executedBy: req.user!.id,
        },
        sendMessage,
        sendPresence,
        onProgress
      ).catch(err => {
        console.error("[Robot] Execution error:", err);
      });

      res.json({ success: true, message: "Robot execution started" });
    } catch (error) {
      console.error("Execute robot error:", error);
      res.status(500).json({ error: "Failed to execute robot" });
    }
  });

  // ============ DEPARTMENTS ============
  app.get("/api/departments", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const departments = await storage.getDepartments(req.user!.companyId);
      res.json(departments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  app.post("/api/departments", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const department = await storage.createDepartment({ ...req.body, companyId: req.user!.companyId });
      res.status(201).json(department);
    } catch (error) {
      res.status(500).json({ error: "Failed to create department" });
    }
  });

  app.put("/api/departments/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const department = await storage.updateDepartment(req.params.id, req.body, req.user!.companyId);
      if (!department) return res.status(404).json({ error: "Department not found" });
      res.json(department);
    } catch (error) {
      res.status(500).json({ error: "Failed to update department" });
    }
  });

  app.delete("/api/departments/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteDepartment(req.params.id, req.user!.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete department" });
    }
  });

  // Department Agents
  app.get("/api/departments/:id/agents", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const dept = await storage.getDepartment(req.params.id, req.user!.companyId);
      if (!dept) return res.status(404).json({ error: "Department not found" });
      const agents = await storage.getDepartmentAgents(req.params.id);
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch department agents" });
    }
  });

  app.post("/api/departments/:id/agents", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const dept = await storage.getDepartment(req.params.id, req.user!.companyId);
      if (!dept) return res.status(404).json({ error: "Department not found" });
      const agent = await storage.addDepartmentAgent({
        departmentId: req.params.id,
        userId: req.body.userId,
      });
      res.status(201).json(agent);
    } catch (error) {
      res.status(500).json({ error: "Failed to add agent to department" });
    }
  });

  app.delete("/api/departments/:id/agents/:userId", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const dept = await storage.getDepartment(req.params.id, req.user!.companyId);
      if (!dept) return res.status(404).json({ error: "Department not found" });
      await storage.removeDepartmentAgent(req.params.id, req.params.userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove agent" });
    }
  });

  // ============ TRIAGE MENUS ============
  app.get("/api/triage-menus", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const menus = await storage.getTriageMenus(req.user!.companyId);
      res.json(menus);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch triage menus" });
    }
  });

  app.post("/api/triage-menus", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const menu = await storage.createTriageMenu({ ...req.body, companyId: req.user!.companyId });
      res.status(201).json(menu);
    } catch (error) {
      res.status(500).json({ error: "Failed to create triage menu" });
    }
  });

  app.put("/api/triage-menus/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const menu = await storage.updateTriageMenu(req.params.id, req.body, req.user!.companyId);
      if (!menu) return res.status(404).json({ error: "Menu not found" });
      res.json(menu);
    } catch (error) {
      res.status(500).json({ error: "Failed to update triage menu" });
    }
  });

  app.delete("/api/triage-menus/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteTriageMenu(req.params.id, req.user!.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete triage menu" });
    }
  });

  // ============ AUTOMATION RULES ============
  app.get("/api/automation-rules", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const rules = await storage.getAutomationRules(req.user!.companyId);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch automation rules" });
    }
  });

  app.post("/api/automation-rules", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const rule = await storage.createAutomationRule({ ...req.body, companyId: req.user!.companyId });
      res.status(201).json(rule);
    } catch (error) {
      res.status(500).json({ error: "Failed to create automation rule" });
    }
  });

  app.put("/api/automation-rules/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const rule = await storage.updateAutomationRule(req.params.id, req.body, req.user!.companyId);
      if (!rule) return res.status(404).json({ error: "Rule not found" });
      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: "Failed to update automation rule" });
    }
  });

  app.delete("/api/automation-rules/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteAutomationRule(req.params.id, req.user!.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete automation rule" });
    }
  });

  // Automation Executions Log
  app.get("/api/automation-executions", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const executions = await storage.getAutomationExecutions(req.user!.companyId, limit);
      res.json(executions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch automation executions" });
    }
  });

  // Stages routes
  app.get("/api/stages", authMiddleware(storage), async (req: AuthRequest, res) => {
    const stages = await storage.getStages(req.user!.companyId);
    res.json(stages);
  });

  app.post("/api/stages", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { name, color, tagId } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      const stage = await storage.createStage({
        companyId: req.user!.companyId,
        name,
        color: color || "#6B7280",
        tagId: tagId || null,
      });

      res.json(stage);
    } catch (error) {
      console.error("Create stage error:", error);
      res.status(500).json({ message: "Falha ao criar estágio" });
    }
  });

  app.put("/api/stages/reorder", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { stageIds } = req.body;
      if (!stageIds || !Array.isArray(stageIds)) {
        return res.status(400).json({ message: "stageIds é obrigatório" });
      }

      const stages = await storage.reorderStages(req.user!.companyId, stageIds);
      res.json(stages);
    } catch (error) {
      console.error("Reorder stages error:", error);
      res.status(500).json({ message: "Falha ao reordenar estágios" });
    }
  });

  app.put("/api/stages/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { name, color, tagId } = req.body;
      const stage = await storage.updateStage(req.params.id, { name, color, tagId: tagId || null });
      if (!stage) {
        return res.status(404).json({ message: "Estágio não encontrado" });
      }
      res.json(stage);
    } catch (error) {
      console.error("Update stage error:", error);
      res.status(500).json({ message: "Falha ao atualizar estágio" });
    }
  });

  app.delete("/api/stages/:id", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      await storage.deleteStage(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete stage error:", error);
      res.status(500).json({ message: "Falha ao excluir estágio" });
    }
  });

  // Update conversation stage
  app.patch("/api/conversations/:id/stage", authMiddleware(storage), async (req: AuthRequest, res) => {
    try {
      const { stageId } = req.body;
      const conversation = await storage.updateConversationStage(req.params.id, stageId || null);
      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }
      
      // Emitir evento socket para sincronizar todos os operadores
      const conversationWithDetails = await storage.getConversationWithDetails(conversation.id);
      if (conversationWithDetails) {
        io.to(`company:${req.user!.companyId}`).emit("conversation:updated", conversationWithDetails);
      }
      
      res.json(conversation);
    } catch (error) {
      console.error("Update conversation stage error:", error);
      res.status(500).json({ message: "Falha ao atualizar estágio da conversa" });
    }
  });

  // Contact Attributes routes
  app.get("/api/contact-attributes", authMiddleware(storage), async (req: AuthRequest, res) => {
    const attributes = await storage.getContactAttributes(req.user!.companyId);
    res.json(attributes);
  });

  app.post("/api/contact-attributes", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, color } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      const attr = await storage.createContactAttribute({
        companyId: req.user!.companyId,
        name,
        color: color || "#6B7280",
      });

      res.json(attr);
    } catch (error) {
      console.error("Create contact attribute error:", error);
      res.status(500).json({ message: "Falha ao criar atributo" });
    }
  });

  app.put("/api/contact-attributes/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, color } = req.body;
      const attr = await storage.updateContactAttribute(req.params.id, { name, color });
      if (!attr) {
        return res.status(404).json({ message: "Atributo não encontrado" });
      }
      res.json(attr);
    } catch (error) {
      console.error("Update contact attribute error:", error);
      res.status(500).json({ message: "Falha ao atualizar atributo" });
    }
  });

  app.delete("/api/contact-attributes/:id", authMiddleware(storage), notOperatorMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteContactAttribute(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete contact attribute error:", error);
      res.status(500).json({ message: "Falha ao excluir atributo" });
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
      let contactCreated = false;
      if (!contact) {
        contact = await storage.createContact({
          companyId: req.user!.companyId,
          whatsappAccountId,
          name: phoneNumber,
          phoneNumber, // Número já normalizado
        });
        contactCreated = true;
      }
      
      // Queue avatar fetch for new contacts or contacts without avatar
      if (contactCreated || !contact.avatarUrl) {
        messageQueue.queueAvatarFetch({
          accountId: whatsappAccountId,
          companyId: req.user!.companyId,
          contactId: contact.id,
          phoneNumber,
        });
      }

      let conversation = await storage.getOpenConversationByContact(contact.id);
      if (!conversation) {
        conversation = await storage.createConversation({
          companyId: req.user!.companyId,
          whatsappAccountId,
          contactId: contact.id,
          status: "pending",
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

  // =====================================================
  // BACKUP & RESTORE ENDPOINTS
  // =====================================================

  // Export backup (Admin only)
  app.get("/api/backup/export", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const companyId = req.user!.companyId;
      
      // Fetch all configuration data
      const [
        tags,
        macros,
        contactAttributes,
        cannedResponses,
        stages,
        webhookConfigs,
        triageMenus,
        robots,
        departments,
        automationRules,
        contacts,
        contactTagsList,
      ] = await Promise.all([
        storage.getTags(companyId),
        storage.getMacros(companyId),
        storage.getContactAttributes(companyId),
        storage.getCannedResponses(companyId),
        storage.getStages(companyId),
        storage.getWebhookConfigs(companyId),
        storage.getTriageMenus(companyId),
        storage.getRobots(companyId),
        storage.getDepartments(companyId),
        storage.getAutomationRules(companyId),
        storage.getContacts(companyId),
        storage.getAllContactTagsByCompany(companyId),
      ]);

      const company = await storage.getCompany(companyId);
      
      const backup = {
        version: "1.1",
        exportedAt: new Date().toISOString(),
        companyName: company?.name || "Unknown",
        data: {
          tags,
          macros,
          contactAttributes,
          cannedResponses,
          stages,
          webhookConfigs,
          triageMenus,
          robots,
          departments,
          automationRules,
          contacts,
          contactTags: contactTagsList,
        },
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=backup_${companyId}_${Date.now()}.json`);
      res.json(backup);
    } catch (error) {
      console.error("Backup export error:", error);
      res.status(500).json({ message: "Failed to export backup" });
    }
  });

  // Import backup (Admin only)
  app.post("/api/backup/import", authMiddleware(storage), adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const companyId = req.user!.companyId;
      const { data, options } = req.body;
      
      if (!data) {
        return res.status(400).json({ message: "No backup data provided" });
      }

      const clearExisting = options?.clearExisting || false;
      const results: Record<string, number> = {};
      
      // ID mapping: oldId -> newId for each entity type
      const idMap: Record<string, Record<string, string>> = {
        tags: {},
        stages: {},
        departments: {},
      };

      // Helper to remap IDs in JSON actions/options
      // Comprehensive remapping for all known ID field patterns
      const remapIds = (obj: unknown): unknown => {
        if (!obj) return obj;
        if (Array.isArray(obj)) {
          return obj.map(item => remapIds(item));
        }
        if (typeof obj === "object") {
          const result: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            // Tag ID fields (single)
            const tagIdFields = ["tagId", "tag_id"];
            // Stage ID fields (single)
            const stageIdFields = ["stageId", "stage_id", "targetStageId", "nextStageId", "assignStageId", "moveToStageId"];
            // Department ID fields (single)
            const deptIdFields = ["departmentId", "department_id", "assignDepartmentId", "routeToDepartmentId", "targetDepartmentId"];
            // Tag ID fields (array)
            const tagArrayFields = ["tagIds", "tag_ids", "addTags", "removeTags", "assignTags"];
            // Stage ID fields (array)
            const stageArrayFields = ["stageIds", "stage_ids", "assignStageIds"];
            // Department ID fields (array)
            const deptArrayFields = ["departmentIds", "department_ids", "assignToDepartmentIds"];
            
            if (tagIdFields.includes(key) && typeof value === "string") {
              result[key] = idMap.tags[value] || value;
            } else if (stageIdFields.includes(key) && typeof value === "string") {
              result[key] = idMap.stages[value] || value;
            } else if (deptIdFields.includes(key) && typeof value === "string") {
              result[key] = idMap.departments[value] || value;
            }
            // Array ID fields
            else if (tagArrayFields.includes(key) && Array.isArray(value)) {
              result[key] = value.map((id: unknown) => 
                typeof id === "string" ? (idMap.tags[id] || id) : id
              );
            } else if (stageArrayFields.includes(key) && Array.isArray(value)) {
              result[key] = value.map((id: unknown) => 
                typeof id === "string" ? (idMap.stages[id] || id) : id
              );
            } else if (deptArrayFields.includes(key) && Array.isArray(value)) {
              result[key] = value.map((id: unknown) => 
                typeof id === "string" ? (idMap.departments[id] || id) : id
              );
            }
            // Recursive for all other objects/arrays
            else {
              result[key] = remapIds(value);
            }
          }
          return result;
        }
        return obj;
      }

      // Import in order of dependencies
      // 1. Tags (no dependencies) - create mapping
      if (data.tags && data.tags.length > 0) {
        if (clearExisting) {
          await storage.deleteTagsByCompany(companyId);
        }
        for (const tag of data.tags) {
          try {
            const newTag = await storage.createTag({
              companyId,
              name: tag.name,
              color: tag.color,
            });
            if (tag.id) {
              idMap.tags[tag.id] = newTag.id;
            }
          } catch (e) {
            // Try to find existing tag by name for mapping
            const existingTags = await storage.getTags(companyId);
            const existing = existingTags.find(t => t.name === tag.name);
            if (existing && tag.id) {
              idMap.tags[tag.id] = existing.id;
            }
          }
        }
        results.tags = data.tags.length;
      }

      // 2. Contact Attributes
      if (data.contactAttributes && data.contactAttributes.length > 0) {
        if (clearExisting) {
          await storage.deleteContactAttributesByCompany(companyId);
        }
        for (const attr of data.contactAttributes) {
          try {
            await storage.createContactAttribute({
              companyId,
              name: attr.name,
              color: attr.color,
              displayOrder: attr.displayOrder,
            });
          } catch (e) {
            // Skip duplicates
          }
        }
        results.contactAttributes = data.contactAttributes.length;
      }

      // 3. Stages - create mapping
      if (data.stages && data.stages.length > 0) {
        if (clearExisting) {
          await storage.deleteStagesByCompany(companyId);
        }
        for (const stage of data.stages) {
          try {
            const newStage = await storage.createStage({
              companyId,
              name: stage.name,
              color: stage.color,
              order: String(stage.displayOrder ?? 0),
            });
            if (stage.id) {
              idMap.stages[stage.id] = newStage.id;
            }
          } catch (e) {
            // Try to find existing stage by name for mapping
            const existingStages = await storage.getStages(companyId);
            const existing = existingStages.find(s => s.name === stage.name);
            if (existing && stage.id) {
              idMap.stages[stage.id] = existing.id;
            }
          }
        }
        results.stages = data.stages.length;
      }

      // 4. Departments - create mapping
      if (data.departments && data.departments.length > 0) {
        if (clearExisting) {
          await storage.deleteDepartmentsByCompany(companyId);
        }
        for (const dept of data.departments) {
          try {
            const newDept = await storage.createDepartment({
              companyId,
              name: dept.name,
              description: dept.description,
              keywords: dept.keywords,
            });
            if (dept.id) {
              idMap.departments[dept.id] = newDept.id;
            }
          } catch (e) {
            // Try to find existing department by name for mapping
            const existingDepts = await storage.getDepartments(companyId);
            const existing = existingDepts.find(d => d.name === dept.name);
            if (existing && dept.id) {
              idMap.departments[dept.id] = existing.id;
            }
          }
        }
        results.departments = data.departments.length;
      }

      // 5. Canned Responses (may reference tags)
      if (data.cannedResponses && data.cannedResponses.length > 0) {
        if (clearExisting) {
          await storage.deleteCannedResponsesByCompany(companyId);
        }
        for (const response of data.cannedResponses) {
          try {
            // Remap tagIds if present
            let remappedTagIds = response.tagIds;
            if (Array.isArray(response.tagIds)) {
              remappedTagIds = response.tagIds.map((tid: string) => idMap.tags[tid] || tid);
            }
            await storage.createCannedResponse({
              companyId,
              shortcut: response.shortcut,
              content: response.content,
              attributes: response.attributes,
              tagIds: remappedTagIds,
            });
          } catch (e) {
            // Skip duplicates
          }
        }
        results.cannedResponses = data.cannedResponses.length;
      }

      // 6. Macros (reference tags in actions)
      if (data.macros && data.macros.length > 0) {
        if (clearExisting) {
          await storage.deleteMacrosByCompany(companyId);
        }
        for (const macro of data.macros) {
          try {
            // Remap IDs in actions
            const remappedActions = remapIds(macro.actions);
            await storage.createMacro({
              companyId,
              name: macro.name,
              description: macro.description,
              messageTemplate: macro.messageTemplate,
              actions: remappedActions as unknown[],
              isGlobal: macro.isGlobal,
              sortOrder: macro.sortOrder,
            });
          } catch (e) {
            // Skip duplicates
          }
        }
        results.macros = data.macros.length;
      }

      // 7. Webhooks
      if (data.webhookConfigs && data.webhookConfigs.length > 0) {
        if (clearExisting) {
          await storage.deleteWebhooksByCompany(companyId);
        }
        for (const webhook of data.webhookConfigs) {
          try {
            await storage.createWebhookConfig({
              companyId,
              url: webhook.url,
              events: webhook.events,
              secret: webhook.secret,
              isActive: webhook.isActive,
            });
          } catch (e) {
            // Skip duplicates
          }
        }
        results.webhookConfigs = data.webhookConfigs.length;
      }

      // 8. Robots (reference tags in actions)
      if (data.robots && data.robots.length > 0) {
        if (clearExisting) {
          await storage.deleteRobotsByCompany(companyId);
        }
        for (const robot of data.robots) {
          try {
            // Remap IDs in actions
            const remappedActions = remapIds(robot.actions);
            await storage.createRobot({
              companyId,
              name: robot.name,
              description: robot.description,
              actions: remappedActions as unknown[],
              isActive: robot.isActive,
            });
          } catch (e) {
            // Skip duplicates
          }
        }
        results.robots = data.robots.length;
      }

      // 9. Triage Menus (reference tags, stages, departments in options)
      if (data.triageMenus && data.triageMenus.length > 0) {
        if (clearExisting) {
          await storage.deleteTriageMenusByCompany(companyId);
        }
        // Get first WhatsApp account for this company as default
        const accounts = await storage.getWhatsappAccounts(companyId);
        const defaultAccountId = accounts.length > 0 ? accounts[0].id : null;
        
        for (const menu of data.triageMenus) {
          try {
            // Remap IDs in options
            const remappedOptions = remapIds(menu.options);
            await storage.createTriageMenu({
              companyId,
              whatsappAccountId: defaultAccountId || menu.whatsappAccountId,
              name: menu.name,
              welcomeMessage: menu.welcomeMessage,
              options: remappedOptions as unknown[],
              invalidMessage: menu.invalidMessage,
              timeoutMinutes: menu.timeoutMinutes,
              isActive: menu.isActive,
              triggerOnFirstMessage: menu.triggerOnFirstMessage,
            });
          } catch (e) {
            // Skip duplicates
          }
        }
        results.triageMenus = data.triageMenus.length;
      }

      // 10. Automation Rules (reference tags, stages in actions)
      if (data.automationRules && data.automationRules.length > 0) {
        if (clearExisting) {
          await storage.deleteAutomationRulesByCompany(companyId);
        }
        for (const rule of data.automationRules) {
          try {
            // Remap IDs in conditions and actions
            const remappedConditions = remapIds(rule.conditions);
            const remappedActions = remapIds(rule.actions);
            await storage.createAutomationRule({
              companyId,
              name: rule.name,
              description: rule.description,
              triggerEvent: rule.triggerEvent,
              conditions: remappedConditions as unknown[],
              actions: remappedActions as unknown[],
              priority: rule.priority,
              isActive: rule.isActive,
            });
          } catch (e) {
            // Skip duplicates
          }
        }
        results.automationRules = data.automationRules.length;
      }

      // 11. Contacts (with ID mapping for contactTags)
      const contactIdMap: Record<string, string> = {};
      if (data.contacts && data.contacts.length > 0) {
        // Get first WhatsApp account for this company as default
        const contactAccounts = await storage.getWhatsappAccounts(companyId);
        const contactDefaultAccountId = contactAccounts.length > 0 ? contactAccounts[0].id : null;
        
        for (const contact of data.contacts) {
          try {
            // Check if contact already exists by phone number
            const existingContact = await storage.getContactByPhone(companyId, contact.phoneNumber);
            if (existingContact) {
              contactIdMap[contact.id] = existingContact.id;
            } else {
              const newContact = await storage.createContact({
                companyId,
                whatsappAccountId: contactDefaultAccountId || contact.whatsappAccountId,
                phoneNumber: contact.phoneNumber,
                name: contact.name,
                avatarUrl: contact.avatarUrl,
                notes: contact.notes,
                attributes: contact.attributes,
              });
              contactIdMap[contact.id] = newContact.id;
            }
          } catch (e) {
            // Skip on error
          }
        }
        results.contacts = data.contacts.length;
      }

      // 12. Contact Tags (uses both tag and contact ID mappings)
      if (data.contactTags && data.contactTags.length > 0) {
        let importedCount = 0;
        for (const ct of data.contactTags) {
          try {
            const newContactId = contactIdMap[ct.contactId];
            const newTagId = idMap.tags[ct.tagId];
            if (newContactId && newTagId) {
              await storage.addContactTag(newContactId, newTagId);
              importedCount++;
            }
          } catch (e) {
            // Skip duplicates or errors
          }
        }
        results.contactTags = importedCount;
      }

      res.json({ 
        message: "Backup imported successfully", 
        imported: results,
        idMappings: {
          tags: Object.keys(idMap.tags).length,
          stages: Object.keys(idMap.stages).length,
          departments: Object.keys(idMap.departments).length,
          contacts: Object.keys(contactIdMap).length,
        },
        note: "IDs were remapped automatically. Audio files in robots need re-upload."
      });
    } catch (error) {
      console.error("Backup import error:", error);
      res.status(500).json({ message: "Failed to import backup" });
    }
  });

  return httpServer;
}
