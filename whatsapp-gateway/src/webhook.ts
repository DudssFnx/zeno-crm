import { config } from "./config";
import { signPayload } from "./auth";

interface WebhookEvent {
  type: string;
  accountId: string;
  timestamp: string;
  data: any;
}

export async function sendWebhook(event: WebhookEvent): Promise<boolean> {
  if (!config.webhookUrl) {
    console.log(`[Webhook] URL not configured, skipping event: ${event.type}`);
    return false;
  }

  const payload = JSON.stringify(event);
  const timestamp = Date.now().toString();
  const signature = signPayload(payload + timestamp);

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Signature": signature,
        "X-Gateway-Timestamp": timestamp,
      },
      body: payload,
    });

    if (!response.ok) {
      console.error(`[Webhook] Failed to send: ${response.status} ${response.statusText}`);
      return false;
    }

    console.log(`[Webhook] Sent successfully: ${event.type} for account ${event.accountId}`);
    return true;
  } catch (error) {
    console.error(`[Webhook] Error sending:`, error);
    return false;
  }
}

export async function sendMessageCreatedEvent(
  accountId: string,
  message: {
    phoneNumber: string;
    contactName: string;
    content: string;
    timestamp: string;
    direction: "incoming" | "outgoing";
    messageId?: string;
    avatarUrl?: string;
    mediaInfo?: {
      mediaType: string;
      mimetype: string;
      fileName?: string;
      fileSize?: number;
    };
  }
): Promise<boolean> {
  return sendWebhook({
    type: "message.created",
    accountId,
    timestamp: new Date().toISOString(),
    data: message,
  });
}

export async function sendStatusUpdateEvent(
  accountId: string,
  status: string,
  error?: string
): Promise<boolean> {
  return sendWebhook({
    type: "status.updated",
    accountId,
    timestamp: new Date().toISOString(),
    data: { status, error },
  });
}

export async function sendQRCodeEvent(
  accountId: string,
  qrCode: string
): Promise<boolean> {
  return sendWebhook({
    type: "qr.generated",
    accountId,
    timestamp: new Date().toISOString(),
    data: { qrCode },
  });
}
