/**
 * A page that opens on "Describe it" (ENG-B11 with PGS-C30): the mark in the address, the address without it, and the
 * three things that have to hold before the sheet opens by itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DESCRIBE, describeAsked, opensDescribe, withoutDescribe } from './change-open.ts';
import { describedHref, pageHref } from '../palette/new-page.ts';

const url = (rest: string) => new URL(`https://brain.example${rest}`);

test('the address asks only with the mark set to 1', () => {
  assert.equal(describeAsked(url('/p/wedding?describe=1')), true);
  assert.equal(describeAsked(url('/app/mara/p/wedding?src=0&describe=1#guests')), true);
  assert.equal(describeAsked(url('/p/wedding')), false);
  assert.equal(describeAsked(url('/p/wedding?src=1')), false);
  assert.equal(describeAsked(url('/p/wedding?describe=0')), false);
  assert.equal(describeAsked(url('/p/wedding?describe')), false);
  /* A word that only holds the mark's letters is somebody else's. */
  assert.equal(describeAsked(url('/p/wedding?described=1')), false);
  assert.equal(describeAsked(url('/p/describe=1')), false);
});

test('the same address with the mark gone, and every other part kept', () => {
  assert.equal(withoutDescribe(url('/p/wedding?describe=1')), '/p/wedding');
  assert.equal(withoutDescribe(url('/p/wedding?src=1&describe=1')), '/p/wedding?src=1');
  assert.equal(withoutDescribe(url('/p/wedding?describe=1&src=1&tab=guests')), '/p/wedding?src=1&tab=guests');
  assert.equal(withoutDescribe(url('/p/wedding?describe=1#guests')), '/p/wedding#guests');
  assert.equal(withoutDescribe(url('/app/mara/p/wedding?describe=1&src=1#guests')), '/app/mara/p/wedding?src=1#guests');
  /* An address that never asked is answered as it is. */
  assert.equal(withoutDescribe(url('/p/wedding?src=1#guests')), '/p/wedding?src=1#guests');
  assert.equal(withoutDescribe(url('/p/wedding')), '/p/wedding');
});

test('what is left asks no more, so Back and a reload do not open the sheet again', () => {
  const left = withoutDescribe(url('/p/wedding?describe=1&src=1'));
  assert.equal(describeAsked(url(left)), false);
});

test('the sheet opens by itself only when the address asks, the reader may change the page and the host has a model', () => {
  assert.equal(opensDescribe({ asked: true, mayChange: true, model: true }), true);
  for (const asked of [true, false])
    for (const mayChange of [true, false])
      for (const model of [true, false]) {
        if (asked && mayChange && model) continue;
        assert.equal(opensDescribe({ asked, mayChange, model }), false, JSON.stringify({ asked, mayChange, model }));
      }
});

test('the address the palette opens a made page at is one this file reads as asking, and it is that page', () => {
  assert.equal(describedHref('wedding'), `/p/wedding?${DESCRIBE}=1`);
  const there = url(describedHref('wedding'));
  assert.equal(describeAsked(there), true);
  assert.equal(withoutDescribe(there), pageHref('wedding'));
});
