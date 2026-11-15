-- ============================================================================
-- CGHQ Team Work Report — PostgreSQL 16 schema
-- ============================================================================
-- Run on a fresh database. The app applies this via Drizzle migrations.
-- Conventions:
--   * UUID primary keys (gen_random_uuid)
--   * timestamptz for instants, date for report days
--   * explicit ordering via integer position columns
--   * immutable snapshots for exports/history
--   * soft delete / deactivate rather than hard delete
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type member_role as enum ('owner', 'admin', 'member', 'viewer');
create type report_status as enum ('draft', 'finalized');
create type numbering_mode as enum ('numbered', 'plain');
create type export_format as enum ('docx', 'pdf');

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create table users (
  id               uuid primary key default gen_random_uuid(),
  name             varchar(120) not null,
  email            citext not null,
  password_hash    text not null,
  is_active        boolean not null default true,
  session_version  integer not null default 0,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint users_name_not_blank check (char_length(btrim(name)) between 1 and 120),
  constraint users_email_not_blank check (char_length(btrim(email)) >= 3)
);

create unique index users_email_uq on users (email);
create index users_active_idx on users (is_active);

create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

create table teams (
  id                          uuid primary key default gen_random_uuid(),
  name                        varchar(120) not null,
  slug                        varchar(80) not null,
  document_title              varchar(160) not null default 'CGHQ Daily Report',
  file_prefix                 varchar(120) not null default 'CGHQ_Team_Work_Status',
  timezone                    varchar(64) not null default 'Asia/Dhaka',
  logo_asset_id               uuid, -- FK added after team_assets exists
  prepared_by_default         varchar(120),
  members_can_export          boolean not null default true,
  members_can_add_dictionary  boolean not null default true,
  followups_enabled           boolean not null default true,
  max_members                 integer not null default 10,
  created_by_user_id          uuid references users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint teams_name_not_blank check (char_length(btrim(name)) between 1 and 120),
  constraint teams_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint teams_max_members_range check (max_members between 2 and 100)
);

create unique index teams_slug_uq on teams (slug);

create trigger teams_set_updated_at
before update on teams
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Team assets (logo)
-- ---------------------------------------------------------------------------

create table team_assets (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references teams(id) on delete cascade,
  kind               varchar(20) not null default 'logo',
  file_name          varchar(255) not null,
  mime_type          varchar(64) not null,
  bytes              bytea not null,
  byte_size          integer not null,
  sha256             char(64) not null,
  width              integer,
  height             integer,
  created_by_user_id uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint team_assets_kind_check check (kind in ('logo')),
  constraint team_assets_mime_check check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint team_assets_size_check check (byte_size between 1 and 2097152),
  constraint team_assets_bytes_size_check check (octet_length(bytes) = byte_size),
  constraint team_assets_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint team_assets_unique_hash unique (team_id, sha256)
);

create index team_assets_team_idx on team_assets (team_id, created_at desc);

alter table teams
  add constraint teams_logo_asset_fk
  foreign key (logo_asset_id) references team_assets(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Team members
-- ---------------------------------------------------------------------------

create table team_members (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  role         member_role not null default 'member',
  display_name varchar(120) not null,
  sort_order   integer not null default 1000,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint team_members_display_name_check check (char_length(btrim(display_name)) between 1 and 120),
  constraint team_members_unique_user unique (team_id, user_id)
);

create index team_members_team_idx on team_members (team_id, is_active, sort_order);
create index team_members_user_idx on team_members (user_id);
create index team_members_role_idx on team_members (team_id, role);

create trigger team_members_set_updated_at
before update on team_members
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

create table invites (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references teams(id) on delete cascade,
  email              citext,
  role               member_role not null default 'member',
  token_hash         char(64) not null,
  expires_at         timestamptz not null,
  accepted_at        timestamptz,
  accepted_by_user_id uuid references users(id) on delete set null,
  created_by_user_id uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint invites_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint invites_role_check check (role in ('admin', 'member', 'viewer'))
);

create unique index invites_token_hash_uq on invites (token_hash);
create index invites_team_idx on invites (team_id, created_at desc);
create index invites_expiry_idx on invites (expires_at) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Categories and titles (the report dictionary)
-- ---------------------------------------------------------------------------

create table categories (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  name       citext not null,
  position   integer not null default 1000,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_name_check check (char_length(btrim(name)) between 1 and 100),
  constraint categories_unique_name unique (team_id, name),
  constraint categories_unique_id_team unique (id, team_id)
);

create index categories_team_idx on categories (team_id, is_active, position);

create trigger categories_set_updated_at
before update on categories
for each row execute function set_updated_at();

create table titles (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams(id) on delete cascade,
  category_id    uuid not null,
  name           citext not null,
  position       integer not null default 1000,
  default_status text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint titles_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint titles_default_status_check check (default_status is null or char_length(default_status) <= 4000),
  constraint titles_unique_name unique (team_id, category_id, name),
  constraint titles_unique_id_category unique (id, category_id),
  constraint titles_category_team_fk
    foreign key (category_id, team_id)
    references categories(id, team_id)
    on delete restrict
);

create index titles_team_idx on titles (team_id, category_id, is_active, position);

create trigger titles_set_updated_at
before update on titles
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Daily reports
-- ---------------------------------------------------------------------------

create table daily_reports (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references teams(id) on delete cascade,
  report_date          date not null,
  status               report_status not null default 'draft',
  prepared_by_name     varchar(120) not null,
  prepared_by_user_id  uuid references users(id) on delete set null,
  notes                text,
  revision             integer not null default 0,
  finalized_at         timestamptz,
  finalized_by_user_id uuid references users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint daily_reports_prepared_by_check check (char_length(btrim(prepared_by_name)) between 1 and 120),
  constraint daily_reports_revision_check check (revision >= 0),
  constraint daily_reports_unique_day unique (team_id, report_date)
);

create index daily_reports_team_date_idx on daily_reports (team_id, report_date desc);
create index daily_reports_status_idx on daily_reports (team_id, status);

create trigger daily_reports_set_updated_at
before update on daily_reports
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Work groups (category + title; drives merged cells and Ser)
-- ---------------------------------------------------------------------------

create table work_groups (
  id                 uuid primary key default gen_random_uuid(),
  report_id          uuid not null references daily_reports(id) on delete cascade,
  category_id        uuid not null,
  title_id           uuid not null,
  position           integer not null default 1000,
  numbering_mode     numbering_mode not null default 'numbered',
  created_by_user_id uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint work_groups_position_check check (position >= 0),
  constraint work_groups_unique_group unique (report_id, category_id, title_id),
  constraint work_groups_title_category_fk
    foreign key (title_id, category_id)
    references titles(id, category_id)
    on delete restrict
);

create index work_groups_report_idx on work_groups (report_id, position);
create index work_groups_category_idx on work_groups (category_id);
create index work_groups_title_idx on work_groups (title_id);

create trigger work_groups_set_updated_at
before update on work_groups
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Work entries (one entry = one row in the Status column)
-- ---------------------------------------------------------------------------

create table work_entries (
  id                      uuid primary key default gen_random_uuid(),
  group_id                uuid not null references work_groups(id) on delete cascade,
  status_text             text not null,
  completed_by_member_id  uuid references team_members(id) on delete set null,
  completed_by_label      varchar(80),
  position                integer not null default 1000,
  version                 integer not null default 1,
  created_by_user_id      uuid references users(id) on delete set null,
  updated_by_user_id      uuid references users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,

  constraint work_entries_status_check check (char_length(btrim(status_text)) between 1 and 4000),
  constraint work_entries_position_check check (position >= 0),
  constraint work_entries_version_check check (version >= 1),
  constraint work_entries_completed_by_check check (completed_by_member_id is null or completed_by_label is null),
  constraint work_entries_label_check check (completed_by_label is null or char_length(btrim(completed_by_label)) between 1 and 80)
);

create index work_entries_group_idx on work_entries (group_id, position) where deleted_at is null;
create index work_entries_member_idx on work_entries (completed_by_member_id) where deleted_at is null;
create index work_entries_created_by_idx on work_entries (created_by_user_id);

create trigger work_entries_set_updated_at
before update on work_entries
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Follow-up master list
-- ---------------------------------------------------------------------------

create table followup_items (
  id                      uuid primary key default gen_random_uuid(),
  team_id                 uuid not null references teams(id) on delete cascade,
  category_id             uuid not null,
  title_id                uuid not null,
  status_text             text not null,
  completed_by_label      varchar(80) default 'As Previous',
  completed_by_member_id  uuid references team_members(id) on delete set null,
  position                integer not null default 1000,
  is_active               boolean not null default true,
  version                 integer not null default 1,
  created_by_user_id      uuid references users(id) on delete set null,
  updated_by_user_id      uuid references users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint followup_items_status_check check (char_length(btrim(status_text)) between 1 and 4000),
  constraint followup_items_position_check check (position >= 0),
  constraint followup_items_version_check check (version >= 1),
  constraint followup_items_completed_by_check check (completed_by_member_id is null or completed_by_label is null),
  constraint followup_items_label_check check (completed_by_label is null or char_length(btrim(completed_by_label)) between 1 and 80),
  constraint followup_items_title_category_fk
    foreign key (title_id, category_id)
    references titles(id, category_id)
    on delete restrict
);

create index followup_items_team_idx on followup_items (team_id, is_active, position);
create index followup_items_category_idx on followup_items (category_id);
create index followup_items_title_idx on followup_items (title_id);

create trigger followup_items_set_updated_at
before update on followup_items
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Daily follow-up snapshots
-- ---------------------------------------------------------------------------
-- Names are copied here on purpose: renaming a category/title or updating the
-- master follow-up later must not rewrite a past report.

create table report_followups (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references daily_reports(id) on delete cascade,
  followup_item_id uuid references followup_items(id) on delete set null,
  category_name   varchar(100) not null,
  title_name      varchar(160) not null,
  status_text     text not null,
  completed_by_text varchar(120) not null default '',
  position        integer not null default 1000,
  is_included     boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint report_followups_category_check check (char_length(btrim(category_name)) between 1 and 100),
  constraint report_followups_title_check check (char_length(btrim(title_name)) between 1 and 160),
  constraint report_followups_status_check check (char_length(btrim(status_text)) between 1 and 4000),
  constraint report_followups_completed_by_check check (char_length(completed_by_text) <= 120),
  constraint report_followups_position_check check (position >= 0)
);

create unique index report_followups_item_uq
  on report_followups (report_id, followup_item_id)
  where followup_item_id is not null;

create index report_followups_report_idx on report_followups (report_id, position);
create index report_followups_item_idx on report_followups (followup_item_id);

create trigger report_followups_set_updated_at
before update on report_followups
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Immutable report snapshots
-- ---------------------------------------------------------------------------

create table report_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  report_id          uuid not null references daily_reports(id) on delete cascade,
  revision           integer not null,
  schema_version     integer not null default 1,
  payload            jsonb not null,
  content_hash       char(64) not null,
  created_by_user_id uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint report_snapshots_revision_check check (revision >= 1),
  constraint report_snapshots_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint report_snapshots_unique_revision unique (report_id, revision)
);

create index report_snapshots_report_idx on report_snapshots (report_id, revision desc);
create index report_snapshots_hash_idx on report_snapshots (content_hash);

-- ---------------------------------------------------------------------------
-- Generated exports
-- ---------------------------------------------------------------------------

create table report_exports (
  id                 uuid primary key default gen_random_uuid(),
  report_id          uuid not null references daily_reports(id) on delete cascade,
  snapshot_id        uuid not null references report_snapshots(id) on delete cascade,
  format             export_format not null,
  file_name          varchar(255) not null,
  storage_key        text not null,
  byte_size          bigint not null,
  sha256             char(64) not null,
  download_count     integer not null default 0,
  created_by_user_id uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint report_exports_byte_size_check check (byte_size > 0),
  constraint report_exports_hash_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint report_exports_unique_format unique (snapshot_id, format),
  constraint report_exports_unique_storage unique (storage_key)
);

create index report_exports_report_idx on report_exports (report_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table audit_events (
  id            bigint generated always as identity primary key,
  team_id       uuid not null references teams(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action        varchar(80) not null,
  entity_type   varchar(40) not null,
  entity_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now(),

  constraint audit_events_action_check check (char_length(btrim(action)) between 1 and 80),
  constraint audit_events_entity_check check (char_length(btrim(entity_type)) between 1 and 40)
);

create index audit_events_team_time_idx on audit_events (team_id, created_at desc);
create index audit_events_entity_idx on audit_events (entity_type, entity_id);
create index audit_events_actor_idx on audit_events (actor_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpful comments
-- ---------------------------------------------------------------------------

comment on table work_groups is
  'A category+title group within one day. Models the merged Ser/Category/Title cells.';
comment on table work_entries is
  'One status row. deleted_at is a soft delete; exports use snapshots.';
comment on table report_followups is
  'Per-day follow-up snapshot. Editing it does not rewrite other days.';
comment on table report_snapshots is
  'Immutable JSON document payload used to render DOCX/PDF.';
comment on table report_exports is
  'Generated files for a snapshot+format. Files are regenerable from the snapshot.';

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- * An admin/owner is enforced in the service layer; a team must always keep
--   at least one owner.
-- * Work entry member IDs and report team IDs are validated in the service
--   layer because the entry table does not carry team_id.
-- * Ordering uses integer positions with gaps; reordering runs in a
--   transaction and rewrites the affected positions.
-- * For "today" use the team's IANA timezone, not the database server's.
-- ============================================================================
