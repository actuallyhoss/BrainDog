/**
 * The record reads its own words (PGS-B15 job a): every live page and every document field, walked for the seven
 * faults a person used to find only by reading screenshots.
 *
 * WHAT IT FINDS, ONE KIND A FAULT:
 *   - `names-nothing`: a `{{path}}` no figure, list, state or field answers to, with the nearest name that does.
 *   - `bad-value`: a typed value whose literal does not parse (`{{money:12 egp}}`), or a form the dialect has not.
 *   - `degraded`: a fence drawn as written, with the sentence the parser already writes above it.
 *   - `undated-bar`: a bar of typed numbers is a snapshot, so it carries a date (`05` §7.4), and this one has none.
 *   - `two-rules`: a path two of the grammar's rules both read, which the record settles for the author unseen.
 *   - `old-pin`: a pinned note nobody has changed in thirty days.
 *   - `too-red`: a page with more than two red phrases, where red has stopped meaning anything.
 *
 * PURE, AND NO SECOND SCANNER. Which paths name nothing is the kernel's answer (`unnamed`, as the page lint and the
 * census read it), handed in on each part; only a part with no answer is judged by the names given. The fences are the
 * renderer's own `parse`, the typed forms its own `formatTyped`, so what this says is what a page draws.
 *
 * NAMES, NEVER IDS. A place is said by the page's title, the list's name, the row's name and the field's label. The
 * author's own path is quoted as they wrote it, because it is what they will search their text for.
 */

import { TYPED, formatTyped, isPackKind, parse, type KindSpec, type TypedForm } from 'braindog-render';

/** The seven kinds of fault, a closed list. */
export type TextFaultKind = 'names-nothing' | 'bad-value' | 'degraded' | 'undated-bar' | 'two-rules' | 'old-pin' | 'too-red';

/** Where a fault is, by names: the page, or the list, the row and the field a document is in; `name` is the part. */
export type TextWhere = { page?: string; list?: string; row?: string; field?: string; name: string };

/**
 * The address an app routes a fault by, beside its names: a page's slug, or a list's id and an entry's number for a
 * document drawn on no page. Never read by a person.
 */
export type TextAt = { slug: string } | { list: string; seq: number };

/** One fault: its kind, its place, what is wrong in one sentence and the fix in one more, and its address when known. */
export type TextFault = { kind: TextFaultKind; where: TextWhere; said: string; fix: string; at?: TextAt };

/** What a walk answers: every fault, and how many places (pages, or rows for a document off any page) hold one. */
export type TextFound = { faults: TextFault[]; pages: number };

/** One part of a page with text in it: a heading, a note, a document. */
export type TextPart = {
  /** What a person calls the part: its heading, or the page's title where it has none. */
  name: string;
  text: string;
  /** The paths the kernel said name nothing here. Absent, the walk judges by `TextNames`. */
  unnamed?: readonly string[];
  /** The fields of the row this text sits on, which a one-word path reads first. */
  own?: readonly string[];
  /** The fields of that row that are lists, whose `.count` the row answers. */
  ownLists?: readonly string[];
  /** A pinned note, and how many whole days since it last changed. */
  pinned?: { days: number };
  /** The text is drawn as a page draws it, where the page-only kinds are fences and not faults. */
  page?: boolean;
};

/** A page as declared, read: its title and its parts, and its slug when the walk knows it. */
export type TextPage = { title: string; slug?: string; parts: readonly TextPart[] };

/**
 * A document field's text: its list's name, its row's name, its field's label, and the page it is drawn on if any; `at`
 * is the address of the place its faults open (that page's slug, or the entry's list id and number).
 */
export type LongText = Omit<TextPart, 'name' | 'pinned'> & { list: string; row: string; field: string; onPage?: string; at?: TextAt };

/** What the record has names for. */
export type TextNames = {
  /** Every path that names something, for `nearest`: figures, lists, `<list>.count`, `<list>.<state>`. */
  all: readonly string[];
  /** The figures, declared or built in, by the name a path says. */
  figures?: readonly string[];
  /** The values of each list's state field, by the list's path name. */
  states?: Readonly<Record<string, readonly string[]>>;
  /** The kinds the record's packs declare. Absent, a pack's kind is not judged, since it may be installed. */
  kinds?: Readonly<Record<string, KindSpec>>;
};

/** A pinned note is old once nobody has changed it in this many days. */
export const PIN_OLD_DAYS = 30;
/** More red phrases than this on one page, and red has stopped saying anything. */
export const RED_MOST = 2;

/* ── the nearest name ───────────────────────────────────────────────────── */

/** How many single-letter edits turn one word into the other (Levenshtein), stopping once past `most`. */
function edits(a: string, b: string, most: number): number {
  if (Math.abs(a.length - b.length) > most) return most + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      row.push(v);
      if (v < low) low = v;
    }
    if (low > most) return most + 1;
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * The name that exists closest to one that does not, or `null` when none is close: at most a third of the name's
 * letters changed, and never fewer than two allowed. Case is ignored in the measure, since `effortDays` meant
 * `effort_days`; underscores, hyphens and case are first set aside, so a spelling of the same words is nearest of all.
 * A tie goes to the name sharing the longest start, then to the shorter, then to the first by letters.
 */
export function nearest(name: string, names: readonly string[]): string | null {
  const bare = (s: string): string => s.toLowerCase().replace(/[-_]/g, '');
  const want = bare(name);
  const most = Math.max(2, Math.floor(want.length / 3));
  let best: { name: string; d: number; start: number } | null = null;
  for (const n of new Set(names)) {
    if (n === name) return n;
    const d = edits(want, bare(n), most);
    if (d > most) continue;
    let start = 0;
    while (start < n.length && n[start]!.toLowerCase() === name[start]?.toLowerCase()) start++;
    const better =
      best === null || d < best.d || (d === best.d && (start > best.start || (start === best.start && (n.length < best.name.length || (n.length === best.name.length && n < best.name)))));
    if (better) best = { name: n, d, start };
  }
  return best?.name ?? null;
}

/* ── one part ───────────────────────────────────────────────────────────── */

/** A path, as the renderer and the kernel read one (`inline.ts`, `pages.ts`). */
const PATH = /^[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?(?:\.[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?)*$/;
/** The rows a figure counts, and how far it moved: a word after a figure's name that a list's state could also be. */
const ROW_PARTS: ReadonlySet<string> = new Set(['change', 'first', 'names', 'more', 'since']);
/** A red phrase, `{{bad:three days overdue}}`, outside a code span. */
const RED = /\{\{\s*bad\s*:/g;
/** A day a heading or a note can say: a written day, a month and a year, a quarter, a year alone, a typed day. */
const DATED =
  /\b\d{4}-\d{2}\b|\b(?:19|20)\d{2}\b|\bQ[1-4]\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\{\{\s*(?:date|day|ago|until)\s*:/i;

/** What a typed form's literal looks like, said as the fix. */
const SHAPE: Record<TypedForm, string> = {
  date: 'Write the day as 2026-11-01.',
  day: 'Write the day as 2026-11-01.',
  until: 'Write the day as 2026-11-01.',
  ago: 'Write the day as 2026-11-01.',
  money: 'Write the amount in the smallest unit and a three-letter code in capitals, as {{money:129900 USD}}.',
  quantity: 'Write a number and then its unit, as {{quantity:3 kg}}.',
  pct: 'Write a number with no sign, as {{pct:12.5}}.',
  ref: "Write the list's name, a # and the number.",
};

const spanless = (text: string): string => text.replace(/`[^`]*`/g, (s) => ' '.repeat(s.length));

/** Whether a path names something, judged by the names given, for a part the kernel did not answer. */
function namedBy(path: string, part: TextPart, names: TextNames): boolean {
  if (part.own?.includes(path) || names.all.includes(path)) return true;
  const [head = '', tail, ...rest] = path.split('.');
  if (tail === 'count' && rest.length === 0 && part.ownLists?.includes(head)) return true;
  if (head.includes('#')) return names.all.includes(head.slice(0, head.indexOf('#')));
  return rest.length === 0 && tail !== undefined && (ROW_PARTS.has(tail) || /^first_[a-z]/.test(tail)) && (names.figures ?? []).includes(head);
}

/** The second reading of a path the grammar reads two ways, or `null` when it has one. */
function twoWays(path: string, part: TextPart, names: TextNames): { said: string; fix: string } | null {
  const [head = '', tail, ...rest] = path.split('.');
  if (tail === undefined && part.own?.includes(path) && names.figures?.includes(path))
    return {
      said: `"{{${path}}}" is both a field here and a figure of the record, and it reads the field.`,
      fix: 'Rename the field, or the figure, so each has a name of its own.',
    };
  if (tail === 'count' && rest.length === 0 && part.ownLists?.includes(head) && names.all.includes(path))
    return {
      said: `"{{${path}}}" counts the field here, not the whole list of that name.`,
      fix: 'Rename the field, so the whole list and the field are said apart.',
    };
  if (tail !== undefined && rest.length === 0 && ROW_PARTS.has(tail) && names.figures?.includes(head) && names.states?.[head]?.includes(tail))
    return {
      said: `"{{${path}}}" reads the figure, though a list of that name has a state called ${tail}.`,
      fix: 'Rename the figure or the state, so each path means one thing.',
    };
  return null;
}

/** The faults in one part's words, each once. */
function partFaults(part: TextPart, names: TextNames, where: TextWhere): TextFault[] {
  const out: TextFault[] = [];
  const seen = new Set<string>();
  const add = (kind: TextFaultKind, key: string, said: string, fix: string): void => {
    if (seen.has(`${kind}\n${key}`)) return;
    seen.add(`${kind}\n${key}`);
    out.push({ kind, where, said, fix });
  };
  const unnamed = part.unnamed ? new Set(part.unnamed) : null;
  const path = (p: string): void => {
    const named = unnamed ? !unnamed.has(p) : namedBy(p, part, names);
    if (!named) {
      const near = nearest(p, [...(part.own ?? []), ...names.all]);
      const keep = 'or put the words in backticks to keep them as text';
      add('names-nothing', p, `"{{${p}}}" names nothing in this record.`,
        near ? `Write {{${near}}}, the nearest name the record has, ${keep}.` : `Name a figure, a list or a field the record has, ${keep}.`);
      return;
    }
    const two = twoWays(p, part, names);
    if (two) add('two-rules', p, two.said, two.fix);
  };
  for (const m of spanless(part.text).matchAll(/\{\{([^{}]*)\}\}/g)) {
    const body = (m[1] ?? '').trim();
    const colon = body.indexOf(':');
    const form = colon > 0 ? body.slice(0, colon).trim() : '';
    const arg = colon > 0 ? body.slice(colon + 1).trim() : '';
    if (form === 'bad' || form === 'icon') continue;
    if ((TYPED as readonly string[]).includes(form)) {
      const literal = !/^[A-Za-z]/.test(arg) || (form === 'ref' && /^[a-z][a-z0-9_]*#\d+$/.test(arg));
      if (!literal) path(arg);
      else if (formatTyped(form as TypedForm, arg) === null)
        add('bad-value', body, `"{{${body}}}" is not a value the record can read.`, SHAPE[form as TypedForm]);
      continue;
    }
    if (colon > 0 && /^[a-z][a-z0-9_-]*$/.test(form) && arg !== '' && names.figures?.includes(form)) continue;
    if (colon > 0 || !PATH.test(body)) {
      add('bad-value', body, `"{{${body}}}" is not a path or a typed value.`,
        'A typed value starts with date, day, until, ago, money, quantity, pct or ref and a colon. Put the words in backticks to keep them as text.');
      continue;
    }
    path(body);
  }
  segmentFaults(part, names, add);
  if (part.pinned && part.pinned.days > PIN_OLD_DAYS)
    add('old-pin', '', `This note is pinned and has not changed in ${part.pinned.days} days.`, 'Read it again: change what no longer holds, or unpin it.');
  return out;
}

/** Whether a bar's value cell holds a live path rather than a number typed in. */
const live = (cell: string): boolean =>
  [...spanless(cell).matchAll(/\{\{([^{}]*)\}\}/g)].some((m) => {
    const body = (m[1] ?? '').trim();
    const colon = body.indexOf(':');
    const arg = colon > 0 ? body.slice(colon + 1).trim() : body;
    return /^[A-Za-z]/.test(arg) && !/^[a-z][a-z0-9_]*#\d+$/.test(arg);
  });

/** The fences in one part: each drawn as written, and each bar of typed numbers that says no day. */
function segmentFaults(part: TextPart, names: TextNames, add: (kind: TextFaultKind, key: string, said: string, fix: string) => void): void {
  if (!/^(?:`{3,}|~{3,})/m.test(part.text)) return;
  const segments = parse(part.text, { page: part.page === true, ...(names.kinds ? { kinds: names.kinds } : {}) });
  segments.forEach((seg, i) => {
    if (seg.type === 'degraded') {
      /* A PACK'S KIND MAY BE INSTALLED, and without the record's kinds in hand it is not judged. */
      const word = seg.info.trim().split(/[\s|]/)[0] ?? '';
      if (!names.kinds && isPackKind(word.toLowerCase())) return;
      const heading = seg.info.includes('|') ? seg.info.slice(seg.info.indexOf('|') + 1).trim() : '';
      add('degraded', `${seg.start}`, heading ? `The block "${heading}" is shown as written instead of drawn.` : 'A block is shown as written instead of drawn.', seg.fix);
      return;
    }
    if (seg.type !== 'block' || seg.kind !== 'bar') return;
    const values = seg.rows.map((r) => r.cells[1] ?? '');
    if (values.some(live) || !values.some((v) => /\d/.test(v))) return;
    const next = segments[i + 1];
    const after = next === undefined ? '' : next.type === 'markdown' ? next.text.trim().split(/\n\s*\n/)[0] ?? '' : next.type === 'block' && next.kind === 'note' ? next.raw : '';
    if (DATED.test(seg.heading ?? '') || DATED.test(after)) return;
    add('undated-bar', `${seg.start}`,
      seg.heading ? `The bar "${seg.heading}" shows numbers typed in, with no day to say when they held.` : 'A bar shows numbers typed in, with no day to say when they held.',
      'Say when in its heading, as "Revenue, March 2026", or read each number from the record with a path so it stays current.');
  });
}

/** How many red phrases a text holds, outside its code spans. */
const reds = (text: string): number => [...spanless(text).matchAll(RED)].length;

function redFault(n: number, where: TextWhere): TextFault[] {
  return n > RED_MOST
    ? [{ kind: 'too-red', where, said: `${n} phrases here are in red.`, fix: `Keep red for what is late or needs you, ${RED_MOST} at most, and say the rest plainly.` }]
    : [];
}

/* ── the walk ───────────────────────────────────────────────────────────── */

/**
 * Every fault in the pages as declared and in every document field, and how many places hold one. A page is one place,
 * and a document drawn on a page is on that page; a document drawn on no page is a place of its own.
 */
export function textFaults(pages: readonly TextPage[], texts: readonly LongText[], names: TextNames): TextFound {
  const faults: TextFault[] = [];
  const places = new Set<string>();
  const keep = (found: TextFault[], place: string): void => {
    if (found.length > 0) places.add(place);
    faults.push(...found);
  };
  const at = (found: TextFault[], to: TextAt | undefined): TextFault[] => (to === undefined ? found : found.map((f) => ({ ...f, at: to })));
  for (const p of pages) {
    const found = p.parts.flatMap((part) => partFaults(part, names, { page: p.title, name: part.name }));
    found.push(...redFault(p.parts.reduce((n, part) => n + reds(part.text), 0), { page: p.title, name: p.title }));
    keep(at(found, p.slug ? { slug: p.slug } : undefined), `page\n${p.title}`);
  }
  for (const t of texts) {
    const where: TextWhere = { ...(t.onPage ? { page: t.onPage } : {}), list: t.list, row: t.row, field: t.field, name: t.field };
    const found = [...partFaults({ ...t, name: t.field }, names, where), ...redFault(reds(t.text), where)];
    keep(at(found, t.at), t.onPage ? `page\n${t.onPage}` : `text\n${t.list}\n${t.row}`);
  }
  return { faults, pages: places.size };
}

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/**
 * The one sentence a walk comes to, "14 values on 6 pages name nothing", and empty at nought. The paths that name
 * nothing lead, being most of what his pages held; the other kinds are counted after them.
 */
export function textFaultLine(found: TextFound): string {
  const n = found.faults.length;
  if (n === 0) return '';
  const nothing = found.faults.filter((f) => f.kind === 'names-nothing');
  const placeOf = (f: TextFault): string => (f.where.page !== undefined ? `page\n${f.where.page}` : `text\n${f.where.list}\n${f.where.row}`);
  const on = (fs: readonly TextFault[]): string => plural(new Set(fs.map(placeOf)).size, 'page', 'pages');
  if (nothing.length === 0) return `${plural(n, 'fault', 'faults')} on ${on(found.faults)} need${n === 1 ? 's' : ''} fixing`;
  const head = `${plural(nothing.length, 'value', 'values')} on ${on(nothing)} name${nothing.length === 1 ? 's' : ''} nothing`;
  const rest = n - nothing.length;
  return rest === 0 ? head : `${head}, and ${plural(rest, 'other fault needs', 'other faults need')} fixing`;
}
