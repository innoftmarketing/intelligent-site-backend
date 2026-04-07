import { query } from "../db/index.js";

interface ChangeLogEntry {
  clientId: string;
  conversationId: string;
  changeType: "text" | "image" | "product" | "media";
  description: string;
  targetPage?: string;
  targetElement?: string;
  beforeValue?: string;
  afterValue?: string;
}

export type { ChangeLogEntry };

export async function logChange(entry: ChangeLogEntry): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO change_log
       (client_id, conversation_id, change_type, description,
        target_page, target_element, before_value, after_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      entry.clientId, entry.conversationId, entry.changeType, entry.description,
      entry.targetPage ?? null, entry.targetElement ?? null,
      entry.beforeValue ?? null, entry.afterValue ?? null,
    ]
  );
  return result.rows[0].id;
}

export async function getLastChange(clientId: string) {
  const result = await query<ChangeLogEntry & { id: string }>(
    `SELECT * FROM change_log
     WHERE client_id = $1 AND rolled_back = false
     ORDER BY created_at DESC LIMIT 1`,
    [clientId]
  );
  return result.rows[0] ?? null;
}

export async function markRolledBack(changeId: string): Promise<void> {
  await query("UPDATE change_log SET rolled_back = true WHERE id = $1", [changeId]);
}
