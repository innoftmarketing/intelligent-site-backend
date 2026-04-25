// 2026-04-25 · Per-conversation router that asks the WhatsApp user whether
// they want the SMART-CRM agent (1) or the website-editor agent (2), then
// remembers the choice for 30 minutes of activity. /switch or /menu resets.
import { tasks } from "@trigger.dev/sdk";
import type { processMessage } from "../trigger/process-message.js";
import { EvolutionProvider } from "../providers/whatsapp/evolution.js";
import { query } from "../db/index.js";
import { env } from "../env.js";

const ROUTING_TTL_MIN = 30;

const PROMPT_FR =
  "Tu veux quel agent ?\n\n1️⃣ *Agent CRM* — projets, factures, clients, devis, dépenses\n2️⃣ *Agent site web* — modifier ton site WordPress\n\nRéponds par *1* ou *2*. Tape /switch à tout moment pour changer.";

const PROMPT_REASK =
  "Réponds par *1* (Agent CRM) ou *2* (Agent site web).";

type RoutingState = "awaiting_choice" | "active_crm" | "active_web";

type RoutingRow = {
  wa_number: string;
  state: RoutingState;
  pending_payload: unknown;
  last_at: Date;
};

async function getRouting(waNumber: string): Promise<RoutingRow | null> {
  const r = await query<RoutingRow>(
    `SELECT wa_number, state, pending_payload, last_at
     FROM conversation_routing
     WHERE wa_number = $1`,
    [waNumber],
  );
  return r.rows[0] ?? null;
}

async function setRouting(
  waNumber: string,
  state: RoutingState,
  pendingPayload: unknown | null,
): Promise<void> {
  await query(
    `INSERT INTO conversation_routing (wa_number, state, pending_payload, last_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (wa_number)
     DO UPDATE SET state = EXCLUDED.state,
                   pending_payload = EXCLUDED.pending_payload,
                   last_at = NOW()`,
    [waNumber, state, pendingPayload === null ? null : JSON.stringify(pendingPayload)],
  );
}

async function clearRouting(waNumber: string): Promise<void> {
  await query(`DELETE FROM conversation_routing WHERE wa_number = $1`, [waNumber]);
}

function isExpired(lastAt: Date): boolean {
  const ms = Date.now() - new Date(lastAt).getTime();
  return ms > ROUTING_TTL_MIN * 60 * 1000;
}

function parseChoice(text: string): "CRM" | "WEB" | null {
  const t = text.trim().toLowerCase();
  if (t === "1" || t.startsWith("1 ") || t === "crm") return "CRM";
  if (t === "2" || t.startsWith("2 ") || t === "site" || t === "site web" || t === "web" || t === "website") {
    return "WEB";
  }
  return null;
}

function isSwitchCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "/switch" || t === "/menu" || t === "switch" || t === "menu";
}

async function triggerWebsiteAgent(
  whatsapp: EvolutionProvider,
  rawBody: unknown,
): Promise<void> {
  const message = whatsapp.parseWebhook(rawBody);
  if (!message) return;
  await tasks.trigger<typeof processMessage>("process-whatsapp-message", { message });
}

async function triggerSmartCrm(rawBody: unknown): Promise<void> {
  const res = await fetch(env.SMART_CRM_TRIGGER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SMART_CRM_TRIGGER_KEY}`,
    },
    body: JSON.stringify({ payload: rawBody }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SMART-CRM trigger failed: ${res.status} ${txt}`);
  }
}

/**
 * Top-level router. Called from the webhook handler with the raw Evolution
 * payload (the full POST body) and the parsed sender number + text.
 *
 * Returns nothing — side effects only: triggers a task and/or sends a
 * WhatsApp prompt back to the user.
 */
export async function routeIncoming(args: {
  whatsapp: EvolutionProvider;
  waNumber: string;
  text: string;
  rawBody: unknown;
}): Promise<void> {
  const { whatsapp, waNumber, text, rawBody } = args;

  // /switch and /menu always reset the state and ask again. The command
  // itself isn't routed anywhere.
  if (isSwitchCommand(text)) {
    await setRouting(waNumber, "awaiting_choice", null);
    await whatsapp.sendText(waNumber, PROMPT_FR);
    return;
  }

  const current = await getRouting(waNumber);

  // Expired or never-seen → ask, store the message as pending.
  if (!current || isExpired(current.last_at)) {
    await setRouting(waNumber, "awaiting_choice", rawBody);
    await whatsapp.sendText(waNumber, PROMPT_FR);
    return;
  }

  if (current.state === "awaiting_choice") {
    const choice = parseChoice(text);
    if (!choice) {
      // User typed something else — keep their message as the new pending
      // (in case they meant to send a real prompt) and re-ask.
      await setRouting(waNumber, "awaiting_choice", rawBody);
      await whatsapp.sendText(waNumber, PROMPT_REASK);
      return;
    }

    const pending = current.pending_payload ?? rawBody;
    const nextState: RoutingState = choice === "CRM" ? "active_crm" : "active_web";
    await setRouting(waNumber, nextState, null);

    if (choice === "CRM") {
      await triggerSmartCrm(pending);
    } else {
      await triggerWebsiteAgent(whatsapp, pending);
    }
    return;
  }

  if (current.state === "active_crm") {
    await setRouting(waNumber, "active_crm", null);
    await triggerSmartCrm(rawBody);
    return;
  }

  if (current.state === "active_web") {
    await setRouting(waNumber, "active_web", null);
    await triggerWebsiteAgent(whatsapp, rawBody);
    return;
  }

  // Unknown state — be defensive, reset.
  await clearRouting(waNumber);
  await whatsapp.sendText(waNumber, PROMPT_FR);
}
