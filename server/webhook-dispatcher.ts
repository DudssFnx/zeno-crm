import crypto from "crypto";
import { db } from "./db";
import { webhookConfigs, automationLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";

type WebhookEvent = "message.incoming" | "contact.tag.changed" | "conversation.status.changed";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, any>;
}

export async function dispatchWebhook(
  companyId: string,
  event: WebhookEvent,
  data: Record<string, any>
): Promise<void> {
  const webhooks = await db
    .select()
    .from(webhookConfigs)
    .where(and(eq(webhookConfigs.companyId, companyId), eq(webhookConfigs.isActive, true)));

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  for (const webhook of webhooks) {
    const events = webhook.events as string[];
    if (!events.includes(event)) continue;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const bodyStr = JSON.stringify(payload);

      if (webhook.secret) {
        const signature = crypto
          .createHmac("sha256", webhook.secret)
          .update(bodyStr)
          .digest("hex");
        headers["X-Signature"] = signature;
      }

      console.log(`[WebhookDispatcher] Sending ${event} to ${webhook.url}`);

      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      await db.insert(automationLogs).values({
        companyId,
        type: "webhook_call",
        event,
        payload,
        status: response.ok ? "success" : "error",
        responseStatusCode: response.status.toString(),
        errorMessage: response.ok ? null : `HTTP ${response.status}`,
      });

      console.log(`[WebhookDispatcher] Webhook sent successfully: ${response.status}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[WebhookDispatcher] Failed to send webhook: ${errorMessage}`);

      await db.insert(automationLogs).values({
        companyId,
        type: "webhook_call",
        event,
        payload,
        status: "error",
        errorMessage,
      });
    }
  }
}
