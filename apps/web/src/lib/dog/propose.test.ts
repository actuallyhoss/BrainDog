/**
 * A page's edited source sent as one change on Decide, over a fake `call` that keeps what it was sent and answers as
 * the record does. Invented names only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pageTitle, proposePage, proposeWords, type Call, type PageDecl } from './propose.ts';

const GREENHOUSE: PageDecl = {
  id: 'page.greenhouse',
  kind: 'page',
  body: { page: 'greenhouse', title: 'Greenhouse', requires: ['register.seedlings'], blocks: [{ kind: 'note', body: 'Water on Tuesdays.' }] },
};

type Sent = { name: string; args: Record<string, unknown> | undefined };

/** A fake record: every `propose` is filed under the next number, and the question is kept to be read back. */
function fake(answer?: Awaited<ReturnType<Call>>) {
  const sent: Sent[] = [];
  const call: Call = async (name, args) => {
    sent.push({ name, args });
    return answer ?? { ok: true, value: { id: `SG${String(sent.length)}` } };
  };
  return { call, sent };
}

test('a reader’s edit files one change with the whole declaration, and answers the question it filed', async () => {
  const f = fake();
  const out = await proposePage(f.call, GREENHOUSE, undefined, 7);
  assert.deepEqual(out, { ok: true, question: 'SG1' });
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.sent[0], {
    name: 'propose',
    args: {
      question: 'Change the page Greenhouse as written?',
      body_kind: 'change',
      body: { declaration_id: 'page.greenhouse', to: GREENHOUSE, from_version: 7 },
    },
  });
});

test('a reason is kept with the change, and a blank one is not sent', async () => {
  const f = fake();
  await proposePage(f.call, GREENHOUSE, '  The note says the wrong day.  ');
  await proposePage(f.call, GREENHOUSE, '   ');
  const bodies = f.sent.map((s) => s.args?.body as Record<string, unknown>);
  assert.deepEqual(bodies[0]?.why, ['The note says the wrong day.']);
  assert.equal('why' in (bodies[1] ?? {}), false);
  assert.equal('from_version' in (bodies[1] ?? {}), false, 'no version read, none sent');
});

test('the record’s refusal is passed on in its own sentence', async () => {
  const fix = 'This page reads a list that is not there: seedlings. Install it first.';
  const f = fake({ ok: false, refusal: { code: 'REGISTER_UNRESOLVED', fix } });
  assert.deepEqual(await proposePage(f.call, GREENHOUSE), { ok: false, fix });
});

test('a call that throws, or an answer with no question, is said in words and never as a link', async () => {
  const thrown: Call = async () => {
    throw new Error('offline');
  };
  assert.deepEqual(await proposePage(thrown, GREENHOUSE), { ok: false, fix: proposeWords.unreached });
  assert.deepEqual(await proposePage(fake({ ok: true, value: {} }).call, GREENHOUSE), { ok: false, fix: proposeWords.unnamed });
  assert.deepEqual(await proposePage(fake({ ok: false, conflict: {} }).call, GREENHOUSE), { ok: false, fix: proposeWords.conflict });
});

test('a template’s pattern is no name for a page, so the page’s own name is said', () => {
  assert.equal(pageTitle({ id: 'page.plot', kind: 'page', body: { page: 'plot', title: '{{name}}' } }), 'plot');
  assert.equal(pageTitle({ id: 'page.plot', kind: 'page', body: {} }), 'plot');
  assert.equal(pageTitle(GREENHOUSE), 'Greenhouse');
});
