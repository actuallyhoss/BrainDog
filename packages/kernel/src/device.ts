/**
 * Device grants: how a new machine's CLI or hook signs in, RFC 8628 (`12-SECURITY` §6.1).
 *
 * THE DEVICE POLLS WITH A LONG RANDOM ID AND THE OWNER TYPES SIX DIGITS. The two are never the same
 * value, so polling cannot be turned into a way of guessing codes, and the code is kept only as
 * `sha256(id + ':' + code)`: a copy of this table approves nothing.
 *
 * ONE ROW, TWO LIVES. A row is pending, then approved in a browser, then active once the device
 * exchanges it for its bearer. A denied row is kept, because "I said no to a request I did not make"
 * is the line this table exists to be able to show.
 *
 * THE POLL ID IS NEVER SHOWN. Between approval and exchange, whoever holds it can take the bearer, so
 * a listing, an event and a revoke name a row by a handle derived from the id and not by the id.
 */

import type { Refusal, Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './migrate.ts';
import { APPROVER_STANDING, DEFAULT_DAYS, createToken, endedByCutOff, revokeToken, type TokenDeps } from './token.ts';

/**
 * `device_grant.reach`, as migration 33's CHECK has it.
 *
 * `shape` IS A STANDING GRANT FOR SHAPE COPIES: approved once with six digits, it lives as a runner's does and
 * is not spent on use, so the loop on the owner's machine takes a scrambled copy of the record with no prompt. It opens
 * that and nothing else: its bearer is held on this table alone, so `verifyToken` never finds it, and `keychainGrant`,
 * `operationGrant` and the runner's check each match their own reach. `shapeGrant` is its one reader.
 */
export const REACHES = ['login', 'runner', 'export', 'import', 'pack', 'token', 'vault', 'shape'] as const;
export type Reach = (typeof REACHES)[number];

export type DeviceStatus = 'pending' | 'approved' | 'active' | 'expired' | 'denied' | 'revoked';

/** A code lives ten minutes, pending or approved and not yet exchanged. */
export const CODE_MS = 10 * 60_000;
/** The fifth wrong code denies every pending row. */
export const CODE_TRIES = 5;
/** An active grant not heard from in fourteen days is deregistered by the sweep. */
export const SILENT_MS = 14 * 86_400_000;
/** Seconds between polls, as RFC 8628's `interval`. */
export const POLL_INTERVAL = 5;

/**
 * A keychain grant's life. Shorter for `*`, because a grant over every key that belongs to no project is
 * the wider of the two, and a wider grant should run out sooner.
 */
export const KEYCHAIN_DAYS = 30;
export const KEYCHAIN_ALL_DAYS = 7;

/** The reaches that approve one ADMIN operation, spent within the code's ten minutes (`30` §10). */
const OPERATIONS: readonly Reach[] = ['export', 'import', 'pack', 'token'];

/**
 * The one record method each operation reach opens, by the name the record's ADMIN gate is asked with.
 *
 * TWO OF THE FOUR ARE NOT THEIR REACH'S NAME. `pack` installs one (`installPack`) and `token` mints one (`createToken`),
 * and the record's gate compares method names, so a table here is what keeps the reach a person approved on the phone
 * and the door it opens the same thing.
 */
export const OPERATION_METHOD = { export: 'export', import: 'import', pack: 'installPack', token: 'createToken' } as const;
export type Operation = (typeof OPERATION_METHOD)[keyof typeof OPERATION_METHOD];

export type DeviceCode = { device_code: string; user_code: string; expires: string; interval: typeof POLL_INTERVAL };
export type Waiting = { pending: true; interval: typeof POLL_INTERVAL };
export type Exchanged = { pending: false; bearer: string; reach: Reach; scope: string | null; expires: string };
export type Approved = { handle: string; reach: Reach; scope: string | null; label: string | null; ua: string | null };

/** What a listing shows: never the poll id, the code's hash or the bearer's. */
export type DeviceRow = {
  handle: string;
  status: DeviceStatus;
  reach: Reach;
  scope: string | null;
  label: string | null;
  ua: string | null;
  tries: number;
  expires: string;
  approved_by: string | null;
  approved_at: string | null;
  last_used: string | null;
  /**
   * Present on an approved or active grant that the operator's cut-off has ended (`TokenDeps.validFrom`), so the list
   * says why a device stopped rather than showing it live. A grant is made when a person approves it, so that is the
   * moment compared.
   */
  ended_by?: 'operator';
};

export type KeychainGrant = { handle: string; scope: string; person: string; expires: string };
/** A shape grant, checked: whose approval it carries and until when. It names no scope, since it reads one thing. */
export type ShapeGrant = { handle: string; person: string; expires: string };

/**
 * An operation bearer, checked and spent: which reach, the method it opens, the person who approved it, and the SHA-256
 * of the one request body it was started for (`binds`, hex), or `null` for a grant started without one.
 */
export type OperationGrant = { handle: string; reach: 'export' | 'import' | 'pack' | 'token'; method: Operation; person: string; binds: string | null };

/**
 * What an operation grant's `scope` column holds when it was started for one request body: `body:` and the body's
 * SHA-256 in hex. The column is a keychain grant's project otherwise, and an operation grant held none, so the bound body
 * needs no column of its own.
 */
export const BODY_BOUND = 'body:';

/** The bound body's SHA-256 a grant's `scope` holds, or `null` for none. */
export const boundBody = (scope: string | null): string | null => (scope !== null && scope.startsWith(BODY_BOUND) ? scope.slice(BODY_BOUND.length) : null);

/**
 * From this instant an operation grant must name the one request it is for (`binds`), and one that names none is
 * refused when it is asked for (`deviceStart`) and when it is spent (`operationGrant`). SEC13.
 *
 * THE OWNER'S DATE, 1 DECEMBER 2026, DECIDED ON 1 NOVEMBER. Every braindog command since bound builds names its body, so
 * an unbound approval is either an old command or somebody spending the word "token" or "import" on a request the
 * approver never saw. The month between is for every machine still running an old command to be updated; until it ends,
 * an unbound approval keeps working as it always has. Midnight UTC, so every host turns it on at the same instant.
 */
export const UNBOUND_REFUSED_FROM: number = Date.parse('2026-12-01T00:00:00Z');

/** What an approval that names no request is told once `UNBOUND_REFUSED_FROM` has passed: what happened, and the fix. */
export const UNBOUND_REFUSED =
  'This braindog command is too old: it asks for an approval without saying which request it is for, and BrainDog no longer takes those. Update the braindog command: braindog update. Then run it again.';

type Stored = Omit<DeviceRow, 'handle' | 'ended_by'> & { id: string; code_hash: string; token_hash: string | null };

const VISIBLE = 'id, status, reach, scope, label, ua, tries, expires, approved_by, approved_at, last_used';

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Six digits, uniformly. Rejection rather than a remainder, which would make the low codes likelier. */
function sixDigits(random: (n: number) => Uint8Array): string {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  for (;;) {
    const b = random(4);
    const n = (b[0]! * 0x100_0000 + (b[1]! << 16) + (b[2]! << 8) + b[3]!) >>> 0;
    if (n < limit) return String(n % 1_000_000).padStart(6, '0');
  }
}

/** Equal hex strings, compared without stopping at the first difference. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The name a row goes by everywhere a person can see it. */
const handleOf = async (deps: TokenDeps, id: string): Promise<string> => (await deps.digest(`device:${id}`)).slice(0, 16);

const shown = async (deps: TokenDeps, row: Omit<Stored, 'code_hash' | 'token_hash'>): Promise<DeviceRow> => {
  const { id, ...rest } = row;
  const live = rest.status === 'approved' || rest.status === 'active';
  return {
    handle: await handleOf(deps, id),
    ...rest,
    ...(live && endedByCutOff(deps.validFrom, rest.approved_at) ? { ended_by: 'operator' as const } : {}),
  };
};

/** Whether a project row exists: a live row of the register that declares `scopes:`. */
function isProject(deps: TokenDeps, id: string): boolean {
  return (
    deps.sql.one(
      `SELECT 1 AS hit FROM entry WHERE id = ? AND deleted_at IS NULL AND register = (
         SELECT json_extract(body, '$.id') FROM declaration
         WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_extract(body, '$.scopes') IS NOT NULL
         LIMIT 1)`,
      id,
    ) !== undefined
  );
}

/**
 * A device asks: a pending row, and the two values only this reply will ever carry.
 *
 * INTERNAL. The device has no credential yet, so the host calls this from `/auth/device` and limits
 * it per address.
 */
export async function deviceStart(
  deps: TokenDeps,
  args: { reach: string; label: string; ua?: string; scope?: string; binds?: string },
): Promise<Result<DeviceCode>> {
  /* `keychain` IS THE NAME A PERSON READS AND `vault` THE STORED ONE (the CHECK, and every installed CLI): it is accepted and kept as `vault`. */
  if (args?.reach === 'keychain') args = { ...args, reach: 'vault' };
  if (!(REACHES as readonly string[]).includes(args?.reach))
    return no('ENUM_VALUE_UNKNOWN', `${String(args?.reach)} is not a reach a device can ask for.`, { at: 'reach', allowed: REACHES });
  const label = typeof args.label === 'string' ? args.label.trim() : '';
  if (label === '') return no('REQUIRED_MISSING', 'Name the device, so the person approving it knows what is asking.', { at: 'label' });
  if (label.length > 120) return no('OUT_OF_BOUNDS', 'A device label is at most 120 characters.', { at: 'label' });
  /* `report:` AND `job:` NAME THE RECORD'S OWN KEYS (`createReportKey`, `claimJob`), which the plan's count passes, and a
     login's label becomes its key's: a device named like one would connect an agent past the count. */
  if (label.startsWith('report:') || label.startsWith('job:'))
    return no('VALUE_MALFORMED', 'A device name cannot begin report: or job:, which name keys BrainDog makes itself. Choose another name.', { at: 'label' });

  const reach = args.reach as Reach;
  let scope = args.scope ?? null;
  if (reach === 'vault') {
    if (!scope) return no('REQUIRED_MISSING', 'A keychain grant names the project whose keys it opens, or * for the keys of none.', { at: 'scope' });
    if (scope !== '*' && !isProject(deps, scope)) return no('REF_UNKNOWN', `${scope} is not a project here.`, { at: 'scope' });
  } else if (scope !== null) {
    return no('OUT_OF_BOUNDS', 'Only a keychain grant carries a scope.', { at: 'scope' });
  }
  /* AN OPERATION GRANT MAY NAME THE ONE REQUEST IT IS FOR, by its body's SHA-256, and the host then refuses any other
     body under it (`binds` on `OperationGrant`). A grant that named only its method let whoever held the bearer mint any
     scope, life and reach, or import any file, while the approver had seen only the word "token" or "import". */
  if (args.binds !== undefined) {
    if (!OPERATIONS.includes(reach)) return no('OUT_OF_BOUNDS', 'Only an operation grant names the request it is for.', { at: 'binds' });
    if (typeof args.binds !== 'string' || !/^[0-9a-f]{64}$/u.test(args.binds))
      return no('VALUE_MALFORMED', "A grant names its request by the SHA-256 of the body, as sixty-four lower-case hex characters.", { at: 'binds' });
    scope = `${BODY_BOUND}${args.binds}`;
  } else if (OPERATIONS.includes(reach) && deps.nowMs >= UNBOUND_REFUSED_FROM) {
    /* REFUSED BEFORE ANY CODE IS MADE, so nobody is asked to approve something that could never be spent. */
    return no('FORBIDDEN', UNBOUND_REFUSED, { at: 'binds' });
  }

  const id = b64url(deps.random(32));
  /* A CODE NO OTHER PENDING GRANT HOLDS: anyone may start a grant, so a code shared with a stranger's would hand them
     the approval the owner gave their own terminal. */
  const now = instant(deps.nowMs);
  const others = deps.sql.all<{ id: string; code_hash: string }>("SELECT id, code_hash FROM device_grant WHERE status = 'pending' AND expires > ?", now);
  let userCode = sixDigits(deps.random);
  for (let tries = 0; tries < 20; tries++) {
    let taken = false;
    for (const row of others) if (same(await deps.digest(`${row.id}:${userCode}`), row.code_hash)) taken = true;
    if (!taken) break;
    if (tries === 19) return no('RATE_LIMITED', 'Too many devices are waiting to be approved. Try again in a few minutes.');
    userCode = sixDigits(deps.random);
  }
  const expires = instant(deps.nowMs + CODE_MS);
  deps.sql.exec(
    `INSERT INTO device_grant (id, code_hash, status, reach, scope, label, ua, tries, expires)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, 0, ?)`,
    id,
    await deps.digest(`${id}:${userCode}`),
    reach,
    scope,
    label,
    args.ua?.slice(0, 200) ?? null,
    expires,
  );
  return ok({ device_code: id, user_code: userCode, expires, interval: POLL_INTERVAL });
}

/**
 * The owner types the code. A browser session only; the record's group gate sees to that.
 *
 * A MISS COSTS EVERY PENDING ROW A TRY. A guesser cannot spread guesses across requests to stay
 * under the count, and the fifth denies them all. A malformed entry costs nothing, because a typo
 * should not spend somebody else's enrolment.
 */
export async function deviceApprove(
  deps: TokenDeps,
  person: string,
  args: { user_code: string },
  /**
   * What the approver's own sign-in still lacks for the grant this code names, asked once the code has matched and before
   * anything is approved: the record's keychain asks a proof inside its own lock window for `vault`, which is shorter than
   * the fifteen minutes every other approval takes. A refusal here spends no try, because the code was right.
   */
  held?: (reach: Reach) => Refusal | null,
): Promise<Result<Approved>> {
  const code = typeof args?.user_code === 'string' ? args.user_code : '';
  if (!/^\d{6}$/.test(code)) return no('VALUE_MALFORMED', 'A device code is six digits.', { at: 'user_code' });

  const now = instant(deps.nowMs);
  deps.sql.exec("UPDATE device_grant SET status = 'expired' WHERE status IN ('pending', 'approved') AND expires <= ?", now);
  const pending = deps.sql.all<Stored>(`SELECT ${VISIBLE}, code_hash, token_hash FROM device_grant WHERE status = 'pending'`);

  /* EVERY ROW IS HASHED, a match or not, so the time taken says nothing about which row was close. */
  let hit: Stored | undefined;
  let hits = 0;
  for (const row of pending)
    if (same(await deps.digest(`${row.id}:${code}`), row.code_hash)) {
      hits += 1;
      hit ??= row;
    }
  /* TWO GRANTS UNDER ONE CODE ARE NEITHER APPROVED: which terminal the person meant cannot be told. */
  if (hits > 1) hit = undefined;

  if (hit) {
    const stop = held?.(hit.reach) ?? null;
    if (stop) return { ok: false, refusal: stop };
    const at = instant(deps.nowMs);
    deps.sql.exec(
      "UPDATE device_grant SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ? AND status = 'pending'",
      person,
      at,
      hit.id,
    );
    const handle = await handleOf(deps, hit.id);
    deps.sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'access.grant', ?, 'device_grant', ?, ?)",
      deps.mint(),
      at,
      person,
      `device:${handle}`,
      hit.reach,
      (hit.label ?? '').slice(0, 280) || null,
    );
    return ok({ handle, reach: hit.reach, scope: hit.scope, label: hit.label, ua: hit.ua });
  }

  deps.sql.exec("UPDATE device_grant SET tries = tries + 1 WHERE status = 'pending'");
  if (deps.sql.one("SELECT 1 AS hit FROM device_grant WHERE status = 'pending' AND tries >= ?", CODE_TRIES)) {
    deps.sql.exec("UPDATE device_grant SET status = 'denied' WHERE status = 'pending'");
    return no('DEVICE_CODE_TRIES', 'Five wrong codes denied every waiting device, so ask the device to start again.', { at: 'user_code' });
  }
  return no('FORBIDDEN', 'No device is waiting with that code.', { at: 'user_code' });
}

/**
 * The app a login exchange is: BrainDog's own command, on the machine its label names.
 *
 * THE STAMP IS THE KERNEL'S. `createToken` takes a client only from a host's door, and this is that door for a device:
 * the label was typed into nothing the grant's approver could not read, and the id and kind are fixed here, so a
 * caller cannot sign a token in as some other app.
 */
export const DEVICE_CLIENT = 'braindog';

/** At most this many characters in a machine's name, as the CLI's `machineName` cuts it. */
export const MACHINE_NAME_MAX = 60;

/** A label's seam: the machine's name comes before the first one ("Studio · braindog-cli"). */
const SEAM = ' · ';

/** The machine a label names, the part before its first ` · `, or `null` for a grant with no label. */
export function machineOf(label: string | null): string | null {
  if (label === null) return null;
  const name = (label.includes(SEAM) ? label.slice(0, label.indexOf(SEAM)) : label).trim();
  return name === '' ? null : name;
}

/** How long an exchanged grant lasts, by what it reaches. */
function lifeMs(row: Stored): number {
  if (row.reach === 'vault') return (row.scope === '*' ? KEYCHAIN_ALL_DAYS : KEYCHAIN_DAYS) * 86_400_000;
  if (OPERATIONS.includes(row.reach)) return CODE_MS;
  return DEFAULT_DAYS * 86_400_000;
}

/**
 * The device polls. Once a row is approved, this is the exchange, and it happens once.
 *
 * A `login` exchange mints a `token` row through `createToken`, scope `write`, ninety days, the
 * device's label, owned by the person who approved it: the bearer is the same shape as every other
 * token's and is verified by the same code. Any other reach gets a bearer of that shape held only as
 * `token_hash` on this row. Either way the bearer is in this reply and nowhere else.
 */
export async function devicePoll(deps: TokenDeps, args: { device_code: string }): Promise<Result<Waiting | Exchanged>> {
  const id = typeof args?.device_code === 'string' ? args.device_code : '';
  const row = id ? deps.sql.one<Stored>(`SELECT ${VISIBLE}, code_hash, token_hash FROM device_grant WHERE id = ?`, id) : undefined;
  if (!row) return no('FORBIDDEN', 'That device code is not known here.', { at: 'device_code' });

  const now = instant(deps.nowMs);
  const expired = no<Exchanged>('DEVICE_CODE_EXPIRED', 'Ask the device to start again.', { at: 'device_code' });
  if ((row.status === 'pending' || row.status === 'approved') && row.expires <= now) {
    deps.sql.exec("UPDATE device_grant SET status = 'expired' WHERE id = ? AND status = ?", id, row.status);
    return expired;
  }
  if (row.status === 'pending') return ok({ pending: true, interval: POLL_INTERVAL });
  if (row.status === 'expired') return expired;
  if (row.status === 'denied')
    return no('DEVICE_CODE_TRIES', 'Five wrong codes denied this request, so ask the device to start again.', { at: 'device_code' });
  if (row.status !== 'approved' || !row.approved_by)
    return no('FORBIDDEN', 'This device code has already been used. Ask the device to start again.', { at: 'device_code' });
  /* AN APPROVAL FROM BEFORE THE OPERATOR'S CUT-OFF IS NOT EXCHANGED. A login exchange mints its token now, after the
     instant, so a code approved inside a compromised window would otherwise come back as a token the cut-off passes.
     The row is left as it is, so an earlier instant set to correct a mistake lets the device finish, and the sweep
     expires it in its ten minutes either way. */
  if (endedByCutOff(deps.validFrom, row.approved_at)) return expired;

  const record = deps.recordId();
  if (!record) return no('OUT_OF_BOUNDS', 'This BrainDog has no id yet, and a bearer carries the BrainDog it is for.', { at: 'record' });

  /* CLAIMED BEFORE THE FIRST AWAIT. Nothing runs between the read above and this write, so a second
     poll finds the row active and is refused instead of minting a second bearer. */
  let expires = instant(deps.nowMs + lifeMs(row));
  deps.sql.exec("UPDATE device_grant SET status = 'active', expires = ?, last_used = ? WHERE id = ? AND status = 'approved'", expires, now, id);

  let bearer: string;
  if (row.reach === 'login') {
    const minted = await createToken(deps, row.approved_by, {
      scope: 'write',
      days: DEFAULT_DAYS,
      ...(row.label === null ? {} : { label: row.label }),
      client: { id: DEVICE_CLIENT, kind: 'device', host: machineOf(row.label) },
    });
    if (!minted.ok) {
      deps.sql.exec("UPDATE device_grant SET status = 'approved' WHERE id = ?", id);
      return minted;
    }
    bearer = minted.value.bearer;
    expires = minted.value.expires_at;
  } else {
    bearer = `${record}.${b64url(deps.random(32))}`;
  }
  deps.sql.exec('UPDATE device_grant SET token_hash = ?, expires = ? WHERE id = ?', await deps.digest(bearer.slice(record.length + 1)), expires, id);

  return ok({ pending: false, bearer, reach: row.reach, scope: row.scope, expires });
}

/** Every grant, newest first, with what a revoke button needs and nothing a hash could be rebuilt from. */
export async function deviceList(deps: TokenDeps): Promise<DeviceRow[]> {
  const rows = deps.sql.all<Omit<Stored, 'code_hash' | 'token_hash'>>(
    `SELECT ${VISIBLE} FROM device_grant ORDER BY coalesce(approved_at, expires) DESC, id`,
  );
  return Promise.all(rows.map((r) => shown(deps, r)));
}

/**
 * Revoke one, without ending anybody's session. A login grant takes its token with it.
 *
 * IDEMPOTENT, and a row that has already finished, denied or expired, is left saying what it said.
 */
export async function deviceRevoke(deps: TokenDeps, person: string, handle: string): Promise<Result<DeviceRow>> {
  let found: Stored | undefined;
  for (const row of deps.sql.all<Stored>(`SELECT ${VISIBLE}, code_hash, token_hash FROM device_grant`))
    if ((await handleOf(deps, row.id)) === handle) found = row;
  if (!found) return no('OUT_OF_BOUNDS', `There is no device called ${String(handle)}.`, { at: 'handle' });

  const { code_hash: _code, token_hash: tokenHash, ...visible } = found;
  if (!['pending', 'approved', 'active'].includes(found.status)) return ok(await shown(deps, visible));

  const at = instant(deps.nowMs);
  deps.sql.exec("UPDATE device_grant SET status = 'revoked' WHERE id = ?", found.id);
  if (found.reach === 'login' && tokenHash) {
    const token = deps.sql.one<{ id: string }>('SELECT id FROM token WHERE hash = ?', tokenHash);
    if (token) revokeToken(deps, person, token.id);
  }
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, ?, 'access.revoke', ?, 'device_grant', ?)",
    deps.mint(),
    at,
    person,
    `device:${handle}`,
    found.reach,
  );
  return ok(await shown(deps, { ...visible, status: 'revoked' }));
}

/**
 * Rename a machine: its owner calls "STUDIO-PC" what they call it, "Studio".
 *
 * THE NAME REPLACES WHAT COMES BEFORE THE LABEL'S FIRST ` · `, and what follows is kept, so a runner still reads as a
 * runner and a login as the command's. The grant's label, and the label and stamped host of every live token its login
 * minted, change in one transaction, so the device list and Settings never disagree about what the machine is called.
 *
 * A REVOKED, EXPIRED OR DENIED GRANT IS REFUSED. It is finished, and its name is part of what it said; a machine signed
 * in again is a new grant with its own. Who may call this is the record's (an owner-only method), not the kernel's.
 */
export async function renameDevice(deps: TokenDeps, handle: string, label: string): Promise<Result<DeviceRow>> {
  const name = typeof label === 'string' ? label.trim() : '';
  if (name === '') return no('REQUIRED_MISSING', 'Name the machine, such as Studio or MacBook.', { at: 'label' });
  if (name.length > MACHINE_NAME_MAX)
    return no('OUT_OF_BOUNDS', `A machine's name is at most ${String(MACHINE_NAME_MAX)} characters, and this is ${String(name.length)}. Choose a shorter one.`, { at: 'label' });
  if (/\p{Cc}/u.test(name)) return no('VALUE_MALFORMED', "A machine's name is one line, with no tab or line break. Type it on one line.", { at: 'label' });
  if (name.includes(SEAM.trim()))
    return no('VALUE_MALFORMED', "A machine's name cannot hold a middle dot, which BrainDog uses to say what the machine does. Leave it out.", { at: 'label' });
  if (name.startsWith('report:') || name.startsWith('job:'))
    return no('VALUE_MALFORMED', 'A machine cannot be called report: or job:, which name keys BrainDog makes itself. Choose another name.', { at: 'label' });

  let found: Stored | undefined;
  for (const row of deps.sql.all<Stored>(`SELECT ${VISIBLE}, code_hash, token_hash FROM device_grant`))
    if ((await handleOf(deps, row.id)) === handle) found = row;
  if (!found) return no('OUT_OF_BOUNDS', `There is no device called ${String(handle)}.`, { at: 'handle' });
  if (!['pending', 'approved', 'active'].includes(found.status))
    return no('FORBIDDEN', `That machine's sign-in is ${found.status}, so it keeps the name it had. Sign the machine in again to name it.`, { at: 'handle' });

  const old = found.label ?? '';
  const renamed = old.includes(SEAM) ? `${name}${old.slice(old.indexOf(SEAM))}`.slice(0, 120) : name;
  const now = instant(deps.nowMs);
  const { id, code_hash: _code, token_hash: tokenHash, ...visible } = found;
  deps.sql.transactionSync(() => {
    deps.sql.exec('UPDATE device_grant SET label = ? WHERE id = ?', renamed, id);
    if (tokenHash)
      deps.sql.exec(
        /* A token minted before the stamp has no app to name a host for, and still takes the new label. */
        "UPDATE token SET label = ?, host = CASE WHEN client_kind = 'device' THEN ? ELSE host END WHERE hash = ? AND revoked_at IS NULL AND expires_at > ?",
        renamed,
        name,
        tokenHash,
        now,
      );
  });
  return ok(await shown(deps, { ...visible, id, label: renamed }));
}

/**
 * A keychain-grant bearer, checked. INTERNAL: the host calls it before it opens a key for an agent.
 *
 * The same one sentence for every way it fails, as `verifyToken` does. The approver's suspension stops the grant with
 * them, and so does their leaving the owners (`APPROVER_STANDING`).
 */
export async function keychainGrant(deps: TokenDeps, bearer: string): Promise<Result<KeychainGrant>> {
  const cut = typeof bearer === 'string' ? bearer.indexOf('.') : -1;
  const record = cut < 0 ? '' : bearer.slice(0, cut);
  const secret = cut < 0 ? '' : bearer.slice(cut + 1);
  const wrong = no<KeychainGrant>('FORBIDDEN', 'That keychain grant is not known here.', { at: 'vault' });
  if (!record || !secret || record !== deps.recordId()) return wrong;

  const row = deps.sql.one<{
    id: string;
    scope: string | null;
    approved_by: string | null;
    approved_at: string | null;
    expires: string;
    suspended_at: string | null;
    still_owner: string | null;
  }>(
    `SELECT d.id AS id, d.scope AS scope, d.approved_by AS approved_by, d.approved_at AS approved_at, d.expires AS expires,
            p.suspended_at AS suspended_at, m.person_id AS still_owner
     FROM device_grant d ${APPROVER_STANDING}
     WHERE d.token_hash = ? AND d.reach = 'vault' AND d.status = 'active'`,
    await deps.digest(secret),
  );
  if (!row || !row.scope || !row.approved_by || !row.still_owner || row.suspended_at || row.expires <= instant(deps.nowMs)) return wrong;
  /* THE OPERATOR'S CUT-OFF, in the same sentence as every other failure (`verifyToken`). */
  if (endedByCutOff(deps.validFrom, row.approved_at)) return wrong;

  deps.sql.exec('UPDATE device_grant SET last_used = ? WHERE id = ?', instant(deps.nowMs), row.id);
  return ok({ handle: await handleOf(deps, row.id), scope: row.scope, person: row.approved_by, expires: row.expires });
}

/**
 * A shape-grant bearer, checked. INTERNAL: the host calls it before it takes a shape copy (`shape.ts`), and a shape copy
 * is the one thing it lets the caller have.
 *
 * STANDING, NOT SPENT. Unlike an operation grant it is read again and again for its ninety days, and each read writes
 * `last_used`, so the sweep's fourteen silent days count from the last copy taken. The same one sentence for every way it
 * fails, as `keychainGrant` gives it: another record, another reach, past its life, an approver since suspended or no longer
 * an owner, or approved before the operator's cut-off.
 */
export async function shapeGrant(deps: TokenDeps, bearer: string): Promise<Result<ShapeGrant>> {
  const cut = typeof bearer === 'string' ? bearer.indexOf('.') : -1;
  const record = cut < 0 ? '' : bearer.slice(0, cut);
  const secret = cut < 0 ? '' : bearer.slice(cut + 1);
  const wrong = no<ShapeGrant>('FORBIDDEN', 'That shape grant is not known here.', { at: 'shape' });
  if (!record || !secret || record !== deps.recordId()) return wrong;

  const row = deps.sql.one<{ id: string; approved_by: string | null; approved_at: string | null; expires: string; suspended_at: string | null; still_owner: string | null }>(
    `SELECT d.id AS id, d.approved_by AS approved_by, d.approved_at AS approved_at, d.expires AS expires, p.suspended_at AS suspended_at,
            m.person_id AS still_owner
     FROM device_grant d ${APPROVER_STANDING}
     WHERE d.token_hash = ? AND d.reach = 'shape' AND d.status = 'active'`,
    await deps.digest(secret),
  );
  if (!row || !row.approved_by || !row.still_owner || row.suspended_at || row.expires <= instant(deps.nowMs)) return wrong;
  if (endedByCutOff(deps.validFrom, row.approved_at)) return wrong;

  deps.sql.exec('UPDATE device_grant SET last_used = ? WHERE id = ?', instant(deps.nowMs), row.id);
  return ok({ handle: await handleOf(deps, row.id), person: row.approved_by, expires: row.expires });
}

/**
 * An operation bearer, checked and spent. INTERNAL: the host calls it before it builds a context for the one ADMIN method
 * the reach names (`OPERATION_METHOD`), and the record's gate admits that context for that method and no other.
 *
 * NOTHING READ THESE BEARERS BEFORE. `devicePoll` minted one for reach `export` or `import` and gave it ten minutes,
 * and the only reader of `token_hash` was `keychainGrant`, which matches `reach = 'vault'` alone, so the CLI could be
 * handed a bearer that no door on either host would take (`test/operation-grant.test.ts`).
 *
 * SPENT ON FIRST USE, IN THE SAME TURN IT IS READ. The digest is awaited first, then the row is read and
 * marked `expired` with nothing awaited between, so a second request carrying the same bearer finds the row spent even
 * when the two arrive together. `expires` and `last_used` are both set to now, which is how the device listing tells a
 * grant that was used from one that ran out.
 *
 * ONE SENTENCE FOR EVERY WAY IT FAILS, as `keychainGrant` and `verifyToken` give it: spent, past its ten minutes, for
 * another record, of another reach, approved by somebody since suspended, or approved before the operator's cut-off
 * (`TokenDeps.validFrom`). A caller replaying a bearer learns nothing
 * a caller guessing one does not.
 */
export async function operationGrant(deps: TokenDeps, bearer: string): Promise<Result<OperationGrant>> {
  const cut = typeof bearer === 'string' ? bearer.indexOf('.') : -1;
  const record = cut < 0 ? '' : bearer.slice(0, cut);
  const secret = cut < 0 ? '' : bearer.slice(cut + 1);
  const wrong = no<OperationGrant>('FORBIDDEN', 'That bearer is not an operation waiting here. Ask the device to start again.', {
    at: 'operation',
  });
  if (!record || !secret || record !== deps.recordId()) return wrong;

  const hash = await deps.digest(secret);
  const row = deps.sql.one<{
    id: string;
    reach: Reach;
    scope: string | null;
    approved_by: string | null;
    approved_at: string | null;
    expires: string;
    suspended_at: string | null;
  }>(
    `SELECT d.id AS id, d.reach AS reach, d.scope AS scope, d.approved_by AS approved_by, d.approved_at AS approved_at, d.expires AS expires,
            p.suspended_at AS suspended_at
     FROM device_grant d LEFT JOIN person p ON p.id = d.approved_by
     WHERE d.token_hash = ? AND d.status = 'active'`,
    hash,
  );
  const now = instant(deps.nowMs);
  if (!row || !OPERATIONS.includes(row.reach) || !row.approved_by || row.suspended_at || row.expires <= now) return wrong;
  /* THE OPERATOR'S CUT-OFF IS A SECOND BEARER TO COVER: on either host a bearer the token table refuses falls through
     to here at the operation doors (`OPERATION_METHOD`), so a grant approved before the instant is refused in the same
     sentence, and it is refused without being spent, as nothing that fails here is. */
  if (endedByCutOff(deps.validFrom, row.approved_at)) return wrong;
  /* AN APPROVAL TIED TO NO REQUEST, past the owner's date (`UNBOUND_REFUSED_FROM`): one started before it and spent after
     it is refused too, unspent like every refusal here. Said in its own words, not `wrong`'s, because the bearer matched
     and the person holding it is the one who has to update the command. */
  if (boundBody(row.scope) === null && deps.nowMs >= UNBOUND_REFUSED_FROM) return no<OperationGrant>('FORBIDDEN', UNBOUND_REFUSED, { at: 'operation' });

  deps.sql.exec("UPDATE device_grant SET status = 'expired', expires = ?, last_used = ? WHERE id = ? AND status = 'active'", now, now, row.id);
  const reach = row.reach as OperationGrant['reach'];
  return ok({ handle: await handleOf(deps, row.id), reach, method: OPERATION_METHOD[reach], person: row.approved_by, binds: boundBody(row.scope) });
}

/**
 * The hourly sweep's part. Codes past their ten minutes expire, and so does an active grant that ran
 * out or has been silent for fourteen days; a login grant's token is revoked with it. A denied row is
 * never touched. Returns how many rows it moved.
 */
export function deviceSweep(deps: TokenDeps): number {
  const now = instant(deps.nowMs);
  const cutoff = instant(deps.nowMs - SILENT_MS);
  let moved = deps.sql.all<{ id: string }>(
    "SELECT id FROM device_grant WHERE status IN ('pending', 'approved') AND expires <= ?",
    now,
  ).length;
  deps.sql.exec("UPDATE device_grant SET status = 'expired' WHERE status IN ('pending', 'approved') AND expires <= ?", now);

  /* A LOGIN GRANT IS HEARD FROM THROUGH ITS TOKEN. `verifyToken` writes the token's `last_used_at`,
     not this row's, so the newer of the two is when the device last spoke. */
  const active = deps.sql.all<{ id: string; expires: string; last_used: string | null; token_id: string | null; token_used: string | null }>(
    `SELECT d.id AS id, d.expires AS expires, d.last_used AS last_used, t.id AS token_id, t.last_used_at AS token_used
     FROM device_grant d LEFT JOIN token t ON d.reach = 'login' AND t.hash = d.token_hash
     WHERE d.status = 'active'`,
  );
  for (const row of active) {
    const heard = [row.last_used, row.token_used].filter((x): x is string => x !== null).sort().pop() ?? '';
    if (row.expires > now && heard >= cutoff) continue;
    deps.sql.exec("UPDATE device_grant SET status = 'expired' WHERE id = ?", row.id);
    if (row.token_id) revokeToken(deps, 'system', row.token_id);
    moved++;
  }
  return moved;
}
