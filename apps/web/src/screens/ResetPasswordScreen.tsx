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
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-logo-wrap">
          <img src="/default-logo.png" alt="Solution Art" className="auth-logo" />
        </div>
        <div className="auth-header">
          <h1>Reset Password</h1>
          <p className="subtitle">Choose a new password of at least 8 characters.</p>
        </div>

        {errorMsg && (
          <div className="alert-error" style={{ marginBottom: 12 }}>
            {errorMsg}
          </div>
        )}

        {done ? (
          <div className="stack">
            <div className="alert-success">
              Password updated. All previous sessions have been revoked.
            </div>
            <Link to="/login" className="btn-primary btn-block">
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
            <button type="submit" className="btn-primary btn-block" disabled={mutation.isPending}>
              {mutation.isPending ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
