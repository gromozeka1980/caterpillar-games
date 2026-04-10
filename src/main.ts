// Main entry point — auth, routing, service worker

import { supabase, initAuth, setAuthChangeCallback } from './shared/supabase';
import { registerRoute, initRouter } from './shared/router';
import { initFlags } from './shared/featureFlags';
import { homeModule, renderHome } from './home/home';
import { codeModule } from './code/game';
import { logicModule } from './logic/game';
import { adminModule } from './admin/admin';
import './style.css';

// Handle OAuth redirect (access_token in hash)
if (window.location.hash.includes('access_token') && supabase) {
  supabase.auth.getSession().then(() => {
    window.location.replace(window.location.pathname + window.location.search);
  });
} else {
  startup();
}

async function startup() {
  await initAuth();
  await initFlags();

  // Re-render home when auth state changes (sign in/out)
  setAuthChangeCallback(async () => {
    await initFlags();  // re-evaluate flags (beta gating depends on profile)
    // Only re-render home if we're currently on it
    if (window.location.hash === '' || window.location.hash === '#/' || window.location.hash === '#') {
      renderHome();
    }
  });

  // Register routes
  registerRoute('', homeModule);
  registerRoute('code', codeModule);
  registerRoute('logic', logicModule);
  registerRoute('admin', adminModule);

  // Start routing
  initRouter();

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
