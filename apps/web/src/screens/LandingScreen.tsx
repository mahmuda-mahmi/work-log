import { useEffect, useState } from 'react';
import type { AuthSession, UserTeamSummary } from '@cghq/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, CheckCircle2, FileDown, Layers, ListChecks, Plus, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { authApi } from '../api/client';
import { ProfileMenu } from '../components/ProfileMenu';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '../lib/utils';

const SESSION_CACHE_KEY = 'cghq:session';

function readCachedSession(): AuthSession | undefined {
  try {
    const raw = window.localStorage.getItem(SESSION_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedSession(session: AuthSession | null): void {
  try {
    if (session) {
      window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_CACHE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

const FEATURES = [
  {
    icon: Layers,
    title: 'Structured Daily Entries',
    description:
      'Log support calls, communication updates, and field visits into canonical report sections with clear serial ordering.',
  },
  {
    icon: ListChecks,
    title: 'Persistent Follow-up Tracking',
    description:
      'Carry forward open follow-up items automatically across daily reports and update or promote tasks in one click.',
  },
  {
    icon: FileDown,
    title: 'One-Click PDF & DOCX Export',
    description:
      'Finalize daily logs and export formatted, print-ready PDF and Word documents with team branding.',
  },
];

export function LandingScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cachedSession = readCachedSession();
  const [teamsPopupOpen, setTeamsPopupOpen] = useState(false);
  const [teamsList, setTeamsList] = useState<UserTeamSummary[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: session, isError } = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    retry: false,
    placeholderData: cachedSession,
  });

  useEffect(() => {
    if (isError) {
      writeCachedSession(null);
    } else if (session) {
      writeCachedSession(session);
    }
  }, [session, isError]);

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: async () => {
      writeCachedSession(null);
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const enterTeamMutation = useMutation({
    mutationFn: (teamId: string) => authApi.switchTeam(teamId),
    onSuccess: async () => {
      setTeamsPopupOpen(false);
      queryClient.removeQueries({ queryKey: ['report'] });
      queryClient.removeQueries({ queryKey: ['followups'] });
      queryClient.removeQueries({ queryKey: ['dictionary'] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/today');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const isSignedIn = Boolean(session && !isError);

  async function handleOpenWorkLog() {
    if (!isSignedIn) {
      navigate('/today');
      return;
    }
    setLoadingTeams(true);
    setErrorMsg(null);
    try {
      const teams = await authApi.listMyTeams();
      if (teams.length === 1) {
        await authApi.switchTeam(teams[0]!.teamId);
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        navigate('/today');
        return;
      }
      if (teams.length === 0) {
        navigate('/today');
        return;
      }
      setTeamsList(teams);
      setTeamsPopupOpen(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load joined teams');
      setTeamsPopupOpen(true);
    } finally {
      setLoadingTeams(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-t-[3px] border-t-primary border-b border-b-zinc-800 bg-zinc-950 text-white shadow-sm">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-white px-2.5">
              <img
                src="/default-logo.png"
                alt="Solution Art"
                className="h-6 w-auto object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white">Work Log</span>
              <span className="text-[11px] text-zinc-400">
                {isSignedIn && session
                  ? session.team && session.member
                    ? `${session.team.name} · ${session.member.displayName}`
                    : session.user.name || session.user.email
                  : 'Daily Team Reporting'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSignedIn && session ? (
              <ProfileMenu
                session={session}
                onLogout={() => logoutMutation.mutate()}
                logoutPending={logoutMutation.isPending}
              />
            ) : (
              <Link
                to="/login"
                className={buttonVariants({
                  variant: 'dark',
                  size: 'sm',
                  className: 'border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800',
                })}
              >
                Sign In
              </Link>
            )}
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={loadingTeams}
              onClick={() => void handleOpenWorkLog()}
            >
              {loadingTeams ? 'Loading…' : 'Open Work Log'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="bg-grid-subtle flex flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mx-auto grid w-full max-w-[1100px] gap-8">
          {/* Hero Card */}
          <Card className="overflow-hidden border-t-4 border-t-primary shadow-md">
            <CardContent className="grid gap-6 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div className="grid gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="default" size="sm">
                    Solution Art · Work Log
                  </Badge>
                  <Badge variant="dark" size="sm">
                    Daily Work Report
                  </Badge>
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-4xl">
                  Team Daily Work Log &amp; Report Workspace
                </h1>

                <p className="max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base">
                  Record daily support, communication, and project progress in one structured place,
                  manage ongoing follow-ups, and export finalized PDF &amp; DOCX reports in seconds.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="button"
                    variant="default"
                    size="default"
                    disabled={loadingTeams}
                    onClick={() => void handleOpenWorkLog()}
                  >
                    {loadingTeams ? 'Loading…' : 'Go to Work Log'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  {isSignedIn ? (
                    <Link
                      to="/teams/new"
                      className={buttonVariants({ variant: 'dark', size: 'default' })}
                    >
                      <Plus className="h-4 w-4" />
                      Create New Team
                    </Link>
                  ) : (
                    <Link
                      to="/login"
                      className={buttonVariants({ variant: 'dark', size: 'default' })}
                    >
                      Team Sign In
                    </Link>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm">
                <div className="mb-3 flex items-center justify-between border-b border-zinc-800 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Workflow Ready
                  </span>
                  <Badge variant="default" size="sm">
                    Live
                  </Badge>
                </div>
                <ul className="grid gap-3 text-sm text-zinc-200">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Pre-configured Support, Communication &amp; Visit sections</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Real-time live document preview as entries are added</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Instant PDF &amp; Word (.docx) export after finalization</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* 3-Column Feature Strip */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <Card key={feat.title} className="border-t-2 border-t-zinc-950">
                  <CardContent className="grid gap-2.5 p-5">
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-zinc-950 text-white">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-sm font-bold text-zinc-950">{feat.title}</h2>
                    <p className="text-xs leading-relaxed text-zinc-600">{feat.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>

      {teamsPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-base font-bold text-zinc-950">Choose Team to Enter</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Select which joined team workspace you want to open.
            </p>

            {errorMsg && (
              <Alert variant="destructive" className="mt-3">
                {errorMsg}
              </Alert>
            )}

            <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
              {teamsList.map((t) => {
                const isCurrent = session?.team?.id === t.teamId;
                return (
                  <button
                    key={t.teamId}
                    type="button"
                    disabled={enterTeamMutation.isPending}
                    onClick={() => enterTeamMutation.mutate(t.teamId)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
                      isCurrent
                        ? 'border-primary bg-accent/70'
                        : 'border-zinc-200 bg-white hover:bg-zinc-50',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-950">
                        {t.teamName}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        Code: <span className="font-mono">{t.teamSlug}</span> · As {t.displayName}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={t.role === 'lead' ? 'default' : 'secondary'} size="sm">
                        {t.role}
                      </Badge>
                      {isCurrent && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTeamsPopupOpen(false);
                  navigate('/teams/new');
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Create or Join Team
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTeamsPopupOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
