-- Saved diagrams: only what the save_diagram tool receives, plus the creation time.
CREATE TABLE diagrams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Global daily write counter (UTC day, "YYYY-MM-DD"). Per-IP limits do not work:
-- requests from Claude cloud apps share one address range.
CREATE TABLE daily_counts (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);
