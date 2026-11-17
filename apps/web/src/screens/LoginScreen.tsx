import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { authApi } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function LoginScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['bootstrap-status'],
    queryFn: authApi.bootstrapStatus,
    retry: false,
  });

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const oauthErrorParam = searchParams.get('error');
  const initialOauthError =
    oauthErrorParam === 'google_not_configured'
      ? 'Google Sign-In is not configured yet (add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel).'
      : oauthErrorParam === 'google_unverified_email'
        ? 'Please use a Google account with a verified email address.'
        : oauthErrorParam
          ? 'Google Sign-In failed. Please try again.'
          : null;
  const [errorMsg, setErrorMsg] = useState<string | null>(initialOauthError);

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/today');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/today');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  return (
    <main className="bg-grid-subtle flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-[420px] border-t-4 border-t-primary shadow-lg">
        <CardContent className="p-6">
          <div className="mb-4 flex justify-center">
            <img src="/default-logo.png" alt="Solution Art" className="h-11 w-auto object-contain" />
          </div>
          <div className="mb-4 text-center">
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              {mode === 'login'
                ? 'Sign in to access your daily team work log.'
                : 'Create your account, then create or join a team.'}
            </p>
          </div>

          <div className="relative mb-4 grid grid-cols-2 rounded-lg bg-zinc-100 p-1">
            <div
              aria-hidden
              className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-md bg-zinc-950 shadow-sm transition-transform duration-300 ease-out"
              style={{
                transform: mode === 'register' ? 'translateX(calc(100% + 0px))' : 'translateX(0)',
              }}
            />
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`relative z-10 h-8 cursor-pointer rounded-md text-xs font-semibold transition-colors duration-200 ${
                mode === 'login' ? 'text-white' : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
              }}
              className={`relative z-10 h-8 cursor-pointer rounded-md text-xs font-semibold transition-colors duration-200 ${
                mode === 'register' ? 'text-white' : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              {errorMsg}
            </Alert>
          )}

          {mode === 'register' ? (
            <form
              key="register-form"
              className="auth-form-animate grid gap-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                setErrorMsg(null);
                registerMutation.mutate({ name, email, password });
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="reg-name">Your Name</Label>
                <Input
                  id="reg-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="reg-pw">Password (min 8 chars)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="reg-pw"
                    type={showPassword ? 'text' : 'password'}
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="mt-1 w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? 'Creating Account…' : 'Create Account'}
              </Button>
            </form>
          ) : (
            <form
              key="login-form"
              className="auth-form-animate grid gap-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                setErrorMsg(null);
                loginMutation.mutate({ email, password });
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="login-pw">Password</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="login-pw"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="mt-1 w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>
          )}

          {status?.googleEnabled !== false && (
            <div className="mt-3.5 grid gap-3">
              <div className="relative flex items-center justify-center">
                <span className="h-px w-full bg-zinc-200" />
                <span className="bg-white px-2.5 text-[11px] font-semibold uppercase text-zinc-400">
                  or
                </span>
                <span className="h-px w-full bg-zinc-200" />
              </div>
              <a
                href="/api/auth/google?next=/today"
                className={buttonVariants({ variant: 'dark', size: 'default' })}
              >
                Continue with Google
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
