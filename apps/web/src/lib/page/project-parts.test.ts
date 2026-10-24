/**
 * A project's shape as blocks of its page (C28, C29): which parts are drawn once the project is read, and how wide each
 * is in its row, as the shape drawn by hand laid them (`project-parts.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moneyShown, partLaid, partsLaid, type PartsHave } from './project-parts.ts';

const ALL: PartsHave = { hero: true, path: true, money: true, work: true, people: true, runsOn: true, today: true, band: false, known: true };

test('THE ROWS AS THE SHAPE LAID THEM: the path at two thirds beside the money, the work beside who is on it, runs on beside today', () => {
  assert.deepEqual(['hero', 'path', 'money', 'what-is-open', 'who-is-on-it', 'runs-on', 'agents-here'].map((p) => partLaid(p, ALL).span), [12, 8, 4, 8, 4, 6, 6]);
});

test('A PART WHOSE PARTNER HAS NOTHING TAKES THE WHOLE ROW, and the band of who is working takes it under what it runs on', () => {
  const alone = { ...ALL, money: false, people: false };
  assert.equal(partLaid('path', alone).span, 12);
  assert.equal(partLaid('what-is-open', alone).span, 12);
  assert.equal(partLaid('money', alone).on, false);
  const band = { ...ALL, today: false, band: true };
  assert.deepEqual([partLaid('runs-on', band).span, partLaid('agents-here', band).span], [12, 12]);
});

test('THE AGENTS ARE DRAWN UNSEEN WITH NOTHING TO SHOW, so they hear a run arrive, and take no room', () => {
  const quiet = { ...ALL, today: false, band: false };
  assert.deepEqual(partLaid('agents-here', quiet), { on: true, span: 12, seen: false });
  assert.equal(partLaid('agents-here', { ...quiet, known: false }).on, false);
});

test('A BLOCK OF THE SHAPE IS DRAWN WHERE A PART OF IT HAS SOMETHING, and none is drawn on a page about no project', () => {
  const blocks = [
    { kind: 'project', parts: ['hero', 'path', 'money'] },
    { kind: 'project', parts: ['what-is-open', 'who-is-on-it'] },
    { kind: 'note', body: 'x' },
    { kind: 'project', parts: ['what-is-open'], drawn: false },
  ];
  const nothing = { ...ALL, hero: false, path: false, money: false, work: false, people: false };
  assert.deepEqual(
    partsLaid(blocks, nothing).map((b) => b.drawn),
    [false, false, undefined, false],
  );
  assert.deepEqual(
    partsLaid(blocks, ALL).map((b) => b.drawn),
    [undefined, undefined, undefined, false],
  );
  assert.deepEqual(
    partsLaid(blocks, null).map((b) => (b as { why?: unknown }).why),
    ['empty', 'empty', undefined, undefined],
  );
});

test('MONEY SAYS SOMETHING with a line of this month, a period earned, bars or a total since', () => {
  const months = (values: number[]) => ({ currency: 'GBP', months: values.map((value, i) => ({ key: `2026-0${i + 1}`, value, partial: false })), total: values.reduce((a, b) => a + b, 0) });
  assert.equal(moneyShown([], null, null, null), false);
  assert.equal(moneyShown([], null, months([0, 0, 0]), null), false);
  assert.equal(moneyShown([{}], null, null, null), true);
  assert.equal(moneyShown([], { currency: 'GBP', before: 0, now: 5 }, null, null), true);
  assert.equal(moneyShown([], null, null, months([0, 0, 40])), true);
});
