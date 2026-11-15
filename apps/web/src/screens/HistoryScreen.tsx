import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSession } from '@cghq/contracts';
import { ApiError, reportsApi } from '../api/client.js';
import { IconDownload, IconTrash } from '../components/ui/icons.js';

interface HistoryScreenProps {
  session: AuthSession;
}

export function HistoryScreen({ session }: HistoryScreenProps) {
  const teamId = session.team.id;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ['report-history', teamId],
    queryFn: () => reportsApi.history(teamId),
  });

  const deleteMutation = useMutation({
    mutationFn: (reportDate: string) => reportsApi.deleteReport(teamId, reportDate),
    onSuccess: (_data, reportDate) => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['report-history', teamId] });
      void queryClient.removeQueries({ queryKey: ['report', teamId, reportDate] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to delete log');
    },
  });

  const rows = historyQuery.data ?? [];

  return (
    <div className="report-page">
      <div className="card card-accent">
        <div className="section-heading">
          <h2>Report History</h2>
          <span className="badge badge-muted">Last 90 daily reports</span>
        </div>

        {error && (
          <div className="alert-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {historyQuery.isLoading ? (
          <p className="muted">Loading report history…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No daily reports created yet.</p>
        ) : (
          <div className="work-table-wrap">
            <table className="work-table">
              <thead>
                <tr>
                  <th style={{ width: '16%' }}>Date</th>
                  <th style={{ width: '14%' }}>Status</th>
                  <th style={{ width: '10%' }}>Rev</th>
                  <th style={{ width: '12%' }}>Entries</th>
                  <th style={{ width: '20%' }}>Prepared By</th>
                  <th style={{ width: '28%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        to={`/reports/${row.reportDate}`}
                        style={{ color: 'var(--fg-primary)', textDecoration: 'none', fontWeight: 700 }}
                      >
                        {row.reportDate}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge badge-${row.status}`}>{row.status}</span>
                    </td>
                    <td>
                      <span className="badge badge-muted">rev {row.revision}</span>
                    </td>
                    <td>{row.entryCount}</td>
                    <td>{row.preparedByName}</td>
                    <td>
                      <div className="history-actions">
                        <Link className="btn-secondary btn-xs" to={`/reports/${row.reportDate}`}>
                          Open
                        </Link>
                        {row.status === 'finalized' && (
                          <>
                            <a
                              className="btn-dark btn-xs"
                              href={reportsApi.getExportUrl(teamId, row.reportDate, 'pdf')}
                            >
                              <IconDownload size={11} />
                              PDF
                            </a>
                            <a
                              className="btn-secondary btn-xs"
                              href={reportsApi.getExportUrl(teamId, row.reportDate, 'docx')}
                            >
                              <IconDownload size={11} />
                              DOCX
                            </a>
                          </>
                        )}
                        {session.member.role === 'lead' && (
                          <button
                            type="button"
                            className="btn-danger btn-xs"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete the daily log for ${row.reportDate}? This cannot be undone.`,
                                )
                              ) {
                                deleteMutation.mutate(row.reportDate);
                              }
                            }}
                          >
                            <IconTrash size={11} />
                            Delete
                          </button>
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
