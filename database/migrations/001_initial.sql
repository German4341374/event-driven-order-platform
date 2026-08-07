CREATE TYPE order_status AS ENUM ('PENDING', 'RESERVED', 'CONFIRMED', 'CANCELLED');

CREATE TABLE orders (
    id uuid PRIMARY KEY,
    customer_id text NOT NULL,
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    status order_status NOT NULL DEFAULT 'PENDING',
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    simulation text NOT NULL DEFAULT 'success'
        CHECK (simulation IN ('success', 'inventory_failure', 'payment_failure')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_history (
    id bigserial PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,
    to_status order_status NOT NULL,
    reason text,
    message_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_history_order_created_idx ON order_history(order_id, created_at);

CREATE TABLE idempotency_keys (
    key text PRIMARY KEY,
    request_hash text NOT NULL,
    response_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_messages (
    id uuid PRIMARY KEY,
    topic text NOT NULL,
    message_key text NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    published_at timestamptz,
    dead_lettered_at timestamptz
);

CREATE INDEX outbox_unpublished_idx
    ON outbox_messages(occurred_at)
    WHERE published_at IS NULL AND dead_lettered_at IS NULL;

CREATE TABLE processed_messages (
    consumer_name text NOT NULL,
    message_id uuid NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_name, message_id)
);
