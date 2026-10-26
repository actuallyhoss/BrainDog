/**
 * An agent's option that says a change carries the change, so picking it performs it.
 *
 * WHAT WAS MEASURED BEFORE THIS. An agent asked whether to close six stale tasks, with "Close all six" and "Keep them
 * open" as words only. The owner picked the first, the decision was kept, and the six stayed open: a pick writes its
 * option's `patches` and nothing else, and the agent that asked had ended. Now an agent's option that starts with a
 * change and carries none is refused when it is filed, and one that carries them closes the tasks at the press.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import type { Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 6);

const CHORES: Declaration = {
  id: 'register.chores',
  kind: 'register',
  body: {
    id: 'chores',
    name: 'Chores',
    title: 'chore',
    state: 'state',
    done: ['done', 'dropped'],
    fields: [
      { id: 'chore', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done', 'dropped'], default: 'open', required: true },
    ],
  } as never,
};

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};
const refusal = (out: { ok: boolean }) => {
  assert.equal(out.ok, false, 'this was supposed to be refused');
  return (out as unknown as { refusal: { code: string; fix: string; at?: string } }).refusal;
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([CHORES]));
  for (const chore of ['Water the ferns', 'Return the drill']) value(k.create('chores', { chore }, { actor: 'p_owner' }));
  return k;
}

const asking = (close: Record<string, unknown>) => ({
  question: 'Two chores have not moved in a month. Close them?',
  body_kind: 'options' as const,
  body: { options: [{ id: 'close', label: 'Close both', because: 'Neither has moved since last month.', ...close }, { id: 'keep', label: 'Keep them open', because: 'Both still need doing.' }] },
});

test('AN AGENT OPTION THAT SAYS A CHANGE AND CARRIES NONE IS REFUSED, naming the option and the way to carry it', async () => {
  const k = await record();
  const no = refusal(k.propose(asking({}), 'S1'));
  assert.equal(no.code, 'REQUIRED_MISSING');
  assert.equal(no.at, 'body.options[0].patches');
  assert.match(no.fix, /^"Close both" says a change, and picking it would write nothing\./u);
  assert.match(no.fix, /patches/u);
  assert.match(no.fix, /rowset/u);
});

test('CARRYING ITS CHANGES, THE PICK PERFORMS THEM: both chores are closed at the press', async () => {
  const k = await record();
  const patches = [1, 2].map((n) => ({ at: `chores#${n}`, version: 1, patch: { state: 'done' } }));
  const filed = value<Filed>(k.propose(asking({ patches }), 'S1'));
  const out = value<{ wrote: string[] }>(k.decide(filed.id, { decide: { option: 'close', reason: 'Yes, close them.' } }, 'p_owner'));
  assert.equal(out.wrote.length, 2);
  assert.deepEqual([k.get('chores#1')?.state, k.get('chores#2')?.state], ['done', 'done']);
});

test('AN OPTION OF WORDS ONLY THAT CHANGES NOTHING IS STILL ASKED, and so is a rule\'s', async () => {
  const k = await record();
  value(
    k.propose(
      { question: 'Which chore first?', body_kind: 'options', body: { options: [{ id: 'a', label: 'The ferns', because: 'They wilt.' }, { id: 'b', label: 'The drill', because: 'It is borrowed.' }] } },
      'S1',
    ),
  );
  value(k.propose(asking({}), 'rule:chores-stale'));
});
