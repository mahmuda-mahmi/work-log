# Product Requirements Document (PRD): CGHQ Team Work Report

| | |
|---|---|
| **Document Status** | Revised Baseline (v1.1), supersedes the 15 Nov 2026 baseline |
| **Date** | 15 November 2026 |
| **Working Name** | CGHQ Team Work Report (`work-log`) |
| **Related Specs** | [STACK-PLAN.md](STACK-PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [EXPORT-SPEC.md](EXPORT-SPEC.md) · [API.md](API.md) · [DATA-MODEL.sql](DATA-MODEL.sql) |

**How to read this document.** Requirements carry IDs (`FR-*` functional, `NFR-*` non-functional) so specs, tests and tickets can reference them. Anything marked **[Decision]** is a rule this revision fixes where v1.0 was ambiguous. Anything in §9 is still open and must be closed before the phase that depends on it starts.

### Revision notes (v1.0 → v1.1)

| Area | What was wrong or missing in v1.0 | What this revision does |
|---|---|---|
| Lifecycle | `reopened` state and "revision increments on next export" were ambiguous; exports of drafts undefined | Explicit state machine, revision rules, stored-snapshot re-download (§4.1, §4.8) |
| Concurrency | "Shared live draft within 30 s" had no mechanism and no conflict rules | Polling + optimistic locking (§4.9) |
| Follow-ups | Snapshot timing, which items appear, and table columns undefined | Precise snapshot and carry-forward rules (§4.3) |
| Permissions | Roles described in prose; "own entries" undefined | Permission matrix (§3) |
| Dates and timezones | Midnight rollover, backdating, timezone changes, date padding unspecified | Timezone rules (§4.1) |
| Metrics | Several targets not measurable ("≤ 4 taps", "match visually") | Measurable definitions and test methods (§2) |
| Security | No rate limiting, invite expiry, password reset, session lifetime, upload validation | Added (§5.2) |
| Platform | Serverless limits, free-tier behavior, fonts and non-Latin text not addressed | Risks and decisions (§6, §8, §9) |
| Gaps | Empty states, offline behavior, retention, member removal, reminders (cron mentions "reminders" but no feature exists) | Added or explicitly cut |
| Phases | No exit criteria | Exit criteria per phase (§7) |

---

## 1. Problem Statement

A 2–4 person team logs daily work in a shared Google Doc. Every day, members manually edit a 5-column table (**Ser / Report Category / Title / Status / Task Completed By**), merge cells by hand for each category/title group, number status lines manually, maintain a separate **Follow-up Items** table, download the doc, convert it to PDF, and send it to WhatsApp.

Pain points:

1. **Repetitive and error-prone:** manual merges and numbering break easily.
2. **Slow on mobile:** Google Docs table editing on a phone is painful.
3. **Lossy history:** the doc is overwritten daily, so yesterday's follow-up items are mutated and there is no structured record.
4. **Multi-step delivery:** edit, download, convert, share, every day.

> **Baseline to capture before launch:** measure the current end-to-end time (first edit to WhatsApp send) over at least 5 working days so the improvement can be demonstrated, not assumed.

---

## 2. Product Vision, Goals & Metrics

Build a **private, mobile-first PWA** that lets each team member log tasks in seconds, automatically groups and formats entries into the exact CGHQ daily report layout, preserves daily snapshots and persistent follow-ups, and exports ready-to-send **DOCX** and **PDF** files in one action.

### Success Metrics

| Goal | Target | How it is measured |
|---|---|---|
| **Zero manual formatting** | Exported DOCX and PDF need no manual edits to match the reference | Golden tests against `docs/reference/`: (a) structural diff of the DOCX XML (page setup, header, table structure, merges, fonts) has zero differences, (b) rendered-page image diff of PDF vs reference is under the threshold set in EXPORT-SPEC, (c) sign-off by the Team Lead on three real reports |
| **Fast daily entry** | Adding a task takes ≤ 20 s and ≤ 4 interactions after the text is typed | Timed usability test with all team members on a 360 px phone; "interaction" = tap, select or navigation |
| **Shared live draft** | A change by one member is visible to teammates within ≤ 30 s (P95) | Automated test with two sessions; see §4.9 for the mechanism |
| **Fast, reliable export** | P95 ≤ 10 s for DOCX + PDF combined on a report of up to 25 entries / 3 pages; export success rate ≥ 99% | Server timing logs; error counts (NFR-6) |
| **Historical fidelity** | Re-downloading any finalized report returns byte-identical files to the originals | Hash comparison of re-download vs stored snapshot |
| **Follow-up continuity** | Changing follow-ups today never changes any earlier report | Automated test: finalize day N, mutate master list, re-download day N, compare hashes |
| **Adoption** | Within 2 weeks of launch, the team produces its daily report only through the app | Count of days with a finalized report vs working days |

### Non-Goals (MVP)

- Native iOS/Android app-store binaries (PWA + Web Share API covers mobile).
- Unofficial WhatsApp automation or bots (sharing uses the Web Share API on mobile and download + WhatsApp Web on desktop).
- Multi-organization billing, Gantt charts, time-tracking or timers.
- Offline write queueing (see FR-30).
- Multi-factor authentication, SSO, or users belonging to more than one team.
- Non-Latin script rendering in exports, unless §9 Q3 is resolved otherwise.

### Assumptions

- One team per deployment initially (data model stays multi-team via `team_id` for isolation and future use).
- Team size is 2–4 today; design and test for up to 10 members.
- Reports are written in English.
- Users are on current evergreen browsers (last 2 versions of Chrome, Safari, Firefox, Edge; iOS Safari 16.4+ for PWA and share features).

---

## 3. Users, Roles & Permissions

- **Team Lead (Admin):** manages the team and all content.
- **Member:** logs and edits work, manages follow-ups, exports.
- A team always has **at least one Team Lead**; the last Lead cannot be demoted or removed.
- Invite-only access. Members who are removed are **deactivated, not deleted**: their name stays on historical entries and snapshots.

### Permission matrix

| Capability | Member | Team Lead |
|---|---|---|
| Create entry (for self or a teammate) | ✅ | ✅ |
| Edit/delete entry **they created** while report is `draft` or `reopened` | ✅ | ✅ |
| Edit/delete **any** entry while report is `draft` or `reopened` | ❌ | ✅ |
| Create/edit follow-ups | ✅ | ✅ |
| Delete (archive) follow-ups | ✅ (own) | ✅ (any) |
| Manage category/title dictionary (rename, merge, archive) | ❌ (quick-create only) | ✅ |
| Preview, export, share, view history | ✅ | ✅ |
| Finalize a report | ❌ | ✅ |
| Reopen a finalized report | ❌ | ✅ |
| Team settings (name, timezone, logo, `Prepared By` default) | ❌ | ✅ |
| Invite/remove members, change roles, issue password reset | ❌ | ✅ |
| View audit log | ❌ | ✅ |

**[Decision]** "Own entry" means the entry's `created_by`, not the member it is attributed to via "Task Completed By". Attribution is a display field; ownership controls editing.

---

## 4. Functional Requirements

### 4.1 Daily Report Lifecycle & Timezone Rules

- **FR-1 One report per team per calendar day.** `report_date` is `YYYY-MM-DD` in the team's configured timezone (default `Asia/Dhaka`). Enforced by a unique key on `(team_id, report_date)`.
- **FR-2 Auto-initialization.** Opening the app on a day with no report creates that day's `draft` (race-safe: concurrent opens must produce one row).
- **FR-3 State machine.**

  ```
  draft ──finalize──▶ finalized ──reopen──▶ reopened ──finalize──▶ finalized
  ```

  - `draft` and `reopened` are **editable** and behave identically except `reopened` retains its existing `revision`.
  - `finalized` is **immutable**: no entry, follow-up snapshot, `Prepared By` or date edits are possible through any API.
  - **Revision rules [Decision]:** the first finalize sets `revision = 1`. Each finalize after a reopen increments it (2, 3, …). Revision is incremented at finalize time, not at export time.
- **FR-4 Date is bound to the report, not the export.** Every export or re-export stamps the report's own `report_date` in the header (`Date: 12 November 2026`) and the filename.
- **FR-5 Timezone behavior [Decision].**
  - "Today" is always computed server-side from the team timezone, never from the device clock.
  - If the app stays open past local midnight, the UI shows a "New day started" banner and offers to switch to the new report. It does **not** silently move entries into the new day.
  - Future-dated reports cannot be created.
  - Backfilling a past date with no report is allowed for any member up to 7 days back (Team Lead: unlimited), and is audit-logged.
  - Changing the team timezone does not alter existing `report_date` values; it applies from the next day.
- **FR-6 Date formatting [Decision].** Both the header (`Date: DD Month YYYY`, e.g. `Date: 05 November 2026`) and the filename (`DD_Month_YYYY`) use zero-padded two-digit days in English.

### 4.2 Daily Work Entry Composer

Fields:

| Field | Rules |
|---|---|
| **Report Category** | Required. Autocomplete from team dictionary; quick-create allowed for any member. Max 80 chars. |
| **Title** | Required. Workstream/sub-heading scoped under the category (autocomplete is category-scoped). Max 120 chars. |
| **Status** | Required. One or more completed task lines (plain text, one line per task, max 300 chars each, max 20 lines per entry). |
| **Task Completed By** | Required. Active team member; defaults to the logged-in user. Supports selecting more than one member. |

- **FR-7 Grouping and numbering [Decision].**
  - Entries group by `(Report Category, Title)`, matched **case-insensitively after trimming whitespace**; the dictionary's canonical casing is used for display.
  - `Ser` numbers groups `1, 2, 3…` in display order.
  - Status lines are numbered continuously **within a group** (`1., 2., 3.` across all entries in that group, in display order).
  - **Display order:** groups ordered by first-created entry time by default; the Team Lead and members can manually reorder groups and entries within a group. Manual order is stored (`sort_order`) and wins over creation time.
  - Each status row has its own individual **Task Completed By** cell (not comma-joined across the group), while `Ser`, `Report Category`, and `Title` are vertically merged per group.
- **FR-8 Live recompute.** Edit, reorder or delete updates the preview immediately (optimistic UI, reconciled with the server response).
- **FR-9 Dictionary hygiene.** Renaming or merging a category/title (Team Lead) updates `draft`/`reopened` reports; **finalized reports are never changed** because they are rendered from frozen snapshots. Archiving hides a term from autocomplete but keeps it on old entries.
- **FR-10 Fast entry.** The composer keeps the last-used category/title as a suggestion, supports "add another to same group", and preserves unsent text locally if the connection drops (see FR-30).

### 4.3 Follow-up Items (Table 2)

- **FR-11 Master list.** A persistent team-level list with statuses `open`, `in_progress`, `done`, `archived`. Fields: category (optional), title, status text, responsible member, `created_at`, `completed_on` (report date when marked done).
- **FR-12 What appears in a day's table [Decision].**
  - Included: all `open` and `in_progress` items, plus items whose `completed_on` equals that report's date (shown as done on the day they were completed).
  - Excluded: `archived` items, and `done` items from earlier days.
- **FR-13 Snapshot timing [Decision].**
  - While a report is `draft`/`reopened`, its follow-up table is a **live view** of the master list under FR-12's rule.
  - At **finalize**, the table is copied into a frozen snapshot stored with the report. After that, no master-list change can alter that report. (Export is only allowed once finalized.)
- **FR-14 Reopen behavior.** Reopening a finalized report keeps the *frozen* follow-up snapshot visible and editable only through the report; it does **not** pull in today's master-list state. A Team Lead can explicitly choose "Refresh follow-ups from master list" (audit-logged).
- **FR-15 Table shape.** Follow-up table columns and rendering (no vertical merges) follow EXPORT-SPEC. If the table has no rows, render a single row reading `None` rather than omitting the heading (§9 Q4).

### 4.4 Live Preview

- **FR-16** Mobile-friendly preview rendered from the same structured `DocumentModel` used for exports, so grouping, numbering, header, follow-ups and `Prepared By` can be verified before exporting.
- **FR-17** The preview is a faithful structural approximation (not a pixel-exact page render). A "Check pagination" action may render the actual PDF for exact page breaks (optional, post-MVP if costly).

### 4.5 Exact-Format Export (DOCX & PDF)

Must conform strictly to [EXPORT-SPEC.md](EXPORT-SPEC.md):

- **Page setup:** Letter Landscape (`11 × 8.5 in`), 14 pt serif font (Times New Roman in DOCX; metric-compatible Liberation Serif embedded in PDF).
- **Repeating header on every page:** team logo + **CGHQ Daily Report** (centered, bold 15 pt) + `Date: <DD Month YYYY>` (zero-padded).
- **Two tables every day:**
  1. Main table: `Ser | Report Category | Title | Status | Task Completed By`, with vertical cell merges on the first three columns per group.
  2. **Follow-up Items:** bold, underlined heading + 5-column table (no vertical merges).
- **Variable page count:** flows across as many pages as the content requires.
- **Footer line:** `Prepared By: <Name>` (no page numbers).
- **Filename [Decision]:** the current revision downloads as `CGHQ_Team_Work_Status_<DD_Month_YYYY>.docx` / `.pdf`. Superseded revisions in History download with the suffix `_rev<N>` before the extension.
- **Dual-renderer parity:** `docx` and `pdf-lib` consume the exact same `DocumentModel` and respect `cantSplit` row boundaries. When a merged group spans a page break, `Ser / Report Category / Title` are left blank on the continuation page.
- **FR-18 `Prepared By` [Decision].** Defaults to the team setting; the Team Lead can override per report; the value is frozen into the snapshot at finalize/export.
- **FR-19 Empty report.** Exporting a report with zero entries is allowed but shows a confirmation ("This report has no entries").
- **FR-20 Text safety.** Text is escaped/sanitized for both renderers. Characters the embedded font cannot render are detected at entry time and flagged with a clear message instead of exporting boxes or failing (see §9 Q3).
- **FR-21 Export idempotency.** Each export request carries an idempotency key so a double-tap or retry cannot create duplicate snapshots.
- **FR-22 Renderer version.** Every snapshot records the renderer/template version used, so a future renderer change never silently alters a historical file.

### 4.6 Snapshots, History & Sharing

- **FR-23 Finalize-before-export & snapshot storage [Decision].** Finalizing a report is required before exporting (live Preview remains available on `draft`/`reopened`). Every export stores an immutable snapshot: a `report_exports` row (report id, revision, `finalized` state, content hash, renderer version, actor, timestamp) plus the generated files in a private **Vercel Blob**.
- **FR-24 Stored-snapshot downloads.** Re-downloading a finalized report returns the stored files from Vercel Blob, never regenerating them.
- **FR-25 Retention.** Exports of finalized reports are retained indefinitely. Duplicate exports with identical content hash are stored once.
- **FR-26 History view.** Lists past dates with state (`draft` / `finalized`), revision number, last export time, and one-click `.docx` / `.pdf` download; filter by month; shows superseded revisions.
- **FR-27 Share to WhatsApp.**
  - Mobile: use `navigator.share({ files })` after `navigator.canShare({ files })` returns true, triggered directly from a user gesture. **PDF is the default shared file** (DOCX available via the same action sheet).
  - Fallback (desktop or unsupported browsers): download the file and show a prompt with short instructions for WhatsApp Web.
  - Cancelling the share sheet is not an error and is not logged as one.
- **FR-28 Authenticated downloads.** All blob access goes through an authenticated, team-scoped API proxy; no public blob URLs.

### 4.7 Audit Trail

- **FR-29** Log with actor, timestamp, IP-independent request id, and metadata (before/after for edits):
  `entry.created|updated|deleted`, `report.created|backfilled|finalized|reopened|exported|followups_refreshed`, `followup.created|updated|status_changed|archived`, `category.renamed|merged|archived`, `member.invited|joined|removed|role_changed|password_reset`, `team.settings_updated`, `auth.login_failed` (aggregate only, no passwords or tokens).
- Visible to Team Leads, filterable by date/actor/action. Retained for at least 12 months.

### 4.8 Offline & Connectivity Behavior

- **FR-30 [Decision]** The PWA caches the app shell and the most recently viewed report for **read-only** access offline. Writes require connectivity: when offline, the UI shows a banner, disables Save/Export, and **retains the unsent composer text locally** so nothing typed is lost. A write queue with sync is out of MVP scope.

### 4.9 Concurrency & Freshness

- **FR-31 Freshness mechanism [Decision].** Vercel serverless does not hold WebSockets, so the client **polls** the report every 15 s while the tab is visible, and also refetches on focus and on network recovery, using `ETag`/`If-None-Match` to keep unchanged polls cheap. This yields ≤ 30 s visibility (P95).
- **FR-32 Optimistic locking.** Every entry, report and follow-up row has a `version`. Updates send the version they were based on; a stale update returns `409 Conflict` with the current row, and the UI offers "keep mine / take theirs" for that item. Last-write-wins is not allowed.
- **FR-33 Finalize race.** Finalizing while others are editing locks the report atomically; any in-flight edit that arrives afterwards receives a clear "Report was finalized" error and the composer keeps the unsent text.

---

## 5. Non-Functional Requirements

### 5.1 Performance & Reliability

- **NFR-1 Bundle:** initial SPA bundle < 220 KB gzipped (CI-enforced budget).
- **NFR-2 API latency:** P95 < 300 ms for CRUD on warm functions; cold starts are measured separately and tracked with a target of < 1.5 s.
- **NFR-3 Export:** P95 ≤ 10 s for DOCX + PDF generated in parallel (§4.5 reference size). Function `maxDuration` is configured above the target; if an export exceeds it, the user sees a retry option and no partial snapshot is saved.
- **NFR-4 Migrations:** idempotent, forward-only SQL migrations with checksum verification; CI runs them against a clean database and against the previous schema.
- **NFR-5 Data safety:** managed database backups with a documented restore procedure, tested once before launch. Target RPO ≤ 24 h, RTO ≤ 4 h.
- **NFR-6 Observability:** structured logs with request ids; error tracking; dashboards or alerts for export failure rate, export duration, and auth failures.

### 5.2 Security

- **NFR-7 Sessions:** HTTP-only, `Secure`, `SameSite=Lax` cookies; server-side sessions in MySQL; idle timeout 7 days, absolute lifetime 30 days (configurable); all sessions revoked on password change or member removal.
- **NFR-8 CSRF:** Origin/Referer verification plus a CSRF token on state-changing requests.
- **NFR-9 Passwords:** Argon2id (parameters documented and tuned for the serverless memory limit; verify the chosen library builds on the Vercel runtime); minimum 12 characters; common-password blocklist.
- **NFR-10 Brute-force protection:** rate limit login and invite-accept endpoints (default: 5 failures per 15 min per account and per IP, stored in MySQL), with generic error messages that do not reveal whether an email exists.
- **NFR-11 Invites and reset [Decision]:** single-use, 72-hour tokens, stored hashed. Password reset is Team-Lead-issued link (or email if an email provider is chosen, §9 Q6); the link can be copied manually, so email delivery is not a hard dependency.
- **NFR-12 Authorization:** every query is scoped by `team_id`, and every mutating endpoint re-checks role and ownership server-side per §3. Cross-team access tests are mandatory in CI.
- **NFR-13 Input handling:** strict Zod validation shared via `packages/contracts`; parameterized SQL only (`mysql2` `execute()`); output encoding for the preview.
- **NFR-14 Uploads:** logo limited to PNG/JPEG, ≤ 1 MB, ≤ 1000 px on the long side, content-type sniffed and re-encoded server-side; SVG rejected.
- **NFR-15 Transport and storage:** HTTPS only; SSL-enforced MySQL connections; private Blob access via authenticated proxy only; secrets only in Vercel/GitHub secret stores; no secrets in the repo or logs.
- **NFR-16 Privacy:** work reports may contain client-sensitive information; data is limited to the team, deleted on team deletion, and the Team Lead can export or purge team data on request.

### 5.3 Mobile, Accessibility & Compatibility

- **NFR-17 Mobile-first PWA:** responsive from 360 px, precached app shell, safe update prompt (`registerType: 'prompt'`) that never interrupts an in-progress entry.
- **NFR-18 Accessibility:** WCAG 2.1 AA for the app UI: labelled inputs, focus management in the composer, sufficient contrast, 44 px minimum touch targets.
- **NFR-19 Compatibility:** DOCX opens correctly in Word (desktop/mobile), Google Docs, and LibreOffice; PDF opens in all major viewers and WhatsApp's in-app preview. Verified on at least one real iOS and one Android device before launch.

---

## 6. Technical Constraints & Architecture (Locked)

These are fixed inputs; rationale is recorded so the choices can be revisited deliberately rather than accidentally.

| Layer | Specification | Rationale / note |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite + React Router 7 + TanStack Query | Small bundle, fast mobile UX; Query provides polling and optimistic updates |
| **Backend** | NestJS 11 (TypeScript) as a single Vercel serverless function (`/api/*`), same origin as the SPA | Same-origin removes CORS and simplifies cookies; watch cold start size |
| **Shared Contracts** | Zod schemas in `packages/contracts` | One validation source for client and server |
| **Database** | **MySQL 8.x on Aiven** (SSL required, InnoDB, `utf8mb4`, foreign keys, `CHECK` constraints) | `connectionLimit: 2` per function instance; verify plan limits (§8) |
| **Data Access** | **Raw parameterized SQL (`mysql2` `execute()`)**, no ORM, no query builder; plain `.sql` migrations with a checksummed runner | Full control over SQL and zero abstraction leakage; costs more boilerplate, mitigated by a repository pattern and SQL tests |
| **DOCX / PDF** | `docx` (npm) + `pdf-lib` sharing one `DocumentModel` | One model prevents format drift between renderers |
| **Storage & Cron** | **Vercel Blob** (private) + **Vercel Cron** | Cron is used for draft-export cleanup only (reminders are cut from MVP, see §10) |
| **Source & CI** | GitHub, GitHub Actions (typecheck, unit/contract/SQL tests, migrations, bundle budget) | |
| **App Hosting** | Vercel, preview + production deployments | Preview deployments use a separate database/schema from production |

> Account and repository names (GitHub org, Vercel project) are operational details and should live in the ops/runbook document rather than in the PRD.

### Environments

Three environments: local, preview, production. Preview and production never share a database or blob store. Production migrations run through CI with a manual approval step.

---

## 7. Delivery Phases

Each phase ends only when its **exit criteria** are met.

| # | Phase | Scope | Exit criteria |
|---|---|---|---|
| 0 | **Scaffold & SQL Layer** | Monorepo (`apps/web`, `apps/api`, `packages/contracts`, `db/migrations`), Aiven MySQL + checksummed migration runner, repository pattern, CI, repo setup, preview/production environments | CI green; migration runs on a clean DB; a "hello" API deployed on Vercel connects to Aiven over SSL; platform limits (§8) verified |
| 1 | **Format Proof** | `DocumentModel`, DOCX + PDF renderers, font strategy, golden tests vs `docs/reference/` | Both renderers pass golden tests on at least 3 sample reports including a multi-page, an empty-follow-up and a long-merge case; Team Lead signs off the output |
| 2 | **Auth & Teams** | Sessions, login, invites, reset, roles, team settings, logo upload, rate limiting | Cross-team isolation and permission-matrix tests pass; invite and reset flows work end to end |
| 3 | **Entries & Preview** | Dictionary, daily report, composer, grouping/numbering, ordering, live preview, optimistic locking | Entry-time target (≤ 20 s) met in a timed test; two-session conflict test passes |
| 4 | **Export & History** | Snapshots, Blob upload/proxy download, history, idempotency, retention | Export P95 ≤ 10 s on the reference size; re-download returns identical bytes |
| 5 | **Follow-ups & Finalize** | Master list, carry-forward rules, snapshot, finalize/reopen/revisions, audit trail | "Mutate master list after finalize" test leaves old report unchanged; revision numbering verified |
| 6 | **Hardening & Launch** | PWA, offline behavior, WhatsApp share, Vercel Cron, a11y pass, backups tested, production deploy, smoke tests, 1-week pilot with the team | Real-device share and export checks pass; restore drill done; pilot feedback triaged; adoption metric started |

Phase 1 intentionally precedes Auth because the export format is the highest-risk requirement.

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| DOCX and PDF renderers diverge in page breaks | Output no longer "exact" | Shared `DocumentModel`, golden tests, `cantSplit` rules, explicit font metrics |
| `pdf-lib` font handling (embedding, subsetting, glyph coverage, no complex-script shaping) | Missing or garbled characters, e.g. Bengali names | Embed Liberation Serif via fontkit; FR-20 glyph check; decision on §9 Q3 |
| Serverless time and memory limits for PDF/DOCX generation | Export exceeds limits or fails | Generate formats in parallel, set `maxDuration`, test on the deployed plan early (Phase 0/1) |
| Vercel plan limits (function duration, cron frequency, Blob features) | Cleanup or private blob features not available as assumed | Verify against the chosen Vercel plan in Phase 0; design cleanup to tolerate once-a-day cron |
| Aiven plan behavior (idle shutdown on free tiers, connection limits) | First-request failures or outages | Confirm plan and connection limits in Phase 0; retry-with-backoff for first connection |
| Argon2id native module on Vercel runtime | Login unusable in production | Verify in Phase 0 with a deployed login stub |
| Polling-based "live" updates feel laggy or conflict-prone | Teammates overwrite each other | 15 s polling + focus refetch, optimistic locking (FR-31/32) |
| Reference doc changes later (logo, wording, layout) | Golden tests become obsolete | Version the template (FR-22); update goldens through reviewed PRs only |
| Team abandons the app if daily entry is slower than the Google Doc | Product fails | Timed usability test in Phase 3; pilot week in Phase 6 |

---

## 9. Resolved Decisions (formerly Open Questions)

| # | Question | Decision |
|---|---|---|
| Q1 | Header date padding | **Zero-padded** in both header (`Date: 05 November 2026`) and filename (`..._05_November_2026.pdf`). |
| Q2 | Multi-contributor `Task Completed By` cell | **Individual cell per status row** (not comma-joined); `Ser`, `Report Category`, and `Title` merge vertically per group. |
| Q3 | Non-Latin / Bengali text | **Latin-only**; `FR-20` warns on unsupported characters. |
| Q4 | Empty Follow-up table & persistence | Heading + one row reading `None`; active follow-ups carry forward daily until deleted/removed. |
| Q5 | Page-break continuation of merged groups | **Leave `Ser / Report Category / Title` blank** on the continuation page. |
| Q6 | Email provider for invites and reset | **Copyable invite/reset links**; no email provider dependency. |
| Q7 | Finalize vs. draft export | **Finalizing a report is required before exporting** (Preview remains available on drafts). |
| Q8 | Post-finalize typo fixes | **Reopen only (Team Lead)**, which creates a new revision on re-finalize. |

---

## 10. Out of Scope for MVP (Deferred)

- Daily reminders (push/email/WhatsApp). Cron is used only for export cleanup until a delivery channel is chosen.
- Offline write queue and background sync.
- Pixel-exact in-app pagination preview.
- Report templates for other teams or formats.
- Analytics dashboards (workload by member/category).

---

## Glossary

- **DocumentModel:** the single structured representation of a report from which the preview, DOCX and PDF are all rendered.
- **Snapshot:** an immutable stored copy of a report's content and generated files at a point in time.
- **Revision:** the finalize count of a report; increments after each reopen-and-finalize cycle.
- **Group:** the set of entries sharing the same `(Report Category, Title)` within a report.
