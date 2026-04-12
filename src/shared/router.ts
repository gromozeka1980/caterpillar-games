// Simple hash-based router for switching between game modes

import { track } from './analytics';

export interface GameModule {
  init(): void | Promise<void>;
  destroy(): void;
}

type Route = '' | 'code' | 'logic' | 'admin' | 'forge';

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
  if (hash === 'code' || hash === 'logic' || hash === 'admin' || hash === 'forge') return hash;
  return '';
}

async function handleRoute() {
  const route = parseRoute();
  if (route === currentRoute) return;

  if (currentModule) {
    currentModule.destroy();
  }

  currentRoute = route;
  currentModule = modules.get(route) ?? null;

  track('page_view', { route: route || 'home' });

  if (currentModule) {
    await currentModule.init();
  }
}

export function initRouter() {
  window.addEventListener('hashchange', () => handleRoute());
  handleRoute();
}

export function getCurrentRoute(): Route {
  return currentRoute ?? '';
}
