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
  for (const o of [offers.agent, offers.source]) {
    assert.match(o.finds, /would find/u, `${o.name} does not say what it would find`);
    assert.doesNotMatch(o.finds, /—/u, 'no em dash in copy a person reads');
  }
});

test('WHAT THE AGENT WOULD FIND IS WHAT THIS BRAINDOG KEEPS, and nothing it does not', () => {
  assert.equal(madeOffers(of('portfolio', 'people')).agent.finds, firstRun.agentFinds([firstRun.agentProjects, firstRun.agentPeople]));
  assert.equal(madeOffers(of('work')).agent.finds, firstRun.agentFinds([firstRun.agentTasks]));
  assert.doesNotMatch(madeOffers(of('money-core')).agent.finds, /projects|people/u, 'a Money-only BrainDog has no projects to find');
  assert.equal(madeOffers([]).agent.finds, firstRun.agentFinds([]));
});

test('THE SOURCE IS THE ONE WHOSE FINDS LAND HERE: a bank where money is kept, mail where people are, else a file', () => {
  assert.equal(madeOffers(of('portfolio', 'people', 'money-core')).source.kind, 'bank');
  assert.equal(madeOffers(of('portfolio', 'people')).source.kind, 'mail');
  assert.equal(madeOffers(of('portfolio')).source.kind, 'file');
  /* MAIL IS SET UP IN SETTINGS, WHAT COMES IN; a file is brought in from /start, which answering again adds to. */
  assert.equal(madeOffers(of('money-core')).source.href, '/settings/ingest');
  assert.equal(madeOffers([]).source.href, '/start');
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
