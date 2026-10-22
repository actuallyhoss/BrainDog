/**
 * A Codex job (`runner.ts`): what `codex exec` is started with, and how its `--json` stream is read into the lines a
 * person reads in the job's transcript.
 *
 * WHAT IS HELD: the sandbox follows the kind's permission and is never the whole machine; his own servers are replaced
 * by the record's door alone, its tools held to the kind's record tools; the job's bearer is named by a variable and
 * never written into an argument; the stream's start names the session, each command and record call is one numbered
 * tool line with its result folded onto it, a proposal it filed is kept, the last message is the result, a failed turn
 * is an error, and a line type this runner does not read is said once.
 *
 * THE STREAM IS AS CODEX'S DOCUMENTS DESCRIBE IT: no Codex was installed where this was written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseToml } from '../src/clients/codex.ts';
import { codexFlags, distilCodex, freshStream, JOB_BEARER_VAR, type Line } from '../src/runner.ts';

const MCP = 'https://brain.dog/mcp';
const kind = { tools: ['Read', 'Grep', 'mcp__braindog__context', 'mcp__braindog__propose'], permission: 'dontAsk' as const };

/** The TOML a `-c` says after its first `=`, read as Codex reads it. */
const override = (flags: string[], key: string): unknown => {
  const said = flags.filter((_, i) => flags[i - 1] === '-c').find((f) => f.startsWith(`${key}=`));
  assert.ok(said !== undefined, `no -c ${key}`);
  return parseToml(`${key} = ${said.slice(key.length + 1)}\n`).data[key];
};

test('CODEX RUNS IN THE SANDBOX THE KIND ASKS FOR, with the record as its one server and the kind’s tools on it', () => {
  const read = codexFlags(kind, MCP);
  assert.deepEqual(read.slice(0, 5), ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only']);
  assert.equal(read.at(-1), '-', 'the prompt comes on standard input');
  assert.equal(codexFlags({ ...kind, permission: 'acceptEdits' }, MCP)[4], 'workspace-write');
  assert.ok(!read.some((f) => f.includes('danger-full-access') || f.includes('bypass')), 'never the whole machine');
  assert.equal(override(read, 'approval_policy'), 'never');
  /* HIS OWN SERVERS ARE REPLACED, NOT JOINED: one table, the record's door. */
  const servers = override(read, 'mcp_servers') as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(servers), ['braindog']);
  assert.deepEqual(servers.braindog, {
    url: MCP,
    bearer_token_env_var: JOB_BEARER_VAR,
    http_headers: { 'x-braindog-agent': 'codex' },
    enabled_tools: ['context', 'propose'],
  });
});

test('THE JOB’S BEARER IS NEVER AN ARGUMENT: Codex is told the variable that holds it', () => {
  const flags = codexFlags(kind, MCP);
  assert.ok(!flags.some((f) => /bd_|Bearer/u.test(f)));
  assert.equal(JOB_BEARER_VAR, 'BRAINDOG_JOB_BEARER');
});

/** Every line a stream of Codex events comes to, read in order into one stream. */
const read = (events: unknown[]) => {
  const s = freshStream();
  const lines: Line[] = [];
  for (const e of events) lines.push(...distilCodex(JSON.stringify(e), s));
  return { s, lines };
};

test('A CODEX RUN READS AS THE TRANSCRIPT A PERSON READS: its start, each call with its result, what it said, and its end', () => {
  const { s, lines } = read([
    { type: 'thread.started', thread_id: '0199a213-81c0-7800-8aa1-bbab2a035a53' },
    { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'item_0', type: 'reasoning', text: 'Read the log first.' } },
    { type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'git log --oneline -5', aggregated_output: '', exit_code: null, status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: 'git log --oneline -5', aggregated_output: 'a1 Fix\n', exit_code: 0, status: 'completed' } },
    { type: 'item.started', item: { id: 'item_2', type: 'mcp_tool_call', server: 'braindog', tool: 'propose', arguments: { title: 'Notes' }, status: 'in_progress' } },
    {
      type: 'item.completed',
      item: { id: 'item_2', type: 'mcp_tool_call', server: 'braindog', tool: 'propose', status: 'completed', result: { content: [{ type: 'text', text: '{"id":"P12","decide":"https://brain.dog/app/acme/decide/P12"}' }] } },
    },
    { type: 'item.completed', item: { id: 'item_3', type: 'agent_message', text: 'Proposed the notes as P12.' } },
    { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 } },
  ]);
  assert.deepEqual(
    lines.map((l) => [l.kind, l.body.call ?? null]),
    [
      ['start', null],
      ['think', null],
      ['tool', 1],
      ['out', 1],
      ['tool', 2],
      ['out', 2],
      ['say', null],
    ],
  );
  assert.equal(lines[2]!.body.name, 'Bash');
  assert.equal(lines[4]!.body.name, 'mcp__braindog__propose');
  assert.equal(s.session, '0199a213-81c0-7800-8aa1-bbab2a035a53');
  assert.deepEqual(s.filed, [{ id: 'P12', decide: 'https://brain.dog/app/acme/decide/P12' }]);
  assert.deepEqual([s.result?.subtype, s.result?.result, s.result?.num_turns], ['success', 'Proposed the notes as P12.', 2]);
});

test('A COMMAND THAT FAILED IS AN ERROR ON ITS LINE, A FAILED TURN ENDS AS ONE, and an unknown line is said once', () => {
  const { s, lines } = read([
    { type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: 'false', aggregated_output: '', exit_code: 1, status: 'failed' } },
    { type: 'item.completed', item: { id: 'item_2', type: 'todo_list', items: [] } },
    { type: 'item.completed', item: { id: 'item_3', type: 'todo_list', items: [] } },
    { type: 'thread.forked' },
    { type: 'turn.failed', error: { message: 'The model is overloaded.' } },
  ]);
  assert.deepEqual(lines[1]!.body, { call: 1, text: '', len: 0, error: true }, 'the result of the call it folds onto');
  assert.equal(lines.filter((l) => l.kind === 'note').length, 2, 'each unknown type once');
  assert.deepEqual([s.result?.subtype, s.result?.is_error, s.result?.result], ['error', true, 'The model is overloaded.']);
  assert.deepEqual(distilCodex('not json', freshStream()), []);
});
