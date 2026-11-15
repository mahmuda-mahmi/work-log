import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { authApi } from '../api/client';

export function InviteAcceptScreen() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: authApi.acceptInvite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-logo-wrap">
          <img src="/default-logo.png" alt="Solution Art" className="auth-logo" />
        </div>
        <div className="auth-header">
          <h1>Accept Team Invite</h1>
          <p className="subtitle">
            One-time setup to join your workspace. Next time, sign in directly.
          </p>
        </div>

        {errorMsg && (
          <div className="alert-error" style={{ marginBottom: 12 }}>
            {errorMsg}
          </div>
        )}

        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setErrorMsg(null);
            mutation.mutate({ token, name, email, password });
          }}
        >
          <label className="field">
            <span>Display Name</span>
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
          <button type="submit" className="btn-primary btn-block" disabled={mutation.isPending}>
            {mutation.isPending ? 'Joining…' : 'Join Team'}
          </button>
          <p className="auth-footer">
            Already joined? <Link to="/login">Sign In</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
