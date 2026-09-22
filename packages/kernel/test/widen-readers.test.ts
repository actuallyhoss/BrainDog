/**
 * A widened field is asked about by its readers, as a field taken away is.
 *
 * MEASURED BY THE CHECKER OF WAVE THIRTY-THREE. `contradicted` lets `enum` to `text` through without asking any reader
 * (`widen.ts`), and `stranded` only looked at fields taken away. So a rule with `each: [season]` over the enum survived
 * `season` widening to text, although the same rule declared fresh is refused, and at run time it crossed the whole free
 * text as one item, so its declared bound meant nothing. A page column whose `sign:` reads the enum was the same kind of
 * reader. A widening with no reader that needs the closed list still installs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const NAME = { id: 'name', type: 'text', required: true };
const SEASON = { id: 'season', type: 'enum', values: ['summer', 'winter'] };
const AMOUNT = { id: 'amount', type: 'money' };
const SEASON_TEXT = { id: 'season', type: 'text' };

const products = (fields: Record<string, unknown>[]): Declaration => ({
  id: 'register.products',
  kind: 'register',
  body: { id: 'products', name: 'Products', title: 'name', fields } as never,
});

const SKUS: Declaration = {
  id: 'register.skus',
  kind: 'register',
  body: { id: 'skus', name: 'SKUs', title: 'code', fields: [{ id: 'code', type: 'text', required: true }] } as never,
};

const EACH: Declaration = {
  id: 'rule.per-season',
  kind: 'rule',
  body: {
    rule: 'per-season',
    register: 'products',
    once_per: ['entry'],
    then: [{ create: { register: 'skus', each: ['season'], bound: 2, fields: { code: '{{each.0}}' } } }],
  } as never,
};

const SIGNED: Declaration = {
  id: 'page.stock',
  kind: 'page',
  body: {
    page: 'stock',
    title: 'Stock',
    requires: ['register.products'],
    blocks: [{ kind: 'table', source: 'register.products', columns: [{ field: 'name' }, { field: 'amount', sign: { field: 'season', minus: 'winter' } }], empty: 'None.' }],
  } as never,
};

async function record(...readers: Declaration[]): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([SKUS, products([NAME, SEASON, AMOUNT]), ...readers]);
  assert.ok(out.ok, fixOf(out));
  assert.ok(k.create('products', { name: 'Coat', season: 'winter' }, { actor: 'p_1' }).ok);
  return k;
}

test('A RULE THAT CROSSES AN ENUM WITH each: IS ASKED WHEN THE ENUM WIDENS, and refuses it as a fresh install would', async () => {
  const k = await record(EACH);
  const out = await k.install([products([NAME, SEASON_TEXT, AMOUNT])]);
  assert.equal(out.ok, false, 'the widening stranded the rule');
  assert.equal(codeOf(out), 'MATCH_OP_UNSUPPORTED');
  assert.match(fixOf(out), /rule\.per-season/);
  assert.match(fixOf(out), /season/);
  assert.equal(k.register('products')?.fields.find((f) => f.id === 'season')?.type, 'enum', 'nothing installed');
});

test('A PAGE COLUMN WHOSE sign: READS THE ENUM IS ASKED TOO', async () => {
  const k = await record(SIGNED);
  const out = await k.install([products([NAME, SEASON_TEXT, AMOUNT])]);
  assert.equal(out.ok, false, 'the widening stranded the page');
  assert.equal(codeOf(out), 'DECLARATION_INVALID');
  assert.match(fixOf(out), /page\.stock/);
});

test('AND THE SAME PAGE DECLARED FRESH OVER A TEXT FIELD IS REFUSED AT INSTALL, not on every open', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([products([NAME, SEASON_TEXT, AMOUNT]), SIGNED]);
  assert.equal(codeOf(out), 'DECLARATION_INVALID');
  assert.match(fixOf(out), /page\.stock\.blocks\[0\]: sign: names an enum field on products/);
});

test('A WIDENING NO READER DEPENDS ON STILL INSTALLS', async () => {
  const k = await record();
  const out = await k.install([products([NAME, SEASON_TEXT, AMOUNT])]);
  assert.ok(out.ok, fixOf(out));
});
