// Simple hash-based router for switching between game modes

import { track } from './analytics';

export interface GameModule {
  init(): void | Promise<void>;
  destroy(): void;
}

type Route = '' | 'code' | 'logic' | 'admin';

const modules = new Map<Route, GameModule>();
let currentRoute: Route | null = null;
let currentModule: GameModule | null = null;

export function registerRoute(route: Route, module: GameModule) {
  modules.set(route, module);
}

export function navigate(route: Route) {
  const hash = route === '' ? '#/' : `#/${route}`;
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    // Hash didn't change, trigger manually
    handleRoute();
  }
}

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash === 'code' || hash === 'logic' || hash === 'admin') return hash;
  return '';
}

async function handleRoute() {
  const route = parseRoute();
  console.log('[router] handleRoute', { from: currentRoute, to: route, hash: window.location.hash });
  if (route === currentRoute) { console.log('[router] same route, skip'); return; }

  if (currentModule) {
    console.log('[router] destroying', currentRoute);
    currentModule.destroy();
  }

  currentRoute = route;
  currentModule = modules.get(route) ?? null;

  track('page_view', { route: route || 'home' });

  if (currentModule) {
    const t0 = performance.now();
    console.log('[router] init', route || 'home');
    await currentModule.init();
    console.log('[router] init done', route || 'home', 'in', Math.round(performance.now() - t0), 'ms');
  } else {
    console.log('[router] no module for route', route);
  }
}

export function initRouter() {
  window.addEventListener('hashchange', () => {
    console.log('[router] hashchange event', window.location.hash);
    handleRoute();
  });
  console.log('[router] initial handleRoute');
  handleRoute();
}

export function getCurrentRoute(): Route {
  return currentRoute ?? '';
}
