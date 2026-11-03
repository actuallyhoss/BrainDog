/**
 * Studies: courses, assignments with due days, marks as numbers with a trend for each course, a reading list and study
 * sessions, and the front sign-up offers it under. Declarations only: no script, and its one automation is switched off.
 *
 * Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkInScratch } from '../../apps/cli/src/scratch.ts';
import { readCatalogueFile } from '../../packages/declare/src/catalogue.ts';
import { normaliseUseCase } from '../../packages/declare/src/usecase.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const TEXT = readFileSync(new URL('./studies.pack.json', import.meta.url), 'utf8');
const FRONT: unknown = JSON.parse(readFileSync(new URL('./studies.usecase.json', import.meta.url), 'utf8'));
const FILE = JSON.parse(TEXT) as { declarations: { register?: string; page?: string; rule?: string; enabled?: boolean; metric?: string; blocks?: { kind: string; heading?: string }[] }[] };

test('STUDIES READS THROUGH THE ADD-ON DOOR AND INSTALLS IN A SCRATCH RECORD with its example rows', async () => {
  const read = await readCatalogueFile(TEXT);
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'studies.pack.json did not read.');
  const checked = await checkInScratch(read.value, true, NOW);
  try {
    assert.ok(checked.ok, checked.lines.join('\n'));
  } finally {
    checked.held?.scratch.close();
  }
});

test('IT HOLDS FOUR LISTS AND ONE PAGE, AND THE PAGE LEADS WITH WHAT IS DUE THIS WEEK', () => {
  assert.deepEqual(FILE.declarations.filter((d) => d.register && !d.rule).map((d) => d.register), ['courses', 'assignments', 'course_reads', 'study_sessions']);
  const page = FILE.declarations.find((d) => d.page === 'studies');
  /* WITH NO LINE OVER IT SINCE 1.0.4 (3 Nov, "i dont like those briefs at all, remove them"): "2 due this week, 1 late."
     said what Due this week and Late show, so the page opens on the first of them. */
  assert.equal(page?.blocks?.[0]?.heading, 'Due this week');
  assert.equal(page?.blocks?.some((b) => (b as { lead?: boolean }).lead === true), false, 'the page still opens on a line');
});

test('A COURSE DRAWS THE TREND OF ITS MARKS, from a figure that averages the mark by month', () => {
  const trend = FILE.declarations.find((d) => d.metric === 'course-marks') as Record<string, unknown> | undefined;
  assert.deepEqual(trend?.value, { avg: 'mark' });
  assert.equal(trend?.group_by, 'marked_on');
  assert.equal(trend?.bucket, 'month');
});

test('EVERY AUTOMATION IT CARRIES IS OFF UNTIL SOMEONE TURNS IT ON', () => {
  const rules = FILE.declarations.filter((d) => d.rule);
  assert.ok(rules.length > 0);
  for (const r of rules) assert.equal(r.enabled, false, `${r.rule} must start off`);
});

test('THE FRONT READS AS A USE CASE, hears studying words, and stands on this add-on', () => {
  const read = normaliseUseCase(FRONT);
  if (!read.ok) assert.fail(JSON.stringify(read));
  const u = FRONT as { usecase: string; signals: string[]; needs: string[] };
  assert.equal(u.usecase, 'studies');
  assert.ok(u.signals.includes('assignments') && u.signals.includes('grades'));
  assert.deepEqual(u.needs, ['studies']);
});
