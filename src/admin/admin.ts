// Admin panel — users and feature flags management

import { el, clearScreen, destroyAnimations } from '../shared/ui';
import { playClick } from '../shared/sounds';
import { navigate, type GameModule } from '../shared/router';
import { isSignedIn, isCurrentUserAdmin } from '../shared/supabase';
import * as api from '../shared/api';
import { KNOWN_FLAGS, getAllFlags, updateFlag, refreshFlags, type FlagConfig } from '../shared/featureFlags';

type AdminScreen = 'dashboard' | 'users' | 'flags';

const state: { screen: AdminScreen } = { screen: 'dashboard' };

export const adminModule: GameModule = {
  async init() {
    if (!isSignedIn() || !isCurrentUserAdmin()) {
      // Not an admin — redirect to home
      navigate('');
      return;
    }
    state.screen = 'dashboard';
    renderDashboard();
  },
  destroy() {
    destroyAnimations();
  },
};

function renderTopBar(title: string, back: () => void): HTMLElement {
  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); back(); });
  topBar.appendChild(backBtn);
  topBar.appendChild(el('span', 'level-label', title));
  return topBar;
}

function renderDashboard() {
  clearScreen();
  state.screen = 'dashboard';
  const app = document.getElementById('app')!;
  const container = el('div', 'admin-screen');

  container.appendChild(renderTopBar('Admin', () => navigate('')));

  const content = el('div', 'admin-content');

  const title = el('h2', 'admin-title', 'Admin panel');
  content.appendChild(title);

  const usersBtn = el('button', 'menu-btn', '\ud83d\udc65 Users');
  usersBtn.addEventListener('click', () => { playClick(); renderUsers(); });
  content.appendChild(usersBtn);

  const flagsBtn = el('button', 'menu-btn', '\ud83d\udea9 Feature flags');
  flagsBtn.addEventListener('click', () => { playClick(); renderFlags(); });
  content.appendChild(flagsBtn);

  container.appendChild(content);
  app.appendChild(container);
}

async function renderUsers() {
  clearScreen();
  state.screen = 'users';
  const app = document.getElementById('app')!;
  const container = el('div', 'admin-screen');

  container.appendChild(renderTopBar('Users', () => renderDashboard()));

  const content = el('div', 'admin-content');
  const loading = el('div', 'loading-text', 'Loading...');
  content.appendChild(loading);
  container.appendChild(content);
  app.appendChild(container);

  try {
    const users = await api.fetchAllProfiles(200);
    content.innerHTML = '';

    // Search box
    const search = el('input', 'admin-search') as HTMLInputElement;
    search.type = 'text';
    search.placeholder = 'Search by username...';
    content.appendChild(search);

    const table = el('div', 'admin-user-list');
    content.appendChild(table);

    const render = (filter: string) => {
      table.innerHTML = '';
      const lower = filter.toLowerCase().trim();
      const filtered = lower
        ? users.filter(u => (u.username ?? '').toLowerCase().includes(lower))
        : users;

      for (const u of filtered) {
        const row = el('div', 'admin-user-row');

        const info = el('div', 'admin-user-info');
        if (u.avatar_url) {
          const img = document.createElement('img');
          img.src = u.avatar_url;
          img.className = 'admin-user-avatar';
          info.appendChild(img);
        }
        const nameCol = el('div', 'admin-user-name-col');
        nameCol.appendChild(el('div', 'admin-user-name', u.username ?? '(no name)'));
        nameCol.appendChild(el('div', 'admin-user-meta',
          `\u2605${u.builtin_stars} \u00b7 \u2714${u.community_solved} \u00b7 \ud83d\udcdd${u.levels_created}`));
        info.appendChild(nameCol);
        row.appendChild(info);

        const togs = el('div', 'admin-user-toggles');

        const makeToggle = (label: string, initial: boolean, onChange: (v: boolean) => void) => {
          const wrap = el('label', 'admin-toggle');
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = initial;
          box.addEventListener('change', () => onChange(box.checked));
          wrap.appendChild(box);
          wrap.appendChild(el('span', 'admin-toggle-label', label));
          return wrap;
        };

        togs.appendChild(makeToggle('admin', u.is_admin, async (v) => {
          try { await api.updateUserRoles(u.id, { is_admin: v }); u.is_admin = v; }
          catch (e) { alert('Failed: ' + (e instanceof Error ? e.message : 'unknown')); }
        }));
        togs.appendChild(makeToggle('beta', u.is_beta, async (v) => {
          try { await api.updateUserRoles(u.id, { is_beta: v }); u.is_beta = v; }
          catch (e) { alert('Failed: ' + (e instanceof Error ? e.message : 'unknown')); }
        }));
        togs.appendChild(makeToggle('hidden', u.exclude_from_leaderboard, async (v) => {
          try { await api.updateUserRoles(u.id, { exclude_from_leaderboard: v }); u.exclude_from_leaderboard = v; }
          catch (e) { alert('Failed: ' + (e instanceof Error ? e.message : 'unknown')); }
        }));

        row.appendChild(togs);
        table.appendChild(row);
      }

      if (filtered.length === 0) {
        table.appendChild(el('div', 'empty-text', 'No users match'));
      }
    };

    render('');
    search.addEventListener('input', () => render(search.value));
  } catch (e) {
    content.innerHTML = '';
    content.appendChild(el('div', 'empty-text', 'Failed to load users'));
  }
}

async function renderFlags() {
  clearScreen();
  state.screen = 'flags';
  const app = document.getElementById('app')!;
  const container = el('div', 'admin-screen');

  container.appendChild(renderTopBar('Feature flags', () => renderDashboard()));

  const content = el('div', 'admin-content');
  container.appendChild(content);
  app.appendChild(container);

  await refreshFlags();
  const current = getAllFlags();

  for (const def of KNOWN_FLAGS) {
    const row = el('div', 'admin-flag-row');
    row.appendChild(el('div', 'admin-flag-key', def.key));
    row.appendChild(el('div', 'admin-flag-desc', def.description));

    const controls = el('div', 'admin-flag-controls');
    const cfg: FlagConfig = current[def.key] ?? {};

    const makeToggle = (label: string, initial: boolean, onChange: (v: boolean) => void) => {
      const wrap = el('label', 'admin-toggle');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = initial;
      box.addEventListener('change', () => onChange(box.checked));
      wrap.appendChild(box);
      wrap.appendChild(el('span', 'admin-toggle-label', label));
      return wrap;
    };

    controls.appendChild(makeToggle('enabled', !!cfg.enabled, async (v) => {
      const newCfg: FlagConfig = { ...cfg, enabled: v };
      try { await updateFlag(def.key, newCfg); Object.assign(cfg, newCfg); }
      catch (e) { alert('Failed: ' + (e instanceof Error ? e.message : 'unknown')); }
    }));
    controls.appendChild(makeToggle('beta only', !!cfg.betaOnly, async (v) => {
      const newCfg: FlagConfig = { ...cfg, betaOnly: v };
      try { await updateFlag(def.key, newCfg); Object.assign(cfg, newCfg); }
      catch (e) { alert('Failed: ' + (e instanceof Error ? e.message : 'unknown')); }
    }));

    row.appendChild(controls);
    content.appendChild(row);
  }
}
