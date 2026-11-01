/**
 * THE PHONE'S FOUR FOLLOW WHAT HE OPENS MOST (plan F7, 1 Nov). Today, Needs you, Projects and Money are right for the
 * seed, but a record that lives in Work or People sent him through Menu for the place he opens most. This device keeps
 * the places he went to last, newest first, and a place outside the four that he opens clearly more than one inside
 * takes that one's slot. Today stays first and Menu last; what he picked in Settings › Navigation wins over all of it.
 *
 * STEADY, NOT SHUFFLING: the uses are read once as the shell opens, so the bar never moves under his thumb in a session,
 * and a place must be opened `MARGIN` more times than the slot it takes, and at least `FLOOR` times, before it does.
 * What waits on him (Needs you with a count) is never pushed off.
 *
 * PURE BUT FOR `keptUses` and `noteUse`, which touch this device's storage.
 */

/** A tab the bar can draw: its key, where it goes, and its count. */
type Tab = { key: string; href: string; count?: number | undefined };

export const TAB_USE_KEY = 'bd_tab_use';
/** How many opens are kept: enough to know a habit, few enough that a new one shows within a week. */
export const TAB_USE_CAP = 60;
/** How many more opens a place needs than the slot it takes. */
export const MARGIN = 4;
/** The fewest opens a place needs before it takes a slot. */
export const FLOOR = 6;

/** The places opened, newest first, read back; anything unreadable is nothing. */
export function usesOf(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((h): h is string => typeof h === 'string').slice(0, TAB_USE_CAP) : [];
  } catch {
    return [];
  }
}

/** The list with `href` opened now, newest first, at most `TAB_USE_CAP` long. */
export const withUse = (list: readonly string[], href: string): string[] => [href, ...list].slice(0, TAB_USE_CAP);

/**
 * THE FOUR, BY USE: `tabs` as `tabsOf` chose them, with the slots after the first taken over by the places in `main` he
 * opens clearly more. A slot keeps its place on the bar; only what is in it changes.
 */
export function byUse<T extends Tab>(main: readonly T[], tabs: readonly T[], uses: readonly string[]): T[] {
  const [first, ...slots] = tabs;
  if (first === undefined || uses.length === 0) return [...tabs];
  const n = (t: Tab): number => uses.reduce((c, h) => c + (h === t.href ? 1 : 0), 0);
  const out = [...slots];
  const fixed = (t: Tab): boolean => t.key === 'decide' && (t.count ?? 0) > 0;
  for (let i = 0; i < slots.length; i++) {
    const shown = new Set([first.key, ...out.map((t) => t.key)]);
    const best = main.filter((t) => !shown.has(t.key) && t.key !== 'activity').sort((a, b) => n(b) - n(a))[0];
    if (best === undefined || n(best) < FLOOR) break;
    const open = out.map((t, at) => ({ t, at })).filter(({ t }) => !fixed(t));
    const weakest = open.sort((a, b) => n(a.t) - n(b.t) || b.at - a.at)[0];
    if (weakest === undefined || n(best) < n(weakest.t) + MARGIN) break;
    out[weakest.at] = best;
  }
  return [first, ...out];
}

/** What this device kept, for the shell to read once as it opens. */
export function keptUses(): string[] {
  try {
    return usesOf(localStorage.getItem(TAB_USE_KEY));
  } catch {
    return [];
  }
}

/** Keep `href` as a place opened now. A browser that keeps nothing keeps the default four. */
export function noteUse(href: string): void {
  try {
    localStorage.setItem(TAB_USE_KEY, JSON.stringify(withUse(usesOf(localStorage.getItem(TAB_USE_KEY)), href)));
  } catch {
    /* Nothing kept. */
  }
}
