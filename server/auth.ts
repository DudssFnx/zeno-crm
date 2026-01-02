import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import type { User } from "@shared/schema";

const JWT_SECRET = process.env.SESSION_SECRET || "fallback-secret-key-change-in-production";
const TOKEN_EXPIRY = "7d";

export interface AuthRequest extends Request {
  user?: User;
}

export function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id, companyId: user.companyId, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token: string): { userId: string; companyId: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; companyId: string; role: string };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function authMiddleware(storage: any) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await storage.getUser(payload.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  };
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin" && req.user?.role !== "master") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

export function masterMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "master") {
    return res.status(403).json({ message: "Master access required" });
  }
  next();
}

export function notOperatorMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role === "operator") {
    return res.status(403).json({ message: "Operadores não têm permissão para esta ação" });
  }
  next();
}
