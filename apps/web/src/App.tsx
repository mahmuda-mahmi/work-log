import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes } from 'react-router';
import { HealthResponseSchema, type HealthResponse } from '@cghq/contracts';
import { authApi } from './api/client';
import { InviteAcceptScreen } from './screens/InviteAcceptScreen';
import { LoginScreen } from './screens/LoginScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { SettingsScreen } from './screens/SettingsScreen';

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return HealthResponseSchema.parse(await res.json());
}

function TodayPlaceholder() {
  const { data } = useQuery({ queryKey: ['health'], queryFn: fetchHealth });
  return (
    <section className="card">
      <h2>Today&apos;s Report</h2>
      <p className="muted">
        Daily entry composer, grouping, and live preview will be added in Phase 3.
      </p>
      {data && (
        <p className="muted">
          System: <strong>{data.status}</strong> · DB: <strong>{data.db}</strong>
        </p>
      )}
    </section>
  );
}

function AuthenticatedShell() {
  const queryClient = useQueryClient();
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
      <main className="container">
        <p className="muted">Loading session…</p>
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1>{session.team.name}</h1>
          <p className="subtitle">
            {session.member.displayName} · {session.member.role}
          </p>
        </div>
        <nav className="nav-links">
          <Link to="/">Today</Link>
          <Link to="/settings">Settings</Link>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => logoutMutation.mutate()}
          >
            Sign Out
          </button>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<TodayPlaceholder />} />
        <Route path="/settings" element={<SettingsScreen session={session} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
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
