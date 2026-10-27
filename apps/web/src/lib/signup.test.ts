/**
 * What was said survives the link (the onboarding target's step 4): the page sends the sentence with the start,
 * and the tab a link opens on another device reads it back off the fragment, wipes it, and builds from it.
 *
 * THE SAME SAMPLE SENTENCES AS THE HOST'S TEST (`packages/record/test/signup-said.test.ts`), so the page leaves out of
 * the link exactly what the host would refuse.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  answeredAs,
  arrivalOf,
  askOf,
  keepKey,
  keepLeft,
  keepReadsOff,
  keepSaid,
  pressKept,
  readerFor,
  readingKept,
  readingOf,
  READS_OFF,
  readsOffKept,
  SAID_KEY,
  SAID_LINK_BYTES,
  SAID_LINK_MOST,
  saidForLink,
  saidFromLink,
  saidKept,
  startSignup,
  type Draft,
  type Io,
  type ReadDoor,
} from './signup.ts';
import type { FirstAsked, SetupReply } from './start/ask.ts';
import { proposeFirst, type Proposal } from './start/propose.ts';
import { accepting } from '../routes/signup/build.ts';
import { browserCurrencyEnv } from '../routes/start/building.ts';

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

test('THE BUILD\'S KEY IS KEPT WITH THE SENTENCE, so a reload between the call and its answer presses under the same one', () => {
  const desk = storage();
  const KEY = 'first-run-3f2b8c1e-0d4a-4a6f-9b57-1c2d3e4f5a6b';
  keepSaid(desk, { said: MARIAM, currency: 'EGP', usecase: null, key: KEY }, 1);
  assert.deepEqual(saidKept(desk, 2, null), { said: MARIAM, currency: 'EGP', usecase: null, key: KEY });
  /* ONE KEPT BEFORE THERE WAS A KEY reads back without one, as it always did. */
  const before = storage();
  before.map.set(SAID_KEY, JSON.stringify({ said: MARIAM, currency: 'EGP', usecase: null, at: 1 }));
  const old = saidKept(before, 2, null);
  assert.deepEqual(old, { said: MARIAM, currency: 'EGP', usecase: null });
  assert.equal(old !== null && 'key' in old, false);
  /* A KEY THAT IS NOT ONE IS LEFT OUT, and the sentence is still built. */
  for (const bad of [7, '', 'has space', 'k'.repeat(65), 'k'.repeat(101), null]) {
    before.map.set(SAID_KEY, JSON.stringify({ said: MARIAM, currency: null, usecase: null, key: bad, at: 1 }));
    assert.deepEqual(saidKept(before, 2, null), { said: MARIAM, currency: null, usecase: null }, String(bad));
  }
  /* AS LONG AS THE RECORD TAKES, AND NO LONGER: 64 is kept, and the page's own key is well inside it. */
  before.map.set(SAID_KEY, JSON.stringify({ said: MARIAM, currency: null, usecase: null, key: 'k'.repeat(64), at: 1 }));
  assert.equal(saidKept(before, 2, null)?.key, 'k'.repeat(64));
  assert.equal(KEY.length <= 64, true);
  /* DROPPED WITH THE DRAFT once all of it is in the record. */
  keepSaid(desk, null);
  assert.equal(desk.map.has(SAID_KEY), false);
  assert.equal(saidKept(desk, 2, null), null);
});

test('A KEY IS PUT BESIDE A SENTENCE ALREADY KEPT, without making the sentence any younger', () => {
  const desk = storage();
  keepSaid(desk, { said: MARIAM, currency: 'EGP', usecase: 'shop', reply: { about: 'currency', value: 'EGP' } }, 1000);
  keepKey(desk, 'first-run-one', 5000);
  assert.deepEqual(saidKept(desk, 5000, null), { said: MARIAM, currency: 'EGP', usecase: 'shop', reply: { about: 'currency', value: 'EGP' }, key: 'first-run-one' });
  assert.equal((JSON.parse(desk.map.get(SAID_KEY) ?? '{}') as { at?: number }).at, 1000, 'its day still runs from when it was said');
  /* THE FIRST KEY STAYS: a Try again of an answered press takes a new one, and that one is the page's alone. */
  keepKey(desk, 'first-run-two', 6000);
  assert.equal(saidKept(desk, 6000, null)?.key, 'first-run-one');
  /* NOTHING KEPT, NOTHING WRITTEN: a key alone builds nothing, and a key that is not one changes nothing. */
  const phone = storage();
  keepKey(phone, 'first-run-one', 1);
  assert.equal(phone.map.has(SAID_KEY), false);
  keepKey(desk, 'not a key', 7000);
  assert.equal(saidKept(desk, 7000, null)?.key, 'first-run-one');
  /* STORAGE OFF: no throw, and the page presses under the key it holds in memory. */
  const blocked = { getItem: () => { throw new Error('off'); }, setItem: () => { throw new Error('off'); }, removeItem: () => { throw new Error('off'); } };
  assert.doesNotThrow(() => keepKey(blocked, 'first-run-one'));
  assert.doesNotThrow(() => keepSaid(blocked, { said: MARIAM, currency: null, usecase: null, key: 'first-run-one' }));
});

test('A RELOAD AFTER A PRESS THAT ANSWERED IN PART builds under the first key, so the plan is not written twice', () => {
  const desk = storage();
  keepSaid(desk, { said: MARIAM, currency: 'EGP', usecase: 'shop' }, 1000);
  /* THE FIRST PRESS, as the page's `write` keeps it before the call goes out. */
  keepKey(desk, 'first-run-one', 2000);
  /* IT ANSWERED IN PART: what is left goes under a new key, and Try again passes that one through `write` too. */
  keepKey(desk, 'first-run-two', 3000);
  /* THE RELOAD: a new page with nothing in memory reads the sentence and its key off the device, as `build` does. */
  const reloaded = saidKept(desk, 4000, null);
  assert.equal(reloaded?.key, 'first-run-one', 'the whole plan goes under the key the record holds');
  assert.equal(reloaded?.said, MARIAM);
  /* AND AGAIN, after that press answered in part and a second reload: still the first. */
  keepKey(desk, reloaded!.key!, 5000);
  keepKey(desk, 'first-run-three', 6000);
  assert.equal(saidKept(desk, 7000, null)?.key, 'first-run-one');
  /* A NEW SENTENCE IS A NEW BUILD: kept without a key, and its first press keeps its own. */
  keepSaid(desk, { said: `${MARIAM} And candles.`, currency: 'EGP', usecase: 'shop' }, 8000);
  assert.equal(saidKept(desk, 8000, null)?.key, undefined);
  keepKey(desk, 'first-run-four', 9000);
  assert.equal(saidKept(desk, 9000, null)?.key, 'first-run-four');
  /* ALL OF IT IN: the key goes with the sentence, and the next sign-up on this device starts clean. */
  keepSaid(desk, null);
  keepKey(desk, 'first-run-five', 10000);
  assert.equal(desk.map.has(SAID_KEY), false);
});

/** A record as `setup` keeps its word: a key it holds is passed over, and any other writes every entry it is sent. */
function record() {
  const held = new Set<string>();
  const written: string[] = [];
  /** One press. `refuse` names the entries this press does not write, which it hands back as left. */
  const setup = (press: { key?: string; again?: boolean; proposal: { rows: unknown[] } }, refuse: readonly string[] = []): string[] => {
    if (press.key === undefined || held.has(press.key)) return [];
    held.add(press.key);
    const rows = press.proposal.rows as string[];
    written.push(...rows.filter((r) => !refuse.includes(r)));
    return rows.filter((r) => refuse.includes(r));
  };
  return { written, setup };
}

test('PARTIAL, TRY AGAIN GOES IN, RELOAD: nothing is written twice', () => {
  const desk = storage();
  const rec = record();
  /* THE BUILD AS THE SENTENCE READS, the same on every load of the page. */
  const built = { proposal: { rows: ['a task', 'an order', 'a person'], modules: ['tasks'] } };
  keepSaid(desk, { said: MARIAM, currency: 'EGP', usecase: 'shop' }, 1000);
  /* THE FIRST PRESS, answered in part: one entry in, two handed back for a new key. */
  keepKey(desk, 'first-run-one', 2000);
  const left = rec.setup({ ...built, key: 'first-run-one' }, ['an order', 'a person']);
  assert.deepEqual(rec.written, ['a task']);
  keepLeft(desk, { key: 'first-run-two', rows: left }, 3000);
  /* TRY AGAIN GOES IN under the new key, and the tab is reloaded before its answer is acted on. */
  keepKey(desk, 'first-run-two', 3500);
  rec.setup({ ...built, again: true, key: 'first-run-two', proposal: { ...built.proposal, rows: left } });
  assert.deepEqual(rec.written, ['a task', 'an order', 'a person']);
  /* THE RELOAD: the sentence, its first key and what was left, read off the device as `build` reads them. */
  const reloaded = saidKept(desk, 4000, null);
  assert.equal(reloaded?.key, 'first-run-one', 'the first key stays');
  assert.deepEqual(reloaded?.left, { key: 'first-run-two', rows: ['an order', 'a person'] });
  const press = pressKept(built, reloaded);
  assert.deepEqual(press, { proposal: { rows: ['an order', 'a person'], modules: ['tasks'] }, again: true, key: 'first-run-two' });
  rec.setup(press);
  assert.deepEqual(rec.written, ['a task', 'an order', 'a person'], 'the reload wrote nothing a second time');
  /* THE FAULT THIS HOLDS OFF: the whole plan again under a key the record never held for the Try again's entries. */
  const old = record();
  old.setup({ ...built, key: 'k1' }, ['an order', 'a person']);
  old.setup({ ...built, key: 'k2', proposal: { ...built.proposal, rows: left } });
  old.setup({ ...built, key: 'k3' });
  assert.equal(old.written.filter((r) => r === 'an order').length, 2, 'which is what doubled before');
  /* AND A TRY AGAIN THAT NEVER REACHED THE RECORD is written by the reload, once. */
  const lost = record();
  lost.setup({ ...built, key: 'first-run-one' }, ['an order', 'a person']);
  lost.setup(press);
  lost.setup(pressKept(built, saidKept(desk, 5000, null)));
  assert.deepEqual(lost.written, ['a task', 'an order', 'a person']);
});

test('WHAT IS LEFT IS KEPT WITH ITS PLAN AND GOES WITH THE SENTENCE, and a first press is sent as it is', () => {
  const desk = storage();
  const built = { proposal: { rows: ['a'] }, drafted: { lists: 1 } as object | null, plan: ['p1', 'p2'] as unknown[] };
  /* NOTHING KEPT: the build as it is. A KEY ALONE (a reload before any answer): the whole of it under that key. */
  assert.equal(pressKept(built, null), built);
  assert.deepEqual(pressKept(built, { key: 'first-run-one' }), { ...built, key: 'first-run-one', again: true });
  /* NO SENTENCE, NOTHING WRITTEN, as with the key. */
  keepLeft(desk, { key: 'first-run-two', rows: [] }, 1);
  assert.equal(desk.map.has(SAID_KEY), false);
  keepSaid(desk, { said: MARIAM, currency: null, usecase: 'shop' }, 1000);
  keepKey(desk, 'first-run-one', 2000);
  /* THE PLAN STILL TO MAKE (none of it, here) AND A DRAFT ALREADY ON DECIDE ride with what is left. */
  keepLeft(desk, { key: 'first-run-two', rows: [], plan: [], filed: true }, 3000);
  assert.equal(JSON.parse(desk.map.get(SAID_KEY)!).at, 1000, 'the sentence is no younger for it');
  assert.deepEqual(pressKept(built, saidKept(desk, 4000, null)), { proposal: { rows: [] }, drafted: null, plan: [], again: true, key: 'first-run-two' });
  /* A LATER PARTIAL ANSWER TAKES ITS PLACE, and one that is not a key or not entries is not kept. */
  keepLeft(desk, { key: 'first-run-three', rows: ['b'] }, 5000);
  keepLeft(desk, { key: 'not a key', rows: ['c'] }, 5500);
  keepLeft(desk, { key: 'first-run-four', rows: 'c' as unknown as unknown[] }, 5600);
  assert.deepEqual(saidKept(desk, 6000, null)?.left, { key: 'first-run-three', rows: ['b'] });
  /* IT NEVER RIDES IN THE LINK, and a new sentence or a build all in leaves none behind. */
  assert.equal(saidForLink({ ...saidKept(desk, 6000, null)! })?.includes('first-run'), false);
  keepSaid(desk, { said: `${MARIAM} And candles.`, currency: null, usecase: 'shop' }, 7000);
  assert.equal(saidKept(desk, 7000, null)?.left, undefined);
  keepLeft(desk, { key: 'first-run-five', rows: ['d'] }, 7500);
  keepSaid(desk, null);
  assert.equal(saidKept(desk, 8000, null), null);
  const blocked = { getItem: () => { throw new Error('off'); }, setItem: () => { throw new Error('off'); }, removeItem: () => {} };
  assert.doesNotThrow(() => keepLeft(blocked, { key: 'first-run-one', rows: [] }));
});

test('THE KEY NEVER RIDES IN THE LINK: it is this device\'s handle on its own press', () => {
  const packed = saidForLink({ said: MARIAM, currency: 'EGP', usecase: null, key: 'first-run-one' });
  assert.deepEqual(JSON.parse(packed ?? '{}'), { said: MARIAM, currency: 'EGP' });
  const back = saidFromLink(JSON.stringify({ said: MARIAM, key: 'first-run-other' }));
  assert.equal(back !== null && 'key' in back, false, 'and one a link carries is not taken');
});

/* ── USE-B05: the reading, asked on a press and kept beside the sentence ─────────────────────────────────────── */

const NOOR = "I'm Noor. I run a small pottery shop and sell mugs.";
const WHERE = { zone: 'Africa/Cairo', locale: 'en-GB' };

/** What a reading door answers for Noor's words, as a model would: the shop, her name, and one question back. */
const NOOR_READ = {
  name: 'Noor',
  summary: 'A small pottery shop.',
  usecase: 'shop',
  also: [],
  modules: [],
  currency: null,
  heard: [{ phrase: 'pottery shop', became: 'Shop' }],
  names: [],
  rows: [],
  draft: null,
  by: 'included',
  ask: { about: 'things', question: 'What do you sell most?', choices: ['Mugs', 'Bowls'] },
} satisfies SetupReply & { ask: unknown };

/** A door that counts what it was sent, answering 501 (off) or Noor's reading (on). */
function readDoor(on: boolean): { door: ReadDoor; sent: FirstAsked[] } {
  const sent: FirstAsked[] = [];
  const door: ReadDoor = async (ask) => {
    sent.push(ask);
    return on ? { ok: true, value: NOOR_READ } : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This host has no reading door.' } };
  };
  return { door, sent };
}

/** A widget that hands a new answer each time it is asked, and counts how often. */
function widget() {
  let n = 0;
  return { human: async () => `answer-${++n}`, asked: () => n };
}

test('A READING IS ASKED ONLY FOR A PRESS: a key or a pause sends nothing, and the rules read', async () => {
  const on = readDoor(true);
  const w = widget();
  for (const cause of ['key', 'pause'] as const) {
    const reader = readerFor(cause, on.door, { ...WHERE, human: w.human });
    assert.equal(reader, null, `${cause} has a reader`);
    const p = await proposeFirst(NOOR, WHERE, reader);
    assert.ok(p.by === undefined || p.by === 'rules', `${cause} was read by ${p.by}`);
  }
  assert.equal(on.sent.length, 0, 'the door was asked without a press');
  assert.equal(w.asked(), 0, 'a bot-check answer was spent without a press');
  assert.equal(readerFor('press', null, { ...WHERE, human: w.human }), null, 'no door, no reader');
});

test('A PRESS WITH THE DOOR OFF: the host answers 501 once, the rules reading stands, and the tab remembers', async () => {
  const off = readDoor(false);
  const w = widget();
  const codes: string[] = [];
  const reader = readerFor('press', off.door, { ...WHERE, human: w.human, heard: (out) => void (!out.ok && codes.push(out.refusal.code)) });
  const p = await proposeFirst(NOOR, WHERE, reader);
  assert.equal(off.sent.length, 1);
  assert.equal(off.sent[0]?.said, NOOR);
  assert.equal(off.sent[0]?.turnstile, 'answer-1', 'a fresh bot-check answer goes with the read');
  assert.ok(p.by === undefined || p.by === 'rules');
  assert.equal(p.fell, READS_OFF, 'the rules read it, and the build says why');
  assert.deepEqual(codes, [READS_OFF]);
  const tab = storage();
  assert.equal(readsOffKept(tab), false);
  keepReadsOff(tab);
  assert.equal(readsOffKept(tab), true, 'the line about a model is not said again this session');
  const blocked = { getItem: () => { throw new Error('off'); }, setItem: () => { throw new Error('off'); } };
  assert.doesNotThrow(() => keepReadsOff(blocked));
  assert.equal(readsOffKept(blocked), false);
});

test('NO BOT-CHECK ANSWER, NO READ: the door is never asked, and the rules read', async () => {
  const on = readDoor(true);
  const p = await proposeFirst(NOOR, WHERE, readerFor('press', on.door, { ...WHERE, human: async () => null }));
  assert.equal(on.sent.length, 0);
  assert.equal(p.fell, 'FORBIDDEN');
});

test('A PRESS WITH THE DOOR ON CARRIES THE READING THROUGH THE KEPT SENTENCE, and the build never reads again', async () => {
  const on = readDoor(true);
  const w = widget();
  let ask: unknown = null;
  const reader = readerFor('press', on.door, { ...WHERE, human: w.human, heard: (out) => void (ask = out.ok ? askOf(out.value) : null) });
  const p = await proposeFirst(NOOR, WHERE, reader);
  assert.equal(p.by, 'included');
  assert.equal(p.usecase, 'shop');
  assert.equal(p.name, 'Noor');
  assert.deepEqual(ask, { about: 'things', question: 'What do you sell most?', choices: ['Mugs', 'Bowls'] });
  /* A SECOND PRESS IS A SECOND ANSWER: one is good once. */
  await proposeFirst(NOOR, WHERE, reader);
  assert.deepEqual(on.sent.map((s) => s.turnstile), ['answer-1', 'answer-2']);

  const desk = storage();
  keepSaid(desk, { said: NOOR, currency: null, usecase: null, reading: p }, 1000);
  const kept = saidKept(desk, 2000, null);
  assert.deepEqual(kept?.reading, JSON.parse(JSON.stringify(p)), 'the whole reading is kept beside the sentence');
  const never = async (): Promise<Proposal> => assert.fail('the build read the words again');
  const env = { device: browserCurrencyEnv('en-GB', ['en-GB'], 'Africa/Cairo'), today: '2026-10-15', email: null, nav: [], locale: 'en-GB' };
  const built = await accepting(kept!, null, readingKept(kept, never), env);
  assert.equal(built?.usecase, 'shop', 'the build is the reading the person kept');
  assert.equal(built?.proposal.by, 'included');
  /* OTHER WORDS ARE READ AGAIN: a reading stands only for the sentence it read. */
  let read = 0;
  await readingKept(kept, async (s) => (read++, proposeFirst(s, WHERE, null)))('I am somebody else');
  assert.equal(read, 1);
});

test('AN OLD KEPT SENTENCE WITH NO READING STILL READS, and a broken reading is dropped and not the sentence', async () => {
  const desk = storage();
  desk.setItem(SAID_KEY, JSON.stringify({ said: NOOR, currency: 'EGP', usecase: null, at: 1000 }));
  const old = saidKept(desk, 2000, null);
  assert.equal(old?.said, NOOR);
  assert.equal(old !== null && 'reading' in old, false);
  let read = 0;
  await readingKept(old, async (s) => (read++, proposeFirst(s, WHERE, null)))(NOOR);
  assert.equal(read, 1, 'the rules read it, as they always did');
  desk.setItem(SAID_KEY, JSON.stringify({ said: NOOR, currency: null, usecase: null, reading: { name: 5, heard: 'no' }, at: 1000 }));
  const broken = saidKept(desk, 2000, null);
  assert.equal(broken?.said, NOOR);
  assert.equal(broken !== null && 'reading' in broken, false);
  assert.equal(readingOf({ name: null, usecase: null, also: [], modules: [], currency: null, title: null, rows: [], heard: [{ phrase: 'x', became: 'y', at: [3, 1] }], places: [] }), null, 'a span that runs backwards');
});

test('THE READING RIDES IN THE LINK ONLY WHOLE, and the tab the link opens is handed it back', async () => {
  const p = await proposeFirst(NOOR, WHERE, readerFor('press', readDoor(true).door, { ...WHERE, human: widget().human }));
  const packed = saidForLink({ said: NOOR, currency: null, usecase: null, reading: p });
  assert.ok(packed !== null && packed.length <= SAID_LINK_MOST);
  const arrived = arrivalOf(mailed(packed), () => {});
  assert.equal(arrived?.kind, 'verify');
  assert.deepEqual(arrived?.kind === 'verify' ? arrived.said?.reading : null, JSON.parse(JSON.stringify(p)));
  /* A LONG SENTENCE IS CUT, AND A CUT ONE CARRIES NO READING of the words it lost. */
  const long = `${NOOR} ${Array.from({ length: 300 }, (_, i) => `mug${i}`).join(' ')}`;
  const cut = saidFromLink(saidForLink({ said: long, currency: null, usecase: null, reading: p }));
  assert.equal(cut?.cut, true);
  assert.equal(cut !== null && 'reading' in cut, false);
  assert.equal(saidFromLink(JSON.stringify({ said: NOOR, cut: true, reading: p }))?.reading, undefined);
});

test('THE ONE QUESTION BACK IS HELD TO ONE LINE AND FOUR CHOICES, and answered as the rules would where it asks what they do', () => {
  assert.equal(askOf({ ask: null }), null);
  assert.equal(askOf({}), null);
  assert.equal(askOf({ ask: { about: 'age', question: 'How old are you?', choices: [] } }), null, 'not one of the five');
  assert.equal(askOf({ ask: { about: 'kind', question: 'x'.repeat(121), choices: [] } }), null, 'never a cut question');
  assert.equal(askOf({ ask: { about: 'kind', question: 'What kind?', choices: ['a', 'b', 'c', 'd', 'e'] } }), null);
  assert.deepEqual(askOf({ ask: { about: 'name', question: ' What should I call you? ', choices: [] } }), { about: 'name', question: 'What should I call you?', choices: [] });
  assert.equal(answeredAs({ about: 'currency', question: 'Which currency?', choices: [] }, 'currency'), 'currency');
  assert.equal(answeredAs({ about: 'name', question: 'Your name?', choices: [] }, 'currency'), null, 'the rules ask another, so it is told more');
  assert.equal(answeredAs({ about: 'things', question: 'What do you sell?', choices: [] }, null), null);
});
