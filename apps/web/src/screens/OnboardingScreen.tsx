import { useState } from 'react';
import type { AuthSession, UserTeamSummary } from '@cghq/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, PlusCircle, RefreshCw, Users } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { authApi } from '../api/client';
import { ProfileMenu } from '../components/ProfileMenu';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { activateTeamWorkspace, resolvePreviousPagePath } from '../lib/navigation';

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
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [codeOrLink, setCodeOrLink] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [returningBack, setReturningBack] = useState(false);
  const [joinedTeamName, setJoinedTeamName] = useState<string | null>(
    session.pendingJoinTeamName ?? null,
  );

  const myTeamsQuery = useQuery({
    queryKey: ['my-teams'],
    queryFn: authApi.listMyTeams,
    retry: false,
  });

  const fallbackTeams: UserTeamSummary[] =
    session.team && session.member
      ? [
          {
            teamId: session.team.id,
            teamName: session.team.name,
            teamSlug: session.team.slug,
            role: session.member.role,
            displayName: session.member.displayName,
          },
        ]
      : [];
  const joinedTeams = myTeamsQuery.data ?? fallbackTeams;
  const hasJoinedTeam = joinedTeams.length > 0;
  const previousPath = resolvePreviousPagePath(location.state, hasJoinedTeam);

  const createTeamMutation = useMutation({
    mutationFn: () =>
      authApi.createTeam({
        teamName: teamName.trim(),
        teamSlug: teamSlug.trim() || undefined,
        timezone: 'Asia/Dhaka',
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['my-teams'] }),
      ]);
      navigate('/today');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const joinTeamMutation = useMutation({
    mutationFn: () => authApi.joinByCode({ codeOrLink: codeOrLink.trim() }),
    onSuccess: async (res) => {
      setErrorMsg(null);
      setCodeOrLink('');
      setJoinedTeamName(res.teamName);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['my-teams'] }),
      ]);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const enterTeamMutation = useMutation({
    mutationFn: (teamId: string) =>
      activateTeamWorkspace(queryClient, teamId, authApi.switchTeam),
    onSuccess: () => {
      setErrorMsg(null);
      navigate('/today');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  async function handleGoBack() {
    if (!previousPath) return;
    setErrorMsg(null);
    if (!session.team && joinedTeams.length > 0 && previousPath !== '/') {
      setReturningBack(true);
      try {
        await activateTeamWorkspace(queryClient, joinedTeams[0]!.teamId, authApi.switchTeam);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not return to team workspace');
        setReturningBack(false);
        return;
      }
      setReturningBack(false);
    }
    navigate(previousPath);
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 w-full border-t-[3px] border-t-primary border-b border-b-zinc-800 bg-zinc-950 text-white shadow-sm">
        <div className="mx-auto flex min-h-14 w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              title="Back to Landing Page"
              className="flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-white px-2.5 transition-opacity hover:opacity-90"
            >
              <img
                src="/default-logo.png"
                alt="Solution Art"
                className="h-6 w-auto object-contain"
              />
            </Link>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white">Work Log</span>
              <span className="text-xs text-zinc-400">
                {session.user.name} · {session.user.email}
              </span>
            </div>
          </div>

          <ProfileMenu
            session={session}
            onLogout={onLogout}
            logoutPending={logoutPending}
          />
        </div>
      </header>

      <main className="bg-grid-subtle flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="grid w-full max-w-[920px] gap-5">
          {previousPath && (
            <div className="flex items-center justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={returningBack || enterTeamMutation.isPending}
                onClick={() => void handleGoBack()}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {returningBack ? 'Returning…' : 'Back to Previous Page'}
              </Button>
            </div>
          )}

          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
              Welcome, {session.user.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Create a new team workspace or join an existing team using a code or invite link.
            </p>
          </div>

          {errorMsg && <Alert variant="destructive">{errorMsg}</Alert>}

          {joinedTeams.length > 0 && (
            <Card className="border-zinc-200 shadow-sm">
              <CardHeader className="py-3">
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">
                      {joinedTeams.length === 1 ? 'Your Joined Team' : 'Your Joined Teams'}
                    </CardTitle>
                  </div>
                  <span className="text-xs text-zinc-500">
                    Open an existing workspace without creating a new team
                  </span>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 pt-3">
                {joinedTeams.map((t) => {
                  const isCurrent = session.team?.id === t.teamId;
                  return (
                    <div
                      key={t.teamId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-zinc-950">
                            {t.teamName}
                          </span>
                          <Badge variant={t.role === 'lead' ? 'default' : 'secondary'} size="sm">
                            {t.role}
                          </Badge>
                          {isCurrent && (
                            <Badge variant="outline" size="sm">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-500">
                          Code: <span className="font-mono">{t.teamSlug}</span> · As {t.displayName}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={enterTeamMutation.isPending || returningBack}
                        onClick={() => enterTeamMutation.mutate(t.teamId)}
                      >
                        {enterTeamMutation.isPending ? 'Opening…' : 'Open Workspace'}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {joinedTeamName && (
            <Alert variant="success" className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Join request sent to <strong>{joinedTeamName}</strong>. Waiting for the Team Lead
                  to approve your access—this page will automatically open your workspace once
                  approved.
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
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="e.g. Engineering or Team X"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="onb-team-slug">Team Code</Label>
                    <Input
                      id="onb-team-slug"
                      value={teamSlug}
                      onChange={(e) => setTeamSlug(e.target.value)}
                      placeholder="e.g. 2EC0DERTW"
                      minLength={2}
                      maxLength={80}
                      required
                    />
                    <span className="text-[11px] text-zinc-500">
                      Create any custom code (2–80 characters, no slashes). Teammates can use this
                      code to request to join your team.
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
