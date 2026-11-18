CREATE TABLE IF NOT EXISTS frequent_statuses (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  status_text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 1000,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frequent_statuses_team_pos
  ON frequent_statuses(team_id, position, created_at);
