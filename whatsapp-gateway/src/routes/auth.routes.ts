import { Router } from "express";
import { login, me, register } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/login", login);
router.post("/register", register);
router.get("/me", authMiddleware, me);

export default router;
