export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  
  databaseUrl: process.env.DATABASE_URL || "",
  
  webhookUrl: process.env.WEBHOOK_URL || "",
  
  gatewaySecret: process.env.GATEWAY_SECRET || "change-me-in-production",
  
  sessionDir: process.env.SESSION_DIR || "./whatsapp-sessions",
  
  corsOrigin: process.env.CORS_ORIGIN || "*",
};

export function validateConfig(): void {
  if (!config.databaseUrl) {
    console.warn("[Config] DATABASE_URL not set - database features disabled");
  }
  
  if (!config.webhookUrl) {
    console.warn("[Config] WEBHOOK_URL not set - webhook delivery disabled");
  }
  
  if (config.gatewaySecret === "change-me-in-production") {
    console.warn("[Config] GATEWAY_SECRET using default value - CHANGE IN PRODUCTION");
  }
}
