/**
 * One listing model for everything a record can add: the modules this build ships,
 * its built-in use cases, and every entry the Kennel answers. Browse, an add-on's detail page, /packs' updates and the
 * first run's offer all read `listingsOf`, so a thing is called, counted and sorted the same way wherever it is drawn.
 *
 * SYNCHRONOUS AND PURE. The Kennel's index and its counts are read by the caller (`routes/packs/browse/catalogue.ts`
 * `readHostCatalogue`, `counts.ts` `readCounts`) and handed in, so a test hands in a plain object, and nothing here
 * carries the declare package or the kernel into the first chunk of a screen that only wants names. The two sums it
 * needs (a version compared, a bump named) are done here in a few lines for that reason; `@braindog/declare/catalogue`
 * `compareVersions` and `declaredBump` are the same rule, and the Kennel's own bumps are read as it computed them.
 *
 * A BUILT-IN WINS ITS ID. The Kennel's merged index already lets the bundled catalogue win an id (`mergeIndexes`), and a
 * built-in use case is this build's own file, so a Kennel use case under a built-in's id is left out here rather than
 * drawn as a second card with the same link.
 */

import type { CatalogueEntry, CatalogueIndex, CatalogueVersion, Category, Reach, Shelf } from '@braindog/declare/catalogue';
import { MODULE_CHANGES } from '@braindog/seed/packs/changelog';
import { firstPartyModules } from '@braindog/seed/packs/modules';
import { USE_CASES } from '@braindog/seed/usecases';
import { USE_CASE_CHANGES, installsOf } from '@braindog/seed/usecases/share';

import { updatesFromStore } from '@braindog/declare';
import type { PackState } from '../record/packs.ts';

export type ListingKind = 'module' | 'usecase' | 'pack';

export type Listing = {
  key: `${ListingKind}:${string}`;
  kind: ListingKind;
  id: string;
  /** The pack id a record holds it under: a use case's is `usecase-<id>`. */
  installedId: string;
  title: string;
  summary: string;
  author: string;
  license: string;
  categories: Category[];
  publisher: CatalogueEntry['publisher'] | null;
  source: 'bundled' | 'kennel' | 'file';
  /** The version offered to install: the newest that is not taken back. */
  latest: string;
  /** Newest first. A module's and a built-in use case's carry no checksum, bytes or signature: nothing publishes them. */
  versions: CatalogueVersion[];
  /** How many records hold it, rounded (`counts.ts`), or `null` below ten. */
  count: number | null;
  /** The icon the add-on's manifest names from the app's icon set; absent draws the generic one. */
  icon?: string;
  /** The store shelf the catalogue puts it on (`packs/listed.json`); absent, the store works one out (`shelves.ts`). */
  shelf?: Shelf;
  /** A starter shown as an example setup, for a trade BrainDog does not run itself. */
  example?: true;
};

/** What a listing's one primary button does on this record. */
export type Action = { kind: 'install' } | { kind: 'update'; from: string; to: string } | { kind: 'turn-on' } | { kind: 'installed' } | { kind: 'taken' };

/** The order browse draws in. */
export type Order = 'for-you' | 'installed' | 'newest';

export const listingKey = (kind: ListingKind, id: string): Listing['key'] => `${kind}:${id}`;

/** A detail page's address for a listing: the route keeps `?kind=`, whose default is `usecase` so old links still open. */
export const listingHref = (l: Pick<Listing, 'kind' | 'id'>): string => `/plugins/${encodeURIComponent(l.id)}${l.kind === 'usecase' ? '' : `?kind=${l.kind}`}`;

/* ── the two sums ───────────────────────────────────────────────────────── */

const partsOf = (v: string): [number, number, number] | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/u.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** Below zero when `a` is older than `b`, zero when the same, above when newer. A version that does not read sorts first. */
export function compareVersion(a: string, b: string): number {
  const x = partsOf(a);
  const y = partsOf(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

const bumpOf = (from: string, to: string): CatalogueVersion['bump'] => {
  const x = partsOf(from);
  const y = partsOf(to);
  if (!x || !y) return null;
  return y[0] !== x[0] ? 'major' : y[1] !== x[1] ? 'minor' : 'patch';
};

/** A version nothing published: a module's or a built-in use case's, with its notes and the bump from the one after it. */
function bundledVersions(shipped: string, notes: readonly { version: string; notes: string }[], reach: Reach): CatalogueVersion[] {
  const said = notes.some((n) => n.version === shipped) ? [...notes] : [{ version: shipped, notes: '' }, ...notes];
  return said.map((n, i) => {
    const before = said[i + 1];
    return {
      version: n.version,
      checksum: '',
      bytes: 0,
      published_at: '',
      bump: before ? bumpOf(before.version, n.version) : null,
      reach,
      ...(n.notes === '' ? {} : { notes: n.notes }),
    };
  });
}

const NO_REACH: Reach = { modules: [], lists: [], pages: [], rules: [], examples: 0, skills: [], calls_out: [] };

/** The newest version that is not taken back, or the newest at all when every one is. */
const offered = (versions: readonly CatalogueVersion[], fallback: string): string => versions.find((v) => v.yanked === undefined)?.version ?? fallback;

/* ── the listings ───────────────────────────────────────────────────────── */

/**
 * Every listing, bundled first. `counts` are the Kennel's counts already rounded by `readCounts` (a raw count is never
 * drawn), keyed `<kind>:<id>`.
 */
export function listingsOf(input: { kennel: CatalogueIndex | null; counts: Record<string, number> | null }): Listing[] {
  const counted = (key: string): number | null => input.counts?.[key] ?? null;
  const braindog: Listing['publisher'] = { kind: 'braindog', id: 'braindog', name: 'BrainDog' };

  const modules = firstPartyModules().map((m): Listing => {
    const reach: Reach = { ...NO_REACH, modules: [...m.leans], lists: m.registers.map((r) => m.titles[r] ?? r), pages: m.pages.map((p) => m.titles[p] ?? p) };
    const versions = bundledVersions(m.version, MODULE_CHANGES[m.id as keyof typeof MODULE_CHANGES] ?? [], reach);
    return {
      key: listingKey('module', m.id),
      kind: 'module',
      id: m.id,
      installedId: m.id,
      title: m.name,
      summary: m.blurb,
      author: m.author,
      /* EVERY FIRST-PARTY DOCUMENT SAYS MIT (`first-party.ts`, `agents.ts`), and `ModuleInfo` does not carry it. */
      license: 'MIT',
      categories: ['made-by-braindog', 'modules'],
      publisher: braindog,
      source: 'bundled',
      latest: m.version,
      versions,
      count: counted(listingKey('module', m.id)),
      icon: m.icon,
    };
  });

  const usecases = USE_CASES.map((u): Listing => {
    const installs = installsOf(u);
    const reach: Reach = { ...NO_REACH, modules: installs.modules, lists: installs.lists, pages: installs.pages.map((p) => p.title), examples: installs.examples, skills: installs.skills.map((s) => s.name) };
    return {
      key: listingKey('usecase', u.usecase),
      kind: 'usecase',
      id: u.usecase,
      installedId: `usecase-${u.usecase}`,
      title: u.title,
      summary: u.summary,
      author: u.author,
      license: u.license,
      categories: ['made-by-braindog', 'ways-of-working'],
      publisher: braindog,
      source: 'bundled',
      latest: u.version,
      /* WHAT EACH VERSION CHANGED, so an update offered to a record on an older one says what it brings (`changes.ts`). */
      versions: bundledVersions(u.version, USE_CASE_CHANGES[u.usecase] ?? [], reach),
      count: counted(listingKey('usecase', u.usecase)),
      ...iconOfStarter(u.usecase, u.icon),
    };
  });

  const taken = new Set<string>([...modules, ...usecases].map((l) => l.key));
  /* AN UNLISTED ENTRY INSTALLS BY ID AND IS LEFT OUT OF EVERY LISTING, and so is one with every version yanked, which
     offers nothing to install (`listedEntries` in the catalogue, the scope of 24 October). */
  const kennel = (input.kennel?.entries ?? [])
    .filter((e) => e.unlisted !== true && e.versions.some((v) => v.yanked === undefined) && !taken.has(listingKey(e.kind, e.id)))
    .map((e) => listingOfEntry(e, counted(listingKey(e.kind, e.id))));

  /* ONE LISTING PER THING (the scope of 24 October): a use case and the add-on it stands on shared a title
     ("Landlord" twice), and two add-ons were both "Mercury". The first of a title is kept, a module before a use case
     before an add-on, so the thing is offered once, by the door that installs all of it. Each kind keeps its order. */
  const seen = new Set<string>();
  const kinds = [...kennel.filter((l) => l.kind !== 'pack'), ...kennel.filter((l) => l.kind === 'pack')];
  return [...modules, ...usecases, ...kinds].filter((l) => {
    const said = l.title.trim().toLowerCase();
    if (seen.has(said)) return false;
    seen.add(said);
    return true;
  });
}

/**
 * BRAINDOG'S OWN PICK FOR EACH STARTER IT SHIPS, where its file names no icon (1 Nov): the starters' cards in the store
 * all wore the same grid, so Personal, Solo founder, Shop and Small business looked alike. A file's own `icon` wins.
 */
export const STARTER_ICONS: Readonly<Record<string, string>> = {
  personal: 'wallet',
  founder: 'rocket',
  business: 'briefcase',
  shop: 'store',
  student: 'graduation-cap',
  studies: 'book-open',
  team: 'users',
  'team-board': 'square-kanban',
  'new-project': 'milestone',
  guide: 'compass',
  landlord: 'house',
  photographer: 'camera',
  'retainer-hours': 'clock',
};

/** A starter's icon: its file's, else BrainDog's pick, else none (the generic one is drawn). */
function iconOfStarter(id: string, own: string | undefined): { icon?: string } {
  const icon = own ?? STARTER_ICONS[id];
  return icon === undefined ? {} : { icon };
}

/** One catalogue entry as a listing, with its rounded count. */
function listingOfEntry(e: CatalogueEntry, count: number | null): Listing {
  return {
    key: listingKey(e.kind, e.id),
    kind: e.kind,
    id: e.id,
    installedId: e.kind === 'usecase' ? `usecase-${e.id}` : e.id,
    title: e.title,
    summary: e.summary,
    author: e.author,
    license: e.license,
    categories: [...(e.categories ?? [])],
    publisher: e.publisher ?? null,
    source: 'kennel',
    latest: offered(e.versions, e.latest),
    versions: e.versions,
    count,
    ...(e.kind === 'usecase' ? iconOfStarter(e.id, e.icon) : e.icon !== undefined ? { icon: e.icon } : {}),
    ...(e.shelf !== undefined ? { shelf: e.shelf } : {}),
    ...(e.example === true ? { example: true as const } : {}),
  };
}

/**
 * An entry the catalogue leaves out of every listing (`unlisted`) by its id, and its kind when one is said, for the page
 * an address names: it installs by id, so the page that installs it says what it is. `null` for one listed (that is
 * `listingsOf`'s), one with every version taken back, or none by that id.
 *
 * MEASURED ON THE LIVE RECORD: a question asking to install an add-on the catalogue holds unlisted could only be
 * proposed again, and the add-on's own address under Browse said there was nothing by that name.
 */
export function unlistedListing(index: CatalogueIndex | null, id: string, kind: ListingKind | null): Listing | null {
  const e = (index?.entries ?? []).find((x) => x.unlisted === true && x.id === id && (kind === null || x.kind === kind) && x.versions.some((v) => v.yanked === undefined));
  return e ? listingOfEntry(e, null) : null;
}

/** The Kennel's entry behind a listing, for the trust and file reads only a catalogue entry has. */
export const entryOf = (index: CatalogueIndex | null, l: Pick<Listing, 'kind' | 'id' | 'source'>): CatalogueEntry | null =>
  l.source === 'kennel' && l.kind !== 'module' ? (index?.entries.find((e) => e.kind === l.kind && e.id === l.id) ?? null) : null;

/** The version a listing offers, whole. */
export const latestOf = (l: Pick<Listing, 'versions' | 'latest'>): CatalogueVersion | null => l.versions.find((v) => v.version === l.latest) ?? l.versions[0] ?? null;

/** Whether a listing's newest offered version is vouched for: signed by its author, or reviewed by the operator. */
export const verifiedOf = (l: Pick<Listing, 'versions' | 'latest' | 'source'>): 'signed' | 'reviewed' | 'braindog' | null => {
  if (l.source === 'bundled') return 'braindog';
  const v = latestOf(l);
  return v?.signature ? 'signed' : v?.reviewed ? 'reviewed' : null;
};

/** The hosts a listing's newest version would call out to, each once. */
export const hostsOf = (l: Pick<Listing, 'versions' | 'latest'>): string[] => [...new Set((latestOf(l)?.reach.calls_out ?? []).map((c) => c.host ?? '').filter((h) => h !== ''))];

/* ── where this record stands ───────────────────────────────────────────── */

/** The one thing a listing's button does here: install, update, turn on, or nothing because it is in. */
export function actionOf(l: Pick<Listing, 'installedId' | 'latest'>, states: readonly PackState[]): Action {
  const held = states.find((s) => s.id === l.installedId);
  if (!held) return { kind: 'install' };
  /* ONE OF THEIR OWN BY THIS ID (`updatesFromStore`): the store's is a different add-on, never its update. */
  if (!updatesFromStore(held.source)) return { kind: 'taken' };
  if (held.disabled_at !== null) return { kind: 'turn-on' };
  if (held.version !== null && compareVersion(held.version, l.latest) < 0) return { kind: 'update', from: held.version, to: l.latest };
  return { kind: 'installed' };
}

/* ── search and order ───────────────────────────────────────────────────── */

/**
 * The listings a search matches, best first, scored as `searchCatalogue` scores: a word in the id or title counts twice,
 * one in the summary, author, publisher, a category, or a list or page it adds counts once, and a word found nowhere
 * leaves the listing out. An empty search keeps every listing in the order given.
 */
export function searchListings(listings: readonly Listing[], query: string, categoryWords: (c: Category) => string = (c) => c.split('-').join(' ')): Listing[] {
  const found = query.toLowerCase().split(/\s+/u).filter((w) => w !== '');
  if (found.length === 0) return [...listings];
  const scored = listings.map((l, i) => {
    const reach = latestOf(l)?.reach;
    const head = `${l.id} ${l.title}`.toLowerCase();
    const body = [l.summary, l.author, l.publisher?.name ?? '', ...l.categories.flatMap((c) => [c, categoryWords(c)]), ...(reach?.lists ?? []), ...(reach?.pages ?? [])].join(' ').toLowerCase();
    return { l, i, score: found.reduce((n, w) => n + (head.includes(w) ? 2 : body.includes(w) ? 1 : -100), 0) };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((s) => s.l);
}

/** The categories that lead browse when nothing is searched, in this order. */
export const LEADING: readonly Category[] = ['made-by-braindog', 'ways-of-working'];

const KIND_ORDER: Record<ListingKind, number> = { usecase: 0, module: 1, pack: 2 };

/** A listing's rank by the categories that lead: BrainDog's own use cases first, then the rest of its own, then everything. */
const leadOf = (l: Listing): number => (l.categories.includes('made-by-braindog') ? (l.categories.includes('ways-of-working') ? 0 : 1) : l.categories.includes('ways-of-working') ? 2 : 3);

/** When a listing's newest version was published, for Newest; a bundled one has no date and sorts after dated ones. */
const publishedOf = (l: Listing): string => latestOf(l)?.published_at ?? '';

/**
 * Listings in an order. "For you" leads with what leads browse and then by kind; "Most installed" by the rounded count,
 * uncounted last; "Newest" by the newest version's date. Each breaks a tie by title, so a redraw never reshuffles.
 */
export function ordered(listings: readonly Listing[], order: Order, lead = true): Listing[] {
  const byTitle = (a: Listing, b: Listing) => a.title.localeCompare(b.title);
  const rest = (a: Listing, b: Listing) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || byTitle(a, b);
  const sorted = [...listings];
  if (order === 'installed') sorted.sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || rest(a, b));
  else if (order === 'newest') sorted.sort((a, b) => publishedOf(b).localeCompare(publishedOf(a)) || rest(a, b));
  else sorted.sort((a, b) => (lead ? leadOf(a) - leadOf(b) : 0) || rest(a, b));
  return sorted;
}
