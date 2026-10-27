/**
 * The line history keeps when an agent changes an automation: who, which one, and the change in the
 * steps' own words, never an id or a verb key, at most 200 characters.
 *
 * The kernel's `stepsDiff` is imported from its source here, as the record will read it from the kernel's index once
 * that line lands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SAID_MOST, automationChangeSaid } from '../src/automation-said.ts';
import { stepsDiff } from '../../kernel/src/automation-kind.ts';
import { PEOPLE, PROJECTS } from '../../../fixtures/names.ts';

const agent = `${PEOPLE[3]!.name.split(' ')[0]}'s agent`;

const rule = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  rule: 'late_invoices',
  name: 'Late invoices',
  on: { written: { register: 'invoices' } },
  when: 'state is open',
  steps: [{ tag: 'late' }, { move: 'chasing' }],
  ...over,
});

test('a rename and a narrower when, said in the steps own words', () => {
  const said = automationChangeSaid(agent, 'Late invoices', rule(), rule({ steps: [{ tag: 'late' }, { move: 'Close it' }], when: 'state is open, due before today' }), stepsDiff);
  assert.equal(said, "Priya's agent changed Late invoices: renamed step 2 to Close it, now only when due before today");
});

test('a narrower when alone, and a step inside a branch', () => {
  assert.equal(automationChangeSaid(agent, 'Late invoices', rule({ when: undefined }), rule({ when: 'due before today' }), stepsDiff), "Priya's agent changed Late invoices: now only when due before today");
  const branch = (note: string) => rule({ steps: [{ if: 'due before today', then: [{ note }], else: [{ tag: 'fine' }] }] });
  assert.equal(automationChangeSaid(agent, 'Late invoices', branch('Chase it'), branch('Chase it today'), stepsDiff), "Priya's agent changed Late invoices: renamed step 1 under step 1 to Chase it today");
});

test('a step that names a call is said by what it is, never by the call it names', () => {
  const call = (ingest: string) => rule({ steps: [{ tag: 'late' }, { call: { ingest } }] });
  const said = automationChangeSaid(agent, 'Late invoices', call('books_push'), call('books_send'), stepsDiff);
  assert.equal(said, "Priya's agent changed Late invoices: changed step 2 (call a service)");
  assert.doesNotMatch(said, /books_|ingest/);
});

test('a list of five changes is cut at 200 characters and ends with how many more', () => {
  const title = `${PROJECTS[0]} invoices that are late`;
  const before = rule({ steps: [{ note: 'a' }, { note: 'b' }, { note: 'c' }, { note: 'd' }, { note: 'e' }] });
  const after = rule({
    steps: [
      { note: 'First, check the invoice was sent to the right address' },
      { note: 'Second, look for a payment that came in under another name' },
      { note: 'Third, write the client a short and friendly reminder' },
      { note: 'Fourth, mark the day the reminder went out' },
      { note: 'Fifth, look again in a week' },
    ],
  });
  const said = automationChangeSaid(agent, title, before, after, stepsDiff);
  assert.ok(said.length <= SAID_MOST, `${said.length} characters`);
  assert.match(said, /^Priya's agent changed Lanternfish invoices that are late: renamed step 1 to First, check/);
  assert.match(said, /, and [34] more$/);
});

test('an identical body changed nothing a person would see; settings are said too', () => {
  assert.equal(automationChangeSaid(agent, 'Late invoices', rule(), rule(), stepsDiff), "Priya's agent changed nothing a person would see in Late invoices");
  assert.equal(automationChangeSaid(agent, 'Late invoices', rule(), Object.fromEntries(Object.entries(rule()).reverse()), stepsDiff), "Priya's agent changed nothing a person would see in Late invoices");
  assert.equal(
    automationChangeSaid(agent, 'Late invoices', rule(), rule({ enabled: false, limits: { runs_per_day: 5 }, name: 'Overdue invoices' }), stepsDiff),
    "Priya's agent changed Late invoices: renamed it to Overdue invoices, turned it off, now at most 5 runs a day",
  );
  assert.equal(automationChangeSaid(agent, 'Late invoices', rule({ project: 'p1' }), rule(), stepsDiff), "Priya's agent changed Late invoices: now works in every project");
  assert.equal(automationChangeSaid(agent, 'Late invoices', rule({ steps: [{ wait: '2h' }] }), rule({ steps: [{ wait: '2d' }] }), stepsDiff), "Priya's agent changed Late invoices: changed step 1 (wait)");
});

test('added and taken out steps are said by what they do, and a new rule by its steps', () => {
  assert.equal(
    automationChangeSaid(agent, 'Late invoices', rule(), rule({ steps: [{ note: 'checked' }, { tag: 'late' }] }), stepsDiff),
    "Priya's agent changed Late invoices: added step 1 (add a note), took out step 2 (move to a state)",
  );
  assert.equal(automationChangeSaid(agent, 'Late invoices', null, rule(), stepsDiff), "Priya's agent made Late invoices with 2 steps");
});
