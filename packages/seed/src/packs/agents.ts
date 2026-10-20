/**
 * The agents pack: what an agent finds out, the skills it uses, the keys it is handed, and the tools
 * it runs, each at a project or everywhere.
 *
 * IT REQUIRES `things` AND NOTHING ELSE. Every module can be switched off, People included,
 * so no field here points at a person. A row applies to a project or to
 * everywhere, and a record without People loses nothing this pack holds.
 *
 * A KEY'S ROW IS AN INDEX. `value` names the grant the vault sealed a key into, and only the vault
 * door writes it: a create naming it is refused, so no seed row and no pack seed can carry one.
 */

import type { SeedRegister } from '../index.ts';
import type { SeedMetric } from '../modules/base.ts';

export type PackManifest = { id: string; version: string; requires: readonly string[] };

/**
 * WHAT MAKES TWO ROWS OF A LIST ONE THING, SINCE 1.13.0 (AGT-C13, with the half of AGT-D03 that declares it on tools
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
    /* THE FOUR-PART TEST IN ONE LINE, SINCE 1.13.0 (AGT-D15 job 1): an agent reads a list's own words with its shape, and
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
      /* `rule` SINCE 1.13.0 (AGT-B09 job 4): what a person writes for every session to be handed first, such as "divide
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
    holds: 'what each key opens and where it applies; the key itself is sealed in the vault or kept somewhere named',
    title: 'label',
    state: 'state',
    done: ['retired'],
    /* ONE NAME IS ONE KEY WITHIN A PROJECT, and of two alike the one holding the sealed value stays: an import's index
       row is often the older and the vault's the newer, so keeping the oldest would lose the key. */
    same: { fields: ['label'], within: 'project', fold: 'text', keep: 'sealed' },
    mobile: ['label', 'opens', 'project'],
    fields: [
      { id: 'label', label: 'Name', type: 'text', required: true, max: 120, search: true },
      { id: 'opens', label: 'What it opens', type: 'text', required: true, max: 280, search: true },
      { id: 'provider', label: 'Provider', type: 'text', index: true, search: true },
      /* The kinds the vault seals (`packages/kernel/src/vault.ts`). */
      { id: 'kind', label: 'Kind', type: 'enum', values: ['api_token', 'password', 'ssh_key', 'recovery_codes', 'note'], required: true, index: true },
      { id: 'project', label: 'Where it applies', type: 'ref', to: 'things', index: true, scope: { widen: 'person' } },
      { id: 'value', label: 'Sealed value', type: 'secret' },
      /* For a key that is not in the vault: where a person finds it. */
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
      { id: 'kind', label: 'Kind', type: 'enum', values: ['mcp', 'cli', 'integration'], required: true, index: true },
      { id: 'transport', label: 'Transport', type: 'enum', values: ['stdio', 'http'], required_when: { field: 'kind', is: 'mcp' } },
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
 * THE AGENT DOOR'S OWN SIGNS, SINCE 1.10.0 (AGT-B01): what the door's marks add up to over the last week, read by the
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
 * WHAT AN AGENT'S RUN ASKED, SINCE 1.6.0: an open question opened by a run (its spoken id, `S12`) or by an agent's key
 * with no run to sign it (`agent:claude`), as `byOf` in `packages/kernel/src/pages.ts` reads an actor. A question a
 * rule, a door, Slash or the record itself put is Decide's and not a run's, so the Agents page leaves it there.
 *
 * A TREE AND NOT A SENTENCE, because a spoken id is an `S` and a number and the grammar has no pattern: it is an s and
 * a first digit, one to nine since a run's number starts at one, so `slash`, `system`, `script:` and any actor named
 * later that starts with an s stay out without each being named.
 */
const ASKED_BY_A_RUN = {
  any: [{ field: 'who', starts: 'agent:' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ field: 'who', starts: `s${n}` }))],
};

/**
 * WHAT AN ENDED RUN'S CARD SAYS, Today's and Earlier's, SINCE 1.12.0: which agent, what it said it was doing, the
 * project it was placed in, and when it was last heard from.
 * Until then it was titled by `doing`, which on a run nobody named is the record's own "Claude Code in BrainDog", the
 * same on every card, and which an agent may fill with file paths; and it carried the run's next step, which Left for
 * the next run says since 1.11.0, once, and only while nobody has taken it.
 *
 * THE SENTENCE AND THE PROJECT, AS ON A WORKING CARD. What a run said it is doing is `doing_said`, a column the record
 * works out and no field of the list; it answers it over the list of runs as it does over the runs working and the
 * runs not finished, and a run's project by its name (`as: scope`), never its id. So a card reads the same under
 * Working, Today and Earlier, and a run that said nothing, or whose name is the record's own, has no sentence.
 */
const ENDED_COLUMNS = [
  { field: 'agent', as: 'who' },
  { field: 'doing_said', as: 'reply' },
  { field: 'project', label: 'on', as: 'scope' },
  { field: 'last_seen', as: 'when' },
];

/** The latest first: the list of runs comes in no order of its own, as the run sources do. */
const LATEST_FIRST = [{ field: 'last_seen', dir: 'desc' }];

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
  /* THE KEYS, SINCE 1.10.0 (AGT-D01): how many keys not retired the vault holds a value for, a number with no verdict
     to read beside the Vault's own "sealed here", which counts every key but the retired ones (`keysOf` in
     `apps/web/src/lib/record/vault.ts`), so a key gone stale still counts as sealed; how many live keys hold no value
     and do not say where they are kept, so nobody could find them again; and how many are past their day. A sealed
     field answers only `is set` and `is empty` (`packages/where/src/sentence.ts`), never what it holds. */
  'keys-sealed': { metric: 'keys-sealed', name: 'Keys sealed in the vault', source: 'register.credentials', where: 'state is not retired, value is set', ...COUNT },
  'keys-nowhere': { metric: 'keys-nowhere', name: 'Keys with no value and nowhere they are kept', source: 'register.credentials', where: 'state is live, value is empty, where is empty', ...FIX },
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
  'learnings-arrived': { metric: 'learnings-arrived', name: 'Learnings that arrived, last 30 days', source: 'register.learnings', where: 'created_at after -30d', ...COUNT },
  'learnings-charted': { metric: 'learnings-charted', name: 'Learnings from two weeks ago or more, last six months', source: 'register.learnings', where: 'created_at after -182d, created_at before -14d', ...COUNT },
  'skills-changed': { metric: 'skills-changed', name: 'Skills that changed, last 30 days', source: 'events.skills', ...CHANGED, window: '30d' },
  'skills-changed-by-week': { metric: 'skills-changed-by-week', name: 'Skills that changed, by week', source: 'events.skills', ...CHANGED, window: '182d', group_by: 'at', bucket: 'week' },
  ...DOOR_METRICS,
};

/**
 * The pack's pages: the agents home at `/p/agents`, How the brain changed at `/p/brain`, a page per skill with its
 * versions, and a page per run.
 *
 * THE HOME IS THE RUNS, SINCE 1.5.0 (DIRECTION §37, "Stop the harm"): who is working now, where the stopped runs left
 * off, and what they added to the brain, in that order. Until 1.3.0 it was a grid of cards per list, each of the same
 * weight; 1.4.0 put a line over it and folded what the brain holds. 1.5.0 takes three things away. The questions
 * waiting on you were Decide's own cards drawn again, and Decide is one press away on the rail with its count. How the
 * brain has grown, its learnings and its skills were an inventory of four lists, each with a page of its own, under a
 * heading that drew a lone "Faded 0" on a quiet record. And no part says it is empty: a block with nothing in it is
 * not drawn, and the line says the quiet half.
 *
 * THE RUNS GROUPED, SINCE 1.6.0 (DIRECTION §37, the agent directions' "runs grouped by state, the run docked beside"):
 * Needs you, Working, Today and Earlier, in that order, each a heading over its own runs and drawn only while it has
 * any. Needs you is back, and it is not the Waiting on you 1.5.0 took away: that was every question Decide holds, and
 * this is only what an agent's run asked (`ASKED_BY_A_RUN`). Where they left off goes into Today and Earlier, whose
 * cards say the next step each run left. Each card opens its run in the panel docked beside the page, which is the
 * host's (DIRECTION §34), so the page declares lists of runs and no panel of its own. The word on screen stays "run".
 *
 * THE DAY DRAWN OVER THEM, SINCE 1.8.0: Today's lanes, the last 24 hours of runs as spans of time, under the line.
 *
 * WHAT WAS LEFT, AND EARLIER FOLDED, SINCE 1.11.0: Left for the next run sits under Working, the steps nobody has taken,
 * and Earlier keeps its place as the last of the groups but under a fold of its own, below Needs a look.
 *
 * WHOSE CARD AND WHAT IT SAID, AND THE FINISHED RUNS LISTED, SINCE 1.12.0: a card is titled by the agent, and Today and
 * Earlier read the list of runs, so a run that ended properly is on the page.
 *
 * NO PEOPLE ON THEM. "People met lately" would make the page require `register.people`, and then a
 * record without People could not take this pack. The people an agent meets are on the People page.
 */
export const AGENTS_PAGES: Record<string, Record<string, unknown> & { page: string }> = {
  agents: {
    page: 'agents',
    title: 'Agents',
    /* ITS PLACE ON THE RAIL, SINCE batch 101 (places-and-computed-101, SHL-A18): the lead pages sit Work, Orders, Projects,
       Money, People, Agents, lowest first (`placesOf` in `packages/record/src/places.ts`). */
    nav: { section: 'Agents', order: 10, place: 60 },
    icon: 'session',
    requires: ['register.session', 'register.learnings', 'register.skills', 'register.tools', 'register.credentials'],
    blocks: [
      /* THE PAGE'S ONE LINE, said of the runs alone since 1.5.0: who is working and what was left for the next one. Two
         notes on the one figure, so exactly one of them draws, and a clause whose figure is nought is left out by the
         writer, so a record where nothing is working and nothing was left says that and stops. What waits on you is
         Decide's, and how many lessons have faded is the Learnings list's.

         WHAT WAS LEFT IS THE RECORD'S COUNT SINCE 1.11.0 (AGT-C12): `handoffs-open`, the steps nobody has taken, the
         ones Left for the next run draws. Until then it read this pack's `runs-left-next`, every stopped run with a
         step written, so a step a later run had taken was still counted and the line disagreed with the briefing. */
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'runs-working', gt: 0 },
        body: '{{runs-working}} agent(s) working now, {{handoffs-open}} step(s) left for the next run',
      },
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'runs-working', is: 0 },
        body: 'No agent is working right now, and {{handoffs-open}} step(s) left for the next run',
      },
      /* WHAT A RUN ASKED YOU, FIRST OF THE GROUPS, SINCE 1.6.0: the questions agents' runs opened, ranked as Decide ranks them, three
         drawn and the rest counted. Only while anything is open at all (`questions-open`, the record's own count); with
         none of them a run's, the queue has nothing in it and is not drawn. */
      {
        kind: 'queue',
        heading: 'Needs you',
        icon: 'ask',
        span: 12,
        source: 'governance.open',
        where: ASKED_BY_A_RUN,
        limit: 3,
        when: { metric: 'questions-open', gt: 0 },
      },
      /* ONLY THE RUNS WORKING NOW, THE KERNEL'S SINCE 1.9.0 (`sessions.working`): active and heard from inside fifteen
         minutes, a helper folded under the run that started it. The end hook leaves a run idle and a handoff waits for
         a pickup, and neither is working. The source takes no `where:` and no `order:`, so no page can count working its
         own way again. The project is a scope chip, read off the run's placed project. WORKING AND NOT "Working now"
         SINCE 1.6.0, one word among the group headings.

         THE AGENT IS THE TITLE AND WHAT IT SAID IS UNDER IT, SINCE 1.12.0 (AGT-C12). The title was `doing`, and on the
         owner's record four cards read "Claude Code in BrainDog", the name the record gives a run nobody named, and a
         fifth printed file paths. `doing_said` is the record's own column on a run: what the agent said it is doing,
         and nothing when the name is the record's or reads as a path, a host or a handle. NO NEXT STEP: a working
         run's step is its own note, and a step left is said under Left for the next run. How many helpers a run has
         comes with the answer, for the host to say. */
      {
        kind: 'cards',
        heading: 'Working',
        icon: 'session',
        span: 12,
        source: 'sessions.working',
        columns: [
          { field: 'agent', as: 'who' },
          { field: 'doing_said', as: 'reply' },
          { field: 'project', label: 'on', as: 'scope' },
          { field: 'last_seen', as: 'when' },
        ],
        limit: 12,
        when: { metric: 'runs-working', gt: 0 },
      },
      /* WHAT WAS LEFT FOR THE NEXT RUN, SINCE 1.11.0 (AGT-C12, "Agents page with no dead runs"): the steps runs left and
         nobody has taken, from the record's own `handoffs.open`, the read a new run is handed its step from, so the
         page never lists a step the briefing would not offer. A card leads with the step, then who left it and when,
         and its mark, which a host says in words: Next for the one a new run is handed, Left earlier for one past a
         week or passed over. Every step and not only the next ones, because a step passed over is the one somebody
         has to rule on. The source comes the newest first and takes no `order:`; six are drawn and the rest counted.
         WHO IS THE AGENT'S NAME (`agent`) and not `run`, which is a handle only a host that knows runs can say. */
      {
        kind: 'cards',
        heading: 'Left for the next run',
        icon: 'arrow',
        span: 12,
        source: 'handoffs.open',
        columns: [
          { field: 'next', as: 'title' },
          { field: 'agent', label: 'Left by', as: 'who' },
          { field: 'left_at', label: 'Left', as: 'when' },
          { field: 'mark', label: 'Status', as: 'fact' },
        ],
        limit: 6,
        when: { metric: 'handoffs-open', gt: 0 },
      },
      /* ONE TILE, TODAY'S RUNS, SINCE 1.14.0: the day's picture on top and the runs that ended or stopped today under it, where
         two tiles both headed Today said the one word twice. A boxed section draws the blocks after it on one surface, up
         to the next section, so the two sit under the heading with none of their own; each is still drawn only while it
         has anything, and the tile goes when neither has (`emptyBoxesShut`). It stands under Working and Left for the
         next run, because the box takes the blocks after it and Needs a look closes it. */
      {
        kind: 'section',
        heading: 'Today’s runs',
        icon: 'clock',
        span: 12,
        box: true,
        when: { metric: 'runs-heard-today', gt: 0 },
      },
      /* THE DAY AS A PICTURE, SINCE 1.8.0 (DIRECTION §39, the picture first): the last 24 hours, one lane a run, from when
         it started (`started`, which the record stamps as a run opens) to when it was last heard from, the runs still
         working in the accent and every other left neutral. Over the list of runs itself and not `sessions.live`, so a
         run that finished this morning keeps its lane. No `limit:`, which lanes refuse: they draw every run in their
         hours, and on a busy day the newest of them and how many more. Only while a run was heard from today (`runs-heard-today`), so a quiet day draws no empty track.
         It shares its heading with the group of runs that stopped today further down: both are today. */
      {
        kind: 'lanes',
        span: 12,
        source: 'register.session',
        columns: [{ field: 'doing' }, { field: 'started' }, { field: 'last_seen' }, { field: 'state' }],
        tones: { active: 'info' },
        hours: 24,
        when: { metric: 'runs-heard-today', gt: 0 },
      },
      /* THE RUNS THAT ENDED OR STOPPED TODAY, SINCE 1.6.0. OVER THE LIST OF RUNS SINCE 1.12.0 (`RUNS_TODAY`), so a run
         that finished today is here, and a helper or a run that wrote nothing is not; the latest first. Where each
         left off is Left for the next run's to say, above. UNDER THE DAY'S PICTURE IN ONE TILE SINCE 1.14.0. */
      {
        kind: 'cards',
        span: 12,
        source: 'register.session',
        where: RUNS_TODAY,
        columns: ENDED_COLUMNS,
        order: LATEST_FIRST,
        limit: 8,
        when: { metric: 'runs-today', gt: 0 },
      },
      /* WHAT TO PUT RIGHT IN THE KEYS AND TOOLS, SINCE 1.10.0 (AGT-D01), as one tile of up to four lines, as Money's Heads
         up is: a boxed section draws the blocks after it, up to the next section, on one surface, and each line is drawn
         only while its figure is above nought, so a record with nothing wrong draws no tile at all (a section over
         nothing goes with its blocks). The heading is the word and the tone the mark, never the colour alone.

         UNDER THE RUNS AND NOT UNDER THE LINE, where the scope first put it: the page is the runs (DIRECTION §37), and
         a page shows at most six tiles before the rest is folded (`test/calm-pages.test.ts`), so the lanes and the four
         groups keep the top and this is the sixth. STILL THE SIXTH SINCE 1.11.0: Left for the next run is over it, and
         Earlier went under a fold of its own below it. */
      {
        kind: 'section',
        heading: 'Needs a look',
        icon: 'circle-alert',
        span: 12,
        box: true,
      },
      /* EACH LINE IS ITS FIGURE'S NAME, THEN THE NUMBER, THEN WHAT TO DO (agents-pack-49): "1 key(s) are past their day"
         read wrong for one, so no verb follows a number and each line reads right for one and for many. */
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-nowhere', gt: 0 }, body: '{{keys-nowhere}} key(s) with no value. Add the value in the vault.' },
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-expired', gt: 0 }, body: 'Keys past their day: {{keys-expired}}. Renew or retire each.' },
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'tools-unseen', gt: 0 }, body: 'Tools not seen in a month: {{tools-unseen}}. Retire any you no longer use.' },
      /* KEYS WRITTEN WHERE A KEY SHOULD NOT BE (the kernel's built-in `keys-in-text`, read a slice a night by its key
         scan): a count of places, and the first one's list and number in the reading's why, never the key. */
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-in-text', gt: 0 }, body: 'Keys written in plain text: {{keys-in-text}} place(s). Move each to the vault.' },
      /* WHAT HAS GONE STALE, SINCE 1.11.0 (AGT-C18): the record's own `gone-stale`, every finder's count added up (steps
         nobody took in a month, questions left open, runs that did nothing), and beside it what the record cleared in
         seven days (`tidied-week`), so the line says both what waits and that something is clearing it. Drawn only
         while anything is stale; a record that cannot read the figure yet draws nothing, as for any `when:`.

         TWO LINES IN WORDS SINCE 1.13.0 (AGT-C18 item 5): the one line said two bare counts and nothing of what, so each
         figure now has its own, said finder by finder (`.names`, "41 empty runs hidden and 3 steps nobody took closed"),
         and each is drawn only while its own figure is above nought: a week the record cleared something says so even
         with nothing stale, and nothing stale and nothing cleared draws neither. */
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'tidied-week', gt: 0 }, body: 'Tidied this week: {{tidied-week.names}}.' },
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'gone-stale', gt: 0 }, body: 'Still stale: {{gone-stale.names}}.' },
      /* WHAT IS HERE TWICE, SINCE 1.13.0 (AGT-C18, the kernel's `rows-same`): every row past the one kept in each group
         a list's `same:` folds, with the way to each of this pack's lists that says what makes two of its rows one. A
         line inside Needs a look, so it adds no tile. */
      { kind: 'note', tone: 'warn', span: 12, when: { metric: 'stale-rows-same', gt: 0 }, body: 'Things here twice: {{stale-rows-same}}. Fold them on [Skills](/r/skills?twice=1), [Tools](/r/tools?twice=1), [Keys](/r/credentials?twice=1) or [Learnings](/r/learnings?twice=1).' },
      /* EVERY RUN LAST HEARD FROM BEFORE TODAY, FOLDED SHUT SINCE 1.11.0. Left for the next run made seven tiles before
         the fold and a page shows six (`test/calm-pages.test.ts`), so one gave way, and it is this one: what a stopped
         run left is said above now, by the steps themselves, so the runs of other days are looked up and not read each
         time the page opens, as Work folds what was finished. The heading counts them, which the record answers with
         the whole match off one run read (`matched`), and the cards under it wear no heading of their own, since the
         fold's says what they are. The latest first, six drawn and the rest counted under them, as before. A section
         whose `when:` says no hides what it holds, so a record with no such run draws neither.

         OVER THE LIST OF RUNS SINCE 1.12.0, as Today is: the heading counts the finished runs too, and neither counts a
         helper or a run that wrote nothing.

         IT IS ALSO WHAT CLOSES Needs a look above it: a boxed section holds the blocks after it up to the next one.

         THE TWO TILES HEADED Today WERE NOT MADE ONE. Only a boxed section draws two blocks on one surface, and it
         takes every block up to the next section, so the day's lanes and the runs that stopped today could share a
         tile only by moving the picture down from under the line or by a heading put in to stop the box. */
      {
        kind: 'section',
        heading: 'Earlier',
        icon: 'history',
        span: 12,
        fold: true,
        source: 'register.session',
        where: RUNS_EARLIER,
        limit: 1,
        when: { metric: 'runs-earlier', gt: 0 },
      },
      {
        kind: 'cards',
        span: 12,
        source: 'register.session',
        where: RUNS_EARLIER,
        columns: ENDED_COLUMNS,
        order: LATEST_FIRST,
        limit: 6,
        when: { metric: 'runs-earlier', gt: 0 },
      },
      /* WHAT THE BRAIN LEARNED, FOLDED SHUT SINCE 1.10.0: a log looked up, not read each time the page opens. Its section
         closed Needs a look until 1.11.0, when Earlier's came between them. */
      {
        kind: 'section',
        heading: 'What the brain learned',
        icon: 'learning',
        span: 12,
        fold: true,
      },
      /* THE WAY TO How the brain changed, SINCE 1.13.0 (AGT-C17 job b): the page has no place of its own in the rail, so
         this line is how a person reaches it, first under the heading and over what the runs added. No `when:`, so it
         is there on a quiet record too, which also keeps the heading drawn while the log under it is empty. */
      { kind: 'note', key: 'brain-link', span: 12, body: '[How the brain changed](/p/brain)' },
      /* WHAT THE AGENTS ADDED AND CHANGED IN WHAT THE BRAIN HOLDS, one group per run, from the record's own log. An
         `agents` block and not a `feed`, because a feed groups by the kind of actor and would put every run under one
         head; this groups by who, and `first:` folds each run's rest into one line with its count, so a busy run
         cannot push the others off the page (`agentRows` in `packages/kernel/src/pages.ts`). `list is skills` is the
         word the record gives an event's list over `activity`.

         IT DOES NOT SAY "SINCE YOU LAST LOOKED", because only a `feed` reads `since:` (`KEY_KINDS` in
         `packages/kernel/src/block-keys.ts`), and a heading promising a mark the block cannot draw would be untrue. No
         `when:`, since no figure counts the record's log, AND NO EMPTY LINE SINCE 1.5.0: with nothing in it the block is
         not drawn. */
      {
        kind: 'agents',
        span: 12,
        source: 'activity',
        where: 'list is learnings or skills or credentials or tools',
        first: 3,
      },
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

     WHAT IT DOES NOT DRAW YET, and says nowhere that it does: a skill's text before and after. A skill's own page draws
     its versions, each against the one before. */
  brain: {
    page: 'brain',
    title: 'How the brain changed',
    icon: 'learning',
    requires: ['register.learnings'],
    blocks: [
      {
        kind: 'note',
        key: 'line',
        lead: true,
        span: 12,
        when: { metric: 'learnings-arrived', gt: 0 },
        body: '{{learnings-arrived}} learning(s) arrived this month, {{skills-changed}} skill(s) changed, {{learnings-faded}} faded',
      },
      {
        kind: 'note',
        key: 'line-quiet',
        lead: true,
        span: 12,
        when: { metric: 'learnings-arrived', is: 0 },
        body: 'No learning arrived this month, {{skills-changed}} skill(s) changed, {{learnings-faded}} faded',
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
        columns: [
          { field: 'lesson', as: 'title' },
          { field: 'because', as: 'reply' },
          { field: 'topic', label: 'Bears on', as: 'fact' },
          { field: 'supersedes', label: 'Replaces', as: 'fact' },
          { field: 'confirmed_on', label: 'Last confirmed', as: 'when' },
        ],
        order: [{ field: 'created_at', dir: 'desc' }],
        limit: 12,
      },
      { kind: 'section', key: 'faded', heading: 'Faded', icon: 'clock', span: 12, source: 'register.learnings', where: FADED, limit: 1, when: { metric: 'learnings-faded', gt: 0 } },
      {
        kind: 'cards',
        key: 'faded-learnings',
        span: 12,
        source: 'register.learnings',
        where: FADED,
        columns: [
          { field: 'lesson', as: 'title' },
          { field: 'because', as: 'reply' },
          { field: 'confirmed_on', label: 'Last confirmed', as: 'when' },
        ],
        order: [{ field: 'created_at', dir: 'asc' }],
        limit: 12,
        when: { metric: 'learnings-faded', gt: 0 },
      },
    ],
  },
  /* A RUN'S OWN PAGE, SINCE 1.7.0 (DIRECTION §37, "the run docked beside"): one per row of the kernel's list of runs,
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
     1.5.0 TAKES BLOCKS AWAY AND NARROWS A CLAUSE, SO IT IS MINOR TOO: the agents home is the runs (DIRECTION §37).
     Working now and the `agents-working` figure under its line read runs active and heard from today, where every
     active run was counted; Waiting on you goes, since it drew Decide's own cards; What
     the brain holds goes with Growth, Learnings and Skills under it, each a list with its own page; the line says
     the runs alone; and no block on the home or the lessons of a skill's page says it is empty, since a block with
     nothing in it is not drawn. Every figure stays declared, for a page that draws one and for an agent that reads
     one. No list, field or figure goes.
     1.6.0 ADDS AND REGROUPS, SO IT IS MINOR: the agents home groups the runs under Needs you, Working, Today and
     Earlier (DIRECTION §37), over the new `runs-today` and `runs-earlier`; Working now is called Working, and Where
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
     `runs-unplaced` (AGT-D01); Needs a look on the agents home under the runs, one tile of four lines each drawn only
     while a key or tool needs putting right, the fourth over the kernel's `keys-in-text`; What the brain learned
     folded shut under its own section; and five figures over the agent door's own signs (`record.door`, AGT-B01). No
     list, field or figure goes. 1.10.0 is live.
     1.11.0 TAKES NOTHING AWAY, SO IT IS MINOR (AGT-C12 job c): Left for the next run on the agents home, cards over the record's
     `handoffs.open` between Working and Today, and the line counts the same steps by the built-in `handoffs-open`
     where it read `runs-left-next`. That figure stays declared, read by no block. Needs a look gains a fifth line, over
     the record's `gone-stale` and `tidied-week` (AGT-C18). Earlier goes under a fold of its own below Needs a look,
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
     makes two of them one (`same:`, AGT-C13), a learning's kind gains `rule`, and the learnings' own words say when to
     record one (AGT-D15); no row changes. Needs a look gains a sixth line, over the record's `stale-rows-same`, with the
     way to fold what is here twice on each of those four lists (AGT-C18). And with 1.13.0 the skill After an import
     ships its second text (REC-C17 step 3, `agents-skills.ts`): a mark that names no glyph is given the nearest one a
     host draws, in the same arrangement, and cleared only where none is near. A skill travels beside this document, not
     in it, and takes its own `rev`, so the document and its fingerprint are as they were. */
  manifest: { id: 'agents', version: '1.13.0', requires: ['register.things'] },
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
