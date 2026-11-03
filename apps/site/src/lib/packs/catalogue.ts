/**
 * The pack catalogue as the site draws it: which listings are public, what a card says, and each pack's
 * pages turned into the dialect `lib/app/Page.svelte` draws.
 *
 * THE SHAPES ARE WRITTEN OUT HERE AND NOT IMPORTED. The catalogue is `@braindog/declare/catalogue`'s
 * (`CatalogueIndex`, format 1, and `Preview`), but the site depends on no workspace package but the
 * renderer and the skin, and the `graph` gate holds it to that, so it reads the files at build time
 * (`read.server.ts`) and checks only the fields it draws. A field it does not know is ignored, and an
 * entry missing one it needs is left off the page rather than drawn half.
 *
 * PURE AND NODE-LOADABLE: no `node:` module, no `$lib`, so a test can import it as it is.
 */

import { packs as copy } from '../copy/packs.ts';
import { isIconName, type IconName } from '../icons.ts';

const w = copy.packs;

/* ── The catalogue's shapes, the fields this site reads ─────────────────────────────────────── */

export const CATEGORIES = ['made-by-braindog', 'ways-of-working', 'modules', 'templates', 'connectors', 'doors', 'automations', 'blocks', 'themes'] as const;
export type Category = (typeof CATEGORIES)[number];
const isCategory = (v: unknown): v is Category => typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);

export type Reach = {
  lists: string[];
  pages: string[];
  rules: string[];
  examples: number;
  hosts: string[];
  /** The modules it needs first, by id. */
  modules: string[];
  /** The skills it teaches agents, by id. */
  skills: string[];
  /** Today cards it ships for the sheet, by title. */
  widgets: string[];
  /** Lists or roles a part of it waits for. */
  waits: string[];
  /** Places of yours it reads or changes, read from the file (`uses`). */
  uses: { id: string; writes: boolean }[];
  /** Each call out as the plan says it (`calls_out[].line`). */
  calls: string[];
};

export type Version = {
  version: string;
  published_at: string;
  bump: 'major' | 'minor' | 'patch' | null;
  reach: Reach;
  notes?: string;
  yanked?: { reason: string };
  preview?: true;
  /** The operator listed it after review. */
  reviewed?: true;
  /** Its author signed it with their key. */
  signed?: true;
};

export type Entry = {
  kind: 'pack' | 'usecase';
  id: string;
  title: string;
  summary: string;
  author: string;
  license: string;
  latest: string;
  versions: Version[];
  categories: Category[];
  publisher: string | null;
  /** Who the catalogue knows published it: BrainDog itself, an author key, or a signed-in person. */
  publisherKind: 'braindog' | 'key' | 'person' | null;
  /** The catalogue's id for that publisher, which a page never shows. */
  publisherId: string | null;
  unlisted: boolean;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

function reachOf(v: unknown): Reach {
  const r = isObject(v) ? v : {};
  const calls = Array.isArray(r['calls_out']) ? r['calls_out'] : [];
  const lines = calls.map((c) => (isObject(c) ? str(c['line']) : null)).filter((l): l is string => l !== null && l !== '');
  /* EVERY HOST A CALL NAMES, not only its first: a line may say three ("calendar.google.com, outlook.office365.com and
     outlook.live.com"), and `host` keeps the first alone. */
  const hosts = [
    ...calls.map((c) => (isObject(c) ? str(c['host']) : null)).filter((h): h is string => h !== null && h !== ''),
    ...lines.flatMap((l) => hostsIn(l)),
  ];
  const used = Array.isArray(r['uses']) ? r['uses'] : [];
  return {
    lists: strings(r['lists']),
    pages: strings(r['pages']),
    rules: strings(r['rules']),
    examples: typeof r['examples'] === 'number' ? r['examples'] : 0,
    hosts: [...new Set(hosts)],
    modules: strings(r['modules']),
    skills: strings(r['skills']),
    widgets: strings(r['widgets']),
    waits: strings(r['waits']),
    uses: used.flatMap((u) => {
      const id = isObject(u) ? str(u['id']) : null;
      return id === null || !isObject(u) ? [] : [{ id, writes: u['writes'] === true }];
    }),
    calls: lines,
  };
}

/** The hosts a plan's call line names: `CALLS OUT a.com, b.com and c.com · every 1h · ...`. */
function hostsIn(line: string): string[] {
  const m = /^CALLS OUT (.+?)(?: · |$)/u.exec(line);
  if (!m) return [];
  return (m[1] ?? '')
    .split(/, | and /u)
    .map((h) => h.trim())
    .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/u.test(h));
}

function versionOf(v: unknown): Version | null {
  if (!isObject(v)) return null;
  const version = str(v['version']);
  const published_at = str(v['published_at']);
  if (version === null || published_at === null) return null;
  const declared = v['bump'];
  const bump = declared === 'major' || declared === 'minor' || declared === 'patch' ? declared : null;
  const notes = str(v['notes']);
  const withdrawn = v['yanked'];
  const yanked = isObject(withdrawn) ? { reason: str(withdrawn['reason']) ?? '' } : null;
  return {
    version,
    published_at,
    bump,
    reach: reachOf(v['reach']),
    ...(notes !== null && notes.trim() !== '' ? { notes: notes.trim() } : {}),
    ...(yanked ? { yanked } : {}),
    ...(v['preview'] === true ? { preview: true as const } : {}),
    ...(typeof v['reviewed'] === 'string' ? { reviewed: true as const } : {}),
    ...(isObject(v['signature']) ? { signed: true as const } : {}),
  };
}

function entryOf(v: unknown): Entry | null {
  if (!isObject(v)) return null;
  const named = v['kind'];
  const kind = named === 'pack' || named === 'usecase' ? named : null;
  const id = str(v['id']);
  const title = str(v['title']);
  const latest = str(v['latest']);
  if (kind === null || id === null || title === null || latest === null || !/^[a-z0-9][a-z0-9-]*$/u.test(id)) return null;
  const listed = v['versions'];
  const versions = (Array.isArray(listed) ? listed : []).map(versionOf).filter((x): x is Version => x !== null);
  if (versions.length === 0) return null;
  const by = v['publisher'];
  const publisher = isObject(by) ? str(by['name']) : null;
  const who = isObject(by) ? by['kind'] : null;
  const publisherKind = who === 'braindog' || who === 'key' || who === 'person' ? who : null;
  const categories = v['categories'];
  return {
    kind,
    id,
    title,
    summary: str(v['summary']) ?? '',
    author: str(v['author']) ?? '',
    license: str(v['license']) ?? '',
    latest,
    versions,
    categories: Array.isArray(categories) ? categories.filter(isCategory) : [],
    publisher,
    publisherKind,
    publisherId: isObject(by) ? str(by['id']) : null,
    unlisted: v['unlisted'] === true,
  };
}

/** The entries of a catalogue `index.json` (format 1), each checked for the fields drawn; anything else is none. */
export function entriesOf(doc: unknown): Entry[] {
  const entries = isObject(doc) && doc['format'] === 1 ? doc['entries'] : null;
  return Array.isArray(entries) ? entries.map(entryOf).filter((e): e is Entry => e !== null) : [];
}

/**
 * The version a stranger is offered: the newest one not withdrawn, as `offeredVersion` in the catalogue
 * module picks it (the index lists versions newest first). `null` when every one is withdrawn.
 */
export const offered = (e: Entry): Version | null => e.versions.find((v) => v.yanked === undefined) ?? null;

/**
 * WHAT IS PUBLIC: in the index, not `unlisted`, and with a version nobody withdrew. An
 * unlisted pack is installable by its address in the app and is never named here.
 */
export const isPublic = (e: Entry): boolean => !e.unlisted && offered(e) !== null;

/**
 * The address segment of a listing. A pack's is its id; a use case's is `usecase-<id>`, the name a record
 * holds it under (`installedIdOf`), so a pack and a use case sharing an id never share a page.
 */
export const slugOf = (e: Pick<Entry, 'kind' | 'id'>): string => (e.kind === 'usecase' ? `usecase-${e.id}` : e.id);

/**
 * Where the app installs it: `/addons/<id>?kind=...` on the app's name, the store's own listing in the signed-in
 * person's BrainDog, which shows the plan and asks before it writes. `kind` always rides along, because the app reads a
 * listing with none as a use case.
 */
export const installPath = (app: string, e: Pick<Entry, 'kind' | 'id'>): string => `${app}/addons/${encodeURIComponent(e.id)}?kind=${e.kind}`;

/**
 * THE BUNDLED CATALOGUE AND THE KENNEL'S INDEX AS ONE LIST. The bundled one is the build's own (BrainDog's add-ons, as
 * this deploy ships them), so for an entry both hold it is the one drawn; the Kennel adds every entry the bundled one
 * lacks, which is every add-on somebody else published. Bundled order first, then the Kennel's.
 */
export function mergeEntries(bundled: readonly Entry[], kennel: readonly Entry[]): Entry[] {
  const key = (e: Pick<Entry, 'kind' | 'id'>): string => `${e.kind}:${e.id}`;
  const have = new Set(bundled.map(key));
  return [...bundled, ...kennel.filter((e) => !have.has(key(e)))];
}

/* ── Who made it ────────────────────────────────────────────────────────────────────────────── */

/** An author's address segment: their name as words joined by hyphens, `braindog` for BrainDog. */
export const whoSlug = (name: string): string =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'someone';

/**
 * Every author with at least one public listing: their address, their name, and whether it is BrainDog. Two publishers
 * whose names make the same address share it only when they are the same publisher; the second is told apart by its kind.
 */
export function authorsOf(entries: readonly Entry[]): { slug: string; name: string; ours: boolean; key: string }[] {
  const out = new Map<string, { slug: string; name: string; ours: boolean; key: string }>();
  const taken = new Map<string, string>();
  for (const e of entries.filter(isPublic)) {
    const name = e.publisher ?? e.author;
    if (name.trim() === '') continue;
    const key = publisherKeyOf(e);
    if (out.has(key)) continue;
    let slug = whoSlug(name);
    if (taken.has(slug) && taken.get(slug) !== key) slug = `${slug}-${e.publisherKind ?? 'author'}`;
    taken.set(slug, key);
    out.set(key, { slug, name, ours: e.publisherKind === 'braindog', key });
  }
  return [...out.values()];
}

/** Who published an entry, as one key: the catalogue's kind and id when it knows them, else the author line. */
export const publisherKeyOf = (e: Entry): string =>
  e.publisherKind !== null && e.publisherId !== null ? `${e.publisherKind}:${e.publisherId}` : `author:${e.publisher ?? e.author}`;

/* ── Trust and asks ─────────────────────────────────────────────────────────────────────────── */

export type Trust = 'braindog' | 'reviewed' | 'signed' | 'unreviewed';

/** How far a listing is trusted, as the record says it (`trustOfEntry` in `packages/record/src/methods/addons.ts`). */
export function trustOf(e: Entry): Trust {
  const v = offered(e);
  if (e.publisherKind === 'braindog') return 'braindog';
  if (v?.reviewed === true) return 'reviewed';
  if (v?.signed === true) return 'signed';
  return 'unreviewed';
}

/** A list, a page or a figure id as words: `register.money_goals` is "the money goals list". */
const placeWords = (id: string): string => {
  const at = id.indexOf('.');
  const kind = at === -1 ? '' : id.slice(0, at);
  const words = (at === -1 ? id : id.slice(at + 1)).replace(/[_-]+/gu, ' ');
  return kind === 'register' ? `the ${words} list` : kind === 'page' ? `the ${words} page` : kind === 'metric' ? `the ${words} figure` : words;
};

/**
 * A plan's call line as a person reads it: `CALLS OUT a.com · every 1h · key "X" to the host its keychain entry opens`
 * is `Calls a.com every 1h, with your key "X".` A line in another shape is said as it is, less its capitals.
 */
export function callSaid(line: string): string {
  const parts = line.split(' · ').map((p) => p.trim());
  const head = parts[0] ?? '';
  if (!head.startsWith('CALLS OUT ')) return line;
  const hosts = head.slice('CALLS OUT '.length);
  const when = parts.find((p) => /^every /u.test(p));
  const key = parts.map((p) => /^key "([^"]+)"/u.exec(p)?.[1]).find((k) => k !== undefined);
  return `Calls ${hosts}${when ? ` ${when}` : ''}${key ? `, with your key "${key}"` : ''}.`;
}

/**
 * WHAT IT ASKS FOR OF YOURS, in the lines the app and an agent read before installing (`reachLines` in
 * `packages/record/src/methods/addons.ts`), word for word but for the call lines, said plainly here (`callSaid`). The
 * site imports nothing from the record, so the frames are written out again; change both together.
 */
export function asksOf(r: Reach): string[] {
  const out: string[] = [];
  const names = (all: readonly string[]): string => all.map((n) => nameOf(n) || n).join(', ');
  if (r.modules.length > 0) out.push(`Needs ${r.modules.join(', ')} installed first.`);
  if (r.lists.length > 0) out.push(`Adds ${r.lists.length === 1 ? 'a list' : `${r.lists.length} lists`}: ${names(r.lists)}.`);
  if (r.pages.length > 0) out.push(`Adds ${r.pages.length === 1 ? 'a page' : `${r.pages.length} pages`}: ${names(r.pages)}.`);
  const reads = r.uses.filter((u) => !u.writes).map((u) => placeWords(u.id));
  const writes = r.uses.filter((u) => u.writes).map((u) => placeWords(u.id));
  if (writes.length > 0) out.push(`Changes yours: ${writes.join(', ')}.`);
  if (reads.length > 0) out.push(`Reads yours: ${reads.join(', ')}.`);
  if (r.rules.length > 0) out.push(`Runs ${r.rules.length === 1 ? 'an automation' : `${r.rules.length} automations`} while nobody is looking.`);
  for (const c of r.calls) out.push(callSaid(c));
  if (r.skills.length > 0) out.push(`Teaches your agents: ${r.skills.join(', ')}.`);
  if (r.widgets.length > 0) out.push(`Today cards to add: ${r.widgets.join(', ')}.`);
  if (r.waits.length > 0) out.push(`Some parts wait until you hold: ${r.waits.join(', ')}.`);
  if (r.examples > 0) out.push(`Starts with ${r.examples} example ${r.examples === 1 ? 'entry' : 'entries'}.`);
  return out;
}

/* ── Install counts ─────────────────────────────────────────────────────────────────────────── */

/** The steps a count is said at, highest first: `COUNT_STEPS` in `packages/declare/src/kennel.ts`. */
const COUNT_STEPS = [1000, 500, 100, 50, 10] as const;

/** A count as every reader says it, `roundCount` in the Kennel's module: rounded down, and `null` under ten. */
export const roundCount = (n: number): number | null => (Number.isFinite(n) ? (COUNT_STEPS.find((step) => n >= step) ?? null) : null);

/**
 * The Kennel's `counts.json` (`{ at, counts: Record<'<kind>:<id>', number> }`), rounded, with every count
 * under ten left out, so a page can only ever say a figure the Kennel would say. Anything else is none.
 */
export function countsOf(doc: unknown): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  const raw = isObject(doc) ? doc['counts'] : undefined;
  if (!isObject(raw)) return out;
  for (const [key, n] of Object.entries(raw)) {
    const said = typeof n === 'number' ? roundCount(n) : null;
    if (said !== null) out.set(key, said);
  }
  return out;
}

/* ── Words ──────────────────────────────────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * A day as a person reads it, "28 Sep 2026", in UTC. Always with its year: the page is prerendered, so a
 * relative "3d ago" would be true only on the day it was built.
 */
export function dayOf(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(iso);
  if (!m) return '';
  const month = MONTHS[Number.parseInt(m[2] ?? '', 10) - 1];
  return month === undefined ? '' : `${Number.parseInt(m[3] ?? '', 10)} ${month} ${m[1]}`;
}

/** A list, page or rule id as a name: `cash_counts` is "Cash counts". The catalogue keeps ids, and ids are never shown. */
export function nameOf(id: string): string {
  /* A page made from a template is named by what fills it, `{{name}}`, which only a record knows. */
  if (id.includes('{{')) return '';
  const words = id.replace(/^(register|page|rule)\./u, '').replace(/[_-]+/gu, ' ').trim();
  return words === '' ? '' : `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`;
}

const joined = (all: readonly string[]): string => {
  const names = all.filter((n) => n !== '');
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
};

/** The glyph a listing is drawn with: its first page's own icon when the site has that glyph, else its category's. */
const CATEGORY_GLYPH: Record<Category, IconName> = {
  'made-by-braindog': 'layers',
  'ways-of-working': 'task',
  modules: 'rows',
  templates: 'layers',
  connectors: 'plug',
  doors: 'mail',
  automations: 'refresh',
  blocks: 'board',
  themes: 'layers',
};

export function glyphOf(e: Entry, pageIcon: string | null): IconName {
  if (pageIcon !== null && isIconName(pageIcon)) return pageIcon;
  const first = e.categories.find((c) => c !== 'made-by-braindog');
  return first === undefined ? 'layers' : CATEGORY_GLYPH[first];
}

/* ── A card ─────────────────────────────────────────────────────────────────────────────────── */

export type Card = {
  slug: string;
  /** The author's page, `/addons/by/<who>`. */
  who: string;
  trust: Trust;
  /** A use case sets up a whole way of working; a pack adds to one. */
  kind: Entry['kind'];
  title: string;
  summary: string;
  publisher: string;
  /**
   * MADE BY BRAINDOG, said only when the catalogue says BrainDog published it (`publisher.kind`), never because the
   * author line reads "BrainDog": anybody can type that into a file, and only the catalogue knows who sent it.
   */
  ours: boolean;
  version: string;
  glyph: IconName;
  categories: Category[];
  /** What it adds, said on the card as one line: "2 lists", "1 page", "1 outside service". */
  adds: string[];
  installs: number | null;
  /** Everything search reads, lower case: title, summary, who made it, its categories as said. */
  find: string;
};

/**
 * One card. `who` is the author's address from `authorsOf`, which tells two authors of one name apart; left out, it is
 * made from the name.
 */
export function cardOf(e: Entry, counts: ReadonlyMap<string, number>, pageIcon: string | null, who?: string): Card | null {
  const v = offered(e);
  if (v === null || e.unlisted) return null;
  const publisher = e.publisher ?? e.author;
  const r = v.reach;
  const adds = [
    ...(r.lists.length ? [w.lists(r.lists.length)] : []),
    ...(r.pages.length ? [w.pages(r.pages.length)] : []),
    ...(r.rules.length ? [w.rules(r.rules.length)] : []),
    ...(r.hosts.length ? [w.services(r.hosts.length)] : []),
  ];
  const categories = e.categories;
  return {
    slug: slugOf(e),
    who: who ?? whoSlug(publisher),
    trust: trustOf(e),
    kind: e.kind,
    title: e.title,
    summary: e.summary,
    publisher,
    ours: e.publisherKind === 'braindog',
    version: v.version,
    glyph: glyphOf(e, pageIcon),
    categories,
    adds,
    installs: counts.get(`${e.kind}:${e.id}`) ?? null,
    find: [e.title, e.summary, publisher, ...categories.map((c) => w.categories[c])].join(' ').toLowerCase(),
  };
}

/** Whether a card answers a search: every word typed appears somewhere in what it says. */
export function matches(card: Pick<Card, 'find'>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/u).filter((s) => s !== '');
  return words.every((word) => card.find.includes(word));
}

/**
 * The category filters: each category at least one card is in, with its count, in `CATEGORIES`' order.
 *
 * "MADE BY BRAINDOG" IS NOT ONE. It says who made an add-on, not what it does, and every card already says that in its
 * own foot, so as a segment beside "Use cases" and "Lists" it would only repeat "All" while BrainDog makes them all.
 */
export function filtersOf(cards: readonly Pick<Card, 'categories'>[]): { category: Category; name: string; count: number }[] {
  return CATEGORIES.filter((c) => c !== 'made-by-braindog').flatMap((category) => {
    const count = cards.filter((c) => c.categories.includes(category)).length;
    return count === 0 ? [] : [{ category, name: w.categories[category], count }];
  });
}

/* ── One pack's page ────────────────────────────────────────────────────────────────────────── */

/**
 * What one version changed, in a sentence: the author's own notes when there are any, else what it added
 * or dropped against the version before, else what its declared bump means. The oldest is the first release.
 */
export function changeOf(versions: readonly Version[], at: number): string {
  const v = versions[at];
  if (v === undefined) return '';
  if (v.notes !== undefined) return v.notes;
  const before = versions[at + 1];
  if (before === undefined) return w.detail.first;
  /* Lists, pages and hosts by name. A rule's name is the sentence it says, too long to list in a line. */
  const names = (r: Reach): string[] => [...r.lists, ...r.pages].map(nameOf).concat(r.hosts).filter((n) => n !== '');
  const had = new Set(names(before.reach));
  const has = new Set(names(v.reach));
  const added = [...has].filter((n) => !had.has(n));
  const dropped = [...had].filter((n) => !has.has(n));
  const told = [...(added.length ? [w.detail.added(joined(added))] : []), ...(dropped.length ? [w.detail.dropped(joined(dropped))] : [])];
  if (told.length) return told.join(' ');
  return v.bump === null ? '' : w.detail.bumps[v.bump];
}

/* ── Dialect: what `Page.svelte` draws ──────────────────────────────────────────────────────── */

/**
 * One cell of a dialect row, safe to write between pipes: a pipe and a backslash escaped as `splitRow`
 * reads them (`packages/render/src/parse.ts`), and a line break flattened, because a row is one line and
 * a fence line inside a cell would end the block.
 */
export const cell = (text: string): string => text.replace(/[\r\n]+/gu, ' ').replace(/~{3,}|`{3,}/gu, '').replace(/[\\|]/gu, (c) => `\\${c}`).trim();

/** A sentence written between fences, which the renderer draws as prose: one line, and no fence inside it. */
const line = (text: string): string => text.replace(/[\r\n]+/gu, ' ').replace(/~{3,}|`{3,}/gu, '').trim();

/** A heading on a fence's info line, where a pipe would start a second heading cell and a tone could be read. */
const heading = (text: string): string => cell(text).replace(/\\\|/gu, '/');

/** The most figures a `stat` takes: its `rows` in `packages/render/src/kinds.ts`. More is a degraded fence. */
const STAT_ROWS = 6;

const fence = (kind: string, head: string, rows: readonly (readonly string[])[]): string =>
  [`~~~${kind}${head === '' ? '' : ` | ${heading(head)}`}`, ...rows.map((r) => r.map(cell).join(' | ')), '~~~'].join('\n');

/**
 * A drawing of what a version adds, for a pack with no preview: one `stat` figure for each kind of thing
 * it brings, its count the figure and the names under it. A pack that adds nothing to open says so.
 */
export function addsSrc(r: Reach): string {
  const d = w.detail;
  const rows = [
    ...(r.lists.length ? [[d.addsLists, String(r.lists.length), joined(r.lists.map(nameOf))]] : []),
    ...(r.pages.length ? [[d.addsPages, String(r.pages.length), joined(r.pages.map(nameOf))]] : []),
    ...(r.rules.length ? [[d.addsRules, String(r.rules.length), '']] : []),
    ...(r.hosts.length ? [[d.addsHosts, String(r.hosts.length), joined(r.hosts)]] : []),
    ...(r.examples > 0 ? [[d.addsExamples, String(r.examples), '']] : []),
  ];
  return rows.length === 0 ? line(d.addsNothing) : fence('stat', d.adds, rows.slice(0, STAT_ROWS));
}

/** A ULID, the id every row carries, which a person never reads. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/u;

/** A field's value as a table cell says it: text as written, a day as a day, a list joined, an id or an object as nothing. */
function said(v: unknown): string {
  if (typeof v === 'string') return ULID.test(v) ? '' : ISO_DAY.test(v) ? dayOf(v) : v;
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('en-US') : '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(said).filter((s) => s !== '').join(', ');
  return '';
}

/** At most this many rows of a list are drawn in a preview: enough to show its shape, never a wall. */
const PREVIEW_ROWS = 8;

/**
 * One block of a preview's `PageAnswer` as dialect, or `null` for one this page cannot draw faithfully.
 *
 * A LIST (a `table`, `roadmap`, `board` and the like) carries its `columns` and the rows the scratch record
 * held, so it becomes a `comparison`, the literal table, headed by the columns' labels, with the list's own
 * empty sentence under it when there are no rows. A FIGURE (`stat`) carries `readings`, each a label and a
 * value, and stays a `stat`. Any other kind is left out rather than guessed at.
 */
export function blockSrc(b: unknown): string | null {
  if (!isObject(b)) return null;
  const head = str(b['heading']) ?? '';
  const declared = b['columns'];
  const columns = (Array.isArray(declared) ? declared : [])
    .map((c) => {
      const field = isObject(c) ? str(c['field']) : null;
      /* A column with no label of its own is headed by its field's name, as the app heads it. */
      return field === null || !isObject(c) ? null : { field, label: str(c['label']) ?? nameOf(field) };
    })
    .filter((c): c is { field: string; label: string } => c !== null);
  if (columns.length > 0) {
    const held = b['rows'];
    const rows = (Array.isArray(held) ? held : []).slice(0, PREVIEW_ROWS).map((r) => {
      const inner = isObject(r) ? r['fields'] : null;
      const fields = isObject(inner) ? inner : {};
      return columns.map((c) => said(fields[c.field]));
    });
    const table = fence('comparison', head, [columns.map((c) => c.label), ...rows]);
    const empty = str(b['empty']);
    return rows.length === 0 && empty !== null && empty.trim() !== '' ? `${table}\n\n${line(empty)}` : table;
  }
  const readings = b['readings'];
  if (Array.isArray(readings)) {
    const given = b['values'];
    const values = isObject(given) ? given : {};
    const fill = (note: string): string => note.replace(/\{\{([\w-]+)\}\}/gu, (_, k: string) => said(values[k]));
    const rows = readings.slice(0, STAT_ROWS).flatMap((r) => {
      if (!isObject(r)) return [];
      const read = r['reading'];
      const reading = isObject(read) ? read : {};
      const n = reading['value'];
      const unit = str(reading['unit']);
      const value = typeof n === 'number' ? `${unit === null ? '' : `${unit} `}${n.toLocaleString('en-US')}` : '';
      return [[str(r['label']) ?? '', value, fill(str(r['note']) ?? '')]];
    });
    return rows.length === 0 ? null : fence(b['lead'] === true ? 'stat lead' : 'stat', head, rows);
  }
  return null;
}

/** One page of a preview: its title, its icon, and its blocks as the dialect `Page.svelte` draws. */
export type PreviewPage = { title: string; icon: string | null; src: string };

/**
 * A `.preview.json` file (`Preview`, format 1) as pages to draw, each page's blocks in its own order. A
 * page none of whose blocks can be drawn is dropped; a file of another shape, or with nothing to draw, is none.
 */
export function previewOf(doc: unknown): { made: string; pages: PreviewPage[] } | null {
  const answers = isObject(doc) && doc['format'] === 1 ? doc['pages'] : null;
  if (!isObject(doc) || !Array.isArray(answers)) return null;
  const pages = answers.flatMap((p) => {
    if (!isObject(p)) return [];
    const drawn = p['blocks'];
    const blocks = (Array.isArray(drawn) ? drawn : []).map(blockSrc).filter((s): s is string => s !== null);
    if (blocks.length === 0) return [];
    return [{ title: str(p['title']) ?? '', icon: str(p['icon']), src: blocks.join('\n\n') }];
  });
  return pages.length === 0 ? null : { made: str(doc['made_at']) ?? '', pages };
}
