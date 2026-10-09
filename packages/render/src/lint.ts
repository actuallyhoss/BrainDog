/**
 * The page lint: what a drawn page prints that a person should never read (PRF-A04, scope 2.3).
 *
 * PURE, AND OVER WHAT WAS DRAWN, not over the source. His project pages printed `{{revenue.monthly}}`
 * from a chips fence and "monthly —" from a stat fence (`evidence-own-record.md` 2.1): two faults in
 * two drawers, and only the drawn page shows both. So a rule reads the HTML `toHTML` made, or the
 * texts an answer carries, and answers findings in a person's words. The host draws and files the
 * sign (`packages/record/src/page-lint.ts`); the look and the gates read the same rules on screens.
 *
 * A FINDING NEVER QUOTES WHAT IT FOUND when that is an id, a time or a key in raw form: Health prints
 * findings, and a finding that quoted `S731` would make Health the next page this lint fails. A
 * placeholder is named by its last word, the way the hole itself names it (`holeLabel`).
 *
 * WHAT IS NOT READ. Code spans and code blocks (`verbatimText`): a sample is the author's text,
 * verbatim on purpose. Attributes: an `aria-label` repeats the cell it names, and reading both would
 * count every fault twice. Drawings: an `<svg>` holds paths, not words.
 *
 * TWO DECLARATIONS A PART CAN MAKE, and nothing about a record is special-cased (DIRECTION §27):
 * - `ids`: the part prints handles on purpose, a list of runs' handles beside their names. A run's
 *   handle is then not a finding in it; a ULID, a UUID, a random id or `tools#8` still is.
 * - `theirs`: the words are the person's own, a note he wrote. The copy rules (an em dash, the words
 *   row, list item and entity) hold the product's words, not his, and the rules that would flag an
 *   engineer's prose (a commit hash, `user_id` in a sentence) read only the figure slots there.
 */

import { holeLabel } from './html.ts';
import { GLYPH_NAMES } from './glyphs/names.ts';

/** Every rule, by name. A closed list: the sign and the gates name these. */
export type LintRule =
  | 'placeholder'
  | 'braces'
  | 'raw-key'
  | 'raw-id'
  | 'raw-instant'
  | 'icon-word'
  | 'only-a-dash'
  | 'cut-money'
  | 'em-dash'
  | 'plain-words';

/** One fault in one part: which rule, which part (its name), and a sentence a person reads. */
export type LintFinding = { rule: LintRule; part: string; said: string };

/** A part of a page: a tile, a note, an answer. Give `html` (drawn) or `text` (an answer's texts), or both. */
export type LintPart = {
  /** What a person calls the part: the tile's heading, the note's name. Every finding names it. */
  name: string;
  html?: string;
  text?: string;
  /** Prints handles on purpose (a list of runs beside their names): a run's handle is not a finding here, any other id is. */
  ids?: boolean;
  /** The person's own words (a note): the copy rules are skipped and the prose rules read figures only. */
  theirs?: boolean;
  /** The data holds a value for this part, so a dash alone in its place is a finding. */
  hasValue?: boolean;
};

/** A page: its own drawn HTML (linted as one part under the page's name), its parts, or both. */
export type LintPage = { name: string; html?: string; parts?: readonly LintPart[] };

/** What a rule reads: the visible text of one part, with the marked places lifted out first. */
type View = {
  /** Visible text, one slot a line: a tag that is not inline formatting ends the line. */
  lines: string[];
  /** The text of each figure slot (`class="… num …"`), braces and all. */
  figures: string[];
  /** Each hole, the drawer's mark for a value with no answer, by its path. */
  holes: Hit[];
  /** Words printed where a glyph goes: a glyph slot holding text, or `{{icon:…}}` naming no glyph. */
  glyphWords: string[];
  /** How many marks for "no value" (`class="missing"`, or a slot that is only a dash). */
  dashes: number;
  part: LintPart;
};

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', minus: '−', hellip: '…', middot: '·',
};
const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Formatting inside a sentence: dropped without a break, so "list <em>item</em>" stays one phrase. */
const INLINE_TAG = /<\/?(?:a|b|i|em|strong|mark|small|sub|sup|abbr|bdi|bdo|q|s|u|wbr)\b[^>]*>/gi;
const DASH_ONLY = /^[\s—–‒−-]+$/;
/* A class is matched as a whole word of the attribute: `hole`, never `split-hole`. */
const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]!) : null;
};

function viewOf(part: LintPart): View {
  const view: View = { lines: [], figures: [], holes: [], glyphWords: [], dashes: 0, part };
  let html = part.html ?? '';
  /* Lifted whole, in this order: what is never read, then the marked places, each counted once. */
  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg|pre|code|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, '\n');
  html = html.replace(/<(span|button)\b([^>]*\bclass="(?:[^"]*\s)?hole(?=[\s"])[^"]*"[^>]*)>([\s\S]*?)<\/\1>/gi, (_m, _t, open: string, inner: string) => {
    const path = attr(open, 'data-path') ?? decode(inner.replace(/<[^>]*>/g, '')).replace(DASH_ONLY, '').trim();
    view.holes.push({ raw: path, label: path ? spoken(path) : '' });
    return '\n';
  });
  /* A bar's hole row (`data-hole`) is not one: it is the bucket a person sorts, such as Uncategorised, and it prints
     its amount. Its value is a placeholder only when it is a path with no answer, and that is the hole lifted above. */
  html = html.replace(/<span\b([^>]*\bclass="(?:[^"]*\s)?missing(?=[\s"])[^"]*"[^>]*)>[\s\S]*?<\/span>/gi, () => {
    view.dashes++;
    return '\n';
  });
  html = html.replace(/<span\b([^>]*\bclass="(?:[^"]*\s)?unresolved(?=[\s"])[^"]*"[^>]*)>([\s\S]*?)<\/span>/gi, (m, _o, inner: string) => {
    const said = decode(inner).trim();
    if (!/^icon\s*:/i.test(said)) return m;
    view.glyphWords.push(said.replace(/^icon\s*:\s*/i, ''));
    return '\n';
  });
  html = html.replace(/<span\b([^>]*\bdata-glyph="[^"]+"[^>]*)>([^<]*)<\/span>/gi, (_m, _o, inner: string) => {
    const said = decode(inner).trim();
    if (/\p{L}/u.test(said)) view.glyphWords.push(said);
    return '\n';
  });
  for (const m of html.matchAll(/<(\w+)\b[^>]*\bclass="(?:[^"]*\s)?num(?=[\s"])[^"]*"[^>]*>([^<]*)<\/\1>/gi)) view.figures.push(decode(m[2]!).trim());
  const visible = decode(html.replace(INLINE_TAG, '').replace(/<[^>]*>/g, '\n'));
  for (const raw of [...visible.split('\n'), ...(part.text ?? '').split('\n')]) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line === '') continue;
    if (DASH_ONLY.test(line)) view.dashes++;
    else view.lines.push(line);
  }
  return view;
}

/** One hit: what was found (to count it once) and how a finding may name it ('' when it may not). */
type Hit = { raw: string; label: string };

/** A key as a person would say it: its last word, spaced. `revenue.dailyRunRate` is "daily run rate". */
const spoken = (key: string): string =>
  holeLabel(key.replace(/[{}]/g, '').replace(/^\w+\s*:\s*/, '').trim())
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();

const all = (lines: readonly string[], re: RegExp, label: (m: RegExpMatchArray) => string = () => ''): Hit[] =>
  lines.flatMap((l) => Array.from(l.matchAll(re), (m) => ({ raw: m[0], label: label(m) })));

/** Each pattern in turn, a match lifted out before the next looks: a UUID's last group is not a second, hex id. */
const taken = (lines: readonly string[], res: readonly RegExp[]): Hit[] => {
  let rest = [...lines];
  return res.flatMap((re) => {
    const hits = all(rest, re);
    rest = rest.map((l) => l.replace(re, ' '));
    return hits;
  });
};

const BRACED = /\{\{\s*([^{}]*?)\s*\}\}/g;
const CAMEL = /\b[a-z]{2,}(?:[A-Z][a-z0-9]+)+\b/;
const SNAKE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;
const DOTTED = /^[A-Za-z_]\w*(?:\.\w+)+$/;
/* Not a mail address (`first_last@gmail.com`), a handle (`@mara_dev`) or a file's name (`invoice_2026.pdf`): those are a person's own. */
const PROSE_KEY = /(?<![\w.@])(?:[a-z]\w*\.)*(?:[a-z]{2,}(?:[A-Z][a-z0-9]+)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b(?![.@]\w)/g;
/* A run's handle (`S731`): the one id a part may print on purpose, beside the run's name (`ids`). */
const HANDLE = /\bS\d{2,6}\b/g;
/* Where a name goes: a row's number in its register (`tools#8`), a ULID, a UUID. Never printed on purpose. */
const NAMED_IDS = [
  /\b[a-z][a-z0-9_-]*#\d+\b/g,
  /\b(?=[0-9A-HJKMNP-TV-Z]*\d)[0-9A-HJKMNP-TV-Z]{26}\b/g,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
];
/* Random ids: a long hex run, or a long token mixing both cases and digits. Not in his own words, where a hash is a commit. */
const RANDOM_IDS = [
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{12,}\b/g,
  /(?<![\w-])(?=[\w-]*\d)(?=[\w-]*[a-z])(?=[\w-]*[A-Z])[A-Za-z0-9_-]{20,}(?![\w-])/g,
];
const ISO = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}|\s\d{2}:\d{2}:\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
/* Seconds or milliseconds since 1970, between 2001 and 2040, standing alone (not a phone number's tail, not grouped). */
const EPOCH = /(?<![\d+.,:-])\b(?:\d{10}|\d{13})\b(?![\d.,:])/g;
const isEpoch = (s: string): boolean => {
  const n = Number(s) / (s.length === 13 ? 1000 : 1);
  return n >= 978_307_200 && n < 2_208_988_800;
};
const SYMBOL = '[£$¥₹]|\\b(?!EUR\\b)[A-Z]{3}\\s?';
const CUT_MONEY = [
  new RegExp(`(?:${SYMBOL}|€)\\s?\\d[\\d,.]*\\s?(?:…|\\.\\.\\.)`, 'g'),
  new RegExp(`(?:${SYMBOL})\\s?\\d{1,3}(?:,\\d{3})*,\\d{1,2}(?![\\d,])`, 'g'),
];
/**
 * THE WORDS A PERSON NEVER READS ON A PAGE, as `tools/gates/words.json` lists them (its entries marked `page`), each
 * with the name a finding says. One list for the page and for the source the app ships: the words gate goes red, and
 * `lint.test.ts` fails, the day this and the file disagree. Held here rather than imported, because this package is
 * published on its own and the file is not in it.
 */
export const PAGE_WORDS: readonly { name: string; shape: string; case?: true }[] = [
  { name: 'row', shape: '\\brows?\\b' },
  { name: 'list item', shape: '\\blist items?\\b' },
  { name: 'entity', shape: '\\bentit(?:y|ies)\\b' },
  { name: 'credential', shape: '\\bcredentials?\\b' },
  { name: 'register', shape: "\\b(?:the|a|an|this|that|each|every|your|its|one|no|which|new)\\s+registers?\\b|\\bregister's\\b" },
];
const WORDS = PAGE_WORDS.map((w) => ({ name: w.name, re: new RegExp(w.shape, w.case ? 'gu' : 'giu') }));

type RuleSpec = {
  rule: LintRule;
  /** The product's copy only: skipped in a part that holds the person's own words. */
  copy: boolean;
  /** What the rule catches, in a sentence: the list a gate or Health can print. */
  says: string;
  find: (v: View) => Hit[];
  /** The finding's sentence, from how many were found and the names that may be shown. */
  said: (n: number, names: string) => string;
};

/** Whether a name would print raw what the lint finds: `{{tools#8}}` is never named by its id. */
const rawForm = (label: string): boolean => [HANDLE, ...NAMED_IDS, ...RANDOM_IDS, ISO].some((re) => new RegExp(re.source, re.flags.replace('g', '')).test(label));
const named = (labels: string[]): string => {
  const shown = [...new Set(labels.filter((l) => l && !rawForm(l)))];
  if (shown.length === 0) return '';
  const head = shown.slice(0, 3);
  const more = shown.length - head.length;
  return `: ${head.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
};
const many = (n: number, one: string, more: string): string => (n === 1 ? one : more.replace('#', String(n)));

const RULES: readonly RuleSpec[] = [
  {
    rule: 'placeholder',
    copy: false,
    says: 'A placeholder where a value goes: a figure the record has no answer for.',
    find: (v) => v.holes,
    said: (n, names) => many(n, `Prints a placeholder where a value goes${names}.`, `Prints # placeholders where values go${names}.`),
  },
  {
    rule: 'braces',
    copy: false,
    says: 'A figure printed with its braces, the way it was written and not its value.',
    find: (v) => all(v.lines, BRACED, (m) => spoken(m[1] ?? '')),
    said: (n, names) => many(n, `Prints a figure in braces instead of its value${names}.`, `Prints # figures in braces instead of their values${names}.`),
  },
  {
    rule: 'raw-key',
    copy: false,
    says: 'A key printed where its value goes, such as a field name with dots or joined words.',
    find: (v) => {
      const bare = (s: string): string => s.replace(BRACED, ' ').trim();
      const figures = v.figures.map(bare).filter((f) => DOTTED.test(f) || CAMEL.test(f) || SNAKE.test(f));
      const prose = v.part.theirs ? [] : all(v.lines.map(bare), PROSE_KEY);
      return [...figures.map((f) => ({ raw: f, label: spoken(f) })), ...prose.map((h) => ({ raw: h.raw, label: spoken(h.raw) }))];
    },
    said: (n, names) => many(n, `Prints a key where a value goes${names}.`, `Prints # keys where values go${names}.`),
  },
  {
    rule: 'raw-id',
    copy: false,
    says: 'An id where a name goes: a row number such as tools#8, a run handle, a ULID or a random id.',
    find: (v) => taken(v.lines, [...(v.part.ids ? [] : [HANDLE]), ...NAMED_IDS, ...(v.part.theirs ? [] : RANDOM_IDS)]),
    said: (n) => many(n, 'Prints an id where a name goes.', 'Prints # ids where names go.'),
  },
  {
    rule: 'raw-instant',
    copy: false,
    says: 'A time printed raw, as an ISO instant or seconds since 1970, where a date in words goes.',
    /* Ten digits in his own words are as likely a phone or an order number: there, only a figure slot is read for one. */
    find: (v) => [...all(v.lines, ISO), ...all(v.part.theirs ? v.figures : v.lines, EPOCH).filter((h) => isEpoch(h.raw))],
    said: (n) => many(n, 'Prints a raw time where a date in words goes.', 'Prints # raw times where dates in words go.'),
  },
  {
    rule: 'icon-word',
    copy: false,
    says: "An icon's name printed as a word where the icon goes.",
    find: (v) => [
      ...v.glyphWords.map((w) => ({ raw: w, label: w.toLowerCase() })),
      ...v.lines.filter((l) => l.includes('-') && GLYPH_NAMES.has(l)).map((l) => ({ raw: l, label: l })),
    ],
    said: (n, names) => many(n, `Prints an icon's name where the icon goes${names}.`, `Prints # icon names where icons go${names}.`),
  },
  {
    rule: 'only-a-dash',
    copy: false,
    says: 'A dash alone where the data holds a value.',
    find: (v) => (v.part.hasValue ? Array.from({ length: v.dashes }, (_, i) => ({ raw: String(i), label: '' })) : []),
    said: () => 'Shows only a dash where the data has a value.',
  },
  {
    rule: 'cut-money',
    copy: false,
    says: 'An amount cut off part way through its number.',
    find: (v) => taken(v.lines, CUT_MONEY),
    said: (n) => many(n, 'Cuts an amount off part way through its number.', 'Cuts # amounts off part way through their numbers.'),
  },
  {
    rule: 'em-dash',
    copy: true,
    says: 'An em dash in the words; a comma, a colon or a new sentence reads better.',
    find: (v) => v.lines.filter((l) => l.includes('—')).map((l) => ({ raw: l, label: '' })),
    said: (n) => many(n, 'Uses an em dash in its words.', 'Uses em dashes in # places in its words.'),
  },
  {
    rule: 'plain-words',
    copy: true,
    says: 'A word for the machinery, such as row, entity or credential, where the words should name the thing itself.',
    find: (v) => WORDS.flatMap((w) => all(v.lines, w.re, () => `"${w.name}"`)).map((h, i) => ({ raw: `${i}`, label: h.label })),
    said: (_n, names) => `Says a word for the machinery where it should name the thing${names}.`,
  },
];

/** The rules, each with its name, whether it holds only the product's copy, and what it catches. */
export const LINT_RULES: readonly { rule: LintRule; copy: boolean; says: string }[] = RULES.map(({ rule, copy, says }) => ({ rule, copy, says }));

/** One part's findings: one finding a rule, counting and naming what that rule found in it. */
export function lintPart(part: LintPart): LintFinding[] {
  const view = viewOf(part);
  const out: LintFinding[] = [];
  for (const spec of RULES) {
    if (spec.copy && part.theirs) continue;
    const hits = spec.find(view);
    if (hits.length === 0) continue;
    const seen = new Map<string, string>();
    for (const h of hits) if (!seen.has(h.raw)) seen.set(h.raw, h.label);
    out.push({ rule: spec.rule, part: part.name, said: spec.said(seen.size, named([...seen.values()])) });
  }
  return out;
}

/** Drawn HTML, as one part. `part` names it in the findings and carries its declarations. */
export const lintHtml = (html: string, part: Omit<LintPart, 'html'> = { name: 'This page' }): LintFinding[] => lintPart({ ...part, html });

/** Plain text a part prints (an answer's texts), as one part. */
export const lintText = (text: string, part: Omit<LintPart, 'text'> = { name: 'This page' }): LintFinding[] => lintPart({ ...part, text });

/**
 * A whole page: its own HTML under the page's name, then each part under its own. A string is a
 * page's HTML with no name. Nothing found is an empty list, and an empty list is what a clean page answers.
 */
export function lintPage(page: LintPage | string): LintFinding[] {
  const p: LintPage = typeof page === 'string' ? { name: 'This page', html: page } : page;
  return [...(p.html ? lintPart({ name: p.name, html: p.html }) : []), ...(p.parts ?? []).flatMap(lintPart)];
}
