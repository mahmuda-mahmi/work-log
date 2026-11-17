import { lazy, Suspense, useEffect } from 'react';
import type { ActiveAuthSession, AuthSession } from '@cghq/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { authApi } from './api/client';
import { PageCardSkeleton, WorkspaceShellSkeleton } from './components/WorkspaceSkeleton';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import { LandingScreen } from './screens/LandingScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ReportScreen } from './screens/ReportScreen';

const FollowupsScreen = lazy(() =>
  import('./screens/FollowupsScreen').then((m) => ({ default: m.FollowupsScreen })),
);
const HistoryScreen = lazy(() =>
  import('./screens/HistoryScreen').then((m) => ({ default: m.HistoryScreen })),
);
const InviteAcceptScreen = lazy(() =>
  import('./screens/InviteAcceptScreen').then((m) => ({ default: m.InviteAcceptScreen })),
);
const JoinTeamScreen = lazy(() =>
  import('./screens/JoinTeamScreen').then((m) => ({ default: m.JoinTeamScreen })),
);
const LoginScreen = lazy(() =>
  import('./screens/LoginScreen').then((m) => ({ default: m.LoginScreen })),
);
const ResetPasswordScreen = lazy(() =>
  import('./screens/ResetPasswordScreen').then((m) => ({ default: m.ResetPasswordScreen })),
);
const SettingsScreen = lazy(() =>
  import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);

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

function AuthenticatedShell() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const cachedSession = readCachedSession();

  const {
    data: session,
    isLoading,
    isError,
  } = useQuery({
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

  if (isLoading && !session) {
    return <WorkspaceShellSkeleton />;
  }

  if (isError || !session) {
    return <Navigate to="/login" replace />;
  }

  if (!session.team || !session.member || location.pathname === '/teams/new') {
    return (
      <OnboardingScreen
        session={session}
        onLogout={() => logoutMutation.mutate()}
        logoutPending={logoutMutation.isPending}
      />
    );
  }

  const activeSession: ActiveAuthSession = {
    ...session,
    team: session.team,
    member: session.member,
  };

  const path = location.pathname;
  const navItems = [
    { to: '/today', label: 'Today', active: path === '/today' || path.startsWith('/reports/') },
    { to: '/followups', label: 'Follow-ups', active: path.startsWith('/followups') },
    { to: '/history', label: 'History', active: path.startsWith('/history') },
    { to: '/settings', label: 'Settings', active: path.startsWith('/settings') },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="no-print sticky top-0 z-40 w-full border-t-[3px] border-t-primary border-b border-b-zinc-800 bg-zinc-950 text-white shadow-sm">
        <div className="mx-auto flex min-h-14 w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
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
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold tracking-tight text-white">
                  {activeSession.team.name}
                </span>
                <Badge
                  variant={activeSession.member.role === 'lead' ? 'default' : 'secondary'}
                  className={cn(
                    'h-5 px-1.5 text-[10px]',
                    activeSession.member.role === 'lead'
                      ? 'border-primary/40 bg-primary/20 text-primary'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-200',
                  )}
                >
                  {activeSession.member.role}
                </Badge>
              </div>
              <span className="truncate text-xs text-zinc-400">
                {activeSession.member.displayName}
              </span>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap',
                  item.active
                    ? 'bg-primary text-white font-bold'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white',
                )}
              >
                {item.label}
              </Link>
            ))}
            <span className="mx-1.5 hidden h-5 w-px bg-zinc-800 sm:inline-block" aria-hidden />
            <Button
              type="button"
              variant="dark"
              size="sm"
              className="border-zinc-700 bg-zinc-900 text-white hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-4 sm:px-6 sm:py-5">
        <Suspense fallback={<PageCardSkeleton rows={5} />}>
          <Routes>
            <Route path="/today" element={<ReportScreen session={activeSession} />} />
            <Route path="/reports/:date" element={<ReportScreen session={activeSession} />} />
            <Route path="/followups" element={<FollowupsScreen session={activeSession} />} />
            <Route path="/history" element={<HistoryScreen session={activeSession} />} />
            <Route path="/settings" element={<SettingsScreen session={activeSession} />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<WorkspaceShellSkeleton />}>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/invite/:token" element={<InviteAcceptScreen />} />
        <Route path="/join/:token" element={<JoinTeamScreen />} />
        <Route path="/reset-password/:token" element={<ResetPasswordScreen />} />
        <Route path="/*" element={<AuthenticatedShell />} />
      </Routes>
    </Suspense>
  );
}
