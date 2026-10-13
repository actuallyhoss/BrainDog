/**
 * What a question card decides without a DOM: its words, who asked in words a person reads, and the ways to answer. The
 * one decision card (`lib/decide/card.ts`, `DecisionCard.svelte`) builds on these, and `QueueAnswer.svelte` draws it.
 *
 * PURE, AND NODE LOADS IT (relative `.ts` imports, no runes), so `blocks.ts` can say the proposer the same way on the
 * read-only queue the renderer draws, and a card and the fence under it never name one asker two ways.
 *
 * NO READING OF ITS OWN. The asker is worded by `names.ts`'s `actor` from what the caller holds (the reader's id and the
 * people `boot` named), as every other screen words an actor.
 */

import type { QueueQuestion } from '@braindog/kernel';
import { day, fileSrc, relative, showsOf } from 'braindog-render';

import { citedWords } from '../cite.ts';
import { copy } from '../copy.ts';
import { moneyInText } from '../record/money.ts';
import { actor, type Actor } from '../record/names.ts';
import { spoken } from '../decide/spoken.ts';
import { mergeOf, type Merge } from '../../routes/decide/merge.ts';

/** The care a hard answer asks for, said at the end of its button's name. */
const HARD_TAIL = ', can’t be undone easily';

/**
 * THE CARD'S OWN WORDS, in a `words` object in a module this card owns rather than the copy aggregate, by the rule every
 * area keeps. "Suggested" is the one word for a recommended option.
 */
export const queueWords = {
  /** The label over the one line a question opens when the record wants a reason. */
  why: 'Why? (one line)',
  send: 'Send',
  suggested: 'Suggested',
  /** The button that answers a question of options with the one chosen (DIRECTION §39, "Decide reads like a form"). */
  decide: 'Decide',
  /** Putting a question off, said as a person says it: the button opens the question's own page at the step. */
  notNow: 'Not now',
  /** A button whose answer is hard to take back says so in its own words, not in a chip beside it. */
  hard: (verb: string) => `${verb}${HARD_TAIL}`,
  /** The same care, as the end of a button whose name is drawn on its own. */
  hardTail: HARD_TAIL,
  /** Said with the suggested answer's name to a screen reader, where the eye reads the accent's fill. */
  suggestedSaid: ', suggested',
  /** A question shown outside Decide whose answers are too many for a row: its own page, where they are chosen. */
  choose: 'Choose on Decide',
  /** The last line of a compact queue: how many more wait, and the door to them. */
  moreOnDecide: (n: number) => `${n.toLocaleString('en-GB')} more on Decide`,
  /** The choices' name for a screen reader: the question's answers, one of them chosen. */
  choices: 'The answers',
  /** What a proposal that changes something links to, where its whole change is laid out before anybody accepts it. */
  seeWhole: 'See what it changes',
  /**
   * A row the proposal would change moved after it was filed. Decide's own sentence for this says the question "has
   * been read again", which Decide does and this card does not, so the card says only what happened.
   */
  moved: 'Something this would change has changed since it was proposed, so nothing was written.',
  /** A rule that asked, by its name, so a reader knows a person did not. */
  rule: (name: string) => `A rule: ${name}`,
  /** The line a card becomes once it is answered: what was chosen, by whom, and when. */
  answered: (option: string, when: string) => `${option} · you, ${when}`,
  /** A question put off (`governance.later`): the day it comes back to the reader. */
  back: (when: string) => `Comes back ${when}`,
  /** An answer whose whole title was an address or an id, which `spoken` leaves empty: said by its place instead. */
  nth: (n: number) => `Answer ${n.toLocaleString('en-GB')}`,
  /** Beside a question joined from several: how many things answering it changes. */
  joined: (n: number) => `· ${n.toLocaleString('en-GB')} changes`,
} as const;

/** THE MOST QUESTIONS A COMPACT QUEUE SHOWS (Home, a declared page): the rest are a count that opens Decide. */
export const COMPACT_MOST = 3;

/**
 * A QUEUE SHOWN OUTSIDE DECIDE: at most three questions, and how many more wait on Decide. `total` is the block's count
 * of what is open, which may be more than it was handed; it is never read as less than what was handed.
 */
export function compactOf<T>(queue: readonly T[], total: number = queue.length): { shown: T[]; more: number } {
  const shown = queue.slice(0, COMPACT_MOST);
  return { shown, more: Math.max(total, queue.length) - shown.length };
}

/**
 * A rule's name as the middle of a sentence: its first letter lowered, unless the name opens on a run of capitals (an
 * initialism such as "SMS"), which keeps its spelling.
 */
const inSentence = (name: string): string => (/^\p{Lu}{2}/u.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1));

/**
 * Who opened a question, as a face and a name: "Claude", "A rule: chase late payments", "Slash", "You", a person by the
 * name the record gave them, never `p_seed` or `rule:cash-stale`.
 *
 * `actor` SAYS EVERY SHAPE, and this adds one thing to it: a rule's name is said as a rule's, because on a card with no
 * face beside it ("Keep balances current" in the renderer's by-line) a rule's name reads as a person's request.
 */
export function proposer(who: string, me: string | null = null, names: ReadonlyMap<string, string> = new Map()): Actor {
  const said = actor(who, me, names);
  return said.kind === 'rule' ? { name: queueWords.rule(inSentence(said.name)), kind: 'rule' } : said;
}

/** What an option is, where the card can draw it: its colours, a few words or a figure, or a picture the page serves. */
export type Visual = { swatch: string[] } | { figure: string } | { file: { row: string; field: string; src: string } };

/**
 * WHERE A PAGE SERVES A FILE IT HOLDS, by the row and the field (`BlockSlot.svelte`, the renderer's `RenderOptions.file`):
 * an address, or `null` for a file the page does not hold.
 */
export type FileAt = (row: string, field: string) => string | null | undefined;

/**
 * THE NAME THE PAGE'S WAY TO A FILE IS HANDED DOWN UNDER (`QueueAnswer.svelte` sets it, the card under it reads it), so
 * the card asks the page that drew it and holds no address of its own.
 */
export const QUEUE_FILE = 'queue-file';

/**
 * An option's visual, held to the renderer's own reading first (`showsOf`), or `null`.
 *
 * THE SAME CHECK THE FENCE MAKES (`blocks.ts` `showsCell`), because a swatch is the one colour from the record that
 * reaches a style, and a spelling the renderer would refuse is left out rather than written into `--swatch`.
 *
 * A FILE IS A PICTURE ONLY WHERE THE PAGE SAYS WHERE IT IS SERVED (`file`), and only from this host: the address rides
 * on the visual once `fileSrc` has passed it, the check the renderer's own tile makes, since a picture loaded from
 * elsewhere tells another host who is reading and when. A card handed no way to an address, a file the page does not
 * hold and an address of another host all leave the visual out, and the option reads by its name.
 *
 * A FIGURE IS WORDS SOMEBODY ELSE WROTE, as the label is, so it is read through `spoken` too (audit 72 #3), and it is
 * drawn only when `spoken` takes nothing out of it: "3" is not what "3 of tasks#8" said, and a figure with a part gone
 * would be a number nobody wrote. A citation in braces is no figure either. Such an option reads by its name.
 */
export function visualOf(shows: unknown, file?: FileAt): Visual | null {
  if (shows === null || typeof shows !== 'object') return null;
  const s = shows as { swatch?: unknown; figure?: unknown; file?: unknown };
  const cell = Array.isArray(s.swatch) ? `swatch:${s.swatch.join(',')}` : typeof s.figure === 'string' ? figureCell(s.figure) : fileCell(s.file);
  const read = cell === '' ? null : showsOf(cell);
  if (read === null || !('file' in read)) return read;
  const src = file ? fileSrc(file(read.file.row, read.file.field)) : null;
  return src === null ? null : { file: { ...read.file, src } };
}

/** A figure as the renderer spells one (`figure:3 of 5`), or nothing for one that holds an address, an id or a citation. */
function figureCell(figure: string): string {
  const said = figure.trim();
  return said !== '' && !/\{\{|\}\}/u.test(said) && spoken(said) === said ? `figure:${said}` : '';
}

/** A file as the renderer spells one (`file:parts#2/photo`), or nothing for a value that names no row and field. */
function fileCell(file: unknown): string {
  if (file === null || typeof file !== 'object') return '';
  const { row, field } = file as { row?: unknown; field?: unknown };
  return typeof row === 'string' && typeof field === 'string' ? `file:${row}/${field}` : '';
}

/** One way to answer, in the words a reader sees, with what it is where it says. */
/** `hard` is an answer that cannot be taken back once picked (the record's mark on the option): said on its own button, given to no key. */
export type Way = { key: string; label: string; because: string; recommended: boolean; shows: Visual | null; hard: boolean };

/**
 * The ways to answer a question, in the record's order.
 *
 * AN `options` QUESTION CARRIES ITS OWN, and every other kind is accepted or rejected in this app's two words, the ones
 * `blocks.ts` writes for the renderer and `governance.ts` puts on Decide: the record sends no English for them.
 *
 * NO `{{ref:...}}` REACHES THE CARD: a Slash option's words carry citations, read here as their fallback words, and a
 * stored money sentence is drawn in the record's currency, as the renderer's fence is.
 *
 * NOR AN ADDRESS OR AN ID. Whoever asked wrote the answers too, and an agent titles one "Merge into rohan@x.com" as
 * readily as "Merge into Rohan": each label and reason is read through `spoken`, as the question is (audit 21 #4).
 *
 * `file` IS THE PAGE'S WAY TO A FILE IT HOLDS: with it an option that is a picture carries its address, and without it
 * the option reads by its name (`visualOf`).
 */
export function waysOf(q: Pick<QueueQuestion, 'options'>, file?: FileAt): Way[] {
  if (q.options.length === 0)
    return [
      { key: 'accept', label: copy.acceptIt, because: '', recommended: false, shows: null, hard: false },
      { key: 'reject', label: copy.rejectIt, because: '', recommended: false, shows: null, hard: false },
    ];
  return q.options.map((o, i) => ({
    key: o.key,
    label: spoken(saidOf(o.label)) || queueWords.nth(i + 1),
    because: spoken(saidOf(o.because)),
    recommended: o.recommended,
    shows: visualOf(o.shows, file),
    hard: o.hard === true,
  }));
}

/** A question's own words, and why it is asked, as the card draws them: citations as words, money in the record's currency. */
export const saidOf = (text: string): string => moneyInText(citedWords(text));

/**
 * A DAY SAID THE WAY DECIDE SAYS ONE: relative inside a week ("in 3 days", "tomorrow"), then the day and month, and the
 * year as well once it is another year. "on" leads a date so the line reads whole.
 */
function backDay(iso: string, now: number): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(d)) return '';
  if (Math.abs(Date.parse(`${d}T12:00:00Z`) - now) / 86_400_000 < 7) return relative(d, now);
  const said = day(d);
  const year = String(new Date(now).getUTCFullYear());
  return `on ${said.endsWith(` ${year}`) ? said.slice(0, -year.length - 1) : said}`;
}

/**
 * THE ONE QUIET LINE A QUESTION PUT OFF CARRIES (`governance.later` sends `until` and `until_why`): when it comes back,
 * and why it was put off, as Decide's classic list said it. `null` on any other question, or a day that does not read.
 * Whoever put it off wrote the reason, so it is read through `spoken` and no address or id in it reaches the card.
 */
export function laterLine(q: { until?: unknown; until_why?: unknown }, now: number): string | null {
  const when = typeof q.until === 'string' ? backDay(q.until, now) : '';
  if (when === '') return null;
  const why = typeof q.until_why === 'string' ? spoken(saidOf(q.until_why.trim())) : '';
  return why === '' ? queueWords.back(when) : `${queueWords.back(when)} · ${why}`;
}

/**
 * Whether a question changes something the reader should see whole before accepting it: every kind but `options`, which
 * is a choice between the answers written on the card itself.
 */
export const changesSomething = (q: Pick<QueueQuestion, 'kind'>): boolean => q.kind !== 'options';

/**
 * THE MERGE A QUEUE QUESTION ASKS, from the record's own `merge` on the question (`MergeCluster`) or the `candidates` the
 * kernel's queue sends beside it (`QueueQuestion`), or `null` for a question that is not one or a record on an older
 * build that sends neither.
 *
 * THE RECORD'S `merge` WINS, AND IS READ AS A QUESTION OF OPTIONS (`merge.ts` `fromOptions`): its candidates by name,
 * the one kept first, and its answers as the record offers them, Merge all (`merge`), Keep apart (`apart`) and one
 * Pick for each one folded (`pick:people#4`), each a `decide` with that option. The answers come from `merge.options`
 * and not from the card's own, which on a rowset are still Accept and Decline and still answer the question whole.
 * Where it was seen is newest first already, so it is handed over oldest first, as `seenOf` reads a dated list.
 *
 * WITHOUT IT, A QUESTION OF OPTIONS IS READ AS ITS OWN PAGE READS IT (`merge.ts` `mergeOf`). A ROWSET IS READ OFF ITS
 * CANDIDATES, since the queue does not carry the rows the question's page checks: the record's own cluster question
 * (`people.ts` `askCluster`) names every one it is about, one of them kept, and folds the others into it, one row each
 * plus at most one on the kept row. A rowset whose count of rows is not that is some other change, and keeps its two
 * answers. Accept is Merge all and Reject is Keep apart, and a rowset is answered whole, so no candidate carries a Pick.
 */
export function queueMergeOf(
  q: { kind: string; body_kind?: unknown; candidates?: unknown; held?: unknown; merge?: unknown },
  offered: readonly string[],
): Merge | null {
  const cluster = clusterOf(q.merge);
  if (cluster !== null) return mergeOf({ kind: 'options', body: { candidates: cluster.candidates } }, cluster.offered);
  const candidates = q.candidates;
  if (!Array.isArray(candidates)) return null;
  const kind = typeof q.body_kind === 'string' ? q.body_kind : q.kind;
  if (kind === 'options') return mergeOf({ kind, body: { candidates } }, offered);
  if (kind !== 'rowset' || !offered.includes('accept') || !offered.includes('reject')) return null;
  /* THE NAMES AND WHERE EACH WAS SEEN, worded as a question of options words them: no handle drawn as a name. */
  const read = mergeOf({ kind: 'options', body: { candidates } }, ['merge', 'apart']);
  if (read === null) return null;
  const kept = read.candidates.filter((c) => c.kept);
  const n = read.candidates.length;
  if (kept.length !== 1 || (q.held !== n - 1 && q.held !== n)) return null;
  return {
    candidates: [...kept, ...read.candidates.filter((c) => !c.kept)].map((c) => ({ ...c, pick: null })),
    all: { option: 'accept' },
    apart: { option: 'reject' },
  };
}

/**
 * THE RECORD'S `merge` (`MergeCluster`), narrowed: its candidates in the words `merge.ts` reads (`{ at, name, seen,
 * kept }`) and the keys of the answers it offers, or `null` where it is absent or not that shape. A record on another
 * build is read, not trusted, so a candidate with no handle, or an option with no key, makes it no merge at all.
 */
function clusterOf(v: unknown): { candidates: { at: string; name: string; seen: string[]; kept?: true }[]; offered: string[] } | null {
  if (v === null || typeof v !== 'object') return null;
  const { candidates, options } = v as { candidates?: unknown; options?: unknown };
  if (!Array.isArray(candidates) || !Array.isArray(options) || candidates.length < 2) return null;
  const read = candidates.map((c) => {
    if (c === null || typeof c !== 'object') return null;
    const { row, name, seen, keeps } = c as { row?: unknown; name?: unknown; seen?: unknown; keeps?: unknown };
    if (typeof row !== 'string' || row === '') return null;
    const lines = Array.isArray(seen) ? seen.filter((s): s is string => typeof s === 'string') : [];
    return { at: row, name: typeof name === 'string' ? name : '', seen: [...lines].reverse(), ...(keeps === true ? { kept: true as const } : {}) };
  });
  const offered = options.map((o) => (o !== null && typeof o === 'object' && typeof (o as { option?: unknown }).option === 'string' ? (o as { option: string }).option : ''));
  if (read.some((c) => c === null) || offered.some((k) => k === '')) return null;
  return { candidates: read as NonNullable<(typeof read)[number]>[], offered };
}
