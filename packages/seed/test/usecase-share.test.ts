/**
 * The built-in use cases as shared files (`share.ts`): each reads through the door a stranger's file does, and what a
 * browse card shows is read from its declarations.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readShared } from '@braindog/declare';

import { USE_CASES, useCase } from '../src/usecases/index.ts';
import { builtInFile, previewOf } from '../src/usecases/share.ts';

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
  assert.deepEqual(business, { rail: [], lists: [], home: [], spine: {} });
});
