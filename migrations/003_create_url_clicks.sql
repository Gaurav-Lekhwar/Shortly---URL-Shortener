-- 003: url_clicks table (analytics events)
-- Only anonymized data: visitor_hash is sha256(ip + user-agent), never the raw IP.
CREATE TABLE IF NOT EXISTS url_clicks (
  id              SERIAL PRIMARY KEY,
  url_id          INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
  clicked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referrer        TEXT,
  browser         VARCHAR(64),
  operating_system VARCHAR(64),
  device_type     VARCHAR(32),
  country         VARCHAR(64),
  visitor_hash    CHAR(64)
);
