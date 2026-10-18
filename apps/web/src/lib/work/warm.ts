/**
 * The Work page read ahead of the press (`loop/research-104.md` 2.5): a pointer resting on a link to Work, a finger
 * down on one, or the keyboard reaching one reads the page into `kept.ts`, so the visit draws it at once.
 *
 * ONCE A VERSION. A page already kept at this version, or a read already out for it, asks nothing; a refusal is not
 * kept, so the visit asks as it always did. `workKey` is the one key Work and this file both keep under.
 */

import { keep, keptAnswer } from '../data/kept.ts';
import { pageReader } from '../record/page-live.ts';
import { WORK_PAGE } from './page.ts';

/** The key the Work page is kept under: the record's address and the filter the address narrows it to. */
export const workKey = (base: string, asked: Readonly<Record<string, string>>): string => `${base} ${JSON.stringify(asked)}`;

/** Reads out now, by key and version, so a second hover while one is out asks nothing. */
const out = new Set<string>();

/** Read the unfiltered Work page into the store, unless it is kept at this version or already being read. */
export function warmWork(base: string, version: number | null): void {
  const key = workKey(base, {});
  const once = `${key} ${version}`;
  if (out.has(once) || keptAnswer(WORK_PAGE, key, version)?.fresh === true) return;
  out.add(once);
  void pageReader(base)
    .read(WORK_PAGE, {})
    .then((got) => {
      if (got.from === 'live') keep(WORK_PAGE, key, version, { ok: true, value: got });
    })
    .catch(() => undefined)
    .finally(() => out.delete(once));
}
