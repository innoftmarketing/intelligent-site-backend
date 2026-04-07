import "dotenv/config";
import { encrypt } from "../src/services/encryption.js";
import { hashPin } from "../src/services/auth.js";
import pg from "pg";

const { Pool } = pg;

const args = process.argv.slice(2);
if (args.length < 5) {
  console.log("Usage: npx tsx scripts/register-client.ts <name> <phone> <wp_url> <wp_api_key> <wp_api_secret> [pin]");
  process.exit(1);
}

const [name, phone, wpUrl, wpKey, wpSecret] = args;
const pin = args[5] ?? "1234";
const masterKey = process.env.MASTER_ENCRYPTION_KEY!;

const encKey = encrypt(wpKey, masterKey);
const encSecret = encrypt(wpSecret, masterKey);
const pinHash = await hashPin(pin);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const result = await pool.query(
  `INSERT INTO clients (name, phone_number, wordpress_url, wp_api_key_encrypted, wp_api_secret_encrypted, security_pin_hash, system_prompt_config)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   RETURNING id, name, phone_number`,
  [name, phone, wpUrl, encKey, encSecret, pinHash, JSON.stringify({ businessType: "demo", language: "English", tone: "friendly" })]
);

console.log("Client registered:", result.rows[0]);
console.log("PIN:", pin);
await pool.end();
