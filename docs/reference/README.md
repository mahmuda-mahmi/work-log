# Reference files

Document layout measurements and the extracted header logo mark used for report styling.

| File | Description |
|---|---|
| `sample-report.docx` | The supplied Word document (source of truth for layout). |
| `sample-report.pdf` | The supplied 3-page PDF (the visual target). |
| `sample-page-1.png` | Rendered page 1 of the PDF at 144 DPI. |
| `sample-page-2.png` | Rendered page 2. |
| `sample-page-3.png` | Rendered page 3. |
| `logo-solution-art.png` | Logo extracted from `word/media/image1.png` inside the DOCX. |

## What was measured

- Page: Letter landscape, 15840 × 12240 twips (11 × 8.5 in).
- Margins: top/bottom/left 1440 twips, right 0; header/footer 720.
- Header: logo 1216033 × 679226 EMU (1.330 × 0.743 in), then **CGHQ Daily Report** at 15 pt bold, centered, repeated on every page.
- Body: Times New Roman 14 pt.
- Main table: 14445 twips wide, fixed layout, indent -780 twips, visible 0.875 pt cell borders.
- Main columns: 675 / 2295 / 2040 / 7455 / 1980 twips.
- Follow-up columns: 675 / 2295 / 2025 / 7410 / 2040 twips.
- First three columns are vertically merged per category/title group.
- Status entries are one row each; numbered in groups that use numbering.
- Follow-up heading is bold + underlined.
- Prepared By line is bold label + regular name.
- File name pattern: `Team_Work_Status_12_November_2026.{docx|pdf}`.

See [../EXPORT-SPEC.md](../EXPORT-SPEC.md) for the complete contract.

## Note on the PDF

The PDF is the visual target, but it was produced by a different renderer than the app. Use it for layout comparison and human sign-off; do not use it as a byte-for-byte CI baseline. CI should compare generated PDFs against the app's own pinned baseline.
