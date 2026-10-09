/**
 * The lived record's two profiles read as they were made to: `default` red on the signs an untended record is red on,
 * `lived-well` green on the same signs, over the same five weeks (PRF-A07 job 5, PRF-A01's guard).
 *
 *   node --test tools/gates/test/lived.test.mjs
 *
 * WHY BOTH. A sign that is green by construction reads green on a record that has the fault; one that is red by
 * construction reads red on a record that does not. Each sign is asserted in both states here, on records built through
 * the product's own verbs, so a sign that stops seeing its fault and a builder that stops making it both go red.
 *
 * THE SENTENCES ARE ASSERTED IN THEIR FORM, the form an owner's record printed them in (`loop/scope/area-proof-a.md`
 * 2.2): the count of messages and the date of the newest Ledger row, the count of series and the day the numbers
 * stopped, the number of questions one cause holds. The two records' readings are printed side by side as the test's
 * diagnostics, for a report to quote.
 *
 * SLOW ONCE, THEN CACHED. A build lives five weeks an hour at a time (about 15 seconds each); a second run finds the
 * files under their hash and builds nothing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CARD_DIGITS, ENDS, PROFILES, buildLived, livedHash, livedSigns, readProfile } from '../lived.mjs';

/** The signs PRF-A01's proof reads red on an owner's record, and so on `default`. */
const HIS = ['arrivals-filed', 'numbers-arrive', 'questions-by-cause'];

/** The kernel's own signs. The other four are filed by the record layer and the host, which a built record does not run. */
const KERNEL = ['arrivals-filed', 'numbers-arrive', 'questions-by-cause', 'oldest-question', 'runs-true'];

const built = new Map();
async function signsOf(name, over) {
  const key = `${name}${over ? JSON.stringify(over) : ''}`;
  if (!built.has(key)) {
    const b = await buildLived(name, over ? { over } : {});
    built.set(key, { ...b, signs: await livedSigns(b.file) });
  }
  return built.get(key);
}

/** The automation signs, which the profiles do not exercise yet (PRF-A08's recipes). */
const FLOW = new Set(['scripts-paused', 'scripts-refused', 'scripts-sourceless', 'automations-failed', 'automations-parked', 'automations-idle', 'automations-stopped-chains']);

/**
 * The signs of what runs by itself and what arrives (SHL-C01, `signs-actions.ts`) that may read green on the untended
 * record, each with why. The others of the five read none on both profiles: neither declares a scheduled action.
 */
const UNTENDED_GREEN = new Map([
  ['schedule-failed', 'tending is answering and filing; a job that runs by itself dies of its own fault, and none does here'],
  ['arrivals-unverified', 'both profiles send only verified texts, tended or not; an arrival nothing verified is the sender\'s, not the owner\'s'],
]);

/** And the one that may read red on the tended record, with why. */
const TENDED_RED = new Map([
  ['doors-silent', 'both profiles stop their texts about three and a half days before the end (`lastDaysQuiet` 2 and the spread in `daysOf`), a door gone quiet; on default nothing files, so it reads none'],
]);

const of = (signs, id) => {
  const s = signs.find((x) => x.sign === id);
  assert.ok(s, `${id} is not a sign`);
  return s;
};

test('THE PROFILES: the two of 2.5, each read whole, and one with a count that is not a count is refused by name', () => {
  assert.deepEqual(PROFILES, ['default', 'lived-well']);
  for (const name of PROFILES) {
    const p = readProfile(name);
    assert.equal(p.profile, name);
    assert.ok(p.packs.length > 0 && p.usecase !== null, `${name} installs no add-on or no use case`);
  }
  assert.throws(() => readProfile('default', { import: { ledger: -1 } }), /import\.ledger is not a whole number/);
  assert.throws(() => readProfile('no-such-profile'), /There is no lived profile called no-such-profile/);
});

test('DEFAULT: arrivals, numbers and questions by cause read red, in the sentences an owner reads', async (t) => {
  const { signs } = await signsOf('default');
  for (const s of signs) t.diagnostic(`default     ${s.state.padEnd(5)} ${s.name}: ${s.said}`);
  for (const id of HIS) assert.equal(of(signs, id).state, 'red', `${id} read ${of(signs, id).state}: ${of(signs, id).said}`);
  /* AND NONE GREEN: an untended record that reads well anywhere has a sign that cannot see it. Outside the automation
     signs (SHL-D01, `signs-flow.ts`): neither profile writes a script or an automation that fails, so on both they
     read what is true of that, which is green or nothing to judge by. And outside `UNTENDED_GREEN`, each with its reason. */
  for (const s of signs) if (!FLOW.has(s.sign) && !UNTENDED_GREEN.has(s.sign)) assert.notEqual(s.state, 'green', `${s.sign} reads green on an untended record: ${s.said}`);
  for (const [id, why] of UNTENDED_GREEN) t.diagnostic(`default     may read green: ${id}, since ${why}`);
  for (const id of ['actions-paused', 'actions-held', 'doors-silent']) assert.equal(of(signs, id).state, 'none', `${id} read ${of(signs, id).state}: ${of(signs, id).said}`);

  const arrivals = of(signs, 'arrivals-filed');
  assert.match(arrivals.said, /^30 messages have waited more than a day\. The newest transaction in Ledger is from \d{1,2} [A-Z][a-z]+\./);
  assert.match(arrivals.said, new RegExp(`Most say: No account has ${CARD_DIGITS} in Digits the bank prints\\.`));
  assert.match(of(signs, 'numbers-arrive').said, /^24 series have had no number since \d{1,2} [A-Z][a-z]+\. Nothing is scheduled to bring one\.$/);
  assert.match(of(signs, 'questions-by-cause').said, /^17 open questions share one cause: .+ One answer closes them\.$/);
  /* AND THE TWO THE UNTENDED WEEKS MAKE TOO: a question as old as the import, and runs whose end was lost. */
  assert.equal(of(signs, 'oldest-question').state, 'red');
  assert.equal(of(signs, 'runs-true').state, 'red');
});

test('LIVED-WELL: the same weeks tended, and every sign the kernel reads is green', async (t) => {
  const { signs } = await signsOf('lived-well');
  for (const s of signs) t.diagnostic(`lived-well  ${s.state.padEnd(5)} ${s.name}: ${s.said}`);
  for (const id of KERNEL) assert.equal(of(signs, id).state, 'green', `${id} read ${of(signs, id).state}: ${of(signs, id).said}`);
  for (const s of signs) if (!TENDED_RED.has(s.sign)) assert.notEqual(s.state, 'red', `${s.sign} reads red on a tended record: ${s.said}`);
  for (const [id, why] of TENDED_RED) t.diagnostic(`lived-well  may read red: ${id}, since ${why}`);
  for (const id of ['actions-paused', 'actions-held']) assert.equal(of(signs, id).state, 'none', `${id} read ${of(signs, id).state}: ${of(signs, id).said}`);
  for (const id of ['schedule-failed', 'arrivals-unverified']) assert.equal(of(signs, id).state, 'green', `${id} read ${of(signs, id).state}: ${of(signs, id).said}`);
  assert.equal(of(signs, 'arrivals-filed').said, 'Every message has been filed or set aside within a day.');
  assert.equal(of(signs, 'numbers-arrive').said, 'Every series has its numbers on time.');
  assert.equal(of(signs, 'questions-by-cause').said, 'No question is waiting.');
});

test('THE SAME WEEKS: both end at the gates\' instant, and a second build of either finds its file and builds nothing', async () => {
  for (const name of PROFILES) {
    const first = await signsOf(name);
    assert.equal(first.now, ENDS);
    const again = await buildLived(name);
    assert.equal(again.cached, true, `${name} was built again with nothing changed`);
    assert.equal(again.file, first.file);
  }
  assert.notEqual(livedHash('default'), livedHash('lived-well'));
  assert.notEqual(livedHash('lived-well'), livedHash('lived-well', { days: { balances: { everyDays: 0 } } }));
});

test(
  'A TENDED RECORD WHOSE BANK SENDS NO BALANCE MESSAGE reads arrivals green',
  async () => {
    const { signs } = await signsOf('lived-well', { days: { balances: { everyDays: 0 } } });
    const arrivals = of(signs, 'arrivals-filed');
    assert.equal(arrivals.state, 'green', arrivals.said);
  },
);
