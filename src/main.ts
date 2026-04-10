// Main entry point — auth, routing, service worker

import { supabase, initAuth, setAuthChangeCallback } from './shared/supabase';
import { registerRoute, initRouter } from './shared/router';
import { initFlags } from './shared/featureFlags';
import { homeModule, renderHome } from './home/home';
import { codeModule } from './code/game';
import { logicModule } from './logic/game';
import { adminModule } from './admin/admin';
import './style.css';

function isAtHome(): boolean {
  const h = window.location.hash;
  return h === '' || h === '#/' || h === '#';
}

function dbg(label: string, ...args: unknown[]) {
  console.log(`[startup] ${label}`, ...args);
}

/** Wrap a promise with a timeout so startup never hangs indefinitely */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        console.warn(`[startup] ${label} timed out after ${ms}ms`);
        resolve(null);
      }
    }, ms);
    p.then((v) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(v);
      }
    }).catch((e) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        console.warn(`[startup] ${label} failed`, e);
        resolve(null);
      }
    });
  });
}

startup();

async function startup() {
  dbg('begin', { hash: window.location.hash, href: window.location.href });

  // Handle OAuth redirect (access_token in hash).
  if (window.location.hash.includes('access_token') && supabase) {
    dbg('oauth: getSession start');
    try {
      await withTimeout(supabase.auth.getSession(), 5000, 'OAuth getSession');
    } catch { /* ignore */ }
    dbg('oauth: getSession done, stripping hash');
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // Subscribe to auth changes BEFORE initAuth so we catch the initial session
  setAuthChangeCallback(async () => {
    dbg('auth change callback');
    await withTimeout(initFlags(), 5000, 'initFlags on auth change');
    if (isAtHome()) {
      dbg('auth change: re-rendering home');
      renderHome();
    }
  });

  // Register routes and start router IMMEDIATELY so the user sees something
  // even if auth/flags take a while (or hang entirely).
  registerRoute('', homeModule);
  registerRoute('code', codeModule);
  registerRoute('logic', logicModule);
  registerRoute('admin', adminModule);
  dbg('routes registered, starting router');
  initRouter();
  dbg('router started');

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Background: load auth + flags with timeouts so they can't block UI.
  // Once they complete, re-render home to reflect signed-in state.
  dbg('initAuth start');
  await withTimeout(initAuth(), 5000, 'initAuth');
  dbg('initAuth done');
  dbg('initFlags start');
  await withTimeout(initFlags(), 5000, 'initFlags');
  dbg('initFlags done');

  if (isAtHome()) {
    dbg('re-rendering home after background init');
    renderHome();
  }
  dbg('startup complete');
}
