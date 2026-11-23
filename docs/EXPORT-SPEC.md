# Export Specification — CGHQ Daily Report

This document defines the exact document the app must generate. It was derived by unzipping the supplied DOCX and measuring the supplied PDF. Implementation should treat these values as the contract and keep them in one token module.

Reference artifacts:

- `docs/reference/logo-solution-art.png` — default header logo mark (measured layout geometry captured in this spec and `packages/document/src/tokens.ts`)

---

## 1. Units and terminology

| Unit | Meaning |
|---|---|
| **twip** | 1/1440 inch (OOXML layout unit) |
| **EMU** | 1/914400 inch (OOXML image unit) |
| **pt** | 1/72 inch |
| **half-point** | OOXML font size unit; 28 = 14 pt |

The document is built in **twips** for page/table geometry, **half-points** for fonts, and **eighths of a point** for border widths.

---

## 2. Page setup

| Property | Value | Notes |
|---|---|---|
| Paper | **Letter** | 8.5 × 11 in |
| Orientation | **Landscape** | 11 × 8.5 in |
| Page size | **15840 × 12240 twips** | 11 × 8.5 in |
| Top margin | **1440 twips** (1 in) | |
| Bottom margin | **1440 twips** (1 in) | |
| Left margin | **1440 twips** (1 in) | |
| Right margin | **0 twips** | The table's negative indent creates the visual right margin |
| Header distance | **720 twips** (0.5 in) | |
| Footer distance | **720 twips** (0.5 in) | |
| Footer content | **none** | The sample has no footer |
| Page numbers | **none** | |
| Columns | 1 | |

> The supplied DOCX uses `w:pgMar left="1440" right="0"` plus `w:tblInd="-780"`. Replicate this rather than "cleaning it up", so the table lands at the same horizontal position.

---

## 3. Header (repeats on every page)

The header appears on all pages, including continuation pages.

### 3.1 Layout

```text
                  [ logo ]
                  (centered)

              CGHQ Daily Report
              (centered, bold)
```

| Element | Value |
|---|---|
| Logo | `logo-solution-art.png` (team-configurable) |
| Logo size | **1216033 × 679226 EMU** = **1.330 × 0.743 in** |
| Logo alignment | Centered |
| Spacer | One empty paragraph at 3 pt |
| Title | **CGHQ Daily Report** |
| Title font | Times New Roman, **15 pt** (size 30 half-points), **bold** |
| Title alignment | Centered |
| Title spacing | before 240 twips, after 120 twips |
| Header paragraph handling | Centered across the page (the sample uses a negative left indent of 1440 twips to neutralize the 1 in page margin) |

If a team has no logo, omit the logo and spacer and keep the title with reasonable top spacing. The document title is configurable per team.

### 3.2 Logo behavior

- Stored as an immutable team asset (`team_assets`) with MIME type and SHA-256.
- Rendered from bytes, not a public URL, so old snapshots can reference the same asset.
- Max 2 MB; PNG/JPEG/WebP; re-encoded on upload.
- Preserve aspect ratio. The default logo's aspect ratio is ~1.79:1.

---

## 4. Body sequence

The body is a single flow:

1. **Date line**
2. **Main table** (daily work)
3. **Follow-up heading** (if any follow-up items)
4. **Follow-up table**
5. **Prepared By line**

There are no section breaks, no page breaks, and no headings other than the date/follow-up/prepared-by lines. The sample's page breaks are natural pagination.

### 4.1 Date line

| Property | Value |
|---|---|
| Text | `Date: 12 November 2026` |
| `Date:` weight | **Bold** |
| Date weight | Regular |
| Font | Times New Roman, 14 pt |
| Alignment | Left |
| Indent | None (starts at the page content margin) |
| Spacing | Default; approximately 12 pt before the table |
| Month names | Fixed English list, not locale-dependent |

The date line sits **to the right of the table's left edge** because the table uses a -780 twip indent while the paragraph does not. This is visible in the sample and should be preserved.

### 4.2 Day formatting

- Display: `D MMMM YYYY` → `12 November 2026`.
- Do **not** use `toLocaleDateString()` without a fixed locale; server locale can change output.
- File name uses the same components with underscores: `12_November_2026`.
- Leading zero: **not used** by default (`1 November 2026`, not `01`). Configurable.
- Team timezone determines "today"; the `date` value itself is timezone-free.

---

## 5. Main table (daily work)

### 5.1 Geometry

| Property | Value |
|---|---|
| Table width | **14445 twips** (10.03 in) |
| Layout | **Fixed** |
| Table indent | **-780 twips** (`w:tblInd`) |
| Table alignment | Left |
| Table-level borders | None (`nil`) |
| Cell borders | Single, **size 7** (= 7/8 pt ≈ 0.875 pt), color `000000`, all four sides |
| Cell vertical alignment | **Top** |
| Cell horizontal padding | **100 twips left/right**, 0 top/bottom (matches the sample's header/status/by cells) |

#### Column widths (twips)

| # | Column | Width | Inches |
|---|---|---|---|
| 1 | Ser | **675** | 0.469 |
| 2 | Report Category | **2295** | 1.594 |
| 3 | Title | **2040** | 1.417 |
| 4 | Status | **7455** | 5.177 |
| 5 | Task Completed By | **1980** | 1.375 |
| | **Total** | **14445** | **10.031** |

### 5.2 Header row

| Property | Value |
|---|---|
| Row minimum height | **913.95 twips** (≈ 0.635 in) |
| Font | Times New Roman **14 pt bold** |
| Vertical alignment | Top |
| Horizontal alignment | **Centered** for all five headers |
| Repeat on later pages | **No** (the sample uses `tblHeader=0`) |
| Cell borders | All sides, 7/8 pt |

#### Header labels (exact text)

1. `Ser`
2. `Report Category`
3. `Title`
4. `Status`
5. `Task Completed By` — rendered on **two lines** (`Task` / `Completed By`) to match the sample

### 5.3 Body rows

Each **entry** is one table row. The first three cells are vertically merged across all entries in the group.

| Column | Alignment | Content |
|---|---|---|
| Ser | Centered | Group serial number on the first row; empty merged continuation cells below |
| Report Category | Left | Category name on the first row; empty continuation cells |
| Title | Left | Title name on the first row; empty continuation cells |
| Status | Left | Entry text; numbered if the group mode is `numbered` |
| Task Completed By | Centered | Member display name, `As Previous`, or blank |

| Property | Value |
|---|---|
| Row minimum height | **435 twips** (≈ 0.30 in) |
| Font | Times New Roman 14 pt |
| Vertical alignment | Top |
| Borders | All sides, 7/8 pt |
| `cantSplit` | No (matches sample; rows may split if content is very long) |
| Paragraph spacing | 0 before/after; single line spacing for category/title/by |
| Status line spacing | ~**1.38** (331.2 auto) for numbered entries, matching the airy sample |

### 5.4 Merged cells

For a group with *n* entries:

- First entry row:
  - Ser cell: `vMerge = RESTART`, contains `ser`
  - Category cell: `vMerge = RESTART`, contains category
  - Title cell: `vMerge = RESTART`, contains title
- Entries 2..n:
  - Ser/category/title cells: `vMerge = CONTINUE`, empty content
- Status and Completed By are **not** merged; each entry has its own bordered cell.

For a group with **one** entry, render the cells normally (a lone `RESTART` also works, but plain cells are simpler).

The merged cells must have visible outer borders. In OOXML, put borders on both the restart and continue cells; the renderer draws the outer frame.

### 5.5 Ser numbering

- `Ser` restarts at **1** for each report/export.
- It increments across groups (not entries).
- Groups with zero live entries are omitted and do not consume a serial.
- Ser is **derived**, never stored or edited.

### 5.6 Status numbering

The sample's first group uses Word's automatic decimal list:

```xml
<w:numPr>
  <w:ilvl w:val="0"/>
  <w:numId w:val="1"/>
</w:numPr>
<w:ind w:left="360" w:hanging="360"/>
<w:spacing w:line="331.2" w:lineRule="auto"/>
```

Numbering definition:

| Property | Value |
|---|---|
| Format | Decimal |
| Text | `%1.` (e.g., `1.`, `2.`, `10.`) |
| Alignment | Left |
| Indent | left **360 twips**, hanging **360 twips** (0.25 in) |
| Font | Times New Roman 14 pt, not bold, not underlined |

**Scope decision:** each `numbered` group must restart at 1. Do **not** share one Word numbering instance across groups, or numbers continue 14, 15, … into the next group. Generate one numbering reference per group (this is a deliberate interpretation; the sample has only one numbered group).

#### Modes

- `numbered`: prefix each entry with its sequence number in the group.
- `plain`: no prefix; the status text renders as typed. The sample uses plain rows for `Officer: Nil.` / `Sailor: Nil.`.

#### Line breaks

Embedded `\n` in a status is a **line break inside the same numbered paragraph**, not a new numbered item and not a new row. Preserve blank lines as empty paragraphs/breaks.

#### Number spacing

With a 360-twip hanging indent, single-digit numbers leave a gap and two-digit numbers (10–13) sit close to the text — this is exactly what the sample shows. Do not "fix" it by widening the indent if strict fidelity is required; make it a token if the team prefers more space.

### 5.7 Completed By

- Value priority:
  1. member display name (snapshot at export time);
  2. label such as `As Previous`;
  3. empty string.
- Center-aligned in the cell (matching the sample).
- Never render "null"/"undefined".
- Blank is a valid state and renders an empty bordered cell.
- A member's later rename/deactivation does not change a frozen snapshot.

### 5.8 Long content

- Cells wrap at the fixed column width.
- Rows grow vertically.
- A single very long row may split across pages (`cantSplit=false`). If the team prefers, set `cantSplit=true` to push the whole row to the next page.
- URLs/very long tokens should wrap (enable `wordWrap`; avoid horizontal overflow).
- Status text is capped at 4000 characters by validation.

---

## 6. Follow-up Items

### 6.1 Heading

| Property | Value |
|---|---|
| Text | `Follow-up Items:` |
| Font | Times New Roman 14 pt |
| Weight | **Bold** |
| Underline | **Single** |
| Alignment | Left |
| Spacing | Default (a small gap before and after) |
| Conditional | Only render the heading and table if at least one included follow-up exists |

### 6.2 Table geometry

Same outer width and borders as the main table, but slightly different column widths:

| # | Column | Width | Inches |
|---|---|---|---|
| 1 | Ser | **675** | 0.469 |
| 2 | Report Category | **2295** | 1.594 |
| 3 | Title | **2025** | 1.406 |
| 4 | Status | **7410** | 5.146 |
| 5 | Task Completed By | **2040** | 1.417 |
| | **Total** | **14445** | **10.031** |

- Table width: **14445 twips**, fixed, indent **-780 twips**.
- Header row: same five labels, bold, centered, min height 913.95 twips.
- Header repeat: **No** (`tblHeader=0`).
- Body rows: min height **435 twips**; category/title/status left; Ser and Completed By centered.
- No vertical merges in the follow-up table. Each item is a standalone row.
- A multi-paragraph status (e.g., the Hospital Management System item) is preserved inside one cell with blank lines.
- Ser restarts at 1 and increments per follow-up row.

### 6.3 "As Previous"

- Default completed-by value for follow-ups.
- Rendered as plain text in the Completed By cell, centered.
- It is a label, not a reference to yesterday's row. The app copies today's status text explicitly.

---

## 7. Prepared By

| Property | Value |
|---|---|
| Text | `Prepared By: Alex Rahman` |
| `Prepared By:` | **Bold** |
| Name | Regular |
| Font | Times New Roman 14 pt |
| Alignment | Left |
| Spacing | A small gap after the follow-up table (about 12 pt) |
| Source | `daily_reports.prepared_by_name`, copied into the snapshot |

No signature line, no date next to it, no footer.

---

## 8. Document flow and pagination

- One section, one continuous flow.
- The header repeats automatically on every page via the section header.
- The table header row does **not** repeat (matching the sample).
- The follow-up heading and table follow immediately after the main table.
- Pagination is whatever Word/LibreOffice produces from the content. The sample's 3 pages are not a requirement; a 2- or 4-page output is acceptable if all content and layout rules are followed.
- Optional: set `keepNext` on the follow-up heading so it is not orphaned at the bottom of a page. The sample happens to place the heading + header row together at the bottom of page 2. This is cosmetic and not part of the contract.

### 8.1 Guarantees

These are contract terms, not side effects:

| Guarantee | Detail |
|---|---|
| **Exactly two tables** | The document has **at most two** tables: the daily work table, plus the follow-up table when that day has follow-up rows. Nothing else is emitted as a table. If the team chooses to print an empty follow-up section, it is a heading + header row only. |
| **Page count is content-driven** | No hard page breaks, no filler rows, no target page count. 15 entries might be 2 pages; 60 entries might be 5. The sample's 3 pages are an artifact of its content. |
| **Header repeats** | The section header (logo + "CGHQ Daily Report") appears on every page, including the last. |
| **Tables flow, never split oddly** | Rows break across pages naturally; a single row is never split mid-row (`cantSplit`). |
| **The date is per report** | The date line and file name both come from `ReportDTO.report.date`. Rendering the same report tomorrow still says the same date. |
| **Deterministic output** | Same snapshot + same renderer version → same bytes, same page count. |

---

## 9. Typography

| Element | Font | Size | Weight | Underline |
|---|---|---|---|---|
| Header title | Times New Roman | 15 pt | Bold | No |
| Date label | Times New Roman | 14 pt | Bold | No |
| Date value | Times New Roman | 14 pt | Regular | No |
| Table header | Times New Roman | 14 pt | Bold | No |
| Table body | Times New Roman | 14 pt | Regular | No |
| Numbered status | Times New Roman | 14 pt | Regular | No |
| Follow-up heading | Times New Roman | 14 pt | Bold | **Single** |
| Prepared By label | Times New Roman | 14 pt | Bold | No |
| Prepared By name | Times New Roman | 14 pt | Regular | No |

### Font embedding/substitution

- The DOCX requests **Times New Roman** so Word/Google Docs render it natively.
- The PDF container must have that font installed to match exactly.
- If licensing prevents it, LibreOffice substitutes **Liberation Serif**, which is metric-compatible and visually very close. Record the choice and test it.
- For Bangla text in names/statuses, install a Bengali-capable fallback (e.g., Noto Sans Bengali) in the PDF container. Times New Roman does not cover Bengali glyphs.
- Do not use theme fonts; set explicit font names on every run.

---

## 10. File naming

Default pattern:

```text
{file_prefix}_{D}_{MMMM}_{YYYY}.{ext}
```

Example:

```text
Team_Work_Status_12_November_2026.pdf
Team_Work_Status_12_November_2026.docx
```

| Token | Value |
|---|---|
| `file_prefix` | Team setting; default `CGHQ_Team_Work_Status` |
| `D` | Day of month, no leading zero |
| `DD` | Day of month, zero-padded (optional) |
| `MMMM` | Full English month name |
| `YYYY` | Four-digit year |
| `ext` | `docx` or `pdf` |

Rules:

- Sanitize the prefix to `[A-Za-z0-9_-]`; collapse spaces to underscores.
- Store the generated file name in `report_exports.file_name`; do not recompute on re-download.
- Use RFC 5987 `filename*=UTF-8''...` in `Content-Disposition` for safety with non-ASCII prefixes.
- Avoid characters that break WhatsApp/Windows/Android: `\ / : * ? " < > |`.

---

## 11. Document metadata

Set core properties (optional but recommended):

| Property | Value |
|---|---|
| Title | `CGHQ Daily Report` (team document title) |
| Subject | `Daily Work Report` |
| Creator | `CGHQ Team Work Report` |
| Description | `Daily report for 12 November 2026` |
| Keywords | `daily report, CGHQ` |

Do not include internal IDs, user IDs, or API URLs in metadata.

---

## 12. ReportDTO → document mapping

| DTO field | Document location |
|---|---|
| `team.documentTitle` | Header title |
| `team.logoAssetId` | Header image |
| `report.dateLabel` | Date line |
| `groups[].ser` | Ser cell |
| `groups[].category` | Report Category cell |
| `groups[].title` | Title cell |
| `groups[].numbering` | Numbered vs plain status prefix |
| `groups[].entries[].status` | Status cell |
| `groups[].entries[].completedBy` | Task Completed By cell |
| `followups[].ser` | Follow-up Ser |
| `followups[].category` | Follow-up Report Category |
| `followups[].title` | Follow-up Title |
| `followups[].status` | Follow-up Status |
| `followups[].completedBy` | Follow-up Task Completed By |
| `report.preparedBy` | Prepared By line |
| `team.filePrefix` + `report.date` | File name |

---

## 13. Assembly algorithm

```ts
function renderDocument(dto: ReportDTO): Document {
  const doc = new Document({
    creator: "CGHQ Team Work Report",
    title: dto.team.documentTitle,
    sections: [{
      properties: {
        page: {
          size: { width: 15840, height: 12240, orientation: "landscape" },
          margin: { top: 1440, right: 0, bottom: 1440, left: 1440, header: 720, footer: 720 },
        },
      },
      headers: { default: renderHeader(dto.team) },
      children: [
        renderDateLine(dto.report),
        renderSpacer(),
        renderMainTable(dto.groups),
        ...(dto.followups.length ? [
          renderFollowupHeading(),
          renderFollowupTable(dto.followups),
        ] : []),
        renderPreparedBy(dto.report.preparedBy),
      ],
    }],
  });
  return doc;
}

function renderMainTable(groups) {
  // 1. Header row: 5 bold centered cells, "Task\nCompleted By", min height 913.95
  // 2. For each group:
  //    - first row with vMerge RESTART for ser/category/title
  //    - entries[0] in status/by
  //    - remaining rows: vMerge CONTINUE cells + status/by
  //    - status uses a dedicated numbering reference if numbered
  // 3. Fixed widths: [675, 2295, 2040, 7455, 1980]
  // 4. Cell borders size 7, all sides
  // 5. Table indent -780, width 14445, fixed layout
}
```

Important implementation details:

- Create a **new numbering definition per numbered group** so counters restart.
- Do not put multiple entries in one status cell; one entry = one row.
- Use `vMerge` (vertical merge), not horizontal `gridSpan`.
- Set the table cell margins to 100 twips left/right; the renderer may otherwise use Word defaults.
- Put borders on every cell, including `vMerge` continuation cells.
- Do **not** set `tblHeader` (repeat header) for the header row.
- Do not add a page break before follow-ups.
- Keep the header image in the section header, not in the body.
- Use explicit point sizes (28 half-points) and font names on every run.

---

## 14. PDF conversion

Gotenberg 8 endpoint:

```http
POST http://gotenberg:3000/forms/libreoffice/convert
Content-Type: multipart/form-data

files=@Team_Work_Status_12_November_2026.docx
```

Recommended options:

| Option | Value |
|---|---|
| API timeout | 60 s (app timeout 30 s) |
| LibreOffice restart | after 50 conversions |
| PDF/A | false |
| PDF/UA | false |
| Landscape override | **do not set** — the DOCX section is already landscape |
| Page ranges | none |

Verification:

- PDF page size must be **792 × 612 pt** (11 × 8.5 in).
- Text must be selectable (not an image).
- Fonts embedded/subset.
- No extra cover page, no conversion banner.
- First page must contain the logo, title, date, and table header.

If conversion fails:

- Return the DOCX download anyway.
- Show a retry action for PDF with an error code and request ID.
- Alert if failures exceed the threshold.

---

## 15. Golden tests and acceptance

### 15.1 Structural assertions (DOCX XML)

- [ ] `w:pgSz` = 15840 × 12240, `w:orient="landscape"`
- [ ] `w:pgMar` = top 1440, right 0, bottom 1440, left 1440, header 720, footer 720
- [ ] Two tables, each `w:tblW` = 14445 dxa, fixed layout, `w:tblInd` = -780
- [ ] Main grid: 675, 2295, 2040, 7455, 1980
- [ ] Follow-up grid: 675, 2295, 2025, 7410, 2040
- [ ] Cell borders size 7, color 000000
- [ ] Header contains the logo and `CGHQ Daily Report` at 15 pt bold
- [ ] Date line uses bold `Date:` and the exact date string
- [ ] Header row has 5 cells, bold, centered, and `Task` + `Completed By` on two lines
- [ ] Each group's first three cells use `vMerge restart`; continuations use `continue`
- [ ] Numbered group's status paragraphs have numbering and 360 twip hanging indent
- [ ] Plain group's status paragraphs have no numbering
- [ ] Follow-up table has no vertical merges
- [ ] `Follow-up Items:` is bold + underlined
- [ ] `Prepared By:` is bold, name regular
- [ ] File name matches the pattern

### 15.2 Visual checks

- [ ] Side-by-side comparison with exported baseline PDF pages
- [ ] Page orientation and margins look identical
- [ ] Column widths and table left/right edges align
- [ ] Merged group cells span the correct number of rows
- [ ] Numbers 1–13 (or the fixture's count) align like the sample
- [ ] No clipped text; wrapped lines look natural
- [ ] Header repeats on page 2+
- [ ] Follow-up heading/table placement is sensible
- [ ] Prepared By line present
- [ ] PDF opens in Chrome, Edge, Adobe Reader, and WhatsApp preview

### 15.3 Real-world checks

- [ ] Open the DOCX in Microsoft Word — layout intact
- [ ] Open the DOCX in Google Docs — layout intact
- [ ] Send the PDF to WhatsApp on Android — preview and file name correct
- [ ] Share from iOS Safari — file shares successfully
- [ ] Print the PDF — landscape, no clipping
- [ ] Bangla name/status renders (if applicable)

### 15.4 Visual regression in CI

- Pin the Gotenberg image tag and font set.
- Generate the fixture PDF.
- Render pages with `pdfjs-dist` at 144 DPI.
- Compare against **our own** committed baseline with `pixelmatch` (threshold ~0.3%).
- Do not pixel-diff against the supplied PDF in CI; it was produced by a different renderer. Use it for the one-time human sign-off.

---

## 16. Edge cases

| Case | Behavior |
|---|---|
| Group with 1 entry | Render normally (no continuation rows) |
| Group with many entries | Merge first three cells across all; rows may split |
| Empty report | Export disabled with a clear message |
| Blank Completed By | Empty bordered cell |
| Completed By is a label | Render the label, centered |
| Member renamed/deactivated | Snapshot preserves the export-time name |
| Multi-line status | Line breaks inside the same cell/paragraph; no extra row |
| Status with blank lines | Preserve empty lines |
| Leading/trailing whitespace | Trim outer whitespace; preserve internal/newlines |
| Special characters `& < > "` | Handled by the DOCX writer; verify in tests |
| Very long URL/token | Wrap at cell width; no horizontal overflow |
| Bangla/Unicode | Font fallback installed; verify glyphs |
| Emoji | May not render in Times New Roman/PDF; warn or strip in v1 |
| Future date | Blocked by validation |
| Report with no follow-ups | Omit heading + table |
| Follow-up hidden for the day | Omit row; keep master item |
| Zero-padded date preference | Team setting |
| Filename prefix with spaces | Convert to underscores; strip unsafe characters |
| Duplicate export request | Return existing export for the snapshot+format |
| PDF conversion down | DOCX still downloadable; retry PDF |

---

## 17. Configurable tokens (defaults)

| Token | Default | Notes |
|---|---|---|
| `page.size` | Letter landscape | Could support A4 if the team moves |
| `page.margins` | 1440 / 0 / 1440 / 1440 | Twips |
| `font.body` | Times New Roman | Explicit on every run |
| `font.bodySize` | 28 half-points (14 pt) | |
| `font.headerTitleSize` | 30 half-points (15 pt) | |
| `table.mainWidths` | 675 / 2295 / 2040 / 7455 / 1980 | Twips |
| `table.followupWidths` | 675 / 2295 / 2025 / 7410 / 2040 | Twips |
| `table.indent` | -780 | Twips |
| `table.headerMinHeight` | 913.95 | Twips |
| `table.rowMinHeight` | 435 | Twips |
| `border.size` | 7 | Eighths of a point |
| `numbering.scope` | `group` | Alternative: `report` |
| `numbering.indent` | 360 / 360 | Twips, left/hanging |
| `followup.pageBreakBefore` | false | Match sample |
| `repeatHeaderRow` | false | Match sample |
| `date.format` | `D MMMM YYYY` | English months |
| `filename.pattern` | `{prefix}_{D}_{MMMM}_{YYYY}` | |
| `completedBy.followupDefault` | `As Previous` | |
| `preparedBy.label` | `Prepared By:` | |

---

## 18. Known ambiguities in the sample

These are not defects in the spec; they are choices the team should confirm:

1. **Leading zero in the file name** — the sample uses `12`, so no leading zero is assumed.
2. **Numbering scope** — only the Support group is numbered, so per-group restart is assumed. If the team wants continuous numbering across all groups, change `numbering.scope`.
3. **Which groups are numbered** — the app supports per-group `numbered`/`plain`; default new groups to `numbered`.
4. **Header row repetition** — the sample does not repeat it on page 2. The app defaults to matching the sample; repeating is a one-line setting.
5. **Font** — the sample uses Times New Roman; the PDF container's font availability must be decided (licensed TNR vs Liberation Serif).
6. **Pagination** — the sample is 3 pages; the app should not force a page count.
7. **"As Previous"** — treated as a label, not an automatic reference. The report content is copied explicitly each day.
8. **Follow-up history** — the app freezes each day's follow-up rows; editing today's item does not alter prior reports.

---

## 19. Definition of done for the renderer

The renderer is done when:

- [ ] A fixture matching the sample produces a DOCX and PDF.
- [ ] All structural assertions in § 15.1 pass in CI.
- [ ] The team has signed off on a side-by-side visual comparison.
- [ ] The DOCX opens cleanly in Word and Google Docs.
- [ ] The PDF is 792 × 612 pt, text-selectable, with embedded fonts.
- [ ] The file name is exact.
- [ ] The output can be shared to WhatsApp from an Android phone.
- [ ] Repeated generation from the same snapshot produces the same content and layout.
- [ ] A past snapshot re-export does not change when names/categories/follow-ups are edited later.
