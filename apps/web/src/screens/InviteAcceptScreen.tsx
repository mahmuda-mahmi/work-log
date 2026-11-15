import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { authApi } from '../api/client';

export function InviteAcceptScreen() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <main className="container">
      <section className="card auth-card">
        <h1>Accept Team Invite</h1>
        <p className="subtitle">Create your account to join the team.</p>
        {errorMsg && <p className="error">{errorMsg}</p>}
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
            <span>Password (min 12 chars)</span>
            <input
              type="password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Joining…' : 'Join Team'}
          </button>
        </form>
      </section>
    </main>
  );
}
