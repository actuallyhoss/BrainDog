/**
 * The `via: ask` runner: four fixtures, driven through the palette's two passes.
 *
 * `40 §6` minted `ask` on September 21st 2026 for the four codes this package raises when a model
 * answers, and gave it `spark/test` as its runner. Until this file, the four fixtures were checked
 * by `tools/gates/refusal-fixtures.mjs` for naming a file that still says their code, and by nothing
 * for whether the palette answers them with the `at` they claim. That is the gap every runner in
 * this family closes: the script owns the enumeration, the tests own the behaviour (`52 §5.3`).
 *
 * IT DRIVES `createSpark(...).propose` AND NOT `cite` OR `checkSchema`, which is where two of the
 * four `raises:` point. `cite.test.ts` already calls `cite('{{pct:-46.3}}')` and gets this code; what
 * nothing asserted was that the palette, handed a reply carrying that span, refuses the proposal with
 * the same address rather than filing it. A fixture is a claim about a surface a person meets, and
 * the palette is that surface until a host action reaches it (`loop/STATUS.md` records that none does
 * yet), so the palette is what the fixture is driven against.
 *
 * ─── WHAT A FIXTURE CARRIES ─────────────────────────────────────────────────────────────────────
 *
 *   ask:       the question, as a plain scalar. The palette trims it and caps it at 400 bytes.
 *   replies:   the model's answers in call order: pass 1's predicate draft, then pass 2's proposal.
 *              An object is serialised before the canned model says it; a string is said as it is,
 *              which is the one form a reply that is not JSON at all could take. The canned model
 *              throws on a call nobody queued, so a fixture with too few replies fails by name.
 *   settings:  `tier`, `ask_cap`, and `asks`, the month's propose calls already on the meter. The
 *              first two go through `configure` as the owner; `asks` is written as `call` rows,
 *              which is what `palette.test.ts` does, because the meter counts rows and nothing else.
 *
 * `record:` AND `principal:` ARE IN `40 §6`'S COLUMN AND NO FIXTURE HERE CARRIES EITHER. `40 §4`'s
 * seeds do not exist yet (there is no `seed.json` and no `packages/fixtures`), and `fakeRecord()` in
 * `double.ts` holds the index and rows every spark test already asks about, so a `record: twelve`
 * would name a seed nothing builds and be served by a double that ignores it. Every ask here is the
 * owner's, because `propose` checks no level; writing `principal:` into four files would be a key
 * that looks load-bearing and is not, the argument `refusals-write.test.ts` makes for the kernel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { refused } from '@braindog/ports';

import { family as familyOf, type Fixture, type Keys } from '../../../fixtures/corpus.ts';
import { createSpark } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const json = <T>(keys: Keys, key: string, where: string): T | undefined => {
  const raw = keys.get(key);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`${where}'s \`${key}:\` is not a flow collection this reader can hand to JSON.parse: ${String(e)}`);
  }
};

const family: Fixture[] = familyOf('ask');

/* THE COUNT IS ASSERTED SO THAT A FIFTH CANNOT ARRIVE UNDRIVEN. `40 §6`'s table says the ask family
   is four. A new one finds out here that it needs an `ask:`, rather than joining a family nothing
   runs. */
test('every ask fixture in the corpus is driven here, and there are four of them', () => {
  assert.equal(family.length, 4);
  for (const f of family) assert.ok(f.keys.has('ask'), `${f.name} carries no \`ask:\`, so nothing drives it`);
});

type Settings = { tier: 'a' | 'b' | 'byo'; ask_cap: number; asks: number };

for (const fixture of family) {
  const where = `fixtures/refusals/${fixture.name}`;

  test(`${fixture.name} raises ${fixture.keys.get('code')} from the palette`, async () => {
    const question = fixture.keys.get('ask')!;
    const replies = json<(string | Record<string, unknown>)[]>(fixture.keys, 'replies', where) ?? [];
    const settings = json<Settings>(fixture.keys, 'settings', where);

    const sql = openSqlite();
    try {
      const inference = canned();
      const record = fakeRecord();
      const spark = createSpark({ sql, clock: fixedClock(NOW), inference, record });

      if (settings !== undefined) {
        const set = spark.configure({ tier: settings.tier, ask_cap: settings.ask_cap }, OWNER);
        assert.ok(set.ok, `${where}'s \`settings:\` were refused: ${JSON.stringify(set)}`);
        /* THE ROWS ARE DATED NOW, SO THEY COUNT THIS MONTH. The meter reads `ts >= monthStart`, and
           a row stamped in some other month is a meter that reads zero and a fixture that files. */
        const ts = new Date(NOW).toISOString();
        for (let i = 0; i < settings.asks; i++)
          sql.exec(
            `INSERT INTO call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status)
             VALUES (?, ?, 'propose', ?, 'glm-5.3-flash', 1, 1, 1, 1, 'ok')`,
            `seed${i}`,
            ts,
            settings.tier,
          );
      }

      for (const reply of replies) inference.say(typeof reply === 'string' ? reply : JSON.stringify(reply));

      const answer = await spark.propose(question, OWNER);

      assert.equal(answer.ok, false, `${where}'s ask was answered: ${JSON.stringify(answer)}`);
      assert.ok(refused(answer), `${where} was answered with a conflict where a refusal was named`);
      const refusal = answer.refusal;
      assert.equal(refusal.code, fixture.keys.get('code'));
      assert.equal(refusal.at, fixture.keys.get('at'), `${where} claims \`at: ${fixture.keys.get('at')}\``);

      /* THE FIXTURE'S `fix` IS THE EMITTER'S LAST SENTENCE, and three of the four say so in their own
         comments: the budget and schema sentences open with a clause that carries a date or an
         address, which the fixture leaves to `at` or cannot know. So the comparison is a suffix
         rather than equality, and it is still a comparison: a reworded emitter fails it. */
      const fix = fixture.keys.get('fix')!;
      assert.ok(refusal.fix.endsWith(fix), `${where} says "${fix}" and the palette said "${refusal.fix}"`);

      /* NOTHING WAS FILED, which is the product's claim about every one of these codes. A refusal
         that left a suggestion in somebody's queue would pass every assertion above. */
      assert.equal(record.filed.length, 0, `${where} was refused and something was filed anyway`);

      /* THE METER REFUSES BEFORE THE MODEL, and `spark-budget-spent.yaml` says so in its comment.
         The other three spend exactly the replies they carry: a fixture with a spare reply is one
         whose claim about which call refused is not the one the palette made. */
      assert.equal(inference.seen.length, replies.length, `${where} carries ${replies.length} replies and the palette made ${inference.seen.length} calls`);
    } finally {
      sql.close();
    }
  });
}
