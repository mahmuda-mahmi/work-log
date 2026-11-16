-- ============================================================================
-- CGHQ Team Work Report — PostgreSQL 16+ Schema (0001_init_pg)
-- ============================================================================
-- Native UUID, BOOLEAN, TIMESTAMPTZ(3), BYTEA, JSONB, partial indexes,
-- and case-insensitive uniqueness indexes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(512) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  session_version INTEGER NOT NULL DEFAULT 0,
  last_login_at   TIMESTAMPTZ(3) NULL,
  created_at      TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT users_name_not_blank CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120),
  CONSTRAINT users_email_not_blank CHECK (CHAR_LENGTH(TRIM(email)) >= 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS users_active_idx ON users (is_active);

CREATE TABLE IF NOT EXISTS teams (
  id                         UUID PRIMARY KEY,
  name                       VARCHAR(120) NOT NULL,
  slug                       VARCHAR(80) NOT NULL,
  document_title             VARCHAR(160) NOT NULL DEFAULT 'CGHQ Daily Report',
  file_prefix                VARCHAR(120) NOT NULL DEFAULT 'CGHQ_Team_Work_Status',
  timezone                   VARCHAR(64) NOT NULL DEFAULT 'Asia/Dhaka',
  logo_asset_id              UUID NULL,
  prepared_by_default        VARCHAR(120) NULL,
  members_can_add_dictionary BOOLEAN NOT NULL DEFAULT TRUE,
  followups_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  max_members                INTEGER NOT NULL DEFAULT 10,
  created_by_user_id         UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT teams_name_not_blank CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120),
  CONSTRAINT teams_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT teams_max_members_range CHECK (max_members BETWEEN 2 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_slug_uq ON teams (LOWER(slug));
CREATE INDEX IF NOT EXISTS teams_created_by_idx ON teams (created_by_user_id);

CREATE TABLE IF NOT EXISTS team_assets (
  id                 UUID PRIMARY KEY,
  team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  kind               VARCHAR(20) NOT NULL DEFAULT 'logo',
  file_name          VARCHAR(255) NOT NULL,
  mime_type          VARCHAR(64) NOT NULL,
  bytes              BYTEA NOT NULL,
  byte_size          INTEGER NOT NULL,
  sha256             CHAR(64) NOT NULL,
  width              INTEGER NULL,
  height             INTEGER NULL,
  created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT team_assets_kind_check CHECK (kind IN ('logo')),
  CONSTRAINT team_assets_mime_check CHECK (mime_type IN ('image/png', 'image/jpeg')),
  CONSTRAINT team_assets_size_check CHECK (byte_size BETWEEN 1 AND 1048576),
  CONSTRAINT team_assets_bytes_size_check CHECK (OCTET_LENGTH(bytes) = byte_size),
  CONSTRAINT team_assets_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS team_assets_unique_hash ON team_assets (team_id, sha256);
CREATE INDEX IF NOT EXISTS team_assets_team_idx ON team_assets (team_id, created_at DESC);

ALTER TABLE teams
  DROP CONSTRAINT IF EXISTS teams_logo_asset_fk;
ALTER TABLE teams
  ADD CONSTRAINT teams_logo_asset_fk
  FOREIGN KEY (logo_asset_id) REFERENCES team_assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS team_members (
  id           UUID PRIMARY KEY,
  team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'member',
  display_name VARCHAR(120) NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 1000,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT team_members_role_check CHECK (role IN ('lead', 'member')),
  CONSTRAINT team_members_display_name_check CHECK (CHAR_LENGTH(TRIM(display_name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS team_members_unique_user ON team_members (team_id, user_id);
CREATE INDEX IF NOT EXISTS team_members_team_idx ON team_members (team_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members (user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      CHAR(64) NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 0,
  last_active_at  TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ(3) NOT NULL,
  created_at      TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT sessions_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_uq ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS invites (
  id                  UUID PRIMARY KEY,
  team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email               VARCHAR(255) NULL,
  role                VARCHAR(20) NOT NULL DEFAULT 'member',
  token_hash          CHAR(64) NOT NULL,
  expires_at          TIMESTAMPTZ(3) NOT NULL,
  accepted_at         TIMESTAMPTZ(3) NULL,
  accepted_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id  UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT invites_role_check CHECK (role IN ('lead', 'member')),
  CONSTRAINT invites_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS invites_token_hash_uq ON invites (token_hash);
CREATE INDEX IF NOT EXISTS invites_team_idx ON invites (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invites_expiry_idx ON invites (expires_at);

CREATE TABLE IF NOT EXISTS team_join_requests (
  id                  UUID PRIMARY KEY,
  team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name        VARCHAR(120) NOT NULL,
  email               VARCHAR(255) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ(3) NULL,
  created_at          TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT team_join_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS team_join_requests_uq ON team_join_requests (team_id, user_id);
CREATE INDEX IF NOT EXISTS team_join_requests_team_status_idx ON team_join_requests (team_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS password_resets (
  id                 UUID PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash         CHAR(64) NOT NULL,
  expires_at         TIMESTAMPTZ(3) NOT NULL,
  used_at            TIMESTAMPTZ(3) NULL,
  created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT password_resets_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS password_resets_token_hash_uq ON password_resets (token_hash);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key   VARCHAR(190) PRIMARY KEY,
  failures     INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ(3) NOT NULL,
  locked_until TIMESTAMPTZ(3) NULL
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);

CREATE TABLE IF NOT EXISTS categories (
  id         UUID PRIMARY KEY,
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       VARCHAR(80) NOT NULL,
  position   INTEGER NOT NULL DEFAULT 1000,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_name_check CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_unique_name ON categories (team_id, LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS categories_unique_id_team ON categories (id, team_id);
CREATE INDEX IF NOT EXISTS categories_team_idx ON categories (team_id, is_active, position);

CREATE TABLE IF NOT EXISTS titles (
  id             UUID PRIMARY KEY,
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  category_id    UUID NOT NULL,
  name           VARCHAR(120) NOT NULL,
  position       INTEGER NOT NULL DEFAULT 1000,
  default_status VARCHAR(4000) NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT titles_category_team_fk FOREIGN KEY (category_id, team_id) REFERENCES categories(id, team_id) ON DELETE RESTRICT,
  CONSTRAINT titles_name_check CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS titles_unique_name ON titles (team_id, category_id, LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS titles_unique_id_category ON titles (id, category_id);
CREATE INDEX IF NOT EXISTS titles_team_idx ON titles (team_id, category_id, is_active, position);

CREATE TABLE IF NOT EXISTS daily_reports (
  id                   UUID PRIMARY KEY,
  team_id              UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  report_date          DATE NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'draft',
  prepared_by_name     VARCHAR(120) NOT NULL,
  prepared_by_user_id  UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  notes                VARCHAR(4000) NULL,
  revision             INTEGER NOT NULL DEFAULT 0,
  version              INTEGER NOT NULL DEFAULT 1,
  finalized_at         TIMESTAMPTZ(3) NULL,
  finalized_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_reports_status_check CHECK (status IN ('draft', 'finalized', 'reopened')),
  CONSTRAINT daily_reports_prepared_by_check CHECK (CHAR_LENGTH(TRIM(prepared_by_name)) BETWEEN 1 AND 120),
  CONSTRAINT daily_reports_revision_check CHECK (revision >= 0),
  CONSTRAINT daily_reports_version_check CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_reports_unique_day ON daily_reports (team_id, report_date);
CREATE INDEX IF NOT EXISTS daily_reports_team_date_idx ON daily_reports (team_id, report_date DESC);

CREATE TABLE IF NOT EXISTS work_groups (
  id                 UUID PRIMARY KEY,
  report_id          UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  category_id        UUID NOT NULL,
  title_id           UUID NOT NULL,
  position           INTEGER NOT NULL DEFAULT 1000,
  numbering_mode     VARCHAR(20) NOT NULL DEFAULT 'numbered',
  created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT work_groups_title_category_fk FOREIGN KEY (title_id, category_id) REFERENCES titles(id, category_id) ON DELETE RESTRICT,
  CONSTRAINT work_groups_position_check CHECK (position >= 0),
  CONSTRAINT work_groups_numbering_check CHECK (numbering_mode IN ('numbered', 'plain'))
);

CREATE UNIQUE INDEX IF NOT EXISTS work_groups_unique_group ON work_groups (report_id, category_id, title_id);
CREATE INDEX IF NOT EXISTS work_groups_report_idx ON work_groups (report_id, position);

CREATE TABLE IF NOT EXISTS work_entries (
  id                     UUID PRIMARY KEY,
  group_id               UUID NOT NULL REFERENCES work_groups(id) ON DELETE CASCADE,
  status_text            VARCHAR(4000) NOT NULL,
  completed_by_member_id UUID NULL REFERENCES team_members(id) ON DELETE SET NULL,
  completed_by_label     VARCHAR(80) NULL,
  position               INTEGER NOT NULL DEFAULT 1000,
  version                INTEGER NOT NULL DEFAULT 1,
  created_by_user_id     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ(3) NULL,
  CONSTRAINT work_entries_status_check CHECK (CHAR_LENGTH(TRIM(status_text)) BETWEEN 1 AND 4000),
  CONSTRAINT work_entries_position_check CHECK (position >= 0),
  CONSTRAINT work_entries_version_check CHECK (version >= 1),
  CONSTRAINT work_entries_label_check CHECK (completed_by_label IS NULL OR CHAR_LENGTH(TRIM(completed_by_label)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS work_entries_active_group_idx ON work_entries (group_id, position) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS work_entries_member_idx ON work_entries (completed_by_member_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS followup_items (
  id                     UUID PRIMARY KEY,
  team_id                UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  category_id            UUID NULL,
  title_id               UUID NULL,
  status                 VARCHAR(20) NOT NULL DEFAULT 'open',
  status_text            VARCHAR(4000) NOT NULL,
  completed_by_label     VARCHAR(80) NULL DEFAULT 'As Previous',
  completed_by_member_id UUID NULL REFERENCES team_members(id) ON DELETE SET NULL,
  completed_on           DATE NULL,
  position               INTEGER NOT NULL DEFAULT 1000,
  version                INTEGER NOT NULL DEFAULT 1,
  created_by_user_id     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT followup_items_status_enum CHECK (status IN ('open', 'in_progress', 'done', 'archived')),
  CONSTRAINT followup_items_status_check CHECK (CHAR_LENGTH(TRIM(status_text)) BETWEEN 1 AND 4000),
  CONSTRAINT followup_items_position_check CHECK (position >= 0),
  CONSTRAINT followup_items_version_check CHECK (version >= 1),
  CONSTRAINT followup_items_label_check CHECK (completed_by_label IS NULL OR CHAR_LENGTH(TRIM(completed_by_label)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS followup_items_active_team_idx ON followup_items (team_id, position) WHERE status <> 'archived';

CREATE TABLE IF NOT EXISTS report_followups (
  id                UUID PRIMARY KEY,
  report_id         UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  followup_item_id  UUID NULL REFERENCES followup_items(id) ON DELETE SET NULL,
  category_name     VARCHAR(80) NOT NULL DEFAULT '',
  title_name        VARCHAR(120) NOT NULL,
  status_text       VARCHAR(4000) NOT NULL,
  completed_by_text VARCHAR(120) NOT NULL DEFAULT '',
  position          INTEGER NOT NULL DEFAULT 1000,
  is_included       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT report_followups_title_check CHECK (CHAR_LENGTH(TRIM(title_name)) BETWEEN 1 AND 120),
  CONSTRAINT report_followups_status_check CHECK (CHAR_LENGTH(TRIM(status_text)) BETWEEN 1 AND 4000),
  CONSTRAINT report_followups_position_check CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS report_followups_item_uq ON report_followups (report_id, followup_item_id);
CREATE INDEX IF NOT EXISTS report_followups_report_idx ON report_followups (report_id, position);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id                 UUID PRIMARY KEY,
  report_id          UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  revision           INTEGER NOT NULL,
  schema_version     INTEGER NOT NULL DEFAULT 1,
  renderer_version   VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  payload            JSONB NOT NULL,
  content_hash       CHAR(64) NOT NULL,
  created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT report_snapshots_revision_check CHECK (revision >= 1),
  CONSTRAINT report_snapshots_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS report_snapshots_unique_revision ON report_snapshots (report_id, revision);
CREATE INDEX IF NOT EXISTS report_snapshots_report_idx ON report_snapshots (report_id, revision DESC);

CREATE TABLE IF NOT EXISTS report_exports (
  id                 UUID PRIMARY KEY,
  report_id          UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  snapshot_id        UUID NOT NULL REFERENCES report_snapshots(id) ON DELETE CASCADE,
  format             VARCHAR(10) NOT NULL,
  file_name          VARCHAR(255) NOT NULL,
  storage_key        VARCHAR(512) NOT NULL,
  byte_size          BIGINT NOT NULL,
  sha256             CHAR(64) NOT NULL,
  download_count     INTEGER NOT NULL DEFAULT 0,
  created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT report_exports_format_check CHECK (format IN ('docx', 'pdf')),
  CONSTRAINT report_exports_byte_size_check CHECK (byte_size > 0),
  CONSTRAINT report_exports_hash_check CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS report_exports_unique_format ON report_exports (snapshot_id, format);
CREATE UNIQUE INDEX IF NOT EXISTS report_exports_unique_storage ON report_exports (storage_key);
CREATE INDEX IF NOT EXISTS report_exports_report_idx ON report_exports (report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(80) NOT NULL,
  entity_type   VARCHAR(40) NOT NULL,
  entity_id     VARCHAR(128) NULL,
  request_id    VARCHAR(64) NULL,
  metadata      JSONB NOT NULL,
  created_at    TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_events_action_check CHECK (CHAR_LENGTH(TRIM(action)) BETWEEN 1 AND 80),
  CONSTRAINT audit_events_entity_check CHECK (CHAR_LENGTH(TRIM(entity_type)) BETWEEN 1 AND 40)
);

CREATE INDEX IF NOT EXISTS audit_events_team_time_idx ON audit_events (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events (entity_type, entity_id);
