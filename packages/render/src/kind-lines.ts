/**
 * One line a kind, said to an agent: what the kind is for, its cells, its forms and what it reads.
 *
 * THE TABLE SAID ALL OF IT AND REACHED NO AGENT. What a kind is for, its cells and its forms were comments beside its
 * entry in `kinds.ts`, and the grammar an agent is handed listed the forty by name and nothing more, so `spec`,
 * the block a page reaches for most, was called the workhorse in a code comment only (PGS-A08). These lines are what
 * the record's `grammar/kinds` says (`packages/record/src/grammar.ts`), one each, short enough to read in a turn.
 *
 * `Record<Kind, ...>` SO A KIND ADDED TO THE TABLE WITHOUT ITS LINE DOES NOT COMPILE, and `kind-lines.test.ts` holds
 * the same from the other side, in case a cast ever lets one through. The forms and whether a kind is page-only are
 * read off `KINDS` and never written twice.
 *
 * NO WORD HERE NAMES A THING BY ITS ID OR CALLS AN ENTRY A ROW, because what an agent reads it says back to a person.
 */

import { KINDS, type Kind } from './kinds.ts';

/** What a kind is for, its cells in order, and, where it is not a list or entries written out, what it reads. */
export type KindLine = { readonly for: string; readonly cells: string; readonly reads?: string };

export const KIND_LINES: Readonly<Record<Kind, KindLine>> = {
  note: { for: 'to say something: a sentence or a few paragraphs', cells: "prose in body; the lead form is the page's opening sentence, said from its figures" },
  quote: { for: 'words someone said, set apart', cells: 'words | who' },
  stat: { for: 'a number that matters now, up to six side by side', cells: 'label | figure | note | trend' },
  bar: { for: 'amounts side by side as bars, to compare', cells: 'label | value | note' },
  gauge: { for: 'one figure against its target', cells: 'label | value | target' },
  chips: { for: 'a few short counts or states as pills', cells: 'label | value | note' },
  sparkline: { for: 'a small line and the figure it ends at', cells: 'label | 18 20 19 24 | figure' },
  split: { for: 'parts of a whole on one track, with a legend', cells: 'label | value | note' },
  bridge: { for: 'from a first figure to a last, the steps between moving it', cells: 'label | +amount or -amount | note' },
  series: { for: 'money in and out over time, as bars above and below zero', cells: 'a header, then bucket | in | out' },
  lines: { for: 'a measure over time as a line, the period before dashed', cells: 'a header, then day | value | was' },
  progress: { for: 'tracks filled toward targets; budget marks spending past a limit', cells: 'label | value | target | note' },
  forecast: { for: 'cash walked forward to the horizon', cells: 'opening | day | label | balance', reads: 'forecast.runway' },
  ring: { for: 'a small dial: one goal reached so far, or two to five parts of a whole', cells: 'label | value | target' },
  spec: { for: 'the block to reach for most: a name, a value, a note', cells: 'name | value | note' },
  params: { for: 'the settings or inputs something runs with', cells: 'name | value | note' },
  todo: { for: 'tasks to tick, with two quiet facts under each', cells: 'title | detail | fact | fact' },
  steps: { for: 'an ordered path; path marks what is done and what is next', cells: 'title | detail | done or next' },
  timeline: { for: 'what happened, grouped by day', cells: 'day | title | detail' },
  board: { for: 'cards in columns by state', cells: 'state | title | fact | fact' },
  heat: { for: 'twelve weeks of days, each shaded by how busy it was; the who form draws a line for each person', cells: 'day | value' },
  roadmap: { for: 'tasks as bars ending on their due days', cells: 'title | due day | effort in days' },
  code: { for: 'code or a command, kept exactly', cells: 'lines as written' },
  tree: { for: 'a folder or outline, kept exactly as indented', cells: 'indented lines' },
  comparison: { for: 'options side by side, an aspect each line', cells: 'a header of the options, then aspect | each' },
  table: { for: 'many entries of a list in real columns', cells: 'the columns asked for', reads: 'a list' },
  cards: { for: 'entries as cards, each with a figure, facts and a mark', cells: 'a header naming each column on a card', reads: 'a list' },
  section: { for: 'a heading that groups the blocks after it, and may fold', cells: 'glyph | count | fold | tone' },
  feed: { for: 'what happened on the record, newest first', cells: 'by | who | count | what | when', reads: 'activity' },
  diff: { for: 'what changed between two texts', cells: 'lines marked - or + or two spaces' },
  agents: { for: 'what each agent did, grouped by agent', cells: 'who | count | what | when', reads: 'activity' },
  queue: { for: 'questions waiting on a person and their ways to answer', cells: 'q and opt lines', reads: 'governance.open' },
  capture: { for: 'the one-line add into a list', cells: 'into | list | label | where, then set | field | value', reads: 'a list' },
  inputs: { for: 'a few fields of one entry to type into', cells: 'field | label | type | value', reads: 'one entry' },
  calendar: { for: 'months as weeks, each day naming what falls on it', cells: 'title | day' },
  lanes: { for: 'spans of time side by side, with a line at now', cells: 'title | start | end' },
  link: { for: 'addresses to open, each with its host', cells: 'title | url | note | icon' },
  gallery: { for: 'pictures as tiles with captions', cells: 'caption | file' },
  embed: { for: 'one video, map or design from a known provider', cells: 'url | title | aspect, one entry written by hand' },
  form: { for: 'a few questions a person answers, then one button that adds the answers to a list', cells: 'its fields, each a question and its box, said in the page', reads: 'a list' },
  kpis: { for: "a project's key numbers, or the few that lead Today", cells: 'for: project, today or cards', reads: 'kpis' },
};

/** The ten lines of what to reach for, in the order a page is usually built. */
export const REACH_FOR: readonly string[] = [
  'to say something: note',
  'a number: stat',
  'names and values: spec',
  'many entries in columns: table',
  'tasks: todo',
  'parts of a whole: split',
  'over time: series or lines',
  'a path: steps',
  'by day: timeline or calendar',
  'by state: board',
];

/** A kind's one line: what it is for, its cells, its forms, and what it reads where that is not a list or entries written out. */
export function kindLine(kind: Kind): string {
  const line = KIND_LINES[kind];
  const spec = KINDS[kind];
  const forms = spec.forms && spec.forms.length > 0 ? ` Forms: ${spec.forms.join(', ')}.` : '';
  const reads = line.reads ? ` Reads ${line.reads}${spec.pageOnly ? ', on a page only' : ''}.` : spec.pageOnly ? ' On a page only.' : '';
  return `${line.for}. ${line.cells}.${forms}${reads}`;
}
