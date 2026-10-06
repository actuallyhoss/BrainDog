/**
 * Each starter use case's version against what its pack declares (`version` in `src/usecases/<id>.ts`).
 *
 * A RECORD IS OFFERED AN UPDATE ONLY WHEN A VERSION GOES UP, and that is as true of a use case as of a first-party
 * pack. Until this file nothing in the tree held a use case to it. A mutation
 * showed the hole: changing the label on the founder's thirty-day tile with `version` left at 1.3.2 left
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

type Doc = { version?: unknown; declarations?: unknown; config?: unknown; extends?: unknown };

/**
 * AND WHAT IT LAYS ON ANOTHER PACK'S LIST, when it lays anything. Personal 1.5.0's roles are values on People's `role`
 * (`extends`), which reach every record that holds the use case exactly as a declaration does, and a fingerprint of the
 * declarations and settings alone did not move when they changed. Left out when absent, so every use case that lays
 * nothing keeps the value it had.
 */
const fingerprint = (d: Doc): string =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null, ...(d.extends === undefined ? {} : { extends: d.extends }) }))
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
  /* EACH FIELD AND VALUE IT LAYS ON ANOTHER PACK'S LIST, as `extends.<list>.<field>` and `extends.<list>.<field>.<value>`:
     a value appearing there is one a record's picker offers from then on, and one vanishing is not taken back off. */
  ...Object.entries((doc.extends ?? {}) as Record<string, { fields?: { id: string }[]; values?: Record<string, string[]> }>).flatMap(([list, ext]) => [
    ...(ext.fields ?? []).map((f) => `extends.${list}.${f.id}`),
    ...Object.entries(ext.values ?? {}).flatMap(([field, values]) => values.map((v) => `extends.${list}.${field}.${v}`)),
  ]),
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
  /**
   * FIVE LABEL SETTINGS GONE AND FIVE VALUES LAID, which is why this is a version and not a reset: `holds` lost
   * `label_people__role__*` and gained `extends.register.people.role.*`. Personal read the studio's roles in a person's
   * words (`client` as Family) and the list could not take the word itself; now the words are People's values.
   */
  'personal@1.5.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      metric.bills-this-week metric.budget-each-month metric.logged-by-goal metric.logged-this-week-by-goal
      metric.put-by-by-goal metric.saved-toward-goals metric.spent-this-month metric.spent-this-month-by-category
      page.goals page.home-personal page.my-project page.spending
      register.budgets register.goal_log register.goals register.project_steps register.put_by register.savings_goals
      register.spending
      setting.holds_obligations setting.holds_people setting.holds_things
      setting.label_budgets setting.label_goal_log setting.label_goals setting.label_obligations
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
    declares: '6307c93218c5ee3a',
    history: ['Raised to 1.5.0 because Personal lays family, friend, landlord, tradesperson and adviser on `register.people.role.family` and its neighbours through extends, and its relabels of the studio roles went -> 6307c93218c5ee3a'],
  },
  /*
   * FIVE LABEL SETTINGS BACK, OVER THE STUDIO'S ROLES AND IN NONE OF PERSONAL'S FIVE WORDS: `label_people__role__*`
   * reads client as Work contact and registrar as Agency, so a household's picker says no studio word and no word twice.
   */
  'personal@1.6.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
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
    declares: 'b9dd1fb6bdf96673',
    history: ['Raised to 1.6.0 because Personal relabels the studio roles, `setting.label_people__role__client` and its four neighbours, in words a household uses, none of them one of its own five -> b9dd1fb6bdf96673'],
  },
  'personal@1.7.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      metric.bills-this-week metric.budget-each-month metric.logged-by-goal metric.logged-this-week-by-goal
      metric.put-by-by-goal metric.saved-toward-goals metric.spent-this-month metric.spent-this-month-by-category
      page.goals page.home-personal page.my-project page.spending
      register.budgets register.goal_log register.goals register.project_steps register.put_by register.savings_goals
      register.spending
      setting.holds_obligations setting.holds_people setting.holds_things
      setting.label_budgets setting.label_goal_log setting.label_goals setting.label_obligations
      setting.label_people__role__accountant setting.label_people__role__client setting.label_people__role__collaborator
      setting.label_people__role__contractor
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
    declares: 'a50db125a0a2beb1',
    history: [
      'The studio roles Personal relabels, `setting.label_people__role__client` and its siblings, lose their fifth: the `registrar` label went, because People 2.0.0 no longer offers the value -> a50db125a0a2beb1',
    ],
  },
  'personal@1.7.1': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      metric.bills-this-week metric.budget-each-month metric.logged-by-goal metric.logged-this-week-by-goal
      metric.put-by-by-goal metric.saved-toward-goals metric.spent-this-month metric.spent-this-month-by-category
      page.goals page.home-personal page.my-project page.spending
      register.budgets register.goal_log register.goals register.project_steps register.put_by register.savings_goals
      register.spending
      setting.holds_obligations setting.holds_people setting.holds_things
      setting.label_budgets setting.label_goal_log setting.label_goals setting.label_obligations
      setting.label_people__role__accountant setting.label_people__role__client setting.label_people__role__collaborator
      setting.label_people__role__contractor
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
    declares: '1e9eb57c702e9659',
    history: ["Home's empty title, `setting.voice_nothing_needs_you`, loses its closing full stop, as every other title already has -> 1e9eb57c702e9659"],
  },
  /**
   * SPENDING AND BUDGETS GONE, AND HOME REBUILT: money-core's own Money now keeps what Personal's own `spending` and
   * `budgets` kept, so this use case drops its copies and `page.home-personal` is rebuilt to lead with what a person
   * has, bills due this week, budget left, projects and goals.
   */
  'personal@2.0.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      metric.logged-by-goal metric.logged-this-week-by-goal metric.put-by-by-goal metric.saved-toward-goals
      page.goals page.home-personal page.my-project
      register.goal_log register.goals register.project_steps register.put_by register.savings_goals
      setting.holds_obligations setting.holds_people setting.holds_things setting.label_goal_log setting.label_goals
      setting.label_obligations setting.label_people__role__accountant setting.label_people__role__client
      setting.label_people__role__collaborator setting.label_people__role__contractor setting.label_project_steps setting.label_put_by
      setting.label_savings_goals setting.label_things setting.label_things__lane__building setting.label_things__lane__earning
      setting.label_things__lane__parked setting.label_things__lane__retired setting.label_things__revenue setting.lk_10103af7
      setting.lk_1d01726f setting.lk_303a3cce setting.lk_4f9bf906 setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a
      setting.lk_f625eca1 setting.one_obligations setting.one_things setting.shared_version setting.speaks setting.voice_home
      setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
    `,
    declares: 'b9d9129104f32581',
    history: [
      "Spending and budgets move into Money, so `register.spending`, `register.budgets` and `page.spending` are gone, and `page.home-personal` is rebuilt to show what you have, bills this week, budget left, projects and goals -> b9d9129104f32581",
    ],
  },
  'personal@2.1.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      metric.logged-by-goal metric.logged-this-week-by-goal metric.put-by-by-goal metric.saved-toward-goals
      page.goals page.home-personal page.my-project
      register.goal_log register.goals register.project_steps register.put_by register.savings_goals
      setting.holds_obligations setting.holds_people setting.holds_things setting.label_goal_log setting.label_goals
      setting.label_obligations setting.label_people__role__accountant setting.label_people__role__client
      setting.label_people__role__collaborator setting.label_people__role__contractor setting.label_project_steps setting.label_put_by
      setting.label_savings_goals setting.label_things setting.label_things__lane__building setting.label_things__lane__earning
      setting.label_things__lane__parked setting.label_things__lane__retired setting.label_things__revenue setting.lk_10103af7
      setting.lk_1d01726f setting.lk_303a3cce setting.lk_4f9bf906 setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a
      setting.lk_f625eca1 setting.one_obligations setting.one_things setting.shared_version setting.speaks setting.voice_home
      setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
      setting.voice_add_first setting.voice_fills_with setting.voice_inbox_clear setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_now setting.voice_overdue setting.voice_record_empty
    `,
    declares: '3683b158aeed6965',
    history: [
      "Home, Decide, the Inbox and the add buttons now speak in your use case's own words: `setting.voice_add_first`, `setting.voice_fills_with`, `setting.voice_inbox_clear`, `setting.voice_no_questions`, `setting.voice_nothing_due`, `setting.voice_nothing_now`, `setting.voice_overdue` and `setting.voice_record_empty` -> 3683b158aeed6965",
    ],
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
  'student@1.2.1': {
    holds: `
      page.home-student page.studies register.assignments register.courses register.study_sessions
      setting.label_assignments setting.label_courses setting.label_study_sessions
      setting.one_assignments setting.one_courses setting.one_study_sessions
      setting.shared_version setting.speaks
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: 'e13772efff3d1072',
    history: ["Home's empty title, `setting.voice_nothing_needs_you`, loses its closing full stop, as every other title already has -> e13772efff3d1072"],
  },
  /** `page.home-student` IS REBUILT, and its list word changes: `setting.voice_lists` now reads My lists instead of the old word. */
  'student@1.3.0': {
    holds: `
      page.home-student page.studies
      register.assignments register.courses register.study_sessions
      setting.label_assignments setting.label_courses setting.label_study_sessions setting.one_assignments setting.one_courses
      setting.one_study_sessions setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
    `,
    declares: 'cef74e3cf79aaa37',
    history: [
      "`page.home-student` is rebuilt, and `setting.voice_lists` now reads My lists in place of the word Student used before -> cef74e3cf79aaa37",
    ],
  },
  'student@1.4.0': {
    holds: `
      page.home-student page.studies
      register.assignments register.courses register.study_sessions
      setting.label_assignments setting.label_courses setting.label_study_sessions setting.one_assignments setting.one_courses
      setting.one_study_sessions setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
      setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_inbox_clear setting.voice_new_row
      setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits
      setting.voice_record_empty
    `,
    declares: 'c0df0a7904145c86',
    history: [
      "Home, Decide, the Inbox and the add buttons now speak in your use case's own words: `setting.voice_add_first`, `setting.voice_coming_up`, `setting.voice_fills_with`, `setting.voice_inbox_clear`, `setting.voice_new_row`, `setting.voice_no_questions`, `setting.voice_nothing_due`, `setting.voice_nothing_now`, `setting.voice_overdue`, `setting.voice_pen_waits` and `setting.voice_record_empty` -> c0df0a7904145c86",
    ],
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
  /**
   * THE SAME IDS AS 1.3.2, AND A NEW VERSION ALL THE SAME. Estate is a module the use case names, not a declaration of
   * its own pack, so `services` is not in this list and `holds` could not see the change. What moved is inside
   * `page.project`: it is taken from Portfolio's template with services held, so it draws Keeping it alive and the
   * Costs a year tile, and it requires `register.services`, which a record on 1.3.2 does not hold until Estate is in.
   */
  'founder@1.4.0': {
    holds: `
      metric.datapoints-30d page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: '15c1f37be2561258',
    history: ["Raised to 1.4.0 because Solo founder installs Estate, so `page.project` draws a project's services and what they cost a year, and requires the services list -> 15c1f37be2561258"],
  },
  /**
   * THE SAME IDS AGAIN, AND AGAIN A NEW VERSION. What moved is inside `page.home-founder`: two tables, one of them
   * Money's own Due this week taken by reference, and a `requires` that now names `register.services`. So an edit to
   * that block in `modules/money.ts` moves this fingerprint too, which is the watch the note above DECLARED asks for.
   */
  'founder@1.5.0': {
    holds: `
      metric.datapoints-30d page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: 'b3550baded7ee204',
    history: ["Raised to 1.5.0 because `page.home-founder` draws Money's Due this week and a Lapsing table over Estate's services, and requires the services list -> b3550baded7ee204"],
  },
  'founder@1.5.1': {
    holds: `
      metric.datapoints-30d page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: '0dab9110c0bce0d0',
    history: [
      "Home's empty title, `setting.voice_nothing_needs_you`, loses its closing full stop, and `page.home-founder` takes Due this week from Money by name since money-core 3.0.0 retired Money's own Home -> 0dab9110c0bce0d0",
    ],
  },
  'founder@1.6.0': {
    holds: `
      metric.datapoints-30d page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: 'fb63016ae24fe5a5',
    history: [
      "`page.project` takes portfolio 1.5.0's project template: the questions waiting on a project, what changed on it, its plan and its money by month -> fb63016ae24fe5a5",
    ],
  },
  /** THE SAME IDS AS 1.6.0: what moved is the words inside them, not the list. */
  'founder@1.7.0': {
    holds: `
      metric.datapoints-30d
      page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
    `,
    declares: '62cf765a92427d27',
    history: [
      "`page.home-founder` leads with What you have, by book or organisation, and the week's numbers; `page.dashboard` renames Datapoints to Numbers and lists to Lists; `page.organisation` lists its projects -> 62cf765a92427d27",
    ],
  },
  'founder@1.8.0': {
    holds: `
      metric.datapoints-30d
      page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
      setting.voice_coming_up setting.voice_fills_with setting.voice_inbox_clear setting.voice_no_questions
      setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue setting.voice_pen_waits
      setting.voice_working_now
    `,
    declares: '51db7a7065cc95c7',
    history: [
      "`page.dashboard` and `page.project` open with one sentence said from their figures first and keep a rail; `Send numbers here` on `page.organisation` and `page.project` says `panel: reporting` -> 3755a69ec8c3ff98",
      "Home, Decide, the Inbox and the add buttons now speak in your use case's own words: `setting.voice_working_now`, `setting.voice_coming_up`, `setting.voice_overdue`, `setting.voice_nothing_now`, `setting.voice_nothing_waiting`, `setting.voice_fills_with`, `setting.voice_no_questions`, `setting.voice_inbox_clear` and `setting.voice_pen_waits` -> b78dfb33a2490526",
      "A later pass renamed `page.home-founder`'s Working now columns from `as` to `label`, the shape every other table on the page already used (`agent`, `doing`, `last_seen`) -> 51db7a7065cc95c7",
    ],
  },
  /** THE SAME IDS AS 1.8.0, and a version because 1.8.0 is on `origin/master` (`bfe14e39`): what moved is inside `page.project`. */
  'founder@1.9.0': {
    holds: `
      metric.datapoints-30d
      page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
      setting.voice_coming_up setting.voice_fills_with setting.voice_inbox_clear setting.voice_no_questions
      setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue setting.voice_pen_waits
      setting.voice_working_now
    `,
    declares: 'fa99bd60f9e8a1cb',
    history: [
      "`page.project` takes portfolio 1.6.0's project template: the open work tallied by priority, the month's money in, out and kept beside the money by month, the dated work as weeks above the plan, the questions as tiles and what it runs on as cards in the rail -> fa99bd60f9e8a1cb",
    ],
  },
  'founder@1.10.0': {
    holds: `
      metric.datapoints-30d
      page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
      setting.voice_coming_up setting.voice_fills_with setting.voice_inbox_clear setting.voice_no_questions
      setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue setting.voice_pen_waits
      setting.voice_working_now
    `,
    declares: 'fc6b2ff202345346',
    history: [
      "`page.project` takes work 1.10.0's project template: what was finished on the project each week as a chart, over `project-done-by-week`, in place of the open work tallied by priority -> fc6b2ff202345346",
    ],
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
  /**
   * THE SAME IDS AS 2.3.0, WORD FOR WORD, and that is the point of this entry: nothing appeared and nothing vanished,
   * so `holds` could not have caught this and only the fingerprint did. What moved is inside `page.home-team`: the
   * clause under Due this week, which now takes out what the two headings above it have already drawn, one column
   * added to In flight so that a ticket held back from Due this week still says its date, and the empty line under Due
   * this week, which used to claim nothing was due while two headings above it were full of dates.
   */
  'team@2.4.0': {
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
    declares: '96ace671f9e7f0e6',
    history: ['Raised to 2.4.0 because `home-team` drew a blocked ticket due inside the week under Blocked and again under Due this week, and In flight now carries the due day that holding it back would otherwise have taken off the page -> 96ace671f9e7f0e6'],
  },
  'team@2.4.1': {
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
    declares: '177854b0f15b0158',
    history: ["Home's empty title, `setting.voice_nothing_needs_you`, loses its closing full stop, as every other title already has -> 177854b0f15b0158"],
  },
  'team@2.5.0': {
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
    declares: '35c567fe0cc7cd90',
    history: [
      "`page.project` takes portfolio 1.5.0's project template: the questions waiting on a project, what changed on it, its plan and its money by month -> 35c567fe0cc7cd90",
    ],
  },
  /** A CYCLE'S LENGTH IS A RECORD'S OWN CHOICE: `register.cycle_days` and `setting.label_cycle_days` are new. */
  'team@2.6.0': {
    holds: `
      page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles
      setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles
      setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review setting.one_tasks
      setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
    `,
    declares: 'a67b18591483c33e',
    history: [
      "`register.cycle_days` and `setting.label_cycle_days` land so a cycle's length is a record's own choice and not always fourteen days -> a67b18591483c33e",
    ],
  },
  'team@2.7.0': {
    holds: `
      page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles
      setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles
      setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review setting.one_tasks
      setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
      setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_inbox_clear
      setting.voice_no_questions setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_working_now
    `,
    declares: 'aae35cd290866704',
    history: [
      "`page.project` takes Projects' rail and opening sentence -> 53410df0154d63a0",
      "Home, Decide, the Inbox and the add buttons now speak in your use case's own words: `setting.voice_add_first`, `setting.voice_coming_up`, `setting.voice_fills_with`, `setting.voice_inbox_clear`, `setting.voice_no_questions`, `setting.voice_nothing_now`, `setting.voice_nothing_waiting`, `setting.voice_overdue`, `setting.voice_pen_waits` and `setting.voice_working_now` -> aae35cd290866704",
    ],
  },
  /** THE SAME IDS AS 2.7.0, and a version because 2.7.0 is on `origin/master` (`bfe14e39`): what moved is inside `page.project`. */
  'team@2.8.0': {
    holds: `
      page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles
      setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles
      setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review setting.one_tasks
      setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
      setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_inbox_clear
      setting.voice_no_questions setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_working_now
    `,
    declares: '1102c3039476f0ab',
    history: [
      "`page.project` takes portfolio 1.6.0's project template: the open tickets tallied by priority above the list of them, their dates as weeks above the plan, and the questions about the project as tiles -> 1102c3039476f0ab",
    ],
  },
  'team@2.9.0': {
    holds: `
      page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles
      setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles
      setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review setting.one_tasks
      setting.shared_version setting.speaks setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_nothing_needs_you setting.voice_right_now setting.voice_since_away
      setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_inbox_clear
      setting.voice_no_questions setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_working_now
    `,
    declares: 'fc93f116495a41d6',
    history: [
      "`page.project` takes work 1.10.0's project template: what was finished on the project each week as a chart, over `project-done-by-week`, in place of the open tickets tallied by priority -> fc93f116495a41d6",
    ],
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
  'guide@1.2.1': {
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
    declares: 'c78b79e54f66d0bd',
    history: ["Home's empty title, `setting.voice_nothing_needs_you`, loses its closing full stop, as every other title already has -> c78b79e54f66d0bd"],
  },
  /** A MILESTONE WHOSE DAY HAS COME OR GONE IS ASKED ABOUT: `rule.guide_milestone_passed` and `rule.guide_milestone_open` are new. */
  'guide@1.3.0': {
    holds: `
      metric.guide-choices-made metric.guide-choices-open metric.guide-idea-left metric.guide-idea-reached metric.guide-milestones
      metric.guide-milestones-reached metric.guide-steps-agents metric.guide-steps-blocked metric.guide-steps-done
      metric.guide-steps-done-7d metric.guide-steps-done-by-week metric.guide-steps-open
      page.guide page.home-guide page.milestone
      register.choices register.milestones register.resources register.steps
      rule.guide_milestone_open rule.guide_milestone_passed
      setting.label_choices setting.label_milestones setting.label_resources setting.label_steps setting.shared_version setting.speaks
      setting.start_next_milestone setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
    `,
    declares: '03af08efcd82cbc4',
    history: [
      "`rule.guide_milestone_passed` and `rule.guide_milestone_open` land so a milestone whose day has come or gone is asked about rather than sitting silent -> 03af08efcd82cbc4",
    ],
  },
  'guide@1.4.0': {
    holds: `
      metric.guide-choices-made metric.guide-choices-open metric.guide-idea-left metric.guide-idea-reached metric.guide-milestones
      metric.guide-milestones-reached metric.guide-steps-agents metric.guide-steps-blocked metric.guide-steps-done
      metric.guide-steps-done-7d metric.guide-steps-done-by-week metric.guide-steps-open
      page.guide page.home-guide page.milestone
      register.choices register.milestones register.resources register.steps
      rule.guide_milestone_open rule.guide_milestone_passed
      setting.label_choices setting.label_milestones setting.label_resources setting.label_steps setting.shared_version setting.speaks
      setting.start_next_milestone setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_nothing_needs_you
      setting.voice_right_now setting.voice_since_away
      setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_new_row setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits setting.voice_record_empty
    `,
    declares: '4504c6606816acae',
    history: [
      "Home, Decide, the Inbox and the add buttons now speak in your use case's own words: `setting.voice_add_first`, `setting.voice_coming_up`, `setting.voice_fills_with`, `setting.voice_new_row`, `setting.voice_no_questions`, `setting.voice_nothing_due`, `setting.voice_nothing_now`, `setting.voice_overdue`, `setting.voice_pen_waits` and `setting.voice_record_empty` -> 4504c6606816acae",
    ],
  },
  /** SMALL BUSINESS NOW CARRIES A PACK: it had none before, so this is its first entry and not a reset. */
  'business@1.2.0': {
    holds: `
      page.home-business
      setting.shared_version setting.speaks
    `,
    declares: 'f897dcb6d0161fe1',
    history: [
      "Small business now carries a pack: `page.home-business` shows what you have, what is due this week and what needs your call -> f897dcb6d0161fe1",
    ],
  },
  'business@1.3.1': {
    holds: `
      page.home-business
      setting.shared_version setting.speaks
      setting.voice_coming_up setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: '2eedf30c3ef15c77',
    history: ["`page.home-business`'s Working now table labels its columns where it gave them card roles, which only a cards block reads and the record refused -> 2eedf30c3ef15c77"],
  },
  'business@1.3.0': {
    holds: `
      page.home-business
      setting.shared_version setting.speaks
      setting.voice_coming_up setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: '8aff433fb66740ab',
    history: [
      "Home now speaks in your use case's own words: `setting.voice_coming_up`, `setting.voice_fills_with` and `setting.voice_nothing_due` -> 8aff433fb66740ab",
    ],
  },
  /* THE CALM PAGES OF OCTOBER 2nd (DIRECTION §35): each use case's last version is on `origin/master`, so these are versions and not resets. */
  'business@1.4.0': {
    holds: `
      page.home-business
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: '2f3916a53302a82b',
    history: [
      "`page.home-business` opens on one line of what needs your call, every heading wears a glyph, and its questions are drawn only while one is asked -> 2f3916a53302a82b",
    ],
  },
  'founder@1.11.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-held metric.due-this-week metric.organisations-held
      page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'd31dacd4bde48875',
    history: [
      "`page.home-founder` opens on one line of the cash there is where a tile of four stood, every heading wears a glyph, Due this week and Lapsing are drawn only while they hold something, over the new `due-this-week`, `page.dashboard` folds every number and organisation under a new section, and `page.project` takes portfolio 1.8.0's template -> c890c842e559e6ee",
      "`setting.voice_lists` reads Your things where it said Lists, the system's word set back over the rail's own heading -> d31dacd4bde48875",
    ],
  },
  /** A VERSION AND NOT A RESET: founder 1.11.0 is live. */
  'founder@1.12.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-held metric.due-this-week metric.organisations-held
      page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'ad4775fd7806a018',
    history: [
      "`page.project` takes portfolio 1.9.0's template: it opens on a line in every case, the work handed back when there is any and otherwise the project's next step, and Where it stands no longer says that step a second time -> ba3b81dc6ead3aad",
      "`page.project` gates Waiting on you on `questions-open:{{spoken}}`, so a project with nothing asked about it draws no band -> ad4775fd7806a018",
    ],
  },
  /** A VERSION AND NOT A RESET: founder 1.12.0 is live. */
  'founder@1.13.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-held metric.due-this-week metric.organisations-held
      page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '7d1f8294e5b27fcb',
    history: [
      "`page.project` takes portfolio 1.10.0's template: Where it stands and Handed back or blocked sit in the rail beside Done, by week, which takes the main column, What is open goes since the plan draws the same tasks, and Handed back or blocked is drawn on `project-held-up` -> 7d1f8294e5b27fcb",
    ],
  },
  /** A VERSION AND NOT A RESET: founder 1.13.0 is live. */
  'founder@1.14.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-held metric.due-this-week metric.organisations-held
      page.dashboard page.home-founder page.organisation page.project
      register.datapoints register.organisations
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '4af90534d88ddd3f',
    history: [
      "`page.project` takes portfolio 1.12.0's template: its line is the next step alone, Where it stands is headed by how it is going with the agent last, and Handed back or blocked is a to-do with no Changed by -> 4af90534d88ddd3f",
    ],
  },
  'guide@1.5.0': {
    holds: `
      metric.guide-choices-made metric.guide-choices-open metric.guide-idea-left metric.guide-idea-reached
      metric.guide-milestones metric.guide-milestones-reached metric.guide-milestones-underway metric.guide-resources
      metric.guide-steps-agents metric.guide-steps-blocked metric.guide-steps-done metric.guide-steps-done-7d
      metric.guide-steps-done-by-week metric.guide-steps-open metric.milestone-choices metric.milestone-resources
      metric.milestone-steps
      page.guide page.home-guide page.milestone
      register.choices register.milestones register.resources register.steps
      rule.guide_milestone_open rule.guide_milestone_passed
      setting.label_choices setting.label_milestones setting.label_resources setting.label_steps setting.shared_version
      setting.speaks setting.start_next_milestone setting.voice_add_first setting.voice_coming_up setting.voice_fills_with
      setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_new_row setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue
      setting.voice_pen_waits setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '92ac75caf5943601',
    history: [
      "`page.home-guide` and `page.guide` open on one line said from the guide's figures, the Guide's tile of four goes into it, every heading wears a glyph, each list is drawn only while it holds something, the Guide folds what is done and kept, and `page.milestone` draws its lists over the new `milestone-steps`, `milestone-choices` and `milestone-resources` -> 92ac75caf5943601",
    ],
  },
  'personal@2.2.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      metric.budgets-set metric.goal-log-held metric.goals-active metric.goals-held metric.habits-active
      metric.logged-by-goal metric.logged-this-week-by-goal metric.put-by-by-goal metric.put-by-held
      metric.saved-toward-goals metric.savings-active metric.steps-done metric.steps-left
      page.goals page.home-personal page.my-project
      register.goal_log register.goals register.project_steps register.put_by register.savings_goals
      setting.holds_obligations setting.holds_people setting.holds_things setting.label_goal_log setting.label_goals
      setting.label_obligations setting.label_people__role__accountant setting.label_people__role__client
      setting.label_people__role__collaborator setting.label_people__role__contractor setting.label_project_steps
      setting.label_put_by setting.label_savings_goals setting.label_things setting.label_things__lane__building
      setting.label_things__lane__earning setting.label_things__lane__parked setting.label_things__lane__retired
      setting.label_things__revenue setting.lk_10103af7 setting.lk_1d01726f setting.lk_303a3cce setting.lk_4f9bf906
      setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a setting.lk_f625eca1 setting.one_obligations
      setting.one_things setting.shared_version setting.speaks setting.voice_add_first setting.voice_fills_with
      setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '79487cc2b08095a7',
    history: [
      "`page.home-personal` opens on one line said from Money's figures where a tile of three stood, what needs you comes first, Coming up is the one list of what falls due where Bills this week drew the same bills again, each track is drawn only while it has something and what changed is folded shut; `page.goals` and `page.my-project` open on a line; every heading wears a glyph; nine counts are added to draw them on, `budgets-set` among them -> 4d6965ce8afdc0ca",
      "`setting.voice_lists` reads My things where it said My lists, so the rail's heading names what you keep and not how it is stored -> 79487cc2b08095a7",
    ],
  },
  'student@1.5.0': {
    holds: `
      metric.courses-held metric.homework-due-7d metric.homework-later metric.homework-open metric.study-done-12w
      metric.study-held
      page.home-student page.studies
      register.assignments register.courses register.study_sessions
      setting.label_assignments setting.label_courses setting.label_study_sessions setting.one_assignments
      setting.one_courses setting.one_study_sessions setting.shared_version setting.speaks setting.voice_add_first
      setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists
      setting.voice_needs_you setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '454996961e56245c',
    history: [
      "`page.home-student` and `page.studies` open on one line said from new counts, `homework-open` among them, every heading wears a glyph, each list is drawn only while it holds something, and Studies draws what is due once, on the board -> 7788553dcdf73875",
      "`setting.voice_lists` reads My things where it said My lists, so the rail's heading names a student's courses and homework and not how they are stored -> 454996961e56245c",
    ],
  },
  'student@1.5.1': {
    holds: `
      metric.courses-held metric.homework-due-7d metric.homework-later metric.homework-open metric.study-done-12w
      metric.study-held
      page.home-student page.studies
      register.assignments register.courses register.study_sessions
      setting.label_assignments setting.label_courses setting.label_study_sessions setting.one_assignments
      setting.one_courses setting.one_study_sessions setting.shared_version setting.speaks setting.voice_add_first
      setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists
      setting.voice_needs_you setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '818fcec8f17d2019',
    history: [
      "Each list's name and one of it, `setting.label_courses` and `setting.one_courses` among them, are titled by what the list is called where they read its id, \"Label: courses\", and every name is declared before any singular -> 818fcec8f17d2019",
    ],
  },
  'team@2.10.0': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken
      page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles
      setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles
      setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review
      setting.one_tasks setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: 'b0282fe5149e1e94',
    history: [
      "`page.home-team`, `page.cycles` and `page.agent-work` open on one line said from new counts of tickets, `tickets-blocked` among them, every heading wears a glyph, each list is drawn only while it holds a ticket, Home folds how the cycle is going, and `page.project` takes portfolio 1.8.0's template -> af38996e0bebb2b2",
      "`setting.voice_lists` reads Our things where it said Team lists, so the rail's heading names the team's tickets and not how they are stored -> b0282fe5149e1e94",
    ],
  },
  /** A VERSION AND NOT A RESET: team 2.10.0 is live. */
  'team@2.11.0': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken
      page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles
      setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles
      setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review
      setting.one_tasks setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: 'c80737c681cdbce4',
    history: [
      "`page.project` takes portfolio 1.9.0's template: it opens on a line in every case, the tickets handed back when there are any and otherwise the project's next step, and Where it stands no longer says that step a second time -> 569689661fd6d260",
      "`page.project` gates Waiting on you on `questions-open:{{spoken}}`, so a project with nothing asked about it draws no band -> c80737c681cdbce4",
    ],
  },
  /** A VERSION AND NOT A RESET: team 2.11.0 is live. */
  'team@2.12.0': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken
      page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles
      setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles
      setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review
      setting.one_tasks setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: 'db3a5e3f560f4f27',
    history: [
      "`page.project` takes portfolio 1.10.0's template: Where it stands and the tickets handed back sit in the rail beside Done, by week, What is open goes since the plan draws the same tickets, and Handed back or blocked is drawn on `project-held-up` -> db3a5e3f560f4f27",
    ],
  },
  /** A VERSION AND NOT A RESET: team 2.12.0 is live. */
  'team@2.13.0': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken
      page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles
      setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles
      setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review
      setting.one_tasks setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: 'c5289e93f09ad883',
    history: [
      "`page.project` takes portfolio 1.12.0's template: its line is the next step alone, Where it stands is headed by how it is going with the agent last, and Handed back or blocked is a to-do with no Changed by -> c5289e93f09ad883",
    ],
  },
  'personal@2.3.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson metric.budgets-set
      metric.goal-log-held metric.goals-active metric.goals-held metric.habits-active metric.logged-by-goal
      metric.logged-this-week-by-goal metric.put-by-by-goal metric.put-by-held metric.saved-toward-goals
      metric.savings-active metric.steps-done metric.steps-left page.goals page.home-personal page.my-project
      register.goal_log register.goals register.project_steps register.put_by register.savings_goals
      setting.holds_obligations setting.holds_people setting.holds_things setting.label_accounts setting.label_books
      setting.label_categories setting.label_goal_log setting.label_goals setting.label_installments
      setting.label_obligations setting.label_people setting.label_people__role__accountant
      setting.label_people__role__client setting.label_people__role__collaborator setting.label_people__role__contractor
      setting.label_project_steps setting.label_put_by setting.label_recurring setting.label_savings_goals
      setting.label_things setting.label_things__lane__building setting.label_things__lane__earning
      setting.label_things__lane__parked setting.label_things__lane__retired setting.label_things__revenue
      setting.label_transactions setting.lk_10103af7 setting.lk_1d01726f setting.lk_303a3cce setting.lk_4f9bf906
      setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a setting.lk_f625eca1 setting.one_accounts
      setting.one_books setting.one_categories setting.one_goal_log setting.one_goals setting.one_installments
      setting.one_obligations setting.one_people setting.one_project_steps setting.one_put_by setting.one_recurring
      setting.one_savings_goals setting.one_things setting.one_transactions setting.shared_version setting.speaks
      setting.voice_add_first setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists
      setting.voice_needs_you setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_needs_you
      setting.voice_nothing_now setting.voice_overdue setting.voice_record_empty setting.voice_right_now
      setting.voice_since_away
    `,
    declares: 'ff4d843704645b48',
    history: [
      "Every list Personal holds declares its name and one of it, `setting.label_people` and `setting.one_transactions` among them, with the words the record already shows as defaults, so Settings > Words can rename any of them -> ff4d843704645b48",
    ],
  },
  'personal@2.3.1': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson metric.budgets-set
      metric.goal-log-held metric.goals-active metric.goals-held metric.habits-active metric.logged-by-goal
      metric.logged-this-week-by-goal metric.put-by-by-goal metric.put-by-held metric.saved-toward-goals
      metric.savings-active metric.steps-done metric.steps-left page.goals page.home-personal page.my-project
      register.goal_log register.goals register.project_steps register.put_by register.savings_goals
      setting.holds_obligations setting.holds_people setting.holds_things setting.label_accounts setting.label_books
      setting.label_categories setting.label_goal_log setting.label_goals setting.label_installments
      setting.label_obligations setting.label_people setting.label_people__role__accountant
      setting.label_people__role__client setting.label_people__role__collaborator setting.label_people__role__contractor
      setting.label_project_steps setting.label_put_by setting.label_recurring setting.label_savings_goals
      setting.label_things setting.label_things__lane__building setting.label_things__lane__earning
      setting.label_things__lane__parked setting.label_things__lane__retired setting.label_things__revenue
      setting.label_transactions setting.lk_10103af7 setting.lk_1d01726f setting.lk_303a3cce setting.lk_4f9bf906
      setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a setting.lk_f625eca1 setting.one_accounts
      setting.one_books setting.one_categories setting.one_goal_log setting.one_goals setting.one_installments
      setting.one_obligations setting.one_people setting.one_project_steps setting.one_put_by setting.one_recurring
      setting.one_savings_goals setting.one_things setting.one_transactions setting.shared_version setting.speaks
      setting.voice_add_first setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists
      setting.voice_needs_you setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_needs_you
      setting.voice_nothing_now setting.voice_overdue setting.voice_record_empty setting.voice_right_now
      setting.voice_since_away
    `,
    declares: '268bbef9b5df127a',
    history: [
      "Each list's name and one of it, `setting.label_transactions` and `setting.one_transactions` among them, are titled by what the list is called where they read its id, \"Label: transactions\", and every name is declared before any singular -> 268bbef9b5df127a",
    ],
  },
  'founder@1.15.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-held metric.due-this-week metric.organisations-held page.dashboard
      page.home-founder page.organisation page.project register.datapoints register.organisations setting.label_accounts
      setting.label_books setting.label_categories setting.label_datapoints setting.label_installments
      setting.label_obligations setting.label_organisations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_organisations setting.one_people
      setting.one_recurring setting.one_services setting.one_tasks setting.one_things setting.one_tracks
      setting.one_transactions setting.one_updates setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: '85d1552b3560b066',
    history: [
      "Every list Founder holds declares its name and one of it, `setting.label_tasks` and `setting.one_tasks` among them, with the words the record already shows as defaults, so Settings > Words can rename any of them -> 85d1552b3560b066",
    ],
  },
  'team@2.14.0': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles setting.holds_people setting.holds_tasks
      setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people
      setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review
      setting.label_things setting.label_tracks setting.label_updates setting.one_cycle_days setting.one_cycle_plan
      setting.one_cycles setting.one_people setting.one_tasks setting.one_things setting.one_tracks setting.one_updates
      setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up setting.voice_fills_with
      setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: 'cc97ceef2fdaec44',
    history: [
      "Every list Team holds declares its name and one of it, `setting.label_tracks` and `setting.one_cycles` among them, with the words the record already shows as defaults, so Settings > Words can rename any of them -> cc97ceef2fdaec44",
    ],
  },
  'guide@1.6.0': {
    holds: `
      metric.guide-choices-made metric.guide-choices-open metric.guide-idea-left metric.guide-idea-reached
      metric.guide-milestones metric.guide-milestones-reached metric.guide-milestones-underway metric.guide-resources
      metric.guide-steps-agents metric.guide-steps-blocked metric.guide-steps-done metric.guide-steps-done-7d
      metric.guide-steps-done-by-week metric.guide-steps-open metric.milestone-choices metric.milestone-resources
      metric.milestone-steps page.guide page.home-guide page.milestone register.choices register.milestones
      register.resources register.steps rule.guide_milestone_open rule.guide_milestone_passed setting.label_choices
      setting.label_milestones setting.label_resources setting.label_steps setting.one_choices setting.one_milestones
      setting.one_resources setting.one_steps setting.shared_version setting.speaks setting.start_next_milestone
      setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_lists
      setting.voice_needs_you setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '8a53a1f76198266d',
    history: [
      "Every list the guide holds declares one of it beside its name, `setting.one_milestones` and `setting.one_steps` among them, with the words the record already shows as defaults, so Settings > Words can rename any of them -> 8a53a1f76198266d",
    ],
  },
  'guide@1.6.1': {
    holds: `
      metric.guide-choices-made metric.guide-choices-open metric.guide-idea-left metric.guide-idea-reached
      metric.guide-milestones metric.guide-milestones-reached metric.guide-milestones-underway metric.guide-resources
      metric.guide-steps-agents metric.guide-steps-blocked metric.guide-steps-done metric.guide-steps-done-7d
      metric.guide-steps-done-by-week metric.guide-steps-open metric.milestone-choices metric.milestone-resources
      metric.milestone-steps page.guide page.home-guide page.milestone register.choices register.milestones
      register.resources register.steps rule.guide_milestone_open rule.guide_milestone_passed setting.label_choices
      setting.label_milestones setting.label_resources setting.label_steps setting.one_choices setting.one_milestones
      setting.one_resources setting.one_steps setting.shared_version setting.speaks setting.start_next_milestone
      setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_lists
      setting.voice_needs_you setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: 'e73b289e6932ddf2',
    history: [
      "Each list's name and one of it, `setting.label_steps` and `setting.one_steps` among them, are titled by what the list is called where they read its id, \"Label: steps\", and every name is declared before any singular -> e73b289e6932ddf2",
    ],
  },
  /* THE PAGES THAT SAY ONLY WHAT IS TRUE OF THE RECORD (DIRECTION §37, "Stop the harm"): each use case's last version is
     on `origin/master`, so these are versions and not resets. */
  'founder@1.16.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.organisations-held metric.organisations-with-accounts page.dashboard page.home-founder
      page.organisation page.project register.datapoints register.organisations setting.label_accounts
      setting.label_books setting.label_categories setting.label_datapoints setting.label_installments
      setting.label_obligations setting.label_organisations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_organisations setting.one_people
      setting.one_recurring setting.one_services setting.one_tasks setting.one_things setting.one_tracks
      setting.one_transactions setting.one_updates setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: '1499caf8ce71395c',
    history: [
      "`page.home-founder` says only what is true of the record: What you have, by organisation draws while `organisations-with-accounts` counts one, Bring your money in only while no account counts as cash, Lapsing only within 30 days of today over `lapsing-30d`, Numbers this week over 7 days and six lines at most over `datapoints-7d`, its way to start held to `datapoints-reported`, and Working now only the runs heard from today; `page.dashboard` stops saying Home's cash and balances again and draws each number once, as a line -> 1499caf8ce71395c",
    ],
  },
  'founder@1.16.1': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.organisations-held metric.organisations-with-accounts page.dashboard page.home-founder
      page.organisation page.project register.datapoints register.organisations setting.label_accounts
      setting.label_books setting.label_categories setting.label_datapoints setting.label_installments
      setting.label_obligations setting.label_organisations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_organisations setting.one_people
      setting.one_recurring setting.one_services setting.one_tasks setting.one_things setting.one_tracks
      setting.one_transactions setting.one_updates setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: '561406a155a3a30c',
    history: [
      "Each list's name and one of it, `setting.label_transactions` and `setting.one_transactions` among them, are titled by what the list is called where they read its id, \"Label: transactions\", and every name is declared before any singular -> 561406a155a3a30c",
    ],
  },
  'business@1.5.0': {
    holds: `
      page.home-business setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with
      setting.voice_nothing_due
    `,
    declares: '82cf7743f0bca3cd',
    history: [
      "`page.home-business`'s Working now reads the runs active and heard from today, where every run the end hook never closed was listed as working beside the one typing now -> 82cf7743f0bca3cd",
    ],
  },
  'team@2.15.0': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles setting.holds_people setting.holds_tasks
      setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people
      setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review
      setting.label_things setting.label_tracks setting.label_updates setting.one_cycle_days setting.one_cycle_plan
      setting.one_cycles setting.one_people setting.one_tasks setting.one_things setting.one_tracks setting.one_updates
      setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up setting.voice_fills_with
      setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: '6bbd0be501cf8727',
    history: [
      "`page.agent-work`'s Working now reads the runs active and heard from today, where a run that stopped a minute ago or waits for a pickup was drawn as working, and its empty line no longer tells a team whose agents stopped to connect one -> b0ee0005f6b6172a",
      "`page.agent-work`'s Working now says in plainer words that agents connected in Settings show there while they work -> 6bbd0be501cf8727",
    ],
  },
  'team@2.15.1': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles setting.holds_people setting.holds_tasks
      setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people
      setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog
      setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review
      setting.label_things setting.label_tracks setting.label_updates setting.one_cycle_days setting.one_cycle_plan
      setting.one_cycles setting.one_people setting.one_tasks setting.one_things setting.one_tracks setting.one_updates
      setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up setting.voice_fills_with
      setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: '50b524406524baf6',
    history: [
      "Each list's name and one of it, `setting.label_tasks` and `setting.one_tasks` among them, are titled by what the list is called where they read its id, \"Label: tasks\", and every name is declared before any singular -> 50b524406524baf6",
    ],
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
  assert.deepEqual(USE_CASES.map((u) => u.usecase).filter((id) => !carried.includes(id)), []);

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
 * WRITTEN BECAUSE THE THING THIS GUARDS WENT UNGUARDED FOR NINE EDITS OF `founder.ts` and nobody noticed until a
 * review mutated a label and watched 182 tests stay green. Every rule the comments above claim is enforced is
 * exercised here with the smallest entry that breaks it, so that a rule quietly dropped from `wrong()` takes a test
 * with it rather than going unnoticed until the next review reads the diff.
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
 * THE MUTATION, KEPT, so that what was measured by hand once is measured on every run.
 *
 * The mutation changed the `datapoints-30d` cell label on the founder's dashboard
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

  const renamed = JSON.parse(JSON.stringify(doc).replace('"Numbers reported, 30 days"', '"Numbers reported in the last 30 days"')) as Doc;
  assert.notEqual(fingerprint(renamed), fingerprint(doc), 'the label the mutation moved is inside the fingerprint');
  assert.deepEqual(inventory(renamed), inventory(doc), 'only a word moved: nothing appeared and nothing vanished');

  const said = wrong(key, entry, { holds: inventory(renamed), declares: fingerprint(renamed), current: true });
  assert.equal(said.length, 1, said.join(' | '));
  assert.match(said[0]!, /declares something else now/u);
  assert.match(said[0]!, /raise the use case's version/u);
});
