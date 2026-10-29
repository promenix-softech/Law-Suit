/**
 * Layout maths for the draft previewer: how many pages fit side by side, how far to scale them,
 * which page a spread starts on and where "next" / "previous" lead. Pure, so it is unit-tested;
 * the component only measures and animates.
 */

export type Size = { w: number; h: number };
export type Across = 1 | 2;

/** Gap between the two pages of a spread (the spine), in screen pixels. */
export const SPINE = 0;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;

/** Scale at which `across` pages of `page` size fit inside `box` entirely. */
export function fitScale(box: Size, page: Size, across: Across, gap = SPINE): number {
  if (box.w <= 0 || box.h <= 0 || page.w <= 0 || page.h <= 0) return 1;
  return Math.min((box.w - gap * (across - 1)) / (page.w * across), box.h / page.h);
}

/** Scale at which one page fills the width of `box` (continuous scroll), never above `cap`. */
export function fitWidthScale(box: Size, page: Size, cap = 1): number {
  if (box.w <= 0 || page.w <= 0) return 1;
  return Math.min(box.w / page.w, cap);
}

/**
 * Two pages side by side when the screen is wide enough for both to stay readable (at least half
 * size) and the document has more than one page; otherwise one page at a time.
 */
export function chooseAcross(box: Size, page: Size, total: number): Across {
  if (total < 2 || box.w < 900) return 1;
  return fitScale(box, page, 2) >= 0.5 ? 2 : 1;
}

/** First page (0-based) of the spread that shows `page`. Spreads are pages 1–2, 3–4, … */
export function spreadStart(page: number, across: Across): number {
  const p = Math.max(0, Math.floor(page));
  return across === 2 ? p - (p % 2) : p;
}

/** Pages shown by the spread starting at `start`: [left, right]; right is null past the end. */
export function spreadPages(start: number, across: Across, total: number): [number, number | null] {
  const right = across === 2 && start + 1 < total ? start + 1 : null;
  return [start, right];
}

/** Start of the next (+1) or previous (-1) spread, or null at either end. */
export function stepTarget(start: number, dir: 1 | -1, across: Across, total: number): number | null {
  const target = spreadStart(start, across) + dir * across;
  if (target < 0 || target >= total) return null;
  return target;
}

/** "3–4 of 12" style label parts (1-based). */
export function pageLabel(start: number, across: Across, total: number): { from: number; to: number; total: number } {
  const [left, right] = spreadPages(start, across, total);
  return { from: left + 1, to: (right ?? left) + 1, total };
}

export function zoomIn(z: number): number {
  return Math.min(MAX_ZOOM, round2(z * ZOOM_STEP));
}

export function zoomOut(z: number): number {
  return Math.max(MIN_ZOOM, round2(z / ZOOM_STEP));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
