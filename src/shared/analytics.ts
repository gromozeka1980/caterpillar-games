// Fire-and-forget event tracking for analytics

import { getUser } from './supabase';
import { sbInsertFAF } from './sbRest';

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
  sbInsertFAF('events', {
    session_id: getSessionId(),
    user_id: getUser()?.id ?? null,
    event_type: eventType,
    event_data: eventData ?? null,
  });
}
