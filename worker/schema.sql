-- Boos Kadazan friends server: one row per learner who made a friend code.
CREATE TABLE IF NOT EXISTS learners (
  code        TEXT PRIMARY KEY,          -- 6-character friend code, shared freely
  name        TEXT NOT NULL,             -- display name the learner chose
  secret_hash TEXT NOT NULL,             -- SHA-256 of the secret only the learner's device holds
  xp          INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,
  streak_last TEXT,                      -- YYYY-MM-DD of the last day practised (learner's own calendar)
  lessons     INTEGER NOT NULL DEFAULT 0,
  week_key    TEXT,                      -- YYYY-MM-DD of the Monday that week_xp belongs to
  week_xp     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- New friend codes per network per day, to stop one visitor filling the database.
CREATE TABLE IF NOT EXISTS create_log (
  ip_hash TEXT NOT NULL,
  day     TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);
