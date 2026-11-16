import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActiveAuthSession } from '@cghq/contracts';
import { Download, Trash2 } from 'lucide-react';
import { ApiError, reportsApi } from '../api/client.js';
import { Alert } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button, buttonVariants } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { ConfirmDialog } from '../components/ui/confirm-dialog.js';
import { Skeleton } from '../components/ui/skeleton.js';

interface HistoryScreenProps {
  session: ActiveAuthSession;
}

export function HistoryScreen({ session }: HistoryScreenProps) {
  const teamId = session.team.id;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [deleteDate, setDeleteDate] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ['report-history', teamId],
    queryFn: () => reportsApi.history(teamId),
  });

  const deleteMutation = useMutation({
    mutationFn: (reportDate: string) => reportsApi.deleteReport(teamId, reportDate),
    onSuccess: (_data, reportDate) => {
      setError(null);
      setDeleteDate(null);
      void queryClient.invalidateQueries({ queryKey: ['report-history', teamId] });
      void queryClient.removeQueries({ queryKey: ['report', teamId, reportDate] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to delete log');
    },
  });

  const rows = historyQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3.5">
      <Card className="border-t-2 border-t-primary">
        <CardHeader className="py-3">
          <CardTitle>Report History</CardTitle>
          <Badge variant="secondary" size="sm">
            Last 90 daily reports
          </Badge>
        </CardHeader>

        <CardContent className="p-3">
          {error && (
            <Alert variant="destructive" className="mb-3">
              {error}
            </Alert>
          )}

          {historyQuery.isLoading ? (
            <div className="grid gap-2.5 py-1">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-zinc-500">No daily reports created yet.</p>
          ) : (
            <div className="w-full overflow-x-auto rounded-md border border-zinc-200 bg-white">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-zinc-950 text-white border-b-2 border-b-primary">
                    <th className="w-[16%] border-r border-zinc-800 px-3 py-2.5 text-left text-xs font-bold">
                      Date
                    </th>
                    <th className="w-[14%] border-r border-zinc-800 px-3 py-2.5 text-left text-xs font-bold">
                      Status
                    </th>
                    <th className="w-[10%] border-r border-zinc-800 px-3 py-2.5 text-left text-xs font-bold">
                      Rev
                    </th>
                    <th className="w-[12%] border-r border-zinc-800 px-3 py-2.5 text-left text-xs font-bold">
                      Entries
                    </th>
                    <th className="w-[20%] border-r border-zinc-800 px-3 py-2.5 text-left text-xs font-bold">
                      Prepared By
                    </th>
                    <th className="w-[28%] px-3 py-2.5 text-right text-xs font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-200 last:border-b-0">
                      <td className="border-r border-zinc-200 px-3 py-2.5 font-bold">
                        <Link
                          to={`/reports/${row.reportDate}`}
                          className="text-zinc-950 hover:text-orange-600 hover:underline"
                        >
                          {row.reportDate}
                        </Link>
                      </td>
                      <td className="border-r border-zinc-200 px-3 py-2.5">
                        <Badge
                          variant={
                            row.status === 'finalized'
                              ? 'dark'
                              : row.status === 'reopened'
                                ? 'warning'
                                : 'default'
                          }
                          size="sm"
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="border-r border-zinc-200 px-3 py-2.5">
                        <Badge variant="secondary" size="sm">
                          rev {row.revision}
                        </Badge>
                      </td>
                      <td className="border-r border-zinc-200 px-3 py-2.5 text-zinc-700">
                        {row.entryCount}
                      </td>
                      <td className="border-r border-zinc-200 px-3 py-2.5 text-zinc-700">
                        {row.preparedByName}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Link
                            className={buttonVariants({ variant: 'outline', size: 'xs' })}
                            to={`/reports/${row.reportDate}`}
                          >
                            Open
                          </Link>
                          {row.status === 'finalized' && (
                            <>
                              <a
                                className={buttonVariants({ variant: 'dark', size: 'xs' })}
                                href={reportsApi.getExportUrl(teamId, row.reportDate, 'pdf')}
                              >
                                <Download className="h-3 w-3" />
                                PDF
                              </a>
                              <a
                                className={buttonVariants({ variant: 'outline', size: 'xs' })}
                                href={reportsApi.getExportUrl(teamId, row.reportDate, 'docx')}
                              >
                                <Download className="h-3 w-3" />
                                DOCX
                              </a>
                            </>
                          )}
                          {session.member.role === 'lead' && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="xs"
                              disabled={deleteMutation.isPending}
                              onClick={() => setDeleteDate(row.reportDate)}
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(deleteDate)}
        onOpenChange={(open) => {
          if (!open) setDeleteDate(null);
        }}
        title={`Delete Daily Log (${deleteDate ?? ''})`}
        description="Permanently delete this entire daily report and all of its entries? This cannot be undone."
        confirmLabel="Delete Log"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteDate) deleteMutation.mutate(deleteDate);
        }}
      />
    </div>
  );
}
