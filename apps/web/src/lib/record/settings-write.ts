/**
 * The writes Settings makes against the record: who may see it, and taking a copy of it away.
 *
 * A ROUTE-ONLY MODULE, like `news-live.ts`: the client carries the route table as a value, so only the screen that
 * writes loads it.
 *
 * EVERY ANSWER IS ONE OF TWO. `ok` is the record's value. `refused` carries the record's own sentence, and `raced` says
 * the record moved underneath, so the screen reads it again before anybody presses twice.
 *
 * THERE WAS A THIRD, `sample`, for a host with no record behind it (`UNREACHABLE`, `UNAUTHORIZED`), and the screen
 * answered it with the demo's "nothing was saved yet". There is no sample now, so those are refusals like
 * any other, carrying the sentence the client wrote for them: "The record could not be reached: ..." or the host's own.
 *
 * These are ADMIN methods, so a browser session. A token, or somebody who is not an owner, is refused
 * `NEEDS_BROWSER_SESSION` or `FORBIDDEN`, and that refusal's `fix` is what the person reads.
 */

import { createClient, type EraseReport, type Invitation, type Invited, type Level, type Member, type MintedToken, type Restored, type Snapshot } from '@braindog/client';

import { BASE } from '../at.ts';
import { copy } from '../copy.ts';
import type { Fetch } from './boot-live.ts';
import type { Person } from './schema.ts';
import { isProof } from '../reauth/ask.ts';

type Wire<T> = { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string; at?: string | undefined } } | { ok: false; conflict: unknown };

export type Wrote<T> =
  | { ok: true; value: T }
  /** `proof`: refused for a stale sign-in that was already asked for in place (`lib/reauth`), so no Sign in button follows. */
  | { ok: false; from: 'refused'; code: string; fix: string; raced: boolean; proof?: boolean };

/** The client's three arms as the screen's two: a conflict is a refusal that says it raced. */
export function wrote<T>(out: Wire<T>): Wrote<T> {
  if (out.ok) return out;
  if (!('refusal' in out)) return { ok: false, from: 'refused', code: 'VERSION_STALE', fix: copy.writeRaced, raced: true };
  return { ok: false, from: 'refused', code: out.refusal.code, fix: out.refusal.fix, raced: out.refusal.code === 'VERSION_STALE', ...(isProof(out.refusal) ? { proof: true } : {}) };
}

const clientOf = (base: string, io?: Fetch) => createClient({ base, ...(io ? { fetch: io } : {}) });

/* ── people ─────────────────────────────────────────────────────────────── */

/**
 * One member as the People area draws a person.
 *
 * `since` IS `null` BECAUSE THE RECORD DOES NOT KNOW IT. `members` has no acceptance date, and the Directory that does
 * is outside the record; the screen reads `live` and says when they last looked instead.
 */
export const personOf = (m: Member): Person => {
  const p: Person = {
    id: m.person_id,
    name: m.name ?? m.email ?? m.person_id,
    level: m.level,
    scoped: m.scoped,
    email: m.email ?? '',
    since: null,
    suspended: m.suspended_at,
    seen: m.seen_at,
  };
  /* THE RULES RIDE ON THE PERSON, because every write below sends the whole of what they hold, and a list sent
     without its rule is every row of it again (`members.ts`, `invite`). Neither the client's `Member` nor the web's
     `Person` names the key yet, so it is read and carried as the record answered it, and `rulesHeld` reads it back. */
  const wheres = (m as Member & { wheres?: unknown }).wheres;
  return wheres !== null && typeof wheres === 'object' && !Array.isArray(wheres) ? Object.assign(p, { wheres }) : p;
};

/**
 * One grant narrowed to the rows whose field holds one value: "only rows where Owner is Ben".
 *
 * THE SMALLEST RULE THE GRAMMAR TAKES, one leaf (`34-GRAMMARS` §1, `{ field, is }`), because that is the one sentence
 * this screen can say back word for word. A richer rule sent by another caller is kept and sent back untouched.
 */
export type RowRule = { field: string; value: string | number | boolean };

/** The rules somebody holds, keyed by list, exactly as the record answered them. `{}` when no grant is narrowed. */
export const rulesHeld = (p: Person): Readonly<Record<string, unknown>> => {
  const held = 'wheres' in p ? p.wheres : undefined;
  return held !== null && typeof held === 'object' && !Array.isArray(held) ? (held as Record<string, unknown>) : {};
};

/**
 * What one list's rule says, in the parts the card says it back with.
 *
 * `one` is the leaf this screen writes, `words` a sentence somebody typed, `other` a rule this screen cannot say (it is
 * kept, never rewritten), and `unread` the record's own `null`: a rule it could not read, which reaches no row.
 */
export type RuleRead =
  | { kind: 'one'; field: string; value: string }
  | { kind: 'words'; words: string }
  | { kind: 'other' }
  | { kind: 'unread' };

export function ruleRead(where: unknown): RuleRead {
  if (where === null) return { kind: 'unread' };
  if (typeof where === 'string') return { kind: 'words', words: where };
  if (typeof where !== 'object' || Array.isArray(where)) return { kind: 'other' };
  const leaf = where as Record<string, unknown>;
  const field = leaf['field'];
  const value = leaf['is'];
  if (Object.keys(leaf).length === 2 && typeof field === 'string' && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    return { kind: 'one', field, value: String(value) };
  return { kind: 'other' };
}

/**
 * What a typed or picked value is sent as, for a field of this type: a number for a number field and `true` or `false`
 * for a yes-or-no one, so the record compares like with like. `null` when the words are not a value the field holds.
 */
export function ruleValue(type: string, typed: string): RowRule['value'] | null {
  const said = typed.trim();
  if (said === '') return null;
  if (type === 'int' || type === 'decimal') {
    const n = Number(said);
    return Number.isFinite(n) && (type === 'decimal' || Number.isInteger(n)) ? n : null;
  }
  if (type === 'bool') return said === 'true' ? true : said === 'false' ? false : null;
  return said;
}

/**
 * The second way of naming somebody, for the line under their name, or `''`, when there is no second way.
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
  | { from: 'unrouted' }
  | { from: 'refused'; fix: string };

/** Who is on the record. `ROUTE_UNKNOWN` is a host older than this read: a record, and no list to draw. */
export async function readPeople(base: string, io?: Fetch): Promise<PeopleRead> {
  const out = await clientOf(base, io).call<Member[]>('members');
  if (out.ok) return { from: 'live', people: out.value.map(personOf) };
  const refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: copy.writeRaced };
  if (refusal.code === 'ROUTE_UNKNOWN') return { from: 'unrouted' };
  return { from: 'refused', fix: refusal.fix };
}

/**
 * What `invite` is sent for one person: the WHOLE of what they would hold, because an invitation is not a patch.
 *
 * A register left out is taken away and a record level left off is taken away, so every change here carries the
 * exceptions that stay as well as the one that moved.
 *
 * AND THE RULES THAT STAY, for the same reason: a list sent without its rule is every row of it again. Only the rules of
 * lists still sent go, because the record refuses a rule on a list the invitation does not give, and `wheres` is left
 * off when there is none, so an unnarrowed person's invitation reads as it always did.
 */
export function inviteOf(
  p: Person,
  level: Level | null,
  scoped: readonly { register: string; level: Level }[],
  wheres: Readonly<Record<string, unknown>> = rulesHeld(p),
) {
  const kept = Object.fromEntries(scoped.filter((s) => Object.hasOwn(wheres, s.register)).map((s) => [s.register, wheres[s.register]]));
  return {
    person: p.id,
    ...(level === null ? {} : { level }),
    registers: Object.fromEntries(scoped.map((s) => [s.register, s.level])),
    ...(Object.keys(kept).length === 0 ? {} : { wheres: kept }),
  };
}

/** Move somebody's level on the record, keeping their exceptions and the rows each one reaches. */
export async function moveLevel(base: string, p: Person, to: Level | null, io?: Fetch): Promise<Wrote<Member>> {
  return wrote(await clientOf(base, io).invite(inviteOf(p, to, p.scoped)));
}

/** Put one list back to their record level, which takes its rule with it: their level is every row. */
export async function dropException(base: string, p: Person, register: string, io?: Fetch): Promise<Wrote<Member>> {
  return wrote(await clientOf(base, io).invite(inviteOf(p, p.level, p.scoped.filter((s) => s.register !== register))));
}

/**
 * Give somebody a different level on one list, over every row of it or `only` the rows one field's value picks. A list
 * they already have an exception on is moved, not doubled, and what is picked here replaces the rule it held.
 */
export async function addException(
  base: string,
  p: Person,
  register: string,
  level: Level,
  only: RowRule | null,
  io?: Fetch,
): Promise<Wrote<Member>> {
  const scoped = [...p.scoped.filter((s) => s.register !== register), { register, level }];
  const others = Object.fromEntries(Object.entries(rulesHeld(p)).filter(([list]) => list !== register));
  const wheres = only === null ? others : { ...others, [register]: { field: only.field, is: only.value } };
  return wrote(await clientOf(base, io).invite(inviteOf(p, p.level, scoped, wheres)));
}

/**
 * Stop somebody, or let them back in. EVERYTHING THEY HOLD IS KEPT, which is the difference from removing them: the
 * record answers where they now stand, and letting them back in gives them exactly what they had.
 */
export async function suspendPerson(base: string, p: Person, suspended: boolean, io?: Fetch): Promise<Wrote<unknown>> {
  return wrote(await clientOf(base, io).suspendMember({ person: p.id, suspended }));
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
 * `/invite` AND NO SLUG. The token names its record, and the person opening it is on no record yet, or on another.
 */
export const inviteLink = (origin: string, token: string): string => `${origin.replace(/\/+$/, '')}${BASE}/invite#${token}`;

/**
 * What an invitation gives: the whole record at one level, or chosen lists each at its own.
 *
 * ONE OR THE OTHER, NEVER AN EMPTY MAP. The record refuses an invitation that gives nothing, and a screen that could
 * send `{ registers: {} }` would only be asking for that refusal. Lists are sent as the map the record keeps
 * (`registers`), never as an array.
 */
export type InviteReach = { level: Level } | { registers: Record<string, Level> };

/** Mint one for an address. The answer holds the only copy of the link, to show once and keep nowhere. */
export async function inviteEmail(base: string, email: string, reach: InviteReach, io?: Fetch): Promise<Wrote<Invited>> {
  return wrote(await clientOf(base, io).inviteByEmail({ email: email.trim(), ...reach }));
}

/**
 * A new link for an invitation already listed, waiting or run out, giving what it gave.
 *
 * THE SAME CALL AS THE FIRST ONE, because the record withdraws the old link whenever a second is made for one address,
 * so there is never a stale link and a fresh one both alive. The owner does not retype the address or choose the lists
 * again: both come off the row.
 */
export async function renewInvite(base: string, inv: Invitation, io?: Fetch): Promise<Wrote<Invited>> {
  const reach: InviteReach = inv.level !== null ? { level: inv.level } : { registers: { ...inv.registers } };
  return inviteEmail(base, inv.email, reach, io);
}

/** One invitation as the People area lists it, with whether its link has run out. */
export type Waiting = Invitation & { expired: boolean };

/**
 * Whether one ran out: the record's own word where it sent one, and the date it named where an older record did not.
 * An older record lists only live rows, so the date is a fallback that is almost never the one that decides.
 */
const waitingOf = (inv: Invitation, now: number): Waiting => {
  const said = (inv as Invitation & { expired?: unknown }).expired;
  return { ...inv, expired: typeof said === 'boolean' ? said : Date.parse(inv.expires_at) <= now };
};

export type InvitesRead = { from: 'live'; invites: Waiting[] } | { from: 'unrouted' } | { from: 'refused'; fix: string };

/**
 * Every invitation nobody has used or withdrawn, newest first, the ones that ran out marked. A host older than
 * invitations is `unrouted`, as it is for `readPeople`.
 *
 * IT AND A HOST WITH NO RECORD BOTH READ `sample`, so a signed-out reader and a record too old for the method were told
 * the same thing. The screen draws neither as a list, and the second one now says why.
 */
export async function readInvites(base: string, io?: Fetch, now: number = Date.now()): Promise<InvitesRead> {
  const out = wrote(await clientOf(base, io).invitations());
  if (out.ok) return { from: 'live', invites: out.value.map((inv) => waitingOf(inv, now)) };
  if (out.code === 'ROUTE_UNKNOWN') return { from: 'unrouted' };
  return { from: 'refused', fix: out.fix };
}

/** Withdraw one. Its link stops working at once. */
export async function withdrawInvite(base: string, id: string, io?: Fetch): Promise<Wrote<{ id: string; revoked_at: string }>> {
  return wrote(await clientOf(base, io).revokeInvite({ id }));
}

/* ── agents ─────────────────────────────────────────────────────────────── */

/**
 * Connect an agent: a write token for `days`, named by its label, that reads the money inbox only when the owner said so.
 *
 * THE INBOX IS OFF UNLESS IT WAS CHOSEN, AND THEN IT IS NAMED. The record lets an owner's whole-record token read
 * `inbox` when its row carries that reach, and this screen always minted `{ scope, label,
 * days }`, so no token made here could ever read it. `reach` is left out rather than sent empty when the switch is off,
 * so what is sent for an ordinary agent is byte for byte what it was.
 */
export async function mintAgent(
  base: string,
  args: { label: string; inbox: boolean; days: number },
  io?: Fetch,
): Promise<Wrote<MintedToken>> {
  return wrote(
    await clientOf(base, io).createToken({
      scope: 'write',
      label: args.label,
      days: args.days,
      ...(args.inbox ? { reach: ['inbox'] } : {}),
    }),
  );
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

export type SnapshotsRead = { from: 'live'; snapshots: Snapshot[] } | { from: 'refused'; code: string; fix: string };

/**
 * The copies the host keeps. A host that keeps none (the Worker today) is `refused`, with its sentence, and the screen
 * draws that instead of a list: a record is never shown copies it does not have.
 */
export async function readSnapshots(base: string, io?: Fetch): Promise<SnapshotsRead> {
  const out = wrote(await clientOf(base, io).snapshots());
  if (out.ok) return { from: 'live', snapshots: out.value };
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
 * the one way. No answer at all, or one that is not the record's, is `UNREACHABLE` with `recordNotReached`.
 *
 * THAT SENTENCE WAS EMPTY. Both arms handed the screen `fix: ''`, which only the sample's toast ever covered, so with
 * the sample gone a download from a host that answered HTML would have toasted nothing at all.
 */
export async function downloadSnapshot(base: string, id: string, io?: Fetch): Promise<Wrote<{ name: string; blob: Blob }>> {
  let res: Response;
  try {
    res = await (io ?? fetch)(`${base}/api/snapshots/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  } catch {
    return wrote({ ok: false, refusal: { code: 'UNREACHABLE', fix: copy.recordNotReached } });
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
  return wrote({ ok: false, refusal: said?.refusal ?? { code: 'UNREACHABLE', fix: copy.recordNotReached } });
}
