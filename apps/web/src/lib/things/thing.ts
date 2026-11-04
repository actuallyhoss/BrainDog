/**
 * WHAT AN ADDRESS STANDS FOR. Every link into the app points at a thing of one kind, and that kind says which menu the
 * link has (`menu-of.ts`). Pure, so `node` reads it, and about an address alone: nothing is fetched to know the kind.
 */

import { here } from '../at.ts';

export type Thing =
  | { kind: 'home'; href: string }
  | { kind: 'decide'; href: string }
  | { kind: 'page'; href: string; slug: string }
  | { kind: 'list'; href: string; list: string }
  | { kind: 'row'; href: string; list: string; seq: number }
  | { kind: 'view'; href: string; view: string }
  | { kind: 'question'; href: string; id: string }
  | { kind: 'run'; href: string; id: string }
  | { kind: 'automation'; href: string; id: string }
  | { kind: 'place'; href: string };

const piece = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** The thing an in-app address names, the record's slug taken off it. */
export function thingOf(address: string): Thing {
  const [path = '', query = ''] = address.split('?');
  const rel = here(path) || '/';
  const href = query ? `${rel}?${query}` : rel;
  const m = rel.split('/').filter(Boolean);
  const asks = new URLSearchParams(query);
  /* AN ADDRESS THAT ASKS FOR SOMETHING TO BE DONE (`?new=1`) IS A PRESS WITH A NAME, not the thing: its link's verbs alone. */
  if (asks.has('new') || asks.has('first')) return { kind: 'place', href };
  if (m.length === 0) return { kind: 'home', href };
  if (m[0] === 'decide' && m.length === 1) return { kind: 'decide', href };
  if (m[0] === 'decide' && m.length === 2) return { kind: 'question', href, id: piece(m[1]!) };
  if (m[0] === 'p' && m.length === 2) return { kind: 'page', href, slug: piece(m[1]!) };
  if (m[0] === 'v' && m.length === 2) return { kind: 'view', href, view: piece(m[1]!) };
  if (m[0] === 'r' && m.length === 2) return { kind: 'list', href, list: m[1]! };
  if (m[0] === 'r' && m.length === 3 && /^[1-9]\d*$/u.test(m[2]!)) return { kind: 'row', href, list: m[1]!, seq: Number(m[2]) };
  if (m[0] === 'jobs' && m.length === 2) return { kind: 'run', href, id: piece(m[1]!) };
  /* `/automations/runs` and `/automations/new` are pages of the hub, not rules. */
  if (m[0] === 'automations' && m.length === 2 && m[1] !== 'runs' && m[1] !== 'new') return { kind: 'automation', href, id: piece(m[1]!) };
  return { kind: 'place', href };
}
