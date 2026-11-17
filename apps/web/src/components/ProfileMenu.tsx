import { useEffect, useRef, useState } from 'react';
import type { AuthSession, UserTeamSummary } from '@cghq/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, LogOut, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { authApi } from '../api/client';
import { cn } from '../lib/utils';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface ProfileMenuProps {
  session: AuthSession;
  onLogout: () => void;
  logoutPending?: boolean;
}

function getInitials(name: string, email: string): string {
  const source = (name || email).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

async function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileMenu({ session, onLogout, logoutPending = false }: ProfileMenuProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [teamsList, setTeamsList] = useState<UserTeamSummary[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const avatarMutation = useMutation({
    mutationFn: (avatarUrl: string | null) => authApi.updateAvatar(avatarUrl),
    onSuccess: async () => {
      setErrorMsg(null);
      setPhotoModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const switchMutation = useMutation({
    mutationFn: (teamId: string) => authApi.switchTeam(teamId),
    onSuccess: async () => {
      setSwitchModalOpen(false);
      queryClient.removeQueries({ queryKey: ['report'] });
      queryClient.removeQueries({ queryKey: ['followups'] });
      queryClient.removeQueries({ queryKey: ['dictionary'] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/today');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  async function handleSwitchTeamsClick() {
    setMenuOpen(false);
    setErrorMsg(null);
    setLoadingTeams(true);
    try {
      const teams = await authApi.listMyTeams();
      if (teams.length <= 1) {
        navigate('/teams/new');
        return;
      }
      setTeamsList(teams);
      setSwitchModalOpen(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load teams');
    } finally {
      setLoadingTeams(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      avatarMutation.mutate(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process image');
    }
  }

  const initials = getInitials(session.member?.displayName || session.user.name, session.user.email);

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          title={`${session.user.name} (${session.user.email})`}
          aria-label="Profile menu"
          className={cn(
            'flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-zinc-700 bg-zinc-800 text-xs font-bold text-white transition-all hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary',
          )}
        >
          {session.user.avatarUrl ? (
            <img
              src={session.user.avatarUrl}
              alt={session.user.name}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span>{initials}</span>
          )}
        </button>

        {menuOpen && (
          <div className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-900 shadow-lg">
            <div className="border-b border-zinc-100 px-2.5 py-2">
              <div className="truncate text-xs font-bold text-zinc-950">
                {session.member?.displayName || session.user.name}
              </div>
              <div className="truncate text-[11px] text-zinc-500">{session.user.email}</div>
            </div>

            <div className="mt-1 grid gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setErrorMsg(null);
                  setPhotoModalOpen(true);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
              >
                <Camera className="h-3.5 w-3.5 text-zinc-500" />
                Change Profile Picture
              </button>

              <button
                type="button"
                disabled={loadingTeams}
                onClick={() => void handleSwitchTeamsClick()}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
                {loadingTeams ? 'Loading Teams…' : 'Switch Teams'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/teams/new');
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
              >
                <Plus className="h-3.5 w-3.5 text-zinc-500" />
                Create Team
              </button>

              <div className="my-1 border-t border-zinc-100" />

              <button
                type="button"
                disabled={logoutPending}
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                {logoutPending ? 'Signing out…' : 'Sign Out'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change / Delete Profile Picture Modal */}
      {photoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl">
            <h3 className="text-base font-bold text-zinc-950">Profile Picture</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Upload a PNG or JPEG photo, or remove your current picture.
            </p>

            {errorMsg && (
              <Alert variant="destructive" className="mt-3">
                {errorMsg}
              </Alert>
            )}

            <div className="mt-4 flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-zinc-200 bg-zinc-900 text-xl font-bold text-white">
                {session.user.avatarUrl ? (
                  <img
                    src={session.user.avatarUrl}
                    alt={session.user.name}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleFileSelect(e)}
              />

              <div className="flex w-full flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={avatarMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-3.5 w-3.5" />
                  {avatarMutation.isPending ? 'Saving…' : 'Upload Photo'}
                </Button>

                {session.user.avatarUrl && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={avatarMutation.isPending}
                    onClick={() => avatarMutation.mutate(null)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Photo
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPhotoModalOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Switch Teams Modal */}
      {switchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-base font-bold text-zinc-950">Switch Teams</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Choose which joined team workspace you want to open.
            </p>

            {errorMsg && (
              <Alert variant="destructive" className="mt-3">
                {errorMsg}
              </Alert>
            )}

            <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
              {teamsList.map((t) => {
                const isCurrent = session.team?.id === t.teamId;
                return (
                  <button
                    key={t.teamId}
                    type="button"
                    disabled={switchMutation.isPending}
                    onClick={() => {
                      if (isCurrent) {
                        setSwitchModalOpen(false);
                        return;
                      }
                      switchMutation.mutate(t.teamId);
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
                      isCurrent
                        ? 'border-primary bg-orange-50/70'
                        : 'border-zinc-200 bg-white hover:bg-zinc-50',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-950">
                        {t.teamName}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        Code: <span className="font-mono">{t.teamSlug}</span> · As {t.displayName}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={t.role === 'lead' ? 'default' : 'secondary'} size="sm">
                        {t.role}
                      </Badge>
                      {isCurrent && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSwitchModalOpen(false);
                  navigate('/teams/new');
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Create or Join Team
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSwitchModalOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
