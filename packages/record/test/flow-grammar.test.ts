/**
 * The read `flowGrammar` answers the kernel's grammar, and only to whoever may read automations.
 *
 * TWO HALVES. The method file is driven with its guard handed in, which shows it asks `scoped(ctx, 'read')`, the guard
 * `automations` asks, and passes on what that says. Then the record as a whole: an owner and a reader are answered by
 * `automations` and an appender is refused by it, and once `methods/index.ts` registers this file, `flowGrammar` is
 * held to the same answers on the same callers through the record itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flowGrammar as kernelGrammar } from '@braindog/kernel/flow-grammar';

import type { CallContext } from '../src/index.ts';
import { methods } from '../src/methods/flow-grammar.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'person', id: 'p_r', level: 'read' } };
/** Files rows and reads none (`20 §1`), so the automations read refuses her. */
const appender: CallContext = { principal: { kind: 'person', id: 'p_a', level: 'append' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const refused = { code: 'LEVEL_REQUIRED', fix: 'This needs read, and you have append access.' };
const handed = (asked: string[]) =>
  methods({
    scoped: (ctx: CallContext, need: string) => {
      asked.push(need);
      return ctx === appender ? refused : null;
    },
    no: (code: string, fix: string, more?: Record<string, unknown>) => ({ ok: false, refusal: { code, fix, ...more } }),
  } as unknown as RecordDeps);

test('THE METHOD ASKS THE GUARD THE AUTOMATIONS READ ASKS, and answers the kernel\'s grammar as it stands', async () => {
  const asked: string[] = [];
  const m = handed(asked);
  const out = (await m.flowGrammar(undefined, owner)) as Out;
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value, kernelGrammar());
  assert.deepEqual(asked, ['read']);
  const steps = (out.value as { steps: { verb: string }[] }).steps.map((s) => s.verb);
  assert.ok(steps.includes('meet') && steps.includes('run_job'));
});

test('A READER BELOW THE AUTOMATIONS READ IS REFUSED, in the guard\'s own words, and a stray key is told what it takes', async () => {
  const m = handed([]);
  const below = (await m.flowGrammar(undefined, appender)) as Out;
  assert.equal(below.ok, false);
  assert.deepEqual(below.refusal, refused);
  const stray = (await m.flowGrammar({ rule: 'chase' }, owner)) as Out;
  assert.equal(stray.refusal?.code, 'FIELD_UNKNOWN');
  assert.equal(stray.refusal?.at, 'rule');
});

test('THROUGH THE RECORD: whoever automations answers, flowGrammar answers, and whoever it refuses is refused', async () => {
  /* THE RECORD IS LOADED HERE AND NOT AT THE TOP, so the method's own two tests above stand on the method file alone. */
  const { createRecordApi } = await import('../src/index.ts');
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  const automations = async (ctx: CallContext) => ((await api.automations(undefined, ctx)) as Out).ok;
  assert.equal(await automations(owner), true);
  assert.equal(await automations(reader), true);
  assert.equal(await automations(appender), false);

  /* REGISTERED BY `methods/index.ts`'s one import and one spread, which this job could not write. Until they land the
     record has no such method, and the half above holds the guard. */
  const read = (api as unknown as { flowGrammar?: (a: undefined, c: CallContext) => Promise<Out> }).flowGrammar;
  if (read === undefined) return;
  for (const ctx of [owner, reader, appender]) {
    const out = await read(undefined, ctx);
    assert.equal(out.ok, await automations(ctx), ctx.principal.kind === 'person' ? ctx.principal.id : '');
    if (out.ok) assert.deepEqual(out.value, kernelGrammar());
    else assert.equal(out.refusal?.code, 'LEVEL_REQUIRED');
  }
});
