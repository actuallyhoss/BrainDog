/**
 * A script's run, held to what its declaration allows: three cases, each first reproduced here as it was measured.
 *
 * THE SANDBOX IS A STAND-IN FUNCTION, as in `script-run.test.ts`, and that is the point of all three: what a host hands
 * back is a request, and every case below is a request the record must answer correctly whatever ran the source. The
 * harness is copied rather than imported because importing a test file runs its tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { ack, enqueue, lease, type AckDeps } from '../src/outbox.ts';
import { finishScript, prepareScript, WRITES_CEILING, type ScriptAnswer, type ScriptRunDeps, type ScriptWrite, type Scripted } from '../src/script-run.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const GOLD_EGP: Declaration = {
  id: 'register.gold_egp',
  kind: 'register',
  body: {
    id: 'gold_egp',
    name: 'Gold, EGP',
    title: 'at',
    fields: [
      { id: 'at', type: 'text', required: true },
      { id: 'value', type: 'int' },
    ],
  } as never,
};

const gold = (extra: Record<string, unknown> = {}): Declaration => ({
  id: 'script.gold-rate',
  kind: 'script',
  body: {
    script: 'gold-rate',
    runs: { every: '1h' },
    egress: ['https://api.goldapi.io'],
    keys: [],
    reads: [],
    writes: ['gold_egp'],
    source: 'export default async function run(ctx) {}',
    ...extra,
  } as never,
});

const USAGE = { fetches: 1, bytes: 120, wall_ms: 40, cpu_ms: 3 };

type Told = { actor: string; say: string };
type Rec = { k: Kernel; sql: NodeSql; deps: ScriptRunDeps; told: Told[] };

async function record(script: Declaration = gold()): Promise<Rec> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([GOLD_EGP, script]);
  assert.ok(out.ok, fixOf(out));
  let n = 0;
  const mint = () => `01KSCR1PTL1M00000000000${(++n).toString(36).toUpperCase().padStart(3, '0')}`;
  const told: Told[] = [];
  const ackDeps: AckDeps = { mint, allocate: () => 1, nowMs: NOW, recordId: ID };
  const deps: ScriptRunDeps = {
    sql,
    recordId: ID,
    nowMs: NOW,
    mint,
    tz: 'UTC',
    ack: (a) => ack(sql, ackDeps, a),
    notify: (said) => void told.push(said),
    transaction: k.transaction,
    write: (register, ref, patch, w) => k.write(register, ref, patch as never, w),
    registerOf: (spoken) => k.get(spoken)?.register ?? null,
  };
  return { k, sql, deps, told };
}

/** Queue and lease one run the way `fireScript` and the pass do, pinned to `version`. */
function prepared(r: Rec, version = 1): Scripted {
  enqueue(r.sql, r.deps.mint, NOW, 'script.run', { script: 'gold-rate', version, input: null });
  const [job] = lease(r.sql, { mint: r.deps.mint, allocate: () => 1, nowMs: NOW }, ['script.run'], 1);
  assert.ok(job, 'a queued run is leased');
  const got = prepareScript(r.deps, job);
  assert.ok('scripted' in got, `the run was prepared, not ${JSON.stringify(got)}`);
  return got;
}

const golds = (sql: NodeSql) => sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'gold_egp'")?.n ?? 0;
const state = (sql: NodeSql) => sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = 'gold-rate'")?.state;
const creates = (n: number): ScriptWrite[] =>
  Array.from({ length: n }, (_, i) => ({ op: 'create', register: 'gold_egp', fields: { at: `2026-09-22T${String(i).padStart(5, '0')}`, value: i } }));
const lastSay = (sql: NodeSql) =>
  sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' AND target = 'declaration:script.gold-rate' ORDER BY rowid DESC LIMIT 1")?.note ?? '';

/* ── the count of writes ────────────────────────────────────────────────────── */

test('AN ANSWER WITH MORE WRITES THAN limits.writes WRITES NOTHING, and the sentence names both numbers', async () => {
  const r = await record(gold({ limits: { writes: 2 } }));
  const metered = finishScript(r.deps, prepared(r), { writes: creates(500), log: '', usage: USAGE });
  assert.equal(metered.outcome, 'refused');
  assert.equal(golds(r.sql), 0, '500 rows were measured landing here');
  assert.match(lastSay(r.sql), /500 writes/);
  assert.match(lastSay(r.sql), /its limits\.writes is 2\./);
});

test('AN ANSWER AT limits.writes EXACTLY LANDS, so the check is the declared number and not one below it', async () => {
  const r = await record(gold({ limits: { writes: 2 } }));
  const metered = finishScript(r.deps, prepared(r), { writes: creates(2), log: '', usage: USAGE });
  assert.equal(metered.outcome, 'ok');
  assert.equal(golds(r.sql), 2);
});

test('WITH NO LIMIT DECLARED THE CEILING HOLDS, so one answer cannot hold the record in one long transaction', async () => {
  const r = await record();
  const metered = finishScript(r.deps, prepared(r), { writes: creates(WRITES_CEILING + 1), log: '', usage: USAGE });
  assert.equal(metered.outcome, 'refused');
  assert.equal(golds(r.sql), 0);
  assert.match(lastSay(r.sql), new RegExp(`${WRITES_CEILING + 1} writes`));
});

test('A limits.writes DECLARED ABOVE THE CEILING IS REFUSED AT INSTALL, so it is never approved and then refused at every run', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([GOLD_EGP, gold({ limits: { writes: WRITES_CEILING + 1 } })]);
  assert.equal(out.ok, false);
  assert.equal((out as { refusal: { code: string } }).refusal.code, 'OUT_OF_BOUNDS');
  assert.match(fixOf(out), new RegExp(`limits\\.writes is ${WRITES_CEILING + 1}; the most a script may ask for is ${WRITES_CEILING}\\.`));
  sql.close();
});

/* ── an update with no version ─────────────────────────────────────────────── */

/** One gold row, its spoken id, and its version as a script would have read it. */
function oneRow(r: Rec): { spoken: string; id: string } {
  const made = r.k.create('gold_egp', { at: '2026-09-22T12:00', value: 1 }, { actor: 'p_1' });
  assert.ok(made.ok, fixOf(made));
  const spoken = r.k.nameOf(made.value.id);
  assert.ok(spoken);
  return { spoken, id: made.value.id };
}

test('AN UPDATE WITH NO VERSION LANDS WITHOUT COMPARING, as NaN from the prelude and as null from a host that put it through JSON', async () => {
  for (const none of [Number.NaN, null, undefined]) {
    const r = await record();
    const { spoken, id } = oneRow(r);
    const metered = finishScript(r.deps, prepared(r), {
      writes: [{ op: 'update', spoken, patch: { value: 2 }, version: none as unknown as number }],
      log: '',
      usage: USAGE,
    });
    assert.equal(metered.outcome, 'ok', `version ${String(none)}: ${lastSay(r.sql)}`);
    assert.equal(r.k.get(id)?.fields.value, 2);
    assert.equal(state(r.sql), 'pending');
  }
});

test('AN UPDATE WITH A STALE VERSION IS STILL A CONFLICT, so leaving the version out is the only way to skip the compare', async () => {
  const r = await record();
  const { spoken, id } = oneRow(r);
  assert.ok(r.k.write('gold_egp', id, { value: 5 }, { actor: 'p_1' }).ok);
  const metered = finishScript(r.deps, prepared(r), { writes: [{ op: 'update', spoken, patch: { value: 2 }, version: 1 }], log: '', usage: USAGE });
  assert.equal(metered.outcome, 'refused');
  assert.equal(r.k.get(id)?.fields.value, 5);
});

/* ── what "three refused runs in a row" counts ─────────────────────────────── */

const threw: ScriptAnswer = { refused: { code: null, why: 'TypeError: price_gram_24k is undefined' }, log: '', usage: USAGE };

test('A NEW VERSION STARTS THE COUNT AGAIN: two refusals under v1, and v2 refused once, is not three in a row', async () => {
  const r = await record();
  finishScript(r.deps, prepared(r, 1), threw);
  finishScript(r.deps, prepared(r, 1), threw);
  const fixed = await r.k.install([GOLD_EGP, gold({ source: 'export default async function run(ctx) { ctx.log("fixed"); }' })]);
  assert.ok(fixed.ok, fixOf(fixed));
  assert.equal(r.sql.one<{ version: number }>("SELECT version FROM declaration WHERE id = 'script.gold-rate' AND superseded_at IS NULL")?.version, 2);

  finishScript(r.deps, prepared(r, 2), threw);
  assert.equal(state(r.sql), 'pending', "the owner's fix was measured paused on its first failure");
  assert.equal(r.told.length, 0);

  finishScript(r.deps, prepared(r, 2), threw);
  finishScript(r.deps, prepared(r, 2), threw);
  assert.equal(state(r.sql), 'paused', "v2's own third refusal pauses it");
  assert.equal(r.told.length, 1);
});

test("A V1 RUN STILL QUEUED WHEN V2 LANDS DOES NOT COUNT AGAINST V2, since it ran v1's source", async () => {
  const r = await record();
  const queued = prepared(r, 1);
  const fixed = await r.k.install([GOLD_EGP, gold({ source: 'export default async function run(ctx) { ctx.log("fixed"); }' })]);
  assert.ok(fixed.ok, fixOf(fixed));
  finishScript(r.deps, prepared(r, 2), threw);
  finishScript(r.deps, queued, threw);
  finishScript(r.deps, prepared(r, 2), threw);
  assert.equal(state(r.sql), 'pending');
});

test('A HOST FAILURE, A HOLD OR A DROP BETWEEN REFUSALS IS NOT A RUN, so it neither breaks the streak nor counts in it', async () => {
  const between: [string, ScriptAnswer | { unrun: 'failed' | 'dropped'; say: string; ms: number }][] = [
    ['failed', { unrun: 'failed', say: 'the isolate would not start', ms: 3 }],
    ['held', { held: { until: NOW + 3_600_000, say: 'gold-rate waits for next month.' } }],
    ['dropped', { unrun: 'dropped', say: 'this host has no sandbox.' }],
  ].map(([name, a]) => [name as string, a as never]);
  for (const [name, other] of between) {
    const r = await record();
    for (let i = 1; i <= 3; i++) {
      finishScript(r.deps, prepared(r), threw);
      finishScript(r.deps, prepared(r), other as never);
    }
    assert.equal(state(r.sql), 'paused', `three refusals with a ${name} after each pause the script; six were measured pausing nothing`);
    assert.equal(r.told.length, 1, name);
  }
});

test('A RESUME STILL BREAKS THE STREAK once only runs of the installed version are counted', async () => {
  const { resumeScript } = await import('../src/script-run.ts');
  const r = await record();
  for (let i = 0; i < 3; i++) finishScript(r.deps, prepared(r), threw);
  assert.equal(state(r.sql), 'paused');
  assert.ok(resumeScript(r.deps, 'gold-rate', 'p_1').ok);
  finishScript(r.deps, prepared(r), threw);
  assert.equal(state(r.sql), 'pending', 'one refusal after a resume is one, not four');
});
