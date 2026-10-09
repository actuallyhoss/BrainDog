/**
 * A record lints its own pages (PRF-A04, scope 2.3): each page it can draw, drawn on its own data, read by render's rules.
 *
 * WHAT THE HOST CAN DRAW. The conversion from an answer to drawn blocks lives in the web app, above the host, so this
 * sees two things and not the app's formatting of an ordinary block (the scope's stated limit): the documents a block
 * carries, a note or a write-up drawn by `parse` and `toHTML` exactly as the renderer draws it anywhere, and the answers
 * themselves, which say when a figure has no reading, when a block was refused and how many matched. His 67
 * placeholders sat in 11 project notes (`evidence-own-record.md` 2.3), and a note is a document, so this is enough to
 * see what he saw.
 *
 * A FINDING NAMES THE PAGE AND THE PART, never a slug, a block key or a figure's id: Health prints these, and a finding
 * that printed `project-kiln` would be the next thing this lint finds.
 *
 * NOTHING IS SPECIAL-CASED (DIRECTION §27). Every page the record lists is linted the same way, the pages a pack wrote
 * and the pages a template made per row, and a part's own declarations (`theirs`, `ids`) are what render reads.
 */

import { integer, lintPart, money, parse, toHTML, type LintFinding, type LintPart, type LintRule } from 'braindog-render';
import type { BlockResult, PageResult } from '@braindog/kernel';

/** What an answer can say is wrong with itself, beside what render's rules find in what was drawn. A closed list. */
export type AnswerRule = 'no-reading' | 'refused' | 'none-matched' | 'questions-hidden' | 'no-draw';

/** One fault on one page, in a person's words: the page and the part by their names, and one sentence. */
export type PageFinding = { page: string; part: string; rule: LintRule | AnswerRule; said: string };

/** A page as the record lists it (`kernel.pages()`): its address, its title, and the row a template made it for. */
export type ListedPage = {
  slug: string;
  title: string;
  about: { register: string; seq: number | null; updated_at?: string } | null;
  template: string | null;
};

/** What a round reads, so the lint can be run on any record and in a test without a host. */
export type PageLintDeps = {
  pages: () => readonly ListedPage[];
  page: (slug: string) => { ok: true; value: PageResult } | { ok: false };
  /** How many questions wait on the person (`questions-open`), or `null` when it cannot be read. */
  questionsOpen: () => number | null;
  now: () => number;
  /**
   * The field types of the list a block is over, so a cell drawn by its type is not read as raw text. Absent, a block's
   * cells are read only where its answer types them (`types`), since an instant column of a declared list read as text
   * would turn the sign red over a page that prints the time in words.
   */
  typesOf?: TypesOf;
  /**
   * The values of each closed field of a list that have no name of their own, by field. The web draws a named value by
   * its name and an unnamed one as its key, so a cell holding one prints a key where a name goes (`bare-key`).
   */
  keysOf?: KeysOf;
};

/** The unnamed values of each closed field of one list, or `null` for a list the record does not declare. */
export type KeysOf = (register: string) => Readonly<Record<string, readonly string[]>> | null;

/**
 * One round's answer: every finding, how many pages were read, and how many the budget left unread; how many rows were
 * read for their cells, and each block on a page whose rows were more than `CELLS_ROWS`.
 */
export type PageLintRound = {
  findings: PageFinding[];
  pages: number;
  unread: number;
  withFindings: string[];
  cells: number;
  cut: { page: string; part: string; read: number; held: number }[];
};

/**
 * A TEMPLATE'S PAGES ARE ALL READ UP TO THIS MANY, and past it three: the newest row's, the oldest's and the middle one by
 * when it changed. His projects are under it, so every project note is read; a page per run is far over it. The scope's
 * third pick, the page with the most rows, needs every page drawn to find, which a round over a thousand runs cannot pay.
 */
export const TEMPLATE_ALL = 24;

/** How long one round may draw, in milliseconds. The draw is synchronous, so this bounds how long a host's tick holds. */
export const ROUND_MS = 5_000;

/** The pages one round reads, in order: every page somebody wrote, then each template's pages as `TEMPLATE_ALL` says. */
export function pagesToLint(listed: readonly ListedPage[]): ListedPage[] {
  const written = listed.filter((p) => p.template === null);
  const made = new Map<string, ListedPage[]>();
  for (const p of listed) if (p.template !== null) made.set(p.template, [...(made.get(p.template) ?? []), p]);
  const picked: ListedPage[] = [];
  for (const pages of made.values()) {
    if (pages.length <= TEMPLATE_ALL) {
      picked.push(...pages);
      continue;
    }
    const byChange = [...pages].sort((a, b) => (a.about?.updated_at ?? '').localeCompare(b.about?.updated_at ?? ''));
    picked.push(...new Set([byChange.at(-1)!, byChange[0]!, byChange[Math.floor(byChange.length / 2)]!]));
  }
  return [...written, ...picked];
}

/* ── one page ───────────────────────────────────────────────────────────── */

/** A value the record holds for a path, said as a figure is: a word, a number, an amount, or `null` for nothing. */
function said(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isInteger(v) ? integer(v) : String(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  /* AN AMOUNT IN SEVERAL CURRENCIES, one part a currency and never added together. */
  if (Array.isArray(v)) {
    const parts = v.filter((p): p is { amount: number; currency: string } => typeof p?.amount === 'number' && typeof p?.currency === 'string');
    return parts.length ? parts.map((p) => money(p.amount, p.currency)).join(', ') : '';
  }
  if (typeof v === 'object' && typeof (v as { amount?: unknown }).amount === 'number' && typeof (v as { currency?: unknown }).currency === 'string')
    return money((v as { amount: number }).amount, (v as { currency: string }).currency);
  /* A SHAPE THIS DOES NOT KNOW IS DRAWN AS NOTHING AT ALL, never as its JSON, which would read as braces left in print. */
  return '';
}

const drawn = (text: string, values: BlockResult['values']): string =>
  toHTML(parse(text, { page: true }), { resolve: (path) => (values && Object.hasOwn(values, path) ? said(values[path]) : null) });

/** A figure as a person says it when it carries no label: its id's words, `cash-now` as "cash now". */
const figureWords = (metric: string): string => metric.split(':')[0]!.replace(/[-_.]+/g, ' ').trim();

const listed = (names: readonly string[]): string => {
  const shown = [...new Set(names.filter(Boolean))];
  if (shown.length === 0) return '';
  const more = shown.length - 3;
  return `: ${shown.slice(0, 3).join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
};

/** Drawn HTML as the words a person reads: no tags, and `&#39;` said as the apostrophe it is, never printed in a finding. */
const ENTITY: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const plain = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITY[e]!)
    .replace(/\s+/g, ' ')
    .trim();

/** What a block's answer says is wrong with itself. `waiting` is the open questions' figure. */
function answerFindings(b: BlockResult, part: string, waiting: number | null): Omit<PageFinding, 'page'>[] {
  const out: Omit<PageFinding, 'page'>[] = [];
  const blank = (b.readings ?? []).filter((r) => r.reading === null || r.refusal !== undefined);
  if (blank.length > 0)
    out.push({
      rule: 'no-reading',
      part,
      said: `${blank.length === 1 ? 'Shows a figure' : `Shows ${blank.length} figures`} with no answer${listed(blank.map((r) => r.label ?? figureWords(r.metric)))}.`,
    });
  if ((b.refusals ?? []).length > 0) out.push({ rule: 'refused', part, said: 'Draws nothing, because the record could not read what it asks for.' });
  const rows = (b.rows ?? []).length;
  if (b.matched === 0 && rows > 0) out.push({ rule: 'none-matched', part, said: `Says nothing matched while it holds ${integer(rows)}.` });
  if (b.kind === 'queue' && !b.where && rows === 0 && waiting !== null && waiting > 0)
    out.push({ rule: 'questions-hidden', part, said: `Shows no questions while ${integer(waiting)} wait.` });
  return out;
}

/* ── a block's cells ────────────────────────────────────────────────────── */

/** How many of a block's rows one round reads for their cells. A block holding more says so in the sign's facts. */
export const CELLS_ROWS = 50;

/** A field's type by the field's id, for the list a block is over, or `null` for a source no list declares. */
export type TypesOf = (register: string) => Readonly<Record<string, string>> | null;

/**
 * THE TYPES A CELL IS DRAWN BY, NEVER PRINTED AS IT IS HELD: an instant through `since()`, a run by its agent's name and
 * day, a link by the row's name, money, numbers and days by their formatters, a secret as dots (`display` in the web's `api.ts`). A cell
 * of any other type, or of no declared type, prints its text as it is, so its text is what this reads.
 */
const DRAWN_BY_TYPE = new Set(['instant', 'day', 'run', 'ref', 'money', 'int', 'decimal', 'duration', 'bool', 'file', 'secret']);

/** The kinds whose columns are axes, figures or controls rather than cells a person reads as text. */
const NOT_CELLS = new Set(['stat', 'lines', 'progress', 'series', 'inputs', 'capture', 'bridge', 'forecast', 'diff', 'note']);

/** The roles a column draws from beside the row, not from its text: where it applies, a ring, a trend, the next step. */
const NOT_TEXT = new Set(['scope', 'ring', 'trend', 'next']);

/**
 * The rules a cell is read by: what the web prints raw from a row (a time, an id, a fault's own words, a closed list's
 * key), and a name from the code a sentence opens on, as a Decide question's text can. Never a placeholder: the rest of
 * what a cell holds is his to write.
 */
const CELL_RULES = new Set<LintRule>(['raw-instant', 'raw-id', 'dev-name', 'bare-key', 'raw-fault']);

/** A whole ULID, which the web draws as nothing in a column no list declares (`undeclared` in `api.ts`). */
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

/** What one block's cells come to: each column's text as one part, how many rows were read, and how many were not. */
export type BlockCells = { parts: LintPart[]; read: number; unread: number };

/**
 * The text cells of one drawn block, a part a column named by the block's heading and the column's label (the label
 * alone under no heading, where the page's title already names it), from at most `CELLS_ROWS` rows. A
 * column's type is the answer's own (`types`, which a computed source answers) or else the list's declaration; a cell
 * of a type `DRAWN_BY_TYPE` names is not read. The words in a cell are his, so `theirs` holds: the copy rules are his.
 */
export function blockCells(b: BlockResult, name: string | null, typesOf?: TypesOf, keysOf?: KeysOf): BlockCells {
  const rows = b.rows ?? [];
  const cols = (b.columns ?? []).filter((c) => typeof c.field === 'string' && c.field !== '' && !NOT_TEXT.has(c.as ?? ''));
  if (NOT_CELLS.has(b.kind) || rows.length === 0 || cols.length === 0) return { parts: [], read: 0, unread: 0 };
  /* WITH NO DECLARATIONS TO ASK AND NO TYPES ON THE ANSWER, A CELL'S TYPE IS NOT KNOWN, and a time the web says in words
     would read here as raw: the block is not read rather than read wrong. */
  if (!typesOf && !b.types) return { parts: [], read: 0, unread: 0 };
  const declared = typeof b.source === 'string' && typesOf ? typesOf(b.source) : null;
  const read = rows.slice(0, CELLS_ROWS);
  const parts: LintPart[] = [];
  for (const c of cols) {
    const type = b.types?.[c.field] ?? declared?.[c.field];
    if (type !== undefined && DRAWN_BY_TYPE.has(type)) continue;
    const texts: string[] = [];
    for (const r of read) {
      const v = r.fields?.[c.field];
      for (const t of Array.isArray(v) ? v : [v]) {
        if (typeof t !== 'string' || t.trim() === '') continue;
        /* A WHOLE ULID IN A COLUMN NO LIST DECLARES IS DRAWN AS NOTHING, so it prints nothing to find. */
        if (type === undefined && ROW_ID.test(t)) continue;
        /* A RUN'S PROJECT IS HELD AS ITS SPOKEN ID AND DRAWN AS THE PROJECT'S NAME (`display` in `api.ts`), never as `projects#7`. */
        if (r.register === 'session' && c.field === 'project') continue;
        texts.push(t);
      }
    }
    if (texts.length === 0) continue;
    const words = figureWords(c.field);
    const label = c.label?.trim() || words.charAt(0).toUpperCase() + words.slice(1);
    /* THE KEYS OF A CLOSED FIELD WITH NO NAME, so a cell that prints one as itself is a key where a name goes. */
    const keys = typeof b.source === 'string' ? keysOf?.(b.source)?.[c.field] : undefined;
    parts.push({ name: name === null || name === label ? label : `${name}, ${label}`, text: texts.join('\n'), theirs: true, ...(keys?.length ? { keys } : {}) });
  }
  return { parts, read: read.length, unread: rows.length - read.length };
}

/* ── a page ─────────────────────────────────────────────────────────────── */

/** What a page's answer was read for, beside its findings: how many cells, and each block whose rows were cut. */
export type PageRead = { cells: number; cut: { part: string; read: number; held: number }[] };

/**
 * One page's findings, drawn from its answer. A block a `when:` left undrawn is not read: nobody sees it. A part is
 * named by its heading with its figures filled, or by the page's title where it has none; a cell's part adds its column.
 * `read`, when given, is told how many cells were read and which blocks held more rows than were.
 */
export function lintAnswer(page: PageResult, waiting: number | null, typesOf?: TypesOf, read?: PageRead, keysOf?: KeysOf): PageFinding[] {
  const title = page.title;
  const out: PageFinding[] = [];
  for (const b of page.blocks) {
    if (b.drawn === false) continue;
    const name = b.heading ? (plain(drawn(b.heading, b.values)) || title) : title;
    const parts: LintPart[] = [];
    /* THE HEADING IS READ AS HIS WORDS: a template fills it with a row's name, and the copy rules hold the product's. */
    if (b.heading) parts.push({ name, html: drawn(b.heading, b.values), theirs: true });
    const body = (b as { body?: unknown }).body;
    /* A DOCUMENT IS HIS, as a project's note is. A note that is not one is the declaration's own sentence. */
    if (typeof body === 'string' && body.trim() !== '' && !/^\{\{\w+\}\}$/u.test(body.trim()))
      parts.push({ name, html: drawn(body, b.values), theirs: b.document === true });
    if (b.empty && b.matched === 0 && (b.rows ?? []).length === 0) parts.push({ name, html: drawn(b.empty, b.values) });
    const found: LintFinding[] = parts.flatMap((p) => lintPart(p));
    /* AND ITS CELLS, which the web draws from the rows: a time or an id a cell prints raw is on the page as surely as a
       note's. Only `CELL_RULES` read a cell; anything else a cell holds is his to write. */
    const cells = blockCells(b, b.heading ? name : null, typesOf, keysOf);
    found.push(...cells.parts.flatMap((p) => lintPart(p)).filter((f) => CELL_RULES.has(f.rule)));
    if (read) {
      read.cells += cells.read;
      if (cells.unread > 0) read.cut.push({ part: name, read: cells.read, held: cells.read + cells.unread });
    }
    /* ONE FINDING A RULE A PART, as render counts: the heading and the body are one part to the person reading. */
    const seen = new Set<string>();
    for (const f of [...found, ...answerFindings(b, name, waiting)]) {
      if (seen.has(`${f.part}\n${f.rule}`)) continue;
      seen.add(`${f.part}\n${f.rule}`);
      out.push({ page: title, part: f.part, rule: f.rule, said: f.said });
    }
  }
  return out;
}

/** What a page that will not draw prints, which is nothing: a finding on the page, never the refusal's own words. */
const NO_DRAW = 'Does not open: the record could not draw this page.';

/**
 * One round over the record's pages, as many as `ROUND_MS` allows, in `pagesToLint`'s order. A PAGE THAT WILL NOT DRAW
 * IS A FINDING, whether the draw refused or threw: a person opening it sees nothing, and one bad page never ends the
 * round for the rest. The draw is a read and only a read (`kernel.page`, no reader, nothing observed).
 */
export function lintRound(deps: PageLintDeps): PageLintRound {
  const start = deps.now();
  const order = pagesToLint(deps.pages());
  let waiting: number | null = null;
  try {
    waiting = deps.questionsOpen();
  } catch {
    /* A count that cannot be read only turns the hidden-questions check off. */
  }
  const findings: PageFinding[] = [];
  const withFindings: string[] = [];
  let read = 0;
  let cells = 0;
  const cut: PageLintRound['cut'] = [];
  for (const p of order) {
    if (read > 0 && deps.now() - start > ROUND_MS) break;
    read++;
    let found: PageFinding[];
    let title = p.title;
    try {
      const answer = deps.page(p.slug);
      if (answer.ok) title = answer.value.title;
      const pageRead: PageRead = { cells: 0, cut: [] };
      found = answer.ok ? lintAnswer(answer.value, waiting, deps.typesOf, pageRead, deps.keysOf) : [{ page: title, part: title, rule: 'no-draw', said: NO_DRAW }];
      cells += pageRead.cells;
      cut.push(...pageRead.cut.map((c) => ({ page: title, ...c })));
    } catch {
      found = [{ page: title, part: title, rule: 'no-draw', said: NO_DRAW }];
    }
    if (found.length > 0) withFindings.push(title);
    findings.push(...found);
  }
  return { findings, pages: read, unread: order.length - read, withFindings, cells, cut };
}

/* ── the sign ───────────────────────────────────────────────────────────── */

/** A reading of `pages-clean` as the kernel files it (`SignReading`): its six facts are the first findings, then any cut. */
export type PagesCleanReading = { state: 'green' | 'red' | 'none'; value: number | null; said: string; facts: string[] };

const FACTS_MOST = 6;
const FACT_MOST = 200;
const SAID_MOST = 280;

const fit = (s: string, most: number): string => (s.length <= most ? s : `${s.slice(0, most - 1).trimEnd()}…`);

/**
 * A round as the sign `pages-clean`: red while any finding stands, green when every page read was clean, and nothing to
 * judge by when there was no page to read. The findings ride in the facts, one a line with the page and the part named,
 * so no table is needed to keep them: the sign's own row is the newest round.
 *
 * THE GREEN SENTENCE SAYS WHAT WAS READ, never more: "print clean" over cells nobody read was the sign going green on a
 * page that printed a raw time in a table. Cells are named only when a round read some, and a block whose rows were
 * more than `CELLS_ROWS` says so in the facts, after the findings and never in place of all of them.
 */
export function pagesCleanReading(round: PageLintRound): PagesCleanReading {
  const unread = round.unread > 0 ? ` ${integer(round.unread)} more ${round.unread === 1 ? 'was' : 'were'} not reached in this round.` : '';
  if (round.pages === 0) return { state: 'none', value: null, said: 'There is no page to read yet.', facts: [] };
  const cut = round.cut.map((c) => fit(`${c.part === c.page ? c.page : `${c.page}, ${c.part}`}: only the first ${integer(c.read)} of ${integer(c.held)} were read.`, FACT_MOST));
  if (round.findings.length === 0) {
    const read = round.pages === 1 ? 'The one page read prints' : `All ${integer(round.pages)} pages read print`;
    const what = round.cells > 0 ? 'headings, notes and table cells' : 'headings and notes';
    return { state: 'green', value: 0, said: fit(`${read} clean: ${what}.${unread}`, SAID_MOST), facts: cut.slice(0, FACTS_MOST) };
  }
  const n = round.withFindings.length;
  const head = n === 1 ? `1 page prints something raw${listed(round.withFindings)}.` : `${integer(n)} pages print something raw${listed(round.withFindings)}.`;
  const found = round.findings
    .slice(0, FACTS_MOST - Math.min(cut.length, 1))
    .map((f) => fit(f.part === f.page ? `${f.page}: ${f.said}` : `${f.page}, ${f.part}: ${f.said}`, FACT_MOST));
  return { state: 'red', value: round.findings.length, said: fit(`${head}${unread}`, SAID_MOST), facts: [...found, ...cut].slice(0, FACTS_MOST) };
}
