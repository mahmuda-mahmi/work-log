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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [teamName, setTeamName] = useState('CGHQ');
  const [teamSlug, setTeamSlug] = useState('cghq');
  const [name, setName] = useState('');
  const oauthErrorParam = searchParams.get('error');
  const initialOauthError =
    oauthErrorParam === 'google_not_configured'
      ? 'Google Sign-In is not configured yet (add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel).'
      : oauthErrorParam === 'no_active_team'
        ? 'Your Google account is not an active member of any team yet. Ask your Team Lead for a join link or to approve your request.'
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

  const bootstrapMutation = useMutation({
    mutationFn: authApi.bootstrap,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['bootstrap-status'] });
      navigate('/today');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const needsBootstrap = status?.needsBootstrap === true;

  return (
    <main className="bg-grid-subtle flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-[420px] border-t-4 border-t-primary shadow-lg">
        <CardContent className="p-6">
          <div className="mb-4 flex justify-center">
            <img src="/default-logo.png" alt="Solution Art" className="h-11 w-auto object-contain" />
          </div>
          <div className="mb-5 text-center">
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              {needsBootstrap ? 'Initial Team Setup' : 'Sign In'}
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              {needsBootstrap
                ? 'Create the first Team Lead account and workspace.'
                : 'Sign in to access your daily team work log.'}
            </p>
          </div>

          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              {errorMsg}
            </Alert>
          )}

          {needsBootstrap ? (
            <form
              className="grid gap-3.5"
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
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="boot-team">Team Name</Label>
                  <Input
                    id="boot-team"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="boot-slug">Team Slug</Label>
                  <Input
                    id="boot-slug"
                    value={teamSlug}
                    onChange={(e) => setTeamSlug(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="boot-name">Your Full Name</Label>
                <Input
                  id="boot-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="boot-email">Email</Label>
                <Input
                  id="boot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="boot-pw">Password (min 8 chars)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="boot-pw"
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
              <Button
                type="submit"
                className="mt-1 w-full"
                disabled={bootstrapMutation.isPending}
              >
                {bootstrapMutation.isPending ? 'Creating…' : 'Create Team & Sign In'}
              </Button>
            </form>
          ) : (
            <form
              className="grid gap-3.5"
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
              {status?.googleEnabled !== false && (
                <>
                  <div className="relative my-1 flex items-center justify-center">
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
                </>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
