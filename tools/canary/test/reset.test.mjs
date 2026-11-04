/**
 * The weekly reset puts a record back through its own `export` and `import`, as its owner, and says so only when the
 * record reads back as itself.
 *
 * TWO FRESH SELF-HOSTS: one stands in for the canary, and the other's export for the lived profile, which keeps the
 * test to seconds; the lived build itself is what `reset.mjs` reads when it runs.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { identityOf } from '../brainl.mjs';
import { call, selfHost } from '../lib.mjs';
import { reset } from '../reset.mjs';

let canary;
let other;
let lived;
const at = () => ({ base: canary.base, origin: canary.origin, slug: canary.slug, bearer: canary.key });

before(async () => {
  canary = await selfHost();
  other = await selfHost();
  const out = await call({ base: other.base, origin: other.origin, bearer: other.key }, 'export', { redactGrants: false });
  assert.equal(out.said?.ok, true, out.said?.refusal?.fix);
  lived = out.said.value;
});

after(async () => {
  await canary?.close();
  await other?.close();
});

test('it puts the lived rows back over the canary with replace, and the canary reads back as itself', async () => {
  const was = identityOf((await call(at(), 'export', { redactGrants: false })).said.value);
  const sent = [];
  const send = (url, init) => (sent.push({ method: url.split('/api/')[1], body: JSON.parse(init.body) }), fetch(url, init));
  const lines = await reset(at(), { lived, io: { send } });
  assert.equal(lines.length, 1);
  assert.match(lines[0], new RegExp(`the lived default profile was put back over ${canary.slug}: \\d+ rows`, 'u'));
  assert.doesNotMatch(lines[0], /—/u);
  const put = sent.find((s) => s.method === 'import');
  assert.equal(put.body.replace, true, 'a replace, never a merge');
  assert.deepEqual(sent.map((s) => s.method), ['export', 'import', 'export'], 'read first, put back, read back');
  const now = identityOf((await call(at(), 'export', { redactGrants: false })).said.value);
  assert.deepEqual(now, was);
});

test('an import the record refuses is red in the record’s own words, and nothing says it was put back', async () => {
  const send = async (url, init) => {
    if (url.endsWith('/api/import')) return new Response(JSON.stringify({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner may replace this record.' } }), { status: 403 });
    return fetch(url, init);
  };
  await assert.rejects(reset(at(), { lived, io: { send } }), /was not put back: Only the owner may replace this record\./u);
});

test('a canary that cannot be read is refused before anything is sent to it', async () => {
  const methods = [];
  const send = async (url) => {
    methods.push(url.split('/api/')[1]);
    return new Response(JSON.stringify({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'This credential does not reach this BrainDog.' } }), { status: 403 });
  };
  await assert.rejects(reset(at(), { lived, io: { send } }), /would not export: This credential does not reach this BrainDog\./u);
  assert.deepEqual(methods, ['export']);
});
