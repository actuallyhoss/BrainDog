/**
 * `braindog update [--check] [--older]`: the command keeps itself current.
 *
 * WHERE IT READS. The address the install scripts download from, `https://brain.dog/cli`, where the deploy publishes
 * three files side by side: `braindog.mjs`, its `.sha256`, and its `.build`, the one line `bundle.mjs` writes. The
 * build is read first, so a command that is already the served build says so without downloading anything.
 *
 * THE SWAP, AND WHAT IS LEFT WHEN IT FAILS. The bundle is downloaded to `braindog.new.mjs` beside the installed file,
 * so every move is a rename on one file system, held to the published sum, and asked its version under this Node, as
 * the install script asks before it replaces anything. It ends in `.mjs` and not `.new`, which the scope wrote,
 * because Node refuses to run a file whose extension it does not know, and the download must run before it is placed.
 * Only then is the installed file copied to `braindog.mjs.prev` and the new one renamed over it, one atomic rename, so
 * the installed name always holds a whole command. Any failure deletes the download and leaves the installed file as
 * it was, so no temporary file is left on any path, and one rename of `.prev` brings the last build back by hand.
 *
 * AND TO ITS SIGNATURE, ONCE THIS COMMAND IS PINNED (`release-key.ts`). The sum is served from the same place as the file, so it
 * says nothing about somebody who can change what the site serves; `braindog.mjs.sig` is made at release with a key that is
 * not there. Checked before the download is ever started, because the `--version` below runs it. With no key pinned, the sum
 * alone, as every build before the pin, which is how one of those reaches the first pinned build.
 *
 * NOT BACKWARDS UNLESS ASKED. Somebody who can change what the site serves can serve an older build with its own good signature, one
 * with a hole a later one closed. So a build older than this one is refused unless `--older` asks for it, by its day before anything
 * is downloaded, and once pinned by the release time the signature covers, since a day holds several releases.
 *
 * THE FILE'S OWN BUILD MUST BE THE ONE THE SITE NAMED. A deploy copies the three files one after another, so a read in
 * between can pair a new `.build` with an old bundle. The downloaded file's `--version` is compared with the build that
 * was read, and a mismatch is refused, rather than an update that reports one build and installs another.
 *
 * NOT FROM A CHECKOUT. Run from the sources, `main.ts` says `dev+0000000` and the file it would replace is a source
 * file, so it refuses in one sentence. It never runs on its own at a session's start (the owner's choice): the
 * start hook only says the command is behind, and this verb is typed.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

import { placeAgain, type Placed } from './placed.ts';
import { readSignature, RELEASE_KEYS, signedBy } from './release-key.ts';

type Env = Record<string, string | undefined>;

/** Where the install scripts download from (`apps/site/static/cli/install.sh`, `BASE`). */
export const CLI_BASE = 'https://brain.dog/cli';

/** The build a checkout run says, `main.ts`'s `build()` with no bundle. */
export const CHECKOUT_BUILD = 'dev+0000000';

/** `<yyyy.mm.dd>+<sha7>`, the shape `bundle.mjs` holds the build to. */
const TUPLE = /^\d{4}\.\d{2}\.\d{2}\+[0-9a-f]{7,40}$/;

/** What `update` needs from its process, passed in so a test can hold all of it. */
export interface UpdateIo {
  /** The installed file: the running bundle. */
  file: string;
  /** This command's build. */
  build: string;
  /** When this command was released (`__RELEASED__`), in seconds; nothing is older than a command that does not know. */
  released?: number;
  env: Env;
  /** The result line, on stdout. */
  out: (line: string) => void;
  /** A refusal, on stderr. */
  err: (line: string) => void;
  base?: string;
  home?: string;
  fetch?: typeof fetch;
  /** The keys a build must be signed by; `RELEASE_KEYS` unless a test holds its own. */
  keys?: readonly string[];
  /** Places the skill and hooks again from the new file; `placeAgain` unless a test holds it. */
  place?: (file: string) => Placed;
  /** The rename that swaps the download into place; `renameSync` unless a test makes it fail. */
  rename?: (from: string, to: string) => void;
}

/** Two builds as a person compares them: the dates when they differ, the whole builds when one day holds both. */
export function pair(a: string, b: string): [string, string] {
  const [da, db] = [a.split('+')[0] ?? a, b.split('+')[0] ?? b];
  return da !== db && TUPLE.test(a) && TUPLE.test(b) ? [da, db] : [a, b];
}

/** The one line `--check` prints. */
export function checkLine(mine: string, served: string): string {
  if (mine === served) return `This command is ${mine}, the build that is out.`;
  const [a, b] = pair(mine, served);
  return mine.split('+')[0]! > served.split('+')[0]! ? `This command is ${a}; the site serves ${b}, an older build. Run braindog update --older to match it.` : `This command is ${a}; ${b} is out. Run braindog update.`;
}

/**
 * One address asked, its moves followed here, one at a time.
 *
 * LEFT TO `fetch`, A MOVE FROM HTTPS TO HTTP IS FOLLOWED (`verify.ts` measured it, and this file was proved against a
 * local https server): a bundle read in the clear, with a sum read in the clear beside it, was started by the
 * `--version` check below. So a move anywhere but https ends the read before that address is asked anything. The one
 * other address it may stay on is the one it began at, which is a test's own server on this machine.
 */
async function reached(get: typeof fetch, url: string, ms: number): Promise<Response> {
  const signal = AbortSignal.timeout(ms);
  const began = new URL(url).origin;
  let at = url;
  for (let moves = 0; ; moves++) {
    const res = await get(at, { signal, redirect: 'manual' });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (location === null) return res;
    const next = new URL(location, at);
    if (next.protocol !== 'https:' && next.origin !== began) throw new Error(`it sent the request on to ${next.origin}, which is not https`);
    if (moves === 5) throw new Error('it moved more than five times');
    at = next.href;
  }
}

/** One text file from the site, trimmed, with the reason it could not be read when it could not. */
async function text(get: typeof fetch, url: string, ms: number): Promise<string> {
  const res = await reached(get, url, ms);
  if (!res.ok) throw new Error(`it answered ${res.status}`);
  return (await res.text()).trim();
}

const olderLine = (mine: string, served: string): string =>
  `This command is ${mine}, and the site serves ${served}, an older build, so nothing changed and it did not run. After a rollback that is expected, and braindog update --older takes it. If nobody rolled back, somebody may be serving an old build on purpose, so leave it.`;

const reason = (e: unknown): string => (e instanceof Error ? (e.name === 'TimeoutError' ? 'it did not answer in time' : e.message) : String(e));

/** Runs `braindog update [--check]`, and answers the exit code. */
export async function update(args: string[], io: UpdateIo): Promise<number> {
  let check = false;
  let older = false;
  try {
    const { values } = parseArgs({ args, options: { check: { type: 'boolean' }, older: { type: 'boolean' } }, strict: true });
    check = values.check === true;
    older = values.older === true;
  } catch {
    io.err('braindog update takes --check and --older, and nothing else.');
    return 1;
  }
  if (io.build === CHECKOUT_BUILD) {
    io.err('This braindog runs from a checkout, so it is updated with git, not with braindog update.');
    return 1;
  }
  const base = (io.base ?? CLI_BASE).replace(/\/+$/, '');
  const get = io.fetch ?? fetch;

  let served: string;
  try {
    served = await text(get, `${base}/braindog.mjs.build`, 10_000);
  } catch (e) {
    io.err(`The build that is out could not be read from ${base}/braindog.mjs.build (${reason(e)})${check ? '.' : ', so nothing changed.'}`);
    return 1;
  }
  if (!TUPLE.test(served)) {
    io.err(`${base}/braindog.mjs.build does not hold a build${check ? '.' : ', so nothing changed.'}`);
    return 1;
  }
  if (check) {
    io.out(checkLine(io.build, served));
    return 0;
  }
  if (served === io.build) {
    io.out(`This command is ${served}, the build that is out, so there is nothing to update.`);
    return 0;
  }
  if (!older && served.split('+')[0]! < io.build.split('+')[0]!) {
    const [a, b] = pair(io.build, served);
    io.err(olderLine(a, b));
    return 1;
  }

  const fresh = io.file.replace(/(\.mjs)?$/, '.new.mjs');
  const prev = `${io.file}.prev`;
  let swapped = false;
  try {
    let want: string;
    let bytes: Buffer;
    const keys = io.keys ?? RELEASE_KEYS;
    let signature = '';
    try {
      want = (await text(get, `${base}/braindog.mjs.sha256`, 10_000)).split(/\s+/)[0] ?? '';
      if (keys.length > 0) signature = await text(get, `${base}/braindog.mjs.sig`, 10_000).catch(() => '');
      const res = await reached(get, `${base}/braindog.mjs`, 120_000);
      if (!res.ok) throw new Error(`${base}/braindog.mjs answered ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      io.err(`The new build could not be downloaded (${reason(e)}), so nothing changed.`);
      return 1;
    }
    if (!/^[0-9a-f]{64}$/.test(want)) {
      io.err(`${base}/braindog.mjs.sha256 does not hold a SHA-256, so nothing changed.`);
      return 1;
    }
    rmSync(fresh, { force: true });
    writeFileSync(fresh, bytes, { mode: 0o755 });
    const got = createHash('sha256').update(bytes).digest('hex');
    if (got !== want) {
      io.err('The download does not match its checksum, so nothing changed. Run braindog update again to download it afresh.');
      return 1;
    }
    /* BEFORE IT RUNS. A deploy copying its files can pair a new bundle with an old signature, so this one is worth a second try
       and is said as such; a build nobody signed stays refused however often it is asked. */
    if (keys.length > 0) {
      const said = readSignature(signature);
      if (said === null || !signedBy(keys, want, served, said.released, said.signature)) {
        io.err(
          signature === ''
            ? `${base} serves this build with no signature, so nothing changed and it did not run. This command takes only a build signed at release. Run braindog update again in a few minutes; if it says the same, do not install it by hand, and tell whoever runs that host.`
            : `The signature on this build is not BrainDog's, so nothing changed and it did not run. It can happen for a moment while a deploy is copying its files, so run braindog update again in a few minutes; if it says the same, do not install it by hand, and tell whoever runs that host.`,
        );
        return 1;
      }
      /* THE SIGNED TIME, for the release of the same day the check above could not tell apart. */
      if (!older && said.released < (io.released ?? 0)) {
        io.err(olderLine(io.build, served));
        return 1;
      }
    }
    /* ASKED BEFORE IT IS PUT IN PLACE, so a file this Node cannot run never replaces one that works. */
    const asked = spawnSync(process.execPath, [fresh, '--version'], { encoding: 'utf8', timeout: 30_000, env: io.env });
    const says = /^app (\S+)/.exec(asked.stdout ?? '')?.[1];
    if (asked.status !== 0 || says === undefined) {
      io.err('The downloaded braindog did not run under this Node, so nothing changed.');
      return 1;
    }
    if (says !== served) {
      io.err(`The downloaded file is ${says}, not ${served} as the site said, which happens while a deploy is copying them, so nothing changed. Run braindog update again in a minute.`);
      return 1;
    }
    chmodSync(fresh, 0o755);
    /* THE OLD ONE IS COPIED ASIDE, NOT MOVED, so the installed name is never empty: the one rename that swaps is
       atomic on one file system, and when it fails the installed file was never touched. */
    copyFileSync(io.file, prev);
    (io.rename ?? renameSync)(fresh, io.file);
    swapped = true;
  } catch (e) {
    io.err(`The update stopped (${reason(e)}), and the installed command is the one that was there.`);
    return 1;
  } finally {
    if (!swapped) rmSync(fresh, { force: true });
  }

  const placed = (io.place ?? ((file: string) => placeAgain(file, io.env, io.home ?? homedir())))(io.file);
  const [was, now] = pair(io.build, served);
  const head = `Updated ${was} to ${now}, the old one kept beside it as ${basename(prev)}`;
  if (placed.failed !== null) {
    io.out(`${head}.`);
    io.err(`The Agent Skill and hooks were not placed again (${placed.failed}). Run braindog install --apply to place them.`);
    return 1;
  }
  io.out(`${head}, skill placed in ${placed.count} profile${placed.count === 1 ? '' : 's'}.`);
  return 0;
}
