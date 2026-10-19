/**
 * The standing lessons at the agent door, as `braindog:learnings` (AGT-C14 job d, Build 4).
 *
 * IT IS THE RECORD'S OWN READ (`learnings`), so which lessons stand, in which order and for whom is the record's to
 * say: method before fact, here before everywhere, newest first, forty at most. The door writes each as one line an
 * agent reads before it works, and passes on nothing else: no row id, no project's id, no day a machine wrote.
 *
 * ITS DESCRIPTION IS THE TEST FOR RECORDING ONE, because the list is where a session looks before it adds to it: it
 * changes what a session does; it generalises; a session without it would get it wrong, not merely slower; it has no
 * other home.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { TOOLS, tools, ttlOf, type McpSurface } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub, type Ctx } from './stub.ts';

const who: Ctx = { who: 'agent' };
/** A row's id, and a moment as a machine writes it. Neither is for an agent to read. */
const ID = /[0-9A-HJKMNP-TV-Z]{26}/u;
const MOMENT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;
const ROW = '01JZ8QK3F7R2M9V4XN6TCB5HAD';

type Refused = { ok: boolean; refusal?: { code: string; fix: string } };
const valueOf = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** What the record answers, ids and moments and all, as the door receives it (`methods/learnings.ts`). */
const LEARNED = {
  rows: [
    { spoken: 'LN12', lesson: 'Run the gates before a deploy.', because: 'A deploy went out red on 3 October.', kind: 'method', topic: 'deploy', where: 'here', confirmed_on: '2026-10-10', made: '2026-10-01T09:30:00.000Z', id: ROW },
    { spoken: 'LN9', lesson: 'Ask before widening\n a scope', because: 'because a wide lesson misled two runs', kind: 'method', topic: null, where: 'everywhere', confirmed_on: null, made: '2026-09-20T09:30:00.000Z', id: ROW },
    { spoken: 'LN14', lesson: 'The price list is in pence.', because: '', kind: 'fact', topic: 'money', where: `things#${ROW}`, confirmed_on: null, made: '2026-10-12T09:30:00.000Z' },
    { spoken: 'LN3', lesson: 'The studio closes on Fridays.', because: 'A delivery was booked for a Friday.', where: 'everywhere', made: '2026-08-02T09:30:00.000Z' },
  ],
  truncated: true,
  more: 5,
  faded: 3,
};

const answering = (value: unknown = LEARNED, over: Partial<McpSurface<Ctx>> = {}) => {
  const asked: unknown[] = [];
  const made = stub({
    learnings: async (args: unknown) => {
      asked.push(args);
      return { ok: true as const, value };
    },
    ...over,
  });
  return { ...made, asked };
};
const linesOf = async (value: unknown): Promise<string[]> =>
  valueOf<{ learnings: string[] }>(await tools(answering(value).surface).read('braindog:learnings', who)).learnings;

test('THE LIST NAMES braindog:learnings, and its description is the four-part test for recording one', async () => {
  const { surface } = answering();
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'resources/list' }, surface, who)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const listed = (reply.result as { resources: { uri: string; name: string; description: string }[] }).resources;
  const found = listed.find((r) => r.uri === 'braindog:learnings');
  assert.ok(found, 'braindog:learnings is not listed');
  const said = found.description;
  /* THE FOUR PARTS, each in the description's own words. */
  assert.match(said, /changes what a session does/u);
  assert.match(said, /generalises/u);
  assert.match(said, /would get it wrong, not merely slower/u);
  assert.match(said, /no other home/u);
  /* PLAIN, short enough to be read in a list, and in the words a person uses. */
  assert.ok(said.length <= 240, `described in ${String(said.length)} characters`);
  assert.doesNotMatch(said, /\b(?:row|rows|entity|register)\b|—/iu);
  /* A RESOURCE AND NOT A SEVENTEENTH TOOL, as `about` is: the tool list is in every turn. */
  assert.equal(TOOLS.length, 17);
  assert.ok(!TOOLS.some((t) => t.name === 'learnings'));
  assert.ok(ttlOf('braindog:learnings') <= 60_000);
});

test('EACH LESSON IS ONE LINE, in the order the record answered, with what is left said last', async () => {
  const { surface, asked } = answering();
  const reply = (await handle({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'braindog:learnings' } }, surface, who)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const text = (reply.result as { contents: { text: string }[] }).contents[0]?.text ?? '';
  const read = JSON.parse(text) as { learnings: string[] };
  assert.deepEqual(read.learnings, [
    'LN12 · method · here · Run the gates before a deploy. · because A deploy went out red on 3 October.',
    /* A LESSON ON TWO LINES IS ONE HERE, and a failure that begins with the word does not say it twice. */
    'LN9 · method · everywhere · Ask before widening a scope · because a wide lesson misled two runs',
    /* NO FAILURE WRITTEN, NONE SAID; and a place that is not one of the two words is left out, never a project's id. */
    'LN14 · fact · The price list is in pence.',
    /* A LESSON WITH NO KIND IS A FACT, as the card sorts it. */
    'LN3 · fact · everywhere · The studio closes on Fridays. · because A delivery was booked for a Friday.',
    'and 5 more, call context',
    '3 faded',
  ]);
  assert.deepEqual(Object.keys(read), ['learnings']);
  assert.doesNotMatch(text, ID);
  assert.doesNotMatch(text, MOMENT);
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}/u, 'a day as a machine writes it');
  /* THE RECORD IS ASKED ITS OWN DEFAULT: the door names no limit of its own. */
  assert.deepEqual(asked, [{}]);
});

test('WHAT IS LEFT IS COUNTED WHEN THE RECORD COUNTS IT, and said without a number when it does not', async () => {
  const two = LEARNED.rows.slice(0, 2);
  /* `truncated` ALONE, AS THE READ ANSWERS IT: the record is asked once more for the most one read holds, and the
     difference is the number. Forty-five stand, forty were answered, so five are left. */
  const standing = Array.from({ length: 45 }, (_, i) => ({ spoken: `LN${String(i + 1)}`, lesson: `Lesson ${String(i + 1)}.`, kind: 'fact', where: 'everywhere' }));
  const limits: unknown[] = [];
  const cut = (most: number, refuse = false) =>
    stub({
      learnings: async (args: { limit?: number }) => {
        limits.push(args);
        if (refuse && args.limit !== undefined) return { ok: false as const, refusal: { code: 'VALUE_MALFORMED', fix: 'limit is a whole number from 1 to 100.' } };
        const limit = Math.min(args.limit ?? 40, most);
        return { ok: true as const, value: { rows: standing.slice(0, limit), truncated: standing.length > limit, faded: 0 } };
      },
    }).surface;
  const counted = valueOf<{ learnings: string[] }>(await tools(cut(200)).read('braindog:learnings', who)).learnings;
  assert.equal(counted.length, 41);
  assert.equal(counted.at(-1), 'and 5 more, call context');
  assert.deepEqual(limits.splice(0), [{}, { limit: 200 }]);
  /* A SECOND READ CUT SHORT TOO says over, and one the record refuses leaves the line with no number invented. */
  assert.equal(valueOf<{ learnings: string[] }>(await tools(cut(42)).read('braindog:learnings', who)).learnings.at(-1), 'and over 2 more, call context');
  assert.equal(valueOf<{ learnings: string[] }>(await tools(cut(200, true)).read('braindog:learnings', who)).learnings.at(-1), 'and more, call context');
  /* THE LIST ASKS ONLY WHETHER THE ADDRESS ANSWERS, and counts nothing. */
  limits.splice(0);
  assert.ok((await tools(cut(200)).resources(who)).some((r) => r.uri === 'braindog:learnings'));
  assert.deepEqual(limits, [{}]);
  /* A COUNT OF ALL THAT STAND gives the number left. */
  assert.equal((await linesOf({ rows: two, truncated: true, total: 9, faded: 0 })).at(-1), 'and 7 more, call context');
  /* NOTHING LEFT AND NOTHING FADED: the lessons alone. */
  assert.equal((await linesOf({ rows: two, truncated: false, faded: 0 })).length, 2);
  assert.equal((await linesOf({ rows: two, truncated: false, faded: 1 })).at(-1), '1 faded');
  /* A ROW WITH NO HANDLE OR NO LESSON tells an agent nothing it can follow or cite, so it is not passed on. */
  assert.deepEqual(await linesOf({ rows: [{ spoken: ROW, lesson: 'A lesson.' }, { spoken: 'LN2', lesson: ' ' }, { spoken: 'LN4', lesson: 'Kept.', kind: 'fact' }] }), ['LN4 · fact · Kept.']);
});

test('NO LESSON STANDING IS SAID IN A SENTENCE, never an empty answer an agent has to interpret', async () => {
  const none = answering({ rows: [], truncated: false, faded: 0 });
  assert.deepEqual(valueOf(await tools(none.surface).read('braindog:learnings', who)), { learnings: [], said: 'No lesson stands here yet.' });
  /* ALL OF THEM FADED is said as that, and an answer of no shape reads as nothing standing. */
  assert.deepEqual(valueOf(await tools(answering({ rows: [], faded: 2 }).surface).read('braindog:learnings', who)), { learnings: ['2 faded'] });
  assert.deepEqual(valueOf(await tools(answering(null).surface).read('braindog:learnings', who)), { learnings: [], said: 'No lesson stands here yet.' });
});

test('A RECORD WHOSE BUILD LACKS THE READ SAYS SO IN ONE LINE NAMING braindog:context, and lists no address for it', async () => {
  const { surface } = stub();
  const mcp = tools(surface);
  assert.ok(!(await mcp.resources(who)).some((r) => r.uri === 'braindog:learnings'), 'listed on a record that cannot answer it');
  const none = (await mcp.read('braindog:learnings', who)) as Refused;
  assert.equal(none.ok, false);
  assert.equal(none.refusal?.code, 'NOT_IN_THIS_BUILD');
  const fix = none.refusal?.fix ?? '';
  assert.match(fix, /^This record does not answer braindog:learnings yet\. /u);
  assert.match(fix, /braindog:context/u);
  assert.ok(!fix.includes('\n') && fix.length <= 200, fix);
  assert.doesNotMatch(fix, /—/u);
  /* THERE IS NO ADDRESS UNDER IT: one lesson is read with `get` by its handle. */
  assert.equal(((await tools(answering().surface).read('braindog:learnings/LN12', who)) as Refused).ok, false);
  /* A REFUSAL IS THE RECORD'S, IN ITS WORDS. */
  const refusing = answering(LEARNED, { learnings: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'This key cannot read the lessons.' } }) });
  const no = (await tools(refusing.surface).read('braindog:learnings', who)) as Refused;
  assert.equal(no.refusal?.fix, 'This key cannot read the lessons.');
  assert.ok(!(await tools(refusing.surface).resources(who)).some((r) => r.uri === 'braindog:learnings'));
});

test('ON A REAL RECORD an agent reads the standing lessons a line each, in the record order', async (t) => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 9)) });
  await installSeed(api.kernel);
  const agent = { principal: { kind: 'token', id: 't', scope: 'write', person: 'p_seed', level: 'owner' }, session: { client_id: 'learnings-door', cwd: '/Users/studio/Code/kiln-type' } } as CallContext;
  const own = (api as { learnings?: (args: { limit?: number }, ctx: CallContext) => Promise<unknown> }).learnings;
  if (typeof own !== 'function') {
    /* UNTIL THE RECORD ANSWERS IT, the door says so and offers no address, over the real record and not a stand-in. */
    const none = (await tools(api).read('braindog:learnings', agent)) as Refused;
    assert.equal(none.refusal?.code, 'NOT_IN_THIS_BUILD');
    assert.ok(!(await tools(api).resources(agent)).some((r) => r.uri === 'braindog:learnings'));
    sql.close();
    return t.skip('this tree has no record method `learnings` yet (learnings-read-87 and reads-wire-87 land it)');
  }
  for (const [lesson, kind] of [['Kern the pairs after the spacing is set.', 'method'], ['The foundry invoices in euros.', 'fact']] as const)
    valueOf(await api.create({ register: 'learnings', fields: { lesson, because: 'A session got it wrong on 20 September.', kind } }, agent));

  const reply = (await handle({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'braindog:learnings' } }, api, agent)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const text = (reply.result as { contents: { text: string }[] }).contents[0]?.text ?? '';
  assert.doesNotMatch(text, ID);
  assert.doesNotMatch(text, MOMENT);
  const lines = (JSON.parse(text) as { learnings: string[] }).learnings;

  /* THE RECORD'S ORDER, LINE FOR LINE: what the door says first is what the read answered first. */
  const read = valueOf<{ rows: { spoken: string; kind?: string | null }[]; truncated?: boolean; faded?: number }>(await own.call(api, {}, agent));
  const lessons = lines.filter((l) => /^LN\d+ · /u.test(l));
  assert.deepEqual(lessons.map((l) => l.split(' · ')[0]), read.rows.map((r) => r.spoken));
  assert.ok(lessons.length >= 2, text);
  assert.equal(lines.length, lessons.length + (read.truncated ? 1 : 0) + ((read.faded ?? 0) > 0 ? 1 : 0));
  /* METHOD BEFORE FACT, as the read orders it, and both new lessons are said with their failure. */
  const kinds = lessons.map((l) => l.split(' · ')[1]);
  assert.ok(kinds.lastIndexOf('method') < (kinds.indexOf('fact') === -1 ? kinds.length : kinds.indexOf('fact')), kinds.join(' '));
  assert.ok(lessons.some((l) => l.includes('Kern the pairs after the spacing is set. · because A session got it wrong on 20 September.')));
  assert.ok((await tools(api).resources(agent)).some((r) => r.uri === 'braindog:learnings'));
  sql.close();
});
