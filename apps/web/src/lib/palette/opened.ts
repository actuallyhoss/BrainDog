/**
 * The places a person opened last, kept on this device, for the empty palette (E55).
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

/** The name a screen gave itself: the first part of its tab title, or `null` when it only said the product. */
export function titleIn(tab: string, product: string): string | null {
  const parts = tab.split(' · ').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0]!;
  return first === product ? null : first;
}

/** What was kept, read back; anything unreadable is nothing. */
export function openedKept(raw: string | null): Opened[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((o): o is Opened => o !== null && typeof o === 'object' && typeof o.href === 'string' && typeof o.title === 'string' && typeof o.at === 'number')
      .slice(0, OPENED_CAP);
  } catch {
    return [];
  }
}

/** The list with `place` first, once, and at most `cap` long. A place that is no place to go back to changes nothing. */
export function withOpened(list: readonly Opened[], place: Opened, cap: number = OPENED_CAP): Opened[] {
  if (PASSED.test(place.href) || !place.title.trim()) return [...list];
  return [place, ...list.filter((o) => o.href !== place.href)].slice(0, cap);
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
 * THE THREE QUESTIONS THE EMPTY PALETTE OPENS ON (E55), for today: what is late, what the agents did, how long the cash
 * lasts. With a model behind the ask each one is asked. Without one, each opens the place in the bar that answers it,
 * found by its key or its name, and a question whose place is not drawn is not offered.
 */
export const TODAY_QUESTIONS = [
  { title: 'What’s late?', place: 'work' },
  { title: 'What did my agents do today?', place: 'agents' },
  { title: 'How long does the cash last?', place: 'money' },
] as const;

export function questionsOf(slash: boolean, places: readonly { key: string; href: string; label: string }[]): Asked[] {
  const out: Asked[] = [];
  for (const q of TODAY_QUESTIONS) {
    if (slash) {
      out.push({ title: q.title, href: null, ask: q.title });
      continue;
    }
    const at = places.find((p) => p.key === q.place || p.label.trim().toLowerCase() === q.place);
    if (at) out.push({ title: q.title, href: at.href, ask: null });
  }
  return out;
}
