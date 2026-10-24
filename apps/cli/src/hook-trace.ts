/**
 * The start hook's own clock, by phase, for the bench that times it (`tools/agent-bench/start-hook.mjs`).
 *
 * OFF UNLESS ASKED. With `BRAINDOG_HOOK_TRACE=1` in the hook's environment, each phase's end is kept as milliseconds
 * since the process started (`performance.now()`), and one JSON line of them goes to stderr as the process ends, where
 * Claude Code shows nothing. Without it a mark is one comparison and nothing is written. No mark carries a row, a path
 * or a token: the names are fixed words.
 */

import { writeFileSync } from 'node:fs';

const on = process.env.BRAINDOG_HOOK_TRACE === '1';
const marks: Record<string, number> = {};
let hooked = false;

/** The end of one phase, by its fixed name. The first mark also asks for the line at the process's exit. */
export function mark(name: string): void {
  if (!on) return;
  marks[name] = Math.round(performance.now());
  if (hooked) return;
  hooked = true;
  /* Node's own start, before any of the command's code ran, so the line splits Node from the module load. */
  marks.node = Math.round(performance.nodeTiming.bootstrapComplete);
  process.once('exit', () => {
    try {
      writeFileSync(2, `braindog-hook-trace ${JSON.stringify(marks)}\n`);
    } catch {
      /* A closed stderr loses the trace and nothing else. */
    }
  });
}
