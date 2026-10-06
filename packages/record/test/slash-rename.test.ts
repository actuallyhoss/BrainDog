/**
 * Slash's rename card (`noticeUsage`, THE WORDS FOLLOW USE): which lists it is offered for, and the singular it carries.
 *
 * Three faults the audit of October 2nd found (`loop/research-audit-11-13.md` item 11), each tested below against a
 * reading built by hand, since the rule is pure:
 *   - the card set the singular without its question saying so;
 *   - the singular was made by lowercasing the whole name, so "HSBC cards" became "hsbc card", Boxes "boxe", Series "sery";
 *   - every module list now declares a label, so the card was armed for lists the use case never renamed, and asked
 *     "Call Services Renewals everywhere?".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { labelSetting } from '@braindog/declare';

import { noticeUsage, type ListUse, type PageUse, type Usage } from '../src/slash.ts';

const AT = '2026-10-02T09:00:00.000Z';
const OLD = '2026-01-02T09:00:00.000Z';

const listUse = (id: string, name: string, pack: string): ListUse => ({
  id,
  name,
  pack,
  rows: 3,
  added30: 0,
  addedDays30: 0,
  writes90: 3,
  reads90: 0,
  agentWrites30: 0,
  declaredAt: OLD,
});
const pageUse = (slug: string, title: string, register: string): PageUse => ({
  slug,
  title,
  titled: true,
  pack: null,
  registers: [register],
  opens30: 6,
  openDays30: 4,
  opens90: 6,
  lastOpened: AT,
  declaredAt: OLD,
});

type Word = { default: string | null; value?: string | null };

/** One list, one page over it opened often, and the speaking use case's words for the list. */
function reading(list: ListUse, title: string, words: { name: Word; one?: Word; holds?: Word }): Usage {
  const setting = (w: Word) => ({ title: null, default: w.default, value: w.value ?? null });
  return {
    at: AT,
    firstWrite: OLD,
    ageDays: 273,
    listening: { pages: true, lists: true },
    lists: [{ ...list, name: words.name.value ?? list.name }],
    pages: [pageUse('mine', title, list.id)],
    agents: [],
    packs: [
      { id: 'estate', title: 'Estate', on: true, usecase: false, since: OLD },
      { id: 'usecase-crew', title: 'Crew', on: true, usecase: true, since: OLD },
    ],
    speaking: 'usecase-crew',
    writes: { all30: 3, agents30: 0, agents90: 0 },
    tone: {
      pack: 'usecase-crew',
      settings: {
        [labelSetting(list.id)]: setting(words.name),
        ...(words.one ? { [labelSetting(`${list.id}:one`)]: setting(words.one) } : {}),
        ...(words.holds ? { [labelSetting(`${list.id}:holds`)]: setting(words.holds) } : {}),
      },
    },
    skills: null,
  };
}

const settingsDrafts = (u: Usage) => noticeUsage(u, []).drafts.filter((d) => d.body_kind === 'settings');

test('A MODULE LIST THE USE CASE NEVER RENAMED IS NOT OFFERED A PAGE TITLE AS ITS NAME, and one it renamed is', () => {
  /* ESTATE'S SERVICES, declared by the use case only because every list it holds now declares its words, starting from
     the module's own name. Before: "Call Services Renewals everywhere? ..." */
  const services = listUse('services', 'Services', 'estate');
  const left = settingsDrafts(reading(services, 'Renewals', { name: { default: 'Services' }, one: { default: 'service' } }));
  assert.deepEqual(left, [], 'a module list the use case left alone was offered a rename');
  assert.ok(!noticeUsage(reading(services, 'Renewals', { name: { default: 'Services' } }), []).noticed.some((n) => n.kind === 'label'));

  /* THE SAME LIST, RENAMED BY THE USE CASE ("Subscriptions"), is its word, and the page title may take its place. */
  const renamed = settingsDrafts(reading(services, 'Renewals', { name: { default: 'Subscriptions' }, one: { default: 'subscription' } }));
  assert.equal(renamed.length, 1);
  assert.match(renamed[0]!.question, /^Call Subscriptions "Renewals" everywhere/u);

  /* AND A PERSON'S OWN WORD FOR A MODULE LIST (a value typed in Settings) does not arm it: the use case still left it. */
  assert.deepEqual(settingsDrafts(reading(services, 'Renewals', { name: { default: 'Services', value: 'Contracts' } })), []);

  /* THE USE CASE'S OWN LIST is its word whatever it is called, as Crew's Tickets are. */
  const tickets = listUse('tickets', 'Tickets', 'usecase-crew');
  assert.equal(settingsDrafts(reading(tickets, 'Issues', { name: { default: 'Tickets' } })).length, 1);
  /* AND A LIST NO MODULE HOLDS got its setting only from the use case's labels. */
  assert.equal(settingsDrafts(reading(listUse('plants', 'Plants', 'garden'), 'Beds', { name: { default: 'Plants' } })).length, 1);
});

test('THE SINGULAR IS NAMED IN THE QUESTION THAT SETS IT, in the case it was typed, or left out of both', () => {
  const tickets = listUse('tickets', 'Tickets', 'usecase-crew');
  const card = (title: string, one: Word | null = { default: 'ticket' }) => {
    const [d] = settingsDrafts(reading(tickets, title, { name: { default: 'Tickets' }, ...(one ? { one } : {}) }));
    assert.ok(d, `no card for ${title}`);
    return { question: d.question, values: d.body.values as Record<string, string> };
  };

  /* NAMED, AND THE CHANGE IS WHAT IT SAYS. Before, the question was "Call Tickets Issues everywhere?" and the body set
     `one_tickets` too. */
  const issues = card('Issues');
  assert.match(issues.question, /^Call Tickets "Issues" everywhere, and one of them "issue"\? You opened/u);
  assert.deepEqual(issues.values, { label_tickets: 'Issues', one_tickets: 'issue' });

  /* KEEPS THE CASE: an acronym or a name typed in capitals stays so. Before: "hsbc card". */
  const hsbc = card('HSBC cards');
  assert.match(hsbc.question, /and one of them "HSBC card"\?/u);
  assert.equal(hsbc.values.one_tickets, 'HSBC card');
  assert.equal(card('APIs').values.one_tickets, 'API');

  /* ENDINGS THAT SAY HOW: -ies, -es after a hiss, a plain s. Before: "boxe", "batche". */
  for (const [title, one] of [
    ['Deliveries', 'delivery'],
    ['Boxes', 'box'],
    ['Batches', 'batch'],
    ['Addresses', 'address'],
    ['Houses', 'house'],
    ['Client Projects', 'client project'],
  ] as const)
    assert.equal(card(title).values.one_tickets, one, title);

  /* LEFT OUT, OF THE QUESTION AND THE CHANGE, where the ending does not say. Before: "sery", and "people" for People. */
  for (const title of ['Series', 'People', 'Status', 'Movies', 'Shelves', 'Caches', 'Inventory', 'Analyses', 'Savings']) {
    const left = card(title);
    assert.equal(left.question.includes('one of them'), false, `${title}: ${left.question}`);
    assert.deepEqual(Object.keys(left.values), ['label_tickets'], title);
  }

  /* AND LEFT OUT WHEN THE LIST ALREADY CARRIES IT, in any case, or the use case declares no singular to set. */
  assert.deepEqual(Object.keys(card('Issues', { default: 'ticket', value: 'Issue' }).values), ['label_tickets']);
  const none = card('Issues', null);
  assert.deepEqual(Object.keys(none.values), ['label_tickets']);
  assert.equal(none.question.includes('one of them'), false);
  for (const d of [issues, hsbc]) assert.ok(!d.question.includes('—'), d.question);
});

test('WHAT IT HOLDS IS SAID IN THE NEW WORDS, keeping their case, and left alone when the singular could not be made', () => {
  const tickets = listUse('tickets', 'Tickets', 'usecase-crew');
  const holds = (title: string) =>
    settingsDrafts(reading(tickets, title, { name: { default: 'Tickets' }, one: { default: 'ticket' }, holds: { default: 'every ticket we know about, and all tickets closed' } }))
      .map((d) => (d.body.values as Record<string, string>).holds_tickets)
      .filter((v) => v !== undefined);
  assert.deepEqual(holds('Issues'), ['every issue we know about, and all issues closed']);
  /* Before: "every hsbc card ... all hsbc cards". */
  assert.deepEqual(holds('HSBC cards'), ['every HSBC card we know about, and all HSBC cards closed']);
  /* NO SINGULAR FOR SERIES, so a line naming the old singular is not half rewritten into "every ticket ... all series". */
  assert.deepEqual(holds('Series'), []);
});
