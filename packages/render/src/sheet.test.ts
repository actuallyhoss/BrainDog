/**
 * The look sheet's specimens (`sheet.ts`): each is fixed, says "specimen" where a person reads it, parses to the one
 * block it names, and holds the count of points and the age it was asked for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Block } from './parse.ts';
import { toHTML } from './html.ts';
import { linesPlan } from './lines.ts';
import { seriesPlan } from './series.ts';
import {
  FAILED_RUN,
  SHEET_DAY,
  SHEET_FORMS,
  SHEET_NOW,
  SHEET_POINTS,
  SHEET_STALE_STEPS,
  SHEET_STATES,
  SPECIMEN,
  chartSpecimen,
  chartSpecimens,
  partSpecimens,
  planSpecimen,
  planSpecimens,
  sheetKey,
  specimenFor,
  specimenSegments,
  specimenStale,
  type Specimen,
} from './sheet.ts';

/** The one block a specimen's source parses to; anything else fails here, by name. */
const blockOf = (s: Specimen): Block => {
  const segments = specimenSegments(s);
  assert.equal(segments.length, 1, `${s.key} is not one fence`);
  const seg = segments[0]!;
  assert.equal(seg.type, 'block', `${s.key} degraded: ${seg.type === 'degraded' ? seg.fix : ''}`);
  return seg as Block;
};

const all = (): Specimen[] => [...chartSpecimens(), ...planSpecimens(), ...partSpecimens(), FAILED_RUN.red, FAILED_RUN.plain];

test('every specimen parses to the block it names and says "specimen" in its label and in what is drawn', () => {
  const seen = new Set<string>();
  for (const s of all()) {
    assert.ok(!seen.has(s.key), `${s.key} is given twice`);
    seen.add(s.key);
    const b = blockOf(s);
    assert.equal(b.kind, s.kind, s.key);
    assert.equal(b.form, s.form, s.key);
    assert.match(s.label, /^Specimen\b/u, `${s.key} is not labelled a specimen`);
    assert.match(b.heading ?? '', new RegExp(`\\b${SPECIMEN}\\b`, 'u'), `${s.key} draws no "specimen" in its heading`);
    assert.doesNotMatch(s.label + s.source, /—/u, `${s.key} holds an em dash`);
  }
});

test('the specimens are fixed: asked twice they are the same text, and nothing in them reads the clock', () => {
  assert.deepEqual(all(), all());
  assert.equal(new Date(SHEET_NOW).toISOString().slice(0, 10), SHEET_DAY);
});

test('each chart form is given at 0, 1, 2, 3 and 30 points, and stale wherever it has a day and a point', () => {
  assert.deepEqual([...SHEET_POINTS], [0, 1, 2, 3, 30]);
  for (const form of SHEET_FORMS) {
    for (const n of SHEET_POINTS) {
      const fresh = chartSpecimen(form, n, 'fresh');
      assert.equal(fresh.points, n);
      assert.equal(fresh.age, 'fresh');
      assert.equal(sheetKey(blockOf(fresh).kind, blockOf(fresh).form), form);
    }
  }
  const stale = chartSpecimens().filter((s) => s.age === 'stale');
  /* A sparkline's points carry no day, so it has no age to show; no points have no newest one to be old. */
  assert.deepEqual([...new Set(stale.map((s) => sheetKey(s.kind, s.form)))].sort(), SHEET_FORMS.filter((f) => f !== 'sparkline').sort());
  assert.ok(stale.every((s) => (s.points ?? 0) > 0));
  assert.equal(chartSpecimens().length, SHEET_FORMS.length * SHEET_POINTS.length + (SHEET_FORMS.length - 1) * (SHEET_POINTS.length - 1));
  assert.throws(() => chartSpecimen('sparkline', 3, 'stale'), /no day/u);
  assert.throws(() => chartSpecimen('lines', 0, 'stale'), /no point/u);
});

test('lines and series hold exactly the points asked for, as their own plans count them', () => {
  for (const n of SHEET_POINTS) {
    const lines = linesPlan(blockOf(chartSpecimen('lines', n)).rows.map((r) => r.cells));
    assert.equal(lines.points.length, n, `lines at ${n}`);
    for (const form of ['series', 'series net'] as const) {
      const b = blockOf(chartSpecimen(form, n));
      assert.equal(seriesPlan(b.rows.map((r) => r.cells), b.form === 'net').buckets.length, n, `${form} at ${n}`);
    }
    assert.equal(blockOf(chartSpecimen('heat', n)).rows.length, n);
    assert.equal(blockOf(chartSpecimen('forecast', n)).rows.filter((r) => r.cells[0] === 'past').length, n);
    const spark = blockOf(chartSpecimen('sparkline', n)).rows[0]!.cells[1] ?? '';
    assert.equal(spark.split(/\s+/u).filter(Boolean).length, n);
  }
});

test('a fresh specimen ends on the sheet\'s day and a stale one more than twice its step before it', () => {
  for (const form of SHEET_FORMS) {
    if (form === 'sparkline') continue;
    const fresh = chartSpecimen(form, 30, 'fresh');
    const stale = chartSpecimen(form, 30, 'stale');
    assert.equal(specimenStale(fresh), null, `${form} fresh`);
    const since = specimenStale(stale);
    assert.ok(since !== null && since.steps === SHEET_STALE_STEPS && since.steps > 2, `${form} stale`);
    assert.notEqual(fresh.source, stale.source);
    assert.match(stale.label, /stale/u);
  }
});

test('the plan is given working, late and done, each alone and the three together, and its key names them', () => {
  assert.deepEqual([...SHEET_STATES], ['working', 'late', 'done']);
  const html = toHTML(specimenSegments(planSpecimen()), { now: SHEET_NOW });
  for (const word of ['Under way', 'Late', 'Done']) assert.ok(html.includes(word), `the plan's key does not say ${word}`);
  for (const state of SHEET_STATES) {
    const b = blockOf(planSpecimen([state]));
    assert.equal(b.kind, 'roadmap');
    assert.deepEqual([...new Set(b.rows.map((r) => r.tone))], [state === 'working' ? undefined : state === 'late' ? 'bad' : 'good']);
  }
  assert.equal(planSpecimens().length, SHEET_STATES.length + 1);
});

test('every specimen draws, on the sheet\'s own day, without a degraded line or an id', () => {
  for (const s of all()) {
    const html = toHTML(specimenSegments(s), { now: SHEET_NOW });
    assert.doesNotMatch(html, /needs-client|class="degraded/u, s.key);
    /* `&#39;` is an apostrophe as the drawer escapes it, not a number after a hash. */
    assert.doesNotMatch(html, /\b[0-9A-HJKMNP-TV-Z]{26}\b|(?<!&)#\d+/u, `${s.key} prints an id`);
  }
});

test('a form the record holds none of is answered with its specimen, by kind and form', () => {
  assert.equal(specimenFor('lines')?.key, chartSpecimen('lines', 30).key);
  assert.equal(specimenFor('series', 'net')?.kind, 'series');
  assert.equal(specimenFor('roadmap')?.key, planSpecimen().key);
  assert.equal(specimenFor('ring')?.kind, 'ring');
  assert.equal(specimenFor('table'), undefined);
});

test('a failed run is given twice: in red with its mark, and plain with the word alone', () => {
  const red = blockOf(FAILED_RUN.red);
  const plain = blockOf(FAILED_RUN.plain);
  assert.ok(red.rows.some((r) => r.tone === 'bad'));
  assert.ok(plain.rows.every((r) => r.tone === undefined));
  for (const b of [red, plain]) assert.ok(b.rows.some((r) => /Failed/u.test(r.cells.join(' '))), 'the word says it, with or without the colour');
});
