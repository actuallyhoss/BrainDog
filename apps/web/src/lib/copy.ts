/**
 * Every UI literal in the app, in one object: `copy`.
 *
 * Load-bearing twice. Its area files are the only place a sentence is typed, so the rule that the
 * interface never explains itself is reviewable in one pass over `lib/copy/` (23 §7). And it is the
 * first input of the screenshot allow-list: under `html[data-shot]` only text a developer typed into
 * source stays legible, which is why a toggle's two states are two full literals rather than one
 * built by concatenation. Pattern-based redaction let "GREEN MARKET" through once (19 §6).
 *
 * The house voice, in three rules:
 *   - What was wrong · where · what to do. No apology, no blame, no exclamation.
 *   - A CTA is Verb + Noun. Never "Get Started".
 *   - Say what a thing does, plainly. Never sell it, and never explain the interface.
 *
 * THIS FILE TYPES NO SENTENCE: IT IS THE AGGREGATE (ARC-8). `copy` was one object in one file, the
 * most edited file in the web, so every unit that drew a screen wrote into the same lines. Each web
 * domain now types its words in its own file under `lib/copy/`, and this file spreads them into
 * `copy`, so every `copy.<key>` reads as it did and no key changed its spelling or its text. A key
 * lives in the file of the one area whose screens draw it; a key two areas draw lives in `shell.ts`,
 * so neither area rewords the other's screen.
 *
 * NEW WORDS GO IN AN AREA FILE, NEVER HERE. A unit adds its keys to its own domain's file, or keeps
 * them in a `words` object in a module it owns. A new area file is one import and one spread line
 * below, and those two lines are the integrator's to write, as a registry's are.
 *
 * `dead-copy` FOLLOWS THE SPREADS. It reads each `...name` below to the file its import names and
 * counts that file's two-space keys as `copy.<key>`, so a sentence typed in an area file and drawn
 * by no route is found as it was while this was one file.
 *
 * PLAIN NODE LOADS THIS FILE: the `passkey` gate imports it (`passkey.mjs`), and so do the web's
 * tests. So this file and every area file import only relative `.ts` files.
 */

import { account } from './copy/account.ts';
import { automations } from './copy/automations.ts';
import { data } from './copy/data.ts';
import { decide } from './copy/decide.ts';
import { design } from './copy/design.ts';
import { home } from './copy/home.ts';
import { lists } from './copy/lists.ts';
import { packs } from './copy/packs.ts';
import { pages } from './copy/pages.ts';
import { palette } from './copy/palette.ts';
import { read } from './copy/read.ts';
import { shell } from './copy/shell.ts';

export type { Held } from './copy/shell.ts';
export { INPUTS_SAID } from './copy/pages.ts';

export const copy = {
  ...shell,
  ...design,
  ...data,
  ...pages,
  ...lists,
  ...decide,
  ...automations,
  ...account,
  ...packs,
  ...home,
  ...palette,
  ...read,
} as const;

export type Copy = typeof copy;
