import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { AuthSession } from '@cghq/contracts';
import { reportsApi } from '../api/client.js';

interface HistoryScreenProps {
  session: AuthSession;
}

export function HistoryScreen({ session }: HistoryScreenProps) {
  const teamId = session.team.id;
  const historyQuery = useQuery({
    queryKey: ['report-history', teamId],
    queryFn: () => reportsApi.history(teamId),
  });

  const rows = historyQuery.data ?? [];

  return (
    <div className="report-page">
      <div className="card">
        <div className="section-heading">
          <h2>Report History</h2>
          <span className="muted">Last 90 daily reports</span>
        </div>

        {historyQuery.isLoading ? (
          <p className="muted">Loading report history...</p>
        ) : rows.length === 0 ? (
          <p className="muted">No daily reports created yet.</p>
        ) : (
          <div className="preview-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Rev</th>
                  <th>Entries</th>
                  <th>Prepared By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/reports/${row.reportDate}`}>
                        <strong>{row.reportDate}</strong>
                      </Link>
                    </td>
                    <td>
                      <span className={`badge badge-${row.status}`}>
                        {row.status.toUpperCase()}
                      </span>
                    </td>
                    <td>{row.revision}</td>
                    <td>{row.entryCount}</td>
                    <td>{row.preparedByName}</td>
                    <td>
                      <div className="history-actions">
                        <Link className="btn-secondary btn-sm" to={`/reports/${row.reportDate}`}>
                          Open
                        </Link>
                        {row.status === 'finalized' && (
                          <>
                            <a
                              className="btn-primary btn-sm"
                              href={reportsApi.getExportUrl(teamId, row.reportDate, 'pdf')}
                            >
                              PDF
                            </a>
                            <a
                              className="btn-secondary btn-sm"
                              href={reportsApi.getExportUrl(teamId, row.reportDate, 'docx')}
                            >
                              DOCX
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
