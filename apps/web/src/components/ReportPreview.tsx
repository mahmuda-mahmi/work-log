import { useMemo, useState } from 'react';
import type { DailyReportDto } from '@cghq/contracts';
import { buildDocumentModel, type DocumentRow, type ReportEntryInput } from '@cghq/document/model';

interface ReportPreviewProps {
  report: DailyReportDto;
  documentTitle: string;
  hasLogo: boolean;
  filterMemberId?: string;
  filterUserId?: string;
  fontFamily?: string;
  fontSizePt?: number;
}

function computeRowSpans(rows: DocumentRow[]): number[] {
  const spans = new Array<number>(rows.length).fill(1);
  let i = 0;
  while (i < rows.length) {
    if (rows[i]!.groupMerge === 'restart') {
      let span = 1;
      while (i + span < rows.length && rows[i + span]!.groupMerge === 'continue') {
        span += 1;
      }
      spans[i] = span;
      for (let k = 1; k < span; k += 1) {
        spans[i + k] = 0;
      }
      i += span;
    } else {
      i += 1;
    }
  }
  return spans;
}

export function ReportPreview({
  report,
  documentTitle,
  filterMemberId,
  filterUserId,
  fontFamily = 'Liberation Serif',
  fontSizePt = 11,
}: ReportPreviewProps) {
  const [logoVisible, setLogoVisible] = useState(true);

  const model = useMemo(() => {
    const entries: ReportEntryInput[] = report.groups
      .filter((group) => group.entries.length > 0)
      .flatMap((group) =>
        group.entries
          .filter((entry) => {
            if (!filterMemberId && !filterUserId) return true;
            return (
              entry.completedByMemberId === filterMemberId ||
              entry.createdByUserId === filterUserId
            );
          })
          .map((entry) => ({
            categoryName: group.categoryName,
            titleName: group.titleName,
            statusText: entry.statusText,
            completedBy: entry.completedByDisplay,
            numberingMode: group.numberingMode,
          })),
      );

    return buildDocumentModel({
      documentTitle,
      reportDate: report.reportDate,
      preparedBy: report.preparedByName,
      entries,
      followups: report.followups.map((f) => ({
        categoryName: f.categoryName,
        titleName: f.titleName,
        statusText: f.statusText,
        completedBy: f.completedByDisplay,
      })),
    });
  }, [report, documentTitle, filterMemberId, filterUserId]);

  const mainRowSpans = useMemo(() => computeRowSpans(model.mainRows), [model.mainRows]);

  const cssFontFamily =
    fontFamily === 'Helvetica'
      ? 'Arial, Helvetica, sans-serif'
      : fontFamily === 'Courier'
        ? "'Courier New', Courier, monospace"
        : "'Liberation Serif', 'Times New Roman', Georgia, serif";

  return (
    <div
      className="preview-sheet"
      style={{
        fontFamily: cssFontFamily,
        fontSize: `${fontSizePt}pt`,
      }}
    >
      <div className="preview-header">
        {logoVisible && (
          <img
            src="/default-logo.png"
            alt="Solution Art"
            className="preview-logo"
            onError={() => setLogoVisible(false)}
          />
        )}
        <div className="preview-title-block">
          <div className="preview-title">{model.documentTitle}</div>
          <div className="preview-date">Date: {model.formattedDate}</div>
        </div>
      </div>

      <div className="preview-table-wrap">
        <table className="preview-table">
          <thead>
            <tr>
              <th className="col-ser">Ser</th>
              <th className="col-cat">Report Category</th>
              <th className="col-title">Title</th>
              <th className="col-status">Status</th>
              <th className="col-by">Task Completed By</th>
            </tr>
          </thead>
          <tbody>
            {model.mainRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="preview-empty">
                  No work entries added yet for this date.
                </td>
              </tr>
            ) : (
              model.mainRows.map((row, idx) => {
                const span = mainRowSpans[idx] ?? 1;
                return (
                  <tr key={idx}>
                    {span > 0 && (
                      <>
                        <td className="col-ser" rowSpan={span}>
                          {row.ser}
                        </td>
                        <td className="col-cat" rowSpan={span}>
                          {row.category}
                        </td>
                        <td className="col-title" rowSpan={span}>
                          {row.title}
                        </td>
                      </>
                    )}
                    <td className="col-status">
                      {row.statusPrefix ? `${row.statusPrefix} ${row.status}` : row.status}
                    </td>
                    <td className="col-by">{row.completedBy}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {model.hasFollowups && (
        <>
          <div className="preview-followup-heading">Follow-up Items:</div>
          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  <th className="col-ser">Ser</th>
                  <th className="col-cat">Report Category</th>
                  <th className="col-title">Title</th>
                  <th className="col-status">Status</th>
                  <th className="col-by">Task Completed By</th>
                </tr>
              </thead>
              <tbody>
                {model.followupRows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="col-ser">{row.ser}</td>
                    <td className="col-cat">{row.category}</td>
                    <td className="col-title">{row.title}</td>
                    <td className="col-status">{row.status}</td>
                    <td className="col-by">{row.completedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="preview-prepared-by">
        <strong>Prepared By:</strong> {model.preparedBy}
      </div>
    </div>
  );
}
