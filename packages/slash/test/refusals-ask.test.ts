/**
 * The `via: ask` runner: five fixtures, four driven through the palette's two passes and one
 * through an automation's `answer`.
 *
 * `40 §6` minted `ask` on September 21st 2026 for the four codes this package raises when a model
 * answers, and gave it `slash/test` as its runner. Until this file, the four fixtures were checked
 * by `tools/gates/refusal-fixtures.mjs` for naming a file that still says their code, and by nothing
 * for whether the palette answers them with the `at` they claim. That is the gap every runner in
 * this family closes: the script owns the enumeration, the tests own the behaviour (`52 §5.3`).
 *
 * IT DRIVES `createSlash(...).propose` AND NOT `cite` OR `checkSchema`, which is where two of the
 * four `raises:` point. `cite.test.ts` already calls `cite('{{pct:-46.3}}')` and gets this code; what
 * nothing asserted was that the palette, handed a reply carrying that span, refuses the proposal with
 * the same address rather than filing it. A fixture is a claim about a surface a person meets, and
 * the palette is that surface until a host action reaches it (`loop/STATUS.md` records that none does
 * yet), so the palette is what the fixture is driven against.
 *
 * AND `answer` FOR THE ONE CODE ONLY `answer` RAISES. `ANSWER_UNREADABLE` was admitted on September
 * 23rd 2026 for an automation's question the model answered with a 200 the host could not read, and
 * `propose` cannot reach it: the palette answers a marked throw as `UNREACHABLE`, like any other. It
 * was the gate's one finding on that date, `refusal-fixtures` naming it as a code with no fixture,
 * and a fixture this file drove through `propose` would have been a `TypeError` in `propose.ts`, which
 * reads `question.trim()` off a key the fixture does not have. Measured the same day, before this file
 * learned the key: the count assertion read 5 against 4, and the fixture's own test threw exactly that.
 *
 * ─── WHAT A FIXTURE CARRIES ─────────────────────────────────────────────────────────────────────
 *
 *   ask:       the palette's question, as a plain scalar. The palette trims it and caps it at 400 bytes.
 *   answer:    in place of `ask:`, an automation's question: the `Ask` the kernel's `infer.ask` row
 *              carries (`rule`, `step`, `question`, `shape`, and `choices` or `about` if it has them),
 *              as a flow mapping. A fixture carries exactly one of the two, and it says which method
 *              is driven, so a fixture cannot be run through the other one by accident.
 *   replies:   the model's answers in call order: pass 1's predicate draft, then pass 2's proposal.
 *              An object is serialised before the canned model says it; a string is said as it is,
 *              which is the one form a reply that is not JSON at all could take. The canned model
 *              throws on a call nobody queued, so a fixture with too few replies fails by name.
 *              ONE OBJECT IS NOT SAID BUT THROWN: `{ "answered": "<sentence>" }`, a single key whose
 *              value is a string, is an `Error` with that message and `answered: true`, which is what
 *              the host's `SlashAnsweredError` is to this package, a mark read structurally because
 *              the package may not import the host (`46 §5.1`). Neither pass of the palette has a
 *              schema with an `answered` key, so no reply the other four could carry is read as one.
 *   settings:  `tier`, `ask_cap`, and `asks`, the month's propose calls already on the meter. The
 *              first two go through `configure` as the owner; `asks` is written as `call` rows,
 *              which is what `palette.test.ts` does, because the meter counts rows and nothing else.
 *
 * `record:` AND `principal:` ARE IN `40 §6`'S COLUMN AND NO FIXTURE HERE CARRIES EITHER. `40 §4`'s
 * seeds do not exist yet (there is no `seed.json` and no `packages/fixtures`), and `fakeRecord()` in
 * `double.ts` holds the index and rows every Slash test already asks about, so a `record: twelve`
 * would name a seed nothing builds and be served by a double that ignores it. Every ask here is the
 * owner's, because `propose` checks no level; writing `principal:` into four files would be a key
 * that looks load-bearing and is not, the argument `refusals-write.test.ts` makes for the kernel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { refused } from '@braindog/ports';

import { family as familyOf, type Fixture, type Keys } from '../../../fixtures/corpus.ts';
import { createSlash, type Ask } from '../src/index.ts';
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

/* THE COUNT IS ASSERTED SO THAT A SIXTH CANNOT ARRIVE UNDRIVEN. `40 §6`'s table says the ask family
   is five: the four the palette raises, and `ANSWER_UNREADABLE`, which only an automation's `answer`
   does. The fifth arrived on September 23rd 2026 and found out here, as 5 against 4, that nothing
   drove it; a sixth finds out the same way that it needs an `ask:` or an `answer:`, rather than
   joining a family nothing runs. */
test('every ask fixture in the corpus is driven here, and there are five of them', () => {
  assert.equal(family.length, 5);
  for (const f of family)
    assert.ok(f.keys.has('ask') !== f.keys.has('answer'), `${f.name} carries ${f.keys.has('ask') ? 'both `ask:` and `answer:`' : 'neither `ask:` nor `answer:`'}, and one of them says what drives it`);
});

type Settings = { tier: 'a' | 'b' | 'byo'; ask_cap: number; asks: number };

type Reply = string | Record<string, unknown>;

/** A reply that is the host's marked throw, `{ "answered": "<sentence>" }`, as the `Error` it stands for; anything else as the text said. */
const spoken = (reply: Reply): string | Error => {
  if (typeof reply === 'string') return reply;
  const keys = Object.keys(reply);
  if (keys.length === 1 && keys[0] === 'answered' && typeof reply['answered'] === 'string')
    return Object.assign(new Error(reply['answered']), { answered: true });
  return JSON.stringify(reply);
};

for (const fixture of family) {
  const where = `fixtures/refusals/${fixture.name}`;

  const automation = json<Ask>(fixture.keys, 'answer', where);
  const surface = automation === undefined ? 'the palette' : "an automation's answer";

  test(`${fixture.name} raises ${fixture.keys.get('code')} from ${surface}`, async () => {
    const question = fixture.keys.get('ask');
    const replies = json<Reply[]>(fixture.keys, 'replies', where) ?? [];
    const settings = json<Settings>(fixture.keys, 'settings', where);

    const sql = openSqlite();
    try {
      const inference = canned();
      const record = fakeRecord();
      const slash = createSlash({ sql, clock: fixedClock(NOW), inference, record });

      if (settings !== undefined) {
        const set = slash.configure({ tier: settings.tier, ask_cap: settings.ask_cap }, OWNER);
        assert.ok(set.ok, `${where}'s \`settings:\` were refused: ${JSON.stringify(set)}`);
        /* THE ROWS ARE DATED NOW, SO THEY COUNT THIS MONTH. The meter reads `ts >= monthStart`, and
           a row stamped in some other month is a meter that reads zero and a fixture that files. */
        const ts = new Date(NOW).toISOString();
        for (let i = 0; i < settings.asks; i++)
          sql.exec(
            `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status)
             VALUES (?, ?, 'propose', ?, 'glm-5.3-flash', 1, 1, 1, 1, 'ok')`,
            `seed${i}`,
            ts,
            settings.tier,
          );
      }

      for (const reply of replies) inference.say(spoken(reply));
      const before = slash.status().asks.used;

      const answer = automation === undefined ? await slash.propose(question!, OWNER) : await slash.answer(automation);

      assert.equal(answer.ok, false, `${where}'s ask was answered: ${JSON.stringify(answer)}`);
      assert.ok(refused(answer), `${where} was answered with a conflict where a refusal was named`);
      const refusal = answer.refusal;
      assert.equal(refusal.code, fixture.keys.get('code'));
      assert.equal(refusal.at, fixture.keys.get('at'), `${where} claims \`at: ${fixture.keys.get('at')}\``);

      /* THE FIXTURE'S `fix` IS THE EMITTER'S LAST SENTENCE, and four of the five say so in their own
         comments: the budget and schema sentences open with a clause that carries a date or an
         address, which the fixture leaves to `at` or cannot know, and `answer`'s carries the rule,
         the step and the host's own words. So the comparison is a suffix rather than equality, and
         it is still a comparison: a reworded emitter fails it. */
      const fix = fixture.keys.get('fix')!;
      assert.ok(refusal.fix.endsWith(fix), `${where} says "${fix}" and ${surface} said "${refusal.fix}"`);

      /* NOTHING WAS FILED, which is the product's claim about every one of these codes. A refusal
         that left a suggestion in somebody's queue would pass every assertion above. */
      assert.equal(record.filed.length, 0, `${where} was refused and something was filed anyway`);

      /* THE METER REFUSES BEFORE THE MODEL, and `slash-budget-spent.yaml` says so in its comment.
         The other four spend exactly the replies they carry: a fixture with a spare reply is one
         whose claim about which call refused is not the one the surface made. */
      assert.equal(inference.seen.length, replies.length, `${where} carries ${replies.length} replies and ${surface} made ${inference.seen.length} calls`);

      /* AND AN AUTOMATION'S ASK THAT REACHED A MODEL IS ON THE METER, which is what `30 §6` says
         separates `ANSWER_UNREADABLE` from `UNREACHABLE`: a provider bills the 200 it served.
         `loop/research-batch-forty-six-audit.md` finding 4 measured the same throw settled under
         `-`, which no count reads, so a clock rule spent a model's time without spending its
         allowance. The palette's four are not asserted here, because whether a refused proposal is
         counted is not what any of their fixtures claims. */
      if (automation !== undefined)
        assert.equal(slash.status().asks.used - before, inference.seen.length, `${where} reached the model ${inference.seen.length} times and the meter moved ${slash.status().asks.used - before}`);
    } finally {
      sql.close();
    }
  });
}
