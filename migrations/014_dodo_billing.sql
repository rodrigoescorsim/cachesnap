ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dodo_customer_id    TEXT,
  ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT;
