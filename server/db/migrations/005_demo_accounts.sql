-- 005_demo_accounts: throwaway demo accounts, so visitors can try Rhabit
-- without signing up. Each one is deleted 24 hours after it's created.
ALTER TABLE users
  ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN expires_at TIMESTAMPTZ;

-- A demo always has an expiry and an address that can never receive mail, and a
-- real account never has either. Clean-up deletes by is_demo and expires_at, so
-- this rule is what guarantees it can never match a real account.
ALTER TABLE users
  ADD CONSTRAINT users_demo_shape CHECK (
    (is_demo AND expires_at IS NOT NULL AND email LIKE 'demo-%@demo.invalid')
    OR (NOT is_demo AND expires_at IS NULL AND email NOT LIKE '%@demo.invalid')
  );

-- clean-up and the active-demo count both look demos up by expiry
CREATE INDEX idx_users_demo_expiry ON users (expires_at) WHERE is_demo;
