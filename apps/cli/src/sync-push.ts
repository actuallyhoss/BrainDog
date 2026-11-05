/**
 * `braindog sync push [--dry-run] [--host <host>]`: what this machine carries, sealed here and kept in the record, as
 * one bundle (`docs/48-SPEC-CLI.md` §5.20).
 *
 * EACH THING IN CARRY, IN ORDER: off ones and Auto memory are said and passed over; one with no place on this system is
 * skipped and said; the rest are gathered (`carry.ts`), packed into one archive, and named by a keyed hash of it
 * (`versionOf`), so a thing that has not changed is the sealed file already kept and nothing is sent again. A changed
 * one is sealed under the sync key with its key as additional data and put, a part at a time.
 *
 * ONE BUNDLE A PUSH THAT CHANGED SOMETHING: a manifest naming each thing's sealed file and its SHA-256, sealed itself
 * and kept at `bundle/<machine>.<when>.<random>/manifest`, and an entry in Bundles saying the same by name and size,
 * which becomes this machine's latest while its older entries are marked older. A push that changed nothing sends no
 * bundle and moves its latest entry's Checked time, so a machine still at work is never asked about as a quiet one.
 *
 * WHEN A SESSION ENDS, AND ONCE A DAY. The end hook and the start hook start `sync push --auto end` and `--auto day`
 * in the background (`startPush`), on a machine that has joined, so neither hook waits for a byte of it. The day is
 * claimed in this machine's note before the push starts, as `profile-place.ts` claims its own, and handed back when
 * the record did not answer, so the next session tries again. The time it was tried is kept there first too, and a
 * push at the end of a session waits ten minutes after the last one tried, so a dozen sessions closing together send
 * once. Under `--auto` every line goes to `~/.braindog/sync.log`, nothing is asked, and the exit is 0 whatever
 * happened.
 *
 * NAMES, SIZES AND HASHES ONLY leave this machine in the clear. The lines, the log and the Bundles entry say a thing
 * by its name and its files by count and size; what a file holds is only ever in the sealed bytes.
 */

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { caseless, gatherEnv, gatherFiles, gatherItem, KIND_SAID, LINE_SAID, MEMORY_WAITS, pack, placeOf, SYSTEM_SAID, type CarryRow, type Gathered, type GatherOptions, carryRowOf } from './carry.ts';
import { oneLine } from './clip.ts';
import { shown } from './doctor.ts';
import { seal, versionOf } from './sealer.ts';
import { dayOf } from './session-start.ts';
import { makePatches, vaultLine, workSaid } from './sync-patches.ts';
import {
  bundleId,
  carryKey,
  createRow,
  exitOf,
  isFail,
  keepJoined,
  manifestKey,
  ownTarget,
  readJoined,
  ready,
  rowsOf,
  sealedList,
  sealedPut,
  sha256Of,
  takeLock,
  updateRow,
  type BundleRow,
  type Fail,
  type Manifest,
  type Row,
  type SyncIo,
} from './sync-record.ts';
import { sized } from './sync.ts';

type Env = Record<string, string | undefined>;

const USAGE = 'braindog sync push takes --dry-run and --host <host>, and nothing else.';

/** How long after a push the end of a session starts another. */
export const END_WAIT_MS = 10 * 60_000;

const count = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
/** How many things in Carry, as a line counts them. */
const things = (n: number): string => `${n.toLocaleString('en-US')} thing${n === 1 ? '' : 's'}`;
const howBig = (g: { entries: unknown[]; size: number }): string => `${count(g.entries.length, 'file', 'files')}, ${sized(g.size)}`;
const same = (a: unknown, b: string): boolean => typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
const stateOf = (row: Row): string | null => row.state ?? (typeof row.fields.state === 'string' ? row.fields.state : null);

/** What was left out of a thing, said in a few lines: refusals by place, the rest by how many. */
function leftLines(g: Gathered, root: string, home: string): string[] {
  const by = (why: string) => g.skipped.filter((s) => s.why === why).map((s) => oneLine(shown(s.path === '' ? root : join(root, ...s.path.split('/')), home)));
  const out: string[] = [];
  for (const line of ['login', 'transcripts'] as const) {
    const paths = by(line);
    if (paths.length > 0) out.push(`    Refused, ${LINE_SAID[line]}: ${paths.join(', ')}.`);
  }
  const links = by('link').length;
  if (links > 0) out.push(`    Left out: ${count(links, 'link', 'links')}, never followed.`);
  const named = by('left-out').length;
  if (named > 0) out.push(`    Left out by its Leave out names: ${count(named, 'file or folder', 'files and folders')}.`);
  const signIns = by('sign-ins').length;
  if (signIns > 0) out.push(`    Left out: ${count(signIns, 'file', 'files')} of tool sign-ins, which only their own thing carries.`);
  const unread = by('unreadable');
  if (unread.length > 0) out.push(`    Could not be read: ${unread.join(', ')}.`);
  return out;
}

/**
 * `braindog sync push`, and its exit: 1 when anything was refused, too big or not sent, 3 when the record did not
 * answer. Under `--auto` it is always 0, and it stops at once on a machine that has not joined, or pushed too lately.
 */
export async function syncPush(args: string[], io: SyncIo): Promise<number> {
  let values: { 'dry-run'?: boolean | undefined; host?: string | undefined; auto?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { 'dry-run': { type: 'boolean' }, host: { type: 'string' }, auto: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const auto = values.auto;
  if (auto !== undefined && auto !== 'end' && auto !== 'day') {
    io.say(USAGE);
    return 1;
  }
  const now = (io.now ?? Date.now)();
  const dryRun = values['dry-run'] === true && auto === undefined;

  /* ── the background push: stopped at once when it is not owed, and claimed before it starts ── */
  let claimed: { host: string; had: string | undefined } | null = null;
  if (auto !== undefined) {
    let host: string;
    try {
      host = ownTarget(values.host, io.env).key;
    } catch {
      return 0;
    }
    const joined = readJoined(io.home, host);
    if (joined === null) return 0;
    if (auto === 'end' && joined.tried !== undefined && now - Date.parse(joined.tried) < END_WAIT_MS) return 0;
    if (auto === 'day' && joined.day === dayOf(now)) return 0;
    /* THE TIME TRIED, AND THE DAY FOR THE DAILY PUSH, KEPT FIRST: sessions that end together find this one started. */
    keepJoined(io.home, host, { ...joined, tried: new Date(now).toISOString(), ...(auto === 'day' ? { day: dayOf(now) } : {}) });
    if (auto === 'day') claimed = { host, had: joined.day };
  }
  const code = await pushOnce(values.host, dryRun, auto !== undefined, io, now);
  /* A RECORD THAT DID NOT ANSWER GIVES THE DAY BACK, so the next session tries again. */
  if (claimed !== null && code === 3) {
    const joined = readJoined(io.home, claimed.host);
    if (joined !== null) keepJoined(io.home, claimed.host, { ...joined, day: claimed.had });
  }
  return auto !== undefined ? 0 : code;
}

async function pushOnce(host: string | undefined, dryRun: boolean, auto: boolean, io: SyncIo, now: number): Promise<number> {
  const release = dryRun ? () => undefined : takeLock(io.home, now);
  if (release === null) {
    io.say('Another sync is running on this machine. Wait for it to finish, then try again.');
    return 1;
  }
  try {
    return await push(host, dryRun, auto, io, now);
  } finally {
    release();
  }
}

async function push(host: string | undefined, dryRun: boolean, auto: boolean, io: SyncIo, now: number): Promise<number> {
  const r = await ready(io, host, 'push');
  if (typeof r === 'number') return r;
  const { call, joined, key } = r;
  const at = r.to.key;
  const fail = (f: Fail) => {
    io.say(f.said);
    return exitOf(f);
  };
  const rows = await rowsOf(call, r.lists.carry.id, at);
  if (isFail(rows)) return fail(rows);
  const carried = rows
    .map(carryRowOf)
    .filter((x): x is CarryRow => x !== null)
    .sort((a, b) => a.seq - b.seq);
  const kept = await sealedList(call, at, 'carry/');
  if (isFail(kept)) return fail(kept);
  const held = new Map(kept.filter((f) => f.complete).map((f) => [f.key, f]));

  io.out(`braindog sync push: ${oneLine(joined.machine)}, ${SYSTEM_SAID[r.system]}, to ${at}${dryRun ? ', as a dry run' : ''}.`);
  if (carried.length === 0) {
    io.out('Carry lists nothing yet, so there is nothing to seal. Add what this machine should carry there.');
    return 0;
  }

  /* THE PLACES OF TOOL SIGN-INS HERE, which no other thing carries. */
  const placeOpts = { home: io.home, env: io.env, apps: r.apps };
  const signIns = carried.flatMap((c) => {
    if (c.kind !== 'sign_ins') return [];
    const p = placeOf(c, r.system, placeOpts);
    return 'place' in p && p.place.kind === 'path' ? [p.place.path] : [];
  });

  const bundled: BundleRow[] = [];
  let failed = false;
  let sealedNow = 0;
  for (const c of carried) {
    const name = oneLine(c.name);
    if (!c.on) {
      io.out(`  ${name}: off, so it is not carried.`);
      continue;
    }
    if (c.kind === 'memory') {
      io.out(`  ${name}: refused, ${MEMORY_WAITS}`);
      failed = true;
      continue;
    }
    const placed = placeOf(c, r.system, placeOpts);
    if ('none' in placed) {
      io.out(`  ${name}: names no place on ${SYSTEM_SAID[r.system]}, so it is skipped here.`);
      continue;
    }
    if ('refused' in placed) {
      io.out(`  ${name}: refused, ${placed.refused}.`);
      failed = true;
      continue;
    }
    const opts: GatherOptions = { leaveOut: c.leaveOut, loose: caseless(r.system), signIns: c.kind === 'sign_ins' ? [] : signIns, apps: r.apps };
    const place = placed.place;
    const where = place.kind === 'keychain' ? `the Keychain item ${place.item.service}` : oneLine(shown(place.path, io.home));
    let g: Gathered;
    const extra: string[] = [];
    if (place.kind === 'keychain') {
      const got = await gatherItem(place.item, r.store);
      if ('failed' in got) {
        io.out(`  ${name}: ${got.failed}`);
        failed = true;
        continue;
      }
      g = got;
    } else if (c.kind === 'env') g = await gatherEnv(place.path, opts, io.git);
    else if (c.kind === 'patches') {
      const made = await makePatches(place.path, opts, io.git);
      g = made;
      for (const { repo, work } of made.repos) {
        extra.push(`    ${oneLine(repo)}: ${workSaid(work)}${work.base === null ? '' : `, against ${work.base.slice(0, 7)}`}.`);
        if (work.vault.length > 0) extra.push(`    ${vaultLine(repo, work.vault)}`);
      }
    } else g = gatherFiles(place.path, opts);
    const left = place.kind === 'path' ? leftLines(g, place.path, io.home) : g.skipped.length > 0 ? [`    Refused, ${LINE_SAID.login}.`] : [];
    if (g.tooBig) {
      io.out(`  ${name}: over 25 MB, so it was not sealed. Leave some of it out with its Leave out names, or split it into two.`);
      failed = true;
      continue;
    }
    if (g.missing) {
      io.out(`  ${name}: nothing at ${where} on this machine.`);
      continue;
    }
    if (g.entries.length === 0) {
      io.out(`  ${name}: nothing to carry at ${where}.`);
      for (const line of left) io.out(line);
      continue;
    }
    const archive = pack(g.entries);
    const k = carryKey(c.seq, versionOf(key, `carry/${String(c.seq)}`, archive));
    const was = held.get(k);
    let sha: string;
    if (was !== undefined) {
      sha = was.sha256;
      io.out(`  ${name}: ${howBig(g)}, sealed already.`);
    } else {
      const sealed = seal(key, k, archive);
      sha = sha256Of(sealed);
      if (dryRun) io.out(`  ${name}: ${howBig(g)} would be sealed and sent.`);
      else {
        const put = await sealedPut(call, at, k, sealed);
        if (put !== true) {
          io.out(`  ${name}: not sent. ${put.said}`);
          if (put.fail === 'away' || put.fail === 'older') return fail(put);
          failed = true;
          continue;
        }
        sealedNow++;
        io.out(`  ${name}: ${howBig(g)}, sealed and sent.`);
      }
    }
    for (const line of [...extra, ...left]) io.out(line);
    bundled.push({ seq: c.seq, name: c.name, kind: c.kind, key: k, sha256: sha, files: g.entries.length, size: g.size, runs: c.runs, places: c.places });
  }

  /* ── the bundle, or the Checked time when nothing changed ── */
  const keys = Object.fromEntries(bundled.map((b) => [String(b.seq), b.key]));
  const unchanged = joined.bundle !== undefined && joined.rows !== undefined && JSON.stringify(Object.entries(joined.rows).sort()) === JSON.stringify(Object.entries(keys).sort());
  const files = bundled.reduce((n, b) => n + b.files, 0);
  const size = bundled.reduce((n, b) => n + b.size, 0);
  const stamp = new Date(now).toISOString();
  if (dryRun) {
    io.out(unchanged ? 'Nothing changed since the last bundle.' : `That was a dry run: ${things(bundled.length)}, ${count(files, 'file', 'files')}, ${sized(size)} would be one bundle. Nothing was sealed or sent.`);
    return failed ? 1 : 0;
  }
  const bundles = r.lists.bundles;
  const entries = bundles === null ? [] : await rowsOf(call, bundles.id, at);
  if (isFail(entries)) return fail(entries);
  const latest = entries.filter((e) => same(e.fields.host, joined.machine) && stateOf(e) === 'latest');
  if (unchanged || bundled.length === 0) {
    for (const e of latest.slice(0, 1)) if (bundles !== null) await updateRow(call, bundles, e, { heard: stamp }, at);
    keepJoined(io.home, at, { ...joined, tried: stamp });
    io.out(bundled.length === 0 ? 'Nothing here to carry, so no bundle was sent.' : `Nothing changed since the last bundle${joined.pushed === undefined ? '' : `, sent ${joined.pushed.slice(0, 16).replace('T', ' ')}`}.`);
    return failed ? 1 : 0;
  }
  const id = bundleId(joined.machine, now);
  const manifest: Manifest = { v: 1, id, machine: joined.machine, system: r.system, at: stamp, rows: bundled };
  const mkey = manifestKey(id);
  const put = await sealedPut(call, at, mkey, seal(key, mkey, Buffer.from(JSON.stringify(manifest), 'utf8')));
  if (put !== true) return fail(put);
  keepJoined(io.home, at, { ...joined, bundle: id, rows: keys, pushed: stamp, tried: stamp });
  if (bundles !== null) {
    const said = {
      host: joined.machine,
      ref: id,
      at: stamp,
      heard: stamp,
      rows: bundled.map((b) => `${b.name}: ${count(b.files, 'file', 'files')}, ${sized(b.size)}${b.kind === 'files' ? '' : `, ${KIND_SAID[b.kind]}`}`),
      files,
      size,
      sealed: bundled.map((b) => `${b.key} ${b.sha256.slice(0, 12)}`),
      kept: failed ? 'partial' : 'whole',
      state: 'latest',
    };
    const made = await createRow(call, bundles, said, at);
    if (made === 'asked') io.out('Your BrainDog asked you about the Bundles entry on Decide. The bundle itself is sealed and kept.');
    else if (isFail(made)) io.out(`The Bundles entry was not written: ${made.said} The bundle itself is sealed and kept.`);
    /* THE ONE BEFORE IT BECOMES OLDER only once this one is written, so Bundles always has this machine's latest. */
    else for (const e of latest) await updateRow(call, bundles, e, { state: 'older' }, at);
  }
  io.out(
    `Sealed one bundle from ${oneLine(joined.machine)}: ${things(bundled.length)}, ${count(files, 'file', 'files')}, ${sized(size)}${sealedNow === 0 ? ', every file already kept' : `, ${things(sealedNow)} sent new`}.${auto ? '' : ' Another machine places it with braindog sync pull.'}`,
  );
  return failed ? 1 : 0;
}

/* ── the background push ───────────────────────────────────────────────── */

/** The log a background push writes to, beside this machine's note. */
export const syncLog = (home: string): string => join(home, '.braindog', 'sync.log');

/** One line of a background push's log, with when, appended; nothing is written when the folder cannot be. */
export function logLine(home: string, line: string, now: number = Date.now()): void {
  try {
    mkdirSync(dirname(syncLog(home)), { recursive: true, mode: 0o700 });
    appendFileSync(syncLog(home), `${new Date(now).toISOString()} ${line}\n`, { mode: 0o600 });
  } catch {
    /* A folder that cannot be written loses the line, and nothing else. */
  }
}

/** How a background push is started: a test's, or a detached child that outlives the hook. */
export type Starter = (args: string[]) => void;

const detached =
  (cli: string, env: Env): Starter =>
  (args) => {
    const child = spawn(process.execPath, [cli, ...args], { detached: true, stdio: 'ignore', windowsHide: true, env: Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as NodeJS.ProcessEnv });
    child.on('error', () => undefined);
    child.unref();
  };

/**
 * Start a background push from a hook, when one is owed: `end` at the end of a session, `day` at a session's start
 * once a day. Only on a machine that has joined this record, and never waited for: the hook spends a few milliseconds
 * reading this machine's note and starting a process, and the push itself runs on after the hook has ended. Never
 * throws, and returns whether it started one.
 */
export function startPush(o: { home: string; env: Env; cli: string; when: 'end' | 'day'; now?: number; start?: Starter }): boolean {
  try {
    const now = o.now ?? Date.now();
    const host = ownTarget(undefined, o.env).key;
    const joined = readJoined(o.home, host);
    if (joined === null) return false;
    if (o.when === 'day' && joined.day === dayOf(now)) return false;
    if (o.when === 'end' && joined.tried !== undefined && now - Date.parse(joined.tried) < END_WAIT_MS) return false;
    (o.start ?? detached(o.cli, o.env))(['sync', 'push', '--auto', o.when]);
    return true;
  } catch {
    return false;
  }
}
