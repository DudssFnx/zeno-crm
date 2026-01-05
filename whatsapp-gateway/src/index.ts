import express from "express";
import { config, validateConfig } from "./config";
import routes from "./routes";
import { baileysGateway } from "./baileys-gateway";

const app = express();

app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", config.corsOrigin);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Gateway-Signature, X-Gateway-Timestamp");

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  next();
});

app.use("/api", routes);

app.get("/", (req, res) => {
  res.json({
    service: "WhatsApp Gateway",
    version: "1.0.0",
    status: "running",
  });
});

async function start(): Promise<void> {
  validateConfig();

  console.log("[Gateway] Starting WhatsApp Gateway Service...");

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`[Gateway] Server running on port ${config.port}`);
  });

  setTimeout(() => {
    baileysGateway.initializeAndReconnect().catch((error) => {
      console.error("[Gateway] Error during initialization:", error);
    });
  }, 2000);
}

start().catch((error) => {
  console.error("[Gateway] Failed to start:", error);
  process.exit(1);
});
