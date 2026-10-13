/**
 * A RUNNING TOTAL AND A MEASURED TREND ARE CHECKED WHEN THEY ARE INSTALLED (REC-B09).
 *
 * Both shapes are read by `metrics.ts`, and both name things only the record can answer for: a running total names
 * the field it adds up and the field it walks in order of, and a trend names another figure and how many buckets
 * ahead to read. A running total over a name, or a trend of a figure that is not cut into buckets, would install
 * clean and answer a refusal on every page it sat on, so the author was told nothing at the one moment they could
 * fix it. These are the reader's own refusals, asked one moment earlier, each naming the field and the fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validate, type Declaration, type Known } from '../src/declare.ts';

const PAYMENTS: Declaration = {
  id: 'register.payments',
  kind: 'register',
  body: {
    id: 'payments',
    name: 'Payments',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'units', type: 'int' },
      { id: 'due', type: 'day' },
      { id: 'place', type: 'int' },
      { id: 'hours', type: 'duration' },
      { id: 'party', type: 'text' },
      { id: 'old', type: 'money', retired: true },
    ],
  },
} as never;

const figure = (id: string, extra: Record<string, unknown>): Declaration =>
  ({
    id: `metric.${id}`,
    kind: 'metric',
    body: { metric: id, name: id, source: 'register.payments', value: { sum: 'amount' }, format: 'money', target: { gte: 0 }, window: '12m', ...extra },
  }) as never;

/** Paid, cut by month: the figure a trend reads. */
const BY_MONTH = figure('paid-by-month', { group_by: 'due', bucket: 'month' });
/** Paid, as one number: nothing a trend can be read from. */
const WHOLE = figure('paid', {});

const known = (...decls: Declaration[]): Known => new Map(decls.map((d) => [d.id, d.body as never]));
const RECORD = known(PAYMENTS, BY_MONTH, WHOLE);

const running = (shape: unknown): Declaration => figure('paid-so-far', { value: { running: shape } });
const trend = (shape: unknown): Declaration => figure('paid-trend', { value: { trend: shape }, format: 'pct' });

const said = (decl: Declaration, record: Known | undefined = RECORD): string => {
  const r = validate(decl, record);
  return r === null ? 'installed' : `${r.code} at ${String(r.at)}: ${r.fix}`;
};

test('A VALID PAIR INSTALLS: a running total over money in order of its day, and a trend of a figure cut by month', () => {
  assert.equal(said(running({ sum: 'amount', order: 'due', until: { gte: 500000 } })), 'installed');
  assert.equal(said(running({ sum: 'units', order: 'place' })), 'installed', 'a number, in order of a number, with no stop');
  assert.equal(said(running({ sum: 'hours', order: 'due' })), 'installed', 'a length of time adds up as any number the reader sums');
  assert.equal(said(trend({ of: 'paid-by-month', ahead: 3 })), 'installed');
  assert.equal(said(trend({ of: 'paid-by-month', ahead: 1 })), 'installed', 'the least');
  assert.equal(said(trend({ of: 'paid-by-month', ahead: 12 })), 'installed', 'the most');
  /* With no record to ask, the shape alone is checked, as every other figure's is. */
  assert.equal(said(running({ sum: 'amount', order: 'due' }), undefined), 'installed');
  assert.equal(said(trend({ of: 'paid-by-month', ahead: 3 }), undefined), 'installed');
});

test('A RUNNING TOTAL ADDS UP MONEY OR A NUMBER, and one over anything else is refused with the field named', () => {
  for (const field of ['party', 'due', 'what']) {
    const answer = said(running({ sum: field, order: 'due' }));
    assert.match(answer, /^VALUE_MALFORMED at value: /, field);
    assert.ok(answer.includes(`${field}`) && answer.includes('money or a number'), answer);
  }
  const answer = said(running({ sum: 'party', order: 'due' }));
  assert.ok(answer.includes('amount') && answer.includes('units'), `the fix names what it could add up: ${answer}`);
  assert.match(said(running({ sum: 'nosuch', order: 'due' })), /^FIELD_UNKNOWN at value: .*nosuch/);
  assert.match(said(running({ sum: 'old', order: 'due' })), /^FIELD_UNKNOWN at value: .*old/, 'a retired field is not there to add up');
});

test('A RUNNING TOTAL WALKS IN ORDER OF A DAY OR A NUMBER, and says so when it is given neither', () => {
  const answer = said(running({ sum: 'amount', order: 'party' }));
  assert.match(answer, /^VALUE_MALFORMED at value: /);
  assert.ok(answer.includes('party') && answer.includes('a day or a number') && answer.includes('due'), answer);
  assert.match(said(running({ sum: 'amount', order: 'nosuch' })), /^FIELD_UNKNOWN at value: .*nosuch/);
  /* The shape, with or without a record. */
  for (const record of [RECORD, undefined]) {
    assert.match(said(running({ sum: 'amount' }), record), /^VALUE_MALFORMED at value: .*order/);
    assert.match(said(running({ order: 'due' }), record), /^VALUE_MALFORMED at value: .*sum/);
    assert.match(said(running('amount'), record), /^VALUE_MALFORMED at value: /);
    assert.match(said(running({ sum: 'amount', order: 'due', until: { over: 3 } }), record), /^VALUE_MALFORMED at value: .*until: \{ gte: /);
    assert.match(said(running({ sum: 'amount', order: 'due', until: 500000 }), record), /^VALUE_MALFORMED at value: .*until: \{ gte: /);
    /* One total, walked once: the reader answers one number, so a grouping is refused where it is written. */
    assert.match(said(figure('paid-so-far', { value: { running: { sum: 'amount', order: 'due' } }, group_by: 'party' }), record), /^DECLARATION_INVALID at group_by: .*party.*Leave group_by out/);
  }
});

test('A TREND OF A FIGURE THAT HAS NO BUCKET IS REFUSED AT INSTALL, with the fix', () => {
  const answer = said(trend({ of: 'paid', ahead: 3 }));
  assert.match(answer, /^DECLARATION_INVALID at value: /);
  assert.ok(answer.includes('paid') && answer.includes('bucket: month'), answer);
  assert.match(said(trend({ of: 'nosuch', ahead: 3 })), /^METRIC_UNKNOWN at value: .*nosuch/);
  assert.match(said(trend({ of: 'paid-trend', ahead: 3 })), /^DECLARATION_INVALID at value: .*itself/, 'a figure is not its own trend');
  for (const record of [RECORD, undefined]) {
    assert.match(said(trend({ ahead: 3 }), record), /^VALUE_MALFORMED at value: .*of/);
    assert.match(said(trend({ of: 7, ahead: 3 }), record), /^VALUE_MALFORMED at value: .*of/);
    assert.match(said(trend('paid-by-month'), record), /^VALUE_MALFORMED at value: /);
  }
});

test('HOW FAR AHEAD A TREND READS IS A WHOLE NUMBER FROM 1 TO 12, and the refusal says the bound', () => {
  for (const record of [RECORD, undefined])
    for (const ahead of [0, -1, 13, 120, 2.5, '3', null]) {
      const answer = said(trend({ of: 'paid-by-month', ahead }), record);
      assert.match(answer, /^OUT_OF_BOUNDS at value: /, String(ahead));
      assert.ok(answer.includes('from 1 to 12'), answer);
    }
  /* Left out, it is the reader's to say how far: nothing is refused for an absence. */
  assert.equal(said(trend({ of: 'paid-by-month' })), 'installed');
});
