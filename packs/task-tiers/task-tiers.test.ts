/**
 * Task tiers: four judgements on a task, added, and the tier they come to written with its reason.
 *
 * A TIER SOMEBODY TYPES CARRIES NO REASON, and a list ordered by it cannot be argued with. Work already holds the tier
 * (`priority`) and a line for why (`why`). This pack lays four optional whole numbers on a task, each from 0 to 25:
 * what it brings in, what it unblocks, whether it has a clock on it, and how cheap it is to do. A rule on a task
 * created or changed in any of the four starts a script, and the script adds them: under 40 is Low, 40 to 59 Normal,
 * 60 to 79 High, 80 and over Urgent. It writes the tier and the sum's line in one update.
 *
 * A FIELD WORKED OUT FROM OTHERS IS NOT READ BY THIS BUILD, so the sum is a script and not a declared field. The day a
 * list can declare one, the script goes and the four fields stay.
 *
 * RED FIRST, MEASURED: with no `tier.js` and no `task-tiers.pack.json` this file failed at its first read, ENOENT,
 * before a single test ran.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import type { CallContext } from '../../packages/record/src/index.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('tier.js', HERE), 'utf8');
const TEXT = readFileSync(new URL('task-tiers.pack.json', HERE), 'utf8');
type LaidField = { id: string; label: string; type: string; min?: number; max?: number; required?: boolean };
const PACK = JSON.parse(TEXT) as {
  pack: string;
  requires: { packs: Record<string, string> };
  extends: Record<string, { fields: LaidField[] }>;
  declarations: Record<string, unknown>[];
};
const SCRIPT = PACK.declarations.find((d) => typeof d.script === 'string') as {
  script: string;
  runs: Record<string, unknown>;
  egress: string[];
  keys: string[];
  reads: string[];
  writes: string[];
  source: string;
};
const RULE = PACK.declarations.find((d) => typeof d.rule === 'string') as { rule: string; on: unknown; steps: unknown[] };

const NOW = '2026-10-13T09:00:00.000Z';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const FOUR = ['rev', 'unblock', 'clock', 'cheap'];
const LINE = 'Money 20, unblocks 15, clock 25, cheap 5: 65 of 100.';

/* ── The pack ──────────────────────────────────────────────────────────────────────────────────── */

test('THE PACK CARRIES tier.js AS ITS SOURCE, byte for byte; it fetches nothing and writes only tasks', async () => {
  assert.equal(SCRIPT.source, SOURCE, 'task-tiers.pack.json and tier.js disagree; copy tier.js into the source');
  assert.deepEqual(SCRIPT.runs, { rule: true });
  assert.deepEqual([SCRIPT.egress, SCRIPT.keys], [[], []], 'working out a tier calls nobody');
  assert.deepEqual([SCRIPT.reads, SCRIPT.writes], [['tasks'], ['tasks']]);
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'task-tiers');
  assert.equal(file.value.pack.manifest.version, '1.0.2');
  /* THE REASON'S FIELD AND THE THREAD STATES IT SITS BESIDE ARRIVED WITH WORK 1.19.0. */
  assert.deepEqual(PACK.requires.packs, { work: '>=1.19.0' });
});

test('FOUR OPTIONAL WHOLE NUMBERS ARE LAID ON TASKS, each from 0 to 25 and each under a name a person would say', () => {
  assert.deepEqual(Object.keys(PACK.extends), ['register.tasks']);
  const laid = PACK.extends['register.tasks']!.fields;
  assert.deepEqual(
    laid.map((f) => [f.id, f.label, f.type, f.min, f.max, f.required ?? false]),
    [
      ['rev', 'Brings money', 'int', 0, 25, false],
      ['unblock', 'Unblocks other work', 'int', 0, 25, false],
      ['clock', 'Has a clock on it', 'int', 0, 25, false],
      ['cheap', 'Cheap to do', 'int', 0, 25, false],
    ],
  );
});

test('THE RULE WATCHES THE FOUR AND NOTHING THE SCRIPT WRITES, so the script does not start itself again', () => {
  assert.deepEqual(RULE.on, { written: { register: 'tasks', op: ['create', 'update'], fields: FOUR } });
  assert.deepEqual(RULE.steps, [{ script: { id: SCRIPT.script, as: 'tiered' } }]);
  const watched = (RULE.on as { written: { fields: string[] } }).written.fields;
  for (const written of ['priority', 'why']) assert.equal(watched.includes(written), false, `the rule watches ${written}, which the script writes`);
});

/* ── The script, in QuickJS ────────────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };

/** One task as a rule would hand it to the script. */
const task = (fields: Record<string, Json>, seq = 7, version = 3): Row => ({ id: '01K5TSK0000000000000000001', register: 'tasks', seq, fields: { what: 'Send the invoice', state: 'open', ...fields }, version, updated_at: NOW });

const hostOf = (t: Row | null): CtxHost => ({
  fetch: async () => {
    throw new Error('working out a tier fetches nothing');
  },
  get: async (spoken) => (t !== null && t.id === spoken ? t : null) as unknown as Json,
  now: () => NOW,
  tz: 'UTC',
  input: { id: '01K5TSK0000000000000000001', register: 'tasks', seq: 7 },
});

const decl = (): ScriptDecl => ({ id: SCRIPT.script, version: 1, egress: SCRIPT.egress, keys: SCRIPT.keys, reads: SCRIPT.reads, writes: SCRIPT.writes, source: SCRIPT.source });

const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};

/** What the script wrote for a task holding `fields`: its one patch, or `null` when it wrote nothing. */
const tiered = async (fields: Record<string, Json>): Promise<Record<string, Json> | null> => {
  const writes = writesOf(await runInQuickJs(decl(), hostOf(task(fields)))) as unknown as { op: string; spoken: string; patch: Record<string, Json>; version: number }[];
  if (writes.length === 0) return null;
  assert.equal(writes.length, 1, 'the tier and its reason go in one update');
  assert.deepEqual([writes[0]!.op, writes[0]!.spoken, writes[0]!.version], ['update', 'tasks#7', 3]);
  return writes[0]!.patch;
};

test('20, 15, 25 AND 5 COME TO 65, which is High, and the reason is the sum said in a line', async () => {
  assert.deepEqual(await tiered({ rev: 20, unblock: 15, clock: 25, cheap: 5 }), { priority: 'high', why: LINE });
});

test('THE BANDS AT EACH EDGE: 39 is Low, 40 and 59 Normal, 60 and 79 High, 80 Urgent', async () => {
  /* EACH SUM SPLIT ACROSS THE FOUR, so an edge is the edge of the sum and not of one number. */
  const split = (sum: number): Record<string, Json> => {
    const rev = Math.min(25, sum);
    const unblock = Math.min(25, sum - rev);
    const clock = Math.min(25, sum - rev - unblock);
    return { rev, unblock, clock, cheap: sum - rev - unblock - clock };
  };
  const got: [number, Json][] = [];
  for (const sum of [0, 39, 40, 59, 60, 79, 80, 100]) got.push([sum, (await tiered(split(sum)))!.priority!]);
  assert.deepEqual(got, [
    [0, 'low'],
    [39, 'low'],
    [40, 'normal'],
    [59, 'normal'],
    [60, 'high'],
    [79, 'high'],
    [80, 'urgent'],
    [100, 'urgent'],
  ]);
  assert.equal((await tiered(split(39)))!.why, 'Money 25, unblocks 14, clock 0, cheap 0: 39 of 100.');
});

test('WORDS A PERSON WROTE IN THE REASON ARE KEPT AFTER THE LINE, and a second run replaces the line and not the words', async () => {
  const first = await tiered({ rev: 20, unblock: 15, clock: 25, cheap: 5, why: 'The client asked twice.' });
  assert.deepEqual(first, { priority: 'high', why: `${LINE} The client asked twice.` });
  /* THE CLOCK GOES TO 0 AND THE SUM TO 40: the old line leaves, the words stay, and they are not doubled. */
  const second = await tiered({ rev: 20, unblock: 15, clock: 0, cheap: 5, priority: 'high', why: first!.why! });
  assert.deepEqual(second, { priority: 'normal', why: 'Money 20, unblocks 15, clock 0, cheap 5: 40 of 100. The client asked twice.' });
});

test('WITH ALL FOUR EMPTY IT WRITES NOTHING, and a typed tier and its reason stand as they were', async () => {
  assert.equal(await tiered({}), null);
  assert.equal(await tiered({ priority: 'urgent', why: 'He said so.' }), null);
  assert.equal(await tiered({ rev: null, unblock: null, clock: null, cheap: null }), null);
});

test('WHEN ALL FOUR ARE CLEARED THE LINE LEAVES AND THE WORDS STAY, and the tier is left where it was', async () => {
  /* RED FIRST, MEASURED: before the script read a cleared task it answered no write here, and the old sum stood as the
     reason for a tier nobody had worked out any more. */
  const cleared = { rev: null, unblock: null, clock: null, cheap: null, priority: 'high' };
  assert.deepEqual(await tiered({ ...cleared, why: `${LINE} my words` }), { why: 'my words' });
  /* A REASON THAT WAS ONLY THE LINE IS EMPTY AFTERWARDS. */
  assert.deepEqual(await tiered({ ...cleared, why: LINE }), { why: '' });
  assert.deepEqual(await tiered({ priority: 'high', why: `${LINE}\n\nmy words\n` }), { why: 'my words' });
  /* A REASON SOMEBODY TYPED, WITH NO LINE AT ITS START, IS NOT TOUCHED: not when it has no sum in it, and not when a
     sum is quoted further in. */
  assert.equal(await tiered({ ...cleared, why: 'my words' }), null);
  assert.equal(await tiered({ ...cleared, why: `He wrote: ${LINE}` }), null);
  /* AND THE RUN AFTER THE LINE LEFT WRITES NOTHING, so it is taken away once. */
  assert.equal(await tiered({ ...cleared, why: '' }), null);
});

test('ONE NUMBER IS ENOUGH:the ones nobody gave count as nothing, and the line says so', async () => {
  assert.deepEqual(await tiered({ clock: 25 }), { priority: 'low', why: 'Money 0, unblocks 0, clock 25, cheap 0: 25 of 100.' });
});

test('A TASK ALREADY AT ITS TIER WITH ITS LINE IS NOT WRITTEN AGAIN, and a task that is gone is said', async () => {
  assert.equal(await tiered({ rev: 20, unblock: 15, clock: 25, cheap: 5, priority: 'high', why: LINE }), null);
  const gone = await runInQuickJs(decl(), hostOf(null));
  assert.deepEqual(writesOf(gone), []);
  assert.match(gone.log, /The task that started this run is gone/);
});

test('THE SCRIPT WRITES ONLY THE TIER AND ITS REASON, never one of the four it reads', async () => {
  const patch = await tiered({ rev: 25, unblock: 25, clock: 25, cheap: 25, owner: 'p_1', agent: 'claude' });
  assert.deepEqual(Object.keys(patch!).sort(), ['priority', 'why']);
});

/* ── The whole path ────────────────────────────────────────────────────────────────────────────── */

test('THE WHOLE PATH ON A SELF-HOST: a task filed with four numbers has its tier and its reason, and one that has none keeps what was typed', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-task-tiers-'));
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => null, send: async () => new Response('{}'), resolve: async () => [] },
  });
  try {
    const person = running.directory.person$('ada@example.test', 'Ada');
    assert.ok(person.ok);
    const api = running.api;
    assert.ok((await api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
    const owner: CallContext = { principal: { kind: 'person', id: person.value.id, level: 'owner' } };
    const said = <T>(r: unknown): T => {
      const x = r as { ok: boolean; value: T };
      assert.ok(x.ok, fixOf(x as never));
      return x.value;
    };
    type Diff = { planHash: string; approve: string[]; extends: { id: string; adds: string[] }[] };
    const planOf = async (doc: unknown): Promise<Diff> => said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
    const put = async (doc: unknown) => {
      const diff = await planOf(doc);
      said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
    };

    /* WITHOUT WORK THE PLAN IS REFUSED, since the four numbers have no list to be laid on. */
    assert.equal(((await api.planPack({ doc: PACK, source: { kind: 'local' } } as never, owner)) as { ok: boolean }).ok, false);

    for (const id of ['portfolio', 'people', 'work']) await put(firstPartyDocument(id as never, { seeds: [] }));
    /* BEFORE THE PACK a task takes no clock, so the numbers are the pack's and nothing of Work's. */
    assert.equal((await api.create({ register: 'tasks', fields: { what: 'Too early', clock: 25 } }, owner)).ok, false);

    /* THE PLAN LAYS THE FOUR AND ASKS NOBODY TO PRESS ANYTHING MORE. */
    const diff = await planOf(PACK);
    assert.deepEqual(diff.extends.map((e) => [e.id, e.adds]), [['register.tasks', FOUR]]);
    assert.deepEqual(diff.approve, []);
    await put(PACK);

    const settle = async () => {
      await running.drain();
      await running.poll();
    };
    const fieldsOf = (id: string) => api.kernel.get(id)!.fields as Record<string, unknown>;
    const runs = () => running.sql.one<{ n: number }>('SELECT count(*) AS n FROM automation_run WHERE rule = ?', RULE.rule)?.n;

    /* FILED WITH 20, 15, 25 AND 5: High, and the line. */
    const invoice = said<{ id: string; seq: number }>(await api.create({ register: 'tasks', fields: { what: 'Send the invoice', rev: 20, unblock: 15, clock: 25, cheap: 5 } }, owner));
    await settle();
    assert.deepEqual([fieldsOf(invoice.id).priority, fieldsOf(invoice.id).why], ['high', LINE]);
    /* THE SCRIPT'S OWN WRITE STARTED NOTHING: one run for the one task. */
    assert.equal(runs(), 1);

    /* THE CLOCK GOES TO 0, AND IT IS 40, NORMAL. */
    said(await api.update({ register: 'tasks', seq: invoice.seq, patch: { clock: 0 } }, owner));
    await settle();
    assert.deepEqual([fieldsOf(invoice.id).priority, fieldsOf(invoice.id).why], ['normal', 'Money 20, unblocks 15, clock 0, cheap 5: 40 of 100.']);
    assert.equal(runs(), 2);

    /* A PERSON ADDS WORDS TO THE REASON AND MOVES THE TASK ON, AND NOTHING RUNS: neither is one of the four. */
    said(await api.update({ register: 'tasks', seq: invoice.seq, patch: { why: `${String(fieldsOf(invoice.id).why)} The client asked twice.`, state: 'doing' } }, owner));
    await settle();
    assert.equal(runs(), 2);
    /* THE NEXT NUMBER KEEPS THE WORDS AFTER THE NEW LINE. */
    said(await api.update({ register: 'tasks', seq: invoice.seq, patch: { rev: 25, clock: 25 } }, owner));
    await settle();
    assert.deepEqual([fieldsOf(invoice.id).priority, fieldsOf(invoice.id).why], ['high', 'Money 25, unblocks 15, clock 25, cheap 5: 70 of 100. The client asked twice.']);

    /* A SECOND EDIT BEFORE THE FIRST RUN LANDS FAILS NOTHING. The second change joins the run the first one queued,
       and that one run reads the task when it runs, not when it was queued: it reads both edits, and the version it
       hands back is the one the task holds. */
    /* HOW THE SCRIPT'S RUNS ENDED, read as the kernel reads them when it counts refusals in a row (`script-run.ts`). */
    const ended = (outcome: string) =>
      running.sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE actor LIKE 'script:task_tier@%' AND json_valid(to_v) AND json_extract(to_v, '$.outcome') = ?", outcome)?.n;
    const refused = () => ended('refused');
    said(await api.update({ register: 'tasks', seq: invoice.seq, patch: { cheap: 10 } }, owner));
    said(await api.update({ register: 'tasks', seq: invoice.seq, patch: { state: 'open', unblock: 20 } }, owner));
    await settle();
    assert.deepEqual([fieldsOf(invoice.id).priority, fieldsOf(invoice.id).why], ['urgent', 'Money 25, unblocks 20, clock 25, cheap 10: 80 of 100. The client asked twice.']);
    assert.equal(refused(), 0);

    /* ALL FOUR ARE CLEARED: the line leaves, the words stay, and the tier is left where it was. */
    said(await api.update({ register: 'tasks', seq: invoice.seq, patch: { rev: null, unblock: null, clock: null, cheap: null } }, owner));
    await settle();
    assert.deepEqual([fieldsOf(invoice.id).priority, fieldsOf(invoice.id).why], ['urgent', 'The client asked twice.']);
    /* EVERY RUN SO FAR ENDED WELL, so the count of refusals above is a count of something. Six changes started the
       rule and the script ran five times, since the two edits made together were one run. */
    assert.deepEqual([refused(), ended('ok'), runs()], [0, 5, 6]);

    /* A TASK WITH A TYPED TIER AND NO NUMBERS STANDS AS TYPED, and its reason is whatever its writer gave. */
    const typed = said<{ id: string }>(await api.create({ register: 'tasks', fields: { what: 'Ring the printer', priority: 'urgent', why: 'He said so.' } }, owner));
    await settle();
    assert.deepEqual([fieldsOf(typed.id).priority, fieldsOf(typed.id).why], ['urgent', 'He said so.']);

    /* 26 IS REFUSED BY THE FIELD, before any script reads it. */
    assert.equal((await api.create({ register: 'tasks', fields: { what: 'Too sure', rev: 26 } }, owner)).ok, false);
    assert.equal((await api.create({ register: 'tasks', fields: { what: 'Half sure', rev: 12.5 } }, owner)).ok, false);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
