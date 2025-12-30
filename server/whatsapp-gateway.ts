export interface IWhatsAppGateway {
  startSession(whatsappAccountId: string): Promise<void>;
  getQrCode(whatsappAccountId: string): Promise<{ qrData: string }>;
  disconnectSession(whatsappAccountId: string): Promise<void>;
  sendMessage(whatsappAccountId: string, toPhone: string, content: string): Promise<{ externalMessageId: string }>;
}

export class MockWhatsAppGateway implements IWhatsAppGateway {
  private sessions: Map<string, { connected: boolean }> = new Map();

  async startSession(whatsappAccountId: string): Promise<void> {
    console.log(`[MockGateway] Starting session for account: ${whatsappAccountId}`);
    this.sessions.set(whatsappAccountId, { connected: false });
  }

  async getQrCode(whatsappAccountId: string): Promise<{ qrData: string }> {
    console.log(`[MockGateway] Generating QR code for account: ${whatsappAccountId}`);
    const mockQrData = Buffer.from(`mock-qr-${whatsappAccountId}-${Date.now()}`).toString("base64");
    
    setTimeout(() => {
      const session = this.sessions.get(whatsappAccountId);
      if (session) {
        session.connected = true;
        console.log(`[MockGateway] Session connected for account: ${whatsappAccountId}`);
      }
    }, 2000);

    return { qrData: mockQrData };
  }

  async disconnectSession(whatsappAccountId: string): Promise<void> {
    console.log(`[MockGateway] Disconnecting session for account: ${whatsappAccountId}`);
    this.sessions.delete(whatsappAccountId);
  }

  async sendMessage(whatsappAccountId: string, toPhone: string, content: string): Promise<{ externalMessageId: string }> {
    console.log(`[MockGateway] Sending message from ${whatsappAccountId} to ${toPhone}: ${content.substring(0, 50)}...`);
    const externalMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return { externalMessageId };
  }

  isConnected(whatsappAccountId: string): boolean {
    return this.sessions.get(whatsappAccountId)?.connected ?? false;
  }
}

export const whatsappGateway = new MockWhatsAppGateway();
