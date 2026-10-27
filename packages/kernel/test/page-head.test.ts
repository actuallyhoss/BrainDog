/**
 * The page's head: each part a `header` may say, checked as the install checks it, and resolved as the read
 * resolves it, leaving out a part with nothing to say. Invented figures, pages and lists throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { refused } from '@braindog/ports';

import { HEADER_KEYS, KICKER_MOST, headerBody, headerFault, resolveHead, type DeclaredHeader, type HeadFigure, type HeadRead } from '../src/page-head.ts';

/* An invented record: two figures, one page and one list. */
const CTX = { figures: new Set(['open-orders', 'late-orders']), fields: null };

const admitted = (raw: unknown): DeclaredHeader => {
  const out = headerBody(raw, CTX);
  assert.ok(out.ok, `expected ${JSON.stringify(raw)} admitted, got ${JSON.stringify(out)}`);
  return out.value;
};
const refusalOf = (raw: unknown) => {
  const out = headerBody(raw, CTX);
  assert.ok(refused(out), `expected a refusal for ${JSON.stringify(raw)}`);
  return out.refusal;
};

test('each part a head may say is admitted', () => {
  assert.deepEqual(admitted({ kicker: 'Shop floor' }), { kicker: 'Shop floor' });
  assert.deepEqual(admitted({ kicker: 'day' }), { kicker: 'day' });
  assert.deepEqual(admitted({ count: { metric: 'open-orders' } }), { count: { metric: 'open-orders' } });
  assert.deepEqual(admitted({ state: { metric: 'late-orders', says: { good: 'Nothing is late', bad: 'Orders are late' } } }), {
    state: { metric: 'late-orders', says: { good: 'Nothing is late', bad: 'Orders are late' } },
  });
  assert.deepEqual(admitted({ action: { verb: 'row.create', label: 'Add an order' } }), { action: { verb: 'row.create', label: 'Add an order' } });
  assert.deepEqual(admitted({ search: { param: 'q' } }), { search: { param: 'q' } });
  assert.deepEqual(admitted({ back: { page: 'workshop' } }), { back: { page: 'workshop' } });
  assert.deepEqual(admitted({ back: { list: 'orders' } }), { back: { list: 'orders' } });
  assert.deepEqual(admitted({ byline: true }), { byline: true });
  assert.equal(headerFault({ kicker: 'Shop floor', count: { metric: 'open-orders' }, byline: true }, CTX), null);
  assert.deepEqual([...HEADER_KEYS], ['kicker', 'count', 'state', 'action', 'search', 'back', 'byline']);
});

test('a kicker past its bytes and a key a head does not draw are refused', () => {
  const long = refusalOf({ kicker: 'k'.repeat(KICKER_MOST + 1) });
  assert.equal(long.at, 'header.kicker');
  assert.equal(admitted({ kicker: 'k'.repeat(KICKER_MOST) }).kicker?.length, KICKER_MOST);
  const stray = refusalOf({ banner: 'Hello' });
  assert.equal(stray.at, 'header.banner');
  assert.deepEqual(stray.allowed, [...HEADER_KEYS]);
  assert.match(stray.fix, /kicker, count, state, action, search, back, byline/u);
});

test('a row verb as the action is refused, and so is a list of actions', () => {
  const r = refusalOf({ action: { verb: 'row.tick', label: 'Done' } });
  assert.equal(r.at, 'header.action.verb');
  assert.match(r.fix, /row_actions/u);
  assert.equal(refusalOf({ action: [{ verb: 'row.create', label: 'Add' }] }).at, 'header.action');
  /* The block check's own words name the head, never `actions[0]`. */
  const unlabelled = refusalOf({ action: { verb: 'row.create', label: '' } });
  assert.equal(unlabelled.at, 'header.action.label');
  assert.doesNotMatch(unlabelled.fix, /actions\[0\]/u);
});

test('a figure the record does not hold, a bad search and a bad way back are refused', () => {
  assert.equal(refusalOf({ count: { metric: 'missing-figure' } }).code, 'METRIC_UNKNOWN');
  assert.ok(headerBody({ count: { metric: 'missing-figure' } }, { figures: null, fields: null }).ok, 'with no figures known, only the shape is checked');
  assert.equal(refusalOf({ state: { metric: 'late-orders', says: {} } }).at, 'header.state.says');
  assert.equal(refusalOf({ state: { metric: 'late-orders', says: { awful: 'Bad' } } }).at, 'header.state.says.awful');
  assert.equal(refusalOf({ state: { metric: 'late-orders', says: { bad: 'x'.repeat(81) } } }).at, 'header.state.says.bad');
  assert.equal(refusalOf({ search: { param: 'Two words' } }).at, 'header.search');
  assert.equal(refusalOf({ back: { page: 'a', list: 'b' } }).at, 'header.back');
  assert.equal(refusalOf({ byline: 'yes' }).at, 'header.byline');
  assert.equal(refusalOf('Shop floor').at, 'header');
});

const FIGURES: Record<string, HeadFigure> = {
  'open-orders': { value: 7, said: '7' },
  'late-orders': { value: 2, said: '2', tone: 'bad' },
  'empty-figure': { value: null, said: '' },
};
const READ: HeadRead = {
  figure: (id) => FIGURES[id] ?? null,
  now: '2026-10-15T09:00:00Z',
  zone: 'UTC',
  pageTitle: (id) => (id === 'workshop' ? 'Workshop' : null),
  listName: (id) => (id === 'orders' ? 'Orders' : null),
};

test('resolveHead answers each part with something to say', () => {
  const head = resolveHead(
    {
      kicker: 'day',
      count: { metric: 'open-orders' },
      state: { metric: 'late-orders', says: { good: 'Nothing is late', bad: 'Orders are late' } },
      action: { verb: 'row.create', label: 'Add an order' },
      search: { param: 'q' },
      back: { page: 'workshop' },
      byline: true,
    },
    READ,
  );
  assert.deepEqual(head, {
    kicker: 'Thursday 15 October',
    count: { value: 7, said: '7' },
    state: { tone: 'bad', words: 'Orders are late' },
    action: { verb: 'row.create', label: 'Add an order' },
    search: { param: 'q' },
    back: { href: '/p/workshop', label: 'Workshop' },
    byline: true,
  });
  assert.deepEqual(resolveHead({ back: { list: 'orders' } }, READ), { back: { href: '/r/orders', label: 'Orders' } });
});

test('resolveHead leaves out a part with nothing to say', () => {
  assert.deepEqual(resolveHead({ count: { metric: 'empty-figure' } }, READ), {}, 'a count whose figure has no value');
  assert.deepEqual(resolveHead({ count: { metric: 'gone-figure' } }, READ), {}, 'a count whose figure is gone');
  assert.deepEqual(resolveHead({ state: { metric: 'open-orders', says: { good: 'Fine' } } }, READ), {}, 'a state with no tone');
  assert.deepEqual(resolveHead({ state: { metric: 'late-orders', says: { good: 'Fine' } } }, READ), {}, 'a tone with no words');
  assert.deepEqual(resolveHead({ back: { page: 'gone-page' } }, READ), {}, 'a way back to a page that is gone');
  assert.deepEqual(resolveHead({ kicker: 'day' }, { ...READ, zone: 'Not/AZone' }), {}, 'a day in a zone nobody can read');
  assert.deepEqual(resolveHead({}, READ), {});
});
