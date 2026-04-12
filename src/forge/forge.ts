// Number Forge — embedded via iframe from GitHub Pages

import { el, clearScreen } from '../shared/ui';
import { playClick } from '../shared/sounds';
import { navigate, type GameModule } from '../shared/router';

const FORGE_URL = 'https://gromozeka1980.github.io/number-forge/';

export const forgeModule: GameModule = {
  init() {
    clearScreen();
    const app = document.getElementById('app')!;
    const container = el('div', 'forge-screen');

    // Small back button floating over iframe
    const backBtn = el('button', 'forge-back-btn', '\u2190 Home');
    backBtn.addEventListener('click', () => { playClick(); navigate(''); });
    container.appendChild(backBtn);

    const iframe = document.createElement('iframe');
    iframe.className = 'forge-iframe';
    iframe.src = FORGE_URL;
    iframe.allow = 'autoplay';
    container.appendChild(iframe);

    app.appendChild(container);
  },
  destroy() {
    // iframe removed automatically by clearScreen
  },
};
