/**
 * What the record found wrong in its own pages and notes, in Settings › Health (Today asks none of it since the audit of
 * 22 October, U3): the record's `textFaults` as lines a person can read (`TextFaults.svelte`). PGS-B15 job d, drawn as
 * a tile and never as a question: nothing here asks. The record walks its words in its night pass and keeps what it
 * found; before the first night it says so (`computedAt` `null`), and that is said as not checked yet (`notChecked`).
 *
 * THROUGH THE RECORD'S OWN `textFaults` AND NOTHING ELSE. The record walks the text of every page and note the reader
 * may read and says each fault in a sentence with its fix (`packages/record/src/text-check.ts`); this file only turns
 * each into what a screen draws: the place by its own name, what is wrong, the fix, and where it is fixed.
 *
 * THE RECORD SAYS A PLACE BY ITS NAMES (the page's title, the list's name, the entry's name), and a person is given one
 * press to it by its name's route: a page at `/p/<slug>`, an entry at `/r/<list>/<number>`, a list at `/r/<list>`. The
 * names are turned into that address with what this tab already holds, the pages `boot` listed (`held.ts`), the lists
 * the shell carries and the entries a reader walked; an address the record sends beside a fault (`at`) is taken first.
 * A value that is a raw id (a ULID) is never put in an address, and a fault with no place this tab can name is words.
 *
 * IT NEVER FAILS THE SCREEN. A host built before the read answers `ROUTE_UNKNOWN` or `NOT_IN_THIS_BUILD`, a reader it
 * refuses answers a refusal, and an answer of another shape is none: each is `null`, and `null` draws nothing.
 *
 * A ROUTE-ONLY MODULE, like `stale.ts`: the client carries the route table as a value, so this is imported lazily from
 * the screen that draws it and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';
import { PAGES, seqTitled } from '../record/held.ts';

/** How many faults the tile lists. The rest are counted in one line under them. */
export const FAULTS_SHOWN = 6;

/** Where a fault stands, as the record says it, by names: the page, or the list, entry and field; `name` is the part. */
export type FaultWhere = { page?: string; list?: string; row?: string; field?: string; name: string };

/** An address beside the names, when the record sends one: a page's slug, or a list's id and an entry's number. */
export type FaultAt = { slug?: string; list?: string; seq?: number };

/** One fault, as the record says it. `kind` is the record's word for it and is never drawn. */
export type TextFault = { kind: string; where: FaultWhere; said: string; fix: string; at?: FaultAt };

/**
 * The record's answer: how many faults in all, its one sentence, the first of them, whether it held some back, and when
 * the record's night pass made the walk (`computedAt`). `null` there is NOT CHECKED YET, before the first night, and
 * never clean: its count of nought says nothing of the words. Absent, the host walked as it was asked (a build before
 * the night pass kept the walk).
 */
export type TextFaults = { count: number; line: string; faults: TextFault[]; truncated: boolean; computedAt?: string | null; printed?: Printed };

/**
 * ONE THING A PAGE PRINTS RAW, from the record's nightly page lint (`printed`): the page by its title, the part, the
 * sentence, and the page's address where the record sent one. The sign `pages-clean` carries six; this is every one.
 */
export type PrintedFinding = { page: string; part: string; said: string; slug: string | null };

/** The night's whole page lint as the record keeps it: when, how many pages read and not reached, every finding. */
export type Printed = { at: string; pages: number; unread: number; findings: PrintedFinding[]; cut: string[] };

/** One fault as it is drawn: the place's own name, what is wrong, the fix, and where it opens (`null`: words alone). */
export type FaultRow = { title: string; said: string; fix: string; href: string | null };

/** How the screen asks the record: a client's `call`, or anything shaped like it. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** What this tab knows to turn a name into an address: its pages, its lists, and an entry's number by its name. */
export type Known = {
  pages: readonly { slug: string; title: string }[];
  lists: readonly { id: string; name: string }[];
  seq: (list: string, name: string) => number | null;
};

/** A tab that knows nothing: every fault is words alone. */
export const NOTHING_KNOWN: Known = { pages: [], lists: [], seq: () => null };

/** A raw id as the record mints one. Never put in an address a person follows. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** Trimmed text, with no em dash in what a person reads: the record's own words, said plainly. */
const plain = (v: unknown): string => (typeof v === 'string' ? v.replaceAll(/\s*\u2014\s*/gu, ', ').trim() : '');

/** Two names are one when they differ only in case and spacing. */
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A name or handle fit for an address: not empty and not a raw id. */
const handle = (v: unknown): string => {
  const s = plain(v);
  return s === '' || ULID.test(s) ? '' : s;
};

/** What this tab holds: the pages `boot` listed, the lists given (the shell's), and the entries a reader walked. */
export function knownOf(lists: readonly { id: string; name: string }[]): Known {
  return {
    pages: Object.values(PAGES).map((p) => ({ slug: p.page, title: p.title })),
    lists,
    seq: (list, name) => seqTitled(list, name, same),
  };
}

/** Where a person fixes it, by its name's route, or `null` when this tab can name no place for it. */
export function placeOf(fault: Pick<TextFault, 'where' | 'at'>, known: Known = NOTHING_KNOWN): string | null {
  const { where, at } = fault;
  const slug = handle(at?.slug);
  if (slug !== '') return `/p/${encodeURIComponent(slug)}`;
  const sent = handle(at?.list);
  if (sent !== '') {
    const n = at?.seq;
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? `/r/${encodeURIComponent(sent)}/${String(n)}` : `/r/${encodeURIComponent(sent)}`;
  }
  /* A PAGE BY ITS TITLE, and only where one page is called that: two pages of one name are no place. */
  const title = plain(where.page);
  const pages = title === '' ? [] : known.pages.filter((p) => same(p.title, title) && handle(p.slug) !== '');
  if (pages.length === 1) return `/p/${encodeURIComponent(pages[0]!.slug)}`;
  const name = plain(where.list);
  const list = name === '' ? undefined : known.lists.find((l) => same(l.name, name) || l.id === name);
  if (!list || handle(list.id) === '') return null;
  const row = plain(where.row);
  const n = row === '' ? null : known.seq(list.id, row);
  return n !== null && n > 0 ? `/r/${encodeURIComponent(list.id)}/${String(n)}` : `/r/${encodeURIComponent(list.id)}`;
}

/** The address the record sent beside a fault, the parts of it that are fit for one. */
function atOf(v: unknown): FaultAt | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const a = v as Record<string, unknown>;
  const at: FaultAt = {};
  if (typeof a.slug === 'string') at.slug = a.slug;
  if (typeof a.list === 'string') at.list = a.list;
  if (typeof a.seq === 'number') at.seq = a.seq;
  return Object.keys(at).length > 0 ? at : undefined;
}

/** One fault the screen can say, or `null`: a fault with no name for its place or no sentence is dropped. */
function faultOf(v: unknown): TextFault | null {
  if (typeof v !== 'object' || v === null) return null;
  const f = v as { kind?: unknown; where?: unknown; said?: unknown; fix?: unknown; at?: unknown };
  const w = (typeof f.where === 'object' && f.where !== null ? f.where : {}) as Record<string, unknown>;
  const where: FaultWhere = { name: plain(w.name) };
  for (const key of ['page', 'list', 'row', 'field'] as const) if (typeof w[key] === 'string') where[key] = w[key];
  const said = plain(f.said);
  if (said === '' || titleOf(where) === '') return null;
  const at = atOf(f.at);
  return { kind: plain(f.kind), where, said, fix: plain(f.fix), ...(at ? { at } : {}) };
}

/** The record's `printed`, or nothing for an answer without it or of another shape. A finding with no page or sentence is dropped. */
function printedOf(v: unknown): Printed | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  if (typeof p.at !== 'string' || typeof p.pages !== 'number' || !Array.isArray(p.findings)) return null;
  const findings: PrintedFinding[] = [];
  for (const f of p.findings) {
    if (typeof f !== 'object' || f === null) continue;
    const r = f as Record<string, unknown>;
    const page = plain(r.page);
    const said = plain(r.said);
    if (page === '' || said === '' || ULID.test(page)) continue;
    const slug = handle(r.slug);
    findings.push({ page, part: plain(r.part), said, slug: slug === '' ? null : slug });
  }
  const cut = Array.isArray(p.cut) ? p.cut.map(plain).filter((c) => c !== '') : [];
  return { at: p.at, pages: p.pages, unread: typeof p.unread === 'number' ? p.unread : 0, findings, cut };
}

/**
 * The place's own name: the page's title, else the entry's (a note is the entry it is written on), else the part's. A
 * name that is a raw id is no name, and a fault with none is dropped.
 */
function titleOf(where: FaultWhere): string {
  const name = [where.page, where.row, where.name].map(plain).find((n) => n !== '') ?? '';
  return ULID.test(name) ? '' : name;
}

/**
 * The record's answer as what the screen holds, or `null`. A REFUSAL IS NOTHING, whichever it is, and so is an answer
 * with no whole count. A count of nought is an answer, and it draws nothing.
 */
export function textFaultsOf(answer: unknown): TextFaults | null {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true || typeof a.value !== 'object' || a.value === null) return null;
  const v = a.value as { count?: unknown; line?: unknown; faults?: unknown; truncated?: unknown; computedAt?: unknown };
  if (typeof v.count !== 'number' || !Number.isInteger(v.count) || v.count < 0) return null;
  const faults = Array.isArray(v.faults) ? v.faults.map(faultOf).filter((f): f is TextFault => f !== null) : [];
  const found: TextFaults = { count: v.count, line: plain(v.line), faults, truncated: v.truncated === true };
  const printed = printedOf((v as { printed?: unknown }).printed);
  if (printed) found.printed = printed;
  /* WHEN THE NIGHT PASS WALKED, as the record says it; `null` is not checked yet, and kept as `null`. */
  if (v.computedAt === null) found.computedAt = null;
  else if (typeof v.computedAt === 'string' && v.computedAt !== '') found.computedAt = v.computedAt;
  return found;
}

/**
 * WHETHER THE RECORD HAS NOT CHECKED ITS WORDS YET: its night pass has not walked them (`computedAt` is `null`). Such an
 * answer is said as "not checked yet" and never as nothing to fix.
 */
export const notChecked = (found: TextFaults | null): boolean => found !== null && found.computedAt === null;

/** Ask the record's `textFaults`. `null` on a refusal, a method the host does not know, or a call that threw. */
export async function readTextFaults(call: Call): Promise<TextFaults | null> {
  try {
    return textFaultsOf(await call('textFaults', {}));
  } catch {
    return null;
  }
}

/** What the record at `base` found. `null` for none, which draws nothing. */
export async function loadTextFaults(base: string, io?: Fetch): Promise<TextFaults | null> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return await readTextFaults((name, args) => client.call(name, args));
  } catch {
    return null;
  }
}

/** How long a tab keeps what the record found before it asks the record to walk its words again. */
export const TEXT_FAULTS_KEPT_MS = 10 * 60_000;

/* WHAT EACH RECORD FOUND, AS THIS TAB LAST ASKED IT, by the record's address: the answer, or the read still out. */
const heldFaults = new Map<string, { at: number; found: Promise<TextFaults | null> }>();

/**
 * What the record at `base` found, asked at most once in `TEXT_FAULTS_KEPT_MS` for the tab, and never a second time while
 * a read is out.
 *
 * THE WALK HOLDS THE RECORD. `textFaults` reads every page and note the reader may open, and the record answers one call
 * at a time: on a record of a few thousand rows it took 11 to 16 seconds, and the version poll, the page read and the
 * briefing asked beside it all waited behind it. Home asked it again each time the record moved, so on a record an agent
 * writes to every few seconds a walk was always out and the page under Today's briefing stayed bars. Asked once and kept,
 * the record moving redraws nothing here; the tile is the board's last and says what a walk found, not what changed since.
 *
 * NONE IS NOT KEPT: a host that dropped the line, or refused, is asked again at the next visit rather than held silent.
 */
export function textFaultsOnce(base: string, io?: Fetch, now: number = Date.now()): Promise<TextFaults | null> {
  const kept = heldFaults.get(base);
  if (kept && now - kept.at < TEXT_FAULTS_KEPT_MS) return kept.found;
  const found = loadTextFaults(base, io);
  const mine = { at: now, found };
  heldFaults.set(base, mine);
  void found.then((f) => {
    if (f === null && heldFaults.get(base) === mine) heldFaults.delete(base);
  });
  return found;
}

/** The first six faults to list, each by its place's own name with the fix and where it opens. None at nought. */
export function faultRows(found: TextFaults | null, known: Known = NOTHING_KNOWN): FaultRow[] {
  if (!found || found.count <= 0) return [];
  return found.faults
    .slice(0, FAULTS_SHOWN)
    .map((f) => ({ title: titleOf(f.where), said: f.said, fix: f.fix, href: placeOf(f, known) }));
}

/** How many there are past the six listed, counted from the record's own count: "and 8 more", or empty. */
export function more(found: TextFaults | null): string {
  const rest = found ? found.count - faultRows(found).length : 0;
  return rest > 0 ? `and ${String(rest)} more` : '';
}

/** The tile's heading: the record's own sentence, else one of its own, and `null` at nought, which draws nothing. */
export function faultLine(found: TextFaults | null): string | null {
  if (!found || found.count <= 0) return null;
  if (found.line !== '') return found.line;
  return found.count === 1 ? 'One thing on your pages needs a fix' : `${String(found.count)} things on your pages need a fix`;
}

/* ── what the pages print raw: every finding, never six ───────────────── */

/**
 * EVERY THING THE PAGES PRINT RAW, one row each (C39, "never hide a fault"): the page's title, the part and what it
 * prints, and a press to the page. The sign beside it carries six, so this list is where the rest are read, and it is
 * never cut: a round reads a few dozen pages, so it is a list a person can read through.
 */
export function printedRows(found: TextFaults | null): FaultRow[] {
  const printed = found?.printed;
  if (!printed) return [];
  return printed.findings.map((f) => ({
    title: f.page,
    said: f.part === '' || same(f.part, f.page) ? f.said : `${f.part}: ${f.said}`,
    fix: '',
    href: f.slug === null ? null : `/p/${encodeURIComponent(f.slug)}`,
  }));
}

/** The heading over them: "20 things on 14 pages print raw", and `null` at none, which draws nothing. */
export function printedLine(found: TextFaults | null): string | null {
  const findings = found?.printed?.findings ?? [];
  if (findings.length === 0) return null;
  const pages = new Set(findings.map((f) => f.page.toLowerCase())).size;
  const things = findings.length === 1 ? 'One thing' : `${String(findings.length)} things`;
  return `${things} on ${pages === 1 ? 'one page' : `${String(pages)} pages`} ${findings.length === 1 ? 'prints' : 'print'} raw`;
}

/** Whether there is anything to list: a fault in the words, or a thing a page prints raw. */
export const anyFound = (found: TextFaults | null): boolean => found !== null && (found.count > 0 || (found.printed?.findings.length ?? 0) > 0);

/** What the round did not read, said under the list: pages not reached, and blocks read only in part. */
export function printedLeft(found: TextFaults | null): string[] {
  const printed = found?.printed;
  if (!printed || printed.findings.length === 0) return [];
  const unread = printed.unread > 0 ? [`${printed.unread === 1 ? 'One more page was' : `${String(printed.unread)} more pages were`} not reached last night.`] : [];
  return [...unread, ...printed.cut];
}
