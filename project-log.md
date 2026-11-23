# Daily Work Log — Project Log & Agent Handoff Guide

## 1. Project Overview
- **Repository:** `https://github.com/mahmuda-mahmi/work-log.git` (branch: `main`)
- **Production URL (Vercel):** `https://worklog-team.vercel.app`
- **Stack:**
  - **Monorepo:** `pnpm` workspace (`packages/contracts`, `packages/document`, `apps/api`, `apps/web`).
  - **Frontend (`apps/web`):** React 19 + Vite 7 + React Router 7 + TanStack Query v5 + Tailwind CSS v4 + pure React shadcn-style UI primitives (`apps/web/src/components/ui/`, **no** `@radix-ui/*` dependencies).
  - **Backend (`apps/api`):** NestJS 11 + Express (deployed on Vercel Serverless via `api/index.ts` -> `apps/api/api/index.ts`) + PostgreSQL (`pg`) raw parameterized SQL + Argon2id passwords + HTTP-only `sid` session cookie.
  - **Document Engine (`packages/document`):** Deterministic DOCX (`docx`) and PDF (`pdf-lib` with `StandardFonts.TimesRoman` / `TimesRomanBold`) renderer producing **A4 Landscape** (`841.89 × 595.28 pt` / `16838 × 11906 twips`) reports.
  - **Shared Contracts (`packages/contracts`):** Zod schemas & TypeScript DTOs shared between API and Web.

---

## 2. Key Architectural & UX Rules (Must Follow)
1. **Plan First:** Always analyze production constraints (remote DB latency, bundling, loading states, UX edge cases) and present a clear plan before implementing.
2. **UI & Design System (`apps/web`):**
   - Brand palette: **Solution Art Orange** (`#f97316` / `bg-primary`), **Carbon Black** (`#09090b` / `bg-zinc-950`), and **Crisp White** (`#ffffff`).
   - **Button text contrast rule:** Always use **white text** (`text-white` / `#ffffff`) on both **orange** buttons (`variant="default"`) and **black** buttons (`variant="dark"`). Never use black text on orange buttons or orange text on black buttons.
   - **No native unstyled controls:** Always use the custom shadcn-style primitives in `apps/web/src/components/ui/` (`Button`, `Select`, `Input`, `Textarea`, `Checkbox`, `Badge`, `Card`, `Alert`, `ConfirmDialog`, `Skeleton`). Do not install `@radix-ui/*`.
3. **SQL Hygiene (`apps/api`):**
   - Automated test `apps/api/src/common/phase2.test.ts` enforces that **no SQL file in `apps/api/src/db/sql/` may contain `SELECT *` or `${` template interpolation**. Always list explicit column names and use `?` placeholders.
4. **Document Export Format (`packages/document`):**
   - Paper size: **A4 Landscape** (`widthTwips: 16838`, `heightTwips: 11906`, `widthPt: 841.89`, `heightPt: 595.28`).
   - Font family & size: **Times New Roman** (`TimesRoman` / `TimesRomanBold` in PDF) across both DOCX and PDF; **15 pt bold** for the heading (`CGHQ Daily Report`) and **14 pt** for all body/table text.
   - Header spacing: `30 pt` gap in PDF and `before: 240, after: 120` twips with a `3 pt` spacer paragraph in DOCX.
   - Company Logo: Always use the bundled Solution Art company logo (`getDefaultLogoBytes()` / `/default-logo.png`) in both live preview and PDF/DOCX exports.
   - Status column: No automatic `1.`, `2.`, `3.` prefixes in the exported `Status` column; Category and Title names are automatically sentence/first-letter capitalized (`support` → `Support`) in `buildDocumentModel`.

---

## 3. Completed Work Log (Chronological Summary)

### A. Core Workspace, Daily Work Table & Entry Composer
- **Canonical Report Sections (`apps/api/src/domain/defaults.ts`):**
  1. `Support` — `Daily Calls from User and Desk Support`
  2. `Communication` — `New Comer`
  3. `Communication` — `Over the Phone`
  4. `Physically Visit` — `Department Visit for Use of CGRPMS and Any Other Reason`
- **Entry Composer (`apps/web/src/components/EntryComposer.tsx`):**
  - Merges active `report.groups` (`tableSections`) with the team dictionary so all table categories/titles (including `Support`) are always selectable in the dropdowns, ordered with table sections first.
  - When `Report Category` is `Communication`, displays a compact (`w-[125px] shrink-0`) `Sailor / Officer` `<Select>` right beside the `Status` textarea and saves the entry as `Sailor: <text>` or `Officer: <text>`.
  - Preserves multi-line status text as a **single** status entry instead of splitting on newlines.
  - `Task Completed By` is **optional** (no member pre-selected by default; submitting with none selected leaves `Completed By` blank).
  - Uses **optimistic updates** (`onMutate`) so clicking **+ Add Entry** updates the table and clears the form immediately.
- **Daily Work Table (`apps/web/src/screens/ReportScreen.tsx`):**
  - Compact icon-only action buttons (`size="icon-xs"`) for group Edit/Delete and entry Move Up, Move Down, Edit, Move to Follow-up, and Delete, plus concise `+ Add` buttons.

### B. Bidirectional Follow-up ↔ Daily Work Movement & Deduplication
- **Daily Work → Follow-ups (`POST /api/teams/:teamId/reports/:date/entries/:entryId/move-to-followup`):**
  - Atomically inserts (or deduplicates) the entry into `followup_items` AND soft-deletes the `work_entry` from the daily report in a single transaction, with optimistic UI removal in `ReportScreen.tsx`.
- **Follow-ups → Daily Work (`POST /api/teams/:teamId/followups/:followupId/move-to-daily`):**
  - Allows updating the follow-up's status text inline in `FollowupsScreen.tsx`, inserts the entry into today's Daily Work Report, and archives the follow-up item in one transaction.
- **Automatic Deduplication (`apps/api/src/db/repositories/followups.repo.ts`):**
  - `deduplicateTeamFollowups` automatically cleans up duplicate active follow-up rows matching `(category_id, title_id, LOWER(TRIM(status_text)))`, and `findExistingActiveFollowup` prevents new duplicates.

### C. Performance, Skeleton UI & Landing Page
- **Landing Page (`apps/web/src/screens/LandingScreen.tsx`):**
  - Mounted at `/` with zero blocking API calls for instant first paint; aware of cached session state to show **Sign Out** when signed in or **Sign In** when signed out.
  - Today's Work Log lives at `/today`.
- **Bundled Workspace Endpoint (`GET /api/teams/:teamId/reports/workspace`):**
  - Fetches `report`, `dictionary`, and `members` in parallel (`Promise.all`) behind a single HTTP request and a single `SessionGuard` check.
- **Local Hydration & Skeletons (`apps/web/src/components/WorkspaceSkeleton.tsx`):**
  - Hydrates session (`cghq:session`) and workspace (`cghq:workspace:...`) from `localStorage` via TanStack Query `placeholderData` for instant rendering on return visits, with full-page skeletons (`WorkspaceShellSkeleton`, `ReportPageSkeleton`) for cold visits.
  - In-memory seeding caches in `apps/api/src/domain/defaults.ts` eliminate repeated `COUNT(*)` DB round-trips on warm serverless instances.

### D. Authentication: Google OAuth 2.0 & Email-Free Team Join Link + Leader Approval
- **Google OAuth (`apps/api/src/modules/auth/auth.controller.ts`):**
  - `GET /api/auth/google` and `GET /api/auth/google/callback` support signing in, creating accounts, and submitting team join requests with Google.
  - **Required Vercel Env Vars for Google OAuth:**
    - `GOOGLE_CLIENT_ID`
    - `GOOGLE_CLIENT_SECRET`
    - Authorized Redirect URI in Google Cloud Console: `https://worklog-team.vercel.app/api/auth/google/callback`
- **Team Join Link & Approval Workflow:**
  - Team Lead clicks **Generate Join Link** in `SettingsScreen.tsx` (`POST /api/teams/:teamId/join-link`) — no email input required.
  - Teammates open `/join/:token` (`JoinTeamScreen.tsx`) and submit a join request via Google or Name + Email + Password (`POST /api/auth/join-requests`).
  - Team Lead approves or rejects pending requests in `SettingsScreen.tsx` (`GET /api/teams/:teamId/join-requests`, `POST .../approve`, `POST .../reject`).

---

## 4. Verification & Deployment Checklist for Future Agents
Before committing or pushing any change, always run:
```powershell
pnpm build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm typecheck; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm test
```
All 4 workspace packages (`@cghq/contracts`, `@cghq/document`, `@cghq/api`, `@cghq/web`) must compile and pass all tests before pushing to `origin main`. Vercel automatically deploys `main` on push.
