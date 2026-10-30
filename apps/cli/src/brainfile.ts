/**
 * `braindog export` and `braindog import <file.brainl>`: the record as a file, taken and put back (`docs/48-SPEC-CLI.md`
 * §5.4 and §5.8).
 *
 * AT `07ba6dbd` NEITHER EXISTED. `braindog export` answered "braindog has no command called export", and `braindog
 * import latest.brainl` answered with the adapter importer's usage line, exit 1 (both measured before this file). The
 * record had the doors (`export`, and an `import` that replaces), and nothing on this machine could reach
 * them, because both are ADMIN and the only bearer the CLI kept was a login token no ADMIN door takes (ADR-060).
 *
 * A BACKUP CARRIES THE SEALED BYTES BY DEFAULT. A replacing import is refused when the record holds `vault_key` rows or
 * sealed grants and the file carries none (`packages/kernel/src/index.ts`, `import`), because putting such a file back would throw every key away. The record's
 * `export` redacts unless it is asked not to and the wrapping key is named, so an export that took the record's own
 * default could never restore the record it came from. So this asks for `redactGrants: false` with the key named, and
 * `--redact-grants` is the copy to hand somebody, which says in so many words that it cannot put the vault back.
 *
 * THE FILE IS CHECKED ON THIS MACHINE ON BOTH SIDES, with `verify`: after an export lands, so a copy that does not
 * check is said to be one before anybody relies on it, and before an import leaves, so a damaged or forged file is
 * refused here with nothing sent.
 *
 * `import` ALWAYS REPLACES. A record `createRecord` made is never empty (measured: two schedule rows, the owner's
 * person and member rows and the `create` event), so the empty-record import could never put a record back into itself,
 * and a fresh record is `braindog init --from`'s work on the self-host. The record refuses a file that is not
 * its own copy, and names both ids in that sentence.
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Refusal, Result } from '@braindog/ports';
import { isShape } from '@braindog/kernel';

import { inTheClear, isLoopback, readHosts, saveHosts, withFixOf, type Held, type HostsFile } from './http.ts';
import { refuse, type Answer } from './json.ts';
import * as signIn from './login.ts';
import { approveOperation, heldLogin } from './login.ts';
import type { AgentIo } from './skills.ts';
import { verify, type Verified } from './verify.ts';

export type BrainfileIo = Pick<AgentIo, 'env' | 'cwd' | 'out' | 'say' | 'answer'> & {
  /** The hosts file, read for the default host and never for a bearer (see `admin`). */
  file: string;
  fetch?: typeof globalThis.fetch | undefined;
  /** Aborted by Ctrl+C. */
  signal?: AbortSignal | undefined;
  now?: (() => number) | undefined;
  /** How this machine is named to the person approving the operation. */
  label?: string | undefined;
};

/** `48 §7`: an export or an import body is given ten minutes, not the twenty seconds of one tool call. */
const BODY_MS = 600_000;

const EXPORT_USAGE =
  'braindog export takes --redact-grants, --kek <id>, --sections <data,origin,governance>, -o <file.brainl>, --key <pubkey|url> and --host <host>, and nothing else. braindog export --shape takes -o and --host.';
const SHAPE_USAGE = 'braindog export --shape takes -o <file.shape.brainl> and --host <host>, and nothing else.';
const IMPORT_USAGE =
  'braindog import takes one .brainl file, and --key <pubkey|url> and --host <host>, as in braindog import latest.brainl.';

/** A slug as the Directory spells one, so it can name a file without being read as a path. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

type Sent = { status: number; result: Result<unknown> };

/**
 * The host a command reaches, found as every other command finds it, or `null` once the sentence has been said.
 *
 * THE BEARER IS NOT READ HERE, and `target` is not called for that reason: it takes the hosts file's login token when
 * `BRAINDOG_TOKEN` is unset, and throws when that login has lapsed, which would stop an export over a credential it
 * never sends (see `admin`).
 */
function hostFor(flag: string | undefined, io: BrainfileIo): { key: string; url: URL } | null {
  let key: string | null;
  try {
    key = heldLogin(flag, io.env, io.file).host;
  } catch (e) {
    io.say(e instanceof Error ? e.message : `${io.file} could not be read.`);
    return null;
  }
  if (key === null) {
    io.say(`No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or name a default in ${io.file}.`);
    return null;
  }
  const url = new URL(key);
  if (inTheClear(url)) {
    io.say(`${key} is http, not https. BrainDog sends a record only over https, except to this machine.`);
    return null;
  }
  return { key, url };
}

/** One POST to `/api/<method>`, and its answer as a `Result`, with a host that did not answer as `UNREACHABLE`. */
async function post(host: { key: string; url: URL }, method: 'export' | 'import' | 'shape', args: object, bearer: string | undefined, io: BrainfileIo): Promise<Sent> {
  /* AN IMPORT WITH NO ANSWER IS NOT KNOWN NOT TO HAVE HAPPENED. The body had left, and a socket that drops after the
     record took it, or a Ctrl+C while it was writing, leaves the record replaced; "nothing was put back" was said here
     until `brainfile.test.ts` pinned it. The export's claim is about this machine, where nothing was written. */
  const gone = (): Sent => ({
    status: 0,
    result: {
      ok: false,
      refusal: {
        code: 'UNREACHABLE',
        fix:
          method !== 'import'
            ? `${host.key} did not answer, so nothing was exported.`
            : `${host.key} did not answer, so this command cannot say whether the record was put back.`,
      },
    },
  });
  const deadline = AbortSignal.timeout(BODY_MS);
  let res: Response;
  try {
    /* A REDIRECT IS REFUSED, not followed, for `clientFor`'s reason: it would carry the bearer somewhere nobody chose. */
    res = await (io.fetch ?? globalThis.fetch)(`${host.url.origin}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }) },
      body: JSON.stringify(args),
      redirect: 'error',
      signal: io.signal ? AbortSignal.any([io.signal, deadline]) : deadline,
    });
  } catch {
    /* The error could quote the request, and the request holds the bearer. */
    return gone();
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return gone();
  }
  const envelope = body as { ok?: unknown; refusal?: unknown };
  if (typeof body !== 'object' || body === null || typeof envelope.ok !== 'boolean' || (envelope.ok === false && typeof envelope.refusal !== 'object')) return gone();
  /* A 401 TO BRAINDOG_TOKEN SAYS TO CHANGE IT (`refusedFix`), since the host says only `unauthorized`. */
  const result = body as Result<unknown>;
  return { status: res.status, result: res.status === 401 && bearer !== undefined && bearer === io.env.BRAINDOG_TOKEN ? withFixOf(result, { key: host.key, from: 'env' }) : result };
}

/**
 * One ADMIN method, reached the way `48 §5.2`'s `admin` reaches it, with one change.
 *
 * FIRST WITH `BRAINDOG_TOKEN`, OR WITH NOTHING ON THIS MACHINE. A self-host's server key is the owner (`48 §13 D1`) and
 * needs no approval, and a self-host started without one is open to its own machine. Either answers here and nothing
 * else happens.
 *
 * NOT WITH THE HOSTS FILE'S LOGIN, which is the change. `braindog login` keeps an agent token, and the record's ADMIN
 * gate refuses every token (`admin` in `packages/record/src/index.ts`), so trying it first could only ever cost one
 * refused request, and for an import that request carries the whole record.
 *
 * THEN THE DEVICE FLOW, when that answer asks for a browser or no credential was sent: the owner approves this one
 * operation, and its bearer is sent once. The record spends it on that first use, so it is never retried and never kept.
 */
async function admin(host: { key: string; url: URL }, method: 'export' | 'import', args: object, io: BrainfileIo): Promise<Result<unknown> | number> {
  const held = io.env.BRAINDOG_TOKEN || undefined;
  if (held !== undefined || isLoopback(host.url.hostname)) {
    const first = await post(host, method, args, held, io);
    const refusal: Refusal | null = first.result.ok ? null : ((first.result as { refusal?: Refusal }).refusal ?? null);
    const approval = refusal?.code === 'NEEDS_BROWSER_SESSION' || (first.status === 401 && held === undefined);
    if (!approval) return first.result;
  }
  /* BOUND TO THIS BODY (`binds`), which `post` sends as `JSON.stringify(args)` and nothing else. */
  const grant = await approveOperation(host.key, method, { ...io, body: JSON.stringify(args) });
  if (typeof grant === 'number') return grant;
  return (await post(host, method, args, grant.bearer, io)).result;
}

/** `verify` over one file, with its `Verified` kept here rather than handed on, so each command answers once. */
async function checked(file: string, key: string | undefined, io: BrainfileIo): Promise<{ code: number; verified: Verified | null }> {
  let verified: Verified | null = null;
  const code = await verify([file, ...(key === undefined ? [] : ['--key', key])], {
    cwd: io.cwd,
    out: io.out,
    say: io.say,
    answer: (a: Answer) => {
      if (a.refusal) io.answer?.(a);
      if ('value' in a) verified = a.value as Verified;
    },
    ...(io.fetch ? { fetch: io.fetch } : {}),
  });
  return { code, verified };
}

/** The `slug` of a file's one `record` row, read by column name from its header, or `null`. */
function slugOf(lines: readonly string[]): string | null {
  const at = lines.findIndex((l) => l.startsWith('#table record '));
  if (at < 0) return null;
  const columns = (lines[at]!.slice('#table record '.length).split(' ')[0] ?? '').split(',');
  try {
    const row: unknown = JSON.parse(lines[at + 1] ?? '');
    const slug = Array.isArray(row) ? row[columns.indexOf('slug')] : undefined;
    return typeof slug === 'string' && SLUG.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

/** `braindog export`, and the exit code: 0 written and checked, 1 refused or not checked, 3 the host did not answer. */
export async function exportFile(args: string[], io: BrainfileIo): Promise<number> {
  /* A SHAPE COPY IS ITS OWN PATH (`shapeExport` below): another bearer, another door, and a file with no value in it. */
  if (args.includes('--shape')) return shapeExport(args.filter((a) => a !== '--shape'), io);
  let values: { host?: string | undefined; 'redact-grants'?: boolean | undefined; kek?: string | undefined; sections?: string | undefined; out?: string | undefined; key?: string | undefined };
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      options: {
        host: { type: 'string' },
        'redact-grants': { type: 'boolean' },
        kek: { type: 'string' },
        sections: { type: 'string' },
        out: { type: 'string', short: 'o' },
        key: { type: 'string' },
      },
    }));
  } catch {
    io.say(EXPORT_USAGE);
    return 1;
  }
  const redact = values['redact-grants'] === true;
  if (redact && values.kek !== undefined) {
    io.say('--redact-grants leaves the sealed bytes out and --kek names the key that carries them, so pass one or the other.');
    return 1;
  }
  const host = hostFor(values.host, io);
  if (host === null) return 1;

  const sections = values.sections?.split(',').map((s) => s.trim()).filter((s) => s !== '');
  /* THE WRAPPING KEY IS NAMED, OR ASKED FOR. With no `--kek`, `redactGrants: false` still goes, with no key named. A
     record with no vault takes it and hands back the whole file, since there is nothing sealed to guard; one with a
     vault refuses it with `WRONG_KEY` and a sentence that names the key it holds, which is where a person learns the
     id: no read of the record says it, and this command does not scrape it out of the sentence. */
  const asked = {
    ...(sections === undefined ? {} : { sections }),
    redactGrants: redact,
    ...(values.kek === undefined ? {} : { kek_id: values.kek }),
  };
  const got = await admin(host, 'export', asked, io);
  if (typeof got === 'number') return got;
  if (!got.ok) {
    const code = refuse(io, got);
    const refusal = (got as { refusal?: Refusal }).refusal;
    /* `--kek` ONLY WHEN THE RECORD NAMED A KEY, which it says with `at: 'kek_id'`. This line was said on every
       `WRONG_KEY`, and a review found it sending the owner of a record with no vault to name a key that
       does not exist. The record now takes that export, and refuses a vault whose key has no id at `vault_key`, which
       gets the one sentence that is true of it. A record build older than this one still answers a vault-less record
       at `kek_id`, and that owner still hears `--kek` until the host is updated: the refusal carries no other signal. */
    if (refusal?.code === 'WRONG_KEY' && refusal.at === 'kek_id')
      io.say(
        'A backup carries the sealed bytes, so it names the key they are wrapped by: run braindog export --kek <that key>. braindog export --redact-grants writes a copy without them, to share, and braindog import cannot put the keys back from it.',
      );
    else if (refusal?.code === 'WRONG_KEY')
      io.say('braindog export --redact-grants writes a copy without the sealed bytes, to share, and braindog import cannot put the keys back from it.');
    return code;
  }
  const lines = got.value;
  if (!Array.isArray(lines) || !lines.every((l) => typeof l === 'string')) {
    io.say(`${host.key} answered the export with something that is not the lines of a file, so nothing was written.`);
    return 3;
  }

  const path = resolve(io.cwd, values.out ?? `${slugOf(lines) ?? 'record'}.brainl`);
  const shown = relative(io.cwd, path) || path;
  /* `0600` AND RENAMED INTO PLACE (`48 §8`): the file is the whole record, its sealed bytes included, and a copy cut off
     halfway must never sit under the name a restore will be run against. */
  try {
    writeFileSync(`${path}.part`, `${lines.join('\n')}\n`, { mode: 0o600 });
    renameSync(`${path}.part`, path);
  } catch {
    io.say(`${shown} could not be written, so the export was taken and not kept. Run it again with -o naming a folder you can write to.`);
    return 1;
  }

  const { code, verified } = await checked(path, values.key, io);
  if (code !== 0) {
    io.say(`${shown} was written and does not check, so it is kept for you to look at and is not a copy to put back.`);
    return code;
  }
  io.out(`wrote ${shown}`);
  if (redact)
    io.out(
      '  without the sealed bytes: this is a copy to share, and braindog import will not put this BrainDog back from it while it holds keys.',
    );
  io.answer?.({ value: { file: path, redacted: redact, verified } });
  return 0;
}

/* ── the shape copy ─────────────────────────────────────────────────────────────────────────────────────────── */

/** A host's entry in the hosts file, with the shape grant `keepShape` puts beside the login. */
type Entry = HostsFile['hosts'][string] & { shape?: Held };

/** The device flow for a standing shape grant (`approveShape` in `login.ts`), or `undefined` on a build without it. */
type ShapeApproval = (
  raw: string,
  io: Pick<BrainfileIo, 'say' | 'signal' | 'fetch' | 'now' | 'label'>,
) => Promise<{ key: string; bearer: string; expires: string; label: string } | number>;
const approveShape = (signIn as unknown as { approveShape?: ShapeApproval }).approveShape;

/** The shape grant this machine keeps for a host, while it lasts, or `null`. Read only for this host and this reach. */
function heldShape(file: string, key: string, now: number): Held | null {
  let held: Held | undefined;
  try {
    held = (readHosts(file).hosts[key] as Entry | undefined)?.shape;
  } catch {
    return null;
  }
  if (typeof held?.value !== 'string' || typeof held.expires !== 'string') return null;
  return Date.parse(held.expires) > now ? held : null;
}

/**
 * Keeps a shape grant under its host, beside the login and never in its place, or drops it with `null`.
 *
 * THE FILE IS READ AGAIN JUST BEFORE THE WRITE, as `keepRunner` does, because minutes pass while somebody approves the
 * six digits and another command may have written it meanwhile.
 */
function keepShape(file: string, key: string, shape: Held | null): void {
  const hosts = readHosts(file);
  const { shape: _gone, ...rest }: Entry = hosts.hosts[key] ?? {};
  const next: Entry = shape === null ? rest : { ...rest, shape };
  hosts.hosts[key] = next;
  saveHosts(file, hosts);
}

/**
 * `braindog export --shape`, and the exit code: 0 written, 1 refused or not a shape, 3 the host did not answer.
 *
 * A SHAPE COPY IS THE RECORD WITH EVERY VALUE SCRAMBLED: the same lists, the same count of entries, the same
 * length in every value, and not a word anybody typed. The look and the gates open it on a scratch record and see what
 * a lived record looks like.
 *
 * ONE APPROVAL, THEN NONE. Its bearer is a standing grant of reach `shape`, approved once in the app with six digits
 * and kept in the hosts file beside the login, so the loop on this machine takes a copy with no prompt for ninety days.
 * It opens `POST /api/shape` and nothing else. A grant the record no longer knows (revoked, or past the operator's
 * cut-off) is dropped here and asked for again, once.
 *
 * THE FILE IS CHECKED BEFORE IT IS KEPT: a host that answered lines without the shape mark gets nothing written, since
 * a file of real values under a shape file's name is the one mistake this command must not make.
 */
export async function shapeExport(args: string[], io: BrainfileIo): Promise<number> {
  let values: { host?: string | undefined; out?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { host: { type: 'string' }, out: { type: 'string', short: 'o' } } }));
  } catch {
    io.say(SHAPE_USAGE);
    return 1;
  }
  const host = hostFor(values.host, io);
  if (host === null) return 1;
  const now = io.now ?? Date.now;

  let held = heldShape(io.file, host.key, now());
  let got: Result<unknown> | null = null;
  if (held !== null) {
    got = (await post(host, 'shape', {}, held.value, io)).result;
    const refusal = got.ok ? null : ((got as { refusal?: Refusal }).refusal ?? null);
    if (refusal?.code === 'FORBIDDEN' && refusal.at === 'shape') {
      keepShape(io.file, host.key, null);
      held = null;
      got = null;
    }
  }
  if (got === null) {
    if (approveShape === undefined) {
      io.say('This braindog cannot ask for a shape grant yet, so no shape copy was taken. Update braindog and run it again.');
      return 1;
    }
    io.say('A shape copy needs a standing grant, approved once in the app with six digits. Nothing in it is a word of the record.');
    const grant = await approveShape(host.key, io);
    if (typeof grant === 'number') return grant;
    keepShape(io.file, host.key, { value: grant.bearer, expires: grant.expires, label: grant.label });
    got = (await post(host, 'shape', {}, grant.bearer, io)).result;
  }

  if (!got.ok) return refuse(io, got);
  const lines = got.value;
  if (!Array.isArray(lines) || !lines.every((l) => typeof l === 'string')) {
    io.say(`${host.key} answered with something that is not the lines of a file, so nothing was written.`);
    return 3;
  }
  if (!isShape(lines)) {
    io.say(`${host.key} answered with a file that does not say it is a shape copy, so nothing was written.`);
    return 1;
  }

  const slug = host.url.pathname.replace(/^\/+(?:app\/+)?/, '').split('/')[0] ?? '';
  const path = resolve(io.cwd, values.out ?? `${SLUG.test(slug) ? slug : 'record'}.shape.brainl`);
  const shown = relative(io.cwd, path) || path;
  try {
    writeFileSync(`${path}.part`, `${lines.join('\n')}\n`, { mode: 0o600 });
    renameSync(`${path}.part`, path);
  } catch {
    io.say(`${shown} could not be written, so the copy was taken and not kept. Run it again with -o naming a folder you can write to.`);
    return 1;
  }
  io.out(`wrote ${shown}: ${lines.length.toLocaleString('en')} lines, every value scrambled`);
  io.answer?.({ value: { file: path, lines: lines.length, shape: true } });
  return 0;
}

/** A file's lines, or none when it cannot be read: the check that follows says so in its own words. */
function linesOf(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  } catch {
    return [];
  }
}

/** The one sentence a shape copy put back is answered with, naming the file by its name and not its folder. */
const shapeSentence = (file: string): string =>
  `${basename(file)} is a shape copy, with every word and number in it scrambled, so it opens only on a scratch record and nothing was sent.`;

/** `braindog import <file.brainl>`, and the exit code: 0 put back, 1 refused here or by the record, 3 the host did not answer. */
export async function importFile(args: string[], io: BrainfileIo): Promise<number> {
  let parsed: { values: { host?: string | undefined; key?: string | undefined }; positionals: string[] };
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: { host: { type: 'string' }, key: { type: 'string' } } });
  } catch {
    io.say(IMPORT_USAGE);
    return 1;
  }
  const [file, ...more] = parsed.positionals;
  if (file === undefined || more.length > 0) {
    io.say(IMPORT_USAGE);
    return 1;
  }
  /* A SHAPE COPY NEVER LEAVES THIS MACHINE AS A RECORD. It reads like any export, and put back it would replace
     every name and amount with scrambled words that look like his. So it is refused here, off the file's own mark and
     before the check, a host or an approval, in one sentence that says where it does open. An unreadable file falls
     through to the check, which says so. */
  if (isShape(linesOf(resolve(io.cwd, file)))) return refuse(io, { ok: false, refusal: { code: 'IMPORT_SHAPE', fix: shapeSentence(file) } });
  const host = hostFor(parsed.values.host, io);
  if (host === null) return 1;

  /* CHECKED BEFORE ANYTHING IS ASKED, so a file that does not check costs nobody an approval and never leaves. */
  const { code, verified } = await checked(file, parsed.values.key, io);
  if (code !== 0) {
    io.say(`${file} does not check, so nothing was sent.`);
    return code;
  }
  const text = readFileSync(resolve(io.cwd, file), 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const got = await admin(host, 'import', { lines, replace: true }, io);
  if (typeof got === 'number') return got;
  /* A FILE FROM ANOTHER RECORD IS REFUSED BY THE RECORD, whose sentence names both ids, and the verify block above
     has already said which record the file is. */
  if (!got.ok) return refuse(io, got);
  const report = (got.value ?? {}) as { tables?: unknown; rows?: unknown };
  const tables = typeof report.tables === 'number' ? report.tables : 0;
  const rows = typeof report.rows === 'number' ? report.rows : 0;
  const record = verified?.produced.by ?? 'the record';
  io.out(`put back ${record} from ${file}: ${tables} tables, ${rows.toLocaleString('en')} rows, in place of what it held`);
  io.answer?.({ value: { record, tables, rows, verified } });
  return 0;
}
