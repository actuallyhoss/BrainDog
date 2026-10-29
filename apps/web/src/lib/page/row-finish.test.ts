/**
 * A row finished through its parts is found by what the lists declare, never by their names: a plan keeps no money and
 * is paid or cancelled as its instalments are, and they point at it and keep money.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REGISTERS } from '../record/fixtures/sample.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { partsOf } from './row-finish.ts';

const all = Object.values(REGISTERS) as RegisterDecl[];

test("A PLAN'S PARTS ARE THE LIST THAT POINTS AT IT, keeps money and is finished by the same words", () => {
  const plan = all.find((d) => d.fields.some((f) => f.type === 'ref' && f.to === d.id) && !d.fields.some((f) => f.type === 'money') && (d.done ?? []).includes('paid'));
  assert.ok(plan, 'the seed keeps a list paid in parts');
  const parts = partsOf(plan, all);
  assert.ok(parts);
  assert.equal(all.find((d) => d.id === parts.list)?.fields.find((f) => f.id === parts.link)?.to, plan.id);
});

test('A LIST THAT KEEPS MONEY, OR ONE NOTHING FINISHES BY ITS WORDS, has no parts', () => {
  for (const d of all.filter((d) => d.fields.some((f) => f.type === 'money'))) assert.equal(partsOf(d, all), null, d.id);
  const renamed = all.map((d) => ({ ...d, done: d.done?.includes('paid') && !d.fields.some((f) => f.type === 'money') ? ['settled'] : d.done }));
  for (const d of renamed) assert.equal(partsOf(d, renamed), null, d.id);
});
