import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { authApi } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function JoinTeamScreen() {
  const { token = '' } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submittedTeam, setSubmittedTeam] = useState<string | null>(
    searchParams.get('requested') === '1' ? 'Team' : null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(
    searchParams.get('error') === 'invalid_link' ? 'This join link is invalid or expired.' : null,
  );

  const { data: status } = useQuery({
    queryKey: ['bootstrap-status'],
    queryFn: authApi.bootstrapStatus,
    retry: false,
  });

  const joinMutation = useMutation({
    mutationFn: () =>
      authApi.submitJoinRequest({
        token,
        name: name.trim(),
        email: email.trim(),
        password,
      }),
    onSuccess: (res) => {
      setErrorMsg(null);
      setSubmittedTeam(res.teamName);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  return (
    <main className="bg-grid-subtle flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-[440px] border-t-4 border-t-primary shadow-lg">
        <CardContent className="p-6">
          <div className="mb-4 flex justify-center">
            <img src="/default-logo.png" alt="Solution Art" className="h-11 w-auto object-contain" />
          </div>

          {submittedTeam ? (
            <div className="grid gap-4 text-center">
              <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="grid gap-1">
                <h1 className="text-xl font-bold tracking-tight text-zinc-950">
                  Join Request Sent
                </h1>
                <p className="text-xs leading-relaxed text-zinc-600">
                  Your request to join <strong>{submittedTeam}</strong> has been submitted. Once
                  the Team Lead approves your request in Settings, you can sign in to access the
                  workspace.
                </p>
              </div>
              <Link to="/login" className={buttonVariants({ variant: 'dark', size: 'default' })}>
                Go to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-5 text-center">
                <h1 className="text-xl font-bold tracking-tight text-zinc-950">Request to Join Team</h1>
                <p className="mt-1 text-xs text-zinc-500">
                  Submit your details or continue with Google. The Team Lead will approve your
                  access.
                </p>
              </div>

              {errorMsg && (
                <Alert variant="destructive" className="mb-4">
                  {errorMsg}
                </Alert>
              )}

              {status?.googleEnabled !== false && (
                <div className="mb-4 grid gap-3">
                  <a
                    href={`/api/auth/google?joinToken=${encodeURIComponent(token)}`}
                    className={buttonVariants({ variant: 'dark', size: 'default' })}
                  >
                    Continue with Google
                  </a>
                  <div className="relative flex items-center justify-center">
                    <span className="h-px w-full bg-zinc-200" />
                    <span className="bg-white px-2.5 text-[11px] font-semibold uppercase text-zinc-400">
                      or
                    </span>
                    <span className="h-px w-full bg-zinc-200" />
                  </div>
                </div>
              )}

              <form
                className="grid gap-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setErrorMsg(null);
                  joinMutation.mutate();
                }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="join-name">Display Name</Label>
                  <Input
                    id="join-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="join-email">Email</Label>
                  <Input
                    id="join-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="join-password">Password (min 8 chars)</Label>
                  <div className="relative">
                    <Input
                      id="join-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-900"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={joinMutation.isPending}>
                  {joinMutation.isPending ? 'Submitting…' : 'Request to Join Team'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
