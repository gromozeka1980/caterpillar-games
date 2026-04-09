// Dynamic layout — derives sizes from screen dimensions

// A caterpillar has 7 segment slots, with padding for antennae/legs
// the drawn aspect ratio is approximately 5.7:1 (width:height)
const CAT_ASPECT = 5.7;

export interface GameLayout {
  catW: number;
  catH: number;
  panelCols: number;
  previewW: number;
  previewH: number;
  /** Width of one column in the panel (the actual display width of a caterpillar) */
  colW: number;
}

export interface ChooserLayout {
  segW: number;
  segH: number;
  portrait: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function calcGameLayout(): GameLayout {
  const W = window.innerWidth;
  const H = window.innerHeight;

  // Estimate chrome heights (top bar + panel header, bottom section with controls)
  const landscape = W > H;
  const bottomH = (landscape && H < 500) ? 70 : 130;
  const topH = 70;
  const panelW = W / 2 - 14; // each panel width
  const listH = H - topH - bottomH;
  const maxItems = 10;
  const itemPad = 2; // .caterpillar-item vertical padding
  const gap = 2; // grid gap

  let bestCols = 1, bestCatW = 0, bestCatH = 0, bestColW = 0;

  for (const cols of [1, 2]) {
    const rows = Math.ceil(maxItems / cols);
    const colW = (panelW - (cols - 1) * 4) / cols;

    const catH = (listH - rows * itemPad - (rows - 1) * gap) / rows;
    let catW = catH * CAT_ASPECT;
    if (catW > colW) {
      catW = colW;
    }

    if (catW > bestCatW) {
      bestCols = cols;
      bestCatW = catW;
      bestCatH = catW / CAT_ASPECT;
      bestColW = colW;
    }
  }

  const catW = Math.round(Math.max(50, bestCatW));
  const catH = Math.round(Math.max(9, bestCatH));
  const finalColW = Math.round(bestColW);

  return { catW, catH, panelCols: bestCols, previewW: catW, previewH: catH, colW: finalColW };
}

export function calcChooserLayout(): ChooserLayout {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const portrait = H >= W;
  const PAD = 16;
  const chromeH = 130;

  if (portrait) {
    const availW = W - PAD * 2;
    const availH = H - chromeH;

    // 5 rows + 4 bends (bends ~1.2*segH net each, accounting for overlap)
    const segW = availW / 4.15;
    const segH = availH / (5 + 4 * 1.7);

    let w = Math.min(segW, segH * 1.4);
    let h = Math.min(segH, w / 0.9);
    w = clamp(w, 40, 80);
    h = clamp(h, 34, 68);

    return { segW: Math.round(w), segH: Math.round(h), portrait: true };
  } else {
    const availW = W - PAD * 2;
    const availH = H - chromeH;

    // 3 rows, 7 cols + 6 bends (bends ~1.0*segW net: 2.0 - 2*0.5)
    const segH = availH / (3 + 2 * 1.0);
    const segW = availW / (7 + 6 * 1.7);

    let w = Math.min(segW, segH * 1.4);
    let h = Math.min(segH, w / 0.9);
    w = clamp(w, 30, 65);
    h = clamp(h, 26, 55);

    return { segW: Math.round(w), segH: Math.round(h), portrait: false };
  }
}
