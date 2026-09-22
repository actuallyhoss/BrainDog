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

import { createClient, type EraseReport, type Invitation, type Invited, type Level, type Member, type Restored, type Snapshot } from '@braindog/client';

import { BASE } from '../at.ts';
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

/**
 * The second way of naming somebody, for the line under their name — or `''`, when there is no second way.
 *
 * `personOf` FALLS BACK TO THE EMAIL FOR THE NAME, because a row has to be called something, and the
 * detail line then printed the email again: a colleague the record holds no name for was drawn as
 * `ben@ashgrove.co.uk` with `ben@ashgrove.co.uk · has not opened it` directly beneath. The email is
 * there to tell two people with one name apart, which is work it cannot do when it IS the name.
 */
export const alsoKnown = (p: Person): string => {
  const second = p.email || p.id;
  return second === p.name ? '' : second;
};

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

/* ── invitations ──────────────────────────────────────────────────────── */

/**
 * The link an invitation is opened at. The token rides in the fragment, so it never reaches a server log, a proxy or a
 * `Referer`: `/invite` reads it and clears it before anything else.
 *
 * `/app/invite` AND NO SLUG. The token names its record, and the person opening it is on no record yet, or on another.
 */
export const inviteLink = (origin: string, token: string): string => `${origin.replace(/\/+$/, '')}${BASE}/invite#${token}`;

/** Mint one for an address. The answer holds the only copy of the link, to show once and keep nowhere. */
export async function inviteEmail(base: string, email: string, level: Level, io?: Fetch): Promise<Wrote<Invited>> {
  return wrote(await clientOf(base, io).inviteByEmail({ email: email.trim(), level }));
}

export type InvitesRead = { from: 'live'; invites: Invitation[] } | { from: 'sample' } | { from: 'refused'; fix: string };

/** Every invitation still waiting, newest first. A host older than invitations lists none. */
export async function readInvites(base: string, io?: Fetch): Promise<InvitesRead> {
  const out = wrote(await clientOf(base, io).invitations());
  if (out.ok) return { from: 'live', invites: out.value };
  if (out.from === 'sample' || out.code === 'ROUTE_UNKNOWN') return { from: 'sample' };
  return { from: 'refused', fix: out.fix };
}

/** Withdraw one. Its link stops working at once. */
export async function withdrawInvite(base: string, id: string, io?: Fetch): Promise<Wrote<{ id: string; revoked_at: string }>> {
  return wrote(await clientOf(base, io).revokeInvite({ id }));
}

/* ── export ─────────────────────────────────────────────────────────────── */

/**
 * The three copies the Export area offers, by the sections of a `.brainl` file each one carries.
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
  return { ok: true, value: { name: `${slug || 'record'}${suffix}.brainl`, text: `${out.value.join('\n')}\n` } };
}

/* ── backups, erasure and deletion ──────────────────────────────────────── */

export type SnapshotsRead = { from: 'live'; snapshots: Snapshot[] } | { from: 'sample' } | { from: 'refused'; code: string; fix: string };

/**
 * The copies the host keeps. A host that keeps none (the Worker today) is `refused`, with its sentence, and the screen
 * draws that instead of the sample's list: a live record is never shown copies it does not have.
 */
export async function readSnapshots(base: string, io?: Fetch): Promise<SnapshotsRead> {
  const out = wrote(await clientOf(base, io).snapshots());
  if (out.ok) return { from: 'live', snapshots: out.value };
  if (out.from === 'sample') return { from: 'sample' };
  return { from: 'refused', code: out.code, fix: out.fix };
}

/** A copy of the whole record, now. */
export async function backUpNow(base: string, io?: Fetch): Promise<Wrote<Snapshot>> {
  return wrote(await clientOf(base, io).snapshot({}));
}

/** Put the record back to one kept copy; what it holds now is kept as a copy first. */
export async function restoreSnapshot(base: string, bookmark: string, io?: Fetch): Promise<Wrote<Restored>> {
  return wrote(await clientOf(base, io).restore({ bookmark }));
}

/** Erase a person, by what names them and, when they are on the record, who they are. */
export async function erasePerson(base: string, args: { subjects: string[]; personId?: string; basis: string }, io?: Fetch): Promise<Wrote<EraseReport>> {
  return wrote(await clientOf(base, io).erase(args));
}

/** Delete the record. `slug` is its name as the person typed it. */
export async function deleteRecordNow(base: string, slug: string, io?: Fetch): Promise<Wrote<{ slug: string; deleted: true }>> {
  return wrote(await clientOf(base, io).deleteRecord({ slug }));
}

/**
 * One kept copy as the file a browser saves (`GET /api/snapshots/<id>`, `49 §5.13`).
 *
 * NOT THROUGH THE CLIENT, which reads JSON: the answer is the SQLite file itself. A refusal is still JSON and still read
 * the one way. No answer at all, or one that is not the record's, is the sample's: there is no record to fetch from.
 */
export async function downloadSnapshot(base: string, id: string, io?: Fetch): Promise<Wrote<{ name: string; blob: Blob }>> {
  let res: Response;
  try {
    res = await (io ?? fetch)(`${base}/api/snapshots/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  } catch {
    return { ok: false, from: 'sample', fix: '' };
  }
  if (res.ok) {
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${id}.dog`;
    return { ok: true, value: { name, blob: await res.blob() } };
  }
  let said: { refusal?: { code: string; fix: string } } | null = null;
  try {
    said = (await res.json()) as { refusal?: { code: string; fix: string } };
  } catch {
    said = null;
  }
  return wrote({ ok: false, refusal: said?.refusal ?? { code: 'UNREACHABLE', fix: '' } });
}
