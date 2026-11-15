import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { authApi } from './api/client';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import { FollowupsScreen } from './screens/FollowupsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { InviteAcceptScreen } from './screens/InviteAcceptScreen';
import { LoginScreen } from './screens/LoginScreen';
import { ReportScreen } from './screens/ReportScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { SettingsScreen } from './screens/SettingsScreen';

function AuthenticatedShell() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: session, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: async () => {
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (isLoading) {
    return (
      <div className="bg-grid-subtle flex min-h-screen items-center justify-center p-6">
        <div className="rounded-lg border border-zinc-200 bg-white px-6 py-4 text-sm text-zinc-500 shadow-xs">
          Loading workspace session…
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const path = location.pathname;
  const navItems = [
    { to: '/', label: 'Today', active: path === '/' || path.startsWith('/reports/') },
    { to: '/followups', label: 'Follow-ups', active: path.startsWith('/followups') },
    { to: '/history', label: 'History', active: path.startsWith('/history') },
    { to: '/settings', label: 'Settings', active: path.startsWith('/settings') },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="no-print sticky top-0 z-40 w-full border-t-[3px] border-t-primary border-b border-b-zinc-800 bg-zinc-950 text-white shadow-sm">
        <div className="mx-auto flex min-h-14 w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-white px-2.5">
              <img
                src="/default-logo.png"
                alt="Solution Art"
                className="h-6 w-auto object-contain"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold tracking-tight text-white">
                  {session.team.name}
                </span>
                <Badge
                  variant={session.member.role === 'lead' ? 'default' : 'secondary'}
                  className={cn(
                    'h-5 px-1.5 text-[10px]',
                    session.member.role === 'lead'
                      ? 'border-primary/40 bg-primary/20 text-primary'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-200',
                  )}
                >
                  {session.member.role}
                </Badge>
              </div>
              <span className="truncate text-xs text-zinc-400">{session.member.displayName}</span>
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
                    ? 'bg-primary text-zinc-950 font-bold'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white',
                )}
              >
                {item.label}
              </Link>
            ))}
            <span className="mx-1.5 hidden h-5 w-px bg-zinc-800 sm:inline-block" aria-hidden />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
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
        <Routes>
          <Route path="/" element={<ReportScreen session={session} />} />
          <Route path="/reports/:date" element={<ReportScreen session={session} />} />
          <Route path="/followups" element={<FollowupsScreen session={session} />} />
          <Route path="/history" element={<HistoryScreen session={session} />} />
          <Route path="/settings" element={<SettingsScreen session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/invite/:token" element={<InviteAcceptScreen />} />
      <Route path="/reset-password/:token" element={<ResetPasswordScreen />} />
      <Route path="/*" element={<AuthenticatedShell />} />
    </Routes>
  );
}
