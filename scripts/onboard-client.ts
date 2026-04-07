import "dotenv/config";
import { encrypt } from "../src/services/encryption.js";
import { hashPin } from "../src/services/auth.js";
import pg from "pg";

const { Pool } = pg;

// Parse command line or interactive mode
const args = process.argv.slice(2);

if (args[0] === "--help" || args.length === 0) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  Intelligent Website — Client Onboarding Tool        ║
╚══════════════════════════════════════════════════════╝

Usage:
  npx tsx scripts/onboard-client.ts --json '<json>'

JSON format:
{
  "name": "Business Name",
  "phone": "212612345678",
  "pin": "1234",
  "wordpressUrl": "https://example.com",
  "wpApiKey": "from-plugin-activation",
  "wpApiSecret": "from-plugin-activation",
  "profile": {
    "businessType": "restaurant",
    "language": "English",
    "tone": "friendly and professional",
    "brandDescription": "What the business does",
    "whatTheySell": "Products or services offered",
    "targetAudience": "Who their customers are",
    "brandColors": {
      "primary": "#722F37",
      "secondary": "#C9A96E",
      "accent": "#5A252C",
      "background": "#F5F0E8"
    },
    "imageStyle": "Describe the visual style for image generation",
    "doNot": "Things to avoid in images and communication"
  }
}

Steps before running:
1. Install the Intelligent Site Connector plugin on the client's WordPress site
2. Copy the generated API key and secret from WordPress admin
3. Run this script with the client details
  `);
  process.exit(0);
}

let clientData: any;

if (args[0] === "--json") {
  clientData = JSON.parse(args.slice(1).join(" "));
} else {
  console.error("Use --json flag. Run with --help for usage.");
  process.exit(1);
}

const {
  name,
  phone,
  pin = "1234",
  wordpressUrl,
  wpApiKey,
  wpApiSecret,
  profile = {},
} = clientData;

if (!name || !phone || !wordpressUrl || !wpApiKey || !wpApiSecret) {
  console.error("Missing required fields: name, phone, wordpressUrl, wpApiKey, wpApiSecret");
  process.exit(1);
}

const masterKey = process.env.MASTER_ENCRYPTION_KEY!;
if (!masterKey) {
  console.error("MASTER_ENCRYPTION_KEY not set in environment");
  process.exit(1);
}

console.log("\n🔧 Onboarding client:", name);
console.log("   Phone:", phone);
console.log("   WordPress:", wordpressUrl);

// Encrypt credentials
const encKey = encrypt(wpApiKey, masterKey);
const encSecret = encrypt(wpApiSecret, masterKey);
const pinHash = await hashPin(pin);

console.log("   ✅ Credentials encrypted");
console.log("   ✅ PIN hashed");

// Build the profile config
const systemPromptConfig = {
  businessType: profile.businessType ?? "business",
  language: profile.language ?? "English",
  tone: profile.tone ?? "friendly and professional",
  brandDescription: profile.brandDescription,
  whatTheySell: profile.whatTheySell,
  targetAudience: profile.targetAudience,
  brandColors: profile.brandColors,
  imageStyle: profile.imageStyle,
  doNot: profile.doNot,
};

// Clean undefined values
Object.keys(systemPromptConfig).forEach((key) => {
  if (systemPromptConfig[key as keyof typeof systemPromptConfig] === undefined) {
    delete systemPromptConfig[key as keyof typeof systemPromptConfig];
  }
});

// Insert into database
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  // Check if phone already registered
  const existing = await pool.query(
    "SELECT id, name FROM clients WHERE phone_number = $1",
    [phone]
  );

  if (existing.rows.length > 0) {
    console.log(`\n⚠️  Phone ${phone} already registered to "${existing.rows[0].name}"`);
    console.log("   Use --force to update (not implemented yet)");
    process.exit(1);
  }

  const result = await pool.query(
    `INSERT INTO clients (name, phone_number, wordpress_url, wp_api_key_encrypted, wp_api_secret_encrypted, security_pin_hash, system_prompt_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, phone_number`,
    [
      name,
      phone,
      wordpressUrl,
      encKey,
      encSecret,
      pinHash,
      JSON.stringify(systemPromptConfig),
    ]
  );

  const client = result.rows[0];

  console.log("\n✅ Client onboarded successfully!");
  console.log("╔══════════════════════════════════════╗");
  console.log(`║  ID:    ${client.id}`);
  console.log(`║  Name:  ${client.name}`);
  console.log(`║  Phone: ${client.phone_number}`);
  console.log(`║  PIN:   ${pin}`);
  console.log("╚══════════════════════════════════════╝");
  console.log("\n📱 The client can now message the WhatsApp number.");
  console.log("   First message will ask for PIN:", pin);
  console.log("");
} catch (err) {
  console.error("❌ Failed to onboard:", err);
  process.exit(1);
} finally {
  await pool.end();
}
