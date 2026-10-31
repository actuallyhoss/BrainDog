/**
 * THE ONE PLACE THE FIRST RUN READS WHAT IS ON OFFER: the use cases and modules this build ships, and the use cases the
 * host's catalogue serves as data beside them.
 *
 * TWO READERS, ONE OFFER. The model is handed `offerOf` (each use case's id, title and summary, each module's lists and
 * the fields an entry from typed words can fill), and the rules are handed `heardOf` (each catalogue use case with the
 * words it is heard in and the modules it stands on, the `catalogue` hook of `ProposeContext`). The compiled lists stand
 * under both, so a host whose catalogue serves nothing, or one that does not read, offers exactly what this build ships.
 *
 * THE CATALOGUE IS READ ONCE, WITH NO SESSION, from the index the host serves at `/catalogue/index.json`: an entry of
 * kind `usecase` that says its `signals` and `modules`. One without signals is passed over, since nothing typed could
 * ever point at it, and one whose id this build already ships is too, since the compiled words already listen for it.
 *
 * Loaded by the start and sign-up routes only, never by the app shell: the shell's entry script carries none of this.
 */

import { AGENTS_PACK } from '@braindog/seed/packs';
import { MODULE_ORDER, USE_CASES } from '@braindog/seed/usecases';
import { moduleName } from '@braindog/seed/usecases/names';

import type { Offer } from '../shape.ts';
import type { SetupOffer } from './ask.ts';
import { FILLABLE, listsOf } from './lists.ts';

/** One use case the catalogue serves as data: its front, the words it is heard in, and the modules it stands on. */
export type CatalogueUsecase = { id: string; title: string; summary: string; signals: readonly string[]; modules: readonly string[] };
export type CatalogueOffer = { usecases: readonly CatalogueUsecase[] };

/** Where the web build's own catalogue is served, under the app's base. */
export const CATALOGUE_INDEX_AT = '/catalogue/index.json';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const SHIPPED: ReadonlySet<string> = new Set([...USE_CASES.map((u) => u.usecase), ...MODULE_ORDER]);

/**
 * The catalogue's use cases a sentence may be read into: NONE BEYOND WHAT THIS BUILD SHIPS (audit 31 Oct h, AH8, his
 * call). Every use case the catalogue serves beside the built-in starters is an add-on's front (Photographer, Retainer
 * hours, Landlord), and "I freelance as a designer and track my clients" installed two of them, a Shoots page and a
 * Timesheets page called Clients, because "clients" is one of their words. A sentence installs a starter and the
 * first-party modules; an add-on is found by name in the store. The catalogue is still read, so a later call can say
 * which add-ons a sentence named without installing them.
 */
const added = (_catalogue: CatalogueOffer | null | undefined): CatalogueUsecase[] => [];

/** The catalogue's use cases this build does not ship, each heard in at least one word: what a sentence named, by id. */
export const namedAddons = (catalogue: CatalogueOffer | null | undefined): CatalogueUsecase[] => {
  const seen = new Set<string>();
  const out: CatalogueUsecase[] = [];
  for (const u of catalogue?.usecases ?? []) {
    if (SHIPPED.has(u.id) || seen.has(u.id) || u.signals.length === 0) continue;
    seen.add(u.id);
    out.push(u);
  }
  return out;
};

/**
 * WHAT THE MODEL MAY CHOOSE FROM: every use case and every module this build ships, then each catalogue use case. The
 * agents' lists are offered by name only, since an agent writes what goes in them and nothing a person types about
 * themselves does.
 */
export function offerOf(catalogue?: CatalogueOffer | null): SetupOffer {
  return {
    usecases: [
      ...USE_CASES.map((u) => ({ id: u.usecase, title: u.title, summary: u.summary })),
      ...added(catalogue).map((u) => ({ id: u.id, title: u.title, summary: u.summary })),
    ],
    modules: MODULE_ORDER.map((id) => ({
      id,
      name: moduleName(id),
      lists:
        id === AGENTS_PACK.manifest.id ? [] : listsOf(id).map((l) => ({ id: l.id, name: l.name, fields: l.fields.filter((f) => FILLABLE.has(f.type)).map((f) => f.id) })),
    })),
  };
}

/** WHAT THE RULES LISTEN FOR beyond the bundled modules: each catalogue use case as an offer, its words and its modules. */
export const heardOf = (catalogue?: CatalogueOffer | null): Offer[] => added(catalogue).map((u) => ({ id: u.id, signals: u.signals, modules: u.modules }));

const words = (x: unknown, most: number): string[] =>
  Array.isArray(x) ? [...new Set(x.filter((w): w is string => typeof w === 'string').map((w) => w.trim().toLowerCase()).filter((w) => w !== '' && w.length <= 80))].slice(0, most) : [];

const text = (x: unknown, most: number): string => (typeof x === 'string' ? [...x.trim()].slice(0, most).join('') : '');

/** One index entry as a catalogue use case, or `null` for an add-on, a use case with no words, or one that does not read. */
function usecaseOf(e: unknown): CatalogueUsecase | null {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return null;
  const x = e as Record<string, unknown>;
  if (x.kind !== 'usecase' || typeof x.id !== 'string' || !ID.test(x.id)) return null;
  const signals = words(x.signals, 64);
  if (signals.length === 0) return null;
  const title = text(x.title, 80);
  if (title === '') return null;
  return { id: x.id, title, summary: text(x.summary, 280), signals, modules: words(x.modules, 32).filter((m) => ID.test(m)) };
}

/** What an index body offers, or `null` when it is not an index at all. */
export function catalogueOfferOf(doc: unknown): CatalogueOffer | null {
  if (typeof doc !== 'object' || doc === null || !Array.isArray((doc as { entries?: unknown }).entries)) return null;
  return { usecases: (doc as { entries: unknown[] }).entries.flatMap((e) => usecaseOf(e) ?? []) };
}

let once: Promise<CatalogueOffer | null> | null = null;

/**
 * THE HOST'S CATALOGUE, READ ONCE PER PAGE with no session: no cookie goes with it, since a stranger at sign-up has none
 * and a person at the first run needs none for what is public. A fetch that fails, a status that is not a success and a body
 * that is not an index each answer `null`, and the compiled lists stand. A `send` handed in is a test's, and is not kept.
 */
export function readCatalogueOffer(send?: typeof fetch, at = CATALOGUE_INDEX_AT): Promise<CatalogueOffer | null> {
  if (send === undefined && once !== null) return once;
  const read = (async (): Promise<CatalogueOffer | null> => {
    try {
      const res = await (send ?? globalThis.fetch)(at, { credentials: 'omit', headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      return catalogueOfferOf(await res.json());
    } catch {
      return null;
    }
  })();
  if (send === undefined) once = read;
  return read;
}
