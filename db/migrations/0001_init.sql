-- ============================================================================
-- CGHQ Team Work Report — MySQL 8.4 LTS Schema (0001_init)
-- ============================================================================
-- Conventions:
--   * App-generated UUIDv7 stored as CHAR(36)
--   * UTC DATETIME(3) for instants; DATE for report_date
--   * Explicit integer position columns for deterministic ordering
--   * Raw parameterized SQL only (mysql2 execute)
--   * Forward-only migrations
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  password_hash   VARCHAR(512) NOT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  session_version INT NOT NULL DEFAULT 0,
  last_login_at   DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY users_email_uq (email),
  KEY users_active_idx (is_active),
  CONSTRAINT users_name_not_blank CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120),
  CONSTRAINT users_email_not_blank CHECK (CHAR_LENGTH(TRIM(email)) >= 3),
  CONSTRAINT users_is_active_check CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS teams (
  id                         CHAR(36) NOT NULL,
  name                       VARCHAR(120) NOT NULL,
  slug                       VARCHAR(80) NOT NULL,
  document_title             VARCHAR(160) NOT NULL DEFAULT 'CGHQ Daily Report',
  file_prefix                VARCHAR(120) NOT NULL DEFAULT 'CGHQ_Team_Work_Status',
  timezone                   VARCHAR(64) NOT NULL DEFAULT 'Asia/Dhaka',
  logo_asset_id              CHAR(36) NULL,
  prepared_by_default        VARCHAR(120) NULL,
  members_can_add_dictionary TINYINT(1) NOT NULL DEFAULT 1,
  followups_enabled          TINYINT(1) NOT NULL DEFAULT 1,
  max_members                INT NOT NULL DEFAULT 10,
  created_by_user_id         CHAR(36) NULL,
  created_at                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY teams_slug_uq (slug),
  KEY teams_created_by_idx (created_by_user_id),
  CONSTRAINT teams_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT teams_name_not_blank CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120),
  CONSTRAINT teams_slug_format CHECK (REGEXP_LIKE(slug, '^[a-z0-9]+(?:-[a-z0-9]+)*$')),
  CONSTRAINT teams_max_members_range CHECK (max_members BETWEEN 2 AND 100),
  CONSTRAINT teams_dict_flag_check CHECK (members_can_add_dictionary IN (0, 1)),
  CONSTRAINT teams_followups_flag_check CHECK (followups_enabled IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS team_assets (
  id                 CHAR(36) NOT NULL,
  team_id            CHAR(36) NOT NULL,
  kind               VARCHAR(20) NOT NULL DEFAULT 'logo',
  file_name          VARCHAR(255) NOT NULL,
  mime_type          VARCHAR(64) NOT NULL,
  bytes              LONGBLOB NOT NULL,
  byte_size          INT NOT NULL,
  sha256             CHAR(64) NOT NULL,
  width              INT NULL,
  height             INT NULL,
  created_by_user_id CHAR(36) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY team_assets_unique_hash (team_id, sha256),
  KEY team_assets_team_idx (team_id, created_at DESC),
  CONSTRAINT team_assets_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT team_assets_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT team_assets_kind_check CHECK (kind IN ('logo')),
  CONSTRAINT team_assets_mime_check CHECK (mime_type IN ('image/png', 'image/jpeg')),
  CONSTRAINT team_assets_size_check CHECK (byte_size BETWEEN 1 AND 1048576),
  CONSTRAINT team_assets_bytes_size_check CHECK (OCTET_LENGTH(bytes) = byte_size),
  CONSTRAINT team_assets_sha256_check CHECK (REGEXP_LIKE(sha256, '^[0-9a-f]{64}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE teams
  ADD CONSTRAINT teams_logo_asset_fk
  FOREIGN KEY (logo_asset_id) REFERENCES team_assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS team_members (
  id           CHAR(36) NOT NULL,
  team_id      CHAR(36) NOT NULL,
  user_id      CHAR(36) NOT NULL,
  role         VARCHAR(20) NOT NULL DEFAULT 'member',
  display_name VARCHAR(120) NOT NULL,
  sort_order   INT NOT NULL DEFAULT 1000,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY team_members_unique_user (team_id, user_id),
  KEY team_members_team_idx (team_id, is_active, sort_order),
  KEY team_members_user_idx (user_id),
  KEY team_members_role_idx (team_id, role),
  CONSTRAINT team_members_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT team_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT team_members_role_check CHECK (role IN ('lead', 'member')),
  CONSTRAINT team_members_display_name_check CHECK (CHAR_LENGTH(TRIM(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT team_members_is_active_check CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id             CHAR(36) NOT NULL,
  user_id        CHAR(36) NOT NULL,
  token_hash     CHAR(64) NOT NULL,
  session_version INT NOT NULL DEFAULT 0,
  last_active_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at     DATETIME(3) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY sessions_token_hash_uq (token_hash),
  KEY sessions_user_idx (user_id),
  KEY sessions_expires_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT sessions_token_hash_check CHECK (REGEXP_LIKE(token_hash, '^[0-9a-f]{64}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invites (
  id                  CHAR(36) NOT NULL,
  team_id             CHAR(36) NOT NULL,
  email               VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  role                VARCHAR(20) NOT NULL DEFAULT 'member',
  token_hash          CHAR(64) NOT NULL,
  expires_at          DATETIME(3) NOT NULL,
  accepted_at         DATETIME(3) NULL,
  accepted_by_user_id CHAR(36) NULL,
  created_by_user_id  CHAR(36) NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY invites_token_hash_uq (token_hash),
  KEY invites_team_idx (team_id, created_at DESC),
  KEY invites_expiry_idx (expires_at),
  CONSTRAINT invites_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT invites_accepted_by_fk FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT invites_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT invites_role_check CHECK (role IN ('lead', 'member')),
  CONSTRAINT invites_token_hash_check CHECK (REGEXP_LIKE(token_hash, '^[0-9a-f]{64}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  id                 CHAR(36) NOT NULL,
  user_id            CHAR(36) NOT NULL,
  token_hash         CHAR(64) NOT NULL,
  expires_at         DATETIME(3) NOT NULL,
  used_at            DATETIME(3) NULL,
  created_by_user_id CHAR(36) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY password_resets_token_hash_uq (token_hash),
  KEY password_resets_user_idx (user_id),
  CONSTRAINT password_resets_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT password_resets_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT password_resets_token_hash_check CHECK (REGEXP_LIKE(token_hash, '^[0-9a-f]{64}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key   VARCHAR(190) NOT NULL,
  failures     INT NOT NULL DEFAULT 0,
  window_start DATETIME(3) NOT NULL,
  locked_until DATETIME(3) NULL,
  PRIMARY KEY (bucket_key),
  KEY rate_limits_window_idx (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS categories (
  id         CHAR(36) NOT NULL,
  team_id    CHAR(36) NOT NULL,
  name       VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  position   INT NOT NULL DEFAULT 1000,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY categories_unique_name (team_id, name),
  UNIQUE KEY categories_unique_id_team (id, team_id),
  KEY categories_team_idx (team_id, is_active, position),
  CONSTRAINT categories_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT categories_name_check CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 80),
  CONSTRAINT categories_is_active_check CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS titles (
  id             CHAR(36) NOT NULL,
  team_id        CHAR(36) NOT NULL,
  category_id    CHAR(36) NOT NULL,
  name           VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  position       INT NOT NULL DEFAULT 1000,
  default_status VARCHAR(4000) NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY titles_unique_name (team_id, category_id, name),
  UNIQUE KEY titles_unique_id_category (id, category_id),
  KEY titles_team_idx (team_id, category_id, is_active, position),
  CONSTRAINT titles_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT titles_category_team_fk FOREIGN KEY (category_id, team_id) REFERENCES categories(id, team_id) ON DELETE RESTRICT,
  CONSTRAINT titles_name_check CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120),
  CONSTRAINT titles_is_active_check CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS daily_reports (
  id                   CHAR(36) NOT NULL,
  team_id              CHAR(36) NOT NULL,
  report_date          DATE NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'draft',
  prepared_by_name     VARCHAR(120) NOT NULL,
  prepared_by_user_id  CHAR(36) NULL,
  notes                VARCHAR(4000) NULL,
  revision             INT NOT NULL DEFAULT 0,
  version              INT NOT NULL DEFAULT 1,
  finalized_at         DATETIME(3) NULL,
  finalized_by_user_id CHAR(36) NULL,
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY daily_reports_unique_day (team_id, report_date),
  KEY daily_reports_team_date_idx (team_id, report_date DESC),
  KEY daily_reports_status_idx (team_id, status),
  CONSTRAINT daily_reports_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT daily_reports_prepared_by_fk FOREIGN KEY (prepared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT daily_reports_finalized_by_fk FOREIGN KEY (finalized_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT daily_reports_status_check CHECK (status IN ('draft', 'finalized', 'reopened')),
  CONSTRAINT daily_reports_prepared_by_check CHECK (CHAR_LENGTH(TRIM(prepared_by_name)) BETWEEN 1 AND 120),
  CONSTRAINT daily_reports_revision_check CHECK (revision >= 0),
  CONSTRAINT daily_reports_version_check CHECK (version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS work_groups (
  id                 CHAR(36) NOT NULL,
  report_id          CHAR(36) NOT NULL,
  category_id        CHAR(36) NOT NULL,
  title_id           CHAR(36) NOT NULL,
  position           INT NOT NULL DEFAULT 1000,
  numbering_mode     VARCHAR(20) NOT NULL DEFAULT 'numbered',
  created_by_user_id CHAR(36) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY work_groups_unique_group (report_id, category_id, title_id),
  KEY work_groups_report_idx (report_id, position),
  KEY work_groups_category_idx (category_id),
  KEY work_groups_title_idx (title_id),
  CONSTRAINT work_groups_report_fk FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  CONSTRAINT work_groups_title_category_fk FOREIGN KEY (title_id, category_id) REFERENCES titles(id, category_id) ON DELETE RESTRICT,
  CONSTRAINT work_groups_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT work_groups_position_check CHECK (position >= 0),
  CONSTRAINT work_groups_numbering_check CHECK (numbering_mode IN ('numbered', 'plain'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS work_entries (
  id                     CHAR(36) NOT NULL,
  group_id               CHAR(36) NOT NULL,
  status_text            VARCHAR(4000) NOT NULL,
  completed_by_member_id CHAR(36) NULL,
  completed_by_label     VARCHAR(80) NULL,
  position               INT NOT NULL DEFAULT 1000,
  version                INT NOT NULL DEFAULT 1,
  created_by_user_id     CHAR(36) NULL,
  updated_by_user_id     CHAR(36) NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at             DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY work_entries_group_idx (group_id, deleted_at, position),
  KEY work_entries_member_idx (completed_by_member_id, deleted_at),
  KEY work_entries_created_by_idx (created_by_user_id),
  CONSTRAINT work_entries_group_fk FOREIGN KEY (group_id) REFERENCES work_groups(id) ON DELETE CASCADE,
  CONSTRAINT work_entries_member_fk FOREIGN KEY (completed_by_member_id) REFERENCES team_members(id) ON DELETE SET NULL,
  CONSTRAINT work_entries_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT work_entries_updated_by_fk FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT work_entries_status_check CHECK (CHAR_LENGTH(TRIM(status_text)) BETWEEN 1 AND 4000),
  CONSTRAINT work_entries_position_check CHECK (position >= 0),
  CONSTRAINT work_entries_version_check CHECK (version >= 1),
  CONSTRAINT work_entries_label_check CHECK (completed_by_label IS NULL OR CHAR_LENGTH(TRIM(completed_by_label)) BETWEEN 1 AND 80)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS followup_items (
  id                     CHAR(36) NOT NULL,
  team_id                CHAR(36) NOT NULL,
  category_id            CHAR(36) NULL,
  title_id               CHAR(36) NULL,
  status                 VARCHAR(20) NOT NULL DEFAULT 'open',
  status_text            VARCHAR(4000) NOT NULL,
  completed_by_label     VARCHAR(80) NULL DEFAULT 'As Previous',
  completed_by_member_id CHAR(36) NULL,
  completed_on           DATE NULL,
  position               INT NOT NULL DEFAULT 1000,
  version                INT NOT NULL DEFAULT 1,
  created_by_user_id     CHAR(36) NULL,
  updated_by_user_id     CHAR(36) NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY followup_items_team_idx (team_id, status, position),
  KEY followup_items_category_idx (category_id),
  KEY followup_items_title_idx (title_id),
  CONSTRAINT followup_items_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT followup_items_member_fk FOREIGN KEY (completed_by_member_id) REFERENCES team_members(id) ON DELETE SET NULL,
  CONSTRAINT followup_items_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT followup_items_updated_by_fk FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT followup_items_status_enum CHECK (status IN ('open', 'in_progress', 'done', 'archived')),
  CONSTRAINT followup_items_status_check CHECK (CHAR_LENGTH(TRIM(status_text)) BETWEEN 1 AND 4000),
  CONSTRAINT followup_items_position_check CHECK (position >= 0),
  CONSTRAINT followup_items_version_check CHECK (version >= 1),
  CONSTRAINT followup_items_label_check CHECK (completed_by_label IS NULL OR CHAR_LENGTH(TRIM(completed_by_label)) BETWEEN 1 AND 80)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_followups (
  id                CHAR(36) NOT NULL,
  report_id         CHAR(36) NOT NULL,
  followup_item_id  CHAR(36) NULL,
  category_name     VARCHAR(80) NOT NULL DEFAULT '',
  title_name        VARCHAR(120) NOT NULL,
  status_text       VARCHAR(4000) NOT NULL,
  completed_by_text VARCHAR(120) NOT NULL DEFAULT '',
  position          INT NOT NULL DEFAULT 1000,
  is_included       TINYINT(1) NOT NULL DEFAULT 1,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY report_followups_item_uq (report_id, followup_item_id),
  KEY report_followups_report_idx (report_id, position),
  KEY report_followups_item_idx (followup_item_id),
  CONSTRAINT report_followups_report_fk FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  CONSTRAINT report_followups_item_fk FOREIGN KEY (followup_item_id) REFERENCES followup_items(id) ON DELETE SET NULL,
  CONSTRAINT report_followups_title_check CHECK (CHAR_LENGTH(TRIM(title_name)) BETWEEN 1 AND 120),
  CONSTRAINT report_followups_status_check CHECK (CHAR_LENGTH(TRIM(status_text)) BETWEEN 1 AND 4000),
  CONSTRAINT report_followups_position_check CHECK (position >= 0),
  CONSTRAINT report_followups_included_check CHECK (is_included IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_snapshots (
  id                 CHAR(36) NOT NULL,
  report_id          CHAR(36) NOT NULL,
  revision           INT NOT NULL,
  schema_version     INT NOT NULL DEFAULT 1,
  renderer_version   VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  payload            JSON NOT NULL,
  content_hash       CHAR(64) NOT NULL,
  created_by_user_id CHAR(36) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY report_snapshots_unique_revision (report_id, revision),
  KEY report_snapshots_report_idx (report_id, revision DESC),
  KEY report_snapshots_hash_idx (content_hash),
  CONSTRAINT report_snapshots_report_fk FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  CONSTRAINT report_snapshots_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT report_snapshots_revision_check CHECK (revision >= 1),
  CONSTRAINT report_snapshots_hash_check CHECK (REGEXP_LIKE(content_hash, '^[0-9a-f]{64}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_exports (
  id                 CHAR(36) NOT NULL,
  report_id          CHAR(36) NOT NULL,
  snapshot_id        CHAR(36) NOT NULL,
  format             VARCHAR(10) NOT NULL,
  file_name          VARCHAR(255) NOT NULL,
  storage_key        VARCHAR(512) NOT NULL,
  byte_size          BIGINT NOT NULL,
  sha256             CHAR(64) NOT NULL,
  download_count     INT NOT NULL DEFAULT 0,
  created_by_user_id CHAR(36) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY report_exports_unique_format (snapshot_id, format),
  UNIQUE KEY report_exports_unique_storage (storage_key),
  KEY report_exports_report_idx (report_id, created_at DESC),
  CONSTRAINT report_exports_report_fk FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  CONSTRAINT report_exports_snapshot_fk FOREIGN KEY (snapshot_id) REFERENCES report_snapshots(id) ON DELETE CASCADE,
  CONSTRAINT report_exports_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT report_exports_format_check CHECK (format IN ('docx', 'pdf')),
  CONSTRAINT report_exports_byte_size_check CHECK (byte_size > 0),
  CONSTRAINT report_exports_hash_check CHECK (REGEXP_LIKE(sha256, '^[0-9a-f]{64}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id            BIGINT NOT NULL AUTO_INCREMENT,
  team_id       CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  action        VARCHAR(80) NOT NULL,
  entity_type   VARCHAR(40) NOT NULL,
  entity_id     VARCHAR(128) NULL,
  request_id    VARCHAR(64) NULL,
  metadata      JSON NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY audit_events_team_time_idx (team_id, created_at DESC),
  KEY audit_events_entity_idx (entity_type, entity_id),
  KEY audit_events_actor_idx (actor_user_id, created_at DESC),
  CONSTRAINT audit_events_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT audit_events_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT audit_events_action_check CHECK (CHAR_LENGTH(TRIM(action)) BETWEEN 1 AND 80),
  CONSTRAINT audit_events_entity_check CHECK (CHAR_LENGTH(TRIM(entity_type)) BETWEEN 1 AND 40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
