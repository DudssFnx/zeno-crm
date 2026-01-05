import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "./config";

export function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", config.gatewaySecret)
    .update(payload)
    .digest("hex");
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export function signPayload(payload: string): string {
  return crypto
    .createHmac("sha256", config.gatewaySecret)
    .update(payload)
    .digest("hex");
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers["x-gateway-signature"] as string;
  const timestamp = req.headers["x-gateway-timestamp"] as string;
  
  if (!signature || !timestamp) {
    res.status(401).json({ error: "Missing authentication headers" });
    return;
  }
  
  const timestampMs = parseInt(timestamp, 10);
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  if (Math.abs(now - timestampMs) > fiveMinutes) {
    res.status(401).json({ error: "Request expired" });
    return;
  }
  
  const payload = JSON.stringify(req.body) + timestamp;
  
  if (!verifySignature(payload, signature)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  
  next();
}
