/**
 * `braindog token create`: an agent token, minted by the owner from a shell and printed once (`docs/48-SPEC-CLI.md`
 * §5.12).
 *
 * BEFORE THIS NOTHING ON THIS MACHINE COULD MINT ONE. The CLI's device reaches were login, vault, export and import; the
 * kernel's `token` operation reach existed and nothing asked for it, so an agent's token came from Settings or not at
 * all. And no token from anywhere could read the money inbox, because `createToken` kept no reach.
 * `--inbox` asks for that reach, and it is off unless it is typed.
 *
 * THE TOKEN IS PRINTED ONCE, TO STDOUT, AND KEPT NOWHERE. It is not written to the hosts file: this is a credential for
 * another agent, not for this machine's own login, and a copy on disk is a key somebody has to remember is there. It is
 * the one bearer `--json` carries, because the spec says the new token's value is shown once there by design.
 *
 * REACHED THE WAY `export` REACHES ITS ADMIN DOOR (`brainfile.ts`, `admin`): with `BRAINDOG_TOKEN` or nothing on this
 * machine first, then an operation grant the owner approves for this one mint, spent on its first use.
 */

import { parseArgs } from 'node:util';

import type { Refusal, Result } from '@braindog/ports';

import { inTheClear, isLoopback, withFixOf } from './http.ts';
import { refuse } from './json.ts';
import { approveOperation, heldLogin } from './login.ts';
import type { BrainfileIo } from './brainfile.ts';

export type TokenIo = BrainfileIo & {
  /**
   * The owner's approval of one `createToken`, as a bearer that the record spends on first use, or the exit code once
   * the reason has been said. `approveOperation` unless a test holds it.
   */
  approve?: ((host: string) => Promise<{ bearer: string } | number>) | undefined;
};

const USAGE =
  'braindog token create takes --name <name>, --scope <read|propose|write>, --days <n>, --inbox and --host <host>, and nothing else.';

/** The ladder, lowest first, so a list of scopes collapses to the highest one named (§5.12, `30 §10`). */
const LADDER = ['read', 'propose', 'write'] as const;
type Scope = (typeof LADDER)[number];

/** What `createToken` answers, as far as this command reads it. */
type Minted = { id: string; bearer: string; scope: string; reach?: unknown; expires_at: string };

/** One POST to `/api/createToken`, and its answer as a `Result`, with a host that did not answer as `UNREACHABLE`. */
async function post(url: URL, key: string, args: object, bearer: string | undefined, io: TokenIo): Promise<{ status: number; result: Result<unknown> }> {
  const gone = { status: 0, result: { ok: false as const, refusal: { code: 'UNREACHABLE', fix: `${key} did not answer, so no token was made.` } } };
  let res: Response;
  try {
    /* A REDIRECT IS REFUSED, not followed, for `clientFor`'s reason: it would carry the bearer somewhere nobody chose. */
    res = await (io.fetch ?? globalThis.fetch)(`${url.origin}/api/createToken`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }) },
      body: JSON.stringify(args),
      redirect: 'error',
      signal: io.signal ? AbortSignal.any([io.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    });
  } catch {
    /* The error could quote the request, and the request holds the bearer. */
    return gone;
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return gone;
  }
  const envelope = body as { ok?: unknown; refusal?: unknown };
  if (typeof body !== 'object' || body === null || typeof envelope.ok !== 'boolean' || (envelope.ok === false && typeof envelope.refusal !== 'object')) return gone;
  /* A 401 TO BRAINDOG_TOKEN SAYS TO CHANGE IT (`refusedFix`), since the host says only `unauthorized`. */
  const result = body as Result<unknown>;
  return { status: res.status, result: res.status === 401 && bearer !== undefined && bearer === io.env.BRAINDOG_TOKEN ? withFixOf(result, { key, from: 'env' }) : result };
}

/** `braindog token create`, and the exit code: 0 minted and printed, 1 refused or not what was asked, 3 no answer. */
export async function tokenCommand(args: string[], io: TokenIo): Promise<number> {
  const [sub, ...rest] = args;
  if (sub !== 'create') {
    io.say(sub === undefined ? USAGE : `braindog token has one command, create, and not ${sub}. ${USAGE}`);
    return 1;
  }
  let values: { name?: string | undefined; scope?: string | undefined; days?: string | undefined; inbox?: boolean | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({
      args: rest,
      strict: true,
      allowPositionals: false,
      options: { name: { type: 'string' }, scope: { type: 'string' }, days: { type: 'string' }, inbox: { type: 'boolean' }, host: { type: 'string' } },
    }));
  } catch {
    io.say(USAGE);
    return 1;
  }

  /* READ UNLESS MORE IS NAMED. A token handed to an agent is the least it needs, and the owner says when it needs more. */
  const named = (values.scope ?? 'read').split(',').map((s) => s.trim()).filter((s) => s !== '');
  const unknown = named.find((s) => !(LADDER as readonly string[]).includes(s));
  if (unknown !== undefined || named.length === 0) {
    io.say(`A token's scope is read, propose or write, and ${unknown ?? 'nothing'} is not one of them.`);
    return 1;
  }
  const scope: Scope = LADDER[Math.max(...named.map((s) => LADDER.indexOf(s as Scope)))]!;
  const days = values.days === undefined ? undefined : Number(values.days);
  if (days !== undefined && !Number.isInteger(days)) {
    io.say(`--days is a whole number of days, and ${values.days} is not one.`);
    return 1;
  }
  const inbox = values.inbox === true;

  let key: string | null;
  try {
    key = heldLogin(values.host, io.env, io.file).host;
  } catch (e) {
    io.say(e instanceof Error ? e.message : `${io.file} could not be read.`);
    return 1;
  }
  if (key === null) {
    io.say(`No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or name a default in ${io.file}.`);
    return 1;
  }
  const url = new URL(key);
  if (inTheClear(url)) {
    io.say(`${key} is http, not https. BrainDog sends a new token only over https, except to this machine.`);
    return 1;
  }

  const asked = {
    scope,
    ...(values.name === undefined ? {} : { label: values.name }),
    ...(days === undefined ? {} : { days }),
    ...(inbox ? { reach: ['inbox'] } : {}),
  };
  /* THE SERVER KEY, OR NOTHING ON THIS MACHINE, FIRST; THEN THE OWNER'S APPROVAL of this one mint. The record answers a
     token or a missing credential with `NEEDS_BROWSER_SESSION` (its `createToken`), which is the signal to ask. */
  const held = io.env.BRAINDOG_TOKEN || undefined;
  let got: Result<unknown> | null = null;
  if (held !== undefined || isLoopback(url.hostname)) {
    const first = await post(url, key, asked, held, io);
    const refusal: Refusal | null = first.result.ok ? null : ((first.result as { refusal?: Refusal }).refusal ?? null);
    if (!(refusal?.code === 'NEEDS_BROWSER_SESSION' || (first.status === 401 && held === undefined))) got = first.result;
  }
  if (got === null) {
    /* THE `token` OPERATION REACH OPENS `createToken` AND NOTHING ELSE (`OPERATION_METHOD` in `packages/kernel/src/device.ts`).
       Its words read "Run braindog token again", which is this command. */
    const grant = await (io.approve ?? ((host: string) => approveOperation(host, 'token', io)))(key);
    if (typeof grant === 'number') return grant;
    got = (await post(url, key, asked, grant.bearer, io)).result;
  }
  if (!got.ok) return refuse(io, got);

  const minted = got.value as Minted;
  if (typeof minted?.bearer !== 'string' || typeof minted.id !== 'string') {
    io.say(`${key} answered in a way this command does not recognise, so no token is shown.`);
    return 3;
  }
  /* A HOST OLDER THAN TOKEN REACHES MINTS WITHOUT ONE AND SAYS NOTHING: its kernel took `{ scope, label, days }` and
     dropped the rest (measured against the kernel before migration 15). Printing that token would hand the owner an
     agent that is refused at the inbox for a reason nobody told them, so it is not printed. Nobody holds its secret, so
     nothing can use it. */
  const reach = Array.isArray(minted.reach) ? minted.reach : [];
  if (inbox && !reach.includes('inbox')) {
    io.say(`${key} made token ${minted.id} without the inbox, so it could not read it and is not shown. Update the host, revoke ${minted.id} in Settings, and run this again.`);
    return 1;
  }

  const expires = typeof minted.expires_at === 'string' ? minted.expires_at.slice(0, 10) : '';
  io.out(`${values.name ?? 'no name'} · ${minted.scope}${inbox ? ' · reads the inbox' : ''} · expires ${expires} · ${minted.id}`);
  io.out('');
  io.out(minted.bearer);
  io.out('shown once');
  io.answer?.({ value: { id: minted.id, name: values.name ?? null, scope: minted.scope, reach, expires_at: minted.expires_at, token: minted.bearer } });
  return 0;
}
