/**
 * The writes Settings makes against the record: who may see it, and taking a copy of it away.
 *
 * A ROUTE-ONLY MODULE, like `news-live.ts`: the client carries the route table as a value, so only the screen that
 * writes loads it.
 *
 * EVERY ANSWER IS ONE OF THREE. `ok` is the record's value. `sample` is a host with no record behind it
 * (`UNREACHABLE`, `UNAUTHORIZED`), where the screen keeps the toast it always had. `refused` carries the record's own
 * sentence, and `raced` says the record moved underneath, so the screen reads it again before anybody presses twice.
 *
 * These are ADMIN methods, so a browser session. A token, or somebody who is not an owner, is refused
 * `NEEDS_BROWSER_SESSION` or `FORBIDDEN`, and that refusal's `fix` is what the person reads.
 */

import { createClient, type Level, type Member } from '@braindog/client';

import { copy } from '../copy.ts';
import type { Fetch } from './boot-live.ts';
import { noRecord } from './device.ts';
import type { Person } from './schema.ts';

type Wire<T> = { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };

export type Wrote<T> =
  | { ok: true; value: T }
  | { ok: false; from: 'sample'; fix: string }
  | { ok: false; from: 'refused'; code: string; fix: string; raced: boolean };

/** The client's three arms as the screen's three. */
export function wrote<T>(out: Wire<T>): Wrote<T> {
  if (out.ok) return out;
  if (!('refusal' in out)) return { ok: false, from: 'refused', code: 'VERSION_STALE', fix: copy.writeRaced, raced: true };
  if (noRecord(out.refusal.code)) return { ok: false, from: 'sample', fix: out.refusal.fix };
  return { ok: false, from: 'refused', code: out.refusal.code, fix: out.refusal.fix, raced: out.refusal.code === 'VERSION_STALE' };
}

const clientOf = (base: string, io?: Fetch) => createClient({ base, ...(io ? { fetch: io } : {}) });

/* ── people ─────────────────────────────────────────────────────────────── */

/**
 * One member as the People area draws a person.
 *
 * `since` IS `null` BECAUSE THE RECORD DOES NOT KNOW IT. `members` has no acceptance date, and the Directory that does
 * is outside the record; the screen reads `live` and says when they last looked instead.
 */
export const personOf = (m: Member): Person => ({
  id: m.person_id,
  name: m.name ?? m.email ?? m.person_id,
  level: m.level,
  scoped: m.scoped,
  email: m.email ?? '',
  since: null,
  suspended: m.suspended_at,
  seen: m.seen_at,
});

export type PeopleRead =
  | { from: 'live'; people: Person[] }
  | { from: 'sample' }
  | { from: 'unrouted' }
  | { from: 'refused'; fix: string };

/** Who is on the record. `ROUTE_UNKNOWN` is a host older than this read: a record, and no list to draw. */
export async function readPeople(base: string, io?: Fetch): Promise<PeopleRead> {
  const out = await clientOf(base, io).call<Member[]>('members');
  if (out.ok) return { from: 'live', people: out.value.map(personOf) };
  const refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: copy.writeRaced };
  if (noRecord(refusal.code)) return { from: 'sample' };
  if (refusal.code === 'ROUTE_UNKNOWN') return { from: 'unrouted' };
  return { from: 'refused', fix: refusal.fix };
}

/**
 * What `invite` is sent for one person: the WHOLE of what they would hold, because an invitation is not a patch.
 *
 * A register left out is taken away and a record level left off is taken away, so every change here carries the
 * exceptions that stay as well as the one that moved.
 */
export function inviteOf(p: Person, level: Level | null, scoped: readonly { register: string; level: Level }[]) {
  return {
    person: p.id,
    ...(level === null ? {} : { level }),
    registers: Object.fromEntries(scoped.map((s) => [s.register, s.level])),
  };
}

/** Move somebody's level on the record, keeping their exceptions. */
export async function moveLevel(base: string, p: Person, to: Level | null, io?: Fetch): Promise<Wrote<Member>> {
  return wrote(await clientOf(base, io).invite(inviteOf(p, to, p.scoped)));
}

/** Put one list back to their record level. */
export async function dropException(base: string, p: Person, register: string, io?: Fetch): Promise<Wrote<Member>> {
  return wrote(await clientOf(base, io).invite(inviteOf(p, p.level, p.scoped.filter((s) => s.register !== register))));
}

/** Give somebody a different level on one list. A list they already have an exception on is moved, not doubled. */
export async function addException(base: string, p: Person, register: string, level: Level, io?: Fetch): Promise<Wrote<Member>> {
  const scoped = [...p.scoped.filter((s) => s.register !== register), { register, level }];
  return wrote(await clientOf(base, io).invite(inviteOf(p, p.level, scoped)));
}

/** Take somebody off the record. The record refuses the last owner. */
export async function removeAccess(base: string, p: Person, io?: Fetch): Promise<Wrote<unknown>> {
  return wrote(await clientOf(base, io).removeMember({ person: p.id }));
}

/* ── export ─────────────────────────────────────────────────────────────── */

/**
 * The three copies the Export area offers, by the sections of a `.dogl` file each one carries.
 *
 * `record` is every section. `pack` is the lists, pages, metrics and rules with no rows. `rows` is the data without
 * where each row came from, which is the clean handover.
 */
export const EXPORTS = {
  record: { sections: undefined, suffix: '' },
  pack: { sections: ['header', 'governance'], suffix: '-pack' },
  rows: { sections: ['header', 'data'], suffix: '-rows' },
} as const;

export type ExportKind = keyof typeof EXPORTS;

/** One export, as the file a browser saves: its name and its text, one line of the record per line. */
export async function exportFile(base: string, kind: ExportKind, slug: string, io?: Fetch): Promise<Wrote<{ name: string; text: string }>> {
  const { sections, suffix } = EXPORTS[kind];
  const out = wrote(await clientOf(base, io).export(sections ? { sections: [...sections] } : {}));
  if (!out.ok) return out;
  return { ok: true, value: { name: `${slug || 'record'}${suffix}.dogl`, text: `${out.value.join('\n')}\n` } };
}
