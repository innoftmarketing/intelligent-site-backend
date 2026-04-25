-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    wordpress_url TEXT NOT NULL,
    wp_api_key_encrypted TEXT NOT NULL,
    wp_api_secret_encrypted TEXT NOT NULL,
    security_pin_hash TEXT NOT NULL,
    session_token TEXT,
    session_expires_at TIMESTAMPTZ,
    failed_pin_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    system_prompt_config JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone_number);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'waiting_for_approval', 'completed', 'expired')),
    pending_action JSONB,
    pending_image_url TEXT,
    claude_messages JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- Change log table
CREATE TABLE IF NOT EXISTS change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    conversation_id UUID REFERENCES conversations(id),
    change_type TEXT NOT NULL
        CHECK (change_type IN ('text', 'image', 'product', 'media')),
    description TEXT NOT NULL,
    target_page TEXT,
    target_element TEXT,
    before_value TEXT,
    after_value TEXT,
    rolled_back BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_changelog_client ON change_log(client_id);

-- Conversation routing: which agent (CRM or WEB) should receive each
-- WhatsApp number's messages. Bot asks "1 ou 2?" once, then remembers the
-- choice for 30 minutes of activity. /switch or /menu resets it.
CREATE TABLE IF NOT EXISTS conversation_routing (
    wa_number TEXT PRIMARY KEY,
    state TEXT NOT NULL
        CHECK (state IN ('awaiting_choice', 'active_crm', 'active_web')),
    pending_payload JSONB,
    last_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_last_at ON conversation_routing(last_at);
