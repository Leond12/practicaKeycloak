CREATE TABLE IF NOT EXISTS contacts (
    id BIGSERIAL PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    contact_id BIGINT NOT NULL REFERENCES contacts(id),
    current_step VARCHAR(50) NOT NULL DEFAULT 'ASK_NAME',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    pending_song_title VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id),
    direction VARCHAR(20) NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    text TEXT,
    image_url TEXT,
    flow_step VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT messages_direction_check
        CHECK (direction IN ('incoming', 'outgoing')),
    CONSTRAINT messages_type_check
        CHECK (message_type IN ('text', 'image', 'mixed'))
);

CREATE TABLE IF NOT EXISTS songs (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    listened BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    contact_id BIGINT REFERENCES contacts(id),
    conversation_id BIGINT REFERENCES conversations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT songs_status_check
        CHECK (status IN ('pending', 'confirmed', 'listened', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS webhook_events (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(150) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    song_id BIGINT REFERENCES songs(id),
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_contact_id
    ON conversations(contact_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_songs_contact_id
    ON songs(contact_id);

CREATE INDEX IF NOT EXISTS idx_songs_status
    ON songs(status);
