/**
 * A PAGE OR LIST THE OWNER CHANGED, WITH THE WORDS AN UPDATE CHANGED CARRIED INTO IT (UP1, RH2, RH3, 31 Oct).
 *
 * WHY. A page somebody arranged is kept as they left it (`Diff.kept`), which is right for what they did and wrong for
 * what they did not: a Personal record whose Goals page had one block moved kept "Put by lately" after Personal 2.9.1
 * called it "Saved lately", and a founder's moved project page kept "Kind" after 3.8.1 said "What it is". Only words
 * move here (and a page's place on the rail). The blocks, their order, what each reads and every word the owner typed
 * stay theirs.
 *
 * BY PLACE, NEVER BY TEXT (RH2). The first build swapped an old word for its new one wherever the owner's page said it,
 * so an update renaming one of People's two "Name" columns renamed both, and a heading he typed that happened to equal
 * a renamed label was renamed too. Now three bodies are set side by side: the one the owner's edit started from
 * (`start`, the pack's last body), the owner's (`mine`) and the update's (`next`). Each place of `mine` is found in
 * `start`, and that place in `next`; a value is changed only where `mine` still holds exactly what `start` held there
 * and `next` holds something else. Anything the owner typed, at any place, is never the pack's old word, and stays.
 *
 * PLACES. A map's keys are places by name. A list of parts (a page's blocks, a table's columns) is lined up part by
 * part on what each part is with its words left out, the longest run in order first, then a part the owner moved to
 * an equal part left over, then (the owner's side only) a block he reshaped to the one block of its kind left over.
 * A list's fields are lined up by their `id`.
 *
 * ONLY THE WORDS A PERSON READS: on a page a heading, a line, an empty line, a label, a title, a section, and the
 * page's `nav.place` and `nav.order` (RH8, which is where the update put the page on the rail); on a list its name, its
 * one, what it holds, a field's label and a value's label. Ids, figures, lists read, fields, icons and every other
 * value are never touched, so nothing the page or the list reads can change.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Whether the value at `key`, inside a map held at `parent`, is one the update's change is carried in for. */
type Carries = (key: string, parent: string) => boolean;

/** The keys of a page's body whose value is words a person reads. */
const WORD_KEYS: ReadonlySet<string> = new Set(['heading', 'body', 'empty', 'label', 'note', 'title', 'section', 'unset', 'cells']);

/** A page: its words, and where its rail entry sits (RH8). */
const PAGE: Carries = (key, parent) => WORD_KEYS.has(key) || (parent === 'nav' && (key === 'place' || key === 'order'));

/** A list: its name, its one, what it holds, each field's label and each value's label. Never `title`, which names a field. */
const LIST: Carries = (key, parent) => (parent === '' && (key === 'name' || key === 'one' || key === 'holds')) || (parent === 'fields' && key === 'label') || parent === 'labels';

const isMap = (v: Json | undefined): v is { [key: string]: Json } => v !== null && typeof v === 'object' && !Array.isArray(v);
const isLeaf = (v: Json | undefined): v is string | number | boolean | null => v === null || (typeof v !== 'object' && v !== undefined);

/** What a part is with the carried values left out, so two versions of one part read the same here. */
function skeleton(v: Json, carries: Carries, key = '', parent = ''): string {
  if (isLeaf(v)) return carries(key, parent) ? '""' : JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => skeleton(x, carries, key, parent)).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${skeleton(v[k]!, carries, k, key)}`).join(',')}}`;
}

/** The ids of a list of maps that each carry their own distinct string `id`, or `null` when any does not. */
function idsOf(xs: readonly Json[]): string[] | null {
  const ids = xs.map((x) => (isMap(x) && typeof x.id === 'string' ? x.id : null));
  return ids.every((id): id is string => id !== null) && new Set(ids).size === ids.length ? ids : null;
}

/**
 * The places two lists line up, as index pairs of `a` and `b`. `reshaped` also pairs a block left over on each side
 * with the one left over of the same `kind`, which is asked only of the owner's page against the pack's: the owner
 * may have changed what a block reads and kept its heading, and the update replacing a block is never taken for it.
 */
function matched(a: readonly Json[], b: readonly Json[], carries: Carries, key: string, parent: string, reshaped: boolean): Map<number, number> {
  const out = new Map<number, number>();
  const ia = idsOf(a);
  const ib = idsOf(b);
  if (ia !== null && ib !== null && ia.length > 0 && ib.length > 0) {
    ia.forEach((id, i) => {
      const j = ib.indexOf(id);
      if (j >= 0) out.set(i, j);
    });
    return out;
  }
  const sa = a.map((x) => skeleton(x, carries, key, parent));
  const sb = b.map((x) => skeleton(x, carries, key, parent));
  const n = a.length;
  const m = b.length;
  const run: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) run[i]![j] = sa[i] === sb[j] ? run[i + 1]![j + 1]! + 1 : Math.max(run[i + 1]![j]!, run[i]![j + 1]!);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sa[i] === sb[j]) {
      out.set(i, j);
      i++;
      j++;
    } else if (run[i + 1]![j]! >= run[i]![j + 1]!) i++;
    else j++;
  }
  /* A PART MOVED OUT OF THE RUN is the same part all the same: the first equal part left over, in order. */
  const taken = new Set(out.values());
  for (let x = 0; x < n; x++) {
    if (out.has(x)) continue;
    const y = sb.findIndex((s, k) => !taken.has(k) && s === sa[x]);
    if (y >= 0) {
      out.set(x, y);
      taken.add(y);
    }
  }
  if (!reshaped) return out;
  const kindOf = (v: Json | undefined): string | null => (isMap(v) && typeof v.kind === 'string' ? v.kind : null);
  const leftA = [...a.keys()].filter((x) => !out.has(x));
  const leftB = [...b.keys()].filter((y) => !taken.has(y));
  for (const x of leftA) {
    const kind = kindOf(a[x]);
    if (kind === null) continue;
    const sameA = leftA.filter((k) => kindOf(a[k]) === kind);
    const sameB = leftB.filter((k) => kindOf(b[k]) === kind);
    if (sameA.length === 1 && sameB.length === 1) out.set(x, sameB[0]!);
  }
  return out;
}

/** `mine` with each carried value the update changed at a place `mine` still holds as `start` did. `words` gathers the new words. */
function carried(start: Json, mine: Json, next: Json, carries: Carries, words: string[], key = '', parent = ''): Json {
  if (isLeaf(mine)) {
    if (!carries(key, parent) || !isLeaf(start) || !isLeaf(next) || mine !== start || next === start || typeof next !== typeof start) return mine;
    if (typeof next === 'string' && next !== '') words.push(next);
    return next;
  }
  if (Array.isArray(mine)) {
    if (!Array.isArray(start) || !Array.isArray(next)) return mine;
    const toNext = matched(start, next, carries, key, parent, false);
    const toStart = new Map([...matched(start, mine, carries, key, parent, true)].map(([s, m]) => [m, s] as const));
    return mine.map((x, j) => {
      const s = toStart.get(j);
      const n = s === undefined ? undefined : toNext.get(s);
      return s === undefined || n === undefined ? x : carried(start[s]!, x, next[n]!, carries, words, key, parent);
    });
  }
  if (!isMap(start) || !isMap(next)) return mine;
  return Object.fromEntries(Object.entries(mine).map(([k, x]) => [k, Object.hasOwn(start, k) && Object.hasOwn(next, k) ? carried(start[k]!, x, next[k]!, carries, words, k, key) : x]));
}

/** What a carry made: the owner's body with the update's change in, and the new words it took, each once. */
export type Reworded = { body: Json; words: string[] };

function carry(start: Json, mine: Json, next: Json, carries: Carries): Reworded | null {
  const words: string[] = [];
  const body = carried(start, mine, next, carries, words);
  return JSON.stringify(body) === JSON.stringify(mine) ? null : { body, words: [...new Set(words)] };
}

/**
 * The owner's page (`mine`) with the words the update changed from `start` to `next` carried in, or `null` when no word
 * of the pack's that the owner's page still holds changed. Each is a page's body; the answer's `body` is one too.
 */
export function reworded(start: Json, mine: Json, next: Json): Reworded | null {
  return carry(start, mine, next, PAGE);
}

/**
 * THE SAME FOR A LIST THE OWNER CHANGED, AND ONLY FOR AN UPDATE THAT CHANGES NOTHING OF IT BUT WORDS (RH3). Team 2.30.1
 * says Sprints where it said Cycles, and a list the owner had changed beyond adding fields was a conflict for that, so
 * the record was refused that update and every later one, each night. Words carry; the shape is the owner's, and the
 * update changes no shape, so nothing it brings is lost.
 *
 * `null` when the update changes more of the list than its words, which stays the question it was. `{ body: null }`
 * when it changes words only and the owner's list holds none of the old ones: kept as the owner left it.
 */
export function relisted(start: Json, mine: Json, next: Json): { body: Json | null; words: string[] } | null {
  if (!isMap(start) || !isMap(mine) || !isMap(next)) return null;
  if (skeleton(start, LIST) !== skeleton(next, LIST)) return null;
  return carry(start, mine, next, LIST) ?? { body: null, words: [] };
}
