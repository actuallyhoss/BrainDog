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

type Doc = { version?: unknown; declarations?: unknown; config?: unknown; extends?: unknown; adds?: unknown; hands?: unknown };

/**
 * AND WHAT IT LAYS ON ANOTHER PACK'S LIST, when it lays anything. Personal 1.5.0's roles are values on People's `role`
 * (`extends`), which reach every record that holds the use case exactly as a declaration does, and a fingerprint of the
 * declarations and settings alone did not move when they changed. Left out when absent, so every use case that lays
 * nothing keeps the value it had.
 */
const fingerprint = (d: Doc): string =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null, ...(d.extends === undefined ? {} : { extends: d.extends }), ...(d.adds === undefined ? {} : { adds: d.adds }), ...(d.hands === undefined ? {} : { hands: d.hands }) }))
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
  /* AND WHAT IT ADDS TO ANOTHER PACK'S PAGE AND THE LISTS IT HANDS ON (usecase-notes-48), as `adds.<page>.<n>` and
     `hands.<list>.<to>`. */
  ...((doc.adds ?? []) as { page?: unknown }[]).map((a, i) => `adds.${String(a.page)}.${i + 1}`),
  ...Object.entries((doc.hands ?? {}) as Record<string, unknown>).map(([list, to]) => `hands.${list}.${String(to)}`),
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
  /* THE CALM PAGES OF OCTOBER 2nd: each use case's last version is on `origin/master`, so these are versions and not resets. */
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
  /* THE COUNT OF BUDGETS SET IS MONEY'S (budgets-set-73): 2.3.1 is on the deployed build (63423720), so this is a version
     and not a reset. It holds what 2.3.1 held less `metric.budgets-set`, and the line that hands it to money-core. */
  'personal@2.4.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson hands.metric.budgets-set.money-core
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
    declares: 'f49f7464dd5d89cc',
    history: [
      "`metric.budgets-set` goes to Money with its id (`hands.metric.budgets-set.money-core`; budgets-set-73, integrate 73): money-core 3.17.0 declares the count itself, two packs cannot own one figure, and `page.home-personal`'s budget tile reads Money's; one id handed on, none added, and 2.3.1, released at 63423720, stays as it was -> f49f7464dd5d89cc",
    ],
  },
  /* A NEW HOME OFFERS SOMETHING TO PRESS: 2.4.0 is live since the 1b55e940 deploy, so this is a version and not
     a reset. It holds what 2.4.0 held and one count more, `metric.savings-held`, which Home's line naming a first savings
     goal waits on; the link and the two lines are blocks of `page.home-personal`. */
  'personal@2.5.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson hands.metric.budgets-set.money-core
      metric.goal-log-held metric.goals-active metric.goals-held metric.habits-active metric.logged-by-goal
      metric.logged-this-week-by-goal metric.put-by-by-goal metric.put-by-held metric.saved-toward-goals
      metric.savings-active metric.savings-held metric.steps-done metric.steps-left page.goals page.home-personal
      page.my-project register.goal_log register.goals register.project_steps register.put_by register.savings_goals
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
    declares: '32aff23db88fea96',
    history: [
      "`page.home-personal` gains the first acts: Bring your money in while no account counts as cash, a line naming a savings goal while none is kept and one naming a project in the Building lane while none is live, each on its own count; `metric.savings-held` is added for the second, nothing goes, and 2.4.0, live at 1b55e940, stays as it was -> 32aff23db88fea96",
    ],
  },
  /* CUT BESIDE 2.5.0, WHICH THE CATALOGUE PUBLISHES AND FREEZES (0d9bc36e): the file it shares gains `needs`, Money and
     the Projects it points at, so a fresh record installs those two and what the words point at. No declaration moved,
     so the fingerprint is 2.5.0's and a record on 2.5.0 updates without losing a list (usecase-needs-102). */
  'personal@2.6.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson hands.metric.budgets-set.money-core
      metric.goal-log-held metric.goals-active metric.goals-held metric.habits-active metric.logged-by-goal
      metric.logged-this-week-by-goal metric.put-by-by-goal metric.put-by-held metric.saved-toward-goals
      metric.savings-active metric.savings-held metric.steps-done metric.steps-left page.goals page.home-personal
      page.my-project register.goal_log register.goals register.project_steps register.put_by register.savings_goals
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
    declares: '32aff23db88fea96',
    history: [
      "Cut beside the frozen 2.5.0 for `needs` (usecase-needs-102): a fresh record installs Money, the Projects it points at and what the words point at, `page.home-personal` already leads from Money's figures and this pack's own lists, and a block or a role laid on a list the record does not hold (`extends.register.people.role.family` among them) is cut at install; nothing declared, taken away or reworded -> 32aff23db88fea96",
    ],
  },
  /* 2.6.1: THE CARD'S SUMMARY IS ONE SHORT LINE. 2.6.0 IS IN THE CATALOGUE, so a version of its own; nothing it declares moved. */
  'personal@2.6.1': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson hands.metric.budgets-set.money-core
      metric.goal-log-held metric.goals-active metric.goals-held metric.habits-active metric.logged-by-goal
      metric.logged-this-week-by-goal metric.put-by-by-goal metric.put-by-held metric.saved-toward-goals
      metric.savings-active metric.savings-held metric.steps-done metric.steps-left page.goals page.home-personal
      page.my-project register.goal_log register.goals register.project_steps register.put_by register.savings_goals
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
    declares: '32aff23db88fea96',
    history: ["The card's summary is one short line, a word outside the pack; `page.home-personal` and every other declaration are 2.6.0's word for word -> 32aff23db88fea96"],
  },
  /* 2.7.0: HOW MANY DAYS IN A ROW SOMETHING WAS LOGGED, for the Days in a row widget. 2.6.1 IS IN THE CATALOGUE, so a version of its own. */
  'personal@2.7.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson hands.metric.budgets-set.money-core
      metric.goal-log-held metric.goals-active metric.goals-held metric.habits-active metric.log-streak metric.logged-by-goal
      metric.logged-this-week-by-goal metric.put-by-by-goal metric.put-by-held metric.saved-toward-goals
      metric.savings-active metric.savings-held metric.steps-done metric.steps-left page.goals page.home-personal
      page.my-project register.goal_log register.goals register.project_steps register.put_by register.savings_goals
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
    declares: '35a0ceab0f8545ed',
    history: ['`metric.log-streak` is added, the days in a row `register.goal_log` holds an entry, which the Days in a row widget draws; one id added and none taken away -> 35a0ceab0f8545ed'],
  },
  'personal@2.8.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson hands.metric.budgets-set.money-core
      metric.goal-log-held metric.goals-active metric.goals-held metric.habits-active metric.logged-by-goal
      metric.logged-this-week-by-goal metric.put-by-by-goal metric.put-by-held metric.saved-toward-goals
      metric.savings-active metric.savings-held metric.steps-done metric.steps-left page.goals page.home-personal
      page.my-project register.goal_log register.goals register.project_steps register.put_by register.savings_goals
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
    declares: '32aff23db88fea96',
    history: ['`metric.log-streak` goes again (audit 6g, AG12): a count of days running is a streak and BrainDog keeps no game score; `metric.logged-this-week-by-goal` stays, nothing reads the figure, one id taken away -> 32aff23db88fea96'],
  },
  'personal@2.9.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      hands.metric.budgets-set.money-core metric.goal-log-held metric.goals-active metric.goals-held
      metric.habits-active metric.logged-by-goal metric.logged-this-week-by-goal metric.put-by-by-goal
      metric.put-by-held metric.saved-toward-goals metric.savings-active metric.savings-held metric.steps-done
      metric.steps-left page.goals page.home-personal page.my-project register.goal_log register.goals
      register.project_steps register.put_by register.savings_goals setting.holds_obligations setting.holds_people
      setting.holds_things setting.label_accounts setting.label_books setting.label_categories setting.label_goal_log
      setting.label_goals setting.label_installments setting.label_obligations setting.label_people
      setting.label_people__role__accountant setting.label_people__role__client setting.label_people__role__collaborator
      setting.label_people__role__contractor setting.label_project_steps setting.label_put_by setting.label_recurring
      setting.label_savings_goals setting.label_things setting.label_things__lane__building
      setting.label_things__lane__earning setting.label_things__lane__parked setting.label_things__lane__retired
      setting.label_things__revenue setting.label_transactions setting.lk_10103af7 setting.lk_1d01726f
      setting.lk_303a3cce setting.lk_4f9bf906 setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a
      setting.lk_f625eca1 setting.one_accounts setting.one_books setting.one_categories setting.one_goal_log
      setting.one_goals setting.one_installments setting.one_obligations setting.one_people setting.one_project_steps
      setting.one_put_by setting.one_recurring setting.one_savings_goals setting.one_things setting.one_transactions
      setting.shared_version setting.speaks setting.voice_add_first setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: 'f1ae90143338bc3b',
    history: ['`page.goals` takes its place on the rail and opens on boxes to add a goal or a habit and a saving (audit 31 Oct h, AH4); no id added or taken away -> f1ae90143338bc3b'],
  },
  'personal@2.9.1': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      hands.metric.budgets-set.money-core metric.goal-log-held metric.goals-active metric.goals-held
      metric.habits-active metric.logged-by-goal metric.logged-this-week-by-goal metric.put-by-by-goal
      metric.put-by-held metric.saved-toward-goals metric.savings-active metric.savings-held metric.steps-done
      metric.steps-left page.goals page.home-personal page.my-project register.goal_log register.goals
      register.project_steps register.put_by register.savings_goals setting.holds_obligations setting.holds_people
      setting.holds_things setting.label_accounts setting.label_books setting.label_categories setting.label_goal_log
      setting.label_goals setting.label_installments setting.label_obligations setting.label_people
      setting.label_people__role__accountant setting.label_people__role__client setting.label_people__role__collaborator
      setting.label_people__role__contractor setting.label_project_steps setting.label_put_by setting.label_recurring
      setting.label_savings_goals setting.label_things setting.label_things__lane__building
      setting.label_things__lane__earning setting.label_things__lane__parked setting.label_things__lane__retired
      setting.label_things__revenue setting.label_transactions setting.lk_10103af7 setting.lk_1d01726f
      setting.lk_303a3cce setting.lk_4f9bf906 setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a
      setting.lk_f625eca1 setting.one_accounts setting.one_books setting.one_categories setting.one_goal_log
      setting.one_goals setting.one_installments setting.one_obligations setting.one_people setting.one_project_steps
      setting.one_put_by setting.one_recurring setting.one_savings_goals setting.one_things setting.one_transactions
      setting.shared_version setting.speaks setting.voice_add_first setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: 'f15c575c1b367587',
    history: ['`register.goal_log` is called Progress and `register.put_by` Money saved, with the words on `page.goals` and `page.home-personal` (audit 31 Oct h, AH21); words only, no id added or taken away -> f15c575c1b367587'],
  },
  'personal@2.10.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      hands.metric.budgets-set.money-core metric.goal-log-held metric.goals-active metric.goals-held
      metric.habits-active metric.logged-by-goal metric.logged-this-week-by-goal metric.put-by-by-goal
      metric.put-by-held metric.saved-toward-goals metric.savings-active metric.savings-held metric.steps-done
      metric.steps-left page.goals page.home-personal page.my-project register.goal_log register.goals
      register.project_steps register.put_by register.savings_goals setting.holds_obligations setting.holds_people
      setting.holds_things setting.label_accounts setting.label_books setting.label_categories setting.label_goal_log
      setting.label_goals setting.label_installments setting.label_obligations setting.label_people
      setting.label_people__role__accountant setting.label_people__role__client setting.label_people__role__collaborator
      setting.label_people__role__contractor setting.label_project_steps setting.label_put_by setting.label_recurring
      setting.label_savings_goals setting.label_things setting.label_things__lane__building
      setting.label_things__lane__earning setting.label_things__lane__parked setting.label_things__lane__retired
      setting.label_things__revenue setting.label_transactions setting.lk_10103af7 setting.lk_1d01726f
      setting.lk_303a3cce setting.lk_4f9bf906 setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a
      setting.lk_f625eca1 setting.one_accounts setting.one_books setting.one_categories setting.one_goal_log
      setting.one_goals setting.one_installments setting.one_obligations setting.one_people setting.one_project_steps
      setting.one_put_by setting.one_recurring setting.one_savings_goals setting.one_things setting.one_transactions
      setting.shared_version setting.speaks setting.voice_add_first setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '802797948d753d43',
    history: ['`page.goals` says its line one way for each case, so a count of nought is left out and a first goal reads "1 goal on the go" (audit 31 Oct l, AL13); blocks added, no id added or taken away -> 802797948d753d43'],
  },
  'personal@2.11.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      hands.metric.budgets-set.money-core metric.goal-log-held metric.goals-active metric.goals-held
      metric.habits-active metric.logged-by-goal metric.logged-this-week-by-goal metric.put-by-by-goal
      metric.put-by-held metric.saved-toward-goals metric.savings-active metric.savings-held metric.steps-done
      metric.steps-left page.goals page.home-personal page.my-project register.goal_log register.goals
      register.project_steps register.put_by register.savings_goals setting.holds_obligations setting.holds_people
      setting.holds_things setting.label_accounts setting.label_books setting.label_categories setting.label_goal_log
      setting.label_goals setting.label_installments setting.label_obligations setting.label_people
      setting.label_people__role__accountant setting.label_people__role__client setting.label_people__role__collaborator
      setting.label_people__role__contractor setting.label_project_steps setting.label_put_by setting.label_recurring
      setting.label_savings_goals setting.label_things setting.label_things__lane__building
      setting.label_things__lane__earning setting.label_things__lane__parked setting.label_things__lane__retired
      setting.label_things__revenue setting.label_transactions setting.lk_10103af7 setting.lk_1d01726f
      setting.lk_303a3cce setting.lk_4f9bf906 setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a
      setting.lk_f625eca1 setting.one_accounts setting.one_books setting.one_categories setting.one_goal_log
      setting.one_goals setting.one_installments setting.one_obligations setting.one_people setting.one_project_steps
      setting.one_put_by setting.one_recurring setting.one_savings_goals setting.one_things setting.one_transactions
      setting.shared_version setting.speaks setting.voice_add_first setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '802797948d753d43',
    history: ['`register.project_steps` keeps its link to Projects only where Projects is held: `needs` is People and Money, so a household is not handed Projects (onboarding6); nothing declared moves, no id added or taken away -> 802797948d753d43'],
  },
  'personal@2.11.1': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      hands.metric.budgets-set.money-core metric.goal-log-held metric.goals-active metric.goals-held
      metric.habits-active metric.logged-by-goal metric.logged-this-week-by-goal metric.put-by-by-goal
      metric.put-by-held metric.saved-toward-goals metric.savings-active metric.savings-held metric.steps-done
      metric.steps-left page.goals page.home-personal page.my-project register.goal_log register.goals
      register.project_steps register.put_by register.savings_goals setting.holds_obligations setting.holds_people
      setting.holds_things setting.label_accounts setting.label_books setting.label_categories setting.label_goal_log
      setting.label_goals setting.label_installments setting.label_obligations setting.label_people
      setting.label_people__role__accountant setting.label_people__role__client setting.label_people__role__collaborator
      setting.label_people__role__contractor setting.label_project_steps setting.label_put_by setting.label_recurring
      setting.label_savings_goals setting.label_things setting.label_things__lane__building
      setting.label_things__lane__earning setting.label_things__lane__parked setting.label_things__lane__retired
      setting.label_things__revenue setting.label_transactions setting.lk_10103af7 setting.lk_1d01726f
      setting.lk_303a3cce setting.lk_4f9bf906 setting.lk_666e92eb setting.lk_91a285a5 setting.lk_d66e361a
      setting.lk_f625eca1 setting.one_accounts setting.one_books setting.one_categories setting.one_goal_log
      setting.one_goals setting.one_installments setting.one_obligations setting.one_people setting.one_project_steps
      setting.one_put_by setting.one_recurring setting.one_savings_goals setting.one_things setting.one_transactions
      setting.shared_version setting.speaks setting.voice_add_first setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '90f2f87ea4c23171',
    history: ["`page.home-personal`'s Bring your money in says Find a plugin for your bank, where it said add-on -> 90f2f87ea4c23171"],
  },
  'personal@2.12.0': {
    holds: `
      extends.register.people.role.adviser extends.register.people.role.family extends.register.people.role.friend
      extends.register.people.role.landlord extends.register.people.role.tradesperson
      hands.metric.budgets-set.money-core metric.goal-log-held metric.goals-active metric.goals-held
      metric.habits-active metric.logged-by-goal metric.logged-this-week-by-goal metric.put-by-by-goal
      metric.put-by-held metric.saved-toward-goals metric.savings-active metric.savings-held metric.steps-done
      metric.steps-left page.goals page.home-personal page.my-project register.goal_log register.goals
      register.project_steps register.put_by register.savings_goals setting.holds_obligations setting.holds_people
      setting.holds_things setting.label_accounts setting.label_books setting.label_categories
      setting.label_goal_log setting.label_goals setting.label_installments setting.label_obligations
      setting.label_people setting.label_people__role__accountant setting.label_people__role__client
      setting.label_people__role__collaborator setting.label_people__role__contractor setting.label_project_steps
      setting.label_put_by setting.label_recurring setting.label_savings_goals setting.label_things
      setting.label_things__lane__building setting.label_things__lane__earning setting.label_things__lane__parked
      setting.label_things__lane__retired setting.label_things__revenue setting.label_transactions
      setting.lk_10103af7 setting.lk_1d01726f setting.lk_303a3cce setting.lk_4f9bf906 setting.lk_666e92eb
      setting.lk_91a285a5 setting.lk_d66e361a setting.lk_f625eca1 setting.one_accounts setting.one_books
      setting.one_categories setting.one_goal_log setting.one_goals setting.one_installments
      setting.one_obligations setting.one_people setting.one_project_steps setting.one_put_by
      setting.one_recurring setting.one_savings_goals setting.one_things setting.one_transactions
      setting.shared_version setting.speaks setting.voice_add_first setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue
      setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: 'd0f54b766a364c2a',
    history: ["`page.goals` no longer opens on a line counting goals and habits (no briefs, 3 Nov); three blocks taken away, no id added or taken away -> d0f54b766a364c2a"],
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
  /* THE PAGES THAT SAY ONLY WHAT IS TRUE OF THE RECORD ("Stop the harm"): each use case's last version is
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
  /* A VERSION AND NOT A RESET: 1.16.1 is live. The organisations went to People 3.0.0. */
  'founder@2.0.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.organisations-held page.dashboard page.home-founder page.project register.datapoints
      setting.label_accounts setting.label_books setting.label_categories setting.label_datapoints
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'ccc436f460b15b32',
    history: [
      "`register.organisations` is People's under the same id and is handed to it, `page.organisation` and `metric.organisations-with-accounts` go with the list's accounts, `page.home-founder` draws no money by organisation, and `page.dashboard` lists each organisation by kind and website -> ccc436f460b15b32",
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
  /* VERSIONS AND NOT RESETS: founder 2.0.0 and team 2.15.1 are live. Each takes the project template of work 1.15.0. */
  'founder@2.1.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.organisations-held page.dashboard page.home-founder page.project register.datapoints
      setting.label_accounts setting.label_books setting.label_categories setting.label_datapoints
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '680daedbd0e33a91',
    history: [
      "`page.project` takes the project template of work 1.15.0, its history, notes, money and what it runs on one More about tile where they were three folded sections, and draws the project's numbers before that tile -> 7e7dcc52e3d6e1c6",
      "`page.project` draws Send numbers here under the project's numbers, before More about, where it sat under that tile a screen away from them -> 680daedbd0e33a91",
    ],
  },
  'team@2.16.0': {
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
    declares: '9623e53bc787ff10',
    history: [
      "`page.project` takes the project template of work 1.15.0: what changed, who worked on it, its notes and what it runs on are one More about tile where they were folded sections -> 9623e53bc787ff10",
    ],
  },
  /* VERSIONS AND NOT RESETS: founder 2.1.0 and team 2.16.0 are live. Each takes the project template's tones on Where it
     stands, a key on a block that was already there, so the ids are the ones before. */
  'founder@2.2.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.organisations-held page.dashboard page.home-founder page.project register.datapoints
      setting.label_accounts setting.label_books setting.label_categories setting.label_datapoints
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'e298abda699c666d',
    history: [
      "Where it stands on `page.project` wears `tones:`, At risk in the warning colour and Off track in the danger colour, where every health was drawn alike; On track wears no mark -> e298abda699c666d",
    ],
  },
  'team@2.17.0': {
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
    declares: 'c11cf821f8eb46c7',
    history: [
      "Where it stands on `page.project` wears `tones:`, At risk in the warning colour and Off track in the danger colour, where every health was drawn alike; On track wears no mark -> c11cf821f8eb46c7",
    ],
  },
  /* VERSIONS AND NOT RESETS: founder 2.2.0 and team 2.17.0 are live. Each takes the project template without its chart
     of the weeks (the second design review's fix 5), a block gone and a cell of At a glance added or changed, so the
     ids are the ones before. `quiet-update.test.ts` rebuilds each version before and holds it to the value above. */
  'founder@2.3.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.organisations-held page.dashboard page.home-founder page.project register.datapoints
      setting.label_accounts setting.label_books setting.label_categories setting.label_datapoints
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '05cb6eed5bd74666',
    history: [
      "`page.project` draws no Done, by week, a chart the whole of the main column for bars of 1 and 2; At a glance gains Done this week as its fourth figure, asking for its four weeks as a line -> 05cb6eed5bd74666",
    ],
  },
  'team@2.18.0': {
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
    declares: '9ea6b93bfb8e78b7',
    history: [
      "`page.project` draws no Done, by week, a chart the whole of the main column for bars of 1 and 2; Done this week, already the last figure of At a glance, asks for its four weeks as a line -> 9ea6b93bfb8e78b7",
    ],
  },
  /* VERSIONS AND NOT RESETS: the Working now tables read the runs working now (`sessions.working`), not today's clause. */
  'founder@2.4.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.organisations-held page.dashboard page.home-founder page.project register.datapoints
      setting.label_accounts setting.label_books setting.label_categories setting.label_datapoints
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '19b0de6a3f7ea988',
    history: [
      "`page.home-founder` says how many agents work now in a line from the record's `runs-working`, and its Working now table reads `sessions.working`, the runs heard from in the last fifteen minutes -> 19b0de6a3f7ea988",
    ],
  },
  /* MONEY IN NUMBERS: a reading may be an amount in its own currency, and the blocks over Numbers read it fifth. */
  'founder@2.5.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.organisations-held page.dashboard page.home-founder page.project register.datapoints
      setting.label_accounts setting.label_books setting.label_categories setting.label_datapoints
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
      adds.page.relation.1 adds.page.relation.2 adds.page.relation.3 hands.register.organisations.people
      metric.project-numbers-7d metric.projects-earning-silent adds.page.portfolio.4
    `,
    declares: 'a94b1a5c70bac1af',
    history: [
      "`register.datapoints` takes money: a reading holds `amount` in its own currency in place of `value`, which stops being required; the blocks over Numbers read it as their fifth column, Latest numbers shows it, and `poll-setup` says to fill the live feed add-on -> 04647bd190534619",
      "`page.project` takes portfolio 1.16.0's Where it stands: the typed card only while `project-said` counts one, else a stat of `project-moved-7d` under the same heading -> 0f11bc53c61df212",
      "What the founder adds to People's page for an organisation (`adds.page.relation.1` to `adds.page.relation.3`) and the list it hands to People (`hands.register.organisations.people`) are fingerprinted with its declarations -> b6f4a0851ab855e1",
      "`project-numbers-7d` and `projects-earning-silent` are added; Where it stands on `page.project` takes Last worked and Numbers this week; Projects names the earning projects gone silent (`adds.page.portfolio.4`) -> a94b1a5c70bac1af",
    ],
  },
  /* THE LOOK AT A REAL RECORD ON 13 OCTOBER: Today by name, what is late apart from the week, no Cost under Lapsing. 2.5.0 IS LIVE. */
  'founder@2.6.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.late-money metric.organisations-held page.dashboard page.home-founder page.project register.datapoints
      setting.label_accounts setting.label_books setting.label_categories setting.label_datapoints
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
      adds.page.relation.1 adds.page.relation.2 adds.page.relation.3 hands.register.organisations.people
      metric.project-numbers-7d metric.projects-earning-silent adds.page.portfolio.4
      adds.page.estate.5 metric.service-numbers adds.page.relation.6 adds.page.someone.7
    `,
    declares: '8a82770e8f8c8827',
    history: [
      "`setting.voice_home` and the title of `page.home-founder` say Today where both said Overview; `due-this-week` and Due this week start today; `late-money` is added with a Late table ahead of the week, oldest first; Lapsing loses its Cost column -> 1a6e6f8b5a7311cc",
      "Folded into the unreleased 2.6.0: `page.project`'s Tools and servers reads the project's own tools alone (`kind is tool, scope is project`), so a project with none of its own draws no card where it listed everybody's -> 11f22bd8f6e3f8d2",
      "Folded into the unreleased 2.6.0 (estate-numbers-61, REC-C12; integrate 61; a builder wrote it as 2.7.0, and 2.6.0 was never deployed: commit 63423720 holds 2.5.0): Numbers gains `about_service`, the figure `service-numbers` is added, and Server and provider numbers is laid on Renewals (the field is `about_service` and not the builder's `service`, a word the core-names gate would then refuse in two dozen places of the core); `adds.page.estate.5` and `metric.service-numbers` gained -> 8828553c41a19dd5",
      "Folded into the unreleased 2.6.0: `metric.service-numbers` and the block it switches on end their ninety days today (`at before tomorrow`), so a reading dated after today is neither counted nor drawn -> f9fa3e40e32ae41d",
      "Folded into the unreleased 2.6.0: `metric.datapoints-7d`, `metric.datapoints-30d`, `metric.datapoints-reported` and `metric.project-numbers-7d` end today (`at before tomorrow`), so a reading dated after today is not a number reported -> 9c75914a4b35aa6a",
      "Folded into the unreleased 2.6.0: `metric.datapoints-held` and the dashboard's Latest numbers end today (`at before tomorrow`) -> b7181eced6b7c8f8",
      "Folded into the unreleased 2.6.0: `page.project`'s Keys and Skills read the project's own alone (`kind is key, scope is project`, `kind is skill, scope is project`), so a project with none of its own draws neither card where each listed everybody's -> 63df5982b0d1f484",
      "Folded into the unreleased 2.6.0, one fingerprint for two changes, no id added or taken away: `page.project`'s At a glance cell over `project-owed` is labelled Still to come in, where it said Owed to you (owed-words-74); and `page.home-founder`'s line of what there is ends \"it lasts the year\" when the walk reached its last day above zero, a second lead note drawn on `all:` of one book and `runway-days` carrying `beyond`, the line with the days stepping aside on `beyond: false` (founder-lasts-74) -> dee2ed32ad8a72ee",
      "Inside the unreleased 2.6.0 (project-runs-tile-87, AGT-C12 job d and AGT-D12 job 2; integrate 87; commit 63423720 holds 2.5.0): `page.project`'s Agents reads a run of its own that wrote something (`parent is empty, wrote is not 0`), titled by the agent with `doing_said` under it; Keys, Tools and servers and Skills sit under a boxed section Runs on, a third of the tile each where each was a half, with And from everywhere under them (`kind is not action, scope is global`, five); Money by month is the tile's width where it was a half, so no row is left with a hole over the new heading; no id added or taken away -> 86861bc4c9e643e6",
      "Inside the unreleased 2.6.0 (founder-home-quiet-88, ENG-B13 'Seen'; batch 88; commit 63423720 holds 2.5.0, and the task asked for 2.7.0, which this file's own rule refuses for a version never released): `page.home-founder` draws Gone quiet, a table over the source `exceptions` with What, Last seen and Before, six lines at most, straight under what the money is and not drawn while nothing is quiet; it was a seventh tile, so Working now is folded shut under a section Agents at work, held to `runs-working` as its table is; two blocks added, no id added or taken away -> 48875c311c09ba01",
      "Inside the unreleased 2.6.0 (runs-on-section-89, AGT-D12 job 2; batch 89; commit 63423720 holds 2.5.0): `page.project`'s Keys, Tools and servers and Skills draw six rows each where they drew three, and Keys, Tools and servers and And from everywhere name who used each by `used_agents`, labelled Used by, where Keys and Tools named `used_by` and And from everywhere `used_agent`, each labelled Last used by; no id added or taken away -> 6bb5b7dec0fe3e2b",
      "Inside the unreleased 2.6.0 (seen-section-91, ENG-B03 'Seen: the about answer'; batch 91; commit 63423720 holds 2.5.0): `page.project` ends with a section Where it was seen naming `panel: seen`, after its More about tile, and the same section is laid on People's pages for an organisation and a person after Notes, the last block of their own (`adds.page.relation.6`, `adds.page.someone.7`), last among the additions so those before keep their numbers; three blocks added, nothing taken away -> bd926c3bbb84b916",
      "Inside the unreleased 2.6.0: `register.datapoints` (Numbers) declares its order, newest first by `at`, the moment a number is for -> 8a82770e8f8c8827",
    ],
  },
  /* CUT BESIDE 2.6.0, WHICH THE CATALOGUE PUBLISHES AND FREEZES (0d9bc36e): the file it shares gains `needs`, Projects
     and Money, so a fresh record installs those two and what the words point at. No declaration moved, so the fingerprint
     is 2.6.0's and a record on 2.6.0 updates without losing a list (usecase-needs-102). */
  'founder@2.7.0': {
    holds: `
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.late-money metric.organisations-held page.dashboard page.home-founder page.project register.datapoints
      setting.label_accounts setting.label_books setting.label_categories setting.label_datapoints
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories setting.one_datapoints
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
      adds.page.relation.1 adds.page.relation.2 adds.page.relation.3 hands.register.organisations.people
      metric.project-numbers-7d metric.projects-earning-silent adds.page.portfolio.4
      adds.page.estate.5 metric.service-numbers adds.page.relation.6 adds.page.someone.7
    `,
    declares: '8a82770e8f8c8827',
    history: [
      "Cut beside the frozen 2.6.0 for `needs` (usecase-needs-102): a fresh record installs Projects and Money and what the words point at, Services for domains or renewals; `page.home-founder` already leads from Money and `register.datapoints`, and Lapsing and `metric.lapsing-30d` over a list the record does not hold are cut at install; nothing declared, taken away or reworded -> 8a82770e8f8c8827",
    ],
  },
  /* NUMBERS HANDED TO PORTFOLIO (the KPI plan of 21 October, K1-A): 2.7.0 IS PUBLISHED AND FROZEN, and a list this pack
     declared goes, so a major step, as 2.0.0 was when organisations went to People. */
  /* 3.4.0 IS MASTER'S, so a version of its own. No id added or taken away. */
  /* AUDIT C OF 25 OCTOBER. 3.5.0 IS MASTER'S, so a version of its own beside portfolio 1.27.0. Nothing of its own changed. */
  'founder@3.7.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'eb077e6d7cda38bd',
    history: [
      "The project page of 27 October: `page.project` draws the project's parts in three blocks, lane by lane; the plan and Key numbers move under More about, What changed, the Numbers lines and Where it was seen go, and Send numbers here is folded last. No id added or taken away -> eb077e6d7cda38bd",
    ],
  },
  /* 3.7.1: THE CARD'S SUMMARY IS ONE SHORT LINE. 3.7.0 IS IN THE CATALOGUE, so a version of its own; nothing it declares moved. */
  'founder@3.8.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '49b914b6f4ae95e6',
    history: ["`page.home-founder` is called Founder overview, not Today, beside the real Today; the Dashboard says in one line when no numbers came in thirty days, shows what went quiet and links to fixing the feed. No id added or taken away -> 49b914b6f4ae95e6"],
  },
  'founder@3.8.1': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'ca8024f0e5283005',
    history: ["`page.project` labels the cards of And from everywhere \"What it is\", not \"Kind\". Words only, no id added or taken away -> ca8024f0e5283005"],
  },
  'founder@3.8.2': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '20df92ca8b5bb812',
    history: ["`page.project` heads the project's services Services, not Keeping it alive, beside Runs on. Words only, no id added or taken away -> 20df92ca8b5bb812"],
  },
  'founder@3.9.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 extends.register.datapoints.about_service
      extends.register.datapoints.organisation hands.register.datapoints.portfolio hands.register.organisations.people
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories setting.label_installments
      setting.label_obligations setting.label_people setting.label_recurring setting.label_services setting.label_tasks
      setting.label_things setting.label_tracks setting.label_transactions setting.label_updates setting.one_accounts
      setting.one_books setting.one_categories setting.one_installments setting.one_obligations setting.one_people
      setting.one_recurring setting.one_services setting.one_tasks setting.one_things setting.one_tracks
      setting.one_transactions setting.one_updates setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: 'dcd91546c20dd95c',
    history: ['`page.dashboard` takes its place on the rail, asks for the first project before any number, and says Fix the feed only once a feed has sent (audit 31 Oct h, AH4 and AH18); no id added or taken away -> dcd91546c20dd95c'],
  },
  'founder@3.9.1': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 extends.register.datapoints.about_service
      extends.register.datapoints.organisation hands.register.datapoints.portfolio hands.register.organisations.people
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories setting.label_installments
      setting.label_obligations setting.label_people setting.label_recurring setting.label_services setting.label_tasks
      setting.label_things setting.label_tracks setting.label_transactions setting.label_updates setting.one_accounts
      setting.one_books setting.one_categories setting.one_installments setting.one_obligations setting.one_people
      setting.one_recurring setting.one_services setting.one_tasks setting.one_things setting.one_tracks
      setting.one_transactions setting.one_updates setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: 'a6976e13e5227761',
    history: ['`page.dashboard` takes the place after Agents, so a full rail keeps what it had (review 31 Oct g, RG17); no id added or taken away -> a6976e13e5227761'],
  },
  'founder@3.9.2': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 extends.register.datapoints.about_service
      extends.register.datapoints.organisation hands.register.datapoints.portfolio hands.register.organisations.people
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories setting.label_installments
      setting.label_obligations setting.label_people setting.label_recurring setting.label_services setting.label_tasks
      setting.label_things setting.label_tracks setting.label_transactions setting.label_updates setting.one_accounts
      setting.one_books setting.one_categories setting.one_installments setting.one_obligations setting.one_people
      setting.one_recurring setting.one_services setting.one_tasks setting.one_things setting.one_tracks
      setting.one_transactions setting.one_updates setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: 'd2c981f6c0c8949c',
    history: ['`page.dashboard` says a project sends its numbers to its own address, shown on its page, where it said its page has the key (audit 1 Nov, AP32); no id added or taken away -> d2c981f6c0c8949c'],
  },
  'founder@3.9.3': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 extends.register.datapoints.about_service
      extends.register.datapoints.organisation hands.register.datapoints.portfolio hands.register.organisations.people
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories setting.label_installments
      setting.label_obligations setting.label_people setting.label_recurring setting.label_services setting.label_tasks
      setting.label_things setting.label_tracks setting.label_transactions setting.label_updates setting.one_accounts
      setting.one_books setting.one_categories setting.one_installments setting.one_obligations setting.one_people
      setting.one_recurring setting.one_services setting.one_tasks setting.one_things setting.one_tracks
      setting.one_transactions setting.one_updates setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: 'c9d5eb8bd0af5a15',
    history: ["`page.home-founder`'s Bring your numbers in says Plugins that read a live number for you, where it said add-on -> c9d5eb8bd0af5a15"],
  },
  'founder@3.10.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 extends.register.datapoints.about_service
      extends.register.datapoints.organisation hands.register.datapoints.portfolio
      hands.register.organisations.people metric.datapoints-30d metric.datapoints-7d metric.datapoints-age
      metric.datapoints-held metric.datapoints-reported metric.due-this-week metric.lapsing-30d metric.late-money
      metric.organisations-held metric.project-numbers-7d metric.projects-earning-silent metric.service-numbers
      page.dashboard page.home-founder page.project setting.label_accounts setting.label_books
      setting.label_categories setting.label_installments setting.label_obligations setting.label_people
      setting.label_recurring setting.label_services setting.label_tasks setting.label_things setting.label_tracks
      setting.label_transactions setting.label_updates setting.one_accounts setting.one_books
      setting.one_categories setting.one_installments setting.one_obligations setting.one_people
      setting.one_recurring setting.one_services setting.one_tasks setting.one_things setting.one_tracks
      setting.one_transactions setting.one_updates setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists
      setting.voice_needs_you setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now
      setting.voice_nothing_waiting setting.voice_overdue setting.voice_pen_waits setting.voice_right_now
      setting.voice_since_away setting.voice_working_now
    `,
    declares: 'dabcb595c49a7730',
    history: ["`page.dashboard` no longer opens on how many numbers came in thirty days, and `page.home-founder` no longer counts the agents at work (no briefs, 3 Nov); two blocks taken away, no id added or taken away -> dabcb595c49a7730"],
  },
  'founder@3.7.1': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'eb077e6d7cda38bd',
    history: ["The card's summary is one short line, a word outside the pack; `page.home-founder` and every other declaration are 3.7.0's word for word -> eb077e6d7cda38bd"],
  },
  'founder@3.6.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '539dcf5be4dde3ed',
    history: [
      "Audit C of 25 October (X7): cut beside portfolio 1.27.0, whose Projects opens a record with no project in play on a box to add one; `adds.page.portfolio.4` still adds its block after In play, and nothing of its own declared, taken away or reworded -> 539dcf5be4dde3ed",
    ],
  },
  'founder@3.5.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '539dcf5be4dde3ed',
    history: [
      "`page.project`'s Where it stands reads Last worked off the record's own `project-worked`, the tasks and the runs together, where it read Work's `project-last-worked`, the tasks alone; no id added or taken away -> 0ff9d64c783bfafe",
      "`page.dashboard` heads its numbers with their age once the newest is past a week, over `metric.datapoints-age`, added, and `page.project` heads its numbers Numbers -> d81b8e572fbeb078",
      "`page.dashboard` draws two charts and lists up to forty, and its Organisations table leaves out a retired one; no id added or taken away -> 539dcf5be4dde3ed",
    ],
  },
  /* 3.3.0 IS MASTER'S, so a version of its own. A figure added. */
  'founder@3.4.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-age metric.datapoints-held metric.datapoints-reported
      metric.due-this-week metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d
      metric.projects-earning-silent metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'd81b8e572fbeb078',
    history: [
      "`page.project`'s Where it stands reads Last worked off the record's own `project-worked`, the tasks and the runs together, where it read Work's `project-last-worked`, the tasks alone; no id added or taken away -> 0ff9d64c783bfafe",
      "`page.dashboard` heads its numbers with their age once the newest is past a week, over `metric.datapoints-age`, added, and `page.project` heads its numbers Numbers -> d81b8e572fbeb078",
    ],
  },
  /* THE PROJECT'S SHAPE AS BLOCKS. 3.2.0 IS LIVE, so a version of its own. */
  'founder@3.3.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d metric.projects-earning-silent
      metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'a900a95d321e0cdd',
    history: [
      "The project's shape as blocks (the thinking scope of 24 October, C28 and C29): `page.project` declares the hero with Path and Money, and Work and Who is on it with Runs on and the agents on it, as two `project` blocks where they were drawn by hand; Handed back or blocked and Money by month went for them, More about is declared `fold: true`, as it was drawn, and What changed and the agents' cards are whole rows; no id added or taken away -> a900a95d321e0cdd",
    ],
  },
  'founder@3.2.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d metric.projects-earning-silent
      metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '5332b1eafa83089b',
    history: [
      "Portfolio 1.23.0 (the thinking scope of 24 October, C18 and C19): `page.project` draws the project's stages as its road, a `steps` block over `register.stages` in the rail, its roadmap steps aside while its road is kept alone and the road while its roadmap is, and its two opening notes are one note of two sentences (`says:`); a block added, no id added or taken away -> 5332b1eafa83089b",
    ],
  },
  'founder@3.0.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d metric.projects-earning-silent
      metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'e844999b8bf97975',
    history: [
      "`register.datapoints` is handed to Portfolio 1.19.0 (`hands.register.datapoints.portfolio`), which declares it under the same id, and its organisation and service, links to People's and Estate's lists, stay this pack's, laid on it (`extends.register.datapoints.organisation`, `extends.register.datapoints.about_service`); `setting.label_datapoints` and `setting.one_datapoints` go with the list and the example number leaves the pack's own seeds for the module examples; every figure, page and addition over Numbers stays -> 0507ca88190ea60f",
      "Inside the unreleased 3.0.0: `setting.one_obligations` starts from `bill or invoice`, Money's own word for one of Bills and invoices now, where it started from `item` -> 09904ef1a119de83",
      "Inside the unreleased 3.0.0 (the KPI plan of 21 October, K3-C): `page.project` draws Key numbers, a `kpis` block `for: project` the whole width under Waiting on you, the project's own key numbers with their lines, targets and late marks; a block added, no id added or taken away -> e844999b8bf97975",
    ],
  },
  /** A VERSION AND NOT A RESET: founder@3.0.0 is on `origin/master`. */
  'founder@3.1.0': {
    holds: `
      adds.page.estate.5 adds.page.portfolio.4 adds.page.relation.1 adds.page.relation.2 adds.page.relation.3
      adds.page.relation.6 adds.page.someone.7 hands.register.datapoints.portfolio hands.register.organisations.people
      extends.register.datapoints.organisation extends.register.datapoints.about_service
      metric.datapoints-30d metric.datapoints-7d metric.datapoints-held metric.datapoints-reported metric.due-this-week
      metric.lapsing-30d metric.late-money metric.organisations-held metric.project-numbers-7d metric.projects-earning-silent
      metric.service-numbers page.dashboard page.home-founder page.project
      setting.label_accounts setting.label_books setting.label_categories
      setting.label_installments setting.label_obligations setting.label_people setting.label_recurring
      setting.label_services setting.label_tasks setting.label_things setting.label_tracks setting.label_transactions
      setting.label_updates setting.one_accounts setting.one_books setting.one_categories
      setting.one_installments setting.one_obligations setting.one_people setting.one_recurring setting.one_services
      setting.one_tasks setting.one_things setting.one_tracks setting.one_transactions setting.one_updates
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue
      setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'e577287f526b4a1c',
    history: [
      'Founder 3.1.0 (things, not rows, 24 October): `page.project` is a template over every project, its `for:` no longer narrowed to those building or earning; no id added or taken away -> ad57bae127218aa1',
      'Inside the unreleased 3.1.0: `page.project` draws Bills and invoices and Keeping it alive the whole width, where each was a half a parked project left beside a hole; no id added or taken away -> e577287f526b4a1c',
    ],
  },
  'team@2.19.0': {
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
    declares: 'baca128c6d799cbb',
    history: [
      "`page.agent-work`'s Working now reads the record's `sessions.working`, the runs heard from in the last fifteen minutes, where it read the Agents add-on's clause of today -> baca128c6d799cbb",
    ],
  },
  /* WHERE A PROJECT STANDS IS SAID FROM WHAT HAPPENED ON IT (portfolio 1.16.0's template, batch 46). 2.19.0 IS RELEASED, AND SO IS THIS. */
  'team@2.20.0': {
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
    declares: '358cad7996106324',
    history: [
      "`page.project` takes portfolio 1.16.0's Where it stands: the typed card only while `project-said` counts one, else a stat of `project-moved-7d` under the same heading -> 6810be8ff85d154d",
      "`page.project`'s Where it stands takes Last worked (`project-last-worked`) -> 358cad7996106324",
    ],
  },
  /* TOOLS AND SERVERS LISTS A PROJECT'S OWN (pinwheel-60). 2.20.0 IS RELEASED: commit 63423720, the deployed build,
     holds it at 358cad7996106324. Batch 60 moved that entry in place; integrate 61 put it back and gave the change
     this version. */
  'team@2.21.0': {
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
      rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day
      script.plan_follows_ticket
    `,
    declares: '28ca804962485e64',
    history: [
      "`page.project`'s Tools and servers reads the project's own tools alone (`kind is tool, scope is project`), where it listed everybody's (pinwheel-60, written into 2.20.0 by batch 60 and moved here by integrate 61) -> 11f9e7507ab3a446",
      "Folded into the unreleased 2.21.0: `page.project`'s Keys and Skills read the project's own alone (`kind is key, scope is project`, `kind is skill, scope is project`), where each listed everybody's -> 2cb324c057827f0d",
      "Inside the unreleased 2.21.0 (project-runs-tile-87, AGT-C12 job d and AGT-D12 job 2; integrate 87; commit 63423720 holds 2.20.0): `page.project`'s Agents reads a run of its own that wrote something (`parent is empty, wrote is not 0`), titled by the agent with `doing_said` under it; Keys, Tools and servers and Skills sit under a boxed section Runs on, a third of the tile each where each was a half, with And from everywhere under them (`kind is not action, scope is global`, five); Money by month is the tile's width where it was a half, so no row is left with a hole over the new heading; no id added or taken away -> 89c71e2ca313fac9",
      "Inside the unreleased 2.21.0: `page.home-team` draws Gone quiet, the founder's table word for word over the source `exceptions` with What, Last seen and Before, six lines at most, straight under its line and not drawn while nothing is quiet; a block added, no id added or taken away -> 1d4ea792097cdc3f",
      "Inside the unreleased 2.21.0 (runs-on-section-89, AGT-D12 job 2; batch 89; commit 63423720 holds 2.20.0): `page.project`'s Keys, Tools and servers and Skills draw six rows each where they drew three, and Keys, Tools and servers and And from everywhere name who used each by `used_agents`, labelled Used by, where Keys and Tools named `used_by` and And from everywhere `used_agent`, each labelled Last used by; no id added or taken away -> 5670bdbb3a98c6a6",
      "Inside the unreleased 2.21.0: the burn-down fills itself, three rules and two scripts (`rule.ticket_done_ticks_plan`, `rule.ticket_reopened_unticks_plan`, `rule.cycle_day_each_morning`, `script.plan_follows_ticket`, `script.cycle_day`) tick a planned line with its ticket and write each morning's cycle day; `page.home-team`'s Bring the team in loses Invite your team and its burn-down's empty line says the record writes the day -> 8a1edbc9f3331acf",
      "Inside the unreleased 2.21.0 (the KPI plan of 21 October, K3-C; commit 63423720 holds 2.20.0): `page.project` draws Key numbers, a `kpis` block `for: project` the whole width under Waiting on you, the project's own key numbers with their lines, targets and late marks; a block added, no id added or taken away -> 28ca804962485e64",
    ],
  },
  /* BRING THE TEAM IN SAYS NOTHING OF CLOUD. 2.21.0 is live on brain.dog. */
  /* 2.25.0 IS MASTER'S, so a version of its own. No id added or taken away. */
  /* AUDIT C OF 25 OCTOBER. 2.26.0 IS MASTER'S, so a version of its own beside portfolio 1.27.0. Nothing of its own changed. */
  'team@2.28.0': {
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
      rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day
      script.plan_follows_ticket
    `,
    declares: '32d71cb825bc8ad2',
    history: [
      "The project page of 27 October: `page.project` draws the project's parts in three blocks, lane by lane; the plan and Key numbers move under More about and What changed goes. No id added or taken away -> 32d71cb825bc8ad2",
    ],
  },
  'team@2.27.0': {
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
      rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day
      script.plan_follows_ticket
    `,
    declares: '761527ae3a0e3fd6',
    history: [
      "Audit C of 25 October (X7): cut beside portfolio 1.27.0, whose Projects opens a record with no project in play on a box to add one, into the list `setting.label_things` names; nothing of its own declared, taken away or reworded -> 761527ae3a0e3fd6",
    ],
  },
  'team@2.26.0': {
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
      rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day
      script.plan_follows_ticket
    `,
    declares: '761527ae3a0e3fd6',
    history: [
      "`page.project`'s Where it stands reads Last worked off the record's own `project-worked`, the tasks and the runs together, where it read Work's `project-last-worked`, the tasks alone; no id added or taken away -> 761527ae3a0e3fd6",
    ],
  },
  /* THE PROJECT'S SHAPE AS BLOCKS. 2.24.0 IS LIVE, so a version of its own. */
  'team@2.25.0': {
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
      rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day
      script.plan_follows_ticket
    `,
    declares: 'b3cd02ed03409737',
    history: [
      "The project's shape as blocks (the thinking scope of 24 October, C28 and C29): `page.project` declares the hero with Path and Money, and Work and Who is on it with Runs on and the agents on it, as two `project` blocks where they were drawn by hand; Handed back or blocked went for them, More about is declared `fold: true`, as it was drawn, and What changed and the agents' cards are whole rows; no id added or taken away -> b3cd02ed03409737",
    ],
  },
  'team@2.24.0': {
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
      rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day
      script.plan_follows_ticket
    `,
    declares: 'cd92ba4e241484f0',
    history: [
      "Portfolio 1.23.0 (the thinking scope of 24 October, C18 and C19): `page.project` draws the project's stages as its road, a `steps` block over `register.stages` in the rail, its roadmap steps aside while its road is kept alone and the road while its roadmap is, and its two opening notes are one note of two sentences (`says:`); a block added, no id added or taken away -> cd92ba4e241484f0",
    ],
  },
  'team@2.22.0': {
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
      rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day
      script.plan_follows_ticket
    `,
    declares: 'd08d7e5234994c4b',
    history: [
      "`page.home-team`'s Bring the team in says only that a team of agents works on any record, where it added that a team of people needs Cloud; no id added or taken away -> d08d7e5234994c4b",
    ],
  },
  /** A VERSION AND NOT A RESET: team@2.22.0 is on `origin/master`. */
  'team@2.23.0': {
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
      rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day
      script.plan_follows_ticket
    `,
    declares: '651e2ac8ad07331a',
    history: [
      'Team 2.23.0 (things, not rows, 24 October): `page.project` is a template over every project, its `for:` no longer narrowed to those building or earning; no id added or taken away -> 651e2ac8ad07331a',
    ],
  },
  'business@1.6.0': {
    holds: `
      page.home-business setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with
      setting.voice_nothing_due
    `,
    declares: '070472676d3012ef',
    history: [
      "`page.home-business`'s Working now reads the record's `sessions.working`, the runs heard from in the last fifteen minutes, where it read the Agents add-on's clause of today -> 070472676d3012ef",
    ],
  },
  /** "SHOP" AND "STORE" WENT TO SHOP: signals are not declared, so `page.home-business` is word for word 1.6.0's. */
  'business@1.7.0': {
    holds: `
      page.home-business setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with
      setting.voice_nothing_due
    `,
    declares: '070472676d3012ef',
    history: [
      "`page.home-business` is 1.6.0's word for word; the version stepped because shop and store are Shop's words now, so a shop is proposed Shop -> 070472676d3012ef",
    ],
  },
  /** TODAY BY NAME, as the founder's Home is since 2.6.0: the page said Overview under a rail item that says Today. 1.7.0 IS LIVE. */
  'business@1.7.1': {
    holds: `
      page.home-business setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with
      setting.voice_nothing_due
    `,
    declares: 'b4eb9cf32455cdd4',
    history: [
      "The title of `page.home-business` says Today where it said Overview -> dda4e6d26f4e24c5",
      "`setting.voice_fills_with` says money coming in and money going out where it said what you are owed and what you owe (business-words-69) -> 92204fb054af5ecd",
      "Inside the unreleased 1.7.1: `page.home-business` draws Gone quiet, the founder's table word for word over the source `exceptions` with What, Last seen and Before, six lines at most, straight under What you have and not drawn while nothing is quiet; a block added, no id added or taken away -> b4eb9cf32455cdd4",
    ],
  },
  /* 1.7.2: THE CARD'S SUMMARY IS ONE SHORT LINE. 1.7.1 IS IN THE CATALOGUE, so a version of its own; nothing it declares moved. */
  'business@1.7.2': {
    holds: `
      page.home-business setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with
      setting.voice_nothing_due
    `,
    declares: 'b4eb9cf32455cdd4',
    history: ["The card's summary is one short line, a word outside the pack; `page.home-business` and every other declaration are 1.7.1's word for word -> b4eb9cf32455cdd4"],
  },
  /** SHOP IS NEW (use case 6 of the vision): its first entry, Orders, Products and the Orders page. Unreleased, so the
      Orders section, an order's total and the month's count fold into it rather than a 1.0.1. */
  'business@1.7.3': {
    holds: `
      page.home-business setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with
      setting.voice_nothing_due
    `,
    declares: 'b4eb9cf32455cdd4',
    history: ['A streamer or a creator paid by sponsors is heard as a small business, so `page.home-business` is what they open on; signals only, no id added or taken away -> b4eb9cf32455cdd4'],
  },
  'business@1.8.0': {
    holds: `
      page.home-business setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with
      setting.voice_nothing_due
    `,
    declares: '2a2cf1d91e7de6ed',
    history: ["`page.home-business` no longer opens on how many questions need your call, which Needs your call lists (no briefs, 3 Nov); a block taken away, no id added or taken away -> 2a2cf1d91e7de6ed"],
  },
  'shop@1.0.0': {
    holds: `
      metric.orders-30d metric.orders-due-7d metric.orders-owed page.orders register.orders register.products setting.label_orders
      setting.label_people setting.label_products setting.one_orders setting.one_people setting.one_products
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: '126d3114461cc7fb',
    history: [
      "Shop carries a pack from its first version: `register.orders`, `register.products` and `page.orders`, which draws Due this week and Owed to you only while something is in them -> a61271223d41a338",
      "Folded into the unreleased 1.0.0 (uc6-shop-49): `page.orders` sits in the Orders section, an order in `register.orders` has a total, `orders-30d` counts the month's orders, and the page's line says the month, the week and who still owes what -> 40d9266cbef11245",
      "Folded into the unreleased 1.0.0 (uc6-walk-50): `orders-owed` reads an order with a total to owe, so an order with no total is not counted owing -> 126d3114461cc7fb",
    ],
  },
  'shop@1.1.0': {
    holds: `
      metric.orders-30d metric.orders-due-7d metric.orders-late metric.orders-owed metric.orders-owed-named metric.orders-owed-other
      page.orders register.orders register.products setting.label_orders
      setting.label_people setting.label_products setting.one_orders setting.one_people setting.one_products
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: '4fae7db21e74ee81',
    history: [
      "This week starts today (`orders-due-7d`) and late is its own figure and tile (`orders-late`); a part-paid order is owed (`orders-owed`); the line names the oldest order nothing was paid on and counts the rest (`orders-owed-named`, `orders-owed-other`, shop-sentence-52) -> 4fae7db21e74ee81",
    ],
  },
  'shop@1.2.0': {
    holds: `
      metric.orders-30d metric.orders-due-7d metric.orders-late metric.orders-owed metric.orders-owed-named metric.orders-owed-other
      page.orders register.orders register.products setting.label_orders
      setting.label_people setting.label_products setting.one_orders setting.one_people setting.one_products
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: '68b91519bbf178bd',
    history: [
      'The Orders line counts every other order nothing was paid on beside the one it names (`orders-owed-named.more` in `page.orders`, shop-owed-53-54) -> 4b43574d8fd8259f',
      "Folded into the unreleased 1.2.0: `page.orders` heads its tile of orders not paid in full Still to come in, as Today's money tile says it, with its empty line, and `setting.voice_fills_with` says the money still to come in -> 68b91519bbf178bd",
    ],
  },
  /* THE ORDERS PAGE'S PLACE ON THE RAIL (places-and-computed-101). 1.2.0 IS IN THE CATALOGUE, so a version. */
  'shop@1.3.0': {
    holds: `
      metric.orders-30d metric.orders-due-7d metric.orders-late metric.orders-owed metric.orders-owed-named metric.orders-owed-other
      page.orders register.orders register.products setting.label_orders
      setting.label_people setting.label_products setting.one_orders setting.one_people setting.one_products
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: '3ebf3b51d97bdce0',
    history: [
      '`page.orders` says its place on the rail, `nav.place` 20, second after Work (places-and-computed-101, SHL-A18; batch 101) -> 3ebf3b51d97bdce0',
    ],
  },
  /* A BOX TO ADD AN ORDER. 1.3.0 IS MASTER'S, so a version of its own. */
  'shop@1.4.0': {
    holds: `
      metric.orders-30d metric.orders-due-7d metric.orders-late metric.orders-owed metric.orders-owed-named metric.orders-owed-other
      page.orders register.orders register.products setting.label_orders
      setting.label_people setting.label_products setting.one_orders setting.one_people setting.one_products
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: 'db1dc8be3e901825',
    history: [
      '`page.orders` opens on a capture box for `register.orders` under its line, "Add an order", where a new shop drew nothing to press -> db1dc8be3e901825',
    ],
  },
  /* 1.4.1: THE CARD'S SUMMARY IS ONE SHORT LINE. 1.4.0 IS IN THE CATALOGUE, so a version of its own; nothing it declares moved. */
  'shop@1.4.1': {
    holds: `
      metric.orders-30d metric.orders-due-7d metric.orders-late metric.orders-owed metric.orders-owed-named metric.orders-owed-other
      page.orders register.orders register.products setting.label_orders
      setting.label_people setting.label_products setting.one_orders setting.one_people setting.one_products
      setting.shared_version setting.speaks setting.voice_coming_up setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: 'db1dc8be3e901825',
    history: ["The card's summary is one short line, a word outside the pack; `page.orders` and every other declaration are 1.4.0's word for word -> db1dc8be3e901825"],
  },
  'shop@1.5.0': {
    holds: `
      metric.orders-30d metric.orders-due-7d metric.orders-late metric.orders-owed metric.orders-owed-named
      metric.orders-owed-other metric.products-held metric.products-low page.orders page.products register.orders
      register.products setting.label_orders setting.label_people setting.label_products setting.one_orders
      setting.one_people setting.one_products setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: '828ad70641a0adce',
    history: ['`page.products` is added with `metric.products-held` and `metric.products-low` (audit 31 Oct h, AH4): Products has a page and a place on the rail from the first minute, opening on a box to add one; three ids added and none taken away -> 828ad70641a0adce'],
  },
  'shop@1.6.0': {
    holds: `
      metric.orders-30d metric.orders-due-7d metric.orders-late metric.orders-owed metric.orders-owed-named
      metric.orders-owed-other metric.products-held metric.products-low page.orders page.products register.orders
      register.products setting.label_orders setting.label_people setting.label_products setting.one_orders
      setting.one_people setting.one_products setting.shared_version setting.speaks setting.voice_coming_up
      setting.voice_fills_with setting.voice_nothing_due
    `,
    declares: '6ca58a22141bf3d4',
    history: ["`page.products` no longer opens on a count of products and how many run low (no briefs, 3 Nov); a block taken away, no id added or taken away -> 6ca58a22141bf3d4"],
  },
  'guide@1.7.0': {
    holds: `
      metric.guide-choices-made metric.guide-choices-open metric.guide-idea-left metric.guide-idea-reached metric.guide-milestones metric.guide-milestones-reached metric.guide-milestones-underway metric.guide-resources metric.guide-steps-agents metric.guide-steps-blocked metric.guide-steps-done metric.guide-steps-done-7d metric.guide-steps-done-by-week metric.guide-steps-open metric.milestone-choices metric.milestone-resources metric.milestone-steps page.guide page.home-guide page.milestone register.choices register.milestones register.resources register.steps rule.guide_milestone_open rule.guide_milestone_passed setting.label_choices setting.label_milestones setting.label_resources setting.label_steps setting.one_choices setting.one_milestones setting.one_resources setting.one_steps setting.shared_version setting.speaks setting.start_next_milestone setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '8719fe1699ace09b',
    history: ["Starting a project is part of the New project guide now: `register.steps` gains a why, the reason for a step; nothing taken away -> 8719fe1699ace09b"],
  },
  /* 1.7.1: THE CARD'S SUMMARY IS ONE SHORT LINE. 1.7.0 IS IN THE CATALOGUE, so a version of its own; nothing it declares moved. */
  'guide@1.7.1': {
    holds: `
      metric.guide-choices-made metric.guide-choices-open metric.guide-idea-left metric.guide-idea-reached metric.guide-milestones metric.guide-milestones-reached metric.guide-milestones-underway metric.guide-resources metric.guide-steps-agents metric.guide-steps-blocked metric.guide-steps-done metric.guide-steps-done-7d metric.guide-steps-done-by-week metric.guide-steps-open metric.milestone-choices metric.milestone-resources metric.milestone-steps page.guide page.home-guide page.milestone register.choices register.milestones register.resources register.steps rule.guide_milestone_open rule.guide_milestone_passed setting.label_choices setting.label_milestones setting.label_resources setting.label_steps setting.one_choices setting.one_milestones setting.one_resources setting.one_steps setting.shared_version setting.speaks setting.start_next_milestone setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_lists setting.voice_needs_you setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '8719fe1699ace09b',
    history: ["The card's summary is one short line, a word outside the pack; `page.home-guide` and every other declaration are 1.7.0's word for word -> 8719fe1699ace09b"],
  },
  'guide@1.8.0': {
    holds: `
      metric.guide-choices-made metric.guide-choices-open metric.guide-idea-left metric.guide-idea-reached
      metric.guide-milestones metric.guide-milestones-reached metric.guide-milestones-underway
      metric.guide-resources metric.guide-steps-agents metric.guide-steps-blocked metric.guide-steps-done
      metric.guide-steps-done-7d metric.guide-steps-done-by-week metric.guide-steps-open metric.milestone-choices
      metric.milestone-resources metric.milestone-steps page.guide page.home-guide page.milestone register.choices
      register.milestones register.resources register.steps rule.guide_milestone_open rule.guide_milestone_passed
      setting.label_choices setting.label_milestones setting.label_resources setting.label_steps
      setting.one_choices setting.one_milestones setting.one_resources setting.one_steps setting.shared_version
      setting.speaks setting.start_next_milestone setting.voice_add_first setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_lists setting.voice_needs_you
      setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_needs_you
      setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits setting.voice_record_empty
      setting.voice_right_now setting.voice_since_away
    `,
    declares: '65ca41a6f13bae20',
    history: ["`page.home-guide` and the Guide no longer open on a line counting milestones, steps and choices (no briefs, 3 Nov); two blocks taken away, no id added or taken away -> 65ca41a6f13bae20"],
  },
  'student@1.6.0': {
    holds: `
      metric.courses-held metric.homework-due-7d metric.homework-later metric.homework-open metric.study-done-12w metric.study-held page.home-student page.studies register.assignments register.course_reads register.courses register.study_sessions setting.label_assignments setting.label_course_reads setting.label_courses setting.label_study_sessions setting.one_assignments setting.one_course_reads setting.one_courses setting.one_study_sessions setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '7ad0fb8e9bdb5e06',
    history: ["Studies is part of Student now: `register.assignments` gains a mark, and `register.course_reads` is a reading list beside the courses; nothing taken away -> 7ad0fb8e9bdb5e06"],
  },
  /* 1.6.1: THE CARD'S SUMMARY IS ONE SHORT LINE. 1.6.0 IS IN THE CATALOGUE, so a version of its own; nothing it declares moved. */
  'student@1.6.1': {
    holds: `
      metric.courses-held metric.homework-due-7d metric.homework-later metric.homework-open metric.study-done-12w metric.study-held page.home-student page.studies register.assignments register.course_reads register.courses register.study_sessions setting.label_assignments setting.label_course_reads setting.label_courses setting.label_study_sessions setting.one_assignments setting.one_course_reads setting.one_courses setting.one_study_sessions setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: '7ad0fb8e9bdb5e06',
    history: ["The card's summary is one short line, a word outside the pack; `page.home-student` and every other declaration are 1.6.0's word for word -> 7ad0fb8e9bdb5e06"],
  },
  'student@1.6.2': {
    holds: `
      metric.courses-held metric.homework-due-7d metric.homework-later metric.homework-open metric.study-done-12w metric.study-held page.home-student page.studies register.assignments register.course_reads register.courses register.study_sessions setting.label_assignments setting.label_course_reads setting.label_courses setting.label_study_sessions setting.one_assignments setting.one_course_reads setting.one_courses setting.one_study_sessions setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: 'f80174fb4b380904',
    history: ["`page.home-student` heads its twelve weeks of study by day Study done, where it said Study streak and \"your streak starts here\" (audit 6g, AG12): no game score; words only, no id added or taken away -> f80174fb4b380904"],
  },
  'student@1.7.0': {
    holds: `
      metric.courses-held metric.homework-due-7d metric.homework-later metric.homework-open metric.study-done-12w
      metric.study-held page.home-student page.studies register.assignments register.course_reads register.courses
      register.study_sessions setting.label_assignments setting.label_course_reads setting.label_courses
      setting.label_study_sessions setting.one_assignments setting.one_course_reads setting.one_courses
      setting.one_study_sessions setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up
      setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you
      setting.voice_new_row setting.voice_no_questions setting.voice_nothing_due setting.voice_nothing_needs_you
      setting.voice_nothing_now setting.voice_overdue setting.voice_pen_waits setting.voice_record_empty
      setting.voice_right_now setting.voice_since_away
    `,
    declares: 'c6e495cbc76c73cc',
    history: ['`page.studies` takes its place on the rail and opens on boxes to add a piece of work and a course (audit 31 Oct h, AH4); no id added or taken away -> c6e495cbc76c73cc'],
  },
  'student@1.8.0': {
    holds: `
      metric.courses-held metric.homework-due-7d metric.homework-later metric.homework-open metric.study-done-12w
      metric.study-held page.home-student page.studies register.assignments register.course_reads register.courses
      register.study_sessions setting.label_assignments setting.label_course_reads setting.label_courses
      setting.label_study_sessions setting.one_assignments setting.one_course_reads setting.one_courses
      setting.one_study_sessions setting.shared_version setting.speaks setting.voice_add_first
      setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_inbox_clear
      setting.voice_lists setting.voice_needs_you setting.voice_new_row setting.voice_no_questions
      setting.voice_nothing_due setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_overdue
      setting.voice_pen_waits setting.voice_record_empty setting.voice_right_now setting.voice_since_away
    `,
    declares: 'd7345d7187706f5d',
    history: ["`page.home-student` and the Studies page no longer open on a line counting work and courses (no briefs, 3 Nov); two blocks taken away, no id added or taken away -> d7345d7187706f5d"],
  },
  'team@2.29.0': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review setting.label_things setting.label_tracks setting.label_updates setting.one_cycle_days setting.one_cycle_plan setting.one_cycles setting.one_people setting.one_tasks setting.one_things setting.one_tracks setting.one_updates setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '8d09acce2d6bc162',
    history: ["Team task list is part of Team board now: `register.cycles` gains a retro, a document for how the cycle went; nothing taken away -> 8d09acce2d6bc162"],
  },
  /* 2.29.1: THE CARD'S SUMMARY IS ONE SHORT LINE. 2.29.0 IS IN THE CATALOGUE, so a version of its own; nothing it declares moved. */
  'team@2.29.1': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review setting.label_things setting.label_tracks setting.label_updates setting.one_cycle_days setting.one_cycle_plan setting.one_cycles setting.one_people setting.one_tasks setting.one_things setting.one_tracks setting.one_updates setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: '8d09acce2d6bc162',
    history: ["The card's summary is one short line, a word outside the pack; `page.home-team` and every other declaration are 2.29.0's word for word -> 8d09acce2d6bc162"],
  },
  'team@2.29.2': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people setting.label_people__role__collaborator setting.label_tasks setting.label_tasks__state__backlog setting.label_tasks__state__doing setting.label_tasks__state__open setting.label_tasks__state__review setting.label_things setting.label_tracks setting.label_updates setting.one_cycle_days setting.one_cycle_plan setting.one_cycles setting.one_people setting.one_tasks setting.one_things setting.one_tracks setting.one_updates setting.shared_version setting.speaks setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away setting.voice_working_now
    `,
    declares: 'cf97a60188fc2399',
    history: ["`page.project` labels the cards of And from everywhere \"What it is\", not \"Kind\". Words only, no id added or taken away -> cf97a60188fc2399"],
  },
  'team@2.30.0': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning rule.ticket_done_ticks_plan
      rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket setting.holds_people
      setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people
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
    declares: '7ee971b7a8020e12',
    history: ['`page.cycles` takes its place on the rail and opens on a box to add a cycle (audit 31 Oct h, AH4); no id added or taken away -> 7ee971b7a8020e12'],
  },
  'team@2.30.1': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning rule.ticket_done_ticks_plan
      rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket setting.holds_people
      setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people
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
    declares: 'aceabf9e31d40769',
    history: ['`register.cycles` is called Sprints, `register.cycle_plan` Sprint plan and `register.cycle_days` Open each morning, with the words on `page.cycles` and `page.home-team` (audit 31 Oct h, AH21); words only, no id added or taken away -> aceabf9e31d40769'],
  },
  'team@2.30.2': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning rule.ticket_done_ticks_plan
      rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket setting.holds_people
      setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people
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
    declares: '9c816f722db330f0',
    history: ['`page.cycles` files itself under a section called Sprints and `page.agent-work` under Agents, so the rail names a section by what it holds (UP2); words on the rail only, no id added or taken away -> 9c816f722db330f0'],
  },
  'team@2.30.3': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning rule.ticket_done_ticks_plan
      rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket setting.holds_people
      setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people
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
    declares: '4a953a59b6c71c51',
    history: ['`register.cycle_days` is called Sprint days, a noun beside Sprints and Sprint plan, with the word on `setting.label_cycle_days` (audit 31 Oct l, AL11); words only, no id added or taken away -> 4a953a59b6c71c51'],
  },
  'team@2.30.4': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning rule.ticket_done_ticks_plan
      rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket setting.holds_people
      setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people
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
    declares: '1efd300ad1e05bda',
    history: ['`setting.label_people` says People, as the rail, Today and the People page say it, where the list was Teammates under More lists (audit 31 Oct m, AM17); words only, no id added or taken away -> 1efd300ad1e05bda'],
  },
  'team@2.30.5': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning rule.ticket_done_ticks_plan
      rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket setting.holds_people
      setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan setting.label_cycles setting.label_people
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
    declares: '74ac808ecb502c71',
    history: ['`page.cycles` draws its own glyph, where it drew the three lines the phone bar\'s Menu draws (audit 31 Oct o, AO14); the look only, no id added or taken away -> 74ac808ecb502c71'],
  },
  'team@2.31.0': {
    holds: `
      metric.tickets-blocked metric.tickets-done-by-agents metric.tickets-due-else metric.tickets-in-flight
      metric.tickets-planned metric.tickets-taken page.agent-work page.cycles page.home-team page.project
      register.cycle_days register.cycle_plan register.cycles rule.cycle_day_each_morning
      rule.ticket_done_ticks_plan rule.ticket_reopened_unticks_plan script.cycle_day script.plan_follows_ticket
      setting.holds_people setting.holds_tasks setting.label_cycle_days setting.label_cycle_plan
      setting.label_cycles setting.label_people setting.label_people__role__collaborator setting.label_tasks
      setting.label_tasks__state__backlog setting.label_tasks__state__doing setting.label_tasks__state__open
      setting.label_tasks__state__review setting.label_things setting.label_tracks setting.label_updates
      setting.one_cycle_days setting.one_cycle_plan setting.one_cycles setting.one_people setting.one_tasks
      setting.one_things setting.one_tracks setting.one_updates setting.shared_version setting.speaks
      setting.voice_add_first setting.voice_coming_up setting.voice_fills_with setting.voice_home
      setting.voice_inbox_clear setting.voice_lists setting.voice_needs_you setting.voice_no_questions
      setting.voice_nothing_needs_you setting.voice_nothing_now setting.voice_nothing_waiting
      setting.voice_overdue setting.voice_pen_waits setting.voice_right_now setting.voice_since_away
      setting.voice_working_now
    `,
    declares: '34ceb0044973d7e5',
    history: ["`page.home-team`, `page.cycles` and `page.agent-work` no longer open on a line counting tickets (no briefs, 3 Nov); three blocks taken away, no id added or taken away -> 34ceb0044973d7e5"],
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
