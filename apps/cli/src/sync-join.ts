/**
 * `braindog sync join` and `braindog sync retire <machine>`: a machine taking its place in setup sync, and one leaving it
 * for good (`docs/48-SPEC-CLI.md` §5.20).
 *
 * JOIN NAMES THIS MACHINE AND KEEPS THE SYNC KEY IN ITS SECRET STORE. On a record with no `sync/key` yet, this machine
 * makes the key, 32 random bytes, and asks for a new sync passphrase twice at the terminal, typed and never shown; the
 * key's copy sealed under it goes into the record and the key itself into this machine's store (`secret-store.ts`).
 * The record is asked again just before the copy is put, and the copy read back after, so two machines joining first at
 * once do not each keep a key of their own. On a record that has one, it asks for the passphrase, up to three times,
 * opens the copy and keeps the key. The passphrase is never an argument, never kept and never sent; a new one is at
 * least twelve characters, as the vault's.
 *
 * A COPY THE RECORD LOST IS PUT BACK by a machine that holds the key: `join` run again there asks for a passphrase and
 * seals a new copy under it. A record holding sealed files with no copy is never handed a new key unless `--new-key`
 * says so, since a new key opens none of what was sealed before.
 *
 * A NAME IS THIS MACHINE'S FOR GOOD. A retired name is never joined again, and one another machine already sends bundles
 * under is taken only when the person at this terminal says this is that machine, set up again.
 *
 * RETIRE ENDS A MACHINE'S PART: a note sealed under the sync key at `machine/<name>/retired`, so no host can forge one,
 * and its entries in Bundles marked retired. It sends and places nothing more, and the next time it runs a sync verb it
 * removes its own key (`ready` in `sync-record.ts`). Its tool sign-ins may then move to another machine, which is how
 * setup sync keeps two machines from ever living on one refresh token: move, then retire. Retiring this machine removes
 * its key here at once, and asks before removing the tool sign-ins it holds; the copies each app keeps for itself are
 * the app's, never opened, and the person is told to sign out of them.
 */

import { lstatSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import { carryRowOf, placeOf, type CarryRow } from './carry.ts';
import { oneLine } from './clip.ts';
import { shown } from './doctor.ts';
import { deviceName } from './hooks.ts';
import type { Target } from './http.ts';
import { keyFromText, keyText, newSyncKey, passphraseFault, readWrapped, seal, unwrapKey, wrapKey } from './sealer.ts';
import { storeFor, syncKeyItem } from './secret-store.ts';
import { askTerminal } from './setup.ts';
import { saidDay } from './said-day.ts';
import {
  bundlesIn,
  callerFor,
  createRow,
  exitOf,
  findLists,
  isFail,
  keepJoined,
  MACHINE_NAME,
  ownTarget,
  readJoined,
  ready,
  recordName,
  retiredKey,
  retiredMachines,
  rowsOf,
  sealedGet,
  sealedList,
  sealedPut,
  slugOf,
  SYNC_KEY,
  updateRow,
  type Call,
  type Fail,
  type Joined,
  type Row,
  type SyncIo,
  type Wrote,
} from './sync-record.ts';

/** How many times a passphrase is asked for before the command stops. */
const TRIES = 3;

const count = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * One line typed at the terminal and never shown, for a passphrase: raw mode, so no character is echoed, Backspace
 * taking one back, an arrow key's sequence passed over, and Ctrl+C or Ctrl+D a no. `null` with no terminal to type at.
 */
export function askHidden(question: string): Promise<string | null> {
  const input = process.stdin;
  if (!input.isTTY || !process.stderr.isTTY) return Promise.resolve(null);
  process.stderr.write(question);
  return new Promise((done) => {
    let typed = '';
    const wasRaw = input.isRaw;
    const finish = (value: string | null) => {
      input.off('data', onData);
      input.setRawMode(wasRaw);
      input.pause();
      process.stderr.write('\n');
      done(value);
    };
    const onData = (chunk: Buffer | string) => {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n') return finish(typed);
        if (ch === '\u0003' || ch === '\u0004') return finish(null);
        /* An escape starts an arrow key's or a function key's sequence: the rest of this chunk is that sequence. */
        if (ch === '\u001b') return;
        if (ch === '\u007f' || ch === '\b') typed = [...typed].slice(0, -1).join('');
        else if (ch >= ' ') typed += ch;
      }
    };
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}

/** One line typed at the terminal and shown, or `null` with no terminal; an empty answer is `''`. */
async function askLine(question: string, signal?: AbortSignal): Promise<string | null> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  rl.on('SIGINT', () => rl.close());
  try {
    return (await rl.question(question, signal ? { signal } : {})).trim();
  } catch {
    return null;
  } finally {
    rl.close();
  }
}

/**
 * A new sync passphrase, typed twice and never shown, held to `passphraseFault`; up to three tries, and `null` when it
 * was stopped or never matched.
 */
async function newPassphrase(io: SyncIo, hidden: (q: string) => Promise<string | null>): Promise<string | null> {
  for (let tries = 0; tries < TRIES; tries++) {
    const once = await hidden('New sync passphrase: ');
    if (once === null) return null;
    const fault = passphraseFault(once);
    if (fault !== null) {
      io.say(fault);
      continue;
    }
    const again = await hidden('Type it again: ');
    if (again === null) return null;
    if (again.normalize('NFC') === once.normalize('NFC')) return once;
    io.say('The two do not match. Type the passphrase again.');
  }
  io.say('No sync passphrase was set.');
  return null;
}

const safeJson = (bytes: Buffer): unknown => {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return null;
  }
};

/**
 * The key's copy sealed under a passphrase, put, and read back: `true` when what came back opens to this key, `false`
 * when another machine's copy is there instead.
 */
async function putCopy(call: Call, host: string, key: Buffer, passphrase: string, record: string): Promise<boolean | Fail> {
  const put = await sealedPut(call, host, SYNC_KEY, Buffer.from(JSON.stringify(wrapKey(key, passphrase, record)), 'utf8'));
  if (put !== true) return put;
  const back = await sealedGet(call, host, SYNC_KEY);
  if (isFail(back)) return back;
  const copy = back === null ? null : readWrapped(safeJson(back));
  const opened = copy === null ? null : unwrapKey(copy, passphrase, record);
  return opened !== null && opened.equals(key);
}

const JOIN_USAGE = 'braindog sync join takes --name <machine>, --new-key and --host <host>, and nothing else. The passphrase is typed at the terminal, never given as an argument.';

/** What `join` reads beyond `SyncIo`: the line a name is typed on, a test's. */
export type JoinIo = SyncIo & { line?: ((question: string) => Promise<string | null>) | undefined };

/**
 * `braindog sync join [--name <machine>] [--new-key] [--host <host>]`, and its exit: 0 once the key is kept here, 1 for
 * anything that stopped it, 3 when the record did not answer.
 */
export async function syncJoin(args: string[], io: JoinIo): Promise<number> {
  let values: { name?: string | undefined; 'new-key'?: boolean | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { name: { type: 'string' }, 'new-key': { type: 'boolean' }, host: { type: 'string' } } }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a passphrase typed in the wrong place. */
    io.say(JOIN_USAGE);
    return 1;
  }
  let to: Target;
  try {
    to = ownTarget(values.host, io.env);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  if (to.token === undefined && io.call === undefined) {
    io.say(`This machine is not signed in to ${to.key}. Run braindog login ${to.key} first.`);
    return 1;
  }
  const host = to.key;
  const call = io.call ?? callerFor(to, io.env);
  const fail = (f: Fail) => {
    io.say(f.said);
    return exitOf(f);
  };
  const lists = await findLists(call, host);
  if (lists === 'none') {
    io.say('Install the Setup sync plugin first: its Carry list says what each machine carries.');
    return 1;
  }
  if (isFail(lists)) return fail(lists);
  const platform = io.platform ?? process.platform;
  const store = io.store ?? storeFor(platform);
  const terminal = io.terminal ?? (process.stdin.isTTY === true && process.stderr.isTTY === true);
  const hidden = io.hidden ?? askHidden;
  const ask = io.ask ?? ((q: string) => askTerminal(q, io.signal));
  const now = (io.now ?? Date.now)();
  const before = readJoined(io.home, host);
  const record = before?.record ?? (await recordName(call, to));
  const kept = await sealedGet(call, host, SYNC_KEY);
  if (isFail(kept)) return fail(kept);

  /* ── joined already: nothing to do, or the copy the record lost put back ── */
  if (before !== null) {
    const held = await store.read(syncKeyItem(record));
    const mine = held.ok ? keyFromText(held.value) : null;
    if (mine !== null && kept !== null) {
      io.out(`This machine has joined setup sync on ${host} already, as ${oneLine(before.machine)}. braindog sync push seals what it carries.`);
      return 0;
    }
    if (mine !== null) {
      if (!terminal) {
        io.say(`The sync key's copy is gone from ${host}. Run braindog sync join at a terminal on this machine, which holds the key, to put it back.`);
        return 1;
      }
      io.out(`The sync key's copy is gone from ${host}, and this machine holds the key, so it puts the copy back. Choose the passphrase a new machine joins with: the one you had, or a new one.`);
      const passphrase = await newPassphrase(io, hidden);
      if (passphrase === null) return 1;
      const back = await putCopy(call, host, mine, passphrase, record);
      if (isFail(back)) return fail(back);
      if (!back) {
        io.say('Another machine put a copy back at the same moment, so this one left it. Join a new machine with the passphrase chosen there.');
        return 1;
      }
      io.out('The copy is back. A new machine joins with the passphrase you just chose.');
      return 0;
    }
  }

  /* ── the name ── */
  let machine = values.name?.trim() ?? before?.machine;
  if (machine === undefined) {
    const offered = await deviceName(io.env, host, platform);
    const typed = terminal ? await (io.line ?? ((q: string) => askLine(q, io.signal)))(`Name this machine [${offered}]: `) : null;
    machine = typed === null || typed === '' ? offered : typed;
  }
  if (!MACHINE_NAME.test(machine)) {
    io.say('A machine is named in one line of at most 64 characters, starting with a letter or a digit: letters, digits, spaces and . _ - ( ) only.');
    return 1;
  }
  const slug = slugOf(machine);
  const files = await sealedList(call, host);
  if (isFail(files)) return fail(files);
  const sends = bundlesIn(files.filter((f) => f.complete)).has(slug);

  /* ── the key: made here, or opened with the passphrase ── */
  let key: Buffer | null = null;
  let first = false;
  if (kept === null) {
    if (files.length > 0 && values['new-key'] !== true) {
      io.say(
        `${host} holds ${count(files.length, 'sealed file', 'sealed files')} but not the sync key's copy, so a new key would open none of them. Run braindog sync join on a machine that joined before: it puts the copy back. If no machine holds the key any more, join with --new-key, and what was sealed before stays unreadable.`,
      );
      return 1;
    }
    if (!terminal) {
      io.say('Making the sync key asks for a new sync passphrase at a terminal. Run braindog sync join at one.');
      return 1;
    }
    io.out(`No machine has joined setup sync on ${host} yet, so this one makes the sync key.`);
    io.out('Choose a sync passphrase. A new machine needs it to join, and it never leaves your machines. A short sentence you will remember is better than a short password.');
    const passphrase = await newPassphrase(io, hidden);
    if (passphrase === null) {
      io.say('Nothing was made.');
      return 1;
    }
    /* ASKED AGAIN NOW, after the minutes a passphrase can take, so a machine that made one meanwhile is not overwritten. */
    const meanwhile = await sealedGet(call, host, SYNC_KEY);
    if (isFail(meanwhile)) return fail(meanwhile);
    if (meanwhile !== null) {
      io.say('Another machine made the sync key while you typed, so this one made none. Run braindog sync join again, with the passphrase chosen there.');
      return 1;
    }
    const made = newSyncKey();
    const put = await putCopy(call, host, made, passphrase, record);
    if (isFail(put)) return fail(put);
    if (!put) {
      io.say('Another machine made the sync key at the same moment, so this one keeps none. Run braindog sync join again, with the passphrase chosen there.');
      return 1;
    }
    key = made;
    first = true;
  } else {
    const copy = readWrapped(safeJson(kept));
    if (copy === null) {
      io.say("The sync key's copy in BrainDog is not one this command reads. Run braindog update, then join again.");
      return 1;
    }
    if (!terminal) {
      io.say('Joining asks for the sync passphrase at a terminal. Run braindog sync join at one.');
      return 1;
    }
    for (let tries = 0; tries < TRIES && key === null; tries++) {
      const typed = await hidden('Sync passphrase: ');
      if (typed === null) return 1;
      key = unwrapKey(copy, typed, record);
      if (key === null) io.say(tries + 1 < TRIES ? 'That passphrase does not open the sync key. Try again.' : 'That passphrase does not open the sync key, so this machine did not join.');
    }
    if (key === null) return 1;
    /* A RETIRED NAME IS NEVER JOINED AGAIN, and one another machine sends under is taken only on a yes. */
    const retired = await retiredMachines(call, host, key);
    if (isFail(retired)) return fail(retired);
    const was = retired.get(slug);
    if (was !== undefined) {
      io.say(`${oneLine(machine)} was retired on ${saidDay(was.at)}, and a retired name is never used again. Join under another with --name <name>.`);
      return 1;
    }
    if (sends && (before === null || slugOf(before.machine) !== slug) && (await ask(`${machine} already sends bundles to this BrainDog. Is this that machine, set up again? [y/N] `)) !== true) {
      io.say('Then this machine needs a name of its own. Join again with --name <name>.');
      return 1;
    }
  }

  const put = await store.write(syncKeyItem(record), keyText(key));
  if (!put.ok) {
    io.say(`${put.why} The sync key could not be kept on this machine, so it did not join.${first ? ' Its copy is in BrainDog, so join again once that works, with the passphrase you chose.' : ''}`);
    return 1;
  }
  /* A NEW NAME STARTS A NEW NOTE: the last bundle and the day claimed were the old name's. What was placed here stays. */
  const note: Joined =
    before !== null && slugOf(before.machine) === slug
      ? { ...before, record, machine }
      : { record, machine, joined: new Date(now).toISOString(), ...(before?.placed === undefined ? {} : { placed: before.placed }) };
  keepJoined(io.home, host, note);
  io.out(`Joined setup sync on ${host} as ${oneLine(machine)}. The sync key is kept in ${store.name} on this machine.`);
  if (first)
    io.out('Lose the sync passphrase and every machine that holds the key, and nothing sealed can be opened again, by you or by anybody. Keep the passphrase somewhere other than these machines.');
  io.out('braindog sync push seals what this machine carries, and braindog sync pull places what another machine sent.');
  return 0;
}

/* ── retire ────────────────────────────────────────────────────────────── */

const RETIRE_USAGE = 'braindog sync retire takes the name of one machine, --yes and --host <host>, as in braindog sync retire "Old laptop".';

const sameMachine = (a: unknown, b: string): boolean => typeof a === 'string' && slugOf(a) === slugOf(b);
const stateOf = (row: Row): string | null => row.state ?? (typeof row.fields.state === 'string' ? row.fields.state : null);

const isFile = (path: string): boolean => {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
};

/**
 * `braindog sync retire <machine> [--yes] [--host <host>]`, and its exit: 0 once it is retired, 1 for anything that
 * stopped it, 3 when the record did not answer. At a terminal it asks first; with none, `--yes` says it.
 */
export async function syncRetire(args: string[], io: SyncIo): Promise<number> {
  let parsed: { values: { yes?: boolean | undefined; host?: string | undefined }; positionals: string[] };
  try {
    parsed = parseArgs({ args, strict: true, allowPositionals: true, options: { yes: { type: 'boolean' }, host: { type: 'string' } } });
  } catch {
    io.say(RETIRE_USAGE);
    return 1;
  }
  const [named, ...more] = parsed.positionals;
  const machine = named?.trim() ?? '';
  if (more.length > 0 || machine === '') {
    io.say(RETIRE_USAGE);
    return 1;
  }
  if (!MACHINE_NAME.test(machine)) {
    io.say('No machine is named that way: a name is one line of at most 64 characters, starting with a letter or a digit.');
    return 1;
  }
  const r = await ready(io, parsed.values.host, 'retire');
  if (typeof r === 'number') return r;
  const fail = (f: Fail) => {
    io.say(f.said);
    return exitOf(f);
  };
  const slug = slugOf(machine);
  const name = oneLine(machine);
  const was = r.retired.get(slug);
  if (was !== undefined) {
    io.out(`${name} was retired on ${saidDay(was.at)} already.`);
    return 0;
  }
  const here = slug === slugOf(r.joined.machine);
  const files = await sealedList(r.call, r.to.key, 'bundle/');
  if (isFail(files)) return fail(files);
  const known = here || bundlesIn(files).has(slug);
  const terminal = io.terminal ?? (process.stdin.isTTY === true && process.stderr.isTTY === true);
  const ask = io.ask ?? ((q: string) => askTerminal(q, io.signal));
  if (parsed.values.yes !== true) {
    if (!terminal) {
      io.say('Retiring a machine asks at a terminal first. With no terminal, say --yes.');
      return 1;
    }
    const question = `Retire ${name}${here ? ', this machine' : ''}? It sends and places nothing more, ${here ? 'its sync key is removed now' : 'its sync key is removed the next time it runs braindog'}, and the tool sign-ins it carried may then move to another machine.${known ? '' : ' No bundle from it is kept here.'} [y/N] `;
    if ((await ask(question)) !== true) {
      io.out('Nothing was retired.');
      return 1;
    }
  }
  const at = new Date((io.now ?? Date.now)()).toISOString();
  const key = retiredKey(slug);
  const put = await sealedPut(r.call, r.to.key, key, seal(r.key, key, Buffer.from(JSON.stringify({ machine, slug, at, by: r.joined.machine }), 'utf8')));
  if (put !== true) return fail(put);

  /* ITS ENTRIES IN BUNDLES MARKED RETIRED, or one entry made to say so. The sealed note is what every verb believes. */
  const bundles = r.lists.bundles;
  if (bundles !== null) {
    const rows = await rowsOf(r.call, bundles.id, r.to.key);
    const wrote: Wrote[] = [];
    if (!isFail(rows)) {
      const its = rows.filter((row) => sameMachine(row.fields.host, machine) && stateOf(row) === 'latest');
      for (const row of its) wrote.push(await updateRow(r.call, bundles, row, { state: 'retired', heard: at }, r.to.key));
      if (its.length === 0) wrote.push(await createRow(r.call, bundles, { host: machine, at, heard: at, rows: [], sealed: [], files: 0, size: 0, kept: 'whole', state: 'retired' }, r.to.key));
    }
    const missed = isFail(rows) ? rows : wrote.find(isFail);
    if (missed !== undefined) io.out(`Bundles does not say so yet: ${missed.said} The retirement itself is sealed and kept.`);
    else if (wrote.includes('asked')) io.out('Your BrainDog asked you about the Bundles entry on Decide. The retirement itself is sealed and kept.');
  }
  io.out(`Retired ${name}. It sends and places nothing more, and the tool sign-ins it carried may now move to another machine with braindog sync pull.`);
  if (!here) return 0;

  /* ── this machine: its key goes now, and its tool sign-ins on a yes ── */
  const gone = await r.store.remove(syncKeyItem(r.joined.record));
  keepJoined(io.home, r.to.key, null);
  io.out(gone.ok ? `This machine's sync key is gone from ${r.store.name}.` : `${gone.why} Remove the sync key from ${r.store.name} by hand.`);
  const raw = await rowsOf(r.call, r.lists.carry.id, r.to.key);
  const signIns = isFail(raw) ? [] : raw.map(carryRowOf).filter((c): c is CarryRow => c !== null && c.kind === 'sign_ins');
  for (const c of signIns) {
    const placed = placeOf(c, r.system, { home: io.home, env: io.env, apps: r.apps });
    if (!('place' in placed)) continue;
    const place = placed.place;
    if (place.kind === 'path' && !isFile(place.path)) continue;
    const where = place.kind === 'keychain' ? `the Keychain item ${place.item.service}` : oneLine(shown(place.path, io.home));
    if (!terminal) {
      io.out(`The tool sign-ins at ${where} stay on this machine: remove them at a terminal, so it holds none of their refresh tokens.`);
      continue;
    }
    if ((await ask(`Remove the tool sign-ins at ${where} from this machine, so it holds none of their refresh tokens? [y/N] `)) !== true) continue;
    if (place.kind === 'keychain') {
      const out = await r.store.remove(place.item);
      io.out(out.ok ? `Removed the tool sign-ins at ${where}.` : out.why);
    } else
      try {
        unlinkSync(place.path);
        io.out(`Removed the tool sign-ins at ${where}.`);
      } catch {
        io.out(`${where} could not be removed. Remove it by hand.`);
      }
  }
  io.out('Each app here keeps its own copy of the sign-ins it uses, which BrainDog never opens: sign out of each tool in the app on this machine, or stop using the app here.');
  return 0;
}
