import { getUser, type CommunityLevel, type Profile, type Solution } from './supabase';
import { sbSelect, sbSelectOne, sbCount, sbInsert, sbUpsert, sbUpdate, sbDelete, sbRpc } from './sbRest';

// ——— Levels ———

export type LevelSort = 'newest' | 'top' | 'popular';

export async function fetchLevels(sort: LevelSort = 'newest', limit = 20, offset = 0): Promise<CommunityLevel[]> {
  const orderCol = sort === 'newest' ? 'created_at' : sort === 'top' ? 'upvotes' : 'play_count';
  return sbSelect<CommunityLevel>('levels', {
    select: '*,author:profiles!author_id(id,username,avatar_url)',
    status: 'eq.active',
    order: `${orderCol}.desc`,
    limit,
    offset,
  });
}

export async function fetchLevel(id: string): Promise<CommunityLevel | null> {
  try {
    return await sbSelectOne<CommunityLevel>('levels', {
      select: '*,author:profiles!author_id(id,username,avatar_url)',
      id: `eq.${id}`,
    });
  } catch {
    return null;
  }
}

export async function createLevel(level: {
  title: string;
  expression: string;
  signature: string;
  canonical_signature: string;
  valid_count: number;
  author_best_length: number;
}): Promise<CommunityLevel> {
  const rows = await sbInsert<CommunityLevel>('levels', level);
  return rows[0];
}

export async function incrementPlayCount(levelId: string): Promise<void> {
  try { await sbRpc('increment_play_count', { level_id: levelId }); } catch { /* ignore */ }
}

// ——— Solutions ———

export async function submitSolution(levelId: string, expression: string, codeLength: number): Promise<void> {
  await sbUpsert(
    'solutions',
    { level_id: levelId, expression, code_length: codeLength },
    'user_id,level_id',
  );
}

export async function fetchMySolution(levelId: string): Promise<Solution | null> {
  try {
    return await sbSelectOne<Solution>('solutions', { level_id: `eq.${levelId}` });
  } catch { return null; }
}

export async function fetchLevelSolveCount(levelId: string): Promise<number> {
  try { return await sbCount('solutions', { level_id: `eq.${levelId}` }); }
  catch { return 0; }
}

// ——— Ratings ———

export async function rateLevel(levelId: string, value: 1 | -1): Promise<void> {
  await sbUpsert('ratings', { level_id: levelId, value }, 'user_id,level_id');
}

export async function removeRating(levelId: string): Promise<void> {
  await sbDelete('ratings', { level_id: `eq.${levelId}` });
}

export async function fetchMyRating(levelId: string): Promise<number | null> {
  try {
    const r = await sbSelectOne<{ value: number }>('ratings', {
      select: 'value',
      level_id: `eq.${levelId}`,
    });
    return r?.value ?? null;
  } catch { return null; }
}

// ——— Profiles ———

export async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    return await sbSelectOne<Profile>('profiles', { id: `eq.${userId}` });
  } catch { return null; }
}

export async function updateUsername(username: string): Promise<void> {
  const userId = getUser()?.id;
  if (!userId) throw new Error('Not signed in');
  await sbUpdate('profiles', { id: `eq.${userId}` }, { username });
}

// ——— Leaderboard ———

/** Simple leaderboard from profiles table (used as fallback) */
export async function fetchLeaderboard(limit = 20): Promise<Profile[]> {
  return sbSelect<Profile>('profiles', {
    order: 'builtin_stars.desc,community_solved.desc',
    limit,
  });
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
  const completions = await sbSelect<{ user_id: string; stars: number }>('builtin_completions', {
    select: 'user_id,stars',
    game_mode: 'eq.code',
  });
  const userStars = new Map<string, number>();
  for (const c of completions) {
    userStars.set(c.user_id, (userStars.get(c.user_id) ?? 0) + c.stars);
  }
  const userIds = [...userStars.keys()];
  if (userIds.length === 0) return [];

  const profiles = await sbSelect<{
    id: string; username: string; avatar_url: string | null; community_solved: number;
  }>('profiles', {
    select: 'id,username,avatar_url,community_solved',
    id: `in.(${userIds.join(',')})`,
    exclude_from_leaderboard: 'eq.false',
  });

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

/** Logic leaderboard: best stars per level across code+logic */
export async function fetchLogicLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  const completions = await sbSelect<{
    user_id: string; level_index: number; stars: number; game_mode: string;
  }>('builtin_completions', {
    select: 'user_id,level_index,stars,game_mode',
  });

  const bestStars = new Map<string, Map<number, number>>();
  for (const c of completions) {
    if (!bestStars.has(c.user_id)) bestStars.set(c.user_id, new Map());
    const userMap = bestStars.get(c.user_id)!;
    userMap.set(c.level_index, Math.max(userMap.get(c.level_index) ?? 0, c.stars));
  }
  const userStars = new Map<string, number>();
  for (const [userId, levelMap] of bestStars) {
    let total = 0;
    for (const stars of levelMap.values()) total += stars;
    userStars.set(userId, total);
  }

  const userIds = [...userStars.keys()];
  if (userIds.length === 0) return [];

  const profiles = await sbSelect<{
    id: string; username: string; avatar_url: string | null; community_solved: number;
  }>('profiles', {
    select: 'id,username,avatar_url,community_solved',
    id: `in.(${userIds.join(',')})`,
    exclude_from_leaderboard: 'eq.false',
  });

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
  return sbSelect<AdminUserRow>('profiles', {
    select: 'id,username,avatar_url,builtin_stars,community_solved,levels_created,is_admin,is_beta,exclude_from_leaderboard,created_at',
    order: 'created_at.desc',
    limit,
  });
}

export async function updateUserRoles(
  userId: string,
  roles: { is_admin?: boolean; is_beta?: boolean; exclude_from_leaderboard?: boolean },
): Promise<void> {
  await sbUpdate('profiles', { id: `eq.${userId}` }, roles);
}

// ——— Analytics (admin only) ———

export interface EventRow {
  id: number;
  created_at: string;
  session_id: string;
  user_id: string | null;
  event_type: string;
  event_data: Record<string, unknown> | null;
}

export async function fetchRecentEvents(limit = 200): Promise<EventRow[]> {
  return sbSelect<EventRow>('events', {
    order: 'created_at.desc',
    limit,
  });
}

export interface AnalyticsSummary {
  eventsLastHour: number;
  eventsLast24h: number;
  uniqueSessionsLastHour: number;
  uniqueSessionsLast24h: number;
  uniqueUsersLast24h: number;
  topLevels: { mode: string; level: number | string; opens: number }[];
}

export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const events = await sbSelect<EventRow>('events', {
    created_at: `gte.${dayAgo}`,
    order: 'created_at.desc',
  });

  const lastHourEvents = events.filter(e => e.created_at >= hourAgo);
  const sessionsLastHour = new Set(lastHourEvents.map(e => e.session_id));
  const sessionsLast24h = new Set(events.map(e => e.session_id));
  const usersLast24h = new Set(events.filter(e => e.user_id).map(e => e.user_id!));

  // Top levels by number of unique sessions that opened them (one session
  // opening the same level multiple times counts as 1)
  const levelSessions = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.event_type !== 'level_open') continue;
    const data = e.event_data ?? {};
    const mode = String((data as any).mode ?? '?');
    const community = (data as any).community === true;
    const level = community
      ? `community:${String((data as any).title ?? (data as any).community_id ?? '?')}`
      : String((data as any).level ?? '?');
    const key = `${mode}|${level}`;
    if (!levelSessions.has(key)) levelSessions.set(key, new Set());
    levelSessions.get(key)!.add(e.session_id);
  }
  const topLevels = [...levelSessions.entries()]
    .map(([key, sessions]) => {
      const [mode, level] = key.split('|');
      return { mode, level, opens: sessions.size };
    })
    .sort((a, b) => b.opens - a.opens);

  return {
    eventsLastHour: lastHourEvents.length,
    eventsLast24h: events.length,
    uniqueSessionsLastHour: sessionsLastHour.size,
    uniqueSessionsLast24h: sessionsLast24h.size,
    uniqueUsersLast24h: usersLast24h.size,
    topLevels,
  };
}

// ——— Sync built-in progress ———

export type GameMode = 'code' | 'logic';

export async function syncBuiltinProgress(
  completions: { level_index: number; stars: number; best_length: number; expression?: string }[],
  gameMode: GameMode = 'code',
): Promise<void> {
  if (completions.length === 0) return;
  const rows = completions.map(c => ({ ...c, game_mode: gameMode }));
  await sbUpsert('builtin_completions', rows, 'user_id,level_index,game_mode');
}

// ——— Builtin completions ———

export async function fetchBuiltinCompletions(
  userId: string,
  gameMode: GameMode = 'code',
): Promise<{ level_index: number; stars: number; best_length: number; expression: string | null }[]> {
  try {
    return await sbSelect<{ level_index: number; stars: number; best_length: number; expression: string | null }>(
      'builtin_completions',
      {
        select: 'level_index,stars,best_length,expression',
        user_id: `eq.${userId}`,
        game_mode: `eq.${gameMode}`,
      },
    );
  } catch { return []; }
}

// ——— My level count (for auto-naming) ———

export async function fetchMyLevelCount(): Promise<number> {
  const userId = getUser()?.id;
  if (!userId) return 0;
  try {
    return await sbCount('levels', {
      author_id: `eq.${userId}`,
      status: 'eq.active',
    });
  } catch { return 0; }
}

// ——— Check duplicate canonical signature ———

export async function checkDuplicate(canonicalSignature: string): Promise<CommunityLevel | null> {
  try {
    return await sbSelectOne<CommunityLevel>('levels', {
      select: 'id,title',
      canonical_signature: `eq.${canonicalSignature}`,
      status: 'eq.active',
    });
  } catch { return null; }
}
