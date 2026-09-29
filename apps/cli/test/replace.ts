/**
 * The tool `braindog install --replace` retires, as its tests name it: Tallybook, an invented old tool, described by
 * `fixtures/replace.json`.
 *
 * ONE FILE FOR EVERY TEST. Before `--replace` took a file, the old tool's hook, server, host and skill markers were
 * constants in `src/install.ts`, and these tests were written against them. Reading one replace file, as `install`
 * reads it, keeps every one of those tests holding the same markers, so a pattern edited there that stops matching the
 * old hook fails every test that relies on it.
 */

import { fileURLToPath } from 'node:url';

import { readReplace } from '../src/install.ts';

/** The replace file, as a person names it after `--replace`. */
export const REPLACE_FILE = fileURLToPath(new URL('./fixtures/replace.json', import.meta.url));
/** The same file read, as `install` reads it. */
export const REPLACE = readReplace(REPLACE_FILE);
