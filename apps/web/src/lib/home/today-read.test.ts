import { test } from 'node:test';
import assert from 'node:assert/strict';

import { heardLocal } from '../data/local-tab.ts';
import { forgetToday } from './today-kept.ts';
import { askOffer, askToday, boardReadOf, cardsHeld, todayHeld, type TodayAnswer } from './today-read.ts';
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
  const heard: unknown[] = [];
  onOfferHeard((v) => heard.push(v));
  heard.length = 0;
  const sent: { name: string; args: Record<string, unknown> }[] = [];
  const offer = { key: 'w', widget: 'w', title: 'W', why: 'Used.', size: 'small', block: {} };
  const newer = {
    call: async (name: string, args: Record<string, unknown> = {}): Promise<never> => {
      sent.push({ name, args });
      if (name === 'today') return { ok: true, value: ANSWER } as never;
      return { ok: true, value: { offers: [offer] } } as never;
    },
  };
  const body = { ...BODY, blocks: [{ kind: 'todo', key: 'late', source: 'register.tasks' }] };
  await askToday(newer as never, BASE, body, false, null, [{ kind: 'kpis', key: 'numbers', source: 'kpis' }]);
  assert.equal(sent[0]!.args.offer, false);
  assert.deepEqual(heard, [], "Today's read says nothing of the offer");
  await askOffer(newer as never, BASE);
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
