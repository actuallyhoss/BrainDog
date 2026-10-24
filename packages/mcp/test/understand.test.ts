/**
 * The understanding layer as an agent meets it (`loop/contract-17.md`): `meet` answers in names with how
 * it matched, a merged row is followed to the one kept, the card says who is in touch here, and two questions that
 * differ by a name, an amount or a row's words are never said as one.
 *
 * OVER THE STUB SURFACE, because what is tested is what the tool layer says about what the record answered, in both of
 * the answers the record gives while the kernel's `meet` moves to the contract's shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { alike, metBrief, type Look } from '../src/brief.ts';
import { briefed } from '../src/briefing.ts';
import { matchedHow, TOOLS, tools } from '../src/index.ts';
import { gist, money } from '../src/words.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 9, 6, 9);
const FOLD = '01M345FTM0D4F495AW6K6NDA09';
const KEPT = '01M345FTM0D4F495AW6K6NDA06';
const LANTERNFISH = '01M345FTM0D4F495AW6K6NDAF1';
const COPPERLEAF = '01M345FTM0D4F495AW6K6NDAC2';

const TITLES = new Map([
  ['O1', 'Lanternfish'],
  ['things#2', 'Copperleaf'],
  ['transactions#4', 'Chillout'],
  ['transactions#9', 'Talabat'],
]);
const look: Look = { now: NOW, decl: () => undefined, title: (s) => TITLES.get(s), actor: (by) => by, decider: 'Mara' };

/* ── the words of a question ────────────────────────────────────────────── */

test('TWO QUESTIONS ABOUT DIFFERENT PEOPLE OR AMOUNTS ARE NEVER ONE, in any script', () => {
  assert.notEqual(gist('Are أحمد حسام and أحمد ح the same person?'), gist('Are محمد علي and محمد ع the same person?'));
  assert.notEqual(gist('Pay GBP 12 to Acme?'), gist('Pay GBP 1,200 to Acme?'));
  assert.notEqual(gist('Refund 12.50 EUR to Acme?'), gist('Refund 13.50 EUR to Acme?'));
  assert.notEqual(gist('Is Jean-Luc-Marie Picard the same as Jean Picard?'), gist('Is Jean-Luc-Marie Dupont the same as Jean Dupont?'));
  assert.match(gist('Is Jean-Luc-Marie Picard the same as Jean Picard?'), /jean luc marie picard/u);
  /* AND THE SAME AMOUNT WRITTEN TWO WAYS IS ONE. */
  assert.equal(gist('Pay GBP 1,200 to Acme?'), gist('pay GBP 1200 to acme'));
});

test('A DOOR\'S NAME, AN ID AND A HANDLE STILL GO, and a handle whose words were read is said by them', () => {
  const a = 'bank-card-used-sms could not read account out of SG71. Accept it into transactions#4?';
  const b = 'Bank-IPN-out-SMS could not read account out of SG73. Accept it into transactions#9?';
  assert.equal(gist(a), gist(b));
  const title = (h: string) => TITLES.get(h);
  assert.notEqual(gist(a, title), gist(b, title), 'two questions about Chillout and Talabat were said as one');
});

test('QUESTIONS BY DIFFERENT HANDS, OR WHOSE BODIES MOVE DIFFERENT AMOUNTS, ARE TWO', () => {
  const q = 'Is this the same payee as before?';
  const groups = alike(
    [
      { id: 'SG1', question: q, opened_by: 'rule:bank', body_kind: 'options' },
      { id: 'SG2', question: q, opened_by: 'rule:bank', body_kind: 'options' },
      { id: 'SG3', question: q, opened_by: 'S12', body_kind: 'options' },
      { id: 'SG4', question: q, opened_by: 'rule:bank', body_kind: 'rowset', body: { rows: [{ at: 'transactions#4', patch: { amount: { amount: 1200, currency: 'GBP' } } }] } },
      { id: 'SG5', question: q, opened_by: 'rule:bank', body_kind: 'rowset', body: { rows: [{ at: 'transactions#4', patch: { amount: { amount: 120000, currency: 'GBP' } } }] } },
    ],
    (h) => TITLES.get(h),
  );
  assert.deepEqual(
    groups.map((g) => [g.first.id, g.also]),
    [
      ['SG1', ['SG2']],
      ['SG3', []],
      ['SG4', []],
      ['SG5', []],
    ],
  );
});

test('A NEGATIVE HALF ROUNDS AWAY FROM ZERO, as a positive one does', () => {
  assert.equal(money(-101.5, 'GBP'), 'about GBP -1.02');
  assert.equal(money(101.5, 'GBP'), 'about GBP 1.02');
  assert.equal(money(-101.4, 'GBP'), 'about GBP -1.01');
});

/* ── meet, said ─────────────────────────────────────────────────────────── */

test('MEET SAYS WHAT HAPPENED IN NAMES, with how it matched and the handle last', () => {
  assert.equal(
    metBrief({ person: 'P6', name: 'Teodor Vance', created: false, how: 'email', with: ['Lanternfish', 'Copperleaf'] }, look),
    'Matched Teodor Vance (Lanternfish, Copperleaf) by email · P6',
  );
  assert.equal(metBrief({ created: false, mention: true, said: 'Priya', on: 'Lanternfish' }, look), 'Noted Priya on Lanternfish; add an email or handle to add them');
  assert.equal(
    metBrief({ created: false, mention: true, said: 'Chillout', kind: 'organisation' }, look),
    'Noted Chillout; add a domain or bank payee to add it',
  );
  assert.equal(
    metBrief({ person: 'P7', name: 'Joaquin Herrera', created: false, question: 'SG7', with: ['Lanternfish'] }, look),
    'Maybe Joaquin Herrera (Lanternfish): asked Mara on Decide · P7 · SG7',
  );
  assert.equal(metBrief({ person: 'P12', name: 'Wren', created: true, linked: true }, look), 'Added Wren to your project · P12');
  /* A ROW WITH NO WORDS IS SAID BY ITS HANDLE ONCE. */
  assert.equal(metBrief({ person: 'P6', created: false, how: 'email' }, look), 'Matched P6 by email');
  /* A QUESTION THE RECORD SENT AS WORDS ALONE, with no handle, is still said; and one with no words says what it asks. */
  assert.equal(
    metBrief({ person: 'P7', name: 'Joaquin Herrera', created: false, asked: 'Are Joaquin Herrera and joaquinherrera one person?' }, look),
    'Maybe Joaquin Herrera: asked Mara on Decide: Are Joaquin Herrera and joaquinherrera one person? · P7',
  );
  assert.equal(
    metBrief({ person: 'P9', name: 'Ann Lee', created: true, question: 'SG7' }, look),
    'Added Ann Lee; asked Mara on Decide whether they are someone already met · P9 · SG7',
  );
  assert.equal(
    metBrief({ person: 'P6', name: 'Priya Raman', created: false, how: 'email', merged_from: 'P9', merged_name: 'Priya R.' }, look),
    'Matched Priya Raman by email; Priya R. (P9) was merged into them · P6',
  );
  /* THE RECORD'S STRONG RULES FOLDED A NEW ROW INTO ONE KNOWN: said as the merge it is, with whose Undo it is. */
  assert.equal(
    metBrief({ person: 'P7', name: 'Joaquin Herrera', created: false, matched_by: 'strong', how: 'name and address or organisation', with: ['Lanternfish'] }, look),
    'Merged into Joaquin Herrera (Lanternfish) by name and address or organisation; Mara can undo it in BrainDog · P7',
  );
});

test('HOW IT MATCHED IS THE KIND OF KEY, never the key', () => {
  assert.equal(matchedHow({ created: false, matched_by: 'key' }, { email: 'teo@lanternfish.example' }), 'email');
  assert.equal(matchedHow({ created: false, matched_by: 'key' }, { handle: 'github:teo' }), 'GitHub handle');
  assert.equal(matchedHow({ created: false, matched_by: 'key' }, { kind: 'organisation', keys: ['bank:GEIDEA*CHILLOUT'] }), 'bank payee');
  assert.equal(matchedHow({ created: false, matched_by: 'key', key: 'domain:lanternfish.example' }, { email: 'x@lanternfish.example' }), 'domain');
  assert.equal(matchedHow({ created: false, matched_by: 'strong' }, { name: 'Joaquin Herrera' }), 'name and address or organisation');
  assert.equal(matchedHow({ created: true }, { email: 'a@b.co' }), null);
  /* THE OLDER ANSWER, `{ person, created }`, matched by the email the call sent. */
  assert.equal(matchedHow({ person: 'people#1', created: false }, { email: 'a@b.co', handle: 'github:a' }), 'email');
});

test('MEET TAKES WHAT THE CONTRACT GIVES IT: kind, org, domain, role and keys', () => {
  const meet = TOOLS.find((t) => t.name === 'meet')!;
  const props = (meet.input as { properties: Record<string, { enum?: string[] }> }).properties;
  for (const part of ['name', 'kind', 'email', 'handle', 'keys', 'org', 'domain', 'role', 'where']) assert.ok(part in props, `meet takes no ${part}`);
  assert.deepEqual(props.kind?.enum, ['person', 'organisation']);
});

/** A person and the duplicate folded into them, as the record holds both. */
const entry = (id: string, seq: number, fields: Record<string, unknown>) => ({ id, register: 'people', seq, version: 1, fields });
const PEOPLE_SCHEMA = {
  id: 'people',
  name: 'People',
  title: 'name',
  seq_prefix: 'P',
  fields: [
    { id: 'name', type: 'text' },
    { id: 'org', type: 'ref', to: 'organisations' },
    { id: 'projects', type: 'list', of: 'ref', to: 'things' },
    { id: 'merged_into', type: 'ref', to: 'people' },
  ],
};
const ROWS: Record<string, ReturnType<typeof entry>> = {
  [FOLD]: entry(FOLD, 9, { name: 'Priya R.', merged_into: KEPT }),
  [KEPT]: entry(KEPT, 6, { name: 'Priya Raman', org: LANTERNFISH, projects: [COPPERLEAF] }),
};
const surfaceOf = (met: Record<string, unknown>) =>
  stub({
    meet: async () => ({ ok: true, value: met }),
    schema: async (args: { register: string }) =>
      ({ ok: true, value: args.register === 'people' ? PEOPLE_SCHEMA : { id: args.register, title: 'name', seq_prefix: args.register === 'organisations' ? 'O' : '', fields: [{ id: 'name', type: 'text' }] } }) as never,
    get: async (args: { spoken?: string; register?: string; seq?: number }) => {
      const id = args.spoken === 'P9' ? FOLD : args.spoken === 'P6' ? KEPT : args.spoken;
      return { ok: true, value: (id && ROWS[id]) ?? null } as never;
    },
    list: async (args: { register: string; where?: { in?: string[] } }) => {
      const names: Record<string, { name: string; seq: number }> = { [LANTERNFISH]: { name: 'Lanternfish', seq: 1 }, [COPPERLEAF]: { name: 'Copperleaf', seq: 2 } };
      const rows = (args.where?.in ?? []).filter((id) => names[id]).map((id) => ({ id, register: args.register, seq: names[id]!.seq, version: 1, fields: { name: names[id]!.name } }));
      return { ok: true, value: { rows } } as never;
    },
  }).surface;

test('MEET FOLLOWS A MERGED ROW TO THE ONE KEPT and says them by name, from the contract\'s answer', async () => {
  const mcp = tools(surfaceOf({ row: { register: 'people', id: FOLD, seq: 9, name: 'Priya R.' }, created: false, matched_by: 'key' }));
  const said = await mcp.answer('meet', { name: 'Priya', email: 'priya@lanternfish.example', where: 'commit 4464966 in braindog' }, { who: 'agent' });
  const value = said.result.ok ? (said.result.value as Record<string, unknown>) : {};
  assert.equal(value.person, 'P6');
  assert.equal(value.name, 'Priya Raman');
  assert.equal(value.merged_from, 'P9');
  assert.doesNotMatch(JSON.stringify(value), /[0-9A-HJKMNP-TV-Z]{26}/u, 'the answer carried a row id');
  assert.equal(said.text, `Matched Priya Raman (Lanternfish, Copperleaf) by email; Priya R. (P9) was merged into them · P6\nReceipt: No undo handle came back for this one; the owner can put it back from the app.`);
});

test('A NAME ALONE IS NOTED, and the answer says what would add them', async () => {
  const mcp = tools(
    stub({
      meet: async () => ({ ok: true, value: { row: null, created: false, matched_by: 'none', mention: true } }),
      context: async () => ({ ok: true, value: { project: { spoken: 'things#1', name: 'Lanternfish' } } }) as never,
    }).surface,
  );
  const said = await mcp.answer('meet', { name: 'Priya', where: 'a note in Lanternfish' }, { who: 'agent' });
  assert.equal(said.text, `Noted Priya on Lanternfish; add an email or handle to add them\nReceipt: No undo handle came back for this one; the owner can put it back from the app.`);
});

test('GET OF A MERGED ROW ANSWERS THE ROW KEPT, saying which it was asked for', async () => {
  const mcp = tools(surfaceOf({}));
  const said = await mcp.answer('get', { spoken: 'P9' }, { who: 'agent' });
  const value = said.result.ok ? (said.result.value as Record<string, unknown>) : {};
  assert.equal(value.spoken, 'P6');
  assert.equal(value.merged_from, 'P9');
  assert.match(said.text, /^Priya R\. \(P9\) was merged into this one:\nPriya Raman \(P6\)/u);
});

/* ── the card ───────────────────────────────────────────────────────────── */

const card = (context: Record<string, unknown>) => briefed({ context, look, home: null });

test('A FOLDER THAT MATCHES SEVERAL PROJECTS IS ONE QUESTION', () => {
  const { text } = card({ ambiguous: ['things#2', 'O1'] });
  assert.match(text, /^Which project is this folder, Copperleaf \(things#2\) or Lanternfish \(O1\)\? Until one is set you work in no project\.$/mu);
});
