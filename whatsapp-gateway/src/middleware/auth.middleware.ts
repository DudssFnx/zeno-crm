import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { users } from "../schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Token não informado" });
  }

  const [, token] = authHeader.split(" ");

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      return res.status(401).json({ message: "Usuário inválido" });
    }

    (req as any).user = {
      id: user.id,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
    };

    next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
}
