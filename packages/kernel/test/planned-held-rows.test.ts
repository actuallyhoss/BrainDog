/**
 * The install checks that read one declaration through `heldRow`, asked of a planned record: `doorsOf`, `taggingRefused`
 * and `stranded`'s `was`.
 *
 * THE GAP. `heldRow` answers from the plan inside `againstPlan`, and
 * `test/lint-planned.test.ts` covers the checks that read the plan through `heldRows` and the list cache, but no test
 * put the one row these three read in the plan alone. Pointed at the table, each would have passed every test in the
 * package.
 *
 * EACH CASE PUTS THE ROW THAT DECIDES IT IN `known` AND NOT IN THE TABLE, so a reader that goes to the table gives the
 * other answer. Measured by loading `index.ts` with that one call site rewritten to the table's own `SELECT` (a load hook,
 * one mutant per reader, nothing in the tree changed): each test below failed under its own reader's mutant and passed
 * under the other two.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Json, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

type Refused = { code: string; fix: string; at?: string } | null;
const said = (r: Refused): string => (r === null ? 'passed' : `${r.code} at ${r.at}: ${r.fix}`);

const register = (id: string, fields: object[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title: (fields[0] as { id: string }).id, fields } }) as never;
const WHAT = { id: 'what', type: 'text', required: true };
const INT_TAGS = { id: 'tags', type: 'int' };

const door = (ingest: string, writes: string): Declaration =>
  ({
    id: `ingest.${ingest}`,
    kind: 'ingest',
    body: {
      ingest,
      channel: 'webhook',
      match: { all: [{ field: 'body', contains: 'Spent' }] },
      extract: { what: { text: { between: ['You ', ' EGP'] } } },
      writes: { register: writes, confidence: 'exact' },
    },
  }) as never;
const ARRIVED: Declaration = { id: 'rule.arrived', kind: 'rule', body: { rule: 'arrived', on: { arrival: { ingest: 'bank' } }, steps: [{ tag: 'fresh' }] } as never };
const LATE: Declaration = { id: 'rule.late', kind: 'rule', body: { rule: 'late', register: 'jobs', when: 'what is Rent', then: [{ tag: 'late' }] } as never };

/** The planned record: the live one, with `put` laid over it, as `declare`'s `plannedState` leaves it. */
function planned(k: Kernel, put: readonly Declaration[]) {
  const known = new Map<string, Record<string, Json>>();
  const owners = new Map<string, string | null>();
  for (const row of k.declarations()) {
    known.set(row.id, JSON.parse(row.body) as Record<string, Json>);
    owners.set(row.id, row.pack_id);
  }
  for (const d of put) {
    known.set(d.id, d.body);
    owners.set(d.id, d.pack ?? null);
  }
  return { known, owners };
}

async function kernel(...first: Declaration[]): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install(first);
  assert.ok(out.ok, fixOf(out));
  return k;
}

test("doorsOf: AN ARRIVAL RULE IS PLACED ON THE LIST THE PLAN'S DOOR WRITES, and refused for a tag that list's int tags cannot take", async () => {
  /* The door is the plan's alone. Read from the table there is no door, so the rule has no list, and nothing is asked. */
  const k = await kernel(register('jobs', [WHAT, INT_TAGS]));
  const { known, owners } = planned(k, [door('bank', 'jobs')]);
  const out = k.lint([ARRIVED], known, owners);
  assert.equal(out?.code, 'FIELD_TYPE_CHANGED', said(out));
  assert.equal(out?.at, 'rule.arrived.steps[0]', said(out));
});

test('taggingRefused: A RULE SENT WITH THE BYTES THE PLAN ALREADY HOLDS FOR IT IS NOT ASKED AGAIN', async () => {
  /* The same-bytes skip reads the rule as held. The plan holds `rule.late` as sent and the table holds none, so read from
     the table the rule is new and meets the list's int `tags`. */
  const k = await kernel(register('jobs', [WHAT, INT_TAGS]));
  const { known, owners } = planned(k, [LATE]);
  assert.equal(k.lint([LATE], known, owners), null, said(k.lint([LATE], known, owners)));
  assert.equal(k.lint([LATE])?.code, 'FIELD_TYPE_CHANGED', 'against the table the rule is new, and its tag is refused');
});

test("taggingRefused: A DOOR SENT WRITING THE LIST THE PLAN'S DOOR ALREADY WRITES HAS NOT MOVED, so its rule is not re-asked", async () => {
  /* The table's door writes `spend`, the plan's writes `jobs`, and the batch sends `jobs`. Against the plan that is no
     move; against the table it moves the plan's `rule.arrived` onto `jobs`, whose int `tags` refuses its tag. */
  const k = await kernel(register('jobs', [WHAT, INT_TAGS]), register('spend', [WHAT]), door('bank', 'spend'));
  const { known, owners } = planned(k, [door('bank', 'jobs'), ARRIVED]);
  const out = k.lint([door('bank', 'jobs')], known, owners);
  assert.equal(out, null, said(out));
});

test("stranded: A LIST SENT WITHOUT A FIELD THE PLAN'S COPY OF IT HOLDS is refused under the plan's page that reads it", async () => {
  /* `was` is the list before the batch. The plan adds `lane` to Jobs and a page filtering on it; the table's Jobs never
     had `lane`, so read from there nothing is taken away and the page is left reading a field that is gone. */
  const k = await kernel(register('jobs', [WHAT]));
  const LANE = { id: 'lane', type: 'text' };
  const page = {
    id: 'page.lanes',
    kind: 'page',
    body: { page: 'lanes', title: 'Lanes', requires: ['register.jobs'], blocks: [{ kind: 'table', source: 'register.jobs', where: 'lane is fast', span: 12, empty: 'None.' }] },
  } as unknown as Declaration;
  const { known, owners } = planned(k, [register('jobs', [WHAT, LANE]), page]);
  const out = k.lint([register('jobs', [WHAT])], known, owners);
  assert.equal(out?.at, 'page.lanes', said(out));
  assert.match(out?.fix ?? '', /Taking lane out of jobs/u, said(out));
});
