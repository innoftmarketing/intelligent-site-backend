import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { tasks } from "@trigger.dev/sdk";
import { EvolutionProvider } from "./providers/whatsapp/evolution.js";
import { env } from "./env.js";
import { routeIncoming } from "./services/router.js";
import { transcribeAudio } from "./providers/transcription.js";
import type { processMessage } from "./trigger/process-message.js";

const app = new Hono();
const whatsapp = new EvolutionProvider();

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/webhook/whatsapp", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-signature") ?? "";

  if (signature && !whatsapp.verifySignature(rawBody, signature)) {
    console.warn("Invalid webhook signature rejected");
    return c.json({ error: "invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);
  const message = whatsapp.parseWebhook(body);
  if (!message) return c.json({ ok: true });

  // For audio: transcribe via ElevenLabs Scribe v2, then synthesise a
  // text-shaped Evolution payload so the router (and downstream agents)
  // see the message as plain text. This way both CRM and WEB agents work
  // identically whether the user typed or recorded a voice note.
  let routableText = message.text ?? "";
  let routableBody = body;
  if (message.type === "audio") {
    try {
      const audioBuffer = await whatsapp.downloadMedia(message);
      routableText = (await transcribeAudio(audioBuffer)).trim();
      console.log(`[transcribe] audio from ${message.from} -> "${routableText}"`);
      if (!routableText) {
        await whatsapp.sendText(
          message.from,
          "Désolé, je n'ai pas réussi à comprendre ton vocal. Réessaie ou écris-moi en texte.",
        );
        return c.json({ ok: true });
      }
      routableBody = synthTextPayload(body, routableText);
    } catch (err) {
      console.error("[transcribe] failed:", err);
      // Fall back to old behaviour: send the audio straight to the website
      // agent (which has its own transcription path).
      await tasks.trigger<typeof processMessage>("process-whatsapp-message", { message });
      return c.json({ ok: true });
    }
  } else if (message.type !== "text" || !message.text) {
    // Image / sticker / unsupported → keep the existing direct-to-WEB flow.
    await tasks.trigger<typeof processMessage>("process-whatsapp-message", { message });
    return c.json({ ok: true });
  }

  try {
    await routeIncoming({
      whatsapp,
      waNumber: message.from,
      text: routableText,
      rawBody: routableBody,
    });
  } catch (err) {
    console.error("[router] error:", err);
    try {
      await whatsapp.sendText(
        message.from,
        "Oups, un souci technique de mon côté. Réessaie dans une minute.",
      );
    } catch {
      // best-effort
    }
  }

  return c.json({ ok: true });
});

/**
 * Replace an audio Evolution payload's `data.message` with a plain
 * `conversation` text block, so downstream agents that only inspect
 * `conversation` / `extendedTextMessage.text` see the transcription.
 */
function synthTextPayload(original: unknown, text: string): unknown {
  const orig = original as Record<string, unknown>;
  const data = (orig.data ?? {}) as Record<string, unknown>;
  return {
    ...orig,
    data: {
      ...data,
      message: { conversation: text },
      messageType: "conversation",
    },
  };
}

const port = parseInt(env.PORT, 10);
console.log(`Webhook server starting on port ${port}`);
serve({ fetch: app.fetch, port });
