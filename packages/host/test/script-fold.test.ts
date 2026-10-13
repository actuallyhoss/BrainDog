/**
 * `ctx.fold` as a host hands it: the kernel's `bankKey` and no second copy, held to a length and a count.
 *
 * WHY IT IS HANDED. Money's `match_payment` compares a payment's payee with what a bill names, and a sandbox runs the
 * script's text alone, so without the host's fold it compared letters and digits and a bank's spelling with its
 * processor and its city met nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bankKey, type Scripted } from '@braindog/kernel';

import { FOLD_CALLS, FOLD_CHARS, scriptFold, scriptRunner, type ScriptFold } from '../src/script.ts';

const SPELLINGS = ['GEIDEA*CHILLOUT 0423 CAIRO EG', 'Chill Out', 'CHILLOUT', 'UBER *TRIP HELP.UBER.COM', 'CAFE 22', 'Pharmacy Giza', '', '   ', '0423'];

test('scriptFold ANSWERS THE KERNEL KEY FOR EVERY SPELLING, so a bank text and a plain name are one payee', async () => {
  const fold = scriptFold('match_payment');
  for (const text of SPELLINGS) assert.equal(await fold(text), bankKey(text), text);
  assert.equal(await fold('GEIDEA*CHILLOUT 0423 CAIRO EG'), await fold('Chill Out'));
  assert.equal(await fold('GEIDEA*CHILLOUT 0423 CAIRO EG'), 'bank:chillout');
});

test('A TEXT THAT IS NO TEXT, OR LONGER THAN THE LIMIT, IS NO PAYEE AND IS NOT FOLDED IN PART', async () => {
  const fold = scriptFold('match_payment');
  assert.equal(await fold(42 as unknown as string), null);
  assert.equal(await fold(null as unknown as string), null);
  assert.notEqual(await fold('a'.repeat(FOLD_CHARS)), null);
  assert.equal(await fold(`Chill Out ${'a'.repeat(FOLD_CHARS)}`), null);
});

test('A RUN IS ANSWERED FOLD_CALLS TIMES AND REFUSED THE REST, each run on its own count', async () => {
  const fold = scriptFold('match_payment');
  for (let i = 0; i < FOLD_CALLS; i++) await fold('Chill Out');
  await assert.rejects(fold('Chill Out'), /match_payment asked for more than 1000 payee keys in one run/);
  assert.equal(await scriptFold('match_payment')('Chill Out'), 'bank:chillout');
});

test('scriptRunner HANDS THE SANDBOX fold, and a script that reads and fetches nothing is still handed it', async () => {
  let handed: ScriptFold | undefined;
  const runner = scriptRunner({
    run: async (_decl, host) => {
      handed = (host as { fold?: ScriptFold }).fold;
      return { writes: [], log: '', usage: { fetches: 0, bytes: 0, wall_ms: 0, cpu_ms: 0 } } as never;
    },
    send: async () => { throw new Error('nothing is sent'); },
    openKey: null,
    grantOf: () => null,
    now: () => 0,
  });
  const s = {
    job: { id: 'j_1' },
    scripted: { script: 'match_payment', version: 1, actor: 'a_1', record: { tz: 'UTC' }, input: null, decl: { egress: [], keys: [], reads: [], writes: [], source: '' } },
  } as unknown as Scripted;
  await runner(s);
  assert.equal(typeof handed, 'function');
  assert.equal(await handed!('UBER *TRIP HELP.UBER.COM'), bankKey('UBER *TRIP'));
});
