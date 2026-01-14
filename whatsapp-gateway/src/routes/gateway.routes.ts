import { Request, Response, Router } from "express";
import { authMiddleware } from "../auth";
import { baileysGateway } from "../baileys-gateway";

const router = Router();

/**
 * Conectar sessão
 */
router.post(
  "/connect",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { accountId } = req.body;

    if (!accountId) {
      res.status(400).json({ error: "accountId is required" });
      return;
    }

    const result = await baileysGateway.startSession(accountId);
    res.json(result);
  }
);

/**
 * Desconectar sessão
 */
router.post(
  "/disconnect",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { accountId } = req.body;

    if (!accountId) {
      res.status(400).json({ error: "accountId is required" });
      return;
    }

    await baileysGateway.disconnect(accountId);
    res.json({ success: true });
  }
);

/**
 * Enviar mensagem (TEXTO)
 */
router.post(
  "/send",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { accountId, phoneNumber, content } = req.body;

    if (!accountId || !phoneNumber || !content) {
      res.status(400).json({
        error: "accountId, phoneNumber and content are required",
      });
      return;
    }

    const result = await baileysGateway.sendMessage(
      accountId,
      phoneNumber,
      content
    );

    res.json(result);
  }
);

/**
 * Status da sessão
 */
router.get(
  "/status/:accountId",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const accountIdParam = req.params.accountId;

    if (!accountIdParam || Array.isArray(accountIdParam)) {
      res.status(400).json({ error: "accountId is required" });
      return;
    }

    const status = baileysGateway.getStatus(accountIdParam);
    res.json(status);
  }
);

/**
 * Listar sessões
 */
router.get(
  "/sessions",
  authMiddleware,
  async (_req: Request, res: Response): Promise<void> => {
    const sessions = baileysGateway.getAllSessions();
    res.json({ sessions });
  }
);

/**
 * Healthcheck
 */
router.get("/health", (_req: Request, res: Response): void => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    sessions: baileysGateway.getAllSessions().length,
  });
});

export default router;
