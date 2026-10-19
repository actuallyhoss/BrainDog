/**
 * The abuse table (`abuse.ts`): the plain line a person reads on a 429, the 413 line, and that every rule says why.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ABUSE, BODY_MOST, MCP_PER_MINUTE, tooLargeLine, tooManyLine } from '../src/abuse.ts';
import { bindingLimiter, refusedFor } from '../src/limits.ts';

test('THE 429 LINE NAMES THE WAIT IN WHOLE SECONDS, AND "1 SECOND" WHEN IT IS ONE', () => {
  assert.equal(tooManyLine(30), 'Too many requests just now. Try again in 30 seconds.');
  assert.equal(tooManyLine(0.2), 'Too many requests just now. Try again in 1 second.');
  assert.equal(tooManyLine(Number.NaN), 'Too many requests just now. Try again in 60 seconds.');
});

test('THE REFUSAL EVERY DOOR SENDS CARRIES retry_after, THE HEADER AND THE SAME LINE', async () => {
  const out = refusedFor(42);
  assert.equal(out.status, 429);
  assert.equal(out.headers.get('retry-after'), '42');
  const body = (await out.json()) as { refusal: { code: string; fix: string; retry_after: number } };
  assert.equal(body.refusal.code, 'RATE_LIMITED');
  assert.equal(body.refusal.retry_after, 42);
  assert.equal(body.refusal.fix, tooManyLine(42));
});

test('EVERY RULE HAS A POSITIVE LIMIT, A WINDOW AND A REASON, AND NO READABLE TEXT HAS A DASH', () => {
  for (const [name, rule] of Object.entries(ABUSE)) {
    assert.ok(rule.most > 0 && rule.seconds > 0, name);
    assert.ok(rule.why.length > 10, `${name} says why`);
    assert.doesNotMatch(rule.why, /[–—]/u, name);
  }
  for (const [name, cap] of Object.entries(BODY_MOST)) assert.ok(cap.bytes > 0 && cap.why.length > 10, name);
  assert.doesNotMatch(tooLargeLine(2048), /[–—]/u);
});

test('THE 413 LINE NAMES THE CEILING IN KB OR MB', () => {
  assert.equal(tooLargeLine(2_048), 'That request is too large. The most this door takes is 2 KB.');
  assert.equal(tooLargeLine(16 * 1_048_576), 'That request is too large. The most this door takes is 16 MB.');
});

test('/mcp SPENDS RL_MCP WHEN IT IS BOUND AND RL_READ WHEN IT IS NOT, AT 300 A MINUTE', async () => {
  const asked: string[] = [];
  const binding = (name: string) => ({ limit: async () => (asked.push(name), { success: true }) });
  await bindingLimiter({ read: binding('RL_READ') }).limit('token:t_1', 'mcp');
  await bindingLimiter({ read: binding('RL_READ'), mcp: binding('RL_MCP') }).limit('token:t_1', 'mcp');
  assert.deepEqual(asked, ['RL_READ', 'RL_MCP']);
  assert.equal(MCP_PER_MINUTE, 300);
});

test('THE OWNER’S OWN AGENT IS FAR UNDER THE PER-RECORD ROWS', () => {
  assert.ok(ABUSE.slashDay.most >= 100, 'a day of asks by hand never reaches it');
  assert.ok(ABUSE.uploadDay.most >= 100 * 1_048_576, 'fifty photos a day pass');
});
