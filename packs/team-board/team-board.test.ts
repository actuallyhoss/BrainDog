/**
 * Team task list: tasks owned by people and agents, a status and a priority, a board, and a page of who is doing what
 * now, fed by agent sessions, plus the front sign-up offers it under. Declarations only; its one automation is off.
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
const TEXT = readFileSync(new URL('./team-board.pack.json', import.meta.url), 'utf8');
const FRONT: unknown = JSON.parse(readFileSync(new URL('./team-board.usecase.json', import.meta.url), 'utf8'));
type Decl = { register?: string; page?: string; rule?: string; enabled?: boolean; fields?: { id: string; values?: string[]; to?: string }[]; blocks?: { kind: string; heading?: string; source?: string }[] };
const FILE = JSON.parse(TEXT) as { declarations: Decl[] };

test('THE TEAM LIST READS THROUGH THE ADD-ON DOOR AND INSTALLS IN A SCRATCH RECORD with its example rows', async () => {
  const read = await readCatalogueFile(TEXT);
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'team-board.pack.json did not read.');
  const checked = await checkInScratch(read.value, true, NOW);
  try {
    assert.ok(checked.ok, checked.lines.join('\n'));
  } finally {
    checked.held?.scratch.close();
  }
});

test('AN OWNER IS A MEMBER, and a member is a person or an agent', () => {
  const members = FILE.declarations.find((d) => d.register === 'teammates');
  assert.deepEqual(members?.fields?.find((f) => f.id === 'kind')?.values, ['person', 'agent']);
  const tasks = FILE.declarations.find((d) => d.register === 'team_tasks');
  assert.equal(tasks?.fields?.find((f) => f.id === 'owner')?.to, 'teammates');
  assert.deepEqual(tasks?.fields?.find((f) => f.id === 'state')?.values, ['todo', 'doing', 'review', 'blocked', 'done']);
  assert.deepEqual(tasks?.fields?.find((f) => f.id === 'priority')?.values, ['urgent', 'high', 'normal', 'low']);
});

test('THERE IS A BOARD PAGE, AND A WHO-IS-DOING-WHAT PAGE THAT READS THE RUNS AGENTS ARE WORKING', () => {
  const board = FILE.declarations.find((d) => d.page === 'team-board');
  assert.ok(board?.blocks?.some((b) => b.kind === 'board'));
  const now = FILE.declarations.find((d) => d.page === 'team-now');
  assert.ok(now?.blocks?.some((b) => b.source === 'sessions.working'));
});

test('EVERY AUTOMATION IT CARRIES IS OFF UNTIL SOMEONE TURNS IT ON', () => {
  const rules = FILE.declarations.filter((d) => d.rule);
  assert.ok(rules.length > 0);
  for (const r of rules) assert.equal(r.enabled, false, `${r.rule} must start off`);
});

test('THE FRONT READS AS A USE CASE for a team, and stands on this add-on', () => {
  const read = normaliseUseCase(FRONT);
  if (!read.ok) assert.fail(JSON.stringify(read));
  const u = FRONT as { usecase: string; audience: string; needs: string[] };
  assert.equal(u.usecase, 'team-board');
  assert.equal(u.audience, 'team');
  assert.deepEqual(u.needs, ['team-board']);
});
