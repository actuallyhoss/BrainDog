/**
 * A page's line naming the person's own things (the visual review of October 2nd), and a question nobody asked by hand
 * read as what it asks.
 *
 * The record answers `{{<figure>.first}}`, `.names`, `.more` and `.since` from the rows a figure counts
 * (`kernel/src/pages.ts` `rowsValue`); the app writes them into the sentence: a verb after the names agrees with how many
 * it named, and a day is said as its month.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { leadOf } from './metrics.ts';
import { resolverOf } from './page-live.ts';
import { feedTable, type FeedRow } from './api.ts';

const said = (values: Record<string, string | number>) => resolverOf(values);

test('A VERB AFTER A FIGURE’S NAMES AGREES WITH HOW MANY IT NAMED, and a clause with no names to say goes', () => {
  const body = '{{projects-need-you.names}} need(s) a push, {{projects-on-track.names}} is on track';
  const two = said({ 'projects-need-you.names': 'Kiln and Portage', 'projects-on-track.names': 'Marlow & Co' });
  assert.equal(leadOf(body, two), '{{projects-need-you.names}} need a push, {{projects-on-track.names}} is on track');
  const one = said({ 'projects-need-you.names': 'Kiln', 'projects-on-track.names': 'Marlow & Co and Portage' });
  assert.equal(leadOf(body, one), '{{projects-need-you.names}} needs a push, {{projects-on-track.names}} are on track');
  assert.equal(leadOf(body, said({ 'projects-need-you.names': 'Kiln' })), '{{projects-need-you.names}} needs a push');
});

test('HOW MANY MORE IS COUNTED, AND NOUGHT MORE IS LEFT OUT', () => {
  const body = '{{tasks-late-yours.first}} is late, and {{tasks-late-yours.more}} more task(s) are too';
  assert.equal(leadOf(body, said({ 'tasks-late-yours.first': 'Turn auto-renew back on', 'tasks-late-yours.more': 0 })), '{{tasks-late-yours.first}} is late');
  assert.equal(leadOf(body, said({ 'tasks-late-yours.first': 'Turn auto-renew back on', 'tasks-late-yours.more': 1 })), '{{tasks-late-yours.first}} is late, and {{tasks-late-yours.more}} more task is too');
  assert.equal(leadOf(body, said({ 'tasks-late-yours.first': 'Turn auto-renew back on', 'tasks-late-yours.more': 6 })), '{{tasks-late-yours.first}} is late, and {{tasks-late-yours.more}} more tasks are too');
});

test('A FIGURE’S SINCE IS SAID AS THE MONTH, with the year only when it is not this one', () => {
  const year = new Date().getUTCFullYear();
  const resolve = said({ 'people-quiet.since': `${year}-04-28`, 'old.since': '2019-11-02', 'people-quiet.first': 'Pell & Vine' });
  assert.equal(resolve('people-quiet.since'), 'April');
  assert.equal(resolve('old.since'), 'November 2019');
  assert.equal(resolve('people-quiet.first'), 'Pell & Vine');
});

test('A QUESTION NOBODY ASKED BY HAND IS WHAT IT ASKS, from the record, a rule or an agent, and never under You', () => {
  const row = (by: FeedRow['by'], who: string, thing: string): FeedRow => ({ by, who, count: 1, kind: 'suggest', target: null, note: null, at: '2026-09-03T03:17:00.000Z', thing });
  const { rows } = feedTable(
    [row('rule', 'system', 'The backup on 3 Sep did not run'), row('agent', 'agent:claude', 'Does Kiln licence per seat?'), row('you', 'p_owner', 'Renew the domain?')],
    false,
    null,
    Date.parse('2026-09-03T12:00:00.000Z'),
    'p_owner',
  );
  assert.deepEqual(rows.map((r) => [r.cells[1], r.cells[3]]), [
    ['', 'Asked: the backup on 3 Sep did not run'],
    ['Claude', 'asked: does Kiln licence per seat?'],
    ['You', 'suggested Renew the domain?'],
  ]);
});

test('A CLAUSE THAT OPENS ON "with" GOES WHEN THE CLAUSE IT LEANS ON GOES, and stands when that one stands', () => {
  const body = '{{orders-late}} late, and {{orders-owed-named.first_who}} still owes {{orders-owed-named.first_total}}, with {{orders-owed-named.more}} more order(s) not paid at all';
  const both = leadOf(body, said({ 'orders-late': 2, 'orders-owed-named.first_who': 'Salma', 'orders-owed-named.first_total': 'EGP 1,350', 'orders-owed-named.more': 2 }));
  assert.match(both, /still owes \{\{orders-owed-named\.first_total\}\}, with \{\{orders-owed-named\.more\}\} more orders not paid at all$/u);
  /* NOBODY TO NAME (a reader who may not see People): the count of the others is not said after nobody. */
  const nameless = leadOf(body, said({ 'orders-late': 2, 'orders-owed-named.more': 2 }));
  assert.equal(nameless, '{{orders-late}} late');
  /* ONE DEBTOR AND NO OTHER ORDER: the clause is nought and goes by itself, as before. */
  assert.doesNotMatch(leadOf(body, said({ 'orders-late': 2, 'orders-owed-named.first_who': 'Salma', 'orders-owed-named.first_total': 'EGP 1,350', 'orders-owed-named.more': 0 })), /with/u);
});
