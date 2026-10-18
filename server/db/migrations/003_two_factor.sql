-- 003_two_factor: optional authenticator-app (TOTP) sign-in.

ALTER TABLE users
  ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- AES-256-GCM encrypted base32 secret (see lib/secretBox.js); never plain text
  ADD COLUMN totp_secret TEXT,
  -- secret generated during setup, only promoted to totp_secret once the user
  -- proves their app works by entering a code
  ADD COLUMN totp_pending_secret TEXT,
  -- last accepted 30-second time step, so a code can't be replayed
  ADD COLUMN totp_last_step INTEGER;

-- one-time backup codes for when the authenticator app is lost; only hashes are
-- stored, and each code can be used once
CREATE TABLE totp_backup_codes (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE INDEX idx_backup_codes_user ON totp_backup_codes (user_id);
