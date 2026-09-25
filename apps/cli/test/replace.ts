/**
 * The tool `braindog install --replace` retires, as its tests name it: the one replace file this repository ships,
 * `packs/legacy-import/replace.json`.
 *
 * WHY THE TESTS READ A PACK'S FILE RATHER THAN A FIXTURE OF THEIR OWN. Before `--replace` took a file, the old tool's
 * hook, server, host and skill markers were constants in `src/install.ts`, and these tests were written against them.
 * Reading the shipped file keeps every one of those tests holding the markers a person actually replaces with, so a
 * pattern edited in the pack that stops matching the old hook fails here rather than on his machine.
 */

import { fileURLToPath } from 'node:url';

import { readReplace } from '../src/install.ts';

/** The replace file, as a person names it after `--replace`. */
export const REPLACE_FILE = fileURLToPath(new URL('../../../packs/legacy-import/replace.json', import.meta.url));
/** The same file read, as `install` reads it. */
export const REPLACE = readReplace(REPLACE_FILE);
