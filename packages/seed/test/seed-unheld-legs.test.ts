/**
 * A FORECAST LEG OVER A LIST THE RECORD DOES NOT HOLD IS TAKEN OFF, so an add-on can feed the cash walk. The walk names
 * Certificates, which the sample does not hold: left in, a figure over the walk is refused `REGISTER_UNKNOWN` at install.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';

import { declarations, heldLegs, installSeed, metricDeclarations, pageDeclarations, METRICS, NOW } from '../src/index.ts';
import { CASH_LEGS } from '../src/modules/money/legs.ts';
import { openSqlite, fixedClock } from '../../kernel/test/sqlite.ts';

const legsOf = (decls: { body: unknown }[]): string[] => JSON.stringify(decls.map((d) => d.body)).match(/"register":"certificates"/g) ?? [];

test('THE CASH WALK NAMES CERTIFICATES, AND THE SAMPLE INSTALLS WITHOUT THEM', async () => {
  assert.equal(CASH_LEGS.filter((l) => l.register === 'certificates').length, 2, 'the walk reads a certificate twice: its payouts and its principal back');
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  assert.equal(k.declarations().some((d) => d.body.includes('"certificates"')), false, 'a leg over a list the record does not hold was installed');
  assert.equal(k.metricDecl('runway-days') !== undefined, true);
});

test('NO DECLARATION THE SEED HANDS OUT CARRIES A LEG OVER A LIST IT DOES NOT HOLD', () => {
  for (const set of [declarations(), pageDeclarations(), metricDeclarations()]) assert.deepEqual(legsOf(set), []);
  assert.equal(JSON.stringify(METRICS).includes('certificates'), false);
});

test('heldLegs KEEPS A LEG OVER A HELD LIST, IN A FIGURE AND IN A BLOCK, AND NOTHING ELSE MOVES', () => {
  const body = {
    metric: 'x',
    legs: [{ register: 'recurring', on: 'next_due' }, { register: 'certificates', on: 'next_payout' }],
    blocks: [{ kind: 'chart', from: [{ register: 'certificates', on: 'ends' }, { register: 'installments', on: 'due' }], register: 'certificates' }],
  };
  assert.deepEqual(heldLegs(body), {
    metric: 'x',
    legs: [{ register: 'recurring', on: 'next_due' }],
    blocks: [{ kind: 'chart', from: [{ register: 'installments', on: 'due' }], register: 'certificates' }],
  });
  assert.deepEqual(heldLegs(body, new Set(['certificates', 'recurring', 'installments'])), body);
});
