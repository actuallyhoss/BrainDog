/**
 * `braindog sync pull` and `braindog sync drill`: a bundle another machine sent, placed on this one by this system's
 * places; and a bundle restored into a scratch folder, every hash compared, and the drill kept in Drills
 * (`docs/48-SPEC-CLI.md` §5.20).
 *
 * PULL READS THE NEWEST BUNDLE FROM ANOTHER MACHINE, or the one `--from` names, opened under this machine's key; a
 * bundle a host changed or made does not open. Each thing in it is placed where Carry says it lives on this system,
 * and only while Carry still holds it and it is on. A thing this machine sent a newer copy of is left, unless `--from`
 * names the machine to take it from. A file here that differs is copied aside first, to `~/.braindog/sync-kept/`,
 * never beside itself; a `.env` file in a repository that differs is left as it is and said, since the live one is
 * likelier right and a copy beside it could be committed.
 *
 * WHAT IS ASKED AT THE TERMINAL, each y/N, a no and no terminal both leaving it out:
 *   - A PROGRAM. A file of a thing that runs a program, and any file whose mode lets it run, is shown whole and asked
 *     about, and a yes is pinned by its SHA-256 in `~/.braindog/pins.json`, as `env apply` pins its entries (`pins.ts`),
 *     so the same file is not asked about again and a changed one is. A program that holds what looks like a key is not
 *     shown, and not placed.
 *   - SOMEBODY ELSE'S ACCOUNT. A thing Carry says belongs to another person is asked about by their name, with the
 *     advice to sign in again here instead, since an account may tie a sign-in to the machine it was made on.
 *   - A PLACE THAT MOVED. Carry is the record's, and a host or anybody who may write to it can change it; the bundle's
 *     manifest is sealed. So what a thing is and whether it runs is what the sealing machine said as well as what Carry
 *     says, whichever asks more, and a place on this system that is not the one sealed is asked about by where it would go:
 *     a host could otherwise lay a `.env` in a folder that is published, or a carried script over `~/.zshrc`.
 *   - TOOL SIGN-INS, which move and are never live on two machines (SCOPE §5): placed only from a machine that is
 *     retired, never over sign-ins this machine already holds, and written to their own item or file alone, never to
 *     an agent app's login item (`secret-store.ts`).
 * With no terminal, `--yes-data` places the plain data alone and asks nothing; without it the run is its plan.
 * Whatever waits for a yes is written on its thing in Carry, by this machine's name, so the page can say it.
 *
 * DRILL OPENS, NEVER PLACES. It writes each file into a scratch folder of its own and reads it back against the hash
 * the archive carries, holds tool sign-ins in memory alone, runs nothing, pins nothing, and removes the folder whatever
 * happened. The outcome, the counts and what failed go into Drills as this machine's latest drill.
 */

import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { caseless, carryRowOf, holds, keepAside, KIND_SAID, MEMORY_WAITS, placeOf, SYSTEM_SAID, targetIn, unpack, writeWhole, type CarryRow, type Entry } from './carry.ts';
import { oneLine } from './clip.ts';
import { shown } from './doctor.ts';
import { keepPin, pinOf, pinsFile, readPins, type Pins } from './pins.ts';
import { open } from './sealer.ts';
import { askTerminal } from './setup.ts';
import {
  createRow,
  exitOf,
  fieldOf,
  isFail,
  keepJoined,
  openManifest,
  ready,
  rowsOf,
  sealedGet,
  sourceBundle,
  takeLock,
  updateRow,
  type BundleRow,
  type Fail,
  type Ready,
  type Row,
  type SyncIo,
} from './sync-record.ts';
import { sized } from './sync.ts';
import { looksLikeKey } from './tools.ts';

const count = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
/** How many things in Carry, as a line counts them. */
const things = (n: number): string => `${n.toLocaleString('en-US')} thing${n === 1 ? '' : 's'}`;
const when =(iso: string): string => iso.slice(0, 16).replace('T', ' ');
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const stateOf = (row: Row): string | null => row.state ?? (typeof row.fields.state === 'string' ? row.fields.state : null);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
/** When a bundle was made, from its id (`<machine>.<yyyymmddhhmmss>.<random>`), so two compare as text. */
const madeAt = (id: string): string => id.split('.')[1] ?? '';

/** A file's bytes as text with no byte-order mark, for a Keychain item, which Node's JSON reader and his script read. */
const noBom = (bytes: Buffer): string => bytes.toString('utf8').replace(/^\uFEFF/u, '');

/** Whether bytes are text a person can read when shown: UTF-8 with no NUL. */
const isText = (bytes: Buffer): boolean => !bytes.includes(0) && Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes);

/** Whether a file is there. */
const isThere = (file: string): boolean => {
  try {
    lstatSync(file);
    return true;
  } catch {
    return false;
  }
};

/** A thing carried and opened: its archive's files, or why it did not open. */
async function opened(r: Ready, b: BundleRow): Promise<Entry[] | string | Fail> {
  const got = await sealedGet(r.call, r.to.key, b.key, b.sha256);
  if (isFail(got)) return got;
  if (got === null) return 'its sealed file is not in your BrainDog as the bundle names it';
  const bytes = open(r.key, b.key, got);
  if (bytes === null) return "its sealed file does not open under this machine's sync key";
  const archive = unpack(bytes);
  if (archive === null) return 'its sealed file opened, and is not a whole archive';
  if (archive.mismatched.length > 0) return `${count(archive.mismatched.length, 'file does', 'files do')} not match the hash the archive gives`;
  return archive.entries;
}

/** The names of the people a thing may belong to, by their row's id, read once and only when one is asked about. */
function namesOf(r: Ready): (id: string) => Promise<string> {
  let names: Map<string, string> | null = null;
  return async (id) => {
    if (names === null) {
      names = new Map();
      const to = fieldOf(r.lists.carry, 'whose')?.to;
      const list = typeof to === 'string' ? r.lists.all[to] : undefined;
      const title = typeof list === 'object' && list !== null && typeof (list as { title?: unknown }).title === 'string' ? (list as { title: string }).title : 'name';
      const rows = typeof to === 'string' ? await rowsOf(r.call, to, r.to.key) : [];
      if (!isFail(rows)) for (const row of rows) if (typeof row.fields[title] === 'string') names.set(row.id, row.fields[title]);
    }
    return names.get(id) ?? 'somebody else';
  };
}

const USAGE = 'braindog sync pull takes --from <machine>, --dry-run, --yes-data and --host <host>, and nothing else.';

/**
 * `braindog sync pull [--from <machine>] [--dry-run] [--yes-data] [--host <host>]`, and its exit: 1 when anything was
 * left out, waits for a yes or failed, or nothing could be read; 3 when the record did not answer.
 */
export async function syncPull(args: string[], io: SyncIo): Promise<number> {
  let values: { from?: string | undefined; 'dry-run'?: boolean | undefined; 'yes-data'?: boolean | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { from: { type: 'string' }, 'dry-run': { type: 'boolean' }, 'yes-data': { type: 'boolean' }, host: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const dryRun = values['dry-run'] === true;
  const terminal = io.terminal ?? (process.stdin.isTTY === true && process.stderr.isTTY === true);
  /* WITH NO TERMINAL AND NO --yes-data, THE RUN IS ITS PLAN; WITH --yes-data, THE PLAIN DATA ALONE. A yes is only ever typed. */
  const planOnly = dryRun || (!terminal && values['yes-data'] !== true);
  const canAsk = terminal && !dryRun;
  const ask = io.ask ?? ((q: string) => askTerminal(q, io.signal));
  const now = (io.now ?? Date.now)();
  /* ONE SYNC THAT WRITES AT A TIME on this machine, as a push takes its turn. */
  const release = dryRun ? () => undefined : takeLock(io.home, now);
  if (release === null) {
    io.say('Another sync is running on this machine. Wait for it to finish, then try again.');
    return 1;
  }
  try {
    return await pull({ from: values.from, host: values.host, dryRun, planOnly, canAsk, ask, now }, io);
  } finally {
    release();
  }
}

/** How a pull runs, read from its arguments and the terminal. */
type PullHow = { from: string | undefined; host: string | undefined; dryRun: boolean; planOnly: boolean; canAsk: boolean; ask: (q: string) => Promise<boolean | null>; now: number };

async function pull(how: PullHow, io: SyncIo): Promise<number> {
  const { dryRun, planOnly, canAsk, ask, now } = how;
  const r = await ready(io, how.host, 'place');
  if (typeof r === 'number') return r;
  const fail = (f: Fail) => {
    io.say(f.said);
    return exitOf(f);
  };
  const source = await sourceBundle(r, how.from);
  if (isFail(source)) return fail(source);
  if ('none' in source) {
    io.out(source.none);
    return 1;
  }
  const raw = await rowsOf(r.call, r.lists.carry.id, r.to.key);
  if (isFail(raw)) return fail(raw);
  const carried = new Map(raw.map((row) => [row.seq, { row, c: carryRowOf(row) }]));
  const file = pinsFile(io.home);
  let pins: Pins | null = readPins(file);
  if (pins === null) {
    io.say(`${file} is not valid JSON, so nothing was placed. Delete it, and every program is asked about again.`);
    return 1;
  }
  const from = oneLine(source.manifest.machine);
  const me = r.joined.machine;
  const loose = caseless(r.system);
  const nameOf = namesOf(r);
  const stamp = new Date(now).toISOString().replace(/\D/gu, '').slice(0, 14);

  /* WHAT THIS MACHINE SENT LAST, for a thing it holds a newer copy of; not asked when the machine is named. */
  let own: Map<number, string> | null = null;
  if (how.from === undefined && source.mine !== null && madeAt(source.mine.id) > madeAt(source.ref.id)) {
    const m = await openManifest(r.call, r.to.key, r.key, source.mine);
    if (isFail(m)) return fail(m);
    if (m !== null) own = new Map(m.rows.map((b) => [b.seq, b.key]));
  }

  io.out(`braindog sync pull: what ${from} sent on ${when(source.manifest.at)}, placed on ${oneLine(me)}, ${SYSTEM_SAID[r.system]}${dryRun ? ', as a dry run' : planOnly ? ', as a plan' : ''}.`);
  let failed = false;
  let left = false;
  let placedAny = false;
  const waiting = new Set<number>();
  const aside: string[] = [];
  /** A thing that needs a yes and cannot be asked now: said, and left unless this is a dry run. */
  const notAsked = (line: string) => {
    io.out(line);
    if (!dryRun) left = true;
  };

  for (const b of [...source.manifest.rows].sort((x, y) => x.seq - y.seq)) {
    const c: CarryRow | null = carried.get(b.seq)?.c ?? null;
    const name = oneLine(c?.name ?? b.name);
    if (c === null) {
      io.out(`  ${name}: no longer in Carry, so it is not placed.`);
      continue;
    }
    if (!c.on) {
      io.out(`  ${name}: off in Carry, so it is not placed.`);
      continue;
    }
    if (c.kind === 'memory' || b.kind === 'memory') {
      io.out(`  ${name}: refused, ${MEMORY_WAITS}`);
      failed = true;
      continue;
    }
    if (c.kind === 'patches' || b.kind === 'patches') {
      io.out(`  ${name}: unpushed work is applied with braindog sync patches.`);
      continue;
    }
    const placed = placeOf(c, r.system, { home: io.home, env: io.env, apps: r.apps });
    if ('none' in placed) {
      io.out(`  ${name}: names no place on ${SYSTEM_SAID[r.system]}, so it is skipped here.`);
      continue;
    }
    if ('refused' in placed) {
      io.out(`  ${name}: refused, ${placed.refused}.`);
      failed = true;
      continue;
    }
    if (own !== null && own.has(b.seq) && own.get(b.seq) !== b.key) {
      io.out(`  ${name}: this machine sent a newer copy than ${from}'s, so it is left. Take ${from}'s with braindog sync pull --from "${from}".`);
      continue;
    }
    const got = await opened(r, b);
    if (isFail(got)) return fail(got);
    if (typeof got === 'string') {
      io.out(`  ${name}: not placed, because ${got}.`);
      failed = true;
      continue;
    }
    const place = placed.place;

    /* ── a place that is not the one sealed: asked by where it would go, and never taken on a --yes-data ── */
    const sealedPlace = b.places === undefined ? undefined : (b.places[r.system] ?? null);
    if (sealedPlace !== undefined && sealedPlace !== c.places[r.system]) {
      const rooted = place.kind === 'path' ? got.map((e) => targetIn(place.path, e.path, loose)) : [];
      if (rooted.length === 0 || !rooted.every((t, i) => t !== null && holds(t, got[i]!.bytes))) {
        const going = oneLine(place.kind === 'path' ? shown(place.path, io.home) : `the Keychain item ${place.item.service}`);
        const sealedSaid = sealedPlace === null ? `no place on ${SYSTEM_SAID[r.system]}` : oneLine(sealedPlace);
        if (!canAsk) {
          notAsked(`  ${name}: Carry now puts it at ${going}, and ${from} sealed it for ${sealedSaid}, so it is asked about at a terminal first. Send it again from ${from} if the new place is yours.`);
          continue;
        }
        if ((await ask(`${c.name}: Carry now puts it at ${going}, and ${from} sealed it for ${sealedSaid}. Place it there? [y/N] `)) !== true) {
          io.out(`  ${name}: not placed, as you said, because its place is not the one ${from} sealed.`);
          left = true;
          continue;
        }
      }
    }

    /* ── tool sign-ins: moved from a retired machine alone, into their own item or file ── */
    if (c.kind === 'sign_ins' || b.kind === 'sign_ins') {
      const only = got.length === 1 ? got[0] : undefined;
      if (only === undefined || only.path !== '') {
        io.out(`  ${name}: tool sign-ins are one item or one file, and this is not, so it is not placed.`);
        failed = true;
        continue;
      }
      if (!source.retired) {
        io.out(`  ${name}: stays on ${from} while it is live. Tool sign-ins move and are never live on two machines: retire ${from} first with braindog sync retire "${from}", or sign in on this machine on its own.`);
        left = true;
        continue;
      }
      const there = place.kind === 'keychain' ? await r.store.read(place.item) : null;
      if (there !== null && !there.ok) {
        io.out(`  ${name}: ${there.why}`);
        failed = true;
        continue;
      }
      const here = place.kind === 'keychain' ? there !== null && there.ok && there.value !== null : isThere(place.path);
      const already = place.kind === 'keychain' ? there !== null && there.ok && there.value === noBom(only.bytes) : holds(place.path, only.bytes);
      if (already) {
        io.out(`  ${name}: already here.`);
        continue;
      }
      if (here) {
        io.out(`  ${name}: this machine holds tool sign-ins of its own there, so ${from}'s were not placed over them.`);
        left = true;
        continue;
      }
      if (!canAsk) {
        notAsked(`  ${name}: ${from} is retired, so its tool sign-ins ${dryRun ? 'would move here' : 'can move here'}, after a yes at a terminal.`);
        continue;
      }
      if ((await ask(`Move the tool sign-ins ${from} carried to this machine? ${from} is retired, so they are live here alone. [y/N] `)) !== true) {
        io.out(`  ${name}: not moved, as you said.`);
        left = true;
        continue;
      }
      if (place.kind === 'keychain') {
        const put = await r.store.write(place.item, noBom(only.bytes));
        if (!put.ok) {
          io.out(`  ${name}: ${put.why}`);
          failed = true;
          continue;
        }
      } else writeWhole(place.path, only.bytes, 0o600);
      placedAny = true;
      io.out(`  ${name}: moved here from ${from}. Each app reads them at its next start.`);
      continue;
    }

    if (place.kind === 'keychain') {
      io.out(`  ${name}: a Keychain item holds tool sign-ins alone, and this is ${KIND_SAID[c.kind]}, so it is not placed.`);
      failed = true;
      continue;
    }
    const root = place.path;
    const targets = got.map((e) => ({ e, target: targetIn(root, e.path, loose) }));
    if (targets.every(({ e, target }) => target === null || holds(target, e.bytes))) {
      io.out(`  ${name}: already here, ${count(got.length, 'file', 'files')}.`);
      continue;
    }

    /* ── somebody else's account: asked by their name, and signing in again advised ── */
    if (c.belongsTo !== null) {
      const who = oneLine(await nameOf(c.belongsTo));
      if (!canAsk) {
        notAsked(`  ${name}: ${who}'s account, so it is asked about at a terminal first. Signing in again on this machine is better than moving it.`);
        continue;
      }
      const yes = await ask(`${c.name} is ${who}'s account. Signing in again on this machine is better than moving it, since an account may tie a sign-in to the machine it was made on. Place it anyway? [y/N] `);
      if (yes !== true) {
        io.out(`  ${name}: ${who}'s, so it was left for you to sign in to again here.`);
        left = true;
        continue;
      }
    }

    /* ── each file: a program asked about and pinned, data placed, a differing one kept aside first ── */
    let n = 0;
    let unchanged = 0;
    const said: string[] = [];
    for (const { e, target } of targets) {
      if (target === null) continue;
      const where = oneLine(shown(target, io.home));
      if (holds(target, e.bytes)) {
        unchanged++;
        continue;
      }
      const there = isThere(target);
      /* A PROGRAM: a file of a thing that runs one, or any file whose mode lets it run, whatever its thing says. */
      if (c.runs || b.runs || (e.mode & 0o111) !== 0) {
        const entry = { sha256: sha256(e.bytes), mode: e.mode };
        const sha = pinOf('carry', where, entry);
        if (pins?.[sha] === undefined) {
          if (isText(e.bytes) && looksLikeKey(e.bytes.toString('utf8'))) {
            said.push(`    ${where} runs a program and holds what looks like a key, so it is not shown and not placed. Copy it by hand.`);
            left = true;
            continue;
          }
          if (!canAsk) {
            said.push(`    ${where} runs a program not yet approved on this machine, so ${dryRun ? 'placing it asks about it first' : 'it waits for a yes at a terminal'}.`);
            if (!dryRun) {
              waiting.add(c.seq);
              left = true;
            }
            continue;
          }
          io.out(`  ${name}: ${where}, ${sized(e.bytes.length)}, runs a program:`);
          if (isText(e.bytes)) for (const line of e.bytes.toString('utf8').replace(/\r?\n$/u, '').split(/\r?\n/u)) io.out(`      ${oneLine(line)}`);
          else io.out(`      not text: ${sized(e.bytes.length)}, SHA-256 ${entry.sha256}.`);
          if ((await ask(`Place ${where} on this machine? It runs a program. [y/N] `)) !== true) {
            said.push(`    ${where} was not placed, as you said, and waits for a yes.`);
            waiting.add(c.seq);
            left = true;
            continue;
          }
          pins = keepPin(file, sha, { name: where, kind: 'carry', profile: c.name, now });
        }
      }
      if (there && (c.kind === 'env' || b.kind === 'env')) {
        said.push(`    ${where} differs here, so it was left as it is. Delete it and pull again to take ${from}'s.`);
        left = true;
        continue;
      }
      if (planOnly) {
        n++;
        continue;
      }
      try {
        if (there) aside.push(keepAside(target, { home: io.home, stamp }));
        writeWhole(target, e.bytes, e.mode);
        n++;
      } catch {
        said.push(`    ${where} could not be written.`);
        failed = true;
      }
    }
    if (n > 0 && !planOnly) placedAny = true;
    io.out(
      n === 0
        ? `  ${name}: nothing ${planOnly ? 'would be placed' : 'placed'}${unchanged > 0 ? `, ${count(unchanged, 'file', 'files')} already here` : ''}.`
        : `  ${name}: ${count(n, 'file', 'files')} ${planOnly ? 'would be placed' : 'placed'}${unchanged > 0 ? `, ${String(unchanged)} already here` : ''}.`,
    );
    for (const line of said) io.out(line);
  }

  /* ── what waits for a yes, on each thing in Carry, by this machine's name ── */
  if (!dryRun && fieldOf(r.lists.carry, 'waits') !== undefined)
    for (const { row, c } of carried.values()) {
      if (c === null) continue;
      const others = c.waiting.filter((m) => !same(m, me));
      const next = waiting.has(c.seq) ? [...others, me] : others;
      if (next.length !== c.waiting.length || next.some((m, i) => m !== c.waiting[i])) await updateRow(r.call, r.lists.carry, row, { waits: next }, r.to.key);
    }

  if (aside.length > 0) io.out(`The files replaced here are kept in ${oneLine(shown(join(io.home, '.braindog', 'sync-kept', stamp), io.home))}.`);
  if (dryRun) {
    io.out('That was a dry run, so nothing was placed, asked or pinned.');
    return failed ? 1 : 0;
  }
  if (planOnly) {
    io.out("Nothing was placed, because no one is at a terminal to say yes. Run braindog sync pull --yes-data to place the plain files alone; a program, tool sign-ins and somebody else's account are asked about at a terminal.");
    return 1;
  }
  keepJoined(io.home, r.to.key, { ...r.joined, placed: { ...(r.joined.placed ?? {}), [source.slug]: source.ref.id } });
  io.out(placedAny ? `Placed what ${from} sent. Sessions started from now on have it.` : failed || left ? 'Nothing else changed.' : `Nothing to place: this machine already holds what ${from} sent.`);
  return failed || left ? 1 : 0;
}

/* ── the drill ─────────────────────────────────────────────────────────── */

const DRILL_USAGE = 'braindog sync drill takes --from <machine> and --host <host>, and nothing else.';

/**
 * `braindog sync drill [--from <machine>] [--host <host>]`: the newest bundle, or the newest from the machine named,
 * restored into a scratch folder and every file read back against its hash; the outcome kept in Drills. Exit 0 when it
 * passed, 1 when it failed, 3 when the record did not answer.
 */
export async function syncDrill(args: string[], io: SyncIo): Promise<number> {
  let values: { from?: string | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { from: { type: 'string' }, host: { type: 'string' } } }));
  } catch {
    io.say(DRILL_USAGE);
    return 1;
  }
  const now = (io.now ?? Date.now)();
  const r = await ready(io, values.host, 'drill');
  if (typeof r === 'number') return r;
  const fail = (f: Fail) => {
    io.say(f.said);
    return exitOf(f);
  };
  const source = await sourceBundle(r, values.from, { own: true });
  if (isFail(source)) return fail(source);
  if ('none' in source) {
    io.out(source.none);
    return 1;
  }
  const from = oneLine(source.manifest.machine);
  io.out(`braindog sync drill: ${from}'s bundle of ${when(source.manifest.at)}, restored into a scratch folder that is removed after.`);
  const scratch = mkdtempSync(join(tmpdir(), 'braindog-drill-'));
  const problems: string[] = [];
  let files = 0;
  let matched = 0;
  try {
    for (const b of source.manifest.rows) {
      const name = oneLine(b.name);
      const got = await opened(r, b);
      if (isFail(got)) return fail(got);
      if (typeof got === 'string') {
        problems.push(`${b.name}: ${got}`);
        io.out(`  ${name}: failed, ${got}.`);
        continue;
      }
      files += got.length;
      if (got.length !== b.files) problems.push(`${b.name}: the bundle names ${String(b.files)} files and its archive holds ${String(got.length)}`);
      /* TOOL SIGN-INS ARE HELD IN MEMORY ALONE: their hash was checked as the archive opened, and no copy is written. */
      if (b.kind === 'sign_ins') {
        matched += got.length;
        io.out(`  ${name}: ${count(got.length, 'file', 'files')}, opened and checked in memory, never written.`);
        continue;
      }
      let good = 0;
      for (const e of got) {
        const target = targetIn(join(scratch, String(b.seq)), e.path, false);
        if (target === null) continue;
        writeWhole(target, e.bytes, 0o600);
        if (sha256(readFileSync(target)) === sha256(e.bytes)) good++;
      }
      matched += good;
      if (good !== got.length) problems.push(`${b.name}: ${String(got.length - good)} of ${String(got.length)} files did not read back as they were sealed`);
      io.out(`  ${name}: ${count(got.length, 'file', 'files')}, ${good === got.length ? 'every hash matched' : `${String(got.length - good)} did not match`}.`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const passed = problems.length === 0;
  const stamp = new Date(now).toISOString();
  const drills = r.lists.drills;
  if (drills !== null) {
    const rows = await rowsOf(r.call, drills.id, r.to.key);
    if (isFail(rows)) return fail(rows);
    const made = await createRow(
      r.call,
      drills,
      { host: r.joined.machine, ref: source.ref.id, sent_by: source.manifest.machine, at: stamp, grade: passed ? 'pass' : 'fail', files, matched, fails: problems, state: 'latest' },
      r.to.key,
    );
    if (made === 'asked') io.out('Your BrainDog asked you about the Drills entry on Decide.');
    else if (isFail(made)) io.out(`The Drills entry was not written: ${made.said}`);
    /* THE ONE BEFORE IT BECOMES OLDER only once this one is written, so Drills always has a latest to measure. */
    else for (const row of rows) if (stateOf(row) === 'latest') await updateRow(r.call, drills, row, { state: 'older' }, r.to.key);
  }
  io.out(
    passed
      ? `Passed: ${things(source.manifest.rows.length)}, ${count(files, 'file', 'files')}, every one opened and matched its hash. Nothing was placed, and the scratch folder is gone.`
      : `Failed: ${count(problems.length, 'problem', 'problems')}. ${problems.map(oneLine).join('; ')}.`,
  );
  return passed ? 0 : 1;
}
