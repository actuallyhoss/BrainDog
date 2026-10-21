/**
 * Which press is held while a screen is drawn from a saved copy, and which goes through.
 *
 * THE RULE (VERIFY H45, and the one Needs you already kept): while what is on screen is this browser's saved copy, or
 * this tab's memory of a page, and the record has not answered yet, nothing that writes can be pressed. Every control
 * stays in its live box, so nothing moves when the answer lands; it is quiet and `aria-disabled`, and a press does
 * nothing. A link still goes where it goes, and so does anything marked `data-free`, which only opens or folds what is
 * already drawn and writes nothing.
 *
 * WHY THE SCREEN AND NOT EACH BUTTON. Today alone draws its questions' answers, Tell, pause or stop, a figure's menu, the
 * Ask Claude line, the projects' strip and every tile behind More, each in its own component, and a project and Money
 * draw others. A rule kept in each of them is a rule the next button forgets. So the shell holds the screen
 * (`held.svelte.ts`), and this file says, of one press, whether it is held.
 *
 * PURE, AND NODE LOADS IT: it reads an element only through the four things below, so a test hands it plain objects.
 */

/** As much of an element as this file reads. */
export type Pressed = {
  nodeName: string;
  parentElement: Pressed | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
};

/** The roles a press acts through, as a button does. */
const ROLES = new Set(['button', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'radio', 'checkbox', 'switch', 'option', 'slider', 'spinbutton']);
/** The inputs a press acts through; every other input is typed into, which is not held. */
const PRESSED_INPUTS = new Set(['checkbox', 'radio', 'submit', 'button', 'reset', 'image', 'range', 'color', 'file']);
/** The inputs typed into, whose Enter sends what was typed. */
const TYPED = new Set(['INPUT', 'TEXTAREA']);

/** Whether `el` is a link that goes somewhere: navigation, never held. */
const isLink = (el: Pressed): boolean => el.nodeName === 'A' && el.hasAttribute('href');

/** Whether `el` is a control a press acts through. */
export function isControl(el: Pressed): boolean {
  const name = el.nodeName;
  if (name === 'BUTTON' || name === 'SELECT') return true;
  if (name === 'INPUT') return PRESSED_INPUTS.has((el.getAttribute('type') ?? 'text').toLowerCase());
  const role = el.getAttribute('role');
  return role !== null && ROLES.has(role);
}

/**
 * The control a press on `target` acts through, when it is one to hold: the nearest control at or over it inside
 * `root`, unless a link or a `data-free` mark comes first. `null` for a link, a free control, text, or anything outside.
 */
export function heldControl(target: Pressed | null, root: Pressed): Pressed | null {
  let found: Pressed | null = null;
  for (let el = target; el !== null; el = el.parentElement) {
    if (el === root) return found;
    /* A `data-free` ON A STRIP FREES EVERY CONTROL IN IT, as one on the control does. */
    if (el.hasAttribute('data-free')) return null;
    if (found !== null) continue;
    if (isLink(el)) return null;
    if (isControl(el)) {
      if (el.hasAttribute('disabled')) return null;
      found = el;
    }
  }
  /* NOT INSIDE `root` AT ALL: not this screen's to hold. */
  return null;
}

/** Whether `el` is inside `root`, walking up. */
const within = (el: Pressed | null, root: Pressed): boolean => {
  for (let at = el; at !== null; at = at.parentElement) if (at === root) return true;
  return false;
};

/** A key as this file reads it. */
export type Keyed = { key: string; metaKey: boolean; ctrlKey: boolean; target: Pressed | null };

/**
 * Whether a key pressed on `target` is held: Enter or Space on a held control (a `role="button"` acts on its own key,
 * not through a click), and Enter in a box typed into, which sends what was typed (with Cmd or Ctrl in a textarea,
 * whose plain Enter is a new line). Typing itself is never held.
 */
export function heldKey(e: Keyed, root: Pressed): boolean {
  const t = e.target;
  if (t === null || !within(t, root)) return false;
  if (TYPED.has(t.nodeName) && !isControl(t)) return e.key === 'Enter' && (t.nodeName === 'INPUT' || e.metaKey || e.ctrlKey);
  return (e.key === 'Enter' || e.key === ' ') && heldControl(t, root) !== null;
}

/** The mark this file puts on a control it held, so it takes back only what it set. */
export const HELD_MARK = 'data-held-press';
