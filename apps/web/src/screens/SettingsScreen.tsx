import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActiveAuthSession } from '@cghq/contracts';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  FolderKanban,
  KeyRound,
  LogOut,
  Moon,
  Palette,
  Pencil,
  Plus,
  Sun,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { authApi, dictionaryApi, frequentStatusesApi, teamsApi } from '../api/client';
import { clearRememberedReturnRoute } from '../lib/navigation';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ConfirmDialog, PromptDialog } from '../components/ui/confirm-dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  applyAppearancePrefs,
  readAppearancePrefs,
  THEME_OPTIONS,
  type ThemeColorId,
} from '../lib/theme';
import { cn } from '../lib/utils';

type RenamePromptState =
  | { type: 'category'; id: string; currentName: string }
  | { type: 'title'; id: string; currentName: string }
  | null;

type DeleteDictTarget =
  | { type: 'category'; id: string; name: string }
  | { type: 'title'; id: string; name: string }
  | null;

type SettingsTabId = 'team' | 'categories' | 'account' | 'appearance';

export function SettingsScreen({ session }: { session: ActiveAuthSession }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isLead = session.member.role === 'lead';
  const teamId = session.team.id;

  const { data: settings } = useQuery({
    queryKey: ['team-settings', teamId],
    queryFn: () => teamsApi.getSettings(teamId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => teamsApi.listMembers(teamId),
  });

  const { data: dictionary = [] } = useQuery({
    queryKey: ['dictionary', teamId],
    queryFn: () => dictionaryApi.list(teamId),
    enabled: isLead,
  });

  const { data: joinRequests = [] } = useQuery({
    queryKey: ['join-requests', teamId],
    queryFn: () => teamsApi.listJoinRequests(teamId),
    enabled: isLead,
  });

  const { data: frequentStatuses = [] } = useQuery({
    queryKey: ['frequent-statuses', teamId],
    queryFn: () => frequentStatusesApi.list(teamId),
  });

  const [newFrequentStatus, setNewFrequentStatus] = useState('');
  const [newFreqTitleIds, setNewFreqTitleIds] = useState<string[]>([]);
  const [editingFreq, setEditingFreq] = useState<{
    id: string;
    statusText: string;
    titleIds: string[];
  } | null>(null);

  const dailyTitleOptions = useMemo(() => {
    const out: Array<{ id: string; label: string; shortLabel: string }> = [];
    for (const cat of dictionary) {
      if (!cat.isActive) continue;
      for (const t of cat.titles) {
        if (!t.isActive || t.scope === 'followup') continue;
        out.push({
          id: t.id,
          label: `${cat.name} / ${t.name}`,
          shortLabel: t.name,
        });
      }
    }
    return out;
  }, [dictionary]);

  const createFrequentStatusMutation = useMutation({
    mutationFn: (payload: { text: string; titleIds: string[] }) =>
      frequentStatusesApi.create(teamId, payload.text, payload.titleIds),
    onSuccess: () => {
      setNewFrequentStatus('');
      setNewFreqTitleIds([]);
      setStatusMsg('Frequently used status added.');
      void queryClient.invalidateQueries({ queryKey: ['frequent-statuses', teamId] });
    },
  });

  const updateFrequentStatusMutation = useMutation({
    mutationFn: (payload: { id: string; statusText: string; titleIds: string[] }) =>
      frequentStatusesApi.update(teamId, payload.id, payload.statusText, payload.titleIds),
    onSuccess: () => {
      setEditingFreq(null);
      setStatusMsg('Frequently used status updated.');
      void queryClient.invalidateQueries({ queryKey: ['frequent-statuses', teamId] });
    },
  });

  const deleteFrequentStatusMutation = useMutation({
    mutationFn: (id: string) => frequentStatusesApi.remove(teamId, id),
    onSuccess: () => {
      setStatusMsg('Frequently used status removed.');
      void queryClient.invalidateQueries({ queryKey: ['frequent-statuses', teamId] });
    },
  });

  const [joinLink, setJoinLink] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [newTitleName, setNewTitleName] = useState('');
  const [newTitleScope, setNewTitleScope] = useState<'daily' | 'followup'>('daily');
  const [renamePrompt, setRenamePrompt] = useState<RenamePromptState>(null);
  const [deleteDictTarget, setDeleteDictTarget] = useState<DeleteDictTarget>(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('team');
  const [appearance, setAppearance] = useState(() => readAppearancePrefs());
  const tabRefs = useRef<Partial<Record<SettingsTabId, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number }>({
    left: 4,
    top: 4,
    width: 0,
    height: 0,
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const needsCurrentPassword =
    session.user.hasPassword !== false && session.user.authMethod !== 'google';

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      authApi.changePassword({
        currentPassword: needsCurrentPassword ? currentPassword : '',
        newPassword,
      }),
    onSuccess: async () => {
      setCurrentPassword('');
      setNewPassword('');
      setPwError(null);
      setStatusMsg(
        'Password saved! You can now sign in with your email & password as well as Continue with Google.',
      );
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => setPwError(err.message),
  });

  const settingsTabs = useMemo(
    () =>
      [
        { id: 'team' as const, label: 'Team', icon: Users },
        ...(isLead
          ? [{ id: 'categories' as const, label: 'Report & Categories', icon: FolderKanban }]
          : []),
        { id: 'account' as const, label: 'Account', icon: User },
        { id: 'appearance' as const, label: 'Appearance', icon: Palette },
      ] as const,
    [isLead],
  );

  useLayoutEffect(() => {
    function measure() {
      const btn = tabRefs.current[activeTab];
      if (btn) {
        setPill({
          left: btn.offsetLeft,
          top: btn.offsetTop,
          width: btn.offsetWidth,
          height: btn.offsetHeight,
        });
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeTab, isLead]);

  const [docTitle, setDocTitle] = useState<string | null>(null);
  const [filePrefix, setFilePrefix] = useState<string | null>(null);
  const [preparedBy, setPreparedBy] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [successorLeadMemberId, setSuccessorLeadMemberId] = useState('');
  const [leaveError, setLeaveError] = useState<string | null>(null);

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setStatusMsg('Select the link and press Ctrl+C to copy.');
    }
  }

  const saveProfile = useMutation({
    mutationFn: () =>
      teamsApi.updateProfile(teamId, {
        displayName: (profileDisplayName ?? session.member.displayName).trim(),
      }),
    onSuccess: async (res) => {
      setProfileDisplayName(res.displayName);
      setStatusMsg(`Profile updated. Your DOC/PDF display name is now "${res.displayName}".`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['team-members', teamId] }),
        queryClient.invalidateQueries({ queryKey: ['report', teamId] }),
      ]);
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      teamsApi.updateSettings(teamId, {
        documentTitle: docTitle ?? settings?.documentTitle,
        filePrefix: filePrefix ?? settings?.filePrefix,
        preparedByDefault: preparedBy ?? settings?.preparedByDefault ?? null,
      }),
    onSuccess: async () => {
      setStatusMsg('Settings saved.');
      await queryClient.invalidateQueries({ queryKey: ['team-settings', teamId] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const renameCategoryMutation = useMutation({
    mutationFn: ({ id, name, isActive }: { id: string; name?: string; isActive?: boolean }) =>
      dictionaryApi.updateCategory(teamId, id, { name, isActive }),
    onSuccess: async () => {
      setRenamePrompt(null);
      await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => dictionaryApi.deleteCategory(teamId, id),
    onSuccess: async () => {
      setDeleteDictTarget(null);
      setStatusMsg('Category deleted.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] }),
        queryClient.invalidateQueries({ queryKey: ['report', teamId] }),
      ]);
    },
    onError: (err: Error) => {
      setDeleteDictTarget(null);
      setStatusMsg(err.message);
    },
  });

  const deleteTitleMutation = useMutation({
    mutationFn: (id: string) => dictionaryApi.deleteTitle(teamId, id),
    onSuccess: async () => {
      setDeleteDictTarget(null);
      setStatusMsg('Title deleted.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] }),
        queryClient.invalidateQueries({ queryKey: ['report', teamId] }),
      ]);
    },
    onError: (err: Error) => {
      setDeleteDictTarget(null);
      setStatusMsg(err.message);
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: () => dictionaryApi.createCategory(teamId, newCategoryName.trim()),
    onSuccess: async (created) => {
      setNewCategoryName('');
      setSelectedCategoryId(created.id);
      setStatusMsg(`Category "${created.name}" added to dropdown.`);
      await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const createTitleMutation = useMutation({
    mutationFn: () => {
      const targetCatId = selectedCategoryId || dictionary[0]?.id;
      if (!targetCatId) throw new Error('Select a category first.');
      return dictionaryApi.createTitle(teamId, targetCatId, newTitleName.trim(), newTitleScope);
    },
    onSuccess: async (created) => {
      setNewTitleName('');
      setStatusMsg(
        `Title "${created.name}" added (${newTitleScope === 'daily' ? 'Daily Work Table' : 'Follow-up Table'}).`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] }),
        queryClient.invalidateQueries({ queryKey: ['report', teamId] }),
      ]);
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const renameTitleMutation = useMutation({
    mutationFn: ({
      id,
      name,
      isActive,
      scope,
    }: {
      id: string;
      name?: string;
      isActive?: boolean;
      scope?: 'daily' | 'followup';
    }) => dictionaryApi.updateTitle(teamId, id, { name, isActive, scope }),
    onSuccess: async () => {
      setRenamePrompt(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] }),
        queryClient.invalidateQueries({ queryKey: ['report', teamId] }),
      ]);
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const joinLinkMutation = useMutation({
    mutationFn: () => teamsApi.createJoinLink(teamId),
    onSuccess: (res) => {
      setJoinLink(`${window.location.origin}${res.joinPath}`);
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const approveJoinMutation = useMutation({
    mutationFn: (requestId: string) => teamsApi.approveJoinRequest(teamId, requestId),
    onSuccess: async () => {
      setStatusMsg('Member approved and added to team.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['join-requests', teamId] }),
        queryClient.invalidateQueries({ queryKey: ['team-members', teamId] }),
        queryClient.invalidateQueries({ queryKey: ['members', teamId] }),
      ]);
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const rejectJoinMutation = useMutation({
    mutationFn: (requestId: string) => teamsApi.rejectJoinRequest(teamId, requestId),
    onSuccess: async () => {
      setStatusMsg('Join request rejected.');
      await queryClient.invalidateQueries({ queryKey: ['join-requests', teamId] });
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: (memberId: string) => teamsApi.issuePasswordReset(teamId, memberId),
    onSuccess: (res) => {
      setResetLink(`${window.location.origin}${res.resetPath}`);
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: 'lead' | 'member' }) =>
      teamsApi.changeRole(teamId, memberId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members', teamId] }),
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (memberId: string) => teamsApi.deactivateMember(teamId, memberId),
    onSuccess: async () => {
      const removedName = removeMemberTarget?.displayName ?? 'Member';
      setRemoveMemberTarget(null);
      setStatusMsg(`${removedName} was removed from the team.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-members', teamId] }),
        queryClient.invalidateQueries({ queryKey: ['report', teamId] }),
      ]);
    },
    onError: (err: Error) => {
      setRemoveMemberTarget(null);
      setStatusMsg(err.message);
    },
  });

  const otherActiveMembers = useMemo(
    () => members.filter((m) => m.isActive && m.id !== session.member.id),
    [members, session.member.id],
  );

  const leaveTeamMutation = useMutation({
    mutationFn: () =>
      teamsApi.leaveTeam(
        teamId,
        isLead && otherActiveMembers.length > 0 ? successorLeadMemberId || undefined : undefined,
      ),
    onSuccess: async (res) => {
      setLeaveModalOpen(false);
      setLeaveError(null);
      setSuccessorLeadMemberId('');
      try {
        window.localStorage.removeItem('cghq:session');
      } catch {
        // Ignore
      }
      queryClient.removeQueries({ queryKey: ['team-settings', teamId] });
      queryClient.removeQueries({ queryKey: ['team-members', teamId] });
      queryClient.removeQueries({ queryKey: ['report', teamId] });
      if (res.remainingCount === 0) {
        clearRememberedReturnRoute();
      }
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['my-teams'] });
      navigate(res.remainingCount > 1 ? '/' : '/today');
    },
    onError: (err: Error) => setLeaveError(err.message),
  });

  const activeCategoryIdForTitle = selectedCategoryId || dictionary[0]?.id || '';

  function updateAppearance(next: { theme?: ThemeColorId; darkMode?: boolean }) {
    const merged = {
      theme: next.theme ?? appearance.theme,
      darkMode: next.darkMode ?? appearance.darkMode,
    };
    setAppearance(merged);
    applyAppearancePrefs(merged);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="border-b border-zinc-200 pb-3">
        <div
          role="tablist"
          aria-label="Settings sections"
          className="relative grid w-full grid-cols-2 items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1 shadow-xs sm:inline-flex sm:w-auto sm:flex-nowrap sm:whitespace-nowrap"
        >
          {pill.width > 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 rounded-lg bg-primary shadow-sm transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                width: `${pill.width}px`,
                height: `${pill.height}px`,
                transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
              }}
            />
          )}
          {settingsTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative z-10 inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors duration-200 whitespace-nowrap sm:justify-start sm:px-3',
                  selected ? 'text-white' : 'text-zinc-600 hover:text-zinc-950',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {statusMsg && <Alert variant="success">{statusMsg}</Alert>}

      {activeTab === 'appearance' && (
        <div key="tab-appearance" className="auth-form-animate max-w-3xl">
          <Card className="border-t-2 border-t-primary">
            <CardHeader className="py-3">
              <CardTitle>Theme &amp; Dark Mode</CardTitle>
              <CardDescription>
                Choose your workspace accent theme (default matches the company logo) and toggle
                complementary dark mode.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pt-3">
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
                <div className="flex items-center gap-2.5">
                  {appearance.darkMode ? (
                    <Moon className="h-4 w-4 text-primary" />
                  ) : (
                    <Sun className="h-4 w-4 text-primary" />
                  )}
                  <div>
                    <div className="text-sm font-semibold text-zinc-950">Dark Mode</div>
                    <div className="text-xs text-zinc-500">
                      High-contrast dark palette tuned for every theme color.
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={appearance.darkMode ? 'default' : 'outline'}
                  onClick={() => updateAppearance({ darkMode: !appearance.darkMode })}
                >
                  {appearance.darkMode ? 'Dark On' : 'Light On'}
                </Button>
              </div>

              <div className="grid gap-2">
                <Label>Color Theme</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {THEME_OPTIONS.map((t) => {
                    const selected = appearance.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => updateAppearance({ theme: t.id })}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                          selected
                            ? 'border-primary bg-accent/60 ring-1 ring-primary'
                            : 'border-zinc-200 bg-white hover:bg-zinc-50',
                        )}
                      >
                        <span
                          className="h-6 w-6 shrink-0 rounded-full border border-black/10 shadow-xs"
                          style={{ backgroundColor: t.swatch }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-zinc-950">{t.label}</div>
                          <div className="truncate text-[11px] text-zinc-500">{t.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'account' && (
        <div
          key="tab-account"
          className="auth-form-animate grid grid-cols-1 items-start gap-4 lg:grid-cols-2"
        >
          <Card className="border-t-2 border-t-primary">
            <CardHeader className="py-3">
              <CardTitle>My Profile</CardTitle>
              <CardDescription>
                Choose the name shown for you in daily work entries, DOCX, and PDF exports.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                <div>
                  Signed in as <strong className="text-zinc-950">{session.user.name}</strong> (
                  {session.user.email})
                </div>
                <Badge variant={isLead ? 'default' : 'secondary'} size="sm">
                  {session.member.role}
                </Badge>
              </div>
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveProfile.mutate();
                }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="set-profile-display-name">Display Name (DOC / PDF)</Label>
                  <Input
                    id="set-profile-display-name"
                    value={profileDisplayName ?? session.member.displayName}
                    onChange={(e) => setProfileDisplayName(e.target.value)}
                    placeholder="e.g. Alex or Short Name"
                    maxLength={80}
                    required
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      saveProfile.isPending ||
                      !(profileDisplayName ?? session.member.displayName).trim()
                    }
                  >
                    <Check className="h-3.5 w-3.5" />
                    {saveProfile.isPending ? 'Saving…' : 'Save Profile'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-t-2 border-t-primary">
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <CardTitle>
                  {!needsCurrentPassword ? 'Set App Password' : 'Change Password'}
                </CardTitle>
              </div>
              <CardDescription>
                {!needsCurrentPassword
                  ? 'Set a Work Log password so you can also sign in with email & password in addition to Google.'
                  : 'Update your Work Log account password.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-3">
              {pwError && <Alert variant="destructive">{pwError}</Alert>}
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPwError(null);
                  changePasswordMutation.mutate();
                }}
              >
                {needsCurrentPassword && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="set-cur-pw">Current Password</Label>
                    <Input
                      id="set-cur-pw"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="set-new-pw">New Password (min 8 chars)</Label>
                  <Input
                    id="set-new-pw"
                    type="password"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={changePasswordMutation.isPending}>
                    <KeyRound className="h-3.5 w-3.5" />
                    {changePasswordMutation.isPending ? 'Saving…' : 'Save Password'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'team' && (
        <div
          key="tab-team"
          className="auth-form-animate grid grid-cols-1 items-start gap-4 lg:grid-cols-12"
        >
        {/* Left Column (5 cols) */}
        {isLead && (
          <div className="flex flex-col gap-4 lg:col-span-5">
            <Card className="border-t-2 border-t-primary">
            <CardHeader className="py-3">
              <CardTitle>Team Settings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-3">
              {settings && (
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveSettings.mutate();
                  }}
                >
                  <div className="grid gap-1.5">
                    <Label htmlFor="set-doc-title">Document Title</Label>
                    <Input
                      id="set-doc-title"
                      disabled={!isLead}
                      value={docTitle ?? settings.documentTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="set-file-prefix">File Prefix</Label>
                    <Input
                      id="set-file-prefix"
                      disabled={!isLead}
                      value={filePrefix ?? settings.filePrefix}
                      onChange={(e) => setFilePrefix(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="set-prepared-by">Default Prepared By</Label>
                    <Input
                      id="set-prepared-by"
                      disabled={!isLead}
                      value={preparedBy ?? settings.preparedByDefault ?? ''}
                      onChange={(e) => setPreparedBy(e.target.value)}
                    />
                  </div>
                  {isLead && (
                    <div className="flex justify-end">
                      <Button type="submit" size="sm" disabled={saveSettings.isPending}>
                        <Check className="h-3.5 w-3.5" />
                        Save Settings
                      </Button>
                    </div>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        </div>
        )}

        {/* Right Column (7 cols, or full width for non-lead) */}
        <div className={cn('flex flex-col gap-4', isLead ? 'lg:col-span-7' : 'lg:col-span-12')}>
          <Card className="border-t-2 border-t-primary">
            <CardHeader className="py-3">
              <CardTitle>Team Members &amp; Invites</CardTitle>
              <Badge variant="secondary" size="sm">
                {members.filter((m) => m.isActive).length} members
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-4 pt-3">
              <ul className="grid gap-2">
                {members
                  .filter((m) => m.isActive)
                  .map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-col gap-2.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 sm:flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="truncate text-sm text-zinc-950">{m.displayName}</strong>
                        <Badge
                          variant={m.role === 'lead' ? 'default' : 'secondary'}
                          className="h-5 shrink-0 px-1.5 text-[10px]"
                        >
                          {m.role}
                        </Badge>
                      </div>
                      <div className="break-all text-xs text-zinc-500">
                        {m.email} {!m.isActive && '· Inactive'}
                      </div>
                    </div>
                    {isLead && m.isActive && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            roleMutation.mutate({
                              memberId: m.id,
                              role: m.role === 'lead' ? 'member' : 'lead',
                            })
                          }
                        >
                          Make {m.role === 'lead' ? 'Member' : 'Lead'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => resetMutation.mutate(m.id)}
                        >
                          Reset Link
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          disabled={deactivateMutation.isPending}
                          onClick={() =>
                            setRemoveMemberTarget({ id: m.id, displayName: m.displayName })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {resetLink && (
                <Alert className="grid gap-2">
                  <strong className="text-xs">Password Reset Link (72h single-use):</strong>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={resetLink}
                      className="h-8 min-w-0 flex-1 font-mono text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void copyToClipboard(resetLink, 'reset')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedKey === 'reset' ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </Alert>
              )}

              {isLead && (
                <div className="grid gap-4 border-t border-zinc-100 pt-3">
                  <div className="grid gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-700">
                        Team Code
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Teammates can enter this Team Code after signing in to request access to{' '}
                        <strong>{session.team.name}</strong>.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={session.team.slug}
                        className="h-8 min-w-0 flex-1 max-w-xs font-mono text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void copyToClipboard(session.team.slug, 'team-code')}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedKey === 'team-code' ? 'Copied!' : 'Copy Code'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2.5 border-t border-zinc-100 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-700">
                          Team Join Link
                        </h3>
                        <p className="text-xs text-zinc-500">
                          Share this link with teammates—no email needed. You approve requests
                          below before they gain access.
                        </p>
                      </div>
                      <Button
                        type="button"
                        disabled={joinLinkMutation.isPending}
                        onClick={() => joinLinkMutation.mutate()}
                      >
                        {joinLinkMutation.isPending ? 'Generating…' : 'Generate Join Link'}
                      </Button>
                    </div>

                    {joinLink && (
                      <Alert className="grid gap-2">
                        <strong className="text-xs">Shareable Team Join Link:</strong>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={joinLink}
                            className="h-8 min-w-0 flex-1 font-mono text-xs"
                            onFocus={(e) => e.currentTarget.select()}
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void copyToClipboard(joinLink, 'join')}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {copiedKey === 'join' ? 'Copied!' : 'Copy'}
                          </Button>
                        </div>
                      </Alert>
                    )}
                  </div>

                  <div className="grid gap-2 border-t border-zinc-100 pt-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-700">
                      Pending Join Requests ({joinRequests.length})
                    </h3>
                    {joinRequests.length === 0 ? (
                      <p className="text-xs text-zinc-500">No pending join requests.</p>
                    ) : (
                      <div className="divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white">
                        {joinRequests.map((reqItem) => (
                          <div
                            key={reqItem.id}
                            className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 sm:flex-1">
                              <div className="truncate text-sm font-semibold text-zinc-950">
                                {reqItem.name}
                              </div>
                              <div className="break-all text-xs text-zinc-500">{reqItem.email}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="xs"
                                disabled={
                                  approveJoinMutation.isPending || rejectJoinMutation.isPending
                                }
                                onClick={() => approveJoinMutation.mutate(reqItem.id)}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="xs"
                                disabled={
                                  approveJoinMutation.isPending || rejectJoinMutation.isPending
                                }
                                onClick={() => rejectJoinMutation.mutate(reqItem.id)}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-zinc-700">
                    Leave Team
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {isLead && otherActiveMembers.length > 0
                      ? 'Assign another teammate as Team Lead before leaving this team.'
                      : 'Leave this team workspace while keeping your account and other teams.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setLeaveError(null);
                    setSuccessorLeadMemberId('');
                    setLeaveModalOpen(true);
                  }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Leave Team
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      )}

      {activeTab === 'categories' && isLead && (
        <div
          key="tab-categories"
          className="auth-form-animate grid grid-cols-1 items-start gap-4 lg:grid-cols-12"
        >
          <div className="flex flex-col gap-4 lg:col-span-5">
            <Card className="border-t-2 border-t-primary">
              <CardHeader className="py-3">
                <CardTitle>Dictionary Quick-Add</CardTitle>
                <span className="text-xs text-zinc-500">Dropdown options</span>
              </CardHeader>
              <CardContent className="grid gap-4 pt-3">
                <form
                  className="grid gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newCategoryName.trim()) createCategoryMutation.mutate();
                  }}
                >
                  <Label htmlFor="quick-cat">1. Add Report Category</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="quick-cat"
                      placeholder="e.g. Support, Communication, Physically Visit"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      required
                    />
                    <Button type="submit" disabled={createCategoryMutation.isPending}>
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                </form>

                <form
                  className="grid gap-3 border-t border-zinc-100 pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (activeCategoryIdForTitle && newTitleName.trim()) {
                      createTitleMutation.mutate();
                    }
                  }}
                >
                  <div className="grid gap-1.5">
                    <Label>2. Add Title Under Category</Label>
                    <Select
                      value={activeCategoryIdForTitle}
                      onValueChange={(v) => setSelectedCategoryId(v)}
                      disabled={dictionary.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {dictionary.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label>3. Target Table</Label>
                    <Select
                      value={newTitleScope}
                      onValueChange={(v) => setNewTitleScope(v as 'daily' | 'followup')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily Work Table (Fixed Row)</SelectItem>
                        <SelectItem value="followup">Follow-up Table</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="quick-title">Title Name</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="quick-title"
                        placeholder="e.g. Daily Calls from User and Desk Support"
                        value={newTitleName}
                        onChange={(e) => setNewTitleName(e.target.value)}
                        required
                      />
                      <Button
                        type="submit"
                        disabled={createTitleMutation.isPending || dictionary.length === 0}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border-t-2 border-t-primary">
              <CardHeader className="py-3">
                <CardTitle>Frequently Used Statuses</CardTitle>
                <CardDescription>
                  Save reusable status templates here. When team members click Add Status, they can
                  click any suggestion to paste it into the status box and customize it.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 pt-3">
                <form
                  className="grid gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = newFrequentStatus.trim();
                    if (!trimmed) return;
                    createFrequentStatusMutation.mutate({
                      text: trimmed,
                      titleIds: newFreqTitleIds,
                    });
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={newFrequentStatus}
                      onChange={(e) => setNewFrequentStatus(e.target.value)}
                      placeholder="e.g., Assisted user with account login"
                      maxLength={2000}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={createFrequentStatusMutation.isPending || !newFrequentStatus.trim()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>

                  {dailyTitleOptions.length > 0 && (
                    <div className="grid gap-1.5 border-t border-zinc-200/70 pt-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Show on rows
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setNewFreqTitleIds([])}
                          className={cn(
                            'cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                            newFreqTitleIds.length === 0
                              ? 'border-primary bg-primary text-white'
                              : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100',
                          )}
                        >
                          All Rows
                        </button>
                        {dailyTitleOptions.map((opt) => {
                          const selected = newFreqTitleIds.includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              title={opt.label}
                              onClick={() =>
                                setNewFreqTitleIds((prev) =>
                                  prev.includes(opt.id)
                                    ? prev.filter((id) => id !== opt.id)
                                    : [...prev, opt.id],
                                )
                              }
                              className={cn(
                                'cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                                selected
                                  ? 'border-primary bg-accent text-accent-foreground'
                                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100',
                              )}
                            >
                              {opt.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </form>

                {frequentStatuses.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No frequently used statuses saved yet.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {(() => {
                      const groups = new Map<
                        string,
                        { label: string; items: typeof frequentStatuses }
                      >();
                      for (const item of frequentStatuses) {
                        const ids = [...(item.titleIds ?? [])].sort();
                        const key = ids.length === 0 ? '__all__' : ids.join(',');
                        let grp = groups.get(key);
                        if (!grp) {
                          const label =
                            ids.length === 0
                              ? 'All Rows'
                              : ids
                                  .map(
                                    (tid) =>
                                      dailyTitleOptions.find((o) => o.id === tid)?.label ??
                                      'Selected Row',
                                  )
                                  .join(' + ');
                          grp = { label, items: [] };
                          groups.set(key, grp);
                        }
                        grp.items.push(item);
                      }
                      return Array.from(groups.entries()).map(([key, grp]) => (
                        <div key={key} className="grid gap-1.5">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                            {grp.label} ({grp.items.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {grp.items.map((item) => (
                              <div
                                key={item.id}
                                className={cn(
                                  'inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs shadow-2xs',
                                  editingFreq?.id === item.id && 'w-full p-2.5',
                                )}
                              >
                                {editingFreq?.id === item.id ? (
                                  <form
                                    className="grid flex-1 gap-2"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const trimmed = editingFreq.statusText.trim();
                                      if (!trimmed) return;
                                      updateFrequentStatusMutation.mutate({
                                        id: item.id,
                                        statusText: trimmed,
                                        titleIds: editingFreq.titleIds,
                                      });
                                    }}
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Input
                                        className="min-w-[160px] flex-1"
                                        value={editingFreq.statusText}
                                        onChange={(e) =>
                                          setEditingFreq({
                                            ...editingFreq,
                                            statusText: e.target.value,
                                          })
                                        }
                                        maxLength={2000}
                                        autoFocus
                                      />
                                      <Button
                                        type="submit"
                                        size="xs"
                                        disabled={updateFrequentStatusMutation.isPending}
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        type="button"
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => setEditingFreq(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                    {dailyTitleOptions.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditingFreq({ ...editingFreq, titleIds: [] })
                                          }
                                          className={cn(
                                            'cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                                            editingFreq.titleIds.length === 0
                                              ? 'border-primary bg-primary text-white'
                                              : 'border-zinc-200 bg-white text-zinc-700',
                                          )}
                                        >
                                          All Rows
                                        </button>
                                        {dailyTitleOptions.map((opt) => {
                                          const sel = editingFreq.titleIds.includes(opt.id);
                                          return (
                                            <button
                                              key={opt.id}
                                              type="button"
                                              title={opt.label}
                                              onClick={() =>
                                                setEditingFreq({
                                                  ...editingFreq,
                                                  titleIds: sel
                                                    ? editingFreq.titleIds.filter(
                                                        (id) => id !== opt.id,
                                                      )
                                                    : [...editingFreq.titleIds, opt.id],
                                                })
                                              }
                                              className={cn(
                                                'cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                                                sel
                                                  ? 'border-primary bg-accent text-accent-foreground'
                                                  : 'border-zinc-200 bg-white text-zinc-700',
                                              )}
                                            >
                                              {opt.shortLabel}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </form>
                                ) : (
                                  <>
                                    <span className="min-w-0 break-words font-medium text-zinc-900">
                                      {item.statusText}
                                    </span>
                                    <button
                                      type="button"
                                      title="Edit template"
                                      onClick={() =>
                                        setEditingFreq({
                                          id: item.id,
                                          statusText: item.statusText,
                                          titleIds: item.titleIds ?? [],
                                        })
                                      }
                                      className="cursor-pointer rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete template"
                                      disabled={deleteFrequentStatusMutation.isPending}
                                      onClick={() => deleteFrequentStatusMutation.mutate(item.id)}
                                      className="cursor-pointer rounded p-0.5 text-rose-500 hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-7">
            <Card className="border-t-2 border-t-primary">
              <CardHeader className="py-3">
                <div>
                  <CardTitle>Manage Categories &amp; Titles</CardTitle>
                  <CardDescription className="mt-0.5">
                    Click a title pill to rename it, or rename/archive categories.
                  </CardDescription>
                </div>
                <Badge variant="secondary" size="sm">
                  {dictionary.length} categories
                </Badge>
              </CardHeader>
              <CardContent className="pt-3">
                {dictionary.length === 0 ? (
                  <p className="text-sm text-zinc-500">No categories created yet.</p>
                ) : (
                  <div className="grid gap-2.5">
                    {dictionary.map((cat) => (
                      <div
                        key={cat.id}
                        className="grid gap-2.5 rounded-md border border-primary-border border-l-4 border-l-primary bg-white p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2">
                          <strong
                            className={cn(
                              'text-sm text-zinc-950',
                              !cat.isActive && 'opacity-60 line-through',
                            )}
                          >
                            {cat.name}
                          </strong>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-xs"
                              title="Edit category"
                              onClick={() =>
                                setRenamePrompt({
                                  type: 'category',
                                  id: cat.id,
                                  currentName: cat.name,
                                })
                              }
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-xs"
                              title={cat.isActive ? 'Archive category' : 'Restore category'}
                              onClick={() =>
                                renameCategoryMutation.mutate({
                                  id: cat.id,
                                  isActive: !cat.isActive,
                                })
                              }
                            >
                              {cat.isActive ? (
                                <Archive className="h-3 w-3" />
                              ) : (
                                <ArchiveRestore className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon-xs"
                              title="Delete category"
                              onClick={() =>
                                setDeleteDictTarget({
                                  type: 'category',
                                  id: cat.id,
                                  name: cat.name,
                                })
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {cat.titles.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {cat.titles.map((t) => (
                              <div
                                key={t.id}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs',
                                  !t.isActive && 'opacity-60',
                                )}
                              >
                                <span
                                  className={cn(
                                    'font-medium text-zinc-800',
                                    !t.isActive && 'line-through',
                                  )}
                                >
                                  {t.name}
                                </span>
                                <button
                                  type="button"
                                  title="Click to switch between Daily Table and Follow-up Table"
                                  onClick={() =>
                                    renameTitleMutation.mutate({
                                      id: t.id,
                                      scope: t.scope === 'followup' ? 'daily' : 'followup',
                                    })
                                  }
                                  className={cn(
                                    'cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                                    t.scope === 'followup'
                                      ? 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300'
                                      : 'bg-accent text-accent-foreground border border-primary-border/60 hover:bg-accent/80',
                                  )}
                                >
                                  {t.scope === 'followup' ? 'Follow-up' : 'Daily'}
                                </button>
                                <button
                                  type="button"
                                  title="Edit title"
                                  onClick={() =>
                                    setRenamePrompt({
                                      type: 'title',
                                      id: t.id,
                                      currentName: t.name,
                                    })
                                  }
                                  className="cursor-pointer rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  title={t.isActive ? 'Archive title' : 'Restore title'}
                                  onClick={() =>
                                    renameTitleMutation.mutate({
                                      id: t.id,
                                      isActive: !t.isActive,
                                    })
                                  }
                                  className="cursor-pointer rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                                >
                                  {t.isActive ? (
                                    <Archive className="h-3 w-3" />
                                  ) : (
                                    <ArchiveRestore className="h-3 w-3" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  title="Delete title"
                                  onClick={() =>
                                    setDeleteDictTarget({
                                      type: 'title',
                                      id: t.id,
                                      name: t.name,
                                    })
                                  }
                                  className="cursor-pointer rounded p-0.5 text-rose-500 hover:bg-rose-100 hover:text-rose-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
        </div>
      </div>
      )}

      <PromptDialog
        open={Boolean(renamePrompt)}
        onOpenChange={(open) => {
          if (!open) setRenamePrompt(null);
        }}
        title={renamePrompt?.type === 'category' ? 'Rename Category' : 'Rename Title'}
        description="Update the display name shown in dropdowns and reports."
        fieldLabel="Name"
        initialValue={renamePrompt?.currentName ?? ''}
        confirmLabel="Save Name"
        pending={renameCategoryMutation.isPending || renameTitleMutation.isPending}
        onConfirm={(next) => {
          if (!renamePrompt) return;
          const trimmed = next.trim();
          if (!trimmed || trimmed === renamePrompt.currentName) {
            setRenamePrompt(null);
            return;
          }
          if (renamePrompt.type === 'category') {
            renameCategoryMutation.mutate({ id: renamePrompt.id, name: trimmed });
          } else {
            renameTitleMutation.mutate({ id: renamePrompt.id, name: trimmed });
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteDictTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteDictTarget(null);
        }}
        title={deleteDictTarget?.type === 'category' ? 'Delete Category' : 'Delete Title'}
        description={`Permanently delete "${deleteDictTarget?.name ?? ''}"? If it is used in existing reports, archive it instead.`}
        confirmLabel="Delete"
        destructive
        pending={deleteCategoryMutation.isPending || deleteTitleMutation.isPending}
        onConfirm={() => {
          if (!deleteDictTarget) return;
          if (deleteDictTarget.type === 'category') {
            deleteCategoryMutation.mutate(deleteDictTarget.id);
          } else {
            deleteTitleMutation.mutate(deleteDictTarget.id);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(removeMemberTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveMemberTarget(null);
        }}
        title="Remove Team Member"
        description={`Remove ${removeMemberTarget?.displayName ?? 'this member'} from ${session.team.name}? They will lose access to this team immediately.`}
        confirmLabel="Remove Member"
        destructive
        pending={deactivateMutation.isPending}
        onConfirm={() => {
          if (removeMemberTarget) deactivateMutation.mutate(removeMemberTarget.id);
        }}
      />

      {leaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl">
            <div className="flex items-center gap-2">
              <LogOut className="h-4 w-4 text-rose-600" />
              <h3 className="text-base font-bold text-zinc-950">Leave {session.team.name}</h3>
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              {isLead && otherActiveMembers.length > 0
                ? 'Because you are leaving as a Team Lead, select another member to take over as Team Lead first.'
                : otherActiveMembers.length === 0
                  ? 'You are the only active member left in this team. Are you sure you want to leave?'
                  : `Are you sure you want to leave ${session.team.name}? You can rejoin later if invited or with a Team Code.`}
            </p>

            {leaveError && (
              <Alert variant="destructive" className="mt-3">
                {leaveError}
              </Alert>
            )}

            {isLead && otherActiveMembers.length > 0 && (
              <div className="mt-4 grid gap-1.5">
                <Label htmlFor="leave-successor">Assign New Team Lead</Label>
                <Select
                  value={successorLeadMemberId}
                  onValueChange={setSuccessorLeadMemberId}
                >
                  <SelectTrigger id="leave-successor">
                    <SelectValue placeholder="Choose a member to promote as Lead" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherActiveMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName} ({m.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={leaveTeamMutation.isPending}
                onClick={() => setLeaveModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={
                  leaveTeamMutation.isPending ||
                  (isLead && otherActiveMembers.length > 0 && !successorLeadMemberId)
                }
                onClick={() => {
                  setLeaveError(null);
                  leaveTeamMutation.mutate();
                }}
              >
                {leaveTeamMutation.isPending
                  ? 'Leaving…'
                  : isLead && otherActiveMembers.length > 0
                    ? 'Assign Lead & Leave'
                    : 'Leave Team'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
