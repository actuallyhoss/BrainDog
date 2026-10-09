/**
 * The offer on a list's own screen (USE-B03), read against the week offer the record sends for Mariam's Orders
 * (offer-pattern-45): one card on Orders, none on People, Not now hides it, and Make it keeps it once.
 *
 * THE CARD IS COMPILED HERE, FOR THE SERVER, as `icons-set.test.ts` does, because `node --test` cannot load a `.svelte`
 * file and the claim is about what the card draws. Its two presses are `offerActs` in `pen.ts`, plain functions, so they
 * are pressed here directly with the pen's keep and dismissal stood in for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { draftDrawing, offerActs, offerFor, offerWords, penOf, slugOfDraft, type OfferActs, type PenItem } from './pen.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { default: OfferCard } = (await import(new URL('./OfferCard.svelte', import.meta.url).href)) as {
  default: Component<{ item: PenItem; acts: Pick<OfferActs, 'make' | 'notNow'>; busy?: string | null }>;
};

/* THE RECORD'S `pen` ON BOOT, in the shape `emergent.ts` sends it: Orders' week first, then a column for People. */
const draft = {
  id: 'page.orders-week',
  kind: 'page',
  body: {
    page: 'orders-week',
    title: 'Orders this week',
    nav: { section: 'Orders', order: 20 },
    blocks: [
      { kind: 'stat', cells: [{ metric: 'orders.count' }, { metric: 'orders.total' }] },
      { kind: 'table', heading: 'Due this week', source: 'register.orders', limit: 50 },
      { kind: 'table', heading: 'Owed', source: 'register.orders', limit: 50 },
      { kind: 'table', heading: 'Running low', source: 'register.products', limit: 50 },
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

const open = { suggest: true, gone: () => false };

/** The pen's keep and dismissal stood in for, counting what each was asked. */
function standIns(answer: { kept?: string; dismissed?: string } = {}) {
  const asked = { keep: [] as string[], dismiss: [] as string[], went: [] as string[], said: [] as string[] };
  const acts = offerActs({
    keep: async (item) => {
      asked.keep.push(item.id);
      await new Promise((r) => setTimeout(r, 5));
      return { from: answer.kept ?? 'kept' };
    },
    dismiss: async (id) => {
      asked.dismiss.push(id);
      return answer.dismissed === 'refused' ? { from: 'refused', fix: 'Could not be kept.' } : { from: 'kept' };
    },
    go: (slug) => void asked.went.push(slug),
    say: (text) => void asked.said.push(text),
    words: { made: (t) => `${t} is in your nav.`, dismissed: (t) => `${t} will not be offered again.`, notReached: 'Not reached.' },
  });
  return { acts, asked };
}

test('one offer is drawn for Orders and none for People', () => {
  const orders = offerFor(pen, 'orders', open);
  assert.equal(orders?.id, 'week:orders');
  assert.equal(offerFor(pen, 'people', open), null);

  const { acts } = standIns();
  const html = render(OfferCard, { props: { item: orders!, acts } }).body;
  assert.equal(html.match(/data-offer="/g)?.length, 1);
  for (const said of [offerWords.noticed, orders!.why, offerWords.make, offerWords.notNow]) assert.ok(html.includes(said), said);
  /* THE DRAWING NAMES EVERY BLOCK, IN ORDER, AND DRAWS NO NUMBER: it has read nothing. */
  const names = draftDrawing(orders!).blocks.map((b) => b.name);
  assert.deepEqual(names, [offerWords.figures, 'Due this week', 'Owed', 'Running low']);
  const mini = /<div class="offer-mini[^"]*"[^>]*>([\s\S]*?)<div class="offer-acts/.exec(html)?.[1] ?? '';
  for (const n of names) assert.ok(mini.includes(n), n);
  assert.doesNotMatch(mini.replace(/<[^>]*>/g, ''), /\d/);
});

test('the pen switched off, or the offer dismissed, draws none', () => {
  assert.equal(offerFor(pen, 'orders', { suggest: false, gone: () => false }), null);
  assert.equal(offerFor(pen, 'orders', { suggest: true, gone: (id) => id === 'week:orders' }), null);
});

test('Not now hides it at once and writes the dismissal; a refused one comes back', async () => {
  const { acts, asked } = standIns();
  const item = offerFor(pen, 'orders', open)!;
  await acts.notNow(item);
  assert.deepEqual(asked.dismiss, ['week:orders']);
  assert.equal(offerFor(pen, 'orders', { suggest: true, gone: acts.hidden }), null);
  assert.deepEqual(asked.said, ['Orders this week will not be offered again.']);

  const refused = standIns({ dismissed: 'refused' });
  await refused.acts.notNow(item);
  assert.equal(offerFor(pen, 'orders', { suggest: true, gone: refused.acts.hidden })?.id, 'week:orders');
  assert.deepEqual(refused.asked.said, ['Could not be kept.']);
});

test('Make it calls keep once, however often it is pressed, and goes to the page made', async () => {
  const { acts, asked } = standIns();
  const item = offerFor(pen, 'orders', open)!;
  const [first, second] = await Promise.all([acts.make(item), acts.make(item)]);
  assert.deepEqual([first, second], [true, false]);
  assert.deepEqual(asked.keep, ['week:orders']);
  assert.deepEqual(asked.went, [slugOfDraft(item)]);
  assert.equal(asked.went[0], 'orders-week');
  assert.equal(offerFor(pen, 'orders', { suggest: true, gone: acts.hidden }), null);
  assert.equal(acts.busy(), null);
});

test('a refused keep leaves the offer drawn and says the record\'s sentence', async () => {
  const { acts, asked } = standIns({ kept: 'refused' });
  const item = offerFor(pen, 'orders', open)!;
  assert.equal(await acts.make(item), false);
  assert.deepEqual(asked.went, []);
  assert.equal(offerFor(pen, 'orders', { suggest: true, gone: acts.hidden })?.id, 'week:orders');
});

test('the list screen draws the card from `offerFor` for the list it reads', () => {
  const screen = readFileSync(new URL('../../routes/r/[register]/+page.svelte', import.meta.url), 'utf8');
  assert.match(screen, /import OfferCard from '\$lib\/design\/OfferCard\.svelte'/);
  assert.match(screen, /offerFor\(shell\.pen \?\? \[\], id,/);
  assert.match(screen, /<OfferCard item=\{offer\}/);
});

test('a plain page offer, made the day a list holds a row, is never the card: it is not drawn from use', () => {
  const plain = penOf([
    {
      id: 'page:products',
      kind: 'page',
      register: 'products',
      title: 'Products',
      why: 'Products has 2 entries and no page yet.',
      change: { to: { id: 'page.products', kind: 'page', body: { page: 'products', blocks: [{ kind: 'table', source: 'register.products' }] } } },
      list: 'products',
      draft: { id: 'page.products', kind: 'page', body: { page: 'products', blocks: [{ kind: 'table', source: 'register.products' }] } },
    },
  ]);
  assert.equal(offerFor(plain, 'products', open), null);
});

/* ── on a real record: the pen `boot` answers, by the record's age, and Make it against the record's own write ── */

/* LOADED BY A RUNTIME URL so the web's typecheck does not walk the record's sources, which other packages own. */
const at = (p: string) => new URL(`../../../../../packages/${p}`, import.meta.url).href;
const { createRecordApi } = await import(at('record/src/index.ts'));
const { penFor } = await import(at('record/src/emergent.ts'));
const { fixedClock, openSqlite } = await import(at('kernel/test/sqlite.ts'));

const DAY = 86_400_000;
/** A Tuesday: day 13 is the Monday of the week the orders fall due in, day 15 its Wednesday. */
const BORN = Date.parse('2026-09-01T09:00:00Z');
const owner = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const ok = <T>(r: { ok: boolean; value?: T; refusal?: { fix: string } }): T => {
  assert.ok(r.ok, r.refusal?.fix);
  return r.value as T;
};

/** A record made on `BORN` with Orders and no page of it, four orders due in the week of day 13, read on three weeks. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(BORN);
  const api = await createRecordApi({ sql, clock });
  ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-shop', name: 'The Shop', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  const fields = [
    { id: 'what', label: 'What', type: 'text', required: true },
    { id: 'due', label: 'Due', type: 'day', index: true, deadline: true },
    { id: 'paid', label: 'Paid', type: 'money' },
    { id: 'state', label: 'Status', type: 'enum', values: ['new', 'sent', 'paid'], default: 'new', required: true, index: true },
  ];
  ok(await api.kernel.install([{ id: 'register.orders', kind: 'register', body: { id: 'orders', name: 'Orders', title: 'what', fields, state: 'state', done: ['paid'] } }]));
  for (const day of [0, 7, 13]) {
    clock.set(BORN + day * DAY);
    ok(api.kernel.observe([{ kind: 'register.read', subject: 'orders' }]));
  }
  for (const [i, due] of ['2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18'].entries()) ok(api.kernel.create('orders', { what: `Order ${i + 1}`, due }, { actor: 'p_owner' }));
  /** The pen on day `day`, as `boot` asks it, read the way the shell reads it. */
  const penOn = (day: number): PenItem[] => {
    const nowMs = BORN + day * DAY;
    clock.set(nowMs);
    return penOf(penFor({ kernel: api.kernel, reads: () => true, pages: api.kernel.pages(), dismissed: new Set<string>(), use: { sql, nowMs } }));
  };
  return { api, penOn };
}

test('in the record\'s first 14 days no card is drawn, though the pen holds a page offer for the list; on day 15 one is', async () => {
  const { penOn } = await record();
  for (const day of [0, 7, 13]) {
    const pen = penOn(day);
    assert.ok(pen.some((p) => p.kind === 'page' && p.list === 'orders'), `day ${day}: the pen held no page offer, so this proves nothing`);
    assert.equal(offerFor(pen, 'orders', open), null, `a card was drawn on day ${day}`);
  }
  assert.equal(offerFor(penOn(15), 'orders', open)?.id, 'week:orders');
});

test('Make it pressed twice, at once and again after, makes one page', async () => {
  const { api, penOn } = await record();
  const item = offerFor(penOn(15), 'orders', open)!;
  let writes = 0;
  const acts = offerActs({
    /* THE WRITE `keep.ts` MAKES: the whole body, at version 0 for a page not there yet. */
    keep: async (it) => {
      writes += 1;
      const out = await api.setDeclaration({ body: it.change.to.body, version: 0 }, owner);
      return out.ok ? { from: 'kept' } : { from: 'refused', fix: out.refusal.fix };
    },
    dismiss: async () => ({ from: 'kept' }),
    go: () => {},
    say: () => {},
    words: { made: (t) => t, dismissed: (t) => t, notReached: 'Not reached.' },
  });
  const both = await Promise.all([acts.make(item), acts.make(item)]);
  assert.deepEqual(both, [true, false]);
  assert.equal(await acts.make(item), false, 'a press on the card after it was made wrote again');
  assert.equal(writes, 1);
  assert.equal(api.kernel.pages().filter((p: { slug: string }) => p.slug === 'orders-week').length, 1);
  assert.equal(offerFor(penOn(16), 'orders', open), null, 'the page made, the card came back');
});
