# HTTP API — CGHQ Team Work Report

Base URL: `https://report.example.com/api`
All responses are JSON unless noted. All timestamps are ISO 8601 UTC. Dates are `YYYY-MM-DD`.

The app is a Next.js monolith; these endpoints are Route Handlers under `app/api/`. Server Components may read the same repositories directly, but every mutation goes through these handlers (or an equivalent server action) so validation and authorization are centralized.

---

## 1. Conventions

### Authentication

- Auth.js v5 session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`).
- Sign-in is handled by Auth.js (`signIn("credentials", { email, password })`); the session is then available to all API routes.
- Every endpoint except the public ones below requires a valid session.
- Team endpoints additionally require membership with a minimum role.

Public endpoints:

- `GET /api/health`
- `GET /api/invites/:token`
- `POST /api/invites/:token/accept`
- Auth.js routes (`/api/auth/*`)

### Request rules

- `Content-Type: application/json` for JSON bodies.
- Unknown fields are rejected by Zod (`.strict()`), except where noted.
- Maximum JSON body: 64 KB; multipart logo: 2 MB.
- All IDs are UUID strings.
- Use `If-Match: <version>` for updates to versioned resources.
- Use `Idempotency-Key: <uuid>` on `POST` entry/export requests (optional now, recommended for mobile retries).

### Team scoping

- Non-report resources include the team: `/api/teams/:teamId/...`.
- Report resources include the report ID: `/api/reports/:reportId/...`; the server resolves the team and checks membership.
- A caller who is not a member receives `404 NOT_FOUND` (not `403`) to avoid leaking team existence.

### Pagination

- Query params: `cursor` (opaque), `limit` (1–100, default 30).
- Response: `{ "items": [...], "nextCursor": "..." | null }`.

### Error object

```json
{
  "error": {
    "code": "REPORT_FINALIZED",
    "message": "This report is finalized. Ask an admin to reopen it.",
    "requestId": "req_01JABCDEF",
    "details": null
  }
}
```

Common codes:

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `UNAUTHENTICATED` | No/expired session |
| 403 | `FORBIDDEN` | Role not allowed |
| 404 | `NOT_FOUND` | Resource or team not found |
| 409 | `CONFLICT` | Version mismatch |
| 409 | `REPORT_FINALIZED` | Report is locked |
| 409 | `DUPLICATE` | Unique constraint (e.g., category name) |
| 422 | `VALIDATION_FAILED` | Zod validation; `details` contains fields |
| 429 | `RATE_LIMITED` | Retry later; `Retry-After` header |
| 502 | `EXPORT_FAILED` | PDF conversion failure |
| 500 | `INTERNAL` | Unexpected error |

### Rate limits (defaults)

| Area | Limit |
|---|---|
| Login | 5/min/IP + account backoff |
| Invite accept | 10/min/IP |
| Entry create/update | 60/min/user |
| Export generation | 10/hour/user |
| Downloads | 120/min/user |
| General API | 300/min/user |

---

## 2. Session and profile

### `GET /api/me`

Returns the current user and their teams.

```json
{
  "user": {
    "id": "usr_01J...",
    "name": "Alex Rahman",
    "email": "alex@example.com"
  },
  "teams": [
    {
      "id": "tm_01J...",
      "name": "CGHQ",
      "slug": "cghq",
      "role": "owner",
      "memberId": "mem_01J..."
    }
  ]
}
```

### `PATCH /api/me`

```json
{ "name": "Alex Rahman" }
```

### `POST /api/me/password`

```json
{ "currentPassword": "...", "newPassword": "..." }
```

Increments `session_version` and invalidates other sessions.

---

## 3. Teams

### `GET /api/teams`

Returns teams the caller belongs to. Same shape as in `/api/me`.

### `POST /api/teams`

Creates a team; the caller becomes owner.

```json
{
  "name": "CGHQ",
  "slug": "cghq",
  "timezone": "Asia/Dhaka",
  "documentTitle": "CGHQ Daily Report",
  "filePrefix": "CGHQ_Team_Work_Status",
  "seedSampleDictionary": true
}
```

`seedSampleDictionary` creates the default categories/titles (Support, Communication, Physically Visit, Mobile Apps, Bill). Default `true`.

Response: `201` with team + membership.

### `GET /api/teams/:teamId`

Team settings and members. Requires viewer.

```json
{
  "team": {
    "id": "tm_01J...",
    "name": "CGHQ",
    "slug": "cghq",
    "documentTitle": "CGHQ Daily Report",
    "filePrefix": "CGHQ_Team_Work_Status",
    "timezone": "Asia/Dhaka",
    "logoUrl": "/api/teams/tm_01J.../logo",
    "preparedByDefault": "Alex Rahman",
    "membersCanExport": true,
    "membersCanAddDictionary": true,
    "followupsEnabled": true,
    "maxMembers": 10
  },
  "members": [
    {
      "id": "mem_01J...",
      "userId": "usr_01J...",
      "displayName": "Samir",
      "role": "member",
      "isActive": true,
      "sortOrder": 100
    }
  ],
  "myRole": "owner"
}
```

### `PATCH /api/teams/:teamId`

Admin. Partial update:

```json
{
  "documentTitle": "CGHQ Daily Report",
  "filePrefix": "CGHQ_Team_Work_Status",
  "timezone": "Asia/Dhaka",
  "preparedByDefault": "Alex Rahman",
  "membersCanExport": true,
  "membersCanAddDictionary": true,
  "followupsEnabled": true
}
```

`name`/`slug` changes are owner-only.

### Logo

- `POST /api/teams/:teamId/logo` — multipart field `file` (PNG/JPEG/WebP, ≤ 2 MB).
- `GET /api/teams/:teamId/logo` — streams the current logo (auth required).
- `DELETE /api/teams/:teamId/logo` — removes the logo (falls back to text-only header).

Response to upload:

```json
{
  "assetId": "ast_01J...",
  "url": "/api/teams/tm_01J.../logo",
  "width": 291,
  "height": 174,
  "sha256": "..."
}
```

---

## 4. Members and invites

### `GET /api/teams/:teamId/members`

Returns active and inactive members (admins see all; members see active only).

### `POST /api/teams/:teamId/invites`

Admin. Creates a one-time invite link.

```json
{
  "role": "member",
  "email": "samir@example.com",
  "expiresInDays": 7
}
```

```json
{
  "id": "inv_01J...",
  "inviteUrl": "https://report.example.com/invite/8f3c...",
  "role": "member",
  "expiresAt": "2026-11-21T10:00:00.000Z"
}
```

The raw token appears only in this response; only its SHA-256 hash is stored.

### `GET /api/invites/:token` (public)

```json
{
  "teamName": "CGHQ",
  "role": "member",
  "email": "samir@example.com",
  "expiresAt": "2026-11-21T10:00:00.000Z",
  "isValid": true
}
```

### `POST /api/invites/:token/accept` (public)

For a new account:

```json
{
  "name": "Samir",
  "email": "samir@example.com",
  "password": "correct horse battery staple"
}
```

For an already signed-in user (joining an additional team), send an empty body with the session cookie.

Response: `201` with `{ "teamId", "memberId", "role" }` and a session if a new user was created.

### `PATCH /api/teams/:teamId/members/:memberId`

Admin.

```json
{ "displayName": "Samir", "role": "member", "isActive": true, "sortOrder": 200 }
```

Rules:

- Cannot demote/deactivate the last owner.
- Cannot change your own role from owner unless another owner exists.
- Deactivation preserves historical attribution.

### `DELETE /api/teams/:teamId/members/:memberId`

Admin. Soft-deactivates; same as `isActive: false`.

### `PUT /api/teams/:teamId/members/order`

Admin. Batch reorder for member chips.

```json
{ "memberIds": ["mem_1", "mem_2", "mem_3"] }
```

---

## 5. Dictionary (categories and titles)

### `GET /api/teams/:teamId/categories`

```json
{
  "categories": [
    {
      "id": "cat_support",
      "name": "Support",
      "position": 100,
      "isActive": true,
      "titles": [
        {
          "id": "tit_daily_calls",
          "name": "Daily Calls from User and Desk Support",
          "position": 100,
          "defaultStatus": null,
          "isActive": true
        }
      ]
    }
  ]
}
```

### `POST /api/teams/:teamId/categories`

Member (if `membersCanAddDictionary`, otherwise admin).

```json
{ "name": "Support", "position": 100 }
```

### `PATCH /api/teams/:teamId/categories/:categoryId`

Admin. Rename, reorder, deactivate.

```json
{ "name": "Support", "position": 100, "isActive": true }
```

### `POST /api/teams/:teamId/titles`

Member (if allowed).

```json
{
  "categoryId": "cat_support",
  "name": "Daily Calls from User and Desk Support",
  "position": 100,
  "defaultStatus": null
}
```

### `PATCH /api/teams/:teamId/titles/:titleId`

Admin. Renaming/moving does not alter past snapshots.

```json
{
  "categoryId": "cat_support",
  "name": "Daily Calls from User and Desk Support",
  "position": 100,
  "defaultStatus": "Phone call handled. Total: ",
  "isActive": true
}
```

### `PUT /api/teams/:teamId/dictionary/order`

Admin. Batch reorder categories and titles.

```json
{
  "categories": [
    { "id": "cat_support", "position": 100 },
    { "id": "cat_comm", "position": 200 }
  ],
  "titles": [
    { "id": "tit_daily_calls", "categoryId": "cat_support", "position": 100 },
    { "id": "tit_new_comer", "categoryId": "cat_comm", "position": 100 }
  ]
}
```

Deletion is always deactivation; historical reports keep working.

---

## 6. Reports and entries

### `GET /api/teams/:teamId/reports/:date`

Get-or-create the day's draft and return the full view. The server:

- validates the date (not in the future in the team timezone);
- creates the report if missing, with `prepared_by_name` defaulted;
- seeds `report_followups` from active master items if this is a new report;
- returns groups with derived Ser, entries, and follow-ups.

**Finalized reports are read from the latest snapshot**, not the live tables. This keeps member/category/title/follow-up renames from changing the day's record. The response shape is the same; edit flags are `false`. Reopen the report to return to live data.

`PUT /reports/:reportId/followups` and `.../sync` are draft-only; finalized reports must be reopened first.

```json
{
  "team": {
    "id": "tm_01J...",
    "name": "CGHQ",
    "documentTitle": "CGHQ Daily Report",
    "filePrefix": "CGHQ_Team_Work_Status",
    "timezone": "Asia/Dhaka",
    "logoUrl": "/api/teams/tm_01J.../logo"
  },
  "report": {
    "id": "rep_01J...",
    "date": "2026-11-12",
    "dateLabel": "12 November 2026",
    "status": "draft",
    "revision": 0,
    "preparedByName": "Alex Rahman",
    "finalizedAt": null,
    "updatedAt": "2026-11-12T10:12:00.000Z",
    "canEdit": true,
    "canFinalize": true,
    "canExport": true
  },
  "groups": [
    {
      "id": "grp_01J...",
      "ser": 1,
      "category": { "id": "cat_support", "name": "Support" },
      "title": { "id": "tit_daily_calls", "name": "Daily Calls from User and Desk Support" },
      "numberingMode": "numbered",
      "position": 100,
      "entries": [
        {
          "id": "ent_01J...",
          "statusText": "Conducted user onboarding session for leave workflow.",
          "completedBy": { "memberId": "mem_samir", "label": null, "displayName": "Samir" },
          "position": 100,
          "version": 1,
          "canEdit": true,
          "createdAt": "2026-11-12T04:20:00.000Z",
          "updatedAt": "2026-11-12T04:20:00.000Z"
        }
      ]
    }
  ],
  "followups": [
    {
      "id": "rf_01J...",
      "masterItemId": "fup_01J...",
      "ser": 1,
      "category": { "id": "cat_mobile", "name": "Mobile Apps" },
      "title": { "id": "tit_messaging", "name": "Messaging Mobile Apps" },
      "statusText": "Coordination is ongoing for scope confirmation and app delivery scheduling.",
      "completedBy": "As Previous",
      "position": 100,
      "isIncluded": true
    }
  ],
  "summary": {
    "entryCount": 13,
    "groupCount": 1,
    "byMember": [
      { "memberId": "mem_samir", "displayName": "Samir", "count": 6 },
      { "memberId": "mem_nadia", "displayName": "Nadia", "count": 6 },
      { "memberId": "mem_alex", "displayName": "Alex", "count": 1 }
    ]
  }
}
```

### `GET /api/teams/:teamId/reports`

History.

Query: `from`, `to`, `status`, `memberId`, `cursor`, `limit`.

```json
{
  "items": [
    {
      "id": "rep_01J...",
      "date": "2026-11-12",
      "status": "finalized",
      "entryCount": 18,
      "memberCount": 3,
      "revision": 1,
      "preparedByName": "Alex Rahman",
      "lastExportAt": "2026-11-12T12:30:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `POST /api/teams/:teamId/reports/:date/entries`

Add an entry. Ensures report, category/title, and group in one transaction.

```json
{
  "category": { "id": "cat_support" },
  "title": { "id": "tit_daily_calls" },
  "statusText": "Conducted user onboarding session for leave workflow.",
  "completedBy": { "memberId": "mem_samir" }
}
```

Inline creation is allowed if the caller has permission:

```json
{
  "category": { "name": "Support" },
  "title": { "name": "Daily Calls from User and Desk Support" },
  "statusText": "Phone call handled. Total: 13.",
  "completedBy": { "label": "As Previous" }
}
```

Completed-by forms:

- `{ "memberId": "mem_..." }`
- `{ "label": "As Previous" }`
- `null` (blank cell)

Response: `201`

```json
{
  "entry": {
    "id": "ent_01J...",
    "groupId": "grp_01J...",
    "statusText": "Conducted user onboarding session for leave workflow.",
    "completedBy": { "memberId": "mem_samir", "label": null, "displayName": "Samir" },
    "position": 200,
    "version": 1,
    "canEdit": true
  },
  "group": {
    "id": "grp_01J...",
    "category": { "id": "cat_support", "name": "Support" },
    "title": { "id": "tit_daily_calls", "name": "Daily Calls from User and Desk Support" },
    "numberingMode": "numbered",
    "position": 100
  },
  "report": {
    "id": "rep_01J...",
    "status": "draft",
    "revision": 0
  }
}
```

Idempotency: send `Idempotency-Key`; a repeat returns the original entry with `200`.

### `PATCH /api/reports/:reportId/entries/:entryId`

Author or admin; report must be draft. Requires `If-Match` with the entry version.

```json
{
  "statusText": "Conducted user onboarding session for leave workflow.",
  "completedBy": { "memberId": "mem_samir" }
}
```

Response: updated entry with `version + 1`.

`409 CONFLICT` returns the current entry so the client can merge:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "This entry was changed by someone else.",
    "requestId": "req_...",
    "details": { "current": { "id": "ent_...", "version": 3, "statusText": "..." } }
  }
}
```

### `DELETE /api/reports/:reportId/entries/:entryId`

Author or admin; draft only. Soft delete. Response `204`.

### `PATCH /api/reports/:reportId/groups/reorder`

Admin; draft only.

```json
{ "groupIds": ["grp_1", "grp_2", "grp_3"] }
```

### `PATCH /api/reports/:reportId/groups/:groupId`

Admin; draft only. Change numbering mode.

```json
{ "numberingMode": "plain" }
```

### `PATCH /api/reports/:reportId/entries/reorder`

Admin; draft only. Reorder within a group.

```json
{ "groupId": "grp_1", "entryIds": ["ent_3", "ent_1", "ent_2"] }
```

### `POST /api/reports/:reportId/finalize`

Admin. Locks the report and creates a snapshot revision.

```json
{ "preparedByName": "Alex Rahman" }
```

`preparedByName` is optional; omit to keep the current value.

Response:

```json
{
  "report": {
    "id": "rep_01J...",
    "status": "finalized",
    "revision": 1,
    "finalizedAt": "2026-11-12T12:20:00.000Z"
  },
  "snapshot": { "id": "snp_01J...", "revision": 1, "contentHash": "..." }
}
```

### `POST /api/reports/:reportId/reopen`

Admin. Reason required; audit logged.

```json
{ "reason": "Forgot to add the afternoon QC calls." }
```

Response: report status draft, revision unchanged until the next finalize/export.

### `GET /api/reports/:reportId/preview`

Returns the `ReportDTO` used by the preview and renderer. Same shape as the `GET /reports/:date` response, without edit metadata. Requires viewer.

---

## 7. Follow-ups

### `GET /api/teams/:teamId/followups`

Master list.

```json
{
  "items": [
    {
      "id": "fup_01J...",
      "category": { "id": "cat_mobile", "name": "Mobile Apps" },
      "title": { "id": "tit_messaging", "name": "Messaging Mobile Apps" },
      "statusText": "They will do it in this financial year...",
      "completedBy": "As Previous",
      "position": 100,
      "isActive": true,
      "version": 4,
      "updatedAt": "2026-11-12T09:00:00.000Z"
    }
  ]
}
```

### `POST /api/teams/:teamId/followups`

Member. Create a master item.

```json
{
  "categoryId": "cat_mobile",
  "titleId": "tit_messaging",
  "statusText": "They will do it in this financial year...",
  "completedBy": { "label": "As Previous" },
  "position": 100
}
```

### `PATCH /api/followups/:followupId`

Admin. Requires `If-Match` version.

```json
{
  "statusText": "The work order has been issued.",
  "completedBy": { "label": "As Previous" },
  "isActive": true
}
```

### `DELETE /api/followups/:followupId`

Admin. Deactivates (does not delete snapshots).

### `PUT /api/reports/:reportId/followups`

Save the day's follow-up rows. Members may update status text (team setting); admins may add/remove rows.

```json
{
  "items": [
    {
      "id": "rf_01J...",
      "statusText": "The Proposal has been submitted.",
      "completedBy": "As Previous",
      "isIncluded": true,
      "position": 100,
      "syncMaster": true
    }
  ]
}
```

- `syncMaster: true` (default) writes the same status/completed-by to the master item if the row is still linked.
- Past `report_followups` rows are never changed by this call.
- To add an ad-hoc row for today only, omit `id` and provide:

```json
{
  "category": { "name": "Bill" },
  "title": { "name": "Ad-hoc follow-up" },
  "statusText": "Waiting for approval.",
  "completedBy": "As Previous",
  "isIncluded": true,
  "syncMaster": false
}
```

### `POST /api/reports/:reportId/followups/sync`

Admin. Copies any active master items missing from this day's snapshot. Existing rows are untouched. Returns the added rows.

---

## 8. Exports and downloads

### `POST /api/reports/:reportId/exports`

Admin (or member if `membersCanExport`). Synchronous.

```json
{
  "format": "pdf",
  "finalize": false
}
```

- `format`: `docx` or `pdf`.
- `finalize`: if `true` and the report is draft, finalize it first (admin only).
- If the report is finalized, the latest snapshot is reused.
- If a matching export already exists for the snapshot+format, it is returned instead of regenerated.

Response: `201` (or `200` on reuse)

```json
{
  "export": {
    "id": "exp_01J...",
    "format": "pdf",
    "fileName": "Team_Work_Status_12_November_2026.pdf",
    "bytes": 111271,
    "sha256": "…",
    "snapshotRevision": 1,
    "downloadUrl": "/api/exports/exp_01J.../download",
    "createdAt": "2026-11-12T12:25:00.000Z",
    "createdBy": "Alex Rahman"
  },
  "share": {
    "mime": "application/pdf",
    "title": "CGHQ Daily Report",
    "caption": "CGHQ Daily Report — 12 November 2026"
  }
}
```

Errors:

- `422 EMPTY_REPORT` if there are no live entries.
- `403 FORBIDDEN` if the member lacks export permission.
- `409 REPORT_FINALIZED` if `finalize: true` and the report is already finalized by someone else? No — return the existing snapshot instead. This code is for conflicting state changes.
- `502 EXPORT_FAILED` with `details.stage = "gotenberg"` and a request ID.

### `GET /api/reports/:reportId/exports`

List exports for the report.

```json
{
  "items": [
    {
      "id": "exp_01J...",
      "format": "pdf",
      "fileName": "Team_Work_Status_12_November_2026.pdf",
      "bytes": 111271,
      "snapshotRevision": 1,
      "downloadUrl": "/api/exports/exp_01J.../download",
      "createdAt": "2026-11-12T12:25:00.000Z",
      "createdBy": "Alex Rahman"
    }
  ]
}
```

### `GET /api/exports/:exportId/download`

Streams the file. Requires team membership.

Headers:

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="Team_Work_Status_12_November_2026.pdf"; filename*=UTF-8''Team_Work_Status_12_November_2026.pdf
Cache-Control: private, max-age=0, must-revalidate
```

Increments `download_count` and writes an audit event (best effort).

For Web Share, the client fetches this URL as a blob:

```ts
const res = await fetch(export.downloadUrl, { credentials: "include" });
const blob = await res.blob();
const file = new File([blob], export.fileName, { type: "application/pdf" });
if (navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file], title: "CGHQ Daily Report", text: caption });
}
```

### `POST /api/exports/:exportId/share-log`

Optional. Records that the user tapped Share (for audit/analytics). Body `{ "channel": "whatsapp" | "system" | "download" }`.

---

## 9. Statistics

### `GET /api/teams/:teamId/stats?from=2026-11-01&to=2026-11-30`

Viewer.

```json
{
  "range": { "from": "2026-11-01", "to": "2026-11-30" },
  "totals": { "reports": 12, "entries": 214, "finalized": 10 },
  "byMember": [
    { "memberId": "mem_samir", "displayName": "Samir", "entries": 96 },
    { "memberId": "mem_nadia", "displayName": "Nadia", "entries": 84 },
    { "memberId": "mem_alex", "displayName": "Alex", "entries": 34 }
  ],
  "byCategory": [
    { "categoryId": "cat_support", "name": "Support", "entries": 140 }
  ]
}
```

Counts only live entries from draft/finalized reports. No text content.

---

## 10. Audit

### `GET /api/teams/:teamId/audit`

Admin. Cursor pagination.

Query: `from`, `to`, `action`, `actorId`, `entityType`, `cursor`, `limit`.

```json
{
  "items": [
    {
      "id": 9182,
      "action": "report.finalize",
      "entityType": "daily_report",
      "entityId": "rep_01J...",
      "actor": { "userId": "usr_01J...", "name": "Alex Rahman" },
      "metadata": { "revision": 1, "entryCount": 18 },
      "ip": "203.0.113.10",
      "createdAt": "2026-11-12T12:20:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Audited actions (non-exhaustive):

- `entry.create`, `entry.update`, `entry.delete`, `entry.reorder`
- `report.finalize`, `report.reopen`
- `followup.create`, `followup.update`, `followup.deactivate`, `report_followup.save`
- `member.invite`, `member.accept`, `member.role_change`, `member.deactivate`
- `category.create/update`, `title.create/update`
- `team.settings_update`, `team.logo_update`
- `export.create`, `export.download`
- `auth.login`, `auth.password_change`

Metadata must not contain full report text for entry updates (store changed field names and a short diff, not the whole content).

---

## 11. Health

### `GET /api/health` (public)

```json
{
  "status": "ok",
  "version": "1.0.0",
  "time": "2026-11-14T08:00:00.000Z",
  "checks": {
    "database": "ok",
    "gotenberg": "ok",
    "disk": "ok"
  }
}
```

Returns `503` if any critical dependency is down. Do not expose hostnames, versions of dependencies, or stack traces.

---

## 12. Example end-to-end flow

1. `POST /api/auth/...` (Auth.js) → session cookie.
2. `GET /api/me` → user + teams.
3. `GET /api/teams/tm_01J.../reports/2026-11-12` → draft + groups + seeded follow-ups.
4. `POST /api/teams/tm_01J.../reports/2026-11-12/entries` → add 3 entries.
5. `PATCH /api/reports/rep_01J.../groups/reorder` → put Support first.
6. `PUT /api/reports/rep_01J.../followups` → update today's follow-up text.
7. `POST /api/reports/rep_01J.../finalize` → revision 1.
8. `POST /api/reports/rep_01J.../exports` `{ "format": "pdf" }` → export.
9. `GET /api/exports/exp_01J.../download` → blob → Web Share → WhatsApp.
10. `GET /api/teams/tm_01J.../reports?from=2026-11-01&to=2026-11-30` → history.

---

## 13. Data shapes (TypeScript)

```ts
type UUID = string;
type ISODate = string;      // "2026-11-12"
type ISODateTime = string;  // "2026-11-12T12:25:00.000Z"

type Role = "owner" | "admin" | "member" | "viewer";
type ReportStatus = "draft" | "finalized";
type NumberingMode = "numbered" | "plain";
type ExportFormat = "docx" | "pdf";

type CompletedBy =
  | { memberId: UUID; label: null; displayName: string }
  | { memberId: null; label: string; displayName: string }
  | null;

type Member = {
  id: UUID;
  userId: UUID;
  displayName: string;
  role: Role;
  isActive: boolean;
  sortOrder: number;
};

type Entry = {
  id: UUID;
  statusText: string;
  completedBy: CompletedBy;
  position: number;
  version: number;
  canEdit: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

type Group = {
  id: UUID;
  ser: number;
  category: { id: UUID; name: string };
  title: { id: UUID; name: string };
  numberingMode: NumberingMode;
  position: number;
  entries: Entry[];
};

type FollowupRow = {
  id: UUID;
  masterItemId: UUID | null;
  ser: number;
  category: { id: UUID; name: string };
  title: { id: UUID; name: string };
  statusText: string;
  completedBy: string;
  position: number;
  isIncluded: boolean;
};

type ReportView = {
  team: {
    id: UUID;
    name: string;
    documentTitle: string;
    filePrefix: string;
    timezone: string;
    logoUrl: string | null;
  };
  report: {
    id: UUID;
    date: ISODate;
    dateLabel: string;
    status: ReportStatus;
    revision: number;
    preparedByName: string;
    finalizedAt: ISODateTime | null;
    updatedAt: ISODateTime;
    canEdit: boolean;
    canFinalize: boolean;
    canExport: boolean;
  };
  groups: Group[];
  followups: FollowupRow[];
  summary: {
    entryCount: number;
    groupCount: number;
    byMember: Array<{ memberId: UUID; displayName: string; count: number }>;
  };
};
```

---

## 14. Compatibility notes

- API version 1 is intentionally small; breaking changes get `/api/v2`.
- The export endpoint is synchronous for v1 (≤ 10 s typical). If the team grows, switch to `202 Accepted` + polling `GET /api/exports/:id` without changing the response fields (add `status`).
- `GET /reports/:date` is get-or-create for convenience. If a strict read-only GET is required later, add `?create=false` and a separate `PUT` endpoint.
- File streaming is same-origin only; no public signed URLs in v1. This keeps exports private to team members.
