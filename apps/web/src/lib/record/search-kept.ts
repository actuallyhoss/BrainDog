/**
 * What the palette's search has already found, kept so the next letter is answered at once (slash1104, 3 Nov).
 *
 * SAM: "fix the long 'Loading...' experience when using slash (search field)". Every letter waited on the record:
 * a 120 ms pause, then `/api/search`, which on app.brain.dog answers in 160 ms on a good try and 1 to 3 s on a bad one
 * (measured from this Mac, 3 Nov). Meanwhile the list dropped its record rows and said "Looking…" alone. Now every
 * answer is kept here, and a query is first answered from what was kept: the same query again exactly, or any row kept
 * whose title has every word typed as the start of one of its words (the record's own rule, `find.ts`). The record's
 * answer still comes and replaces it, in the same order where it can (`merged`), so the list does not jump.
 *
 * KEPT IN MEMORY FOR THE TAB, AND ON THIS DEVICE BESIDE THE SHELL'S OWN COPY: the rows found are written to
 * `localStorage` for the record and the person the kept shell is for (`keptPerson`, as the sidebar keeps its projects),
 * so a fresh tab's first letters are answered too, and a sign-out takes them with it (`signed-out.ts`). Titles and
 * addresses only, at most `POOL_MOST` rows.
 *
 * PURE APART FROM THE STORE, which is handed in where a caller wants another.
 */
import type { SearchHit, SearchResult } from './api.ts';
import { terms, tokensOf } from './find.ts';
import { keptPerson } from '../shell/side-copy.ts';

export const FIND_COPY_KEY = 'braindog.find-copy';
/** Every name on the record, on this device (`learnNames`), under the same record and person rule as the copy above. */
export const FIND_NAMES_KEY = 'braindog.find-names';
/** How long the names on this device serve before the panel asks for them again. A row made since is the record's answer's to add. */
export const NAMES_FRESH_MS = 10 * 60_000;
const VERSION = 1;
/** The most rows kept for the record: enough for every name somebody types, small enough to read in a frame. */
export const POOL_MOST = 1500;
/** The most whole answers kept in memory. */
const ANSWERS_MOST = 80;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
type Named = { hit: SearchHit; words: string[] };
type Kept = {
  answers: Map<string, SearchResult>;
  pool: Map<string, SearchHit>;
  person: string | null;
  read: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  /* EVERY NAME ON THE RECORD, each with its words folded once, so a letter costs a walk and no tokenising (find1104). */
  names: Named[];
  namesAt: number;
};

/** One list of `learnNames`, its name and glyph already said, each row its number, its title and what tells it apart. */
export type NamesList = { id: string; kind: string; icon: string; rows: readonly (readonly [number, string, string?, number?, string?])[] };

function namedOf(lists: readonly NamesList[]): Named[] {
  const out: Named[] = [];
  for (const l of lists)
    for (const [seq, title, on, minor, currency] of l.rows)
      out.push({
        words: tokensOf(title),
        hit: {
          href: `/r/${l.id}/${seq}`,
          title,
          kind: l.kind,
          icon: l.icon as SearchHit['icon'],
          detail: '',
          spoken: `#${seq}`,
          ...(on ? { on } : {}),
          ...(minor !== undefined && currency ? { amount: { amount: minor, currency } } : {}),
        },
      });
  return out;
}

const kept = new Map<string, Kept>();

const here = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** The words of a query as the record folds them, joined: `Fen  Wick` and `fen wick` are one question. */
export const keyOf = (q: string): string => (terms(q) ?? []).join(' ');

function keptFor(base: string, store: Store | null): Kept {
  let k = kept.get(base);
  if (!k) {
    k = { answers: new Map(), pool: new Map(), person: null, read: false, timer: undefined, names: [], namesAt: 0 };
    kept.set(base, k);
  }
  /* ANOTHER PERSON SIGNED IN ON THIS TAB KEEPS NOTHING OF THE LAST ONE'S, in memory as on the device. */
  if (k.read && k.person !== null && keptPerson(base) !== k.person) {
    k.answers.clear();
    k.pool.clear();
    k.names = [];
    k.namesAt = 0;
    k.read = false;
  }
  if (!k.read) {
    k.read = true;
    k.person = keptPerson(base);
    try {
      const raw = store?.getItem(FIND_COPY_KEY);
      const e = raw ? (JSON.parse(raw) as { v?: number; base?: string; person?: string; rows?: unknown }) : null;
      if (e && e.v === VERSION && e.base === base && k.person !== null && e.person === k.person && Array.isArray(e.rows))
        for (const r of e.rows as [string, string, string, string, string?][])
          if (Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string')
            k.pool.set(r[0], { href: r[0], title: r[1], kind: String(r[2] ?? ''), icon: String(r[3] ?? 'rows') as SearchHit['icon'], detail: '', ...(r[4] ? { spoken: r[4] } : {}) });
    } catch {
      /* a copy that does not read is no copy */
    }
    try {
      const raw = store?.getItem(FIND_NAMES_KEY);
      const e = raw ? (JSON.parse(raw) as { v?: number; base?: string; person?: string; at?: number; lists?: NamesList[] }) : null;
      if (e && e.v === VERSION && e.base === base && k.person !== null && e.person === k.person && Array.isArray(e.lists)) {
        k.names = namedOf(e.lists);
        k.namesAt = typeof e.at === 'number' ? e.at : 0;
      }
    } catch {
      /* the same */
    }
  }
  return k;
}

/**
 * Whether the names on this device are old enough to ask for again.
 */
export function namesStale(base: string, now = Date.now(), store: Store | null = here()): boolean {
  return now - keptFor(base, store).namesAt > NAMES_FRESH_MS;
}

/**
 * THE RECORD'S NAMES, FOR THE DEVICE TO ANSWER FROM (find1104). Kept for the tab, and on this device beside the shell's
 * copy for the same record and person, and a sign-out takes it (`signed-out.ts`). Too big to store is the tab's alone.
 */
export function learnNames(base: string, lists: readonly NamesList[], now = Date.now(), store: Store | null = here()): void {
  const k = keptFor(base, store);
  k.names = namedOf(lists);
  k.namesAt = now;
  keptCount.n += 1;
  if (!store || k.person === null) return;
  try {
    store.setItem(FIND_NAMES_KEY, JSON.stringify({ v: VERSION, base, person: k.person, at: now, lists }));
  } catch {
    /* full or blocked storage: the tab still has them */
  }
}

/** How well a title answers: its whole self, then opening with the words, then its first word, then anywhere. Lower leads. */
function tierOf(want: readonly string[], words: readonly string[]): number {
  if (want.length === words.length && want.every((w, i) => w === words[i])) return 0;
  if (want.every((w, i) => (i === want.length - 1 ? words[i]?.startsWith(w) : words[i] === w))) return 1;
  return words[0]?.startsWith(want[0] ?? '') ? 2 : 3;
}

/**
 * THE ANSWER IN THE ORDER A PERSON MEANS IT: whatever is named exactly first, whatever opens with the words next, and
 * within a tier the list named `lead` (the projects) first. Rows of one list stay together under its best one.
 */
export function best(q: string, value: SearchResult, lead: string | null = null): SearchResult {
  const want = terms(q);
  if (!want) return value;
  const tierHit = (h: SearchHit): number => tierOf(want, tokensOf(h.title));
  const leads = (h: SearchHit): number => (lead !== null && h.kind === lead ? 0 : 1);
  const sort = (hits: readonly SearchHit[]): SearchHit[] =>
    hits
      .map((h, i) => ({ h, i, t: tierHit(h), l: leads(h) }))
      .sort((a, b) => a.t - b.t || a.l - b.l || a.i - b.i)
      .map((x) => x.h);
  const groups = value.groups.map((g) => ({ ...g, hits: sort(g.hits) }));
  const groupBest = (g: { hits: readonly SearchHit[] }): [number, number] => [Math.min(...g.hits.map(tierHit)), Math.min(...g.hits.map(leads))];
  const ordered = groups
    .map((g, i) => ({ g, i, b: groupBest(g) }))
    .sort((a, b) => a.b[0] - b.b[0] || a.b[1] - b.b[1] || a.i - b.i)
    .map((x) => x.g);
  return { ...value, groups: ordered, hits: ordered.flatMap((g) => g.hits) };
}

function persist(base: string, k: Kept, store: Store | null): void {
  if (!store || k.person === null || k.timer !== undefined) return;
  k.timer = setTimeout(() => {
    k.timer = undefined;
    try {
      const rows = [...k.pool.values()].slice(-POOL_MOST).map((h) => [h.href, h.title, h.kind, h.icon, ...(h.spoken ? [h.spoken] : [])]);
      store.setItem(FIND_COPY_KEY, JSON.stringify({ v: VERSION, base, person: k.person, rows }));
    } catch {
      /* full or blocked storage: the tab still keeps them */
    }
  }, 800);
}

/** Bumped on every `keep`, for a caller that draws from what is kept and wants to draw again when it grows. */
export const keptCount = { n: 0 };

/** Keep what the record answered for `q`. Only list rows go in the pool: questions and pages are read again. */
export function keep(base: string, q: string, value: SearchResult, store: Store | null = here()): void {
  const k = keptFor(base, store);
  const key = keyOf(q);
  if (key === '') return;
  k.answers.delete(key);
  k.answers.set(key, value);
  while (k.answers.size > ANSWERS_MOST) k.answers.delete(k.answers.keys().next().value!);
  for (const g of value.groups)
    for (const h of g.hits) {
      if (!h.href.startsWith('/r/')) continue;
      k.pool.delete(h.href);
      k.pool.set(h.href, { href: h.href, title: h.title, kind: h.kind, icon: h.icon, detail: '', ...(h.spoken ? { spoken: h.spoken } : {}), ...(h.on ? { on: h.on } : {}), ...(h.amount ? { amount: h.amount } : {}) });
    }
  while (k.pool.size > POOL_MOST) k.pool.delete(k.pool.keys().next().value!);
  keptCount.n += 1;
  persist(base, k, store);
}

/** At most `limit` hits, one from each list a round, as `palette.ts` cuts the record's answer (not imported: it brings the declarations). */
function roundRobin(result: SearchResult, limit: number): SearchResult {
  const hits: SearchHit[] = [];
  for (let round = 0; hits.length < limit; round++) {
    const before = hits.length;
    for (const group of result.groups) {
      const hit = group.hits[round];
      if (hit) hits.push(hit);
      if (hits.length >= limit) break;
    }
    if (hits.length === before) break;
  }
  return { ...result, hits };
}

/** Whether every word typed starts some word of `title`: the record's own rule for a match (`find.ts`). */
function says(want: readonly string[], title: string): boolean {
  const have = tokensOf(title);
  return want.every((w) => have.some((t) => t.startsWith(w)));
}

/**
 * What was kept that answers `q`, at once: `exact` when the record answered this very query before, else the kept rows
 * whose titles answer it, grouped by their list in the order they were last seen. `null` when nothing kept answers it.
 */
export function early(base: string, q: string, limit: number, lead: string | null = null, store: Store | null = here()): { value: SearchResult; exact: boolean } | null {
  const k = keptFor(base, store);
  const key = keyOf(q);
  if (key === '') return null;
  const same = k.answers.get(key);
  if (same) return { value: best(q, same, lead), exact: true };
  /* NOTHING FOR LESS IS NOTHING FOR MORE: every word typed must start a word of the row, so a query that only adds
     letters or words to one the record found nothing for finds nothing either, and says so at once. */
  for (const [was, value] of k.answers) if (value.total === 0 && key.startsWith(was)) return { value, exact: true };
  const want = key.split(' ');
  /* THE NAMES FIRST, THEN WHAT WAS KEPT THAT THEY DO NOT HOLD: a row the record answered since the names were read. */
  const named = new Set<string>();
  const found: SearchHit[] = [];
  for (const n of k.names) {
    named.add(n.hit.href);
    if (want.every((w) => n.words.some((t) => t.startsWith(w)))) found.push(n.hit);
  }
  /* NEWEST SEEN FIRST, AND A TITLE THAT STARTS WITH WHAT WAS TYPED BEFORE ONE THAT HAS IT LATER ON. */
  for (const h of [...k.pool.values()].reverse()) if (!named.has(h.href) && says(want, h.title)) found.push(h);
  if (found.length === 0) return null;
  const groups = new Map<string, SearchHit[]>();
  for (const h of found) groups.set(h.kind, [...(groups.get(h.kind) ?? []), h]);
  const value: SearchResult = {
    hits: found,
    total: found.length,
    groups: [...groups].map(([kind, hits]) => {
      const register = /^\/r\/([^/]+)\//u.exec(hits[0]!.href)?.[1];
      return { kind, total: hits.length, hits, href: register ? `/r/${register}?q=${encodeURIComponent(q.trim())}` : null };
    }),
  };
  return { value: roundRobin(best(q, value, lead), limit), exact: false };
}

/**
 * The record's answer, drawn in the order the rows already on screen were in: those still in the answer keep their
 * places, the new ones follow in the record's order. So the answer landing moves nothing that stayed.
 */
export function merged(shown: SearchResult | null, answer: SearchResult): SearchResult {
  if (shown === null || shown.hits.length === 0) return answer;
  const at = new Map(shown.hits.map((h, i) => [h.href, i]));
  const place = (h: SearchHit): number => at.get(h.href) ?? Number.MAX_SAFE_INTEGER;
  const sorted = (hits: readonly SearchHit[]): SearchHit[] => hits.map((h, i) => [h, i] as const).sort((a, b) => place(a[0]) - place(b[0]) || a[1] - b[1]).map(([h]) => h);
  const kinds = new Map(shown.groups.map((g, i) => [g.kind, i]));
  const groups = answer.groups.map((g, i) => [{ ...g, hits: sorted(g.hits) }, i] as const);
  groups.sort((a, b) => (kinds.get(a[0].kind) ?? Number.MAX_SAFE_INTEGER) - (kinds.get(b[0].kind) ?? Number.MAX_SAFE_INTEGER) || a[1] - b[1]);
  return { ...answer, hits: sorted(answer.hits), groups: groups.map(([g]) => g) };
}
