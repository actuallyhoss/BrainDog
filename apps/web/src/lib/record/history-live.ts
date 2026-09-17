/**
 * A row's history on `/r/<register>/<seq>`, read from the record, with the sample when there is none.
 *
 * A ROUTE-ONLY MODULE, like `search-live.ts`: the client carries the route table as a value.
 *
 * `UNREACHABLE` and `UNAUTHORIZED` mean there is no record here, and the sample's ledger is read the
 * way the page always read it. Any other refusal is the record's own sentence.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { AUDIT, display, labelOf, NOW, REGISTERS } from './api.ts';
import { noRecord } from './device.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/** One line of a row's history: who, what, and when, newest first. */
export type Line = { by: string; note: string; at: string };

/** `now` is the clock `since` reads against: the reader's for the record, the sample's own otherwise. */
export type Told = { from: 'live' | 'sample'; lines: Line[]; now: number } | { from: 'refused'; fix: string };

/** An event as the record's `history` sends it, and only the keys read here. */
export type Event = {
  ts: string;
  actor: string;
  kind: string;
  field?: string | null;
  from?: unknown;
  to?: unknown;
  note?: string | null;
};

export const sampleLines = (register: string, seq: number): Line[] =>
  AUDIT.filter((e) => e.target === `${register}#${seq}`).map((e) => ({ by: e.by, note: e.note, at: e.at }));

/**
 * An event in words, when it carries no note of its own.
 *
 * THE SAMPLE'S SHAPE, "state from open to done", because the page draws both and one register on
 * one screen reads better than two. A value is drawn the way the row's own fields draw it.
 */
export function noteOf(register: string, e: Event): string {
  if (e.note) return e.note;
  if (e.kind === 'create') return 'created';
  if (!e.field) return e.kind.replace(/[._]/g, ' ');
  const f = REGISTERS[register]?.fields.find((x) => x.id === e.field);
  const name = f ? labelOf(f).toLowerCase() : e.field.replace(/_/g, ' ');
  /* A LINK IS HELD AS THE ROW'S ID, which names nothing to a reader: Home read "cycle set to cycles#01M2PAZ…" once a use
     case's examples were linked. The event does not carry the row's title, so a link is said without its value. */
  const id = (v: unknown): boolean => typeof v === 'string' && /^(?:[a-z][a-z0-9_]*#)?[0-9A-HJKMNP-TV-Z]{26}$/u.test(v);
  if (f?.type === 'ref' || id(e.to) || id(e.from)) return e.to === null || e.to === undefined || e.to === '' ? `${name} cleared` : e.from === null || e.from === undefined || e.from === '' ? `${name} set` : `${name} changed`;
  const was = display(register, e.field, e.from);
  const now = display(register, e.field, e.to);
  if (now === null) return `${name} cleared`;
  return was === null ? `${name} set to ${now}` : `${name} from ${was} to ${now}`;
}

/* A RULE IS `rule:<id>` ON THE RECORD AND `rule.<id>` IN THE SAMPLE, and `actorOf` words the second. */
const actor = (a: string): string => a.replace(/^rule:/u, 'rule.');

/** The record's events, oldest first, as the page's lines, newest first. */
export const linesOf = (register: string, events: readonly Event[]): Line[] =>
  events.map((e) => ({ by: actor(e.actor), note: noteOf(register, e), at: e.ts })).reverse();

/** One row's history. A row with no number the record could hold (a pending one) asks nothing. */
export async function readHistory(base: string, register: string, seq: number, io?: Fetch): Promise<Told> {
  if (!Number.isInteger(seq) || seq < 1) return { from: 'sample', lines: [], now: NOW };
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.history(register, seq);
  if (out.ok) return { from: 'live', lines: linesOf(register, out.value as Event[]), now: Date.now() };
  if ('refusal' in out && noRecord(out.refusal.code)) return { from: 'sample', lines: sampleLines(register, seq), now: NOW };
  return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : 'The row changed while it was being read.' };
}
