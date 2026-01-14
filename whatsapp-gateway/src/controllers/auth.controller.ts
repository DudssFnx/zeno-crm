import { Router } from "express";
import authRoutes from "./auth.routes";
import gatewayRoutes from "../routes"; // este é o routes.ts que você mostrou

const router = Router();

// 🔐 AUTH
router.use("/api/auth", authRoutes);

// 🤖 WHATSAPP GATEWAY
router.use("/api/gateway", gatewayRoutes);

export default router;
