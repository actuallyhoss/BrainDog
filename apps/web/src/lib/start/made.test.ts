/**
 * The end of the first run offers one agent and one source, each saying what it would find in this BrainDog, then Home.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firstRun } from '../first-run.ts';
import { madeOffers, modulesOn } from './made.ts';

test('ONE AGENT AND ONE SOURCE, the agent first, each saying what it would find', () => {
  const offers = madeOffers(['portfolio', 'people', 'money-core']);
  assert.deepEqual(Object.keys(offers), ['agent', 'source'], 'the agent comes before the source');
  assert.equal(offers.agent.name, firstRun.agentName);
  for (const o of [offers.agent, offers.source]) {
    assert.match(o.finds, /would find/u, `${o.name} does not say what it would find`);
    assert.doesNotMatch(o.finds, /—/u, 'no em dash in copy a person reads');
  }
});

test('WHAT THE AGENT WOULD FIND IS WHAT THIS BRAINDOG KEEPS, and nothing it does not', () => {
  assert.equal(madeOffers(['portfolio', 'people']).agent.finds, firstRun.agentFinds([firstRun.agentProjects, firstRun.agentPeople]));
  assert.doesNotMatch(madeOffers(['money-core']).agent.finds, /projects|people/u, 'a Money-only BrainDog has no projects to find');
  assert.equal(madeOffers([]).agent.finds, firstRun.agentFinds([]));
});

test('THE SOURCE IS THE ONE WHOSE FINDS LAND HERE: a bank where Money is kept, mail where People is, else a file', () => {
  assert.equal(madeOffers(['portfolio', 'people', 'money-core']).source.kind, 'bank');
  assert.equal(madeOffers(['portfolio', 'people']).source.kind, 'mail');
  assert.equal(madeOffers(['portfolio']).source.kind, 'file');
  /* MAIL IS SET UP IN SETTINGS, WHAT COMES IN; a file is brought in from /start, which answering again adds to. */
  assert.equal(madeOffers(['money-core']).source.href, '/settings/ingest');
  assert.equal(madeOffers([]).source.href, '/start');
});

test('THE MODULES A RECORD HOLDS are the packs that are on', () => {
  assert.deepEqual(
    modulesOn([
      { id: 'people', disabled_at: null },
      { id: 'money-core', disabled_at: '2026-10-01' },
      { id: 'portfolio', disabled_at: null },
    ]),
    ['people', 'portfolio'],
  );
});
