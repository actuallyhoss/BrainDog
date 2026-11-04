/**
 * What an agent reads before it meets anyone and after it proposes: the `braindog:understand` resource says the
 * record's `understandPlan` in names, `meet`'s description says where honestly, and a proposal's answer says the money
 * it moves one currency at a time and what it changes, in the decision card's words.
 *
 * OVER THE STUB SURFACE, because what is tested is what the tool layer says about what the record answered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { changesSaid, movesSaid, proposedBrief, understoodBrief, type Look } from '../src/brief.ts';
import { TOOLS, tools } from '../src/index.ts';
import { stub } from './stub.ts';

const look: Look = { now: Date.UTC(2026, 9, 7, 9), decl: () => undefined, title: () => undefined, actor: (by) => by, decider: 'Mara' };

/** One dry slice, as the record answers it, with what a dry slice never carries beside it. */
const SLICE = {
  dry: true,
  kinds: [
    { kind: 'payments', looked: 40, linked: 3, refused: 0, organisations: 1 },
    { kind: 'runs', looked: 12, linked: 1, refused: 0 },
  ],
  writes: ['Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios', 'Add Lowry St Studios to Organisations'],
  more: 2,
  questions: ['Which project is Fly for?'],
  asks: { 'service-project': 1 },
  done: false,
  undo: ['01M345FTM0D4F495AW6K6NDA06'],
  filed: [{ id: 'SG4', question: 'Which project is Fly for?' }],
};

const plain = (s: string) => {
  assert.doesNotMatch(s, /—/u, 'an em dash');
  assert.doesNotMatch(s, /\b(rows?|entit(y|ies)|list items?)\b/iu, 'words a person does not use for their things');
};

/* ── the tool list ────────────────────────────────────────────────────────── */

test('UNDERSTAND IS A RESOURCE AND NO TOOL, and says when to reach for it', async () => {
  assert.equal(TOOLS.some((t) => t.name === 'understand'), false);
  const r = (await tools(stub().surface).resources({ who: 'agent' })).find((x) => x.uri === 'braindog:understand');
  assert.ok(r);
  assert.match(r.description, /\bmeet\b/u, 'the description says to read it before meeting anyone');
  assert.match(r.description, /names/u);
  plain(r.description);
});

test('MEET SAYS WHERE IS SAID HONESTLY: mail, commits and the web are not believed alone, and your own run is session in <repo>', () => {
  const meet = TOOLS.find((t) => t.name === 'meet')!;
  assert.match(meet.description, /mail/iu);
  assert.match(meet.description, /commits/iu);
  assert.match(meet.description, /web/iu);
  assert.match(meet.description, /not believed/u);
  assert.match(meet.description, /honestly/u);
  assert.match(meet.description, /session in <repo>/u);
  plain(meet.description);
});

/* ── what the understand tool answers ─────────────────────────────────────── */

test('UNDERSTAND ANSWERS THE PLAN IN NAMES, asks the record nothing but understandPlan, and passes on nothing that acts', async () => {
  const { surface, calls } = stub({ understandPlan: async () => ({ ok: true, value: SLICE }) });
  const said = await tools(surface).read('braindog:understand', { who: 'agent' });
  assert.ok(said.ok);
  const value = said.value as Record<string, unknown>;
  assert.equal(value.undo, undefined, 'an undo is a handle no tool takes');
  assert.equal(value.filed, undefined, 'a dry slice files nothing');
  assert.deepEqual(value.writes, SLICE.writes);
  assert.equal(
    (said.value as { said: string }).said,
    [
      'Would link 3 payments to who they were with, 1 run to its project · would add 1 organisation',
      'Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios',
      'Add Lowry St Studios to Organisations',
      'and 2 more changes',
      'Would ask the owner: Which project is Fly for?',
      'Nothing was changed. The rest is read on later nights.',
    ].join('\n'),
  );
  assert.ok(!calls.some((c) => ['meet', 'create', 'update', 'propose'].includes(c.method)), 'it wrote');
  plain((said.value as { said: string }).said);
});

test('A RECORD WITHOUT UNDERSTAND PLAN IS A SENTENCE THAT SAYS WHAT TO DO INSTEAD, and a refusal passes through', async () => {
  const before = stub().surface;
  delete before.understandPlan;
  const older = await tools(before).read('braindog:understand', { who: 'agent' });
  assert.equal(!older.ok && 'refusal' in older ? older.refusal.code : null, 'NOT_IN_THIS_BUILD');
  assert.match(!older.ok && 'refusal' in older ? older.refusal.fix : '', /meet/iu);

  const refused = await tools(
    stub({ understandPlan: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner reads what the record would link.' } }) as never }).surface,
  ).read('braindog:understand', { who: 'agent' });
  assert.equal(!refused.ok && 'refusal' in refused ? refused.refusal.code : null, 'FORBIDDEN');
});

test('NOTHING TO LINK IS SAID AS SUCH, whether or not the walk read to the end', () => {
  assert.equal(
    understoodBrief({ kinds: [], writes: [], more: 0, questions: [], asks: {}, done: true }, look),
    'Nothing to link and nothing to ask: what your BrainDog holds is understood.',
  );
  assert.equal(
    understoodBrief({ kinds: [{ kind: 'payments', looked: 40, linked: 0 }], writes: [], questions: [], done: false }, look),
    'Nothing to link or ask in the next part of your BrainDog. The rest is read on later nights.',
  );
});

/* ── what a proposal moves and changes ────────────────────────────────────── */

test('MOVES IS SAID ONE CURRENCY AT A TIME, and two currencies are never added', () => {
  assert.equal(movesSaid({ amount: -1798, currency: 'GBP' }), 'Moves -£17.98');
  assert.equal(
    movesSaid([
      { amount: -1000, currency: 'GBP' },
      { amount: -798, currency: 'GBP' },
      { amount: 700, currency: 'USD' },
    ]),
    'Moves -£17.98 and $7',
  );
  /* A PAYMENT OUT AND A REFUND IN ARE TWO MOVEMENTS, never netted to less. */
  assert.equal(movesSaid([{ amount: -1000, currency: 'GBP' }, { amount: 400, currency: 'GBP' }]), 'Moves £14');
  assert.equal(movesSaid({ amount: 1500, currency: 'JPY' }), 'Moves ¥1,500');
  /* AN AMOUNT ON A ROW ACCEPTING ADDS IS RECORDED: a bank text added to the Ledger moves no money (20 Oct). */
  assert.equal(movesSaid({ amount: 3462000, currency: 'EGP' }, true), 'Records EGP 34,620');
  /* NOTHING MOVES: no money, zero, or an amount that is not whole minor units. */
  assert.equal(movesSaid(undefined), null);
  assert.equal(movesSaid({ amount: 0, currency: 'GBP' }), null);
  assert.equal(movesSaid({ amount: 12.5, currency: 'GBP' }), null);
});

test('CHANGES IS SAID BY LABEL, from what it holds to what it will, the first three, with an id left to the page', () => {
  assert.equal(
    changesSaid(
      [
        { field: 'status', label: 'Status', before: 'open', after: 'paid' },
        { field: 'amount', label: 'Amount', before: null, after: { amount: 1200, currency: 'GBP' } },
        { field: 'payee', label: 'Payee', before: null, after: '01M345FTM0D4F495AW6K6NDA06' },
        { field: 'due_on', before: '2026-10-01', after: '2026-10-08' },
        { field: 'paid', label: 'Paid', before: false, after: true },
        { field: 'note', label: 'Note', before: 'same', after: 'same' },
      ],
      look,
    ),
    'Changes Status from open to paid; Amount from nothing to £12; Due on from 1 Oct to 8 Oct and 1 more change',
  );
  assert.equal(changesSaid(undefined, look), null);
  assert.equal(changesSaid([{ field: 'payee', before: null, after: '01M345FTM0D4F495AW6K6NDA06' }], look), null);
});

test('A PROPOSAL\'S ANSWER SAYS WHAT IT MOVES AND CHANGES between the question and who decides, and neither when the record sends none', () => {
  const filed = {
    id: 'SG9',
    decide: 'https://brain.dog/mara/decide/SG9',
    money: [{ amount: -1798, currency: 'GBP' }],
    changes: [{ field: 'status', label: 'Status', before: 'open', after: 'paid' }],
  };
  assert.equal(
    proposedBrief(filed, 'Pay the studio rent?', look),
    [
      'Asked Mara: Pay the studio rent? (SG9)',
      'Moves -£17.98',
      'Changes Status from open to paid',
      'Mara decides in BrainDog at https://brain.dog/mara/decide/SG9.',
    ].join('\n'),
  );
  assert.equal(proposedBrief({ id: 'SG9' }, 'Pay the studio rent?', look), 'Asked Mara: Pay the studio rent? (SG9)\nMara decides in BrainDog.');
});

test('A CHANGE THAT MOVES A REF IS SAID BY ITS WORDS, the rows read before the answer is, with the handle beside them', async () => {
  const { surface } = stub({
    propose: async () => ({
      ok: true,
      value: { id: 'SG2', changes: [{ field: 'project', label: 'Project', before: 'projects#2', after: 'projects#5' }] },
    }),
    list: async (args) => {
      const seqs = (args.where as { in: number[] } | undefined)?.in ?? [];
      const titles: Record<number, string> = { 2: 'Kiln', 5: 'Quietcart' };
      return { ok: true, value: { rows: seqs.map((seq) => ({ id: `r${String(seq)}`, register: 'projects', seq, version: 1, fields: { title: titles[seq] } })) } };
    },
  });
  const said = await tools(surface).answer('propose', { question: 'Move the task to Quietcart?' }, { who: 'agent' });
  assert.ok(said.result.ok);
  const line = said.text.split('\n').find((l) => l.startsWith('Changes '));
  assert.ok(line, `no Changes line in ${said.text}`);
  assert.match(line, /Kiln/u);
  assert.match(line, /Quietcart/u);
  plain(said.text);
});
