/**
 * `script`, the ninth kind of declaration: installed, refused where it should be, and fired into one outbox row.
 *
 * `loop/research-shell-scripts.md` Brief 2. THE RECORD NEVER RUNS A SCRIPT. What a due `script` row produces is one
 * `script.run` outbox row naming the script, its version and its input, and nothing else: no entry, no event, no
 * second job. A host leases it and runs the source in a sandbox (Briefs 3 to 5); none of that is in this file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { drainSchedule, egressOf, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const HOUR = 3_600_000;

const SERIES: Declaration = {
  id: 'register.gold_egp',
  kind: 'register',
  body: { id: 'gold_egp', name: 'Gold, EGP', title: 'at', fields: [{ id: 'at', type: 'text', required: true }] } as never,
};

const GOLD = (over: Record<string, unknown> = {}): Declaration =>
  ({
    id: 'script.gold-rate',
    kind: 'script',
    body: {
      script: 'gold-rate',
      title: 'Gold price, 24k, per gram in EGP',
      runs: { every: '1h' },
      egress: ['https://api.goldapi.io'],
      keys: ['goldapi'],
      reads: [],
      writes: ['gold_egp'],
      limits: { cpu_ms: 200, fetches: 5, wall_ms: 15000, writes: 200 },
      source: "export default async function run(ctx) { ctx.log('ok'); }",
      ...over,
    },
  }) as unknown as Declaration;

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([SERIES])).ok);
  return { k, sql };
}

const refusal = async (decl: Declaration) => {
  const { k } = await record();
  const out = await k.install([decl]);
  assert.equal(out.ok, false, `${decl.id} installed and should not have`);
  return (out as { refusal: { code: string; fix: string; at?: string } }).refusal;
};

test('A SCRIPT INSTALLS AS A NINTH KIND, versioned like the other eight', async () => {
  const { k, sql } = await record();
  const out = await k.install([GOLD()]);
  assert.ok(out.ok, fixOf(out));
  const row = sql.one<{ kind: string; version: number }>(
    "SELECT kind, version FROM declaration WHERE id = 'script.gold-rate' AND superseded_at IS NULL AND retired = 0",
  );
  assert.deepEqual({ ...row }, { kind: 'script', version: 1 });
});

test('EVERY 5m IS REFUSED WITH THE FLOOR SENTENCE, as a connector every five minutes is', async () => {
  const r = await refusal(GOLD({ runs: { every: '5m' } }));
  assert.equal(r.code, 'ACTION_INTERVAL_TOO_SHORT');
  assert.match(r.fix, /fifteen minutes/);
  assert.equal(r.at, 'runs.every');
});

test('AN EGRESS OVER http:// IS REFUSED, because the install diff would promise a host the sandbox cannot keep private', async () => {
  const r = await refusal(GOLD({ egress: ['http://api.goldapi.io'] }));
  assert.equal(r.code, 'ACTION_NOT_HTTPS');
  assert.equal(r.at, 'egress[0]');
});

test('AN EGRESS WITH A PLACEHOLDER IS REFUSED, because a host somebody approves has to be written out in full', async () => {
  const r = await refusal(GOLD({ egress: ['https://api.goldapi.io', 'https://{row.host}'] }));
  assert.equal(r.code, 'ACTION_HOST_COMPUTED');
  assert.equal(r.at, 'egress[1]');
});

test('AN EGRESS WITH A PATH IS REFUSED: an origin is compared as an origin, so a path would be a promise nothing keeps', async () => {
  const r = await refusal(GOLD({ egress: ['https://api.goldapi.io/api/XAU'] }));
  assert.equal(r.code, 'ACTION_HOST_COMPUTED');
});

test('A HEADER KEY NOTHING READS IS REFUSED, because a sandbox header is read as a promise about what is enforced', async () => {
  const r = await refusal(GOLD({ network: 'none' }));
  assert.equal(r.code, 'DECLARATION_INVALID');
  assert.equal(r.at, 'network');
});

test('BUT `pack:` IS READ, by the record, so a script a first-party pack owns through its body still installs', async () => {
  const { k, sql } = await record();
  const out = await k.install([GOLD({ pack: 'money' })]);
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(k.packStates().find((p) => p.id === 'money')?.id, 'money');
  sql.close();
});

test("THE VAULT'S spark KEY IS REFUSED AT INSTALL, with a sentence, so the owner is never asked to approve sending it", async () => {
  const r = await refusal(GOLD({ keys: ['goldapi', 'spark'] }));
  assert.equal(r.code, 'FORBIDDEN');
  assert.equal(r.at, 'keys[1]');
  assert.match(r.fix, /"spark" key/);
  assert.match(r.fix, /included model/);
  /* A LABEL THAT ONLY STARTS WITH IT IS SOMEBODY'S OWN KEY, and installs. */
  const { k, sql } = await record();
  assert.ok((await k.install([GOLD({ keys: ['sparkpost'] })])).ok);
  sql.close();
});

test('THE EGRESS IS PRINTED FROM THE SCRIPT BODY, with every origin and every key, so the review sees what a run can reach', () => {
  const e = egressOf(GOLD({ reads: ['obligations'] }).body);
  assert.ok(e, 'a script that fetches has egress');
  assert.equal(e.channel, 'script');
  assert.equal(e.host, 'api.goldapi.io');
  assert.equal(e.key, 'goldapi');
  assert.equal(e.line, 'CALLS OUT api.goldapi.io · every 1h · key "goldapi"');
  assert.equal(e.key_line, 'gold-rate reads obligations and may send what it reads to api.goldapi.io.');
  assert.equal(egressOf(GOLD({ egress: [] }).body), null, 'a script that fetches nothing calls nothing out');
});

test('A DUE SCRIPT ROW WRITES ONE script.run OUTBOX ROW AND NOTHING ELSE, and re-arms an hour on', async () => {
  const { fireScript, activeScript, scriptDeps } = await import('../src/script.ts');
  const { k, sql } = await record();
  assert.ok((await k.install([GOLD()])).ok);
  sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_script', ?, 'script', 'gold-rate', ?, 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, state = 'pending'`,
    new Date(NOW).toISOString(),
    JSON.stringify({ script: 'gold-rate' }),
  );

  const tables = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((t) => t.name);
  const count = () => Object.fromEntries(tables.map((t) => [t, sql.one<{ n: number }>(`SELECT count(*) AS n FROM "${t}"`)?.n ?? 0]));
  const before = count();

  let n = 0;
  const mint = () => `01KSCR1PT0000000000000000${(++n).toString(36).toUpperCase()}`;
  const deps = scriptDeps(sql, { recordId: ID, nowMs: NOW, mint });
  /* THE ARM `index.ts` WILL CARRY, applied here: the handler map is an argument to the drain, so the test hands it the
     same one line the kernel's `HANDLERS` will. */
  const drained = drainSchedule(sql, { mint, allocate: () => 1, nowMs: NOW }, { script: (row) => fireScript(deps, row, activeScript(sql, row.key)) });
  assert.deepEqual({ claimed: drained.claimed, done: drained.done, failed: drained.failed }, { claimed: 1, done: 1, failed: 0 });

  const after = count();
  const moved = tables.filter((t) => after[t] !== before[t]);
  assert.deepEqual(moved, ['outbox'], 'only the outbox gained a row');
  assert.equal(after.outbox! - before.outbox!, 1);

  const job = sql.one<{ kind: string; payload: string; state: string }>('SELECT kind, payload, state FROM outbox');
  assert.equal(job?.kind, 'script.run');
  assert.equal(job?.state, 'pending');
  assert.deepEqual(JSON.parse(job!.payload), { script: 'gold-rate', version: 1, input: null });

  const next = sql.one<{ due_at: string; state: string }>("SELECT due_at, state FROM schedule WHERE kind = 'script' AND key = 'gold-rate'");
  assert.equal(next?.state, 'pending');
  const at = Date.parse(next!.due_at);
  assert.ok(at >= NOW + HOUR && at < NOW + HOUR + 15 * 60_000, `re-armed at ${next!.due_at}, an hour and a jitter on`);

  /* AND A SECOND FIRE WHILE THE FIRST RUN IS STILL QUEUED QUEUES NOTHING, as `pull` learned the hard way. */
  sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script'", new Date(NOW).toISOString());
  drainSchedule(sql, { mint, allocate: () => 1, nowMs: NOW }, { script: (row) => fireScript(deps, row, activeScript(sql, row.key)) });
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'script.run'")?.n, 1);
});

/* THE CHECKER'S TWO, added because the test above passed with the fired version hard-coded to 1 and with `failed`
   dropped from the busy states: both mutations were run and neither went red. */
test('A RUN IS QUEUED UNDER THE VERSION ACTIVE WHEN IT FIRES, and a failed run still holds the next one back', async () => {
  const { fireScript, activeScript, scriptDeps } = await import('../src/script.ts');
  const { k, sql } = await record();
  assert.ok((await k.install([GOLD()])).ok);
  const two = await k.install([GOLD({ title: 'Gold price, 21k, per gram in EGP' })]);
  assert.ok(two.ok, fixOf(two));

  let n = 0;
  const mint = () => `01KSCR1PTV000000000000000${(++n).toString(36).toUpperCase()}`;
  const deps = scriptDeps(sql, { recordId: ID, nowMs: NOW, mint });
  const armed = activeScript(sql, 'gold-rate');
  assert.equal(armed?.version, 2);
  fireScript(deps, { id: 's_v', key: 'gold-rate' }, armed);
  const job = sql.one<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run'");
  assert.equal((JSON.parse(job!.payload) as { version: number }).version, 2);

  sql.exec("UPDATE outbox SET state = 'failed' WHERE kind = 'script.run'");
  fireScript(deps, { id: 's_v', key: 'gold-rate' }, armed);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'script.run'")?.n, 1, 'a failed run is retried by the ladder, not queued twice');

  sql.exec("UPDATE outbox SET state = 'dead' WHERE kind = 'script.run'");
  fireScript(deps, { id: 's_v', key: 'gold-rate' }, armed);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'script.run'")?.n, 2, 'a dead run leaves the script idle');
});

test('A SCRIPT WHOSE DECLARATION IS RETIRED ENDS ITS ROW and queues nothing', async () => {
  const { fireScript, activeScript, scriptDeps } = await import('../src/script.ts');
  const { k, sql } = await record();
  assert.ok((await k.install([GOLD()])).ok);
  sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'script.gold-rate'");
  sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_gone', ?, 'script', 'gold-rate', ?, 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, state = 'pending'`,
    new Date(NOW).toISOString(),
    JSON.stringify({ script: 'gold-rate' }),
  );
  const mint = () => '01KSCR1PT000000000000000ZZ';
  const deps = scriptDeps(sql, { recordId: ID, nowMs: NOW, mint });
  drainSchedule(sql, { mint, allocate: () => 1, nowMs: NOW }, { script: (row) => fireScript(deps, row, activeScript(sql, row.key)) });
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM outbox')?.n, 0);
  assert.equal(sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script'")?.state, 'done');
});
