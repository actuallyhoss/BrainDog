/**
 * Draw it: a component made into one `drawn` block, refused in the renderer's words when its code reaches off the page,
 * and previewed over the rows the record would hand it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DRAWN_EXAMPLE } from 'braindog-render';

import { designFix, drawAsk, drawnBlock, drawnDraft, previewRows, startFields } from './draw.ts';
import { drawnOf } from './kinds/drawn.ts';

const BILLS = {
  id: 'bills',
  name: 'Bills',
  title: 'what',
  fields: [{ id: 'due', type: 'day' }, { id: 'what', type: 'text' }, { id: 'amount', type: 'money' }, { id: 'paid', type: 'bool' }, { id: 'note', type: 'text' }],
};

test('a new component starts with the list title first, and four fields at most', () => {
  assert.deepEqual(startFields(BILLS), ['what', 'due', 'amount', 'paid']);
  assert.deepEqual(startFields(null), []);
});

test('the block is a drawn kind over the list, handed the fields picked, with its code', () => {
  assert.deepEqual(drawnBlock({ name: ' Bills strip ', list: 'bills', fields: ['what', 'due'], code: '<p>x</p>' }), {
    kind: 'drawn',
    heading: 'Bills strip',
    source: 'register.bills',
    columns: [{ field: 'what' }, { field: 'due' }],
    code: '<p>x</p>',
  });
  /* WITH NO FIELDS IT READS NO LIST, and is a picture of its own. */
  assert.deepEqual(Object.keys(drawnBlock({ name: '', list: 'bills', fields: [], code: '<p>x</p>' })).sort(), ['code', 'heading', 'kind']);
});

test('a draft is handed back like a composed one, and code that reaches off the page is refused in words', () => {
  const got = drawnDraft({ name: 'Strip', list: BILLS, fields: ['what'], code: DRAWN_EXAMPLE });
  assert.ok('block' in got);
  assert.equal(got.list, 'bills');
  assert.match(got.said, /drawn over Bills/u);
  const bad = drawnDraft({ name: 'Strip', list: BILLS, fields: ['what'], code: '<img src="https://example.com/x.png">' });
  assert.ok('fix' in bad);
  assert.match(bad.fix, /^This component cannot be drawn because /u);
  assert.ok('fix' in drawnDraft({ name: 'Strip', list: BILLS, fields: [], code: '  ' }));
});

test('a draft that scrolls sideways at 390 or paints its own colour is not drawn, in the design check’s sentence', () => {
  const wide = drawnDraft({ name: 'Strip', list: BILLS, fields: ['what'], code: '<div style="width:700px"></div><script>braindog.on(function (d) { if (d.rows.length === 0) return; });</script>' });
  assert.ok('fix' in wide);
  assert.match(wide.fix, /^This design is not shown, because it is 700 px wide/u);
  const painted = drawnDraft({ name: 'Strip', list: BILLS, fields: ['what'], code: '<p style="color:#123456">x</p>' });
  assert.ok('fix' in painted);
  assert.match(painted.fix, /would not read in both light and dark/u);
  assert.equal(designFix({ kind: 'calendar', source: 'register.bills', empty: 'Nothing due.' }), null);
});

test('the preview asks previewPage for the block and is handed only the fields named', async () => {
  let sent: unknown = null;
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    sent = `${String(url instanceof Request ? url.url : url)} ${String(init?.body ?? '')}`;
    const blocks = [{ kind: 'drawn', source: 'register.bills', columns: [{ field: 'what' }], rows: [{ seq: 2, fields: { what: 'Rent', secret: 'x' } }], refusals: [] }];
    return new Response(JSON.stringify({ ok: true, value: { blocks } }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const got = await previewRows('https://example.test', drawnBlock({ name: '', list: 'bills', fields: ['what'], code: '<p>x</p>' }), 'Bills', io);
  assert.ok('data' in got);
  assert.deepEqual(got.data.rows, [{ ref: 'bills#2', fields: { what: 'Rent' } }]);
  assert.equal(got.data.list, 'Bills');
  assert.match(String(sent), /previewPage/u);
});

test('a block that reads no list is not sent, and a refusal comes back as its sentence', async () => {
  let asked = 0;
  const none = (async () => {
    asked += 1;
    return new Response('{}');
  }) as unknown as typeof fetch;
  const got = await previewRows('https://example.test', drawnBlock({ name: '', list: null, fields: [], code: '<p>x</p>' }), null, none);
  assert.equal(asked, 0);
  assert.ok('data' in got && got.data.rows.length === 0);
  const refused = (async () =>
    new Response(JSON.stringify({ ok: true, value: { blocks: [{ kind: 'drawn', refusals: [{ code: 'DECLARATION_INVALID', fix: 'This component cannot be drawn because it calls the network.' }] }] } }), {
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  const said = await previewRows('https://example.test', drawnBlock({ name: '', list: 'bills', fields: ['what'], code: '<p>x</p>' }), 'Bills', refused);
  assert.ok('fix' in said && /calls the network/u.test(said.fix));
});

test('the model is asked for a drawn block by the design book rules', () => {
  assert.match(drawAsk(' payroll as a calendar '), /kind: drawn.*: payroll as a calendar$/u);
});

test('a drawn block on the page is planned from the answer, and a draft from its list\'s rows', () => {
  const answered = drawnOf({ kind: 'drawn', answer: { kind: 'drawn', code: '<p>x</p>', height: 320, source: 'register.bills', columns: [{ field: 'what' }], rows: [{ seq: 1, fields: { what: 'Rent' } }] }, register: 'bills' }, () => 'Bills');
  assert.deepEqual(answered, { code: '<p>x</p>', data: { list: 'Bills', columns: [{ field: 'what', label: 'what' }], rows: [{ ref: 'bills#1', fields: { what: 'Rent' } }] }, start: 320 });
  const draft = drawnOf({ kind: 'drawn', code: '<p>x</p>', register: 'bills', columns: [{ field: 'what' }], entries: [{ seq: 4, fields: { what: 'Power', note: 'kept out' } }] });
  assert.deepEqual(draft?.data.rows, [{ ref: 'bills#4', fields: { what: 'Power' } }]);
  assert.equal(drawnOf({ kind: 'table', code: '<p>x</p>' }), null);
  assert.equal(drawnOf({ kind: 'drawn', code: '   ' }), null);
});

test("a draft built over another block of its list is planned from its own code, not that block's answer", () => {
  const draft = drawnOf({
    kind: 'drawn',
    code: '<p>mine</p>',
    register: 'bills',
    columns: [{ field: 'what' }],
    answer: { kind: 'calendar', rows: [] },
    entries: [{ seq: 2, fields: { what: 'Rent' } }],
  });
  assert.equal(draft?.code, '<p>mine</p>');
  assert.deepEqual(draft?.data.rows, [{ ref: 'bills#2', fields: { what: 'Rent' } }]);
});
