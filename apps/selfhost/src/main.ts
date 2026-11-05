/**
 * The self-host's entry: `serve` and `init`, and the file `48-SPEC-CLI` §5.14 spawns.
 *
 * NOTHING IN THIS REPOSITORY COULD CREATE A RECORD. The only caller of `createRecord` was a test,
 * and the only callers of the Directory's `provision` were its own, so a fresh self-host had no
 * `record` row, `recordIdentity(sql)` was null, `createToken` refused ("this record has no id yet,
 * and a bearer carries the record it is for"), and `verifyToken` refused every bearer. The server
 * worked at all only because an unauthenticated request fell back to a person nobody had invited.
 * `49 §5.22` has described the way out of that all along and it was not written.
 *
 * IT WRITES THE RECORD BEFORE THE DIRECTORY. `51 §13 D21`, and `49 §5.22` steps 6 → 7: "a Directory
 * row never points at a record that failed to initialise". The half-done case that leaves is
 * recoverable (a record object nothing can address yet), where the other order leaves a name
 * resolving to nothing, and a released name is a tombstone for ever.
 *
 * ONE SENTENCE ON STDERR AND NOTHING ON STDOUT. `49 §2`: "one sentence on stderr, nothing else";
 * `48 §5.14` spawns this with `stdio: 'inherit'`, so stdout belongs to the CLI's `--json` envelope.
 * `49 §6`: "nothing at boot or on the wire ever prints a token, a code, a cookie value or a
 * payload": the success line names the PATH of the inbound token and never its contents.
 *
 * AND IT MAKES THE KEYS BEFORE THE RECORD. `49 §5.22` step 4 comes before step 6 for a reason a
 * half-done run makes obvious: a record row with no `vault_key` rows is a record that boots, serves,
 * accepts writes and cannot seal a single one, and it would take a second command nobody has
 * written to fix. A KEK file that cannot be created is a refusal before anything exists.
 *
 * WHAT IT DOES NOT DO YET, said out loud rather than half-built:
 *
 *   - `vapid.json`. Web Push is unspecified end to end (no subscription store, no subscribe route,
 *     no Cloud key location), so a keypair generated here would serve nothing.
 *   - `dev`. It needs a `Dispatch` port `start` does not have.
 */

import { createPrivateKey, randomBytes, X509Certificate, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, env, exit, stderr } from 'node:process';
import { fileURLToPath } from 'node:url';

import { deriveSessionKey } from '@braindog/host/auth';
import { installLogFloor } from '@braindog/host/log-floor';

import { createRecordApi } from '@braindog/record';
import { createDirectory } from '@braindog/record/directory';
import { ulids } from '@braindog/kernel';

import { fixOf } from '@braindog/ports';

import { NIGHTLY_AT, nightlyBackups } from './backup.ts';
import { APP_ROOT, bakedSaid, bakedSecrets } from './baked.ts';
import { backupData, restoreData } from './cold.ts';
import { degradeLines, setupLine } from './first-run.ts';
import { commandFor, inImage, listenOf, originOf, plainLine, serverKeyOf } from './how.ts';
import { lockDown, openKeyStore, recordKeys } from './keys.ts';
import { nameChange, reachLine, reachOf } from './reach.ts';
import { ONE_PLACE, proxyTrustOf } from './key-lockout.ts';
import { initFrom } from './restore.ts';
import { openSqlite, signedWebhooks, start } from './server.ts';
import { rewrapAtStart } from './rewrap.ts';
import { webhookPost } from './actions.ts';
import { outboundOf } from './script.ts';
import { operatorInvite } from './operator-invite.ts';
import { authMail, mailedNotices, smtpCheck, smtpLine, smtpOf, smtpSender, type MailFault } from './smtp.ts';

/**
 * One sentence on stderr, and nothing on stdout, ever.
 *
 * `49 §2`: "one sentence on stderr, nothing else". `48 §5.14` spawns this with `stdio: 'inherit'`,
 * so stdout belongs to the CLI's `--json` envelope and anything written there corrupts it.
 *
 * AND THE WRITE IS FLUSHED BEFORE THE EXIT. `process.exit` does not wait for a pending write, and on
 * Windows a write to a PIPE is asynchronous, which is exactly how the CLI spawns this. So the exit
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

/**
 * The app `apps/web` builds, served for every path that is not `/api` or `/auth` when it is there.
 *
 * `build/`, WHERE THE WEB BUILD WRITES THE APP AT ITS ROOT. It was `build/app` while `apps/web/svelte.config.js` had
 * `paths.base: '/app'`, and a self-host that looked in the wrong one of the two served no app and no bundled catalogue,
 * and said nothing about either (`test/app-path.test.ts`). The bundled catalogue is in it, at `build/catalogue`
 * (`catalogueFolder`).
 */
const BUILT = fileURLToPath(new URL('../../web/build', import.meta.url));

/**
 * The kernel's migration lock, beside the migrations it locks: one line per migration file, its checksum.
 * Found through the kernel package's own entry, so it is the lock of the kernel this process runs, wherever that is.
 */
const LOCK_FILE = fileURLToPath(new URL('./migrations/LOCK.json', import.meta.resolve('@braindog/kernel')));

/**
 * Whether the record's applied migrations are the ones this build's lock holds: null when they are, and otherwise the
 * sentence that stops the server, with the fix.
 *
 * THE RUNNER WOULD REFUSE THE SAME RECORD, BUT ONLY ONCE SERVING, and then every request is a 503 with a code and the
 * operator reads a refusal on a running server. A migration a record ran that this build holds as other text is never
 * the operator's to fix by waiting: the build is wrong, and the way back is the build before it or the copy taken
 * before the upgrade. So it is said before anything is served, and the server does not start.
 *
 * A VERSION PAST THE LOCK IS NOT THIS. It is a record a newer build moved on, which a rollback leaves, and the kernel
 * serves it as `SCHEMA_NEWER` with `/healthz` at 503 so a container's health check sees why (`test/healthz.test.ts`).
 * A record with no ledger yet is one the runner is about to migrate, and has nothing to disagree with.
 */
function lockRefusal(file: string): string | null {
  let rows: { version: number; checksum: string }[];
  try {
    const sql = openSqlite(file);
    try {
      const ledger = sql.one<{ y: number }>("SELECT 1 AS y FROM sqlite_schema WHERE type = 'table' AND name = 'migration'");
      rows = ledger ? sql.all<{ version: number; checksum: string }>('SELECT version, checksum FROM migration ORDER BY version') : [];
    } finally {
      sql.close();
    }
  } catch {
    /* A FILE THAT WILL NOT OPEN IS SAID BY THE OPEN THAT FOLLOWS, in the driver's words, as it always was. */
    return null;
  }
  if (rows.length === 0) return null;
  let lock: Record<string, { checksum?: unknown } | null>;
  try {
    lock = JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as typeof lock;
  } catch {
    return 'This build has no migration lock it can read, so it cannot tell whether the record ran the migrations it holds. Install the build again from its release, whole.';
  }
  const locked = new Map<number, { slug: string; checksum: unknown }>();
  for (const [name, entry] of Object.entries(lock)) {
    const m = /^(\d{4})_([a-z0-9_]+)\.ts$/u.exec(name);
    if (m) locked.set(Number(m[1]), { slug: m[2]!, checksum: entry?.checksum });
  }
  for (const row of rows) {
    const held = locked.get(Number(row.version));
    if (held === undefined || held.checksum === row.checksum) continue;
    return (
      `This BrainDog ran migration ${row.version} (${held.slug}) as text this build does not hold, so this build would refuse every request to it and has not started. ` +
      `Start the build that last served the record, or restore the copy taken before the upgrade: a backup folder goes into an empty data folder with ${commandFor('restore <backup folder>')}. ` +
      'A migration a record has run is never edited, so the build is at fault: report it with the migration number.'
    );
  }
  return null;
}

type SignIn = { origin: string; ways: string[]; off: 'open' | 'directory' | 'insecure' | 'key' | null };

/** The boot line about signing in: the ways in, or the one reason there are none. Never a key or a token. */
function bootLine(s: SignIn): string {
  switch (s.off) {
    case 'open':
      return '  loopback only, and nobody signs in: a request carrying nothing is the owner. Set BRAINDOG_SERVER_KEY to require sign-in and to mint bearers.';
    case 'directory':
      return '  behind BRAINDOG_SERVER_KEY; there is no directory here, so the app cannot sign anybody in, and the key works as a bearer';
    case 'insecure':
      /* THE FIX IS NO LONGER IN THIS SENTENCE. It used to end "Serve it over https, or at localhost",
         which restates the refusal to somebody who has just deliberately typed something that is
         neither, and names none of the three shapes that work. `reachLine` says what to set, and it is
         printed under this line by `serve` for every origin that has something wrong with it, not only
         for this one case. */
      return `  behind BRAINDOG_SERVER_KEY; ${s.origin} cannot hold a session cookie, so the app cannot sign anybody in.`;
    case 'key':
      return '  behind BRAINDOG_SERVER_KEY; there is no session key, so the app cannot sign anybody in';
    default:
      return s.ways.length === 0
        ? `  behind BRAINDOG_SERVER_KEY; ${s.origin}/signin has no way in to offer yet`
        : `  behind BRAINDOG_SERVER_KEY; sign in at ${s.origin}/signin with ${s.ways.join(' or ')}`;
  }
}

/**
 * The start's lines about agents: whether Claude's and ChatGPT's connectors can add this host (OAuth), and how the
 * command line connects. Never a key: `token create` prints its own, once, to whoever ran it.
 */
function agentLines(o: { origin: string; slug: string | undefined; open: boolean; oauthOff: string | null }): string[] {
  const at = `${o.origin}/${o.slug ?? '<record>'}`;
  if (o.open)
    return [`  agents: nobody signs in here, so the command line on this machine reaches it with BRAINDOG_HOST=${at} and no token. OAuth and agent tokens need BRAINDOG_SERVER_KEY.`];
  const oauth =
    o.oauthOff === null
      ? `  oauth: on. Claude's and ChatGPT's connectors can add ${o.origin}/mcp, and you allow each one in the browser.`
      : `  oauth: off, so Claude's and ChatGPT's connectors cannot add this host. ${o.oauthOff.replace(/^OAuth is off on this BrainDog: /u, '').replace(/^./u, (c) => c.toUpperCase())}`;
  return [oauth, `  agents: braindog setup ${at} connects the command line and the agents on a machine; braindog token create --host ${at} makes a token for a script.`];
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
 * The names of the records a data folder holds, in the order they were made: each name the Directory gives out that has
 * a record file behind it. None when there is no Directory yet.
 *
 * A NAME WITH NO FILE BEHIND IT IS SKIPPED, not counted. `49 §5.1` step 6: "a `record_dir` row with no directory … is
 * logged as `slug` and skipped." Counting it made a host with exactly one servable record refuse to start, saying it held
 * two, and nothing on the machine would then start it.
 */
function recordsIn(data: string): string[] {
  const dirFile = join(data, 'directory.sqlite');
  if (!existsSync(dirFile)) return [];
  const dirSql = openSqlite(dirFile);
  try {
    return dirSql
      .all<{ slug: string }>('SELECT slug FROM dir_slug WHERE released_at IS NULL ORDER BY claimed_at')
      .map((row: { slug: string }) => row.slug)
      .filter((slug: string) => recordIn(join(data, slug)) !== null);
  } finally {
    dirSql.close();
  }
}

/** What to do about a data folder with no record in it, said for where the person is. */
const noRecord = (data: string): string =>
  inImage()
    ? `There is no record in ${data}. Set BRAINDOG_OWNER in .env to your email and start it again (docker compose up -d), and the first start makes one; to bring a backup in instead, see Backups in apps/selfhost/README.md.`
    : `There is no record in ${data}. Make one with ${commandFor('init <name> --owner <your email>')}, or set BRAINDOG_OWNER and start again; if your record is in another folder, set BRAINDOG_DATA to it.`;

/**
 * `init <slug> [--owner <email>]`, and `BRAINDOG_OWNER` when the flag is absent. `init <slug> --from <file.brainl>
 * [--key <public key>] [--owner <email>]` restores a copy instead, and is `./restore.ts`'s from its first step.
 *
 * THE ORDER IS `49 §5.22`'S, with the record id minted first. The spec wraps the keys at step 4 and
 * mints the id at step 6, which cannot both be done as written once the wrapping is bound to the
 * record id, so the id comes first here, which is what a key step would need anyway.
 */
async function init(args: readonly string[]): Promise<void> {
  const slug = args[0];
  if (!slug || slug.startsWith('--'))
    return refuse(`init needs a name for the record first: ${commandFor('init <name> --owner <your email>')}, or ${commandFor('init <name> --from <file.brainl>')}.`);
  const data = dataDir();

  /* ONE RECORD A DATA FOLDER, BECAUSE `serve` SERVES ONE. A second `init` here, of a new record or of a copy, exited 0 and
     the next start refused "holds 2 records", which under Docker is a container restarting for ever. `--alongside` keeps
     a second record beside the first for a developer who serves one by its file; nobody else is told about it. */
  if (!args.includes('--alongside')) {
    const others = recordsIn(data).filter((held) => held !== slug);
    if (others.length > 0)
      return refuse(
        `${data} already holds the record ${others.join(', ')}, and this host serves one record, so ${slug} was not made. ` +
          (inImage()
            ? 'Make it in an empty volume instead: take a backup, then docker compose down -v removes this one (apps/selfhost/README.md, Backups).'
            : `Make it in an empty data folder instead: set BRAINDOG_DATA to a new folder and run ${commandFor(`init ${args.join(' ')}`)} again.`),
      );
  }

  const flag = args.indexOf('--owner');

  /* `--from <file.brainl>` IS A RESTORE, AND IT IS ITS OWN PATH (`./restore.ts`). The record, its id and its owner come
     from the file, so nothing below applies: no id is minted, no keys are made, and `createRecord` is never called,
     because a record it made is not empty and a copy cannot be imported into it (`IMPORT_NOT_EMPTY`, measured). */
  const from = args.indexOf('--from');
  if (from >= 0) {
    const path = args[from + 1];
    if (!path || path.startsWith('--')) return refuse(`init --from needs the .brainl file to bring in: ${commandFor('init <name> --from <file.brainl>')}.`);
    const keyAt = args.indexOf('--key');
    const key = keyAt >= 0 ? args[keyAt + 1] : undefined;
    if (keyAt >= 0 && (!key || key.startsWith('--'))) return refuse('--key needs the public key the copy must be signed by, 43 characters of base64url.');
    const out = await initFrom({
      data,
      slug,
      from: path,
      key,
      owner: flag >= 0 ? args[flag + 1] : env.BRAINDOG_OWNER,
      kekFile: env.BRAINDOG_KEK_FILE ?? join(data, 'kek'),
      now: clock.now,
      say,
    });
    if (!out.ok) return refuse(out.said);
    for (const line of out.said) say(line);
    return;
  }
  /* TRIMMED AND LOWER-CASED ONCE, HERE, and this value is the only one used afterwards. `49 §4.1`
     stores a person's address lower-cased and trimmed, and ` ada@example.com ` went through
     untrimmed, so `person$` stored the trimmed form and `provision` then looked up the untrimmed one
     and refused "has no account yet", after the record file had been written. */
  const email = ((flag >= 0 ? args[flag + 1] : undefined) ?? env.BRAINDOG_OWNER ?? '').trim().toLowerCase();
  /* AND AN OWNERLESS RECORD IS REFUSED. The spec does not say what happens without one, and there is
     no consistent way to invent it: the Directory's `person.email` is `NOT NULL`, so a record with
     no owner cannot be written there at all, and a record nobody owns is a record nobody can invite
     anybody to. */
  if (!email)
    return refuse(`init needs an owner: ${commandFor(`init ${slug} --owner <your email>`)}, or set BRAINDOG_OWNER. A record nobody owns cannot be shared.`);
  if (!email.includes('@')) return refuse(`${email} is not an address.`);

  const dir = join(data, slug);
  const file = join(dir, RECORD_FILE);

  /* ── EVERY REFUSAL THIS COMMAND CAN MAKE, BEFORE IT WRITES ANYTHING ──────────────────────────
     Not tidiness: a refusal that costs somebody the name they wanted is not a refusal. Three of
     these used to fire after the directory, the database and thirty-one tables existed (a reserved
     slug, an address with a space in it, a name already taken) and the retry then hit "is already a
     record", for ever, with no command that could clear it. */
  /* THE INSTALLATION ROOT FIRST, BEFORE ANYTHING IS OPENED IN IT. `49 §5.1` step 1 is this `mkdir`
     and step 4 is opening the Directory inside it, and moving the refusals earlier inverted the two:
     on a fresh install (the DEFAULT `/data`, the first command a new self-hoster runs),
     `openSqlite` answered "unable to open database file" and created nothing.

     IT IS NOT A RECORD, so making it on a path that then refuses costs nothing: `<data>` is the
     installation's, it is where every record and the tenant map live, and a self-host that will hold
     one will hold it here. 0700, and the mode applies only to a directory Node creates: a volume
     mount that already existed keeps its own. */
  mkdirSync(data, { mode: 0o700, recursive: true });

  /* THE KEK FIRST, `49 §5.1` step 2 and `§5.22` step 1, before the Directory is even opened.
     Everything after this point creates something, and a missing, short or group-readable key file
     is a refusal that should cost nothing: an `init` that made a record and THEN could not find a
     key to wrap it with would leave a record nothing can seal and a name that resolves to it. */
  const store = await openKeyStore(env.BRAINDOG_KEK_FILE ?? join(data, 'kek'), say);

  const dirFile = join(data, 'directory.sqlite');
  const dirSql = openSqlite(dirFile);
  /* BEFORE `createDirectory`, NOT AFTER. The `CREATE TABLE`s in it are what make SQLite open a
     write-ahead log, and the sidecars take the main file's mode at the moment they are created, so
     a `chmod` further down left a group-readable `-wal` holding every address on the installation. */
  lockDown(dirFile, say);
  const directory = createDirectory(dirSql, clock);

  /* AND THE DIRECTORY FILE IS NOT WORLD-READABLE. `<data>/<slug>/` is created by this command at
     0700, so a record is protected by the directory it is in, but `<data>` itself is usually a
     volume mount that already existed, where `mkdir`'s mode never applied, and this file sits
     directly in it. It holds every person on the installation, by address. SQLite creates it at
     0666 & ~umask; on Windows the call is advisory and harmless. */
  /* THE GRAMMAR AND THE RESERVED SET ARE THE DIRECTORY'S. A third copy here knew the shape and not
     the words, so `braindog init api` passed this file's regex, built the record, and was refused by
     `provision` at the end. `bad()` is one call and there is one answer. */
  const wrong = directory.bad(slug);
  if (wrong) return refuse(wrong);

  const held = directory.claimed(slug);
  if (held === 'taken')
    return refuse(`${slug} is already somebody's BrainDog here, and init makes one once. Serve it with ${commandFor('serve')}, or make a new one in an empty data folder.`);
  if (held === 'released')
    return refuse(`${slug} was the name of another BrainDog and cannot be given out again. Every link that still says it would open the wrong one.`);

  /* AND A RECORD FILE THAT ALREADY HOLDS A RECORD IS NEVER ADOPTED. `49 §5.22` step 2 refuses on the
     directory existing at all, and relaxing that to "the Directory does not name this slug" opened a
     hole with three doors: delete `directory.sqlite`, rename the record, or restore a backup without
     it, and the next `init` handed the file to whoever ran it: `createRecord` is an upsert, so it
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
     close: whoever ran `init` next became the owner of somebody else's live record. So the record
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
     Directory rows. The person id is checked here because this is where there is one: a record
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

  /* 0700 ON THE RECORD'S OWN DIRECTORY TOO. It holds the whole record (every row, every token
     hash, every sealed grant) and it is always one this command created, so unlike `<data>` the
     mode always applies. `0755` there is the wrong side of `49 §8`'s backup argument. */
  mkdirSync(join(dir, 'blobs'), { mode: 0o700, recursive: true });
  mkdirSync(join(dir, 'snapshots'), { mode: 0o700, recursive: true });

  const id = `rec_${ulids(clock.now)()}`;

  const sql = openSqlite(file);
  /* 0600 BEFORE THE MIGRATIONS, not after. `<slug>/` is 0700 so nobody can walk to it, but a backup
     that copies file modes and a `docker cp` out of the directory both carry the file's own bits,
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
     fingerprint of what sealed them, and `keychain.ts` performs no crypto at all. */
  const keys = await recordKeys(store, id);

  /* THE RECORD FIRST. 51 §13 D21: a Directory row never points at a record that failed to
     initialise. `createRecord` takes no `CallContext`: it is the one method that cannot be routed,
     because there is nobody to authorise it against until it has run. */
  const zone = machineZone();
  const made = await api.createRecord({
    id,
    slug,
    name: slug,
    /* THE MACHINE'S ZONE, NOT GREENWICH'S (AH22): the hosted sign-up sends the person's zone, and a self-host made at
       its own command line counts its days where it runs. `TZ` set on the machine wins; none read is UTC. */
    tz: zone,
    locale: 'en',
    owner: { id: person.value.id, email: person.value.email, name: person.value.name },
    keys,
  });
  if (!made.ok) {
    sql.close();
    dirSql.close();
    return refuse(fixOf(made));
  }

  /* AND THEN THE NAME. `record:` is what makes the ordering expressible at all: without it the
     Directory mints its own id and the two halves disagree for ever. */
  const named = directory.provision({ slug, email, record: id, plan: 'selfhost' });
  if (!named.ok) {
    sql.close();
    dirSql.close();
    return refuse(fixOf(named));
  }

  /* THE INBOUND TOKEN, `49 §5.16` step 2: the self-host has no MX, so email arrives forwarded to
     `/in/email/<token>`. `server.ts` reads this file once at boot and keeps only its SHA-256, so a
     token written here after a server started takes a restart to be served, and a record made
     before this line existed takes no forwarded mail at all rather than taking it from anybody.
     `49 §5.1` step 5.5 says "if present", and it is one file: a record created without one would
     need a second command nobody has written to get one. `wx` so nothing quietly reissues it, and
     `EEXIST` is "there already", not a stack trace. */
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
  /* AND THE ZONE ITS DAYS ARE COUNTED IN (RG13): in a container that sets no `TZ` it is UTC, and nothing said so. */
  say(
    zone === 'UTC'
      ? `  its days are counted in UTC. To count them at your midnight, set TZ in .env (such as TZ=Europe/London) before the first start.`
      : `  its days are counted in ${zone}.`,
  );
}

/**
 * What a record file already holds, or `null` when it holds no record.
 *
 * A FILE THAT IS NOT YET A DATABASE IS THE RECOVERABLE CASE, and reading it used to be the
 * unrecoverable one. `init` creates the file and migrates it as two steps, so a process killed
 * between them leaves `record.brain` with no tables, and `SELECT id FROM record` against it threw
 * `no such table: record` out of the command, printed SQLite's sentence with no path in it, and did
 * the same thing on every retry for ever. The branch written to make the state recoverable was the
 * branch that made it permanent.
 *
 * `file is not a database` IS STILL A REFUSAL, because that is not this command's crash window (it
 * is somebody's `.brain` half-downloaded, or the wrong path) and it says which file.
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
    /* AND WHO IT BELONGS TO, from the record's own tables rather than from the Directory, which is
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
 * `serve`, the default.
 *
 * ONE RECORD, AND IT SAYS SO WHEN THERE ARE MORE. `49 §5.3` resolves the record per request from a
 * cookie, a bearer or the path, and none of those three exists here yet, so a self-host serves the
 * one record it has. Two is not a smaller version of that; it is the routing layer, and answering
 * for whichever one happened to sort first would be a person reading somebody else's record.
 */
async function serve(): Promise<void> {
  const data = dataDir();
  const port = Number(env.PORT ?? 8080);
  /* THE CERTIFICATE, BY PATH AND NEVER BY VALUE, for the reason `keys.ts` gives about the KEK: a private
     key in the environment is a private key in every `ps`, every crash dump and every child process that
     inherits it. `BRAINDOG_TLS_CERT` and `BRAINDOG_TLS_KEY` name files, as `BRAINDOG_KEK_FILE` does.

     AND WITHOUT BOTH THERE IS NO HALF MEASURE. A certificate with no key serves no handshake and a key
     with no certificate names no host, so one of the two alone is a typo, and starting on plain http
     after the operator asked for TLS is the one outcome nobody wants: it looks like it worked.

     AND IT IS THE FIRST THING `serve` DOES, before the record is even looked for. Read where it is used,
     it reported "There is no record in <data>" to somebody whose TLS was also misconfigured, so they
     fixed one thing, ran again, and got the second refusal. Neither of these two checks needs a record,
     and `init` makes the same argument one function up about doing every refusal before any work. */
  const certFile = env.BRAINDOG_TLS_CERT;
  const tlsKeyFile = env.BRAINDOG_TLS_KEY;
  if ((certFile === undefined) !== (tlsKeyFile === undefined))
    return refuse(
      'BRAINDOG_TLS_CERT and BRAINDOG_TLS_KEY go together. Set both to serve https from this process, or neither to serve plain http.',
    );
  let tls: { cert: string; key: string } | undefined;
  if (certFile !== undefined && tlsKeyFile !== undefined) {
    const read = (path: string): string | null => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    };
    /* READ SEPARATELY SO THE SENTENCE NAMES THE FILE. One `try` around both would report whichever failed
       first as "the certificate", and the two are usually in different places with different permissions. */
    const cert = read(certFile);
    if (cert === null) return refuse(`BRAINDOG_TLS_CERT names ${certFile}, which could not be read.`);
    const tlsKey = read(tlsKeyFile);
    if (tlsKey === null) return refuse(`BRAINDOG_TLS_KEY names ${tlsKeyFile}, which could not be read.`);

    /* AND THAT THEY ARE A CERTIFICATE AND ITS OWN KEY, SAID HERE, WHERE THE TWO PATHS ARE STILL IN HAND.
       MEASURED before this check existed, with a record already in place so nothing else refused first: a
       certificate file holding anything that is not PEM ended the process on
       `error:0480006C:PEM routines::no start line`, and a well formed key belonging to some other
       certificate on `error:05800074:x509 certificate routines::key values mismatch`. Both are thrown
       several frames down inside `node:crypto`, one from `certificateNames` and one from `createServer`,
       and neither names a file, a variable, or TLS at all. The note at the foot of this file is that
       nothing reaches the operator as a stack trace, and an OpenSSL error code is the same promise broken
       more quietly.

       `checkPrivateKey` IS THE COMPARISON THE HANDSHAKE WOULD HAVE MADE, done now while there is still a
       sentence to attach it to. It throws rather than answering false when the two are different kinds of
       key altogether, an RSA key against this EC certificate, so the throw is a mismatch as well. */
    let carried: X509Certificate;
    try {
      carried = new X509Certificate(cert);
    } catch {
      return refuse(`BRAINDOG_TLS_CERT names ${certFile}, which is not a PEM certificate.`);
    }
    let held: KeyObject;
    try {
      held = createPrivateKey(tlsKey);
    } catch {
      return refuse(`BRAINDOG_TLS_KEY names ${tlsKeyFile}, which is not a PEM private key.`);
    }
    let pairs = false;
    try {
      pairs = carried.checkPrivateKey(held);
    } catch {
      pairs = false;
    }
    if (!pairs)
      return refuse(
        `BRAINDOG_TLS_KEY names ${tlsKeyFile}, which is a private key and is not the one in ${certFile}. A handshake needs the key that certificate was made for.`,
      );

    /* THE MODE IS SAID AND NOT REFUSED, which is the one place this parts company with the KEK.
       `keys.ts` refuses a group-readable key file because `49 §4.4` does and because that key opens the
       whole record. This one does not open anything: it lets somebody who already has it impersonate
       this host, which is serious and is not the same thing. And the most ordinary correct deployment
       on Linux, a certificate renewed by an ACME client, hands the key out as `root:ssl-cert 0640` on
       purpose, so refusing would stop the exact setup this feature exists to support. On Windows the
       bit is advisory and the ACL is the permission, so there is nothing to read. */
    if (process.platform !== 'win32') {
      let mode = -1;
      try {
        mode = statSync(tlsKeyFile).mode & 0o777;
      } catch {
        mode = -1;
      }
      if (mode >= 0 && (mode & 0o007) !== 0) say(`  ${tlsKeyFile} is mode ${mode.toString(8)}: anybody on this machine can read the key this host's TLS is built on.`);
    }
    tls = { cert, key: tlsKey };
  }

  /* AN EXPLICIT FILE STILL WINS, because every test and every `braindog dev` in this repository
     opens a bare file with no data directory behind it. */
  /* `--allow-shape` (shape-guard-49) is the one flag `serve` reads, and it is never a file. */
  const allowShape = argv.slice(3).includes('--allow-shape');
  const explicit = argv.slice(3).find((a) => a !== '--allow-shape') ?? env.BRAINDOG_FILE;
  /* AND IT MUST ALREADY BE A RECORD. `openSqlite` CREATES the file, so a mistyped flag
     (`serve --port=9999`) became a fully migrated thirty-one-table record named `--port=9999`,
     served on the port, with every anonymous request its owner. The multi-record refusal below
     tells people to use this branch, which made it the likeliest way in. */
  if (explicit && !existsSync(explicit))
    return refuse(
      `${explicit} is not a record file, so nothing was served. serve takes the path of a ${RECORD_FILE}, or nothing to serve the record in ${data}; ${commandFor('--help')} says more.`,
    );
  let file = explicit;

  if (!file) {
    const dirFile = join(data, 'directory.sqlite');
    /* AN EMPTY DATA DIRECTORY WITH AN OWNER NAMED IS A FIRST RUN: make the record here, so `docker compose up` is the
       whole of the setup. Without BRAINDOG_OWNER it is the refusal below, as before. */
    if (!existsSync(dirFile) && (env.BRAINDOG_OWNER ?? '').trim() !== '') {
      await init([env.BRAINDOG_RECORD?.trim() || 'home']);
      say(`braindog · first run: made the record in ${data} for ${env.BRAINDOG_OWNER!.trim()}`);
    }
    const slugs = recordsIn(data);
    if (slugs.length === 0) return refuse(noRecord(data));
    if (slugs.length > 1)
      return refuse(
        `${data} holds ${slugs.length} records (${slugs.join(', ')}) and this host serves one. Serve one by its file, ${commandFor(`serve ${join(data, '<name>', RECORD_FILE)}`)}, or move the others out of ${data}.`,
      );
    /* `recordsIn` kept only the names that have one, so this is never null. */
    file = recordIn(join(data, slugs[0]!))!;
  }

  /* THE RECORD'S MIGRATIONS AGAINST THIS BUILD'S LOCK, before a key is opened or a port bound (`lockRefusal`). */
  const disagrees = lockRefusal(file);
  if (disagrees) return refuse(disagrees);

  /* AND THE KEY STORE, WHICH NO RUNNING PROCESS HELD. `init` wrote three `vault_key` rows from the
     first commit that made them and `serve` never opened the KEK, so the rows existed, nothing
     could open them, and an exported `.brain` went out unsigned. `33 §1` port 8 is a host port, and
     this is the host.

     A KEK THAT WILL NOT OPEN STOPS THE SERVER, rather than starting one that cannot sign, cannot
     open a grant, and says so nowhere. `49 §5.1` step 2 puts it before anything is served. */
  const store = await openKeyStore(env.BRAINDOG_KEK_FILE ?? join(data, 'kek'), say);

  /* THE DIRECTORY'S MAC KEY, `12 §8`'s lever: derived from the key file unless `BRAINDOG_SESSION_SECRET`
     names one, for a deployment that wants sessions to outlive a new key file, or to die without one.
     Either way it is 32 bytes by HKDF, and it is zero-filled once the Directory holds its own copy. */
  /* AN EMPTY SERVER KEY IS NO KEY: set but blank, it would open every interface to anyone presenting nothing. */
  const serverKey = serverKeyOf(env);
  /* IN THE IMAGE A SERVER WITH NO KEY IS ONE NOBODY CAN REACH (AI18): without a key it binds loopback, which inside a
     container is nowhere, so it came up healthy and answered nobody. There it is refused, and "remove the line" is never
     offered. Outside the image, no key is the loopback-only start the README gives. */
  const MAKE_KEY = "openssl rand -base64 32 | tr '+/' '-_' | tr -d '='";
  const orLoopback = inImage() ? '' : ', or remove the line to run on loopback only with nobody signing in';
  if (inImage() && (serverKey.value === undefined || serverKey.value.trim() === '') && listenOf(env) === undefined)
    return refuse(`Set BRAINDOG_SERVER_KEY in .env (make one with ${MAKE_KEY}): in a container nothing outside can reach a server without one.`);
  if (serverKey.value !== undefined && serverKey.value.trim() === '')
    return refuse(`${serverKey.name} is set but empty. Put a long random value in it (${MAKE_KEY})${orLoopback}.`);
  /* AND A SHORT ONE IS A KEY SOMEBODY CAN GUESS (SEC5): it is the owner to whoever presents it, on every interface. The
     lockout slows a guess at `/api` and `/mcp`; it cannot make eight characters into a secret. AND ONE OF A FEW
     CHARACTERS OVER AND OVER IS SHORT TOO (AI26): thirty-two copies of "a" passed. `weakKey` refuses under eight
     distinct characters, or under 128 bits for the alphabet it is written in (RG2: sixteen distinct refused about a
     quarter of `openssl rand -hex 32` keys, which hold sixteen digits at most). */
  if (serverKey.value !== undefined && serverKey.value.trim().length < 32)
    return refuse(`${serverKey.name} is shorter than 32 characters, so it could be guessed. Put a long random value in it (${MAKE_KEY})${orLoopback}.`);
  if (serverKey.value !== undefined && weakKey(serverKey.value.trim()))
    return refuse(`${serverKey.name} uses too few different characters, so it could be guessed. Put a long random value in it (${MAKE_KEY})${orLoopback}.`);
  const secret = env.BRAINDOG_SESSION_SECRET;
  if (secret !== undefined && secret.length < 32)
    return refuse('BRAINDOG_SESSION_SECRET is shorter than 32 characters. Make it 32 random bytes in base64url, or unset it to derive one from the key file.');
  const sessionKey = secret === undefined ? store.sessionKey : await deriveSessionKey(new TextEncoder().encode(secret));

  /* THE DIRECTORY `init` WROTE, when there is one: it is who may sign in. An explicit record file with no
     data directory behind it has none, and `/auth/methods` then says nobody signs in from the app. */
  const dirFile = join(data, 'directory.sqlite');
  const shell = env.BRAINDOG_SHELL ?? (existsSync(join(BUILT, 'index.html')) ? BUILT : undefined);

  /* MAIL, WHEN BOTH HALVES ARE SET: `BRAINDOG_SMTP_URL` says where it goes and `BRAINDOG_MAIL_FROM` who it is from. Half
     set or malformed stops the server with the sentence that names the fix, rather than a host that quietly sends
     nothing; neither set is a host with no mail, as before. The sentence never quotes the URL, which holds the password. */
  const smtp = smtpOf(env.BRAINDOG_SMTP_URL, env.BRAINDOG_MAIL_FROM);
  if (smtp && 'wrong' in smtp) return refuse(smtp.wrong);
  const send = smtp ? smtpSender(smtp) : undefined;
  /* A MAIL THAT FAILS IS A FAULT ON HEALTH AND ONE THAT GOES OUT CLEARS IT, THE SUMMARIES AS WELL AS THE SIGN-IN MAILS
     (PK4, RH14): the record is told once `start` below has opened it, and a mail before that is said in the log alone. */
  /* AND A MEMBER WHOSE MAILBOX WAS REFUSED WHILE THE REST GOT IT IS A LINE OF THEIR OWN ON HEALTH, by name (RK5). */
  const mailFault: MailFault = {
    failed: (error) => running.api.kernel.mailFailed(error),
    sent: (delivered, what) => running.api.kernel.mailSent(delivered, what),
    missed: (addresses, what) => running.api.kernel.mailMissed(addresses, what),
  };
  const notices = send ? mailedNotices(send, mailFault) : undefined;
  const webhooks = signedWebhooks(webhookPost());

  /* THE OPERATOR'S SWITCH (`49 §5.24`): an add-on's requests to other servers leave only when `BRAINDOG_OUTBOUND=on`.
     A value that is neither stops the server, rather than a guess that sends when the operator meant it not to. */
  /* WHICH PEERS ARE PROXIES WHOSE X-Forwarded-For IS READ (AI16): `1` for one on this machine or a private network, or
     their addresses. Anything else stops the server, rather than a guess at whose header to believe. */
  const trusts = proxyTrustOf(env.BRAINDOG_TRUST_PROXY);
  if (trusts !== null && 'wrong' in trusts) return refuse(trusts.wrong);
  const outbound = outboundOf(env.BRAINDOG_OUTBOUND);
  if (outbound === null) return refuse('BRAINDOG_OUTBOUND takes on or off. Set it to on to let plugins send requests to other servers, or unset it to keep them held.');

  const running = await start({
    file,
    port,
    /* A HOST STARTED TO TAKE A SHAPE COPY BACK, for a developer reading a customer's structure; never the default. */
    ...(allowShape ? { allowShape: true } : {}),
    token: serverKey.value,
    keys: store,
    ...(listenOf(env) === undefined ? {} : { host: listenOf(env) }),
    ...(existsSync(dirFile) ? { directory: dirFile } : {}),
    ...(originOf(env, port, tls !== undefined) === undefined ? {} : { origin: originOf(env, port, tls !== undefined) }),
    ...(tls === undefined ? {} : { tls }),
    ...(shell === undefined ? {} : { shell }),
    ...(env.BRAINDOG_CATALOGUE === undefined ? {} : { catalogue: env.BRAINDOG_CATALOGUE }),
    sessionKey,
    shareKey: store.shareKey,
    ...(trusts === null ? {} : { trustProxy: trusts }),
    /* THE SCHEDULED ACTIONS RUN ON THIS PROCESS'S TIMER, sending only to the origins their declarations name, AND ONLY
       WHEN THE OPERATOR SAID SO. This passed `{}` for every operator once, which made the server's "off unless asked"
       on for everybody (HD.306). Absent, `start` holds each action with the sentence `script.ts` keeps. */
    ...(outbound === 'on' ? { actions: {} } : {}),
    /* SLASH LOOKS ONCE A DAY on its own unless the owner turned that off; asking hourly is how a day is noticed. */
    slashTickMs: 3_600_000,
    /* A SIGNED WEBHOOK LEAVES THROUGH THE PINNED POST. Nothing was passed here once, so a `notify.webhook` an automation
       queued sat `pending` for the life of the process (measured, `test/webhook-wired.test.ts`). `pull.fetch` is the
       scheduled actions' own, above.

       AND A `notify.email` LEAVES THROUGH SMTP, ONLY WHERE THERE IS SMTP. It is on the list only then, so without it the
       row is never leased and waits `pending` for the day mail is set up, rather than walking the ladder to a dead
       letter (`49 §5.12` note 1).

       AND `erase.r2` IS ALWAYS ON IT: `start` deletes that file itself, off this record's own disk, whatever
       `deliver` below is passed, so an erasure is never left `pending` for want of a transport it does not need. */
    delivers: notices ? ['notify.webhook', 'notify.email', 'erase.r2'] : ['notify.webhook', 'erase.r2'],
    deliver: (job, keys) => (job.kind === 'notify.email' && notices ? notices(job) : webhooks(job, keys)),
    /* SIGN-IN LINKS, AN INVITATION'S PROOF AND THE PASSKEY NOTICES go out the same way, and `start` turns links on with it. */
    /* AND ONE THAT FAILS IS A FAULT ON HEALTH (PK4), told to the record once it is open. */
    ...(send ? { mail: authMail(send, say, mailFault) } : {}),
    /* AND MAIL THIS HOST CANNOT SEND IS SAID ONCE rather than left to wait unseen. The jobs stay queued, where dropping
       them would lose the digest somebody was promised; `start` says nothing when `notify.email` is delivered. */
    unsentMail: (waiting) =>
      say(
        `braindog · ${String(waiting)} notification ${waiting === 1 ? 'email is' : 'emails are'} waiting to be sent, and this host has no way to send mail yet. Set BRAINDOG_SMTP_URL and BRAINDOG_MAIL_FROM and start it again to send ${waiting === 1 ? 'it' : 'them'}. ${waiting === 1 ? 'It stays' : 'They stay'} queued, and nothing is lost; this is said once each time the host starts.`,
      ),
  });
  /* `importKey` copied it, so these are the last copies this process holds as bytes. */
  sessionKey.fill(0);
  store.sessionKey.fill(0);
  store.shareKey.fill(0);

  say(`braindog · ${file} · ${running.signIn.origin}`);
  /* A RECORD THIS BUILD REFUSES IS SERVED AS A REFUSAL, and this is the sentence that says why. `start()` used to exit
     here, so a container's health check saw a process gone rather than `/healthz`'s 503 and its code. */
  const stopped = running.api.kernel.refused();
  if (stopped) say(`  ${stopped.code}: ${stopped.fix} Every request is answered 503 until then, and /healthz says ${stopped.code}.`);
  /* A NEW KEY FILE WITH THE OLD ONE BESIDE IT AS `.prev` IS A ROTATION, and this start moves the record's keys under the
     new one before anybody is waiting on a key (`rewrap.ts`, `53 §5.6` step 8). */
  if (!stopped) await rewrapAtStart(running.api, store, say);
  /* ONE LINE FOR WHO MAY GET IN, SAID OUT LOUD, because the safe default is also the surprising one:
     somebody who expected the server on their LAN needs to know why it is not, and somebody who set a
     token needs to know where to sign in. It names ways, never a key. */
  say(bootLine(running.signIn));
  /* AND WHEN THAT KEY GOES OVER PLAIN HTTP TO EVERY INTERFACE, said beside it (`plainLine`). */
  const plain = plainLine({ key: serverKey.value !== undefined, tls: tls !== undefined, listen: listenOf(env), origin: running.signIn.origin, image: inImage(), publish: env.BRAINDOG_PUBLISH });
  if (plain) say(plain);
  /* AND WHEN THERE IS NO APP TO OPEN, SAID BEFORE ANY ADDRESS IS FOLLOWED. A start with no web build printed a sign-in
     address that answered a JSON 404; the root now answers a page saying the same as this line. */
  if (shell === undefined)
    say(`  app: not built, so ${running.signIn.origin} shows a page saying so and nothing else. Run pnpm --filter @braindog/web build in the repository folder, then start this again.`);
  /* AND WHERE THE ONE-TIME LINK THAT MAKES THE OWNER'S SIGN-IN IS, until they have a passkey: in a 0600 file in the data
     folder, and never in this output, which a container keeps as its log (`first-run.ts`). A person at a terminal of
     their own, outside the image, also sees it there; stdout is safe then, since a terminal is no `--json` reader. */
  if (existsSync(dirFile)) {
    const claimFile = join(data, 'claim-link');
    const first = await setupLine({
      dir: running.directorySql,
      auth: running.directory.auth as never,
      origin: running.signIn.origin,
      signInOff: running.signIn.off,
      file: claimFile,
      read: inImage() ? `docker compose exec braindog cat ${claimFile}` : `cat ${claimFile}`,
      tty: !inImage() && process.stdout.isTTY ? (line) => void process.stdout.write(`${line}\n`) : undefined,
    });
    if (first) say(first);
    /* AND THE SPENT LINK LEAVES THE DISK ONCE THE FIRST PASSKEY EXISTS (AI29), not at the next restart. Looked for every
       ten seconds while the file is there, off the event loop's count so it never holds the process up. */
    if (existsSync(claimFile)) {
      const look = setInterval(() => {
        try {
          if (!existsSync(claimFile)) clearInterval(look);
          else if (running.directorySql.one('SELECT 1 AS x FROM dir_passkey LIMIT 1')) {
            rmSync(claimFile, { force: true });
            clearInterval(look);
          }
        } catch {
          /* A closed Directory at shutdown: nothing to remove now, and the next start removes it. */
          clearInterval(look);
        }
      }, 10_000);
      look.unref();
    }
  }
  /* AND WHERE MAIL GOES, by host and port and never with what password. */
  if (smtp) say(`  ${smtpLine(smtp)}`);
  /* AND WHETHER IT CAN (AI20): signed in to and left with nothing sent, said when it answers, without holding the start. */
  if (smtp)
    void smtpCheck(smtp).then(
      () => say(`  mail: signed in to ${smtp.host}:${String(smtp.port)}. The domain of ${smtp.from} needs SPF and DKIM set up at your mail provider, or links land in spam.`),
      (e: unknown) =>
        say(`  mail: could not reach or sign in to ${smtp.host}:${String(smtp.port)} (${e instanceof Error ? e.message : 'no answer'}). Sign-in links and notices will not go out until it can.`),
    );
  for (const line of degradeLines(env, smtp !== null)) say(line);
  /* AND HOW AN AGENT GETS IN, with OAuth said either way: a default host listens on every interface at a plain-http
     origin, where OAuth is off, and nothing at start said so. */
  for (const line of agentLines({ origin: running.signIn.origin, slug: running.api.kernel.identity()?.slug, open: running.signIn.off === 'open', oauthOff: running.oauthOff })) say(line);
  /* AND WHETHER ADD-ONS MAY CALL OUT, with the registry's own switch named apart, because an operator who turns one off
     should not believe the other went with it. */
  say(
    outbound === 'on'
      ? '  plugins send requests to other servers (BRAINDOG_OUTBOUND=on). The public plugin registry is read either way; BRAINDOG_KENNEL=off stops that.'
      : '  plugins send no requests to other servers, and their scheduled actions are held. Set BRAINDOG_OUTBOUND=on to let them. The public plugin registry is read either way; BRAINDOG_KENNEL=off stops that.',
  );

  /* AND WHAT IS WRONG WITH THE ORIGIN, WHENEVER SOMETHING IS, rather than only when sign-in is off.
     MEASURED: at `BRAINDOG_ORIGIN=https://192.168.1.50:8443` a second boot reports
     `ways: ['the server key']`, so the line above reads "sign in at https://192.168.1.50:8443/signin
     with the server key" and is perfectly true. What it does not say is that the passkey button is
     missing and will never appear, because `relyingParty` refuses an address: the operator types the
     server key for ever and has no way to learn why. A first boot at the same origin reports
     `ways: []` and the equally unhelpful "has no way in to offer yet". One line, under both. */
  const wrong = reachLine(reachOf(running.signIn.origin));
  if (wrong) say(`  ${wrong}`);
  /* AND A PROXY IN FRONT THAT THE LOCKOUT CANNOT SEE PAST (RD7): an https name served as plain http here is the proxy
     shape, and without the setting every wrong key counts against the proxy, which locks everybody out at once. */
  if (serverKey.value !== undefined && trusts === null && tls === undefined && running.signIn.origin.startsWith('https:')) say(`  ${ONE_PLACE}`);

  /* AND WHETHER THE NAME MOVED SINCE LAST TIME, which nothing anywhere used to say. A passkey is bound to
     the hostname it was made at, so changing `BRAINDOG_ORIGIN` or swapping the certificate for one naming
     a tunnel silently retires every passkey on every device at once, and the sign-in screen that results
     looks exactly like a working one. Only where there is a Directory: it is the half that holds the
     credentials, so a host without one has no passkey to retire. */
  if (existsSync(dirFile)) {
    const moved = nameChange(join(data, 'served-at'), running.signIn.origin);
    if (moved) say(`  ${moved}`);
  }

  /* THE NIGHTLY COPY, beside the record in `snapshots/`, at `BRAINDOG_BACKUP_AT` (HH:MM in UTC, 03:20 unless set, `off`
     for none). It is taken the first time the host looks after that time, so a machine that was asleep catches up. */
  const at = env.BRAINDOG_BACKUP_AT ?? NIGHTLY_AT;
  const nightly =
    at === 'off'
      ? null
      : nightlyBackups({
          sql: running.sql,
          file,
          at,
          now: () => Date.now(),
          say,
          logged: (note) => running.api.kernel.lifecycle('export', 'system', note),
          /* AND THE DIRECTORY, into `<data>/directory-snapshots/`, when this host has one. */
          ...(existsSync(dirFile) ? { directory: { sql: running.directorySql, file: dirFile } } : {}),
        });
  /* A COPY THAT CANNOT BE WRITTEN DOES NOT STOP THE HOST. It is said in one sentence and tried again on the clock. */
  if (nightly) await nightly.look();

  /* AND IT STOPS WHEN IT IS ASKED TO. A container that kills a process holding a WAL leaves it to
     the next boot's recovery; closing takes a second and makes the file whole. */
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      nightly?.stop();
      void running.close().then(() => exit(0));
    });
}

/** What each command takes, on stderr like every other sentence here, and exit 0. Named as the person runs it. */
function help(): void {
  const rows: [string, string][] = [
    ['', `serve the record in BRAINDOG_DATA (${dataDir()} now). The default.`],
    ['init <name> --owner <email>', 'make a record, in an empty data folder.'],
    ['init <name> --from <file.brainl> [--key <public key>]', 'bring an export in as the record, in an empty data folder.'],
    ['backup <folder>', 'copy every record, the directory and the key file into a new folder under <folder>.'],
    ['restore <backup folder>', 'put a backup into an empty data folder.'],
    ['invite <their email> [--as <level>]', 'with no mail set up, print a link that lets somebody new join, here in this terminal only.'],
  ];
  say('The self-host. Each command, as you run it here:');
  for (const [words, does] of rows) say(`  ${commandFor(words).trimEnd()}\n      ${does}`);
  /* A BACKUP IN THE IMAGE IS WRITTEN INSIDE THE VOLUME, and this is the step that takes it off (README, Backups). */
  if (inImage()) say('  docker compose cp braindog:/data/backups/. ~/braindog-backups/\n      take the backups off the volume, into a folder outside the repository.');
  say('Every setting it reads is in selfhost.env.example, and apps/selfhost/README.md has the steps.');
}

/**
 * AND NOTHING REACHES THE OPERATOR AS A STACK TRACE.
 *
 * `49 §2` gives this command one sentence and two exit codes, and every reachable throw broke both:
 * `mkdir /data` without permission (the DEFAULT path, and the first thing a new self-hoster hits),
 * a `BRAINDOG_FILE` that is not a database, a read-only mount, a file another process holds. Node's
 * own message is the first line of it, which is the part somebody can act on.
 */
const [, , command = 'serve', ...rest] = argv;
/* EVERY LINE THE SERVER WRITES THROUGH THE CONSOLE (`log-floor.ts`). `say` writes this command's own sentences, a first run's
   link among them, past it and on purpose. */
installLogFloor();

try {
  /* AN IMAGE THAT CARRIES A SECRET DOES NOT START (`baked.ts`): a backup, a key file or a token in a layer is in every
     copy of the image, and serving from it would make it look fine. Its own data folder is never counted. */
  if (inImage()) {
    const found = bakedSecrets(APP_ROOT, [dataDir(), env.BRAINDOG_KEK_FILE ?? join(dataDir(), 'kek')]);
    if (found.length > 0) refuse(bakedSaid(found));
  }
  if (command === 'help' || command === '--help' || command === '-h') help();
  else if (command === 'init') await init(rest);
  else if (command === 'serve') await serve();
  else if (command === 'backup') {
    const dest = rest[0];
    if (!dest || dest.startsWith('--')) refuse(`backup needs a folder to write into: ${commandFor('backup <folder>')}.`);
    const kekFile = env.BRAINDOG_KEK_FILE ?? join(dataDir(), 'kek');
    const { out, said } = backupData({ data: dataDir(), kekFile, dest, now: Date.now() });
    say(`backup written to ${out} (${said.join(', ')}). It holds the key file and each record's inbound mail token, so keep it as private as the key, and outside the repository folder.`);
  } else if (command === 'restore') {
    const from = rest[0];
    if (!from || from.startsWith('--')) refuse(`restore needs the backup folder: ${commandFor('restore <backup folder>')}.`);
    restoreData({ data: dataDir(), from });
    say(`restored into ${dataDir()}. Start the server as usual.`);
  } else if (command === 'invite')
    await operatorInvite(rest, { data: dataDir(), env, records: () => recordsIn(dataDir()), fileOf: (slug) => recordIn(join(dataDir(), slug)), say, refuse });
  else refuse(`There is no ${command} here. It has serve, init, backup, restore and invite; ${commandFor('--help')} says what each takes.`);
} catch (e) {
  refuse(e instanceof Error ? e.message : String(e));
}

/**
 * Whether a key of 32 characters or more is still guessable: under eight distinct characters ("aaaa…", "abab…"), or
 * under 128 bits at what its alphabet gives a character (digits 3.3, hex 4, one case of letters 4.7, anything else 6).
 */
function weakKey(key: string): boolean {
  if (new Set(key).size < 8) return true;
  const bits = /^\d+$/u.test(key) ? Math.log2(10) : /^[0-9a-f]+$/iu.test(key) ? 4 : /^[a-z]+$/u.test(key) || /^[A-Z]+$/u.test(key) ? Math.log2(26) : 6;
  return key.length * bits < 128;
}

/** The zone this machine keeps, as `Intl` reads it (`TZ` included), or UTC where it reads none. */
function machineZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof z === 'string' && z !== '' ? z : 'UTC';
  } catch {
    return 'UTC';
  }
}
