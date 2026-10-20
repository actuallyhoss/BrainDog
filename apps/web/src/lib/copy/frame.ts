/**
 * The frame's copy: the part of `copy` the shell draws on every screen, before any screen of its own has loaded.
 *
 * IT TYPES NO SENTENCE, AS `copy.ts` TYPES NONE. It spreads the area files the frame reads, under the same keys, so a
 * module of the frame says `copy.signOut` exactly as a screen does and gets the same words. The frame is the root
 * layout, the rail, the tab bar, the toast stack, the sheet and the few readers they call (`voice.ts`, `names.ts`,
 * `switcher.ts`).
 *
 * WHY A SECOND AGGREGATE: an object is never tree-shaken by its keys, so importing `copy` put every area's prose,
 * Settings' eight kilobytes first, in front of the first paint of every screen. A key the frame needs from another
 * area lives in `shell.ts`, which is the file for words more than one area draws; `copy.ts` still spreads every area,
 * so the screens read what they always read.
 *
 * Plain Node loads this file, so it imports only relative `.ts` files.
 */

import { data } from './data.ts';
import { home } from './home.ts';
import { read } from './read.ts';
import { shell } from './shell.ts';

export const copy = {
  ...shell,
  ...data,
  ...home,
  ...read,
} as const;
