/**
 * What the tidy found, finder by finder, under what went stale on Home: a line a kind with how many wait and how many
 * were cleared this week, the kinds at nought dropped, nothing for none, and a finder the record refused left out.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { finders } from '@braindog/kernel';

import { TIDY_FINDERS, loadTidyWeek, tidyWeekFrom, tidyWeekLines, type Found, type Metric } from './tidy-week.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const reading = (value: unknown) => ({ ok: true as const, value: { value, met: null } });
const refused = { ok: false as const, refusal: { code: 'METRIC_UNKNOWN', fix: 'There is no figure called that.' } };

/** A stand-in `metric`: each figure answers what `counts` holds, and any other is refused. */
function figures(counts: Record<string, unknown>) {
  const asked: string[] = [];
  const metric: Metric = async (id) => {
    asked.push(id);
    if (!Object.hasOwn(counts, id)) return refused;
    const c = counts[id];
    return c instanceof Error ? Promise.reject(c) : reading(c);
  };
  return { metric, asked };
}

/** Every finder at nought and nought, then `over` on top. */
const all = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...Object.fromEntries(TIDY_FINDERS.flatMap((f) => [[`stale-${f.id}`, 0], [`tidied-${f.id}`, 0]])),
  ...over,
});

const found = (id: string, stale: number, cleared: number): Found => ({ id, name: TIDY_FINDERS.find((f) => f.id === id)!.name, stale, cleared });

test("THE FINDERS ARE THE KERNEL'S, every one and in its order, each with a plain name and no key in it", () => {
  assert.deepEqual(
    TIDY_FINDERS.map((f) => f.id),
    finders().map((f) => f.id),
  );
  for (const f of TIDY_FINDERS) {
    assert.ok(f.name.length > 0, f.id);
    assert.doesNotMatch(f.name, /-|—|#|\brow\b|\bentity\b/u, f.name);
  }
});

test('A LINE A FINDER: "Empty runs: 41 stale, 3 cleared this week", and nought said as "none"', () => {
  assert.deepEqual(tidyWeekLines([found('runs-empty', 41, 3), found('steps-old', 0, 2), found('faults-open', 5, 0)]), [
    { id: 'runs-empty', said: 'Empty runs: 41 stale, 3 cleared this week' },
    { id: 'steps-old', said: 'Steps nobody took: none stale, 2 cleared this week' },
    { id: 'faults-open', said: 'Faults still open: 5 stale, none cleared this week' },
  ]);
});

test('A FINDER AT NOUGHT AND NOUGHT IS DROPPED, and none left is null, which draws nothing', () => {
  assert.deepEqual(tidyWeekLines([found('runs-stopped', 0, 0), found('runs-empty', 1, 0)]), [{ id: 'runs-empty', said: 'Empty runs: 1 stale, none cleared this week' }]);
  assert.equal(tidyWeekLines([found('runs-stopped', 0, 0), found('rows-same', 0, 0)]), null);
  assert.equal(tidyWeekLines([]), null);
});

test('EACH FINDER IS ASKED ITS TWO FIGURES, stale-<finder> and tidied-<finder>, and answered in the finders\' order', async () => {
  const host = figures(all({ 'stale-runs-empty': 41, 'tidied-runs-empty': 3, 'tidied-steps-old': 2 }));
  const got = await tidyWeekFrom(host.metric);
  assert.deepEqual(
    [...host.asked].sort(),
    TIDY_FINDERS.flatMap((f) => [`stale-${f.id}`, `tidied-${f.id}`]).sort(),
  );
  assert.deepEqual(got.map((f) => f.id), TIDY_FINDERS.map((f) => f.id));
  assert.deepEqual(tidyWeekLines(got)?.map((l) => l.said), ['Empty runs: 41 stale, 3 cleared this week', 'Steps nobody took: none stale, 2 cleared this week']);
});

test('A REFUSED FIGURE LEAVES ITS FINDER OUT, whole, and the others still draw', async () => {
  const counts = all({ 'stale-runs-empty': 41, 'tidied-runs-empty': 3, 'stale-faults-open': 2 });
  delete counts['tidied-faults-open'];
  counts['stale-keys-unopened'] = new Error('offline');
  counts['stale-rows-same'] = 2.5;
  counts['tidied-questions-old'] = -1;
  const got = await tidyWeekFrom(figures(counts).metric);
  assert.deepEqual(got.map((f) => f.id), ['runs-stopped', 'runs-empty', 'steps-old', 'questions-moot']);
  assert.deepEqual(tidyWeekLines(got), [{ id: 'runs-empty', said: 'Empty runs: 41 stale, 3 cleared this week' }]);
});

test('THE READ NEVER THROWS: a host without the figures, one that refuses, one offline and one that is not JSON are none', async () => {
  const base = 'http://record.test';
  assert.deepEqual(await loadTidyWeek(base, async () => json(404, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No such call.' } })), []);
  assert.deepEqual(await loadTidyWeek(base, async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), []);
  assert.deepEqual(await loadTidyWeek(base, async () => Promise.reject(new Error('offline'))), []);
  assert.deepEqual(await loadTidyWeek(base, async () => new Response('<html>', { status: 200 })), []);
});

test("THROUGH THE CLIENT: each figure is the record's metric by its id, and its reading's value is the count", async () => {
  const counts = all({ 'stale-runs-empty': 41, 'tidied-runs-empty': 3 });
  const asked: string[] = [];
  const io = async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.pathname, '/api/metric');
    const id = url.searchParams.get('metric') ?? '';
    asked.push(id);
    return Object.hasOwn(counts, id) ? json(200, reading(counts[id])) : json(404, refused);
  };
  const got = await loadTidyWeek('http://record.test', io);
  assert.equal(asked.length, TIDY_FINDERS.length * 2);
  assert.deepEqual(tidyWeekLines(got), [{ id: 'runs-empty', said: 'Empty runs: 41 stale, 3 cleared this week' }]);
});

test('A FINDER AT A TIME: never more than its two figures are out at once, so the tile is never a dozen places in the queue', async () => {
  let out = 0;
  let most = 0;
  const metric: Metric = async () => {
    out += 1;
    most = Math.max(most, out);
    await new Promise((done) => setTimeout(done, 1));
    out -= 1;
    return { ok: true, value: { value: 0 } } as never;
  };
  await tidyWeekFrom(metric);
  assert.equal(most, 2);
});
