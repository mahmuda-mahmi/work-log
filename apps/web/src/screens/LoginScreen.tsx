import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { authApi } from '../api/client';

export function LoginScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['bootstrap-status'],
    queryFn: authApi.bootstrapStatus,
    retry: false,
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [teamName, setTeamName] = useState('CGHQ');
  const [teamSlug, setTeamSlug] = useState('cghq');
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const bootstrapMutation = useMutation({
    mutationFn: authApi.bootstrap,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['bootstrap-status'] });
      navigate('/');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const needsBootstrap = status?.needsBootstrap === true;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-logo-wrap">
          <img src="/default-logo.png" alt="Solution Art" className="auth-logo" />
        </div>
        <div className="auth-header">
          <h1>{needsBootstrap ? 'Initial Team Setup' : 'Sign In'}</h1>
          <p className="subtitle">
            {needsBootstrap
              ? 'Create the first Team Lead account and workspace.'
              : 'Sign in to access your daily team work log.'}
          </p>
        </div>

        {errorMsg && (
          <div className="alert-error" style={{ marginBottom: 12 }}>
            {errorMsg}
          </div>
        )}

        {needsBootstrap ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              setErrorMsg(null);
              bootstrapMutation.mutate({
                teamName,
                teamSlug,
                timezone: 'Asia/Dhaka',
                name,
                email,
                password,
              });
            }}
          >
            <div className="composer-grid">
              <label className="field">
                <span>Team Name</span>
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
              </label>
              <label className="field">
                <span>Team Slug</span>
                <input value={teamSlug} onChange={(e) => setTeamSlug(e.target.value)} required />
              </label>
            </div>
            <label className="field">
              <span>Your Full Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>Password (min 8 chars)</span>
              <div className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-secondary password-toggle-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <button
              type="submit"
              className="btn-primary btn-block"
              disabled={bootstrapMutation.isPending}
            >
              {bootstrapMutation.isPending ? 'Creating…' : 'Create Team & Sign In'}
            </button>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              setErrorMsg(null);
              loginMutation.mutate({ email, password });
            }}
          >
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>Password</span>
              <div className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-secondary password-toggle-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <button
              type="submit"
              className="btn-primary btn-block"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
