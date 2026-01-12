import { Request, Response, Router } from "express";
import { authMiddleware } from "./auth";
import { baileysGateway } from "./baileys-gateway";

const router = Router();

router.post("/connect", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { accountId } = req.body;

  if (!accountId) {
    res.status(400).json({ error: "accountId is required" });
    return;
  }

  const result = await baileysGateway.startSession(accountId);
  res.json(result);
});

router.post("/disconnect", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { accountId } = req.body;

  if (!accountId) {
    res.status(400).json({ error: "accountId is required" });
    return;
  }

  await baileysGateway.disconnect(accountId);
  res.json({ success: true });
});

router.post("/send", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { accountId, phoneNumber, content, mediaUrl, mediaType } = req.body;

  if (!accountId || !phoneNumber) {
    res.status(400).json({ error: "accountId and phoneNumber are required" });
    return;
  }

  if (!content && !mediaUrl) {
    res.status(400).json({ error: "content or mediaUrl is required" });
    return;
  }

  const result = await baileysGateway.sendMessage(
    accountId,
    phoneNumber,
    content || "",
    mediaUrl,
    mediaType
  );

  res.json(result);
});

router.get("/status/:accountId", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const accountIdParam = req.params.accountId;

  if (!accountIdParam || Array.isArray(accountIdParam)) {
    res.status(400).json({ error: "accountId is required" });
    return;
  }

  const status = baileysGateway.getStatus(accountIdParam);
  res.json(status);
});


router.get("/sessions", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const sessions = baileysGateway.getAllSessions();
  res.json({ sessions });
});

router.get("/health", (req: Request, res: Response): void => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    sessions: baileysGateway.getAllSessions().length,
  });
});

export default router;
