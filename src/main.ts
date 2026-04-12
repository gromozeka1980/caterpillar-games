// Main entry point — auth, routing, service worker

import { supabase, initAuth, setAuthChangeCallback } from './shared/supabase';
import { registerRoute, initRouter } from './shared/router';
import { initFlags } from './shared/featureFlags';
import { homeModule, renderHome } from './home/home';
import { codeModule } from './code/game';
import { logicModule } from './logic/game';
import { adminModule } from './admin/admin';
import { forgeModule } from './forge/forge';
import './style.css';

function isAtHome(): boolean {
  const h = window.location.hash;
  return h === '' || h === '#/' || h === '#';
}

startup();

async function startup() {
  // Handle OAuth redirect (access_token in hash).
  if (window.location.hash.includes('access_token') && supabase) {
    try { await supabase.auth.getSession(); } catch { /* ignore */ }
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // Subscribe to auth changes BEFORE initAuth so the initial session fires our callback
  setAuthChangeCallback(async () => {
    await initFlags();
    if (isAtHome()) renderHome();
  });

  // Register routes and start router immediately so the user sees something fast
  registerRoute('', homeModule);
  registerRoute('code', codeModule);
  registerRoute('logic', logicModule);
  registerRoute('admin', adminModule);
  registerRoute('forge', forgeModule);
  initRouter();

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Background: load auth + flags. These use raw fetch under the hood so
  // they can't hang like the supabase-js query machinery did.
  await initAuth();
  await initFlags();

  if (isAtHome()) renderHome();
}
