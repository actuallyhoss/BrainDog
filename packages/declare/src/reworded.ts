/**
 * A PAGE THE OWNER CHANGED, WITH THE WORDS AN UPDATE CHANGED CARRIED INTO IT (UP1, 31 Oct).
 *
 * WHY. A page somebody arranged is kept as they left it (`Diff.kept`), which is right for what they did and wrong for
 * what they did not: a Personal record whose Goals page had one block moved kept "Put by lately" after Personal 2.9.1
 * called it "Saved lately", and a founder's moved project page kept "Kind" after 3.8.1 said "What it is". Only words
 * move here. The blocks, their order, what each reads and every word the owner typed stay theirs.
 *
 * HOW. The page the owner's edit started from (`start`, the pack's last body) is set beside the update's (`next`), and a
 * word that changed in the same place of both is one pair, old to new. Places are matched block by block on what the
 * block is with its words left out, so a block the update added or took away does not shift the rest. A word is then
 * changed in the owner's page only where the owner's page still says the pack's old word exactly: one the owner
 * retyped is not the pack's, and stays. An old word the update changed two ways is left alone.
 *
 * ONLY THE WORDS A PERSON READS: a heading, a line, an empty line, a label, a title, a section. Ids, figures, lists,
 * fields, icons and every other value are never touched, so nothing the page reads can change.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The keys of a page's body whose value is words a person reads. */
const WORD_KEYS: ReadonlySet<string> = new Set(['heading', 'body', 'empty', 'label', 'note', 'title', 'section', 'unset', 'cells']);

const isMap = (v: Json | undefined): v is { [key: string]: Json } => v !== null && typeof v === 'object' && !Array.isArray(v);

/** What a part is with its words left out, so two versions of one block read the same here. */
function skeleton(v: Json, key = ''): string {
  if (typeof v === 'string') return WORD_KEYS.has(key) ? '""' : JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => skeleton(x, key)).join(',')}]`;
  if (isMap(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${skeleton(v[k]!, k)}`).join(',')}}`;
  return JSON.stringify(v);
}

/** The places two lists line up: each part of `a` with the part of `b` that is the same part, in order (longest run). */
function aligned(a: readonly Json[], b: readonly Json[], key: string): [Json, Json][] {
  const sa = a.map((x) => skeleton(x, key));
  const sb = b.map((x) => skeleton(x, key));
  const n = a.length;
  const m = b.length;
  const run: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) run[i]![j] = sa[i] === sb[j] ? run[i + 1]![j + 1]! + 1 : Math.max(run[i + 1]![j]!, run[i]![j + 1]!);
  const out: [Json, Json][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sa[i] === sb[j]) {
      out.push([a[i]!, b[j]!]);
      i++;
      j++;
    } else if (run[i + 1]![j]! >= run[i]![j + 1]!) i++;
    else j++;
  }
  return out;
}

/** Each word that changed from `a` to `b` in the same place, old to new. */
function pairs(a: Json, b: Json, key: string, out: Map<string, Set<string>>): void {
  if (typeof a === 'string' && typeof b === 'string') {
    if (a !== b && WORD_KEYS.has(key)) out.set(a, (out.get(a) ?? new Set<string>()).add(b));
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    for (const [x, y] of aligned(a, b, key)) pairs(x, y, key, out);
    return;
  }
  if (isMap(a) && isMap(b)) for (const k of Object.keys(a)) if (Object.hasOwn(b, k)) pairs(a[k]!, b[k]!, k, out);
}

/** `v` with every word at a word key that `swap` names changed to its new word. */
function swapped(v: Json, key: string, swap: ReadonlyMap<string, string>): Json {
  if (typeof v === 'string') return WORD_KEYS.has(key) ? (swap.get(v) ?? v) : v;
  if (Array.isArray(v)) return v.map((x) => swapped(x, key, swap));
  if (isMap(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swapped(x, k, swap)]));
  return v;
}

/**
 * The owner's page (`mine`) with the words the update changed from `start` to `next` carried in, or `null` when no word
 * of the pack's that the owner's page still holds changed. Each is a page's body; the answer is one too.
 */
export function reworded(start: Json, mine: Json, next: Json): Json | null {
  const found = new Map<string, Set<string>>();
  pairs(start, next, '', found);
  const swap = new Map([...found].flatMap(([old, now]) => (now.size === 1 ? [[old, [...now][0]!] as const] : [])));
  if (swap.size === 0) return null;
  const out = swapped(mine, '', swap);
  return JSON.stringify(out) === JSON.stringify(mine) ? null : out;
}
