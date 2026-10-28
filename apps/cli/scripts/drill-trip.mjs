/**
 * The round trip, on the record the restore drill has just put back.
 *
 *   import { roundTrip } from './drill-trip.mjs';
 *   const trip = await roundTrip(data, { main: MAIN });   // { pass, steps: [{ name, pass, said }] }
 *
 * WHY IT EXISTS. The drill restored a copy, counted it and stopped, so nothing had ever taken a record out and put it
 * back through the commands a person runs. This does, on the drill's throwaway record and nowhere else:
 *   1. exports it twice and compares the bytes;
 *   2. exports it with the keys left out and counts the sealed rows at zero;
 *   3. reads the full export for the tables that stay on this machine and
 *   4. for the record's push addresses;
 *   5. puts the export back over the record it came from, which is the path `braindog import` takes (it always
 *      replaces, `docs/53-SPEC-OPERATIONS.md` :36, :63, :408), and exports again to the same bytes;
 *   6. opens the export as a second, fresh record with `braindog init --from`, and checks there
 *   7. one `import` event, 8. every event's actor kept, 9. a search that finds an entry, and
 *  10. a second import refused because the record is no longer empty;
 *  11. imports a copy with its format raised by one and 12. one with a byte changed, and expects both refused, with the
 *      record as it was.
 *
 * THE REAL COMMAND, IN A CHILD PROCESS, as the drill runs `verify` and `init`: `main` is the `braindog` entry. Export and
 * import are a host's doors, so the drill's data directory is served by `braindog serve` on a free loopback port with no
 * server key, where a request carrying nothing is the owner and nothing off this machine can reach it. Nightly copies
 * and the add-on registry are switched off for it, and the hosts file the command reads is one made in a scratch folder.
 *
 * COUNTS ONLY. A step says how many, never a value: no row, no word searched for, no address, no id, no path. The
 * scratch folder holds every file the trip writes and goes when it ends, whatever happens.
 *
 * IT WRITES TO THE DRILL'S RECORD, which is a copy in a folder the drill removes: step 5 puts that copy back as itself.
 * Call it after the drill's own count and before its cleanup.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { openKeyStore, recordKeys, unwrap } from '../../selfhost/src/keys.ts';

const RECORD_FILE = 'record.brain';

/** The settings a host or the command would read from his shell, none of which the trip may inherit. */
const UNSET = [
  'BRAINDOG_TOKEN',
  'BRAINDOG_HOST',
  'BRAINDOG_FILE',
  'BRAINDOG_KEK_FILE',
  'BRAINDOG_ORIGIN',
  'BRAINDOG_SESSION_SECRET',
  'BRAINDOG_SMTP_URL',
  'BRAINDOG_MAIL_FROM',
  'BRAINDOG_OUTBOUND',
  'BRAINDOG_TLS_CERT',
  'BRAINDOG_TLS_KEY',
  'BRAINDOG_TRUST_PROXY',
];

/** The one record a drill's data directory holds, as its folder, or `null` when it holds none or more than one. */
function recordIn(data) {
  let found = [];
  try {
    found = readdirSync(data, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(data, d.name, RECORD_FILE)));
  } catch {
    return null;
  }
  return found.length === 1 ? join(data, found[0].name, RECORD_FILE) : null;
}

/** A port nothing holds, asked of the system and let go. */
const freePort = () =>
  new Promise((done, fail) => {
    const s = createServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => done(port));
    });
  });

/** The `Sql` port over `node:sqlite`, as `restore-drill.mjs` builds it, for the fresh record the trip opens. */
function openSql(path) {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...params)),
    all: (text, ...params) => db.prepare(text).all(...params),
    one: (text, ...params) => db.prepare(text).get(...params),
    transactionSync(fn) {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/** The names of every table a file carries a header for. */
const headersOf = (lines) => new Set(lines.filter((l) => l.startsWith('#table ')).map((l) => l.slice('#table '.length).split(' ')[0]));

/** One table of a file, as its columns and its row lines, unparsed. Empty when the file has no such table. */
function tableOf(lines, name) {
  const at = lines.findIndex((l) => l.startsWith(`#table ${name} `) || l === `#table ${name}`);
  if (at < 0) return { columns: [], rows: [] };
  const columns = (lines[at].slice(`#table ${name} `.length).split(' ')[0] ?? '').split(',');
  const rows = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('#')) break;
    if (line.trim() !== '') rows.push(line);
  }
  return { columns, rows };
}

/** A row line read as its array, or an empty one when it is not JSON (a planted or damaged line still counts as a row). */
const cells = (line) => {
  try {
    const v = JSON.parse(line);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** The refusal codes of the one JSON document a `--json` command printed, or none. */
function codesOf(stdout) {
  try {
    const doc = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? '');
    return Array.isArray(doc?.refusals) ? doc.refusals.map((r) => String(r?.code ?? '')) : [];
  } catch {
    return [];
  }
}

/**
 * Where two copies first differ, counting bytes from one, or 0 when they are the same, with the signature's time and
 * the bytes signed over it left out of both. `dog_sig` carries `signed_at`, the time of the act rather than of the
 * content (`brainl.ts`, "THERE IS NO `exported_at`"), so two signed exports of an unchanged record differ in that time
 * and the signature over it, by design. The key that signed is still compared.
 */
function firstDifference(a, b) {
  const [x, y] = [a, b].map((buf) => Buffer.from(unsigned(buf.toString('utf8')), 'utf8'));
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return i + 1;
  return x.length === y.length ? 0 : n + 1;
}

/**
 * A copy's text with each row under `#table dog_sig` cut to the key that signed it: `alg, key_id, public_key` stay,
 * `sig, signed_at` go. A row that is not JSON stays whole, so a damaged signature still differs.
 */
function unsigned(text) {
  let sig = false;
  return text
    .split('\n')
    .map((line) => {
      if (line.startsWith('#')) sig = line.startsWith('#table dog_sig ') || line === '#table dog_sig';
      if (line.startsWith('#') || !sig || line.trim() === '') return line;
      const c = cells(line);
      return c.length === 5 ? JSON.stringify(c.slice(0, 3)) : line;
    })
    .join('\n');
}

const lineCount = (n, one, many) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/**
 * `braindog serve` on the drill's data directory, on loopback with no server key, answered once `/healthz` says so.
 * Its lines are kept and never printed: they name the record's file and the address it serves.
 */
async function serve(main, data, env) {
  const port = await freePort();
  const child = spawn(process.execPath, [main, 'serve'], {
    env: { ...env, BRAINDOG_DATA: data, PORT: String(port), BRAINDOG_BACKUP_AT: 'off', BRAINDOG_KENNEL: 'off' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.resume();
  let exited = null;
  const gone = new Promise((done) => child.once('exit', (code) => done((exited = code ?? 1))));
  const stop = async () => {
    if (exited !== null) return;
    child.kill('SIGTERM');
    await Promise.race([gone, new Promise((done) => setTimeout(done, 10_000).unref())]);
    if (exited === null) child.kill('SIGKILL');
  };
  const origin = `http://127.0.0.1:${port}`;
  const until = Date.now() + 60_000;
  while (Date.now() < until && exited === null) {
    try {
      const res = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { origin, stop, exited: null };
    } catch {
      /* not listening yet */
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  await stop();
  return { origin, stop, exited: exited ?? 'timed out' };
}

/** What the trip reads from the restored record before it is served: counts and handles, never shown. */
function readRestored(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const has = (t) => db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(t) !== undefined;
    const kek = has('vault_key') ? (db.prepare('SELECT kek_id FROM vault_key WHERE kek_id IS NOT NULL LIMIT 1').get()?.kek_id ?? null) : null;
    const local = db.prepare("SELECT table_name FROM dog_section WHERE section = 'local'").all().map((r) => r.table_name);
    const endpoints = has('push_sub') ? db.prepare('SELECT endpoint FROM push_sub').all().map((r) => String(r.endpoint)) : [];
    /* A WORD FROM AN ENTRY THE INDEX HOLDS, so the fresh record's search is asked for something the copy carries. */
    let word = null;
    for (const r of db.prepare('SELECT f.text AS text FROM entry_fts f JOIN entry e ON e.rowid = f.rowid WHERE e.deleted_at IS NULL LIMIT 200').all()) {
      word = /[\p{L}\p{N}]{3,}/u.exec(String(r.text ?? ''))?.[0] ?? null;
      if (word) break;
    }
    return { kek, local, endpoints, word };
  } finally {
    db.close();
  }
}

/**
 * A SIGNING KEY OF THE DRILL'S OWN, when the restored record holds none this data directory's root key can open
 * (drill-fetch-48). A Cloud copy carries either no signing row or one wrapped under the Worker's KEK, so `braindog export`
 * refused every restored Cloud copy with "This file carries no signature" and the drill could never pass. Only the
 * signing row is replaced, in the drill's throwaway copy; the Cloud's key stays with the Cloud. Answers the new key's
 * kek id, or `null` when the copy's own signing key already opens here and nothing was changed.
 */
async function ownSigning(file, data) {
  const kekFile = join(data, 'kek');
  if (!existsSync(kekFile)) return null;
  const db = new DatabaseSync(file);
  try {
    const record = db.prepare('SELECT id FROM record WHERE singleton = 1').get()?.id;
    if (typeof record !== 'string') return null;
    const store = await openKeyStore(kekFile);
    const row = db.prepare("SELECT wrapped, nonce, kek_id, wrapped_by FROM vault_key WHERE purpose = 'signing'").get();
    if (row !== undefined && row.wrapped_by === 'kek' && typeof row.kek_id === 'string') {
      const opened = await unwrap(store, record, 'signing', { wrapped: new Uint8Array(row.wrapped), nonce: new Uint8Array(row.nonce), kek_id: row.kek_id, wrapped_by: 'kek' }).catch(() => null);
      if (opened !== null) {
        opened.fill(0);
        return null;
      }
    }
    const { signing } = await recordKeys(store, record);
    db.exec('BEGIN');
    try {
      db.prepare("DELETE FROM vault_key WHERE purpose = 'signing'").run();
      db.prepare("INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id, salt, rewrapped_at) VALUES ('signing', ?, ?, 'kek', ?, NULL, NULL)").run(signing.wrapped, signing.nonce, signing.kek_id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return signing.kek_id;
  } finally {
    db.close();
  }
}

/** A copy with its first line's format raised by one. */
const raised = (text) => text.replace(/^#dogl (\d+)/, (_, n) => `#dogl ${Number(n) + 1}`);

/**
 * A copy with one letter changed inside the first row of a record's own table, so the table's hash no longer holds.
 * THE LETTER IS INSIDE A STRING, so the row is still well formed and the only thing wrong with the file is the byte:
 * a letter of `null` or `true` changed would be a broken line, refused for that and not for the change.
 */
function changed(text) {
  const lines = text.split('\n');
  let table = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#table ')) table = line.slice('#table '.length).split(' ')[0];
    if (line.startsWith('#') || line.trim() === '' || table.startsWith('dog_')) continue;
    let inside = false;
    for (let p = 0; p < line.length; p++) {
      const ch = line[p];
      if (inside && ch === '\\') p++;
      else if (ch === '"') inside = !inside;
      else if (inside && /[a-z]/i.test(ch)) {
        lines[i] = line.slice(0, p) + (ch === 'a' ? 'b' : 'a') + line.slice(p + 1);
        return lines.join('\n');
      }
    }
  }
  return null;
}

// ─── the trip ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Take the drill's restored record out and back. `data` is the drill's data directory (the one `braindog init drill
 * --from` wrote) and `main` the `braindog` entry it ran. Answers `{ pass, steps: [{ name, pass, said }] }`, and never
 * throws for a step that fails: a failed step is a line.
 */
export async function roundTrip(data, { main }) {
  const steps = [];
  const step = (name, pass, said) => void steps.push({ name, pass: Boolean(pass), said });
  const answer = () => ({ pass: steps.length > 0 && steps.every((s) => s.pass), steps });

  const restored = recordIn(data);
  if (restored === null) {
    step('the restored record', false, 'the drill left no one record to take round');
    return answer();
  }
  const scratch = mkdtempSync(join(tmpdir(), 'braindog-trip-'));
  const env = { ...process.env, XDG_CONFIG_HOME: join(scratch, 'config') };
  for (const name of UNSET) delete env[name];
  mkdirSync(env.XDG_CONFIG_HOME);
  const path = (name) => join(scratch, name);
  const read = (name) => (existsSync(path(name)) ? readFileSync(path(name)) : null);
  const cli = (args, extra = {}) => spawnSync(process.execPath, [main, ...args], { encoding: 'utf8', cwd: scratch, env: { ...env, ...extra }, timeout: 300_000 });
  let host = null;
  try {
    const before = readRestored(restored);
    const own = await ownSigning(restored, data);
    if (own !== null) before.kek = own;
    host = await serve(main, data, env);
    if (host.exited !== null) {
      step('the restored record', false, `braindog serve would not serve it (exit ${host.exited})`);
      return answer();
    }
    const at = ['--host', host.origin];
    const kek = before.kek === null ? [] : ['--kek', before.kek];
    const exportTo = (name, more = kek) => cli(['export', ...more, '-o', name, ...at]);

    // 1 · THE SAME BYTES TWICE ────────────────────────────────────────────────────────────────────────
    const one = exportTo('first.brainl');
    const first = read('first.brainl');
    if (one.status !== 0 || first === null) {
      step('the same bytes twice', false, `braindog export refused the restored record (exit ${one.status})`);
      return answer();
    }
    const two = exportTo('second.brainl');
    const second = read('second.brainl') ?? Buffer.alloc(0);
    const differ = firstDifference(first, second);
    step(
      'the same bytes twice',
      two.status === 0 && differ === 0,
      differ === 0
        ? `two exports, ${lineCount(first.length, 'byte', 'bytes')} each, the same${first.equals(second) ? '' : ' but for the time the signature carries'}${own === null ? '' : "; signed with a key of the drill's own, the Cloud's stays with the Cloud"}`
        : `two exports of ${first.length.toLocaleString('en')} and ${second.length.toLocaleString('en')} bytes differ from byte ${differ.toLocaleString('en')}`,
    );
    const text = first.toString('utf8').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/);

    // 2 · THE KEYS LEFT OUT ─────────────────────────────────────────────────────────────────────────
    const bare = exportTo('shared.brainl', ['--redact-grants']);
    const shared = (read('shared.brainl')?.toString('utf8') ?? '').split(/\r?\n/);
    const sealedIn = (ls) => {
      const g = tableOf(ls, 'grant');
      const at = ['ciphertext', 'nonce', 'prev_ciphertext', 'prev_nonce'].map((c) => g.columns.indexOf(c)).filter((i) => i >= 0);
      return { keys: tableOf(ls, 'vault_key').rows.length, sealed: g.rows.filter((r) => at.some((i) => cells(r)[i] != null)).length };
    };
    const full = sealedIn(lines);
    const left = sealedIn(shared);
    step(
      'the keys left out',
      bare.status === 0 && left.keys === 0 && left.sealed === 0,
      bare.status !== 0
        ? `braindog export --redact-grants refused (exit ${bare.status})`
        : `without keys: ${lineCount(left.keys, 'key row', 'key rows')} and ${lineCount(left.sealed, 'sealed credential', 'sealed credentials')}, where the full copy carries ${full.keys} and ${full.sealed}`,
    );

    // 3 · THE TABLES THAT STAY ON THIS MACHINE ───────────────────────────────────────────────────────
    const carried = headersOf(lines);
    const home = before.local.filter((t) => carried.has(t)).length;
    const ev = tableOf(lines, 'event');
    const kindAt = ev.columns.indexOf('kind');
    const exportsIn = ev.rows.filter((r) => cells(r)[kindAt] === 'export').length;
    step(
      'the local tables stay home',
      before.local.length > 0 && home === 0 && exportsIn === 0,
      `the copy carries ${home} of the ${before.local.length} tables that stay on this machine, and ${lineCount(exportsIn, 'export event', 'export events')}`,
    );

    // 4 · THE PUSH ADDRESSES ─────────────────────────────────────────────────────────────────────────
    const leaked = before.endpoints.filter((e) => e !== '' && text.includes(e)).length;
    step(
      'the push addresses stay home',
      leaked === 0,
      before.endpoints.length === 0
        ? 'the record holds no push address, so the copy has none to carry'
        : `the copy carries ${leaked} of the record's ${lineCount(before.endpoints.length, 'push address', 'push addresses')}`,
    );

    // 5 · PUT BACK IN PLACE, AS `braindog import` ALWAYS DOES ─────────────────────────────────────────
    /* THE PATH THAT WORKS. `braindog import` sends `replace: true` (brainfile.ts `importFile`, and the canary's weekly
       reset, `tools/canary/reset.mjs`), so it puts a record back as itself; the export after it is the proof it is
       whole, because a replace writes nothing of its own into what travels. */
    const back = cli(['import', 'first.brainl', ...at]);
    const put = /: (\d+) tables, ([\d,]+) rows/.exec(back.stdout ?? '');
    const after = exportTo('after.brainl');
    const same = after.status === 0 && firstDifference(first, read('after.brainl') ?? Buffer.alloc(0)) === 0;
    step(
      'put back in place',
      back.status === 0 && put !== null && same,
      back.status !== 0 || put === null
        ? `braindog import did not put the record back (exit ${back.status})`
        : `put back ${put[1]} tables and ${put[2]} rows over the record, and the export after it is ${same ? 'the same bytes' : 'not the same bytes'}`,
    );

    // 6 · INTO A FRESH RECORD ────────────────────────────────────────────────────────────────────────────────────
    /* `braindog init --from` IS HOW A COPY BECOMES A NEW RECORD, because `import` always replaces and a record `init`
       makes is never empty. Its own data directory and its own root key, inside the scratch folder. */
    const fresh = join(scratch, 'fresh');
    const made = cli(['init', 'trip', '--from', path('first.brainl')], { BRAINDOG_DATA: fresh, BRAINDOG_OWNER: '' });
    const freshFile = join(fresh, 'trip', RECORD_FILE);
    /* AND IT OPENS, as a host would open it: a file `init` wrote and the kernel will not read is no fresh record. */
    const sql = made.status === 0 && existsSync(freshFile) ? openSql(freshFile) : null;
    let k = null;
    try {
      k = sql === null ? null : await openRecord(sql, { now: () => Date.now() });
    } catch {
      k = null;
    }
    step(
      'into a fresh record',
      k !== null,
      k !== null ? 'braindog init --from opened the copy as a second record' : sql === null ? `braindog init --from refused the copy (exit ${made.status})` : 'braindog init --from wrote a record that will not open',
    );
    if (k === null) {
      sql?.close();
      const why = 'not reached, because the fresh record did not open';
      for (const name of ['one import event', 'the actors kept', 'a search finds an entry', 'only into an empty record']) step(name, false, why);
    } else {
      try {
        // 7 · ONE IMPORT EVENT ──────────────────────────────────────────────────────────────────────
        /* RED ON TODAY'S KERNEL, AND HONESTLY: `kernel.import` writes no event on either path (measured, 0), while
           `docs/53` §5.5 (b) step 2 says it writes one. The step stays as the requirement reads until the kernel does. */
        const imports = Number(sql.one("SELECT count(*) AS n FROM event WHERE kind = 'import'")?.n ?? 0);
        step('one import event', imports === 1, `${lineCount(imports, 'import event', 'import events')} in the fresh record, where one is right`);

        // 8 · EVERY EVENT KEEPS ITS ACTOR ─────────────────────────────────────────────────────────
        const idAt = ev.columns.indexOf('id');
        const actorAt = ev.columns.indexOf('actor');
        let kept = 0;
        const actors = new Set();
        for (const r of ev.rows) {
          const c = cells(r);
          actors.add(c[actorAt]);
          if (sql.one('SELECT actor FROM event WHERE id = ?', c[idAt])?.actor === c[actorAt]) kept++;
        }
        step(
          'the actors kept',
          ev.rows.length > 0 && kept === ev.rows.length,
          `${kept.toLocaleString('en')} of the copy's ${lineCount(ev.rows.length, 'event', 'events')} kept their actor, ${lineCount(actors.size, 'actor', 'actors')} among them`,
        );

        // 9 · A SEARCH FINDS AN ENTRY ─────────────────────────────────────────────────────────────
        const hits = before.word === null ? 0 : k.search(before.word).length;
        step(
          'a search finds an entry',
          hits > 0,
          before.word === null ? 'the copy holds no entry with a word to search for' : `a search for a word from the copy found ${lineCount(hits, 'entry', 'entries')}`,
        );

        // 10 · ONLY INTO AN EMPTY RECORD ──────────────────────────────────────────────────────────
        const again = await k.import(lines);
        const refusedFull = !again.ok && again.refusal?.code === 'IMPORT_NOT_EMPTY';
        step(
          'only into an empty record',
          refusedFull,
          refusedFull ? 'a second import into the fresh record was refused, because it is no longer empty' : again.ok ? 'a second import into the fresh record was taken' : 'a second import into the fresh record was refused, for another reason than that it holds rows',
        );
      } finally {
        sql.close();
      }
    }

    // 11, 12 · A NEWER COPY AND A CHANGED BYTE, REFUSED ─────────────────────────────────
    writeFileSync(path('newer.brainl'), raised(text), { mode: 0o600 });
    const damaged = changed(text);
    if (damaged !== null) writeFileSync(path('changed.brainl'), damaged, { mode: 0o600 });
    const newer = cli(['import', '--json', 'newer.brainl', ...at]);
    const byte = damaged === null ? null : cli(['import', '--json', 'changed.brainl', ...at]);
    const still = exportTo('still.brainl');
    const untouched = still.status === 0 && firstDifference(first, read('still.brainl') ?? Buffer.alloc(0)) === 0;
    const tail = untouched ? 'and the record is as it was' : 'and the record is not as it was';
    const newerRefused = newer.status !== 0 && codesOf(newer.stdout).includes('FORMAT_NEWER_THAN_READER');
    step('a newer copy refused', newerRefused && untouched, `a copy one format newer was ${newerRefused ? 'refused as newer' : newer.status === 0 ? 'taken' : 'refused for another reason'}, ${tail}`);
    const byteRefused = byte !== null && byte.status !== 0 && codesOf(byte.stdout).some((c) => c === 'CHECKSUM_MISMATCH' || c === 'SIGNATURE_INVALID');
    step(
      'a changed byte refused',
      byteRefused && untouched,
      byte === null ? 'the copy holds no row to change a byte in' : `a copy with one byte changed was ${byteRefused ? 'refused as changed' : byte.status === 0 ? 'taken' : 'refused for another reason'}, ${tail}`,
    );
    return answer();
  } catch (e) {
    step('the trip', false, `stopped: ${e instanceof Error ? e.name : 'an error'}`);
    return answer();
  } finally {
    await host?.stop();
    rmSync(scratch, { recursive: true, force: true });
  }
}
