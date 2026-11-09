/**
 * THE RECORD GROWING WHILE HE LOOKS (31 Oct, "add satisfying animations the way your braindog forms and evolves"): the
 * half of the record forming that happens on a screen already drawn. A task an agent added, a person met, a question
 * raised, a line paid elsewhere: it arrives where he is looking, rises into place and wears the arrival wash for a
 * moment, and a number it moves counts to its new value under the same wash.
 *
 * WHEN IS AN ARRIVAL THE RECORD GROWING. Svelte plays an `in:` only for what is added after a list first drew, and a
 * screen's first second draws still (`calm`), so an arrival is already never a first paint. But a list also gains rows
 * because he asked it to (a filter, "Show more", a page of rows scrolled into reach), and those are not new to the
 * record. So the wash is for an arrival that lands soon after the record's version moved (`moved`, which the version
 * poll and a pull call, `live.svelte.ts`) and not just after a press or a key of his own (`growing`).
 *
 * THE WASH IS THE HOUSE'S ARRIVAL TINT, `--arrived` (a neutral solved for every word on it), held and let go over a
 * second and a half on the out curve, exactly as a list row marked `data-arrived` wears it (`blocks.css`, `rows.css`).
 * Under reduced motion it is held and then goes in one step, as `a11y.css` keeps that tint: it is the fact that the
 * thing is new, not a movement. Background colour alone: no layout, nothing moves, one paint of the element a frame.
 *
 * ITS OWN FILE WITH NOTHING IMPORTED, as `spring.ts` is, so the answering motion (`ui/motion.ts`), the record forming
 * (`motion/index.ts`), the counting figures (`count.ts`) and the version poll read it without reading each other.
 */

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** How long after the record's version moves an arrival is still the record growing: its re-reads land well inside. */
export const GROW_MS = 4_000;
/** How long after his own press or key an arrival is his doing (a filter, a fold opened), not the record's. */
export const PRESSED_MS = 700;
/** How long the wash is held and let go, the house's arrival tint (`blocks.css` `arrived`). */
export const WASH_MS = 1_500;

let movedAt = Number.NEGATIVE_INFINITY;
let pressedAt = Number.NEGATIVE_INFINITY;

if (typeof window !== 'undefined') {
  const pressed = (): void => void (pressedAt = now());
  window.addEventListener('pointerdown', pressed, { capture: true, passive: true });
  window.addEventListener('keydown', pressed, { capture: true, passive: true });
}

/** The record moved under this tab (the version poll heard a new version, or a pull read the screen again). */
export function moved(): void {
  movedAt = now();
}

/** Whether what arrives now is the record growing: its version moved a moment ago, and he did not just press anything. */
export function growing(): boolean {
  const t = now();
  return t - movedAt < GROW_MS && t - pressedAt > PRESSED_MS;
}

/** Whether he pressed or typed a moment ago, so what changes on the screen now is his doing and has its own answer. */
export function pressedJustNow(): boolean {
  return now() - pressedAt <= PRESSED_MS;
}

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The arrival tint as the skin says it now, or `''` where there is no document or no skin. */
function tint(): string {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return '';
  return getComputedStyle(document.documentElement).getPropertyValue('--arrived').trim();
}

const CLEAR = /^(?:transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/u;

/**
 * WHAT A ROW'S WASH IS LAID ON: the row, or the one block it holds where the row is only its frame (`li > a.line`, the
 * bell's lines), whose corners are the row's own, as the house lays its tint on a ledger's line (`rows.css`).
 */
function faceOf(row: HTMLElement): HTMLElement {
  const only = row.childElementCount === 1 ? row.firstElementChild : null;
  if (!(only instanceof HTMLElement)) return row;
  const shown = getComputedStyle(only).display;
  if (shown === 'inline' || shown === 'contents' || only.offsetHeight < row.offsetHeight * 0.8) return row;
  return only;
}

/**
 * THE ARRIVAL WASH ON `el`: its background goes to `--arrived` and back to its own over `WASH_MS`, once. Not on an
 * element that already wears the tint (`data-arrived`, which the host marks and the skin plays), nor twice at once.
 * `figure` is a number rather than a row: the wash takes the small radius and a little room round the digits, as a
 * project card's changed figure does, and only where the number stands on its tile's ground, so a badge with a fill of
 * its own keeps it.
 */
export function wash(el: Element | null | undefined, { figure = false }: { figure?: boolean } = {}): void {
  if (!el || typeof (el as HTMLElement).animate !== 'function' || el.hasAttribute('data-arrived') || el.closest('[data-leaving]')) return;
  const host = figure ? (el as HTMLElement) : faceOf(el as HTMLElement);
  if (host.hasAttribute('data-arrived') || host.getAnimations().some((a) => a.id === 'wash')) return;
  const color = tint();
  if (color === '') return;
  const own = getComputedStyle(host);
  const ground = own.backgroundColor;
  if (figure && !CLEAR.test(ground)) return;
  const frames: PropertyIndexedKeyframes = figure
    ? { backgroundColor: [color, 'transparent'], boxShadow: [`0 0 0 3px ${color}`, '0 0 0 3px transparent'], borderRadius: ['4px', '4px'] }
    : { backgroundColor: [color, ground] };
  const curve = own.getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.16, 1, 0.3, 1)';
  try {
    const a = host.animate(frames, { duration: WASH_MS, easing: reduced() ? 'step-end' : curve });
    a.id = 'wash';
  } catch {
    /* A browser that cannot play the frames shows the thing as it is, which is what it did before. */
  }
}

/**
 * A FILLED COUNT GOING UP GIVES A LITTLE (`Count.svelte`'s red capsule, the bell's badge): it swells by a sixth and comes
 * back on the out curve over `--form-settle`, where the wash would lay grey over its fill. Transform alone, round its
 * middle; nothing under reduced motion, where the figure changing says it.
 */
export function bump(el: Element | null | undefined): void {
  if (!el || reduced() || typeof (el as HTMLElement).animate !== 'function') return;
  const host = el as HTMLElement;
  if (host.getAnimations().some((a) => a.id === 'bump')) return;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--form-settle').trim();
  const n = Number.parseFloat(raw);
  const duration = Number.isFinite(n) ? (raw.endsWith('ms') ? n : n * 1000) : 380;
  try {
    const a = host.animate(
      [
        { transform: 'none', easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        { transform: 'scale(1.18)', offset: 0.3, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        { transform: 'none' },
      ],
      { duration },
    );
    a.id = 'bump';
  } catch {
    /* Drawn as it is. */
  }
}

/** The wash on an arrival, where the arrival is the record growing and is in the work or the bell, never the chrome. */
export function washIfGrown(el: Element | null | undefined): void {
  if (!el || !growing() || !el.closest('#main, [data-bell-body]')) return;
  wash(el);
}
