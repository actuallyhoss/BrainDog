/**
 * A decision answered inside Claude or ChatGPT (`answer.ts`, `option-visual.ts`): each option drawn with what it would
 * change, the card's grant handed in `_meta` only, and the `answer` tool, which refuses the model and answers a press.
 *
 * WHAT IS HELD: the pictures are the web question page's, kind for kind; the grant is never in the text or the JSON a
 * model reads; `answer` is listed for the card and hidden from the model, and only by a door whose record answers presses;
 * a call with no grant asks nothing of the record and tells the model to show the card; a record that mints no grant
 * leaves the buttons linking to BrainDog.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANSWER_LISTED, SHOW_THE_CARD, answerCall, groundOf, withGrant } from '../src/answer.ts';
import { ANSWER_TOOL, GRANT_META, cardHtml, cardOf, decisionCard } from '../src/cards.ts';
import { visualOf } from '../src/option-visual.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { stub, type Ctx } from './stub.ts';

const ctx: Ctx = { who: 'claude' };
let n = 0;
const req = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: '2.0', id: ++n, method, ...(params === undefined ? {} : { params }) });
type ToolResult = { content: { type: string; text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown> };
const result = (reply: Reply | null): ToolResult => {
  assert.ok(reply && 'result' in reply, JSON.stringify(reply));
  return reply.result as ToolResult;
};

const NOW = Date.UTC(2026, 9, 20, 12);

/* ── the pictures ──────────────────────────────────────────────────────── */

test('a merge draws the names and the one they become; keeping apart draws nothing', () => {
  const row = { merge: { candidates: [{ name: 'Teodor Vance', row: 'people#3', keeps: true }, { name: 'Teodor V', row: 'people#9', keeps: false }] } };
  assert.deepEqual(visualOf(row, 'merge', null, {}, NOW), { kind: 'merge', names: ['Teodor Vance', 'Teodor V'], into: 'Teodor Vance' });
  assert.deepEqual(visualOf(row, 'pick:people#9', null, {}, NOW), { kind: 'merge', names: ['Teodor Vance', 'Teodor V'], into: 'Teodor V' });
  assert.equal(visualOf(row, 'apart', null, {}, NOW), null);
});

test('money is set against the account balance, and with no balance it is no bar', () => {
  const row = { money: [{ amount: 120000, currency: 'EGP' }] };
  const drawn = visualOf(row, 'accept', null, { balance: { amount: 480000, currency: 'EGP' } }, NOW);
  assert.deepEqual(drawn, { kind: 'money', said: 'EGP 1,200', against: 'EGP 4,800', basis: 'balance', share: 0.25, over: false });
  assert.equal(visualOf(row, 'accept', null, { balance: { amount: 480000, currency: 'GBP' } }, NOW), null, 'another currency is not a share of it');
  assert.equal(visualOf(row, 'reject', null, { balance: { amount: 480000, currency: 'EGP' } }, NOW), null);
});

test('a due day against today, a change in words, and a figure filed into its list', () => {
  const due = { changes: [{ field: 'due', label: 'Due on', before: '2026-10-22', after: '2026-10-27' }] };
  assert.deepEqual(visualOf(due, 'accept', null, {}, NOW), { kind: 'date', today: Math.floor(NOW / 86_400_000), due: Math.floor(NOW / 86_400_000) + 7, days: 7, was: Math.floor(NOW / 86_400_000) + 2, late: false });
  const stage = { changes: [{ field: 'lane', label: 'Lane', before: 'Building', after: 'Earning' }] };
  assert.deepEqual(visualOf(stage, 'accept', null, {}, NOW), { kind: 'change', what: 'Lane', before: 'Building', after: 'Earning' });
  assert.deepEqual(visualOf({}, 'accept', null, { listName: 'Groceries', figure: 'GBP 42' }, NOW), { kind: 'filing', list: 'Groceries', figure: 'GBP 42' });
  /* AN OPTION OF ITS OWN DRAWS ONLY WHAT IT CARRIES. */
  assert.equal(visualOf(stage, 'later', { id: 'later' }, {}, NOW), null);
  assert.deepEqual(visualOf({}, 'move', { id: 'move', due: '2026-10-25' }, {}, NOW)?.kind, 'date');
});

test('the card carries each picture, Accept and Decline for rows, and no due day without today', () => {
  const asked = { id: 'SG4', question: 'Pay Harbourview EGP 1,200?', status: 'open', body_kind: 'rowset', body: { about: 'money#7' }, money: [{ amount: 120000, currency: 'EGP' }] };
  const card = decisionCard(asked, 'https://brain.dog', 'teo', { now: NOW, ground: { balance: { amount: 480000, currency: 'EGP' } } });
  assert.deepEqual(card?.options.map((o) => [o.id, o.label, o.suggested]), [['accept', 'Accept', true], ['reject', 'Decline', false]]);
  assert.equal(card?.options[0]?.visual?.kind, 'money');
  assert.equal(card?.options[1]?.visual, null);
  assert.equal(card?.answerTool, null, 'no grant, no press');
  /* ASKED BY ID THE RECORD ANSWERS THE QUESTION ITSELF, which now draws the card. */
  assert.equal(cardOf('governance', { id: 'SG4' }, asked)?.kind, 'decision');
  const undated = decisionCard({ question: 'Move it?', changes: [{ field: 'due', before: null, after: '2026-10-27' }], body_kind: 'rowset' });
  assert.equal(undated?.options[0]?.visual, null);
});

test('the ground is read as the caller, the row then its account and what it is filed under', async () => {
  const rows: Record<string, Record<string, unknown>> = {
    'money#7': { amount: { amount: -120000, currency: 'EGP' }, account: 'accounts#1', category: 'categories#2' },
    'accounts#1': { balance: { amount: 480000, currency: 'EGP' } },
    'categories#2': { name: 'Rent' },
  };
  const read: string[] = [];
  const { surface } = stub({
    get: (async (args: { spoken: string }) => {
      read.push(args.spoken);
      return { ok: true, value: { fields: rows[args.spoken] ?? {} } };
    }) as never,
  });
  const ground = await groundOf(surface, ctx, { body: { about: 'money#7' } });
  assert.deepEqual(ground, { balance: { amount: 480000, currency: 'EGP' }, listName: 'Rent', figure: 'EGP 1,200' });
  assert.deepEqual(read.sort(), ['accounts#1', 'categories#2', 'money#7']);
  assert.deepEqual(await groundOf(surface, ctx, { body: { about: 'not a row' } }), {});
});

/* ── the grant and the answer tool ─────────────────────────────────────── */

const QUESTION = { id: 'SG12', question: 'Ship Friday?', status: 'open', body_kind: 'options', body: { options: [{ id: 'ship', label: 'Ship' }, { id: 'wait', label: 'Wait', because: 'Safer' }] } };
const GRANT = 'ca1.sealed-grant-bytes';

function answering(mint: 'yes' | 'no' = 'yes') {
  const asked: { method: string; args: unknown }[] = [];
  const { surface } = stub({
    governance: (async () => ({ ok: true, value: QUESTION })) as never,
  });
  Object.assign(surface, {
    chatApp: async () => ({ ok: true, value: { app: 'Claude' } }),
    chatAnswerMint: async (args: unknown) => {
      asked.push({ method: 'chatAnswerMint', args });
      return mint === 'yes'
        ? { ok: true, value: { grant: GRANT, until: '2026-10-20T12:15:00.000Z', app: 'Claude', hard: ['ship'] } }
        : { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Answering from inside chat apps is off.' } };
    },
    chatAnswer: async (args: unknown) => {
      asked.push({ method: 'chatAnswer', args });
      return { ok: true, value: { decision: 'D9', question: 'SG12', option: 'wait', app: 'Claude', said: 'Answered: Wait. BrainDog keeps it as answered in Claude.' } };
    },
  });
  return { surface, asked };
}

test('answer is listed for the card, hidden from the model, and only to a chat app\u2019s key by a door that answers presses', async () => {
  const names = (r: Reply | null) => ((r as { result: { tools: { name: string }[] } }).result.tools ?? []).map((t) => t.name);
  assert.ok(!names(await handle(req('tools/list'), stub().surface, ctx)).includes(ANSWER_TOOL));
  const listed = (await handle(req('tools/list'), answering().surface, ctx)) as { result: { tools: { name: string; _meta?: Record<string, unknown> }[] } };
  const tool = listed.result.tools.find((t) => t.name === ANSWER_TOOL);
  assert.ok(tool, 'answer was not listed');
  assert.deepEqual(tool._meta, { ui: { visibility: ['app'] }, 'openai/visibility': 'private', 'openai/widgetAccessible': true });
  assert.deepEqual(ANSWER_LISTED.inputSchema.required, ['option'], 'a call without a grant reaches the refusal, not a schema error');
  /* A KEY ON A MACHINE IS NEVER SHOWN IT. */
  const machine = answering().surface;
  Object.assign(machine, { chatApp: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only Claude or ChatGPT.' } }) });
  assert.ok(!names(await handle(req('tools/list'), machine, ctx)).includes(ANSWER_TOOL));
});

test('THE MODEL CANNOT PRESS: answer without a grant asks nothing of the record and says to show the card', async () => {
  const { surface, asked } = answering();
  for (const args of [{ option: 'wait' }, { grant: '', option: 'wait' }, { id: 'SG12', option: 'wait' }]) {
    const r = result(await handle(req('tools/call', { name: ANSWER_TOOL, arguments: args }), surface, ctx));
    assert.equal(r.isError, true);
    assert.equal(r.structuredContent?.code, SHOW_THE_CARD.code);
    assert.match(r.content[0]!.text, /Show them the card/u);
  }
  assert.deepEqual(asked, [], 'the record was asked');
  assert.equal((await answerCall(stub().surface, { grant: GRANT, option: 'wait' }, ctx)).isError, true, 'a record that answers no press answers none');
});

test('the decision card gets its grant in _meta only, and its buttons answer; the hard option is pressed twice', async () => {
  const { surface, asked } = answering();
  const r = result(await handle(req('tools/call', { name: 'governance', arguments: { id: 'SG12' } }), surface, ctx));
  const card = r.structuredContent?.card as { answerTool: string | null; options: { id: string; hard: boolean }[] };
  assert.equal(card.answerTool, ANSWER_TOOL);
  assert.deepEqual(card.options.map((o) => [o.id, o.hard]), [['ship', true], ['wait', false]]);
  assert.deepEqual(r._meta?.[GRANT_META], { grant: GRANT, until: '2026-10-20T12:15:00.000Z' });
  /* NEVER WHERE THE MODEL READS. */
  assert.ok(!JSON.stringify(r.structuredContent).includes(GRANT), 'the grant is in the JSON the model reads');
  assert.ok(!r.content.some((c) => c.text.includes(GRANT)), 'the grant is in the text the model reads');
  assert.deepEqual(asked, [{ method: 'chatAnswerMint', args: { id: 'SG12', options: ['ship', 'wait'] } }]);

  const pressed = result(await handle(req('tools/call', { name: ANSWER_TOOL, arguments: { grant: GRANT, option: 'wait' } }), surface, ctx));
  assert.equal(pressed.isError, undefined);
  assert.equal(pressed.content[0]!.text, 'Answered: Wait. BrainDog keeps it as answered in Claude.');
  assert.deepEqual(asked.at(-1), { method: 'chatAnswer', args: { grant: GRANT, option: 'wait' } });
});

test('with no grant from the record the buttons link to BrainDog, as before', async () => {
  const { surface } = answering('no');
  const r = result(await handle(req('tools/call', { name: 'governance', arguments: { id: 'SG12' } }), surface, ctx, 'https://brain.dog'));
  assert.equal((r.structuredContent?.card as { answerTool: unknown }).answerTool, null);
  assert.equal(r._meta?.[GRANT_META], undefined);
  const plain = await withGrant(stub().surface, ctx, 'SG12', decisionCard(QUESTION)!);
  assert.equal(plain.card.answerTool, null);
  assert.deepEqual(plain.meta, {});
});

test('the page reads the grant from _meta, presses twice for a hard option, and says the answer it was given', () => {
  const html = cardHtml('decision');
  assert.ok(html.includes(`'${GRANT_META}'`), 'the page does not read the grant');
  assert.ok(html.includes('toolResponseMetadata'), 'ChatGPT hands _meta to the card there');
  assert.ok(html.includes('Press again to answer'));
  assert.ok(html.includes('isError'), 'a refusal is said as one');
  assert.ok(html.includes('ov-money') && html.includes('ov-date') && html.includes('ov-merge') && html.includes('ov-filing') && html.includes('ov-change'));
  assert.ok(!html.includes('—'));
});
