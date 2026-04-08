// Caterpillar Logic — inductive reasoning puzzle game
// Adapted from standalone version with community levels, profile, leaderboard, sharing

import { rules, type RuleFunc } from '../shared/rules';
import { getValidInvalid, getN, type Sequence } from '../shared/utils';
import { createAnimatedCaterpillar, COLORS, type Mood } from '../shared/caterpillar';
import { ruleDescriptions } from '../shared/ruleDescriptions';
import { launchConfetti } from '../shared/confetti';
import { playClick, playPop, playValid, playInvalid, playSuccess, playWrong, playBackspace } from '../shared/sounds';
import {
  el, toRGB, seqKey, clearScreen, destroyAnimations, resetStagger,
  refreshLayout, getLayout, getOrCreateOverlay,
  removeOverlay, addToHistory, renderChooserPath, renderHistoryPanels,
  trackAnimation,
} from '../shared/ui';
import { navigate, type GameModule } from '../shared/router';
import { initSignatures, ALL_SEQS } from '../shared/signatures';
import { getUser, isSignedIn, setAuthChangeCallback, type CommunityLevel } from '../shared/supabase';
import * as api from '../shared/api';

type Screen = 'menu' | 'chooser' | 'level' | 'help' | 'community' | 'leaderboard' | 'profile';

interface LevelProgress {
  passed: boolean;
  stars: number;       // 1-3
  attempts: number;    // exam attempts
  tested: number;      // caterpillars tested before passing
}

interface GameState {
  screen: Screen;
  currentLevel: number;
  currentRule: RuleFunc | null;
  progress: Map<number, LevelProgress>;
  valids: Sequence[];
  invalids: Sequence[];
  validHistory: Sequence[];
  invalidHistory: Sequence[];
  inputChain: number[];
  mode: 'game' | 'exam';
  examQuestions: { seq: Sequence; isValid: boolean }[];
  examIndex: number;
  examAttempts: number;
  testedCount: number;
  isTutorial: boolean;
  tutorialStep: number;
  tutorialSeenValid: boolean;
  tutorialSeenInvalid: boolean;
  communityLevel: CommunityLevel | null;
}

const state: GameState = {
  screen: 'menu',
  currentLevel: -1,
  currentRule: null,
  progress: loadProgress(),
  valids: [],
  invalids: [],
  validHistory: [],
  invalidHistory: [],
  inputChain: [],
  mode: 'game',
  examQuestions: [],
  examIndex: 0,
  examAttempts: 0,
  testedCount: 0,
  isTutorial: false,
  tutorialStep: 0,
  tutorialSeenValid: false,
  tutorialSeenInvalid: false,
  communityLevel: null,
};

function loadProgress(): Map<number, LevelProgress> {
  try {
    const s = localStorage.getItem('caterpillar-progress-v2');
    if (s) {
      const arr: [number, LevelProgress][] = JSON.parse(s);
      return new Map(arr);
    }
    // Migrate from old format
    const old = localStorage.getItem('caterpillar-progress');
    if (old) {
      const ids: number[] = JSON.parse(old);
      const map = new Map<number, LevelProgress>();
      for (const id of ids) {
        map.set(id, { passed: true, stars: 1, attempts: 1, tested: 0 });
      }
      return map;
    }
  } catch { /* ignore */ }
  return new Map();
}

function saveProgress() {
  localStorage.setItem('caterpillar-progress-v2', JSON.stringify([...state.progress.entries()]));
}

// ——— Sync localStorage progress to Supabase ———

async function loadProgressFromServer() {
  if (!isSignedIn()) return;
  const user = getUser()!;
  try {
    // Fetch both logic AND code completions — code solutions count as logic too
    const [logicCompletions, codeCompletions] = await Promise.all([
      api.fetchBuiltinCompletions(user.id, 'logic'),
      api.fetchBuiltinCompletions(user.id, 'code'),
    ]);
    const allCompletions = [...logicCompletions, ...codeCompletions];
    let changed = false;
    for (const c of allCompletions) {
      const existing = state.progress.get(c.level_index);
      const serverStars = c.stars;
      if (!existing || !existing.passed) {
        state.progress.set(c.level_index, {
          passed: true,
          stars: Math.max(serverStars, existing?.stars ?? 0),
          attempts: 1,
          tested: 0,
        });
        changed = true;
      } else {
        const bestStars = Math.max(existing.stars, serverStars);
        if (bestStars > existing.stars) {
          state.progress.set(c.level_index, {
            ...existing,
            stars: bestStars,
          });
          changed = true;
        }
      }
    }
    if (changed) {
      saveProgress();
    }
  } catch { /* ignore */ }
}

async function syncProgressToServer() {
  if (!isSignedIn()) return;
  const completions: { level_index: number; stars: number; best_length: number; expression?: string }[] = [];
  for (const [level, prog] of state.progress) {
    if (prog.passed) {
      completions.push({
        level_index: level,
        stars: prog.stars,
        best_length: 0,
        expression: undefined,
      });
    }
  }
  if (completions.length > 0) {
    await api.syncBuiltinProgress(completions, 'logic').catch(() => {});
  }
}

// ——— Main Menu ———

function renderMenu() {
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'menu-screen');

  // Back to home
  const backBtn = el('button', 'back-btn', '\u2190 Home');
  backBtn.style.alignSelf = 'flex-start';
  backBtn.addEventListener('click', () => { playClick(); navigate(''); });
  container.appendChild(backBtn);

  const title = el('h1', 'game-title', 'Caterpillar Logic');
  container.appendChild(title);
  const subtitle = el('p', 'game-subtitle', 'An inductive reasoning puzzle game');
  container.appendChild(subtitle);

  // Animated demo caterpillar
  const demo = el('div', 'menu-demo');
  const anim = createAnimatedCaterpillar([0, 1, 2, 1, 0], 260, 52, 'forward', 'happy');
  demo.appendChild(anim.canvas);
  trackAnimation(anim);
  container.appendChild(demo);

  const btnCol = el('div', 'menu-buttons');

  const playBtn = el('button', 'menu-btn menu-btn-primary', '\u25b6 Play');
  playBtn.addEventListener('click', () => { playClick(); goToChooser(); });
  btnCol.appendChild(playBtn);

  const communityBtn = el('button', 'menu-btn', '\ud83c\udf10 Community Levels');
  communityBtn.addEventListener('click', () => { playClick(); showCommunityBrowser(); });
  btnCol.appendChild(communityBtn);

  const helpBtn = el('button', 'menu-btn', '\u2753 How to play');
  helpBtn.addEventListener('click', () => { playClick(); showHelp(); });
  btnCol.appendChild(helpBtn);

  container.appendChild(btnCol);

  // Profile/leaderboard links (only if signed in)
  if (isSignedIn()) {
    const linkRow = el('div', 'auth-btn-row');
    const profileBtn = el('button', 'auth-link', 'Profile');
    profileBtn.addEventListener('click', () => { playClick(); showProfile(); });
    linkRow.appendChild(profileBtn);
    const lbBtn = el('button', 'auth-link', 'Leaderboard');
    lbBtn.addEventListener('click', () => { playClick(); showLeaderboard(); });
    linkRow.appendChild(lbBtn);
    container.appendChild(linkRow);
  }

  app.appendChild(container);
}

// ——— Share Progress ———

function shareProgress(btn: HTMLElement) {
  if (!isSignedIn()) return;
  const userId = getUser()!.id;
  const base = window.location.href.split('?')[0].split('#')[0];
  const url = `${base}?user=${userId}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      btn.textContent = '\u2705 Link copied!';
      setTimeout(() => { btn.textContent = '\ud83d\udcca Share progress'; }, 2000);
    });
  } else {
    prompt('Copy this link to share your progress:', url);
  }
}

// ——— Chooser ———

function renderChooser() {
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'chooser-screen');

  // Top bar with back button
  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  topBar.appendChild(backBtn);
  const levelLabel = el('span', 'level-label', 'Choose a level');
  topBar.appendChild(levelLabel);
  container.appendChild(topBar);

  renderChooserPath(container, state.progress, (id) => startLevel(id));

  const btnRow = el('div', 'chooser-buttons');
  const tutorialBtn = el('button', 'help-btn tutorial-btn', 'Tutorial');
  tutorialBtn.addEventListener('click', () => { playClick(); startTutorial(); });
  btnRow.appendChild(tutorialBtn);
  const helpBtn = el('button', 'help-btn', 'How to play');
  helpBtn.addEventListener('click', () => { playClick(); showHelp(); });
  btnRow.appendChild(helpBtn);
  container.appendChild(btnRow);

  // Share button (only for signed-in users with progress)
  if (isSignedIn() && state.progress.size > 0) {
    const shareBtn = el('button', 'share-btn', '\ud83d\udcca Share progress');
    shareBtn.addEventListener('click', () => { playClick(); shareProgress(shareBtn); });
    container.appendChild(shareBtn);
  }

  app.appendChild(container);
}

// ——— Tutorial ———

const TUTORIAL_RULE: RuleFunc = (seq: Sequence) => new Set(seq).size === 1;

const TUTORIAL_VALID: Sequence[] = [[0,0,0], [1,1,1,1], [2,2], [3,3,3], [0,0,0,0,0], [1,1], [2,2,2,2], [3,3,3,3,3]];
const TUTORIAL_INVALID: Sequence[] = [[0,1,0], [1,2,3], [0,0,1], [3,2,3], [1,0,1,0], [2,3,2], [0,1,2,3], [1,1,0]];

interface TutorialHintDef {
  text: string;
  hasNext?: boolean;
}

const TUTORIAL_HINTS: TutorialHintDef[] = [
  // 0: Look at examples
  { text: 'These caterpillars follow a secret rule. The left ones are valid, the right ones are not. Can you spot the difference?', hasNext: true },
  // 1: Pick a color
  { text: 'Pick a color to start building a caterpillar.' },
  // 2: Add more segments
  { text: 'Add a few more segments.' },
  // 3: Watch the face
  { text: 'Watch the caterpillar\u2019s face \u2014 it smiles if it\u2019s valid, frowns if it\u2019s not. Try both!' },
  // 4: Explain the + button (auto-advances on submit)
  { text: 'Press + to save a caterpillar to your board. This helps you compare and spot the pattern.' },
  // 5: Free exploration + exam hint (dynamic text)
  { text: '' },
  // 6: Exam in progress — no hint
  { text: '' },
];

function startTutorial() {
  state.isTutorial = true;
  state.tutorialStep = 0;
  state.tutorialSeenValid = false;
  state.tutorialSeenInvalid = false;
  state.currentLevel = -1;
  state.currentRule = TUTORIAL_RULE;
  state.communityLevel = null;
  state.mode = 'game';
  state.inputChain = [];
  state.examAttempts = 0;
  state.testedCount = 0;

  state.valids = TUTORIAL_VALID;
  state.invalids = TUTORIAL_INVALID;
  state.validHistory = TUTORIAL_VALID.slice(0, 3);
  state.invalidHistory = TUTORIAL_INVALID.slice(0, 3);

  state.screen = 'level';
  renderLevel();
  renderTutorialHint();
}

function removeTutorialHint() {
  document.getElementById('tutorial-hint')?.remove();
}

function renderTutorialHint() {
  removeTutorialHint();
  if (!state.isTutorial) return;
  const step = state.tutorialStep;
  if (step >= TUTORIAL_HINTS.length) return;
  const def = TUTORIAL_HINTS[step];

  let text = def.text;
  const showNext = def.hasNext ?? false;

  // Step 5: dynamic text
  if (step === 5) {
    text = state.testedCount < 2
      ? 'Try saving a few more caterpillars to spot the pattern.'
      : 'Keep exploring, or take the exam when you\u2019re ready.';
  }
  if (!text) return;

  const hint = el('div', 'tutorial-hint');
  hint.id = 'tutorial-hint';

  const textEl = el('div', 'tutorial-hint-text', text);
  hint.appendChild(textEl);

  if (showNext) {
    const nextBtn = el('button', 'tutorial-next-btn', step === 0 ? 'Got it' : 'Continue');
    nextBtn.addEventListener('click', () => {
      playClick();
      state.tutorialStep++;
      renderTutorialHint();
    });
    hint.appendChild(nextBtn);
  }

  // Insert at top of bottom-section (inline, no fixed positioning)
  const bottom = document.getElementById('bottom-section');
  if (bottom) {
    bottom.prepend(hint);
  }
}

function advanceTutorial(action: 'addColor' | 'submit' | 'startExam') {
  if (!state.isTutorial) return;
  const step = state.tutorialStep;

  if (step === 1 && action === 'addColor') {
    state.tutorialStep = 2;
    renderTutorialHint();
  } else if (step === 2 && action === 'addColor' && state.inputChain.length >= 3) {
    state.tutorialStep = 3;
    renderTutorialHint();
  } else if (step === 4 && action === 'submit') {
    // After first save, move to free exploration
    state.tutorialStep = 5;
    renderTutorialHint();
  } else if (step === 5 && action === 'submit') {
    renderTutorialHint();
  } else if ((step === 4 || step === 5) && action === 'startExam') {
    state.tutorialStep = 6;
    removeTutorialHint();
  }
}

function handleTutorialExamFail() {
  state.mode = 'game';
  playWrong();

  const overlay = getOrCreateOverlay();
  const msg = el('div', 'exam-result fail');
  msg.innerHTML = '<div class="result-icon">\u{1F914}</div><div class="result-text">Not quite \u2014 keep exploring!</div>';
  overlay.appendChild(msg);

  setTimeout(() => {
    removeOverlay();
    renderGameInput();
    state.tutorialStep = 5;
    renderTutorialHint();
  }, 1800);
}

function handleTutorialPass() {
  playSuccess();

  const overlay = getOrCreateOverlay();
  const app = document.getElementById('app')!;
  launchConfetti(app, 3000);

  const msg = el('div', 'victory-text', 'You got it!');
  overlay.appendChild(msg);

  const reveal = el('div', 'rule-reveal');
  const revealTitle = el('div', 'reveal-title', 'The rule was:');
  reveal.appendChild(revealTitle);
  const revealText = el('div', 'reveal-text', 'All segments must be the same color.');
  reveal.appendChild(revealText);
  overlay.appendChild(reveal);

  const readyMsg = el('div', 'tutorial-ready-msg', "You're ready for the real puzzles!");
  overlay.appendChild(readyMsg);

  const startBtn = el('button', 'next-level-btn', 'Start playing \u2192');
  startBtn.addEventListener('click', () => {
    removeOverlay();
    playClick();
    state.isTutorial = false;
    goToChooser();
  });
  overlay.appendChild(startBtn);
}

// ——— Level ———

function startLevel(levelId: number) {
  state.currentLevel = levelId;
  state.currentRule = rules[levelId];
  state.communityLevel = null;
  state.mode = 'game';
  state.inputChain = [];
  state.examAttempts = 0;
  state.testedCount = 0;

  const { valid, invalid } = getValidInvalid(state.currentRule);
  state.valids = valid;
  state.invalids = invalid;
  state.validHistory = getN(7, valid);
  state.invalidHistory = getN(7, invalid);

  state.screen = 'level';
  renderLevel();
}

function renderLevel() {
  refreshLayout();
  resetStagger();
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'level-screen');

  // Top bar
  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => {
    playClick();
    if (state.isTutorial) {
      state.isTutorial = false;
      state.screen = 'menu';
      renderMenu();
    } else if (state.communityLevel) {
      state.communityLevel = null;
      showCommunityBrowser();
    } else {
      goToChooser();
    }
  });
  topBar.appendChild(backBtn);
  const levelLabel = el('span', 'level-label',
    state.isTutorial ? 'Tutorial'
    : state.communityLevel ? state.communityLevel.title
    : `Level ${state.currentLevel + 1}`
  );
  topBar.appendChild(levelLabel);

  container.appendChild(topBar);

  // Show rule button for passed built-in levels
  if (!state.communityLevel) {
    const prog = state.progress.get(state.currentLevel);
    if (prog?.passed) {
      const ruleBtn = el('button', 'rule-toggle-btn', 'Show rule');
      ruleBtn.addEventListener('click', () => {
        if (ruleBtn.classList.contains('revealed')) {
          ruleBtn.classList.remove('revealed');
          ruleBtn.textContent = 'Show rule';
        } else {
          ruleBtn.classList.add('revealed');
          ruleBtn.textContent = ruleDescriptions[state.currentLevel];
        }
      });
      container.appendChild(ruleBtn);
    }
  }

  // History panels
  renderHistoryPanels(container, state.validHistory, state.invalidHistory);

  // Bottom section
  const bottomSection = el('div', 'bottom-section');
  bottomSection.id = 'bottom-section';
  container.appendChild(bottomSection);

  app.appendChild(container);

  renderGameInput();
  if (state.mode === 'exam') renderExam();
}

// ——— Game Input ———

function renderGameInput() {
  const bottom = document.getElementById('bottom-section')!;
  bottom.innerHTML = '';

  const label = el('div', 'input-label', 'Test your hypothesis:');
  bottom.appendChild(label);

  const previewWrapper = el('div', 'input-preview');
  previewWrapper.id = 'input-preview';
  bottom.appendChild(previewWrapper);
  updateInputPreview();

  const controls = el('div', 'input-controls');

  // Color buttons group
  const colorGroup = el('div', 'btn-group color-group');
  for (let c = 0; c < 4; c++) {
    const btn = el('button', 'color-btn');
    btn.style.backgroundColor = toRGB(COLORS[c]);
    btn.addEventListener('click', () => { playClick(); addColor(c); });
    colorGroup.appendChild(btn);
  }
  controls.appendChild(colorGroup);

  // Action buttons group (backspace + add)
  const actionGroup = el('div', 'btn-group action-group');
  const bksp = el('button', 'action-btn backspace-btn', '\u232b');
  bksp.addEventListener('click', () => { playBackspace(); backspace(); });
  actionGroup.appendChild(bksp);
  const okBtn = el('button', 'action-btn ok-btn', '+');
  okBtn.title = 'Add to samples';
  okBtn.addEventListener('click', () => submitChain());
  actionGroup.appendChild(okBtn);
  controls.appendChild(actionGroup);

  // Exam button
  const examBtn = el('button', 'exam-start-btn', '\u{1F9E0} Take the exam');
  examBtn.addEventListener('click', () => { playClick(); startExam(); });
  controls.appendChild(examBtn);

  bottom.appendChild(controls);
}

let previewAnim: { destroy: () => void } | null = null;

function updateInputPreview() {
  const wrapper = document.getElementById('input-preview');
  if (!wrapper) return;

  // Destroy previous animation before creating new one
  if (previewAnim) {
    previewAnim.destroy();
    previewAnim = null;
  }
  wrapper.innerHTML = '';
  wrapper.classList.remove('preview-valid', 'preview-invalid');

  if (state.inputChain.length === 0) return;

  let mood: Mood = 'sad';
  const isValid = state.currentRule && state.currentRule(state.inputChain);
  if (isValid) {
    mood = 'happy';
  }

  wrapper.classList.add(isValid ? 'preview-valid' : 'preview-invalid');

  // Track seen expressions for tutorial
  if (state.isTutorial && state.tutorialStep === 3) {
    if (isValid) state.tutorialSeenValid = true;
    else state.tutorialSeenInvalid = true;
    // Auto-advance to "explain +" step once both expressions seen
    if (state.tutorialSeenValid && state.tutorialSeenInvalid) {
      state.tutorialStep = 4;
      renderTutorialHint();
    }
  }

  const layout = getLayout();
  const anim = createAnimatedCaterpillar(state.inputChain, layout.previewW, layout.previewH, 'forward', mood);
  previewAnim = anim;
  wrapper.appendChild(anim.canvas);
}

function addColor(c: number) {
  if (state.inputChain.length >= 7) return;
  state.inputChain = [...state.inputChain, c];
  updateInputPreview();
  advanceTutorial('addColor');
}

function backspace() {
  state.inputChain = state.inputChain.slice(0, -1);
  updateInputPreview();
}

function submitChain() {
  if (state.inputChain.length === 0) return;
  const chain = [...state.inputChain];
  const key = seqKey(chain);
  const isValid = state.currentRule!(chain);

  // Don't add duplicates
  const history = isValid ? state.validHistory : state.invalidHistory;
  if (history.some(s => seqKey(s) === key)) {
    state.inputChain = [];
    updateInputPreview();
    return;
  }

  playPop();
  state.testedCount++;

  if (isValid) {
    playValid();
    addToHistory(state.validHistory, chain, 'valid-list', 'forward', 'happy', 10);
  } else {
    playInvalid();
    addToHistory(state.invalidHistory, chain, 'invalid-list', 'forward', 'sad', 10);
  }

  state.inputChain = [];
  updateInputPreview();
  advanceTutorial('submit');
}

// ——— Exam: 15 perfect answers required ———

function startExam() {
  advanceTutorial('startExam');
  state.mode = 'exam';
  state.examAttempts++;

  const total = state.isTutorial ? 5 : 15;
  const validNum = state.isTutorial
    ? Math.floor(Math.random() * 2) + 2  // 2-3 valid out of 5
    : Math.floor(Math.random() * 6) + 5;
  const invalidNum = total - validNum;

  const validQs = getN(validNum, state.valids, state.validHistory).map(s => ({ seq: s, isValid: true }));
  const invalidQs = getN(invalidNum, state.invalids, state.invalidHistory).map(s => ({ seq: s, isValid: false }));
  const all = [...validQs, ...invalidQs];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  state.examQuestions = all;
  state.examIndex = 0;
  renderExam();
}

function renderExam() {
  const overlay = getOrCreateOverlay();

  if (state.examIndex >= state.examQuestions.length) {
    if (state.isTutorial) { handleTutorialPass(); return; }
    handleExamPass();
    return;
  }

  const q = state.examQuestions[state.examIndex];

  const progressWrap = el('div', 'exam-progress-wrap');
  const progressBar = el('div', 'exam-progress-bar');
  progressBar.style.width = `${(state.examIndex / state.examQuestions.length) * 100}%`;
  progressWrap.appendChild(progressBar);
  overlay.appendChild(progressWrap);

  const label = el('div', 'exam-label', `${state.examIndex} / ${state.examQuestions.length}`);
  overlay.appendChild(label);

  const preview = el('div', 'exam-caterpillar');
  const layout = getLayout();
  const anim = createAnimatedCaterpillar(q.seq, layout.previewW, layout.previewH);
  preview.appendChild(anim.canvas);
  trackAnimation(anim);
  overlay.appendChild(preview);

  const btnRow = el('div', 'exam-buttons');

  const validBtn = el('button', 'exam-btn valid-answer', '\u2714 Valid');
  validBtn.addEventListener('click', () => answerExam(true));
  btnRow.appendChild(validBtn);

  const invalidBtn = el('button', 'exam-btn invalid-answer', '\u2718 Invalid');
  invalidBtn.addEventListener('click', () => answerExam(false));
  btnRow.appendChild(invalidBtn);

  overlay.appendChild(btnRow);
}

function answerExam(answeredValid: boolean) {
  const q = state.examQuestions[state.examIndex];
  const isCorrect = q.isValid === answeredValid;

  if (isCorrect) {
    playValid();
    state.examIndex++;
    flashOverlay('correct');
    setTimeout(() => renderExam(), 300);
  } else {
    // Only add mistakes to samples — this is the learning moment
    playWrong();
    flashOverlay('wrong');
    if (state.currentRule!(q.seq)) {
      addToHistory(state.validHistory, q.seq, 'valid-list', 'left', 'happy', 10);
    } else {
      addToHistory(state.invalidHistory, q.seq, 'invalid-list', 'right', 'sad', 10);
    }
    setTimeout(() => state.isTutorial ? handleTutorialExamFail() : handleExamFail(), 800);
  }
}

function flashOverlay(type: 'correct' | 'wrong') {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.classList.add(`flash-${type}`);
  setTimeout(() => overlay.classList.remove(`flash-${type}`), 400);
}

function handleExamPass() {
  const isCommunity = state.communityLevel !== null;

  let stars = 1;
  if (state.examAttempts <= 1) stars = 3;
  else if (state.examAttempts <= 2) stars = 2;

  // Save progress for built-in levels
  if (!isCommunity) {
    const existing = state.progress.get(state.currentLevel);
    const bestStars = Math.max(existing?.stars ?? 0, stars);

    state.progress.set(state.currentLevel, {
      passed: true,
      stars: bestStars,
      attempts: state.examAttempts,
      tested: 0,
    });
    saveProgress();

    // Sync to server
    if (isSignedIn()) {
      api.syncBuiltinProgress([{
        level_index: state.currentLevel,
        stars: bestStars,
        best_length: 0,
        expression: undefined,
      }], 'logic').catch(() => {});
    }
  }

  // Submit solution for community levels
  if (isCommunity && isSignedIn()) {
    api.submitSolution(state.communityLevel!.id, 'exam', 0).catch(() => {});
  }

  playSuccess();

  const overlay = getOrCreateOverlay();

  const app = document.getElementById('app')!;
  launchConfetti(app, 3000);

  if (!isCommunity) {
    const starsEl = el('div', 'victory-stars');
    for (let s = 0; s < 3; s++) {
      const star = el('span', s < stars ? 'vstar filled' : 'vstar empty');
      star.textContent = '\u2605';
      star.style.animationDelay = `${s * 0.2}s`;
      starsEl.appendChild(star);
    }
    overlay.appendChild(starsEl);
  }

  const msg = el('div', 'victory-text', 'Level Complete!');
  overlay.appendChild(msg);

  const reveal = el('div', 'rule-reveal');
  const revealTitle = el('div', 'reveal-title', 'The rule was:');
  reveal.appendChild(revealTitle);
  const revealText = el('div', 'reveal-text');
  if (isCommunity) {
    revealText.textContent = state.communityLevel!.expression;
  } else {
    revealText.textContent = ruleDescriptions[state.currentLevel];
  }
  reveal.appendChild(revealText);
  overlay.appendChild(reveal);

  if (!isCommunity) {
    const stats = el('div', 'victory-stats');
    stats.innerHTML = `Exam attempts: <strong>${state.examAttempts}</strong>`;
    overlay.appendChild(stats);
  }

  // Rating buttons for community levels
  if (isCommunity && isSignedIn()) {
    const ratingRow = el('div', 'rating-row');
    ratingRow.appendChild(el('span', 'rating-label', 'Rate this level:'));
    const upBtn = el('button', 'rating-btn rating-up', '\u25b2');
    const downBtn = el('button', 'rating-btn rating-down', '\u25bc');
    upBtn.addEventListener('click', () => {
      api.rateLevel(state.communityLevel!.id, 1).catch(() => {});
      upBtn.classList.add('rating-selected');
      downBtn.classList.remove('rating-selected');
    });
    ratingRow.appendChild(upBtn);
    downBtn.addEventListener('click', () => {
      api.rateLevel(state.communityLevel!.id, -1).catch(() => {});
      downBtn.classList.add('rating-selected');
      upBtn.classList.remove('rating-selected');
    });
    ratingRow.appendChild(downBtn);
    overlay.appendChild(ratingRow);
  }

  const btnRow = el('div', 'victory-buttons');

  const nextBtn = el('button', 'next-level-btn');
  if (isCommunity) {
    nextBtn.textContent = 'Back to Levels';
    nextBtn.addEventListener('click', () => { removeOverlay(); playClick(); state.communityLevel = null; showCommunityBrowser(); });
  } else if (state.currentLevel < 19) {
    nextBtn.textContent = 'Next Level \u2192';
    nextBtn.addEventListener('click', () => { removeOverlay(); playClick(); startLevel(state.currentLevel + 1); });
  } else {
    nextBtn.textContent = 'Back to Levels';
    nextBtn.addEventListener('click', () => { removeOverlay(); playClick(); goToChooser(); });
  }
  btnRow.appendChild(nextBtn);

  overlay.appendChild(btnRow);
}

function handleExamFail() {
  state.mode = 'game';
  playWrong();

  const overlay = getOrCreateOverlay();

  const msg = el('div', 'exam-result fail');
  msg.innerHTML = '<div class="result-icon">\u{1F914}</div><div class="result-text">Not quite! Keep exploring.</div>';
  overlay.appendChild(msg);

  setTimeout(() => { removeOverlay(); renderGameInput(); }, 1800);
}

// ——— Help ———

function showHelp() {
  clearScreen();
  const app = document.getElementById('app')!;
  state.screen = 'help';

  const container = el('div', 'help-screen');

  const backBtn = el('button', 'back-btn', '\u2190 Back');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  container.appendChild(backBtn);

  const title = el('h2', 'help-title', 'How to Play');
  container.appendChild(title);

  // Animated demo caterpillar
  const demo = el('div', 'help-demo');
  const anim = createAnimatedCaterpillar([0, 1, 2, 1, 0], 280, 56, 'forward', 'happy');
  demo.appendChild(anim.canvas);
  trackAnimation(anim);
  container.appendChild(demo);

  const text = el('div', 'help-text');
  text.innerHTML = `
    <p>Each level hides a secret <strong>rule</strong> about caterpillar color patterns. Your goal: figure out the rule!</p>
    <p>You start with examples: caterpillars on the <span class="hl-valid">left are valid</span> (match the rule) and on the <span class="hl-invalid">right are invalid</span> (don't match).</p>
    <p>Build your own caterpillars to test hypotheses. Watch the face:</p>
    <ul>
      <li><strong>Smiles</strong> = valid</li>
      <li><strong>Frowns</strong> = invalid</li>
    </ul>
    <p>Press <strong>+</strong> to save a caterpillar to your board for comparison.</p>
    <p>When you're confident, take the <strong>exam</strong> — classify 15 caterpillars correctly in a row. One mistake and you're back to exploring.</p>
    <p>After passing, the rule is <strong>revealed</strong>. Earn up to 3 stars based on how many attempts it takes!</p>
    <p class="help-inspired">Inspired by <em>Zendo</em> and <em>Eleusis</em> — classic inductive reasoning games.</p>
  `;
  container.appendChild(text);

  const tryBtn = el('button', 'menu-btn menu-btn-primary help-try-btn', '\ud83c\udf93 Try the tutorial');
  tryBtn.addEventListener('click', () => { playClick(); startTutorial(); });
  container.appendChild(tryBtn);

  app.appendChild(container);
}

// ——— Community Browser ———

async function showCommunityBrowser(sort: api.LevelSort = 'newest') {
  clearScreen();
  state.screen = 'community';
  const app = document.getElementById('app')!;
  const container = el('div', 'community-screen');

  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  topBar.appendChild(backBtn);
  const titleEl = el('span', 'level-label', 'Community Levels');
  topBar.appendChild(titleEl);
  container.appendChild(topBar);

  // Sort tabs
  const tabs = el('div', 'sort-tabs');
  const sorts: { key: api.LevelSort; label: string }[] = [
    { key: 'newest', label: 'Newest' },
    { key: 'top', label: 'Top Rated' },
    { key: 'popular', label: 'Most Played' },
  ];
  for (const s of sorts) {
    const tab = el('button', `sort-tab ${s.key === sort ? 'sort-tab-active' : ''}`, s.label);
    tab.addEventListener('click', () => { playClick(); showCommunityBrowser(s.key); });
    tabs.appendChild(tab);
  }
  container.appendChild(tabs);

  // Level list
  const listEl = el('div', 'level-list');
  const loading = el('div', 'loading-text', 'Loading...');
  listEl.appendChild(loading);
  container.appendChild(listEl);
  app.appendChild(container);

  try {
    const levels = await api.fetchLevels(sort);
    listEl.innerHTML = '';
    if (levels.length === 0) {
      listEl.appendChild(el('div', 'empty-text', 'No levels yet. Be the first to create one!'));
      return;
    }
    for (const level of levels) {
      const card = el('div', 'level-card');
      card.addEventListener('click', () => { playClick(); startCommunityLevel(level); });

      const titleRow = el('div', 'level-card-title', level.title);
      card.appendChild(titleRow);

      const metaRow = el('div', 'level-card-meta');
      const author = (level.author as any)?.username || 'unknown';
      metaRow.textContent = `by ${author} \u00b7 \u25b2${level.upvotes} \u00b7 \u25b6${level.play_count} plays \u00b7 ${level.solve_count} solved`;
      card.appendChild(metaRow);

      listEl.appendChild(card);
    }
  } catch {
    listEl.innerHTML = '';
    listEl.appendChild(el('div', 'empty-text', 'Failed to load levels'));
  }
}

// ——— Community Level Play ———

async function startCommunityLevel(level: CommunityLevel) {
  // Show loading screen immediately
  clearScreen();
  const app = document.getElementById('app')!;
  const loadingScreen = el('div', 'menu-screen');
  loadingScreen.appendChild(el('div', 'loading-text', 'Loading level...'));
  app.appendChild(loadingScreen);

  state.communityLevel = level;
  state.currentLevel = -1;
  state.mode = 'game';
  state.inputChain = [];
  state.examAttempts = 0;
  state.testedCount = 0;

  // Decode signature to get the rule function
  const sigBytes = Uint8Array.from(atob(level.signature), c => c.charCodeAt(0));
  const resultMap = new Map<string, boolean>();
  ALL_SEQS.forEach((seq, i) => {
    const bit = (sigBytes[i >> 3] >> (i & 7)) & 1;
    resultMap.set(seq.join(','), bit === 1);
  });
  state.currentRule = (seq: number[]) => resultMap.get(seq.join(',')) ?? false;

  const { valid, invalid } = getValidInvalid(state.currentRule);
  state.valids = valid;
  state.invalids = invalid;
  state.validHistory = getN(7, valid);
  state.invalidHistory = getN(7, invalid);

  // Increment play count
  api.incrementPlayCount(level.id).catch(() => {});

  state.screen = 'level';
  renderLevel();
}

// ——— Profile ———

async function showProfile() {
  if (!isSignedIn()) { renderMenu(); return; }
  clearScreen();
  state.screen = 'profile';
  const app = document.getElementById('app')!;
  const container = el('div', 'profile-screen');

  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  topBar.appendChild(backBtn);
  topBar.appendChild(el('span', 'level-label', 'Profile'));
  container.appendChild(topBar);

  const content = el('div', 'profile-content');
  content.appendChild(el('div', 'loading-text', 'Loading...'));
  container.appendChild(content);
  app.appendChild(container);

  try {
    const user = getUser()!;
    const profile = await api.fetchProfile(user.id);
    content.innerHTML = '';

    if (!profile) {
      content.appendChild(el('div', 'empty-text', 'Profile not found'));
      return;
    }

    const header = el('div', 'profile-header');
    if (profile.avatar_url) {
      const img = document.createElement('img');
      img.src = profile.avatar_url;
      img.className = 'profile-avatar';
      header.appendChild(img);
    }
    header.appendChild(el('div', 'profile-name', profile.username));
    content.appendChild(header);

    const stats = el('div', 'profile-stats');
    stats.innerHTML = `
      <div class="stat-item"><div class="stat-value">${profile.builtin_solved}</div><div class="stat-label">Built-in solved</div></div>
      <div class="stat-item"><div class="stat-value">${profile.builtin_stars} \u2605</div><div class="stat-label">Stars</div></div>
      <div class="stat-item"><div class="stat-value">${profile.community_solved}</div><div class="stat-label">Community solved</div></div>
      <div class="stat-item"><div class="stat-value">${profile.levels_created}</div><div class="stat-label">Levels created</div></div>
    `;
    content.appendChild(stats);
  } catch {
    content.innerHTML = '';
    content.appendChild(el('div', 'empty-text', 'Failed to load profile'));
  }
}

// ——— Leaderboard ———

async function showLeaderboard() {
  clearScreen();
  state.screen = 'leaderboard';
  const app = document.getElementById('app')!;
  const container = el('div', 'leaderboard-screen');

  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  topBar.appendChild(backBtn);
  topBar.appendChild(el('span', 'level-label', 'Leaderboard'));
  container.appendChild(topBar);

  const content = el('div', 'leaderboard-content');
  content.appendChild(el('div', 'loading-text', 'Loading...'));
  container.appendChild(content);
  app.appendChild(container);

  try {
    const players = await api.fetchLogicLeaderboard();
    content.innerHTML = '';

    if (players.length === 0) {
      content.appendChild(el('div', 'empty-text', 'No players yet'));
      return;
    }

    // Column headers
    const header = el('div', 'lb-row lb-header');
    header.appendChild(el('span', 'lb-rank', ''));
    header.appendChild(el('span', '')); // avatar spacer
    header.appendChild(el('span', 'lb-name', 'Player'));
    header.appendChild(el('span', 'lb-stars', 'Campaign'));
    header.appendChild(el('span', 'lb-community', 'Community'));
    content.appendChild(header);

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const row = el('div', 'lb-row');

      const rank = el('span', 'lb-rank', `#${i + 1}`);
      row.appendChild(rank);

      if (p.avatar_url) {
        const img = document.createElement('img');
        img.src = p.avatar_url;
        img.className = 'lb-avatar';
        row.appendChild(img);
      } else {
        row.appendChild(el('span', '')); // avatar placeholder
      }

      const name = el('span', 'lb-name', p.username);
      row.appendChild(name);

      const stars = el('span', 'lb-stars', `${p.builtin_stars} \u2605`);
      stars.title = 'Campaign stars (built-in levels)';
      row.appendChild(stars);

      const community = el('span', 'lb-community', `${p.community_solved} \u2714`);
      community.title = 'Community levels solved';
      row.appendChild(community);

      content.appendChild(row);
    }
  } catch {
    content.innerHTML = '';
    content.appendChild(el('div', 'empty-text', 'Failed to load leaderboard'));
  }
}

// ——— Shared Progress ———

function tryShowSharedProgress(): boolean {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('user');
  if (!userId) return false;
  renderSharedProgress(userId);
  return true;
}

async function renderSharedProgress(userId: string) {
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'chooser-screen');

  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    state.screen = 'menu';
    renderMenu();
  });
  topBar.appendChild(backBtn);
  const label = el('span', 'level-label', 'Loading...');
  topBar.appendChild(label);
  container.appendChild(topBar);
  app.appendChild(container);

  // Fetch profile and completions
  const [profile, completions] = await Promise.all([
    api.fetchProfile(userId),
    api.fetchBuiltinCompletions(userId, 'logic'),
  ]);

  label.textContent = profile ? `${profile.username}'s progress` : 'Shared progress';

  // Build temporary progress map for rendering
  const sharedProgress = new Map<number, { passed: boolean; stars: number }>();
  for (const c of completions) {
    sharedProgress.set(c.level_index, { passed: true, stars: c.stars });
  }

  renderChooserPath(container, sharedProgress, () => { /* read-only — no click action */ });

  // Disable all clicks (read-only)
  const pathMap = container.querySelector('.path-map');
  if (pathMap) {
    pathMap.querySelectorAll('.seg').forEach(seg => {
      (seg as HTMLElement).style.pointerEvents = 'none';
      (seg as HTMLElement).style.cursor = 'default';
    });
  }

  // Stats
  const passed = sharedProgress.size;
  const totalStars = [...sharedProgress.values()].reduce((a, p) => a + p.stars, 0);
  const statsEl = el('div', 'shared-stats');
  statsEl.innerHTML = `${passed}/20 levels \u00b7 ${totalStars} \u2605`;
  container.appendChild(statsEl);
}

function goToChooser() {
  state.screen = 'chooser';
  state.mode = 'game';
  state.inputChain = [];
  state.isTutorial = false;
  state.communityLevel = null;
  removeTutorialHint();
  renderChooser();
}

// ——— Resize handler ———

let resizeHandler: (() => void) | null = null;
let resizeTimer = 0;

function installResizeHandler() {
  if (resizeHandler) return; // already installed
  resizeHandler = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (state.screen === 'menu') renderMenu();
      else if (state.screen === 'chooser') renderChooser();
      else if (state.screen === 'level') renderLevel();
    }, 200);
  };
  window.addEventListener('resize', resizeHandler);
}

function removeResizeHandler() {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  clearTimeout(resizeTimer);
}

// ——— Module export ———

export const logicModule: GameModule = {
  async init() {
    initSignatures();

    // Re-render menu when auth state changes
    setAuthChangeCallback(async () => {
      if (isSignedIn()) {
        await loadProgressFromServer();
        if (state.progress.size > 0) syncProgressToServer();
      }
      if (state.screen === 'menu') renderMenu();
      else if (state.screen === 'chooser') renderChooser();
    });

    // Load server progress and sync local -> server on sign-in
    if (isSignedIn()) {
      await loadProgressFromServer();
      if (state.progress.size > 0) syncProgressToServer();
    }

    if (!tryShowSharedProgress()) {
      renderMenu();
    }

    installResizeHandler();
  },

  destroy() {
    removeResizeHandler();
    destroyAnimations();
  },
};
