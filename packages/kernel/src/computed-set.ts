/**
 * The computed sources as data (SHL-A18 job 2): every source a block may name in place of a list, each with the block
 * kind it draws as, so the web asks for "computed, draws as forecast" and spells no source id
 * (`apps/web/src/lib/page/BlockSlot.svelte` named the walk's source twice).
 *
 * READ OFF THE TABLE, NEVER WRITTEN BESIDE IT. The sources are `SOURCE_MODULES` (`sources/index.ts`), and a source added
 * there is in this set the moment it is registered, with no line here. What it draws as is, in order:
 *   - what the module itself says (`drawsAs` on the module, when one carries it);
 *   - the walk ahead, `WALK_SOURCE`, which draws as a forecast, the figure kind every walk is read by;
 *   - the kind the shipped pages draw the module by, held below against the module itself and not its name, so a
 *     source renamed in the table keeps its kind and this file spells no id;
 *   - else a table, the kind every source's rows can be drawn as.
 *
 * PURE: no record read. `boot` serves it as it is (a blocked line in `packages/record/src/index.ts`).
 */
import { WALK_SOURCE } from './money-figures.ts';
import { SOURCE_MODULES, type Source } from './sources/index.ts';
import { activity } from './sources/activity.ts';
import { figuresHome } from './sources/figures-home.ts';
import { governanceLater, governanceOpen } from './sources/governance.ts';
import { sessionsLive } from './sources/sessions-live.ts';
import { sessionsWorking } from './sources/sessions-working.ts';

/** One computed source, by the name a block's `source:` says, and the block kind it draws as. */
export type Computed = { source: string; drawsAs: string };

/** The kind a source's rows are drawn as when nothing says otherwise. */
const TABLE = 'table';

/**
 * The kinds the shipped pages draw these modules by: what changed is a feed, what waits on a person a queue, the home
 * figures stat tiles, and the runs live and working cards. Every other source is drawn as a table.
 */
const DRAWN_AS: ReadonlyMap<Source, string> = new Map<Source, string>([
  [activity, 'feed'],
  [governanceOpen, 'queue'],
  [governanceLater, 'queue'],
  [figuresHome, 'stat'],
  [sessionsLive, 'cards'],
  [sessionsWorking, 'cards'],
]);

/** What a module says it draws as, when it carries a word of its own. */
const ownKind = (module: Source): string | null => {
  const said = (module as { drawsAs?: unknown }).drawsAs;
  return typeof said === 'string' && said !== '' ? said : null;
};

/** Every registered computed source, once each, in the table's order, with the kind it draws as. */
export function computedSet(): Computed[] {
  return Object.entries(SOURCE_MODULES).map(([source, module]) => ({
    source,
    drawsAs: ownKind(module) ?? (source === WALK_SOURCE ? 'forecast' : (DRAWN_AS.get(module) ?? TABLE)),
  }));
}

/**
 * The source a block asks for by the kind it draws as: the one computed source that draws as `drawsAs`, or `null` when
 * none does or more than one does, since a kind two sources draw as names neither of them.
 */
export function computedFor(drawsAs: string, set: readonly Computed[] = computedSet()): string | null {
  const found = set.filter((c) => c.drawsAs === drawsAs);
  return found.length === 1 ? found[0]!.source : null;
}
