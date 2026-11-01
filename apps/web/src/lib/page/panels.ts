/**
 * What a page's host panel holds, said to the rule that decides what a page draws, before it decides.
 *
 * THE FAULT THIS ANSWERS. An empty part is not drawn, and a part with something in it must not vanish.
 * A boxed section whose panel is the project's scheduled actions is shut with its blocks when they all went
 * (`drawn.ts` `panelHeld`), by what the section's `actions` say it holds. Nothing handed it any: the panel reads its
 * own actions after the page is judged (`BlockSlot.svelte`, `panels/Actions.svelte`), and the record, which judges the
 * page first, cannot see the host's panel at all. So a project with scheduled actions and nothing else under "More
 * about Kiln" lost the panel and its heading.
 *
 * LENT FOR THE JUDGING, AND TAKEN BACK. The page reads the project's actions once (`readHeld`), a section naming the
 * panel is handed them (`withActions`), the rule judges that, and the actions come off again (`judgedWith`): the panel
 * draws them, and a block left carrying `actions` would draw them a second time as rows of its own.
 *
 * THE COUNT IS HANDED WHATEVER IT CAME TO, a list of none included, and nothing is handed until the read is back
 * (`null`). The rule tells the three apart: counted and some, the section stays; counted and none, it goes with its
 * blocks, so no tile holds only its heading; not counted, the rule's own default stands.
 *
 * THE RECORD'S OWN MARK IS LIFTED, for this one section and this one reason. A record may send the section already shut
 * (`drawn: false`, `why: 'empty'`), and the rule keeps a block the record left out as it came. A section is only ever
 * left out as `empty` for heading nothing, which is the judgement the panel's count answers, so it is judged again
 * with the count. One a `when:` turned off stays off.
 *
 * NODE LOADS IT, so `panels.test.ts` holds each rule without a component.
 */

import type { ActionRow, Fetch } from '../record/actions.ts';
import { forProject, type ForProject } from '../record/actions-plain.ts';

/** What this file reads of a block: its kind, whether it is drawn and why not, and the keys a section names its panel by. */
type Lendable = { kind: string; drawn?: boolean | undefined; why?: string | undefined };

const key = (b: Lendable, name: string): unknown => (b as Record<string, unknown>)[name];
const some = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

/**
 * Whether `b` is a section the rule would shut for want of its actions: boxed, naming the `actions` panel, carrying
 * none, and either drawn or left out only for heading nothing.
 */
const wants = (b: Lendable): boolean =>
  b.kind === 'section' && key(b, 'panel') === 'actions' && key(b, 'box') === true && !some(key(b, 'actions')) && (b.drawn !== false || b.why === 'empty');

/** Whether any section of the page waits on the project's actions, which is the only time they are read. */
export const asksActions = (blocks: readonly Lendable[]): boolean => blocks.some(wants);

/**
 * The page with each boxed actions section carrying `held`, the actions its panel would draw, a list of none included.
 * The same array where nothing was counted (`null`) or no section waits on it, and the same block everywhere else,
 * each at its own place.
 */
export function withActions<B extends Lendable>(blocks: readonly B[], held: readonly unknown[] | null): readonly B[] {
  if (held === null || !asksActions(blocks)) return blocks;
  return blocks.map((b) => {
    if (!wants(b)) return b;
    if (b.drawn !== false) return { ...b, actions: held } as B;
    /* DRAWN AGAIN, SAID OUT LOUD, as arranging does (`arranged`): the page asks `drawn` of a block, not its absence. */
    const { why: _why, ...open } = b;
    return { ...open, drawn: true, actions: held } as unknown as B;
  });
}

/**
 * The page as `judge` draws it once it knows what the panel holds: judged with the actions lent, which are then taken
 * back off the section, so the panel alone draws them.
 */
export function judgedWith<B extends Lendable>(blocks: readonly B[], held: readonly unknown[] | null, judge: (blocks: readonly B[]) => B[]): B[] {
  const lent = withActions(blocks, held);
  const out = judge(lent);
  if (lent === blocks) return out;
  return out.map((b, i) => {
    const was = blocks[i]!;
    if (lent[i] === was) return b;
    const { actions: _lent, ...rest } = b as B & { actions?: unknown };
    return ('actions' in was ? { ...rest, actions: key(was, 'actions') } : rest) as unknown as B;
  });
}

/** What the panel draws for `project`: its own actions, then the ones for every project (`forProject`). */
export function heldFor(rows: readonly ActionRow[], project: ForProject): ActionRow[] {
  const split = forProject(rows, project);
  return [...split.own, ...split.everywhere];
}

/**
 * The actions the panel would draw on this page, read from the record ONCE, and only when a section waits on them and
 * the page is drawn for a row. `null` is not counted: no section asks, no row to ask about, or a read the record
 * refused, where the page is judged as it was and the panel says the record's sentence where it is drawn.
 */
export async function readHeld(io: Fetch, base: string, blocks: readonly Lendable[], project: ForProject | null): Promise<ActionRow[] | null> {
  if (project === null || !asksActions(blocks)) return null;
  /* THE ACTIONS' READER BY `import()`, asked only by a page drawn for a row whose section waits on them. */
  const { live } = await import('../record/actions.ts');
  const got = await live(io, base).actions();
  return got.ok ? heldFor(got.value, project) : null;
}
