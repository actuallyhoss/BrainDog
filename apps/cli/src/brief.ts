/**
 * The card an agent starts from: what the start hook prints, which Claude Code adds to the model's context before its
 * first turn, and what `braindog context` prints on demand.
 *
 * ONE CARD, THE RECORD'S (`packages/record/src/card.ts`, AGT-B07; "the same card from context" and
 * "keep MCP/HTTP/CLI one core", HD.316). The record draws it, with the slots, their order and their caps, and sends it
 * as `card` on `context`; this prints it as it came, each line scrubbed of what a terminal would obey, and held to the
 * characters Claude Code shows of a hook. This command composes no card of its own: a second composer here was a second
 * set of rules, and the card a session read was whatever the command file on the machine was built with.
 *
 * A HOST TOO OLD TO SEND A CARD gets one line, `Connected to <record>. Call context.`, and nothing drawn in its place.
 * The line that says this command is older than the host is `main.ts`'s, printed under it as it was.
 */

import type { Attached, Context } from '@braindog/client';

import { oneLine } from './clip.ts';

/** The whole card, in characters. Claude Code previews the first 2,000 of a hook's output that runs past its cap. */
export const MAX_CHARS = 1_500;

/** Said word for word whenever another run is working in the same repository (`docs/32-PARITY.md:142`): the record's card says it. */
export const TWO_SESSIONS = 'Two sessions in one working tree overwrite each other. Coordinate or stop.';

/**
 * Who and where, for the first line. `device` is the machine as a person names it ("MacBook Pro"), and `agent` the app
 * the session runs in when it is known. `host` is the machine's network name, carried because a position has one, and
 * never printed.
 */
export type Where = { repo: string | null; host: string; device?: string | undefined; agent?: string | null | undefined };

/** Commits HEAD moved since the handoff; `null` when it moved and git cannot count it; `undefined` when it did not. */
export type Moved = number | null | undefined;

/** How long ago, in words, as `braindog session show` says it. */
export function ago(seconds: number): string {
  if (seconds < 60) return 'just now';
  const [n, unit] = seconds < 3_600 ? [Math.floor(seconds / 60), 'minute'] : seconds < 86_400 ? [Math.floor(seconds / 3_600), 'hour'] : [Math.floor(seconds / 86_400), 'day'];
  return `${String(n)} ${unit}${n === 1 ? '' : 's'} ago`;
}

/* An em dash, or an en dash with a space on each side, standing in for a comma. An en dash in a range is left. */
const DASH = /\s*—\s*|\s+–\s+/gu;

/**
 * Somebody else's words on one line, cut at a word once they pass `max` characters.
 *
 * AT A WORD, NEVER INSIDE ONE. `clip` cuts where the count runs out, and the old briefing printed one question twice as
 * "fix the ..." and "fix th...". A dash between two clauses becomes a comma, the house rule for what a person reads.
 */
export function words(said: string, max: number): string {
  const flat = [...oneLine(said).replace(DASH, ', ').replace(/^,\s*/u, '')];
  if (flat.length <= max) return flat.join('');
  const cut = flat.slice(0, Math.max(1, max - 1)).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/u, '')}…`;
}

/** A line of the card cut at a word, its own spacing kept, for the one case where a whole line is still too long. */
function cutLine(line: string, max: number): string {
  const points = [...line];
  if (points.length <= max) return line;
  const cut = points.slice(0, Math.max(1, max - 1)).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const size = (text: string): number => [...text].length;

/** A run's state that is working or able to: anything else has ended, and is not where a session starts. */
export const live = (state: string | null): boolean => state === null || state === 'active' || state === 'idle';

/* ── the first line `braindog context` names its run by ───────────────── */

/** The folder's project, as `braindog context`'s headline names it. */
export function placeOf(c: Context | undefined): string {
  if (c?.project) return `project ${words(c.project.name, 40)}`;
  if (c && c.ambiguous.length > 0) return `${String(c.ambiguous.length)} projects match this folder`;
  return 'no project';
}

/** The app and the machine: "Claude Code on MacBook Pro", or "on MacBook Pro" when nobody said which app. */
function whoOf(at: Where): string {
  const device = words(at.device ?? '', 40) || 'this machine';
  const agent = at.agent ? words(at.agent, 24) : '';
  return agent ? `${agent} on ${device}` : `on ${device}`;
}

/** BrainDog, the run, the project, and the app and machine it runs on, with nothing between left empty. */
export const firstLine = (run: string, place: string, at: Where): string => ['BrainDog', run, place, whoOf(at)].filter(Boolean).join(' · ');

/* ── the record's own card ─────────────────────────────────────────────── */

/**
 * The card the record drew, when its context carries one, each line scrubbed; else `null`.
 *
 * SCRUBBED AND NOT REWORDED. The record's words are printed as they came, but a terminal obeys what it is handed, so
 * every control and format character goes, as `clip` takes them out of every other line. The run of spaces after a
 * slot's label is the card's own layout, and stays.
 */
export function cardOf(c: Context | undefined): string[] | null {
  return scrubbed(c === undefined ? undefined : (c as { card?: unknown }).card);
}

/** A text the record drew, as lines with every control and format character gone and a slot's layout kept; else `null`. */
function scrubbed(text: unknown): string[] | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lines = text
    .split(/\r?\n/u)
    .map((line) => {
      const slot = /^(\S+)( {2,})(\S.*)$/u.exec(line);
      return slot ? `${oneLine(slot[1]!)}${slot[2]!}${oneLine(slot[3]!)}` : oneLine(line);
    })
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

/** Lines held to the cap: the first always, cut at a word when it alone is too long, then as many whole lines as fit. */
export function fitLines(lines: string[]): string {
  const kept: string[] = [];
  let left = MAX_CHARS;
  for (const line of lines) {
    const room = left - (kept.length > 0 ? 1 : 0);
    if (room <= 1) break;
    const shown = kept.length === 0 || size(line) <= room ? cutLine(line, room) : null;
    if (shown === null) break;
    kept.push(shown);
    left = room - size(shown);
  }
  return kept.join('\n');
}

/* ── a host that sends none ────────────────────────────────────────────── */

/* A ULID, which names nobody. */
const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/u;

/**
 * The one line a host with no card is told: which record answered, and the call that has the rest. The record by the
 * name the caller knows it by, never an id, and BrainDog when the caller knows none.
 */
export function connected(record?: string | null): string {
  const named = record ? words(record, 60) : '';
  return `Connected to ${named && !ULID.test(named) ? named : 'BrainDog'}. Call context.`;
}

/**
 * What a caller tells the card beyond the context: the record's name for the one line. The rest is what the composer
 * that is gone read (the skills sync's items, whom the questions wait on, how many wait), still accepted from the
 * callers that pass it and read by nothing: the record's card says all of it.
 */
export type CardFor = {
  record?: string | null | undefined;
  own?: string | null | undefined;
  agent?: string | null | undefined;
  more?: string[] | undefined;
  decider?: string | null | undefined;
  waiting?: number | null | undefined;
};

/**
 * `braindog context`'s card: the record's, else the one line. The head and the commits moved are the composer's that is
 * gone, still taken from the caller that passes them and never printed: the record's card names the run and counts the
 * commits itself (`x-braindog-ahead`).
 */
export function briefingOf(_head: string, c: Context | undefined, _moved?: Moved, o: CardFor = {}): string {
  const card = cardOf(c);
  return card ? fitLines(card) : connected(o.record);
}

/** The start hook's card: the record's own as it drew it, else the one line. */
export function briefing(attached: Attached, _at: Where, _moved: Moved, o: CardFor = {}): string {
  const card = cardOf(attached.context);
  return card ? fitLines(card) : connected(o.record);
}

/**
 * The Next line alone, for a session that just compacted: the step it is on, without what it already read. `null` when
 * there is no step, and then the hook prints nothing.
 *
 * THE RECORD'S `card_next`: its Next line alone, scrubbed as the card is, and `null` from it means there is no
 * step. Only a record that drew a card without one has its card's Next line looked for, and a host that drew no card
 * has no Next line to give.
 */
export function nextLine(attached: Attached, _moved?: Moved): string | null {
  const c = attached.context;
  const card = cardOf(c);
  if (!card) return null;
  const said = (c as { card_next?: unknown }).card_next;
  if (said === null) return null;
  const next = scrubbed(said);
  if (next) return fitLines(next);
  const line = card.find((l) => /^Next\s/u.test(l));
  return line === undefined ? null : cutLine(line, MAX_CHARS);
}
