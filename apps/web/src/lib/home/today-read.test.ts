import { test } from 'node:test';
import assert from 'node:assert/strict';

import { heardLocal } from '../data/local-tab.ts';
import { forgetToday } from './today-kept.ts';
import { askToday, cardsHeld, todayHeld, type TodayAnswer } from './today-read.ts';

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
