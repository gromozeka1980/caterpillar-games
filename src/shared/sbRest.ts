// Thin wrapper around Supabase REST (PostgREST) using raw fetch.
// Bypasses the supabase-js query machinery which has known hang issues
// (orphaned internal locks/queues cause selects to pend forever).
// We only use the supabase-js client for auth — for data access we call
// the REST endpoints directly.

export const SUPABASE_URL = 'https://rralgdsnidvmivnxmofv.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyYWxnZHNuaWR2bWl2bnhtb2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTg4ODEsImV4cCI6MjA5MTA3NDg4MX0.3Jc79TFlq4ou7BtKh0Xlo1fC2ruX-5HAM7rUFCFDCOM';

/** Read the currently stored access token from localStorage (supabase-js format) */
export function getStoredAccessToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        return parsed?.access_token ?? null;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getStoredAccessToken();
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
}

export type QueryParams = Record<string, string | number>;

function buildQuery(params: QueryParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) sp.set(k, String(v));
  return sp.toString();
}

/** SELECT — returns an array of rows */
export async function sbSelect<T>(table: string, params: QueryParams = {}): Promise<T[]> {
  const q = buildQuery(params);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}${q ? '?' + q : ''}`, {
    headers: authHeaders(),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`sbSelect ${table} ${resp.status}: ${body}`);
  }
  return resp.json();
}

/** SELECT — returns first row or null */
export async function sbSelectOne<T>(table: string, params: QueryParams = {}): Promise<T | null> {
  const rows = await sbSelect<T>(table, { ...params, limit: 1 });
  return rows[0] ?? null;
}

/** COUNT via HEAD + Prefer: count=exact */
export async function sbCount(table: string, params: QueryParams = {}): Promise<number> {
  const q = buildQuery(params);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}${q ? '?' + q : ''}`, {
    method: 'HEAD',
    headers: authHeaders({ Prefer: 'count=exact' }),
  });
  if (!resp.ok) return 0;
  const range = resp.headers.get('content-range') ?? '';
  const total = range.split('/')[1];
  return total ? parseInt(total, 10) || 0 : 0;
}

/** INSERT — returns created rows */
export async function sbInsert<T>(table: string, row: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: authHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`sbInsert ${table} ${resp.status}: ${body}`);
  }
  return resp.json();
}

/** INSERT fire-and-forget (for analytics) */
export function sbInsertFAF(table: string, row: Record<string, unknown>): void {
  fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(row),
  }).catch(() => { /* ignore */ });
}

/** UPSERT (on_conflict) — returns merged rows */
export async function sbUpsert<T>(
  table: string,
  rows: Record<string, unknown> | Record<string, unknown>[],
  onConflict: string,
): Promise<T[]> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: 'POST',
      headers: authHeaders({
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(rows),
    },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`sbUpsert ${table} ${resp.status}: ${body}`);
  }
  return resp.json();
}

/** UPDATE (PATCH) */
export async function sbUpdate(
  table: string,
  params: QueryParams,
  row: Record<string, unknown>,
): Promise<void> {
  const q = buildQuery(params);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}${q ? '?' + q : ''}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(row),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`sbUpdate ${table} ${resp.status}: ${body}`);
  }
}

/** DELETE */
export async function sbDelete(table: string, params: QueryParams): Promise<void> {
  const q = buildQuery(params);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}${q ? '?' + q : ''}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`sbDelete ${table} ${resp.status}: ${body}`);
  }
}

/** RPC call */
export async function sbRpc<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`sbRpc ${fn} ${resp.status}: ${body}`);
  }
  return resp.json();
}
