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
 * PLACES. A map's keys are places by name. A list's fields, and any list whose parts each carry an `id`, are lined up
 * by their `id`; a part that names itself where not all do (a block's `key`) is lined up by that name. Any other list
 * of parts (a page's blocks, a table's columns, a link block's rows) is lined up only where it is certain which part
 * is which (RJ1): first the parts equal with their words in, the longest run in order; then, between two of those, a
 * part whose shape with its words left out is the only one of that shape in that gap on each side and whose old words
 * are not another part's; then a part the owner moved, whose shape is the only one of its kind in the whole list on
 * each side; then (the owner's side only) a block he reshaped to the one block of its kind left over. A part never
 * lined up is left exactly as the owner has it. Look-alike parts (three link rows, each `{cells: [words, target,
 * words]}`) were once paired by position, so an update dropping one row moved the next row's words and target into his.
 *
 * A TARGET IS NEVER A WORD (RJ1). A value that is a path or an address (`/r/…`, `https://…`) is what a part points at:
 * it is part of what the part is, so it tells look-alike rows apart, and it is never carried.
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

/** A path or an address a part points at: never a word, whatever key holds it (RJ1). */
const isTarget = (v: Json | undefined): boolean => typeof v === 'string' && /^\/|:\/\//.test(v);

/** Whether `v`, held at `key` in a map held at `parent`, is words a person reads that may be carried. */
const isWords = (v: Json | undefined, carries: Carries, key: string, parent: string): boolean => carries(key, parent) && !isTarget(v);

/** What a part is with the carried values left out, so two versions of one part read the same here. */
function skeleton(v: Json, carries: Carries, key = '', parent = ''): string {
  if (isLeaf(v)) return isWords(v, carries, key, parent) ? '""' : JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => skeleton(x, carries, key, parent)).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${skeleton(v[k]!, carries, k, key)}`).join(',')}}`;
}

/** A part's words, each at its place, or `null` when it has none: what tells a reworded part from a moved one. */
function wordsOf(v: Json, carries: Carries, key = '', parent = ''): string | null {
  const out: string[] = [];
  const walk = (x: Json, k: string, p: string, at: string): void => {
    if (isLeaf(x)) {
      if (typeof x === 'string' && x !== '' && isWords(x, carries, k, p)) out.push(`${at}=${x}`);
    } else if (Array.isArray(x)) x.forEach((y, i) => walk(y, k, p, `${at}[${i}]`));
    else for (const c of Object.keys(x).sort()) walk(x[c]!, c, k, `${at}.${c}`);
  };
  walk(v, key, parent, '');
  return out.length === 0 ? null : JSON.stringify(out);
}

/** The name a part gives itself: its `id`, or else a block's declared `key`; `null` for a part with neither. */
const nameOf = (v: Json | undefined): string | null => (isMap(v) ? (typeof v.id === 'string' ? `id:${v.id}` : typeof v.key === 'string' ? `key:${v.key}` : null) : null);

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
  /* 0. A PART THAT NAMES ITSELF (its `id`, or a block's `key`) is that part wherever it is, when one part on each side has the name. */
  const ka = a.map(nameOf);
  const kb = b.map(nameOf);
  ka.forEach((k, x) => {
    if (k === null || ka.filter((o) => o === k).length !== 1 || kb.filter((o) => o === k).length !== 1) return;
    out.set(x, kb.indexOf(k));
  });
  const whole: Carries = () => false;
  const fa = a.map((x) => skeleton(x, whole));
  const fb = b.map((x) => skeleton(x, whole));
  const sa = a.map((x) => skeleton(x, carries, key, parent));
  const sb = b.map((x) => skeleton(x, carries, key, parent));
  const wa = a.map((x) => wordsOf(x, carries, key, parent));
  const wb = b.map((x) => wordsOf(x, carries, key, parent));
  const taken = new Set(out.values());
  const A = [...a.keys()].filter((x) => !out.has(x));
  const B = [...b.keys()].filter((y) => !taken.has(y));
  const n = A.length;
  const m = B.length;
  /* 1. THE PARTS EQUAL WITH THEIR WORDS IN, the longest run in order: the same part on both sides, past doubt. */
  const run: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) run[i]![j] = fa[A[i]!] === fb[B[j]!] ? run[i + 1]![j + 1]! + 1 : Math.max(run[i + 1]![j]!, run[i]![j + 1]!);
  const anchors: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (fa[A[i]!] === fb[B[j]!]) {
      anchors.push([i, j]);
      i++;
      j++;
    } else if (run[i + 1]![j]! >= run[i]![j + 1]!) i++;
    else j++;
  }
  for (const [x, y] of anchors) {
    out.set(A[x]!, B[y]!);
    taken.add(B[y]!);
  }
  /*
   * A PART PAIRED BY ITS SHAPE ALONE only where that is not in doubt: the shape is the one of its kind among `inA` and
   * among `inB`, and neither part's words are those of another part on the far side (a part the update reworded while
   * another took its old words is not known for which it is). Anything else is left as the owner has it.
   */
  const pairOnly = (xs: readonly number[], ys: readonly number[], inA: readonly number[] = xs, inB: readonly number[] = ys): void => {
    for (const x of xs) {
      if (out.has(x)) continue;
      const sameA = inA.filter((k) => sa[k] === sa[x]);
      const sameB = inB.filter((k) => sb[k] === sa[x]);
      if (sameA.length !== 1 || sameB.length !== 1) continue;
      const y = sameB[0]!;
      if (taken.has(y) || !ys.includes(y)) continue;
      if (wa[x] !== wb[y]) {
        if (wa[x] !== null && wb.some((w, k) => k !== y && w === wa[x])) continue;
        if (wb[y] !== null && wa.some((w, k) => k !== x && w === wb[y])) continue;
      }
      out.set(x, y);
      taken.add(y);
    }
  };
  /* 2. BETWEEN TWO ANCHORS, the parts in that gap on each side. */
  let pa = -1;
  let pb = -1;
  for (const [x, y] of [...anchors, [n, m] as [number, number]]) {
    const xs = A.slice(pa + 1, x);
    const ys = B.slice(pb + 1, y);
    if (xs.length > 0 && ys.length > 0) pairOnly(xs, ys);
    pa = x;
    pb = y;
  }
  /*
   * 3. A PART MOVED OUT OF THE RUN is the same part all the same: an equal part left over, then a shape that is the
   * only one of its kind in the whole list on each side. Only of its kind among the parts left over is not enough: a
   * row the update dropped from the top and one it added at the foot are each the only one left, and are not one row.
   */
  for (const x of A) {
    if (out.has(x)) continue;
    const y = B.find((k) => !taken.has(k) && fb[k] === fa[x]);
    if (y !== undefined) {
      out.set(x, y);
      taken.add(y);
    }
  }
  const restA = A.filter((x) => !out.has(x));
  const restB = B.filter((y) => !taken.has(y));
  if (restA.length > 0 && restB.length > 0) pairOnly(restA, restB, [...a.keys()], [...b.keys()]);
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
    if (!isWords(mine, carries, key, parent) || !isLeaf(start) || !isLeaf(next) || mine !== start || next === start || typeof next !== typeof start || isTarget(next)) return mine;
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
