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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, env, exit, stderr } from 'node:process';

import { createRecordApi } from '@braindog/record';
import { createDirectory } from '@braindog/record/directory';
import { ulids } from '@braindog/kernel';

import { fixOf } from '@braindog/ports';

import { EVERY_KIND, openSqlite, start } from './server.ts';

/** `34-GRAMMARS` line 348, and the Directory's own — the two must agree or one of them is unreachable. */
const SLUG = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

/** One sentence, and the exit code `48 §4.4` reserves for a refusal. */
function refuse(said: string): never {
  stderr.write(`${said}\n`);
  return exit(1);
}

const dataDir = (): string => env.BRAINDOG_DATA ?? '/data';

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
  if (!SLUG.test(slug))
    return refuse(
      `${slug} is not a name: it starts with a letter, is two to thirty-two characters of lower-case letters, digits and hyphens, and does not end with one.`,
    );

  const flag = args.indexOf('--owner');
  const email = (flag >= 0 ? args[flag + 1] : undefined) ?? env.BRAINDOG_OWNER;
  /* AND AN OWNERLESS RECORD IS REFUSED. The spec does not say what happens without one, and there is
     no consistent way to invent it: the Directory's `person.email` is `NOT NULL`, so a record with
     no owner cannot be written there at all — and a record nobody owns is a record nobody can
     invite anybody to. */
  if (!email?.trim())
    return refuse('braindog init needs an owner: --owner <email>, or BRAINDOG_OWNER. A record nobody owns cannot be shared.');
  /* AND THE ADDRESS IS CHECKED HERE, WHICH IS ONE RULE IN TWO PLACES ON PURPOSE. The Directory
     refuses a malformed one too, and it is the authority — but it is asked at step 5, three steps
     after the record file has been created and migrated. So `--owner not-an-address` refused
     correctly and left a record on disk, and the retry with the right address hit "is already a
     record". A refusal that costs the user their first attempt at the name is not a refusal. */
  if (!email.trim().includes('@')) return refuse(`${email} is not an address.`);

  const data = dataDir();
  const dir = join(data, slug);
  const file = join(dir, 'record.dog');

  /* 0700 ON THE DATA DIRECTORY, `49 §5.1` step 1. On Windows the mode is advisory and Node applies
     what it can; saying so is better than pretending the call did nothing. */
  mkdirSync(data, { mode: 0o700, recursive: true });
  mkdirSync(join(dir, 'blobs'), { recursive: true });
  mkdirSync(join(dir, 'snapshots'), { recursive: true });

  const clock = { now: () => Date.now() };
  const mint = ulids(clock.now);
  const id = `rec_${mint()}`;


  /* THE RECORD FIRST. 51 §13 D21: a Directory row never points at a record that failed to
     initialise. `createRecord` takes no `CallContext` — it is the one method that cannot be routed,
     because there is nobody to authorise it against until it has run. */
  const dirSql = openSqlite(join(data, 'directory.sqlite'));
  const directory = createDirectory(dirSql, clock);

  /* A RECORD THAT ALREADY HAS A NAME IS CREATED, and a second `init` is a refusal — 49 §5.22 step 2,
     and §9's row. But a record file with no name is the HALF-DONE case this ordering deliberately
     leaves behind, and refusing it would make the one recoverable failure unrecoverable: the file
     exists, so `init` refuses; the Directory does not know it, so nothing can reach it; and the name
     is not taken, so there is no command that finishes the job. Finishing it is what a second run
     should do. */
  if (existsSync(file) && directory.resolve(slug))
    return refuse(`${slug} is already a record here. A record is created once.`);

  const person = directory.person$(email);
  if (!person.ok) return refuse(fixOf(person));

  const sql = openSqlite(file);
  const api = await createRecordApi({ sql, clock, delivers: EVERY_KIND });
  const refused = api.kernel.refused();
  if (refused) return refuse(`${file} could not be migrated: ${refused.fix}`);

  /* AND A RE-RUN USES THE ID THE FILE ALREADY HAS, rather than minting a second one for the same
     storage — which `createRecord` refuses anyway ("a record is created once, and this is not it"),
     with a sentence about the wrong problem. */
  const already = sql.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1')?.id;
  const made = await api.createRecord({
    ...(already ? { id: already } : { id }),
    slug,
    name: slug,
    tz: 'UTC',
    locale: 'en',
    owner: { id: person.value.id, email: person.value.email, name: person.value.name },
  });
  if (!made.ok) return refuse(fixOf(made));

  /* AND THEN THE NAME. `record:` is what makes the ordering expressible at all — without it the
     Directory mints its own id and the two halves disagree for ever. */
  const named = directory.provision({ slug, email, record: already ?? id });
  if (!named.ok) return refuse(fixOf(named));

  /* THE INBOUND TOKEN, `49 §5.16` step 2: the self-host has no MX, so email arrives forwarded to
     `/in/email/<token>`. Nothing reads it until that route exists, and `49 §5.1` step 5.5 already
     says "if present" — but it is one file, and a record created without one would need a second
     command nobody has written to get one. `wx` so a re-run cannot quietly reissue it. */
  const inbound = join(dir, 'inbound.token');
  if (!existsSync(inbound)) writeFileSync(inbound, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });

  sql.close();
  dirSql.close();
  stderr.write(`record ${slug} created · owner ${email} · inbound email token at ${inbound}\n`);
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
  let file = explicit;

  if (!file) {
    const dirFile = join(data, 'directory.sqlite');
    if (!existsSync(dirFile))
      return refuse(`There is no record in ${data}. Create one with: braindog init <slug> --owner <email>`);
    const dirSql = openSqlite(dirFile);
    const slugs = dirSql.all<{ slug: string }>('SELECT slug FROM dir_slug WHERE released_at IS NULL ORDER BY claimed_at');
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

  stderr.write(`braindog · ${file} · http://localhost:${port}/api/boot\n`);
  /* SAID OUT LOUD, because the safe default is also the surprising one. Somebody who expected the
     server on their LAN needs to know why it is not, and somebody who set a token needs to know
     that it now is. */
  stderr.write(
    env.BRAINDOG_TOKEN === undefined
      ? '  loopback only — set BRAINDOG_TOKEN to listen on every interface\n'
      : '  listening on every interface, behind BRAINDOG_TOKEN\n',
  );

  /* AND IT STOPS WHEN IT IS ASKED TO. A container that kills a process holding a WAL leaves it to
     the next boot's recovery; closing takes a second and makes the file whole. */
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void running.close().then(() => exit(0));
    });
}

const [, , command = 'serve', ...rest] = argv;
if (command === 'init') await init(rest);
else if (command === 'serve') await serve();
else refuse(`braindog has no ${command}. It has serve and init.`);
