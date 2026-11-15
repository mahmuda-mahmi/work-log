import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { authApi } from './api/client';
import { IconLogOut } from './components/ui/icons';
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
      <div className="auth-shell">
        <div className="card" style={{ padding: '18px 28px' }}>
          <p className="muted">Loading workspace session…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const path = location.pathname;
  const isTodayActive = path === '/' || path.startsWith('/reports/');
  const isFollowupsActive = path.startsWith('/followups');
  const isHistoryActive = path.startsWith('/history');
  const isSettingsActive = path.startsWith('/settings');

  return (
    <div className="app-shell">
      <header className="topbar-shell">
        <div className="topbar">
          <div className="brand-cluster">
            <div className="brand-logo-pill">
              <img
                src="/default-logo.png"
                alt="Solution Art logo"
                className="brand-logo-img"
              />
            </div>
            <div className="brand-meta">
              <div className="brand-title-row">
                <span className="brand-title">{session.team.name}</span>
                <span
                  className={`role-chip ${
                    session.member.role === 'lead' ? 'role-chip-lead' : 'role-chip-member'
                  }`}
                >
                  {session.member.role}
                </span>
              </div>
              <span className="brand-subtitle">{session.member.displayName}</span>
            </div>
          </div>

          <nav className="nav-links" aria-label="Main navigation">
            <Link to="/" className={`nav-link ${isTodayActive ? 'nav-link-active' : ''}`}>
              Today
            </Link>
            <Link
              to="/followups"
              className={`nav-link ${isFollowupsActive ? 'nav-link-active' : ''}`}
            >
              Follow-ups
            </Link>
            <Link
              to="/history"
              className={`nav-link ${isHistoryActive ? 'nav-link-active' : ''}`}
            >
              History
            </Link>
            <Link
              to="/settings"
              className={`nav-link ${isSettingsActive ? 'nav-link-active' : ''}`}
            >
              Settings
            </Link>
            <span className="nav-divider" aria-hidden="true" />
            <button
              type="button"
              className="btn-secondary nav-logout"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              <IconLogOut size={13} />
              Sign Out
            </button>
          </nav>
        </div>
      </header>

      <main className="container">
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
