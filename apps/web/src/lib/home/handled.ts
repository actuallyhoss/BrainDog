/**
 * What BrainDog arranged by itself today, as one tile on Today (`Handled.svelte`). A change that only
 * arranges his own rows happens with a mark, the reason and an Undo, and is told here in a short list instead of being
 * asked on Decide. One line each, the record's reason under it, and one Undo that puts that whole batch back.
 *
 * THROUGH THE RECORD'S OWN `handled` AND NOTHING ELSE. A line with no decision handle, or no words, or words that are a
 * raw id (a ULID), is dropped. Nothing is drawn at nought, and it never fails the screen: a host built before the read
 * answers `ROUTE_UNKNOWN` or a refusal, and either is `null`.
 *
 * AND WHAT AN AGENT FINISHED OF WHAT HE TOLD IT (agents and MCP plan §7.2: "Finished instructions land in Handled"),
 * from the shell's read of his instructions (`told-now.svelte.ts`) and never a read of its own: one line each, "Claude
 * finished “Merge wave 1”", the agent's reply under it with what it changed, and Undo all over those changes where it
 * changed something in BrainDog (`undoAll` in `record/instruct.ts`).
 *
 * A ROUTE-ONLY MODULE, like `learned.ts`: imported lazily from the screen that draws it, never by anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';
import type { Receipts, Thread } from '../record/instruct.ts';
import { answeredBy, doneToday, saidShort } from '../record/told-live.ts';

/** How many lines the tile lists. The record sends at most twenty; the rest are counted in one line. */
export const HANDLED_SHOWN = 5;

/** The tile's words, the same on every record. */
export const HANDLED_WORDS = {
  heading: 'Handled today',
  undo: 'Undo',
  undone: 'Put back.',
  more: (n: number) => `and ${String(n)} more`,
  /** The press that opens the lines past the first five, in place. */
  open: (n: number) => `${String(n)} more`,
} as const;

/**
 * One thing BrainDog did: the decision that puts it back, one line, the reason under it, and when. A line about what an
 * agent finished of what he told it carries the run's receipts instead (`told`), which its Undo puts back.
 */
/* A QUESTION THAT TOOK ITSELF BACK (`withdrawn`, the record's `sweepStale` and `recheck`) wrote nothing, so it has no Undo. */
export type HandledLine = { decision: string; line: string; why: string; at: string | null; told?: Receipts | null; withdrawn?: true };

/** What the record answers: today's lines newest first and how many it held back past its own limit. */
export type Handled = { rows: HandledLine[]; more: number };

/**
 * What the tile draws: its heading, the first lines, and "and N more" for the rest, or empty. `opens` is how many more
 * lines the record sent that a press on "N more" opens in place; `more` is then only what the record held back.
 */
export type HandledTile = { heading: string; lines: HandledLine[]; more: string; opens: number };

/** How the screen asks the record: a client's `call`, or anything shaped like it. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** A raw id as the record mints one. Never a line a person reads. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** Trimmed text, with no em dash in what a person reads. */
const plain = (v: unknown): string => (typeof v === 'string' ? v.replaceAll(/\s*—\s*/gu, ', ').trim() : '');

function rowOf(v: unknown): HandledLine | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as { decision?: unknown; line?: unknown; why?: unknown; at?: unknown; withdrawn?: unknown };
  const decision = plain(r.decision);
  const line = plain(r.line);
  if (decision === '' || line === '' || ULID.test(line)) return null;
  const at = plain(r.at);
  return { decision, line, why: plain(r.why), at: at === '' ? null : at, ...(r.withdrawn === true ? { withdrawn: true as const } : {}) };
}

/** The record's answer as what the screen holds, or `null` for a refusal or an answer of another shape. */
export function handledOf(answer: unknown): Handled | null {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true || typeof a.value !== 'object' || a.value === null) return null;
  const v = a.value as { rows?: unknown; more?: unknown };
  if (!Array.isArray(v.rows)) return null;
  const rows = v.rows.map(rowOf).filter((r): r is HandledLine => r !== null);
  const more = typeof v.more === 'number' && Number.isInteger(v.more) && v.more > 0 ? v.more : 0;
  return { rows, more };
}

/** Ask the record's `handled`. `null` on a refusal, an unknown method, nought, or a call that threw. */
export async function readHandled(call: Call): Promise<Handled | null> {
  try {
    const found = handledOf(await call('handled', {}));
    return found && found.rows.length > 0 ? found : null;
  } catch {
    return null;
  }
}

/** What the record at `base` arranged today. `null` for none, which draws nothing. */
export async function loadHandled(base: string, io?: Fetch): Promise<Handled | null> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return await readHandled((name, args) => client.call(name, args));
  } catch {
    return null;
  }
}

/**
 * The tile: the first lines and the count of the rest. `null` at nought, which draws nothing.
 *
 * "N MORE" OPENS THE REST (plan of 20 October, Daily use: "and 38 more" was not a link). The lines the record sent past
 * the first five are a press away (`opens`), and once `open` they are all drawn; only what the record itself held back
 * past its own limit stays a count, since nothing here holds it.
 */
export function handledTile(found: Handled | null, open = false): HandledTile | null {
  if (!found || found.rows.length === 0) return null;
  const lines = open ? found.rows : found.rows.slice(0, HANDLED_SHOWN);
  const opens = found.rows.length - lines.length;
  const rest = opens + found.more;
  return { heading: HANDLED_WORDS.heading, lines, more: rest > 0 ? HANDLED_WORDS.more(rest) : '', opens };
}

/** How many changes, said: "3 changes". */
const changesSaid = (n: number): string => `${String(n)} ${n === 1 ? 'change' : 'changes'}`;

/**
 * What an agent finished today of what he told it, as Handled's lines, newest first: who and what, the reply under it
 * with how many changes it made, and the receipts its Undo puts back. On the record's clock (`now`).
 */
export function toldHandled(done: readonly Thread[], agents: Readonly<Record<string, string>>, now: number): HandledLine[] {
  return doneToday(done, now).map((t) => {
    const changes = t.receipts?.changes ?? 0;
    const reply = t.reply?.replace(/\s+/gu, ' ').trim() ?? '';
    return {
      decision: `told:${t.id}`,
      line: `${answeredBy(t, agents)} finished “${saidShort(t.said)}”`,
      why: [reply, changes > 0 ? changesSaid(changes) : ''].filter((x) => x !== '').join(' · '),
      at: t.replied_at ?? t.updated_at,
      told: t.receipts ?? null,
    };
  });
}

/** What BrainDog did and what agents finished, one list, newest first; `null` when there is neither. */
export function withTold(found: Handled | null, told: readonly HandledLine[]): Handled | null {
  if (told.length === 0) return found;
  const rows = [...(found?.rows ?? []), ...told].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  return { rows, more: found?.more ?? 0 };
}

/** How many lines are BrainDog's own, which Today's foot says as "BrainDog handled 15 itself today". */
export const ownCount = (found: Handled | null): number => (found ? found.rows.filter((r) => r.told === undefined).length + found.more : 0);
