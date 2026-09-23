/**
 * The morning read says what a night asked on Decide and what it closed, and a question answered in the old tool that is
 * still open here is said as open, with what to do (`loop/research-shadow-week.md` brief 52-A, cases 3 and 4).
 *
 * MEASURED BEFORE THIS FILE, over seven made-up nights (§2 night 3 of that walk). A new question asked in the night was
 * on Decide and not in `--since last`, because a remembered run kept what it created, updated, refused and left out and
 * nothing it asked. And the one question the first night asked, answered in the old tool on night 3, stayed open on
 * Decide all week: the planner leaves a decided question out, the import never asks a question twice, and a token
 * cannot decide, so nothing closes it. What the morning read said of it was the planner's skip line, "Already decided,
 * and carried with its decision", which reads as done while it waits on the one screen he acts on.
 *
 * CASE 3 IS ON A REPORT BUILT BY HAND, because what is under test is what a remembered run holds and how it is read
 * back, and case 4 IS ON THE KERNEL, because "still open here" is the record's answer and a fake Decide would say
 * whatever the test told it to. EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KEY_PREFIX, planLegacyTool, type Plan } from '../src/legacy.ts';
import { applyPlan, importCommand, runOf, said, settledOf, sinceSaid, type Report } from '../src/import.ts';
import type { AgentIo } from '../src/skills.ts';
import { syntheticExport } from './legacy-export.ts';
import { doorOf, record } from './legacy-record.ts';

const UTC = () => 0;
const AT = { at: '2026-09-27T00:30:00.000Z', host: 'app.brain.dog', file: 'hb-export.json' };

/** A night's report as `applyPlan` leaves one, holding only what these cases read. */
function reportOf(over: Partial<Report> = {}): Report {
  const plan: Plan = { taken: '2026-09-27T00:20:00.000Z', rev: 3, rows: [], asks: [], polls: [], skipped: [], changed: [] };
  return { missing: [], tally: {}, asked: 0, alreadyAsked: 0, polls: { filed: 0, before: 0 }, questions: [], changes: [], refused: [], retired: [], clashes: [], examples: 0, outcomes: {}, plan, ...over };
}

test('A NIGHT THAT ASKED A QUESTION says so in the morning, by its the old tool id and its words', () => {
  const run = runOf(reportOf({ asked: 1, questions: [{ label: 'SG10', question: 'Raise the Lanternly price?' }] }), AT);
  const lines = sinceSaid([run], 'last', UTC).lines;
  assert.ok(lines.includes('- Asked on Decide: SG10, Raise the Lanternly price?'), lines.join('\n'));
  assert.ok(!lines.includes('- Nothing moved in the old tool since the run before.'), 'a night that asked something was said as a night where nothing moved');
});

test('A NIGHT THAT CLOSED A ROW says it under the list it was closed in, with the reason the report gave', () => {
  const why = 'Gone from the old tool since an earlier import carried it, so it is closed here:';
  const run = runOf(reportOf({ retired: [{ register: 'tasks', label: 'Renew the accountant retainer', why }] }), AT);
  const lines = sinceSaid([run], 'last', UTC).lines;
  assert.ok(lines.includes(`- Closed: ${why} Tasks, Renew the accountant retainer.`), lines.join('\n'));
});

test('A RUN REMEMBERED BEFORE A NIGHT KEPT EITHER is still read, and says what it said then', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'bd-import-since-decide-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, '.braindog'));
  /* THE SHAPE `runOf` WROTE UNTIL THIS BRIEF: no `asked`, no `retired`, no `waiting`. */
  const old = { at: AT.at, host: AT.host, file: AT.file, taken: null, created: [{ register: 'tasks', label: '#106' }], updated: [], refused: [], skipped: [] };
  writeFileSync(join(home, '.braindog', 'imports.jsonl'), `${JSON.stringify(old)}\n`);
  const out: string[] = [];
  const say: string[] = [];
  const io: AgentIo = { env: {} as never, cwd: home, home, out: (l) => out.push(l), say: (l) => say.push(l), headers: async () => ({}) };
  assert.equal(await importCommand(['legacy', '--since', 'last'], io, undefined, () => new Date(AT.at), UTC), 0, say.join(' | '));
  assert.deepEqual(say, [], 'the old line was passed over');
  assert.ok(out.includes('- Created in Tasks: #106.'), out.join('\n'));
});

test('A QUESTION ANSWERED IN THE OLD TOOL AND STILL OPEN HERE is said as open on Decide, with what to do, on the night and the morning after', async () => {
  const { sql, kernel } = await record(Date.UTC(2026, 8, 24, 0, 30));
  const first = syntheticExport({ takenAt: '2026-09-24T00:20:00.000Z' });
  const one = await applyPlan(planLegacyTool(first, '2026-09-24'), doorOf(kernel), { dryRun: false, settled: settledOf(first) });
  /* SG7 IS THE ONE QUESTION THE FIXTURE ASKS: SG8 is put off until 2099 and SG9 has one option. */
  assert.equal(one.asked, 1, 'the first night did not ask SG7, so this measures nothing');
  /* AND THE NIGHT KEEPS WHAT IT ASKED BY NAME, which is what the morning read is made from: the hand-built report above
     proves the reading back, and this proves `applyPlan` fills it on a real write. */
  assert.deepEqual(one.questions, [{ label: 'SG7', question: 'Which store should Tidepool launch on first?' }]);

  /* NIGHT 3: SG7 IS DECIDED IN THE OLD TOOL AS D5, and nobody has touched its twin on Decide here. */
  const later = syntheticExport({ takenAt: '2026-09-27T00:20:00.000Z' });
  const sg7 = ((later.db as { suggestions: Record<string, unknown>[] }).suggestions).find((s) => s.id === 'SG7')!;
  Object.assign(sg7, { status: 'decided', chosen: 'A', decision: 'D5' });
  const three = await applyPlan(planLegacyTool(later, '2026-09-27'), doorOf(kernel), { dryRun: false, settled: settledOf(later) });

  const lines = said(three, { dryRun: false, file: 'hb-export.json' });
  const at = lines.indexOf('Answered in the old tool and still open on Decide here:');
  assert.ok(at >= 0, lines.join('\n'));
  assert.equal(
    lines[at + 1],
    '- SG7, Which store should Tidepool launch on first?, decided there as D5. Answer it on Decide the way you answered it in the old tool, or dismiss it.',
  );
  /* AND THE MORNING READ SAYS IT BESIDE THE SKIP LINE, which alone read as done. */
  const morning = sinceSaid([runOf(one, { ...AT, at: '2026-09-24T00:30:00.000Z' }), runOf(three, AT)], 'last', UTC).lines;
  assert.ok(
    morning.includes('- Still open on Decide here, answered in the old tool: SG7, Which store should Tidepool launch on first?, decided there as D5. Answer it on Decide the same way, or dismiss it.'),
    morning.join('\n'),
  );
  /* A QUESTION ANSWERED IN THE OLD TOOL THAT WAS NEVER ASKED HERE IS NOT OPEN HERE, and is not said: SG4 and SG5. */
  assert.deepEqual((three.waiting ?? []).map((w) => w.label), ['SG7']);
  sql.close();
});

test('A QUESTION ANSWERED IN THE OLD TOOL THAT HE HAS ALSO ANSWERED HERE is not said as waiting on Decide', async () => {
  const { sql, kernel } = await record(Date.UTC(2026, 8, 24, 0, 30));
  const first = syntheticExport({ takenAt: '2026-09-24T00:20:00.000Z' });
  const one = await applyPlan(planLegacyTool(first, '2026-09-24'), doorOf(kernel), { dryRun: false, settled: settledOf(first) });
  assert.equal(one.asked, 1, 'the first night did not ask SG7, so this measures nothing');

  /* HE PUTS THE TWIN AWAY ON DECIDE HERE, which is one of the two things the waiting line tells him to do. */
  const open = kernel.governance('suggestion' as never, { status: 'open', limit: 50 });
  assert.ok(open.ok, JSON.stringify(open));
  const twin = (open.value as { id: string; body: { from?: unknown } }[]).find((s) => s.body.from === `${KEY_PREFIX}suggestion:SG7`);
  assert.ok(twin, 'the twin of SG7 the first night asked is not open on Decide here, so this measures nothing');
  const put = kernel.decide(twin.id, { resolved_as: 'wont-fix', reason: 'answered in the old tool' }, 'p_1');
  assert.ok(put.ok, JSON.stringify(put));

  const later = syntheticExport({ takenAt: '2026-09-27T00:20:00.000Z' });
  const sg7 = ((later.db as { suggestions: Record<string, unknown>[] }).suggestions).find((s) => s.id === 'SG7')!;
  Object.assign(sg7, { status: 'decided', chosen: 'A', decision: 'D5' });
  const three = await applyPlan(planLegacyTool(later, '2026-09-27'), doorOf(kernel), { dryRun: false, settled: settledOf(later) });
  assert.deepEqual(three.waiting, [], 'a question he has closed on Decide was still said as waiting there');
  sql.close();
});
