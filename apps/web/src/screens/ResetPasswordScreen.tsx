import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { authApi } from '../api/client';

export function ResetPasswordScreen() {
  const { token = '' } = useParams();
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: authApi.completeReset,
    onSuccess: () => setDone(true),
    onError: (err: Error) => setErrorMsg(err.message),
  });

  return (
    <main className="container">
      <section className="card auth-card">
        <h1>Reset Password</h1>
        {errorMsg && <p className="error">{errorMsg}</p>}
        {done ? (
          <div className="stack">
            <p className="ok">Password updated. All previous sessions have been revoked.</p>
            <Link to="/login" className="btn-primary">
              Go to Sign In
            </Link>
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              setErrorMsg(null);
              mutation.mutate({ token, newPassword });
            }}
          >
            <label className="field">
              <span>New Password (min 8 chars)</span>
              <div className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
