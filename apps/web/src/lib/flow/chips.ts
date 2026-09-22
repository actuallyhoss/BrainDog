/**
 * What the inspector offers in place of typing: the chips a template is filled from, grouped by where each value comes
 * from, and the pickers that replace a box asking for an identifier.
 *
 * A FILE OF ITS OWN AND NOT `flow.ts`, because every line here is about how the sheet lays out a choice, and none of it
 * is about what a body means. `flow.ts` says which paths a step may read (`triggerChips`, `varsBefore`); this says how
 * a person meets them. PURE, so `node --test` holds it: a `.svelte` file cannot be imported by the test runner.
 */

import type { Verb } from './flow.ts';

/* ── chips ───────────────────────────────────────────────────────────────── */

/** The headings a template's chips sit under, in the order a run gets the values: the trigger's first, then each step's. */
export const GROUP_WORDS = {
  row: 'From the row',
  arrival: 'From what arrived',
  earlier: 'From earlier steps',
} as const;

type GroupKey = keyof typeof GROUP_WORDS;
const ORDER: readonly GroupKey[] = ['row', 'arrival', 'earlier'];

export type Chip = { path: string; word: string };
export type ChipGroup = { label: string; chips: Chip[] };

/**
 * A chip's word: the last part of its path, which is the name the person gave the answer or the list gave the field.
 *
 * THE SAME WORD THE CARD SAYS. `unbrace` in `flow.ts` reads `{{vars.rate}}` aloud as `rate`, so the chip that put it
 * there says `rate` too; a chip that said "Rate" over a card that says "rate" is two names for one thing.
 */
export const chipWord = (path: string): string => path.split('.').pop() ?? path;

function groupOf(path: string): GroupKey {
  if (path.startsWith('trigger.row.')) return 'row';
  if (path.startsWith('trigger.')) return 'arrival';
  return 'earlier';
}

/**
 * The chips a field can take, under a heading for each place they come from, and only the headings with something
 * under them.
 *
 * BY THE PATH, NEVER BY THE WORD. An invoice's `amount` and a call's answer kept as `amount` are two different values
 * with one word. The inspector used to key the condition's list by the word, so a list field and an earlier answer
 * sharing one were a duplicate key in a keyed `#each`, which Svelte throws on in production as well as in development
 * (`each_key_duplicate`, `svelte/src/internal/client/dom/blocks/each.js`): the sheet stopped drawing. Here they are two
 * chips under two headings, each inserting its own path.
 */
export function groupChips(paths: readonly string[]): ChipGroup[] {
  const held = new Map<GroupKey, Chip[]>();
  const seen = new Set<string>();
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    const key = groupOf(path);
    held.set(key, [...(held.get(key) ?? []), { path, word: chipWord(path) }]);
  }
  return ORDER.filter((k) => held.has(k)).map((k) => ({ label: GROUP_WORDS[k], chips: held.get(k)! }));
}

/* ── pickers ─────────────────────────────────────────────────────────────── */

/**
 * The picker an argument gets, or `null` for a box the person writes in.
 *
 * ONLY WHERE THE RECORD ALREADY HOLDS THE ANSWER. A list is one of the record's lists, a declared call is one the record
 * declared, and a field of the row is one its list declares; each of those was a free box that wanted an internal name
 * and faulted on Send when it was guessed wrong. A name for a new answer (`as`) is written, because nothing exists yet
 * to pick it from.
 */
export function pickerOf(verb: Verb | string, path: readonly string[]): 'list' | 'call' | 'field' | null {
  const last = path[path.length - 1];
  if (last === 'register') return 'list';
  if ((verb === 'call' && last === 'ingest') || (verb === 'run' && path.length === 1)) return 'call';
  if ((verb === 'set' || verb === 'link') && path.length === 2 && last === 'field') return 'field';
  return null;
}

/**
 * The choices, with the value already written kept at the head when the record does not list it.
 *
 * A PICKER MUST NOT REWRITE WHAT IT OPENS ON. A `<select>` whose value is not among its options shows the first one,
 * and the first change anywhere in the sheet would then look like the person chose it. A list that was renamed, or a
 * call declared on another record, stays what it was until somebody picks something else.
 */
export function withCurrent<T extends { id: string; name: string }>(options: readonly T[], value: string): { id: string; name: string }[] {
  if (value === '' || options.some((o) => o.id === value)) return [...options];
  return [{ id: value, name: value }, ...options];
}

/**
 * Whether the doors the record lists are every door an arrival could name.
 *
 * THE `doors` READ IS WEBHOOKS ONLY, AND AN ARRIVAL MAY NAME ANY INGEST. `doors` in `packages/record/src/index.ts` skips
 * every ingest whose channel is not `webhook`, while `flow-lint.ts` takes any declared ingest as `arrival.ingest`. A
 * picker drawn from that read on every arrival left an owner holding one webhook with no way to name an email, a paste
 * or a scheduled fetch at all: the box that took the id was gone and the list did not hold it. The doors are offered
 * once the arrival says it comes by webhook, and any other way, "Any way" included, keeps the box.
 */
export const doorsPickable = (channel: string | undefined): boolean => channel === 'webhook';

/** An id said as words, for a declared call that carries no name of its own: `invoice-sent` is "Invoice sent". */
export function idWords(id: string): string {
  const spaced = id.replace(/[-_]+/gu, ' ').trim();
  return spaced === '' ? id : spaced[0]!.toUpperCase() + spaced.slice(1);
}

/**
 * How something arrived, in words. `flow.ts` `CHANNELS` holds the values, and `chips.test.ts` holds that every one of
 * them has a word here, so a sixth channel cannot reach the sheet printed as its stored value.
 */
export const CHANNEL_WORDS: Readonly<Record<string, string>> = {
  webhook: 'A webhook',
  email: 'An email',
  paste: 'A paste',
  api: 'An agent or an app',
  pull: 'A scheduled fetch',
};

/** The days a weekly clock runs on, in words. The stored value stays `mon`, which is what the lint reads. */
export const DAY_WORDS: Readonly<Record<string, string>> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
