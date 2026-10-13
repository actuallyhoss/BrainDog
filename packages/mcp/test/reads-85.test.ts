/**
 * The four reads an agent asks where it stands, at the agent door (ENG-B12, ENG-B13, ENG-B02, AGT-C18 job d):
 * `braindog:briefing` is what matters, `braindog:exceptions` what stopped, `braindog:about/<name>` what one thing is,
 * and `braindog:stale` what went stale here with the one call that clears each.
 *
 * EACH IS THE RECORD'S OWN METHOD, so the permission ladder is the record's. The door passes on only the words and the
 * handles a tool takes: a row's id, the cause a card is kept by, the moment it was worked out and its basis stay behind.
 *
 * `about` IS A RESOURCE AND NOT A SEVENTEENTH TOOL: the tool list is in every turn and `budget.test.ts` holds it to a
 * ceiling it is one token under, so the read is an address, listed as `braindog:about` and asked as `about/<name>`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { TOOLS, tools, ttlOf, type McpSurface } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
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

/** What a record answers each read with, ids and moments and all, as the door receives it. */
const BRIEFING = {
  cards: [
    { h: 'Late', line: 'The printer invoice was due on 9 October.', row: 'bills#4', cause: `quiet:list:${ROW}`, by: 'rule' },
    { h: 'Stopped', line: 'Nothing new has reached Sales for four days.', row: '', cause: null, by: 'rule' },
  ],
  at: '2026-10-14T08:00:00.000Z',
  basis: 'c0ffee',
};
const EXCEPTIONS = {
  exceptions: [
    { kind: 'list', subject: 'Sales', said: 'Nothing new has reached Sales for four days. The last was on 10 October.', since: '10 October', row: { name: 'Order 41', id: 'sales#41' }, cause: `quiet:list:${ROW}`, id: ROW },
    { kind: 'schedule', subject: 'Bank feed', said: 'Bank feed runs every day and has not run since 11 October.', since: '11 October', row: null },
  ],
};
const STALE = {
  stale: [
    { kind: 'steps', said: 'One step was left earlier and nobody took it: Kern the lowercase pairs.', count: 1, clear: 'handoff {"drop":"S7"}', id: ROW, at: '2026-09-01T10:00:00.000Z' },
    { kind: 'questions', said: 'One question of yours has been open for 15 days: Retire the old price list?', count: 1, clear: { tool: 'propose', args: { withdraw: 'SG12' } } },
    { kind: 'runs', said: '41 runs ended over 30 days ago and wrote nothing.', count: 41, clear: 'propose {"kind":"options","cause":"tidy#runs-empty"}' },
  ],
};

/** A surface that answers the four reads, on top of `stub`'s. `stub` types them through the surface. */
const answering = (over: Partial<McpSurface<Ctx>> = {}) => {
  const asked: { method: string; args: unknown }[] = [];
  const say = (method: string, value: unknown) => async (args: unknown) => {
    asked.push({ method, args });
    return { ok: true as const, value };
  };
  const made = stub({
    briefing: say('briefing', BRIEFING),
    exceptions: say('exceptions', EXCEPTIONS),
    stale: say('stale', STALE),
    about: say('about', { is: { kind: 'project', name: 'North Bank' }, candidates: [] }),
    ...over,
  });
  return { ...made, asked };
};

test('THE LIST HOLDS THE FOUR READS, and about stays an address because a seventeenth tool cannot be paid for', async () => {
  const { surface } = answering();
  const listed = await tools(surface).resources(who);
  for (const uri of ['braindog:briefing', 'braindog:exceptions', 'braindog:stale', 'braindog:about'])
    assert.ok(listed.some((r) => r.uri === uri), `${uri} is not listed`);
  /* PLAIN AND SHORT, and the one about a name says how the name is written. */
  for (const r of listed.filter((x) => ['briefing', 'exceptions', 'stale', 'about'].includes(x.name))) {
    assert.ok(r.description.length <= 140, `${r.name} is described in ${r.description.length} characters`);
    assert.doesNotMatch(r.description, /\b(?:row|rows|entity|register)\b|—/iu);
  }
  assert.match(listed.find((r) => r.uri === 'braindog:about')?.description ?? '', /about\/<name>/u);
  /* What stands is asked every time: a step dropped a moment ago is not stale any more. */
  assert.equal(ttlOf('braindog:stale'), 0);

  assert.equal(TOOLS.length, 16);
  assert.ok(!TOOLS.some((t) => t.name === 'about'));
  /* A CALL TO IT AS A TOOL IS TOLD THE ADDRESS, never the nearest tool. */
  const called = (await tools(surface).call('about', { name: 'North Bank' }, who)) as Refused;
  assert.equal(called.ok, false);
  assert.match(called.refusal?.fix ?? '', /braindog:about\/<name>/u);
});

test('EACH ANSWERS THROUGH THE RECORD OWN METHOD, with no id and no raw moment in what an agent reads', async () => {
  const { surface, asked } = answering();
  const mcp = tools(surface);

  const briefing = valueOf<{ cards: Record<string, unknown>[] }>(await mcp.read('braindog:briefing', who));
  assert.deepEqual(briefing, {
    cards: [
      { h: 'Late', line: 'The printer invoice was due on 9 October.', row: 'bills#4' },
      { h: 'Stopped', line: 'Nothing new has reached Sales for four days.' },
    ],
  });

  const stopped = valueOf<{ exceptions: Record<string, unknown>[] }>(await mcp.read('braindog:exceptions', who));
  assert.deepEqual(stopped.exceptions[0], { kind: 'list', subject: 'Sales', said: EXCEPTIONS.exceptions[0]!.said, since: '10 October', row: { name: 'Order 41', id: 'sales#41' } });
  assert.deepEqual(Object.keys(stopped.exceptions[1]!), ['kind', 'subject', 'said', 'since']);

  const about = valueOf<{ is: { name: string } }>(await mcp.read('braindog:about/North%20Bank', who));
  assert.equal(about.is.name, 'North Bank');
  /* THE BARE ADDRESS SAYS HOW TO ASK, and asks the record nothing about anybody. */
  const how = valueOf<{ read: string }>(await mcp.read('braindog:about', who));
  assert.equal(how.read, 'braindog:about/<name>');

  const stale = valueOf<{ stale: unknown[] }>(await mcp.read('braindog:stale', who));
  for (const said of [briefing, stopped, about, how, stale]) {
    assert.doesNotMatch(JSON.stringify(said), ID);
    assert.doesNotMatch(JSON.stringify(said), MOMENT);
  }
  assert.deepEqual(
    asked.map((a) => [a.method, a.args]),
    [['briefing', {}], ['exceptions', {}], ['about', { name: 'North Bank' }], ['stale', {}]],
  );
});

test('A STALE LINE CARRIES THE ONE CALL THAT CLEARS IT, written out to copy', async () => {
  const { surface } = answering();
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'braindog:stale' } }, surface, who)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const read = JSON.parse((reply.result as { contents: { text: string }[] }).contents[0]?.text ?? '') as { stale: { kind: string; said: string; count: number; clear: string }[] };
  assert.deepEqual(read.stale.map((l) => Object.keys(l)), [['kind', 'said', 'count', 'clear'], ['kind', 'said', 'count', 'clear'], ['kind', 'said', 'count', 'clear']]);
  assert.deepEqual(read.stale.map((l) => l.clear), ['handoff {"drop":"S7"}', 'propose {"withdraw":"SG12"}', 'propose {"kind":"options","cause":"tidy#runs-empty"}']);
  assert.deepEqual(read.stale.map((l) => l.count), [1, 1, 41]);

  /* THE LINES ALONE, AS A RECORD MAY ANSWER THEM, read the same; a line with no words or no call is not passed on. */
  const lines = answering({ stale: async () => ({ ok: true, value: [STALE.stale[0], { kind: 'runs', count: 2 }, { said: 'Two things.', count: 2 }] }) });
  const bare = valueOf<{ stale: { clear: string }[] }>(await tools(lines.surface).read('braindog:stale', who));
  assert.deepEqual(bare.stale.map((l) => l.clear), ['handoff {"drop":"S7"}']);
  /* NOTHING STALE IS SAID, never an empty answer an agent has to interpret. */
  const none = answering({ stale: async () => ({ ok: true, value: { stale: [] } }) });
  assert.deepEqual(valueOf(await tools(none.surface).read('braindog:stale', who)), { stale: [], said: 'Nothing is stale where you stand.' });
});

test('A RECORD WHOSE BUILD LACKS THE READ SAYS SO IN ONE LINE, lists no address for it, and does not throw', async () => {
  const { surface } = stub();
  const mcp = tools(surface);
  const listed = await mcp.resources(who);
  for (const path of ['briefing', 'exceptions', 'stale', 'about']) {
    assert.ok(!listed.some((r) => r.uri === `braindog:${path}`), `braindog:${path} is listed on a record that cannot answer it`);
    const none = (await mcp.read(`braindog:${path}`, who)) as Refused;
    assert.equal(none.ok, false);
    assert.equal(none.refusal?.code, 'NOT_IN_THIS_BUILD');
    const fix = none.refusal?.fix ?? '';
    assert.ok(!fix.includes('\n') && fix.length <= 200, `${path}: ${fix}`);
    assert.doesNotMatch(fix, /—/u);
  }
  /* A REFUSAL IS THE RECORD'S, IN ITS WORDS, and an answer of no shape is an empty one. */
  const refusing = answering({ briefing: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'This key cannot read that.' } }), exceptions: async () => ({ ok: true, value: { rows: [] } }) });
  const no = (await tools(refusing.surface).read('braindog:briefing', who)) as Refused;
  assert.equal(no.refusal?.fix, 'This key cannot read that.');
  assert.deepEqual(valueOf(await tools(refusing.surface).read('braindog:exceptions', who)), { exceptions: [] });
});

test('ON A REAL RECORD an agent reads what matters and what stopped, and what is stale once the record answers it', async (t) => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 14, 12)) });
  valueOf(await api.createRecord({ id: `rec_${ROW}`, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } }));
  const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' } };
  const read = async (uri: string) => {
    const reply = (await handle({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri } }, api, agent)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    const text = (reply.result as { contents: { text: string }[] }).contents[0]?.text ?? '';
    assert.doesNotMatch(text, ID, uri);
    assert.doesNotMatch(text, MOMENT, uri);
    return JSON.parse(text) as Record<string, unknown>;
  };
  assert.ok(Array.isArray((await read('braindog:briefing')).cards));
  assert.deepEqual(await read('braindog:exceptions'), { exceptions: [] });
  const listed = (await tools(api).resources(agent)).map((r) => r.uri);
  for (const uri of ['braindog:briefing', 'braindog:exceptions', 'braindog:about']) assert.ok(listed.includes(uri), `${uri} is not listed`);

  if (typeof (api as { stale?: unknown }).stale !== 'function') {
    sql.close();
    return t.skip('this tree has no record method `stale` yet (stale-read-85 and registry-wire-85 land it)');
  }
  /* A FRESH RECORD HAS NOTHING STALE, and says so. */
  const stale = await read('braindog:stale');
  assert.deepEqual(stale.stale, []);
  assert.ok(listed.includes('braindog:stale'));

  /* AND A QUESTION THAT WAITED FIFTEEN DAYS IS SAID TO ITS OWNER THROUGH THE DOOR, with the call that clears it: the
     record's own answer (`{ lines, count }`), read by the door and not a stand-in for it. */
  sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SGQ9001', 'options', '{}', 'open', 'p_1', ?)", new Date(Date.UTC(2026, 8, 29, 12)).toISOString());
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
  const reply = (await handle({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'braindog:stale' } }, api, owner)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const told = JSON.parse((reply.result as { contents: { text: string }[] }).contents[0]?.text ?? '') as { stale: { kind: string; said: string; count: number; clear: string }[] };
  assert.equal(told.stale.length, 1, JSON.stringify(told));
  assert.equal(told.stale[0]?.kind, 'questions');
  assert.equal(told.stale[0]?.count, 1);
  assert.match(told.stale[0]?.said ?? '', /^1 question has waited 15 days/u);
  assert.match(told.stale[0]?.clear ?? '', /^decide with id /u);
  sql.close();
});
