/**
 * `form.ts`: the fields a form shows, what is missing, the values a create takes, where a refusal is said, and the
 * text the string drawer prints. The form here is invented: a list of plants and what is paid for each.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formLines, formOf, formPlan, formRefusal, formValues, readForm, refusalPlaced, refusedField, type FormSpec } from './form.ts';

const ANSWER = {
  verb: 'row.create',
  register: 'plants',
  fields: [
    { id: 'name', label: 'Name', type: 'text', required: true },
    { id: 'bought', label: 'Bought', type: 'bool' },
    { id: 'price', label: 'Price', type: 'money', required: true, show_when: { field: 'bought', is: true } },
    { id: 'on', label: 'Bought on', type: 'day', show_when: { field: 'price', is: 'x' } },
    { id: 'pots', label: 'Pots', type: 'int' },
    { id: 'kind', label: 'Kind', type: 'choice', options: ['Fern', 'Palm'] },
    { id: 'notes', label: 'Notes', type: 'long' },
  ],
  submit: 'Add the plant',
  after: 'stay',
};

const FORM = readForm(ANSWER) as FormSpec;

test('a form the record answered is read, with a list type read as the nearest control', () => {
  assert.ok(FORM);
  assert.equal(FORM.fields.length, 7);
  assert.equal(FORM.fields.find((f) => f.id === 'on')?.type, 'date');
  assert.equal(FORM.fields.find((f) => f.id === 'pots')?.type, 'number');
  assert.deepEqual(FORM.fields.find((f) => f.id === 'price')?.show_when, { field: 'bought', is: 'true' });
  assert.equal(formOf({ form_spec: ANSWER })?.register, 'plants');
});

test('a form with no field that can be drawn is no form', () => {
  assert.equal(readForm({ ...ANSWER, fields: [] }), null);
  assert.equal(readForm({ ...ANSWER, fields: [{ id: 'Bad Id', label: 'Name' }, { id: 'name', label: ' ' }] }), null);
  assert.equal(readForm({ ...ANSWER, register: '' }), null);
  assert.equal(readForm('form'), null);
  assert.equal(formOf({ form: 'lead' }), null);
});

test('show_when hides a field until its field holds the value, and a chain folds from the top', () => {
  const ids = (values: Record<string, unknown>) => formPlan(FORM, values as never).fields.map((f) => f.id);
  assert.deepEqual(ids({}), ['name', 'bought', 'pots', 'kind', 'notes']);
  assert.deepEqual(ids({ bought: true }), ['name', 'bought', 'price', 'pots', 'kind', 'notes']);
  assert.deepEqual(ids({ bought: true, price: { amount: 'x', currency: 'GBP' } }), ['name', 'bought', 'price', 'on', 'pots', 'kind', 'notes']);
  /* THE FIELD IT WAITS ON IS HIDDEN, so it is too, whatever it was typed with. */
  assert.deepEqual(ids({ bought: false, price: { amount: 'x', currency: 'GBP' } }), ['name', 'bought', 'pots', 'kind', 'notes']);
});

test('a required field left empty is missing, and only while it is shown', () => {
  assert.deepEqual(formPlan(FORM, {}).missing, ['name']);
  assert.deepEqual(formPlan(FORM, { name: '  ', bought: true }).missing, ['name', 'price']);
  assert.deepEqual(formPlan(FORM, { name: 'Ivy', bought: true, price: { amount: '4', currency: 'GBP' } }).missing, []);
  const plan = formPlan(FORM, {});
  assert.deepEqual(formRefusal(plan, {}), { at: 'name', fix: 'Fill in Name.' });
});

test('each field is drawn as its own control', () => {
  const byId = Object.fromEntries(formPlan(FORM, { bought: true, price: { amount: 'x', currency: 'GBP' } }).fields.map((f) => [f.id, f.control]));
  assert.deepEqual(byId, { name: 'text', bought: 'checkbox', price: 'money', on: 'date', pots: 'number', kind: 'select', notes: 'textarea' });
});

test('money is sent in minor units with its currency, a day as YYYY-MM-DD, a number as a number', () => {
  const values = { name: ' Ivy ', bought: true, price: { amount: '1,299.5', currency: 'gbp' }, pots: '3', kind: 'Fern', notes: '' };
  const plan = formPlan(FORM, values);
  assert.equal(formRefusal(plan, values), null);
  assert.deepEqual(formValues(values, plan.fields), { name: 'Ivy', bought: true, price: { amount: 129950, currency: 'GBP' }, pots: 3, kind: 'Fern' });
  /* A CURRENCY WITH NO MINOR UNITS takes none, and an amount typed with no code is in the home currency. */
  const yen = { name: 'Ivy', bought: true, price: '1200' };
  assert.deepEqual(formValues(yen, formPlan(FORM, yen).fields, 'JPY').price, { amount: 1200, currency: 'JPY' });
  const dated = { name: 'Ivy', bought: true, price: { amount: 'x', currency: 'GBP' }, on: '2026-02-28' };
  assert.equal(formValues(dated, formPlan(FORM, dated).fields).on, '2026-02-28');
  /* A HIDDEN FIELD SENDS NOTHING, whatever it holds. */
  assert.equal(formValues({ name: 'Ivy', on: '2026-02-28' }, formPlan(FORM, { name: 'Ivy', on: '2026-02-28' }).fields).on, undefined);
  assert.equal(formValues({ name: 'Ivy' }, formPlan(FORM, { name: 'Ivy' }).fields).bought, false);
});

test('a value that cannot be sent as typed is refused under its field, by its label', () => {
  const refused = (values: Record<string, unknown>, home: string | null = null) => formRefusal(formPlan(FORM, values as never), values as never, home);
  assert.deepEqual(refused({ name: 'Ivy', pots: 'three' }), { at: 'pots', fix: 'Pots takes a number, like 12 or 4.5.' });
  assert.deepEqual(refused({ name: 'Ivy', bought: true, price: { amount: '4.505', currency: 'GBP' } }), { at: 'price', fix: 'Price takes at most 2 places after the point in GBP.' });
  assert.deepEqual(refused({ name: 'Ivy', bought: true, price: { amount: '4', currency: '' } }), { at: 'price', fix: 'Price needs a three-letter currency, like USD.' });
  assert.equal(refused({ name: 'Ivy', bought: true, price: '4' }, 'EGP'), null);
  assert.deepEqual(refused({ name: 'Ivy', kind: 'Cactus' }), { at: 'kind', fix: 'Pick one of the choices for Kind.' });
  const watered = readForm({ register: 'plants', submit: 'Water', fields: [{ id: 'on', label: 'Watered on', type: 'date' }] })!;
  const day = (on: string) => formRefusal(formPlan(watered, { on }), { on });
  assert.deepEqual(day('2026-02-30'), { at: 'on', fix: 'Watered on takes a day on the calendar.' });
  assert.deepEqual(day('28/02/2026'), { at: 'on', fix: 'Watered on takes a day on the calendar.' });
  assert.equal(day('2028-02-29'), null);
});

test("the record's refusal is said under the field it names, and otherwise once above the button", () => {
  const plan = formPlan(FORM, {});
  assert.equal(refusedField('plants.fields.pots'), 'pots');
  assert.equal(refusedField('price.amount'), 'price');
  assert.equal(refusedField(''), null);
  assert.deepEqual(refusalPlaced({ fix: 'Pots is past the most.', at: 'fields.pots' }, plan), { under: { pots: 'Pots is past the most.' }, above: null });
  /* A FIELD THE FORM DOES NOT DRAW NOW is not a place to say it. */
  assert.deepEqual(refusalPlaced({ fix: 'Price is wrong.', at: 'price' }, plan), { under: {}, above: 'Price is wrong.' });
  assert.deepEqual(refusalPlaced({ fix: 'That list is closed.' }, plan), { under: {}, above: 'That list is closed.' });
  assert.deepEqual(refusalPlaced(null, plan), { under: {}, above: null });
});

test('the string drawer prints the labels and the submit as text', () => {
  assert.deepEqual(formLines(FORM), [
    'Name (required)',
    'Bought',
    'Price (required), when Bought is yes',
    'Bought on, when Price is x',
    'Pots',
    'Kind',
    'Notes',
    'Add the plant',
  ]);
});

test('after the press: landed, refused under a field, or a host that answers nothing', async () => {
  const { formOutcome, formLanded } = await import('./form.ts');
  assert.deepEqual(formOutcome({ ok: true, value: { seq: 4 } }), { ok: true });
  assert.deepEqual(formOutcome({ ok: false, fix: ' Pots is past the most. ', at: 'pots' }), { ok: false, refusal: { fix: 'Pots is past the most.', at: 'pots' } });
  assert.deepEqual(formOutcome({ ok: false }), { ok: false, refusal: null });
  assert.equal(formOutcome(undefined), null);
  assert.deepEqual(formLanded(FORM, { name: ' Ivy ' }), { stay: true, said: 'Added “Ivy”.' });
  assert.deepEqual(formLanded(FORM, {}), { stay: true, said: 'Added.' });
  assert.deepEqual(formLanded({ ...FORM, after: 'garden' }, {}), { stay: false, href: '/p/garden' });
});

/* ---- The drawer --------------------------------------------------------------------------------------------- */

/** `Form.svelte` drawn on the server, the way `dynamic-forms.test.ts` draws `Inputs.svelte`. */
async function drawForm(props: Record<string, unknown>): Promise<string> {
  const { registerHooks } = await import('node:module');
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { compile } = await import('svelte/compiler');
  const { render } = await import('svelte/server');
  registerHooks({
    load(url, context, next) {
      if (!url.endsWith('.svelte')) return next(url, context);
      const filename = fileURLToPath(url);
      return { format: 'module', source: compile(readFileSync(filename, 'utf8'), { generate: 'server', filename }).js.code, shortCircuit: true };
    },
  });
  const { default: Form } = (await import(new URL('../svelte/Form.svelte', import.meta.url).href)) as { default: import('svelte').Component<Record<string, unknown>> };
  /* THE SCOPED CLASSES AND HYDRATION MARKS GO, so a test reads the tree a browser builds. */
  return render(Form, { props })
    .body.replace(/<!--[^]*?-->/gu, '')
    .replace(/ svelte-[a-z0-9]+/gu, '');
}

const BLOCK = { type: 'block', kind: 'form', rows: [], raw: '', start: 0, end: 0, form_spec: ANSWER };

test('handed act, every field is labelled, a required one says so in a word, and there is one button', async () => {
  const html = await drawForm({ block: BLOCK, act: () => {} });
  const ids = [...html.matchAll(/<label class="form-label" for="([^"]+)"/gu)].map((m) => m[1]!);
  assert.equal(ids.length, 4, 'name, pots, kind and notes each take a label of their own');
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`, 'u'), `no control carries the label's ${id}`);
  assert.match(html, /<label class="form-check"><input[^>]*type="checkbox"/u, 'the yes or no sits inside its label');
  assert.match(html, /<span aria-hidden="true">\*<\/span> required/u);
  assert.equal(html.match(/<button/gu)?.length, 1);
  assert.match(html, /<button type="submit" class="form-submit"[^>]*>Add the plant<\/button>/u);
  assert.match(html, /role="status"/u);
  assert.doesNotMatch(html, / disabled/u);
});

test('with no act it is a preview: the fields disabled and no button', async () => {
  const html = await drawForm({ block: BLOCK });
  assert.doesNotMatch(html, /<button/u);
  assert.match(html, /<input[^>]*disabled/u);
  assert.match(html, /<select[^>]*disabled/u);
});

test('a block with no form says there is nothing to fill in', async () => {
  const html = await drawForm({ block: { ...BLOCK, form_spec: undefined }, act: () => {} });
  assert.match(html, /Nothing to fill in here\./u);
  assert.doesNotMatch(html, /<form/u);
});

test('one press sends a row.create worded by the submit, with the typed values, or stops at the first refusal', async () => {
  const { formPress } = await import('./form.ts');
  assert.deepEqual(formPress(FORM, { name: '' }), { refused: { at: 'name', fix: 'Fill in Name.' } });
  const sent: unknown[] = [];
  const act = (action: unknown, row: unknown, values: unknown) => void sent.push([action, row, values]);
  const press = formPress(FORM, { name: 'Ivy', bought: true, price: '3.10', pots: '2' }, 'GBP');
  assert.ok('action' in press);
  act(press.action, null, press.values);
  assert.deepEqual(sent, [
    [
      { verb: 'row.create', label: 'Add the plant', args: { register: 'plants', fields: ['name', 'bought', 'price', 'pots', 'kind', 'notes'] } },
      null,
      { name: 'Ivy', bought: true, price: { amount: 310, currency: 'GBP' }, pots: 2 },
    ],
  ]);
});
