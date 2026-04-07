import { createHmac } from "node:crypto";
import type { IncomingMessage, WhatsAppProvider } from "./types.js";

export class EvolutionProvider implements WhatsAppProvider {
  private get baseUrl() { return process.env.EVOLUTION_API_URL!; }
  private get apiKey() { return process.env.EVOLUTION_API_KEY!; }
  private get instance() { return process.env.EVOLUTION_INSTANCE!; }
  private get webhookSecret() { return process.env.WEBHOOK_SECRET!; }

  parseWebhook(body: unknown): IncomingMessage | null {
    const data = body as Record<string, any>;
    if (data.event !== "messages.upsert") return null;

    const msg = data.data;
    if (!msg?.key?.remoteJid || msg.key.fromMe) return null;

    const from = msg.key.remoteJid.replace("@s.whatsapp.net", "");
    const messageId = msg.key.id;
    const timestamp = parseInt(msg.messageTimestamp, 10);

    if (msg.message?.conversation || msg.message?.extendedTextMessage) {
      return {
        from, messageId, type: "text",
        text: msg.message.conversation ?? msg.message.extendedTextMessage?.text,
        timestamp,
      };
    }

    if (msg.message?.audioMessage) {
      return {
        from, messageId, type: "audio",
        mediaUrl: msg.message.audioMessage.url,
        mediaKey: msg.key.id, timestamp,
      };
    }

    if (msg.message?.imageMessage) {
      return {
        from, messageId, type: "image",
        text: msg.message.imageMessage.caption,
        mediaUrl: msg.message.imageMessage.url,
        mediaKey: msg.key.id, timestamp,
      };
    }

    return null;
  }

  async sendText(to: string, text: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/message/sendText/${this.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: to, text }),
    });
    if (!res.ok) throw new Error(`Evolution sendText failed: ${res.status} ${await res.text()}`);
  }

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/message/sendMedia/${this.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({
        number: to, mediatype: "image", mimetype: "image/png",
        caption: caption ?? "", media: imageUrl,
      }),
    });
    if (!res.ok) throw new Error(`Evolution sendImage failed: ${res.status} ${await res.text()}`);
  }

  async downloadMedia(message: IncomingMessage): Promise<Buffer> {
    const res = await fetch(`${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ message: { key: { id: message.mediaKey } }, convertToMp4: false }),
    });
    if (!res.ok) throw new Error(`Evolution downloadMedia failed: ${res.status}`);
    const data = (await res.json()) as { base64: string };
    return Buffer.from(data.base64, "base64");
  }

  verifySignature(payload: string, signature: string): boolean {
    const expected = createHmac("sha256", this.webhookSecret).update(payload).digest("hex");
    return expected === signature;
  }
}
