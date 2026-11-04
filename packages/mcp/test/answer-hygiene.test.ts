/**
 * Every brief answer on the seeded record, read for what a person should never be shown.
 *
 * WHAT A BRIEF ANSWER IS FOR. The text of a tool result is what a model reads first and what it quotes to the person,
 * so it says each thing by name: a row is its words and its handle (`tasks#3`), a person is their name, a run is `S6`.
 * Three things kept leaking into it before the answers were brief, and each is a test here:
 * - a row id (a ULID), which says nothing to anyone and is what a model then pastes back into a sentence;
 * - a person's or a token's id (`p_seed`, `t_1`), which is the system's name for someone, never theirs;
 * - a `null`, which is a value nobody filled said as a word, along with its cousins `undefined` and `NaN`.
 *
 * THE SWEEP READS ITS LISTS AND TOOLS OFF THE RECORD AND `TOOLS`, so a list the seed grows or a tool added later is
 * read the day it lands: every list is listed whole, every tool is called, and a tool with no call below fails the
 * first assertion. The whole answer beside the text is held to the second rule of the envelope: no key is null.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { TOOLS, withCalls } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 9);

/** An agent on the owner's behalf, in the Kiln checkout on a MacBook, as a host builds the context for one. */
const agent = {
  principal: { kind: 'token', id: 't_hygiene', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'hygiene', cwd: '/Users/studio/Code/kiln-type', host: 'Studio-MacBook-Pro.local', agent: 'claude' },
} as CallContext;

/** What a brief answer may never carry, each with what it is. */
const NEVER: readonly [RegExp, string][] = [
  [/\b[0-9A-HJKMNP-TV-Z]{26}\b/u, 'a row id'],
  [/\b[pt]_[A-Za-z0-9]+/u, "a person's or a token's id"],
  [/\bnull\b/u, 'a null'],
  [/\bundefined\b/u, 'an undefined'],
  [/\bNaN\b/u, 'a NaN'],
  [/\[object Object\]/u, 'an object said as a string'],
];

/** Every key in a value whose value is null, as a path. Inside an array a null keeps its place, so only keys count. */
function nullKeys(value: unknown, at = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => nullKeys(v, `${at}[${String(i)}]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => (v === null ? [`${at}.${k}`] : nullKeys(v, `${at}.${k}`)));
}

let n = 0;

test('NO BRIEF ANSWER CARRIES A ROW ID, A PERSON OR TOKEN ID, OR A NULL, over every tool and every list on the seed', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await installSeed(api.kernel);
  /* AS A HOST HANDS THE RECORD TO THE DOOR, so `act` answers; `undoOwn`, the row a receipt names, is enough to sweep it. */
  const door = withCalls(api, async () => ({ ok: true, value: [] }) as never, () => [{ name: 'undoOwn', group: 'DATA', writes: true, what: 'Take back one of your own writes.' }]);
  const found: string[] = [];
  const answered = new Set<string>();

  const call = async (name: string, args: Record<string, unknown>) => {
    const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, door, { ...agent })) as Reply;
    assert.ok('result' in reply, `${name}: ${JSON.stringify(reply)}`);
    const result = reply.result as { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
    const text = result.content.map((c) => c.text).join('\n');
    const where = `${name} ${JSON.stringify(args)}`;
    /* A RECEIPT'S LINE CARRIES THE BATCH, the one opaque handle `undo` takes; what it says changed is held to the rules above it. */
    const said = text.split('\n').filter((l) => !l.startsWith('Receipt: ')).join('\n');
    for (const [pattern, what] of NEVER) {
      const hit = pattern.exec(said);
      if (hit) found.push(`${where} said ${what}, "${hit[0]}", in: ${said.slice(Math.max(0, hit.index - 60), hit.index + 60)}`);
    }
    for (const path of nullKeys(result.structuredContent)) found.push(`${where} answered a null at ${path}`);
    answered.add(name);
    return { error: result.isError === true, text, value: result.structuredContent };
  };

  /* THE RUN FIRST, so the briefing has a handoff of this session's to leave out and another's to show. */
  await call('handoff', { doing: 'Reading every brief answer', next: 'Report what each one says.' });
  await call('context', {});
  /* WHAT HE TOLD THE RUN, which on the seed is nothing yet, and a take of one that is not there. */
  await call('instructions', {});
  await call('instructions', { take: 'IN999' });
  const index = await call('record_index', {});
  const registers = (index.value.registers as { id: string }[]).map((r) => r.id);
  assert.ok(registers.length > 10, `the seed has ${String(registers.length)} lists`);

  /* EVERY LIST, WHOLE, AND ITS DECLARATION. A list's lines are where a ref the brief could not name would show its id. */
  for (const register of registers) {
    await call('list', { register, limit: 100 });
    await call('schema', { register });
  }

  /* ONE ROW OF EVERY LIST, BY ITS HANDLE, and its history: a row whole says every field, a sealed one among them. */
  for (const register of registers) {
    const first = await call('list', { register, limit: 1 });
    const row = (first.value.rows as { spoken?: string }[])[0];
    if (row?.spoken === undefined) continue;
    await call('get', { spoken: row.spoken });
    await call('history', { spoken: row.spoken });
    await call('get', { spoken: row.spoken, history: true });
  }

  /* EVERY FIGURE THAT READS WITHOUT A PARAMETER, and a grouped one's groups are named, never keyed by a row id. */
  for (const figure of index.value.figures as string[]) if (!figure.includes(':')) await call('get', { spoken: figure });

  await call('search', { q: 'kiln' });
  await call('activity', {});
  await call('activity', { everything: true, limit: 100 });
  for (const args of [{}, { status: 'all', limit: 100 }, { register: 'decision' }, { register: 'prediction' }, { id: 'SG1' }, { id: 'D1' }])
    await call('governance', args);

  /* THE WRITES, each answered with what it wrote, and the refusals, each with its fix and the call that corrects it. */
  const made = await call('create', { register: 'tasks', fields: { what: 'Read the brief answers', thing: 'things#1', priority: 'high' } });
  assert.equal(made.error, false, made.text);
  const spoken = String(made.value.spoken);
  const version = Number(made.value.version);
  await call('update', { spoken, patch: { state: 'doing' }, version });
  await call('update', { spoken, patch: { state: 'done' }, version });
  const noted = await call('log', { spoken, note: 'Every answer was read.' });
  /* AND THE WAY BACK: the batch the receipt gave is looked at, then taken, and one that is not a batch is refused in a sentence. */
  const batch = /call act with call "undoOwn" and args \{"batch": "([^"]+)"\}/u.exec(noted.text)?.[1];
  assert.ok(batch !== undefined, `the note's receipt gave no batch: ${noted.text}`);
  await call('act', { call: 'undoOwn', args: { batch, dry: true } });
  await call('act', { call: 'undoOwn', args: { batch } });
  await call('act', { call: 'undoOwn', args: { batch: 'no-such-batch' } });
  /* AND BY ITS OLD NAME, which a session that cached the older list still sends. */
  await call('undo', { batch: 'no-such-batch' });
  /* WHAT THE RECORD WOULD LINK, A RESOURCE NOW: its `said` is read with the same eyes as a tool's text. */
  const understood = (await handle({ jsonrpc: '2.0', id: ++n, method: 'resources/read', params: { uri: 'braindog:understand' } }, api, { ...agent })) as Reply;
  assert.ok('result' in understood, JSON.stringify(understood));
  const plan = (understood.result as { contents: { text: string }[] }).contents[0]?.text ?? '';
  for (const [pattern, what] of NEVER) {
    const hit = pattern.exec(plan);
    if (hit) found.push(`braindog:understand said ${what}, "${hit[0]}"`);
  }
  await call('meet', { name: 'Ada Lovelace', where: 'commit 4464966 in kiln-type' });
  await call('propose', {
    question: 'Keep the brief answers?',
    body_kind: 'options',
    body: { options: [{ id: 'keep', label: 'Keep them', because: 'They read well.' }, { id: 'drop', label: 'Drop them', because: 'They do not.' }] },
  });
  await call('triage', { arrival: 'arr_none', ignore: true });
  for (const [name, args] of [
    ['get', { spoken: 'tasks#999' }],
    ['get', { spoken: 'cash' }],
    ['list', { register: 'projects' }],
    ['list', { register: 'tasks', where: { field: 'stat', is: 'open' } }],
    ['create', { register: 'tasks', fields: { what: 'x', state: 'opened' } }],
  ] as const)
    await call(name, args);

  assert.deepEqual(TOOLS.map((t) => t.name).filter((name) => !answered.has(name)), [], 'a tool was not swept');
  assert.deepEqual(found, [], 'a brief answer carried what a person should never be shown');
  sql.close();
});

test('AND format full IS THE WHOLE ANSWER AS JSON, the same value structuredContent carries', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await installSeed(api.kernel);
  const reply = (await handle(
    { jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'list', arguments: { register: 'tasks', limit: 3, format: 'full' } } },
    api,
    { ...agent },
  )) as Reply;
  assert.ok('result' in reply);
  const result = reply.result as { content: { text: string }[]; structuredContent: unknown };
  assert.deepEqual(JSON.parse(result.content[0]!.text), result.structuredContent);
  sql.close();
});
