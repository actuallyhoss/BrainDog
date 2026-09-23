/**
 * The import's first run, sent a few rows at a time within each list instead of one row at a time.
 *
 * WHY. The freeze-day run is his first run: every row a `create`, about 3,315 of them. Measured on 23 September
 * through the Worker in workerd (a scratch copy of `apps/worker/test/import-in-do.test.ts`'s setup, outside the tree),
 * with a fixed delay put on every request the command sends and one create in flight at a time:
 *
 *   the 44-row fixture, 80 requests:     1.2 s at 0 ms,  6.4 s at 50 ms, 14.4 s at 150 ms
 *   the fixture and 320 tasks, 400 req:  6.0 s at 0 ms, 31.8 s at 50 ms, 74.4 s at 150 ms
 *
 * So nearly all of a run on a network is the network's wait: at 150 ms, 400 requests cost 74 s where the same run with
 * no delay took 6 s. A Durable Object serialises its writes, so sending several at once buys that wait and not the
 * record's time, which is the only thing it could buy. The numbers after the change are over `WRITES_AT_ONCE` in
 * `src/import.ts`: 18.8 s for the grown run at 150 ms, eight at a time.
 *
 * THE DOOR HERE IS A FAKE WITH A CLOCK IN IT, because the thing measured is when each write starts and when it is
 * answered, and neither the kernel over `node:sqlite` nor `memoryRecord` in `import.test.ts` ever lets two writes
 * overlap: each answers before the next line runs. Each create waits a few milliseconds of its own before it answers,
 * so answers can come back in a different order from the one they were sent in, as they do over a network.
 *
 * AND EVERY CASE BELOW CHECKS FIRST THAT THE RUN OVERLAPPED, because each of the claims after the first is true of an
 * importer that sends one row at a time by construction. Nothing can start early when nothing starts before the last
 * answer; refusals cannot arrive out of order when only one is ever outstanding. Asserted over a sequential run they
 * would be green whatever the code did, so the guard is what makes each claim a measurement, and at HEAD the guard
 * is what fails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ORDER, planLegacyTool, type Plan } from '../src/legacy.ts';
import { applyPlan, type Door } from '../src/import.ts';
import { syntheticExport } from './legacy-export.ts';

const TODAY = '2026-09-17';

/** Every list the plan can write to, so no row is left out for a missing list. */
const LISTS: string[] = [...ORDER];

/** Two tasks the door refuses, planned side by side so both are in flight at once. */
const REFUSE_FIRST = 'A task the record refuses, planned first';
const REFUSE_SECOND = 'A task the record refuses, planned second';

/**
 * The fixture, and sixty more tasks. The two to be refused sit together in the middle of them. The fixture's own
 * tasks keep `parent: 101` on task 102, so a row that names a row in its own list is part of every run here.
 */
function grownPlan(): Plan {
  const exported = syntheticExport() as { tasks: Record<string, unknown>[] };
  const task = (id: number, text: string) => ({ id, text, done: 0, entity: 'lanternly', lane: 'sam', deleted: 0 });
  const more = Array.from({ length: 60 }, (_, i) => task(1000 + i, `Grown task number ${String(i + 1)}`));
  more.splice(30, 0, task(900, REFUSE_FIRST), task(901, REFUSE_SECOND));
  return planLegacyTool({ ...exported, tasks: [...exported.tasks, ...more] }, TODAY);
}

type Stored = { id: string; register: string; seq: number; version: number; fields: Record<string, unknown> };
type Event = { at: 'sent' | 'answered'; verb: 'create' | 'update'; register: string; label: string };

/**
 * A record in memory whose writes take time. `wait` says how long a create waits before it answers, by its fields;
 * `unreachableOn` makes the create of one task answer `UNREACHABLE` the way the client does when the network drops.
 */
function slowRecord(o: { wait?: (fields: Record<string, unknown>) => number; unreachableOn?: string; throwOn?: string } = {}) {
  const rows: Stored[] = [];
  const events: Event[] = [];
  let n = 0;
  let inFlight = 0;
  let most = 0;
  /** How many writes were in flight at the moment the unreachable answer was given. */
  let atUnreachable: number | null = null;
  const nameOf = (fields: Record<string, unknown>) => String(fields.what ?? fields.name ?? fields.lesson ?? fields.label ?? fields.client_id ?? '');
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
  const door: Door = {
    schema: async (register) => (LISTS.includes(register) ? { ok: true, value: { register } } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } }),
    list: async ({ register }) => ({ ok: true, value: { rows: rows.filter((r) => r.register === register).map((r) => structuredClone(r)), cursor: null } }),
    create: async ({ register, fields }) => {
      const label = nameOf(fields);
      events.push({ at: 'sent', verb: 'create', register, label });
      inFlight++;
      most = Math.max(most, inFlight);
      try {
        await sleep(o.wait?.(fields) ?? 2);
        if (o.unreachableOn !== undefined && label === o.unreachableOn) {
          atUnreachable = inFlight - 1;
          return { ok: false, refusal: { code: 'UNREACHABLE', fix: 'The host did not answer.' } };
        }
        if (o.throwOn !== undefined && label === o.throwOn) throw new Error(`The door threw on ${label}.`);
        if (label === REFUSE_FIRST || label === REFUSE_SECOND) return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: `Refused: ${label}.` } };
        const seq = rows.filter((r) => r.register === register).length + 1;
        const made = { id: `e_${String(++n)}`, register, seq, version: 1, fields: structuredClone(fields) };
        rows.push(made);
        return { ok: true, value: structuredClone(made) };
      } finally {
        inFlight--;
        events.push({ at: 'answered', verb: 'create', register, label });
      }
    },
    update: async ({ register, seq, patch, version }) => {
      const at = rows.find((r) => r.register === register && r.seq === seq);
      if (!at) return { ok: false, refusal: { code: 'REF_UNKNOWN', fix: 'No such row.' } };
      events.push({ at: 'sent', verb: 'update', register, label: nameOf(at.fields) });
      if (version !== undefined && version !== at.version) return { ok: false, conflict: { current: at } as never };
      Object.assign(at.fields, structuredClone(patch));
      at.version++;
      events.push({ at: 'answered', verb: 'update', register, label: nameOf(at.fields) });
      return { ok: true, value: structuredClone(at) };
    },
    governance: async () => ({ ok: true, value: [] }),
    propose: async () => ({ ok: true, value: { id: `SG${String(++n)}` } }),
  };
  return {
    door,
    rows,
    events,
    get most() {
      return most;
    },
    get inFlight() {
      return inFlight;
    },
    get atUnreachable() {
      return atUnreachable;
    },
  };
}

/** The index of a register in `ORDER`, which is the order a plan's lists are written in. */
const rank = (register: string) => ORDER.indexOf(register as (typeof ORDER)[number]);

test('A FIRST RUN SENDS MORE THAN ONE CREATE AT A TIME, and never more than the bound', async () => {
  const record = slowRecord();
  await applyPlan(grownPlan(), record.door, { dryRun: false });
  assert.ok(record.most > 1, `the most creates in flight at once was ${String(record.most)}`);
  assert.ok(record.most <= 8, `the most creates in flight at once was ${String(record.most)}, past the bound of 8`);
});

test('NO CREATE OF A LIST STARTS BEFORE EVERY CREATE OF AN EARLIER LIST IN ORDER HAS ANSWERED', async () => {
  const record = slowRecord({ wait: (fields) => (String(fields.what ?? fields.name ?? '').length % 5) + 1 });
  await applyPlan(grownPlan(), record.door, { dryRun: false });
  assert.ok(record.most > 1, `the run never overlapped (the most in flight was ${String(record.most)}), so no order was tested`);
  const creates = record.events.filter((e) => e.verb === 'create');
  for (const [i, e] of creates.entries()) {
    if (e.at !== 'sent') continue;
    const unanswered = creates.slice(0, i).filter((s) => s.at === 'sent' && rank(s.register) < rank(e.register) && !creates.slice(0, i).some((a) => a.at === 'answered' && a.register === s.register && a.label === s.label));
    assert.deepEqual(unanswered.map((s) => `${s.register} ${s.label}`), [], `${e.register} ${e.label} was sent before these had answered`);
  }
});

test('A REFUSAL IS REPORTED AGAINST ITS OWN ROW AND LABEL, IN PLAN ORDER, whatever order the answers came back in', async () => {
  /* THE ONE PLANNED FIRST ANSWERS LAST, so a report built in arrival order would put the second one first. */
  const record = slowRecord({ wait: (fields) => (fields.what === REFUSE_FIRST ? 20 : 1) });
  const report = await applyPlan(grownPlan(), record.door, { dryRun: false });
  const answered = record.events.filter((e) => e.at === 'answered' && (e.label === REFUSE_FIRST || e.label === REFUSE_SECOND)).map((e) => e.label);
  assert.deepEqual(answered, [REFUSE_SECOND, REFUSE_FIRST], 'the two refusals came back in plan order, so arrival order was not tested');
  assert.deepEqual(
    report.refused.filter((r) => r.register === 'tasks'),
    [
      { label: '#900', register: 'tasks', fix: `Refused: ${REFUSE_FIRST}. (OUT_OF_BOUNDS)` },
      { label: '#901', register: 'tasks', fix: `Refused: ${REFUSE_SECOND}. (OUT_OF_BOUNDS)` },
    ],
  );
  const plan = report.plan;
  const keyOf = (id: number) => plan.rows.find((r) => r.key === `legacy:task:${String(id)}`)!.key;
  assert.equal(report.outcomes[keyOf(900)], 'refused');
  assert.equal(report.outcomes[keyOf(901)], 'refused');
});

test('UNREACHABLE ON ONE CREATE STOPS THE RUN: nothing further is sent, and what was in flight is answered before it ends', async () => {
  const target = 'Grown task number 20';
  const record = slowRecord({ wait: (fields) => (fields.what === target ? 1 : 6), unreachableOn: target });
  await assert.rejects(applyPlan(grownPlan(), record.door, { dryRun: false }));
  assert.ok((record.atUnreachable ?? 0) > 0, `nothing else was in flight when the host stopped answering (${String(record.atUnreachable)}), so "nothing further" was not tested`);
  const cut = record.events.findIndex((e) => e.at === 'answered' && e.label === target);
  assert.deepEqual(record.events.slice(cut + 1).filter((e) => e.at === 'sent').map((e) => `${e.verb} ${e.register} ${e.label}`), [], 'writes were sent after the unreachable answer');
  /* A RUN THAT THREW WITH WRITES STILL OUT would leave them landing after the command had said it stopped. */
  assert.equal(record.inFlight, 0, 'the run ended with writes still in flight');
  assert.ok(!record.rows.some((r) => r.fields.what === 'Grown task number 40'), 'a row planned well after the failure was written');
});

test('A SECOND RUN OVER THE SAME PLAN ADDS NOTHING, and the first one filled every parent at once', async () => {
  const record = slowRecord({ wait: (fields) => (String(fields.what ?? fields.name ?? '').length % 4) + 1 });
  const first = await applyPlan(grownPlan(), record.door, { dryRun: false });
  assert.ok(record.most > 1, `the first run never overlapped (the most in flight was ${String(record.most)})`);
  /* TASK 102 NAMES TASK 101 AS ITS PARENT, in the same list. Sent side by side, it must still wait for its parent's id
     and carry it on the create, not go to the second pass as a row whose parent had not answered yet. */
  assert.deepEqual(record.events.filter((e) => e.verb === 'update').map((e) => `${e.register} ${e.label}`), [], 'the first run patched rows after writing them');
  const parent = record.rows.find((r) => r.fields.what === 'Write the annual plan copy')!;
  const child = record.rows.find((r) => r.fields.what === 'Wire the receipt check')!;
  assert.equal(child.fields.parent, parent.id);
  assert.equal(first.refused.filter((r) => r.register !== 'tasks').length, 0, JSON.stringify(first.refused));
  const held = record.rows.length;
  const second = await applyPlan(grownPlan(), record.door, { dryRun: false });
  assert.equal(record.rows.length, held);
  assert.deepEqual(Object.entries(second.tally).filter(([, t]) => t.added > 0), []);
  /* THE TWO REFUSED TASKS ARE SENT AGAIN, AS THEY SHOULD BE: they are not in the record, so they are not found there. */
  assert.deepEqual(second.refused.map((r) => r.label), ['#900', '#901']);
});

test('A KEY PLANNED TWICE IN ONE LIST IS WRITTEN ONCE AND THEN UPDATED, not created twice side by side', async () => {
  /* NO PLAN `planLegacyTool` MAKES HOLDS ONE KEY TWICE, and `applyPlan` takes any plan. Sent one at a time, the second
     row found the row the first had just written and patched it. Sent side by side with nothing making it wait, both
     went out as creates and the record held two rows under one key, which the next run cannot tell apart. */
  const plan = grownPlan();
  const at = plan.rows.findIndex((r) => r.key === 'legacy:task:1000');
  const again = { ...plan.rows[at]!, fields: { ...plan.rows[at]!.fields, what: 'Grown task number 1, renamed' } };
  const record = slowRecord();
  await applyPlan({ ...plan, rows: [...plan.rows.slice(0, at + 1), again, ...plan.rows.slice(at + 1)] }, record.door, { dryRun: false });
  assert.ok(record.most > 1, `the run never overlapped (the most in flight was ${String(record.most)}), so no race was possible`);
  const held = record.rows.filter((r) => Array.isArray(r.fields.tags) && r.fields.tags.includes('legacy:task:1000'));
  assert.deepEqual(held.map((r) => r.fields.what), ['Grown task number 1, renamed']);
});

test('A WRITE THAT THROWS STOPS THE RUN, and a row waiting on its answer is not sent after it', async () => {
  /* TASK 102 NAMES TASK 101 AS ITS PARENT, so a lane holding 102 waits on 101's answer. When that answer is an
     exception rather than a refusal, the run is over, and 102 going out afterwards would be a write made after the
     command had failed, which one row at a time never did. */
  const parent = 'Write the annual plan copy';
  const record = slowRecord({ wait: (fields) => (fields.what === parent ? 10 : 2), throwOn: parent });
  await assert.rejects(applyPlan(grownPlan(), record.door, { dryRun: false }), /The door threw on Write the annual plan copy/);
  assert.ok(record.most > 1, `the run never overlapped (the most in flight was ${String(record.most)})`);
  assert.deepEqual(record.events.filter((e) => e.at === 'sent' && e.label === 'Wire the receipt check'), [], 'the child was sent after its parent threw');
  assert.equal(record.inFlight, 0, 'the run ended with writes still in flight');
});
