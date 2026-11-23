# CGHQ Team Work Report

A small web app for a 2–4 person team to replace the daily "shared Google Doc → download → PDF → WhatsApp" routine.

Each member logs what they did during the day. The app groups the entries into the exact CGHQ daily-report table format and exports a ready-to-send **DOCX** and **PDF** with one click.

> **Status:** Production web app + NestJS API deployed on Vercel with PostgreSQL and Vercel Blob.
> **Working name:** Work Log (`cghq-work-log`)

---

## The problem

Today the team:

1. Opens a shared Google Doc.
2. Manually edits a table with columns **Ser / Report Category / Title / Status / Task Completed By**.
3. Merges the first three columns by hand for every group.
4. Numbers each status line by hand.
5. Maintains a separate **Follow-up Items** table.
6. Downloads the doc, converts it to PDF, and sends it to WhatsApp.

The format is fixed. The manual work is repetitive, easy to break, and impossible to query.

## The product

- A **mobile-first PWA** for fast daily entry (member logs a task in a few taps).
- **One shared report per team per day**, with entries grouped automatically.
- **Exact-format DOCX generation** and **LibreOffice-based PDF conversion** from the same document.
- Persistent **follow-up items** that carry forward each day without rewriting history.
- **History, re-export, and WhatsApp sharing**.
- Team-scoped accounts, roles, and audit trail.

## Recommended stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | Fast, static, mobile-first; no server rendering needed behind a login |
| Routing / state | React Router 7 + TanStack Query | Deep links per date; cached server state with optimistic updates |
| Backend | NestJS 11 (TypeScript) | Explicit modules, guards, and validation pipes; separate API from UI |
| Database | MySQL 8.4 LTS | Team's choice; InnoDB, `utf8mb4`, CHECK constraints, JSON |
| Data access | **Raw parameterized SQL** (`mysql2` `execute()`) | No ORM, no query builder, ever |
| Migrations | Plain `.sql` files + checksummed runner | SQL is reviewed as SQL |
| Auth | Cookie sessions in MySQL + Argon2id | Instant revocation, no token refresh flow |
| Contracts | Shared Zod schemas (`packages/contracts`) | One request/response definition used by both apps |
| DOCX | `docx` (npm) | Precise control of page setup, headers, tables, merges |
| PDF | `pdf-lib` from the same document model | LibreOffice cannot run on Vercel |
| Files | Vercel Blob (private) | No persistent filesystem on Vercel |
| Hosting | **GitHub + Vercel** | Static SPA + serverless NestJS API on one origin |
| Scheduled work | Vercel Cron | Cleanup and reminders |
| Share | Web Share API → WhatsApp, with download fallback | Works on Android/iOS; no unofficial APIs |

Estimated running cost: **US$10–25/month** (VPS + domain + offsite backup).

## Documentation

| Document | What it covers |
|---|---|
| [docs/STACK-PLAN.md](docs/STACK-PLAN.md) | The chosen stack (React · NestJS · MySQL), MySQL adaptation plan, repo layout, phases |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Product requirements, system design, data model, API, UI, security, deployment, roadmap |
| [docs/EXPORT-SPEC.md](docs/EXPORT-SPEC.md) | Pixel-and-twip-level specification of the generated document, derived from the sample files |
| [docs/DATA-MODEL.sql](docs/DATA-MODEL.sql) | Logical PostgreSQL schema (MySQL version follows in Phase 0) |
| [docs/API.md](docs/API.md) | HTTP API surface and request/response examples |
| [docs/reference/](docs/reference/) | Format measurement notes and default brand mark |

## The format we must reproduce

Landscape Letter, Times New Roman 14 pt, header on every page:

- Logo + **CGHQ Daily Report** (centered)
- **Date:** 12 November 2026
- Main table with five columns and vertical merges for each category/title group
- Numbered status rows inside a group (1, 2, 3 …)
- **Follow-up Items:** bold/underlined heading + second table
- **Prepared By:** name
- File name `Team_Work_Status_12_November_2026.pdf`

See [docs/EXPORT-SPEC.md](docs/EXPORT-SPEC.md) for exact measurements.

Two things worth stating explicitly:

- **The date is per report, not per export.** A new calendar day creates a new report; the date line and the file name both follow that report's date, so re-exporting an old report keeps the old date.
- **Three pages is not a requirement.** The document holds the same two tables every day (daily work + follow-ups), and its page count follows the amount of content — 2 pages on a quiet day, 5 on a busy one.

Details: [docs/ARCHITECTURE.md § 5.8](docs/ARCHITECTURE.md#58-daily-report-lifecycle-date-rollover) and [docs/EXPORT-SPEC.md § 8.1](docs/EXPORT-SPEC.md#81-guarantees).

## Suggested build order

1. **Format proof** — generate a DOCX/PDF from a fixture and get sign-off against the sample.
2. **Core** — auth, team, members, categories/titles, daily entries, grouping.
3. **Export** — DOCX + PDF pipeline, history, sharing.
4. **Follow-ups + finalize** — carry-forward, snapshots, lock/reopen.
5. **Hardening** — golden-file tests, backups, monitoring, UAT.

A realistic MVP is **2–3 weeks** for one full-stack developer; production-ready is **about 4 weeks**.

## Key decisions still to confirm

Stack (React · TypeScript · NestJS · MySQL · Vercel) is chosen; the remaining choices are in [docs/STACK-PLAN.md § 17](docs/STACK-PLAN.md#17-decisions-i-need-from-you):

- Which managed MySQL provider? (Vercel cannot host MySQL; foreign keys and CHECK constraints are required)
- PDF via a `pdf-lib` renderer, or relax "Vercel only" for a conversion service?
- Paid Vercel plan confirmed?
- Separate staging database for preview deployments?
- Can every member export/finalize, or only the team lead?
- Should follow-ups carry forward automatically every day?
- English-only UI or Bangla as well?

These are listed with recommended defaults in [docs/ARCHITECTURE.md § 20](docs/ARCHITECTURE.md#20-open-questions-and-assumptions).
