/**
 * What a trial tells a fetch naming a key when the record gave it no vault (`src/script-try.ts`, audit thirty-eight
 * finding 2).
 *
 * ONE SENTENCE WAS SAID TO EVERY CALLER WITHOUT A KEY, AND IT NAMED AN AGENT. The record gives a trial the vault only
 * when the vault itself would open for the caller: an owner, in a browser, proved within fifteen minutes. The owner whose
 * proof is two hours old is refused for that reason alone, and "a trial opens no key for an agent" tells her she is
 * something she is not and leaves her nothing to do. Slash's included key, gated the same way, says what opens it
 * (`SLASH_HOST_KEY_CLOSED` in `src/slash.ts`), and so does this, once the record says the proof is the reason.
 *
 * THE SANDBOX IS A DOUBLE THAT ASKS FOR THE KEY AND ANSWERS WHAT IT WAS TOLD, which is what `scriptRunner` does with a
 * rejected `grantOf` inside QuickJS: the script sees the error, and the caller sees its words. The self-host's whole join
 * is `apps/selfhost/test/script-try-asker.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ScriptAnswer } from '@braindog/kernel';

import { scriptTrial, type ScriptDraft, type TrialSandbox } from '../src/script-try.ts';

/** A sandbox that asks for the `goldapi` key once and answers the sentence it was refused with. */
const asksForKey: TrialSandbox = async (_s, t): Promise<ScriptAnswer> => {
  const usage = { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 };
  try {
    await t.grantOf('goldapi');
    return { writes: [], log: 'opened', usage };
  } catch (e) {
    return { refused: { code: null, why: (e as Error).message }, log: '', usage };
  }
};

const draft = (extra: Partial<ScriptDraft>): ScriptDraft => ({
  record: { id: 'rec_1', tz: 'UTC' },
  body: { script: 'gold-rate', egress: ['https://api.gold.test'], keys: ['goldapi'], reads: [], writes: [], source: 'export default async function run() {}' },
  grantOf: null,
  ...extra,
});

const why = (a: ScriptAnswer): string => ('refused' in a ? a.refused.why : `not refused: ${JSON.stringify(a)}`);

test('AN OWNER WHOSE PROOF IS STALE IS TOLD TO SIGN IN AGAIN, not that a trial opens no key for an agent', async () => {
  const answer = await scriptTrial({ sandbox: asksForKey, ledger: null })(draft({ stale: true }));
  assert.match(why(answer), /Sign in again to try it with the key/);
  assert.match(why(answer), /"goldapi"/, 'the sentence does not name the key that stayed shut');
  assert.doesNotMatch(why(answer), /agent/);
});

test('A CALLER GIVEN NO VAULT FOR ANY OTHER REASON KEEPS THE SENTENCE IT HAD', async () => {
  const answer = await scriptTrial({ sandbox: asksForKey, ledger: null })(draft({}));
  assert.match(why(answer), /A trial opens no key for an agent/);
  assert.doesNotMatch(why(answer), /Sign in again/);
});
