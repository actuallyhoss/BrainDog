/**
 * The places a person opened last, kept on this device, for the empty palette.
 *
 * THE EMPTY PALETTE LISTED THE LAST ROWS ANYONE CHANGED, and on his record that was four "Instalment" rows an import
 * touched. What he opened is what he goes back to, and the record holds no visits, so this device keeps the last few:
 * an address and the name the screen gave itself in the tab title. Nothing leaves the device.
 *
 * PURE BUT FOR `noteOpened`, so `node --test` holds the rules.
 */

/** One place opened. */
export type Opened = { href: string; title: string; at: number };

export const OPENED_KEY = 'bd_opened';
export const OPENED_CAP = 5;

/** Addresses that are not a place to go back to: the way in, the start, and Today, which the bar always draws. */
const PASSED = /^\/(?:$|signin|signup|start|invite|connect)(?:[/?#]|$)/u;

/**
 * A handle and not a name: a question's `SG240`, a run's `S42`, a row's `tasks#4`. A screen whose tab still says one
 * had not named itself yet (Recent listed "SG240"), so it is not kept by that name.
 */
const HANDLE = /^(?:[A-Z]{1,3}[1-9][0-9]*|[a-z][a-z0-9_]*#[1-9][0-9]*)$/u;

/**
 * THE PLACES WHOSE SCREENS ARE NAMED UNDER THEM, so a screen of one is said with it: "Add-ons: Browse", "Settings:
 * Navigation". Recent said "Browse" alone, which names nothing.
 */
const WITHIN = new Set(['Add-ons', 'Settings']);

/** The name a screen gave itself: the first part of its tab title, or `null` when it only said the product or a handle. */
export function titleIn(tab: string, product: string): string | null {
  const parts = tab.split(' · ').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0]!;
  if (first === product || HANDLE.test(first)) return null;
  const place = parts.length > 2 ? parts[1]! : null;
  return place !== null && WITHIN.has(place) ? `${place}: ${first}` : first;
}

/** One place a name: the newest of those kept under the same name, so Recent never folds two into "Add-ons 2". */
const onceEach = (list: readonly Opened[]): Opened[] => list.filter((o, i) => list.findIndex((p) => p.title.trim() === o.title.trim()) === i);

/** What was kept, read back; anything unreadable is nothing. */
export function openedKept(raw: string | null): Opened[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((o): o is Opened => o !== null && typeof o === 'object' && typeof o.href === 'string' && typeof o.title === 'string' && typeof o.at === 'number' && !HANDLE.test(o.title.trim()))
      .filter((o, i, all) => all.findIndex((p) => p.title.trim() === o.title.trim()) === i)
      .slice(0, OPENED_CAP);
  } catch {
    return [];
  }
}

/** The list with `place` first, once, and at most `cap` long. A place that is no place to go back to changes nothing. */
export function withOpened(list: readonly Opened[], place: Opened, cap: number = OPENED_CAP): Opened[] {
  if (PASSED.test(place.href) || !place.title.trim() || HANDLE.test(place.title.trim())) return [...list];
  return onceEach([place, ...list.filter((o) => o.href !== place.href)]).slice(0, cap);
}

/** The places opened, newest first, for the palette. */
export function opened(): Opened[] {
  try {
    return openedKept(localStorage.getItem(OPENED_KEY));
  } catch {
    return [];
  }
}

/**
 * Keep `href` as opened, under the name its screen settles on. THE TITLE IS READ A MOMENT LATER, because a screen names
 * itself once its read lands; a move on before then keeps nothing.
 */
export function noteOpened(href: string, product: string, wait = 800): void {
  if (typeof document === 'undefined' || PASSED.test(href)) return;
  setTimeout(() => {
    if (`${location.pathname}${location.search}` !== href) return;
    const title = titleIn(document.title, product);
    if (title === null) return;
    try {
      localStorage.setItem(OPENED_KEY, JSON.stringify(withOpened(opened(), { href, title, at: Date.now() })));
    } catch {
      /* A full or blocked store keeps nothing, and the palette draws its other rows. */
    }
  }, wait);
}

/** One question the empty palette offers: asked when a model is behind the ask, else the place that answers it. */
export type Asked = { title: string; href: string | null; ask: string | null };

/**
 * THE THREE QUESTIONS THE EMPTY PALETTE OPENS ON, for today: what needs him, what the agents did, what changed.
 * With a model behind the ask each one is asked. Without one, each opens the screen of the shell that answers it, which
 * every record has whatever it installed: Needs you, Agents and the log. None names an add-on's place.
 */
export const TODAY_QUESTIONS = [
  { title: 'What needs me today?', href: '/decide', place: 'Needs you' },
  { title: 'What did my agents do today?', href: '/p/agents', place: 'What your agents did' },
  { title: 'What changed today?', href: '/audit', place: 'What changed' },
] as const;

/* WITHOUT A MODEL EACH IS NAMED AS THE PLACE IT OPENS, never as a question nobody will answer (audit 31 Oct g, AG5).
   AND A PLACE THE RECORD DOES NOT HOLD IS NOT OFFERED (empty states, 2 Nov): a new BrainDog has no agents page, and
   "What your agents did" opened "No page called agents". `pages` is the record's declared pages; absent, all three. */
export const questionsOf = (slash: boolean, pages?: readonly string[] | null): Asked[] =>
  TODAY_QUESTIONS.flatMap((q): Asked[] =>
    slash ? [{ title: q.title, href: null, ask: q.title }] : pages && q.href.startsWith('/p/') && !pages.includes(q.href.slice(3)) ? [] : [{ title: q.place, href: q.href, ask: null }],
  );
