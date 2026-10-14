/**
 * The Keys tile's one line about keys that look like they belong to a project, and its one button: the record's own
 * line and sentence, nothing drawn at nought or on a refusal, and Decide's address for the question a press filed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { askMove, KEYS_LIST, noteOf, proposalOf, readScopeNote, words, type Call } from './scope-note.ts';

const ULID = '01JABCDEFGHJKMNPQRSTVWXYZ0';

const proposal = (over: Record<string, unknown> = {}) => ({
  list: KEYS_LIST,
  name: 'Keys',
  count: 52,
  line: '52 keys look like they belong to a project.',
  rows: [{ title: 'Bake deploy token', project: 'Crumb.gg', reasons: ['Opened only by runs in Crumb.gg'] }],
  truncated: false,
  ...over,
});

/** A stand-in record: each method answers what it is given, and every call is kept. */
function record(answers: Record<string, unknown>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const call: Call = async (name, args) => {
    calls.push({ name, args });
    if (!(name in answers)) return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This host does not know that method.' } };
    const a = answers[name];
    if (a instanceof Error) throw a;
    return a;
  };
  return { call, calls };
}

test('nought draws nothing: the read answers null and the note is none', async () => {
  const { call } = record({ scopeProposals: { ok: true, value: [proposal({ count: 0, line: '', rows: [] })] } });
  assert.equal(await readScopeNote(call), null);
  assert.equal(noteOf(null), null);
  assert.equal(noteOf(proposalOf({ ok: true, value: [proposal({ count: 0 })] }, KEYS_LIST)), null);
});

test('52 keys: the record is asked about the keys list, and the line and the button are drawn', async () => {
  const { call, calls } = record({ scopeProposals: { ok: true, value: [proposal({ list: 'tools', name: 'Tools', count: 3 }), proposal()] } });
  const found = await readScopeNote(call);
  assert.deepEqual(calls, [{ name: 'scopeProposals', args: { register: KEYS_LIST } }]);
  assert.equal(found?.count, 52);
  assert.equal(found?.rows[0]?.project, 'Crumb.gg');
  assert.deepEqual(noteOf(found), { line: '52 keys look like they belong to a project.', button: 'Review the move' });
});

test('with no line of its own the note says the count and the list by its own name, never an id or an em dash', () => {
  const said = noteOf(proposalOf({ ok: true, value: [proposal({ line: '' })] }, KEYS_LIST));
  assert.equal(said?.line, '52 of your keys look like they belong to a project.');
  assert.equal(noteOf(proposalOf({ ok: true, value: [proposal({ line: '', count: 1, name: 'API keys' })] }, KEYS_LIST))?.line, '1 of your API keys looks like it belongs to a project.');
  /* A line carrying an id is not drawn: the note falls back to its own words. */
  assert.equal(noteOf(proposalOf({ ok: true, value: [proposal({ line: `52 keys in ${ULID}` })] }, KEYS_LIST))?.line, '52 of your keys look like they belong to a project.');
  /* An em dash in the record's line becomes a comma. */
  const dashed = noteOf(proposalOf({ ok: true, value: [proposal({ line: '52 keys — move them to their projects.' })] }, KEYS_LIST))?.line ?? '';
  assert.equal(dashed, '52 keys, move them to their projects.');
  assert.ok(!dashed.includes('—'));
});

test('a refusal, an unknown method, a throw and another shape all answer null', async () => {
  assert.equal(await readScopeNote(record({ scopeProposals: { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner may.' } } }).call), null);
  assert.equal(await readScopeNote(record({}).call), null);
  assert.equal(await readScopeNote(record({ scopeProposals: new Error('offline') }).call), null);
  assert.equal(await readScopeNote(record({ scopeProposals: { ok: true, value: 'nope' } }).call), null);
  /* A list held from the reader is never named, so an answer about other lists is none for the keys. */
  assert.equal(await readScopeNote(record({ scopeProposals: { ok: true, value: [proposal({ list: 'tools' })] } }).call), null);
  /* A host that wraps the list in an object is still read. */
  assert.equal((await readScopeNote(record({ scopeProposals: { ok: true, value: { lists: [proposal()] } } }).call))?.count, 52);
});

test('askMove files the question for the keys list and answers its Decide address', async () => {
  const { call, calls } = record({ proposeScopes: { ok: true, value: { asked: [{ list: 'tools', question: 'Q2', rows: 3 }, { list: KEYS_LIST, question: ULID, rows: 52 }] } } });
  assert.deepEqual(await askMove(call), { ok: true, href: `/decide/${ULID}` });
  assert.deepEqual(calls, [{ name: 'proposeScopes', args: { register: KEYS_LIST } }]);
  /* An open question answered again comes back the same way, and an object with an id is read too. */
  assert.deepEqual(await askMove(record({ proposeScopes: { ok: true, value: { asked: [{ list: KEYS_LIST, question: { id: 'Q 7' } }] } } }).call), { ok: true, href: '/decide/Q%207' });
});

test("askMove passes the record's sentence through, and says its own only when the record said none", async () => {
  const fix = 'Only a person may file this question. Press it in the app.';
  assert.deepEqual(await askMove(record({ proposeScopes: { ok: false, refusal: { code: 'FORBIDDEN', fix } } }).call), { ok: false, line: fix });
  assert.deepEqual(await askMove(record({ proposeScopes: { ok: false } }).call), { ok: false, line: words.failed });
  assert.deepEqual(await askMove(record({ proposeScopes: new Error('offline') }).call), { ok: false, line: words.failed });
  assert.deepEqual(await askMove(record({ proposeScopes: { ok: true, value: { asked: [] } } }).call), { ok: false, line: words.nothing });
});
