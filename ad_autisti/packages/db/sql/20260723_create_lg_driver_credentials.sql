-- Thin auth overlay for the driver portal.
-- lg_drivers is a daily roster and has no password column.

CREATE TABLE IF NOT EXISTS lg_driver_credentials (
  driver_id INTEGER PRIMARY KEY,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
