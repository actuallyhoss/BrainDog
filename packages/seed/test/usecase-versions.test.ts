/**
 * Each starter use case's version against what its pack declares (`version` in `src/usecases/<id>.ts`).
 *
 * A RECORD IS OFFERED AN UPDATE ONLY WHEN A VERSION GOES UP, and that is as true of a use case as of a first-party
 * pack. Until this file nothing in the tree held a use case to it. `loop/research-batch-three-audit.md` finding 6
 * drove the hole: changing the label on the founder's thirty-day tile with `version` left at 1.3.2 left
 * `node --test --experimental-strip-types "packages/seed/test/*.test.ts"` at 182 tests, 182 pass, 0 fail, the same
 * tallies as the unmutated run. `df458964` had raised that version by hand an hour earlier and spent four lines of
 * comment arguing why the raise mattered; the argument was the only thing enforcing it, and an argument in a comment
 * stops being read the week after it is written.
 *
 * WHAT IS FINGERPRINTED IS WHAT REACHES A RECORD THAT ALREADY HOLDS THE USE CASE: the pack's declarations and its
 * settings, which is where the voice and every renamed label live (`useCasePack` in `@braindog/declare`). NOT the
 * example rows, in either of the two places a use case keeps them. Its own `pack.seeds` and the module examples
 * `install.ts` hands to Projects, Money and Work are both planted only into a list that is empty, so a record that
 * already holds the use case never sees either again. `d80fd631` is the case in point: it gave the example tickets a
 * project and Team's version stayed at 2.3.0, and that was right.
 *
 * THE SHAPE IS `pack-versions.test.ts`'s, AND IT IS SPELT AGAIN RATHER THAN SHARED. Read that file first: the rules
 * here are its rules, down to the `-> <value>` at the end of a history line, and a second dialect for the same
 * question would mean two things for a reader to learn and two places for one of them to rot. The two halves are not
 * quite the same shape, because a first-party pack is asked for its ids through `firstPartyManifest(id).provides` and
 * a use case has no manifest to ask until `normalise` has run over it, so the ids here are read off the declarations
 * the way `normalise` reads them. Lifting the common half out is worth doing by whoever next holds both files open.
 *
 * WHAT THIS DOES NOT DO. There is no released-1.0.0 fixture for use cases as there is for packs, so this cannot say
 * that a use case above 1.0.0 declares exactly what 1.0.0 did and would ask its records to update for nothing. Nor
 * does it cover the words outside the pack document: a use case's `title`, `summary` and `signals` change what the
 * proposal reads like and nothing a record holds, exactly as a pack's do. And a use case that carries no pack at all,
 * which Small Business does, has nothing to fingerprint and is left out by name below.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { NOW } from '../src/index.ts';
import { USE_CASES, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { dayOf } from '../src/usecases/install.ts';

/** A day is fixed so that nothing here reads the clock. It changes only the example rows, which are out of the fingerprint. */
const TODAY = dayOf(NOW);

type Doc = { version?: unknown; declarations?: unknown; config?: unknown };

const fingerprint = (d: Doc): string =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null }))
    .digest('hex')
    .slice(0, 16);

/**
 * Every declaration and every setting a record that installs the use case holds, by id.
 *
 * A DECLARATION'S KIND IS ITS FIRST KEY, which is the rule `normalise` states in `declare/src/index.ts`: *"a rule
 * names the register it is about, so `{ rule: 'chase', register: 'obligations' }` has two of the eight words in it
 * and only the order says which one it IS"*. So the id is that first key and the name under it, which is the
 * `kind.id` form `provides` would have given.
 */
const inventory = (doc: Doc): string[] => [
  ...((doc.declarations ?? []) as Record<string, unknown>[]).map((d) => {
    const kind = Object.keys(d)[0] ?? '';
    return `${kind}.${String(d[kind])}`;
  }),
  ...Object.keys((doc.config ?? {}) as Record<string, unknown>).map((k) => `setting.${k}`),
].sort();

/** The ids out of a recorded `holds`, which is written over several lines so that a person can read it. */
const ids = (holds: string): string[] => holds.split(/\s+/u).filter((t) => t !== '');

type Version = {
  /**
   * EVERY DECLARATION AND EVERY SETTING A RECORD ON THIS VERSION HOLDS, by id, in any order and any whitespace. This
   * is the half a fingerprint cannot tell apart from a reworded heading, and the two want opposite moves out of a
   * person: a renamed tile is a reset, a new list is a new version.
   *
   * OPTIONAL IN THE TYPE AND WRITTEN IN EVERY ENTRY BELOW. It is optional because the second test drives the guard
   * over an entry that leaves it out, and a type that made that impossible would leave that refusal untested.
   */
  holds?: string;
  /**
   * What those declarations and settings SAY, hashed. Written here as well as at the end of the last `history` line
   * ON PURPOSE: the edit that answers this guard without thinking is to change this value and nothing else, and that
   * leaves the two disagreeing, which is what the test refuses.
   */
  declares: string;
  /**
   * ONE LINE PER FINGERPRINT THIS VERSION HAS EVER DECLARED, oldest first, each ending `-> <the value it set>`. A
   * reset appends a line; it does not edit one, so the list getting longer is how a reader sees that a version has
   * been rewritten more than once.
   */
  history?: readonly string[];
};

/**
 * WHAT EACH USE CASE'S CURRENT VERSION DECLARES. A version that has not been released may have its fingerprint set
 * again, and the line saying which change moved it is the price. One a record may already hold may not: raise the
 * use case's `version` and give the new one its own entry.
 *
 * THE FIRST LINE OF EACH HISTORY WAS WRITTEN AFTER THE FACT, out of the commit that raised that version, because
 * this guard did not exist while those versions were being raised. That is also the limit of what the first line can
 * honestly claim: it names what the raise was for, not that nothing has moved under the version since. Founder and
 * Team take Projects' project page through `projectTemplate`, so an edit to `modules/portfolio.ts` moves their words
 * without their files being touched, and nothing was watching for that. From here it is watched.
 */
const DECLARED: Record<string, Version> = {
  /**
   * THE EIGHT `setting.lk_*` IDS ARE LONG LABELS KEPT BY THEIR HASH, not a leak of anything: a label too long to spell
   * as a settings key is stored under `lk_<hash>` and read back through the pack's declared settings, whose title says
   * which key it is (`labelsOf` in `@braindog/declare`). They are in the list because a record holds them, so one of
   * them appearing or vanishing is a word a person could rename and is exactly what `holds` is for.
   */
  'personal@1.4.0': {
    holds: `
      metric.bills-this-week metric.budget-each-month metric.logged-by-goal metric.logged-this-week-by-goal
      metric.put-by-by-goal metric.saved-toward-goals metric.spent-this-month metric.spent-this-month-by-category
      page.goals page.home-personal page.my-project page.spending
      register.budgets register.goal_log register.goals register.project_steps register.put_by register.savings_goals
      register.spending
      setting.holds_obligations setting.holds_people setting.holds_things
      setting.label_budgets setting.label_goal_log setting.label_goals setting.label_obligations
      setting.label_people__role__accountant setting.label_people__role__client setting.label_people__role__collaborator
      setting.label_people__role__contractor setting.label_people__role__registrar
      setting.label_project_steps setting.label_put_by setting.label_savings_goals setting.label_spending
      setting.label_things setting.label_things__lane__building setting.label_things__lane__earning
      setting.label_things__lane__parked setting.label_things__lane__retired setting.label_things__revenue
      setting.lk_10103af7 setting.lk_1d01726f setting.lk_303a3cce setting.lk_4f9bf906 setting.lk_666e92eb
      setting.lk_91a285a5 setting.lk_d66e361a setting.lk_f625eca1
      setting.one_budgets setting.one_obligations setting.one_spending setting.one_things
      setting.shared_version setting.speaks
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: 'b5a6a277764c0f14',
    history: ['Raised to 1.4.0 in `ad3ebfb6`, which draws how far along a project is from its `project_steps` when nobody typed a number -> b5a6a277764c0f14'],
  },
  'student@1.2.0': {
    holds: `
      page.home-student page.studies register.assignments register.courses register.study_sessions
      setting.label_assignments setting.label_courses setting.label_study_sessions
      setting.one_assignments setting.one_courses setting.one_study_sessions
      setting.shared_version setting.speaks
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: 'd7fb53638c177532',
    history: ['Raised to 1.2.0 in `08142621`, which shows the course on `assignments` by default, so a first day says what each piece of work is for -> d7fb53638c177532'],
  },
  'founder@1.3.2': {
    holds: `
      metric.datapoints-30d page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: '3e4927061f959b6d',
    history: ['Raised to 1.3.2 in `df458964`, which renamed the two thirty-day tiles on `page.dashboard` and `page.organisation` after the money page moved its headings -> 3e4927061f959b6d'],
  },
  'team@2.3.0': {
    holds: `
      page.agent-work page.cycles page.home-team page.project register.cycle_plan register.cycles
      setting.holds_people setting.holds_tasks
      setting.label_cycle_plan setting.label_cycles setting.label_people setting.label_people__role__collaborator
      setting.label_tasks setting.label_tasks__state__backlog setting.label_tasks__state__doing
      setting.label_tasks__state__open setting.label_tasks__state__review
      setting.one_tasks setting.shared_version setting.speaks
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: '1a10e3c14cb11d31',
    history: ["Raised to 2.3.0 in `520dd7fd`, which makes up the stat row on `page.project` from a team's tasks with money left out: due soon, in review, done this week -> 1a10e3c14cb11d31"],
  },
  'guide@1.2.0': {
    holds: `
      metric.guide-choices-made metric.guide-choices-open metric.guide-idea-left metric.guide-idea-reached
      metric.guide-milestones metric.guide-milestones-reached metric.guide-steps-agents metric.guide-steps-blocked
      metric.guide-steps-done metric.guide-steps-done-7d metric.guide-steps-done-by-week metric.guide-steps-open
      page.guide page.home-guide page.milestone
      register.choices register.milestones register.resources register.steps
      setting.label_choices setting.label_milestones setting.label_resources setting.label_steps
      setting.shared_version setting.speaks setting.start_next_milestone
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: '8bdca5132ff466b5',
    history: ['Raised to 1.2.0 in `783095a7`, which asks before the next milestone starts (`start_next_milestone`) and lets a model form the first plan as rows on Decide -> 8bdca5132ff466b5'],
  },
};

/** The shortest a reason may be. The value it justifies is sixteen characters, and a reason has to be worth more room than that. */
const REASON_FLOOR = 40;

/** A history line: what moved, then the value it set. */
const LINE = /^(.+) -> ([0-9a-f]{16})$/u;

/** A reason has to name something the use case declares, in backticks, with or without its kind in front. */
const cites = (why: string, holds: readonly string[]): boolean =>
  holds.some((id) => why.includes(`\`${id}\``) || why.includes(`\`${id.slice(id.indexOf('.') + 1)}\``));

/**
 * WHAT IS WRONG WITH ONE ENTRY, in the words the next person needs, and nothing when nothing is. `current` says
 * whether this is the version the use case is on now: a retired entry is still held to its shape, because its
 * history is the record of what that label meant, but only the current one is held to what the use case declares
 * today.
 *
 * ONE FUNCTION RATHER THAN ASSERTIONS INLINE, so that the second test below can drive every refusal over an entry
 * made up for the purpose. A guard nobody has watched refuse is a guard nobody has tested.
 */
function wrong(key: string, entry: Version | undefined, live: { holds: readonly string[]; declares: string; current: boolean }): string[] {
  const said: string[] = [];
  if (entry === undefined)
    return [`${key} is not in DECLARED. Add an entry with declares: '${live.declares}', the ids it holds, and a line of history saying what set it. Its ids are: ${live.holds.join(' ')}`];

  /* WHAT A RECORD HOLDS FIRST, because this is the question the fingerprint answers with the same sentence as a
     reworded heading, and the two want opposite moves. */
  if (entry.holds === undefined) {
    if (live.current) said.push(`${key} records no ids, and the version a use case is on has to: holds: '${live.holds.join(' ')}'`);
  } else if (live.current) {
    const was = new Set(ids(entry.holds));
    const gained = live.holds.filter((i) => !was.has(i));
    const lost = [...was].filter((i) => !live.holds.includes(i)).sort();
    if (gained.length > 0 || lost.length > 0)
      said.push(
        `${key} ${[gained.length > 0 ? `gained ${gained.join(', ')}` : '', lost.length > 0 ? `lost ${lost.join(', ')}` : ''].filter((s) => s !== '').join(' and ')}. That is a declaration a record on ${key} does not have and can never be told about, so there is no fingerprint to set again for it: raise the use case's version in its own file and give the new one its own entry here.`,
      );
  }

  /* THEN THE HISTORY, whose last line is where the current value has to be said a second time. */
  if (entry.history === undefined || entry.history.length === 0) {
    if (live.current) said.push(`${key} has no history, and the version a use case is on has to: one line saying what set '${entry.declares}', ending in it.`);
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
        said.push(`${key} names nothing the use case declares in its reason for ${set}. Put the id whose words moved in backticks, one of ${live.holds.slice(0, 3).join(', ')} and the rest.`);
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
      `${key} declares something else now. If ${key.slice(key.indexOf('@') + 1)} has not been released, set declares to '${live.declares}' and append a history line saying which change moved it, ending in that value; if it has been released, raise the use case's version.`,
    );
  return said;
}

/** The document a record installs for a use case, or `null` when the use case carries no pack. */
const documentOf = (id: string): Doc | null => useCaseDocument(id, TODAY) as Doc | null;

test('EACH STARTER USE CASE DECLARES WHAT ITS VERSION SAYS, and one that changed has a version of its own', () => {
  const said: string[] = [];
  const carried: string[] = [];
  for (const u of USE_CASES) {
    const doc = documentOf(u.usecase);
    /* A USE CASE WITH NO PACK DECLARES NOTHING, so there is nothing a record could be stranded on. */
    if (doc === null) continue;
    carried.push(u.usecase);
    if (doc.version !== u.version) said.push(`${u.usecase}: the document says ${String(doc.version)} and the use case says ${u.version}`);
    said.push(...wrong(`${u.usecase}@${u.version}`, DECLARED[`${u.usecase}@${u.version}`], { holds: inventory(doc), declares: fingerprint(doc), current: true }));
  }
  /* THE ONE THAT CARRIES NO PACK IS NAMED, so that a use case losing its pack by accident is not read as deliberate. */
  assert.deepEqual(USE_CASES.map((u) => u.usecase).filter((id) => !carried.includes(id)), ['business']);

  /* AND EVERY RETIRED ENTRY IS HELD TO THE SAME SHAPE, because its history is the only record left of what that label
     meant on the day a record installed it, and a history with a line nobody wrote is not a record. */
  for (const [key, entry] of Object.entries(DECLARED)) {
    const id = key.slice(0, key.indexOf('@'));
    const u = USE_CASES.find((x) => x.usecase === id);
    if (u === undefined) {
      said.push(`${key} is in DECLARED and ${id} is not a use case this build ships.`);
      continue;
    }
    if (key === `${id}@${u.version}`) continue;
    const doc = documentOf(id);
    said.push(...wrong(key, entry, { holds: doc ? inventory(doc) : [], declares: entry.declares, current: false }));
  }
  assert.deepEqual(said, []);
});

/**
 * THE GUARD'S OWN REFUSALS, driven over entries made up for the purpose.
 *
 * WRITTEN BECAUSE THE THING THIS GUARDS WENT UNGUARDED FOR NINE EDITS OF `founder.ts` and nobody noticed until an
 * audit mutated a label and watched 182 tests stay green. Every rule the comments above claim is enforced is
 * exercised here with the smallest entry that breaks it, so that a rule quietly dropped from `wrong()` takes a test
 * with it rather than going unnoticed until the next audit reads the diff.
 */
test('THE GUARD REFUSES AN ENTRY WITH NO REASON BESIDE ITS FINGERPRINT, and names which rule the entry broke', () => {
  const live = { holds: ['register.organisations', 'setting.voice_home'], declares: 'aaaaaaaaaaaaaaaa', current: true };
  const ok = {
    holds: 'register.organisations setting.voice_home',
    declares: 'aaaaaaaaaaaaaaaa',
    history: ['An organisation says which currency it keeps, which is a field on `organisations` -> aaaaaaaaaaaaaaaa'],
  } satisfies Version;
  const one = (entry: Version, over: Partial<typeof live> = {}): string => wrong('made-up@1.1.0', entry, { ...live, ...over }).join(' | ');

  assert.deepEqual(wrong('made-up@1.1.0', ok, live), [], 'the entry every case below breaks is itself refused');

  /* THE HALF A HASH COULD NOT SEE. A declaration appearing or vanishing has no reset: it has a version. */
  assert.match(one({ ...ok, holds: 'register.organisations' }), /setting\.voice_home/u);
  assert.match(one({ ...ok, holds: 'register.organisations setting.voice_home page.made-up' }), /page\.made-up/u);
  assert.match(one({ ...ok, holds: 'register.organisations' }), /raise the use case's version/iu);
  assert.match(one({ declares: ok.declares, history: ok.history }), /records no ids/u);

  /* THE RESET THAT COSTS NOTHING. A fingerprint moved with the history left alone is the whole finding. */
  assert.match(one({ ...ok, declares: 'bbbbbbbbbbbbbbbb' }, { declares: 'bbbbbbbbbbbbbbbb' }), /its last history line set aaaaaaaaaaaaaaaa/u);
  assert.match(one({ holds: ok.holds, declares: ok.declares }), /no history/u);
  assert.match(one({ ...ok, history: [] }), /no history/u);

  /* A LINE THAT IS NOT A REASON. Too short, no fingerprint, or a sentence naming nothing the use case declares. */
  assert.match(one({ ...ok, history: ['copy -> aaaaaaaaaaaaaaaa'] }), /characters of reason/u);
  assert.match(one({ ...ok, history: ['aaaaaaaaaaaaaaaa'] }), /not "<what moved> -> <fingerprint>"/u);
  assert.match(one({ ...ok, history: ['Something about the use case that names none of its declarations -> aaaaaaaaaaaaaaaa'] }), /names nothing the use case declares/u);

  /* AND THE OBVIOUS WAY ROUND THE LINE: append one that repeats a value already listed. */
  assert.match(
    one({ ...ok, history: [...ok.history, 'A second line saying the same thing about `organisations` again -> aaaaaaaaaaaaaaaa'] }),
    /lists aaaaaaaaaaaaaaaa twice/u,
  );

  /* AND AN ENTRY FOR A VERSION NOBODY IS ON IS HELD TO ITS SHAPE, with what the use case declares today left out of it:
     no ids are asked for, the reason need not cite a declaration that may since have gone, and the line still has to
     be a line ending in the value this entry declares. */
  const retired = ['The organisations list arrived with the currency it keeps -> cccccccccccccccc'];
  assert.deepEqual(wrong('made-up@1.0.0', { declares: 'cccccccccccccccc', history: retired }, { ...live, current: false }), []);
  assert.match(
    wrong('made-up@1.0.0', { declares: 'cccccccccccccccc', history: [...retired, 'And a second line that moved it again, saying so at length -> dddddddddddddddd'] }, { ...live, current: false }).join(' | '),
    /its last history line set dddddddddddddddd/u,
  );
  assert.match(
    wrong('made-up@1.0.0', { declares: 'cccccccccccccccc', history: ['short -> cccccccccccccccc'] }, { ...live, current: false }).join(' | '),
    /characters of reason/u,
  );
});

/**
 * THE AUDIT'S OWN MUTATION, KEPT, so that what was measured by hand once is measured on every run.
 *
 * `loop/research-batch-three-audit.md` finding 6 changed the `datapoints-30d` cell label on the founder's dashboard
 * from "Reported, 30 days" to "Reported in the last 30 days", left `version` at 1.3.2, and watched `packages/seed`
 * stay at 182 tests, 182 pass, 0 fail. The same rename is made here over a copy of the document rather than over
 * `founder.ts`, which is what makes it a test rather than a thing somebody did once: the words a record prints move,
 * no id appears or vanishes, and the refusal that comes back is the one that says raise the version or say what moved.
 */
test("A RENAMED LABEL WITH THE VERSION LEFT ALONE IS WHAT THIS REFUSES, over the founder's own document", () => {
  const u = useCase('founder')!;
  const doc = documentOf(u.usecase)!;
  const key = `${u.usecase}@${u.version}`;
  const entry = DECLARED[key]!;
  assert.deepEqual(wrong(key, entry, { holds: inventory(doc), declares: fingerprint(doc), current: true }), [], 'the entry is right before any word is moved');

  const renamed = JSON.parse(JSON.stringify(doc).replace('"Reported, 30 days"', '"Reported in the last 30 days"')) as Doc;
  assert.notEqual(fingerprint(renamed), fingerprint(doc), 'the label the audit moved is inside the fingerprint');
  assert.deepEqual(inventory(renamed), inventory(doc), 'only a word moved: nothing appeared and nothing vanished');

  const said = wrong(key, entry, { holds: inventory(renamed), declares: fingerprint(renamed), current: true });
  assert.equal(said.length, 1, said.join(' | '));
  assert.match(said[0]!, /declares something else now/u);
  assert.match(said[0]!, /raise the use case's version/u);
});
