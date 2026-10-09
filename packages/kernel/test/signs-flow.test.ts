/**
 * The seven signs of scripts and automations (SHL-D01), each read on a record that should be red and one that should be
 * green, and `automations-idle` never red however many sit idle.
 *
 * THE RECORDS ARE BUILT THROUGH THE KERNEL'S OWN VERBS: scripts and rules installed, rows created, runs drained, and a
 * script's run taken by `runActions` with a stand-in sandbox, which is what a host hands back (`script-chain.test.ts`).
 * One case writes a table itself: a script body with no source, which install refuses, written as a body that lost it.
 *
 * Until `signs.ts` spreads `SIGNS_FLOW`, the readers are called as `readSigns` calls them; the last test reads them
 * through `k.signs()` once they are wired, and is skipped until then.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, VITAL_SIGNS, type Declaration, type Kernel } from '../src/index.ts';
import type { ScriptAnswer, ScriptWrite, Scripted } from '../src/script-run.ts';
import type { SignReading, VitalSign } from '../src/signs.ts';
import { SIGNS_FLOW } from '../src/signs-flow.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ITEMS: Declaration = {
  id: 'register.items',
  kind: 'register',
  body: { id: 'items', name: 'Items', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] } as never,
};

const script = (name: string, title: string): Declaration => ({
  id: `script.${name}`,
  kind: 'script',
  body: { script: name, title, runs: { rule: true }, egress: [], keys: [], reads: ['items'], writes: ['items'], source: 'export default async function run(ctx) {}' } as never,
});

const rule = (name: string, title: string, steps: unknown[], extra: Record<string, unknown> = {}): Declaration => ({
  id: `rule.${name}`,
  kind: 'rule',
  body: { rule: name, name: title, on: { written: { register: 'items', op: ['create'] } }, once_per: ['entry'], steps, ...extra } as never,
});

/** A rule that starts the script `run` on every new item. */
const kick = (run: string): Declaration => rule(`kick_${run.replace(/-/g, '_')}`, `Start ${run}`, [{ script: { id: run, as: 'job' } }]);

/** A rule that asks a person on every new item and waits a day for the answer. */
const ASK = rule('ask_pay', 'Ask to pay', [{ ask_person: { question: 'Pay {{what}} now?', options: ['pay', 'hold'], as: 'answer', wait: '1d' } }]);

/** A rule that notes every new item and is done. */
const NOTE = rule('note_it', 'Note new items', [{ notify: { say: 'New item: {{what}}' } }]);

type Rec = { k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> };

async function record(...decls: Declaration[]): Promise<Rec> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([ITEMS, ...decls]);
  assert.ok(out.ok, fixOf(out));
  return { k, sql, clock };
}

const item = (r: Rec, what: string): void => {
  const made = r.k.create('items', { what }, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
};

const USAGE = { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 };

/** What the stand-in sandbox does for each script: refuse, write nothing, or make a new item every run. */
const BODIES: Record<string, (input: { seq: number }) => ScriptAnswer> = {
  broken: () => ({ refused: { code: null, why: 'TypeError: price is undefined' }, log: '', usage: USAGE }),
  quiet: () => ({ writes: [], log: '', usage: USAGE }),
  spawn: (input) => ({ writes: [{ op: 'create', register: 'items', fields: { what: `echo of ${input.seq}` } } as ScriptWrite], log: '', usage: USAGE }),
};

/** Drain the runs, then let the "host" take every queued script, `rounds` times over. */
async function settle(r: Rec, rounds = 2): Promise<void> {
  const sandbox = async (s: Scripted): Promise<ScriptAnswer> => {
    const body = BODIES[s.scripted.script];
    assert.ok(body, `no body for ${s.scripted.script}`);
    return body(s.scripted.input as { seq: number });
  };
  const execute = (async () => {
    throw new Error('no call is declared here');
  }) as never;
  for (let i = 0; i < rounds; i++) {
    await r.k.drain();
    await r.k.runActions(execute, { script: sandbox, limit: 50 });
  }
}

/** One sign, read as `readSigns` reads it. */
function sign(sql: NodeSql, id: string, at = NOW, tz = 'UTC'): SignReading {
  const s = SIGNS_FLOW.find((x) => x.sign === id);
  assert.ok(s?.read, `${id} is not on the list`);
  const got = s.read(sql, at, tz);
  assert.ok(!/[—]/.test(got.said) && !(got.facts ?? []).some((f) => /[—]/.test(f)), `${id} wrote an em dash: ${got.said}`);
  return got;
}

/** No id a person should not read: no `script.`, `rule.`, `rule:`, ULID or `kick_`-style handle. */
const noIds = (r: SignReading): void => {
  for (const line of [r.said, ...(r.facts ?? [])]) assert.ok(!/\b(?:script|rule)[.:]|[0-9A-HJKMNP-TV-Z]{26}|_[a-z]/.test(line), `an id in ${JSON.stringify(line)}`);
};

test('THE SEVEN, in order, with names and no ids, and an empty record reads none on every one', async () => {
  assert.deepEqual(
    SIGNS_FLOW.map((s) => s.sign),
    ['scripts-paused', 'scripts-refused', 'scripts-sourceless', 'automations-failed', 'automations-parked', 'automations-idle', 'automations-stopped-chains'],
  );
  const r = await record();
  for (const s of SIGNS_FLOW) {
    assert.ok(!/[a-z]+-[a-z]+/.test(s.name), `${s.sign}'s name is an id`);
    assert.equal(s.hand, 'kernel');
    const got = sign(r.sql, s.sign);
    assert.equal(got.state, 'none', `${s.sign} read ${got.state} on an empty record`);
    assert.equal(got.value, null);
  }
  r.sql.close();
});

/* ── scripts ───────────────────────────────────────────────────────────── */

test('SCRIPTS PAUSED: three refused runs pause it and the sign is red with its name; a script that runs well is green', async () => {
  const r = await record(script('broken', 'Gold price'), kick('broken'));
  for (const what of ['One', 'Two']) item(r, what);
  await settle(r);
  assert.equal(sign(r.sql, 'scripts-paused').state, 'green', 'two refusals pause nothing');
  item(r, 'Three');
  await settle(r);
  const red = sign(r.sql, 'scripts-paused');
  assert.equal(red.state, 'red');
  assert.equal(red.value, 1);
  assert.equal(red.said, '1 script is paused: Gold price.');
  noIds(red);
  r.sql.close();

  const g = await record(script('quiet', 'Tidy items'), kick('quiet'));
  item(g, 'One');
  await settle(g);
  const green = sign(g.sql, 'scripts-paused');
  assert.deepEqual([green.state, green.value, green.said], ['green', 0, 'No script is paused.']);
  g.sql.close();
});

test('SCRIPTS REFUSED: red on one refused last run, with its name; green where the last run finished; none before any run', async () => {
  const r = await record(script('broken', 'Gold price'), kick('broken'), script('quiet', 'Tidy items'), kick('quiet'));
  assert.equal(sign(r.sql, 'scripts-refused').state, 'none');
  item(r, 'One');
  await settle(r);
  const red = sign(r.sql, 'scripts-refused');
  assert.equal(red.state, 'red');
  assert.equal(red.value, 1);
  assert.equal(red.said, 'Gold price did not finish its last run.');
  assert.ok(red.facts?.includes('Gold price was refused on 8 October; its log says why.'), red.facts?.join(' | '));
  noIds(red);
  r.sql.close();

  const g = await record(script('quiet', 'Tidy items'), kick('quiet'));
  item(g, 'One');
  await settle(g);
  assert.deepEqual([sign(g.sql, 'scripts-refused').state, sign(g.sql, 'scripts-refused').value], ['green', 0]);
  g.sql.close();
});

test('SCRIPTS SOURCELESS: a live body that lost its source is red with the name; one installed with source is green', async () => {
  const r = await record(script('quiet', 'Tidy items'));
  const green = sign(r.sql, 'scripts-sourceless');
  assert.deepEqual([green.state, green.value], ['green', 0]);
  /* INSTALL REFUSES A SCRIPT WITH NO SOURCE, so the body is written as one an older build or a broken copy left it. */
  r.sql.exec("UPDATE declaration SET body = json_remove(body, '$.source') WHERE id = 'script.quiet'");
  const red = sign(r.sql, 'scripts-sourceless');
  assert.deepEqual([red.state, red.value, red.said], ['red', 1, 'Tidy items holds no source anybody can read.']);
  noIds(red);
  r.sql.close();
});

/* ── automations ───────────────────────────────────────────────────────── */

test('AUTOMATIONS FAILED: a run whose question went unanswered fails and reads red with its name; a run that finished is green', async () => {
  const r = await record(ASK);
  assert.equal(sign(r.sql, 'automations-failed').state, 'none', 'no run this week is nothing to judge by');
  item(r, 'Rent');
  await r.k.drain();
  assert.equal(sign(r.sql, 'automations-failed').state, 'green', 'a run inside its wait has not failed');
  r.clock.advance(DAY + HOUR);
  await r.k.drain();
  const at = r.clock.now();
  const red = sign(r.sql, 'automations-failed', at);
  assert.deepEqual([red.state, red.value, red.said], ['red', 1, '1 automation run failed in 7 days: Ask to pay.']);
  assert.ok(red.facts?.includes('Ask to pay failed once.'), red.facts?.join(' | '));
  noIds(red);
  /* OUT OF THE WEEK, the failure is no longer judged, and with no other run there is nothing to judge by. */
  assert.equal(sign(r.sql, 'automations-failed', at + 7 * DAY + HOUR).state, 'none');
  r.sql.close();

  const g = await record(NOTE);
  item(g, 'Rent');
  await g.k.drain();
  const green = sign(g.sql, 'automations-failed');
  assert.deepEqual([green.state, green.value, green.said], ['green', 0, 'None of 1 run in 7 days failed.']);
  g.sql.close();
});

test('AUTOMATIONS PARKED: a run still waiting on a person an hour past its wake is red; inside its wait, or woken, it is green', async () => {
  const r = await record(ASK);
  item(r, 'Rent');
  await r.k.drain();
  /* The wait is a day. Within the hour after the wake is due the drain may still be coming. */
  assert.deepEqual([sign(r.sql, 'automations-parked', NOW + DAY - HOUR).state, sign(r.sql, 'automations-parked', NOW + DAY - HOUR).value], ['green', 0]);
  assert.equal(sign(r.sql, 'automations-parked', NOW + DAY + HOUR - 60_000).state, 'green');
  const red = sign(r.sql, 'automations-parked', NOW + DAY + HOUR + 60_000);
  assert.deepEqual([red.state, red.value], ['red', 1]);
  assert.equal(red.said, '1 run is still waiting on a person after its wait ended: Ask to pay.');
  assert.ok(red.facts?.includes('Ask to pay asked on 8 October and was never woken.'), red.facts?.join(' | '));
  noIds(red);
  /* WOKEN, the run ends as failed and nothing is parked. */
  r.clock.set(NOW + DAY + 2 * HOUR);
  await r.k.drain();
  const green = sign(r.sql, 'automations-parked', r.clock.now());
  assert.deepEqual([green.state, green.value, green.said], ['green', 0, 'No run waits on a person.']);
  r.sql.close();
});

test('AUTOMATIONS IDLE: counted after fourteen days, never red however many, and a rule that has run or is off is not idle', async () => {
  const quiet = (n: number) => rule(`wait_${n}`, `Wait ${n}`, [{ notify: { say: 'New item: {{what}}' } }], { on: { written: { register: 'other', op: ['create'] } } });
  const OTHER: Declaration = { id: 'register.other', kind: 'register', body: { id: 'other', name: 'Other', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never };
  const OFF = rule('off_one', 'Switched off', [{ notify: { say: 'x' } }], { enabled: false });
  const r = await record(OTHER, NOTE, OFF, ...[1, 2, 3, 4, 5].map(quiet));
  item(r, 'Rent');
  await r.k.drain();
  const young = sign(r.sql, 'automations-idle', NOW + 13 * DAY);
  assert.deepEqual([young.state, young.value], ['green', 0], 'thirteen days is not idle yet');
  const idle = sign(r.sql, 'automations-idle', NOW + 15 * DAY);
  assert.equal(idle.state, 'green', 'idle is a count and never red');
  assert.equal(idle.value, 5, 'the five that never ran, not the one that ran nor the one switched off');
  assert.equal(idle.said, '5 of 6 automations switched on have never run, 14 days or more after going in.');
  assert.deepEqual(idle.facts, ['6 automations are switched on, and 5 of them have never run.', 'Never run: Wait 1, Wait 2, Wait 3 and 2 more.']);
  noIds(idle);
  /* NOTHING SWITCHED ON is nothing to judge by. */
  const none = await record(OFF);
  assert.equal(sign(none.sql, 'automations-idle', NOW + 15 * DAY).state, 'none');
  none.sql.close();
  r.sql.close();
});

test('AUTOMATIONS STOPPED CHAINS: a script whose writes reach the bound reads red with its name; a chain that ends by itself is green', async () => {
  const r = await record(script('spawn', 'Echo items'), kick('spawn'));
  item(r, 'Seed');
  await settle(r, 16);
  const red = sign(r.sql, 'automations-stopped-chains');
  assert.deepEqual([red.state, red.value], ['red', 1]);
  assert.equal(red.said, '1 chain of rules and scripts hit its depth limit in 7 days, at Echo items.');
  noIds(red);
  r.sql.close();

  const g = await record(script('quiet', 'Tidy items'), kick('quiet'));
  item(g, 'Seed');
  await settle(g, 4);
  const green = sign(g.sql, 'automations-stopped-chains');
  assert.deepEqual([green.state, green.value, green.said], ['green', 0, 'No chain of rules and scripts hit its depth limit in 7 days.']);
  g.sql.close();
});

const wired = VITAL_SIGNS.some((s) => s.sign === 'automations-idle');

test('WIRED: the kernel verb answers the seven as the readers do', { skip: wired ? false : 'signs.ts does not spread SIGNS_FLOW yet' }, async () => {
  const r = await record(NOTE);
  const got = r.k.signs();
  assert.ok(got.ok);
  const all: VitalSign[] = got.value.signs;
  for (const s of SIGNS_FLOW) {
    const one: VitalSign | undefined = all.find((x) => x.sign === s.sign);
    assert.ok(one, `${s.sign} is not in k.signs()`);
    assert.equal(one.state, sign(r.sql, s.sign, r.clock.now()).state);
  }
  r.sql.close();
});
