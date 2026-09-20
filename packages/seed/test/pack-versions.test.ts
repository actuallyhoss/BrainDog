/**
 * Each first-party pack's version against what it declares (`FIRST_PARTY_VERSIONS` in `packs/first-party.ts`).
 *
 * A RECORD IS OFFERED AN UPDATE ONLY WHEN A VERSION GOES UP, so a pack that changes without one strands every record that
 * installed it on the old declarations, and one that goes up without a change asks people to update for nothing. The
 * fingerprint is of what reaches a record that already holds the pack: its declarations and its settings, never its
 * example rows, which are planted only into an empty list.
 *
 * THE GUARD IS BUILT THE WAY IT IS BECAUSE ONE HASH WAS TOO EASY TO ANSWER. `money-core` was raised to 1.3.0 on
 * 20 September at 17:53 and the fingerprint under that label was written again five times in the seven hours and
 * forty-seven minutes after it, by `62511a98`, `ca30d210`, `2f97a30d`, `491e7e05` and `df458964`, each time as one hex
 * string on one line. Two of the five gave a reason in their commit message and one wrote a sentence beside the literal.
 * THE TWO THAT SAID NOTHING ANYWHERE, `62511a98` AND `491e7e05`, ARE EXACTLY THE TWO THAT CHANGED WHAT A RECORD HOLDS
 * rather than the words over it: `62511a98` took `metric.recurring-out-month` and `metric.recurring-in-month` away, the
 * two figures that read `register.recurring` where the pair that survives reads `register.obligations`, and
 * `491e7e05` added `rule.recurring-ended`, which moves a finished schedule to `ended` and is the difference between a
 * stopped row counted at GBP 249.00 a month and not counted at all. A hash reports all five of those the same way, so
 * the cheapest answer was always the same edit and the guard never put a decision in front of anybody.
 *
 * SO A VERSION RECORDS THE IDS AS WELL AS THE HASH, and the two are asked different questions. An id appearing or
 * vanishing is a declaration a record on that version does not have and can never be told about, so there is no
 * fingerprint to set again for it: the entry is refused and the ids are named. Only the words inside declarations that
 * are already there may be set again, and that costs a line of prose beside the literal, naming what moved and ending in
 * the value it set.
 *
 * WHAT THIS DOES NOT DO, said plainly, because a guard oversold is a guard nobody checks. The ids do not notice a filter
 * or a leg changing inside a page that already exists, and `ca30d210` and `2f97a30d` were both exactly that. The hash
 * notices, and the line of prose is where somebody has to say whether what moved was words or arithmetic. Nor can any of
 * this stop a hand determined to shut the test up: the point is to stop the reflex, because the edit that now hides a new
 * rule is a named id deleted from a list a reviewer reads instead of a hex nobody can read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument, firstPartyManifest, type FirstPartyId } from '../src/index.ts';

type Doc = { version: string; declarations: unknown[]; config?: unknown };

/** Every pack as 1.0.0 declared it, before any of them had a version of its own. */
export const RELEASED_1_0_0 = JSON.parse(readFileSync(new URL('./fixtures/first-party-1.0.0.json', import.meta.url), 'utf8')) as Record<string, Doc>;

const fingerprint = (d: Doc): string =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null }))
    .digest('hex')
    .slice(0, 16);

/** Every declaration and every setting a record that installs the pack holds, by id. `provides` is the manifest's own list. */
const inventory = (id: FirstPartyId, doc: Doc): string[] =>
  [...firstPartyManifest(id).provides, ...Object.keys((doc.config ?? {}) as Record<string, unknown>).map((k) => `setting.${k}`)].sort();

/** The ids out of a recorded `holds`, which is written over several lines so that a person can read it. */
const ids = (holds: string): string[] => holds.split(/\s+/u).filter((t) => t !== '');

type Version = {
  /**
   * EVERY DECLARATION AND EVERY SETTING A RECORD ON THIS VERSION HOLDS, by id, in any order and any whitespace. This is
   * the half a fingerprint could not tell from a reworded heading, and it is required of the version each pack is on now.
   * The retired entries below have none, because the ids they were written against were never written down: a hash was.
   */
  holds?: string;
  /**
   * What those declarations and settings SAY, hashed. Written here as well as at the end of the last `history` line ON
   * PURPOSE: the edit that answers this guard without thinking is to change this value and nothing else, and that leaves
   * the two disagreeing, which is what the test refuses.
   */
  declares: string;
  /**
   * ONE LINE PER FINGERPRINT THIS VERSION HAS EVER DECLARED, oldest first, each ending `-> <the value it set>`. Required
   * of the version each pack is on now, because that is the only entry a reset can happen to. A reset appends a line; it
   * does not edit one, and the list getting longer is how a reader sees that a version has been rewritten five times.
   */
  history?: readonly string[];
};

/**
 * WHAT EACH VERSION ABOVE 1.0.0 DECLARES. A version that has not been released yet may have its fingerprint set again,
 * and the line that says which change moved it is the price. One that a record may already hold may not: raise the
 * version and give the new one its own entry.
 */
const DECLARED: Record<string, Version> = {
  'portfolio@1.1.0': { declares: 'a51dab345b11594b' },
  'portfolio@1.2.0': { declares: '5e42170296fe76b4' },
  'portfolio@1.3.0': {
    holds: `
      metric.projects-aim-30d metric.projects-by-health metric.projects-earning metric.projects-earning-before
      metric.projects-earning-change metric.projects-live metric.projects-need-you metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent
      page.portfolio register.things rule.project-past-aim
    `,
    declares: 'b43e0664aa176905',
    history: ['A project says what it earned in a year and what it earned the year before, and the Overview draws both, so `projects-earning-before` and `projects-earning-change` are new -> b43e0664aa176905'],
  },
  'money-core@1.1.0': { declares: '5cb37a57b9de3499' },
  'money-core@1.2.0': { declares: '4f42a8e447293eaf' },
  /**
   * RETIRED WITHOUT EVER NAMING ONE SET OF DECLARATIONS, and kept here because the history is the only record of that.
   * Five of the six lines below were written after the fact, out of `git log -p` on this file, which is where the reason
   * for a reset had to be dug for before there was anywhere to put it. No `holds`, because the ids under this label
   * depend on which of the five you mean.
   */
  'money-core@1.3.0': {
    declares: '4b0b669c35680e7f',
    history: [
      'Raised to 1.3.0 here: `snapshots` gained a searchable title, `accounts` gained `last4`, and `owed-by-you` became the fourth figure a night holds -> bf68b1965194f832',
      '`62511a98` took `recurring-out-month` and `recurring-in-month` away, not a second name for `every-month-out` and `every-month-in` but a second answer over a different list: GBP 10,416.16 off `obligations.repeats` against GBP 9,196.33 off `recurring`, two clicks apart -> 2049f37907acb5c7',
      '`ca30d210` gave the walk and the bridge on `page.money` an `installments` leg, so both read the same legs -> d5fec3e0237f4183',
      '`2f97a30d` put `direction is out` on the Still to pay, in parts table on `page.ledger`, six rows to four -> 2ee211ae089dc1fb',
      '`491e7e05` added `rule.recurring-ended` and did not raise the version, which is the reset this guard was rebuilt over, and renamed `in-30d` and `out-30d` to Owed to you and Owed by you -> 16b20c1f9d41aef4',
      '`df458964` followed those two renames with the `most_out_30d` label and the by-category heading, both words a record prints -> 4b0b669c35680e7f',
    ],
  },
  /**
   * THE SAME FINGERPRINT AS 1.3.0'S LAST, AND THE VERSION MOVED ANYWAY, which is the whole of what a version is for: it
   * is about who gets told, not about the words. Nothing is declared here that was not declared under 1.3.0 an hour
   * before it; what changed is that a record holding an earlier 1.3.0 is now offered `rule.recurring-ended` instead of
   * being left on a label that had quietly moved underneath it.
   */
  'money-core@1.4.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-out
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d
      metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month
      metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.out-30d
      metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you
      metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.installments register.obligations register.recurring
      register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category
      setting.most_out_30d setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '4b0b669c35680e7f',
    history: ['Raised so that a record on an earlier 1.3.0 is offered `rule.recurring-ended`, which 1.3.0 gained without moving -> 4b0b669c35680e7f'],
  },
  'work@1.1.0': { declares: 'b49e051fe7c26ac5' },
  'work@1.2.0': { declares: '49a30d2ef8c1d672' },
  'work@1.3.0': { declares: 'fb82e66d80644e3d' },
  'work@1.4.0': {
    holds: `
      metric.open-tasks metric.project-done-7d metric.project-due-soon metric.project-in-review metric.project-open
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-later metric.tasks-overdue metric.tasks-waiting metric.tasks-with-agents
      page.work page.work-board register.tasks register.tracks register.updates
    `,
    declares: '0173aa61c9b3bc21',
    history: ['The Board says which cards an agent is on right now, which is `tasks-with-agents` and `tasks-done-7d-agents` -> 0173aa61c9b3bc21'],
  },
  'estate@1.1.0': {
    holds: `
      metric.estate-year metric.lapsing metric.points-nowhere metric.project-cost metric.renews-30d
      page.estate register.services
    `,
    declares: '90cc384470cccf30',
    history: ['An imported domain arrives with what the source did not know left blank, so `services` requires neither a renewal day nor a cost -> 90cc384470cccf30'],
  },
};

/** The shortest a reason may be. The value it justifies is sixteen characters, and a reason has to be worth more room than that. */
const REASON_FLOOR = 40;

/** A history line: what moved, then the value it set. */
const LINE = /^(.+) -> ([0-9a-f]{16})$/u;

/** A reason has to name something the pack declares, in backticks, with or without its kind in front. */
const cites = (why: string, holds: readonly string[]): boolean =>
  holds.some((id) => why.includes(`\`${id}\``) || why.includes(`\`${id.slice(id.indexOf('.') + 1)}\``));

/**
 * WHAT IS WRONG WITH ONE ENTRY, in the words the next person needs, and nothing when nothing is. `current` says whether
 * this is the version the pack is on now: a retired entry is still held to its shape, because its history is the record
 * of what that label meant, but only the current one is held to what the pack declares today.
 *
 * ONE FUNCTION RATHER THAN ASSERTIONS INLINE, so that the second test below can drive every refusal over an entry made
 * up for the purpose. A guard nobody has watched refuse is a guard nobody has tested.
 */
function wrong(key: string, entry: Version | undefined, live: { holds: readonly string[]; declares: string; current: boolean }): string[] {
  const said: string[] = [];
  if (entry === undefined) return [`${key} is not in DECLARED. Add an entry holding '${live.declares}' and the ids the pack provides.`];

  /* WHAT A RECORD HOLDS FIRST, because this is the question the fingerprint answers with the same sentence as a reworded
     heading, and the two want opposite moves. */
  if (entry.holds === undefined) {
    if (live.current) said.push(`${key} records no ids, and the version a pack is on has to: holds: '${live.holds.join(' ')}'`);
  } else if (live.current) {
    const was = new Set(ids(entry.holds));
    const gained = live.holds.filter((i) => !was.has(i));
    const lost = [...was].filter((i) => !live.holds.includes(i)).sort();
    if (gained.length > 0 || lost.length > 0)
      said.push(
        `${key} ${[gained.length > 0 ? `gained ${gained.join(', ')}` : '', lost.length > 0 ? `lost ${lost.join(', ')}` : ''].filter((s) => s !== '').join(' and ')}. That is a declaration a record on ${key} does not have and can never be told about, so there is no fingerprint to set again for it: raise the version in FIRST_PARTY_VERSIONS and give the new one its own entry here.`,
      );
  }

  /* THEN THE HISTORY, whose last line is where the current value has to be said a second time. */
  if (entry.history === undefined || entry.history.length === 0) {
    if (live.current) said.push(`${key} has no history, and the version a pack is on has to: one line saying what set '${entry.declares}', ending in it.`);
  } else {
    const seen = new Set<string>();
    for (const line of entry.history) {
      const parts = LINE.exec(line);
      if (parts === null) {
        said.push(`${key} has a history line that is not "<what moved> -> <fingerprint>": ${JSON.stringify(line)}`);
        continue;
      }
      const why = parts[1]!.trim();
      const set = parts[2]!;
      if (why.length < REASON_FLOOR) said.push(`${key} gives ${why.length} characters of reason for ${set} where ${REASON_FLOOR} is the floor: ${JSON.stringify(why)}. Say which change moved it.`);
      /* THE CITATION IS ASKED OF THE CURRENT ENTRY ONLY, because it is the one live list it can be asked against. A
         retired line citing a declaration a later version drops would start failing years afterwards, in a sentence
         nobody can honestly rewrite: the history of what a label meant is not editable. */
      if (live.current && !cites(why, live.holds))
        said.push(`${key} names nothing the pack declares in its reason for ${set}. Put the id whose words moved in backticks, one of ${live.holds.slice(0, 3).join(', ')} and the rest.`);
      if (seen.has(set)) said.push(`${key} lists ${set} twice. A reset appends a line for a value it has never declared before, and repeating one says nothing.`);
      seen.add(set);
    }
    const last = LINE.exec(entry.history[entry.history.length - 1]!)?.[2];
    if (last !== undefined && last !== entry.declares)
      said.push(`${key} declares ${entry.declares} and its last history line set ${last}. A fingerprint moved with the history left alone is the reset this guard exists to make somebody say out loud.`);
  }

  /* AND WHAT THE DECLARATIONS SAY. */
  if (live.current && entry.declares !== live.declares)
    said.push(
      `${key} declares something else now. If ${key.slice(key.indexOf('@') + 1)} has not been released, set declares to '${live.declares}' and append a history line saying which change moved it, ending in that value; if it has been released, raise the version.`,
    );
  return said;
}

test('EACH FIRST-PARTY PACK DECLARES WHAT ITS VERSION SAYS, and one that changed has a version of its own', () => {
  const said: string[] = [];
  for (const id of FIRST_PARTY) {
    const doc = firstPartyDocument(id, { seeds: [] }) as Doc;
    const version = FIRST_PARTY_VERSIONS[id];
    if (doc.version !== version) said.push(`${id}: the document and the manifest disagree`);
    const now = fingerprint(doc);
    if (version === '1.0.0') {
      if (now !== fingerprint(RELEASED_1_0_0[id]!))
        said.push(
          `${id} changed since 1.0.0 and is still 1.0.0, so a record that has it is never offered the change. Raise its version in FIRST_PARTY_VERSIONS and give '${id}@<version>' an entry in DECLARED here.`,
        );
      continue;
    }
    said.push(...wrong(`${id}@${version}`, DECLARED[`${id}@${version}`], { holds: inventory(id, doc), declares: now, current: true }));
    if (now === fingerprint(RELEASED_1_0_0[id]!)) said.push(`${id} is ${version} and declares what 1.0.0 did, so its records would be asked to update for nothing`);
  }

  /* AND EVERY RETIRED ENTRY IS HELD TO THE SAME SHAPE, because its history is the only record left of what that label
     meant on the day a record installed it, and a history with a line nobody wrote is not a record. */
  for (const [key, entry] of Object.entries(DECLARED)) {
    const id = key.slice(0, key.indexOf('@')) as FirstPartyId;
    if (key === `${id}@${FIRST_PARTY_VERSIONS[id]}`) continue;
    said.push(...wrong(key, entry, { holds: inventory(id, firstPartyDocument(id, { seeds: [] }) as Doc), declares: entry.declares, current: false }));
  }
  assert.deepEqual(said, []);
});

/**
 * THE GUARD'S OWN REFUSALS, driven over entries made up for the purpose.
 *
 * WRITTEN BECAUSE THE GUARD THIS REPLACES WAS ANSWERED FIVE TIMES IN SEVEN HOURS AND NEVER ONCE REFUSED ANYTHING a
 * person had to think about. Every rule the comments above claim is enforced is exercised here with the smallest entry
 * that breaks it, so that a rule quietly dropped from `wrong()` takes a test with it rather than going unnoticed until
 * the next audit reads the diff.
 */
test('THE GUARD REFUSES AN ENTRY WITH NO REASON BESIDE ITS FINGERPRINT, and names which rule the entry broke', () => {
  const live = { holds: ['page.portfolio', 'register.things'], declares: 'aaaaaaaaaaaaaaaa', current: true };
  const ok = {
    holds: 'page.portfolio register.things',
    declares: 'aaaaaaaaaaaaaaaa',
    history: ['A project says how it is going, which is a field on `things` and a column on `page.portfolio` -> aaaaaaaaaaaaaaaa'],
  } satisfies Version;
  const one = (entry: Version, over: Partial<typeof live> = {}): string => wrong('made-up@1.1.0', entry, { ...live, ...over }).join(' | ');

  assert.deepEqual(wrong('made-up@1.1.0', ok, live), [], 'the entry every case below breaks is itself refused');

  /* THE HALF A HASH COULD NOT SEE. A declaration appearing or vanishing has no reset: it has a version. */
  assert.match(one({ ...ok, holds: 'page.portfolio' }), /register\.things/u);
  assert.match(one({ ...ok, holds: 'page.portfolio register.things rule.made-up' }), /rule\.made-up/u);
  assert.match(one({ ...ok, holds: 'page.portfolio' }), /raise the version/iu);
  assert.match(one({ declares: ok.declares, history: ok.history }), /records no ids/u);

  /* THE RESET THAT COSTS NOTHING. A fingerprint moved with the history left alone is the whole finding. */
  assert.match(one({ ...ok, declares: 'bbbbbbbbbbbbbbbb' }, { declares: 'bbbbbbbbbbbbbbbb' }), /its last history line set aaaaaaaaaaaaaaaa/u);
  assert.match(one({ holds: ok.holds, declares: ok.declares }), /no history/u);
  assert.match(one({ ...ok, history: [] }), /no history/u);

  /* A LINE THAT IS NOT A REASON. Too short, no fingerprint, or a sentence naming nothing the pack declares. */
  assert.match(one({ ...ok, history: ['copy -> aaaaaaaaaaaaaaaa'] }), /characters of reason/u);
  assert.match(one({ ...ok, history: ['aaaaaaaaaaaaaaaa'] }), /not "<what moved> -> <fingerprint>"/u);
  assert.match(one({ ...ok, history: ['Something about the pack that names none of its declarations at all -> aaaaaaaaaaaaaaaa'] }), /names nothing the pack declares/u);

  /* AND THE OBVIOUS WAY ROUND THE LINE: append one that repeats a value already listed. */
  assert.match(
    one({ ...ok, history: [...ok.history, 'A second line saying the same thing about `things` all over again -> aaaaaaaaaaaaaaaa'] }),
    /lists aaaaaaaaaaaaaaaa twice/u,
  );
});
