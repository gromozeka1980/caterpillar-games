import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, sbSelectOne } from './sbRest';

// Supabase client is used ONLY for auth (signIn/signOut/session/onAuthStateChange).
// All data access goes through sbRest (raw fetch) because the supabase-js
// query machinery has known hang issues (see sbRest.ts).
//
// We still pass a no-op lock as a defensive measure against the navigator.locks
// deadlock bug affecting auth operations:
//   https://github.com/supabase/supabase-js/issues/1594
//   https://github.com/supabase/supabase-js/issues/2013
const noopLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  return await fn();
};

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    lock: noopLock,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

let currentUser: User | null = null;
let currentProfile: Profile | null = null;

export function getUser(): User | null {
  return currentUser;
}

export function getCurrentProfile(): Profile | null {
  return currentProfile;
}

export function isSignedIn(): boolean {
  return currentUser !== null;
}

export function isCurrentUserAdmin(): boolean {
  return !!currentProfile?.is_admin;
}

export function isCurrentUserBeta(): boolean {
  return !!(currentProfile?.is_beta || currentProfile?.is_admin);
}

async function loadCurrentProfile() {
  if (!currentUser) { currentProfile = null; return; }
  try {
    currentProfile = await sbSelectOne<Profile>('profiles', { id: `eq.${currentUser.id}` });
  } catch {
    currentProfile = null;
  }
}

export function isSupabaseAvailable(): boolean {
  return supabase !== null;
}

/** Callback to re-render when auth state changes */
let onAuthChange: (() => void) | null = null;

export function setAuthChangeCallback(cb: () => void) {
  onAuthChange = cb;
}

export async function initAuth(): Promise<User | null> {
  if (!supabase) return null;

  // Subscribe to auth changes
  supabase.auth.onAuthStateChange(async (_event, session) => {
    const wasSignedIn = currentUser !== null;
    currentUser = session?.user ?? null;
    const isNowSignedIn = currentUser !== null;

    await loadCurrentProfile();

    // If auth state actually changed, re-render
    if (wasSignedIn !== isNowSignedIn && onAuthChange) {
      onAuthChange();
    }
  });

  // Check for existing session
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;
  await loadCurrentProfile();

  return currentUser;
}

export async function signInWithGitHub() {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
}

export async function signInWithGoogle() {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  currentUser = null;
  currentProfile = null;
}

// ——— Profile types ———

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  builtin_solved: number;
  builtin_stars: number;
  community_solved: number;
  levels_created: number;
  total_upvotes_received: number;
  created_at: string;
  is_admin?: boolean;
  is_beta?: boolean;
  exclude_from_leaderboard?: boolean;
}

export interface CommunityLevel {
  id: string;
  author_id: string;
  title: string;
  expression: string;
  signature: string;
  canonical_signature: string;
  valid_count: number;
  total_count: number;
  upvotes: number;
  downvotes: number;
  play_count: number;
  solve_count: number;
  status: string;
  author_best_length: number;
  created_at: string;
  // Joined fields
  author?: Profile;
}

export interface Solution {
  id: string;
  user_id: string;
  level_id: string;
  expression: string;
  code_length: number;
  created_at: string;
}
