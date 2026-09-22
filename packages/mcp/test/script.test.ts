/**
 * Authoring a script over MCP (`loop/research-shell-scripts.md` section 7, Brief 6): the grammar an agent reads before
 * it writes one, and the `propose` it files it with.
 *
 * `script_try` IS BUILT, AND NOT HERE AND NOT AS A TOOL. It is `propose` on a script change that carries `"try"`, which
 * the tool layer hands to the surface's `scriptTry`: the record checks the draft and the host runs it in its sandbox,
 * writing nothing and filing nothing. So this package takes no edge to `@braindog/script` for it, and no tool was added,
 * because the smallest one measured 102 tokens against the 3 left under the list's ceiling. Its cases are
 * `script-try.test.ts`; this file holds the grammar, which says how to ask for one (`to_try`), and the plain `propose`,
 * which files a script change with the record's own CALLS OUT line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools } from '../src/index.ts';
import { SCRIPT_GRAMMAR } from '../grammars/script.ts';
import { CEILINGS, DEFAULT_LIMITS, HEAP_BYTES, LOG_BYTES, SOURCE_BYTES } from '../../script/src/index.ts';
import { FLOOR_MS } from '../../kernel/src/pull.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'kiln', agent: 'claude' },
};

const register = (id: string, fields: { id: string; type: string; required?: boolean }[]) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name: id, title: fields[0]!.id, fields } as never,
});

/** A record holding the two registers the grammar's examples write. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const installed = await api.kernel.install([
    register('gold', [{ id: 'at', type: 'text', required: true }, { id: 'price', type: 'int' }]),
    register('transactions', [{ id: 'merchant', type: 'text' }, { id: 'amount', type: 'int' }]),
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { sql, api, mcp: tools(api) };
}

const GOLD = SCRIPT_GRAMMAR.examples[0]!;

test('braindog:grammar/script IS LISTED AND READS, and answers the grammar', async () => {
  const { sql, mcp } = await record();
  const listed = await mcp.resources(agent);
  const entry = listed.find((r) => r.uri === 'braindog:grammar/script');
  assert.ok(entry, `not listed: ${listed.map((r) => r.uri).join(', ')}`);
  assert.equal(entry.ttlMs, 3_600_000);
  const read = await mcp.read('braindog:grammar/script', agent);
  assert.ok(read.ok, JSON.stringify(read));
  assert.deepEqual(read.value, SCRIPT_GRAMMAR);
  sql.close();
});

test('AND IT IS ASKED BEFORE IT IS OFFERED, on the same rung as the other grammars', async () => {
  /* THE OTHER TWO ARE `arrangement`'s, WHICH IS `guard(ctx, 'read')`. `version` is the same guard and is on every
     surface, so a caller the record will not let read is not offered a grammar it would then be refused. */
  const { surface } = stub({ version: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not you.' } }) });
  const mcp = tools(surface);
  assert.equal((await mcp.resources({ who: 'agent' })).some((r) => r.uri === 'braindog:grammar/script'), false);
  assert.equal((await mcp.read('braindog:grammar/script', { who: 'agent' })).ok, false);
});

test('ITS NUMBERS ARE THE ONES THE SANDBOX AND THE KERNEL HOLD, because they are copies', () => {
  assert.deepEqual(SCRIPT_GRAMMAR.limits.most, CEILINGS);
  assert.deepEqual(SCRIPT_GRAMMAR.limits.default, DEFAULT_LIMITS);
  assert.equal(SCRIPT_GRAMMAR.limits.source, `${SOURCE_BYTES / 1024} KB`);
  assert.equal(SCRIPT_GRAMMAR.limits.memory, `${HEAP_BYTES / 1024 / 1024} MB`);
  assert.match(SCRIPT_GRAMMAR.ctx['log(...parts)'], new RegExp(`${LOG_BYTES / 1024} KB`));
  assert.match(SCRIPT_GRAMMAR.body.runs, new RegExp(`every ${FLOOR_MS / 60_000}m`));
});

test('ITS HEADER IS THE ONE THE KERNEL READS, and both examples install', async () => {
  const { sql, api } = await record();
  /* THE KERNEL'S OWN LIST, READ OUT OF ITS REFUSAL, because `scriptBody`'s header is not exported and a key the grammar
     teaches that the kernel refuses is a key every agent would send once. */
  const stray = await api.kernel.install([{ ...GOLD, body: { ...GOLD.body, network: 'none' } } as never]);
  assert.equal(stray.ok, false);
  const fix = (stray as { refusal: { fix: string } }).refusal.fix;
  const header = /a script's header is ([a-z, ]+)\./.exec(fix)?.[1]?.split(', ') ?? assert.fail(fix);
  assert.deepEqual(Object.keys(SCRIPT_GRAMMAR.body).sort(), [...header].sort());

  for (const example of SCRIPT_GRAMMAR.examples) {
    const out = await api.kernel.install([example as never]);
    assert.ok(out.ok, `${example.id}: ${JSON.stringify(out)}`);
  }
  sql.close();
});

test('A SCRIPT FILED THROUGH propose CARRIES THE RECORD\'S OWN CALLS OUT LINE, and waits for its key', async () => {
  /* BRIEF 6 SAID THIS WOULD BE RED, and it was green before this file: the change shape takes any declaration with an id,
     a kind and a body (`govern.ts` `shapeFault`), and `script-egress.test.ts` in the kernel already reads a script's
     egress into the approval lines. So this holds it over the wire an agent uses, with a proposer that tries to
     write its own friendlier line. */
  const { sql, api, mcp } = await record();
  const filed = await mcp.call(
    'propose',
    {
      question: 'Fetch the gold price every hour?',
      body_kind: 'change',
      body: { declaration_id: GOLD.id, to: GOLD, egress: [{ line: 'CALLS OUT nowhere' }], approve: ['nothing at all'] },
    },
    agent,
  );
  assert.ok(filed.ok, JSON.stringify(filed));
  const id = (filed.value as { id: string }).id;
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as {
    egress: { line: string }[];
    approve: string[];
  };
  assert.deepEqual(body.egress.map((e) => e.line), ['CALLS OUT api.goldapi.io · every 1h · key "goldapi"']);
  assert.ok(!JSON.stringify(body).includes('nothing at all'), 'the proposer wrote its own approval line');

  const accepted = (await api.decide({ id, decide: { option: 'accept', reason: 'it is useful' } }, owner)) as {
    ok: boolean;
    refusal?: { code: string; fix: string };
  };
  assert.equal(accepted.ok, false);
  assert.equal(accepted.refusal?.code, 'REQUIRED_MISSING');
  assert.match(accepted.refusal?.fix ?? '', /"goldapi"/);
  sql.close();
});
