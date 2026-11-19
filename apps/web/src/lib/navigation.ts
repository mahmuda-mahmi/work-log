import type { QueryClient } from '@tanstack/react-query';

const LAST_SAFE_ROUTE_KEY = 'cghq:lastSafeRoute';

// Auth and onboarding routes must never be stored as "previous page" targets,
// otherwise a Back button could trap the user on the same page or bounce to login.
const DISALLOWED_RETURN_PREFIXES = [
  '/teams/new',
  '/login',
  '/invite/',
  '/join/',
  '/reset-password/',
];

export function sanitizeReturnPath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (
    DISALLOWED_RETURN_PREFIXES.some(
      (prefix) => trimmed === prefix || trimmed.startsWith(prefix),
    )
  ) {
    return null;
  }
  return trimmed;
}

export function rememberReturnRoute(path: string): void {
  const safe = sanitizeReturnPath(path);
  if (!safe) return;
  try {
    window.sessionStorage.setItem(LAST_SAFE_ROUTE_KEY, safe);
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function readLastReturnRoute(): string | null {
  try {
    return sanitizeReturnPath(window.sessionStorage.getItem(LAST_SAFE_ROUTE_KEY));
  } catch {
    return null;
  }
}

export function clearRememberedReturnRoute(): void {
  try {
    window.sessionStorage.removeItem(LAST_SAFE_ROUTE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function resolvePreviousPagePath(
  state: unknown,
  hasJoinedTeam: boolean,
): string | null {
  const stateFrom =
    state && typeof state === 'object' && 'from' in state
      ? sanitizeReturnPath((state as { from?: unknown }).from)
      : null;
  const candidate = stateFrom ?? readLastReturnRoute();

  if (!hasJoinedTeam) {
    // Users with no joined teams would only bounce back to onboarding on workspace routes.
    return candidate === '/' ? '/' : null;
  }

  return candidate ?? '/today';
}

export async function activateTeamWorkspace(
  queryClient: QueryClient,
  teamId: string,
  switchTeamFn: (teamId: string) => Promise<unknown>,
): Promise<void> {
  await switchTeamFn(teamId);
  queryClient.removeQueries({ queryKey: ['report'] });
  queryClient.removeQueries({ queryKey: ['followups'] });
  queryClient.removeQueries({ queryKey: ['dictionary'] });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['me'] }),
    queryClient.invalidateQueries({ queryKey: ['my-teams'] }),
  ]);
}
