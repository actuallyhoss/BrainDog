/**
 * The pattern builder's words, and how a reading and a match are said to a person.
 *
 * THE PATTERN BUILDER'S OWN WORDS, beside the screens that say them, as the Inbox keeps its own. Nothing here names a form, an
 * anchor or a predicate: a reading is "the amount after “Amount:”", a match is "the sender is ...", and a date's
 * format is shown as a date written that way.
 *
 * PLAIN TYPESCRIPT, loaded by the route, by `Proposed.svelte` for the link, and by any test in plain Node.
 */

import { money } from 'braindog-render';

import type { Ask, Json, Test } from './draft.ts';

export const words = {
  title: 'Make a rule',
  kicker: 'Inbox',
  fromInbox: 'Make a rule from these',
  openInBuilder: 'Open in the builder',
  steps: ['Samples', 'What it reads', 'Point at it', 'Try and save'] as const,
  sampleOf: (i: number, n: number) => `Sample ${i} of ${n}`,
  previous: 'Previous sample',
  next: 'Next sample',
  removeSample: 'Take this sample out',
  pasteLabel: 'Paste another message',
  pasteHelp: 'Read here only, never filed.',
  pasteAdd: 'Add this message',
  pastedFrom: 'Pasted here',
  noSubject: 'No subject',
  samplesMost: (n: number) => `A rule is made from at most ${n} messages.`,
  intoLabel: 'File what it reads in',
  intoPick: 'Pick where it goes',
  toTable: 'See what it reads',
  toTry: 'Try it',
  back: 'Back',
  field: 'Field',
  reads: 'Reads',
  readsOf: (hits: number, of: number) => `${hits}/${of}`,
  readsLabel: (hits: number, of: number) => `Read in ${hits} of ${of} samples`,
  unread: 'Nothing yet',
  notRead: 'Not found',
  change: 'Change',
  remove: 'Remove',
  pointAt: 'Point at it',
  addField: 'Add a field',
  addFieldPick: 'Pick a field',
  noReadings: 'Add a field, then select it in a sample.',
  matchLead: 'Take messages where',
  matchAnd: 'and',
  matchAny: 'Take every message on this channel',
  matchKept: 'Take messages that meet the condition this rule came with',
  matchReplace: 'Replace it with conditions',
  addCondition: 'Add a condition',
  removeCondition: 'Remove this condition',
  conditionAsk: 'What it asks about',
  conditionTest: 'How it compares',
  conditionValue: 'The words',
  asks: { from: 'the sender', to: 'the address it went to', subject: 'the subject', body: 'the message' } satisfies Record<Ask, string>,
  tests: { is: 'is', contains: 'contains' } satisfies Record<Test, string>,
  takes: (n: number, of: number) => `Takes ${n} of ${of}`,
  selectLead: (field: string) => `Select the ${field} in the message.`,
  selectHelp: 'Press and hold, or drag, over the words. Then find it.',
  find: (said: string) => `Find “${said}”`,
  finding: 'Looking in every sample',
  candidates: 'Ways to find it',
  noCandidates: 'Nothing beside that text finds it again. Select a little more, or a different sample.',
  use: 'Use this',
  anotherWay: 'Add as another way',
  fallbackLabel: (field: string) => `When no ${field} is found, write`,
  fallbackAdd: 'Add this fallback',
  narrow: (said: string) => `Only take messages that say “${said}”`,
  tryLead: 'The rule, tried on every sample',
  claimed: (n: number, of: number) => `It takes ${n} of ${of} messages.`,
  fieldRead: (field: string, n: number, of: number) => `${field}: read in ${n} of ${of}`,
  save: 'Save the rule',
  suggest: 'Suggest this rule',
  saving: 'Saving',
  saved: 'Saved. What it reads waits in Needs you until you trust it.',
  trustedNote: 'Trusted. It files each message as it arrives.',
  accepted: (n: number, of: number) => `${n} of ${of} accepted`,
  noneYet: 'Nothing has arrived for it yet.',
  trust: 'Trust it now',
  suggested: 'Suggested. It waits in Needs you.',
  question: (from: string) => (from ? `A rule for the messages from ${from}` : 'A rule for messages like these'),
  missing: (n: number) => (n === 1 ? 'One sample is not in the inbox any more, so it is left out.' : `${n} samples are not in the inbox any more, so they are left out.`),
  needsSample: 'A suggestion carries at least one message from the inbox, so whoever answers can check it.',
  needsList: 'Pick where it files first.',
  unreached: 'BrainDog could not reach this record.',
  retry: 'Try again',
  noSamples: 'No messages to make a rule from',
  noSamplesBody: 'Paste a message, or pick alike ones in the Inbox.',
  toInbox: 'Go to the Inbox',
  cantOpen: 'The builder cannot open this rule: it reads a web answer rather than the words of a message.',
  rawOf: (raw: string) => `From the text “${raw}”`,
  showRaw: 'Show the text it came from',
};

/** A value as a cell shows it: money as its figure and code, and anything else as its words. */
export function valueSaid(v: Json | null): string {
  if (v === null) return '';
  if (typeof v === 'object' && !Array.isArray(v) && typeof v.amount === 'number' && typeof v.currency === 'string') return money(v.amount, v.currency);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** A date format as a date written that way: `DD/MM/YYYY` is `31/12/2026`. */
export function formatSaid(format: string): string {
  /* TOKEN BY TOKEN, LONGEST FIRST, so the month's name never has its own letters read as a day. */
  const TOKENS: readonly (readonly [string, string])[] = [['YYYY', '2026'], ['MMM', 'Dec'], ['YY', '26'], ['MM', '12'], ['DD', '31'], ['M', '12'], ['D', '31']];
  let out = '';
  for (let i = 0; i < format.length; ) {
    const hit = TOKENS.find(([t]) => format.startsWith(t, i));
    if (hit) {
      out += hit[1];
      i += hit[0].length;
    } else {
      out += format[i];
      i += 1;
    }
  }
  return out;
}

const quoted = (s: unknown): string => (s === '\n' ? 'the end of the line' : `“${String(s)}”`);

/** Where a reading looks, in words: after, before or between two landmarks. */
function whereSaid(spec: Record<string, unknown>): string {
  if (Array.isArray(spec.between)) return `between ${quoted(spec.between[0])} and ${quoted(spec.between[1])}`;
  if (spec.after !== undefined && spec.before !== undefined) return `after ${quoted(spec.after)}, up to ${quoted(spec.before)}`;
  if (spec.after !== undefined) return `after ${quoted(spec.after)}`;
  if (spec.before !== undefined) return `before ${quoted(spec.before)}`;
  return 'anywhere in the message';
}

const WHAT: Readonly<Record<string, string>> = {
  money: 'the amount',
  date: 'the date',
  int: 'the number',
  decimal: 'the number',
  text: 'the words',
  enum: 'the word',
  lookup: 'the name',
};

/** A reading in words: "the amount after “Amount:”", with its other ways and its fallback after it. */
export function readingSaid(how: Json, depth = 0): string {
  if (typeof how !== 'object' || how === null || Array.isArray(how) || depth > 3) return 'a way the builder cannot say';
  if (Array.isArray(how.first)) return how.first.map((arm) => readingSaid(arm, depth + 1)).join(', or else ');
  const fallback = how.default;
  if (typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback))
    return `${readingSaid(fallback.of ?? null, depth + 1)}, or ${valueSaid(fallback.value ?? null)} when it is missing`;
  const nth = how.nth;
  if (typeof nth === 'object' && nth !== null && !Array.isArray(nth))
    return `${readingSaid(nth.of ?? null, depth + 1)}, taking number ${String(nth.n)} of those it finds`;
  if ('after' in how || 'before' in how || 'between' in how) return `the text ${whereSaid(how)}`;
  const key = Object.keys(how).find((k) => k !== 'note' && k !== 'strip');
  if (key === undefined) return 'a way the builder cannot say';
  const spec = how[key];
  const inner = typeof spec === 'object' && spec !== null && !Array.isArray(spec) ? spec : {};
  const what = Object.hasOwn(WHAT, key) ? WHAT[key]! : 'the value';
  const format = key === 'date' && typeof inner.format === 'string' ? ` written like ${formatSaid(inner.format)}` : '';
  return `${what}${format} ${whereSaid(inner)}`;
}
