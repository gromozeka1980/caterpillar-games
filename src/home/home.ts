// Home screen — game selector

import { createAnimatedCaterpillar } from '../shared/caterpillar';
import { el, clearScreen, destroyAnimations, trackAnimation } from '../shared/ui';
import { playClick } from '../shared/sounds';
import { navigate } from '../shared/router';
import { isSignedIn, getUser, signInWithGitHub, signInWithGoogle, signOut } from '../shared/supabase';
import type { GameModule } from '../shared/router';

export const homeModule: GameModule = {
  init() { renderHome(); },
  destroy() { destroyAnimations(); },
};

export function renderHome() {
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'home-screen');

  const title = el('h1', 'game-title', 'Caterpillar Games');
  container.appendChild(title);

  const subtitle = el('p', 'game-subtitle', 'Inductive reasoning puzzles with caterpillars');
  container.appendChild(subtitle);

  // Game cards
  const cards = el('div', 'home-cards');

  // Code game card
  const codeCard = el('div', 'home-card');
  const codeCat = el('div', 'home-card-cat');
  const codeAnim = createAnimatedCaterpillar([0, 1, 2, 1, 0], 200, 40, 'forward', 'happy');
  codeCat.appendChild(codeAnim.canvas);
  trackAnimation(codeAnim);
  codeCard.appendChild(codeCat);
  codeCard.appendChild(el('div', 'home-card-title', 'Caterpillar Code'));
  codeCard.appendChild(el('div', 'home-card-desc', 'Write Python one-liners to crack the rules'));
  codeCard.addEventListener('click', () => { playClick(); navigate('code'); });
  cards.appendChild(codeCard);

  // Logic game card
  const logicCard = el('div', 'home-card');
  const logicCat = el('div', 'home-card-cat');
  const logicAnim = createAnimatedCaterpillar([3, 2, 1, 2, 3], 200, 40, 'forward', 'happy');
  logicCat.appendChild(logicAnim.canvas);
  trackAnimation(logicAnim);
  logicCard.appendChild(logicCat);
  logicCard.appendChild(el('div', 'home-card-title', 'Caterpillar Logic'));
  logicCard.appendChild(el('div', 'home-card-desc', 'Pure reasoning — no code required'));
  logicCard.addEventListener('click', () => { playClick(); navigate('logic'); });
  cards.appendChild(logicCard);

  container.appendChild(cards);

  // Auth section
  const authSection = el('div', 'auth-section');
  if (isSignedIn()) {
    const user = getUser()!;
    const avatar = user.user_metadata?.avatar_url;
    const name = user.user_metadata?.user_name || user.user_metadata?.name || user.email || 'User';

    const userRow = el('div', 'auth-user-row');
    if (avatar) {
      const img = document.createElement('img');
      img.src = avatar;
      img.className = 'auth-avatar';
      img.alt = name;
      userRow.appendChild(img);
    }
    userRow.appendChild(el('span', 'auth-username', name));
    authSection.appendChild(userRow);

    const btnRow = el('div', 'auth-btn-row');
    const outBtn = el('button', 'auth-link', 'Sign out');
    outBtn.addEventListener('click', async () => { await signOut(); renderHome(); });
    btnRow.appendChild(outBtn);
    authSection.appendChild(btnRow);
  } else {
    authSection.appendChild(el('div', 'auth-label', 'Sign in to save progress & compete'));
    const btnRow = el('div', 'auth-btn-row');
    const ghBtn = el('button', 'auth-btn-oauth', '\uf09b GitHub');
    ghBtn.style.fontFamily = 'system-ui, sans-serif';
    ghBtn.addEventListener('click', () => signInWithGitHub());
    btnRow.appendChild(ghBtn);
    const gBtn = el('button', 'auth-btn-oauth', 'Google');
    gBtn.addEventListener('click', () => signInWithGoogle());
    btnRow.appendChild(gBtn);
    authSection.appendChild(btnRow);
  }
  container.appendChild(authSection);

  // Feedback link
  const feedbackLink = el('a', 'feedback-link', 'feedback@caterpillars.games');
  (feedbackLink as HTMLAnchorElement).href = 'mailto:feedback@caterpillars.games';
  container.appendChild(feedbackLink);

  app.appendChild(container);
}
