/**
 * A PRESS GOES ON THE WAY DOWN. A rail row or a filter chip acted when the finger lifted, 80 to 120ms after it landed, and
 * showed nothing until then, so a press read as one that may not have landed. Now, on a mouse's press:
 *
 *   - the row wears `data-going` at once, which draws it as chosen (`SideBar.svelte`, `filters.css`), and what the press
 *     asks for starts on the frame after that one has painted, so the screen drawing never holds up the answer;
 *   - the click the lift would have sent is dropped, since the press has already gone.
 *
 * `el.click()` AND NOT A `goto`, so everything a press does runs as it always did: Kit's own rules for what is a move, the
 * drawer closing behind it, a chip's own handler, a saved copy turning a press away (`held.svelte.ts`).
 *
 * ONLY A MOUSE. A finger going down may be the start of a scroll, so a touch still acts on its lift and shows `:active`
 * meanwhile. Nor a press with a modifier (a new tab), another button, or on what is already chosen or is turned off.
 */

/** What goes on the way down. */
const GOES = 'a.s-row, a.s-ricon, button.filters-choice';
/** How long a row may wear the mark if the press went nowhere (a link Kit left alone, a refused move). */
const GOING_MS = 2000;

let going: HTMLElement | null = null;
let goingTimer: ReturnType<typeof setTimeout> | undefined;
/** The next real click is this press's lift. */
let liftDue = false;
let pressedAt = -Infinity;

/** Whether a row was pressed in the last `ms`: the rail holds its rows still under a hand that may press again (`SideBar`). */
export const pressedWithin = (ms: number): boolean => performance.now() - pressedAt < ms;

/**
 * The press has landed, or gone nowhere: the row goes back to being drawn from where the app is. Given where a move
 * landed, a row pressed for somewhere else since keeps its mark: its own move is still on the way.
 */
export function pressLanded(at?: URL): void {
  if (at !== undefined && going instanceof HTMLAnchorElement && going.href !== at.href) return;
  clearTimeout(goingTimer);
  going?.removeAttribute('data-going');
  going = null;
}

function down(e: PointerEvent): void {
  liftDue = false;
  if (e.pointerType !== 'mouse' || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const el = e.target instanceof Element ? e.target.closest<HTMLElement>(GOES) : null;
  if (el === null || el.getAttribute('aria-current') === 'page' || el.closest('[inert], [aria-disabled="true"], [draggable="true"]') !== null) return;
  if (el instanceof HTMLAnchorElement && el.target !== '' && el.target !== '_self') return;
  pressLanded();
  going = el;
  pressedAt = performance.now();
  el.setAttribute('data-going', '');
  goingTimer = setTimeout(() => pressLanded(), GOING_MS);
  liftDue = true;
  /* THE ANSWER PAINTS FIRST: drawing the next screen can hold the main thread for 100ms and more. */
  requestAnimationFrame(() =>
    setTimeout(() => {
      if (going === el) el.click();
    }),
  );
}

function lift(e: MouseEvent): void {
  /* A SCRIPT'S CLICK AND A KEY'S HAVE NO `detail`: ours and Enter's. Only the lift of the press is dropped. */
  if (!liftDue || !e.isTrusted || e.detail === 0) return;
  liftDue = false;
  e.preventDefault();
  e.stopImmediatePropagation();
}

/** Hears every press; what it returns stops hearing them. */
export function goOnPress(): () => void {
  const opts = { capture: true } as const;
  addEventListener('pointerdown', down, opts);
  addEventListener('click', lift, opts);
  return () => {
    removeEventListener('pointerdown', down, opts);
    removeEventListener('click', lift, opts);
    pressLanded();
  };
}
