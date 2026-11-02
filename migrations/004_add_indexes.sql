-- 004: indexes
-- users.email: login lookups
-- (UNIQUE constraint in 001 already creates this index; kept explicit for clarity)

-- urls.short_code: redirect lookup on every hit — the most frequent query
-- (UNIQUE constraint in 002 already creates this index)

-- urls.user_id: listing a user's URLs
CREATE INDEX IF NOT EXISTS idx_urls_user_id ON urls(user_id);

-- urls.user_id + created_at: newest-first ordering for a user
CREATE INDEX IF NOT EXISTS idx_urls_user_created ON urls(user_id, created_at DESC);

-- url_clicks.url_id + clicked_at: analytics per URL over time
CREATE INDEX IF NOT EXISTS idx_clicks_url_time ON url_clicks(url_id, clicked_at DESC);
