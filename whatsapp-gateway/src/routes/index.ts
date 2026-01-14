import { Router } from "express";
import authRoutes from "./auth.routes";
import gatewayRoutes from "./gateway.routes";

const router = Router();

router.use("/api/auth", authRoutes);
router.use("/api/gateway", gatewayRoutes);

export default router;
