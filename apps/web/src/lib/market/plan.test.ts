/**
 * THE PLAN SHEET SAYS A FIELD BY ITS LABEL: the sentence for a call a rule runs names what leaves with it as the
 * record shows it, the way Decide does, and never as the field's id.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sheetOf, type FieldName } from './plan.ts';

const named = (id: string): string => (id === 'register.invoices' ? 'Client invoices' : id === 'billing' ? 'Billing' : id);

const diff = (sends: unknown): unknown => ({
  pack: { id: 'billing', version: '1.0.0', summary: '' },
  planHash: 'h',
  direction: 'install',
  calls_out: [{ host: 'api.stripe.com', grant: 'stripe', trigger: 'rule', change: 'new', sends }],
});

const lineOf = (sends: unknown, fieldOf?: FieldName): string => {
  const sheet = sheetOf(diff(sends), named, fieldOf);
  assert.ok(sheet);
  return sheet.parts[0]?.calls[0]?.line ?? '';
};

const labels: FieldName = (list, field) => (list === 'invoices' && field === 'amount' ? 'Total due' : null);

test('a field that leaves with a call is said by its label, and its list by its name', () => {
  const line = lineOf(['invoices.amount'], labels);
  assert.ok(line.endsWith('It sends Total due of Client invoices.'), line);
});

test('a field the record holds no label for is its id read as words', () => {
  assert.ok(lineOf(['invoices.amount', 'invoices.due_on'], labels).endsWith('It sends Total due and Due on of Client invoices.'));
  /* An empty label is no label. */
  assert.ok(lineOf(['invoices.due_on'], () => '  ').endsWith('It sends Due on of Client invoices.'));
});

test('a sheet handed no labels reads as it did', () => {
  assert.ok(lineOf(['invoices.amount']).endsWith('It sends Amount of Client invoices.'));
});

test('the labels reach every plan of an "Update all"', () => {
  const sheet = sheetOf([diff(['invoices.amount']), diff(['invoices.amount'])], named, labels);
  assert.ok(sheet);
  assert.equal(sheet.parts.length, 2);
  for (const part of sheet.parts) assert.ok(part.calls[0]?.line.endsWith('It sends Total due of Client invoices.'));
});

test('the call still carries the fields as the plan names them', () => {
  const sheet = sheetOf(diff(['invoices.amount']), named, labels);
  assert.deepEqual(sheet?.parts[0]?.calls[0]?.sends, ['invoices.amount']);
});

/* A CONFLICT ANOTHER UPDATE CLEARS (`update-order.ts` `marked`): one in the same run is no stop, one outside it says
   which update to take first. */

const pack = (id: string): string => (id === 'usecase-personal' ? 'Personal' : id === 'money-core' ? 'Money' : id === 'metric.budgets-set' ? 'Budgets set' : id);

const money = (conflict: Record<string, unknown>): unknown => ({
  pack: { id: 'money-core', version: '3.17.0', summary: '' },
  planHash: 'h',
  direction: 'upgrade',
  installed_version: '3.16.0',
  conflicts: [{ id: 'metric.budgets-set', pack: 'usecase-personal', ...conflict }],
});

test('a conflict whose holder goes in earlier in the same run is no stop, and says what it goes in after', () => {
  const sheet = sheetOf(money({ waits: 'after' }), pack);
  assert.ok(sheet);
  assert.deepEqual(sheet.stops, []);
  const worth = sheet.parts[0]?.sections.find((s) => s.key === 'worth');
  assert.deepEqual(worth?.rows, [{ text: 'Budgets set', detail: 'goes in after Personal, which hands it on' }]);
});

test('a conflict whose holder has an update outside the run says to take that one first', () => {
  const sheet = sheetOf(money({ waits: 'first' }), pack);
  assert.ok(sheet);
  assert.deepEqual(sheet.stops, ['Update Personal first, which hands Budgets set on to this']);
});

test('a conflict nobody marked stops the install as it did', () => {
  const sheet = sheetOf(money({}), pack);
  assert.ok(sheet);
  assert.deepEqual(sheet.stops, ['Budgets set is already here, from Personal']);
  /* The owner's own is never waited out, whatever a mark says. */
  assert.deepEqual(sheetOf(money({ changed: true, waits: 'after' }), pack)?.stops, ['Budgets set is one you changed, and this version changes it too']);
});

test('the skills an add-on gives the agents are named before it installs, by name and the moment each is for', () => {
  const plain = { pack: { id: 'tidy-week', version: '1.0.0', summary: '' }, planHash: 'h', direction: 'install' };
  const sheet = sheetOf(
    {
      ...plain,
      skills: [
        { name: 'weekly-tidy', trigger: 'On a Friday.', what: 'Closes out the week.' },
        { name: 'plain', trigger: '', what: null },
      ],
    },
    pack,
  );
  const section = sheet?.parts[0]?.sections.find((s) => s.key === 'teaches');
  assert.equal(section?.title, 'Skills it gives your agents');
  assert.deepEqual(
    section?.rows.map((r) => [r.text, r.detail]),
    [
      ['weekly tidy', 'Closes out the week. For: On a Friday.'],
      ['plain', 'A skill your agents can use'],
    ],
  );
  assert.equal(sheetOf(plain, pack)?.parts[0]?.sections.some((s) => s.key === 'teaches'), false);
});

/* THE INSTALL SHEET NAMES EACH THING ONCE: its lists and pages by name, and its numbers as
   one row, so a list and a number of the same name are not two "Kiln firings" one under the other. */

test('an add-on’s plan names its lists and pages and folds its numbers into one row, counted whole', () => {
  const sheet = sheetOf(
    {
      pack: { id: 'kiln', version: '1.0.0', summary: '' },
      planHash: 'h',
      direction: 'install',
      adds: [
        { id: 'register.firings', summary: '6 fields' },
        { id: 'page.kiln', summary: '4 blocks' },
        { id: 'metric.firings', summary: '' },
        { id: 'metric.firings-late', summary: '' },
      ],
    },
    (id) => ({ 'register.firings': 'Firings', 'page.kiln': 'Kiln', 'metric.firings': 'Firings', 'metric.firings-late': 'Firings still to fire' })[id] ?? id,
  );
  const adds = sheet?.parts[0]?.sections.find((s) => s.key === 'adds');
  assert.deepEqual(adds?.rows.map((r) => r.text), ['Firings', 'Kiln', 'and 2 numbers']);
  assert.equal(adds?.n, 4);
});

test('a ready-made setup’s plan folds its numbers too, and keeps its rules by name', () => {
  const sheet = sheetOf(
    {
      usecase: { id: 'kiln', title: 'Kiln studio', version: '1.0.0', summary: '' },
      packs: [
        {
          id: 'usecase-kiln',
          title: 'Kiln studio',
          version: '1.0.0',
          adds: [
            { kind: 'list', name: 'Firings' },
            { kind: 'page', name: 'Kiln' },
            { kind: 'figure', name: 'Firings' },
            { kind: 'figure', name: 'Firings done' },
            { kind: 'figure', name: 'Firings late' },
            { kind: 'other', name: 'Mark a firing done' },
          ],
        },
      ],
    },
    (id) => id,
  );
  const adds = sheet?.parts[0]?.sections.find((s) => s.key === 'adds');
  assert.deepEqual(adds?.rows.map((r) => r.text), ['Firings', 'Kiln', 'Mark a firing done', 'and 3 numbers']);
  assert.equal(adds?.n, 6);
});

test('WHAT A PLAN ADDS IS SAID ONCE EACH: the script its rule runs, and the page named as its list (AF23)', () => {
  const names: Record<string, string> = {
    'rule.price': "Keep a subscription's old price when its amount changes",
    'script.price': "Keep a subscription's old price",
    'register.events': 'Events',
    'page.events': 'Events',
    'page.subscriptions': 'Subscriptions',
  };
  const sheet = sheetOf(
    {
      pack: { id: 'subs', version: '1.0.0', summary: '' },
      planHash: 'h',
      direction: 'install',
      adds: [{ id: 'page.events' }, { id: 'register.events' }, { id: 'rule.price' }, { id: 'script.price' }, { id: 'page.subscriptions' }, { id: 'metric.a' }],
    },
    (id) => names[id] ?? id,
  );
  const adds = sheet?.parts[0]?.sections.find((s) => s.key === 'adds');
  assert.deepEqual(adds?.rows.map((r) => r.text), ['Events', "Keep a subscription's old price when its amount changes", 'Subscriptions', 'and 1 number']);
  assert.equal(adds?.n, 4);
});
