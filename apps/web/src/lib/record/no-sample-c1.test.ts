/**
 * Brief C1 of `loop/research-no-sample.md` section 5: the sample is a test fixture, and nothing a live screen draws
 * with reads it.
 *
 * WHAT WAS WRONG, MEASURED ON THE CODE BEFORE THIS BRIEF. The fixture was `lib/record/data.ts`, and eleven shipped files
 * imported it. Loading it wrote the seed's declarations into `held.ts`, the table a live tab keeps the record's in, so
 * a list the record had not been asked about drew the seed's fields. `currencyFor` and `homeCurrency` answered from the
 * sample's rows, so a money field on a new row was offered the sample's currency on any record. A ref drawn without the
 * record's names was named from the sample's rows: services' `thing` 1 read "Kiln" on a record that has no Kiln. The Add
 * a block sheet proposed a gauge's target from the sample's sums. A bar the record sent no rates for was converted at
 * the sample's exchange rates. And the `/packs` screens, `/start`, Home's feed and the inbox named modules from the
 * sample's add-on list, which also carried two add-ons nobody wrote.
 *
 * THIS FILE IMPORTS THE FIXTURE AND NOT `fill.ts`, on purpose: it is the shipped tab's view of the tables, with the
 * sample merely loaded beside it, which is what every shipped file importing `data.ts` gave a real tab.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as sample from './fixtures/sample.ts';
import * as held from './held.ts';
import { currencyFor, display, homeCurrency } from './api.ts';
import { fxNow } from './metrics.ts';
import { seedBlock } from './seed.ts';

test('loading the fixture fills nothing a live tab reads', () => {
  assert.ok(Object.keys(sample.REGISTERS).length > 0, 'the fixture holds no declarations, so this test proves nothing');
  assert.deepEqual(Object.keys(held.REGISTERS), [], "the seed's declarations are where the record's are kept");
  assert.deepEqual(Object.keys(held.PAGES), [], "the seed's pages are where the record's are kept");
  assert.deepEqual(Object.keys(held.ROWS), [], "the sample's rows are where a live tab's would be");
  assert.equal(held.TITLES.size, 0, "the sample's row names are where the record's are kept");
});

test("no helper answers a currency or a rate from the sample's rows", () => {
  assert.equal(currencyFor('obligations', 'amount'), null, "a new row's money field is offered the sample's currency");
  assert.equal(homeCurrency(), null, "the record's home currency is the sample's");
  assert.deepEqual(fxNow().rates, [], "a bar with no rates of its own is converted at the sample's");
});

test("a ref drawn without the record's names is not named from the sample", () => {
  held.REGISTERS.services = sample.REGISTERS.services!;
  held.REGISTERS.things = sample.REGISTERS.things!;
  try {
    assert.equal(sample.ROWS.things?.[0]?.fields.name, 'Kiln', "the sample's first project is not Kiln, so this test proves nothing");
    assert.notEqual(display('services', 'thing', 1), 'Kiln', "the record's project #1 is drawn with the sample's name");
  } finally {
    delete held.REGISTERS.services;
    delete held.REGISTERS.things;
  }
});

test('a seeded block is proposed from the rows it is handed, and a list with none is proposed no target', () => {
  held.REGISTERS.obligations = sample.REGISTERS.obligations!;
  try {
    const bare = seedBlock('gauge', 'obligations');
    assert.ok(bare, 'a gauge over obligations is no longer offered, so this test proves nothing');
    assert.equal(bare.target, undefined, "a gauge's target was proposed from the sample's sums");
    const drawn = seedBlock('gauge', 'obligations', sample.ROWS.obligations ?? []);
    assert.equal(typeof drawn?.target, 'number', 'the rows the page drew are not what a target is proposed from');
  } finally {
    delete held.REGISTERS.obligations;
  }
});

test('the modules a screen names are the six this build ships, and not the sample catalogue', async () => {
  const { MODULES, moduleOf } = await import('./modules.ts');
  assert.deepEqual(MODULES.map((m) => m.id).sort(), ['agents', 'estate', 'money-core', 'people', 'portfolio', 'work']);
  assert.ok(MODULES.every((m) => m.installed === undefined), 'a shipped module says whether a record holds it');
  assert.deepEqual(moduleOf('agents')?.registers, ['learnings', 'skills', 'credentials', 'tools']);
  assert.equal(moduleOf('freelancer-uk'), undefined, "the sample's made-up add-on is named on a real record");
});
