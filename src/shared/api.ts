import { supabase, type CommunityLevel, type Profile, type Solution } from './supabase';

function db() {
  if (!supabase) throw new Error('Not connected');
  return supabase;
}

// ——— Levels ———

export type LevelSort = 'newest' | 'top' | 'popular';

export async function fetchLevels(sort: LevelSort = 'newest', limit = 20, offset = 0): Promise<CommunityLevel[]> {
  let query = db()
    .from('levels')
    .select('*, author:profiles!author_id(id, username, avatar_url)')
    .eq('status', 'active')
    .range(offset, offset + limit - 1);

  switch (sort) {
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'top':
      query = query.order('upvotes', { ascending: false });
      break;
    case 'popular':
      query = query.order('play_count', { ascending: false });
      break;
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as CommunityLevel[];
}

export async function fetchLevel(id: string): Promise<CommunityLevel | null> {
  const { data, error } = await db()
    .from('levels')
    .select('*, author:profiles!author_id(id, username, avatar_url)')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as CommunityLevel;
}

export async function createLevel(level: {
  title: string;
  expression: string;
  signature: string;
  canonical_signature: string;
  valid_count: number;
  author_best_length: number;
}): Promise<CommunityLevel> {
  const { data, error } = await db()
    .from('levels')
    .insert(level)
    .select()
    .single();
  if (error) throw error;
  return data as CommunityLevel;
}

export async function incrementPlayCount(levelId: string): Promise<void> {
  await db().rpc('increment_play_count', { level_id: levelId });
}

// ——— Solutions ———

export async function submitSolution(levelId: string, expression: string, codeLength: number): Promise<void> {
  const { error } = await db()
    .from('solutions')
    .upsert(
      { level_id: levelId, expression, code_length: codeLength },
      { onConflict: 'user_id,level_id' }
    );
  if (error) throw error;
}

export async function fetchMySolution(levelId: string): Promise<Solution | null> {
  const { data, error } = await db()
    .from('solutions')
    .select('*')
    .eq('level_id', levelId)
    .maybeSingle();
  if (error) return null;
  return data as Solution | null;
}

export async function fetchLevelSolveCount(levelId: string): Promise<number> {
  const { count, error } = await db()
    .from('solutions')
    .select('*', { count: 'exact', head: true })
    .eq('level_id', levelId);
  if (error) return 0;
  return count ?? 0;
}

// ——— Ratings ———

export async function rateLevel(levelId: string, value: 1 | -1): Promise<void> {
  const { error } = await db()
    .from('ratings')
    .upsert(
      { level_id: levelId, value },
      { onConflict: 'user_id,level_id' }
    );
  if (error) throw error;
}

export async function removeRating(levelId: string): Promise<void> {
  const { error } = await db()
    .from('ratings')
    .delete()
    .eq('level_id', levelId);
  if (error) throw error;
}

export async function fetchMyRating(levelId: string): Promise<number | null> {
  const { data, error } = await db()
    .from('ratings')
    .select('value')
    .eq('level_id', levelId)
    .maybeSingle();
  if (error || !data) return null;
  return data.value;
}

// ——— Profiles ———

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as Profile;
}

export async function updateUsername(username: string): Promise<void> {
  const { error } = await db()
    .from('profiles')
    .update({ username })
    .eq('id', (await db().auth.getUser()).data.user?.id);
  if (error) throw error;
}

// ——— Leaderboard ———

/** Simple leaderboard from profiles table (used as fallback) */
export async function fetchLeaderboard(limit = 20): Promise<Profile[]> {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .order('builtin_stars', { ascending: false })
    .order('community_solved', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as Profile[];
}

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  builtin_stars: number;
  community_solved: number;
}

/** Code leaderboard: only code-mode stars and community solves */
export async function fetchCodeLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  // Get all code completions grouped by user
  const { data: completions, error: cErr } = await db()
    .from('builtin_completions')
    .select('user_id, stars')
    .eq('game_mode', 'code');
  if (cErr || !completions) return [];

  // Aggregate stars per user
  const userStars = new Map<string, number>();
  for (const c of completions) {
    userStars.set(c.user_id, (userStars.get(c.user_id) ?? 0) + c.stars);
  }

  // Get profiles for these users
  const userIds = [...userStars.keys()];
  if (userIds.length === 0) return [];

  const { data: profiles, error: pErr } = await db()
    .from('profiles')
    .select('id, username, avatar_url, community_solved, exclude_from_leaderboard')
    .in('id', userIds)
    .eq('exclude_from_leaderboard', false);
  if (pErr || !profiles) return [];

  const entries: LeaderboardEntry[] = profiles.map(p => ({
    user_id: p.id,
    username: p.username,
    avatar_url: p.avatar_url,
    builtin_stars: userStars.get(p.id) ?? 0,
    community_solved: p.community_solved ?? 0,
  }));

  entries.sort((a, b) => b.builtin_stars - a.builtin_stars || b.community_solved - a.community_solved);
  return entries.slice(0, limit);
}

/** Logic leaderboard: best stars per level across code+logic, all community solves */
export async function fetchLogicLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  // Get ALL completions (both code and logic)
  const { data: completions, error: cErr } = await db()
    .from('builtin_completions')
    .select('user_id, level_index, stars, game_mode');
  if (cErr || !completions) return [];

  // For each user+level, take best stars across modes
  const bestStars = new Map<string, Map<number, number>>(); // user_id -> level_index -> best_stars
  for (const c of completions) {
    if (!bestStars.has(c.user_id)) bestStars.set(c.user_id, new Map());
    const userMap = bestStars.get(c.user_id)!;
    userMap.set(c.level_index, Math.max(userMap.get(c.level_index) ?? 0, c.stars));
  }

  // Sum stars per user
  const userStars = new Map<string, number>();
  for (const [userId, levelMap] of bestStars) {
    let total = 0;
    for (const stars of levelMap.values()) total += stars;
    userStars.set(userId, total);
  }

  // Get profiles
  const userIds = [...userStars.keys()];
  if (userIds.length === 0) return [];

  const { data: profiles, error: pErr } = await db()
    .from('profiles')
    .select('id, username, avatar_url, community_solved, exclude_from_leaderboard')
    .in('id', userIds)
    .eq('exclude_from_leaderboard', false);
  if (pErr || !profiles) return [];

  const entries: LeaderboardEntry[] = profiles.map(p => ({
    user_id: p.id,
    username: p.username,
    avatar_url: p.avatar_url,
    builtin_stars: userStars.get(p.id) ?? 0,
    community_solved: p.community_solved ?? 0,
  }));

  entries.sort((a, b) => b.builtin_stars - a.builtin_stars || b.community_solved - a.community_solved);
  return entries.slice(0, limit);
}

// ——— Admin functions ———

export interface AdminUserRow {
  id: string;
  username: string;
  avatar_url: string | null;
  builtin_stars: number;
  community_solved: number;
  levels_created: number;
  is_admin: boolean;
  is_beta: boolean;
  exclude_from_leaderboard: boolean;
  created_at: string;
}

export async function fetchAllProfiles(limit = 200): Promise<AdminUserRow[]> {
  const { data, error } = await db()
    .from('profiles')
    .select('id, username, avatar_url, builtin_stars, community_solved, levels_created, is_admin, is_beta, exclude_from_leaderboard, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

export async function updateUserRoles(
  userId: string,
  roles: { is_admin?: boolean; is_beta?: boolean; exclude_from_leaderboard?: boolean },
): Promise<void> {
  const { error } = await db()
    .from('profiles')
    .update(roles)
    .eq('id', userId);
  if (error) throw error;
}

// ——— Sync built-in progress ———

export type GameMode = 'code' | 'logic';

export async function syncBuiltinProgress(
  completions: { level_index: number; stars: number; best_length: number; expression?: string }[],
  gameMode: GameMode = 'code',
): Promise<void> {
  if (completions.length === 0) return;
  const rows = completions.map(c => ({ ...c, game_mode: gameMode }));
  const { error } = await db()
    .from('builtin_completions')
    .upsert(rows, { onConflict: 'user_id,level_index,game_mode' });
  if (error) throw error;
}

// ——— Builtin completions ———

export async function fetchBuiltinCompletions(
  userId: string,
  gameMode: GameMode = 'code',
): Promise<{ level_index: number; stars: number; best_length: number; expression: string | null }[]> {
  const { data, error } = await db()
    .from('builtin_completions')
    .select('level_index, stars, best_length, expression')
    .eq('user_id', userId)
    .eq('game_mode', gameMode);
  if (error) return [];
  return data;
}

// ——— My level count (for auto-naming) ———

export async function fetchMyLevelCount(): Promise<number> {
  const userId = (await db().auth.getUser()).data.user?.id;
  if (!userId) return 0;
  const { count, error } = await db()
    .from('levels')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', userId)
    .eq('status', 'active');
  if (error) return 0;
  return count ?? 0;
}

// ——— Check duplicate canonical signature ———

export async function checkDuplicate(canonicalSignature: string): Promise<CommunityLevel | null> {
  const { data, error } = await db()
    .from('levels')
    .select('id, title')
    .eq('canonical_signature', canonicalSignature)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as CommunityLevel;
}
