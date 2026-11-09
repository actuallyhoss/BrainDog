/**
 * THE PAGE HEAD'S BUTTONS, HANDED TO THE IPHONE'S NATIVE BAR. In the app the page's name is native's, and the row of round
 * buttons the head drew under it stood alone. The row stays in the DOM, unseen, so a press, a menu or a sheet anchored to a
 * button still works; native draws the same buttons in its bar and answers a press with `action`, which clicks the one
 * stamped `data-shell-action`.
 */
import { inIosApp, onShell, type ShellAction } from '../shell.ts';

/** The most native's bar holds beside the name. */
const MOST = 4;

/** What a button is that can be handed over, and what makes a row stay in the page: anything that takes input. */
const PRESSES = 'button, a[href]';
const INPUTS = 'input, select, textarea, [contenteditable=""], [contenteditable="true"], [role="tab"], [role="radio"], [role="combobox"], [role="slider"], .segmented';
/** A sheet or a menu the row holds is not one of its buttons. */
const HELD = 'dialog, [role="menu"], [popover], [hidden], [aria-hidden="true"]';

const bridge = (): { actions?: (list: ShellAction[]) => void } | undefined =>
  (globalThis as { __BRAINDOG_SHELL__?: { actions?: (list: ShellAction[]) => void } }).__BRAINDOG_SHELL__;

let said = '[]';
/** The head whose list native holds, so one that goes away late never clears a list that is another's. */
let owner: object | null = null;

function post(who: object, list: ShellAction[]): void {
  if (list.length === 0 && owner !== who) return;
  const s = JSON.stringify(list);
  owner = list.length === 0 ? null : who;
  if (s === said) return;
  said = s;
  bridge()?.actions?.(list);
}

/** The buttons of the row that native can draw: top-level presses, not inside a sheet or a menu, and none of them an input. */
export function collect(row: HTMLElement): HTMLElement[] | null {
  const inside = (el: Element) => !el.closest(HELD) || !row.contains(el.closest(HELD));
  for (const el of row.querySelectorAll(INPUTS)) if (inside(el)) return null;
  const found: HTMLElement[] = [];
  for (const el of row.querySelectorAll<HTMLElement>(PRESSES)) {
    if (!inside(el)) continue;
    const outer = el.parentElement?.closest(PRESSES);
    if (outer && row.contains(outer)) continue;
    found.push(el);
  }
  return found;
}

/** One button as native takes it. The icon is the `Icon`'s `data-icon`; the primary is the `Button`'s `data-weight`. */
function describe(el: HTMLElement, id: string, primary: boolean): ShellAction {
  const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim();
  return {
    id,
    label: label || (el.getAttribute('title') ?? ''),
    icon: el.querySelector('svg[data-icon]')?.getAttribute('data-icon') ?? null,
    primary,
  };
}

/**
 * Hands the row's buttons over while it holds only presses, and keeps doing so as they come and go. `handed` says whether
 * the row is native's now, so the head can give up the room it kept for it. Returns the stopper.
 */
export function handOver(row: HTMLElement, handed: (on: boolean) => void): () => void {
  if (!inIosApp || !bridge()?.actions) return () => {};
  const who = {};
  let frame = 0;
  let listening: (() => void) | null = null;
  let on = false;

  const run = () => {
    frame = 0;
    const found = collect(row);
    const shown = found && found.length > 0 ? found.slice(0, MOST) : [];
    let first = true;
    const list = shown.map((el, n) => {
      el.dataset.shellAction = `a${n}`;
      const primary = first && ['primary', 'add'].includes(el.dataset.weight ?? '');
      if (primary) first = false;
      return describe(el, `a${n}`, primary);
    });
    for (const old of row.querySelectorAll<HTMLElement>('[data-shell-action]')) if (!shown.includes(old)) delete old.dataset.shellAction;
    if (list.length > 0 && !listening) {
      listening = onShell('action', (id) => row.querySelector<HTMLElement>(`[data-shell-action="${CSS.escape(id ?? '')}"]`)?.click());
    } else if (list.length === 0 && listening) {
      listening();
      listening = null;
    }
    if ((list.length > 0) !== on) handed((on = list.length > 0));
    post(who, list);
  };
  const soon = () => {
    if (!frame) frame = requestAnimationFrame(run);
  };

  const watch = new MutationObserver(soon);
  watch.observe(row, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'hidden', 'data-weight', 'data-icon'] });
  soon();

  return () => {
    watch.disconnect();
    if (frame) cancelAnimationFrame(frame);
    listening?.();
    post(who, []);
    if (on) handed(false);
  };
}
