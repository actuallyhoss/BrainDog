/**
 * What a host offers to install by proposal: the first-party packs and the starter use cases
 * (`loop/research-spark.md` S12).
 *
 * THE HOST'S, BECAUSE THE RECORD NAMES NO USE CASE. The record reads this list to tell an agent what is on offer
 * and to plan what a `pack` or `arrange` proposal would install; it never installs from it until the owner accepts.
 * The self-host and the Worker hand in this one list, so an update carries progress forward on both.
 *
 * NO EXAMPLE ROWS FROM A BARE MODULE. A first-party pack asked for by itself carries none, because its own
 * examples are the sample studio's and would land in somebody else's record. A use case carries its own, and a module
 * installed for a use case carries that use case's examples, exactly as onboarding installs it (`install.ts`).
 */

import { FIRST_PARTY_LISTS, packIdOf } from '@braindog/declare';

import { AGENTS_PACK, agentsPackDocument } from '../packs/agents.ts';
import { FIRST_PARTY, firstPartyDocument, firstPartyManifest, type FirstPartyId } from '../packs/first-party.ts';
import { GUIDE_GROWS } from './guide.ts';
import { MODULE_ORDER, USE_CASES, modulesFor, useCase, useCaseDocument } from './index.ts';
import { moduleDocument } from './install.ts';
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
  /** The version `doc` builds, so a pack on at an older one is offered as an update without building a document. */
  version?: string;
  doc: (options: { holds: readonly string[]; usecase?: string | null }) => Record<string, unknown> | null;
  afterInstall?: (io: LinkIo) => Promise<unknown>;
  carry?: (io: CarryIo, from: string) => Promise<number>;
  /** The skills a use case names for agents, which Spark offers once it is on. */
  skills?: readonly { name: string; trigger: string }[];
  /** What a use case grows into once the figures it names say so, which Spark asks about on Decide (`@braindog/record` `Grows`). */
  grows?: { when: readonly { metric: string; gt?: number; gte?: number; lt?: number; lte?: number; is?: number }[]; install: readonly string[]; question: string; why: string };
};

/** What each use case grows into, by its id. The guide, once its idea stage is over, into Projects and Work. */
const GROWS: Readonly<Record<string, NonNullable<SeedCatalogueEntry['grows']>>> = { guide: GUIDE_GROWS };

const today = (): string => new Date().toISOString().slice(0, 10);

/** The first-party packs that must be in before a pack needing `requires`, every one they need too, in install order. */
function before(requires: readonly string[]): string[] {
  const wanted = new Set<string>();
  const visit = (register: string) => {
    const pack = FIRST_PARTY_LISTS.get(register.replace(/^register\./u, ''));
    if (!pack || wanted.has(pack)) return;
    wanted.add(pack);
    for (const r of firstPartyManifest(pack as FirstPartyId).requires) visit(r);
  };
  for (const r of requires) visit(r);
  return MODULE_ORDER.filter((id) => wanted.has(id));
}

/** The first-party packs, each with no example rows, and the use cases that carry a pack of their own. */
export function seedCatalogue(): SeedCatalogueEntry[] {
  const modules: SeedCatalogueEntry[] = FIRST_PARTY.map((id) => {
    const bare = firstPartyDocument(id, { seeds: [] });
    return {
      id,
      kind: 'pack',
      title: id,
      summary: typeof bare?.summary === 'string' ? bare.summary : '',
      modules: before(firstPartyManifest(id).requires).filter((m) => m !== id),
      version: firstPartyManifest(id).version,
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
    version,
    /* THE LISTS THE RECORD HOLDS, so an update keeps a list the older version declared (`useCaseDocument`). */
    doc: ({ holds }) => useCaseDocument(u.usecase, today(), holds),
    /* A SEED CARRIES NO LINK (42 §5.2), so the use case's examples are pointed at each other once they are in (`links.ts`). */
    afterInstall: (io) => linkExamples(io, u.usecase),
    /* AN UPDATE FROM BEFORE A VERSION THAT READS WHAT IS LOGGED moves what was typed into the log (`links.ts`). */
    carry: (io, from) => carryForward(io, u.usecase, from, today()),
    skills: u.skills,
    ...(GROWS[u.usecase] ? { grows: GROWS[u.usecase] } : {}),
  }));
  return [
    ...modules,
    { id: 'agents', kind: 'pack', title: 'agents', summary: String(agents.summary ?? ''), modules: before(AGENTS_PACK.manifest.requires), version: AGENTS_PACK.manifest.version, doc: () => agentsPackDocument() },
    ...useCases,
  ];
}
