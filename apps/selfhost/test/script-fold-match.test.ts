/**
 * Money's two payment scripts, run in the self-host's own sandbox with the fold a host hands (`scriptFold`).
 *
 * WHY HERE. `match_payment` asks for `ctx.fold` and falls back to comparing letters and digits, and until the sandbox
 * carried the call no host handed one, so a payment a bank wrote with its processor and its city never met the bill
 * that names the payee plainly. The seed's own tests run each script's text as a plain module with a `ctx` they build;
 * this runs the text Money's pack document declares through `runInQuickJs`, the frozen `ctx` of the prelude and all,
 * which is also the first run of `settle_matched_line` there (it wraps that `ctx` to hold back the first search's
 * writes and words).
 *
 * THE RECORD IS A DOUBLE: rows in memory, answered through `list` and `get` as a script asks them. What a real record
 * does with the writes is `packages/seed/test/money-match-rule.test.ts`'s to say.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FOLD_CALLS, scriptFold } from '@braindog/host/script';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl } from '@braindog/script';
import { runInQuickJs } from '@braindog/script/quickjs';
import { firstPartyDocument } from '@braindog/seed';

type Fields = Record<string, unknown>;
type Held = { id: string; register: string; seq: number; version: number; fields: Fields };
type Test = { field: string; is?: unknown; in?: unknown[]; between?: [string, string] };

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const row = (register: string, seq: number, fields: Fields): Held => ({ id: `e_${register}_${seq}`, register, seq, version: 3, fields });

/** A script as Money's pack document declares it, by its id. */
const declared = (script: string): ScriptDecl => {
  const all = (firstPartyDocument('money-core', { seeds: [] }) as unknown as { declarations: Fields[] }).declarations;
  const d = all.find((x) => x.script === script);
  assert.ok(d, `Money declares no script ${script}`);
  return { id: script, version: 1, egress: d.egress as string[], keys: d.keys as string[], reads: d.reads as string[], writes: d.writes as string[], source: d.source as string };
};

const passes = (r: Held, t: Test): boolean => {
  const v = r.fields[t.field];
  if (t.between) return typeof v === 'string' && v >= t.between[0] && v <= t.between[1];
  return t.in ? t.in.includes(v) : v === t.is;
};

/** The host a run is handed: the rows, the clock, and the fold when `folds` is set, counted. */
function hostOver(rows: Held[], script: string, input: Fields, folds: boolean): CtxHost & { asked: string[] } {
  const asked: string[] = [];
  const fold = scriptFold(script);
  return {
    asked,
    fetch: async () => ({ status: 200, headers: {}, body: '' }),
    list: async (register, where) => {
      const w = where as unknown as Test | { all: Test[] };
      const tests = 'all' in w ? w.all : [w];
      return rows.filter((r) => r.register === register && tests.every((t) => passes(r, t))) as unknown as Json[];
    },
    get: async (spoken) => (rows.find((r) => `${r.register}#${r.seq}` === spoken || r.id === spoken) ?? null) as unknown as Json,
    ...(folds
      ? {
          fold: (text: string) => {
            asked.push(text);
            return fold(text);
          },
        }
      : {}),
    now: () => '2026-10-02T09:00:00Z',
    tz: 'Africa/Cairo',
    /* A clock that stands still: this file is not about limits, and a busy machine must not trip one. */
    clock: () => 0,
    input: input as Json,
  };
}

const writesOf = (a: ScriptAnswer) => {
  assert.ok('writes' in a, JSON.stringify(a));
  return a.writes;
};

const BANK = row('transactions', 12, { what: 'Card payment', counterparty_text: 'GEIDEA*CHILLOUT 0423 CAIRO EG', direction: 'out', amount: gbp(400_000), on: '2026-10-01', state: 'cleared' });
const BILL = row('obligations', 4, { what: 'Chill Out', direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open' });
const LINE = row('recurring', 7, { what: 'Chill Out', direction: 'out', amount: gbp(400_000), every: 'monthly', next_due: '2026-10-03', state: 'live' });

test('A BANK SPELLING WITH ITS PROCESSOR AND ITS CITY MEETS THE BILL THAT NAMES THE PAYEE PLAINLY, in the sandbox, with the host fold', async () => {
  const h = hostOver([BANK, BILL], 'match_payment', { payment: 'transactions#12', asks: 'linked' }, true);
  const a = await runInQuickJs(declared('match_payment'), h);
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: 'transactions#12', patch: { settles: 'e_obligations_4' }, version: 3 }]);
  /* ASKED ONCE FOR EACH TEXT, and far inside what one run may ask. */
  assert.deepEqual([...h.asked].sort(), ['Card payment', 'Chill Out', 'GEIDEA*CHILLOUT 0423 CAIRO EG']);
  assert.ok(h.asked.length < FOLD_CALLS);
  assert.doesNotMatch(a.log, /e_obligations_4|e_transactions_12|[0-9A-HJKMNP-TV-Z]{26}/u);
});

test('HANDED NO FOLD, the same payment meets nothing: letters and digits alone can miss a match and never make one', async () => {
  const h = hostOver([BANK, BILL], 'match_payment', { payment: 'transactions#12', asks: 'linked' }, false);
  const a = await runInQuickJs(declared('match_payment'), h);
  assert.deepEqual(writesOf(a), []);
});

test('THE SECOND STEP RUNS IN THE SANDBOX TOO: the repeating line the bank spelling fits is marked with the payment, and Next stays', async () => {
  const h = hostOver([BANK, LINE], 'settle_matched_line', { payment: 'transactions#12' }, true);
  const a = await runInQuickJs(declared('settle_matched_line'), h);
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: 'recurring#7', patch: { last_paid: '2026-10-01', last_amount: gbp(400_000) }, version: 3 }]);
  /* THE FIRST SEARCH'S WORDS ARE HELD BACK, so the run says the line once, and never that it has no later day. */
  assert.match(a.log, /Chill Out is paid for 3 October\. Its Next stays where it is, for you to move\./u);
  assert.doesNotMatch(a.log, /has no later day|This payment is for/u);
});

test('AND IT WRITES NOTHING FOR A BILL, which the first step links: the line script ends without a word', async () => {
  const h = hostOver([BANK, BILL], 'settle_matched_line', { payment: 'transactions#12' }, true);
  const a = await runInQuickJs(declared('settle_matched_line'), h);
  assert.deepEqual(writesOf(a), []);
  assert.equal(a.log, '');
});
