/**
 * `instructions {answer}` (D8): a question his order named, answered through the door as the record's
 * `instructionsMine` answers it, and said in the record's own line. The trust boundary is the record's
 * (`packages/record/test/instructions-answer.test.ts`); this holds that the door hands the call on whole and says it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, type Reply } from '../src/rpc.ts';
import { stub, type Ctx } from './stub.ts';

const ctx: Ctx = { who: 'agent' };

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

test('instructions {answer} reaches instructionsMine with the question, and says the line the record answered', async () => {
  const said = "Answered SG243 with accept, on Teodor's order (IN4).";
  const { surface, calls } = stub(
    {
      instructionsMine: (async (args: unknown) => {
        calls.push({ method: 'instructionsMine', args, ctx });
        return {
          ok: true,
          value: {
            run: 'S1',
            stamp: 's1',
            pending: [],
            stop: null,
            lines: ['Nothing new for you.'],
            instruction: { id: 'IN4', state: 'working', said: 'accept SG243' },
            answered: { question: 'SG243', option: 'accept', decision: 'D9', said },
          },
        };
      }) as never,
    },
    { agents: true },
  );
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'instructions', arguments: { answer: 'SG243' } } }, surface, ctx)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const r = reply.result as ToolResult;
  assert.notEqual(r.isError, true, r.content[0]?.text);
  assert.deepEqual(calls.find((c) => c.method === 'instructionsMine')?.args, { answer: 'SG243' });
  assert.equal(r.content[0]?.text.split('\n')[0], said);
});
