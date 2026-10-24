/**
 * What BrainDog draws unasked: one "I drew X. Keep it?" a day at most, none while one waits, never a key asked before,
 * the strongest first; and a project's plan shape read from what it holds, so two projects draw two plans.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DREW_A_DAY, drewKey, drewOffer, planOffered, planRows, planShapeOf, type Unpictured } from '../src/design-agent.ts';

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

test('EACH PROJECT IS OFFERED THE PLAN ITS OWN FACTS READ BEST IN, and a kept one holds still until it draws nothing', () => {
  const keeps = ['path', 'roadmap'] as const;
  /* MARSH, ITS ART AND ISLAND AS STAGES BESIDE A FEW DAYS: its road. ENCORE, ONE STAGE AND ITS RELEASES ON DAYS: its roadmap. */
  const marsh = { stages: 3, spans: 0, moments: 4, undated: 0 };
  const encore = { stages: 1, spans: 2, moments: 6, undated: 1 };
  assert.deepEqual(planOffered(marsh, null, keeps), { shape: 'path', was: null });
  /* A TIMELINE THE LIST CANNOT KEEP IS ITS ROADMAP, which draws a release with no effort as a line on its day. */
  assert.deepEqual(planOffered(encore, null, keeps), { shape: 'roadmap', was: null });
  assert.deepEqual(planOffered(encore, null, ['path', 'roadmap', 'timeline']), { shape: 'timeline', was: null });
  /* DRAWN ONE WAY ALREADY, NOTHING: the page is that shape. */
  assert.equal(planOffered({ stages: 0, spans: 3, moments: 0, undated: 0 }, null, keeps), null);
  assert.equal(planOffered({ stages: 4, spans: 0, moments: 0, undated: 9 }, null, keeps), null);
  /* KEPT, IT HOLDS STILL WHILE IT DRAWS. */
  assert.equal(planOffered(marsh, 'roadmap', keeps), null);
  assert.equal(planOffered(encore, 'path', keeps), null);
  /* KEPT AS ITS ROAD WITH NO STAGES LEFT, IT DRAWS NOTHING, so the shape it holds now is offered, saying what was kept. */
  assert.deepEqual(planOffered({ stages: 0, spans: 5, moments: 0, undated: 0 }, 'path', keeps), { shape: 'roadmap', was: 'path' });
  assert.deepEqual(planOffered({ stages: 3, spans: 0, moments: 0, undated: 0 }, 'roadmap', keeps), { shape: 'path', was: 'roadmap' });
  /* AND NOTHING WHERE IT HOLDS NOTHING THE PAGE COULD DRAW. */
  assert.equal(planOffered({ stages: 0, spans: 0, moments: 0, undated: 7 }, 'path', keeps), null);
  /* A REDESIGN IS ASKED UNDER A KEY OF ITS OWN, and says what was kept. */
  const redrawn: Unpictured = { kind: 'plan', list: 'things', seq: 5, name: 'Marsh', shape: 'roadmap', was: 'path', rows: 5 };
  assert.equal(drewKey(redrawn), 'drew:plan:things#5:from-path:roadmap');
  assert.equal(drewKey({ ...redrawn, was: null }), 'drew:plan:things#5:roadmap');
  const said = drewOffer({ nowMs: NOW, unpictured: [redrawn], filedOn: [], waiting: 0, asked: new Set() });
  assert.match(said?.why ?? '', /^Marsh's plan was kept as its stages, and it has none now\. 5 things on Marsh have a day/u);
});
