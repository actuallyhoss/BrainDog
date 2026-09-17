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
 * AND IT MAKES THE KEYS BEFORE THE RECORD. `49 §5.22` step 4 comes before step 6 for a reason a
 * half-done run makes obvious: a record row with no `vault_key` rows is a record that boots, serves,
 * accepts writes and cannot seal a single one — and it would take a second command nobody has
 * written to fix. A KEK file that cannot be created is a refusal before anything exists.
 *
 * WHAT IT DOES NOT DO YET, said out loud rather than half-built:
 *
 *   - `vapid.json`. Web Push is unspecified end to end (no subscription store, no subscribe route,
 *     no Cloud key location), so a keypair generated here would serve nothing.
 *   - `dev`. It needs a `Dispatch` port `start` does not have.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, env, exit, stderr } from 'node:process';
import { fileURLToPath } from 'node:url';

import { deriveSessionKey } from '@braindog/host/auth';

import { createRecordApi } from '@braindog/record';
import { createDirectory } from '@braindog/record/directory';
import { ulids } from '@braindog/kernel';

import { fixOf } from '@braindog/ports';

import { lockDown, openKeyStore, recordKeys } from './keys.ts';
import { openSqlite, start } from './server.ts';

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

/** The app `apps/web` builds, served for every path that is not `/api` or `/auth` when it is there. */
const BUILT = fileURLToPath(new URL('../../web/build', import.meta.url));

type SignIn = { origin: string; ways: string[]; off: 'open' | 'directory' | 'insecure' | 'key' | null };

/** The boot line about signing in: the ways in, or the one reason there are none. Never a key or a token. */
function bootLine(s: SignIn): string {
  switch (s.off) {
    case 'open':
      return '  loopback only, and nobody signs in: a request carrying nothing is the owner. Set BRAINDOG_TOKEN to require sign-in and to mint bearers.';
    case 'directory':
      return '  behind BRAINDOG_TOKEN; there is no directory here, so the app cannot sign anybody in, and the token works as a bearer';
    case 'insecure':
      return `  behind BRAINDOG_TOKEN; ${s.origin} cannot hold a session cookie, so the app cannot sign anybody in. Serve it over https, or at localhost.`;
    case 'key':
      return '  behind BRAINDOG_TOKEN; there is no session key, so the app cannot sign anybody in';
    default:
      return s.ways.length === 0
        ? `  behind BRAINDOG_TOKEN; ${s.origin}/signin has no way in to offer yet`
        : `  behind BRAINDOG_TOKEN; sign in at ${s.origin}/signin with ${s.ways.join(' or ')}`;
  }
}

/** One clock for the whole command, so the record and the Directory agree about when it happened. */
const clock = { now: () => Date.now() };

/** The whole-record file: one SQLite database per record, `03-DOG-FORMAT`. */
const RECORD_FILE = 'record.brain';

/**
 * The record file inside one record's directory, or `null` when there is none.
 *
 * A RECORD WRITTEN BEFORE THE FILE TOOK THIS NAME IS STILL A RECORD. The whole-record format was
 * called `.dog` until `.dog` became a page's source, and an installation made then holds
 * `record.dog` on disk. A host that looked only for the new name would answer "there is no record"
 * on a machine holding one, which is a rename costing somebody their data rather than a rename.
 */
const recordIn = (dir: string): string | null => {
  for (const name of [RECORD_FILE, 'record.dog']) if (existsSync(join(dir, name))) return join(dir, name);
  return null;
};

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
  const file = join(dir, RECORD_FILE);

  /* ── EVERY REFUSAL THIS COMMAND CAN MAKE, BEFORE IT WRITES ANYTHING ──────────────────────────
     Not tidiness: a refusal that costs somebody the name they wanted is not a refusal. Three of
     these used to fire after the directory, the database and thirty-one tables existed — a reserved
     slug, an address with a space in it, a name already taken — and the retry then hit "is already a
     record", for ever, with no command that could clear it. */
  /* THE INSTALLATION ROOT FIRST, BEFORE ANYTHING IS OPENED IN IT. `49 §5.1` step 1 is this `mkdir`
     and step 4 is opening the Directory inside it, and moving the refusals earlier inverted the two:
     on a fresh install — the DEFAULT `/data`, the first command a new self-hoster runs —
     `openSqlite` answered "unable to open database file" and created nothing.

     IT IS NOT A RECORD, so making it on a path that then refuses costs nothing: `<data>` is the
     installation's, it is where every record and the tenant map live, and a self-host that will hold
     one will hold it here. 0700, and the mode applies only to a directory Node creates — a volume
     mount that already existed keeps its own. */
  mkdirSync(data, { mode: 0o700, recursive: true });

  /* THE KEK FIRST, `49 §5.1` step 2 and `§5.22` step 1 — before the Directory is even opened.
     Everything after this point creates something, and a missing, short or group-readable key file
     is a refusal that should cost nothing: an `init` that made a record and THEN could not find a
     key to wrap it with would leave a record nothing can seal and a name that resolves to it. */
  const store = await openKeyStore(env.BRAINDOG_KEK_FILE ?? join(data, 'kek'), say);

  const dirFile = join(data, 'directory.sqlite');
  const dirSql = openSqlite(dirFile);
  /* BEFORE `createDirectory`, NOT AFTER. The `CREATE TABLE`s in it are what make SQLite open a
     write-ahead log, and the sidecars take the main file's mode at the moment they are created — so
     a `chmod` further down left a group-readable `-wal` holding every address on the installation. */
  lockDown(dirFile, say);
  const directory = createDirectory(dirSql, clock);

  /* AND THE DIRECTORY FILE IS NOT WORLD-READABLE. `<data>/<slug>/` is created by this command at
     0700, so a record is protected by the directory it is in — but `<data>` itself is usually a
     volume mount that already existed, where `mkdir`'s mode never applied, and this file sits
     directly in it. It holds every person on the installation, by address. SQLite creates it at
     0666 & ~umask; on Windows the call is advisory and harmless. */
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
  const standing = existsSync(file) ? inhabitant(file) : null;
  const stale = standing !== null && !directory.knows(standing.id) && held === 'free';

  /* THE HALF-DONE CASE IS FINISHED RATHER THAN REFUSED, AND ONLY FOR THE PERSON WHOSE IT IS.
     `49 §5.22` writes the record at step 6 and the Directory rows at step 7, so a process killed
     between them leaves a record that is whole and unaddressable: `init` refused "already holds the
     record" for ever, `serve` answered "there is no record in <data>", and the only way in was to
     name the file by hand. The state the ordering was chosen to leave was the one state nothing
     could recover.

     A MISSING DIRECTORY ROW IS NOT ENOUGH TO PROVE THAT STATE. Deleting `directory.sqlite` produces
     exactly the same evidence, and adopting on it alone is the hole `49 §5.22` step 2 exists to
     close — whoever ran `init` next became the owner of somebody else's live record. So the record
     has to name the SAME OWNER, by address, and the retry is then literally the same command: same
     slug, same `--owner`. Anybody else gets the refusal, which is the whole point of the check.

     The Directory's person id is checked below, once there is one to check against. */
  if (standing && !(stale && standing.slug === slug && standing.ownerEmail === email)) {
    dirSql.close();
    return refuse(
      `${file} already holds the record ${standing.slug} (${standing.id}). A record is created once; move it aside or serve it.`,
    );
  }

  /* THE NAME FOR A RECORD THAT ALREADY EXISTS. There is nothing left to create: the file, the
     directories and the keys are all from the run that was killed, and what is missing is the two
     Directory rows. The person id is checked here because this is where there is one — a record
     whose own `member` names a person the Directory no longer holds is the deleted-directory case
     wearing the right address, and re-provisioning it would leave `dir_member` and `member` naming
     two different people for one owner. */
  if (standing) {
    const who = directory.person$(email);
    if (!who.ok) {
      dirSql.close();
      return refuse(fixOf(who));
    }
    if (who.value.id !== standing.ownerId) {
      dirSql.close();
      return refuse(
        `${file} holds the record ${standing.slug}, whose owner is a person this directory does not know. Restore the directory it was created with, or move the record aside.`,
      );
    }
    const late = directory.provision({ slug, email, record: standing.id, plan: 'selfhost' });
    dirSql.close();
    if (!late.ok) return refuse(fixOf(late));
    say(`record ${standing.slug} finished · owner ${email} · the record existed and the directory did not name it`);
    return;
  }

  /* 0700 ON THE RECORD'S OWN DIRECTORY TOO. It holds the whole record — every row, every token
     hash, every sealed grant — and it is always one this command created, so unlike `<data>` the
     mode always applies. `0755` there is the wrong side of `49 §8`'s backup argument. */
  mkdirSync(join(dir, 'blobs'), { mode: 0o700, recursive: true });
  mkdirSync(join(dir, 'snapshots'), { mode: 0o700, recursive: true });

  const id = `rec_${ulids(clock.now)()}`;

  const sql = openSqlite(file);
  /* 0600 BEFORE THE MIGRATIONS, not after. `<slug>/` is 0700 so nobody can walk to it, but a backup
     that copies file modes and a `docker cp` out of the directory both carry the file's own bits —
     and this file holds every token hash and every sealed grant. SQLite gives the `-wal` and `-shm`
     sidecars the main file's mode AT THE MOMENT IT CREATES THEM, which is inside `applyMigrations`:
     doing this at the end of the command left a group-readable `-wal` holding the record's rows for
     the whole of the run, and permanently if the process was killed. */
  lockDown(file, say);
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

  /* AND THE THREE KEYS, `49 §5.22` step 4, bound to the record id that step 6 is about to write.
     They are made HERE rather than inside `createRecord` because the kernel must not be able to make
     one: `12 §6` puts the key hierarchy in the host, the record holds sealed bytes and the
     fingerprint of what sealed them, and `vault.ts` performs no crypto at all. */
  const keys = await recordKeys(store, id);

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
    keys,
  });
  if (!made.ok) {
    sql.close();
    dirSql.close();
    return refuse(fixOf(made));
  }

  /* AND THEN THE NAME. `record:` is what makes the ordering expressible at all — without it the
     Directory mints its own id and the two halves disagree for ever. */
  const named = directory.provision({ slug, email, record: id, plan: 'selfhost' });
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
 * What a record file already holds, or `null` when it holds no record.
 *
 * A FILE THAT IS NOT YET A DATABASE IS THE RECOVERABLE CASE, and reading it used to be the
 * unrecoverable one. `init` creates the file and migrates it as two steps, so a process killed
 * between them leaves `record.brain` with no tables — and `SELECT id FROM record` against it threw
 * `no such table: record` out of the command, printed SQLite's sentence with no path in it, and did
 * the same thing on every retry for ever. The branch written to make the state recoverable was the
 * branch that made it permanent.
 *
 * `file is not a database` IS STILL A REFUSAL, because that is not this command's crash window — it
 * is somebody's `.brain` half-downloaded, or the wrong path — and it says which file.
 */
function inhabitant(file: string): { id: string; slug: string; ownerId: string; ownerEmail: string } | null {
  let open: ReturnType<typeof openSqlite>;
  try {
    open = openSqlite(file);
  } catch (e) {
    return refuse(`${file} could not be opened as a record: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const row = open.one<{ id: string; slug: string }>('SELECT id, slug FROM record WHERE singleton = 1');
    if (!row) return null;
    /* AND WHO IT BELONGS TO, from the record's own tables rather than from the Directory — which is
       the point: this is the question asked when the Directory is the half that is missing. */
    const owner = open.one<{ id: string; email: string }>(
      `SELECT p.id, p.email FROM member m JOIN person p ON p.id = m.person_id
        WHERE m.register = '*' AND m.level = 'owner'`,
    );
    return { ...row, ownerId: owner?.id ?? '', ownerEmail: owner?.email ?? '' };
  } catch {
    /* No `record` table: the file was created and the migration did not finish. Nothing is in it. */
    return null;
  } finally {
    open.close();
  }
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
      .filter((row: { slug: string }) => recordIn(join(data, row.slug)) !== null);
    dirSql.close();
    if (slugs.length === 0)
      return refuse(`There is no record in ${data}. Create one with: braindog init <slug> --owner <email>`);
    if (slugs.length > 1)
      return refuse(
        `${data} holds ${slugs.length} records (${slugs.map((row: { slug: string }) => row.slug).join(', ')}) and this host serves one. Name it: braindog serve <data>/<slug>/${RECORD_FILE}`,
      );
    /* The filter above kept only the slugs that have one, so this is never null. */
    file = recordIn(join(data, slugs[0]!.slug))!;
  }

  /* AND THE KEY STORE, WHICH NO RUNNING PROCESS HELD. `init` wrote three `vault_key` rows from the
     first commit that made them and `serve` never opened the KEK — so the rows existed, nothing
     could open them, and an exported `.brain` went out unsigned. `33 §1` port 8 is a host port, and
     this is the host.

     A KEK THAT WILL NOT OPEN STOPS THE SERVER, rather than starting one that cannot sign, cannot
     open a grant, and says so nowhere. `49 §5.1` step 2 puts it before anything is served. */
  const store = await openKeyStore(env.BRAINDOG_KEK_FILE ?? join(data, 'kek'), say);

  /* THE DIRECTORY'S MAC KEY, `12 §8`'s lever: derived from the key file unless `BRAINDOG_SESSION_SECRET`
     names one, for a deployment that wants sessions to outlive a new key file, or to die without one.
     Either way it is 32 bytes by HKDF, and it is zero-filled once the Directory holds its own copy. */
  const secret = env.BRAINDOG_SESSION_SECRET;
  if (secret !== undefined && secret.length < 32)
    return refuse('BRAINDOG_SESSION_SECRET is shorter than 32 characters. Make it 32 random bytes in base64url, or unset it to derive one from the key file.');
  const sessionKey = secret === undefined ? store.sessionKey : await deriveSessionKey(new TextEncoder().encode(secret));

  /* THE DIRECTORY `init` WROTE, when there is one: it is who may sign in. An explicit record file with no
     data directory behind it has none, and `/auth/methods` then says nobody signs in from the app. */
  const dirFile = join(data, 'directory.sqlite');
  const shell = env.BRAINDOG_SHELL ?? (existsSync(join(BUILT, 'index.html')) ? BUILT : undefined);

  const running = await start({
    file,
    port,
    token: env.BRAINDOG_TOKEN,
    keys: store,
    ...(env.BRAINDOG_HOST === undefined ? {} : { host: env.BRAINDOG_HOST }),
    ...(existsSync(dirFile) ? { directory: dirFile } : {}),
    ...(env.BRAINDOG_ORIGIN === undefined ? {} : { origin: env.BRAINDOG_ORIGIN }),
    ...(shell === undefined ? {} : { shell }),
    sessionKey,
    trustProxy: env.BRAINDOG_TRUST_PROXY === '1',
    /* THE SCHEDULED ACTIONS RUN ON THIS PROCESS'S TIMER, sending only to the origins their declarations name. */
    actions: {},
    /* SPARK LOOKS ONCE A DAY on its own unless the owner turned that off; asking hourly is how a day is noticed. */
    sparkTickMs: 3_600_000,
  });
  /* `importKey` copied it, so these are the last copies this process holds as bytes. */
  sessionKey.fill(0);
  store.sessionKey.fill(0);

  say(`braindog · ${file} · ${running.signIn.origin}`);
  /* ONE LINE FOR WHO MAY GET IN, SAID OUT LOUD, because the safe default is also the surprising one:
     somebody who expected the server on their LAN needs to know why it is not, and somebody who set a
     token needs to know where to sign in. It names ways, never a key. */
  say(bootLine(running.signIn));

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
