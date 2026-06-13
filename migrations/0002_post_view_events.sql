CREATE TABLE IF NOT EXISTS post_view_events (
  slug TEXT NOT NULL,
  viewer_key TEXT NOT NULL,
  viewed_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (slug, viewer_key, viewed_on)
);

CREATE INDEX IF NOT EXISTS idx_post_view_events_date
ON post_view_events (viewed_on);
