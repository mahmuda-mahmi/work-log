import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActiveAuthSession, DocumentFontFamily } from '@cghq/contracts';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Moon,
  Palette,
  Pencil,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react';
import { dictionaryApi, teamsApi } from '../api/client';
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

export function SettingsScreen({ session }: { session: ActiveAuthSession }) {
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

  const [joinLink, setJoinLink] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [newTitleName, setNewTitleName] = useState('');
  const [renamePrompt, setRenamePrompt] = useState<RenamePromptState>(null);
  const [deleteDictTarget, setDeleteDictTarget] = useState<DeleteDictTarget>(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'appearance'>('general');
  const [appearance, setAppearance] = useState(() => readAppearancePrefs());

  const [docTitle, setDocTitle] = useState<string | null>(null);
  const [filePrefix, setFilePrefix] = useState<string | null>(null);
  const [preparedBy, setPreparedBy] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [docFontFamily, setDocFontFamily] = useState<DocumentFontFamily | null>(null);
  const [docFontSizePt, setDocFontSizePt] = useState<number | null>(null);

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
      await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
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
      await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
    },
    onError: (err: Error) => {
      setDeleteDictTarget(null);
      setStatusMsg(err.message);
    },
  });

  const saveTypographyMutation = useMutation({
    mutationFn: () =>
      teamsApi.updateSettings(teamId, {
        documentFontFamily: docFontFamily ?? settings?.documentFontFamily ?? 'Liberation Serif',
        documentFontSizePt: docFontSizePt ?? settings?.documentFontSizePt ?? 11,
      }),
    onSuccess: async () => {
      setStatusMsg('Document typography saved.');
      await queryClient.invalidateQueries({ queryKey: ['team-settings', teamId] });
    },
    onError: (err: Error) => setStatusMsg(err.message),
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
      return dictionaryApi.createTitle(teamId, targetCatId, newTitleName.trim());
    },
    onSuccess: async (created) => {
      setNewTitleName('');
      setStatusMsg(`Title "${created.name}" added to dropdown.`);
      await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const renameTitleMutation = useMutation({
    mutationFn: ({ id, name, isActive }: { id: string; name?: string; isActive?: boolean }) =>
      dictionaryApi.updateTitle(teamId, id, { name, isActive }),
    onSuccess: async () => {
      setRenamePrompt(null);
      await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
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

  const logoMutation = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return teamsApi.uploadLogo(teamId, file.name, btoa(binary));
    },
    onSuccess: async () => {
      setStatusMsg('Logo updated.');
      await queryClient.invalidateQueries({ queryKey: ['team-settings', teamId] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => setStatusMsg(err.message),
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
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-2.5">
        <Button
          type="button"
          size="sm"
          variant={activeTab === 'general' ? 'default' : 'outline'}
          onClick={() => setActiveTab('general')}
        >
          General &amp; Team
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeTab === 'appearance' ? 'default' : 'outline'}
          onClick={() => setActiveTab('appearance')}
        >
          <Palette className="h-3.5 w-3.5" />
          Appearance
        </Button>
      </div>

      {statusMsg && <Alert variant="success">{statusMsg}</Alert>}

      {activeTab === 'appearance' ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
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

          <Card className="border-t-2 border-t-primary">
            <CardHeader className="py-3">
              <CardTitle>Document Font &amp; Size</CardTitle>
              <CardDescription>
                Customize the font family and body text size used in the live preview, DOCX, and
                PDF exports.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pt-3">
              <div className="grid gap-1.5">
                <Label htmlFor="doc-font-family">Document Font Family</Label>
                <Select
                  value={docFontFamily ?? settings?.documentFontFamily ?? 'Liberation Serif'}
                  disabled={!isLead}
                  onValueChange={(val) => setDocFontFamily(val as DocumentFontFamily)}
                >
                  <SelectTrigger id="doc-font-family">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Liberation Serif">
                      Liberation Serif / Times New Roman
                    </SelectItem>
                    <SelectItem value="Helvetica">Helvetica / Arial (Sans-serif)</SelectItem>
                    <SelectItem value="Courier">Courier (Monospace)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="doc-font-size">Document Font Size</Label>
                <Select
                  value={String(docFontSizePt ?? settings?.documentFontSizePt ?? 11)}
                  disabled={!isLead}
                  onValueChange={(val) => setDocFontSizePt(Number(val))}
                >
                  <SelectTrigger id="doc-font-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[9, 10, 11, 12, 13, 14].map((pt) => (
                      <SelectItem key={pt} value={String(pt)}>
                        {pt} pt {pt === 11 ? '(Default)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className="rounded-md border border-zinc-200 bg-white p-3 text-zinc-950"
                style={{
                  fontFamily:
                    (docFontFamily ?? settings?.documentFontFamily ?? 'Liberation Serif') ===
                    'Helvetica'
                      ? 'Arial, Helvetica, sans-serif'
                      : (docFontFamily ?? settings?.documentFontFamily ?? 'Liberation Serif') ===
                          'Courier'
                        ? 'Courier New, Courier, monospace'
                        : "'Liberation Serif', 'Times New Roman', serif",
                  fontSize: `${docFontSizePt ?? settings?.documentFontSizePt ?? 11}pt`,
                }}
              >
                <div className="font-bold">Sample Daily Report Text</div>
                <div>Date: 17 November 2026 — Help for Login &amp; Support Calls.</div>
              </div>

              {isLead ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={saveTypographyMutation.isPending}
                    onClick={() => saveTypographyMutation.mutate()}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {saveTypographyMutation.isPending ? 'Saving…' : 'Save Document Typography'}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  Only the Team Lead can change the team&apos;s exported document font settings.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        {/* Left Column (5 cols) */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card className="border-t-2 border-t-primary">
            <CardHeader className="py-3">
              <CardTitle>My Profile</CardTitle>
              <CardDescription>
                Choose the name shown for you in daily work entries, DOCX, and PDF exports.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-3">
              <div className="text-xs text-zinc-500">
                Signed in as <strong className="text-zinc-800">{session.user.name}</strong> (
                {session.user.email})
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
              <CardTitle>Team Settings &amp; Branding</CardTitle>
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

              {isLead && (
                <div className="grid gap-1.5 border-t border-zinc-100 pt-3">
                  <Label htmlFor="set-team-logo">
                    Team Logo (PNG/JPEG, max 1 MB, max 1000 px)
                  </Label>
                  <Input
                    id="set-team-logo"
                    type="file"
                    accept="image/png,image/jpeg"
                    className="h-auto py-1.5"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) logoMutation.mutate(file);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {isLead && (
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
                    if (newTitleName.trim()) createTitleMutation.mutate();
                  }}
                >
                  <div className="grid gap-1.5">
                    <Label>2. Select Category</Label>
                    <Select
                      value={activeCategoryIdForTitle}
                      onValueChange={setSelectedCategoryId}
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
          )}
        </div>

        {/* Right Column (7 cols) */}
        <div className="flex flex-col gap-4 lg:col-span-7">
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
                    className="flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-zinc-950">{m.displayName}</strong>
                        <Badge
                          variant={m.role === 'lead' ? 'default' : 'secondary'}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {m.role}
                        </Badge>
                      </div>
                      <div className="text-xs text-zinc-500">
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
                      className="h-8 font-mono text-xs"
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
                        className="h-8 max-w-xs font-mono text-xs"
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
                            className="h-8 font-mono text-xs"
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
                            className="flex flex-wrap items-center justify-between gap-2 p-2.5"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-950">
                                {reqItem.name}
                              </div>
                              <div className="text-xs text-zinc-500">{reqItem.email}</div>
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
            </CardContent>
          </Card>

          {isLead && (
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
                        className="grid gap-2.5 rounded-md border border-orange-200 border-l-4 border-l-primary bg-white p-3"
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
          )}
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
    </div>
  );
}
