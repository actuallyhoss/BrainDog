/**
 * What came of Slash's suggestions, said where the owner sees Slash (ENG-B01 and ENG-A16 seen: answers
 * that teach, health shown).
 *
 * PURE, SO `node --test` CAN IMPORT IT: the client is handed in, as `slash-brake.ts` takes it.
 *
 * ONE LINE A KIND OF CHANGE, IN WHOLE COUNTS. The record counts, over its last 30 days, how each suggestion Slash filed
 * ended (`engineReadings` `slash`), how many duplicates it merged and how many of those were undone this week (`folds`),
 * and how many things Slash wrote outside what it may (`outside`, 0 is the healthy answer). This says them as sentences:
 * "Pages: 4 suggested, 2 taken as they were, 1 changed, 1 turned down. 1 was undone." A part that is nought is left
 * out, so no sentence is a run of zeros, and a kind nobody suggested is no line at all. A kind is named from a small
 * table; one the table does not know is counted under "Other changes", never said by its key.
 *
 * NUMBERS THAT DO NOT HOLD TOGETHER ARE SAID AS NOTHING, never guessed at: a count that is not a whole number, or more
 * ended than were suggested, drops that kind. THE WORDS ONLY: nothing here changes what Slash may suggest.
 */

import type { BrakeClient } from './slash-brake.ts';

/** How the suggestions of one kind of change ended, as `engineReadings` answers it. */
export type KindOutcome = {
  kind: string;
  offered: number;
  accepted: number;
  changed: number;
  declined: number;
  undone: number;
  lapsed: number;
  share: number | null;
};

/** What `readOutcomes` hands on: each field `null` (or `[]`) where the host sent none. */
export type Outcomes = {
  slash: KindOutcome[];
  folds: { made: number; undone: number } | null;
  outside: number | null;
  /** How Slash's offers were graded: the predictions that came due (`scored`) and how many did what they said. */
  predictions?: { scored: number; met: number };
};

/** One line of the tile. `bad` is the word that says it is a fault, drawn in the deeper red beside the sentence. */
export type OutcomeLine = { key: string; text: string; bad?: string };

export const words = {
  title: 'What came of its suggestions',
  meta: 'Last 30 days',
  other: 'Other changes',
  folds: 'Duplicates this week',
  bad: 'Needs a look',
  clean: 'Slash wrote nothing outside what it may.',
  outside: (n: number) => `Slash wrote ${whole(n)} ${n === 1 ? 'change' : 'changes'} outside what it may.`,
} as const;

/**
 * THE KINDS SAID IN WORDS, keyed on what the record files a suggestion as (the kinds of a proposal's body in
 * `packages/kernel/src/govern.ts`, and the kinds Slash proposes beside them). Two keys may share a name: their counts
 * are added into one line.
 */
const NAMES: readonly (readonly [string, readonly string[]])[] = [
  ['Pages', ['page', 'pages']],
  ['Page layouts', ['arrange', 'arrangement', 'arrangements', 'look', 'looks']],
  ['How things are built', ['change', 'changes']],
  ['Things in your lists', ['rowset']],
  ['Ways to read what arrives', ['pattern', 'patterns']],
  ['Skills', ['skill']],
  ['Catalogue updates', ['catalogue', 'catalog']],
  ['Plugins', ['pack', 'packs', 'addons', 'plugin', 'plugins']],
  ['Settings', ['settings']],
  ['Choices to make', ['call']],
];

const NAMED: ReadonlyMap<string, string> = new Map(NAMES.flatMap(([name, keys]) => keys.map((k) => [k, name] as const)));

/** The order the lines are said in: the table's, then "Other changes". */
const ORDER: readonly string[] = [...NAMES.map(([name]) => name), words.other];

/** A kind's name in words, "Other changes" for one the table does not know. */
/* A PLURAL KEY IS READ AS ITS SINGULAR where only that is listed (`skills` is `skill`), so no key here is spelt as a
   list's id. */
export const kindName = (kind: string): string => {
  const k = kind.trim().toLowerCase();
  return NAMED.get(k) ?? NAMED.get(k.replace(/s$/u, '')) ?? words.other;
};

const whole = (n: number): string => n.toLocaleString('en-GB');

const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

const COUNTS = ['offered', 'accepted', 'changed', 'declined', 'undone', 'lapsed'] as const;

/** One kind held to its shape, or `null` when its numbers do not hold together. */
function kindOf(v: unknown): KindOutcome | null {
  if (!isMap(v) || typeof v.kind !== 'string') return null;
  if (!COUNTS.every((k) => count(v[k]))) return null;
  const o = v as unknown as KindOutcome;
  if (o.accepted + o.changed + o.declined + o.lapsed > o.offered || o.undone > o.offered) return null;
  const share = typeof v.share === 'number' && Number.isFinite(v.share) && v.share >= 0 && v.share <= 1 ? v.share : null;
  return { kind: o.kind, offered: o.offered, accepted: o.accepted, changed: o.changed, declined: o.declined, undone: o.undone, lapsed: o.lapsed, share };
}

/**
 * The outcomes in an `engineReadings` answer, or `null` when it holds none of them: a host from before the outcomes
 * were read answers `asks`, `understanding` and `braked` only, and that is nothing to say, never "nothing came of it".
 */
export function outcomesOf(value: unknown): Outcomes | null {
  if (!isMap(value)) return null;
  const p = value.predictions;
  const predictions = isMap(p) && count(p.scored) && count(p.met) && p.met <= p.scored ? { scored: p.scored, met: p.met } : null;
  const has = Array.isArray(value.slash) || isMap(value.folds) || count(value.outside) || predictions !== null;
  if (!has) return null;
  const slash = Array.isArray(value.slash) ? value.slash.map(kindOf).filter((k): k is KindOutcome => k !== null) : [];
  const f = value.folds;
  const folds = isMap(f) && count(f.made) && count(f.undone) ? { made: f.made, undone: f.undone } : null;
  return { slash, folds, outside: count(value.outside) ? value.outside : null, ...(predictions ? { predictions } : {}) };
}

/** "Pages: 4 suggested, 2 taken as they were, 1 changed, 1 turned down. 1 was undone." */
function kindLine(name: string, o: Omit<KindOutcome, 'kind' | 'share'>): string {
  const ended = [
    ...(o.accepted > 0 ? [`${whole(o.accepted)} taken as ${o.accepted === 1 ? 'it was' : 'they were'}`] : []),
    ...(o.changed > 0 ? [`${whole(o.changed)} changed`] : []),
    ...(o.declined > 0 ? [`${whole(o.declined)} turned down`] : []),
    ...(o.lapsed > 0 ? [`${whole(o.lapsed)} left unanswered`] : []),
  ];
  const head = [`${whole(o.offered)} suggested`, ...(ended.length > 0 ? ended : ['none answered yet'])].join(', ');
  const undone = o.undone > 0 ? ` ${whole(o.undone)} ${o.undone === 1 ? 'was' : 'were'} undone.` : '';
  return `${name}: ${head}.${undone}`;
}

/**
 * The tile's lines: a line a kind that was suggested, the duplicates merged, then whether Slash kept to what it may.
 *
 * EMPTY, AND THE TILE IS NOT DRAWN, when nothing was suggested or merged and Slash wrote nothing it may not: a record
 * with nothing to say says nothing. A write outside what it may is a fault, so it is said on its own too, with its word.
 */
export function outcomeLines(readings: Outcomes | null | undefined): OutcomeLine[] {
  if (!readings) return [];
  const sums = new Map<string, Omit<KindOutcome, 'kind' | 'share'>>();
  for (const k of readings.slash) {
    if (k.offered < 1) continue;
    const name = kindName(k.kind);
    const s = sums.get(name) ?? { offered: 0, accepted: 0, changed: 0, declined: 0, undone: 0, lapsed: 0 };
    for (const c of COUNTS) s[c] += k[c];
    sums.set(name, s);
  }
  const lines: OutcomeLine[] = ORDER.filter((name) => sums.has(name)).map((name) => ({ key: name, text: kindLine(name, sums.get(name)!) }));
  const f = readings.folds;
  if (f && (f.made > 0 || f.undone > 0)) {
    const said = (n: number) => (n === 0 ? 'none' : whole(n));
    lines.push({ key: 'folds', text: `${words.folds}: ${said(f.made)} merged, ${said(f.undone)} undone.` });
  }
  const out = readings.outside;
  if (out !== null && out > 0) lines.push({ key: 'outside', text: words.outside(out), bad: words.bad });
  else if (out === 0 && lines.length > 0) lines.push({ key: 'outside', text: words.clean });
  /* THE GRADED SUGGESTIONS, beside the brake: "Of 4 suggestions graded, 3 did what they said." */
  const p = readings.predictions;
  if (p && p.scored > 0) {
    const one = p.scored === 1;
    lines.push({ key: 'predictions', text: `Of ${whole(p.scored)} ${one ? 'suggestion' : 'suggestions'} graded, ${whole(p.met)} did what ${one ? 'it' : 'they'} said.` });
  }
  return lines;
}

/** The outcomes as the record reads them, or `null` on a refusal, a throw, or a host that sends none of them. */
export async function readOutcomes(client: BrakeClient): Promise<Outcomes | null> {
  try {
    const out = await client.call<unknown>('engineReadings', {});
    return out.ok ? outcomesOf(out.value) : null;
  } catch {
    return null;
  }
}
