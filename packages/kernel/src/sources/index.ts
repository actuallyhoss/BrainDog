/**
 * The sources a page may name that are not a list: one module a name, and one line each in the table below.
 *
 * A SOURCE USED TO COST A NAME IN A SET AND AN ARM IN THE READER. `pages.ts` held `COMPUTED`, the names it would not
 * refuse, then a chain of `if (block.source === ...)` arms, one a name, and a third set said which of them read across
 * the whole record. A source registered here is named once: `pages.ts` asks this table whether a word is a source, how
 * it is answered and whether it belongs to no list. The block kinds have had the same since `kinds/index.ts`.
 *
 * ADDING A SOURCE is a file beside this one and a line in the table. No file writes a count of the sources, so adding
 * one never edits a sentence elsewhere.
 *
 * WHAT A SOURCE MODULE MAY IMPORT AT RUN TIME IS A PACKAGE OUTSIDE THE KERNEL OR ANOTHER FILE OF THIS FOLDER, for the
 * reason `kinds/index.ts` gives of a kind: this table is read by `pages.ts`, and is meant to be read by the install's
 * lint in `declare.ts` in place of its own list of the names, which builds while the kernel is still loading. A module
 * that imported `pages.ts` or `metrics.ts` at run time would have the kernel ask for this table before it existed. So a
 * module imports any type from anywhere, and what it needs of `pages.ts` at run time arrives on the kit its `read` is
 * handed (`pages.ts` `SourceKit`). What it needs from the record it reaches through `deps`, as every block does.
 *
 * AND NO MODULE HOLDS A DECLARATION. A source is code that reads what a record holds; a page, a list or a figure
 * written here would be a pack inside the kernel, which `no-declarations-in-kernel` refuses (`02 §1`).
 */

import type { Refusal } from '@braindog/ports';

import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import { actions } from './actions.ts';
import { ACTIONS_BLOCKING, actionsBlocking } from './actions-blocking.ts';
import { activity } from './activity.ts';
import { deadlines } from './deadlines.ts';
import { exceptions } from './exceptions.ts';
import { figuresHome } from './figures-home.ts';
import { forecastRunway } from './forecast-runway.ts';
import { governanceDecided, governanceLater, governanceOpen } from './governance.ts';
import { handoffsOpen } from './handoffs-open.ts';
import { kpisSource } from './kpis.ts';
import { runsOn } from './runs-on.ts';
import { scripts } from './scripts.ts';
import { sessionsLive } from './sessions-live.ts';
import { sessionsWorking } from './sessions-working.ts';
import { signs } from './signs.ts';
import { usageActions, usageDays, usageProjects } from './usage.ts';

/** Every refusal the reader already found on the block, with a source's own after them (`pages.ts` `also`). */
export type Also = (...more: readonly Refusal[]) => Refusal[];

export type Source = {
  /** What the source reads, in one line, for the grammar an agent is handed. */
  says?: string;
  /**
   * Set when the source belongs to no list: it reads across the whole record, so a block over it is named `*` to
   * whoever asks which lists it reads (`pages.ts` `WHOLE_RECORD`), and only a reader of the whole record is shown it.
   * A source whose rows are rows of named lists leaves it off, and `registersOf` names those lists.
   */
  whole?: true;
  /**
   * Set when the source's rows say something of every list the record declares, by name: a block over it is then
   * named as a read of each of them as well (`index.ts` `blockRegisters`), so a reader held from any one list, or
   * narrowed to some of one's rows, is not shown it. `whole` alone names `*`, which a reader with no ceiling passes
   * while one of her lists is held to `append`.
   */
  everyList?: true;
  /**
   * Set when the source is answered before any kind reads the block. A registered kind is asked before the sources
   * are (`kinds/index.ts`), so a source whose answer is the same whatever draws it, or which the kind's own arm would
   * draw empty, says so here and is answered first.
   */
  first?: true;
  /**
   * The block's answer. `base` is the answer with nothing read into it yet, and `also` puts a refusal after the ones
   * the reader already found, so a block that is wrong in two ways says both. A module never throws: what it cannot
   * read is a refusal on the block, and the page around it still draws.
   */
  read(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult;
};

/**
 * The registered sources, by the name a block's `source:` says.
 *
 * A PLAIN OBJECT AND NOT A FROZEN ONE, as `BLOCK_KIND_MODULES` is, so a test can register a stub and read a page
 * through it. Looked up only through `sourceModule`, never by bracket, so a block naming `constructor` finds nothing.
 */
export const SOURCE_MODULES: Record<string, Source> = {
  'forecast.runway': forecastRunway,
  activity,
  'sessions.live': sessionsLive,
  'sessions.working': sessionsWorking,
  actions,
  'governance.open': governanceOpen,
  'governance.later': governanceLater,
  'governance.decided': governanceDecided,
  runs_on: runsOn,
  deadlines,
  'figures.home': figuresHome,
  signs,
  'handoffs.open': handoffsOpen,
  [ACTIONS_BLOCKING]: actionsBlocking,
  exceptions,
  'usage.days': usageDays,
  'usage.actions': usageActions,
  'usage.projects': usageProjects,
  kpis: kpisSource,
  scripts,
};

/** The module that answers `name`, or `undefined` for a word that is no registered source: a list, a figure or nothing. */
export function sourceModule(name: string | undefined): Source | undefined {
  return name !== undefined && Object.hasOwn(SOURCE_MODULES, name) ? SOURCE_MODULES[name] : undefined;
}
