import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { authApi } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

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
          <div className="mb-5 text-center">
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">Accept Team Invite</h1>
            <p className="mt-1 text-xs text-zinc-500">
              One-time setup to join your workspace. Next time, sign in directly.
            </p>
          </div>

          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              {errorMsg}
            </Alert>
          )}

          <form
            className="grid gap-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              setErrorMsg(null);
              mutation.mutate({ token, name, email, password });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="invite-name">Display Name</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-pw">Password (min 8 chars)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="invite-pw"
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
            <Button type="submit" className="mt-1 w-full" disabled={mutation.isPending}>
              {mutation.isPending ? 'Joining…' : 'Join Team'}
            </Button>
            <p className="text-center text-xs text-zinc-500">
              Already joined?{' '}
              <Link to="/login" className="font-semibold text-orange-600 hover:underline">
                Sign In
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
