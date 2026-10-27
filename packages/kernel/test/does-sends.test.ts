/**
 * WHAT LEAVES WITH A CALL A RULE RUNS: the sentence after "Sends your key ... to ...".
 *
 * The plan's `calls_out` carries `sends`, the fields of the rule's entry that go out with the call, each
 * `<list>.<field>` (`@braindog/declare`'s `Diff`). The approval named the key, the host and how often, and never said
 * that the invoice amounts go too. It also lost the ceiling for a day whenever the call had a clock.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { doesOf, type DoesNames } from '../src/does.ts';

const call = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ingest: 'ingest.invoice-sync',
  channel: 'call',
  method: 'POST',
  host: 'api.stripe.com',
  every: '',
  trigger: 'rule',
  per_day: 100,
  grant: 'stripe',
  paged: false,
  sends: [],
  project: null,
  line: 'CALLS OUT api.stripe.com · when a rule runs it, at most 100 a day · grant "stripe"',
  key_line: null,
  change: 'new',
  ...over,
});

const KEY = "Sends your key 'stripe' to api.stripe.com when a rule runs it, up to 100 times a day.";

test('a call that sends a field says which, after the key sentence', () => {
  assert.equal(doesOf('install', { calls_out: [call({ sends: ['invoices.amount'] })] }), `${KEY} It sends Amount of invoices.`);
});

test('a call with no fields says nothing extra', () => {
  assert.equal(doesOf('install', { calls_out: [call()] }), KEY);
  assert.equal(doesOf('install', { calls_out: [call({ sends: undefined })] }), KEY);
  assert.equal(doesOf('install', { calls_out: [call({ sends: 'invoices.amount' })] }), KEY);
  assert.equal(doesOf('install', { calls_out: [call({ sends: [7, '', ' ', null] })] }), KEY);
});

test('the fields are named as the record shows them, and the list by its name', () => {
  const names: DoesNames = {
    list: (id) => (id === 'invoices' ? 'Client invoices' : null),
    field: (list, field) => (list === 'invoices' && field === 'amount' ? 'Total due' : null),
  };
  assert.equal(doesOf('install', { calls_out: [call({ sends: ['invoices.amount'] })] }, names), `${KEY} It sends Total due of Client invoices.`);
  /* A field the record cannot name is its id read as words, as a list is. */
  assert.equal(doesOf('install', { calls_out: [call({ sends: ['invoices.due_on'] })] }, names), `${KEY} It sends Due on of Client invoices.`);
});

test('every field is said, none counted, each list once', () => {
  const said = doesOf('install', { calls_out: [call({ sends: ['invoices.amount', 'invoices.due_on', 'invoices.status', 'clients.email', 'invoices.amount'] })] });
  assert.equal(said, `${KEY} It sends Amount, Due on and Status of invoices, and Email of clients.`);
  assert.ok(!said.includes('more'));
  assert.ok(!/[._]/u.test(said.replace('api.stripe.com', '').replace(/\.( |$)/gu, '')));
});

test('a field with no list is said alone', () => {
  assert.equal(doesOf('install', { calls_out: [call({ sends: ['amount'] })] }), `${KEY} It sends Amount.`);
});

test('a call with a clock and a ceiling says both', () => {
  assert.equal(
    doesOf('install', { calls_out: [call({ every: '1h', trigger: 'both', per_day: 40 })] }),
    "Sends your key 'stripe' to api.stripe.com every hour, and up to 40 times a day when a rule runs it.",
  );
  /* A body that names no trigger, or the wrong one, still keeps its ceiling. */
  assert.equal(doesOf('install', { calls_out: [call({ every: '1h', trigger: 'schedule', per_day: 40 })] }), "Sends your key 'stripe' to api.stripe.com every hour, up to 40 times a day.");
  assert.equal(doesOf('install', { calls_out: [call({ every: '15m', trigger: undefined, per_day: 40 })] }), "Sends your key 'stripe' to api.stripe.com every 15 minutes, up to 40 times a day.");
  assert.equal(doesOf('install', { calls_out: [call({ every: '1h', trigger: 'schedule', per_day: null })] }), "Sends your key 'stripe' to api.stripe.com every hour.");
});

test('two actions that send different fields are both said, and the same one once', () => {
  const a = call({ sends: ['invoices.amount'] });
  const b = call({ ingest: 'ingest.invoice-note', sends: ['invoices.note'] });
  assert.equal(doesOf('install', { calls_out: [a, { ...a, ingest: 'ingest.again' }, b] }), `${KEY} It sends Amount of invoices. ${KEY} It sends Note of invoices.`);
});

test('an action already running unchanged says nothing, fields or not', () => {
  assert.equal(doesOf('install', { calls_out: [call({ change: 'same', sends: ['invoices.amount'] })] }), '');
});

test('a question that installs an add-on says the fields too, and a call with no key', () => {
  assert.equal(doesOf('pack', { install: 'money', calls_out: [call({ sends: ['invoices.amount'] })] }), `Adds Money. ${KEY} It sends Amount of invoices.`);
  assert.equal(
    doesOf('install', { calls_out: [call({ grant: null, host: 'hooks.example.com', sends: ['orders.total'] })] }),
    'Calls hooks.example.com when a rule runs it, up to 100 times a day. It sends Total of orders.',
  );
});
