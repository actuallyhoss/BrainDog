/**
 * `doing_said`: what a run said it is doing, in its own words, or nothing.
 *
 * MEASURED ON THE OWNER'S RECORD: the Agents page drew a card a run, most of them titled "Claude in BrainDog", which is
 * the name the record gives a run before its agent says anything, and one that printed the build's own next step with
 * file paths and a workflow id in full. The record already knows when a run's name is its own (`recordNamed` in
 * `session.ts`), so `sessions.working` and `sessions.live` answer it as a column a card can read: empty when nobody
 * named the run, and empty when the words hold something no card may print.
 *
 * WORKED OUT WHEN READ AND NEVER STORED, as quiet is: the list of runs has no such field, and `doing` is left as it is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import type { BlockResult, PageBlock, SourceKit } from '../src/pages.ts';
import { recordNamed } from '../src/session.ts';
import { SOURCE_MODULES } from '../src/sources/index.ts';
import { doingSaid, printable, type Named } from '../src/sources/sessions-working.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const MIN = 60_000;
const OWNER = { actor: 'p_1' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  },
};

/**
 * THE KIT AS `pages.ts` IS TO HAND IT: a source module imports no kernel file at run time (`sources/index.ts`), so
 * `recordNamed` reaches these two on the kit. Each module is wrapped here with the kit carrying it, or carrying none,
 * so the whole read is tested through `k.block` whether or not the kit of this build has the line yet.
 */
const READS = { 'sessions.working': SOURCE_MODULES['sessions.working']!, 'sessions.live': SOURCE_MODULES['sessions.live']! };
function kitCarries(named: Named | undefined): void {
  for (const [name, module] of Object.entries(READS))
    SOURCE_MODULES[name] = { ...module, read: (deps, block, base, also, kit) => module.read(deps, block, base, also, { ...kit, recordNamed: named } as SourceKit) };
}
kitCarries(recordNamed);

const PATHS = '/Users/x/work/batch.workflow.js wf_01ABC';
const SAID = 'Fixing the invoice totals';

/** A record with two projects and the runs a card is drawn from, each heard from within the last few minutes. */
async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PROJECTS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const name of ['Kiln', 'Portage']) assert.ok(k.create('things', { name }, OWNER).ok);
  const run = (doing: string | null, minutesAgo: number, project?: string) => {
    const made = k.create('session', { ...(doing === null ? {} : { doing }), agent: 'claude', state: 'active' }, {
      actor: OWNER.actor,
      stamp: { last_seen: new Date(NOW - minutesAgo * MIN).toISOString(), ...(project === undefined ? {} : { project }) },
    });
    assert.ok(made.ok, JSON.stringify(made));
  };
  run('Claude Code in Kiln', 1, 'things#1');
  run(SAID, 2, 'things#1');
  run(null, 3, 'things#1');
  run(PATHS, 4, 'things#2');
  /* A NAME THE RECORD GAVE IN A PROJECT THE RUN HAS SINCE LEFT is still the record's, and so is a run placed nowhere. */
  run('Claude in Portage', 5, 'things#1');
  run('Claude run', 6);
  return { k, sql };
}

const cards = (source: string, ...fields: string[]): PageBlock =>
  ({ kind: 'cards', source, columns: [{ field: 'doing', as: 'title' }, ...fields.map((field) => ({ field }))] }) as never;

for (const source of ['sessions.working', 'sessions.live']) {
  test(`${source} ANSWERS doing_said, a run's own words or nothing, beside a doing left as it was`, async () => {
    const { k, sql } = await record();
    const before = k.block(cards(source));
    assert.deepEqual(before.refusals, []);
    assert.equal(before.rows.length, 6);
    assert.ok(before.rows.every((r) => !('doing_said' in r.fields)), 'a block that does not name the column is not handed it');

    const asked: BlockResult = k.block(cards(source, 'doing_said'));
    assert.deepEqual(asked.refusals, [], 'the column is one a card may name');
    assert.deepEqual(
      asked.rows.map((r) => r.fields.doing_said),
      ['', SAID, '', '', '', ''],
      'the record’s own name, no name, and words holding a path or an id all answer nothing',
    );
    /* `doing` IS UNCHANGED, and so is everything else: the answer is the one before with a field more a row. */
    assert.deepEqual(asked.rows.map((r) => r.fields.doing), before.rows.map((r) => r.fields.doing));
    const without = asked.rows.map((r) => {
      const { doing_said: _said, ...fields } = r.fields;
      return { ...r, fields };
    });
    /* The block's own columns come back with it, and its key is made from them: those two are the block's, not the runs'. */
    assert.deepEqual({ ...asked, rows: without, columns: before.columns, key: before.key }, before);
    assert.deepEqual(k.block(cards(source)), before, 'and asking for it wrote nothing to the list');

    /* THE LIST HAS NO SUCH FIELD: a row read from it holds none, and a word the list does not have is refused still. */
    const listed = k.list({ register: 'session', limit: 50 });
    assert.ok(listed.ok && listed.value.rows.every((r) => !('doing_said' in r.fields)));
    assert.equal(k.block(cards(source, 'doing_said', 'colour')).refusals[0]?.code, 'FIELD_UNKNOWN');

    /* CUT TO A LIMIT, the words are cut with the runs. */
    const one = k.block({ ...cards(source, 'doing_said'), limit: 2 } as never);
    assert.deepEqual(one.rows.map((r) => r.fields.doing_said), ['', SAID]);

    /* AND A PAGE THAT NAMES IT INSTALLS: the check a declaration passes on its way in knows the column too. */
    const page = { id: 'page.crew', kind: 'page', body: { page: 'crew', title: 'Crew', blocks: [cards(source, 'doing_said')] } } as never;
    const installed = await k.install([page]);
    assert.ok(installed.ok, JSON.stringify(installed));

    /* ON A KIT WITH NO READER OF A RUN'S NAME the column is refused and never guessed, and a block without it reads on. */
    kitCarries(undefined);
    const early = k.block(cards(source, 'doing_said'));
    assert.deepEqual([early.refusals[0]?.code, early.refusals[0]?.at, early.rows], ['NOT_IN_THIS_BUILD', 'columns', []]);
    assert.deepEqual(k.block(cards(source)), before);
    kitCarries(recordNamed);
    sql.close();
  });
}

test('NO CARD PRINTS A FILE PATH, A HOST NAME OR AN ID, so words holding one answer nothing', () => {
  for (const words of [
    PATHS,
    'Reading ~/Developer/braindog',
    'Edit packages/kernel/src/pages.ts',
    'Deploying to brain.dog',
    'Fetch https://example.com/a',
    'Check C:\\Users\\x\\notes',
    'Running wf_01ABC again',
    'Close tools#8',
    'Row 01HZX3NDEKTSV4RRFFQ69G5FAV moved',
  ])
    assert.equal(printable(words), false, words);
  for (const words of [SAID, 'Fix the and/or wording', 'Bump to version 2.1', 'Tidy up. Then ship', 'Rename doing_said'])
    assert.equal(printable(words), true, words);
});

test('doingSaid READS A RUN WITH ITS PROJECT AND THE RECORD’S OTHERS, aligned with the runs', () => {
  const run = (doing: unknown, repo?: string) => ({ fields: { doing, ...(repo ? { repo } : {}) }, created_at: '2026-10-01T09:00:00.000Z' }) as never;
  const runs = [run('Claude in Kiln'), run('Lanternly, 1 Oct'), run('Standup notes, 2 Oct'), run('braindog on master', 'braindog'), run('  Tidy the ledger  '), run(7)];
  assert.deepEqual(doingSaid(runs, ['Kiln', 'Lanternly', null, null, null, null], ['Kiln', 'Lanternly'], recordNamed), ['', '', 'Standup notes, 2 Oct', '', 'Tidy the ledger', '']);
});
