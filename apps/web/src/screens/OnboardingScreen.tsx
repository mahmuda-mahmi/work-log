import { useState } from 'react';
import type { AuthSession } from '@cghq/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LogOut, PlusCircle, RefreshCw, Users } from 'lucide-react';
import { authApi } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

interface OnboardingScreenProps {
  session: AuthSession;
  onLogout: () => void;
  logoutPending: boolean;
}

export function OnboardingScreen({
  session,
  onLogout,
  logoutPending,
}: OnboardingScreenProps) {
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [codeOrLink, setCodeOrLink] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [joinedTeamName, setJoinedTeamName] = useState<string | null>(
    session.pendingJoinTeamName ?? null,
  );

  const createTeamMutation = useMutation({
    mutationFn: () =>
      authApi.createTeam({
        teamName: teamName.trim(),
        teamSlug: teamSlug.trim() || undefined,
        timezone: 'Asia/Dhaka',
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const joinTeamMutation = useMutation({
    mutationFn: () => authApi.joinByCode({ codeOrLink: codeOrLink.trim() }),
    onSuccess: async (res) => {
      setErrorMsg(null);
      setCodeOrLink('');
      setJoinedTeamName(res.teamName);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 w-full border-t-[3px] border-t-primary border-b border-b-zinc-800 bg-zinc-950 text-white shadow-sm">
        <div className="mx-auto flex min-h-14 w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-white px-2.5">
              <img
                src="/default-logo.png"
                alt="Solution Art"
                className="h-6 w-auto object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white">CGHQ Work Log</span>
              <span className="text-xs text-zinc-400">
                {session.user.name} · {session.user.email}
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="dark"
            size="sm"
            className="border-zinc-700 bg-zinc-900 text-white hover:border-zinc-600 hover:bg-zinc-800"
            disabled={logoutPending}
            onClick={onLogout}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="bg-grid-subtle flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="grid w-full max-w-[920px] gap-5">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
              Welcome, {session.user.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Create a new team workspace or join an existing team using a code or invite link.
            </p>
          </div>

          {errorMsg && <Alert variant="destructive">{errorMsg}</Alert>}

          {joinedTeamName && (
            <Alert variant="success" className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Join request sent to <strong>{joinedTeamName}</strong>. Waiting for the Team Lead
                  to approve your access.
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['me'] })}
              >
                <RefreshCw className="h-3 w-3" />
                Check Approval
              </Button>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4 text-primary" />
                  <CardTitle>Create a Team</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <CardDescription className="mb-4">
                  Start a new daily work log workspace and become its Team Lead.
                </CardDescription>
                <form
                  className="grid gap-3.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setErrorMsg(null);
                    createTeamMutation.mutate();
                  }}
                >
                  <div className="grid gap-1.5">
                    <Label htmlFor="onb-team-name">Team Name</Label>
                    <Input
                      id="onb-team-name"
                      value={teamName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTeamName(val);
                        setTeamSlug(
                          val
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/(^-|-$)/g, ''),
                        );
                      }}
                      placeholder="e.g. CGHQ"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="onb-team-slug">Team Code (Slug)</Label>
                    <Input
                      id="onb-team-slug"
                      value={teamSlug}
                      onChange={(e) => setTeamSlug(e.target.value)}
                      placeholder="e.g. cghq"
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      required
                    />
                    <span className="text-[11px] text-zinc-500">
                      Teammates can use this code to request to join your team.
                    </span>
                  </div>
                  <Button type="submit" disabled={createTeamMutation.isPending}>
                    {createTeamMutation.isPending ? 'Creating Team…' : 'Create Team'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-zinc-950 shadow-md">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-zinc-950" />
                  <CardTitle>Join a Team</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <CardDescription className="mb-4">
                  Enter the Team Code (e.g. <code className="font-mono">cghq</code>) or paste the
                  Join Link shared by your Team Lead.
                </CardDescription>
                <form
                  className="grid gap-3.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setErrorMsg(null);
                    joinTeamMutation.mutate();
                  }}
                >
                  <div className="grid gap-1.5">
                    <Label htmlFor="onb-join-code">Team Code or Join Link</Label>
                    <Input
                      id="onb-join-code"
                      value={codeOrLink}
                      onChange={(e) => setCodeOrLink(e.target.value)}
                      placeholder="e.g. cghq or https://.../join/..."
                      required
                    />
                  </div>
                  <Button type="submit" variant="dark" disabled={joinTeamMutation.isPending}>
                    {joinTeamMutation.isPending ? 'Sending Request…' : 'Request to Join Team'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
