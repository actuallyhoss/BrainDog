/**
 * What a host offers to install by proposal: the first-party packs and the starter use cases.
 *
 * THE HOST'S, BECAUSE THE RECORD NAMES NO USE CASE. The record reads this list to tell an agent what is on offer
 * and to plan what a `pack` or `arrange` proposal would install; it never installs from it until the owner accepts.
 * The self-host and the Worker hand in this one list, so an update carries progress forward on both.
 *
 * NO EXAMPLE ROWS, FROM ANYTHING ON OFFER. A first-party pack carries none, because its
 * own examples are the sample studio's and would land in somebody else's record; a module installed for a use case
 * carries none, exactly as onboarding installs it (`moduleDocument` in `install.ts`); and a use case's pack is offered
 * without its own, so a record an agent arranges holds only what somebody wrote. What a use case forms around what the
 * owner said is its `forms`, which the record fills from the model and puts on Decide, not a seed.
 */

import { FIRST_PARTY_LISTS, packIdOf } from '@braindog/declare';

import { AGENTS_PACK, agentsPackDocument } from '../packs/agents.ts';
import { AGENTS_SKILLS } from '../packs/agents-skills.ts';
import { FIRST_PARTY, firstPartyDocument, firstPartyManifest, type FirstPartyId } from '../packs/first-party.ts';
import { AGENTS_SIGNALS } from '../module-info.ts';
import { GUIDE_FORMS, GUIDE_GROWS, GUIDE_NEXT } from './guide.ts';
import { MODULE_ORDER, USE_CASES, modulesFor, useCase, useCaseDocument } from './index.ts';
import { fitted, moduleDocument, withoutRows } from './install.ts';
import { carryForward, linkExamples, type CarryIo, type LinkIo } from './links.ts';

/**
 * One thing on offer, in the shape `@braindog/record`'s `CatalogueEntry` takes. SPELT HERE AND NOT IMPORTED, because the
 * record sits above the seed in the stack (`docs/31-STACK.md` §2); a host that hands this list to the record checks the two agree.
 */
export type SeedCatalogueEntry = {
  id: string;
  kind: 'pack' | 'usecase';
  title: string;
  summary: string;
  modules: readonly string[];
  /** `false` for what is installed and never offered: core, which every record holds (`@braindog/record` `CatalogueEntry`). */
  offered?: false;
  /**
   * The words a person uses for what it keeps, which the first run listens for: a pack's from its
   * manifest, a use case's its own `signals`.
   */
  signals?: readonly string[];
  /** The version `doc` builds, so a pack on at an older one is offered as an update without building a document. */
  version?: string;
  doc: (options: { holds: readonly string[]; usecase?: string | null }) => Record<string, unknown> | null;
  afterInstall?: (io: LinkIo) => Promise<unknown>;
  carry?: (io: CarryIo, from: string) => Promise<number>;
  /**
   * The skills a use case names for agents, or an add-on ships, which Slash offers once it is on. ONE THAT SHIPS ITS TEXT
   * carries `body` and `rev` (and `was`, the texts it replaced), and is offered with that text, written by the record
   * (`managed`), so a newer `rev` reaches every record still holding an older one as it was shipped.
   */
  skills?: readonly { name: string; trigger: string; what?: string; body?: string; rev?: number; was?: readonly string[] }[];
  /** What a use case grows into once the figures it names say so, which Slash asks about on Decide (`@braindog/record` `Grows`). */
  grows?: { when: readonly { metric: string; gt?: number; gte?: number; lt?: number; lte?: number; is?: number }[]; install: readonly string[]; question: string; why: string };
  /** The first plan a model may form for what the owner said (`@braindog/record` `FormSpec`). */
  forms?: {
    what: string;
    question: string;
    why: string;
    lists: readonly {
      register: string;
      least: number;
      most: number;
      fields: Readonly<Record<string, ({ text: number } | { one: readonly string[] } | { link: string } | { days: number }) & { required?: boolean }>>;
      first?: Readonly<Record<string, unknown>>;
      rest?: Readonly<Record<string, unknown>>;
      position?: string;
    }[];
  };
  /** What moves on when a row of a use case's list is reached (`@braindog/record` `NextSpec`). */
  next?: { register: string; field: string; from: string; to: string; order: string; setting: string; question: string; note: string };
};

/** What each use case grows into, by its id. The guide, once its idea stage is over, into Projects and Work. */
const GROWS: Readonly<Record<string, NonNullable<SeedCatalogueEntry['grows']>>> = { guide: GUIDE_GROWS };

/** What each use case forms around what the owner said, and what moves on in it, by its id. */
const FORMS: Readonly<Record<string, NonNullable<SeedCatalogueEntry['forms']>>> = { guide: GUIDE_FORMS };
const NEXT: Readonly<Record<string, NonNullable<SeedCatalogueEntry['next']>>> = { guide: GUIDE_NEXT };

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * The first-party packs that must be in before a pack needing `requires`, every one they need too, in install order.
 *
 * AGENTS IS ASKED ITS OWN MANIFEST. `FIRST_PARTY_LISTS` answers `agents` for `skills`, `credentials`, `learnings` and
 * `tools`, and `firstPartyManifest` knows only the five modules split from the starter, so the cast below used to hand
 * it `agents` and it threw `Cannot read properties of undefined (reading 'declarations')`
 * (`test/catalogue-before.test.ts`). Nothing pointed at an agents list yet, which is all that kept the catalogue up.
 */
export function before(requires: readonly string[]): string[] {
  const wanted = new Set<string>();
  const visit = (register: string) => {
    const pack = FIRST_PARTY_LISTS.get(register.replace(/^register\./u, ''));
    if (!pack || wanted.has(pack)) return;
    wanted.add(pack);
    const needs = pack === 'agents' ? AGENTS_PACK.manifest.requires : firstPartyManifest(pack as FirstPartyId).requires;
    for (const r of needs) visit(r);
  };
  for (const r of requires) visit(r);
  return MODULE_ORDER.filter((id) => wanted.has(id));
}

/** The first-party packs, each with no example rows, and the use cases that carry a pack of their own. */
export function seedCatalogue(): SeedCatalogueEntry[] {
  /* CORE IS NEVER OFFERED: it is on every record, and is not an add-on. IT IS CARRIED ALL THE SAME, marked `offered: false`,
     because every use case installs it first (`modulesFor`) and the first run's `setup` names it: left out, every use case
     and every first run on a host was refused "There is no add-on called core on offer here". */
  const modules: SeedCatalogueEntry[] = FIRST_PARTY.map((id) => {
    const bare = firstPartyDocument(id, { seeds: [] });
    return {
      id,
      kind: 'pack',
      ...(id === 'core' ? { offered: false as const } : {}),
      title: id,
      summary: typeof bare?.summary === 'string' ? bare.summary : '',
      modules: before(firstPartyManifest(id).requires).filter((m) => m !== id),
      version: firstPartyManifest(id).version,
      signals: firstPartyManifest(id).signals,
      doc: ({ holds, usecase }) => {
        const u = usecase ? useCase(usecase) : undefined;
        const doc = u ? moduleDocument(u, id, { today: today(), holds }) : firstPartyDocument(id, { holds, seeds: [] });
        if (doc && Array.isArray(doc.seeds) && doc.seeds.length === 0) delete doc.seeds;
        return doc;
      },
    };
  });
  const agents = agentsPackDocument();
  const useCases: SeedCatalogueEntry[] = USE_CASES.flatMap((u) => {
    const version = useCaseDocument(u.usecase)?.version;
    return typeof version === 'string' ? [{ u, version }] : [];
  }).map(({ u, version }) => ({
    id: packIdOf(u.usecase),
    kind: 'usecase',
    title: u.title,
    summary: u.summary,
    modules: modulesFor(u),
    signals: u.signals,
    version,
    /* THE LISTS THE RECORD HOLDS, so an update keeps a list the older version declared (`useCaseDocument`), and none of
       the use case's example rows. */
    /* AND CUT TO THEM (`fitted`): a use case that says `needs` goes in with only what it stands on (`modules`
       above), so a page or a link over a module it does not stand on goes in without that list, as `usecase` installs a
       file, rather than refusing the arrangement REGISTER_UNRESOLVED. A record that holds every list reads the whole. */
    doc: ({ holds }) => {
      const doc = useCaseDocument(u.usecase, today(), holds);
      return doc ? fitted(withoutRows(doc), new Set(holds)) : null;
    },
    /* A SEED CARRIES NO LINK (42 §5.2), so the use case's examples are pointed at each other once they are in (`links.ts`). */
    afterInstall: (io) => linkExamples(io, u.usecase),
    /* AN UPDATE FROM BEFORE A VERSION THAT READS WHAT IS LOGGED moves what was typed into the log (`links.ts`). */
    carry: (io, from) => carryForward(io, u.usecase, from, today()),
    skills: u.skills,
    ...(GROWS[u.usecase] ? { grows: GROWS[u.usecase] } : {}),
    ...(FORMS[u.usecase] ? { forms: FORMS[u.usecase] } : {}),
    ...(NEXT[u.usecase] ? { next: NEXT[u.usecase] } : {}),
  }));
  return [
    ...modules,
    { id: 'agents', kind: 'pack', title: 'agents', summary: String(agents.summary ?? ''), modules: before(AGENTS_PACK.manifest.requires), version: AGENTS_PACK.manifest.version, signals: AGENTS_SIGNALS, doc: ({ holds }) => agentsPackDocument({ holds }), skills: AGENTS_SKILLS },
    ...useCases,
  ];
}
