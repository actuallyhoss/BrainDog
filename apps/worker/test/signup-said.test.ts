/**
 * What a person said rides in the sign-up link (link-carry-45): `POST /auth/signup/start` takes `said`, and `signUp()`
 * hands it to the Directory's `signup.start` untouched, which puts it in the mailed link's fragment and nowhere else.
 *
 * MEASURED BEFORE THIS FILE: the door built the Directory's call from email, slug, name, tz and code, so a `said` the
 * page sent was dropped, and a link opened on a phone after typing on a desk carried no sentence. The door's own rule is
 * the length, 1,000 characters, refused before the Directory is asked, so nothing is mailed; the body's 8,192 bytes stay.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud, HOST } from './cloud-harness.ts';

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };

/** An open host with mail on, the letters kept, and every line the Worker logs kept too. */
async function host() {
  const sent: { to?: unknown; text?: unknown }[] = [];
  const c = await cloud({
    SIGNUP: 'open',
    AUTH_MAIL_FROM: 'hello@example.test',
    EMAIL: { send: async (m: Record<string, unknown>) => (sent.push(m), { messageId: 'm' }) },
  });
  let seq = 0;
  const start = async (body: Record<string, unknown>) => {
    const res = await c.ask('/auth/signup/start', { method: 'POST', body: JSON.stringify(body), headers: { 'cf-connecting-ip': `198.51.100.${String(++seq)}` } });
    /* THE LETTER GOES INSIDE `waitUntil`, which the harness does not wait for: one turn of the loop lets it land. */
    await new Promise((r) => setTimeout(r, 0));
    return { status: res.status, out: (await res.json()) as Out };
  };
  return { ...c, sent, start };
}

const SENTENCE = 'I run a pottery studio and lose track of glaze orders. Answer: the kiln schedule.';

test('SAID GOES THROUGH UNTOUCHED: the letter\'s link carries it after the proof', async () => {
  const c = await host();
  const lines: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
  console.error = console.log;
  try {
    /* NOT TRIMMED: the spaces are hers, and the door is not the place that reads them. */
    const { status, out } = await c.start({ email: 'sami@example.test', slug: 'kiln', said: `  ${SENTENCE}` });
    assert.equal(status, 200, JSON.stringify(out));
  } finally {
    console.log = log;
    console.error = error;
  }
  assert.equal(c.sent.length, 1);
  const text = String(c.sent[0]?.text);
  assert.match(text, new RegExp(`https://${HOST}/app/signup#verify=[^\\s&]+&said=`));
  const carried = /&said=([^\s]+)/u.exec(text)?.[1] ?? '';
  assert.equal(decodeURIComponent(carried).trim(), SENTENCE);
  /* AND NOWHERE ELSE: not a table of the Directory's and not a line of the Worker's. */
  assert.ok(!lines.some((l) => l.includes('pottery')), 'the sentence reached a log line');
  const tables = c.dirStorage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table'").toArray() as { name: string }[];
  for (const { name } of tables) {
    const rows = JSON.stringify(c.dirStorage.sql.exec(`SELECT * FROM "${name}"`).toArray());
    assert.ok(!rows.includes('pottery'), `the sentence was kept in ${name}`);
  }
});

test('NO SAID, THE LINK STAYS AS IT WAS', async () => {
  const c = await host();
  const { status } = await c.start({ email: 'ada@example.test', slug: 'atelier' });
  assert.equal(status, 200);
  assert.doesNotMatch(String(c.sent[0]?.text), /&said=/u);
});

test('1,001 CHARACTERS ARE REFUSED WITH A SENTENCE BEFORE ANYTHING IS MAILED; 1,000 GO THROUGH', async () => {
  const c = await host();
  const long = await c.start({ email: 'bo@example.test', slug: 'bench', said: 'a'.repeat(1_001) });
  assert.equal(long.status, 400);
  assert.equal(long.out.refusal?.at, 'said');
  assert.match(long.out.refusal?.fix ?? '', /at most 1,000 characters/u);
  assert.doesNotMatch(long.out.refusal?.fix ?? '', /—/u, 'no em dash in a sentence a person reads');
  assert.equal(c.sent.length, 0, 'a refused sign-up was mailed');

  const fits = await c.start({ email: 'bo@example.test', slug: 'bench', said: 'a'.repeat(1_000) });
  assert.equal(fits.status, 200, JSON.stringify(fits.out));
  assert.equal(c.sent.length, 1);
});

test('SAID THAT IS NOT TEXT IS REFUSED AT SAID', async () => {
  const c = await host();
  for (const said of [42, ['words'], { words: 'x' }]) {
    const out = await c.start({ email: 'cy@example.test', slug: 'loft', said });
    assert.equal(out.status, 400, JSON.stringify(said));
    assert.equal(out.out.refusal?.at, 'said');
  }
  assert.equal(c.sent.length, 0);
});
