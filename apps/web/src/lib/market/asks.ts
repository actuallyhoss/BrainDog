/**
 * What an add-on asks to use of yours, in plain words: the store's detail page, the plan sheet before Install and the
 * publish form all say it from the same file, so nobody is shown one thing and asked another.
 *
 * READ FROM THE FILE (`@braindog/declare/uses`), never from what its author wrote about it: every list, figure and
 * page of yours it names and does not own, what it sends out and with which key, the scripts it runs and the skills it
 * gives your agents. An add-on cannot reach a place its file does not name, so this is the whole of what it can reach.
 *
 * PURE, so `node --test` reads it. The names come from the caller, who knows what this record calls each list.
 */

import { usesOf, type Use } from '@braindog/declare/uses';

type Body = Record<string, unknown>;
const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const and = (xs: readonly string[]): string => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(xs);

export const asksWords = {
  title: 'What it asks for',
  note: 'An add-on can only use what is named here.',
  reads: (names: readonly string[]): string => `Reads your ${and(names)}`,
  changes: (names: readonly string[]): string => `Reads and changes your ${and(names)}`,
  figures: (names: readonly string[]): string => `Reads your ${names.length === 1 ? 'figure' : 'figures'} ${and(names)}`,
  pages: (names: readonly string[]): string => `Adds to your ${and(names)} ${names.length === 1 ? 'page' : 'pages'}`,
  sends: (hosts: readonly string[]): string => `Sends to ${and(hosts)}`,
  keys: (keys: readonly string[]): string => `Uses your ${keys.length === 1 ? 'key' : 'keys'} ${and(keys)}`,
  scripts: (n: number): string => (n === 1 ? 'Runs 1 script, inside BrainDog' : `Runs ${n} scripts, inside BrainDog`),
  skills: (n: number): string => (n === 1 ? 'Gives your agents 1 skill' : `Gives your agents ${n} skills`),
  views: (names: readonly string[]): string => `Sees your ${and(names)}`,
  nothing: 'Only its own lists. It sends nothing out.',
} as const;

/** A view of the whole record in words, as the line "Sees your …" ends; one this build does not know is its id in words. */
const VIEW_WORDS: Readonly<Record<string, string>> = {
  activity: 'activity across BrainDog',
  'governance.open': 'open questions',
  'handoffs.open': "agents' handoffs",
  'sessions.working': "agents' sessions",
  'sessions.live': "agents' sessions",
  'actions.blocking': 'things waiting on you',
  deadlines: 'deadlines',
};
const viewWords = (id: string): string => VIEW_WORDS[id] ?? id.replaceAll(/[._]+/gu, ' ');

/** The add-on file inside what the page holds: an add-on's own, or a use case file's `pack`. */
export function packDocOf(doc: unknown): Body | null {
  const at = [doc, isMap(doc) ? doc.pack : null, isMap(doc) && isMap(doc.usecase) ? doc.usecase.pack : null].find((d) => isMap(d) && Array.isArray(d.declarations));
  return isMap(at) ? at : isMap(doc) && typeof doc.pack === 'string' ? doc : null;
}

/** The places of yours the file uses, as `@braindog/declare` reads them. */
export const usesIn = (doc: unknown): Use[] => usesOf(packDocOf(doc));

/** Names for what the lines say: a list, a figure or a page by its declaration id, as this record calls it. */
export type Namer = (id: string) => string;

/**
 * Only the places of yours it uses, one line for each way: the lists it changes, the lists it reads, the figures, the
 * pages it adds to and the views of the whole record it sees. What the plan sheet draws before Install, beside the calls it already says one by one.
 */
export function placesLines(doc: unknown, nameOf: Namer): string[] {
  const uses = usesOf(packDocOf(doc));
  const named = (us: readonly Use[]): string[] => [...new Set(us.map((u) => nameOf(u.id)))];
  const lists = uses.filter((u) => u.kind === 'list');
  const lines: string[] = [];
  const changed = named(lists.filter((u) => u.writes));
  const read = named(lists.filter((u) => !u.writes));
  if (changed.length > 0) lines.push(asksWords.changes(changed));
  if (read.length > 0) lines.push(asksWords.reads(read));
  const figures = named(uses.filter((u) => u.kind === 'figure'));
  if (figures.length > 0) lines.push(asksWords.figures(figures));
  const pages = named(uses.filter((u) => u.kind === 'page'));
  if (pages.length > 0) lines.push(asksWords.pages(pages));
  const views = [...new Set(uses.filter((u) => u.kind === 'view').map((u) => viewWords(u.id)))];
  if (views.length > 0) lines.push(asksWords.views(views));
  return lines;
}

/**
 * Each thing it asks for as one line, in this order: the lists it changes, the lists it reads, the figures, the pages it
 * adds to, then where it sends and with which key, its scripts and its agents' skills. Nothing at all when it asks for
 * none of it, and the caller says `asksWords.nothing`. `calls: false` leaves out where it sends and the keys, for a
 * screen that says each call in its own line (`callSaid`).
 */
export function asksLines(doc: unknown, nameOf: Namer, opts: { calls?: boolean } = {}): string[] {
  const pack = packDocOf(doc);
  const lines = placesLines(doc, nameOf);

  const declarations = (pack && Array.isArray(pack.declarations) ? pack.declarations : []).filter(isMap);
  const scripts = declarations.filter((d) => typeof d.script === 'string');
  const fromFile = scripts.flatMap((d) => (Array.isArray(d.egress) ? d.egress : []).map((e) => ({ host: hostOf(str(e)) })));
  const keysInFile = scripts.flatMap((d) => (Array.isArray(d.keys) ? d.keys.map(str) : []));
  if (opts.calls !== false) {
    const hosts = [...new Set(fromFile.map((c) => c.host ?? '').filter((h) => h !== ''))];
    if (hosts.length > 0) lines.push(asksWords.sends(hosts));
    /* A KEY NAMED THROUGH A SETTING IS THE ONE THE PERSON PUTS IN, so only a key with a plain name is said by name. */
    const keys = [...new Set(keysInFile.filter((k) => k !== '' && !k.includes('{{')))];
    if (keys.length > 0) lines.push(asksWords.keys(keys));
  }
  if (scripts.length > 0) lines.push(asksWords.scripts(scripts.length));
  const skills = pack && Array.isArray(pack.skills) ? pack.skills.filter(isMap).length : 0;
  if (skills > 0) lines.push(asksWords.skills(skills));
  return lines;
}

/** An address's host, or the address itself when it does not read as one. */
function hostOf(address: string): string {
  try {
    return new URL(address).host || address;
  } catch {
    return address;
  }
}

/**
 * The file with its `uses` line said, where it uses places of yours and does not say so yet: what the publish form
 * writes, so the Kennel, which holds every submission to its `uses`, takes what the form made, and the download is the
 * same file. A file that says `uses` already, uses nothing, or does not read is handed back exactly as it came.
 */
export function withUses(text: string): string {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return text;
  }
  if (!isMap(doc) || typeof doc.pack !== 'string' || doc.uses !== undefined) return text;
  const uses = usesOf(doc).map((u) => u.id);
  if (uses.length === 0) return text;
  /* SAID AFTER WHAT IT REQUIRES, where a reader looks for what it needs; the order of a manifest's keys means nothing to BrainDog. */
  const out: Body = {};
  for (const [k, v] of Object.entries(doc)) {
    out[k] = v;
    if (k === 'requires') out.uses = uses;
  }
  if (out.uses === undefined) out.uses = uses;
  return `${JSON.stringify(out, null, 2)}\n`;
}
