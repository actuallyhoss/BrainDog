/**
 * A PAGE'S SOURCE, AS TEXT: THE PRINTER AND ITS PARSER, IN ONE PACKAGE SO THEY CANNOT DRIFT APART.
 *
 * `.dog` is one page, one file: the text you get when you open the source of a page. It is not one file holding a
 * whole record; the record is the database and it keeps its own name, `.brain` (`docs/03-DOG-FORMAT.md` §1).
 *
 * WHY THIS LIVES IN A PACKAGE AND NOT IN THE WEB APP. The app's source view (`apps/web/src/lib/dog/`) and the CLI's
 * `braindog page pull`, `push` and `check` must agree on this dialect byte for byte, and apps in this repository do
 * not import each other's source. A printer kept in step with its parser by hand is the failure
 * `packages/kernel/src/declare.ts` names outright: "a copy that drifts is worse than no copy."
 *
 * THE FILE IS THE STORED DECLARATION, WHOLE (`docs/06-PAGES.md` §1). The first version of this dialect printed a
 * short list of keys and flattened every column to its field, so it was a summary: a launch desk pushed back through
 * it lost its rail, its lead sentence, its `when:`s, its card roles and its tabs. A file that cannot be applied
 * without destroying the page cannot be how a page is programmed, so `dogText` prints every key the body holds and
 * `parseDog` reads it back deep-equal: `parseDog(dogText(b)).value` is `b` for every body the kernel admits.
 *
 * TERSE WHERE TERSE IS EXACT, AND JSON WHERE IT IS NOT. The owner's words stay as the owner saw them: a `where:`
 * sentence prints bare, a column that is only its field prints as `columns: [client, amount]`, an order as
 * `[due asc]`. A value bare text could not carry back, such as the text `"20"` that would read as a number, is
 * quoted, and anything deeper than a flat list or a flat set of keys is one line of JSON, which this parser reads
 * too. Nothing is dropped to make the text shorter.
 *
 * EVERY FILE THE FIRST VERSION WROTE STILL PARSES. Its odd forms are read as it meant them: `empty:` quoted without
 * escaping what was inside, an order with no direction printed as `seq undefined`, a `for:` or `nav:` whose words
 * held a comma, a heading or a title opening a bracket it never closed, and `requires: []` for a page requiring
 * nothing. Its `authored: N rows` is refused as it always was,
 * because a count of rows cannot become the rows.
 */

/** A value a declaration body holds: what JSON holds, and nothing else. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A page declaration's body as the record stores it: `page`, `title`, `blocks` and every other key it was written with. */
export type PageBody = Record<string, Json>;

type Scalar = string | number | boolean | null;

/* ── printing ─────────────────────────────────────────────────────────── */

/** The order a page's keys are printed in; any key not named here follows, alphabetically (`docs/06-PAGES.md` §1). */
const PAGE_ORDER: readonly string[] = ['page', 'title', 'for', 'nav', 'icon', 'tone', 'board', 'layout', 'requires', 'phone', 'blocks'];

/** The order a block's keys are printed in; any key not named here follows, alphabetically. */
const BLOCK_ORDER: readonly string[] = ['kind', 'heading', 'area', 'span', 'size', 'source', 'register', 'row', 'where', 'when', 'columns', 'cells', 'order', 'limit'];

/**
 * The block keys whose items print bare, and the one key a bare item stands for.
 *
 * ON A BLOCK ONLY. These three are lists of objects in the grammar, and a column that is nothing but its field is the
 * commonest column there is, so `[client, amount]` is how the owner wrote it and how it reads best. The same key
 * anywhere else is printed as any other list.
 */
const SUGAR: ReadonlyMap<string, string> = new Map([
  ['columns', 'field'],
  ['cells', 'metric'],
  ['order', 'field'],
]);

/** What may be printed without quotes, before the checks that it reads back as the same string. */
const BARE = /^[A-Za-z0-9][A-Za-z0-9 _.,:#@/+'-]*$/;

/** A number, `true`, `false` or `null` exactly as JSON writes one: bare text of this shape reads back as that value. */
const LITERAL = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;

/** A key written without quotes, at the start of a line or inside braces. Any other key is written as a JSON string. */
const KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

const isRecord = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isScalar = (v: Json): v is Scalar => v === null || typeof v !== 'object';

/**
 * Whether a string prints bare and still reads back as itself.
 *
 * BARE TEXT IS READ BACK BY WHAT IT LOOKS LIKE, so `20`, `true` and `null` are quoted when they are text, and so is a
 * string ending in a space an editor would strip. Inside `[...]` or `{...}` a comma ends an item and a colon ends a
 * key, so there neither may be bare either.
 */
function bare(s: string, inFlow: boolean): boolean {
  return BARE.test(s) && !s.endsWith(' ') && !LITERAL.test(s) && !(inFlow && /[,:]/.test(s));
}

const scalarText = (v: Scalar, inFlow: boolean): string => (typeof v === 'string' && bare(v, inFlow) ? v : JSON.stringify(v));

const keyText = (k: string): string => (KEY.test(k) ? k : JSON.stringify(k));

/** A flat set of keys, `{ section: Money, order: 20 }`. The caller has checked that every value is a scalar. */
function flowKeys(o: Record<string, Json>): string {
  const inner = Object.entries(o).map(([k, v]) => `${keyText(k)}: ${isScalar(v) ? scalarText(v, true) : JSON.stringify(v)}`);
  return inner.length === 0 ? '{}' : `{ ${inner.join(', ')} }`;
}

/**
 * One item of `columns`, `cells` or `order`, or null when it is deeper than this form carries.
 *
 * A BARE WORD IN ONE OF THESE LISTS IS AN OBJECT, so a string item is always quoted here: `["client"]` is the text
 * `client` and `[client]` is `{ field: client }`. An order prints `due asc` only while its field has no space in it,
 * because the space is what separates the direction.
 */
function sugarItem(key: string, by: string, item: Json): string | null {
  if (isScalar(item)) return typeof item === 'string' ? JSON.stringify(item) : scalarText(item, true);
  if (!isRecord(item) || !Object.values(item).every(isScalar)) return null;
  const keys = Object.keys(item);
  const named = item[by];
  if (typeof named === 'string' && bare(named, true) && !(key === 'order' && named.includes(' '))) {
    if (keys.length === 1) return named;
    const dir = item.dir;
    if (key === 'order' && keys.length === 2 && (dir === 'asc' || dir === 'desc')) return `${named} ${dir}`;
  }
  return flowKeys(item);
}

/** A value as it follows its key on one line. */
function valueText(key: string, v: Json, inBlock: boolean): string {
  if (isScalar(v)) return scalarText(v, false);
  const by = inBlock ? SUGAR.get(key) : undefined;
  if (Array.isArray(v)) {
    if (by !== undefined) {
      const items = v.map((item) => sugarItem(key, by, item));
      if (items.every((t): t is string => t !== null)) return `[${items.join(', ')}]`;
    } else if (v.every(isScalar)) return `[${v.map((x) => scalarText(x, true)).join(', ')}]`;
  } else if (Object.values(v).every(isScalar)) return flowKeys(v);
  return JSON.stringify(v);
}

/** A string a `|` block holds exactly: one with a line break and no other control character, which JSON would escape. */
const textBlock = (s: string): boolean => s.includes('\n') && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s);

/**
 * One key and its value, as a line or as a `|` block under it.
 *
 * EVERY LINE OF THE TEXT CARRIES THE INDENT, an empty one included, because the indent is how the parser knows the
 * text has not ended. A blank line with no indent is read as inside the text only when the text goes on under it.
 */
function entry(out: string[], lead: string, pad: string, key: string, v: Json, inBlock: boolean): void {
  if (typeof v === 'string' && textBlock(v)) out.push(`${lead}${keyText(key)}: |`, ...v.split('\n').map((l) => `${pad}${l}`));
  else out.push(`${lead}${keyText(key)}: ${valueText(key, v, inBlock)}`);
}

/** An object's entries in the printed order: the named keys first, in their order, then the rest alphabetically. */
function inOrder(o: Record<string, Json>, first: readonly string[]): [string, Json][] {
  const rank = (k: string): number => {
    const at = first.indexOf(k);
    return at < 0 ? first.length : at;
  };
  /* A KEY HOLDING NOTHING IS NOT WRITTEN, as JSON would not store it: a body built in code can carry one. */
  return Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** The blocks print as a list of keys when every one is a set of keys with something in it; otherwise as JSON. */
const itemList = (v: Json): v is Record<string, Json>[] => Array.isArray(v) && v.every((b) => isRecord(b) && Object.keys(b).length > 0);

/**
 * The declaration's body as text: what the source view shows, and what the file holds, byte for byte.
 *
 * IT ENDS WITH A LINE BREAK, as a text file does, so the app's download and `braindog page pull` write the same bytes
 * the screen shows without either adding one.
 */
export function dogText(body: PageBody): string {
  const out: string[] = [];
  const entries = inOrder(body, PAGE_ORDER);
  entries.forEach(([key, v], n) => {
    if (key !== 'blocks' || !itemList(v)) return entry(out, '', '  ', key, v, false);
    if (out.length > 0) out.push('');
    out.push('blocks:');
    for (const block of v) inOrder(block, BLOCK_ORDER).forEach(([k, bv], at) => entry(out, at === 0 ? '  - ' : '    ', '      ', k, bv, true));
    if (n < entries.length - 1) out.push('');
  });
  return `${out.join('\n')}\n`;
}

/** What the file is called: the page's own name, which is the first line of the file. */
export const dogName = (page: string): string => `${page}.dog`;

/* ── reading the record's answer ──────────────────────────────────────── */

/** A page's source as the record holds it: the stored body, its version, and the template it was made from, if any. */
export type Stored = { body: PageBody; version: number | null; template: string | null };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `arrangement({ page })`'s answer, `{ id, version, pack, body }`, as the source of the page at `slug`.
 *
 * ONE READER FOR THE APP AND THE CLI, so the screen and `braindog page pull` cannot disagree about which body is the
 * source. A page made for each row of a list is not stored under its own slug: its source is the template's, and the
 * template names itself in its body's `page`, which is how `template` is known without a second read.
 */
export function storedOf(answer: unknown, slug: string): Stored | { fix: string } {
  const body = isObject(answer) ? answer.body : undefined;
  if (!isObject(answer) || !isObject(body) || typeof body.page !== 'string')
    return { fix: `The record's answer for ${slug} is not a page's source this build can read.` };
  const own = slug.startsWith('page.') ? slug.slice('page.'.length) : slug;
  return {
    body: body as PageBody,
    version: typeof answer.version === 'number' ? answer.version : null,
    template: body.page === own ? null : body.page,
  };
}

/* ── parsing ──────────────────────────────────────────────────────────── */

/** The parser's answer: the body it read, or one sentence a person can act on and the line it is about. Never a stack trace. */
export type DogParsed = { ok: true; value: PageBody } | { ok: false; fix: string; line: number };

const FIRST = "A .dog file's first line is page: <id>, and this one is not.";

/**
 * HOW DEEP ONE LINE'S BRACKETS MAY NEST before the line is refused. A body the kernel admits is nowhere near it; the
 * bound is there so a hostile file is refused with a sentence rather than ending the reader with a stack overflow.
 */
const FLOW_DEPTH_MOST = 64;

/** A line the parser cannot read, thrown from wherever it is found and answered once, by `parseDog`. */
class Unread extends Error {
  line: number;
  constructor(fix: string, line: number) {
    super(fix);
    this.line = line;
  }
}

/** Sets an own key, `__proto__` included, which an assignment would take as the object's prototype instead. */
function put(o: Record<string, Json>, key: string, v: Json): void {
  Object.defineProperty(o, key, { value: v, enumerable: true, writable: true, configurable: true });
}

/** Text after a key, read into its parts. `bare` was written without quotes and `text` as a JSON string. */
type Flow = { t: 'bare'; text: string } | { t: 'text'; text: string } | { t: 'list'; items: Flow[] } | { t: 'keys'; entries: [string, Flow][] };

/**
 * `[a, b]`, `{ k: v }` or one line of JSON, which is the same grammar with every string quoted, read into its parts.
 * Null when it does not read to its end.
 */
function flowOf(s: string): Flow | null {
  let at = 0;
  const space = (): void => {
    while (s[at] === ' ') at += 1;
  };
  const quoted = (): string | null => {
    let end = at + 1;
    while (end < s.length && s[end] !== '"') end += s[end] === '\\' ? 2 : 1;
    if (end >= s.length) return null;
    let v: unknown;
    try {
      v = JSON.parse(s.slice(at, end + 1));
    } catch {
      return null;
    }
    at = end + 1;
    return typeof v === 'string' ? v : null;
  };
  const keyAt = (): string | null => {
    space();
    if (s[at] === '"') return quoted();
    let end = at;
    for (let ch = s[end]; ch !== undefined && ch !== ':' && ch !== ' '; ch = s[end]) end += 1;
    const key = s.slice(at, end);
    at = end;
    return KEY.test(key) ? key : null;
  };
  const node = (stops: string, depth: number): Flow | null => {
    if (depth > FLOW_DEPTH_MOST) return null;
    space();
    const c = s[at];
    if (c === '[') {
      at += 1;
      const items: Flow[] = [];
      space();
      if (s[at] === ']') {
        at += 1;
        return { t: 'list', items };
      }
      for (;;) {
        const item = node(',]', depth + 1);
        if (item === null) return null;
        items.push(item);
        space();
        const next = s[at];
        at += 1;
        if (next === ']') return { t: 'list', items };
        if (next !== ',') return null;
      }
    }
    if (c === '{') {
      at += 1;
      const entries: [string, Flow][] = [];
      space();
      if (s[at] === '}') {
        at += 1;
        return { t: 'keys', entries };
      }
      for (;;) {
        const key = keyAt();
        if (key === null) return null;
        space();
        if (s[at] !== ':') return null;
        at += 1;
        const value = node(',}', depth + 1);
        if (value === null) return null;
        entries.push([key, value]);
        space();
        const next = s[at];
        at += 1;
        if (next === '}') return { t: 'keys', entries };
        if (next !== ',') return null;
      }
    }
    if (c === '"') {
      const text = quoted();
      return text === null ? null : { t: 'text', text };
    }
    let end = at;
    for (let ch = s[end]; ch !== undefined && !stops.includes(ch); ch = s[end]) end += 1;
    const text = s.slice(at, end).trim();
    at = end;
    return text === '' || /[[\]{}"]/.test(text) ? null : { t: 'bare', text };
  };
  const top = node('', 0);
  space();
  return top !== null && at === s.length ? top : null;
}

/** Bare text as a value: a number, `true`, `false` or `null` when it is written as JSON writes one, and text otherwise. */
const scalarOf = (text: string): Json => (LITERAL.test(text) ? (JSON.parse(text) as Json) : text);

function valueOf(f: Flow): Json {
  if (f.t === 'bare') return scalarOf(f.text);
  if (f.t === 'text') return f.text;
  if (f.t === 'list') return f.items.map(valueOf);
  const o: Record<string, Json> = {};
  for (const [k, v] of f.entries) put(o, k, valueOf(v));
  return o;
}

/** A list under `columns`, `cells` or `order` on a block, where a bare word is the object it stands for. */
function sugarOf(key: string, by: string, f: Flow, line: number): Json {
  if (f.t !== 'list') return valueOf(f);
  return f.items.map((item): Json => {
    if (item.t !== 'bare' || LITERAL.test(item.text)) return valueOf(item);
    const o: Record<string, Json> = {};
    if (key !== 'order') {
      put(o, by, item.text);
      return o;
    }
    const [field, dir, ...more] = item.text.split(' ');
    /* THE FIRST VERSION PRINTED AN ORDER WITH NO DIRECTION AS `seq undefined`, and a file it wrote still reads. */
    if (field === undefined || field === '' || more.length > 0 || (dir !== undefined && dir !== 'asc' && dir !== 'desc' && dir !== 'undefined'))
      throw new Unread(`An order is a field and then asc or desc, such as [due asc], and ${item.text} is not.`, line);
    put(o, 'field', field);
    if (dir === 'asc' || dir === 'desc') put(o, 'dir', dir);
    return o;
  });
}

/**
 * `for:` and `nav:` AS THE FIRST VERSION WROTE THEM, with the sentence and the section unquoted. One holding a comma
 * does not read as a set of keys, so the one shape that version printed is read instead.
 */
function firstVersion(key: string, rest: string): Json | null {
  if (key === 'for') {
    const inner = /^\{ register: (.+) \}$/.exec(rest)?.[1];
    if (inner === undefined) return null;
    const sep = inner.indexOf(', where: ');
    return sep < 0 ? { register: inner.trim() } : { register: inner.slice(0, sep).trim(), where: inner.slice(sep + ', where: '.length) };
  }
  if (key === 'nav') {
    const m = /^\{ section: (.*), order: (-?\d+) \}$/.exec(rest);
    return m ? { section: m[1] ?? '', order: Number.parseInt(m[2] ?? '0', 10) } : null;
  }
  return null;
}

/**
 * The keys the first version printed as raw text, whatever the text was.
 *
 * A HEADING SUCH AS `[Draft] plans` WAS WRITTEN BARE, so a file of that version can hold one of these keys opening a
 * bracket that never closes. `dogText` quotes any such text now, so under these keys a bracket that does not close
 * can only be that version's text, and it is read as the text it was.
 */
const RAW_FIRST: ReadonlySet<string> = new Set(['title', 'heading', 'source', 'where']);

/** The text after `key: ` on one line, as its value. */
function lineValue(key: string, rest: string, inBlock: boolean, line: number): Json {
  if (rest.startsWith('[') || rest.startsWith('{')) {
    const f = flowOf(rest);
    const by = inBlock ? SUGAR.get(key) : undefined;
    if (f !== null) return by === undefined ? valueOf(f) : sugarOf(key, by, f, line);
    const older = inBlock ? null : firstVersion(key, rest);
    if (older !== null) return older;
    if (RAW_FIRST.has(key)) return rest;
    throw new Unread(`${key} opens a list or a set of keys that does not close as it is written.`, line);
  }
  if (rest.startsWith('"')) {
    try {
      const v: unknown = JSON.parse(rest);
      if (typeof v === 'string') return v;
    } catch {
      /* NOT ONE JSON STRING, so it is the first version's `empty:`, quoted without escaping what was inside. */
    }
    return /^"(.*)"$/s.exec(rest)?.[1] ?? rest;
  }
  return scalarOf(rest);
}

const blank = (l: string | undefined): boolean => (l ?? '').trim() === '';

/** The first line at or after `from` that is not blank. */
function nextFilled(lines: readonly string[], from: number): number {
  let j = from;
  while (j < lines.length && blank(lines[j])) j += 1;
  return j;
}

/** The lines of a `|` block, each under `pad`, as one string. */
function textAt(lines: readonly string[], from: number, pad: string): { text: string; next: number } {
  const kept: string[] = [];
  let i = from;
  while (i < lines.length) {
    const l = lines[i] ?? '';
    if (l.startsWith(pad)) {
      kept.push(l.slice(pad.length));
      i += 1;
    } else if (blank(l)) {
      /* A BLANK LINE AN EDITOR STRIPPED THE INDENT FROM is still inside the text when the text goes on under it. */
      const j = nextFilled(lines, i);
      if (j >= lines.length || !(lines[j] ?? '').startsWith(pad)) break;
      for (; i < j; i += 1) kept.push('');
    } else break;
  }
  return { text: kept.join('\n'), next: i };
}

/** A key, a colon, and whatever follows it. A key that is not a plain word is written as a JSON string. */
const ENTRY = /^("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_-]*):(?: (.*))?$/s;

/** One `key: value` line (with its `|` text or its list of blocks under it) into `into`. Answers the next unread line. */
function readEntry(lines: readonly string[], i: number, text: string, into: Record<string, Json>, pad: string, inBlock: boolean): number {
  const line = i + 1;
  const said = ENTRY.exec(text);
  const written = said?.[1];
  if (!said || written === undefined) throw new Unread('This line is not a key and its value, such as title: Invoicing.', line);
  let key: unknown = written;
  if (written.startsWith('"')) {
    try {
      key = JSON.parse(written);
    } catch {
      key = null;
    }
  }
  if (typeof key !== 'string') throw new Unread('This line names its key in quotes this file cannot read.', line);
  if (Object.hasOwn(into, key)) throw new Unread(`${key} is written twice.`, line);
  const rest = said[2] ?? '';
  if (rest === '|') {
    const read = textAt(lines, i + 1, pad);
    put(into, key, read.text);
    return read.next;
  }
  if (!inBlock && key === 'blocks' && rest === '') {
    const read = itemsAt(lines, i + 1);
    put(into, key, read.items);
    return read.next;
  }
  if (rest === '') throw new Unread(`${key} has nothing after it.`, line);
  /* IRRECOVERABLE, ON PURPOSE. The first version counted a block's authored rows and printed nothing else about them,
     so a file holding this line cannot become a declaration without deleting real rows. Refusing here, at the parse,
     is what keeps `push` from ever making that write. */
  if (inBlock && key === 'authored' && /^\d+ rows?$/.test(rest))
    throw new Unread(
      `This block's authored rows were only counted (${rest}) by the first version of .dog. Edit authored rows in the app; pushing this file would replace them with nothing.`,
      line,
    );
  put(into, key, lineValue(key, rest, inBlock, line));
  return i + 1;
}

/** The blocks under `blocks:`, each opened by a `  - ` line and carrying its keys four spaces in. */
function itemsAt(lines: readonly string[], from: number): { items: Record<string, Json>[]; next: number } {
  const items: Record<string, Json>[] = [];
  let i = from;
  while (i < lines.length) {
    const l = lines[i] ?? '';
    if (blank(l)) {
      const j = nextFilled(lines, i);
      if (j >= lines.length || !(lines[j] ?? '').startsWith(' ')) break;
      i = j;
    } else if (l.startsWith('  - ')) {
      const item: Record<string, Json> = {};
      items.push(item);
      i = readEntry(lines, i, l.slice(4), item, '      ', true);
    } else if (/^ {4}\S/.test(l)) {
      const item = items[items.length - 1];
      if (item === undefined) throw new Unread('This line is a key of a block, and no - kind: line above it opens one.', i + 1);
      i = readEntry(lines, i, l.slice(4), item, '      ', true);
    } else if (!l.startsWith(' ')) break;
    else throw new Unread('This line is indented as neither a block nor one of its keys.', i + 1);
  }
  return { items, next: i };
}

/**
 * The text of a `.dog` file, back into the body `dogText` printed it from.
 *
 * A CLOSED, LINE-BY-LINE GRAMMAR, and deliberately not a general YAML reader: the file is one function's output, so
 * its inverse only has to understand what that function writes, plus what the first version wrote. A line outside it
 * is refused with its number rather than guessed at, because a file `check` and `push` cannot read correctly is a
 * file they must say so about.
 */
export function parseDog(text: string): DogParsed {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  /* ONE LINE BREAK AT THE END IS THE FILE'S OWN, which `dogText` writes and an editor keeps. */
  if (lines[lines.length - 1] === '') lines.pop();
  if (!/^page:/.test(lines[0] ?? '')) return { ok: false, fix: FIRST, line: 1 };

  const body: PageBody = {};
  try {
    let i = 0;
    while (i < lines.length) {
      const l = lines[i] ?? '';
      if (blank(l)) i += 1;
      else if (l.startsWith(' ')) throw new Unread('This line is indented, and only a block and its keys are.', i + 1);
      else i = readEntry(lines, i, l, body, '  ', false);
    }
  } catch (e) {
    if (e instanceof Unread) return { ok: false, fix: e.message, line: e.line };
    throw e;
  }
  if (typeof body.page !== 'string') return { ok: false, fix: FIRST, line: 1 };

  /* `requires: []` IS THE FIRST VERSION'S WAY OF SAYING A PAGE REQUIRES NOTHING, and the kernel refuses an empty
     `requires`, so no body it admits holds one: it is read as the absence it meant. */
  if (Array.isArray(body.requires) && body.requires.length === 0) delete body.requires;
  return { ok: true, value: body };
}
