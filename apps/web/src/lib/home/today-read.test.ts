import { test } from 'node:test';
import assert from 'node:assert/strict';

import { heardLocal } from '../data/local-tab.ts';
import { forgetToday } from './today-kept.ts';
import { askOffer, askToday, boardReadOf, cardsHeld, todayHeld, wasBehind, type TodayAnswer } from './today-read.ts';
import { onOfferHeard } from '../board/offer-heard.ts';

const BASE = 'https://x.test/api';
const BODY = { page: 'today', title: 'Today', blocks: [] };
const ANSWER: TodayAnswer = {
  page: { read_at: '2026-10-24T09:00:00.000Z', blocks: [] },
  handled: { rows: [], more: 0 },
  shared: null,
  cards: { register: 'things', lates: { '1': 2 }, runs: null, leads: [] },
};

/** A client that answers `today` (or refuses it with `code`) and `previewPage`, and says what it was asked. */
function client(code: string | null = null) {
  const asked: string[] = [];
  return {
    asked,
    call: async <T,>(name: string): Promise<never> => {
      asked.push(name);
      if (name === 'today') return (code === null ? { ok: true, value: ANSWER as unknown as T } : { ok: false, refusal: { code, fix: 'No.' } }) as never;
      return { ok: true, value: ANSWER.page } as never;
    },
  };
}

test("TODAY'S ONE READ DRAWS THE BODY, and holds every tile's part at the version it was asked at", async () => {
  forgetToday();
  heardLocal(null);
  const c = client();
  const out = await askToday(c as never, BASE, BODY);
  assert.deepEqual(out, { ok: true, value: ANSWER.page });
  assert.deepEqual(c.asked, ['today']);
  /* ASKED BEFORE ANY VERSION WAS HEARD, it stands at the first one heard, and not at the next. */
  heardLocal(7);
  assert.deepEqual(await todayHeld(BASE), ANSWER);
  assert.deepEqual((await cardsHeld(BASE, 'things'))?.lates, { '1': 2 });
  assert.equal(await cardsHeld(BASE, 'people'), null, "another list's cards ask for themselves");
  assert.equal(todayHeld('https://other.test/api'), null);
  heardLocal(8);
  assert.equal(todayHeld(BASE), null, 'a move of the record and every tile asks for itself');
});

test('A HOST WITHOUT `today` IS ASKED `previewPage` from then on, and holds no tile', async () => {
  forgetToday();
  heardLocal(3);
  const c = client('ROUTE_UNKNOWN');
  assert.deepEqual(await askToday(c as never, BASE, BODY), { ok: true, value: ANSWER.page });
  assert.equal(todayHeld(BASE), null);
  await askToday(c as never, BASE, BODY);
  assert.deepEqual(c.asked, ['today', 'previewPage', 'previewPage']);
});

test('A RECORD SWITCH OR A SIGN-OUT DROPS WHAT IS HELD', async () => {
  heardLocal(4);
  await askToday(client() as never, 'https://y.test/api', BODY);
  assert.ok(todayHeld('https://y.test/api'));
  forgetToday();
  assert.equal(todayHeld('https://y.test/api'), null);
});

test("THE BOARD'S OFFER IS LEFT OUT OF TODAY'S READ AND ASKED APART, over the board as drawn; an older record carries it", async () => {
  forgetToday();
  heardLocal(5);
  /* AN ADDRESS OF ITS OWN: the test above left BASE a host without `today`, and a host stays that for the tab. */
  const OWN = 'https://offer.test/api';
  const heard: unknown[] = [];
  onOfferHeard((v) => heard.push(v));
  heard.length = 0;
  const sent: { name: string; args: Record<string, unknown> }[] = [];
  const offer = { key: 'w', widget: 'w', title: 'W', why: 'Used.', size: 'small', block: {} };
  const newer = {
    call: async (name: string, args: Record<string, unknown> = {}): Promise<never> => {
      sent.push({ name, args });
      /* The record drew the one block asked, with a row in it. */
      if (name === 'today') return { ok: true, value: { ...ANSWER, page: { ...ANSWER.page, blocks: [{ rows: [{}] }] } } } as never;
      return { ok: true, value: { offers: [offer] } } as never;
    },
  };
  const body = { ...BODY, blocks: [{ kind: 'todo', key: 'late', source: 'register.tasks' }] };
  await askToday(newer as never, OWN, body, false, null, [{ kind: 'kpis', key: 'numbers', source: 'kpis' }]);
  assert.equal(sent[0]!.args.offer, false);
  assert.deepEqual(heard, [], "Today's read says nothing of the offer");
  await askOffer(newer as never, OWN);
  assert.equal(sent[1]!.name, 'widgetSuggest');
  assert.deepEqual(sent[1]!.args.board, [
    { key: 'late', source: 'register.tasks', empty: false },
    { key: 'numbers', source: 'kpis', empty: false },
  ]);
  assert.deepEqual(heard, [offer]);

  /* A RECORD BUILT BEFORE `offer` REFUSES IT: asked again without it, its offer heard in the read, none asked apart. */
  forgetToday();
  heard.length = 0;
  const older: string[] = [];
  const old = {
    call: async (name: string, args: Record<string, unknown> = {}): Promise<never> => {
      older.push(name);
      if (name === 'today' && args.offer !== undefined) return { ok: false, refusal: { code: 'FIELD_UNKNOWN', fix: 'No.', at: 'offer' } } as never;
      return { ok: true, value: { ...ANSWER, widget: offer } } as never;
    },
  };
  await askToday(old as never, 'https://old.test/api', BODY);
  assert.deepEqual(older, ['today', 'today']);
  assert.deepEqual(heard, [offer]);
  await askOffer(old as never, 'https://old.test/api');
  assert.deepEqual(older, ['today', 'today']);
});

test('A WIDGET THAT DREW NOTHING IS EMPTY TO THE OFFER, as the record reads it', () => {
  const body = { blocks: [{ kind: 'note', lead: true }, { kind: 'todo', key: 'late' }, { kind: 'stat', key: 'cash', cells: [{ metric: 'cash' }] }] };
  const page = { blocks: [{}, { rows: [] }, { readings: [{ reading: { value: 12 } }] }] };
  assert.deepEqual(boardReadOf(body, page), [
    { key: 'late', empty: true },
    { key: 'cash', metric: 'cash', empty: false },
  ]);
});

/** SHA-256 of `text`, hex, as the record digests what `today` was asked. */
const sha = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A client that answers `today` and keeps every argument it was asked with. */
function said() {
  const args: Record<string, unknown>[] = [];
  return {
    args,
    call: async (name: string, a: Record<string, unknown>): Promise<never> => {
      args.push({ name, ...a });
      return { ok: true, value: ANSWER } as never;
    },
  };
}

/** What `app.html` leaves when it asks Today beside `boot`: the record's answer to `last`, drawn with `drew`. */
async function early(base: string, shape: string, drew: unknown, asked?: string): Promise<void> {
  const value = { ...ANSWER, page: { ...ANSWER.page, read_at: '2026-10-24T08:59:00.000Z' }, asked: asked ?? (await sha(JSON.stringify([drew, false]))) };
  (globalThis as { __bdToday?: unknown }).__bdToday = { url: `${base}/api/today`, shape, at: Promise.resolve({ ok: true, body: JSON.stringify({ ok: true, value }) }) };
}

test('TODAY ASKED BESIDE BOOT IS DRAWN when it drew the body this read asks on that shape of screen, and asks nothing', async () => {
  forgetToday();
  const c = said();
  await early('https://e.test', 'phone', { body: BODY });
  const out = await askToday(c as never, 'https://e.test', BODY, false, null, [], 'phone');
  assert.equal(out.ok && (out.value as { read_at?: unknown }).read_at, '2026-10-24T08:59:00.000Z');
  assert.deepEqual(c.args, [], 'the read went out again over an answer already here');
  assert.equal((globalThis as { __bdToday?: unknown }).__bdToday, undefined, 'taken once');
  assert.equal(((await todayHeld('https://e.test')) as { asked?: unknown } | null)?.asked, undefined, 'the digest is not part of the answer');
});

test('A GUESS THAT WAS WRONG IS LEFT, and Today is asked as it always was, with its shape so the record remembers it', async () => {
  forgetToday();
  const c = said();
  await early('https://e.test', 'phone', { body: { ...BODY, title: 'Yesterday' } });
  const out = await askToday(c as never, 'https://e.test', BODY, false, null, [], 'phone');
  assert.equal(out.ok && (out.value as { read_at?: unknown }).read_at, ANSWER.page.read_at);
  assert.deepEqual(c.args, [{ name: 'today', body: BODY, offer: false, shape: 'phone' }]);
  /* ANOTHER SHAPE OF SCREEN, A FRESH READ, OR ANOTHER RECORD: never taken. */
  for (const [base, shape, fresh] of [['https://e.test', 'wide', false], ['https://e.test', 'phone', true], ['https://f.test', 'phone', false]] as const) {
    forgetToday();
    const d = said();
    await early('https://e.test', 'phone', { body: BODY });
    await askToday(d as never, base, BODY, fresh, null, [], shape);
    assert.equal(d.args.length, 1, `${base} ${shape} ${fresh}`);
    assert.equal('shape' in d.args[0]!, !fresh, 'a fresh read is no first read of an open');
  }
  (globalThis as { __bdToday?: unknown }).__bdToday = undefined;
});

test('A KEPT TODAY IS GUESSED BY ITS SLUG, and a record built before `shape` is asked without it from then on', async () => {
  forgetToday();
  const c = said();
  await early('https://g.test', 'wide', { page: 'home' });
  await askToday(c as never, 'https://g.test', {}, false, 'home', [], 'wide');
  assert.deepEqual(c.args, []);
  const asked: Record<string, unknown>[] = [];
  const old = {
    call: async (name: string, a: Record<string, unknown>): Promise<never> => {
      asked.push(a);
      return ('shape' in a ? { ok: false, refusal: { code: 'FIELD_UNKNOWN', fix: 'shape is not something this call takes.', at: 'shape' } } : { ok: true, value: ANSWER }) as never;
    },
  };
  assert.equal((await askToday(old as never, 'https://old-shape.test', BODY, false, null, [], 'wide')).ok, true);
  await askToday(old as never, 'https://old-shape.test', BODY, false, null, [], 'wide');
  assert.deepEqual(asked.map((a) => 'shape' in a), [true, false, false]);
});

test('TODAY ASKED BESIDE BOOT BEFORE THE TAB HEARD THE RECORD MOVE is drawn as behind, so the screen asks again at once', async () => {
  forgetToday();
  heardLocal(12);
  const c = said();
  const value = { ...ANSWER, asked: await sha(JSON.stringify([{ body: BODY }, false])), version: 11 };
  (globalThis as { __bdToday?: unknown }).__bdToday = { url: 'https://h.test/api/today', shape: 'phone', at: Promise.resolve({ ok: true, body: JSON.stringify({ ok: true, value }) }) };
  assert.equal((await askToday(c as never, 'https://h.test', BODY, false, null, [], 'phone')).ok, true);
  assert.deepEqual(c.args, []);
  assert.equal(wasBehind('https://h.test'), true);
  heardLocal(null);
});
