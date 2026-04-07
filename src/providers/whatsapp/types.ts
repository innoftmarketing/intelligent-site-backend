export interface IncomingMessage {
  from: string;
  messageId: string;
  type: "text" | "audio" | "image";
  text?: string;
  mediaUrl?: string;
  mediaKey?: string;
  timestamp: number;
}

export interface WhatsAppProvider {
  parseWebhook(body: unknown): IncomingMessage | null;
  sendText(to: string, text: string): Promise<void>;
  sendImage(to: string, imageUrl: string, caption?: string): Promise<void>;
  downloadMedia(message: IncomingMessage): Promise<Buffer>;
  verifySignature(payload: string, signature: string): boolean;
}
