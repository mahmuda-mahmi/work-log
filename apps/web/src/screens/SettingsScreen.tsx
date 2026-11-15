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

  const renameTitleMutation = useMutation({
    mutationFn: ({ id, name, isActive }: { id: string; name?: string; isActive?: boolean }) =>
      dictionaryApi.updateTitle(teamId, id, { name, isActive }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'lead'>('member');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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

  const inviteMutation = useMutation({
    mutationFn: () =>
      teamsApi.createInvite(teamId, {
        email: inviteEmail.trim() || undefined,
        role: inviteRole,
      }),
    onSuccess: (res) => {
      setGeneratedLink(`${window.location.origin}${res.invitePath}`);
      setInviteEmail('');
    },
    onError: (err: Error) => setStatusMsg(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: (memberId: string) => teamsApi.issuePasswordReset(teamId, memberId),
    onSuccess: (res) => {
      setGeneratedLink(`${window.location.origin}${res.resetPath}`);
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
      {generatedLink && (
        <section className="card">
          <h3>Copyable Link (72h single-use)</h3>
          <input
            readOnly
            value={generatedLink}
            onFocus={(e) => e.currentTarget.select()}
          />
        </section>
      )}

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
              Generate Invite Link
            </button>
          </form>
        )}
      </section>

      {isLead && (
        <section className="card">
          <h2>Categories &amp; Titles Dictionary</h2>
          <p className="muted">
            Rename or archive autocomplete categories and titles used in daily work entries.
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
                          renameCategoryMutation.mutate({ id: cat.id, isActive: !cat.isActive })
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
      )}
    </div>
  );
}
