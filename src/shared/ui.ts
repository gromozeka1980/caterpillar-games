// Shared UI helpers — extracted from both game.ts files (identical code)

import { createIdleCaterpillar, COLORS, type EyeDirection, type Mood } from './caterpillar';
import { calcGameLayout, calcChooserLayout, type GameLayout } from './layout';
import { playClick } from './sounds';
import type { Sequence } from './utils';

// ——— Shared layout & animation state ———

let gameLayout: GameLayout = calcGameLayout();
let animatedInstances: { destroy: () => void }[] = [];
let idleStaggerCounter = 0;

export function getLayout(): GameLayout { return gameLayout; }
export function refreshLayout(): GameLayout { gameLayout = calcGameLayout(); return gameLayout; }

export function destroyAnimations() {
  for (const a of animatedInstances) a.destroy();
  animatedInstances = [];
}

export function trackAnimation(anim: { destroy: () => void }) {
  animatedInstances.push(anim);
}

export function resetStagger() { idleStaggerCounter = 0; }

// ——— DOM helpers ———

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function toRGB(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

export function seqKey(s: Sequence): string {
  return s.join(',');
}

export function clearScreen() {
  destroyAnimations();
  document.getElementById('app')!.innerHTML = '';
}

// ——— Caterpillar rendering ———

export function renderCaterpillarItem(chain: Sequence, eyeDir: EyeDirection = 'forward', mood: Mood = 'neutral', id?: string): HTMLElement {
  const wrapper = el('div', 'caterpillar-item');
  if (id) wrapper.id = id;
  const idle = createIdleCaterpillar(chain, gameLayout.catW, gameLayout.catH, eyeDir, mood, idleStaggerCounter++);
  wrapper.appendChild(idle.canvas);
  animatedInstances.push(idle);
  return wrapper;
}

// ——— Overlay helpers ———

export function getOrCreateOverlay(): HTMLElement {
  let overlay = document.getElementById('overlay');
  if (!overlay) {
    overlay = el('div', 'overlay');
    overlay.id = 'overlay';
    document.getElementById('app')!.appendChild(overlay);
  }
  overlay.innerHTML = '';
  overlay.style.display = 'flex';
  return overlay;
}

export function removeOverlay() {
  const overlay = document.getElementById('overlay');
  if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
}

// ——— History helpers ———

export function addToHistory(
  history: Sequence[], seq: Sequence, listId: string,
  eyeDir: EyeDirection, mood: Mood, maxHistory?: number,
) {
  const key = seqKey(seq);
  const idx = history.findIndex(s => seqKey(s) === key);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(seq);

  if (maxHistory !== undefined) {
    while (history.length > maxHistory) history.pop();
  }

  const listEl = document.getElementById(listId);
  if (!listEl) return;

  const item = renderCaterpillarItem(seq, eyeDir, mood);
  item.classList.add('slide-in');
  listEl.prepend(item);

  while (listEl.children.length > history.length) {
    listEl.removeChild(listEl.lastChild!);
  }

  listEl.scrollTop = 0;
}

// ——— Chooser (path map) ———

interface ChooserProgress {
  passed: boolean;
  stars: number;
}

function segColorCSS(i: number): string {
  const c = COLORS[i % 4];
  return toRGB(c);
}

function segColorDimCSS(i: number): string {
  const c = COLORS[i % 4];
  const bg: [number, number, number] = [0.059, 0.055, 0.09];
  const r = Math.round((c[0] * 0.25 + bg[0] * 0.75) * 255);
  const g = Math.round((c[1] * 0.25 + bg[1] * 0.75) * 255);
  const b = Math.round((c[2] * 0.25 + bg[2] * 0.75) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function connColorFor(i: number, progress: Map<number, ChooserProgress>): string {
  const unlocked = i === 0 || (progress.get(i - 1)?.passed ?? false);
  return unlocked ? segColorCSS(i) : segColorDimCSS(i);
}

function buildSegEl(
  i: number, segW: number, segH: number,
  progress: Map<number, ChooserProgress>,
  onLevelClick: (id: number) => void,
): HTMLElement {
  const prog = progress.get(i);
  const passed = prog?.passed ?? false;
  const stars = prog?.stars ?? 0;
  const unlocked = i === 0 || (progress.get(i - 1)?.passed ?? false);
  const isHead = i === 0;
  const isTail = i === 19;

  const seg = el('div', `seg ${passed ? 'seg-passed' : ''} ${unlocked ? '' : 'seg-locked'} ${isHead ? 'seg-head' : ''} ${isTail ? 'seg-tail' : ''}`);
  seg.style.width = `${segW}px`;
  seg.style.height = `${segH}px`;
  seg.style.backgroundColor = unlocked ? segColorCSS(i) : segColorDimCSS(i);

  if (isHead) {
    const eyes = el('div', 'seg-eyes');
    eyes.innerHTML = '<span class="seg-eye"></span><span class="seg-eye"></span>';
    seg.appendChild(eyes);
  }

  const num = el('div', 'seg-num', String(i + 1));
  seg.appendChild(num);

  if (stars > 0) {
    const starsEl = el('div', 'seg-stars');
    for (let s = 0; s < 3; s++) {
      const star = el('span', s < stars ? 'star filled' : 'star empty');
      star.textContent = '\u2605';
      starsEl.appendChild(star);
    }
    seg.appendChild(starsEl);
  }

  if (unlocked) {
    seg.addEventListener('click', () => { playClick(); onLevelClick(i); });
  }

  return seg;
}

function renderChooserPortrait(
  path: HTMLElement, L: { segW: number; segH: number },
  progress: Map<number, ChooserProgress>,
  onLevelClick: (id: number) => void,
) {
  const COLS = 4;
  const groups: number[][] = [];
  for (let i = 0; i < 20; i += COLS) {
    groups.push(Array.from({ length: Math.min(COLS, 20 - i) }, (_, j) => i + j));
  }

  const gap = Math.round(L.segW * 0.05);
  const colTemplate = Array.from({ length: COLS }, () => `${L.segW}px`).join(` ${gap}px `);
  const connW = gap + L.segW;
  const connH = L.segH;
  const connMargin = -Math.round(L.segW * 0.5);
  const bendH = Math.round(L.segH * 2.0);
  const bendMargin = -Math.round(L.segH * 0.5);

  groups.forEach((group, gi) => {
    const rowEl = el('div', 'path-row');
    rowEl.style.gridTemplateColumns = colTemplate;
    const display = gi % 2 === 1 ? [...group].reverse() : group;

    for (let di = 0; di < display.length; di++) {
      if (di > 0) {
        const connI = gi % 2 === 0 ? display[di - 1] : display[di];
        const conn = el('div', 'seg-conn');
        conn.style.backgroundColor = connColorFor(connI, progress);
        conn.style.width = `${connW}px`;
        conn.style.height = `${connH}px`;
        conn.style.margin = `0 ${connMargin}px`;
        rowEl.appendChild(conn);
      }
      rowEl.appendChild(buildSegEl(display[di], L.segW, L.segH, progress, onLevelClick));
    }
    path.appendChild(rowEl);

    if (gi < groups.length - 1) {
      const bendI = group[COLS - 1];
      const bendRow = el('div', 'path-row bend-row');
      bendRow.style.gridTemplateColumns = colTemplate;
      bendRow.style.height = `${bendH}px`;
      bendRow.style.margin = `${bendMargin}px 0`;
      const gridCol = gi % 2 === 0 ? (COLS * 2 - 1) : 1;
      const bar = el('div', 'bend-bar');
      bar.style.backgroundColor = connColorFor(bendI, progress);
      bar.style.width = `${L.segW}px`;
      bar.style.gridColumn = String(gridCol);
      bendRow.appendChild(bar);
      path.appendChild(bendRow);
    }
  });
}

function renderChooserLandscape(
  path: HTMLElement, L: { segW: number; segH: number },
  progress: Map<number, ChooserProgress>,
  onLevelClick: (id: number) => void,
) {
  path.classList.add('path-map-landscape');
  const ROWS = 3;
  const cols: number[][] = [];
  for (let i = 0; i < 20; i += ROWS) {
    cols.push(Array.from({ length: Math.min(ROWS, 20 - i) }, (_, j) => i + j));
  }

  const gap = Math.round(L.segH * 0.05);
  const rowTemplate = Array.from({ length: ROWS }, () => `${L.segH}px`).join(` ${gap}px `);
  const vConnW = L.segW;
  const vConnH = gap + L.segH;
  const vConnMargin = -Math.round(L.segH * 0.5);
  const hBendW = Math.round(L.segW * 2.0);
  const hBendMargin = -Math.round(L.segW * 0.5);

  for (let ci = 0; ci < cols.length; ci++) {
    const group = cols[ci];
    const display = ci % 2 === 1 ? [...group].reverse() : group;

    const colEl = el('div', 'path-col');
    colEl.style.gridTemplateRows = rowTemplate;

    for (let di = 0; di < display.length; di++) {
      if (di > 0) {
        const connI = ci % 2 === 0 ? display[di - 1] : display[di];
        const conn = el('div', 'seg-conn-v');
        conn.style.backgroundColor = connColorFor(connI, progress);
        conn.style.width = `${vConnW}px`;
        conn.style.height = `${vConnH}px`;
        conn.style.margin = `${vConnMargin}px 0`;
        colEl.appendChild(conn);
      }
      colEl.appendChild(buildSegEl(display[di], L.segW, L.segH, progress, onLevelClick));
    }
    path.appendChild(colEl);

    if (ci < cols.length - 1) {
      const bendI = group[group.length - 1];
      const bendCol = el('div', 'path-col bend-col');
      bendCol.style.gridTemplateRows = rowTemplate;
      bendCol.style.width = `${hBendW}px`;
      bendCol.style.margin = `0 ${hBendMargin}px`;
      const gridRow = ci % 2 === 0 ? (group.length * 2 - 1) : 1;
      const bar = el('div', 'bend-bar-h');
      bar.style.backgroundColor = connColorFor(bendI, progress);
      bar.style.gridRow = String(gridRow);
      bar.style.height = `${L.segH}px`;
      bendCol.appendChild(bar);
      path.appendChild(bendCol);
    }
  }
}

/** Render the 20-level chooser path map into a container */
export function renderChooserPath(
  container: HTMLElement,
  progress: Map<number, ChooserProgress>,
  onLevelClick: (id: number) => void,
) {
  const L = calcChooserLayout();
  const pathWrap = el('div', 'path-wrap');
  const path = el('div', 'path-map');

  if (!L.portrait) {
    renderChooserLandscape(path, L, progress, onLevelClick);
  } else {
    renderChooserPortrait(path, L, progress, onLevelClick);
  }

  pathWrap.appendChild(path);
  container.appendChild(pathWrap);
  return path;
}

/** Render history panels (valid/invalid) into container */
export function renderHistoryPanels(
  container: HTMLElement,
  validHistory: Sequence[],
  invalidHistory: Sequence[],
) {
  const historyArea = el('div', 'history-area');

  const validPanel = el('div', 'history-panel valid-panel');
  const validHeader = el('div', 'panel-header valid-header');
  validHeader.innerHTML = '<span class="header-icon">\u2714</span> Valid';
  validPanel.appendChild(validHeader);
  const validList = el('div', 'caterpillar-list');
  validList.id = 'valid-list';
  if (gameLayout.panelCols > 1) {
    validList.style.display = 'grid';
    validList.style.gridTemplateColumns = 'repeat(2, 1fr)';
    validList.style.alignContent = 'space-evenly';
  }
  for (const seq of validHistory) {
    validList.appendChild(renderCaterpillarItem(seq, 'forward', 'happy'));
  }
  validPanel.appendChild(validList);
  historyArea.appendChild(validPanel);

  const invalidPanel = el('div', 'history-panel invalid-panel');
  const invalidHeader = el('div', 'panel-header invalid-header');
  invalidHeader.innerHTML = '<span class="header-icon">\u2718</span> Invalid';
  invalidPanel.appendChild(invalidHeader);
  const invalidList = el('div', 'caterpillar-list');
  invalidList.id = 'invalid-list';
  if (gameLayout.panelCols > 1) {
    invalidList.style.display = 'grid';
    invalidList.style.gridTemplateColumns = 'repeat(2, 1fr)';
    invalidList.style.alignContent = 'space-evenly';
  }
  for (const seq of invalidHistory) {
    invalidList.appendChild(renderCaterpillarItem(seq, 'forward', 'sad'));
  }
  invalidPanel.appendChild(invalidList);
  historyArea.appendChild(invalidPanel);

  container.appendChild(historyArea);
}
