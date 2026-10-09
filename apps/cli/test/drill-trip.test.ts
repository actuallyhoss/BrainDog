/**
 * `apps/cli/scripts/drill-trip.mjs`: the round trip the restore drill runs on the record it has just put back.
 *
 * THE COPY IS MADE HERE, WITH THE REAL COMMAND. `braindog init` writes a data directory the way a host does (a record,
 * its Directory, its root key and a vault), and the kernel then gives it a list, two entries and one push address, so
 * every step has something real to find or to leave out. The trip then runs `braindog serve`, `export`, `import` and
 * `init --from` against a copy of that folder, as it does on the drill's restored record.
 *
 * EACH STEP IS PLANTED RED ONCE. The trip takes the `braindog` entry it runs as `main`, so a plant is a small entry
 * written here that runs the real one and breaks exactly one thing a step is there to catch: a second export a byte
 * off, a "keys left out" copy that carries one, an import that says nothing, a fresh record with its search index gone.
 * A step that stays green under its own plant is a step that cannot fail.
 *
 * COUNTS ONLY. Every line the trip says is checked for the values the copy holds: no entry's words, no address, no id,
 * no folder.
 */

import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openRecord } from '@braindog/kernel';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const TRIP = fileURLToPath(new URL('../scripts/drill-trip.mjs', import.meta.url));
const PUSH = 'https://push.example.net/send/planted-endpoint-7f3a';
const WORDS = ['Kiln firing', 'Wheel throwing'];

type Step = { name: string; pass: boolean; said: string };
type Trip = { pass: boolean; steps: Step[] };
const { roundTrip } = (await import(TRIP)) as { roundTrip: (data: string, o: { main: string }) => Promise<Trip> };

const scratch = mkdtempSync(join(tmpdir(), 'braindog-trip-test-'));
const template = join(scratch, 'template');
let owner = '';
let recordId = '';
let kekId = '';

/** The env a host is started with here: his shell's settings left out, so the folder made here is the only record. */
function hostEnv(data: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, BRAINDOG_DATA: data, XDG_CONFIG_HOME: join(scratch, 'config') };
  for (const name of ['BRAINDOG_TOKEN', 'BRAINDOG_HOST', 'BRAINDOG_KEK_FILE', 'BRAINDOG_OWNER', 'BRAINDOG_FILE']) delete env[name];
  return env;
}

before(async () => {
  const made = spawnSync(process.execPath, [MAIN, 'init', 'studio', '--owner', 'ada@example.com'], { encoding: 'utf8', cwd: scratch, env: hostEnv(template) });
  assert.equal(made.status, 0, made.stderr);
  const sql = openSqlite(join(template, 'studio', 'record.brain'));
  try {
    const k = await openRecord(sql, { now: () => Date.now() });
    owner = String(sql.one<{ id: string }>('SELECT id FROM person')?.id);
    recordId = String(sql.one<{ id: string }>('SELECT id FROM record')?.id);
    kekId = String(sql.one<{ kek_id: string }>('SELECT kek_id FROM vault_key LIMIT 1')?.kek_id ?? '');
    const things = { id: 'register.things', kind: 'register' as const, body: { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never };
    assert.ok((await k.install([things])).ok);
    for (const name of WORDS) assert.ok(k.create('things', { name }, { actor: owner }).ok);
    sql.exec(
      "INSERT INTO push_sub (id, person_id, endpoint, p256dh, auth, created_at) VALUES ('01JZPUSH0000000000000000AA', ?, ?, 'planted-key', 'planted-auth', '2026-10-09T00:00:00Z')",
      owner,
      PUSH,
    );
  } finally {
    sql.close();
  }
});

process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));

/** A copy of the made folder for one run, so no run sees another's writes. */
function copyOf(name: string): string {
  const data = join(scratch, name, 'data');
  cpSync(template, data, { recursive: true });
  return data;
}

/** Every value the copy holds that a line must never carry. */
function assertCountsOnly(trip: Trip): void {
  for (const s of trip.steps)
    for (const value of [PUSH, ...WORDS, 'ada@', owner, recordId, kekId, scratch, tmpdir()].filter(Boolean))
      assert.ok(!s.said.includes(value), `${s.name} said a value: ${s.said}`);
}

/**
 * The plants: each one an entry that runs the real `braindog` and breaks one thing, by name of the step that must catch
 * it. `after` runs once the real command has finished, with its arguments, the file it wrote and its stdout; returning
 * a value replaces the stdout and exit code. `instead` answers in place of the real command.
 */
const PLANTS: Record<string, string> = {
  'the same bytes twice': `if (command === 'export' && out && bump() === 2) edit(out, (t) => t.replace(${JSON.stringify(WORDS[0])}, 'Kiln firinG'));`,
  'the keys left out': `if (command === 'export' && out && args.includes('--redact-grants')) edit(out, (t) => t.replace(/(#table vault_key [^\\n]*\\n)/, '$1["planted"]\\n'));`,
  'the local tables stay home': `if (command === 'export' && out && bump() === 1) edit(out, (t) => t + '#table push_sub id\\n');`,
  'the push addresses stay home': `if (command === 'export' && out && bump() === 1) edit(out, (t) => t + ${JSON.stringify(PUSH)} + '\\n');`,
  'put back in place': `if (command === 'import' && !args.includes('--json')) instead(0, '');`,
  'into a fresh record': `if (command === 'init') instead(1, '');`,
  'one import event': `if (command === 'init') fresh((db) => { for (const n of [1, 2]) db.prepare("INSERT INTO event (id, ts, actor, kind) VALUES (?, '2026-10-09T00:00:00.000Z', 'system', 'import')").run('01JZPLANTED00000000000000' + n); });`,
  'the actors kept': `if (command === 'init') fresh((db) => db.exec("UPDATE event SET actor = 'p_planted' WHERE rowid = (SELECT min(rowid) FROM event)"));`,
  'a search finds an entry': `if (command === 'init') fresh((db) => db.exec('DELETE FROM entry_fts'));`,
  'only into an empty record': `if (command === 'init') fresh((db) => { for (const { table_name } of db.prepare("SELECT table_name FROM dog_section WHERE section IN ('data', 'origin', 'governance') AND table_name <> 'migration'").all()) db.exec('DELETE FROM ' + table_name); });`,
  'a newer copy refused': `if (command === 'import' && args.includes('newer.brainl')) instead(0, '{"ok":true,"value":{}}');`,
  'a changed byte refused': `if (command === 'import' && args.includes('changed.brainl')) instead(0, '{"ok":true,"value":{}}');`,
};

/** The planted entry, written beside the copy it runs on. */
function planted(dir: string, name: string): string {
  const file = join(dir, 'planted.mjs');
  /* AN EXPORT IS BROKEN AFTER THE REAL ONE HAS WRITTEN ITS FILE; everything else is answered or set up before. */
  const afterwards = PLANTS[name]!.startsWith("if (command === 'export'");
  writeFileSync(
    file,
    `import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const REAL = ${JSON.stringify(MAIN)};
const COUNT = ${JSON.stringify(join(dir, 'exports'))};
const args = process.argv.slice(2);
const [command] = args;
if (command === 'serve') await import(REAL);
else {
  const o = args.indexOf('-o');
  const out = o >= 0 ? resolve(args[o + 1]) : null;
  const bump = () => { const n = (existsSync(COUNT) ? Number(readFileSync(COUNT, 'utf8')) : 0) + 1; writeFileSync(COUNT, String(n)); return n; };
  const edit = (f, fn) => existsSync(f) && writeFileSync(f, fn(readFileSync(f, 'utf8')));
  let answered = null;
  const instead = (code, stdout) => { answered = { code, stdout }; };
  const later = [];
  const fresh = (fn) => later.push(() => { const db = new DatabaseSync(join(process.env.BRAINDOG_DATA, 'trip', 'record.brain')); try { fn(db); } finally { db.close(); } });
  ${afterwards ? '' : PLANTS[name]}
  if (answered) { process.stdout.write(answered.stdout); process.exitCode = answered.code; }
  else {
    const ran = spawnSync(process.execPath, [REAL, ...args], { encoding: 'utf8' });
    if (ran.status === 0) for (const f of later) f();
    ${afterwards ? PLANTS[name] : ''}
    process.stdout.write(ran.stdout ?? ''); process.stderr.write(ran.stderr ?? ''); process.exitCode = ran.status ?? 1;
  }
}
`,
  );
  return file;
}

test('A HEALTHY COPY GOES ROUND: the same bytes, the keys and the local tables left out, put back, opened fresh and searched, and both bad copies refused', async () => {
  const trip = await roundTrip(copyOf('healthy'), { main: MAIN });
  const by = new Map(trip.steps.map((s) => [s.name, s]));
  assert.deepEqual([...by.keys()], Object.keys(PLANTS), 'the trip did not take every step, in order');
  /* EVERY STEP BUT ONE. The kernel writes no `import` event today, on either path (`kernel.import`, "NO EVENT IS
     WRITTEN FOR THE REPLACE", and nothing on the empty path either), so that step says 0 and is red until it does. */
  for (const s of trip.steps) if (s.name !== 'one import event') assert.ok(s.pass, `${s.name}: ${s.said}`);
  assert.match(by.get('one import event')!.said, /^\d+ import events? in the fresh record/);
  assert.match(by.get('the push addresses stay home')!.said, /carries 0 of the record's 1 push address/);
  assert.match(by.get('the keys left out')!.said, /0 key rows and 0 sealed credentials, where the full copy carries 3/);
  assert.match(by.get('a search finds an entry')!.said, /found 1 entry/);
  assertCountsOnly(trip);
});

test('THE WHOLE TRIP PASSES on a healthy copy', async () => {
  const trip = await roundTrip(copyOf('whole'), { main: MAIN });
  assert.ok(trip.pass, trip.steps.filter((s) => !s.pass).map((s) => `${s.name}: ${s.said}`).join('\n'));
});

test('EACH STEP, PLANTED RED ONCE, GOES RED', { concurrency: 4 }, async (t) => {
  await Promise.all(
    Object.keys(PLANTS).map((name) =>
      t.test(name, async () => {
        const data = copyOf(`plant-${Object.keys(PLANTS).indexOf(name)}`);
        const trip = await roundTrip(data, { main: planted(join(data, '..'), name) });
        const s = trip.steps.find((x) => x.name === name);
        assert.ok(s, `${name} was not reached: ${JSON.stringify(trip.steps)}`);
        assert.equal(s.pass, false, `${name} stayed green under its own plant: ${s.said}`);
        /* RED FOR ITS OWN REASON, not because a step before it fell over. */
        assert.doesNotMatch(s.said, /^not reached/, `${name} was red only because an earlier step was`);
        assert.equal(trip.pass, false);
        assertCountsOnly(trip);
      }),
    ),
  );
});

test('A FOLDER WITH NO RECORD IN IT IS ONE RED LINE, not a throw', async () => {
  const trip = await roundTrip(join(scratch, 'nothing-here'), { main: MAIN });
  assert.equal(trip.pass, false);
  assert.deepEqual(trip.steps, [{ name: 'the restored record', pass: false, said: 'the drill left no one record to take round' }]);
});
