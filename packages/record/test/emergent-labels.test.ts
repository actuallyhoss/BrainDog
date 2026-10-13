/**
 * The week offer names a list by the word the record speaks for it (`emergent.ts`, `saidWords`, `weeksOffered`).
 *
 * WHAT IS HELD: a list declared as Orders and shown as Jobs (Settings, Words) is offered "4 jobs due this week", never
 * its declared "orders"; a list nobody renamed reads as it did; the person's own singular is the word many is built
 * from; a renamed list drops the singular it declared, which names the old word; and a proper noun keeps its capital,
 * where it can be told from a sentence's first capital: a word after the name's first, a word typed in capitals, and a
 * word the person's own singular writes with a capital.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi } from '../src/index.ts';
import { manySaid, penFor, saidWords, weekSaid, type PenItem } from '../src/emergent.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
/** A Tuesday, so day 15 is the Wednesday of the week of day 13 to day 19. */
const BORN = Date.parse('2026-09-01T09:00:00Z');
const ASK = 'Want a page of their own for them?';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const ORDERS = {
  id: 'register.orders',
  kind: 'register',
  body: {
    id: 'orders',
    name: 'Orders',
    one: 'order',
    title: 'what',
    fields: [
      { id: 'what', label: 'What', type: 'text', required: true },
      { id: 'due', label: 'Due', type: 'day', index: true, deadline: true },
      { id: 'state', label: 'Status', type: 'enum', values: ['new', 'sent', 'paid'], default: 'new', required: true, index: true },
    ],
    state: 'state',
    done: ['paid'],
  },
} as unknown as Declaration;

/** A record 15 days old holding Orders, four of them due this week, read on three different weeks. */
async function shop() {
  const sql = openSqlite();
  const clock = fixedClock(BORN);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-shop', name: 'The Shop', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  value(await api.kernel.install([ORDERS]));
  for (const day of [0, 7, 13]) {
    clock.set(BORN + day * DAY);
    value(api.kernel.observe([{ kind: 'register.read', subject: 'orders' }]));
  }
  for (const [i, due] of ['2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18'].entries())
    value(api.kernel.create('orders', { what: `Order ${i + 1}`, due }, { actor: 'p_owner' }));

  /** The week offer on day 15, with the record's labels as `labelsOf` answers them. */
  const week = (labels?: Record<string, string>): PenItem => {
    const nowMs = BORN + 15 * DAY;
    clock.set(nowMs);
    const pen = penFor({ kernel: api.kernel, reads: () => true, pages: api.kernel.pages(), dismissed: new Set(), use: { sql, nowMs }, ...(labels ? { labels } : {}) });
    const offer = pen.find((i) => i.id === 'week:orders');
    assert.ok(offer, 'Orders was not offered its week');
    return offer;
  };
  return { week };
}

test('A LIST DECLARED AS ORDERS AND SHOWN AS JOBS IS OFFERED ITS JOBS, and an unrenamed list reads as it did', async () => {
  const { week } = await shop();
  assert.equal(week().why, `4 orders due this week. ${ASK}`);
  assert.equal(week({}).why, `4 orders due this week. ${ASK}`);
  /* Another list's word, and a field's, are not this list's name. */
  assert.equal(week({ products: 'Stock', 'orders.state': 'Stage' }).why, `4 orders due this week. ${ASK}`);
  assert.equal(week({ orders: 'Jobs' }).why, `4 jobs due this week. ${ASK}`);
  assert.doesNotMatch(week({ orders: 'Jobs' }).why, /orders/iu, 'the declared word was still said');
  /* The person's own singular is the word many is built from. */
  assert.equal(week({ 'orders:one': 'job' }).why, `4 jobs due this week. ${ASK}`);
  assert.equal(week({ orders: 'Client work', 'orders:one': 'commission' }).why, `4 commissions due this week. ${ASK}`);
  /* The signature is the list's, whatever it is called, so a Not now still holds after a rename. */
  assert.equal(week({ orders: 'Jobs' }).id, 'week:orders');
});

test('THE WORDS A LIST IS SAID BY: the record\'s label, else the declared word, and a stale singular is let go', () => {
  assert.deepEqual(saidWords('orders', 'Orders', 'order', undefined), { name: 'Orders', one: 'order', proper: new Set() });
  assert.deepEqual(saidWords('orders', 'Orders', 'order', {}), { name: 'Orders', one: 'order', proper: new Set() });
  /* A label that is empty, or the declared name again, renames nothing. */
  assert.deepEqual(saidWords('orders', 'Orders', 'order', { orders: '  ' }), { name: 'Orders', one: 'order', proper: new Set() });
  assert.deepEqual(saidWords('orders', 'Orders', 'order', { orders: 'Orders' }), { name: 'Orders', one: 'order', proper: new Set() });
  /* RENAMED WITH NO SINGULAR OF ITS OWN: "order" names the old word, so many is read off the new name. */
  const jobs = saidWords('orders', 'Orders', 'order', { orders: 'Jobs' });
  assert.deepEqual(jobs, { name: 'Jobs', one: undefined, proper: new Set() });
  assert.equal(manySaid(jobs.name, jobs.one, jobs.proper), 'jobs');
  /* A new name that is not a word for many takes "entries", never the old "orders". */
  const work = saidWords('orders', 'Orders', 'order', { orders: 'Client work' });
  assert.equal(weekSaid(6, work.name, work.one, false, work.proper), `6 client work entries this week. ${ASK}`);
  /* One of them, in the person's singular. */
  const one = saidWords('orders', 'Orders', 'order', { orders: 'Jobs', 'orders:one': 'job' });
  assert.equal(weekSaid(1, one.name, one.one, true, one.proper), `1 job due this week. ${ASK}`);
});

test('A PROPER NOUN IS NOT LOWERED, where it can be told from the capital a name starts with', () => {
  /* A word after the first is capitalised on purpose: a name is written as a sentence starts. */
  assert.equal(manySaid('Orders from Etsy', undefined), 'orders from Etsy entries');
  assert.equal(weekSaid(4, 'Trips to Cairo', undefined, false), `4 trips to Cairo entries this week. ${ASK}`);
  /* A NAME WITH A CAPITAL ON EVERY WORD IS A TITLE, and reads in lower case as it did. */
  assert.equal(manySaid('Client Work', undefined), 'client work entries');
  assert.equal(manySaid('Savings Goals', 'savings goal'), 'savings goals');
  /* A word typed in capitals was always kept. */
  assert.equal(manySaid('HSBC cards', 'card'), 'HSBC cards');
  /* THE FIRST WORD, by the person's own singular: Settings shows it in lower case, so a capital typed there is meant. */
  const etsy = saidWords('orders', 'Orders', 'order', { orders: 'Etsy orders', 'orders:one': 'Etsy order' });
  assert.deepEqual([...etsy.proper], ['etsy']);
  assert.equal(weekSaid(4, etsy.name, etsy.one, true, etsy.proper), `4 Etsy orders due this week. ${ASK}`);
  assert.equal(weekSaid(1, etsy.name, etsy.one, true, etsy.proper), `1 Etsy order due this week. ${ASK}`);
  /* A singular that is one capitalised word is a sentence's capital too, and is lowered with its name. */
  const plain = saidWords('orders', 'Orders', 'order', { orders: 'Jobs', 'orders:one': 'Job' });
  assert.equal(weekSaid(4, plain.name, plain.one, true, plain.proper), `4 jobs due this week. ${ASK}`);
  /* The first word alone, with no singular to say so, still reads as a sentence's capital. */
  const bare = saidWords('orders', 'Orders', 'order', { orders: 'Etsy orders' });
  assert.equal(weekSaid(4, bare.name, bare.one, true, bare.proper), `4 etsy orders due this week. ${ASK}`);
});

test('NEVER AN ID, A DASH OR THE WORD ROW, whatever the list is called', () => {
  for (const labels of [{ orders: 'Jobs' }, { orders: 'Etsy orders', 'orders:one': 'Etsy order' }, { 'orders:one': 'job' }]) {
    const w = saidWords('orders', 'Orders', 'order', labels);
    const said = weekSaid(4, w.name, w.one, true, w.proper);
    assert.doesNotMatch(said, /—|\brows?\b|\bentity\b|#|:one/u, said);
    assert.match(said, /^4 /u, 'the count leads');
  }
});
