# Stack Plan — React · TypeScript · NestJS · MySQL on Vercel

| | |
|---|---|
| **Version** | 2.0 (proposed) |
| **Date** | 14 November 2026 |
| **Status** | Awaiting confirmation of § 17 |
| **Supersedes** | `STACK-PLAN.md` v1, and the stack choices in [ARCHITECTURE.md](ARCHITECTURE.md) § 7 and § 13 |
| **Unchanged** | [EXPORT-SPEC.md](EXPORT-SPEC.md) in full, the workflows, the API surface, the daily-date rules, and the two-table / variable-pagination guarantees |

## 1. Fixed constraints

These are requirements, not preferences. Everything below is designed around them.

| # | Constraint | Consequence |
|---|---|---|
| **C1** | **No ORM, ever.** No Prisma, Drizzle, TypeORM, Sequelize, Knex, Objection, or any query builder. | Hand-written SQL, parameterized, with hand-written row mappers. See § 6. |
| **C2** | **Deploy on GitHub + Vercel only.** No Docker, no VPS, no Caddy, no self-hosted services. | Static SPA + serverless API on Vercel; Vercel Blob for files; Vercel Cron for scheduled work. |
| **C3** | **MySQL.** | MySQL 8.4 dialect, managed by a third party (Vercel does not offer MySQL — see § 3.1). |
| **C4** | **React + TypeScript frontend, NestJS backend.** | SPA + API, shared contracts, one Nest app bootstrapped as a serverless handler. |
| **C5** | **The document format is fixed.** | [EXPORT-SPEC.md](EXPORT-SPEC.md) still governs every twip. |

---

## 2. Decision summary

| Layer | Choice | Why |
|---|---|---|
| Repo | **GitHub monorepo** (pnpm workspace) | One PR, one CI run, shared contracts; Vercel preview deploy per PR. |
| Frontend | **React 19 + TypeScript + Vite** | Static build, CDN-served, no server rendering needed behind a login. |
| Routing / state | **React Router 7 + TanStack Query 5** | Deep links per date; cached server state; optimistic composer. |
| Forms / UI | **React Hook Form + Zod**, **Tailwind + shadcn/ui** | Same Zod schemas as the API; accessible primitives. |
| Backend | **NestJS 11** as one Vercel serverless function | Explicit modules, guards, pipes; no container to run. |
| Validation | **Zod** (`packages/contracts`) | One schema shared by UI and API. |
| **Data access** | **Raw parameterized SQL** via `mysql2/promise` | C1. `execute()` only. No builder, no ORM, no codegen. |
| Migrations | **Plain `.sql` files + a ~90-line runner** | C1; SQL is reviewed as SQL, checksummed, forward-only. |
| Database | **MySQL 8.4 LTS** (managed, external) | C3. See § 3.1 for the unavoidable exception to C2. |
| Auth | **Opaque cookie sessions in MySQL + Argon2id** | No third-party identity service; instant revocation. |
| DOCX | **`docx` (npm)** | Exact table/merge/header control; runs fine in a serverless function. |
| **PDF** | **`pdf-lib` renderer from the same document model** | Gotenberg/LibreOffice cannot run on Vercel. See § 10. |
| Files | **Vercel Blob (private)** | No persistent filesystem on Vercel. |
| Scheduled work | **Vercel Cron** | Cleanup, reminders. No queue. |
| Hosting | **Vercel** (one project) | Static SPA and `/api` share an origin → no CORS, cookies just work. |
| CI | **GitHub Actions** | Typecheck, tests against a MySQL service container, migration check. |

**Runtime:** Node 22 LTS on Vercel, TypeScript 5.7+ strict.

---

## 3. What "Vercel only" actually changes

Vercel gives you compute, a CDN, blob storage, cron, and env vars. It does not give you a filesystem, a long-running process, or MySQL. Here is every replacement:

| Need | Vercel-only replacement | Cost |
|---|---|---|
| Persistent disk for exports | **Vercel Blob**, private store, keyed by snapshot | none, cheap |
| LibreOffice / Gotenberg for PDF | **No replacement exists.** A second renderer (`pdf-lib`) is required | +1.5–2 weeks |
| Background worker | **Vercel Cron** (minute granularity) + synchronous export | exports must finish inside the function timeout |
| Long-lived server | Serverless function; Nest bootstrapped once per instance and reused | ~1 s cold start |
| `pg-boss` / BullMQ | Not needed at this scale | — |
| `GET_LOCK` for finalize/migrate | Row locks (`SELECT … FOR UPDATE`) and unique constraints | minor |
| Docker images, Caddy, TLS | Vercel build + edge network + automatic certificates | none |
| `/data` temp files | In-memory `Buffer` only | stricter but fine (files are ~100 KB) |

### 3.1 The one thing that cannot be Vercel-only: MySQL

Vercel has no MySQL product. C3 therefore requires **one external, managed MySQL 8.4 instance**. This is the single exception to C2, and it is unavoidable unless you drop MySQL.

Selection criteria — verify these before committing to a provider:

| Requirement | Why it matters here |
|---|---|
| **Foreign keys enforced** | The schema relies on composite FKs (a title's category must belong to the same team). Some MySQL-compatible services disable FKs. |
| **CHECK constraints enforced** | Non-blank names, role values, size limits. |
| **Interactive transactions over TCP** | Entry creation, reordering, finalize. HTTP-only drivers without transactions are unsuitable. |
| **Connection headroom / pooler** | Serverless functions open short-lived connections; the provider must tolerate small bursts or offer a pooler. |
| **Same region as the Vercel function** | Every request is 2–5 round trips; cross-continent latency is felt. |
| **Point-in-time restore or daily backups** | The database is the only durable store. |

Managed MySQL options generally worth pricing: Aiven, Azure Database for MySQL, AWS RDS, Google Cloud SQL, TiDB Cloud (MySQL-compatible), and any PlanetScale plan **whose FK/transaction behaviour you have verified**. I am not going to recommend one on price alone — the FK/CHECK criteria eliminate some of the cheapest options.

---

## 4. Topology

```mermaid
flowchart TB
  Browser["Browser / installed PWA"]

  subgraph Vercel["Vercel project (single origin)"]
    CDN["Edge CDN<br/>static React build"]
    FN["Serverless function<br/>NestJS API at /api/*"]
    Blob[("Vercel Blob<br/>private exports")]
    Cron["Vercel Cron<br/>cleanup"]
  end

  DB[("Managed MySQL 8.4<br/>InnoDB · utf8mb4")]
  GH["GitHub<br/>source · Actions · PR previews"]

  Browser -->|HTTPS| CDN
  Browser -->|"/api/*"| FN
  FN <--> DB
  FN <--> Blob
  Cron --> FN
  GH -->|"deploy on main"| Vercel
```

Everything is same-origin: `https://report.example.com/` serves the SPA, `https://report.example.com/api/*` is the function. Cookies need no `Domain` gymnastics and there is no CORS configuration in production.

---

## 5. Repository layout

```text
cghq-report/
├─ apps/
│  ├─ web/                        React + Vite
│  │  └─ src/
│  │     ├─ app/                  router, providers, error boundary
│  │     ├─ screens/              today, day report, follow-ups, history, settings, audit
│  │     ├─ components/           composer, member picker, preview, export bar
│  │     ├─ api/                  typed fetch client + query hooks
│  │     └─ styles/
│  └─ api/                        NestJS
│     ├─ api/index.ts             Vercel entry: bootstrap once, reuse
│     ├─ src/
│     │  ├─ modules/              auth, users, teams, members, dictionary, reports,
│     │  │                        followups, exports, audit, health, cron
│     │  ├─ db/
│     │  │  ├─ pool.ts            mysql2 pool (small, per-instance)
│     │  │  ├─ sql/               one file per domain, named SQL constants
│     │  │  └─ repositories/      functions: SQL constant + params + row mapper
│     │  ├─ domain/               pure: grouping, Ser, numbering, date formatting
│     │  └─ common/               guards, filters, pipes, pino, rate limit
│     └─ test/
├─ packages/
│  ├─ contracts/                  Zod schemas + inferred types
│  └─ document/                   DocumentModel + layout tokens + both renderers
│     ├─ src/model.ts
│     ├─ src/docx/
│     └─ src/pdf/
├─ db/
│  └─ migrations/                 0001_init.sql, 0002_sessions.sql, …
├─ scripts/
│  └─ migrate.ts                  checksummed, locked, forward-only
├─ vercel.json
└─ pnpm-workspace.yaml
```

`packages/document` is deliberately separate from the API: the renderer must be testable with no HTTP, no database, and no Nest.

---

## 6. Data access: raw parameterized SQL

### 6.1 Rules

1. **Every statement is a named constant** in `apps/api/src/db/sql/<domain>.sql.ts`. No SQL inside services or controllers.
2. **Placeholders only.** `?` for `mysql2`; values always passed in the params array.
3. **No interpolation.** Template literals are never used to build SQL. A lint rule flags backticks inside `execute()`/`query()` calls, and reviewers reject string concatenation.
4. **No `SELECT *`.** Columns are listed explicitly, in the order the mapper expects.
5. **`execute()`, never `query()`.** `execute()` uses real prepared statements; `query()` does client-side escaping.
6. **No user-controlled identifiers.** `ORDER BY` and sort direction come from a whitelist map, never from request values.
7. **One mapper per query.** Row types are hand-written interfaces plus a `mapRow` function. If the SQL changes shape, the mapper fails to compile or fails its test.
8. **Writes happen inside transactions**, with a deadlock retry wrapper (§ 9.4).

### 6.2 Shape of a repository

```ts
// db/sql/reports.sql.ts
export const SELECT_REPORT_BY_DATE = `
  SELECT id, team_id, report_date, status, revision, prepared_by_name
  FROM daily_reports
  WHERE team_id = ? AND report_date = ?
  LIMIT 1
`;

export const INSERT_REPORT = `
  INSERT INTO daily_reports (id, team_id, report_date, status, revision, prepared_by_name)
  VALUES (?, ?, ?, 'draft', 0, ?)
`;
```

```ts
// db/repositories/reports.repo.ts
export type ReportRow = {
  id: string; team_id: string; report_date: string;
  status: 'draft' | 'finalized'; revision: number; prepared_by_name: string;
};

export async function findByDate(
  conn: Pool | PoolConnection, teamId: string, date: string,
): Promise<ReportRow | null> {
  const [rows] = await conn.execute<ReportRow[]>(SELECT_REPORT_BY_DATE, [teamId, date]);
  return rows[0] ?? null;
}
```

A repository function does exactly three things: pass parameters, execute one statement, map the result. Branching and multi-step rules live in the service, which owns the transaction.

### 6.3 Migrations

- Plain `.sql` files in `db/migrations/`, numbered, never edited after merge.
- `schema_migrations (version VARCHAR(20) PK, checksum CHAR(64), applied_at DATETIME(3))`.
- `scripts/migrate.ts`:
  1. Opens a **direct** connection (not the serverless pool).
  2. `SELECT GET_LOCK('cghq:migrate', 30)` — safe here because it is a single long-lived connection, not a request.
  3. Applies pending files in order, inside a transaction where MySQL allows (DDL is auto-committing; each file is therefore written to be idempotent-safe and small).
  4. Verifies checksums of already-applied files and aborts on drift.
  5. `RELEASE_LOCK`.
- **Never runs at request time. Never runs during a Vercel build** (a preview deployment must not touch production). It runs from a GitHub Actions job on `main`, or manually via `workflow_dispatch`.
- Forward-only. A mistake is fixed by a new migration. Down-migrations are not written; they are rarely correct and always risky.

### 6.4 How raw SQL stays safe without an ORM

| Risk | Control |
|---|---|
| Column renamed, mapper stale | **Query-contract test**: every exported SQL constant is executed against a migrated MySQL container in CI. A missing column fails the build. |
| SQL injection | `execute()` + `?` only; lint rule; no concatenation; whitelisted sort keys. |
| N+1 queries | Repositories are written per screen, not per entity. The report screen uses 4 statements, not 40. |
| Inconsistent writes | One service owns the transaction; no repository starts its own. |
| Schema drift between code and DB | Migration checksum check in CI and in `/api/health`. |

At ~40 statements for the whole app, this is a smaller and more legible surface than an ORM would produce.

---

## 7. Backend on Vercel

### 7.1 Bootstrapping Nest as one function

```ts
// apps/api/api/index.ts
let cached: Promise<NestExpressApplication> | null = null;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await (cached ??= bootstrap());
  app.getHttpAdapter().getInstance()(req, res);
}
```

| Concern | Decision |
|---|---|
| Cold start | ~0.8–1.5 s including Nest and the MySQL pool. Acceptable for an internal tool; the SPA shows a skeleton. |
| Function region | Co-located with MySQL. |
| `maxDuration` | 30 s for the export route, 10 s elsewhere. Target export time is 2–4 s. |
| Memory | 1024 MB for the export route (two documents in memory), 512 MB default. |
| Filesystem | Never written. Buffers only. |
| Connection pool | One module-level `mysql2` pool, `connectionLimit: 2`, `maxIdle: 1`, `idleTimeout: 60_000`, `enableKeepAlive: true`. Reused across invocations of the same instance. |
| Shutdown | No shutdown hooks; do not rely on them in serverless. |
| Access logs | pino to stdout; Vercel captures them. |

### 7.2 Module map

| Module | Responsibility |
|---|---|
| `auth` | Login, logout, session issue/rotate/revoke, origin check, password change |
| `users` | Profile, password hash, active flag |
| `teams` | Settings, branding, logo upload (bytes stored in MySQL), timezone, file prefix |
| `members` | Invites, accept, roles, display order, deactivation |
| `dictionary` | Categories, titles, ordering |
| `reports` | Get-or-create by date, groups, entries, reorder, finalize/reopen, DTO assembly |
| `followups` | Master list, per-day rows, include/hide, carry-forward |
| `exports` | Snapshot, both renderers, Blob upload, download proxy, history |
| `audit` | Append-only events, admin read |
| `cron` | Cleanup, reminders; `CRON_SECRET`-guarded |
| `health` | DB ping, migration version, Blob reachability |

### 7.3 Request flow: add an entry

```mermaid
sequenceDiagram
  actor M as Member
  participant UI as React PWA
  participant FN as Nest function
  participant DB as MySQL

  M->>UI: Fill composer + Add
  UI->>UI: Optimistic row
  UI->>FN: POST /api/teams/:teamId/reports/:date/entries
  FN->>FN: SessionGuard → TeamGuard → Zod
  FN->>DB: BEGIN
  FN->>DB: INSERT IGNORE daily_reports (team_id, report_date)
  FN->>DB: SELECT report … FOR UPDATE
  FN->>DB: INSERT group if absent / SELECT group FOR UPDATE
  FN->>DB: INSERT entry (position = max+1)
  FN->>DB: INSERT audit_event
  FN->>DB: COMMIT
  FN-->>UI: Entry + group + revision
```

The `FOR UPDATE` on the report row serialises `max(position)+1` and makes duplicate groups impossible under MySQL's default `REPEATABLE READ`.

---

## 8. Authentication

Sessions in MySQL, no third-party service.

| Element | Decision |
|---|---|
| Hash | **Argon2id**, 19 MiB / t=2 / p=1, parameters stored in the hash prefix for future upgrade |
| Token | 32 random bytes, base64url; **only SHA-256 stored** |
| Cookie | `sid`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30-day rolling |
| Rotation | New token on login and role change; sliding renewal after 24 h |
| Revocation | Delete row; `users.session_version` bump invalidates all sessions |
| CSRF | `SameSite=Lax` + **Origin/Referer allowlist** on every non-GET. No tokens in the client. |
| Throttling | 10 attempts / 15 min per IP+email, generic errors |
| Invites | One-time hashed token, 7-day expiry, single use |
| Reset | v1: admin-issued one-time token |

Serverless note: one indexed lookup per request is fine, but keep the session query to a single statement (join `users` and `team_members` for the active team) so it stays one round trip.

---

## 9. MySQL adaptation

The logical model is unchanged; only the dialect and the locking primitives are.

### 9.1 Types

| PostgreSQL model | MySQL 8.4 | Note |
|---|---|---|
| `uuid` + `gen_random_uuid()` | `CHAR(36)` | **UUIDv7 generated in the app** — time-ordered, better InnoDB locality. No DB default, no trigger. |
| `timestamptz` | `DATETIME(3)` | UTC only; connection sets `time_zone='+00:00'`. Never `TIMESTAMP`. |
| `date` | `DATE` | `report_date` stays timezone-free. |
| `boolean` | `TINYINT(1)` | CHECK keeps it 0/1. |
| `jsonb` | `JSON` | Snapshots only. |
| `text` | `VARCHAR(4000)` | Characters, not bytes — Bangla is safe. |
| `citext` | `utf8mb4_0900_ai_ci` | Case- and accent-insensitive. Documented, not accidental. |
| `bytea` | `LONGBLOB` | Logo, ≤ 2 MB by CHECK. |
| enums | `VARCHAR(20)` + `CHECK` | No `ALTER … MODIFY ENUM` pain later. |

### 9.2 Constraints MySQL lacks

| Missing | Replacement |
|---|---|
| Partial indexes | Stored generated column that is `NULL` unless indexed, plus a UNIQUE index (many `NULL`s are allowed) |
| `citext` | Collation |
| `gen_random_uuid()` | App-generated UUIDv7 |
| `ON CONFLICT DO NOTHING` | `INSERT … ON DUPLICATE KEY UPDATE id = id` |
| Advisory locks in requests | `SELECT … FOR UPDATE` inside a transaction |
| Deferrable FKs | Ordered writes in one transaction |

```sql
ALTER TABLE team_members
  ADD COLUMN active_user_id CHAR(36)
    GENERATED ALWAYS AS (IF(deleted_at IS NULL, user_id, NULL)) STORED,
  ADD UNIQUE KEY team_members_active_uq (team_id, active_user_id);
```

### 9.3 Concurrency

| Concern | Approach |
|---|---|
| Isolation | `REPEATABLE READ`; report assembly reads in one transaction |
| Positions | Lock the parent row, then `MAX(position)+1`; renumber in steps of 10 |
| Reordering | One transaction, consistent lock order, always `ORDER BY id` |
| Deadlocks | Retry 3× on 1213/1205 with jittered backoff |
| Optimistic concurrency | `UPDATE … WHERE id=? AND version=?`; 0 rows → `409` with current row |
| Export duplicates | `UNIQUE (snapshot_id, format)`; loser re-reads |

`position` is not unique-constrained; ordering is `position, id`.

### 9.4 What changes on serverless

- No `GET_LOCK` in request paths — pooled connections make it unreliable. Row locks only.
- Transactions must be short (one round trip of work), because the function may be frozen between awaits only if idle; keep the pool warm within the invocation.
- Do not hold a connection across an outbound HTTP call (the Blob upload) — commit first, upload second, record the export row last.

---

## 10. Export: one model, two renderers

This is the largest change forced by C2. Gotenberg cannot run on Vercel, so the PDF is no longer a conversion of the DOCX.

### 10.1 Architecture

```text
ReportDTO (pure domain)
      │
      ▼
DocumentModel  ← layout tokens (twips, widths, fonts, borders)
      │
      ├──► renderDocx(model)  → .docx Buffer   (docx npm)
      └──► renderPdf(model)   → .pdf  Buffer   (pdf-lib + embedded TTF)
```

Both renderers consume the **same** `DocumentModel`. Neither knows about HTTP, MySQL, or Blob. Both are pure functions, unit-testable, and deterministic.

### 10.2 The model

```ts
type DocumentModel = {
  page:   { widthPt: 792; heightPt: 612;
            margins: { topPt: number; rightPt: 0; bottomPt: number; leftPt: 72 } };
  header: { logo: { bytes: Buffer; widthPt: number; heightPt: number };
            title: string; fontPt: 15 };
  blocks: Block[];
};

type Block =
  | { kind: 'date'; label: string; value: string }
  | { kind: 'table'; columnsPt: number[]; rows: Row[]; borderPt: 0.875 }
  | { kind: 'heading'; text: string; underline: true; keepWithNext: true }
  | { kind: 'preparedBy'; label: string; value: string };

type Row = { cells: Cell[]; cantSplit: true };
type Cell = { text: string; bold: boolean; colspan: number; rowspan: number;
              align: 'left'; valign: 'top' };
```

Merged category+title cells become `rowspan` on the first row of a group and omitted cells after it. Serial numbers and status numbering are computed before the model is built, so both renderers receive final text.

### 10.3 Pagination — the rule that makes both agree

| Rule | DOCX | PDF |
|---|---|---|
| Header repeats | Section header | Drawn at the top of every page |
| Rows never split | `cantSplit` on every row | Paginator never breaks a row |
| Follow-up heading stays with its table | `keepNext` | Heading is placed only if the header row fits |
| No hard page breaks | none emitted | none emitted |
| Page count | whatever Word computes | whatever the paginator computes |

Because we set `cantSplit` in the DOCX and implement the same rule in the PDF paginator, the two documents break at the same **row boundaries**. Word may still differ by a few points in line height; that is inherent to Word's engine and cannot be eliminated without running Word itself.

**Honest consequence:** the PDF is our canonical visual output and is tested pixel-for-pixel against the reference. The DOCX is validated structurally (XML assertions for page size, table widths, merges, header, row counts) and visually in Word during UAT. Their content and geometry are identical; a page break may occasionally land one row earlier or later.

### 10.4 PDF renderer specifics

| Concern | Decision |
|---|---|
| Library | `pdf-lib` + `@pdf-lib/fontkit` |
| Fonts | Embed a TTF subset. Times New Roman if licensed, otherwise Liberation Serif (metric-compatible). The file lives in `packages/document/fonts/` with its licence. |
| Geometry | Points: 1 twip = 1/20 pt. Table width 14445 twips = 722.25 pt, starting at `72 − 39 = 33 pt` from the page edge. |
| Text wrapping | Measured with `font.widthOfTextAtSize`; explicit line breaking, including the status text's embedded newlines. |
| Borders | 0.875 pt lines drawn per cell edge; merged cells drawn once. |
| Determinism | Fixed metadata (no `CreationDate`, no random ID), so the same snapshot yields byte-identical output. |
| Speed | < 1 s for a 4-page report. |

### 10.5 Storage and download

| Concern | Decision |
|---|---|
| Store | **Vercel Blob**, private, key `exports/{teamId}/{reportId}/r{revision}/{filename}` |
| Upload | After commit; the `report_exports` row is written only once the blob exists |
| Download | `GET /api/exports/:id/download` checks the session and team, then streams the blob. Blobs are never public URLs. |
| Caching | `Cache-Control: private, max-age=300`; the file itself is immutable |
| Missing blob | Regenerated from the snapshot on demand — the snapshot is the durable source |
| Cleanup | Cron removes draft exports older than 90 days |

### 10.6 Why not the alternatives

| Alternative | Verdict |
|---|---|
| Gotenberg / LibreOffice on Vercel | Impossible: no container, no system binaries. |
| Headless Chromium (`puppeteer-core` + `@sparticuz/chromium`) | Works, but ~50 MB bundle, 1–3 s cold start, and a third layout engine to tune. Strictly worse than `pdf-lib` here given the document is two tables. |
| External conversion API (CloudConvert, hosted Gotenberg) | Violates C2. Would be the pragmatic choice if you ever relax it. |
| PDF only, no DOCX | Violates the requirement for both formats. |
| DOCX only, emailed to Word | Violates "PDF ready to send". |

---

## 11. Frontend

Unchanged from v1 apart from hosting:

- Build output is static; Vercel serves it from the CDN with immutable asset hashes.
- `VITE_API_BASE=/api` — same origin in production, Vite proxy in development.
- PWA: precached shell, network-first API cache, `registerType: 'prompt'` so an update never swaps the app mid-entry.
- Routes: `/login`, `/invite/:token`, `/t/:teamSlug`, `/t/:teamSlug/reports/:date`, `/follow-ups`, `/history`, `/settings`, `/audit`.
- Preview is rendered from the DTO in React; it must look like the export but does not paginate like Word.
- Budget: < 220 KB gz initial JS, < 90 KB per route chunk.

---

## 12. Deployment: GitHub + Vercel

### 12.1 One Vercel project

```json
{
  "buildCommand": "pnpm --filter web build",
  "outputDirectory": "apps/web/dist",
  "functions": { "api/index.ts": { "maxDuration": 30, "memory": 1024 } },
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/index.ts" }],
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }]
}
```

Because the SPA and the API share an origin, there is no CORS, no cookie `Domain`, and no preflight.

### 12.2 Git flow

| Step | What happens |
|---|---|
| Pull request | GitHub Actions: install, typecheck both apps, unit + contract tests, MySQL service container + migrations + repository tests, build. Vercel creates a **preview deployment**. |
| Review | Preview URL is clickable; the reviewer logs in against the preview's own database or a shared staging DB. |
| Merge to `main` | Migrations run from Actions (with the production DB secret, serialised by a concurrency group). Vercel deploys production. |
| Rollback | Vercel instant rollback to the previous deployment. Migrations are forward-only, so keep them backward compatible for one release. |
| Secrets | Vercel env vars for runtime; GitHub secrets for the migration job. Never in the repo. |

### 12.3 Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `mysql://user:pass@host:3306/cghq?ssl=true` |
| `SESSION_TTL_DAYS` | 30 |
| `PUBLIC_ORIGIN` | `https://report.example.com` — origin allowlist |
| `TEAM_TIMEZONE_DEFAULT` | `Asia/Dhaka` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob |
| `CRON_SECRET` | Guards `/api/cron/*` |
| `LOG_LEVEL` | `info` |

### 12.4 Operational notes

- **SSL is mandatory** on the MySQL connection; the function has no fixed egress IP, so do not rely on an IP allowlist.
- **Cron runs in UTC.** The cleanup schedule is timezone-independent by design.
- **Preview deployments share the production database by default** unless you provision a second one. Use a separate staging database for previews, or accept that previews are read-mostly. This is a real hazard and deserves a deliberate choice.
- **Vercel Hobby is not licensed for commercial use.** A work tool needs a paid plan. Verify current terms.
- **Cold start** is visible on the first request of the day; the SPA shows a skeleton rather than a blank screen.

---

## 13. Testing

| Level | Tool | What it proves |
|---|---|---|
| Domain unit | Vitest or Jest | Grouping, Ser, numbering, date formatting, filename |
| Contract | Zod | Every request/response shape, shared with the UI |
| **SQL contract** | Jest + Testcontainers MySQL | Every SQL constant executes; constraints fire; no column drift |
| API e2e | supertest | Auth → entries → finalize → export with cookies and origin checks |
| DOCX structural | unzip + XML asserts | Page size, table widths, merges, header, exactly two tables |
| **PDF visual** | pdfjs + pixelmatch | Rendered pages vs golden baseline snapshots |
| **Layout parity** | shared harness | Both renderers break at the same row boundaries for a 4-page fixture |
| Browser e2e | Playwright | Real flows, mobile viewport, share stub |
| Migration | script | Checksums, idempotent re-run, clean apply on an empty DB |

Two stack-specific tests that must exist:

1. **Constraint parity** — every violation the logical model rejects (duplicate member, cross-team title, duplicate report date, duplicate snapshot revision) is rejected by MySQL too.
2. **Timezone neutrality** — 23:59:59 and 00:00:01 in `Asia/Dhaka` with the function in UTC produce two distinct `report_date` values and two filenames.

---

## 14. Phases

| Phase | Scope | Exit criteria | Days |
|---|---|---|---|
| **0. Scaffold + SQL layer** | Monorepo, contracts, MySQL schema, migrations, runner, repository pattern, CI | Migrations apply; SQL contract tests green; no ORM in the tree | 5–6 |
| **1. Format proof** | `DocumentModel`, DOCX renderer, **PDF renderer**, golden tests | Both files match the reference; parity test passes | 7–9 |
| **2. Auth + teams** | Sessions, login, invites, roles, settings, logo | Three members log in; role checks hold | 4–5 |
| **3. Entries + preview** | Dictionary, day report, composer, grouping, Ser, preview | A full day is entered and previewed on mobile | 5–6 |
| **4. Export + history** | Snapshots, Blob, download proxy, history, revisions | Any date exports reproducibly; old exports never change | 4–5 |
| **5. Follow-ups + finalize** | Master list, carry-forward, finalize/reopen, audit | UAT scenarios pass | 3–4 |
| **6. Hardening + launch** | PWA, share, cron, monitoring, deploy, guides | DoD met; team using it daily | 4–5 |
| **Total** | | | **32–40 days ≈ 6.5–8 weeks** |

The PDF renderer is the single biggest addition. It is also the only way to satisfy C2.

---

## 15. Cost

| Item | Monthly |
|---|---|
| Vercel (paid plan, commercial use) | ~US$20 |
| Managed MySQL (small instance) | ~US$10–25 |
| Vercel Blob | < US$1 |
| Domain | ~US$1 |
| **Total** | **~US$30–47** |

Roughly double the VPS plan, and the VPS version would have been simpler for PDF. That is the price of C2, stated plainly.

---

## 16. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Two renderers drift** | PDF and DOCX disagree | One `DocumentModel`, shared tokens, parity test, golden files for both |
| **Word paginates differently than our PDF** | A row lands on a different page in DOCX | `cantSplit` on both sides; content identical; documented and accepted |
| **PDF renderer takes longer than estimated** | Schedule slip | Phase 1 is a spike with a hard 9-day cap; fall back to Chromium only if `pdf-lib` cannot match the sample |
| **Serverless connection limits** | Intermittent `ER_CON_COUNT_ERROR` | `connectionLimit: 2`, short transactions, provider with headroom |
| **Cold start** | 1–1.5 s first request | Skeleton UI, co-located region |
| **Blob dependency** | Downloads fail if Blob is down | Regenerate from snapshot on demand |
| **Preview deployments hitting production DB** | Data corruption | Separate staging DB or read-only preview credentials — decide explicitly |
| **Raw SQL drift** | Runtime 500s after a schema change | SQL contract tests in CI; health reports migration version |
| **MySQL provider lacks FK/CHECK** | Silent data corruption | Provider criteria in § 3.1; constraint parity test |
| **Hobby plan ToS** | Account action | Paid plan from day one |
| **Function timeout on a huge report** | Export fails | 30 s cap, < 1 s render, measured with a 200-entry fixture |

---

## 17. Decisions I need from you

| # | Decision | Default | Note |
|---|---|---|---|
| 1 | **Managed MySQL provider** | One that enforces FK + CHECK and supports TCP transactions | Vercel cannot host MySQL; this is the only non-Vercel piece |
| 2 | **PDF approach** | **`pdf-lib` renderer** (satisfies Vercel-only) | Alternative: allow one external conversion API — breaks C2 |
| 3 | Vercel plan | Paid (commercial use) | Hobby is not licensed for this |
| 4 | Preview deployments | Separate staging database | Shared production DB is the default and is risky |
| 5 | Font | Times New Roman if licensed, else Liberation Serif | Affects pixel comparison and the DOCX's declared font |
| 6 | MySQL version | 8.4 LTS | 8.0 acceptable |

If you confirm 1 and 2, Phase 0 and Phase 1 can start. Nothing is built until you say go.
