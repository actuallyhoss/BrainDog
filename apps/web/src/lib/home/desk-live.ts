/**
 * Today's "Working now" once `presence` has answered (`WorkingNow.svelte`): the rows `boot` drew at the first paint,
 * said again as the Agents page says the same runs (`openNow` in `instruct.ts`), and the lines for the runs left out.
 *
 * APART FROM `desk.ts` so the front door carries none of the control room: this file, like `instruct.ts`, arrives when
 * the tile reads `presence`, by `import()`. Pure, tested in `desk.test.ts`.
 */

import { appSaid, folderSaid, heardSaid, idleSaid, lastSaid, looksSaid, openNow, quietSaid, type LiveRun, type Thread } from '../record/instruct.ts';
import { LIVE_WORDS, type WorkingRow } from './desk.ts';

/**
 * THE ROWS AS `presence` SAYS THEM (agents and MCP plan §4.4, §7.2; the pass of 27 October), over the rows `boot` drew at
 * the first paint: each run that wrote, asked or said what it does and was heard inside the hour (`openNow`), named by
 * its app with where it works beside it ("Claude Code", Lanternfish or the Developer folder), the last thing it did under it
 * ("Asked you: …", "Wrote 3 changes"), and when it was last heard; what he told it that it holds, and whether he paused
 * or stopped it. A helper is folded under the run it works for. The project's name and colour are the `boot` row's for
 * the same run where it drew one, since Today names a project by its card; else `project` names it.
 */
export function liveRows(
  rows: readonly WorkingRow[],
  live: readonly LiveRun[],
  threads: readonly Thread[],
  project: (r: LiveRun) => string | null = () => null,
): WorkingRow[] {
  const drawn = new Map(rows.map((r) => [r.run, r] as const));
  return openNow(live).shown.map((r) => {
    const was = drawn.get(r.run);
    const told = r.instruction === null ? null : (threads.find((t) => t.id === r.instruction) ?? null);
    const working = r.state === 'working' || r.state === 'thinking';
    const named = was?.project ?? project(r);
    return {
      key: r.run,
      agent: appSaid(r),
      run: r.run,
      live: working && r.stopped === null ? 'working' : 'quiet',
      project: named ?? r.repo ?? folderSaid(r.cwd),
      hue: named === null ? null : (was?.hue ?? null),
      slot: named === null ? null : (was?.slot ?? null),
      doing: lastSaid(r),
      began: heardSaid(r),
      held: r.stopped,
      holds: told ? told.said.replace(/\s+/gu, ' ').trim() : null,
      word: r.stopped ? LIVE_WORDS[r.stopped] : working ? null : heardSaid(r),
    };
  });
}

/** The lines under the rows for the runs left out of them: open with nothing written, quiet machines, and read-only looks. */
export function liveFolds(live: readonly LiveRun[]): string[] {
  const o = openNow(live);
  return [
    o.idle.length > 0 ? idleSaid(o.idle.length) : null,
    ...o.quiet.map((q) => `${q.said}: ${quietSaid(q).what}, quiet`),
    o.looks.length > 0 ? looksSaid(o.looks.length) : null,
  ].filter((x): x is string => x !== null);
}
