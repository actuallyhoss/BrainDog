/**
 * The figures a record has without a pack declaring them: `questions-open`, how many questions are waiting, and
 * `questions-open:<what>`, how many of them are about one thing.
 *
 * WHAT WAS MEASURED BEFORE IT: Money's 'Waiting on you' could not be gated with `when:`, because every figure reads a
 * list and the questions are not rows of one, so on an empty record the tile drew its cleared line to nobody.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countOpenQuestions } from '../src/govern.ts';
import { BUILT_IN_FIGURES, builtInFigure } from '../src/built-in-figures.ts';
import { registersOf, registersOfBlock, WHOLE_RECORD, type PageBlock } from '../src/pages.ts';
import { openRecord, type Declaration, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 86_400_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };

const WAITING = { kind: 'note', heading: 'Waiting on you', body: '{{questions-open}} question(s) waiting.', when: { metric: 'questions-open', gt: 0 } } as PageBlock;

test('A PAGE GATES A BLOCK ON THE OPEN QUESTIONS with no figure declared, and it draws once one is asked', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);

  const empty = k.block(WAITING);
  assert.equal(empty.drawn, false, 'the tile drew on a record nobody had asked anything of');
  assert.deepEqual(empty.refusals, []);

  const asked = value<{ id: string }>(k.propose({ question: 'Raise the retainer?', body_kind: 'options', body: OPTIONS }, 'slash'));
  value(k.propose({ question: 'Pay the bill?', body_kind: 'options', body: OPTIONS }, 'slash'));
  const two = k.block(WAITING);
  assert.notEqual(two.drawn, false);
  assert.equal(two.values?.['questions-open'], 2, 'the heading cannot say how many');

  /* A STAT READS IT AS IT READS ANY FIGURE, and it is the queue's own count: a question put off is not waiting. */
  const stat = k.block({ kind: 'stat', cells: [{ metric: 'questions-open' }] });
  assert.equal(stat.readings?.[0]?.reading?.value, 2);
  value(k.decide(asked.id, { defer: { until: new Date(NOW + 3 * DAY).toISOString(), why: 'after the quarter closes' } }, 'p_1'));
  const read = value<Reading>(k.metric(BUILT_IN_FIGURES['questions-open']!));
  assert.equal(read.value, 1);
  assert.equal(read.value, countOpenQuestions({ sql, nowMs: clock.now() }), 'the figure and the queue count two different things');
  assert.equal(read.met, false, 'a question waiting is not the figure on its target');
  sql.close();
});

test('A DECLARED FIGURE OF THE SAME NAME WINS, so nothing built in takes a name from a pack', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const own: Declaration = {
    id: 'metric.questions-open',
    kind: 'metric',
    body: { metric: 'questions-open', name: 'Mine', source: 'register.things', value: { count: 'id' }, format: 'int', target: { lte: 0 }, window: '7d', compare: 'none' } as never,
  };
  const things: Declaration = { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Things', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never };
  value(await k.install([things, own]));
  value(k.create('things', { what: 'one' }, { actor: 'p_1' }));
  value(k.create('things', { what: 'two' }, { actor: 'p_1' }));
  value(k.create('things', { what: 'three' }, { actor: 'p_1' }));
  assert.equal(k.block({ kind: 'stat', cells: [{ metric: 'questions-open' }] }).readings?.[0]?.reading?.value, 3);
  sql.close();
});

test('THE COUNT IS A FACT ABOUT THE WHOLE RECORD, so a block gated on it is held as the queue is', () => {
  assert.equal(builtInFigure('constructor'), null);
  assert.deepEqual(registersOfBlock(WAITING, () => null), [WHOLE_RECORD]);
});

test('AND IT NAMES THE WHOLE RECORD TO WHOEVER ASKS WHICH LISTS IT READS, so the record does not answer a member the count', async () => {
  const { figureLists } = await import('../src/money-figures.ts');
  assert.deepEqual(figureLists(BUILT_IN_FIGURES['questions-open']!), [WHOLE_RECORD]);
});

/* ── one thing's questions ───────────────────────────────────────────────── */

const about = (what: string) => ({ ...OPTIONS, about: what });
const queueOf = (what: string) => ({ kind: 'queue', source: 'governance.open', where: `about is ${what}`, empty: 'Nothing matched.' }) as PageBlock;
const waitingOn = (what: string) => ({ kind: 'section', heading: 'Waiting on you', when: { metric: `questions-open:${what}`, gt: 0 } }) as PageBlock;

test('QUESTIONS-OPEN:<WHAT> COUNTS ONE THING\'S OPEN QUESTIONS, the ones its queue keeps, so a page with none is not drawn while others wait', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const kiln = value<{ id: string }>(k.propose({ question: 'Fire on Friday?', body_kind: 'options', body: about('things#1') }, 'slash'));
  value(k.propose({ question: 'Glaze the lids?', body_kind: 'options', body: about('things#1') }, 'slash'));
  value(k.propose({ question: 'Which box?', body_kind: 'options', body: about('things#2') }, 'slash'));
  value(k.propose({ question: 'Pay the bill?', body_kind: 'options', body: OPTIONS }, 'slash'));

  const read = (what: string) => k.block({ kind: 'stat', cells: [{ metric: `questions-open:${what}` }] }).readings?.[0]?.reading?.value;
  assert.equal(read('things#1'), 2);
  assert.equal(read('things#2'), 1);
  assert.equal(read('things#3'), 0, 'a thing nobody asked about counted the record');
  assert.equal(k.block({ kind: 'stat', cells: [{ metric: 'questions-open' }] }).readings?.[0]?.reading?.value, 4, 'with no parameter it is the whole record still');

  /* THE QUEUE'S OWN COUNT, one thing at a time: the figure and `about is <what>` keep the same questions. */
  for (const what of ['things#1', 'things#2', 'things#3']) assert.equal(read(what), k.block(queueOf(what)).matched, what);

  /* THE GATE: drawn over a thing with a question, not over one with none, while other questions are waiting. */
  assert.notEqual(k.block(waitingOn('things#1')).drawn, false);
  assert.equal(k.block(waitingOn('things#3')).drawn, false, "a project page drew 'Nothing matched' while other projects had questions");

  /* A QUESTION PUT OFF IS NOT WAITING, as it is not in the whole count. */
  value(k.decide(kiln.id, { defer: { until: new Date(NOW + 3 * DAY).toISOString(), why: 'after the firing' } }, 'p_1'));
  assert.equal(read('things#1'), 1);
  assert.equal(read('things#1'), k.block(queueOf('things#1')).matched);
  sql.close();
});

test('THE PARAMETER IS THE WHOLE OF WHAT FOLLOWS THE FIRST COLON, matched exactly, as `about is` matches it', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(k.propose({ question: 'Move the repo?', body_kind: 'options', body: about('C:\\Repos') }, 'slash'));
  value(k.propose({ question: 'Rename the box?', body_kind: 'options', body: about('Box') }, 'slash'));
  const read = (what: string) => k.block({ kind: 'stat', cells: [{ metric: `questions-open:${what}` }] }).readings?.[0]?.reading?.value;
  assert.equal(read('C:\\Repos'), 1);
  assert.equal(read('C'), 0);
  assert.equal(read('box'), 0, 'a queue keeps Box by its own spelling, and so does the count');
  assert.equal(read('Box'), 1);
  /* A BODY THE RECORD CANNOT PARSE IS ABOUT NOTHING, and it does not stop the count of the rest. */
  sql.exec("UPDATE suggestion SET body = 'not json' WHERE id = (SELECT id FROM suggestion ORDER BY rowid LIMIT 1)");
  assert.equal(read('Box'), 1);
  assert.equal(read('C:\\Repos'), 0);
  sql.close();
});

test('A PAGE PER THING GATES ON ITS OWN QUESTIONS, `questions-open:{{spoken}}` filled from its row, and still reads the whole record', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const things: Declaration = { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Things', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never };
  const page: Declaration = {
    id: 'page.thing',
    kind: 'page',
    body: {
      page: 'thing',
      title: '{{what}}',
      for: { register: 'things' },
      requires: ['register.things'],
      blocks: [
        { kind: 'section', heading: 'Waiting on you', when: { metric: 'questions-open:{{spoken}}', gt: 0 } },
        { kind: 'queue', source: 'governance.open', where: 'about is {{spoken}}', empty: 'Nothing matched.' },
      ],
    } as never,
  };
  value(await k.install([things, page]));
  const kiln = value<{ seq: number }>(k.create('things', { what: 'Kiln' }, { actor: 'p_1' }));
  value(k.create('things', { what: 'Box' }, { actor: 'p_1' }));
  value(k.propose({ question: 'Fire on Friday?', body_kind: 'options', body: about(`things#${kiln.seq}`) }, 'slash'));
  const blocks = (title: string) => {
    const slug = k.pages().find((p) => p.title === title)?.slug;
    assert.ok(slug, `no page for ${title}`);
    /* BY KIND AND NOT BY PLACE: the page is read under its look (`compose.ts`), which may lead with the question waiting. */
    const read = value<{ blocks: { kind: string; key: string; drawn?: boolean; matched?: number; refusals: unknown[] }[]; look?: { lead?: string; hide?: string[] } }>(k.page(slug));
    return [read.blocks.find((b) => b.kind === 'section'), read.blocks.find((b) => b.kind === 'queue'), read.look] as const;
  };
  const [kilnWaits, kilnQueue, kilnLook] = blocks('Kiln');
  assert.notEqual(kilnQueue?.drawn, false);
  assert.equal(kilnQueue?.matched, 1);
  /* KILN'S HEADING PASSED ITS GATE, and the question it stands over leads the page from under it. */
  assert.notEqual(kilnWaits?.drawn, false);
  assert.equal(kilnLook?.lead, kilnQueue?.key);
  const [boxWaits, boxQueue, boxLook] = blocks('Box');
  assert.equal(boxWaits?.drawn, false, "Box's page drew Waiting on you over Kiln's question");
  assert.ok(!(boxLook?.hide ?? []).includes(boxWaits!.key), "Box's heading was hidden by the look, not by its own gate");
  assert.equal(boxQueue?.drawn, false, 'and the queue under it, which would say Nothing matched');
  assert.ok(registersOf(page.body as never).includes(WHOLE_RECORD), 'one thing\'s count is still a fact about every list');
  sql.close();
});
