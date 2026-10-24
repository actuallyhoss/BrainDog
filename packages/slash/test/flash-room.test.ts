/**
 * Every job on `glm-5.3-flash` leaves room for its thinking (`LOW_THINKING_ROOM`, `src/prompts.ts`). The model always
 * reasons and spends that from the answer's ceiling, so a 120- or 200-token row came back cut off before its answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROSE } from '../src/jobs.ts';
import { LOW_THINKING_ROOM, PROMPTS } from '../src/prompts.ts';

test('EVERY glm-5.3-flash JOB LEAVES ROOM FOR LOW THINKING, the digest sentences among them', () => {
  const rows = [...Object.entries(PROMPTS), ['prose', PROSE] as const].filter(([, t]) => t.model === 'glm-5.3-flash');
  assert.ok(rows.length >= 7, 'every flash row is read, PROSE too');
  for (const [id, t] of rows) assert.ok(t.maxTokens >= LOW_THINKING_ROOM, `${id} is sent ${String(t.maxTokens)} tokens, under ${String(LOW_THINKING_ROOM)}`);
});
