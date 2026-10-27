/**
 * ONE COUNT OF WHAT WAITS: his record said "waiting on the owner 28" on an agent's start card beside "30 open"
 * and "about 28 cards". On the seed, at one version, `boot`'s `counts.decide` and `waits.questions`, the start card's
 * Waiting line and `governance`'s `matched` say one number for each reader, read from `waitingRows`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Boot, type CallContext } from '@braindog/record';

import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 24, 9);

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' }, credentialed: true };
const agent = {
  principal: { kind: 'token', id: 't_count', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'count', cwd: '/Users/studio/Code/kiln-type', host: 'Studio-MacBook-Pro.local', agent: 'claude' },
} as CallContext;

let n = 0;

test('BOOT, THE START CARD AND GOVERNANCE SAY ONE NUMBER OF WHAT WAITS, for the owner and for his agent', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await installSeed(api.kernel);
  const call = async (name: string, args: Record<string, unknown>) => {
    const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, api, { ...agent })) as Reply;
    assert.ok('result' in reply, `${name}: ${JSON.stringify(reply)}`);
    const result = reply.result as { content: { text: string }[]; structuredContent: Record<string, unknown> };
    return { text: result.content.map((c) => c.text).join('\n'), value: result.structuredContent };
  };
  const version = Number(sql.one<{ v: number }>('SELECT MAX(rowid) AS v FROM event')?.v);

  const his = (await api.boot(owner)) as { ok: true; value: Boot };
  const theirs = (await api.boot(agent)) as { ok: true; value: Boot };
  const card = await call('context', {});
  const governance = await call('governance', { status: 'open', limit: 1 });
  /* THE CONTEXT CALL OPENS THE AGENT'S RUN, which is a write; nothing that writes a question ran in between. */
  assert.equal(Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE rowid > ? AND target LIKE 'suggestion:%'", version)?.n), 0);

  /* THE CARD SAYS THIS PROJECT'S BESIDE ALL OF THEM when fewer wait here, and all of them is the count. */
  const waitingLine = /Waiting\s+(?:(\d+) here of )?(\d+) on/u.exec(card.text);
  const onCard = waitingLine ? Number(waitingLine[2]) : 0;
  assert.ok(his.value.counts.decide > 0, 'the seed has questions waiting');
  assert.equal(his.value.counts.decide, his.value.waits.questions, 'boot says one number to the owner');
  /* HIS OWN AGENT IS HELD BACK ONLY FROM WHAT THE INBOX ASKED, of which the seed has none, so both read the same. */
  assert.equal(theirs.value.counts.decide, his.value.counts.decide);
  assert.deepEqual(
    [theirs.value.counts.decide, theirs.value.waits.questions, onCard, governance.value.matched],
    [theirs.value.counts.decide, theirs.value.counts.decide, theirs.value.counts.decide, theirs.value.counts.decide],
    `the agent's numbers: ${card.text.split('\n').find((l) => l.startsWith('Waiting')) ?? 'no Waiting line'}`,
  );
  sql.close();
});
