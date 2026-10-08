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
};

/** One round's answer: every finding, how many pages were read, and how many the budget left unread. */
export type PageLintRound = { findings: PageFinding[]; pages: number; unread: number; withFindings: string[] };

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

/**
 * One page's findings, drawn from its answer. A block a `when:` left undrawn is not read: nobody sees it. A part is
 * named by its heading with its figures filled, or by the page's title where it has none.
 */
export function lintAnswer(page: PageResult, waiting: number | null): PageFinding[] {
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
    /* ONE FINDING A RULE A PART, as render counts: the heading and the body are one part to the person reading. */
    const seen = new Set<string>();
    for (const f of [...found, ...answerFindings(b, name, waiting)]) {
      if (seen.has(f.rule)) continue;
      seen.add(f.rule);
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
  for (const p of order) {
    if (read > 0 && deps.now() - start > ROUND_MS) break;
    read++;
    let found: PageFinding[];
    let title = p.title;
    try {
      const answer = deps.page(p.slug);
      if (answer.ok) title = answer.value.title;
      found = answer.ok ? lintAnswer(answer.value, waiting) : [{ page: title, part: title, rule: 'no-draw', said: NO_DRAW }];
    } catch {
      found = [{ page: title, part: title, rule: 'no-draw', said: NO_DRAW }];
    }
    if (found.length > 0) withFindings.push(title);
    findings.push(...found);
  }
  return { findings, pages: read, unread: order.length - read, withFindings };
}

/* ── the sign ───────────────────────────────────────────────────────────── */

/** A reading of `pages-clean` as the kernel files it (`SignReading`): its six facts are the first six findings. */
export type PagesCleanReading = { state: 'green' | 'red' | 'none'; value: number | null; said: string; facts: string[] };

const FACTS_MOST = 6;
const FACT_MOST = 200;
const SAID_MOST = 280;

const fit = (s: string, most: number): string => (s.length <= most ? s : `${s.slice(0, most - 1).trimEnd()}…`);

/**
 * A round as the sign `pages-clean`: red while any finding stands, green when every page read was clean, and nothing to
 * judge by when there was no page to read. The findings ride in the facts, one a line with the page and the part named,
 * so no table is needed to keep them: the sign's own row is the newest round.
 */
export function pagesCleanReading(round: PageLintRound): PagesCleanReading {
  const unread = round.unread > 0 ? ` ${integer(round.unread)} more ${round.unread === 1 ? 'was' : 'were'} not reached in this round.` : '';
  if (round.pages === 0) return { state: 'none', value: null, said: 'There is no page to read yet.', facts: [] };
  if (round.findings.length === 0) {
    const read = round.pages === 1 ? 'The one page read prints' : `All ${integer(round.pages)} pages read print`;
    return { state: 'green', value: 0, said: fit(`${read} clean.${unread}`, SAID_MOST), facts: [] };
  }
  const n = round.withFindings.length;
  const head = n === 1 ? `1 page prints something raw${listed(round.withFindings)}.` : `${integer(n)} pages print something raw${listed(round.withFindings)}.`;
  const facts = round.findings
    .slice(0, FACTS_MOST)
    .map((f) => fit(f.part === f.page ? `${f.page}: ${f.said}` : `${f.page}, ${f.part}: ${f.said}`, FACT_MOST));
  return { state: 'red', value: round.findings.length, said: fit(`${head}${unread}`, SAID_MOST), facts };
}
