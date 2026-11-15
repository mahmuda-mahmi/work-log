import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { authApi } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';

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
    <main className="bg-grid-subtle flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-[420px] border-t-4 border-t-primary shadow-lg">
        <CardContent className="p-6">
          <div className="mb-4 flex justify-center">
            <img src="/default-logo.png" alt="Solution Art" className="h-11 w-auto object-contain" />
          </div>
          <div className="mb-5 text-center">
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">Reset Password</h1>
            <p className="mt-1 text-xs text-zinc-500">
              Choose a new password of at least 8 characters.
            </p>
          </div>

          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              {errorMsg}
            </Alert>
          )}

          {done ? (
            <div className="grid gap-3.5">
              <Alert variant="success">
                Password updated. All previous sessions have been revoked.
              </Alert>
              <Link to="/login" className={cn(buttonVariants(), 'w-full')}>
                Go to Sign In
              </Link>
            </div>
          ) : (
            <form
              className="grid gap-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                setErrorMsg(null);
                mutation.mutate({ token, newPassword });
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="reset-pw">New Password (min 8 chars)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="reset-pw"
                    type={showPassword ? 'text' : 'password'}
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
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
                {mutation.isPending ? 'Updating…' : 'Set New Password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
