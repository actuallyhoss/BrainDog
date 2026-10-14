/**
 * A `when:` taking `any:` beside `all:`, and one join inside the other, two levels deep at most (PGS-A13 item 4).
 *
 * WHAT WAS MEASURED BEFORE IT: a `when` was one leaf or a flat `all:`, so "something waits, or something is stuck" was
 * two notes, and a page that wanted "stuck and late, or waiting" could not say it at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { registersOfBlock, whenLeaves, type PageBlock } from '../src/pages.ts';
import { WHEN_DEPTH, whenTreeFault } from '../src/block-keys.ts';
import { PROJECTS } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const OWNER = { actor: 'p_1' };

const register = (id: string): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } }) as never;
const count = (metric: string, source: string): Declaration =>
  ({ id: `metric.${metric}`, kind: 'metric', body: { metric, name: metric, source: `register.${source}`, value: { count: 'id' }, format: 'int', target: { lte: 0 }, window: '7d', compare: 'none' } }) as never;

const DECLS = [register('waits'), register('stuck'), register('late'), count('waiting', 'waits'), count('stuck', 'stuck'), count('late', 'late')];

async function record(rows: { waits?: number; stuck?: number; late?: number }): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install(DECLS);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const [list, n] of Object.entries(rows)) for (let i = 0; i < n; i += 1) assert.ok(k.create(list, { name: PROJECTS[i % PROJECTS.length]! }, OWNER).ok);
  return k;
}

const drawn = (k: Kernel, when: unknown): boolean => k.block({ kind: 'note', body: 'Said.', when } as PageBlock).drawn !== false;

const EITHER = { any: [{ metric: 'waiting', gt: 0 }, { metric: 'stuck', gt: 0 }] };

test('ANY OVER TWO FIGURES DRAWS WHILE ONE HOLDS, and not while neither does', async () => {
  assert.equal(drawn(await record({}), EITHER), false);
  assert.equal(drawn(await record({ waits: 1 }), EITHER), true);
  assert.equal(drawn(await record({ stuck: 2 }), EITHER), true);
  assert.equal(drawn(await record({ waits: 1, stuck: 1 }), EITHER), true);
  /* A FIGURE NOBODY DECLARED IS ONE PART THAT DOES NOT HOLD, and the other still says. */
  assert.equal(drawn(await record({ waits: 1 }), { any: [{ metric: 'nobody', gt: 0 }, { metric: 'waiting', gt: 0 }] }), true);
  assert.equal(whenTreeFault(EITHER, 'when'), null);
});

test('AN ALL INSIDE AN ANY: stuck and late, or waiting', async () => {
  const when = { any: [{ all: [{ metric: 'stuck', gt: 0 }, { metric: 'late', gt: 0 }] }, { metric: 'waiting', gt: 0 }] };
  assert.equal(whenTreeFault(when, 'when'), null);
  assert.equal(drawn(await record({ stuck: 1 }), when), false, 'drew on stuck alone');
  assert.equal(drawn(await record({ stuck: 1, late: 1 }), when), true);
  assert.equal(drawn(await record({ waits: 1 }), when), true);
  /* AND AN ANY INSIDE AN ALL: waiting, and stuck or late. */
  const inner = { all: [{ metric: 'waiting', gt: 0 }, { any: [{ metric: 'stuck', gt: 0 }, { metric: 'late', gt: 0 }] }] };
  assert.equal(whenTreeFault(inner, 'when'), null);
  assert.equal(drawn(await record({ waits: 1 }), inner), false);
  assert.equal(drawn(await record({ waits: 1, late: 1 }), inner), true);
  /* EVERY LEAF'S FIGURE IS ONE THE BLOCK READS, however deep it sits. */
  assert.deepEqual(whenLeaves(when).map((l) => l.metric), ['stuck', 'late', 'waiting']);
  const metric = (id: string) => ((DECLS.find((d) => d.id === `metric.${id}`)?.body as never) ?? null);
  assert.deepEqual(registersOfBlock({ kind: 'note', body: 'Said.', when } as PageBlock, metric).sort(), ['late', 'stuck', 'waits']);
});

test('THREE LEVELS ARE REFUSED, and a page installed before the refusal draws nothing on them', async () => {
  assert.equal(WHEN_DEPTH, 2);
  const deep = { any: [{ all: [{ metric: 'stuck', gt: 0 }, { any: [{ metric: 'late', gt: 0 }, { metric: 'waiting', gt: 0 }] }] }, { metric: 'waiting', gt: 0 }] };
  assert.match(whenTreeFault(deep, "page.front.blocks[0]'s when")!, /^page\.front\.blocks\[0\]'s when any\[0\] all\[1\] is a third level, and a when is 2 levels deep at most/);
  assert.equal(drawn(await record({ stuck: 1, late: 1, waits: 0 }), deep), false);
  /* THE FIGURES OF A PART TOO DEEP ARE NOT READ: it never holds. */
  assert.deepEqual(whenLeaves(deep).map((l) => l.metric), ['stuck', 'waiting']);
});

test('WHAT A JOIN CANNOT SAY IS REFUSED IN A SENTENCE, and never draws', async () => {
  const leaf = { metric: 'waiting', gt: 0 };
  const k = await record({ waits: 1 });
  const cases: [unknown, RegExp][] = [
    [{ any: [leaf] }, /has an any of one leaf, and any is two or more leaves of which one must hold/],
    [{ all: [] }, /has an all of no leaves, and all is two or more leaves that must every one hold/],
    [{ any: [{ any: [leaf, leaf] }, leaf] }, /any\[0\] is an any inside an any\. One leaf holding is enough either way/],
    [{ all: [{ all: [leaf, leaf] }, leaf] }, /all\[0\] is an all inside an all\. Every leaf must hold either way/],
    [{ all: [leaf, leaf], any: [leaf, leaf] }, /says all and any/],
    [{ any: [leaf, leaf], metric: 'waiting' }, /says any and metric\. any is the whole when/],
    [{ any: [leaf, 'waiting'] }, /any\[1\] is one leaf naming a metric/],
  ];
  for (const [when, said] of cases) {
    assert.match(whenTreeFault(when, 'when') ?? '', said, JSON.stringify(when));
    assert.equal(drawn(k, when), false, JSON.stringify(when));
  }
  /* A LEAF ALONE AND A FLAT ALL READ AS THEY DID. */
  assert.equal(drawn(k, leaf), true);
  assert.equal(drawn(k, { all: [leaf, { metric: 'stuck', is: 0 }] }), true);
});
