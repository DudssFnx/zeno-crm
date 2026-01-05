import crypto from "crypto";

export interface GatewayConfig {
  baseUrl: string;
  secret: string;
}

const config: GatewayConfig = {
  baseUrl: process.env.WHATSAPP_GATEWAY_URL || "",
  secret: process.env.GATEWAY_SECRET || "",
};

export function isRemoteGatewayEnabled(): boolean {
  return !!config.baseUrl && !!config.secret;
}

function signPayload(payload: string, timestamp: string): string {
  return crypto
    .createHmac("sha256", config.secret)
    .update(payload + timestamp)
    .digest("hex");
}

export function verifyGatewaySignature(payload: string, signature: string, timestamp: string): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", config.secret)
    .update(payload + timestamp)
    .digest("hex");
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

async function gatewayRequest<T>(
  endpoint: string,
  method: "GET" | "POST",
  body?: any
): Promise<T> {
  const url = `${config.baseUrl}/api${endpoint}`;
  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const signature = signPayload(bodyStr, timestamp);

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Gateway-Signature": signature,
      "X-Gateway-Timestamp": timestamp,
    },
    body: method === "POST" ? bodyStr : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gateway error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function remoteConnect(accountId: string): Promise<{ success: boolean; message: string }> {
  return gatewayRequest<{ success: boolean; message: string }>("/connect", "POST", { accountId });
}

export async function remoteDisconnect(accountId: string): Promise<{ success: boolean }> {
  return gatewayRequest<{ success: boolean }>("/disconnect", "POST", { accountId });
}

export async function remoteSendMessage(
  accountId: string,
  phoneNumber: string,
  content: string,
  mediaUrl?: string,
  mediaType?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return gatewayRequest<{ success: boolean; messageId?: string; error?: string }>("/send", "POST", {
    accountId,
    phoneNumber,
    content,
    mediaUrl,
    mediaType,
  });
}

export async function remoteGetStatus(accountId: string): Promise<{
  status: string;
  qrCode: string | null;
  error: string | null;
}> {
  return gatewayRequest<{ status: string; qrCode: string | null; error: string | null }>(
    `/status/${accountId}`,
    "GET"
  );
}

export async function remoteGetAllSessions(): Promise<{
  sessions: Array<{ accountId: string; status: string; hasQR: boolean }>;
}> {
  return gatewayRequest<{ sessions: Array<{ accountId: string; status: string; hasQR: boolean }> }>(
    "/sessions",
    "GET"
  );
}
