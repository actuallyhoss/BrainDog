/**
 * The made-up record holds together: the cast is there, the figures open what they came from, the money is said the
 * way the prototype says it, and no word in it breaks the words rules or claims BrainDog moves money on its own.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GLYPHS } from '../icons.ts';
import * as maya from './maya.ts';
import {
  ARRIVALS,
  ASKS,
  BRIEF,
  CENTS,
  EVIDENCE,
  FINDS,
  FOUNDER,
  HANDLED,
  MAKES,
  NEEDS,
  PEOPLE,
  PROJECT_ORDER,
  PROJECTS,
  TODAY,
  usd,
} from './maya.ts';

/** Every string the module exports, with the path it sits at, so a failure names its place. */
function strings(value: unknown, at: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([at, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${at}[${i}]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, `${at}.${k}`, out);
  return out;
}

const ALL = strings(Object.fromEntries(Object.entries(maya).filter(([, v]) => typeof v !== 'function')), 'maya');

test('the cast: Maya Okafor, her four projects and her people', () => {
  assert.equal(FOUNDER.name, 'Maya Okafor');
  assert.equal(FOUNDER.short, 'Maya');
  assert.deepEqual(
    PROJECT_ORDER.map((id) => PROJECTS[id].name),
    ['Tidepool', 'Ferment & Co', 'Northbound', 'Pocketlab'],
  );
  assert.deepEqual(Object.keys(PROJECTS).sort(), [...PROJECT_ORDER].sort());
  assert.deepEqual(
    Object.values(PEOPLE).map((p) => p.name),
    ['Dana Reyes', 'Leo Brandt', 'Sam Patel'],
  );
});

test('every icon the record names is one the site draws', () => {
  const icons = [
    ...Object.values(PROJECTS).map((p) => p.icon),
    ...ARRIVALS.map((a) => a.icon),
    ...FINDS.flatMap((f) => f.hits.map((h) => h.icon)),
  ];
  for (const icon of icons) assert.ok(Object.hasOwn(GLYPHS, icon), `${icon} is not in icons.ts`);
});

test('every Needs you question has its own id', () => {
  const ids = NEEDS.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, `ids repeat: ${ids.join(', ')}`);
});

test("every figure in the brief opens evidence that exists, and the late one says it's late", () => {
  const figures = BRIEF.parts.filter((p) => typeof p !== 'string');
  assert.equal(figures.length, 4);
  for (const f of figures) {
    assert.ok(f.key !== undefined && Object.hasOwn(EVIDENCE, f.key), `${f.text} opens nothing`);
  }
  for (const f of figures.filter((x) => x.late)) assert.match(f.text, /late/);
});

test('usd() says the figures the way the prototype does', () => {
  assert.equal(usd(842_000), '$8,420');
  assert.equal(usd(6_420), '$64.20');
  assert.equal(usd(320_000, { pence: true }), '$3,200.00');
  assert.equal(usd(52_000, { pence: true }), '$520.00');
  assert.equal(usd(4_821_000), '$48,210');
  assert.equal(usd(0), '$0');
  assert.throws(() => usd(12.5));
});

test('the drawn figures are the cents behind them', () => {
  assert.equal(TODAY.cash.amount, '$48,210');
  assert.equal(TODAY.cards.tidepool.big, '$8,420');
  assert.equal(EVIDENCE.inv.rows.at(-1)?.[1], '$3,200.00');
  assert.deepEqual(
    ARRIVALS.map((a) => a.amount),
    ['$8,420', '$64.20', null, '$1,800', '$2,315', '$520.00'],
  );
  const owed = ASKS[0]?.bars ?? [];
  assert.equal(
    owed.reduce((sum, b) => sum + b.cents, 0),
    CENTS.billsMonth,
    'the bills add up to the figure the answer leads with',
  );
});

test('the words rules hold: no em dash and none of the never-words', () => {
  const never = /\b(row|rows|mcp|slug|register|entity)\b/i;
  for (const [at, text] of ALL) {
    assert.ok(!text.includes('\u2014'), `${at} holds an em dash: ${text}`);
    assert.doesNotMatch(text, never, `${at} uses a word the site never says`);
  }
});

test('nothing says BrainDog pays, sends or charges on its own', () => {
  const moves = [
    /\b(braindog|it)\s+(pays|paid|sends|sent|charges|charged)\b/i,
    /\b(reminder|invoice|payment|chase)\s+(was\s+)?sent\b/i,
    /\bis paid\b/i,
    /^pay on\b/i,
  ];
  for (const [at, text] of ALL) for (const move of moves) assert.doesNotMatch(text, move, `${at}: ${text}`);
});

test('the truth fixes are in', () => {
  const pay = NEEDS.find((n) => n.id === 'pay');
  assert.equal(pay?.ask, 'Dana Reyes sent a $1,800 invoice, due Friday. Pay it with payroll?');
  assert.equal(pay?.yes, 'Plan it for Friday');
  assert.equal(pay?.done, "Dana's invoice is planned for Friday, with payroll");
  assert.deepEqual(
    TODAY.needs.map((n) => [n.what, n.act]),
    [
      ['Chase Northbound for $3,200', 'Chase it'],
      ['Pay Dana Reyes $1,800', 'Plan it'],
    ],
  );
  assert.ok(EVIDENCE.inv.rows.some(([label]) => label === 'Reminder drafted for your yes'));
  assert.ok(HANDLED.every((h) => !/repositor/i.test(h.text)), 'no chore that names a project from a repository');
  assert.ok(MAKES.length === 3 && ASKS.length === 3 && FINDS.length === 3, 'three of each to try');
});
