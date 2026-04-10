// Fire-and-forget event tracking for analytics

import { supabase, getUser } from './supabase';

const SESSION_KEY = 'caterpillar-games-session';

function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function track(eventType: string, eventData?: Record<string, unknown>) {
  const row = {
    session_id: getSessionId(),
    user_id: getUser()?.id ?? null,
    event_type: eventType,
    event_data: eventData ?? null,
  };
  // Fire and forget — don't block UI, swallow errors
  supabase.from('events').insert(row).then(() => { /* ok */ }, () => { /* ignore */ });
}
