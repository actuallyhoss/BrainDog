/**
 * The status line's own entry (`STATUSLINE_FILE`): what Claude Code runs on every redraw, with its JSON on standard
 * input. It imports `statusline.ts` alone, which imports only Node's own modules and `position.ts`, so a draw starts
 * Node on a few kilobytes rather than the whole command. The bundle carries it as `__STATUSLINE_ENTRY__` and writes it
 * beside the hook scripts.
 *
 * THE BEAT'S CHILD IS THE FULL COMMAND (`braindog statusline --beat`): the bundle one folder up from here, else a
 * checkout's `main.ts` beside this file. It is detached, so a slow or dead host never delays the line.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { statusline } from './statusline.ts';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '..', 'braindog.mjs');

let stdin = '';
try {
  if (!process.stdin.isTTY) stdin = readFileSync(0, 'utf8');
} catch {
  /* No event draws an empty line. */
}
process.stdout.write(`${statusline({ env: process.env, stdin, cli: existsSync(bundle) ? bundle : join(here, 'main.ts') })}\n`);
process.exitCode = 0;
