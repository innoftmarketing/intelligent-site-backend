import { schedules } from "@trigger.dev/sdk";
import { getExpiredApprovals, updateConversation } from "../services/conversation.js";
import { EvolutionProvider } from "../providers/whatsapp/evolution.js";
import { query } from "../db/index.js";

export const approvalTimeout = schedules.task({
  id: "approval-timeout-check",
  cron: "0 * * * *",
  run: async () => {
    const whatsapp = new EvolutionProvider();

    const reminders = await getExpiredApprovals(24);
    for (const conv of reminders) {
      const hoursOld = (Date.now() - new Date(conv.updated_at).getTime()) / (1000 * 60 * 60);
      if (hoursOld < 25) {
        const r = await query<{ phone_number: string }>("SELECT phone_number FROM clients WHERE id = $1", [conv.client_id]);
        if (r.rows[0]) {
          await whatsapp.sendText(r.rows[0].phone_number, "⏰ You have a pending change waiting for approval. Reply \"yes\" to apply it, or send a new request.");
        }
      }
    }

    const expired = await getExpiredApprovals(48);
    for (const conv of expired) {
      await updateConversation(conv.id, { status: "expired", pendingAction: null, pendingImageUrl: null });
    }

    return { reminded: reminders.length, expired: expired.length };
  },
});
