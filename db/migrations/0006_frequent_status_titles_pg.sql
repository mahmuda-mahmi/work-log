ALTER TABLE frequent_statuses
  ADD COLUMN IF NOT EXISTS title_ids UUID[] NOT NULL DEFAULT '{}';
