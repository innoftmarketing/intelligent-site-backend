import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { tasks } from "@trigger.dev/sdk";
import { EvolutionProvider } from "./providers/whatsapp/evolution.js";
import { env } from "./env.js";
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

  await tasks.trigger<typeof processMessage>("process-whatsapp-message", { message });

  return c.json({ ok: true });
});

const port = parseInt(env.PORT, 10);
console.log(`Webhook server starting on port ${port}`);
serve({ fetch: app.fetch, port });
