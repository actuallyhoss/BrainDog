/**
 * The end of the first run offers one agent and one source, each saying what it would find in this BrainDog, then Home.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firstRun } from '../first-run.ts';
import { madeOffers, madeSteps } from './made.ts';
import { listsOfModules, listsOn, playedBy } from './parts.ts';

/** The lists a record made from these modules holds. */
const of = (...modules: string[]) => listsOfModules(modules);

test('ONE AGENT AND ONE SOURCE, the agent first, each saying what it would find', () => {
  const offers = madeOffers(of('portfolio', 'people', 'money-core'));
  assert.deepEqual(Object.keys(offers), ['agent', 'source'], 'the agent comes before the source');
  assert.equal(offers.agent.name, firstRun.agentName);
  assert.match(offers.agent.finds, /^Ask it about your /u, 'the agent says what it can be asked about here');
  assert.match(offers.source.finds, /^Forward them here, and Money fills itself/u, 'the bank says what forwarding does');
  for (const o of [offers.agent, offers.source]) assert.doesNotMatch(`${o.name} ${o.finds}`, /—|\brow\b/u, 'no em dash or "row" in copy a person reads');
});

test('WHAT THE AGENT WOULD FIND IS WHAT THIS BRAINDOG KEEPS, and nothing it does not', () => {
  assert.equal(madeOffers(of('portfolio', 'people')).agent.finds, firstRun.agentFinds([firstRun.agentProjects, firstRun.agentPeople]));
  assert.equal(madeOffers(of('work')).agent.finds, firstRun.agentFinds([firstRun.agentTasks]));
  assert.doesNotMatch(madeOffers(of('money-core')).agent.finds, /projects|people/u, 'a Money-only BrainDog has no projects to find');
  assert.equal(madeOffers([]).agent.finds, firstRun.agentFinds([]));
});

test('A SHOP\'S AGENT SEES ITS ORDERS AND CLIENTS by the names the record gives them, never projects it does not keep', () => {
  const shop = ['people', 'orders', 'products', ...of('money-core')];
  /* NAMED BY THE RECORD, as Home has them: the people are her clients (use case 6, step 2). */
  const named = shop.map((id) => ({ id, name: id === 'people' ? 'Clients' : id === 'orders' ? 'Orders' : id === 'products' ? 'Products' : 'Money' }));
  assert.equal(madeOffers(named).agent.finds, 'Ask it about your orders and clients, from the Claude app.');
  /* BY ID ALONE, as a caller with no names hands them: the shop's own list by the use case's name, the people by the house word. */
  assert.equal(madeOffers(shop).agent.finds, 'Ask it about your orders and the people you work with, from the Claude app.');
  /* A PRODUCT IS NOBODY'S, so the agent's line does not list it; and no id is ever said. */
  assert.doesNotMatch(madeOffers(named).agent.finds, /products|projects|tasks/u);
  assert.equal(madeOffers([{ id: 'zz_01HX', name: '' }]).agent.finds, firstRun.agentFinds([]), 'a list with no name is never said by its id');
});

test('THE SOURCE IS THE ONE WHOSE FINDS LAND HERE: a bank where money is kept, mail where people are, else a file', () => {
  assert.equal(madeOffers(of('portfolio', 'people', 'money-core')).source.kind, 'bank');
  assert.equal(madeOffers(of('portfolio', 'people')).source.kind, 'mail');
  assert.equal(madeOffers(of('portfolio')).source.kind, 'file');
  /* MAIL IS SET UP IN SETTINGS, WHAT COMES IN; a file is brought in from /start, which answering again adds to. */
  /* A BANK'S TEXTS OPEN ON THEIR OWN STEPS AND PASTE BOX (AH10); a file goes on to /start's import (AH31). */
  assert.equal(madeOffers(of('money-core')).source.href, '/settings/ingest#texts');
  assert.equal(madeOffers([]).source.href, '/start?more=1');
});

test('A LIST IS KNOWN BY THE PART IT PLAYS, read off its declaration and not its module', () => {
  assert.equal(playedBy('meets'), 'people');
  assert.equal(playedBy('projects'), 'things');
  assert.equal(playedBy('hand'), 'tasks');
  assert.equal(playedBy('rates'), 'fx');
  /* A RECORD THAT HOLDS ONLY MONEY'S RATES is still where money is kept. */
  assert.equal(madeOffers(['fx']).source.kind, 'bank');
  /* AND A LIST THAT PLAYS NOTHING, a use case's own, is not taken for one. */
  assert.equal(madeOffers(['clients']).source.kind, 'file');
});

test('THE LISTS A RECORD HOLDS are the lists of the packs that are on', () => {
  assert.deepEqual(
    listsOn([
      { disabled_at: null, registers: ['people', 'organisations'] },
      { disabled_at: '2026-10-01', registers: ['fx'] },
      { disabled_at: null, registers: ['things'] },
      { disabled_at: null },
    ]),
    ['people', 'organisations', 'things'],
  );
});

test('THE NEXT STEPS KEEP THE FIRST RUN\'S ORDER, and work that arrives by messages puts forwarding first', () => {
  const lists = of('portfolio', 'people', 'money-core');
  const kinds = (steps: ReturnType<typeof madeSteps>) => steps.map((s) => (s.kind === 'agent' ? 'agent' : s.source.kind));
  /* UNASKED, OR ANSWERED WITH AN APP OR IN PERSON: the agent first, as at /start#made. */
  for (const by of [undefined, 'app', 'in-person'] as const) assert.deepEqual(kinds(madeSteps(lists, by)), ['agent', 'bank'], `${by}`);
  /* MESSAGES: the bank's mail is forwarded, so it leads, and it is the same offer the first run made. */
  const steps = madeSteps(lists, 'messages');
  assert.deepEqual(kinds(steps), ['bank', 'agent']);
  assert.deepEqual(steps[0], { kind: 'source', source: madeOffers(lists).source });
  /* AND A RECORD THE LISTS ALONE WOULD OFFER A FILE: messages are forwarded, so the source is her mail, set up in Settings. */
  const fileOnly = madeSteps(of('portfolio'), 'messages');
  assert.deepEqual(kinds(fileOnly), ['mail', 'agent']);
  assert.equal(fileOnly[0]?.kind === 'source' && fileOnly[0].source.href, '/settings/ingest');
  assert.deepEqual(kinds(madeSteps(of('portfolio'))), ['agent', 'file'], 'without the answer a file is still a file');
});

test("HER FIRST TODAY'S NEXT STEPS, AS THE VISION ORDERS THEM: her orders come by messages, so the bank's texts lead, then Claude", () => {
  const steps = madeSteps([{ id: 'people', name: 'Clients' }, { id: 'orders', name: 'Orders' }, ...of('money-core')], 'messages');
  assert.deepEqual(steps.map((s) => (s.kind === 'agent' ? 'agent' : s.source.kind)), ['bank', 'agent']);
  const [bank, agent] = steps;
  assert.equal(bank?.kind === 'source' && bank.source.name, "Your bank's texts");
  assert.equal(agent?.kind === 'agent' && agent.agent.finds, 'Ask it about your orders and clients, from the Claude app.');
});

test('THE AGENT NAMES ONLY WHAT SHE HAS: a list the record says is empty is left out (E22)', () => {
  const lists = [{ id: 'things', name: 'Projects', count: 0 }, { id: 'orders', name: 'Orders', count: 1 }, { id: 'people', name: 'People', count: 2 }];
  assert.equal(madeOffers(lists).agent.finds, 'Ask it about your orders and people, from the Claude app.');
  assert.equal(madeOffers(lists).agent.name, 'Claude');
});
