import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { query } from "../db/index.js";

interface Client {
  id: string;
  name: string;
  phone_number: string;
  wordpress_url: string;
  wp_api_key_encrypted: string;
  wp_api_secret_encrypted: string;
  security_pin_hash: string;
  session_token: string | null;
  session_expires_at: Date | null;
  failed_pin_attempts: number;
  locked_until: Date | null;
  system_prompt_config: Record<string, unknown>;
  active: boolean;
}

interface AuthResult {
  success: boolean;
  clientId?: string;
  error?: "not_registered" | "locked" | "wrong_pin" | "session_expired";
}

export type { Client, AuthResult };

export async function lookupClient(phoneNumber: string): Promise<Client | null> {
  const result = await query<Client>(
    "SELECT * FROM clients WHERE phone_number = $1 AND active = true",
    [phoneNumber]
  );
  return result.rows[0] ?? null;
}

export async function hasActiveSession(client: Client): Promise<boolean> {
  if (!client.session_token || !client.session_expires_at) return false;
  return new Date(client.session_expires_at) > new Date();
}

export async function verifyPin(client: Client, pin: string): Promise<AuthResult> {
  if (client.locked_until && new Date(client.locked_until) > new Date()) {
    return { success: false, error: "locked" };
  }

  const valid = await bcrypt.compare(pin, client.security_pin_hash);

  if (!valid) {
    const attempts = client.failed_pin_attempts + 1;
    if (attempts >= 3) {
      await query(
        "UPDATE clients SET failed_pin_attempts = $1, locked_until = NOW() + INTERVAL '1 hour' WHERE id = $2",
        [attempts, client.id]
      );
      return { success: false, error: "locked" };
    }
    await query(
      "UPDATE clients SET failed_pin_attempts = $1 WHERE id = $2",
      [attempts, client.id]
    );
    return { success: false, error: "wrong_pin" };
  }

  const sessionToken = randomBytes(32).toString("hex");
  await query(
    `UPDATE clients
     SET session_token = $1,
         session_expires_at = NOW() + INTERVAL '24 hours',
         failed_pin_attempts = 0,
         locked_until = NULL
     WHERE id = $2`,
    [sessionToken, client.id]
  );

  return { success: true, clientId: client.id };
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12);
}
