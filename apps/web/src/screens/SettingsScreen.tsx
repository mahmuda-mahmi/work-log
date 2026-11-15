import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSession } from '@cghq/contracts';
import { dictionaryApi, teamsApi } from '../api/client';

export function SettingsScreen({ session }: { session: AuthSession }) {
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

  const renameCategoryMutation = useMutation({
    mutationFn: ({ id, name, isActive }: { id: string; name?: string; isActive?: boolean }) =>
      dictionaryApi.updateCategory(teamId, id, { name, isActive }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
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

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setStatusMsg('Select the link and press Ctrl+C to copy.');
    }
  }

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'lead'>('member');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [newTitleName, setNewTitleName] = useState('');

  const [docTitle, setDocTitle] = useState<string | null>(null);
  const [filePrefix, setFilePrefix] = useState<string | null>(null);
  const [preparedBy, setPreparedBy] = useState<string | null>(null);

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

  const renameTitleMutation = useMutation({
    mutationFn: ({ id, name, isActive }: { id: string; name?: string; isActive?: boolean }) =>
      dictionaryApi.updateTitle(teamId, id, { name, isActive }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      teamsApi.createInvite(teamId, {
        email: inviteEmail.trim() || undefined,
        role: inviteRole,
      }),
    onSuccess: (res) => {
      setInviteLink(`${window.location.origin}${res.invitePath}`);
      setInviteEmail('');
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members', teamId] }),
    onError: (err: Error) => setStatusMsg(err.message),
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

  return (
    <div className="stack">
      {statusMsg && <p className="ok">{statusMsg}</p>}

      <section className="card">
        <h2>Team Settings</h2>
        {settings && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              saveSettings.mutate();
            }}
          >
            <label className="field">
              <span>Document Title</span>
              <input
                disabled={!isLead}
                value={docTitle ?? settings.documentTitle}
                onChange={(e) => setDocTitle(e.target.value)}
              />
            </label>
            <label className="field">
              <span>File Prefix</span>
              <input
                disabled={!isLead}
                value={filePrefix ?? settings.filePrefix}
                onChange={(e) => setFilePrefix(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Default Prepared By</span>
              <input
                disabled={!isLead}
                value={preparedBy ?? settings.preparedByDefault ?? ''}
                onChange={(e) => setPreparedBy(e.target.value)}
              />
            </label>
            {isLead && (
              <button type="submit" className="btn-primary" disabled={saveSettings.isPending}>
                Save Settings
              </button>
            )}
          </form>
        )}

        {isLead && (
          <div className="stack" style={{ marginTop: 16 }}>
            <label className="field">
              <span>Team Logo (PNG/JPEG, max 1 MB, max 1000 px)</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) logoMutation.mutate(file);
                }}
              />
            </label>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Team Members</h2>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id} className="member-row">
              <div>
                <strong>{m.displayName}</strong> ({m.role})
                <div className="muted">{m.email} {!m.isActive && '· Inactive'}</div>
              </div>
              {isLead && m.isActive && (
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      roleMutation.mutate({
                        memberId: m.id,
                        role: m.role === 'lead' ? 'member' : 'lead',
                      })
                    }
                  >
                    Make {m.role === 'lead' ? 'Member' : 'Lead'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => resetMutation.mutate(m.id)}
                  >
                    Reset Link
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => deactivateMutation.mutate(m.id)}
                  >
                    Deactivate
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {resetLink && (
          <div className="banner-info" style={{ marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <strong>Password Reset Link (72h single-use):</strong>
              <input
                readOnly
                value={resetLink}
                style={{ marginTop: 6, width: '100%' }}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => void copyToClipboard(resetLink, 'reset')}
            >
              {copiedKey === 'reset' ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        )}

        {isLead && (
          <form
            className="stack"
            style={{ marginTop: 16 }}
            onSubmit={(e) => {
              e.preventDefault();
              inviteMutation.mutate();
            }}
          >
            <h3>Invite Member</h3>
            <label className="field">
              <span>Email (optional)</span>
              <input
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'member' | 'lead')}
              >
                <option value="member">Member</option>
                <option value="lead">Team Lead</option>
              </select>
            </label>
            <button type="submit" className="btn-primary" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? 'Generating...' : 'Generate Invite Link'}
            </button>

            {inviteLink && (
              <div className="banner-info" style={{ marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <strong>Invite Link (72h single-use):</strong>
                  <input
                    readOnly
                    value={inviteLink}
                    style={{ marginTop: 6, width: '100%' }}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => void copyToClipboard(inviteLink, 'invite')}
                >
                  {copiedKey === 'invite' ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            )}
          </form>
        )}
      </section>

      {isLead && (
        <>
          <section className="card">
            <h2>1. Add Report Category</h2>
            <p className="muted">
              Add a new Report Category option that appears in the Entry and Follow-up dropdowns.
            </p>
            <form
              className="composer-grid"
              style={{ marginTop: 10, alignItems: 'end' }}
              onSubmit={(e) => {
                e.preventDefault();
                if (newCategoryName.trim()) createCategoryMutation.mutate();
              }}
            >
              <label className="field">
                <span>Category Name</span>
                <input
                  type="text"
                  placeholder="e.g. Support, Communication, Physically Visit"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="btn-primary"
                disabled={createCategoryMutation.isPending}
              >
                {createCategoryMutation.isPending ? 'Adding...' : 'Add Category'}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>2. Add Title to Category</h2>
            <p className="muted">
              Add a Title option under a Report Category so team members can pick it from the
              dropdown.
            </p>
            <form
              className="composer-grid"
              style={{ marginTop: 10, alignItems: 'end' }}
              onSubmit={(e) => {
                e.preventDefault();
                if (newTitleName.trim()) createTitleMutation.mutate();
              }}
            >
              <label className="field">
                <span>Report Category</span>
                <select
                  value={selectedCategoryId || dictionary[0]?.id || ''}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  disabled={dictionary.length === 0}
                >
                  {dictionary.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Title Name</span>
                <input
                  type="text"
                  placeholder="e.g. Daily Calls from User and Desk Support"
                  value={newTitleName}
                  onChange={(e) => setNewTitleName(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="btn-primary"
                disabled={createTitleMutation.isPending || dictionary.length === 0}
              >
                {createTitleMutation.isPending ? 'Adding...' : 'Add Title'}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>3. Manage Existing Categories &amp; Titles</h2>
            <p className="muted">
              Click a title to rename it, or rename/archive categories.
            </p>
            {dictionary.length === 0 ? (
              <p className="muted">No categories created yet.</p>
            ) : (
              <div className="entries-list" style={{ marginTop: 12 }}>
                {dictionary.map((cat) => (
                  <div key={cat.id} className="entry-edit-box">
                    <div className="group-header">
                      <strong>{cat.name}</strong>
                      <div className="group-controls">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            const next = window.prompt('Rename category:', cat.name);
                            if (next && next.trim() && next.trim() !== cat.name) {
                              renameCategoryMutation.mutate({ id: cat.id, name: next.trim() });
                            }
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() =>
                            renameCategoryMutation.mutate({
                              id: cat.id,
                              isActive: !cat.isActive,
                            })
                          }
                        >
                          {cat.isActive ? 'Archive' : 'Restore'}
                        </button>
                      </div>
                    </div>
                    {cat.titles.length > 0 && (
                      <div className="member-pills">
                        {cat.titles.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className={t.isActive ? 'pill' : 'pill badge-muted'}
                            title="Click to rename title"
                            onClick={() => {
                              const next = window.prompt('Rename title:', t.name);
                              if (next && next.trim() && next.trim() !== t.name) {
                                renameTitleMutation.mutate({ id: t.id, name: next.trim() });
                              }
                            }}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
