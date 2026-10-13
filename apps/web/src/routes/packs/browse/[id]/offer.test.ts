/**
 * The install card's sentences of what waits (`offer.ts`): the parts the plan left out until the record holds a list
 * (SHL-A11). Which key an install sends to which host is the plan sheet's (`$lib/market/plan.ts`). And an update that
 * waits on another (`afterOthers`, `installInTurn`): the listing's own page takes the holder's update first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { SharedPlan } from '../../sharing.ts';
import { sheetOf } from '../../../../lib/market/plan.ts';
import { afterOthers, diffOf, installInTurn, sheetWords, waitsOf, type Offered, type Planned } from './offer.ts';

const planned = (diff: Record<string, unknown>, planHash = 'h'): Planned => ({ kind: 'pack', doc: {}, diff, planHash, approve: [] });

const NAMES: Readonly<Record<string, string>> = { people: 'People', clients: 'Clients', fx: 'Rates', 'page.clients-board': 'Client board' };
const nameOf = (id: string): string => NAMES[id] ?? id;

test('what waits is said by name: the whole thing, or how many parts of it', () => {
  const diff = {
    waiting: [
      { at: 'register.clients.fields[2]', holds: ['people'] },
      { at: 'register.clients.fields[4]', holds: ['people'] },
      { at: 'page.clients-board', holds: ['people', 'rates'] },
      { at: 'register.clients.roles.rates', holds: ['fx'] },
    ],
  };
  assert.deepEqual(waitsOf(planned(diff), nameOf), ['2 parts of Clients wait until you have People.', 'Client board waits until you have People and exchange rates.', 'One part of Clients waits until you have Rates.']);
});

test('nothing waiting says nothing, and neither does a plan it cannot read', () => {
  assert.deepEqual(waitsOf(planned({ waiting: [] }), nameOf), []);
  assert.deepEqual(waitsOf(planned({}), nameOf), []);
  assert.deepEqual(waitsOf(planned({ waiting: [null, { at: 7 }, { at: 'register.clients', holds: [] }] }), nameOf), []);
  assert.deepEqual(waitsOf({ kind: 'usecase', plan: { packs: [] } as unknown as SharedPlan }, nameOf), []);
});

test('the install card draws what waits under the plan, and what it sends once, on the plan\'s own lines, in words with no dash in them', () => {
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /extra=\{waits\.length > 0 \? told : undefined\}/u);
  /* WHAT IT SENDS IS SAID ONCE, by the plan sheet's calls group (`$lib/market/plan.ts` writes each line with `doesOf`). */
  assert.doesNotMatch(page, /\{#each sends as line/u);
  assert.match(page, /\{#each waits as line \(line\)\}/u);
  assert.match(readFileSync(new URL('../../../../lib/market/plan.ts', import.meta.url), 'utf8'), /doesOf\('install', \{ calls_out: \[/u);
  for (const word of Object.values(sheetWords)) assert.ok(!/[\u2013\u2014]/u.test(word), word);
});

/* ── an update that goes in after another (`lib/market/update-order.ts`) ──────────────────────────────────────────── */

const personalFile = { usecase: 'personal', version: '2.4.0', pack: { pack: 'usecase-personal', hands: { 'metric.budgets-set': 'money-core' } } };
const personal: Offered = { key: 'usecase:personal', kind: 'usecase', id: 'personal', title: 'Personal', source: 'bundled', file: { doc: null, text: JSON.stringify(personalFile) } };
const money: Offered = { key: 'module:money-core', kind: 'module', id: 'money-core', title: 'Money', source: 'bundled', file: { doc: null, text: null } };

const personalPlan = { usecase: { id: 'personal', title: 'Personal', version: '2.4.0' }, packs: [], approve: [] } as unknown as SharedPlan;
const moneyPlan = (held: boolean, hash = 'h1'): Planned =>
  planned({ pack: { id: 'money-core', version: '3.17.0' }, planHash: hash, direction: 'upgrade', installed_version: '3.16.0', conflicts: held ? [{ id: 'metric.budgets-set', pack: 'usecase-personal' }] : [] }, hash);
const TITLES: Readonly<Record<string, string>> = { 'usecase-personal': 'Personal', 'money-core': 'Money', 'metric.budgets-set': 'Budgets set' };
const titleOf = (id: string): string => TITLES[id] ?? id;
const details = (p: Planned): string[] => (sheetOf(diffOf(p), titleOf)?.parts ?? []).flatMap((part) => part.sections.flatMap((s) => s.rows.map((r) => `${r.text} ${r.detail ?? ''}`)));

test('Money, with Personal waiting and handing it something, is no dead end: the sheet says it goes in after Personal', async () => {
  /* Alone, it is the stop the record gives, and Approve is greyed. */
  const alone = moneyPlan(true);
  assert.deepEqual(sheetOf(diffOf(alone), titleOf)?.stops, ['Budgets set is already here, from Personal']);

  const asked: string[] = [];
  const out = await afterOthers(alone, money, [personal, money], async (u) => {
    asked.push(u.title);
    return { ok: true, planned: { kind: 'usecase', plan: personalPlan } };
  });
  assert.deepEqual(asked, ['Personal']);
  assert.deepEqual((out.kind === 'pack' ? (out.after?.first ?? []) : []).map((t) => t.of.title), ['Personal']);
  const sheet = sheetOf(diffOf(out), titleOf);
  assert.deepEqual(sheet?.stops, [], 'a wait is an order, and stops nothing');
  assert.ok(details(out).some((line) => line.includes('goes in after Personal')), details(out).join(' | '));
  /* What installs is still the plan the record made. */
  assert.equal(out.kind === 'pack' ? out.diff : null, alone.kind === 'pack' ? alone.diff : undefined);
});

test('a holder from the Kennel is not taken along from another page: it is named as the step to take first', async () => {
  const far: Offered = { ...personal, source: 'kennel' };
  const out = await afterOthers(moneyPlan(true), money, [far], async () => assert.fail('its plan is read on its own page'));
  assert.deepEqual(sheetOf(diffOf(out), titleOf)?.stops, ['Update Personal first, which hands Budgets set on to this']);
});

test('nothing waiting, a holder with no update, and a use case leave the plan as it was', async () => {
  const none = async () => assert.fail('nothing to plan');
  const plain = moneyPlan(true);
  assert.equal(await afterOthers(plain, money, [], none), plain);
  assert.equal(await afterOthers(plain, money, [money], none), plain);
  const whole: Planned = { kind: 'usecase', plan: personalPlan };
  assert.equal(await afterOthers(whole, personal, [money], none), whole);
});

test('a holder whose plan cannot be read stays the step to take first', async () => {
  const out = await afterOthers(moneyPlan(true), money, [personal], async () => ({ ok: false, fix: 'no', code: null }));
  assert.deepEqual(sheetOf(diffOf(out), titleOf)?.stops, ['Update Personal first, which hands Budgets set on to this']);
});

test('Approve puts Personal in first, then plans Money again and installs that plan', async () => {
  const first = await afterOthers(moneyPlan(true), money, [personal], async () => ({ ok: true, planned: { kind: 'usecase', plan: personalPlan } }));
  const went: string[] = [];
  const out = await installInTurn(first, {
    replan: async (u) => {
      went.push(`plan ${u.title}`);
      return { ok: true, planned: moneyPlan(false, 'h2') };
    },
    install: async (p) => {
      went.push(p.kind === 'usecase' ? 'install Personal' : `install Money ${p.planHash}`);
      return { ok: true, nav: p.kind === 'usecase' ? ['home'] : null };
    },
  });
  assert.deepEqual(went, ['install Personal', 'plan Money', 'install Money h2']);
  assert.deepEqual(out, { ok: true, nav: ['home'] });
});

test('a refusal on the way keeps its code, and Money already brought in by Personal is passed over', async () => {
  const first = await afterOthers(moneyPlan(true), money, [personal], async () => ({ ok: true, planned: { kind: 'usecase', plan: personalPlan } }));
  const refused = await installInTurn(first, { replan: async () => assert.fail('never reached'), install: async () => ({ ok: false, fix: 'Only the owner installs.', code: 'FORBIDDEN' }) });
  assert.deepEqual(refused, { ok: false, fix: 'Only the owner installs.', code: 'FORBIDDEN' });

  const went: string[] = [];
  const brought = planned({ pack: { id: 'money-core', version: '3.17.0' }, planHash: 'h3', installed_version: '3.17.0' });
  const out = await installInTurn(first, {
    replan: async () => ({ ok: true, planned: brought }),
    install: async (p) => {
      went.push(p.kind);
      return { ok: true, nav: null };
    },
  });
  assert.deepEqual(went, ['usecase']);
  assert.equal(out.ok, true);
});

test('the listing hands its plan what else waits, so the wait is read where the update is pressed', () => {
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /planFor\(client, listing, file, held, copy\.writeRaced, \(\) => waitingOf\(fetch, kennel, held\)\)/u);
});
