/**
 * What was said survives the link (LCH-A04, the onboarding target's step 4): the page sends the sentence with the start,
 * and the tab a link opens on another device reads it back off the fragment, wipes it, and builds from it.
 *
 * THE SAME SAMPLE SENTENCES AS THE HOST'S TEST (`packages/record/test/signup-said.test.ts`), so the page leaves out of
 * the link exactly what the host would refuse.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrivalOf, keepSaid, SAID_KEY, SAID_LINK_BYTES, SAID_LINK_MOST, saidForLink, saidFromLink, saidKept, startSignup, type Draft, type Io } from './signup.ts';

const MARIAM = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer.";
const TOKEN = 'v'.repeat(20) + '_-' + 'K'.repeat(21);

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

function host() {
  const sent: Record<string, unknown>[] = [];
  const io: Io = {
    fetch: async (_url, init) => {
      sent.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ ok: true, value: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
  return { io, sent };
}

/** The address a letter's link opens, as the Worker writes it from what the host put in the mail. */
const mailed = (packed: string): string => `#verify=${TOKEN}&said=${encodeURIComponent(packed)}`;

test('THE START SENDS WHAT WAS SAID, the sentence and its one answer, and nothing else of the build', async () => {
  const h = host();
  await startSignup({ email: 'mariam@example.com', slug: 'candles', said: { said: ` ${MARIAM} `, currency: 'EGP', usecase: null } }, h.io);
  assert.deepEqual(JSON.parse(String(h.sent[0]?.['said'])), { said: MARIAM, currency: 'EGP' });
  const none = host();
  await startSignup({ email: 'mariam@example.com', slug: 'candles' }, none.io);
  assert.equal('said' in (none.sent[0] ?? {}), false, 'nothing said, nothing sent: the link is as it was');
  await startSignup({ email: 'mariam@example.com', slug: 'candles', said: { said: '   ', currency: 'EGP', usecase: null } }, none.io);
  assert.equal('said' in (none.sent[1] ?? {}), false);
});

test('A LONG SENTENCE IS SHORTENED AT A WORD to the link\'s 1,000 characters, and its answer kept', () => {
  assert.equal(SAID_LINK_MOST, 1000);
  const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
  const packed = saidForLink({ said: long, currency: null, usecase: 'shop' });
  assert.ok(packed !== null && packed.length <= SAID_LINK_MOST);
  const back = saidFromLink(packed);
  assert.equal(back?.usecase, 'shop');
  assert.ok(long.startsWith(back?.said ?? 'x'));
  assert.match(back?.said ?? '', /word\d+$/, 'cut between words');
  /* QUOTES AND NEWLINES GROW WHEN PACKED, and the packed form is what is measured. */
  const quoted = saidForLink({ said: '"'.repeat(990), currency: null, usecase: null });
  assert.ok(quoted !== null && quoted.length <= SAID_LINK_MOST);
  /* NEVER HALF A CHARACTER at the cut. */
  const wide = saidForLink({ said: '\u{1F56F}'.repeat(600), currency: null, usecase: null });
  assert.ok(wide !== null);
  assert.doesNotThrow(() => encodeURIComponent(wide));
});

test('ARABIC IS SHORTENED BY THE BYTES THE LINK WRITES, well inside the 1,000 characters, and says it was cut', () => {
  assert.equal(SAID_LINK_BYTES, 2000);
  /* SIX BYTES A LETTER IN A LINK: 600 characters packed, and more than 3,000 bytes written. */
  const arabic = Array.from({ length: 100 }, () => '\u0634\u0645\u0648\u0639').join(' ');
  assert.ok(JSON.stringify({ said: arabic }).length <= SAID_LINK_MOST, 'the characters alone would fit');
  const packed = saidForLink({ said: arabic, currency: 'EGP', usecase: null });
  assert.ok(packed !== null && packed.length <= SAID_LINK_MOST && encodeURIComponent(packed).length <= SAID_LINK_BYTES);
  const back = saidFromLink(packed);
  assert.equal(back?.cut, true, 'the pack says it carries only the start');
  assert.equal(back?.currency, 'EGP', 'its answer kept');
  assert.ok(arabic.startsWith(back?.said ?? 'x'));
  assert.match(back?.said ?? '', /\u0639$/u, 'cut between words');
  /* THE HOST'S OWN CUT IS READ TOO, and a sentence that fits whole says nothing of a cut. */
  assert.equal(saidFromLink(JSON.stringify({ said: 'I sell', cut: true }))?.cut, true);
  const whole = saidFromLink(saidForLink({ said: MARIAM, currency: null, usecase: null }));
  assert.equal(whole !== null && 'cut' in whole, false);
});

test('A SENTENCE WITH A WEB OR EMAIL ADDRESS STAYS ON THIS DEVICE, since the host would refuse it in a letter', () => {
  for (const said of ['See https://evil.example/x', 'go to www.example.org', 'write to me at m@example.com', 'my shop is mariamcandles.com', 'mailto:m@example.com'])
    assert.equal(saidForLink({ said, currency: null, usecase: null }), null, said);
  for (const said of [MARIAM, 'Mr. Adel pays me, e.g. monthly.', 'I sell at 3.50 a candle', 'shop.company of two'])
    assert.notEqual(saidForLink({ said, currency: null, usecase: null }), null, said);
});

test('A LINK OPENED ON A PHONE: the sentence is read off the fragment, wiped with the proof, and built from', () => {
  const phone = storage();
  let wiped = 0;
  const packed = saidForLink({ said: MARIAM, currency: 'EGP', usecase: null }) ?? '';
  const arrived = arrivalOf(mailed(packed), () => (wiped += 1));
  assert.deepEqual(arrived, { kind: 'verify', token: TOKEN, said: { said: MARIAM, currency: 'EGP', usecase: null } });
  assert.equal(wiped, 1, 'the whole fragment goes, the sentence with the proof');
  /* THIS DEVICE KEPT NONE, so the build reads the link's, and as often as it asks. */
  const expected: Draft = { said: MARIAM, currency: 'EGP', usecase: null };
  assert.deepEqual(saidKept(phone), expected);
  assert.deepEqual(saidKept(phone), expected, 'a second read, by the build, finds it too');
  assert.equal(phone.map.has(SAID_KEY), false, 'never written to the phone');
  /* ONCE THE BUILD IS IN, it is forgotten with the device's copy. */
  keepSaid(phone, null);
  assert.equal(saidKept(phone), null);
});

test('THE DEVICE\'S OWN COPY WINS over the link\'s, as the desk tab that typed it has the whole of it', () => {
  const desk = storage();
  keepSaid(desk, { said: `${MARIAM} And more.`, currency: 'EGP', usecase: 'shop' }, 1);
  arrivalOf(mailed(saidForLink({ said: MARIAM, currency: 'EGP', usecase: null }) ?? ''), () => {});
  assert.equal(saidKept(desk, 2)?.said, `${MARIAM} And more.`);
  keepSaid(desk, null);
  assert.equal(saidKept(desk, 2), null);
});

test('A LINK WITH NO SENTENCE, OR A BROKEN ONE, IS A PROOF AS BEFORE and builds nothing new', () => {
  const phone = storage();
  let wiped = 0;
  assert.deepEqual(arrivalOf(`#verify=${TOKEN}`, () => (wiped += 1)), { kind: 'verify', token: TOKEN });
  assert.deepEqual(arrivalOf(`#verify=${TOKEN}&said=not%20packed`, () => (wiped += 1)), { kind: 'verify', token: TOKEN });
  assert.equal(wiped, 2, 'the proof is still taken and wiped');
  assert.equal(saidKept(phone), null);
  /* A FRAGMENT THAT IS NOT A PROOF IS NOT TAKEN, and the address is left as it was. */
  assert.equal(arrivalOf(`#verify=short&said=${encodeURIComponent(JSON.stringify({ said: MARIAM }))}`, () => (wiped += 1)), null);
  assert.equal(wiped, 2);
  assert.equal(saidKept(phone), null);
});
