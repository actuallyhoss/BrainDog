/**
 * `past`, THE LINES WHOSE DAY IS GONE COUNTED INSIDE A WIDER `where` (signs-metric-75-76).
 *
 * A ratio's two halves share the one `where`. With the day in it, "every matched line is on time" and "no line was ever
 * matched" were both no row, so a sign that says nothing of a blind record said nothing of a clean one either. With the
 * day in the value the `where` holds who is judged and `past` counts the late among them: a clean record reads 0 again
 * and a blind one still reads no value.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* Noon on Friday 9 October 2026, so three days gone is before the 6th. */
const NOW = Date.UTC(2026, 9, 9, 12);

const LINES: Declaration = {
  id: 'register.lines',
  kind: 'register',
  body: {
    id: 'lines',
    name: 'Repeating lines',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['live', 'paused', 'ended'] },
      { id: 'next_due', type: 'day', index: true },
      { id: 'last_paid', type: 'day' },
      { id: 'seen', type: 'instant' },
    ],
  } as never,
};

const WIDE = 'state is live, last_paid is set';
const STUCK = { ratio: { of: { past: 'next_due', by: '3d' }, per: { distinct: 'state' } } };

const fig = (metric: string, value: unknown, where?: string): MetricDecl =>
  ({ metric, name: metric, source: 'register.lines', ...(where ? { where } : {}), value, format: 'int', target: { lte: 0 }, window: '30d', compare: 'none' }) as MetricDecl;

const reading = (r: unknown): Reading => {
  const x = r as { ok: boolean; value: Reading; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([LINES])).ok);
  const line = (what: string, state: string, next_due?: string, last_paid?: string) =>
    assert.ok(k.create('lines', { what, state, ...(next_due ? { next_due } : {}), ...(last_paid ? { last_paid } : {}) }, { actor: 'p_1' }).ok);
  return { k, line };
}

test('A CLEAN RECORD READS 0 AND MEETS ITS MARK, a blind one reads no value, a stuck line is counted', async () => {
  const { k, line } = await record();
  const sign = fig('stuck', STUCK, WIDE);
  assert.equal(reading(k.metric(sign)).value, null, 'no line at all is not judged');

  line('Rent', 'live', '2026-10-01');
  line('Gym', 'live', '2026-09-01');
  const blind = reading(k.metric(sign));
  assert.equal(blind.value, null, 'no line was ever matched, however late: no value');
  assert.equal(blind.met, null, 'and no verdict');

  line('Phone', 'live', '2026-10-20', '2026-09-20');
  line('Water', 'live', '2026-10-06', '2026-09-06');
  line('Old club', 'ended', '2026-01-01', '2025-12-01');
  const clean = reading(k.metric(sign));
  assert.equal(clean.value, 0, 'matched lines and none past its day: nought, read');
  assert.equal(clean.met, true, 'which is the mark');

  line('Power', 'live', '2026-10-05', '2026-09-05');
  const late = reading(k.metric(sign));
  assert.equal(late.value, 1, 'one matched live line more than three days gone');
  assert.equal(late.met, false);
});

test('IT COUNTS WHAT THE PREDICATE SELECTS: the day itself is not gone, and a line with no day is not late', async () => {
  const { k, line } = await record();
  for (const [what, day] of [['a', '2026-10-09'], ['b', '2026-10-08'], ['c', '2026-10-06'], ['d', '2026-10-05'], ['e', '2026-07-01']] as const) line(what, 'live', day, '2026-06-01');
  line('f', 'live', undefined, '2026-06-01');
  for (const [by, word] of [['3d', '-3d'], ['0d', 'today'], ['1d', '-1d'], ['100d', '-100d']] as const) {
    const said = reading(k.metric(fig(`w${by}`, { count: 'id' }, `${WIDE}, next_due before ${word}`))).value;
    assert.equal(reading(k.metric(fig(`p${by}`, { past: 'next_due', by }, WIDE))).value, said, `by ${by} and before ${word}`);
  }
  assert.equal(reading(k.metric(fig('three', { past: 'next_due', by: '3d' }, WIDE))).value, 2, 'the 5th and July; the 6th is three days gone, not more');
  assert.equal(reading(k.metric(fig('none', { past: 'next_due' }, WIDE))).value, 4, 'with no by, every day before today');
  const whole = reading(k.metric(fig('whole', { past: 'next_due', by: '3d' })));
  assert.equal(whole.value, 2, 'and with no where it reads the whole list');
  assert.equal(whole.rows, 6, 'the entries it was read over, late or not');
});

test('A SHARE OF THE LATE, both halves over the one where', async () => {
  const { k, line } = await record();
  line('a', 'live', '2026-09-01', '2026-08-01');
  line('b', 'live', '2026-10-30', '2026-09-30');
  line('c', 'live', '2026-10-30', '2026-09-30');
  line('d', 'live', '2026-10-30', '2026-09-30');
  const share = reading(k.metric({ ...fig('share', { ratio: { of: { past: 'next_due', by: '3d' }, per: { count: 'id' } } }, WIDE), format: 'pct' } as MetricDecl));
  assert.equal(share.value, 0.25, 'one of four');
});

test('REFUSED BY NAME: a by that is not days, and a field that is not a day', async () => {
  const { k } = await record();
  const refused = (value: unknown): { code: string; fix: string } => {
    const out = k.metric(fig('bad', value, WIDE)) as { ok: boolean; refusal?: { code: string; fix: string } };
    assert.equal(out.ok, false, JSON.stringify(value));
    return out.refusal!;
  };
  for (const by of ['3', '1m', '-3d', '99999d', '', 3]) {
    const said = refused({ past: 'next_due', by });
    assert.equal(said.code, 'VALUE_MALFORMED', String(by));
    assert.match(said.fix, /whole number of days/);
  }
  assert.equal(refused({ ratio: { of: { past: 'next_due', by: 'soon' }, per: { count: 'id' } } }).code, 'VALUE_MALFORMED', 'inside a ratio too');
  assert.match(refused({ past: 'what' }).fix, /past reads a day, and what is a text/);
  assert.match(refused({ past: 'seen' }).fix, /past reads a day, and seen is an instant/);
  assert.equal(refused({ past: 'nosuch' }).code, 'FIELD_UNKNOWN');
});

test('IT INSTALLS AS A FIGURE, and a field the list does not hold is refused there', async () => {
  const { k, line } = await record();
  const decl = (metric: string, value: unknown): Declaration => ({ id: `metric.${metric}`, kind: 'metric', body: fig(metric, value, WIDE) }) as never;
  const out = await k.install([decl('stuck', STUCK)]);
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  line('Phone', 'live', '2026-10-20', '2026-09-20');
  assert.equal(reading(k.metric(fig('stuck', STUCK, WIDE))).value, 0);
  assert.equal((await k.install([decl('lost', { past: 'nosuch', by: '3d' })])).ok, false);
});

test('THE FIGURE AS THE RECORD HOLDS IT READS THE SAME, with by written before past as a stored declaration has it', async () => {
  const { k, line } = await record();
  const decl = (metric: string, value: unknown): Declaration => ({ id: `metric.${metric}`, kind: 'metric', body: fig(metric, value, WIDE) }) as never;
  /* A record keeps a declaration with its keys in order, so the figure comes back { by, past }. */
  const turned = { ratio: { of: { by: '3d', past: 'next_due' }, per: { distinct: 'state' } } };
  const out = await k.install([decl('stuck', STUCK), decl('turned', turned)]);
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  line('Phone', 'live', '2026-10-20', '2026-09-20');
  line('Power', 'live', '2026-10-05', '2026-09-05');
  for (const id of ['stuck', 'turned']) {
    const stored = JSON.parse(k.declarations().find((d) => d.id === `metric.${id}`)!.body as string) as MetricDecl;
    assert.equal(reading(k.metric(stored)).value, 1, `${id}, read as stored: ${JSON.stringify(stored.value)}`);
  }
  assert.equal(reading(k.metric(fig('turned', turned, WIDE))).value, 1);
  /* And a by that is no number of days is still refused, whichever key comes first. */
  const soon = (await k.install([decl('soon', { by: 'soon', past: 'next_due' })])) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.deepEqual([soon.ok, soon.refusal?.code], [false, 'VALUE_MALFORMED'], JSON.stringify(soon));
  assert.match(soon.refusal?.fix ?? '', /whole number of days/);
  assert.equal((await k.install([decl('lost', { by: '3d', past: 'nosuch' })])).ok, false);
});
