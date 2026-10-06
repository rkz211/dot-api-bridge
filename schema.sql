CREATE TABLE IF NOT EXISTS bridge_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL
);
