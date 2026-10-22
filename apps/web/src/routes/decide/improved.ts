/**
 * BRAINDOG'S OWN PAGE UPDATES, ON DECIDE AS ONE CARD: "BrainDog improved 4 of your pages", what changes
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
 * ONE THAT WAITS ON ANOTHER GOES IN AFTER IT (`ordered`, `readInOrder`, `inTurn`). Money's update is refused at a figure
 * Personal holds until Personal's own update hands it over, so the two taken as they came stopped the card for good.
 * The order is the one "Update all" on Add-ons takes, read from the same place (`lib/market/update-order.ts`).
 *
 * PURE, with relative imports and the seed's own, so `improved.test.ts` loads it in Node.
 */

import { firstPartyModules } from '@braindog/seed/packs/modules';
import { moduleName, ruleName } from '@braindog/seed/usecases/names';
import { builtInFile } from '@braindog/seed/usecases/share';

import { actionOf, compareVersion, listingsOf } from '../../lib/market/listing.ts';
import { sheetOf, type Sheet } from '../../lib/market/plan.ts';
import { inOrder, marked } from '../../lib/market/update-order.ts';
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
  const sheet = sheetOf(diffs.length === 1 ? diffs[0] : [...diffs], nameOf, (list, field) => REGISTERS[list]?.fields.find((f) => f.id === field)?.label ?? null);
  if (!sheet) return { read: true, sheet: null };
  const calls = sheet.parts.some((p) => p.calls.some((c) => c.change !== 'same'));
  const keeps = sheet.parts.some((p) => p.sections.some((s) => READ_FIRST.has(s.key)));
  return { read: sheet.stops.length > 0 || asks.length > 0 || calls || keeps, sheet };
}

/** What waits, in the order it goes in: an update that hands something on before the one that takes it. */
export const ordered = (updates: readonly Improved[]): Improved[] => inOrder(updates);

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A plan without the conflicts an earlier update of the run clears, which are an order and nothing to read. */
function cleared(diff: unknown): unknown {
  if (!isMap(diff) || !Array.isArray(diff.conflicts)) return diff;
  return { ...diff, conflicts: diff.conflicts.filter((c) => !(isMap(c) && c.waits === 'after')) };
}

/**
 * `readFirst` FOR A RUN IN ITS ORDER (`ordered`), each plan beside the update it is for. A conflict the update before it
 * clears is not a stop, because that update has landed by the time this one is planned again, and it is not a reason to
 * read either: nothing is lost or moved, one goes in after the other. Everything else a plan carries is judged as
 * before. `shown` is what the sheet draws, where such a plan says what it goes in after.
 */
export function readInOrder(run: readonly Improved[], diffs: readonly unknown[], asks: readonly string[], nameOf: (id: string) => string): { read: boolean; sheet: Sheet | null; shown: unknown[] } {
  const shown = diffs.map((d) => marked(d, run, run));
  return { read: readFirst(shown.map(cleared), asks, nameOf).read, sheet: readFirst(shown, asks, nameOf).sheet, shown };
}

/** A plan for a version the record already holds: an earlier update of the same run brought it in. */
export function landed(diff: unknown): boolean {
  if (!isMap(diff) || !isMap(diff.pack)) return false;
  return typeof diff.installed_version === 'string' && diff.installed_version === diff.pack.version;
}

/**
 * EACH PLAN IN TURN, PLANNED AGAIN JUST BEFORE IT GOES IN, because the record's version is in every plan's hash and the
 * one before it moved it, and because a plan that waited on the one before it only reads clean once that has landed. A
 * plan that now asks to approve a line nobody was shown stops there, as "Update all" does, and one the update before
 * it already brought in is passed over. The card hands in the record's own plan and install; a test hands in names.
 */
export async function inTurn<U, P>(
  plans: readonly { u: U; p: P }[],
  by: {
    replan: (u: U) => Promise<{ ok: true; planned: P } | { ok: false; fix: string }>;
    asksOf: (p: P) => readonly string[];
    landed: (p: P) => boolean;
    install: (p: P) => Promise<{ ok: true } | { ok: false; fix: string }>;
    /** What is said when a plan asks for a line the press did not show. */
    unread: string;
  },
): Promise<{ done: number; passed: number; fix: string }> {
  const shown = new Set(plans.flatMap(({ p }) => by.asksOf(p)));
  let done = 0;
  let passed = 0;
  for (const [i, { u, p }] of plans.entries()) {
    const fresh = i === 0 ? { ok: true as const, planned: p } : await by.replan(u);
    if (!fresh.ok) return { done, passed, fix: fresh.fix };
    if (i > 0 && by.landed(fresh.planned)) {
      passed += 1;
      continue;
    }
    if (by.asksOf(fresh.planned).some((line) => !shown.has(line))) return { done, passed, fix: by.unread };
    const out = await by.install(fresh.planned);
    if (!out.ok) return { done, passed, fix: out.fix };
    done += 1;
  }
  return { done, passed, fix: '' };
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

/** A line the card draws: the page's name where it leads the line, what is said, and a key that is its own. */
export type CardLine = { key: string; name: string; said: string };

/**
 * WHAT THE CARD LISTS, IN THE ORDER IT GOES IN (`ordered`), one line an update: the card said Money then Personal and
 * Accept took Personal first, so what was read and what happened disagreed. The order is the one Accept runs.
 */
export const cardLines = (updates: readonly Improved[]): CardLine[] => ordered(updates).map((u) => ({ key: u.key, ...ledBy(u.title, changeLine(u)) }));

/** Every change of every update, folded under "See each change": the same order, an update's own notes kept together. */
export const cardNotes = (updates: readonly Improved[]): CardLine[] =>
  ordered(updates).flatMap((u) => u.notes.map((note, i) => ({ key: `${u.key}:${i}`, ...ledBy(u.title, note) })));
