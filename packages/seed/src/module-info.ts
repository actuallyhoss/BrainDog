/**
 * The modules this build ships, as a person knows them, read off their own manifests and documents: a name, a line about
 * what each is for, its version, the lists and pages it brings, what it cannot install without, and the words the first
 * run hears it in.
 *
 * IT REPLACES A HAND COPY. `apps/web/src/lib/record/modules.ts` wrote the six modules out again, a third time beside the
 * seed and the first run's lexicon, and had drifted: it said Money was at 1.4.0 and brought one list, when the pack it
 * named was at 3.1.0 and brought nine. Everything here is computed from what the pack declares, so a list a module gains
 * is on its card the day it is declared.
 *
 * AGENTS' WORDS ARE KEPT HERE, because its manifest is written in `packs/agents.ts` as a plain `PackManifest` and the
 * other five carry theirs in `packs/first-party.ts` `SIGNALS`. Both reach the first run through `firstPartyModules()`
 * alone.
 *
 * COMPUTED ONCE AND ON FIRST ASK, because `packs/first-party.ts` re-exports through `index.ts` and reads it back: a
 * value computed when this file loads would run before the declarations it reads exist, and splitting the starter
 * into its packs is not work to repeat on every screen that wants a module's name.
 *
 * NOT UNDER `packs/`, because that folder holds only what a record is built from (`agents.ts`, `first-party.ts`), and
 * this is a module's own card for a screen (the directory test in `packs/rates-poll/rates-poll.test.ts`).
 */

import { FIRST_PARTY_LISTS } from '@braindog/declare';

import { MODULE_ORDER } from './usecases/index.ts';
import { MODULE_NAMES } from './usecases/names.ts';
import { AGENTS_PACK, agentsPackDocument } from './packs/agents.ts';
import { FIRST_PARTY, FIRST_PARTY_ICONS, firstPartyDocument, firstPartyManifest } from './packs/first-party.ts';

export type ModuleInfo = {
  id: string;
  /** What a person calls it: Money, not `money-core`. */
  name: string;
  /** The pack document's own summary. */
  blurb: string;
  version: string;
  author: string;
  /** The lists it declares, by id. */
  registers: readonly string[];
  /** The pages it declares, by id. */
  pages: readonly string[];
  /**
   * Of those, the pages drawn for each row of a list (a declaration with `for`, titled `{{name}}`): a person's page, an
   * organisation's. They are not pages a person opens by name, so a screen listing what a module adds leaves them out.
   */
  rowPages: readonly string[];
  /** What each of its lists and pages is called, by id. */
  titles: Readonly<Record<string, string>>;
  /** The other modules it cannot install without, read off the lists its manifest requires. */
  leans: readonly string[];
  /** Lower-case words and short phrases a person uses for what it keeps. */
  signals: readonly string[];
  /** The icon it wears in the store and the installed list, a name from the app's icon set. */
  icon: string;
};

/** The words the first run hears Agents in. */
export const AGENTS_SIGNALS: readonly string[] = ['claude', 'codex', 'cursor', 'agent', 'agents', 'ai', 'mcp', 'llm', 'llms', 'copilot', 'chatgpt'];

type Body = Record<string, unknown>;

/** The module that brings each required list, less the module itself. */
const leansOf = (id: string, requires: readonly string[]): string[] => [
  ...new Set(requires.flatMap((r) => {
    const owner = FIRST_PARTY_LISTS.get(r.replace(/^register\./u, ''));
    return owner === undefined || owner === id ? [] : [owner];
  })),
];

/** One module's card, from its document and manifest. */
function infoOf(id: string, doc: Body, version: string, requires: readonly string[], signals: readonly string[], icon: string): ModuleInfo {
  const declarations = Array.isArray(doc.declarations) ? (doc.declarations as Body[]) : [];
  const registers: string[] = [];
  const pages: string[] = [];
  const rowPages: string[] = [];
  const titles: Record<string, string> = {};
  for (const d of declarations) {
    /* A RULE, A SCRIPT OR A PATTERN may name the list it acts on with `register`, and is not a list itself. */
    if (typeof d.rule === 'string' || typeof d.script === 'string' || typeof d.ingest === 'string') continue;
    if (typeof d.register === 'string') {
      registers.push(d.register);
      if (typeof d.name === 'string') titles[d.register] = d.name;
    } else if (typeof d.page === 'string') {
      pages.push(d.page);
      if (typeof d.for === 'object' && d.for !== null) rowPages.push(d.page);
      if (typeof d.title === 'string') titles[d.page] = d.title;
    }
  }
  return {
    id,
    name: MODULE_NAMES[id] ?? id,
    blurb: typeof doc.summary === 'string' ? doc.summary : '',
    version,
    author: typeof doc.author === 'string' ? doc.author : 'BrainDog',
    registers,
    pages,
    rowPages,
    titles,
    leans: leansOf(id, requires),
    signals,
    icon,
  };
}

let known: readonly ModuleInfo[] | null = null;

/** Every module this build ships, in install order. */
export function firstPartyModules(): readonly ModuleInfo[] {
  if (known !== null) return known;
  const five = FIRST_PARTY.map((id) => {
    const manifest = firstPartyManifest(id);
    return infoOf(id, firstPartyDocument(id, { seeds: [] }) ?? {}, manifest.version, manifest.requires, manifest.signals, FIRST_PARTY_ICONS[id]);
  });
  const agents = infoOf('agents', agentsPackDocument(), AGENTS_PACK.manifest.version, AGENTS_PACK.manifest.requires, AGENTS_SIGNALS, 'skill');
  const all = [...five, agents];
  known = MODULE_ORDER.flatMap((id) => all.filter((m) => m.id === id));
  return known;
}

/** The module this build ships with `id`, or `undefined` for a use case's pack or anybody else's. */
export const firstPartyModule = (id: string): ModuleInfo | undefined => firstPartyModules().find((m) => m.id === id);

/** The module that declares the list `register`, or `undefined` for a list no module brings. */
export const moduleOfList = (register: string): ModuleInfo | undefined => firstPartyModules().find((m) => m.registers.includes(register));
