-- 002: urls table
CREATE TABLE IF NOT EXISTS urls (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  short_code   VARCHAR(16) NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  custom_alias VARCHAR(64) UNIQUE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
