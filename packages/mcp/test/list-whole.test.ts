/**
 * A small list is one read, and `title` is answered with the list's own title field.
 *
 * `list` answered twenty rows when the call named no limit, so a portfolio of 27 projects took two reads. With no limit
 * named and at most sixty rows, the answer holds them all; past sixty it is a page of twenty and a cursor, as before.
 * And an agent that writes `title` or `name`, the words it reaches for, is handed the call with the list's title field
 * and told which field that is.
 *
 * ON A REAL RECORD, because the count, the cursor and the refusal are the record's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { tokenBudget } from './tokens.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const ERRANDS = {
  id: 'register.errands',
  kind: 'register' as const,
  body: { id: 'errands', name: 'Errands', title: 'what', fields: [{ id: 'what', type: 'text', label: 'What to do', required: true }] } as never,
};

/* A LIST OF PROJECTS AS A PORTFOLIO KEEPS ONE: a name, where it stands, and one line about it, all three in its short form. */
const VENTURES = {
  id: 'register.ventures',
  kind: 'register' as const,
  body: {
    id: 'ventures',
    name: 'Ventures',
    one: 'venture',
    title: 'venture',
    state: 'stage',
    mobile: ['stage', 'one_liner'],
    fields: [
      { id: 'venture', type: 'text', required: true },
      { id: 'stage', type: 'enum', values: ['idea', 'building', 'live'], required: true },
      { id: 'one_liner', type: 'text', label: 'One line' },
    ],
  } as never,
};

/* TEN WORDS OR SO EACH, which is what the budget holds: measured here, a line is 15 tokens before its one line is
   said (the name, the handle, the stage), so 27 lines leave about 14 tokens each for it. Lines of 75 characters cost 922. */
const LINES = [
  'A shop for home bakers, with orders taken by message.',
  'Fan pages a club can open in an afternoon.',
  'A reader that scores an advert before it runs.',
];

async function record(errands: number, ventures = 0) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([ERRANDS, VENTURES])).ok);
  for (let i = 1; i <= errands; i += 1) assert.ok(api.kernel.create('errands', { what: `Errand ${String(i)}` }, { actor: 'p_1' }).ok);
  for (let i = 1; i <= ventures; i += 1)
    assert.ok(api.kernel.create('ventures', { venture: `Venture ${String(i)}`, stage: 'building', one_liner: LINES[i % LINES.length] }, { actor: 'p_1' }).ok);
  return { sql, api };
}

type ToolResult = { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };

let id = 0;
async function call(api: Awaited<ReturnType<typeof record>>['api'], name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const reply = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }, api, owner)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  return reply.result as ToolResult;
}

const textOf = (r: ToolResult): string => r.content.map((c) => c.text).join('\n');
const rowsOf = (r: ToolResult): unknown[] => r.structuredContent.rows as unknown[];

test('NO LIMIT NAMED AND SIXTY ROWS OR FEWER: the answer holds them all, with no cursor', async () => {
  for (const n of [27, 60]) {
    const { sql, api } = await record(n);
    const out = await call(api, 'list', { register: 'errands' });
    assert.notEqual(out.isError, true, textOf(out));
    assert.equal(rowsOf(out).length, n);
    assert.equal(out.structuredContent.cursor, undefined, 'a whole list handed a cursor');
    assert.ok(!textOf(out).includes('More:'), textOf(out));
    sql.close();
  }
});

test('NO LIMIT NAMED AND SIXTY-ONE ROWS: a page of twenty and a cursor, and the cursor reads on from there', async () => {
  const { sql, api } = await record(61);
  const out = await call(api, 'list', { register: 'errands' });
  assert.notEqual(out.isError, true, textOf(out));
  assert.equal(rowsOf(out).length, 20);
  const cursor = out.structuredContent.cursor;
  assert.equal(typeof cursor, 'string', 'no cursor for the rest');
  /* THE REST IS READ A PAGE AT A TIME: a call with a cursor and no limit is a page, never the whole of what is left. */
  const next = await call(api, 'list', { register: 'errands', cursor });
  assert.equal(rowsOf(next).length, 20);
  const seen = new Set([...rowsOf(out), ...rowsOf(next)].map((r) => (r as { spoken: string }).spoken));
  assert.equal(seen.size, 40, 'the second page repeats the first');
  sql.close();
});

test('A LIMIT NAMED IS KEPT: five of twenty-seven is five and a cursor', async () => {
  const { sql, api } = await record(27);
  const out = await call(api, 'list', { register: 'errands', limit: 5 });
  assert.equal(rowsOf(out).length, 5);
  assert.equal(typeof out.structuredContent.cursor, 'string');
  sql.close();
});

test('NARROWED TO SIXTY OR FEWER, a long list is whole too', async () => {
  const { sql, api } = await record(70);
  const out = await call(api, 'list', { register: 'errands', where: { field: 'what', contains: 'Errand 6' } });
  assert.notEqual(out.isError, true, textOf(out));
  /* Errand 6 and Errand 60 to 69. */
  assert.equal(rowsOf(out).length, 11);
  assert.equal(out.structuredContent.cursor, undefined);
  sql.close();
});

test('TWENTY-SEVEN PROJECTS WITH THEIR ONE LINE COST UNDER 800 TOKENS, in one read', async () => {
  const { sql, api } = await record(0, 27);
  const out = await call(api, 'list', { register: 'ventures' });
  assert.notEqual(out.isError, true, textOf(out));
  assert.equal(rowsOf(out).length, 27);
  const text = textOf(out);
  for (let i = 1; i <= 27; i += 1) assert.ok(text.includes(`Venture ${String(i)} `), `Venture ${String(i)} is not in the answer`);
  assert.ok(text.includes(LINES[0]!), 'a line is said without its one line');
  const cost = tokenBudget(text);
  assert.ok(cost < 800, `27 projects cost ${String(cost)} tokens:\n${text}`);
  sql.close();
});

/* `title` IS THE LIST'S TITLE FIELD, WRITTEN TO IT (the obvious spelling, `plainFields` in the record). `name` is a word any list may use for a field of its own, so it is still corrected. */
test('create WITH title writes the list\'s title field', async () => {
  const { sql, api } = await record(1);
  const out = await call(api, 'create', { register: 'errands', fields: { title: 'Buy stamps' } });
  assert.notEqual(out.isError, true, textOf(out));
  assert.equal((out.structuredContent.fields as Record<string, unknown>).what, 'Buy stamps');
  assert.equal((out.structuredContent.fields as Record<string, unknown>).title, undefined);
  sql.close();
});

test('update WITH title changes the list\'s title field on the row', async () => {
  const { sql, api } = await record(1);
  const out = await call(api, 'update', { spoken: 'errands#1', patch: { title: 'Post the letter' } });
  assert.notEqual(out.isError, true, textOf(out));
  assert.equal((out.structuredContent.fields as Record<string, unknown>).what, 'Post the letter');
  sql.close();
});

for (const word of ['name']) {
  test(`create WITH ${word}: the try is the call with the list's title field, and the sentence says which field it is`, async () => {
    const { sql, api } = await record(1);
    const out = await call(api, 'create', { register: 'errands', fields: { [word]: 'Buy stamps' } });
    assert.equal(out.isError, true, textOf(out));
    assert.equal(out.structuredContent.code, 'FIELD_UNKNOWN');
    assert.equal(out.structuredContent.try, 'create {"register":"errands","fields":{"what":"Buy stamps"}}');
    assert.ok(String(out.structuredContent.fix).endsWith("This list's title is its What to do field."), String(out.structuredContent.fix));
    assert.ok(textOf(out).includes("This list's title is its What to do field."), textOf(out));
    assert.doesNotMatch(textOf(out), /—/u);
    /* AND THE TRY IS A CALL THE RECORD TAKES. */
    const again = await call(api, 'create', { register: 'errands', fields: { what: 'Buy stamps' } });
    assert.notEqual(again.isError, true, textOf(again));
    sql.close();
  });

  test(`update WITH ${word}: the same correction, on the row's own list`, async () => {
    const { sql, api } = await record(1);
    const out = await call(api, 'update', { spoken: 'errands#1', patch: { [word]: 'Post the letter' } });
    assert.equal(out.isError, true, textOf(out));
    assert.equal(out.structuredContent.code, 'FIELD_UNKNOWN');
    assert.match(String(out.structuredContent.try), /^update \{"spoken":"errands#1","patch":\{"what":"Post the letter"\}/u);
    assert.ok(String(out.structuredContent.fix).endsWith("This list's title is its What to do field."), String(out.structuredContent.fix));
    sql.close();
  });
}

test('A TITLE FIELD WITH NO LABEL IS SAID BY ITS ID AS WORDS', async () => {
  const { sql, api } = await record(0, 1);
  const out = await call(api, 'create', { register: 'ventures', fields: { name: 'Kiln', stage: 'idea' } });
  assert.equal(out.structuredContent.code, 'FIELD_UNKNOWN');
  assert.ok(String(out.structuredContent.fix).endsWith("This list's title is its Venture field."), String(out.structuredContent.fix));
  assert.match(String(out.structuredContent.try), /"venture":"Kiln"/u);
  sql.close();
});

test('title BESIDE THE TITLE FIELD ALREADY SENT: told which field it is, and handed no call that would drop a value', async () => {
  const { sql, api } = await record(1);
  const out = await call(api, 'create', { register: 'errands', fields: { what: 'Buy stamps', title: 'Stamps' } });
  assert.equal(out.structuredContent.code, 'FIELD_UNKNOWN');
  assert.ok(String(out.structuredContent.fix).endsWith("This list's title is its What to do field."), String(out.structuredContent.fix));
  assert.equal(out.structuredContent.try, undefined);
  sql.close();
});

test('ANOTHER UNKNOWN FIELD IS CORRECTED AS BEFORE, with no word about the title', async () => {
  const { sql, api } = await record(1);
  const out = await call(api, 'create', { register: 'errands', fields: { wha: 'Buy stamps' } });
  assert.equal(out.structuredContent.code, 'FIELD_UNKNOWN');
  assert.equal(out.structuredContent.try, 'create {"register":"errands","fields":{"what":"Buy stamps"}}');
  assert.ok(!String(out.structuredContent.fix).includes("This list's title"), String(out.structuredContent.fix));
  sql.close();
});
