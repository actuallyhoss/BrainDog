/**
 * When a changed setting takes hold: at once, or when the add-on next updates.
 *
 * TWO WAYS A SETTING IS READ, and the add-on file says which. A `{{config:<key>}}` in a declaration is filled when the
 * add-on is planned and installed (`filledWith` in `index.ts`), and the declaration is stored with the value it was
 * filled with, so a new value reaches it only at the next install or update. A figure whose target names the setting
 * (`target: { setting }`, `liveTarget` in the kernel), or code that reads the add-on's settings when it draws, reads the
 * value each time, so a new value is read at once. A person changed a figure's target and nothing moved, and nothing said
 * why: the settings screen says it now, worked out here from the file and never typed per setting.
 *
 * THE READER IS THE FILL'S OWN (`configReads`), so a hole this counts is a hole the plan fills and no second pattern can
 * drift from it. A setting used both ways waits for the update, because the part filled in is what is stored. Example
 * rows are filled too, and planted once at install, so a later value never reaches them either way: they do not decide.
 */

import { configReads } from '@braindog/kernel';
import type { Pack } from './index.ts';

/** `now` when the new value is read at once; `next-update` when it is filled into a declaration at install. */
export type TakesHold = 'now' | 'next-update';

/** Whether a declaration body holds `key` as a hole the plan fills. */
const fills = (body: unknown, key: string): boolean => configReads(body).some((read) => read.key === key);

/** When a change to the setting `key` takes hold. A key the add-on does not fill anywhere, an unknown one included, is `now`. */
export function takesHold(pack: Pick<Pack, 'declarations'>, key: string): TakesHold {
  return pack.declarations.some((d) => fills(d.body, key)) ? 'next-update' : 'now';
}

/** Every setting the add-on declares, or every key named, with when a change to it takes hold. */
export function takesHoldAll(pack: Pick<Pack, 'declarations'> & { manifest?: { config?: unknown } }, keys?: readonly string[]): Record<string, TakesHold> {
  const config = pack.manifest?.config;
  const named = keys ?? (config !== null && typeof config === 'object' && !Array.isArray(config) ? Object.keys(config) : []);
  return Object.fromEntries(named.map((key) => [key, takesHold(pack, key)]));
}
