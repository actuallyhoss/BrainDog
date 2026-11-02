/**
 * Invitations: an owner names an email address and what it may reach, and gets one link to hand over.
 *
 * NO MAIL LEAVES FROM HERE, OR FROM ANYWHERE. The owner copies the link and sends it however they already talk
 * to that person. A host that mailed it would need a mail service, and a link that is printed somewhere a
 * log can read is a link anybody reading the log can spend.
 *
 * THE SECRET IS STORED AS ITS HASH, as a token's is, and appears in one answer and nowhere else: not in a row,
 * not in an event, not in a log line. A copy of the database is a list of addresses and dates.
 *
 * ONE USE, TWENTY-FOUR HOURS, ONE ADDRESS. Accepting spends it; a second link for the same address withdraws
 * the first; the owner can withdraw one by hand. What the person holds is written by `invite`, as `system`,
 * so the ledger's `access.grant` rows are the same rows an owner's own `invite` writes, with the invitation
 * named in `note`.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './migrate.ts';
import { LEVELS, invite, type Level, type Member, type MemberDeps } from './members.ts';
import { bindWaiting, bumpEpoch, waitingFor } from './shares.ts';

/**
 * What accepting answers: the person as the record now holds them, and the shares bound to them. A guest, who holds
 * shares and no level, is `level: null` with no lists.
 */
export type Accepted = Member & { shares: string[] };

/** Whether an invitation carries no level and no list: then it carries the shares waiting for its address, and only those. */
const sharesOnly = (i: { level: Level | null; registers: Record<string, Level> }): boolean => i.level === null && Object.keys(i.registers).length === 0;

/** `12 §3`: an invitation link lives 24 hours. */
export const INVITE_HOURS = 24;

export type InvitationRow = {
  id: string;
  email: string;
  level: Level | null;
  registers: Record<string, Level>;
  invited_by: string;
  created_at: string;
  expires_at: string;
  /**
   * Whether its link has run out. ONLY THE LISTING HOLDS ONE THAT HAS: an owner who sent a link a week ago and hears
   * nothing needs to see that it ran out and make a new one from the same row, and a row that vanished at hour
   * twenty-four left them retyping the address and every list they chose, not knowing whether the first link was spent.
   */
  expired: boolean;
};

/** A minted invitation, and the only copy of its link's token there will ever be. */
export type Invited = { invitation: InvitationRow; token: string };

export type InviteDeps = MemberDeps & { recordId: () => string | null };

export type InviteArgs = { email: string; level?: Level; registers?: Record<string, Level> };

/** One sentence for every dead link, so a guess learns nothing about which of the three it hit. */
export const GONE = 'This invitation link has been used, has run out or was withdrawn. Ask for a new one.';

/** Thirty-two random bytes as the link carries them: base64url, no padding. */
export const secretOf = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Raw = Omit<InvitationRow, 'registers' | 'expired'> & { registers: string };

const COLUMNS = 'id, email, level, registers, invited_by, created_at, expires_at';

/* `nowMs` DECIDES `expired`, and the two answers that only ever hold a live row pass the moment they were asked at. */
const shaped = (raw: Raw, nowMs: number): InvitationRow => {
  let registers: Record<string, Level> = {};
  try {
    const parsed: unknown = JSON.parse(raw.registers);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) registers = parsed as Record<string, Level>;
  } catch {
    registers = {};
  }
  return { ...raw, registers, expired: raw.expires_at <= instant(nowMs) };
};

/**
 * The token a link carries, split into the record it names and the secret whose hash is stored.
 *
 * THE RECORD ID TRAVELS, as a bearer's does, so a host holding many records knows which one to ask without
 * asking all of them. `null` is anything that is not that shape.
 */
export function tokenParts(token: unknown): { record: string; secret: string } | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const secret = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{32,}$/.test(secret)) return null;
  return { record: token.slice(0, dot), secret };
}

/**
 * Mint one. `secret` and `hash` come from the facade, which has the crypto and is allowed to await.
 *
 * SOMEBODY ALREADY ON THE RECORD IS NOT INVITED. Changing what they reach is `invite` on their row, and an
 * invitation for them would be a link that, once spent, replaced their levels with whatever it was minted for.
 */
export function mintInvitation(deps: InviteDeps, by: string, args: InviteArgs, secret: string, hash: string): Result<Invited> {
  const email = typeof args?.email === 'string' ? args.email.trim() : '';
  if (!email) return no<Invited>('REQUIRED_MISSING', 'Which address is the invitation for?', { at: 'email' });
  if (email.length > 254 || !ADDRESS.test(email))
    return no<Invited>('VALUE_MALFORMED', `${email} is not an email address.`, { at: 'email' });

  if (args.level !== undefined && !(LEVELS as readonly string[]).includes(args.level))
    return no<Invited>('ENUM_VALUE_UNKNOWN', `${String(args.level)} is not a level.`, { at: 'level', allowed: LEVELS });
  /* AN INVITATION TO NOTHING IS NO INVITATION, BUT ONE TO WHAT IS SHARED WITH THE ADDRESS IS (sharing plan slice 8): a
     share made to an email waits for that person, and the link is how they come for it. */
  if (args.level === undefined && Object.keys(args.registers ?? {}).length === 0 && !waitingFor(deps.sql, email, deps.nowMs))
    return no<Invited>('REQUIRED_MISSING', 'An invitation says what somebody may reach, on all of this BrainDog or on one list, or something is shared with them first.', { at: 'level' });
  /* `at` IS A PATH INTO WHAT THE CALLER SENT, and `registers` is an object keyed by slug, so the
     entry that is wrong is at `registers.<slug>`. Both branches passed the bare slug, which names a
     value rather than a place: no payload has a top-level `nope` key, and a screen given `nope` has
     nothing to put the message on. The slug is already in `fix`, where it belongs. */
  for (const [register, level] of Object.entries(args.registers ?? {})) {
    const at = `registers.${register}`;
    if (!deps.hasRegister(register)) return no<Invited>('REGISTER_UNKNOWN', `There is no register called ${register}.`, { at });
    if (!(LEVELS as readonly string[]).includes(level))
      return no<Invited>('ENUM_VALUE_UNKNOWN', `${String(level)} is not a level.`, { at, allowed: LEVELS });
  }

  const record = deps.recordId();
  if (!record) return no<Invited>('OUT_OF_BOUNDS', 'This BrainDog has no id yet, and an invitation link carries the BrainDog it is for.', { at: 'record' });

  if (deps.sql.one('SELECT 1 AS x FROM member m JOIN person p ON p.id = m.person_id WHERE lower(p.email) = lower(?) LIMIT 1', email))
    return no<Invited>('ALREADY_KNOWN', `${email} already has access here. Change what they can reach instead.`, { at: 'email' });

  const at = instant(deps.nowMs);
  /* A NEW LINK WITHDRAWS THE OLD ONE for the same address, so there is never a second live link somebody forgot. */
  deps.sql.exec(
    'UPDATE invitation SET revoked_at = ? WHERE lower(email) = lower(?) AND accepted_at IS NULL AND revoked_at IS NULL',
    at,
    email,
  );
  const id = `i_${deps.mint()}`;
  const expires = instant(deps.nowMs + INVITE_HOURS * 3_600_000);
  const registers = JSON.stringify(args.registers ?? {});
  deps.sql.exec(
    'INSERT INTO invitation (id, hash, email, level, registers, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    hash,
    email,
    args.level ?? null,
    registers,
    by,
    at,
    expires,
  );
  const invitation = shaped({ id, email, level: args.level ?? null, registers, invited_by: by, created_at: at, expires_at: expires }, deps.nowMs);
  return ok({ invitation, token: `${record}.${secret}` });
}

/**
 * Every invitation nobody has used or withdrawn, newest first, the ones that ran out included and marked `expired`.
 * Never the hash.
 *
 * A LINK THAT RAN OUT STAYS LISTED until the owner withdraws it or makes a new one, which withdraws it as a second
 * link for one address always does. Its link is as dead as a withdrawn one (`lookInvitation` still asks for a live
 * row); the row is kept only so the owner can see it and press "New link" on the grants it already carries.
 */
export const listInvitations = (sql: Sql, nowMs: number): InvitationRow[] =>
  sql
    .all<Raw>(`SELECT ${COLUMNS} FROM invitation WHERE accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC, id`)
    .map((raw) => shaped(raw, nowMs));

/** The live invitation behind a hash, or the one refusal every dead link gets. */
export function lookInvitation(sql: Sql, nowMs: number, hash: string): Result<InvitationRow> {
  const raw = sql.one<Raw>(
    `SELECT ${COLUMNS} FROM invitation WHERE hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    hash,
    instant(nowMs),
  );
  if (!raw) return no<InvitationRow>('UNAUTHORIZED', GONE, { at: 'token' });
  const row = shaped(raw, nowMs);
  /* ONE CARRYING ONLY SHARES IS GOOD WHILE ONE OF THEM IS: every share to the address stopped, the link is as dead as a
     withdrawn one, in the same words. */
  if (sharesOnly(row) && !waitingFor(sql, row.email, nowMs)) return no<InvitationRow>('UNAUTHORIZED', GONE, { at: 'token' });
  return ok(row);
}

/**
 * Spend one: the person the host has just verified goes on the record with what the invitation says.
 *
 * THE ADDRESS MUST MATCH, and a mismatch spends nothing, so somebody signed in as the wrong person can sign out
 * and open the link again. Everything is checked before the first write, and the facade runs this in a
 * savepoint as well.
 */
export function acceptInvitation(
  deps: InviteDeps,
  hash: string,
  args: { person: string; email: string; name?: string; operator?: true },
): Result<Accepted> {
  const found = lookInvitation(deps.sql, deps.nowMs, hash);
  if (!found.ok) return found as Result<never>;
  const invitation = found.value;
  if (!args?.person) return no<Accepted>('REQUIRED_MISSING', 'Who is accepting?', { at: 'person' });
  if ((args.email ?? '').trim().toLowerCase() !== invitation.email.toLowerCase())
    return no<Accepted>('FORBIDDEN', 'This invitation is for another address. Sign in as the person it was sent to.', { at: 'email' });
  const guest = sharesOnly(invitation);
  /* A LEVEL IS WHAT SOMEBODY ALREADY ON THE RECORD HOLDS, and a second one would replace it. What is shared with their
     address is added to whatever they hold, so a link carrying only shares binds them for a member too. */
  if (!guest && deps.sql.one('SELECT 1 AS x FROM member WHERE person_id = ? LIMIT 1', args.person))
    return no<Accepted>('ALREADY_KNOWN', 'You already have access here.', { at: 'person' });
  /* AN ADDRESS THE SERVER'S OPERATOR VOUCHED FOR (a self-host with no mail, `invite` in apps/selfhost) is said so on every
     line that gives them access, since no mailbox proved it. */
  const why = args.operator === true ? `Invited by the server's operator. Accepted invitation ${invitation.id}.` : `Accepted invitation ${invitation.id}.`;

  let joined: Member;
  if (guest) {
    /* A GUEST HOLDS SHARES AND NO MEMBER ROW, and a suspended one is let in by nothing. The person row is the record's
       mirror, written without overwriting what it knows, as `invite` writes it. */
    if (deps.sql.one('SELECT 1 AS x FROM person WHERE id = ? AND suspended_at IS NOT NULL', args.person))
      return no<Accepted>('LEVEL_REQUIRED', 'Your access here was stopped. Ask the owner to let you back in.', { at: 'person' });
    deps.sql.exec(
      `INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)
       ON CONFLICT (id) DO UPDATE SET email = COALESCE(excluded.email, person.email), name = COALESCE(excluded.name, person.name)`,
      args.person,
      invitation.email,
      args.name ?? null,
    );
    const p = deps.sql.one<{ email: string | null; name: string | null }>('SELECT email, name FROM person WHERE id = ?', args.person);
    joined = { person_id: args.person, email: p?.email ?? invitation.email, name: p?.name ?? null, level: null, scoped: [], seen_at: null, suspended_at: null };
  } else {
    const made = invite(deps, 'system', {
      person: args.person,
      email: invitation.email,
      ...(args.name ? { name: args.name } : {}),
      ...(invitation.level === null ? {} : { level: invitation.level }),
      registers: invitation.registers,
      why,
    });
    if (!made.ok) return made as Result<never>;
    joined = made.value;
  }
  /* WHAT WAS SHARED WITH THE ADDRESS IS NOW THE PERSON'S, one `access.grant` a share, and who holds what moved. */
  const shares = bindWaiting({ sql: deps.sql, at: instant(deps.nowMs), mint: deps.mint }, 'system', invitation.email, args.person, why);
  bumpEpoch(deps.sql);
  deps.sql.exec(
    'UPDATE invitation SET accepted_at = ?, accepted_by = ? WHERE id = ? AND accepted_at IS NULL',
    instant(deps.nowMs),
    args.person,
    invitation.id,
  );
  return ok({ ...joined, shares });
}

/**
 * Withdraw one. IDEMPOTENT, as revoking a token is: the second call answers as the first did.
 *
 * AN ACCEPTED ONE IS NOT WITHDRAWN, because it no longer does anything. The person it let in is removed from
 * their own row.
 */
export function revokeInvitation(sql: Sql, nowMs: number, id: string): Result<{ id: string; revoked_at: string }> {
  const row = sql.one<{ id: string; accepted_at: string | null; revoked_at: string | null }>(
    'SELECT id, accepted_at, revoked_at FROM invitation WHERE id = ?',
    id,
  );
  if (!row) return no('OUT_OF_BOUNDS', `There is no invitation called ${id}.`, { at: 'id' });
  if (row.revoked_at) return ok({ id, revoked_at: row.revoked_at });
  if (row.accepted_at) return no('OUT_OF_BOUNDS', 'That invitation was already accepted. Remove the person from their row instead.', { at: 'id' });
  const at = instant(nowMs);
  sql.exec('UPDATE invitation SET revoked_at = ? WHERE id = ?', at, id);
  return ok({ id, revoked_at: at });
}
