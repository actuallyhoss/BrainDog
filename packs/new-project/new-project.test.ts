/**
 * Starting a project: three stages, the next steps at each as a checklist an agent can tick, decisions with reasons and a
 * weekly page on where it stands, and the front sign-up offers it under. Declarations only; its one automation is off.
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
const TEXT = readFileSync(new URL('./new-project.pack.json', import.meta.url), 'utf8');
const FRONT: unknown = JSON.parse(readFileSync(new URL('./new-project.usecase.json', import.meta.url), 'utf8'));
type Decl = { register?: string; page?: string; rule?: string; enabled?: boolean; values?: string[]; steps?: unknown; fields?: { id: string; values?: string[] }[]; blocks?: { kind: string; heading?: string }[] };
const FILE = JSON.parse(TEXT) as { declarations: Decl[] };

test('THE GUIDE READS THROUGH THE ADD-ON DOOR AND INSTALLS IN A SCRATCH RECORD with its example rows', async () => {
  const read = await readCatalogueFile(TEXT);
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'new-project.pack.json did not read.');
  const checked = await checkInScratch(read.value, true, NOW);
  try {
    assert.ok(checked.ok, checked.lines.join('\n'));
  } finally {
    checked.held?.scratch.close();
  }
});

test('THE STAGES ARE IDEA, FIRST USERS AND FIRST MONEY, and each has its own list of steps on the page', () => {
  const steps = FILE.declarations.find((d) => d.register === 'venture_steps');
  assert.deepEqual(steps?.fields?.find((f) => f.id === 'stage')?.values, ['idea', 'first_users', 'first_money']);
  const page = FILE.declarations.find((d) => d.page === 'guide');
  assert.deepEqual(page?.blocks?.filter((b) => b.kind === 'steps').map((b) => b.heading), ['Idea: next steps', 'First users: next steps', 'First money: next steps']);
});

test('A STEP IS A CHECKLIST ROW an agent can tick, and its page keeps the name of who ticked it', () => {
  const steps = FILE.declarations.find((d) => d.register === 'venture_steps');
  assert.deepEqual(steps?.steps, { of: 'venture', done: 'done', order: 'rank' });
  assert.ok(steps?.fields?.some((f) => f.id === 'agent'));
});

test('DECISIONS KEEP THEIR REASON, and the weekly page is a page of its own', () => {
  const choices = FILE.declarations.find((d) => d.register === 'venture_choices');
  assert.ok(choices?.fields?.some((f) => f.id === 'why'));
  assert.ok(FILE.declarations.some((d) => d.page === 'guide-week'));
});

test('EVERY AUTOMATION IT CARRIES IS OFF UNTIL SOMEONE TURNS IT ON', () => {
  const rules = FILE.declarations.filter((d) => d.rule);
  assert.ok(rules.length > 0);
  for (const r of rules) assert.equal(r.enabled, false, `${r.rule} must start off`);
});

test('THE FRONT READS AS A USE CASE for a starter, and stands on this add-on', () => {
  const read = normaliseUseCase(FRONT);
  if (!read.ok) assert.fail(`${read.refusal.code}: ${read.refusal.fix}`);
  const u = FRONT as { usecase: string; audience: string; needs: string[] };
  assert.equal(u.usecase, 'new-project');
  assert.equal(u.audience, 'starter');
  assert.deepEqual(u.needs, ['new-project']);
});
