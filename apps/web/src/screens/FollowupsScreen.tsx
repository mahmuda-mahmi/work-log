import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSession, FollowupItemDto, FollowupStatus } from '@cghq/contracts';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError, dictionaryApi, followupsApi, teamsApi } from '../api/client.js';
import { Alert } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { ConfirmDialog } from '../components/ui/confirm-dialog.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { Textarea } from '../components/ui/textarea.js';

interface FollowupsScreenProps {
  session: AuthSession;
}

interface EditRowState {
  id: string;
  categoryName: string;
  titleName: string;
  status: FollowupStatus;
  statusText: string;
  completedByMemberId: string;
  completedByLabel: string;
  version: number;
}

const CUSTOM_LABEL_SENTINEL = '__custom__';

export function FollowupsScreen({ session }: FollowupsScreenProps) {
  const queryClient = useQueryClient();
  const teamId = session.team.id;

  const [includeArchived, setIncludeArchived] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [titleName, setTitleName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [completedByMemberId, setCompletedByMemberId] = useState<string>('');
  const [completedByLabel, setCompletedByLabel] = useState('As Previous');
  const [editing, setEditing] = useState<EditRowState | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const followupsQuery = useQuery({
    queryKey: ['followups', teamId, includeArchived],
    queryFn: () => followupsApi.list(teamId, includeArchived),
  });

  const dictionaryQuery = useQuery({
    queryKey: ['dictionary', teamId],
    queryFn: () => dictionaryApi.list(teamId),
  });

  const membersQuery = useQuery({
    queryKey: ['members', teamId],
    queryFn: () => teamsApi.listMembers(teamId),
  });

  const activeCategories = useMemo(
    () =>
      (dictionaryQuery.data ?? [])
        .filter((c) => c.isActive)
        .map((c) => ({
          ...c,
          titles: c.titles.filter((t) => t.isActive),
        }))
        .filter((c) => c.titles.length > 0),
    [dictionaryQuery.data],
  );

  useEffect(() => {
    if (activeCategories.length === 0) return;
    if (!categoryName || !activeCategories.some((c) => c.name === categoryName)) {
      const firstCat = activeCategories[0]!;
      setCategoryName(firstCat.name);
      setTitleName(firstCat.titles[0]?.name ?? '');
    }
  }, [activeCategories, categoryName]);

  const titleOptions = useMemo(() => {
    const cat = activeCategories.find((c) => c.name === categoryName);
    return cat?.titles ?? [];
  }, [activeCategories, categoryName]);

  const createMutation = useMutation({
    mutationFn: () =>
      followupsApi.create(teamId, {
        categoryName: categoryName.trim(),
        titleName: titleName.trim(),
        statusText: statusText.trim(),
        completedByMemberId: completedByMemberId || null,
        completedByLabel: completedByMemberId ? null : completedByLabel.trim() || 'As Previous',
      }),
    onSuccess: () => {
      setErrorMsg(null);
      setStatusText('');
      setShowAddForm(false);
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to create follow-up');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: EditRowState) =>
      followupsApi.update(teamId, payload.id, {
        categoryName: payload.categoryName.trim(),
        titleName: payload.titleName.trim(),
        status: payload.status,
        statusText: payload.statusText.trim(),
        completedByMemberId: payload.completedByMemberId || null,
        completedByLabel: payload.completedByMemberId
          ? null
          : payload.completedByLabel.trim() || 'As Previous',
        version: payload.version,
      }),
    onSuccess: () => {
      setErrorMsg(null);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to update follow-up');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => followupsApi.archive(teamId, id),
    onSuccess: () => {
      setDeleteTargetId(null);
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
    },
  });

  const activeMembers = (membersQuery.data ?? []).filter((m) => m.isActive);
  const items = followupsQuery.data ?? [];

  function startEdit(item: FollowupItemDto) {
    setErrorMsg(null);
    setEditing({
      id: item.id,
      categoryName: item.categoryName,
      titleName: item.titleName,
      status: item.status,
      statusText: item.statusText,
      completedByMemberId: item.completedByMemberId ?? '',
      completedByLabel: item.completedByLabel ?? 'As Previous',
      version: item.version,
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!titleName.trim() || !statusText.trim()) {
      setErrorMsg('Title and Status are required.');
      return;
    }
    createMutation.mutate();
  }

  function statusBadgeVariant(status: FollowupStatus) {
    if (status === 'open') return 'default';
    if (status === 'in_progress') return 'warning';
    if (status === 'done') return 'success';
    return 'secondary';
  }

  return (
    <div className="flex flex-col gap-3.5">
      {errorMsg && <Alert variant="destructive">{errorMsg}</Alert>}

      {showAddForm && (
        <Card className="border-t-2 border-t-primary">
          <form onSubmit={handleCreate}>
            <CardHeader className="py-2.5">
              <CardTitle>Add New Follow-up Item</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setShowAddForm(false)}
              >
                Close
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 pt-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label>Report Category</Label>
                  <Select
                    value={categoryName}
                    onValueChange={(nextCatName) => {
                      setCategoryName(nextCatName);
                      const nextCat = activeCategories.find((c) => c.name === nextCatName);
                      setTitleName(nextCat?.titles[0]?.name ?? '');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label>Title</Label>
                  <Select value={titleName} onValueChange={setTitleName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select title" />
                    </SelectTrigger>
                    <SelectContent>
                      {titleOptions.map((t) => (
                        <SelectItem key={t.id} value={t.name}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label>Task Completed By</Label>
                  <Select
                    value={completedByMemberId || CUSTOM_LABEL_SENTINEL}
                    onValueChange={(val) =>
                      setCompletedByMemberId(val === CUSTOM_LABEL_SENTINEL ? '' : val)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CUSTOM_LABEL_SENTINEL}>
                        As Previous (or custom label)
                      </SelectItem>
                      {activeMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!completedByMemberId && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="followup-custom-label">Custom Label</Label>
                    <Input
                      id="followup-custom-label"
                      value={completedByLabel}
                      onChange={(e) => setCompletedByLabel(e.target.value)}
                      placeholder="As Previous"
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="followup-status">Status</Label>
                <Textarea
                  id="followup-status"
                  rows={2}
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="Describe pending follow-up action..."
                  required
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={createMutation.isPending}>
                  <Plus className="h-3.5 w-3.5" />
                  {createMutation.isPending ? 'Adding…' : 'Add Follow-up'}
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      )}

      <Card className="border-t-2 border-t-primary">
        <CardHeader className="py-3">
          <div>
            <CardTitle>Follow-up Items</CardTitle>
            <CardDescription className="mt-0.5">
              Active follow-ups carry forward automatically into daily reports unless edited or
              deleted.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-8 cursor-pointer items-center gap-2 text-xs font-medium text-zinc-700 select-none">
              <Checkbox
                checked={includeArchived}
                onCheckedChange={(checked) => setIncludeArchived(Boolean(checked))}
              />
              <span>Show archived</span>
            </label>
            <Button type="button" size="sm" onClick={() => setShowAddForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5" />
              {showAddForm ? 'Close Form' : 'New Follow-up'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-3">
          {followupsQuery.isLoading ? (
            <div className="grid gap-2.5 py-1">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No follow-up items. Finalized reports will display &ldquo;None&rdquo;.
            </p>
          ) : (
            <div className="w-full overflow-x-auto rounded-md border border-zinc-200 bg-white">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-zinc-950 text-white border-b-2 border-b-primary">
                    <th className="w-[5%] border-r border-zinc-800 px-2.5 py-2.5 text-center text-xs font-bold">
                      Ser
                    </th>
                    <th className="w-[14%] border-r border-zinc-800 px-2.5 py-2.5 text-left text-xs font-bold">
                      Report Category
                    </th>
                    <th className="w-[19%] border-r border-zinc-800 px-2.5 py-2.5 text-left text-xs font-bold">
                      Title
                    </th>
                    <th className="w-[34%] border-r border-zinc-800 px-2.5 py-2.5 text-left text-xs font-bold">
                      Status
                    </th>
                    <th className="w-[14%] border-r border-zinc-800 px-2.5 py-2.5 text-left text-xs font-bold">
                      Task Completed By
                    </th>
                    <th className="w-[14%] px-2.5 py-2.5 text-right text-xs font-bold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const isEditingThis = editing?.id === item.id;
                    if (isEditingThis && editing) {
                      const editCat = activeCategories.find(
                        (c) => c.name === editing.categoryName,
                      );
                      const editTitles = editCat?.titles ?? [];
                      return (
                        <tr key={item.id} className="border-b border-zinc-200 last:border-b-0">
                          <td colSpan={6} className="bg-zinc-50 p-3">
                            <div className="grid gap-3 rounded-md border border-orange-300 border-l-4 border-l-primary bg-white p-3.5">
                              <div className="border-b border-zinc-100 pb-2 text-xs font-bold text-zinc-950">
                                Editing Follow-up #{idx + 1}
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="grid gap-1.5">
                                  <Label>Report Category</Label>
                                  <Select
                                    value={editing.categoryName}
                                    onValueChange={(nextCatName) => {
                                      const nextCat = activeCategories.find(
                                        (c) => c.name === nextCatName,
                                      );
                                      setEditing({
                                        ...editing,
                                        categoryName: nextCatName,
                                        titleName: nextCat?.titles[0]?.name ?? editing.titleName,
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {!activeCategories.some(
                                        (c) => c.name === editing.categoryName,
                                      ) && (
                                        <SelectItem value={editing.categoryName || 'General'}>
                                          {editing.categoryName || 'General'}
                                        </SelectItem>
                                      )}
                                      {activeCategories.map((c) => (
                                        <SelectItem key={c.id} value={c.name}>
                                          {c.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="grid gap-1.5">
                                  <Label>Title</Label>
                                  <Select
                                    value={editing.titleName}
                                    onValueChange={(val) =>
                                      setEditing({ ...editing, titleName: val })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {!editTitles.some((t) => t.name === editing.titleName) && (
                                        <SelectItem value={editing.titleName}>
                                          {editing.titleName}
                                        </SelectItem>
                                      )}
                                      {editTitles.map((t) => (
                                        <SelectItem key={t.id} value={t.name}>
                                          {t.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="grid gap-1.5">
                                  <Label>Follow-up State</Label>
                                  <Select
                                    value={editing.status}
                                    onValueChange={(val) =>
                                      setEditing({ ...editing, status: val as FollowupStatus })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="open">Open (carry forward)</SelectItem>
                                      <SelectItem value="in_progress">
                                        In Progress (carry forward)
                                      </SelectItem>
                                      <SelectItem value="done">
                                        Done (stop carrying forward)
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="grid gap-1.5">
                                  <Label>Task Completed By</Label>
                                  <Select
                                    value={editing.completedByMemberId || CUSTOM_LABEL_SENTINEL}
                                    onValueChange={(val) =>
                                      setEditing({
                                        ...editing,
                                        completedByMemberId:
                                          val === CUSTOM_LABEL_SENTINEL ? '' : val,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={CUSTOM_LABEL_SENTINEL}>
                                        Label ({editing.completedByLabel})
                                      </SelectItem>
                                      {activeMembers.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                          {m.displayName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="grid gap-1.5">
                                <Label>Status</Label>
                                <Textarea
                                  rows={3}
                                  value={editing.statusText}
                                  onChange={(e) =>
                                    setEditing({ ...editing, statusText: e.target.value })
                                  }
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={updateMutation.isPending}
                                  onClick={() => updateMutation.mutate(editing)}
                                >
                                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditing(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={item.id} className="border-b border-zinc-200 last:border-b-0">
                        <td className="border-r border-zinc-200 p-2.5 text-center align-top">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-orange-300 bg-orange-50 text-xs font-extrabold text-orange-700">
                            {idx + 1}
                          </span>
                        </td>
                        <td className="border-r border-zinc-200 p-2.5 font-bold text-zinc-950 align-top">
                          {item.categoryName}
                        </td>
                        <td className="border-r border-zinc-200 p-2.5 font-medium text-zinc-700 align-top">
                          {item.titleName}
                        </td>
                        <td className="border-r border-zinc-200 p-2.5 align-top">
                          <div className="whitespace-pre-wrap text-zinc-950 leading-relaxed">
                            {item.statusText}
                          </div>
                          <Badge
                            variant={statusBadgeVariant(item.status)}
                            size="sm"
                            className="mt-2"
                          >
                            {item.status}
                          </Badge>
                        </td>
                        <td className="border-r border-zinc-200 p-2.5 align-top">
                          <Badge variant="secondary" size="sm" className="normal-case">
                            {item.completedByDisplay}
                          </Badge>
                        </td>
                        <td className="p-2.5 align-top">
                          {item.status !== 'archived' && (
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => startEdit(item)}
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="xs"
                                onClick={() => setDeleteTargetId(item.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        title="Delete Follow-up Item"
        description="Archive and remove this follow-up item from future daily reports?"
        confirmLabel="Delete Follow-up"
        destructive
        pending={archiveMutation.isPending}
        onConfirm={() => {
          if (deleteTargetId) archiveMutation.mutate(deleteTargetId);
        }}
      />
    </div>
  );
}
