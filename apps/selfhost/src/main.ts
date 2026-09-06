/**
 * The self-host's entry: `serve` and `init`, and the file `48-SPEC-CLI` §5.14 spawns.
 *
 * NOTHING IN THIS REPOSITORY COULD CREATE A RECORD. The only caller of `createRecord` was a test,
 * and the only callers of the Directory's `provision` were its own — so a fresh self-host had no
 * `record` row, `recordIdentity(sql)` was null, `createToken` refused ("this record has no id yet,
 * and a bearer carries the record it is for"), and `verifyToken` refused every bearer. The server
 * worked at all only because an unauthenticated request fell back to a person nobody had invited.
 * `49 §5.22` has described the way out of that all along and it was not written.
 *
 * IT WRITES THE RECORD BEFORE THE DIRECTORY. `51 §13 D21`, and `49 §5.22` steps 6 → 7: "a Directory
 * row never points at a record that failed to initialise". The half-done case that leaves is
 * recoverable — a record object nothing can address yet — where the other order leaves a name
 * resolving to nothing, and a released name is a tombstone for ever.
 *
 * ONE SENTENCE ON STDERR AND NOTHING ON STDOUT. `49 §2`: "one sentence on stderr, nothing else";
 * `48 §5.14` spawns this with `stdio: 'inherit'`, so stdout belongs to the CLI's `--json` envelope.
 * `49 §6`: "nothing at boot or on the wire ever prints a token, a code, a cookie value or a
 * payload" — the success line names the PATH of the inbound token and never its contents.
 *
 * WHAT IT DOES NOT DO YET, said out loud rather than half-built:
 *
 *   - THE KEK, and the three keys. `49 §5.22` step 4 wraps a record DEK, a connector DEK and an
 *     Ed25519 signing key under `KeyStore.current()`, AES-GCM, bound to `record_id ‖ 0x1F ‖ purpose`
 *     (12 §6, 47 §4.6). There is no `KeyStore` in this repository, no KEK file reader and no crypto
 *     at all — `vault.ts` holds sealed bytes and cannot open them, deliberately. Writing that here
 *     would be inventing a key hierarchy in a CLI. `createRecord` takes `keys?` and writes no
 *     `vault_key` rows without them, which is the honest state: nothing is bound yet, so nothing
 *     needs opening.
 *   - `vapid.json`. Web Push is unspecified end to end (no subscription store, no subscribe route,
 *     no Cloud key location), so a keypair generated here would serve nothing.
 *   - `dev`. It needs a `Dispatch` port `start` does not have.
 */

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, env, exit, stderr } from 'node:process';

import { createRecordApi } from '@braindog/record';
import { createDirectory } from '@braindog/record/directory';
import { ulids } from '@braindog/kernel';

import { fixOf } from '@braindog/ports';

import { EVERY_KIND, openSqlite, start } from './server.ts';

/** `34-GRAMMARS` line 348, and the Directory's own — the two must agree or one of them is unreachable. */
const SLUG = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

/**
 * One sentence on stderr, and nothing on stdout — ever.
 *
 * `49 §2`: "one sentence on stderr, nothing else". `48 §5.14` spawns this with `stdio: 'inherit'`,
 * so stdout belongs to the CLI's `--json` envelope and anything written there corrupts it.
 *
 * AND THE WRITE IS FLUSHED BEFORE THE EXIT. `process.exit` does not wait for a pending write, and on
 * Windows a write to a PIPE is asynchronous — which is exactly how the CLI spawns this. So the exit
 * code arrived and the sentence explaining it did not, which is the one output this command has.
 */
function say(line: string): void {
  try {
    writeFileSync(2, `${line}\n`);
  } catch {
    /* A closed stderr is not a reason to fail; the exit code still carries. */
    stderr.write(`${line}\n`);
  }
}

/** One sentence, and the exit code `48 §4.4` reserves for a refusal. */
function refuse(said: string): never {
  say(said);
  return exit(1);
}

const dataDir = (): string => env.BRAINDOG_DATA ?? '/data';

/** One clock for the whole command, so the record and the Directory agree about when it happened. */
const clock = { now: () => Date.now() };

/**
 * `init <slug> [--owner <email>]`, and `BRAINDOG_OWNER` when the flag is absent.
 *
 * THE ORDER IS `49 §5.22`'S, with the record id minted first. The spec wraps the keys at step 4 and
 * mints the id at step 6, which cannot both be done as written once the wrapping is bound to the
 * record id — so the id comes first here, which is what a key step would need anyway.
 */
async function init(args: readonly string[]): Promise<void> {
  const slug = args[0];
  if (!slug) return refuse('braindog init needs a name for the record: init <slug> --owner <email>');

  const flag = args.indexOf('--owner');
  /* TRIMMED AND LOWER-CASED ONCE, HERE, and this value is the only one used afterwards. `49 §4.1`
     stores a person's address lower-cased and trimmed — and ` ada@example.com ` went through
     untrimmed, so `person$` stored the trimmed form and `provision` then looked up the untrimmed one
     and refused "has no account yet", after the record file had been written. */
  const email = ((flag >= 0 ? args[flag + 1] : undefined) ?? env.BRAINDOG_OWNER ?? '').trim().toLowerCase();
  /* AND AN OWNERLESS RECORD IS REFUSED. The spec does not say what happens without one, and there is
     no consistent way to invent it: the Directory's `person.email` is `NOT NULL`, so a record with
     no owner cannot be written there at all — and a record nobody owns is a record nobody can invite
     anybody to. */
  if (!email)
    return refuse('braindog init needs an owner: --owner <email>, or BRAINDOG_OWNER. A record nobody owns cannot be shared.');
  if (!email.includes('@')) return refuse(`${email} is not an address.`);

  const data = dataDir();
  const dir = join(data, slug);
  const file = join(dir, 'record.dog');

  /* ── EVERY REFUSAL THIS COMMAND CAN MAKE, BEFORE IT WRITES ANYTHING ──────────────────────────
     Not tidiness: a refusal that costs somebody the name they wanted is not a refusal. Three of
     these used to fire after the directory, the database and thirty-one tables existed — a reserved
     slug, an address with a space in it, a name already taken — and the retry then hit "is already a
     record", for ever, with no command that could clear it. */
  const dirFile = join(data, 'directory.sqlite');
  const dirSql = openSqlite(dirFile);
  const directory = createDirectory(dirSql, clock);

  /* AND THE DIRECTORY FILE IS NOT WORLD-READABLE. `<data>/<slug>/` is created by this command at
     0700, so a record is protected by the directory it is in — but `<data>` itself is usually a
     volume mount that already existed, where `mkdir`'s mode never applied, and this file sits
     directly in it. It holds every person on the installation, by address. SQLite creates it at
     0666 & ~umask; on Windows the call is advisory and harmless. */
  try {
    chmodSync(dirFile, 0o600);
  } catch {
    /* A file somebody else owns is theirs to permission, and refusing the whole command over it
       would be worse than the exposure. */
  }

  /* THE GRAMMAR AND THE RESERVED SET ARE THE DIRECTORY'S. A third copy here knew the shape and not
     the words, so `braindog init api` passed this file's regex, built the record, and was refused by
     `provision` at the end. `bad()` is one call and there is one answer. */
  const wrong = directory.bad(slug);
  if (wrong) return refuse(wrong);

  const held = directory.claimed(slug);
  if (held === 'taken') return refuse(`${slug} is already somebody's record here.`);
  if (held === 'released')
    return refuse(`${slug} was the name of another record and cannot be given out again. Every link that still says it would read the wrong record.`);

  /* AND A RECORD FILE THAT ALREADY HOLDS A RECORD IS NEVER ADOPTED. `49 §5.22` step 2 refuses on the
     directory existing at all, and relaxing that to "the Directory does not name this slug" opened a
     hole with three doors: delete `directory.sqlite`, rename the record, or restore a backup without
     it, and the next `init` handed the file to whoever ran it — `createRecord` is an upsert, so it
     added them as a second owner AND rewrote the live record's slug, name, timezone and locale to
     their arguments. Exit 0, "record created", no mention of what was already there.

     THE ONE CASE THAT IS RECOVERABLE is a file with no `record` row: the migration ran and the
     create did not, which is this command's own crash window and nobody else's. Finishing that is
     the difference between a half-done state and an unrecoverable one. */
  if (existsSync(file)) {
    const open = openSqlite(file);
    const inside = open.one<{ id: string; slug: string }>('SELECT id, slug FROM record WHERE singleton = 1');
    open.close();
    if (inside) {
      dirSql.close();
      return refuse(
        `${file} already holds the record ${inside.slug} (${inside.id}). A record is created once; move it aside or serve it.`,
      );
    }
  }

  /* 0700 THROUGHOUT, `49 §5.1` step 1. It applies only to a directory Node CREATES — a pre-existing
     volume mount keeps its own mode — but the per-record directory is always ours, and it holds the
     whole record: every row, every token hash, every sealed grant. `0755` there is the wrong side of
     `49 §8`'s backup argument. */
  mkdirSync(data, { mode: 0o700, recursive: true });
  mkdirSync(join(dir, 'blobs'), { mode: 0o700, recursive: true });
  mkdirSync(join(dir, 'snapshots'), { mode: 0o700, recursive: true });

  const id = `rec_${ulids(clock.now)()}`;

  const sql = openSqlite(file);
  const api = await createRecordApi({ sql, clock });
  const stopped = api.kernel.refused();
  if (stopped) {
    sql.close();
    dirSql.close();
    return refuse(`${file} could not be migrated: ${stopped.fix}`);
  }

  const person = directory.person$(email);
  if (!person.ok) {
    sql.close();
    dirSql.close();
    return refuse(fixOf(person));
  }

  /* THE RECORD FIRST. 51 §13 D21: a Directory row never points at a record that failed to
     initialise. `createRecord` takes no `CallContext` — it is the one method that cannot be routed,
     because there is nobody to authorise it against until it has run. */
  const made = await api.createRecord({
    id,
    slug,
    name: slug,
    tz: 'UTC',
    locale: 'en',
    owner: { id: person.value.id, email: person.value.email, name: person.value.name },
  });
  if (!made.ok) {
    sql.close();
    dirSql.close();
    return refuse(fixOf(made));
  }

  /* AND THEN THE NAME. `record:` is what makes the ordering expressible at all — without it the
     Directory mints its own id and the two halves disagree for ever. */
  const named = directory.provision({ slug, email, record: id });
  if (!named.ok) {
    sql.close();
    dirSql.close();
    return refuse(fixOf(named));
  }

  /* THE INBOUND TOKEN, `49 §5.16` step 2: the self-host has no MX, so email arrives forwarded to
     `/in/email/<token>`. Nothing reads it until that route exists, and `49 §5.1` step 5.5 already
     says "if present" — but it is one file, and a record created without one would need a second
     command nobody has written to get one. `wx` so nothing quietly reissues it, and `EEXIST` is
     "there already", not a stack trace. */
  const inbound = join(dir, 'inbound.token');
  try {
    writeFileSync(inbound, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
  } catch (e) {
    if ((e as { code?: string }).code !== 'EEXIST') throw e;
  }

  /* CLOSED, WHICH CHECKPOINTS THE WAL. A process that exits holding one leaves a 400 KB sidecar and
     a record that reads as empty until something else opens it. */
  sql.close();
  dirSql.close();
  say(`record ${slug} created · owner ${email} · inbound email token at ${inbound}`);
}

/**
 * `serve` — the default.
 *
 * ONE RECORD, AND IT SAYS SO WHEN THERE ARE MORE. `49 §5.3` resolves the record per request from a
 * cookie, a bearer or the path, and none of those three exists here yet — so a self-host serves the
 * one record it has. Two is not a smaller version of that; it is the routing layer, and answering
 * for whichever one happened to sort first would be a person reading somebody else's record.
 */
async function serve(): Promise<void> {
  const data = dataDir();
  const port = Number(env.PORT ?? 8080);

  /* AN EXPLICIT FILE STILL WINS, because every test and every `braindog dev` in this repository
     opens a bare file with no data directory behind it. */
  const explicit = argv[3] ?? env.BRAINDOG_FILE;
  /* AND IT MUST ALREADY BE A RECORD. `openSqlite` CREATES the file, so a mistyped flag —
     `serve --port=9999` — became a fully migrated thirty-one-table record named `--port=9999`,
     served on the port, with every anonymous request its owner. The multi-record refusal below
     tells people to use this branch, which made it the likeliest way in. */
  if (explicit && !existsSync(explicit))
    return refuse(`${explicit} is not a record. Create one with: braindog init <slug> --owner <email>`);
  let file = explicit;

  if (!file) {
    const dirFile = join(data, 'directory.sqlite');
    if (!existsSync(dirFile))
      return refuse(`There is no record in ${data}. Create one with: braindog init <slug> --owner <email>`);
    const dirSql = openSqlite(dirFile);
    /* A NAME WITH NO FILE BEHIND IT IS SKIPPED, not counted. `49 §5.1` step 6: "a `record_dir` row
       with no directory … is logged as `slug` and skipped." Counting it made a host with exactly one
       servable record refuse to start, saying it held two — and nothing on the machine would then
       start it. */
    const slugs = dirSql
      .all<{ slug: string }>('SELECT slug FROM dir_slug WHERE released_at IS NULL ORDER BY claimed_at')
      .filter((row: { slug: string }) => existsSync(join(data, row.slug, 'record.dog')));
    dirSql.close();
    if (slugs.length === 0)
      return refuse(`There is no record in ${data}. Create one with: braindog init <slug> --owner <email>`);
    if (slugs.length > 1)
      return refuse(
        `${data} holds ${slugs.length} records (${slugs.map((row: { slug: string }) => row.slug).join(', ')}) and this host serves one. Name it: braindog serve <data>/<slug>/record.dog`,
      );
    file = join(data, slugs[0]!.slug, 'record.dog');
  }

  const running = await start({
    file,
    port,
    token: env.BRAINDOG_TOKEN,
    ...(env.BRAINDOG_HOST === undefined ? {} : { host: env.BRAINDOG_HOST }),
  });

  say(`braindog · ${file} · http://localhost:${port}/api/boot`);
  /* SAID OUT LOUD, because the safe default is also the surprising one. Somebody who expected the
     server on their LAN needs to know why it is not, and somebody who set a token needs to know
     that it now is. */
  say(
    env.BRAINDOG_TOKEN === undefined
      ? '  loopback only, and no bearer can be minted — set BRAINDOG_TOKEN for either'
      : '  listening on every interface, behind BRAINDOG_TOKEN',
  );

  /* AND IT STOPS WHEN IT IS ASKED TO. A container that kills a process holding a WAL leaves it to
     the next boot's recovery; closing takes a second and makes the file whole. */
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void running.close().then(() => exit(0));
    });
}

/**
 * AND NOTHING REACHES THE OPERATOR AS A STACK TRACE.
 *
 * `49 §2` gives this command one sentence and two exit codes, and every reachable throw broke both:
 * `mkdir /data` without permission — the DEFAULT path, and the first thing a new self-hoster hits —
 * a `BRAINDOG_FILE` that is not a database, a read-only mount, a file another process holds. Node's
 * own message is the first line of it, which is the part somebody can act on.
 */
const [, , command = 'serve', ...rest] = argv;
try {
  if (command === 'init') await init(rest);
  else if (command === 'serve') await serve();
  else refuse(`braindog has no ${command}. It has serve and init.`);
} catch (e) {
  refuse(e instanceof Error ? e.message : String(e));
}
