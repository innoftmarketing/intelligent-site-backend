import { query } from "../db/index.js";

interface Conversation {
  id: string;
  client_id: string;
  status: string;
  pending_action: Record<string, unknown> | null;
  pending_image_url: string | null;
  claude_messages: unknown[];
  created_at: Date;
  updated_at: Date;
}

export type { Conversation };

export async function getActiveConversation(clientId: string): Promise<Conversation | null> {
  const result = await query<Conversation>(
    `SELECT * FROM conversations
     WHERE client_id = $1 AND status IN ('active', 'waiting_for_approval')
     ORDER BY updated_at DESC LIMIT 1`,
    [clientId]
  );
  return result.rows[0] ?? null;
}

export async function createConversation(clientId: string): Promise<Conversation> {
  const result = await query<Conversation>(
    `INSERT INTO conversations (client_id, status, claude_messages)
     VALUES ($1, 'active', '[]')
     RETURNING *`,
    [clientId]
  );
  return result.rows[0];
}

export async function updateConversation(
  conversationId: string,
  updates: {
    status?: string;
    pendingAction?: Record<string, unknown> | null;
    pendingImageUrl?: string | null;
    claudeMessages?: unknown[];
  }
): Promise<void> {
  const sets: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [];
  let i = 1;

  if (updates.status !== undefined) {
    sets.push(`status = $${i++}`);
    values.push(updates.status);
  }
  if (updates.pendingAction !== undefined) {
    sets.push(`pending_action = $${i++}`);
    values.push(JSON.stringify(updates.pendingAction));
  }
  if (updates.pendingImageUrl !== undefined) {
    sets.push(`pending_image_url = $${i++}`);
    values.push(updates.pendingImageUrl);
  }
  if (updates.claudeMessages !== undefined) {
    sets.push(`claude_messages = $${i++}`);
    values.push(JSON.stringify(updates.claudeMessages));
  }

  values.push(conversationId);
  await query(
    `UPDATE conversations SET ${sets.join(", ")} WHERE id = $${i}`,
    values
  );
}

export async function getExpiredApprovals(hoursOld: number): Promise<Conversation[]> {
  const result = await query<Conversation>(
    `SELECT * FROM conversations
     WHERE status = 'waiting_for_approval'
       AND updated_at < NOW() - INTERVAL '1 hour' * $1`,
    [hoursOld]
  );
  return result.rows;
}
