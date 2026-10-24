/**
 * What BrainDog draws unasked: one "I drew X. Keep it?" a day at most, none while one waits, never a key asked before,
 * the strongest first; and a project's plan shape read from what it holds, so two projects draw two plans.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DREW_A_DAY, drewKey, drewOffer, planRows, planShapeOf, type Unpictured } from '../src/design-agent.ts';

const NOW = Date.UTC(2026, 9, 24, 9);
const TODAY = '2026-10-24';
const dated: Unpictured = { kind: 'dated', page: 'money', pageTitle: 'Money', list: 'bills', listName: 'Bills', rows: 12 };
const plan: Unpictured = { kind: 'plan', list: 'things', seq: 5, name: 'Marsh', shape: 'timeline', was: 'roadmap', rows: 6 };

test('ONE DRAWING IS OFFERED, THE STRONGEST, SAID AS "I DREW X. KEEP IT?"', () => {
  const got = drewOffer({ nowMs: NOW, unpictured: [dated, plan], filedOn: [], waiting: 0, asked: new Set() });
  assert.ok(got);
  assert.equal(got.key, drewKey(plan));
  assert.equal(got.title, "I drew Marsh's plan as a timeline. Keep it?");
  const list = drewOffer({ nowMs: NOW, unpictured: [dated], filedOn: [], waiting: 0, asked: new Set() });
  assert.equal(list?.title, 'I drew Bills on Money as a calendar. Keep it?');
  assert.match(list?.why ?? '', /^12 entries in Bills have a day/u);
});

test('AT MOST ONE A DAY, NONE WHILE ONE WAITS, AND A KEY ASKED BEFORE IS NEVER OFFERED AGAIN', () => {
  assert.equal(DREW_A_DAY, 1);
  assert.equal(drewOffer({ nowMs: NOW, unpictured: [dated, plan], filedOn: [TODAY], waiting: 0, asked: new Set() }), null);
  assert.equal(drewOffer({ nowMs: NOW, unpictured: [dated, plan], filedOn: [], waiting: 1, asked: new Set() }), null);
  /* YESTERDAY'S DOES NOT COUNT TODAY. */
  assert.ok(drewOffer({ nowMs: NOW, unpictured: [dated], filedOn: ['2026-10-23'], waiting: 0, asked: new Set() }));
  /* THROWN AWAY IS TERMINAL: the next one is offered, never the same one. */
  const next = drewOffer({ nowMs: NOW, unpictured: [dated, plan], filedOn: [], waiting: 0, asked: new Set([drewKey(plan)]) });
  assert.equal(next?.key, drewKey(dated));
  assert.equal(drewOffer({ nowMs: NOW, unpictured: [dated, plan], filedOn: [], waiting: 0, asked: new Set([drewKey(plan), drewKey(dated)]) }), null);
});

test('A PLAN IS SHAPED BY WHAT ITS PROJECT HOLDS: stages, windows, moments or open work', () => {
  assert.equal(planShapeOf({ stages: 4, spans: 9, moments: 0, undated: 0 }), 'path');
  assert.equal(planShapeOf({ stages: 1, spans: 5, moments: 1, undated: 0 }), 'roadmap');
  assert.equal(planShapeOf({ stages: 0, spans: 1, moments: 6, undated: 3 }), 'timeline');
  assert.equal(planShapeOf({ stages: 0, spans: 0, moments: 1, undated: 8 }), 'board');
  assert.equal(planShapeOf({ stages: 1, spans: 1, moments: 0, undated: 2 }), null);
  assert.equal(planRows({ stages: 4, spans: 9, moments: 2, undated: 1 }, 'roadmap'), 11);
});
