import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET as string;

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email e senha obrigatórios" });
  }

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1 LIMIT 1",
    [email]
  );

  if (result.rowCount === 0) {
    return res.status(401).json({ message: "Credenciais inválidas" });
  }

  const user = result.rows[0];

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ message: "Credenciais inválidas" });
  }

  const token = jwt.sign(
    {
      userId: user.id,
      companyId: user.company_id,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.company_id,
    },
  });
}

export async function me(req: Request, res: Response) {
  res.json({ user: (req as any).user });
}

export async function register(req: Request, res: Response) {
  res.status(501).json({ message: "Register não implementado ainda" });
}
