-- 0002_user_avatar_and_preferences_pg.sql
-- Adds user avatar_url, session active_team_id for team switching, and team document font preferences.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS active_team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS document_font_family VARCHAR(64) NOT NULL DEFAULT 'Liberation Serif',
  ADD COLUMN IF NOT EXISTS document_font_size_pt INTEGER NOT NULL DEFAULT 11;
