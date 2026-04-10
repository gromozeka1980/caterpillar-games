// Feature flags — fetched once at startup, cached in memory

import { supabase, isCurrentUserBeta } from './supabase';

export interface FlagConfig {
  enabled?: boolean;   // on for everyone
  betaOnly?: boolean;  // on for beta users + admins
}

export type FlagsMap = Record<string, FlagConfig>;

/** Known feature flag keys — used by admin UI to show all flags */
export const KNOWN_FLAGS: { key: string; description: string }[] = [
  { key: 'toast-signin-after-first-level', description: 'Show sign-in toast after completing first level' },
  { key: 'toast-signin-after-three-stars', description: 'Show sign-in toast after earning 3 stars' },
  { key: 'toast-signin-on-create-level', description: 'Show sign-in prompt when opening create-level' },
  { key: 'toast-signin-on-share', description: 'Show sign-in prompt when clicking share' },
  { key: 'toast-signin-after-code-3stars', description: 'Suggest creating own level after 3 stars in code' },
  { key: 'leaderboard-public', description: 'Show leaderboard to unauthenticated users' },
];

let flagsCache: FlagsMap = {};
let loaded = false;

export async function initFlags(): Promise<void> {
  console.log('[flags] loading');
  const t0 = performance.now();
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('flags')
      .eq('id', 1)
      .maybeSingle();
    const dt = Math.round(performance.now() - t0);
    if (error) {
      console.log('[flags] error after', dt, 'ms', error);
      flagsCache = {};
    } else if (!data) {
      console.log('[flags] no data after', dt, 'ms');
      flagsCache = {};
    } else {
      console.log('[flags] loaded in', dt, 'ms');
      flagsCache = (data.flags ?? {}) as FlagsMap;
    }
  } catch (e) {
    const dt = Math.round(performance.now() - t0);
    console.log('[flags] threw after', dt, 'ms', e);
    flagsCache = {};
  }
  loaded = true;
}

export function isFeatureEnabled(key: string): boolean {
  if (!loaded) return false;
  const flag = flagsCache[key];
  if (!flag) return false;
  if (flag.enabled) return true;
  if (flag.betaOnly && isCurrentUserBeta()) return true;
  return false;
}

export function getAllFlags(): FlagsMap {
  return { ...flagsCache };
}

export async function updateFlag(key: string, config: FlagConfig): Promise<void> {
  const newFlags = { ...flagsCache, [key]: config };
  const { error } = await supabase
    .from('feature_flags')
    .update({ flags: newFlags, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
  flagsCache = newFlags;
}

export async function refreshFlags(): Promise<void> {
  await initFlags();
}
