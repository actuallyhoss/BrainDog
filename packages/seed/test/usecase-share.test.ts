/**
 * The built-in use cases as shared files (`share.ts`): each reads through the door a stranger's file does, and what a
 * browse card shows is read from its declarations.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readShared } from '@braindog/declare';

import { USE_CASES, useCase } from '../src/usecases/index.ts';
import { builtInFile, installsOf, previewOf } from '../src/usecases/share.ts';

test('EVERY BUILT-IN USE CASE, AS A FILE, READS THROUGH readShared UNCHANGED', async () => {
  for (const u of USE_CASES) {
    const file = builtInFile(u.usecase, '2026-09-17');
    assert.ok(file, u.usecase);
    const read = await readShared(JSON.stringify(file));
    assert.ok(read.ok, `${u.usecase}: ${read.ok ? '' : JSON.stringify((read as { refusal?: unknown }).refusal)}`);
    assert.equal(read.value.usecase.version, u.version);
  }
  assert.equal(builtInFile('nobody'), null);
});

test('A CARD SHOWS THE RAIL, THE LISTS AND HOME FROM THE DECLARATIONS, AND THE VOICE A HEADING READS', () => {
  const student = previewOf(useCase('student')!);
  assert.ok(student.rail.some((r) => r.section === 'Studies'));
  assert.ok(student.lists.includes('Courses'));
  assert.equal(student.spine.home, 'Today');
  const team = previewOf(useCase('team')!);
  assert.ok(team.home.some((h) => 'voice' in h && h.voice === 'right_now'));
  assert.ok(team.lists.includes('Tickets') || team.lists.length > 0);
  const business = previewOf(useCase('business')!);
  /* SMALL BUSINESS HAS ITS OWN HOME SINCE 1.2.0 AND STILL NO RAIL, LIST OR VOICE: the card shows the Home it opens on. */
  assert.deepEqual(business, {
    rail: [],
    lists: [],
    home: [{ text: 'What you have' }, { text: 'Due this week' }, { text: 'Needs your call' }, { text: 'Working now' }, { text: 'What changed' }],
    spine: {},
  });
});

test('SMALL BUSINESS INSTALLS NO MODULE IT DOES NOT NAME FROM BROWSE, AND A USE CASE THAT NAMES ITS OWN KEEPS THEM', async () => {
  /* NO HOUSE SETUP SINCE MOD-17 (`loop/finish/modules.md`): a use case that names none is handed none. */
  const file = builtInFile('business', '2026-09-17') as { modules: string[] };
  assert.deepEqual(file.modules, []);
  const read = await readShared(JSON.stringify(file));
  assert.ok(read.ok);
  assert.deepEqual((builtInFile('student', '2026-09-17') as { modules: string[] }).modules, useCase('student')!.modules);
});

test('A DETAIL PAGE SAYS WHAT A USE CASE INSTALLS, FROM THE FILE', () => {
  const student = installsOf(useCase('student')!);
  assert.ok(student.lists.includes('Courses'));
  assert.ok(student.pages.length > 0);
  /* A BUILT-IN IS HANDED OUT WITH NO EXAMPLE ROW (C11), so its detail page promises none. */
  assert.equal(student.examples, 0);
  assert.deepEqual(student.skills.map((s) => s.name), ['study-planner']);
  assert.deepEqual(installsOf(useCase('business')!), { modules: [], lists: [], pages: [], examples: 0, skills: [] });
});
