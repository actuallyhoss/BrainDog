/**
 * Three things an agent reads first, held to what they promise.
 *
 * THE JSON BESIDE THE TEXT IS HELD TO ONE ANSWER'S SIZE, as the text always was, and says what it cut. `structuredContent`
 * carried every answer whole, so a client that hands it to its model read a busy row's whole history however long.
 *
 * THE HOME PAGE IS THE ONE OF THE USE CASE THE AGENT'S PROJECT BELONGS TO. `braindog:page/home` took the first
 * `home-<id>` the record listed, so on a record with two use cases an agent in one's project read the other's Home.
 *
 * AND A SENTENCE NAMES A ROW BY ITS WORDS, WITH ITS HANDLE BESIDE THEM. A question naming `people#3`, or a row's id,
 * reached the agent as the number, and an untitled task was the line `tasks#3`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { activityBrief, metBrief, namedIn, plainOf, rowLine, type Decl, type Look } from '../src/brief.ts';
import { ANSWER_MOST, fittedJson, tools } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub, type Ctx } from './stub.ts';

const ctx: Ctx = { who: 'agent' };
const NOW = Date.UTC(2026, 9, 6, 9);
let n = 0;

/* ── the JSON beside the text ───────────────────────────────────────────── */

test('A LARGE ANSWER\'S JSON IS CUT TO ONE ANSWER, its longest list first, and says what it kept of how many', () => {
  const rows = Array.from({ length: 900 }, (_, i) => ({ spoken: `tasks#${String(i + 1)}`, note: `Line ${String(i)} `.repeat(12) }));
  const fitted = fittedJson({ rows, matched: 900, cursor: 'c_after_900' });
  const size = JSON.stringify(fitted).length;
  assert.ok(size <= ANSWER_MOST, `the cut answer is ${String(size)} characters`);
  const kept = (fitted.rows as unknown[]).length;
  assert.ok(kept > 1 && kept < 900, `kept ${String(kept)}`);
  assert.equal(fitted.matched, 900, 'a count beside the rows is kept as the record said it');
  assert.equal(fitted.cursor, undefined, 'a cursor past the rows that were dropped would skip them');
  assert.match(String(fitted.cut), new RegExp(`^Cut at 40,000 characters, the most one answer carries: rows ${String(kept)} of 900\\.`, 'u'));
  assert.match(String(fitted.cut), /smaller limit/u);
});

test('A LIST INSIDE THE ANSWER IS CUT WHERE IT IS, and a long text is shortened when no list is left to cut', () => {
  const nested = fittedJson({ card: 'BrainDog', registers: [{ id: 'tasks', rows: Array.from({ length: 400 }, (_, i) => ({ words: `Task ${String(i)} `.repeat(20) })) }, { id: 'tools', rows: [] }] });
  assert.ok(JSON.stringify(nested).length <= ANSWER_MOST);
  assert.equal(nested.card, 'BrainDog');
  assert.match(String(nested.cut), /registers\[0\]\.rows \d+ of 400/u);

  const long = fittedJson({ spoken: 'things#1', note: 'A long write-up. '.repeat(5_000) });
  assert.ok(JSON.stringify(long).length <= ANSWER_MOST);
  assert.equal(long.spoken, 'things#1');
  assert.match(String(long.note), /\.\.\.$/u);
  assert.match(String(long.cut), /1 long text shortened/u);

  const small = { rows: [{ spoken: 'tasks#1' }], cursor: 'c1' };
  assert.equal(fittedJson(small), small, 'an answer that fits is handed back as it is');
});

test('A CUT rows ANYWHERE TAKES ITS CURSOR WITH IT, and the answer\'s own, since following either would skip what went', () => {
  const rows = Array.from({ length: 600 }, (_, i) => ({ spoken: `tasks#${String(i + 1)}`, note: `Line ${String(i)} `.repeat(12) }));
  const fitted = fittedJson({ card: 'BrainDog', page: { rows, cursor: 'c_page' }, cursor: 'c_top' });
  assert.ok(JSON.stringify(fitted).length <= ANSWER_MOST);
  const page = fitted.page as Record<string, unknown>;
  assert.ok((page.rows as unknown[]).length < 600);
  assert.equal(page.cursor, undefined, 'the cursor beside a cut page.rows was kept');
  assert.equal(fitted.cursor, undefined, 'the answer\'s own cursor was kept past cut rows');
  assert.match(String(fitted.cut), /page\.rows \d+ of 600\./u);
  assert.match(String(fitted.cut), /The cursor went with what was cut/u);

  /* A CURSOR THE RECORD GAVE AS A NUMBER OR AN OBJECT GOES THE SAME WAY. */
  const raw = fittedJson({ owed: { rows, cursor: 412 }, paid: { rows: [], cursor: { after: 'x' } } });
  assert.equal((raw.owed as Record<string, unknown>).cursor, undefined, 'a number cursor beside cut rows was kept');
  assert.deepEqual((raw.paid as Record<string, unknown>).cursor, { after: 'x' }, 'a cursor beside rows that were not cut was dropped');

  /* A LIST THAT IS NOT ROWS LEAVES A CURSOR WHERE IT IS. */
  const events = Array.from({ length: 600 }, (_, i) => ({ note: `Event ${String(i)} `.repeat(12) }));
  const other = fittedJson({ events, cursor: 'c_next' });
  assert.equal(other.cursor, 'c_next');
});

test('A CUT LIST THAT CARRIED MONEY SAYS ITS TOTALS STILL COUNT WHAT WENT, and one without money says nothing of totals', () => {
  const rows = Array.from({ length: 700 }, (_, i) => ({ spoken: `transactions#${String(i + 1)}`, amount: { amount: -1250 - i, currency: 'GBP' }, note: `Card ${String(i)} `.repeat(10) }));
  const total = { amount: rows.reduce((t, r) => t + r.amount.amount, 0), currency: 'GBP' };
  const fitted = fittedJson({ rows, total });
  assert.ok(JSON.stringify(fitted).length <= ANSWER_MOST);
  assert.deepEqual(fitted.total, total, 'the total was changed');
  assert.match(String(fitted.cut), /Any total here still counts what was cut from rows, so it no longer adds up to the entries shown\./u);

  const plain = fittedJson({ rows: rows.map(({ spoken, note }) => ({ spoken, note })) });
  assert.doesNotMatch(String(plain.cut), /total/u);
});

test('OVER THE WIRE, structuredContent IS HELD TO ONE ANSWER, and format full answers JSON a client can parse', async () => {
  const events = Array.from({ length: 1_500 }, (_, i) => ({ ts: '2026-10-01T09:00:00Z', actor: 'p_ada', kind: 'note', note: `Checked the proof again, round ${String(i)}. `.repeat(3) }));
  const { surface } = stub({ history: async () => ({ ok: true, value: events }) });
  for (const args of [{ spoken: 'tasks#1' }, { spoken: 'tasks#1', format: 'full' }]) {
    const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'history', arguments: args } }, surface, ctx)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    const result = reply.result as { content: { text: string }[]; structuredContent: Record<string, unknown> };
    const json = JSON.stringify(result.structuredContent);
    assert.ok(json.length <= ANSWER_MOST, `${JSON.stringify(args)}: structuredContent is ${String(json.length)} characters`);
    assert.match(String(result.structuredContent.cut), /^Cut at 40,000 characters.*: rows \d+ of 1,500\./u);
    assert.ok(result.content[0]!.text.length <= ANSWER_MOST);
    if (args.format === 'full') assert.deepEqual(JSON.parse(result.content[0]!.text), result.structuredContent, 'the full text is the fitted JSON, whole');
  }
});

/* ── the Home page ──────────────────────────────────────────────────────── */

const PAGES = [
  { slug: 'home-founder', title: 'Overview' },
  { slug: 'home-student', title: 'Studies' },
  { slug: 'home', title: 'Home' },
];

/** A record with two use cases on, the student's Home reading `reads` and the founder's not, and `speaks` speaking. */
function twoUseCases(o: { project: string | null; reads?: string; speaks?: string }) {
  return stub({
    pages: async () => ({ ok: true, value: PAGES }),
    boot: async () => ({ ok: true, value: { registers: [], pages: PAGES } }),
    context: async () => ({ ok: true, value: { session: null, project: o.project === null ? null : { spoken: o.project, name: 'Thesis' } } }),
    arrangement: async (args: { page?: string }) =>
      args.page === undefined
        ? { ok: true, value: { voice: { pack: o.speaks ?? 'usecase-founder' } } }
        : { ok: true, value: { id: `page.${args.page}`, body: { requires: args.page === 'home-student' && o.reads ? [`register.${o.reads}`] : ['register.accounts'] } } },
  });
}

const homeRead = async (s: ReturnType<typeof stub>) => {
  const read = await tools(s.surface).read('braindog:page/home', ctx);
  assert.ok(read.ok, JSON.stringify(read));
  return s.calls.filter((c) => c.method === 'page').map((c) => (c.args as { slug: string }).slug);
};

test('OF TWO USE CASES, HOME IS THE ONE WHOSE HOME READS THE LIST THE AGENT\'S PROJECT IS KEPT IN, whichever is listed first', async () => {
  assert.deepEqual(await homeRead(twoUseCases({ project: 'things#3', reads: 'things' })), ['home-student']);
  const s = twoUseCases({ project: 'things#3', reads: 'things' });
  const said = await tools(s.surface).answer('context', {}, ctx);
  assert.match(said.text, /^Home page: Studies\. Read it at braindog:page\/home\.$/mu);
  assert.equal((said.structured as { home?: string }).home, 'home-student');
});

test('WHERE THE PROJECT SAYS NOTHING, HOME IS THE USE CASE THAT SPEAKS, as the person\'s own Home is; and the first where nothing says', async () => {
  assert.deepEqual(await homeRead(twoUseCases({ project: 'things#3', speaks: 'usecase-student' })), ['home-student']);
  assert.deepEqual(await homeRead(twoUseCases({ project: null, speaks: 'usecase-student' })), ['home-student']);
  assert.deepEqual(await homeRead(twoUseCases({ project: null, speaks: 'usecase-gardener' })), ['home-founder']);
});

test('ONE USE CASE ASKS NOTHING MORE: its Home is read with no arrangement and no context', async () => {
  const s = stub({ pages: async () => ({ ok: true, value: [PAGES[0]!, PAGES[2]!] }), arrangement: async () => ({ ok: true, value: {} }) });
  assert.deepEqual(await homeRead(s), ['home-founder']);
  assert.deepEqual(s.calls.filter((c) => c.method === 'arrangement' || c.method === 'context'), []);
});

/* ── names, never ids ───────────────────────────────────────────────────── */

const PEOPLE = { id: 'people', name: 'People', one: 'person', title: 'name', fields: [{ id: 'name', type: 'text' }] } as Decl;
const TOOLS_LIST = { id: 'tools', name: 'Tools', one: 'tool', title: 'name', fields: [{ id: 'name', type: 'text' }] } as Decl;
const TASKS = { id: 'tasks', name: 'Tasks', one: 'task', title: 'title', state: 'state', fields: [{ id: 'title', type: 'text' }, { id: 'state', type: 'enum' }] } as Decl;
const TITLES = new Map([
  ['people#3', 'Ann Lee'],
  ['people#9', 'Ann Lee'],
  ['01J9ZQ8V7N2D4K6M8P0R2T4W6Y', 'Kiln (things#1)'],
  ['SG7', 'Are people#3 and people#9 the same person, Ann Lee? Accepting folds people#9 into people#3.'],
]);
const look: Look = {
  now: NOW,
  decl: (r) => ({ people: PEOPLE, tools: TOOLS_LIST, tasks: TASKS })[r],
  title: (spoken) => TITLES.get(spoken),
  actor: (by) => (by === 'p_ada' || by === 'p_01J9ZQ8V7N2D4K6M8P0R2T4ADA' ? 'Ada' : 'Someone you share with'),
  decider: 'Ada',
};

test('A SENTENCE NAMES EACH ROW BY ITS WORDS WITH ITS HANDLE BESIDE THEM, and never by an id alone', () => {
  assert.equal(
    plainOf('Are people#3 and people#9 the same person, Ann Lee?', look),
    'Are Ann Lee (people#3) and Ann Lee (people#9) the same person, Ann Lee?',
    'two people of one name are told apart by their handles',
  );
  assert.equal(plainOf('Change tools#8 to how fly is set up?', look), 'Change the tool tools#8 to how fly is set up?');
  assert.equal(plainOf('Ship 01J9ZQ8V7N2D4K6M8P0R2T4W6Y before p_01J9ZQ8V7N2D4K6M8P0R2T4ADA is back', look), 'Ship Kiln (things#1) before Ada is back');
  assert.equal(plainOf('Sum t_paid, never p_value', look), 'Sum t_paid, never p_value', 'a column and a variable are not people');
  assert.equal(plainOf('Fold 01J9ZQ8V7N2D4K6M8P0R2T4W6Z in', look), 'Fold an entry you cannot open in');
  assert.equal(plainOf('A list nobody declared, notes#4', look), 'A list nobody declared, notes#4');
});

test('AN UNTITLED ROW IS ITS LIST\'S WORD FOR ONE, beside its handle, on a line and wherever it is named', () => {
  assert.equal(namedIn('', 'tasks#3', look), 'Untitled task (tasks#3)');
  assert.equal(namedIn('Renew the domain', 'tasks#3', look), 'Renew the domain (tasks#3)');
  assert.equal(namedIn('', 'S42', look), 'S42', 'a run is named by its app elsewhere, and its handle says no list');
  assert.equal(rowLine({ spoken: 'tasks#3', state: 'open', fields: {} }, 'tasks', look), 'Untitled task (tasks#3) · open');
});

test('A LOG LINE ABOUT A QUESTION SAYS ITS WORDS, OR THAT IT IS ONE WHERE THE ANSWER DID NOT READ THEM, and a list by its name', () => {
  const said = activityBrief({}, { rows: [
    { ts: '2026-10-06T08:00:00Z', actor: 'p_ada', kind: 'decide', target: 'suggestion:SG7' },
    { ts: '2026-10-06T08:15:00Z', actor: 'p_ada', kind: 'decide', target: 'suggestion:SG8' },
    { ts: '2026-10-06T08:30:00Z', actor: 'p_ada', kind: 'edit', target: 'declaration:register.tasks' },
  ] }, look);
  assert.match(said, /decided · "Are people#3 and people#9 the same person, Ann Lee\? Accepting folds people#9 into people#3\." \(SG7\)/u);
  assert.match(said, /decided · a question \(SG8\)/u);
  assert.match(said, /the Tasks list/u);
});

test('MEETING SOMEONE WHO MAY BE ONE ALREADY MET SAYS THE QUESTION, in names, and not its number alone', () => {
  const said = metBrief({ person: 'people#9', created: true, question: 'SG7', asked: TITLES.get('SG7')!, said: 'Ann Lee' }, look);
  assert.equal(
    said,
    'Added Ann Lee; asked Ada on Decide: Are Ann Lee (people#3) and Ann Lee (people#9) the same person, Ann Lee? Accepting folds Ann Lee (people#9) into Ann Lee (people#3). · people#9 · SG7',
  );
});

/* ── on a real record ───────────────────────────────────────────────────── */

const agent = {
  principal: { kind: 'token', id: 't_names', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'names', cwd: '/Users/studio/Code/kiln-type', host: 'Studio-MacBook-Pro.local', agent: 'claude' },
} as CallContext;

test('ON THE SEED, A QUESTION THAT NAMES A ROW BY HANDLE OR BY ID IS READ IN ITS WORDS, in governance and in the card', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await installSeed(api.kernel);
  const kiln = await api.get({ spoken: 'things#1' }, agent);
  assert.ok(kiln.ok && kiln.value && typeof kiln.value.id === 'string');
  const words = String((kiln.value.fields as Record<string, unknown>).name);
  const options = { options: [{ id: 'yes', label: 'Yes', because: 'It is ready.' }, { id: 'no', label: 'No', because: 'It is not.' }] };
  for (const question of [`Does things#1 ship its specimen first?`, `Is ${kiln.value.id} the project to price per seat?`]) {
    const asked = await tools(api).call('propose', { question, body_kind: 'options', body: options }, agent);
    assert.ok(asked.ok, JSON.stringify(asked));
  }
  const call = async (name: string, args: Record<string, unknown>) => {
    const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, api, { ...agent })) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    return (reply.result as { content: { text: string }[] }).content[0]!.text;
  };
  const queue = await call('governance', {});
  /* A HANDLE IN A QUESTION IS FILED AS THE ROW'S NAME (the record says names, not numbers), a row id is said by the door with its handle beside the name. */
  assert.ok(queue.includes(`Does ${words} ship its specimen first?`), queue);
  assert.ok(queue.includes(`Is ${words} (things#1) the project to price per seat?`), queue);
  assert.doesNotMatch(queue, /\b[0-9A-HJKMNP-TV-Z]{26}\b/u, 'a row id reached the queue');
  const card = await call('context', {});
  assert.doesNotMatch(card, /\b[0-9A-HJKMNP-TV-Z]{26}\b/u, 'a row id reached the card');
  sql.close();
});

/* ── a page of the queue, read once ─────────────────────────────────────── */

test('A PAGE OF THE QUEUE TOO LARGE FOR ONE ANSWER IS READ ONCE AND CUT WHERE IT STANDS, its cursor the last row kept', async () => {
  /* SIX BACKFILLS OF A SCRIPT'S, as on his record (bench 24 Oct): a page of twenty did not fit, and the door read it
     four times, each working out every card again, and still answered over the budget. */
  const big = (i: number) => ({ id: `SG${String(100 - i)}`, status: 'open', question: `Backfill ${String(i)}?`, money: Array.from({ length: 200 }, () => ({ amount: 1_000_000, currency: 'EGP' })) });
  const small = (i: number) => ({ id: `SG${String(50 - i)}`, status: 'open', question: `Small ${String(i)}?` });
  const queue = [...Array.from({ length: 6 }, (_, i) => big(i)), ...Array.from({ length: 20 }, (_, i) => small(i))];
  const { surface, calls } = stub({
    governance: async (args: unknown, c: Ctx) => {
      calls.push({ method: 'governance', args, ctx: c });
      return { ok: true, value: queue.slice(0, Number((args as { limit?: number }).limit ?? queue.length)) };
    },
  });
  const out = (await tools(surface).call('governance', {}, ctx)) as { ok: true; value: { rows: { id: string }[]; cursor?: string } };
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(calls.filter((c) => c.method === 'governance').length, 1, 'the page was read more than once');
  assert.ok(JSON.stringify(out.value).length <= ANSWER_MOST, `the page is ${String(JSON.stringify(out.value).length)} characters`);
  assert.ok(out.value.rows.length >= 1 && out.value.rows.length < 6, `kept ${String(out.value.rows.length)}`);
  assert.equal(out.value.cursor, out.value.rows.at(-1)!.id, 'the cursor is not the last row kept');
});
