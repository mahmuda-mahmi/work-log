import { useQuery } from '@tanstack/react-query';
import { Route, Routes } from 'react-router';
import { HealthResponseSchema, type HealthResponse } from '@cghq/contracts';

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  const json = await res.json();
  return HealthResponseSchema.parse(json);
}

function HomeScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  return (
    <main className="container">
      <header className="header">
        <h1>CGHQ Team Work Report</h1>
        <p className="subtitle">Daily work log &amp; automated DOCX/PDF reporting</p>
      </header>

      <section className="card" aria-label="System status">
        <h2>System Status</h2>
        {isLoading && <p className="muted">Checking API &amp; MySQL connection…</p>}
        {error && (
          <p className="error">
            API unreachable: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        )}
        {data && (
          <dl className="status-grid">
            <div>
              <dt>API</dt>
              <dd className={data.status === 'ok' ? 'ok' : 'warn'}>{data.status}</dd>
            </div>
            <div>
              <dt>Database</dt>
              <dd className={data.db === 'up' ? 'ok' : 'warn'}>{data.db}</dd>
            </div>
            <div>
              <dt>Migration</dt>
              <dd>{data.migrationVersion ?? 'not applied'}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<HomeScreen />} />
    </Routes>
  );
}
