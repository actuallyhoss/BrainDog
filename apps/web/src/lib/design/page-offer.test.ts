/**
 * The week offer on a declared page (use case 6, step 7), read against the shop's own Orders page as the use case
 * declares it and the week offer the record sends for Mariam's Orders (offer-pattern-45): one on /p/orders, none on
 * People, none after Not now, and none on the page the offer made.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES } from '@braindog/seed/usecases';

import { firstList, pageOffer, type OfferedPage } from './page-offer.ts';
import { offerActs, penOf, type OfferHeld } from './pen.ts';

/** The shop use case's Orders page, found in the declarations it installs, so the test reads the page she gets. */
function declaredPage(slug: string): OfferedPage {
  const seen = new Set<unknown>();
  const walk = (v: unknown): Record<string, unknown> | null => {
    if (v === null || typeof v !== 'object' || seen.has(v)) return null;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (o.page === slug && Array.isArray(o.blocks)) return o;
    for (const inner of Object.values(o)) {
      const found = walk(inner);
      if (found) return found;
    }
    return null;
  };
  const found = walk(USE_CASES);
  assert.ok(found, `no use case declares the ${slug} page`);
  return { slug, blocks: found.blocks as OfferedPage['blocks'] };
}

/* THE RECORD'S `pen` ON BOOT, in the shape `emergent.ts` sends it: Orders' week, then a column for People. */
const draft = {
  id: 'page.orders-week',
  kind: 'page',
  body: {
    page: 'orders-week',
    title: 'Orders this week',
    blocks: [
      { kind: 'stat', cells: [{ metric: 'orders.count' }] },
      { kind: 'table', heading: 'Due this week', source: 'register.orders', limit: 50 },
    ],
  },
};
const pen = penOf([
  {
    id: 'week:orders',
    kind: 'page',
    register: 'orders',
    title: 'Orders this week',
    why: 'Orders has 4 due this week. Give them a page of their own?',
    change: { to: draft },
    list: 'orders',
    draft,
  },
  {
    id: 'column:people:table:email',
    kind: 'column',
    register: 'people',
    title: 'People',
    why: 'Most people here have an email.',
    change: { to: { id: 'page.people', kind: 'page', body: { page: 'people', blocks: [] } } },
  },
]);

const held = (gone: (id: string) => boolean = () => false): OfferHeld => ({ suggest: true, gone });
const people: OfferedPage = { slug: 'people', blocks: [{ source: 'register.people' }] };

test("the shop's Orders page draws the week offer for Orders, its first list after the page's one line", () => {
  const orders = declaredPage('orders');
  assert.equal(firstList(orders), 'orders');
  assert.equal(pageOffer(pen, orders, held())?.id, 'week:orders');
});

test('People draws none: the offer is for Orders, and a column offer is never the card', () => {
  assert.equal(pageOffer(pen, people, held()), null);
});

test('a page reading no list draws none', () => {
  assert.equal(pageOffer(pen, { slug: 'note', blocks: [{}, { source: 'metric.orders-owed' }] }, held()), null);
});

test('after Not now the Orders page draws none, at once and from the record', async () => {
  const orders = declaredPage('orders');
  const acts = offerActs({
    keep: async () => ({ from: 'live' }),
    dismiss: async () => ({ from: 'live' }),
    go: () => {},
    say: () => {},
    words: { made: (t) => t, dismissed: (t) => t, notReached: 'Not reached' },
  });
  const offer = pageOffer(pen, orders, held(acts.hidden));
  assert.ok(offer);
  await acts.notNow(offer);
  assert.equal(pageOffer(pen, orders, held(acts.hidden)), null);
  assert.equal(pageOffer(pen, orders, held((id) => id === 'week:orders')), null, 'a dismissal on another device');
  assert.equal(pageOffer(pen, orders, { suggest: false, gone: () => false }), null, 'with the pen switched off');
});

test('the page the offer made draws none, though it reads the same list', () => {
  const made: OfferedPage = { slug: 'orders-week', blocks: draft.body.blocks };
  assert.equal(firstList(made), 'orders');
  assert.equal(pageOffer(pen, made, held()), null);
});
