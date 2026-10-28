/**
 * An arrangement accepted in part: a tick per part, a part whose key the record does not
 * hold unticked by itself with the part that needs it, and saying why; Accept sending the ticked ids, and the kernel
 * taking them. And an update that takes away a door messages still come to: it says they stop being filed,
 * and Accept asks twice, unless an add-on takes the door over.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { arrangePartsOf } from '@braindog/kernel';

import { copy } from '../../../lib/copy.ts';
import type { Fetch } from '../../../lib/record/boot-live.ts';
import { answerQuestion } from '../../../lib/record/decide-write.ts';
import { arrangedOf, asksTwice, stopping, ticksOf } from './arranged.ts';

/** Stripe in, with its key; the account ending 7731 patched; a Revenue page that reads what Stripe adds. */
const STRIPE = {
  why: ['Your money and numbers should stay current.'],
  packs: { install: ['stripe'] },
  plan: [{ pack: 'stripe', version: '1.0.0', adds: ['register.payments'] }],
  approve: ['CALLS OUT api.stripe.com · every 1d · grant "Stripe"'],
  needs: [{ label: 'Stripe', opens: 'api.stripe.com', scheduled: true, parts: ['install:stripe'] }],
  rows: [{ register: 'accounts', at: 'accounts#2', version: 3, patch: { last4: '7731' } }],
  pages: [{ id: 'page.revenue', kind: 'page', part: 'page:revenue', body: { title: 'Revenue', requires: ['register.payments'] } }],
  parts: [
    { id: 'install:stripe', kind: 'install', label: 'Add Stripe', pack: 'stripe' },
    { id: 'rows:accounts', kind: 'rows', label: 'Changes to Accounts', register: 'accounts' },
    { id: 'page:revenue', kind: 'page', label: 'The Revenue page', page: 'page.revenue', requires: ['install:stripe'] },
  ],
  names: { 'register.accounts': 'Accounts' },
};

const none = new Map<string, 'connector' | 'person'>();

test('every part gets a tick, named as the record filed it, and nothing is off while the key is held', () => {
  const out = arrangedOf('arrange', STRIPE, { held: new Map([['Stripe', 'connector']]) });
  /* IN THE ORDER THE KERNEL APPLIES THEM: installs, pages, then entries. */
  assert.deepEqual(
    out?.takes?.map((t) => t.name),
    ['Add Stripe', 'The Revenue page', 'Changes to Accounts'],
  );
  const { off, parts } = ticksOf(out!.takes!);
  assert.equal(off.size, 0);
  assert.equal(parts, undefined, 'every part ticked must send no parts, which is the whole');
});

test('a part whose key is not held unticks itself and the part that needs it, and says why', () => {
  const takes = arrangedOf('arrange', STRIPE, { held: none })!.takes!;
  const { off, parts } = ticksOf(takes);
  assert.equal(off.get('install:stripe'), 'Stays open until “Stripe” is held.');
  assert.equal(off.get('page:revenue'), 'Waits for “Add Stripe”, which it cannot be taken without.');
  assert.deepEqual(parts, ['rows:accounts']);
  /* THE KERNEL TAKES WHAT IS SENT: nothing taken needs a part left behind. */
  const kernel = arrangePartsOf(STRIPE);
  for (const id of parts!) for (const on of kernel.find((p) => p.id === id)!.needs) assert.ok(parts!.includes(on), `${id} is sent without ${on}`);
});

test('a key held only for a person is not held for a scheduled run, and a key the screen could not read says nothing', () => {
  const person = ticksOf(arrangedOf('arrange', STRIPE, { held: new Map([['Stripe', 'person']]) })!.takes!);
  assert.ok(person.off.has('install:stripe'));
  const unknown = ticksOf(arrangedOf('arrange', STRIPE)!.takes!);
  assert.equal(unknown.off.size, 0);
});

test('a part unticked by hand is left, with what needs it, and none ticked sends none', () => {
  const takes = arrangedOf('arrange', STRIPE, { held: new Map([['Stripe', 'connector']]) })!.takes!;
  const hand = ticksOf(takes, new Set(['install:stripe']));
  assert.equal(hand.off.get('install:stripe'), '');
  assert.ok(hand.off.get('page:revenue')?.startsWith('Waits for'));
  assert.deepEqual(hand.parts, ['rows:accounts']);
  assert.deepEqual(ticksOf(takes, new Set(['install:stripe', 'rows:accounts'])).parts, []);
});

test('a body filed before parts existed draws no ticks, and a proposal that is not an arrangement has none', () => {
  const { parts: _parts, ...old } = STRIPE;
  assert.equal(arrangedOf('arrange', old)?.takes, undefined);
  assert.equal(arrangedOf('pack', { install: 'stripe', title: 'Stripe' })?.takes, undefined);
});

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('Accept sends the ticked parts, says the rest is still open, and never sends an empty list', async () => {
  const sent: unknown[] = [];
  const io = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return json({ ok: true, value: { decision: 'D9', suggestion: 'SG4', status: 'open', wrote: [] } });
  }) as Fetch;
  const out = await answerQuestion('http://record.test', 'SG4', 'accept', undefined, io, undefined, ['rows:accounts']);
  assert.deepEqual(out, { from: 'written', decision: 'D9', open: true });
  assert.deepEqual(sent[0], { id: 'SG4', decide: { option: 'accept', parts: ['rows:accounts'] } });
  assert.deepEqual(await answerQuestion('http://record.test', 'SG4', 'accept', undefined, io, undefined, []), { from: 'refused', fix: copy.arrangeTakeNone });
  assert.equal(sent.length, 1);
});

test('the note under the keys says a part stays open until its key is held', () => {
  assert.match(copy.arrangeNeedsNote, /stays open until its key is held/u);
});

/** Money's update that drops the bank text door, which still took a message this month. */
const UPDATE = (gone: Record<string, unknown>) => ({
  install: 'money-core',
  plan: [{ pack: 'money-core', from: '2.3.0', version: '2.4.0', retires: [{ id: 'door.bank-texts', rows: 0, ...gone }] }],
});

test('a live door that goes with nobody to take it says messages stop being filed, and Accept asks twice', () => {
  const out = arrangedOf('pack', UPDATE({ live: true }));
  const stops = out?.parts.find((p) => p.part === 'stops');
  assert.deepEqual(stops?.part === 'stops' && stops.lines, ['Bank texts goes. Messages to this address will stop being filed.']);
  assert.equal(asksTwice(out, undefined), true);
  assert.equal(copy.arrangeStopsAgain(out!.stops!.map((s) => s.name)), 'Messages to Bank texts will stop being filed. Press Accept again to go ahead.');
});

test('a live door an add-on takes over names it as a second step, and asks once', () => {
  /* `{ pack, name }` is what retires-48 files (`arrange-retires.ts` `retireMarks`); the other two are read as well. */
  for (const by of [{ taken_by: { pack: 'bank-eg', name: 'Banque Misr' } }, { taken_by: 'bank-eg', taken_by_name: 'Banque Misr' }, { taken_by: { id: 'bank-eg', name: 'Banque Misr' } }]) {
    const out = arrangedOf('pack', UPDATE({ live: true, ...by }));
    assert.equal(out?.parts.some((p) => p.part === 'stops'), false);
    assert.match(JSON.stringify(out), /Bank texts moves to Banque Misr, which this same yes adds\./u);
    assert.equal(asksTwice(out, undefined), false);
  }
});

test('a door with no arrivals reads as it always did, and asks once', () => {
  const out = arrangedOf('pack', UPDATE({}));
  assert.equal(out?.stops, undefined);
  assert.match(JSON.stringify(out), /Takes away/u);
  assert.equal(asksTwice(out, undefined), false);
});

test('in an arrangement, Accept asks twice only when the part that takes the door away is taken', () => {
  const body = { ...STRIPE, plan: [{ ...STRIPE.plan[0], retires: [{ id: 'door.bank-texts', rows: 0, live: true }] }] };
  const out = arrangedOf('arrange', body, { held: new Map([['Stripe', 'connector']]) });
  assert.equal(asksTwice(out, ['install:stripe', 'rows:accounts']), true);
  assert.equal(asksTwice(out, ['rows:accounts']), false);
});

test('an add-on that takes a live door over, left unticked while the update is taken, asks twice', () => {
  const body = {
    ...STRIPE,
    packs: { install: ['stripe', 'bank-eg'] },
    plan: [
      { ...STRIPE.plan[0], retires: [{ id: 'door.bank-texts', rows: 0, live: true, taken_by: { pack: 'bank-eg', name: 'Banque Misr' } }] },
      { pack: 'bank-eg', version: '1.0.0', adds: ['door.bank-texts'] },
    ],
    parts: [...STRIPE.parts, { id: 'install:bank-eg', kind: 'install', label: 'Add Banque Misr', pack: 'bank-eg' }],
  };
  const out = arrangedOf('arrange', body, { held: new Map([['Stripe', 'connector']]) });
  assert.equal(out?.parts.some((p) => p.part === 'stops'), false, 'a door an add-on takes over is said as a move, not as stopping');
  assert.equal(asksTwice(out, undefined), false);
  assert.equal(asksTwice(out, ['install:stripe', 'install:bank-eg', 'rows:accounts']), false);
  assert.equal(asksTwice(out, ['install:stripe', 'rows:accounts']), true);
  assert.deepEqual(stopping(out, ['install:stripe', 'rows:accounts']).map((s) => s.name), ['Bank texts']);
  assert.equal(asksTwice(out, ['install:bank-eg', 'rows:accounts']), false);
});

test('a question with no parts sends none, and an accept of every part sends none', async () => {
  const sent: Record<string, unknown>[] = [];
  const io = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return json({ ok: true, value: { decision: 'D9', suggestion: 'SG4', status: 'resolved', wrote: [] } });
  }) as Fetch;
  assert.equal(ticksOf([]).parts, undefined);
  await answerQuestion('http://record.test', 'SG4', 'accept', undefined, io);
  await answerQuestion('http://record.test', 'SG4', 'accept', undefined, io, undefined, undefined);
  for (const s of sent) assert.equal('parts' in (s.decide as Record<string, unknown>), false);
});

/* THE SCREEN'S HALF, read as source the way `page.test.ts` reads it: the ticks come by context, and Accept sends them. */
const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const story = readFileSync(new URL('./Arranged.svelte', import.meta.url), 'utf8');

test('the question page hands the ticks down, sends the parts, and asks twice before it sends', () => {
  assert.match(page, /setContext\(TICKS_CONTEXT,/u);
  assert.match(page, /answerQuestion\(apiBase\(\), a\.question, a\.option, said, undefined, rows, parts\)/u);
  assert.match(page, /asksTwice\(story, taking\?\.parts\)/u);
  assert.match(story, /getContext<TicksContext \| undefined>\(TICKS_CONTEXT\)/u);
  assert.match(story, /type="checkbox"/u);
});
