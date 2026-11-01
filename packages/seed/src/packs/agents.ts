/**
 * The agents pack: what an agent finds out, the skills it uses, the keys it is handed, and the tools
 * it runs, each at a project or everywhere.
 *
 * IT REQUIRES `things` AND NOTHING ELSE. Every module can be switched off, People included,
 * so no field here points at a person. A row applies to a project or to
 * everywhere, and a record without People loses nothing this pack holds.
 *
 * A KEY'S ROW IS AN INDEX. `value` names the grant the Keychain sealed a key into, and only the Keychain
 * door writes it: a create naming it is refused, so no seed row and no pack seed can carry one.
 */

import type { SeedRegister } from '../index.ts';
import type { SeedMetric } from '../modules/base.ts';

export type PackManifest = { id: string; version: string; requires: readonly string[] };

/**
 * WHAT MAKES TWO ROWS OF A LIST ONE THING, SINCE 1.13.0 (with the half of AGT-D03 that declares it on tools
 * and keys): the fields that say it, the scope field they are compared within, and how they are folded first. `text`
 * folds case, accents, spaces, a last word in brackets and a file ending; `exact` only trims. `keep` says which of two
 * alike stays, and `sealed` keeps the one holding a sealed value whatever its age. The kernel reads it
 * (`packages/kernel/src/declare.ts`); this add-on only says it, as data every record gets.
 */
type Same = { fields: readonly string[]; within?: string; fold: 'text' | 'exact'; keep?: 'oldest' | 'latest' | 'sealed' };

export const AGENTS_REGISTERS: Record<string, SeedRegister & { same?: Same; role?: string; fade?: { field: string; after: string } }> = {
  learnings: {
    id: 'learnings',
    name: 'Learnings',
    one: 'learning',
    icon: 'learning',
    pack: 'agents',
    /* THE PART EACH LIST PLAYS FOR THE RECORD'S AGENTS, SINCE 1.13.0 (agents-by-role-101), said by the list and not by its
       id, so a list renamed on a real record is still found; and the day a learning fades by, ninety days unconfirmed. */
    role: 'learnings',
    fade: { field: 'confirmed_on', after: '90d' },
    seq_prefix: 'LN',
    /* THE FOUR-PART TEST IN ONE LINE, SINCE 1.13.0: an agent reads a list's own words with its shape, and
       the test was in one document and in nothing an agent reads. No full stop, because a page says "Learnings holds"
       and this, and ends it. */
    holds:
      'what an agent found out the hard way, with the failure that taught it. Record one only when it changes what a session does, holds beyond this one case, a session without it would get something wrong, and it has no other home',
    title: 'lesson',
    state: 'state',
    done: ['superseded', 'reverted'],
    /* ONE LESSON IS ONE LEARNING WITHIN A PROJECT, folded as text, so a second agent saying it again in other case or
       spacing is the same lesson. */
    same: { fields: ['lesson'], within: 'project', fold: 'text' },
    /* `topic` IS ON THE SHORT FORM SINCE 1.3.0, so `context` hands an agent the skill a lesson bears on (`brief()` in
       `packages/record/src/index.ts` projects the title and these), which is what tells a run a skill may need its next
       version.

       IT TAKES `project`'S PLACE, because a short form holds three fields (`docs/42-SPEC-DECLARE.md` §4.4) and `project`
       was the one of them `context` never carried: `brief()` skips the scope field and says `project` or `global`
       instead. On the list, "Where it applies" is no longer a column it opens on, and the Display sheet still offers
       it (`columnsFor` in `apps/web/src/lib/record/api.ts`). */
    mobile: ['lesson', 'kind', 'topic'],
    fields: [
      { id: 'lesson', label: 'Lesson', type: 'text', required: true, min: 12, max: 400, search: true },
      /* The failure that taught it. Required, because a lesson with no failure behind it cannot be
         checked when it stops being true. */
      { id: 'because', label: 'Because', type: 'text', required: true, min: 24, max: 600, search: true },
      /* `rule` SINCE 1.13.0: what a person writes for every session to be handed first, such as "divide
         estimates by 4". An added value, so no row changes. */
      { id: 'kind', label: 'Kind', type: 'enum', values: ['method', 'fact', 'rule'], labels: { rule: 'Rule' }, required: true, index: true },
      { id: 'project', label: 'Where it applies', type: 'ref', to: 'things', index: true, scope: { widen: 'person' } },
      /* A SKILL'S NAME WHEN THE LESSON BEARS ON ONE, and a plain topic otherwise. The id stays `topic`, because ids are
         for ever; the label says what an agent should write in it. */
      { id: 'topic', label: 'Skill or topic it bears on', type: 'text', index: true },
      { id: 'confirmed_on', label: 'Last confirmed', type: 'day', index: true },
      { id: 'supersedes', label: 'Replaces', type: 'ref', to: 'learnings' },
      {
        id: 'state',
        label: 'Status',
        type: 'enum',
        values: ['active', 'superseded', 'reverted'],
        default: 'active',
        required: true,
        index: true,
        transitions: {
          active: { to: ['superseded', 'reverted'], requires: ['why'] },
          superseded: { to: ['active'], by: 'decide' },
          reverted: { to: ['active'], by: 'decide' },
        },
      },
      { id: 'why', label: 'Why it changed', type: 'text', min: 24 },
    ],
  },
  skills: {
    id: 'skills',
    name: 'Skills',
    one: 'skill',
    icon: 'skill',
    pack: 'agents',
    role: 'skills',
    holds: 'what a session can do here, the moment to reach for it, and its text, versioned',
    title: 'name',
    state: 'state',
    done: ['retired'],
    /* ONE NAME IS ONE SKILL WITHIN A PROJECT, as it is written, because the name is the folder the skill is written to
       and two folders differ by a letter's case. */
    same: { fields: ['name'], within: 'project', fold: 'exact' },
    /* `because` IS ON THE SHORT FORM SINCE 1.3.0, so `context` says which learnings a skill already carries, by their
       spoken ids, and a lesson bearing on it that is not among them is the one to propose into its next version.

       IT IS A FOURTH FIELD AND TAKES NO OTHER'S PLACE, because each of the three before it is needed where it is: the
       skills sync reads `trigger` and `rev` off each row of `context` (`apps/cli/src/skills.ts`), and a list's card is
       titled by the first (`RowCards.svelte` in `apps/web/src/lib/ui`). A card is drawn from three fields, so `because`
       goes after them: it is here for `context`, not for a card. */
    mobile: ['name', 'trigger', 'rev', 'because'],
    fields: [
      /* The folder name the skill is written to, so a project's skill of the same name replaces the global one. */
      { id: 'name', label: 'Name', type: 'text', required: true, max: 64, index: true, search: true },
      { id: 'trigger', label: 'When to use it', type: 'text', required: true, max: 400, search: true },
      { id: 'what', label: 'What it is', type: 'text', max: 400 },
      { id: 'kind', label: 'Kind', type: 'enum', values: ['skill', 'command'], default: 'skill', required: true, index: true },
      { id: 'project', label: 'Where it applies', type: 'ref', to: 'things', index: true, scope: { widen: 'person', same: 'nearer' } },
      /* The text and its version change only by the owner's press, so a session proposes a new version. */
      { id: 'body', label: 'Text', type: 'document', required: true, by: 'decide' },
      { id: 'rev', label: 'Version', type: 'int', default: 1, required: true, by: 'decide' },
      { id: 'managed', label: 'Written by the record', type: 'bool', default: true },
      { id: 'source', label: 'Source', type: 'url' },
      { id: 'because', label: 'Learnings behind it', type: 'list', of: 'ref', to: 'learnings' },
      { id: 'state', label: 'Status', type: 'enum', values: ['active', 'retired'], default: 'active', required: true, index: true },
    ],
  },
  credentials: {
    id: 'credentials',
    name: 'Keys',
    one: 'key',
    icon: 'key',
    pack: 'agents',
    role: 'keys-index',
    holds: 'what each key opens and where it applies; the key itself is sealed in the Keychain or kept somewhere named',
    title: 'label',
    state: 'state',
    done: ['retired'],
    /* ONE NAME IS ONE KEY WITHIN A PROJECT, and of two alike the one holding the sealed value stays: an import's index
       row is often the older and the Keychain's the newer, so keeping the oldest would lose the key. */
    same: { fields: ['label'], within: 'project', fold: 'text', keep: 'sealed' },
    mobile: ['label', 'opens', 'project'],
    fields: [
      { id: 'label', label: 'Name', type: 'text', required: true, max: 120, search: true },
      { id: 'opens', label: 'What it opens', type: 'text', required: true, max: 280, search: true },
      { id: 'provider', label: 'Provider', type: 'text', index: true, search: true },
      /* WHICH ACCOUNT THE KEY IS FOR, as a keychain names it beside a password: a user name, an address or an account id.
         Added in 1.23.0. Never the key: a text field goes through the kernel's credential check, so one shaped like a key
         is refused. */
      { id: 'account', label: 'Account', type: 'text', max: 280, search: true },
      /* The kinds the vault seals (`packages/kernel/src/vault.ts`). SAID AS THE KEYCHAIN SAYS THEM SINCE 1.28.0: a key's
         page read "Kind: Api token" and "Ssh key". Not by declared labels: a label map holds a key named `api_token`, and
         a pack carrying one is refused as a secret in a file people share. The app says an unlabelled value in words
         and keeps API and SSH in capitals (`enumWords` in apps/web/src/lib/record/api.ts). */
      {
        id: 'kind',
        label: 'Kind',
        type: 'enum',
        values: ['api_token', 'password', 'ssh_key', 'recovery_codes', 'note'],
        required: true,
        index: true,
      },
      { id: 'project', label: 'Where it applies', type: 'ref', to: 'things', index: true, scope: { widen: 'person' } },
      { id: 'value', label: 'Locked value', type: 'secret' },
      /* For a key that is not in the Keychain: where a person finds it. */
      { id: 'where', label: 'Kept at', type: 'text', max: 280 },
      { id: 'origin', label: 'Came from', type: 'text', max: 280 },
      /* WHAT A PERSON WROTE ABOUT THE KEY, AND NEVER THE KEY. Added in 1.2.0 because an imported key register carried a
         note on 83 of its 91 rows and Keys had nowhere to put one, so the import left every one of them behind. A text
         field goes through the kernel's credential check like `opens` does, so a note shaped like a key is refused. */
      { id: 'note', label: 'Note', type: 'text' },
      { id: 'verified', label: 'Last known to work', type: 'day' },
      { id: 'expires', label: 'Expires', type: 'day', deadline: true, remind: ['-14d', '-2d'] },
      { id: 'state', label: 'Status', type: 'enum', values: ['live', 'stale', 'invalid', 'missing', 'retired'], default: 'live', required: true, index: true },
    ],
  },
  tools: {
    id: 'tools',
    name: 'Tools',
    one: 'tool',
    icon: 'plug',
    pack: 'agents',
    role: 'tools',
    holds: 'every MCP server, command line and integration an agent uses, how it starts, and the keys it needs by name',
    title: 'name',
    state: 'state',
    done: ['retired'],
    /* ONE PROGRAM IS ONE TOOL, said by its name within a project and folded as text. NOT BY `command`, the one text field
       that says what runs: it is `npx` or `uvx` for most servers, with the program in `args`, a list a key cannot be
       read from, and an `http` tool has none. So two rows of one program are found by the name they share, folded. */
    same: { fields: ['name'], within: 'project', fold: 'text' },
    mobile: ['name', 'kind', 'project'],
    fields: [
      { id: 'name', label: 'Name', type: 'text', required: true, max: 64, index: true, search: true },
      { id: 'kind', label: 'Kind', type: 'enum', values: ['mcp', 'cli', 'integration'], labels: { mcp: 'MCP server', cli: 'Command line', integration: 'Integration' }, required: true, index: true },
      /* HOW IT RUNS IN PLAIN WORDS SINCE 1.28.0: a tool's page read "Transport: Stdio" and "Transport: Http". The values
         stay what an MCP client writes; only what a person reads changed. */
      {
        id: 'transport',
        label: 'How it runs',
        type: 'enum',
        values: ['stdio', 'http'],
        labels: { stdio: 'Runs on your machine', http: 'Reached over the web' },
        required_when: { field: 'kind', is: 'mcp' },
      },
      { id: 'command', label: 'Command', type: 'text', max: 512, required_when: { field: 'transport', is: 'stdio' } },
      { id: 'args', label: 'Arguments', type: 'list', of: 'text' },
      /* Text and not `url`, because `url` refuses an `http:` address and a local server has one. */
      { id: 'endpoint', label: 'Address', type: 'text', max: 512, required_when: { field: 'transport', is: 'http' } },
      /* Names only: `NAME=credentials#12`, `header:Authorization=credentials#9`, or a bare `NAME`. */
      { id: 'needs', label: 'Keys it needs', type: 'list', of: 'text' },
      { id: 'trigger', label: 'When to use it', type: 'text', max: 400, search: true },
      { id: 'project', label: 'Where it applies', type: 'ref', to: 'things', index: true, scope: { widen: 'person', same: 'nearer' } },
      { id: 'hosts', label: 'Seen on', type: 'list', of: 'text' },
      { id: 'seen', label: 'Last seen', type: 'instant', index: true },
      { id: 'origin', label: 'Came from', type: 'text', max: 280 },
      { id: 'state', label: 'Status', type: 'enum', values: ['active', 'stale', 'invalid', 'retired'], default: 'active', required: true, index: true },
    ],
  },
};

/**
 * THE WEEKS THE BRAIN GREW IN: how many learnings, keys and tools were added each week.
 *
 * BY `created_at`, THE DAY THE RECORD WROTE THE ROW, because no field a person types says when a lesson was learned or a
 * key was handed over, and the record stamps every row it writes. The kernel groups a figure by one of the two instants
 * it stamps and reads it off the row's own column (`evaluateMetric` and `groupsOf` in `packages/kernel/src/metrics.ts`).
 *
 * MORE WEEKS ARE READ THAN DRAWN. Twenty-four weeks is the most a `series` block reaches back (`SERIES_BACK.most` in
 * `packages/kernel/src/series.ts`), and each figure reads a little further, so the oldest week on a chart is whole: a
 * week cut by the figure's own window would be drawn short and read as a quiet week.
 *
 * NO PAGE OF THIS PACK DREW THEM FROM 1.5.0, when Growth left the agents home with the rest of its inventory, TO 1.13.0,
 * when How the brain changed took the learnings' weeks for its chart. The keys' and the tools' stay declared and drawn
 * by no page of this pack: a person's own page can chart them, and an agent can read them.
 *
 * A COUNT HAS NO GOOD OR BAD NUMBER, so each target is only that it is a count, as Work's weekly figures are.
 */
const WEEKLY = { value: { count: 'id' }, group_by: 'created_at', bucket: 'week', format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as const;

/** A count of rows now, with no good or bad number, as the weekly figures are. */
const COUNT = { value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as const;

/** A count of the skills that took a new version, SINCE 1.13.0, over the log: each figure gives its own window. */
const CHANGED = { value: { count: 'changed', field: 'rev' }, format: 'int', target: { gte: 0 }, compare: 'none' } as const;

/** A count of rows that should be none, SINCE 1.10.0: each one is something to put right, so above nought misses. */
const FIX = { ...COUNT, target: { lte: 0 } } as const;

/**
 * THE AGENT DOOR'S OWN SIGNS, SINCE 1.10.0: what the door's marks add up to over the last week, read by the
 * kernel's `record.door` (`readDoor` in `packages/kernel/src/built-in-figures.ts`), each naming the one sign it is.
 * Declared here so a page and the vital signs draw them with no new code. Nothing is read over a week nobody reached
 * the door, never nought. `value` is a count only because every figure carries one; the reader reads the sign.
 *
 * `called` is a count with no verdict: the guard of fewer than half the last ten runs making a call is the proof
 * area's daily reader, not a target. `behind` needs the build the host runs, and `card` a mark nothing posts yet.
 */
const DOOR = { source: 'record.door', value: { count: 'id' }, format: 'int', window: '7d', compare: 'none' } as const;
const DOOR_METRICS: Record<string, SeedMetric & { sign: string }> = {
  'agent-door-called': { metric: 'agent-door-called', name: 'Agent runs that made a call', sign: 'called', target: { gte: 0 }, ...DOOR },
  'agent-door-builds-behind': { metric: 'agent-door-builds-behind', name: 'Agent runs on an older build', sign: 'behind', target: { lte: 0 }, ...DOOR },
  'agent-door-internal': { metric: 'agent-door-internal', name: 'Agent door answers that failed inside', sign: 'internal', target: { lte: 0 }, ...DOOR },
  'agent-hook-slowest': { metric: 'agent-hook-slowest', name: 'Slowest start hook, in milliseconds', sign: 'hookSlowestMs', target: { gte: 0 }, ...DOOR },
  'agent-card-words': { metric: 'agent-card-words', name: 'Most words on one agent card', sign: 'cardWordsMost', target: { gte: 0 }, ...DOOR },
};

/**
 * THE RUNS WORKING NOW ARE THE KERNEL'S, SINCE 1.9.0: active and heard from inside fifteen minutes, its working runs
 * with no working parent (`sessions.working`, counted as the built-in `runs-working`, both over `workingRuns` in
 * `packages/kernel/src/presence.ts`). Until 1.9.0 this pack held its own clause, active and heard from today, and the
 * owner's record said four agents worked while two of the four were last heard from two and four hours before. The
 * sentence grammar counts in days, so no clause could say fifteen minutes; and eight readers worked "working" out eight
 * ways. One clock now, so the rail, Today and this page cannot disagree about who is working.
 */

/**
 * THE RUNS UNDER THREE HEADINGS, SINCE 1.6.0, each run under one: a run active and heard from inside fifteen minutes
 * is working (the kernel's), one that stopped today is Today (`RUNS_TODAY`), and anything last heard from before today
 * is Earlier (`RUNS_EARLIER`), the run the end hook never closed among them. An active run quiet since earlier today is
 * under none of the three, and Today's lanes still draw it.
 */

/**
 * A RUN OF ITS OWN THAT DID SOMETHING, SINCE 1.12.0: not a helper, whose work is its parent's and is counted on the
 * parent's card, and not a run that signed no write. `is not 0` and never "above nought", which the grammar cannot
 * say: so a run whose writes the record has not counted yet (`wrote` missing, migration 28's steps not there) is kept,
 * as the record's own tidy keeps it (`runs-empty` in `packages/kernel/src/tidy.ts`: nought, never missing).
 */
const RAN = 'parent is empty, wrote is not 0';

/**
 * THE RUNS THAT ENDED OR STOPPED TODAY. FROM 1.6.0 TO 1.11.0 only idle or handed off, read among the runs not finished
 * (`sessions.live`), so a run that ended properly, as done, was on no part of the page it should be listed on. SINCE
 * 1.12.0 every run of the list last heard from today that is not active, the finished ones too, less the helpers and
 * the runs that wrote nothing (`RAN`). NOT ACTIVE, because a run active and heard from inside fifteen minutes is a
 * Working card and would be drawn twice; one active and quiet since earlier today is under neither, and Today's lanes
 * still draw it (the grammar counts in days, so no clause can say fifteen minutes).
 */
export const RUNS_TODAY = `state is not active, last_seen is today, ${RAN}`;

/** THE RUNS LAST HEARD FROM BEFORE TODAY, whatever they say they are doing; SINCE 1.12.0 the finished ones too, less
 *  the helpers and the runs that wrote nothing. The run the end hook never closed is among them, as it was. */
export const RUNS_EARLIER = `last_seen before today, ${RAN}`;

/**
 * THE LEARNINGS THAT HAVE FADED, BY THE RECORD'S OWN RULE: active, and neither confirmed nor written in the last ninety
 * days (`FADES` and `FADE_MS` in `packages/record/src/index.ts`, which leaves them out of `context`). A learning never
 * confirmed is judged by the day it was written.
 *
 * A TREE AND NOT A SENTENCE, because the rule is an `and` around an `or`, and a sentence may join its clauses with
 * commas or with `, or` but not both (`packages/where/src/sentence.ts`).
 *
 * ONE TREE SINCE 1.13.0, read by the figure and by Faded on How the brain changed, so the heading's count, the cards
 * under it and the page's line cannot count three ways.
 */
const FADED = {
  all: [
    { field: 'state', is: 'active' },
    {
      any: [
        { field: 'confirmed_on', before: '-90d' },
        { all: [{ field: 'confirmed_on', empty: true }, { field: 'created_at', before: '-90d' }] },
      ],
    },
  ],
};

export const AGENTS_METRICS: Record<string, SeedMetric> = {
  'learnings-by-week': { metric: 'learnings-by-week', name: 'Learnings added, by week', source: 'register.learnings', where: 'created_at after -182d', ...WEEKLY },
  'keys-by-week': { metric: 'keys-by-week', name: 'Keys added, by week', source: 'register.credentials', where: 'created_at after -182d', ...WEEKLY },
  'tools-by-week': { metric: 'tools-by-week', name: 'Tools added, by week', source: 'register.tools', where: 'created_at after -182d', ...WEEKLY },
  'learnings-faded': {
    metric: 'learnings-faded',
    name: 'Faded learnings',
    source: 'register.learnings',
    where: FADED,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* WHAT THE AGENTS PAGE IS DRAWN ON, SINCE 1.4.0, each over its tile's own clauses, so a tile is not drawn over
     nothing and the line at the top can say the runs as a number. A run is a row of the kernel's own `session` list,
     which every record holds. HOW MANY WORK NOW IS NOT DECLARED HERE SINCE 1.9.0: `agents-working` counted this pack's
     own clause, and the line reads the record's built-in `runs-working`, the runs the Working cards draw. */
  'runs-left-next': { metric: 'runs-left-next', name: 'Runs that left a next step', source: 'register.session', where: 'state is idle or handoff, next is set', ...COUNT },
  /* THE TWO GROUPS OF STOPPED RUNS, SINCE 1.6.0, each over its cards' own clause, so a heading is drawn only over runs.
     THE SAME RUNS AS THE CARDS SINCE 1.12.0, to the letter: both read the list of runs by the one clause, the finished
     runs counted too, where Earlier's figure had to say again which runs `sessions.live` lists. */
  'runs-today': { metric: 'runs-today', name: 'Runs that stopped today', source: 'register.session', where: RUNS_TODAY, ...COUNT },
  /* EVERY RUN HEARD FROM TODAY, SINCE 1.8.0, whatever it says it is doing, a finished one included: what Today's lanes
     are drawn on, over the list they read. */
  'runs-heard-today': { metric: 'runs-heard-today', name: 'Runs heard from today', source: 'register.session', where: 'last_seen is today', ...COUNT },
  'runs-earlier': { metric: 'runs-earlier', name: 'Runs last heard from before today', source: 'register.session', where: RUNS_EARLIER, ...COUNT },
  'learnings-active': { metric: 'learnings-active', name: 'Learnings in use', source: 'register.learnings', where: 'state is active', ...COUNT },
  'skills-active': { metric: 'skills-active', name: 'Skills in use', source: 'register.skills', where: 'state is active', ...COUNT },
  /* ONE SKILL'S LESSONS, `{{it}}` filled from the skill page's own `{{name}}`, the clauses of the tile drawn on it. */
  'skill-learnings': { metric: 'skill-learnings', name: 'Learnings that bear on a skill', source: 'register.learnings', where: 'topic is {{it}}, state is active', ...COUNT },
  /* THE KEYS, SINCE 1.10.0: how many keys not retired the Keychain holds a value for, a number with no verdict
     to read beside the Keychain's own "sealed here", which counts every key but the retired ones (`keysOf` in
     `apps/web/src/lib/record/vault.ts`), so a key gone stale still counts as sealed; how many live keys hold no value
     and do not say where they are kept, so nobody could find them again; and how many are past their day. A sealed
     field answers only `is set` and `is empty` (`packages/where/src/sentence.ts`), never what it holds. */
  'keys-sealed': { metric: 'keys-sealed', name: 'Keys sealed in the Keychain', source: 'register.credentials', where: 'state is not retired, value is set', ...COUNT },
  /* EVERY KEY NOT RETIRED, as the Keychain's "have no value yet" counts (`missing`
     in `apps/web/src/routes/vault/tiles.ts`): a stale or broken key with no value is as lost as a live one. */
  'keys-nowhere': { metric: 'keys-nowhere', name: 'Keys with no value and nowhere they are kept', source: 'register.credentials', where: 'state is not retired, value is empty, where is empty', ...FIX },
  'keys-expired': { metric: 'keys-expired', name: 'Keys past their day', source: 'register.credentials', where: 'state is live, expires before today', ...FIX },
  /**
   * THE TOOLS NOT SEEN IN A MONTH, SINCE 1.10.0: active, and last seen more than thirty days ago, or never seen and
   * written more than thirty days ago. A tree for the reason `learnings-faded` is one: an `and` around an `or`.
   */
  'tools-unseen': {
    metric: 'tools-unseen',
    name: 'Tools not seen in a month',
    source: 'register.tools',
    where: {
      all: [
        { field: 'state', is: 'active' },
        {
          any: [
            { field: 'seen', before: '-30d' },
            { all: [{ field: 'seen', empty: true }, { field: 'created_at', before: '-30d' }] },
          ],
        },
      ],
    },
    ...FIX,
  },
  /* THE RUNS OF THE LAST TWO WEEKS PLACED IN NO PROJECT, SINCE 1.10.0. A run outside every project is allowed, so it has
     no verdict: it is the number to read beside the count of runs. */
  'runs-unplaced': { metric: 'runs-unplaced', name: 'Runs in no project, last two weeks', source: 'register.session', where: 'last_seen after -14d, project is empty', ...COUNT },
  /* WHAT HOW THE BRAIN CHANGED IS SAID AND DRAWN ON, SINCE 1.13.0 (AGT-C17 job b). How many learnings arrived in thirty
     days, by the day the record wrote each, which is the line's "this month". And how many of the six months the chart
     reaches back arrived two weeks ago or more: the chart trims the weeks before its first learning (`barsOf` in
     `packages/kernel/src/series.ts`), so one learning that old makes three weeks of bars at least, and with none the
     chart would be one bar or two and is not drawn. A count each, with no good or bad number.
     AND SINCE 1.13.0 TOO (AGT-C17 job c), THE SKILLS THAT CHANGED: a skill takes a new version by its `rev`, which only
     the owner's press moves (`by: 'decide'`), and every move is a line of the record's log. So these read the log over
     `events.skills`, `{ count: changed, field: rev }`: how many skills took a version in thirty days, for the line, and
     in each week of six months, for the chart's second series. A skill that took two in one week is one that changed. */
  /* AND BY THE LEARNING'S OWN DAY TOO, SINCE 1.21.0: four learnings last confirmed on 28
     and 29 August came in by an import this month, and the line said "4 learnings arrived this month" over their own
     August dates. One the record wrote this month and that says no day of its own still counts. */
  'learnings-arrived': {
    metric: 'learnings-arrived',
    name: 'Learnings that arrived, last 30 days',
    source: 'register.learnings',
    where: { all: [{ field: 'created_at', after: '-30d' }, { any: [{ field: 'confirmed_on', empty: true }, { field: 'confirmed_on', after: '-31d' }] }] },
    ...COUNT,
  },
  'learnings-charted': { metric: 'learnings-charted', name: 'Learnings from two weeks ago or more, last six months', source: 'register.learnings', where: 'created_at after -182d, created_at before -14d', ...COUNT },
  'skills-changed': { metric: 'skills-changed', name: 'Skills that changed, last 30 days', source: 'events.skills', ...CHANGED, window: '30d' },
  'skills-changed-by-week': { metric: 'skills-changed-by-week', name: 'Skills that changed, by week', source: 'events.skills', ...CHANGED, window: '182d', group_by: 'at', bucket: 'week' },
  ...DOOR_METRICS,
};

/**
 * The pack's pages: the agents home at `/p/agents`, How the brain changed at `/p/brain`, a page per skill with its
 * versions, and a page per run.
 *
 * THE HOME IS THE RUNS, SINCE 1.5.0 ("Stop the harm"): who is working now, where the stopped runs left
 * off, and what they added to the brain, in that order. Until 1.3.0 it was a grid of cards per list, each of the same
 * weight; 1.4.0 put a line over it and folded what the brain holds. 1.5.0 takes three things away. The questions
 * waiting on you were Decide's own cards drawn again, and Decide is one press away on the rail with its count. How the
 * brain has grown, its learnings and its skills were an inventory of four lists, each with a page of its own, under a
 * heading that drew a lone "Faded 0" on a quiet record. And no part says it is empty: a block with nothing in it is
 * not drawn, and the line says the quiet half.
 *
 * THE RUNS GROUPED, SINCE 1.6.0 (the agent directions' "runs grouped by state, the run docked beside"):
 * Needs you, Working, Today and Earlier, in that order, each a heading over its own runs and drawn only while it has
 * any. Needs you is back, and it is not the Waiting on you 1.5.0 took away: that was every question Decide holds, and
 * this is only what an agent's run asked (`ASKED_BY_A_RUN`). Where they left off goes into Today and Earlier, whose
 * cards say the next step each run left. Each card opens its run in the panel docked beside the page, which is the
 * host's, so the page declares lists of runs and no panel of its own. The word on screen stays "run".
 *
 * THE DAY DRAWN OVER THEM, SINCE 1.8.0: Today's lanes, the last 24 hours of runs as spans of time, under the line.
 *
 * WHAT WAS LEFT, AND EARLIER FOLDED, SINCE 1.11.0: Left for the next run sits under Working, the steps nobody has taken,
 * and Earlier keeps its place as the last of the groups but under a fold of its own, below Needs a look.
 *
 * WHOSE CARD AND WHAT IT SAID, AND THE FINISHED RUNS LISTED, SINCE 1.12.0: a card is titled by the agent, and Today and
 * Earlier read the list of runs, so a run that ended properly is on the page.
 *
 * A RUNS CONSOLE, SINCE 1.17.0 (the Agents page of 23 October, "the ui of the agents page is shit"): one plain line,
 * the box to tell an agent, then three full rows of rows and no more: At work, Up next and Recent runs, and a foot of
 * doors. Your agents asked went (each question lives in Needs you only), Needs a look went (its lines were the record
 * tidying itself, and the key and tool warnings stay as loose lines at the foot), and Earlier, What the brain learned and
 * Machines and profiles, three folded tiles of the same weight, became Recent runs' door, the foot's doors and a line
 * under At work.
 *
 * NO PEOPLE ON THEM. "People met lately" would make the page require `register.people`, and then a
 * record without People could not take this pack. The people an agent meets are on the People page.
 */
export const AGENTS_PAGES: Record<string, Record<string, unknown> & { page: string }> = {
  agents: {
    page: 'agents',
    title: 'Agents',
    /* ITS PLACE ON THE RAIL, SINCE batch 101 (places-and-computed-101): the lead pages sit Work, Orders, Projects,
       Money, People, Agents, lowest first (`placesOf` in `packages/record/src/places.ts`). */
    nav: { section: 'Agents', order: 10, place: 60 },
    icon: 'session',
    requires: ['register.session', 'register.learnings', 'register.skills', 'register.tools', 'register.credentials'],
    blocks: [
      /* THE PAGE'S ONE LINE, SINCE 1.17.0 (the Agents page of 23 October): how many are at work and how many steps wait
         for the next run, and nothing else. "Claude on BrainDog and Claude are at work. 5 steps left for the next run"
         said Claude twice and named nothing the rows under it did not say better, so the line is two numbers and the
         rows name who and what. A clause whose figure is nought is left out by the writer, so a record where nothing is
         working and nothing was left says "Nobody working right now." and stops.

         "NOBODY WORKING RIGHT NOW", WHERE IT SAID "Nobody at work." (the look on his record of 24 October): At work
         also lists the runs waiting on him that called inside three hours, each saying how long it has been quiet, so
         the page opened on "Nobody at work." over a tile called At work with two runs in it. Nobody is working; those
         runs are open and quiet, and their rows say so.

         EVERY NUMBER IS THE RECORD'S OWN, by the one clock the rail's count is (`runs-working`), and the steps are
         `handoffs-open`, the ones Up next draws, so the line and the rows cannot say two numbers. Exactly one is drawn. */
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'runs-working', gt: 0 },
        body: '{{runs-working}} working, {{runs-waiting}} open and quiet, {{handoffs-open}} step(s) up next',
      },
      /* THE LINE COUNTS WHAT OPEN NOW DRAWS (Q4 of 29 October): "Nobody working right now" stood over two runs heard
         just now, and the laptop said "1 at work" over the same two. The quiet ones are counted as what they are. */
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { all: [{ metric: 'runs-working', is: 0 }, { metric: 'runs-waiting', gt: 0 }] },
        body: 'Nobody working right now, {{runs-waiting}} open and quiet, {{handoffs-open}} step(s) up next',
      },
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { all: [{ metric: 'runs-working', is: 0 }, { metric: 'runs-waiting', is: 0 }] },
        body: 'Nobody working right now. {{handoffs-open}} step(s) up next',
      },
      /* THE CONTROL ROOM'S BOX (agents and MCP plan §2.1, §7.1): one field to tell an agent, to a named run, a kind of
         agent or whoever is next, on a project, now or at its next start, with what happens next said in words; and
         beside it what he told agents, each with its live state, the agent's reply and Undo all on what its run changed.
         The host's own part (`panel: instruct`), drawn for the owner alone, since only a person signed in may tell an
         agent. One row: the field, To and Send, the other choices once he starts, a sheet on a phone.

         NO QUEUE OF WHAT RUNS ASKED OVER IT SINCE 1.17.0: each question lives in Needs you only, which the frame counts
         on every page, and "Your agents asked" drew the same two questions a second time. */
      {
        kind: 'section',
        heading: 'Tell an agent',
        icon: 'edit',
        span: 12,
        panel: 'instruct',
      },
      /* AT WORK, THE PAGE'S MAIN LIST, THE WHOLE ROW SINCE 1.17.0 (`panel: presence`): the host reads the record's
         `presence` (the bridge's pulse and each call) and draws one row a run: the agent's mark, what it is doing in
         plain words and never "Claude run", its project as a chip, how long it has run and how it stands (working now,
         or quiet for 40 min). A run waiting on him that has not called in three hours is not at work and is left to
         Recent runs. Tell, Pause and Stop are behind one More press; the machines are one quiet line at the foot. With
         nobody at work the tile says so in one line.

         NO `when:`, because the panel says the quiet case itself, and the source takes no `where:` and no `order:`, so
         no page can count working its own way again. It was seven twelfths beside Left for the next run, which wrapped
         each step to six lines and left a hole under the runs.

         HEADED OPEN NOW FROM 1.20.0: it holds the runs at work and, under Quiet, the ones
         open and quiet, so "Nobody working right now." sat over a tile called At work with three runs in it. The panel
         draws the two parts apart, each with its count.

         HEADED WORKING NOW SINCE 1.27.0, AS TODAY'S TILE OF THE SAME RUNS IS (the recheck of 30 October, 26): Today said
         Working now and Agents said Open now over the one panel, the working runs first and the quiet ones under Quiet. */
      {
        kind: 'section',
        heading: 'Working now',
        icon: 'session',
        span: 12,
        panel: 'presence',
      },
      /* UP NEXT, THE STEPS RUNS LEFT AND NOBODY HAS TAKEN, THE WHOLE ROW SINCE 1.17.0 (`panel: left-steps`), from the
         record's own `handoffs.open`, the read a new run is handed its step from, so the page never lists a step the
         briefing would not offer. One row a step: the step first, under it the project, who left it and when, Take and
         Drop quiet at its end; a step left three times is one row, three drawn and the rest folded. Headed Left for the
         next run until 1.17.0. The panel leaves the tile out while no step is left. */
      {
        kind: 'section',
        heading: 'Up next',
        icon: 'arrow',
        span: 12,
        panel: 'left-steps',
      },
      /* RECENT RUNS, SINCE 1.17.0 THE HOST'S ROWS AND NOT THE DAY AS LANES (`panel: run-list`): the last eight runs of
         every kind, newest first, each its mark, what it did, its project, how it ended and when, and the door to the
         record's list of runs with how many it holds. A run at work is under At work and not here again. NO `when:`,
         because a rule may have run on a day no agent did; the panel leaves the tile out itself while nothing has run.

         IT IS ALSO WHERE EARLIER WENT: the runs of other days were a fold of six cards under "Earlier 609", the same
         runs this list opens on, so they are the rows here and the door under them. */
      {
        kind: 'section',
        heading: 'Recent runs',
        icon: 'clock',
        span: 12,
        panel: 'run-list',
      },
      /* ACCEPTED UNCHANGED, SINCE 1.24.0 (the agent directions' "one number judges the agent side: the share of
         suggestions accepted unchanged, by kind of change"): one row an agent, its share over 90 days and the counts,
         opening onto the same share by kind of change. The host's (`panel: kept`), the owner's alone as the ladder is,
         read from what each question was stamped with when it was filed; the panel leaves the tile out while nothing
         an agent suggested has been answered. */
      {
        kind: 'section',
        key: 'kept',
        heading: 'Accepted unchanged',
        icon: 'circle-check',
        span: 12,
        panel: 'kept',
      },
      /* THE PAGE'S FOOT, ONE QUIET LINE OF DOORS, SINCE 1.17.0: What the brain learned and Machines and profiles were two
         more tiles of the same weight at the foot, each folded or half empty. How the brain changed has no place of its
         own in the rail, so this line is how a person reaches it (AGT-C17 job b), and the lists the agents keep are beside
         it. The machines are said under At work. No `when:`, so it is there on a quiet record too. */
      {
        kind: 'note',
        key: 'brain-link',
        span: 12,
        body: '[What changed](/p/brain) · [Learnings](/r/learnings) · [Skills](/r/skills) · [Tools](/r/tools) · [Keys](/keychain)',
      },
      /* WHAT TO PUT RIGHT IN THE KEYS AND TOOLS, each line drawn only while its figure is above nought, so
         a record with nothing wrong draws none. Loose at the foot since 1.17.0 and no longer a tile headed Needs a look,
         which on his record held only what the record tidies on its own: things here twice, runs written off and steps
         nobody took. Those are the lists' own (`?twice=1` on each), and the page no longer nags with them. */
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-nowhere', is: 1 }, body: '1 key has no value. [Add it in the Keychain](/keychain)' },
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-nowhere', gt: 1 }, body: '{{keys-nowhere}} keys have no value. [Add them in the Keychain](/keychain)' },
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-expired', is: 1 }, body: '1 key is past its day. Renew or retire it.' },
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-expired', gt: 1 }, body: '{{keys-expired}} keys are past their day. Renew or retire each.' },
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'tools-unseen', gt: 0 }, body: '{{tools-unseen}} tool(s) not used for a month. Retire any you no longer need.' },
      /* KEYS WRITTEN WHERE A KEY SHOULD NOT BE (the kernel's built-in `keys-in-text`, read a slice a night by its key
         scan): a count of places, and the first one's list and number in the reading's why, never the key. */
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-in-text', is: 1 }, body: 'A key is written in plain text in 1 place. Move it to the Keychain.' },
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-in-text', gt: 1 }, body: 'Keys are written in plain text in {{keys-in-text}} places. Move each to the Keychain.' },
    ],
  },
  /* One page per skill in use. The trigger leads, because it is the sentence that makes a session
     reach for the skill, the versions follow, each against the one before it, and last the lessons that bear on it,
     which are what its next version would be made from.

     THE LESSONS ARE THE ONES WHOSE `topic` NAMES THE SKILL, and not a note over `{{because}}`: a page is filled from the
     row's fields as they are held (`fill` in `packages/kernel/src/pages.ts`), and `because` holds row ids, so the note
     would print ids where a person reads. Since 1.3.0 `topic` asks for the skill a lesson bears on, which is also how
     the briefing finds a lesson a skill does not carry yet. */
  skill: {
    page: 'skill',
    title: '{{name}}',
    for: { register: 'skills', where: 'state is active' },
    icon: 'skill',
    requires: ['register.skills', 'register.learnings'],
    blocks: [
      /* THE TRIGGER IS THE PAGE'S LINE, SINCE 1.4.0: the sentence that makes a session reach for the skill. */
      { kind: 'note', lead: true, span: 12, body: '{{trigger}}' },
      {
        kind: 'diff',
        heading: 'Versions',
        icon: 'history',
        span: 12,
        source: 'register.skills',
        row: '{{spoken}}',
        field: 'body',
        versions: 5,
        empty: 'One version so far.',
      },
      /* THE LEARNINGS THIS VERSION TOOK IN, each a card that opens its row. `id is {{because}}` and not a note:
         `because` holds row ids, which `fill` writes into a sentence as `id is A or B`, so the cards are the lessons
         themselves and never the ids. A version drafted by Slash lists them in `because` when it is taken on Decide.
         NO EMPTY LINE SINCE 1.5.0: most skills carry none, and every one of their pages said so under its versions. */
      { kind: 'cards', heading: 'Learnings behind this version', icon: 'learning', span: 12, source: 'register.learnings', where: 'id is {{because}}', columns: [{ field: 'lesson', as: 'title' }, { field: 'confirmed_on', as: 'when' }], limit: 8 },
      {
        kind: 'cards',
        heading: 'Learnings that bear on it',
        icon: 'lightbulb',
        span: 12,
        source: 'register.learnings',
        where: 'topic is {{name}}, state is active',
        columns: [
          { field: 'lesson', as: 'title' },
          { field: 'kind', label: 'Kind', as: 'fact' },
          { field: 'project', label: 'Where it applies', as: 'scope' },
          { field: 'confirmed_on', as: 'when' },
        ],
        order: [{ field: 'seq', dir: 'desc' }],
        limit: 8,
        when: { metric: 'skill-learnings:{{name}}', gt: 0 },
      },
    ],
  },
  /* HOW THE BRAIN CHANGED, SINCE 1.13.0 (AGT-C17 job b; "the brain's growth over time: learnings arriving and skills
     changing, with before and after", "easily visually displayed on the web ui"). Batches 85 to 87 made agents capture
     learnings, confirm them and be told when a skill is behind, and no screen showed any of it moving.

     NO `nav:`, so it takes no place in the rail: the scope put it under Agents there, and the rail is the owner's to
     grow. What the brain learned on the agents home opens it.

     THREE TILES UNDER ONE LINE, each drawn only over something. The line says what arrived in thirty days and what
     has faded, two notes on the one figure so exactly one draws, and each figure alone between commas, so the writer
     leaves out a clause at nought. The chart is the weeks learnings arrived in, six months back, and only once there
     are three weeks to draw (`learnings-charted`). What changed is the learnings themselves, the newest first, each
     with the failure that taught it, and the one it replaced when it replaced one. Faded is the learnings agents are
     no longer told, counted on its heading by the same rule its figure counts by.

     A CARD OPENS ITS LEARNING, where it is confirmed or retired: a block declares no button, so Still true and Retire
     are not on the card.

     EVERY BLOCK HAS A KEY OF ITS OWN, so a person's look that moves or hides one holds when a heading is reworded.

     AND THE SKILLS THAT CHANGED BESIDE THEM (AGT-C17 job c), read off the record's log (`skills-changed`): "2 skill(s)
     changed" is a clause of its own in the line, so it is left out at nought, and the chart draws the weeks skills
     took a version in as its second series, on the learnings' weeks. The chart is still drawn on the learnings' three
     weeks alone, since a `when:` holds every leaf it names and a chart of skills alone would need a figure of its own.

     A SKILL'S TEXT BEFORE AND AFTER, SINCE 1.24.0, is on the timeline (`panel: evolution`), each version against the
     one before; a skill's own page still draws its versions too. */
  /* AND HOW MANY ARE IN USE, SINCE 29 OCTOBER (Q55): "1 learning arrived this month." stood over five, four of them dated
     August, and read as a count of the list. The line says the whole too, so the two never read as one number. */
  brain: {
    page: 'brain',
    /* WHAT CHANGED, SINCE 1.30.0 (audit 1 Nov, AP32): "How the brain changed" was the record's way of speaking. */
    title: 'What changed',
    icon: 'learning',
    requires: ['register.learnings'],
    blocks: [
      {
        kind: 'note',
        key: 'line',
        lead: true,
        span: 12,
        when: { metric: 'learnings-arrived', gt: 0 },
        body: '{{learnings-arrived}} learning(s) arrived this month, {{learnings-active}} in use in all, {{skills-changed}} skill(s) changed, {{learnings-faded}} faded',
      },
      {
        kind: 'note',
        key: 'line-quiet',
        lead: true,
        span: 12,
        when: { metric: 'learnings-arrived', is: 0 },
        body: 'Nothing new this month, {{learnings-active}} learning(s) in use in all, {{skills-changed}} skill(s) changed, {{learnings-faded}} faded',
      },
      {
        kind: 'series',
        key: 'by-week',
        heading: 'Learnings that arrived and skills that changed, by week',
        icon: 'chart-column',
        span: 12,
        series: [
          { metric: 'learnings-by-week', label: 'Learnings' },
          { metric: 'skills-changed-by-week', label: 'Skills changed' },
        ],
        back: 24,
        when: { metric: 'learnings-charted', gt: 0 },
      },
      {
        kind: 'cards',
        key: 'changed',
        heading: 'What changed',
        icon: 'history',
        span: 12,
        source: 'register.learnings',
        /* EACH LEARNING AS ITS ONE LINE, SINCE 1.21.0: the failure that taught it was its
           body, and printed code (`waitForFunction(...)`, `SQLITE_ERROR`) nobody asked to see. It is on the learning's
           own page, which the card opens. */
        columns: [
          { field: 'lesson', as: 'title' },
          { field: 'topic', label: 'Bears on', as: 'fact' },
          { field: 'supersedes', label: 'Replaces', as: 'fact' },
          { field: 'confirmed_on', label: 'Last confirmed', as: 'when' },
        ],
        order: [{ field: 'created_at', dir: 'desc' }],
        limit: 12,
      },
      /* THE TIMELINE, SINCE 1.24.0 (the evolution view): week by week, each learning that arrived with the failure
         that taught it, each version a skill took with its text before and after, and each learning that faded, marked
         where it faded. The host's (`panel: evolution`), for anyone who reads the learnings. */
      { kind: 'section', key: 'timeline', heading: 'Over time', icon: 'history', span: 12, panel: 'evolution' },
      { kind: 'section', key: 'faded', heading: 'Faded', icon: 'clock', span: 12, source: 'register.learnings', where: FADED, limit: 1, when: { metric: 'learnings-faded', gt: 0 } },
      {
        kind: 'cards',
        key: 'faded-learnings',
        span: 12,
        source: 'register.learnings',
        where: FADED,
        columns: [
          { field: 'lesson', as: 'title' },
          { field: 'confirmed_on', label: 'Last confirmed', as: 'when' },
        ],
        order: [{ field: 'created_at', dir: 'asc' }],
        limit: 12,
        when: { metric: 'learnings-faded', gt: 0 },
      },
    ],
  },
  /* A RUN'S OWN PAGE, SINCE 1.7.0 ("the run docked beside"): one per row of the kernel's list of runs,
     named by what it was doing. What it did and Undo this run are the host's (`panel: run`, `RunPanel.svelte`), drawn
     under the one section, by the run's handle and never its id. No `nav:`, so the runs never grow the rail: a run's
     card on the agents home opens it. */
  run: {
    page: 'run',
    title: '{{doing}}',
    for: { register: 'session' },
    icon: 'session',
    requires: ['register.session'],
    blocks: [{ kind: 'section', heading: 'What it did', icon: 'history', span: 12, panel: 'run' }],
  },
};

/*
 * WHAT A PROJECT RUNS ON IS NOT HERE ANY MORE. Until 1.3.0 this file exported three blocks the seed spliced into the
 * project template, which only a record built by the seed's installer ever got. It is now the `runs_on` source the
 * record computes (`packages/kernel/src/pages.ts`), which reads whichever of these lists exist, and one block on the
 * portfolio module's project template draws it on every record.
 */

export const AGENTS_PACK: { manifest: PackManifest; registers: Record<string, SeedRegister>; pages: typeof AGENTS_PAGES; metrics: typeof AGENTS_METRICS } = {
  /* 1.2.0 ADDED ONE OPTIONAL FIELD, `credentials.note`, so a record on 1.1.1 is offered the update and loses no key by
     waiting: the import sends each key without its note to a list that has no such field, and names the update.
     1.3.0 IS A MINOR VERSION BECAUSE IT ONLY ADDS AND RELABELS: the growth and faded figures, the agents home drawn
     anew, a block on the skill page, `topic` relabelled and put on the learnings' short form in `project`'s place, and
     `because` added to the skills'. No list, page or field goes and no field changes type, so every row a record holds
     is kept as it is.
     1.4.0 ONLY ADDS AND MOVES, SO IT IS MINOR TOO: the agents home opens on one line said from the new
     `agents-working`, `questions-open` and `learnings-faded`, every heading wears a glyph, each tile is drawn only while
     its new figure (`runs-left-next`, `learnings-active`, `skills-active`) has any, and Growth, Learnings and Skills are
     folded under What the brain holds; the Faded tile went into the line; the skill page leads with its trigger and
     draws the lessons that bear on it over the new `skill-learnings`.
     1.5.0 TAKES BLOCKS AWAY AND NARROWS A CLAUSE, SO IT IS MINOR TOO: the agents home is the runs.
     Working now and the `agents-working` figure under its line read runs active and heard from today, where every
     active run was counted; Waiting on you goes, since it drew Decide's own cards; What
     the brain holds goes with Growth, Learnings and Skills under it, each a list with its own page; the line says
     the runs alone; and no block on the home or the lessons of a skill's page says it is empty, since a block with
     nothing in it is not drawn. Every figure stays declared, for a page that draws one and for an agent that reads
     one. No list, field or figure goes.
     1.6.0 ADDS AND REGROUPS, SO IT IS MINOR: the agents home groups the runs under Needs you, Working, Today and
     Earlier, over the new `runs-today` and `runs-earlier`; Working now is called Working, and Where
     they left off goes into Today and Earlier, whose cards carry each run's next step. `runs-left-next` stays, read by
     the line. No list, field or figure goes.
     1.7.0 ONLY ADDS, SO IT IS MINOR: `page.run`, a page per run, whose one section draws what the run did and Undo this
     run under `panel: run`.
     1.8.0 ONLY ADDS, SO IT IS MINOR: Today's lanes at the top of the agents home, over the kernel's `started` on a run
     (its migration 26), and the `runs-heard-today` figure they are drawn on. 1.7.0 is live.
     1.9.0 NARROWS WHO IS WORKING TO THE KERNEL'S CLOCK, SO IT IS MINOR: Working draws `sessions.working` and the line
     reads the built-in `runs-working`, an agent heard from in the last fifteen minutes, where both read this pack's own
     clause of active and heard from today. `agents-working` goes, the one figure taken away, because the record answers
     the same question once for every page; no list or field goes. 1.8.0 is live.
     1.10.0 ONLY ADDS, SO IT IS MINOR: the figures `keys-sealed`, `keys-nowhere`, `keys-expired`, `tools-unseen` and
     `runs-unplaced`; Needs a look on the agents home under the runs, one tile of four lines each drawn only
     while a key or tool needs putting right, the fourth over the kernel's `keys-in-text`; What the brain learned
     folded shut under its own section; and five figures over the agent door's own signs (`record.door`). No
     list, field or figure goes. 1.10.0 is live.
     1.11.0 TAKES NOTHING AWAY, SO IT IS MINOR (AGT-C12 job c): Left for the next run on the agents home, cards over the record's
     `handoffs.open` between Working and Today, and the line counts the same steps by the built-in `handoffs-open`
     where it read `runs-left-next`. That figure stays declared, read by no block. Needs a look gains a fifth line, over
     the record's `gone-stale` and `tidied-week`. Earlier goes under a fold of its own below Needs a look,
     with its count on the heading, so the page still shows six tiles before its fold. No list, field or figure goes,
     and every other block 1.10.0 drew is as it was.
     1.12.0 TAKES NOTHING AWAY, SO IT IS MINOR (AGT-C12 job c): a Working card is titled by the agent, with what it said
     it is doing under that or nothing (the record's `doing_said`), and carries no next step. Today and Earlier read
     the list of runs where they read the runs not finished, so a run that ended is listed, and a helper or a run that
     wrote nothing is not; `runs-today` and `runs-earlier` count the same runs by the same clauses. Their cards are
     the agent, what it said, its project and when. No list, field or figure goes, the page has the blocks it had, and every other block is as
     1.11.0 drew it.
     1.13.0 ONLY ADDS, SO IT IS MINOR (AGT-C17 job b): `page.brain`, How the brain changed, with no place in the rail; the
     line under What the brain learned on the agents home that opens it; and the figures `learnings-arrived` and
     `learnings-charted` it is said and drawn on, with `skills-changed` and `skills-changed-by-week` over the record's
     log for the skills that took a version (AGT-C17 job c). `learnings-faded` reads the rule it read, now written once. No list,
     field or figure goes, and every block 1.12.0 drew is as it was. Learnings, skills, keys and tools each say what
     makes two of them one (`same:`), a learning's kind gains `rule`, and the learnings' own words say when to
     record one; no row changes. Needs a look gains a sixth line, over the record's `stale-rows-same`, with the
     way to fold what is here twice on each of those four lists. And with 1.13.0 the skill After an import
     ships its second text (`agents-skills.ts`): a mark that names no glyph is given the nearest one a
     host draws, in the same arrangement, and cleared only where none is near. A skill travels beside this document, not
     in it, and takes its own `rev`, so the document and its fingerprint are as they were.
     1.14.0 TAKES NOTHING AWAY BUT A BLOCK, SO IT IS MINOR (the Agents page made calm): the line says how many are at work,
     on how many machines and how many wait on you, from the record's `machines-working` and `runs-waiting`; Working is
     At work, the host's one line a run by machine with the runs waiting folded at its foot; Tell an agent is one line
     with what he told beside it; Left for the next run is the host's (`panel: left-steps`), one line a step with Take and
     Drop; Today's runs draws the day as lanes a kind of agent and titles each run by what it did, and the declared
     lanes, one a run, went; and Machines and profiles is a quiet tile at the foot (`panel: machines`). No list, field
     or figure goes.
     1.15.0 IS WORDS, SO IT IS MINOR: the queue of what runs asked is headed Your agents
     asked, where it said Needs you over a count of the questions runs opened, which is not what needs you.
     1.16.0 IS WORDS, SO IT IS MINOR: the page's line names who is at work on what, from
     the record's `runs-working`, where it counted the machines they were on.
     1.17.0 TAKES BLOCKS AWAY AND RENAMES, SO IT IS MINOR (the Agents page of 23 October): the line is two numbers, how
     many at work and how many steps up next; At work, Up next (Left for the next run until now) and Recent runs (Today's
     runs) are each the whole row; Your agents asked, Needs a look's heading and its three tidying lines, Earlier and its
     cards, What the brain learned and its log, and Machines and profiles go; a foot line holds the doors. No list, field
     or figure goes.
     1.18.0 IS WORDS, SO IT IS MINOR (the screens scope of 24 October): a key's value is headed Locked value, where
     it said Sealed value. No list, field or figure goes.
     1.19.0 IS WORDS, SO IT IS MINOR (the agents scope of 24 October): with nobody working the line says Nobody
     working right now, where it said Nobody at work over a tile called At work holding quiet runs. No list, field or
     figure goes.
     1.20.0 IS WORDS, SO IT IS MINOR: the runs open now are headed Open now, where they
     were headed At work over runs open and quiet. No list, field or figure goes.
     1.21.0 IS MINOR: How the brain changed counts a learning as arrived this month by its
     own day as well as the day the record wrote it, and its cards say each learning's line without the failure under
     it. No list, field or figure goes.
     1.22.0 IS WORDS, SO IT IS MINOR (Vault is now Keychain): the Keys list, its count and the notes about a key with no
     value or one in plain text say Keychain where they said vault, and the links go to /keychain. No list, field or
     figure goes.
     1.23.0 ADDS A FIELD, SO IT IS MINOR (Keychain works like a keychain): a key says which account it is for, as a
     keychain item does, in a text field that is never secret. No list, field or figure goes.
     1.24.0 ADDS TWO SECTIONS, SO IT IS MINOR: Accepted unchanged on the agents home (`panel: kept`), and Over time on
     How the brain changed (`panel: evolution`), the timeline of learnings and skills. No list, field or figure goes.
     1.25.0 IS WORDS, SO IT IS MINOR (round 1030): the first line counts the runs Open now draws, working and open and
     quiet, where "Nobody working right now" stood over runs heard just now. No list, field or figure goes.
     1.27.0 IS WORDS, SO IT IS MINOR (the recheck of 30 October, 26): the runs open now are headed Working now, as Today
     heads the same runs, where they were headed Open now. No list, field or figure goes.
     1.28.0 IS WORDS, SO IT IS MINOR (words-e, 30 October): a tool says how it runs, "Runs on your machine" or "Reached
     over the web", where it said Transport: Stdio or Http, and its kind as MCP server or Command line; a key says its
     kind as the Keychain does, API token or SSH key. Only labels change: no value, list, field or figure goes.
     1.29.0 IS A DOOR, SO IT IS MINOR (AG16, 1 Nov): the foot's Keys opens the Keychain, the one Keys place, where it
     opened the list of keys, which is the Keychain's List view. No list, field or figure goes.
     1.30.0 IS WORDS, SO IT IS MINOR (AP32, 1 Nov): How the brain changed is called What changed, as a page and as the
     foot's first door. Its address stays /p/brain. No list, field or figure goes. */
  manifest: { id: 'agents', version: '1.30.0', requires: ['register.things'] },
  registers: AGENTS_REGISTERS,
  pages: AGENTS_PAGES,
  metrics: AGENTS_METRICS,
};

/**
 * The pack as a document `@braindog/declare` reads.
 *
 * `requires` IS NOT IN IT, because the document format names packs it depends on and not registers.
 * The seed's installer checks the manifest's registers before the document is read.
 */
export function agentsPackDocument(): Record<string, unknown> {
  return {
    pack: AGENTS_PACK.manifest.id,
    version: AGENTS_PACK.manifest.version,
    summary: 'What your agents learn, the skills they use, the keys they are handed and the tools they run.',
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    /* Every register carries `tags`, as the seed's own do, so a pack seed can be marked `example`. */
    declarations: [
      ...Object.values(AGENTS_REGISTERS).map(({ id, ...rest }) => ({
        register: id,
        ...rest,
        fields: [...rest.fields, { id: 'tags', type: 'list', of: 'text' }],
      })),
      /* The figures before the pages that draw them. */
      ...Object.values(AGENTS_METRICS),
      ...Object.values(AGENTS_PAGES),
    ],
  };
}
