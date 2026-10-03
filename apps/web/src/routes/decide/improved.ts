/**
 * BRAINDOG'S OWN PAGE UPDATES, ON DECIDE AS ONE CARD (DIRECTION §37): "BrainDog improved 4 of your pages", what changes
 * on each, and Accept.
 *
 * WHY. A newer version of a module or a use case this build ships waited on the Updates tab of Add-ons and nowhere
 * else, so a page BrainDog had made better stayed as it was until somebody went looking. §37: first-party page updates
 * reach the record on their own when nothing the owner changed would be lost, and otherwise they come to Decide. This is
 * the second half, the card they come to.
 *
 * THE SAME SOURCE AS ADD-ONS. `firstPartyUpdates` is the half of the Updates tab that this build ships
 * (`routes/packs/+page.svelte` `updatesOf`), so the card and the tab never disagree about what waits. An add-on from the
 * Kennel stays on the tab: it is somebody else's work, and it is read there with its signature.
 *
 * ACCEPT INSTALLS THE PLAN THE RECORD MAKES NOW, one after another. A plan that would stop, call another service, take
 * something away, move something on, or change what the owner's own rows mean is not taken on one press: it opens on
 * the plan sheet, read whole, which is where Add-ons approves the same thing (`readFirst`).
 *
 * PURE, with relative imports and the seed's own, so `improved.test.ts` loads it in Node.
 */

import { firstPartyModules } from '@braindog/seed/packs/modules';
import { moduleName, ruleName } from '@braindog/seed/usecases/names';
import { builtInFile } from '@braindog/seed/usecases/share';

import { actionOf, compareVersion, listingsOf } from '../../lib/market/listing.ts';
import { sheetOf, type Sheet } from '../../lib/market/plan.ts';
import { METRICS } from '../../lib/record/declared.ts';
import { PAGES, REGISTERS } from '../../lib/record/held.ts';
import type { PackState } from '../../lib/record/packs.ts';
import { words } from './words.ts';

/** One page update this build ships for something the record holds at an older version. */
export type Improved = {
  key: string;
  kind: 'module' | 'usecase';
  id: string;
  title: string;
  from: string;
  to: string;
  /** The file the plan is read from: a built-in use case's own, or none for a module, whose document is built for the record. */
  file: { doc: null; text: string | null };
  /** What changes, newest first: the note of every version after the one held, up to the one offered. */
  notes: string[];
};

/**
 * Every module and use case this build ships that the record holds, turned on, at an older version.
 *
 * A USE CASE WITH NO FILE OF ITS OWN IS LEFT OUT, as the Updates tab leaves it out: there is nothing to plan it from.
 */
export function firstPartyUpdates(held: readonly PackState[]): Improved[] {
  return listingsOf({ kennel: null, counts: null }).flatMap((l): Improved[] => {
    if (l.source !== 'bundled' || (l.kind !== 'module' && l.kind !== 'usecase')) return [];
    const a = actionOf(l, held);
    if (a.kind !== 'update') return [];
    const built = l.kind === 'usecase' ? builtInFile(l.id) : null;
    if (l.kind === 'usecase' && !built) return [];
    const notes = l.versions
      .filter((v) => compareVersion(v.version, a.from) > 0 && compareVersion(v.version, a.to) <= 0)
      .flatMap((v) => (typeof v.notes === 'string' && v.notes.trim() !== '' ? [v.notes.trim()] : []));
    return [{ key: l.key, kind: l.kind, id: l.id, title: l.title, from: a.from, to: a.to, file: { doc: null, text: built ? JSON.stringify(built) : null }, notes }];
  });
}

/** A list's id in words, when nothing the record said names it: `bank_accounts` is "Bank accounts". */
const spelled = (id: string): string => (id.charAt(0).toUpperCase() + id.slice(1)).replaceAll('_', ' ');

/**
 * What a plan sheet names: a declaration id (`register.money`, `page.home`, `metric.cash`, `rule.chase`) by the name
 * this record gives it, and anything else as a pack, by `packName`. Add-ons names its plans with this too.
 */
export function declarationName(id: string, lists: readonly { id: string; name: string }[], packName: (id: string) => string): string {
  const dot = id.indexOf('.');
  const kind = dot < 0 ? '' : id.slice(0, dot);
  const bare = id.slice(dot + 1);
  if (kind === 'register') return REGISTERS[bare]?.name ?? lists.find((l) => l.id === bare)?.name ?? spelled(bare);
  if (kind === 'page') return PAGES[bare]?.title ?? bare;
  if (kind === 'metric') return METRICS[bare]?.name ?? bare;
  if (kind === 'rule') return ruleName(bare) ?? bare;
  return packName(id);
}

/** A pack by the name it goes by: a module by its own, anything else as the seed names it, never `usecase-founder`. */
export const packName = (id: string): string => firstPartyModules().find((m) => m.id === id)?.name ?? moduleName(id);

/** The parts of a plan that are not taken on one press: what is gone, moved on, or reads differently afterwards. */
const READ_FIRST = new Set(['retires', 'moves', 'worth']);

/**
 * WHETHER THESE PLANS ARE READ BEFORE THEY GO IN, and the sheet they are read on.
 *
 * `asks` is every calls-out line the plans ask to approve: a line that calls another service is approved by a press on
 * the sheet that shows it, never by a press on a card that does not. A plan this build cannot read is read first too,
 * on Add-ons, because there is no sheet here to show it.
 */
export function readFirst(diffs: readonly unknown[], asks: readonly string[], nameOf: (id: string) => string): { read: boolean; sheet: Sheet | null } {
  const sheet = sheetOf(diffs.length === 1 ? diffs[0] : [...diffs], nameOf);
  if (!sheet) return { read: true, sheet: null };
  const calls = sheet.parts.some((p) => p.calls.some((c) => c.change !== 'same'));
  const keeps = sheet.parts.some((p) => p.sections.some((s) => READ_FIRST.has(s.key)));
  return { read: sheet.stops.length > 0 || asks.length > 0 || calls || keeps, sheet };
}

/** The one line a card says for an update: its newest note, or that a newer version is there when it carries none. */
export const changeLine = (u: Pick<Improved, 'notes' | 'title'>): string => u.notes[0] ?? words.improvedNewer(u.title);

/**
 * A LINE LED BY ITS PAGE'S NAME, and the name left off where the line already opens with it: a note that says "Work
 * opens on the task that has been late longest" under the name Work read "Work Work opens on". `name` is empty then.
 */
export function ledBy(title: string, said: string): { name: string; said: string } {
  const opens = said.toLowerCase().startsWith(title.toLowerCase()) && !/[\p{L}\p{N}]/u.test(said.charAt(title.length));
  return { name: title !== '' && opens ? '' : title, said };
}
