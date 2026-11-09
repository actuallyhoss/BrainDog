/**
 * The page lint: what a drawn page prints that a person should never read (scope 2.3).
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
 * TWO DECLARATIONS A PART CAN MAKE, and nothing about a record is special-cased:
 * - `ids`: the part prints handles on purpose, a list of runs' handles beside their names. A run's
 *   handle is then not a finding in it; a ULID, a UUID, a random id or `tools#8` still is.
 * - `theirs`: the words are the person's own, a note he wrote. The copy rules (an em dash, the words
 *   row, list item and entity) hold the product's words, not his, and the rules that would flag an
 *   engineer's prose (a commit hash, `user_id` in a sentence) read only the figure slots there.
 *
 * AND THREE THE HOST CAN GIVE, for what the drawn words alone cannot say:
 * - `heading`: the part is a title or a heading, a name and never a sentence, so a full stop at its end is a finding.
 * - `buttons`: the words of the buttons the part offers beside its HTML (an answer's actions). A `<button>` drawn in
 *   the HTML is read without being given.
 * - `keys`: the keys of the closed lists the part draws (a service's type, `vm`). One printed as itself where its name
 *   goes is a finding; a key a list names (`domain`, drawn "Domain") never prints as itself.
 *
 * THE PRINT RULES OF THE WORDS sit beside the drawing rules. `long-dash` in the scope is `em-dash`
 * here, the rule that was already the page's; it keeps its name, since the sign and the gates already say it.
 *
 * MONEY IS WRITTEN ONE WAY: `two-spellings` finds one currency drawn by its sign and by its code in one part,
 * "E£1,086,213" beside "EGP 1,238,407.62" on his Today, and one amount written with and without its minor digits.
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
  | 'two-spellings'
  | 'em-dash'
  | 'plain-words'
  | 'system-word'
  | 'dev-name'
  | 'bare-key'
  | 'one-word-button'
  | 'title-stop'
  | 'raw-fault';

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
  /** A title or a heading: its words are a name, so it never ends in a full stop. */
  heading?: boolean;
  /** The words of the buttons the part offers that its HTML does not draw, such as a question's answers. */
  buttons?: readonly string[];
  /** The keys of the closed lists the part draws: one printed as itself is a key where its name goes. */
  keys?: readonly string[];
  /**
   * The texts of the row the part is drawn about, as he wrote them. A name from the code that one of them holds is his,
   * not the code's: a service he named by its domain, `bluff.golf`, said in the Keys note its page fills with the name.
   */
  row?: readonly string[];
  /**
   * The part is a whole screen read as one (a gate's `#main`), so it holds many parts. The one writer says an amount
   * short among words and exact in a ledger or a progress row (`money.ts`, `read` and `exact`), so "£16 over its
   * budget" in a note above "£16.00 over" on the row is each part written its own way, and `two-spellings` reads only
   * its currency half here: one currency by its sign and by its code is still a finding anywhere on a screen.
   */
  screen?: boolean;
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
  /** The words of each button: a drawn `<button>` that is not a value's place, and the part's own `buttons`. */
  buttons: string[];
  /** The words of each title: a drawn `<h1>` to `<h6>`, a button, and the whole part when it is a `heading`. */
  titles: string[];
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

/* CODE IS NEVER READ, in the words as in the HTML (`<code>` above): a span in backticks (`infer.resolve`), and a
   type's angle brackets (`Record<string, Pack>`, `Promise<Row[]>`), the brackets with the name before them, nested. */
const CODE_SPAN = /`[^`\n]+`/g;
const TYPE_ARGS = /(?<![\w$])[A-Za-z_$][\w$.]*<[^<>\n]*>/g;
const notCode = (s: string): string => {
  let t = s.replace(CODE_SPAN, ' ');
  for (let was = ''; was !== t; ) (was = t), (t = t.replace(TYPE_ARGS, ' '));
  return t;
};

function viewOf(part: LintPart): View {
  const view: View = { lines: [], figures: [], holes: [], glyphWords: [], dashes: 0, buttons: [...(part.buttons ?? [])], titles: [], part };
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
  /* AN AMOUNT'S CODE IS PART OF ITS FIGURE: a drawer sets it quieter in a span of its own (`amount-code`, `bd-code`), and
     read as a line apart, "EGP" and "1,200" would be two words and never one amount. */
  html = html.replace(/<span\b[^>]*\bclass="(?:[^"]*\s)?(?:amount-code|bd-code)(?=[\s"])[^"]*"[^>]*>([^<]*)<\/span>/gi, '$1');
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
  /* A BUTTON AND A HEADING ARE READ WHERE THEY ARE DRAWN, and stay in the lines for every other rule. A button marked
     `data-hole` is a bar's bucket drawn as a control (`prop-row`, `split-hole`): it holds a value, not an action. */
  const words = (inner: string): string => decode(inner.replace(INLINE_TAG, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) if (!/\bdata-hole\b/i.test(m[1]!) && words(m[2]!)) view.buttons.push(words(m[2]!));
  for (const m of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) if (words(m[2]!)) view.titles.push(words(m[2]!));
  view.titles.push(...view.buttons);
  if (part.heading) view.titles.push(words(`${html} ${notCode(part.text ?? '')}`));
  const visible = notCode(decode(html.replace(INLINE_TAG, '').replace(/<[^>]*>/g, '\n')));
  for (const raw of [...visible.split('\n'), ...notCode(part.text ?? '').split('\n')]) {
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
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const NAMED_IDS = [/\b[a-z][a-z0-9_-]*#\d+\b/g, /\b(?=[0-9A-HJKMNP-TV-Z]*\d)[0-9A-HJKMNP-TV-Z]{26}\b/g, UUID];
/** A line that is one UUID and nothing else: an id typed where text goes, whoever typed it. */
const wholeUuid = (line: string): boolean => new RegExp(`^\\s*#?${UUID.source}\\s*$`, 'iu').test(line);
/* Random ids: a long hex run, or a long token mixing both cases and digits. Not in his own words, where a hash is a commit. */
const RANDOM_IDS = [
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{12,}\b/g,
  /(?<![\w-])(?=[\w-]*\d)(?=[\w-]*[a-z])(?=[\w-]*[A-Z])[A-Za-z0-9_-]{20,}(?![\w-])/g,
];
const ISO = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}|\s\d{2}:\d{2}:\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
/* Seconds or milliseconds since 1970, between 2001 and 2040, standing alone (not a phone number's tail, not grouped). */
const EPOCH = /(?<![\d+.,:-])\b(?:\d{10}|\d{13})\b(?![\d.,:])/g;
/**
 * A CELL OF SOMEBODY'S WORDS QUOTES THEM, TIME AND ALL. A mail's subject that reads "Your secure link is here | 2026-11-03
 * 17:04:56" is what the sender wrote, and the page can do nothing about it; the sign said Mail printed a raw time for as
 * long as that mail was among the last forty. A cell that holds nothing but the time is still read: that is a date typed
 * as text. A note or a page's own HTML is read whole, since its writer can mend it.
 */
const quotedCell = (v: View): boolean => v.part.theirs === true && v.part.html === undefined;
const wholeInstant = (line: string): boolean => new RegExp(`^\\s*(?:${ISO.source})\\s*$`).test(line);
const isEpoch = (s: string): boolean => {
  const n = Number(s) / (s.length === 13 ? 1000 : 1);
  return n >= 978_307_200 && n < 2_208_988_800;
};
const SYMBOL = '[£$¥₹]|\\b(?!EUR\\b)[A-Z]{3}\\s?';
const CUT_MONEY = [
  new RegExp(`(?:${SYMBOL}|€)\\s?\\d[\\d,.]*\\s?(?:…|\\.\\.\\.)`, 'g'),
  new RegExp(`(?:${SYMBOL})\\s?\\d{1,3}(?:,\\d{3})*,\\d{1,2}(?![\\d,])`, 'g'),
];

/* ── one currency, one spelling (`two-spellings`) ─────────────────────────────────────────────────────────── */

/* A figure's digits, grouped or not, with its fraction: "1,200.50", "1200". A comma or a full stop after it is the sentence's. */
const DIGITS = '\\d+(?:,\\d+)*(?:\\.\\d+)?';
/* A sign in front of a figure (`£12`, `E£1,070`, `CA$4`), and the code after it when the figure carries one (`$4,800 USD`). */
const SIGNED = new RegExp(`(?<![\\p{L}\\p{N}])([A-Z]{0,2}\\p{Sc})\\s?(${DIGITS})(?:\\s([A-Z]{3})(?!\\p{L}))?`, 'gu');
/* A code in front of a figure, the minus between them or in front: `EGP 1,200`, `−EGP 497.26`. */
const CODED = new RegExp(`(?<![\\p{L}\\p{N}])([A-Z]{3})\\s[−-]?(${DIGITS})(?![\\d,]*\\d)`, 'gu');

/** How English writes a currency in one display, or `''` for a code the runtime will not format. */
const display = (code: string, currencyDisplay: 'symbol' | 'narrowSymbol'): string => {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';
  } catch {
    return '';
  }
};
let tender: Intl.DisplayNames | undefined;
/** Three capitals the runtime names as a currency. "THE 100" and "USB 3" are words. */
const isTender = (code: string): boolean => (tender ??= new Intl.DisplayNames('en', { type: 'currency', fallback: 'none' })).of(code) !== undefined;
let owners: Map<string, string> | undefined;
/** The currency whose own sign this is, as English writes it (`£` is sterling's, `$` the US dollar's), or none (`E£`). */
const ownerOf = (sign: string): string | undefined =>
  (owners ??= new Map(Intl.supportedValuesOf('currency').map((c) => [display(c, 'symbol'), c] as const).filter(([s, c]) => s !== c && /\p{Sc}/u.test(s)))).get(sign);
/**
 * Whether a sign alone in front of a figure is this currency. `£` is sterling. `$` alone is the US dollar's and never the
 * Canadian's, which the writer draws "$4 CAD". `E£`, nobody's own, is the pound of the currency it is the short form of.
 */
const signFor = (sign: string, code: string): boolean => {
  const owner = ownerOf(sign);
  return owner !== undefined ? owner === code : display(code, 'narrowSymbol') === sign;
};

/**
 * Each currency written two ways in one part, and each amount written with and without its minor digits there. Three
 * spellings of a currency are told apart: its code in front ("EGP 12"), its sign with the code after ("£4 GBP"), and its
 * sign alone ("£12"). One part holding two of them for one currency is a hit, and so is "£12" beside "£12.00". A rounded
 * headline beside the exact figure ("£1,086,213" and "£1,086,213.41") is two amounts, each written its own way, and is not.
 */
function twoSpellings(lines: readonly string[], minorToo = true): Hit[] {
  const ways = new Map<string, Set<string>>();
  const bare = new Set<string>();
  const minor = new Map<string, Set<boolean>>();
  const way = (code: string, how: string): void => void (ways.get(code) ?? ways.set(code, new Set()).get(code)!).add(how);
  const figure = (key: string, digits: string): void => {
    const [whole, fraction] = digits.split('.');
    if (fraction !== undefined && !/^0+$/u.test(fraction)) return;
    const at = `${key} ${whole}`;
    (minor.get(at) ?? minor.set(at, new Set()).get(at)!).add(fraction !== undefined);
  };
  for (const line of lines) {
    for (const m of line.matchAll(SIGNED)) {
      const [, sign, digits, code] = m as unknown as [string, string, string, string | undefined];
      if (code !== undefined && isTender(code)) way(code, 'sign and code'), figure(`${sign} ${code}`, digits);
      else bare.add(sign), figure(sign, digits);
    }
    for (const m of line.matchAll(CODED)) {
      const [, code, digits] = m as unknown as [string, string, string];
      if (isTender(code)) way(code, 'code'), figure(code, digits);
    }
  }
  for (const sign of bare) for (const code of ways.keys()) if (signFor(sign, code)) way(code, 'sign');
  return [
    ...[...ways].filter(([, how]) => how.size > 1).map(([code]) => ({ raw: code, label: '' })),
    ...(minorToo ? [...minor].filter(([, both]) => both.size > 1).map(([at]) => ({ raw: at, label: '' })) : []),
  ];
}
/**
 * THE WORDS A PERSON NEVER READS ON A PAGE, as `tools/gates/words.json` lists them (its entries whose `page` names a
 * rule), each with the name a finding says and the rule that reads it: `plain-words` for the machinery's nouns for a
 * thing (row, entity), `system-word` for the words of how the app is built (pack, schema, MCP). One list for the page
 * and for the source the app ships: the words gate goes red, and `lint.test.ts` fails, the day this and the file
 * disagree. Held here rather than imported, because this package is published on its own and the file is not in it.
 */
export const PAGE_WORDS: readonly { name: string; shape: string; case?: true; rule: 'plain-words' | 'system-word' }[] = [
  { name: 'row', shape: '\\brows?\\b', rule: 'plain-words' },
  { name: 'list item', shape: '\\blist items?\\b', rule: 'plain-words' },
  { name: 'entity', shape: '\\bentit(?:y|ies)\\b', rule: 'plain-words' },
  { name: 'credential', shape: '\\bcredentials?\\b', rule: 'plain-words' },
  { name: 'register', shape: "\\b(?:the|a|an|this|that|each|every|your|its|one|no|which|new)\\s+registers?\\b|\\bregister's\\b", rule: 'plain-words' },
  { name: 'pack', shape: '\\bpacks?\\b(?!,? (?:and|or) (?:send|ship|post))', rule: 'system-word' },
  { name: 'slug', shape: '\\bslugs?\\b', rule: 'system-word' },
  { name: 'schema', shape: '\\bschemas?\\b', rule: 'system-word' },
  { name: 'declaration', shape: '\\bdeclarations?\\b', rule: 'system-word' },
  { name: 'MCP', shape: '\\bMCP\\b', case: true, rule: 'system-word' },
  { name: 'snapshot', shape: '\\bsnapshots?\\b', rule: 'system-word' },
  { name: 'Spark', shape: '\\bSpark\\b', case: true, rule: 'system-word' },
  { name: 'recommended', shape: '\\brecommended\\b', rule: 'system-word' },
  { name: "isn't code", shape: "\\bisn['\u2019]t code\\b", rule: 'system-word' },
];
const wordsOf = (rule: string) =>
  PAGE_WORDS.filter((w) => w.rule === rule).map((w) => ({ name: w.name, re: new RegExp(w.shape, w.case ? 'gu' : 'giu') }));
const WORDS = wordsOf('plain-words');
const SYSTEM_WORDS = wordsOf('system-word');

/** The buttons of one word a person may read, as `words.json` lists them (`buttons`): any other button says a verb and its object. */
export const BUTTON_WORDS: readonly string[] = ['Undo', 'Cancel', 'Done', 'Close', 'Back'];

/*
 * A NAME FROM THE CODE WHERE A SENTENCE STANDS: `infer.resolve could not be delivered`, `bank-card-used-sms could not
 * read account` (seen on Decide, 7 October). Dotted words whose end is not a site's or a file's (`oxbow.gg`, `notes.md`), or
 * three hyphened words with none of English's small words in them (`up-to-date`, `pay-as-you-go` are plain).
 */
const DOTTED_NAME = /(?<![\w.@/:-])[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+(?![\w@/-]|\.\w)/g;
const HYPHENED_NAME = /(?<![\w.@/:-])[a-z][a-z0-9]*(?:-[a-z0-9]+){2,}(?![\w@/-]|\.\w)/g;
/* The ends of a site's address or a file's name longer than three letters; three or fewer is always one of those. The
   names kept for examples and tests (`kilnfonts.example`, the seed's sites) are addresses too. */
const ADDRESS_ENDS = new Set(['json', 'yaml', 'toml', 'html', 'svelte', 'scss', 'docx', 'xlsx', 'pptx', 'jpeg', 'webp', 'heic', 'tiff', 'mjs',
  'app', 'dev', 'studio', 'store', 'online', 'site', 'cloud', 'games', 'tech', 'info', 'shop', 'blog', 'design', 'agency', 'email',
  'space', 'world', 'live', 'life', 'media', 'news', 'team', 'tools', 'works', 'zone', 'page', 'link', 'land', 'money', 'finance', 'house',
  'example', 'test', 'invalid', 'localhost', 'local', 'internal', 'company', 'digital', 'network', 'systems', 'solutions', 'services',
  'events', 'photo', 'photography', 'software', 'website', 'today', 'club', 'codes', 'social', 'academy', 'health', 'travel',
  'coffee', 'city', 'london', 'capital', 'ventures', 'partners', 'consulting', 'guru', 'rocks', 'fund', 'farm', 'film', 'music']);
const SMALL_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'as', 'and', 'or', 'up', 'out', 'off', 'over', 'you', 'it', 'with', 'from', 'all']);
const ADDRESS = /\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/g;
const devNames = (line: string, glyphs: ReadonlySet<string>): string[] => {
  const bare = line.replace(ADDRESS, ' ');
  const dotted = Array.from(bare.matchAll(DOTTED_NAME), (m) => m[0]).filter((d) => {
    const end = d.slice(d.lastIndexOf('.') + 1);
    return end.length > 3 && !ADDRESS_ENDS.has(end);
  });
  const hyphened = Array.from(bare.matchAll(HYPHENED_NAME), (m) => m[0]).filter((h) => !glyphs.has(h) && !h.split('-').some((w) => SMALL_WORDS.has(w)));
  return [...dotted, ...hyphened];
};
/* A sentence: three words or more. A name standing alone (a skill called `gstack-ceo-review`) is a name, not a sentence. */
const SENTENCE = (line: string): boolean => line.split(' ').length >= 3;

/* A key of a closed list as it is held: lower case, no space. Its name is drawn in sentence case. */
const KEY_SHAPED = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;
/* A piece of a line that is the key alone, or the key and its figures: "vm E£547.97 71%". */
const bareKeys = (line: string, keys: ReadonlySet<string>): string[] =>
  line
    .split(/[,;:·|]\s*/)
    .map((seg) => seg.trim().split(' '))
    .filter(([head, ...rest]) => head !== undefined && keys.has(head) && rest.every((t) => /\d/.test(t)))
    .map(([head]) => head!);

/* A title that ends in a full stop: not an ellipsis, which promises more, and not a short form a name ends in (Acme Ltd.). */
const SHORT_FORMS = new Set(['inc', 'ltd', 'co', 'corp', 'llc', 'plc', 'gmbh', 'jr', 'sr', 'st', 'dr', 'mr', 'mrs', 'ms', 'etc', 'vs', 'no', 'bros']);
const stops = (title: string): boolean => {
  const t = title.trimEnd();
  if (!t.endsWith('.') || t.endsWith('..')) return false;
  const last = /(\S+)\.$/.exec(t)?.[1] ?? '';
  return !SHORT_FORMS.has(last.toLowerCase()) && !/^\p{Lu}$/u.test(last);
};

/* A thrown error's shape on a page, the way the code wrote it for a developer. In his own words only a stack line is
   read: he may write about a TypeError he fixed. `[object Object]` is a value that never arrived, the printed gate's
   own word for it (`tools/gates/printed.mjs` OWN), and is not counted twice. */
const STACK_LINE = /^at\s+(?:[^\s()]+\s+)?\(?(?:[a-z]+:\/\/|\/|node:)?[^\s()]+:\d+:\d+\)?$/;
const FAULTS = [
  /\b(?:Type|Reference|Syntax|Range|URI|Eval|Aggregate|Internal)Error\b/,
  /\bCannot read propert(?:y|ies) of (?:undefined|null)\b/i,
  /\b(?:undefined|null) is not (?:a function|an object)\b/,
  /\bis not a function\b/,
  /\bUnexpected (?:token\b.*\bin JSON|end of JSON input)\b/,
  /\bFailed to fetch\b/,
];

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
    /* A CELL OF SOMEBODY'S WORDS QUOTES THEM, ID AND ALL, as it quotes a time (`quotedCell`): "Spaceship order summary
       #e5c0d7e5-..." is the subject the sender wrote, and Mail's Recent mail printed it as it should. A UUID is never
       one of the record's own ids, so inside a quoted line it is theirs; a cell that holds nothing but one still is not. */
    find: (v) =>
      taken(quotedCell(v) ? v.lines.map((l) => (wholeUuid(l) ? l : l.replace(UUID, ' '))) : v.lines, [
        ...(v.part.ids ? [] : [HANDLE]),
        ...NAMED_IDS,
        ...(v.part.theirs ? [] : RANDOM_IDS),
      ]),
    said: (n) => many(n, 'Prints an id where a name goes.', 'Prints # ids where names go.'),
  },
  {
    rule: 'raw-instant',
    copy: false,
    says: 'A time printed raw, as an ISO instant or seconds since 1970, where a date in words goes.',
    /* Ten digits in his own words are as likely a phone or an order number: there, only a figure slot is read for one. */
    find: (v) => [...all(quotedCell(v) ? v.lines.filter(wholeInstant) : v.lines, ISO), ...all(v.part.theirs ? v.figures : v.lines, EPOCH).filter((h) => isEpoch(h.raw))],
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
    rule: 'two-spellings',
    copy: false,
    says: 'One currency written two ways in one place, by its sign and by its code, or one amount with and without the digits after its point.',
    /* In his own words, only a figure slot: how he writes money in a note is his. On a whole screen, the currency half
       only: an amount with and without its minor digits there is two parts, each in the writer's own setting. */
    find: (v) => twoSpellings(v.part.theirs ? v.figures : v.lines, v.part.screen !== true),
    said: () => 'Money is written two ways here. Write every amount the same way.',
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
  {
    rule: 'system-word',
    copy: true,
    says: 'A word for how the app is built, such as pack, schema or MCP, where a plain word goes.',
    find: (v) => SYSTEM_WORDS.flatMap((w) => all(v.lines, w.re, () => `"${w.name}"`)).map((h, i) => ({ raw: `${i}`, label: h.label })),
    said: (_n, names) => `Says a word for how the app is built where a plain word goes${names}.`,
  },
  {
    rule: 'dev-name',
    copy: false,
    says: 'A name from the code, such as a dotted or hyphened identifier, where a sentence should say what it is.',
    /* In his own words, only a sentence that opens on one: a name from the code in the middle of his note is his to write.
       And never one his row holds (`row`), which the page filled in: "golf" is no site's end the list knows, and
       measured on 9 November his service bluff.golf read as raw code on its own page. */
    find: (v) => {
      const his = (v.part.row ?? []).map((t) => t.toLowerCase());
      return v.lines
        .filter(SENTENCE)
        .flatMap((l) => devNames(l, GLYPH_NAMES).filter((d) => (!v.part.theirs || l.startsWith(d)) && !his.some((t) => t.includes(d))))
        .map((d) => ({ raw: d, label: '' }));
    },
    said: (n) => many(n, 'Prints a name from the code where a sentence should say what it is.', 'Prints # names from the code where sentences should say what they are.'),
  },
  {
    rule: 'bare-key',
    copy: false,
    says: "A value of a closed list printed as its key, such as a service's type, where its name goes.",
    find: (v) => {
      const keys = new Set((v.part.keys ?? []).filter((k) => KEY_SHAPED.test(k)));
      return keys.size === 0 ? [] : v.lines.flatMap((l) => bareKeys(l, keys)).map((k) => ({ raw: k, label: '' }));
    },
    said: (n) => many(n, 'Prints a value as its key where its name goes.', 'Prints # values as their keys where their names go.'),
  },
  {
    rule: 'one-word-button',
    copy: true,
    says: `A button of one word that is not ${BUTTON_WORDS.slice(0, -1).join(', ')} or ${BUTTON_WORDS.at(-1)}, where a verb and its object say what it does.`,
    find: (v) => v.buttons.filter((b) => /^\p{L}[\p{L}'’]*$/u.test(b) && !BUTTON_WORDS.includes(b)).map((b) => ({ raw: b, label: `"${b}"` })),
    said: (n, names) => many(n, `Has a button of one word${names}. Say what it does to what.`, `Has # buttons of one word${names}. Say what each does to what.`),
  },
  {
    rule: 'title-stop',
    copy: true,
    says: 'A title, a heading or a button that ends in a full stop, where a name goes and not a sentence.',
    find: (v) => v.titles.filter(stops).map((t) => ({ raw: t, label: '' })),
    said: (n) => many(n, 'Ends a title in a full stop.', 'Ends # titles in a full stop.'),
  },
  {
    rule: 'raw-fault',
    copy: false,
    says: 'An error from the code, such as TypeError, Cannot read or a stack line, where a sentence should say what went wrong.',
    find: (v) =>
      v.lines
        .filter((l) => STACK_LINE.test(l) || (!v.part.theirs && FAULTS.some((re) => re.test(l))))
        .map((l) => ({ raw: l, label: '' })),
    said: (n) => many(n, 'Prints an error from the code where a sentence should say what went wrong.', 'Prints # errors from the code where sentences should say what went wrong.'),
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
