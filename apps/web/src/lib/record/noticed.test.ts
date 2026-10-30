/**
 * `noticed()` — the observe loop's one appearance in the interface.
 *
 * WHAT IS BEING TESTED IS THE ABSENCE AS MUCH AS THE PRESENCE. A strip that draws whenever any
 * refusal has ever happened is a strip that is always there, which is the same as not being there.
 * The fixture carries one subject that clears its threshold and one that deliberately does not, and
 * the second is the harder half: it proves the screen is applying the kernel's numbers rather than
 * its own idea of "a lot".
 *
 * AND THE NUMBERS ARE THE KERNEL'S. If a detector's `n` or `days` ever changes, this test changes
 * with it for free, because nothing here restates them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { noticed } from './fixtures/readers.ts';

test('a register whose refusals crossed the threshold says so', () => {
  const seen = noticed('obligations');
  assert.ok(seen, 'twelve refusals over four days clears write.refused, and nothing was drawn');
  assert.equal(seen.field?.id, 'direction');
  assert.equal(seen.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(seen.n, 12);
  assert.equal(seen.days, 4);
  assert.equal(seen.window, '30d');
});

test('and a register whose refusals did not cross it says nothing', () => {
  // Nine over three days is a bad fortnight. The detector wants ten, and a screen that rounded up
  // would announce a pattern the analyser will never propose anything about.
  assert.equal(noticed('tasks'), null);
});

test('a register nothing was observed about is silent', () => {
  assert.equal(noticed('people'), null);
});

test('the field is named the way the rest of the product names it', () => {
  // `direction`, not `Direction` by accident and not `direction` raw: it goes through `labelOf`,
  // so a pack that relabels the field relabels this sentence too.
  assert.equal(noticed('obligations')?.field?.label, 'Which way');
});

test('the refusal code survives, whole', () => {
  // The friendly clause is for the person and the code is for whoever supports them. Showing only
  // the clause leaves nothing to search for; the code is what appears in the logs.
  const seen = noticed('obligations');
  /* `allows` AND IT SAID `declares`. The sentence is for the person reading their own list and
     `declares` is this product's word for the mechanism; the CODE is what survives whole, because
     it is what whoever supports them will search for. */
  assert.match(seen?.fix ?? '', /not one this field allows/);
  assert.equal(seen?.code, 'ENUM_VALUE_UNKNOWN');
});

test('a search.empty finding never lands on a register grid', () => {
  // `search.empty` carries a bare term as its subject — `retainer` — and a naive `startsWith` on a
  // register name would have put "6 writes to retainer were refused" above a grid. Only
  // `write.refused` carries `<register>.<field>:<code>`, and only it is read here.
  for (const register of ['retainer', 'services', 'things'])
    assert.equal(noticed(register), null);
});

test('AND NOTHING AT ALL WHILE THE ANALYSER IS SUSPENDED', () => {
  /* A crossed threshold is not the whole test. `analyse()` has four governors and a brake in front
     of it, and on a record under a fortnight old, or with three questions already open, or whose
     proposals keep coming back wrong, the threshold is crossed and no proposal is ever coming.
     Drawing the strip there is the failure this reader exists to avoid, one level up. */
  assert.equal(noticed('obligations', 'your BrainDog is under a fortnight old.'), null);
  assert.equal(noticed('obligations', '3 proposals are already open and unanswered.'), null);
  assert.ok(noticed('obligations', null), 'and a running loop still speaks');
});
