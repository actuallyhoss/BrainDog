/**
 * A row's history on `/r/<register>/<seq>`, read from the record, and what History leads with: who signed what is new
 * since the reader last looked.
 *
 * A ROUTE-ONLY MODULE, like `search-live.ts`: the client carries the route table as a value.
 *
 * EVERY REFUSAL IS THE RECORD'S OWN SENTENCE. `UNREACHABLE` and `UNAUTHORIZED` at an address with no slug used to
 * read the sample's ledger instead, which put another business's history beside whatever row the address named; there
 * is no sample now (DIRECTION 26), so a host that did not answer says so and a 401 says to sign in.
 *
 * EVERY SENTENCE THE RECORD STORED LEAVES HERE THROUGH `moneyInText`, as the feed and the log leave `news-live.ts`. A
 * rule's note holds an amount the way a program reads it, "GBP 2,400.00", and a row's history printed it so; the screen
 * says it the way a person does, "£2,400.00" in the home currency and "$4,800.00 USD" in any other (design.md §5, DSN-4).
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { display, labelOf } from './api.ts';
import { REGISTERS } from './held.ts';
import { readBoot } from './boot-live.ts';
import { moneyInText } from './money.ts';
import { listName } from './names.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/** One line of a row's history: who, what, and when, newest first. */
export type Line = { by: string; note: string; at: string };

/** `now` is the clock `since` reads against: the reader's, since every line is the record's. */
export type Told = { from: 'live'; lines: Line[]; now: number } | { from: 'refused'; fix: string };

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

/**
 * THE FIELDS A `declare` LINE SAYS IT ADDED OR TOOK OFF, as the kernel writes them: "Added domain." and "Took off note.",
 * each a sentence of field ids joined by ", " and " and " (`declared` in `packages/kernel/src/index.ts`). A note cut at
 * its 280 characters loses its full stop and matches neither, which leaves the line in the words it had before.
 */
const IDS = '([a-z][a-z0-9_-]*(?:(?:, | and )[a-z][a-z0-9_-]*)*)';
const ADDED = new RegExp(`(?:^|\\. )Added ${IDS}\\.(?= |$)`, 'u');
const TOOK_OFF = new RegExp(`(?:^|\\. )Took off ${IDS}\\.(?= |$)`, 'u');

/** A list's field by its label, lower case as `noteOf` says one, or its id in words when the list does not declare it here. */
function fieldWords(register: string, id: string): string {
  const f = REGISTERS[register]?.fields.find((x) => x.id === id);
  return f ? labelOf(f).toLowerCase() : id.replace(/[_-]/gu, ' ');
}

/** "a", "a and b", "a, b and c". */
const listed = (words: readonly string[]): string =>
  words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/**
 * A list's fields added or taken off, in words, from a `declare` line's target and note: "Added domain to Projects",
 * "Took off note from Tasks", or both in one sentence. `null` for any other `declare` line, which keeps its own words.
 *
 * HISTORY AND HOME BOTH SAID "Changed the page" OR THE BARE NOTE, "Added domain.", for a field put on a list: the verb
 * named the wrong thing and the note did not say which list. The target names the list (`declaration:register.<id>`) and
 * the note names the fields, so the line is made of the two. What else the note says ("Proposed by p_… in SG5.") is ids,
 * which nobody reads (design.md §6.8.3), so it is left out rather than printed beside the sentence.
 */
export function declaredOf(target: string | null | undefined, note: string | null | undefined): string | null {
  const register = /^declaration:register\.([a-z][a-z0-9_-]*)$/u.exec(target ?? '')?.[1];
  if (register === undefined || !note) return null;
  const words = (ids: string | undefined): string | null =>
    ids === undefined ? null : listed(ids.split(/, | and /u).map((id) => fieldWords(register, id)));
  const added = words(ADDED.exec(note)?.[1]);
  const off = words(TOOK_OFF.exec(note)?.[1]);
  const list = listName(register);
  if (added !== null && off !== null) return `Added ${added} to ${list} and took off ${off}`;
  if (added !== null) return `Added ${added} to ${list}`;
  if (off !== null) return `Took off ${off} from ${list}`;
  return null;
}

/* A RULE IS `rule:<id>` ON THE RECORD AND `rule.<id>` IN THE SAMPLE, and `actorOf` words the second. */
const actor = (a: string): string => a.replace(/^rule:/u, 'rule.');

/**
 * The record's events, oldest first, as the page's lines, newest first.
 *
 * `moneyInText` HERE AND NOT IN `noteOf`, because `news-live.ts` words its lines with `noteOf` and hands the whole
 * sentence through `moneyInText` itself; one pass over one sentence, wherever it is made.
 */
export const linesOf = (register: string, events: readonly Event[]): Line[] =>
  events.map((e) => ({ by: actor(e.actor), note: moneyInText(noteOf(register, e)), at: e.ts })).reverse();

/**
 * The names of the people on this record, by id, for saying who did what. `boot` sends them to the owner and to a member
 * who may read People, and the shell keeps that answer, so this costs no call. A host older than `names` is asked
 * `members`, which is the owner's. Anybody else and a refusal get an empty map, and each person is said as
 * You or Someone on this record.
 */
export async function readNames(base: string, io?: Fetch): Promise<ReadonlyMap<string, string>> {
  const booted = await readBoot(base, io).catch(() => null);
  if (booted?.from === 'live' && booted.boot.names !== undefined) return new Map(Object.entries(booted.boot.names));
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.members().catch(() => null);
  if (!out?.ok || !Array.isArray(out.value)) return new Map();
  return new Map(
    (out.value as { person_id?: unknown; name?: unknown }[]).flatMap((m) =>
      typeof m.person_id === 'string' && typeof m.name === 'string' && m.name.trim() !== '' ? [[m.person_id, m.name.trim()] as const] : [],
    ),
  );
}

/**
 * One row's history.
 *
 * A ROW WITH NO NUMBER THE RECORD COULD HOLD (a pending one) ASKS NOTHING, and its answer is the true one: the record
 * holds no events for it. It was `sample` with no lines, a word that now names nothing.
 */
export async function readHistory(base: string, register: string, seq: number, io?: Fetch): Promise<Told> {
  if (!Number.isInteger(seq) || seq < 1) return { from: 'live', lines: [], now: Date.now() };
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.history(register, seq);
  if (out.ok) return { from: 'live', lines: linesOf(register, out.value as Event[]), now: Date.now() };
  return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : 'The row changed while it was being read.' };
}

/**
 * What is new since the reader last looked, as who signed each line, and whether the record holds more than it sent.
 *
 * `whatsNew` IS THE RECORD'S OWN ANSWER to "since you last looked": the lines after the reader's read mark, which Home
 * stamps on leaving, newest first and at most one page of them (`sinceCapped` says there are more). Reading it moves
 * nothing; only `markRead` does, so History asking does not take Home's news away.
 *
 * ONLY THE SIGNATURES, because the lead line counts who and says nothing of what: the lines themselves are the log
 * below it, which `readLog` reads.
 */
export type Unseen = { from: 'live'; actors: string[]; capped: boolean } | { from: 'refused'; fix: string };

export async function readUnseen(base: string, io?: Fetch): Promise<Unseen> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.whatsNew();
  if (out.ok) return { from: 'live', actors: out.value.events.map((e) => e.actor), capped: out.value.sinceCapped };
  return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : 'The record changed while it was being read.' };
}
