CREATE TABLE IF NOT EXISTS post_views (
  slug TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_views_ranking
ON post_views (views DESC, updated_at DESC);
