/**
 * The agents pack: what an agent finds out, the skills it uses, the keys it is handed, and the tools
 * it runs, each at a project or everywhere (`loop/research-agent-path.md` §5.2).
 *
 * IT REQUIRES `things` AND NOTHING ELSE. Every module can be switched off, People included
 * (`loop/DIRECTION.md` §9), so no field here points at a person. A row applies to a project or to
 * everywhere, and a record without People loses nothing this pack holds.
 *
 * A KEY'S ROW IS AN INDEX. `value` names the grant the vault sealed a key into, and only the vault
 * door writes it: a create naming it is refused, so no seed row and no pack seed can carry one.
 */

import type { SeedRegister } from '../index.ts';
import type { SeedMetric } from '../modules/base.ts';

export type PackManifest = { id: string; version: string; requires: readonly string[] };

export const AGENTS_REGISTERS: Record<string, SeedRegister> = {
  learnings: {
    id: 'learnings',
    name: 'Learnings',
    one: 'learning',
    icon: 'learning',
    pack: 'agents',
    seq_prefix: 'LN',
    holds: 'what an agent found out the hard way, with the failure that taught it',
    title: 'lesson',
    state: 'state',
    done: ['superseded', 'reverted'],
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
      { id: 'kind', label: 'Kind', type: 'enum', values: ['method', 'fact'], required: true, index: true },
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
    holds: 'what a session can do here, the moment to reach for it, and its text, versioned',
    title: 'name',
    state: 'state',
    done: ['retired'],
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
    holds: 'what each key opens and where it applies; the key itself is sealed in the vault or kept somewhere named',
    title: 'label',
    state: 'state',
    done: ['retired'],
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
      /* WHAT A PERSON WROTE ABOUT THE KEY, AND NEVER THE KEY. Added in 1.2.0 because the old tool's key register carries a
         note on 83 of his 91 rows and Keys had nowhere to put one, so the import left every one of them behind. A text
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
    holds: 'every MCP server, command line and integration an agent uses, how it starts, and the keys it needs by name',
    title: 'name',
    state: 'state',
    done: ['retired'],
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
 * MORE WEEKS ARE READ THAN DRAWN. The page's `back:` is the most a `series` block reaches back (`SERIES_BACK.most` in
 * `packages/kernel/src/series.ts`), and each figure reads a little further, so the oldest week on the chart is whole: a
 * week cut by the figure's own window would be drawn short and read as a quiet week.
 *
 * A COUNT HAS NO GOOD OR BAD NUMBER, so each target is only that it is a count, as Work's weekly figures are.
 */
const WEEKLY = { value: { count: 'id' }, group_by: 'created_at', bucket: 'week', format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as const;

export const AGENTS_METRICS: Record<string, SeedMetric> = {
  'learnings-by-week': { metric: 'learnings-by-week', name: 'Learnings added, by week', source: 'register.learnings', where: 'created_at after -182d', ...WEEKLY },
  'keys-by-week': { metric: 'keys-by-week', name: 'Keys added, by week', source: 'register.credentials', where: 'created_at after -182d', ...WEEKLY },
  'tools-by-week': { metric: 'tools-by-week', name: 'Tools added, by week', source: 'register.tools', where: 'created_at after -182d', ...WEEKLY },
  /**
   * THE LEARNINGS THAT HAVE FADED, BY THE RECORD'S OWN RULE: active, and neither confirmed nor written in the last ninety
   * days (`FADES` and `FADE_MS` in `packages/record/src/index.ts`, which leaves them out of `context`). A row never
   * confirmed is judged by the day it was written.
   *
   * A TREE AND NOT A SENTENCE, because the rule is an `and` around an `or`, and a sentence may join its clauses with
   * commas or with `, or` but not both (`packages/where/src/sentence.ts`).
   */
  'learnings-faded': {
    metric: 'learnings-faded',
    name: 'Faded learnings',
    source: 'register.learnings',
    where: {
      all: [
        { field: 'state', is: 'active' },
        {
          any: [
            { field: 'confirmed_on', before: '-90d' },
            { all: [{ field: 'confirmed_on', empty: true }, { field: 'created_at', before: '-90d' }] },
          ],
        },
      ],
    },
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};

/**
 * The pack's pages (`loop/research-agent-path.md` §7): the agents home at `/p/agents`, and a page per skill with its
 * versions.
 *
 * THE HOME READS TOP DOWN IN THE ORDER A PERSON ACTS ON IT: what is waiting on them, who is working, what the brain
 * learned, how it has grown, and then what it holds. Until 1.3.0 it was a grid of cards per list, each of the same
 * weight, with nothing to say which came first (`loop/finish/agents.md` §3 item 4).
 *
 * NO PEOPLE ON THEM. "People met lately" would make the page require `register.people`, and then a
 * record without People could not take this pack. The people an agent meets are on the People page.
 */
export const AGENTS_PAGES: Record<string, Record<string, unknown> & { page: string }> = {
  agents: {
    page: 'agents',
    title: 'Agents',
    nav: { section: 'Agents', order: 10 },
    icon: 'session',
    requires: ['register.session', 'register.learnings', 'register.skills', 'register.tools', 'register.credentials'],
    blocks: [
      /* WHAT IS WAITING ON YOU, FIRST, because an agent that has asked a question is blocked on the
         answer and every row below it is work that carried on without one. The source is the record's
         own open suggestions, so the page needs no register for it and nothing is written here about
         how to answer: the options a question carries are its proposer's, and every other kind is
         accepted or rejected in the reader's own words. */
      {
        kind: 'queue',
        heading: 'Waiting on you',
        span: 12,
        source: 'governance.open',
        limit: 3,
        empty: 'Nothing is waiting on you.',
      },
      /* ONLY THE RUNS STILL WORKING. The end hook leaves a run idle and a handoff waits for a pickup, and both were
         listed here as working, the run that closed a minute ago beside the one typing now. A run still active and not
         heard from lately stays, and the host draws it dimmed, because it may yet come back. The project is a scope
         chip, read off the run's placed project (`projectsOf` in `packages/kernel/src/pages.ts`). */
      {
        kind: 'cards',
        heading: 'Working now',
        span: 12,
        source: 'sessions.live',
        where: 'state is active',
        columns: [
          { field: 'doing', as: 'title' },
          { field: 'agent', as: 'who' },
          { field: 'project', label: 'Project', as: 'scope' },
          { field: 'next', label: 'Next', as: 'fact' },
          { field: 'last_seen', as: 'when' },
        ],
        limit: 12,
        empty: 'No agent is working right now.',
      },
      /* WHAT THE AGENTS ADDED AND CHANGED IN WHAT THE BRAIN HOLDS, one group per run, from the record's own log. An
         `agents` block and not a `feed`, because a feed groups by the kind of actor and would put every run under one
         head; this groups by who, and `first:` folds each run's rest into one line with its count, so a busy run
         cannot push the others off the page (`agentRows` in `packages/kernel/src/pages.ts`). `list is skills` is the
         word the record gives an event's list over `activity` (`loop/finish/contracts.md` §11 X6).

         IT DOES NOT SAY "SINCE YOU LAST LOOKED", because only a `feed` reads `since:` (`KEY_KINDS` in
         `packages/kernel/src/block-keys.ts`), and a heading promising a mark the block cannot draw would be untrue. */
      {
        kind: 'agents',
        heading: 'What the brain learned',
        span: 12,
        source: 'activity',
        where: 'list is learnings or skills or credentials or tools',
        first: 3,
        empty: 'No agent has added a lesson, a skill, a key or a tool yet.',
      },
      /* HOW THE BRAIN HAS GROWN, a week to a bar, each week's learnings, keys and tools stacked in it. The week the clock
         is in is drawn as not yet finished (`barsOf` in `packages/kernel/src/series.ts` marks it `partial`), so a
         Tuesday is not read as a slow week. */
      {
        kind: 'series',
        heading: 'Growth',
        span: 12,
        series: [
          { metric: 'learnings-by-week', label: 'Learnings' },
          { metric: 'keys-by-week', label: 'Keys' },
          { metric: 'tools-by-week', label: 'Tools' },
        ],
        back: 24,
        empty: 'Nothing was added in these weeks.',
      },
      /* THE NEWEST LESSONS, each with where it applies, and beside them how many have faded: active, and not confirmed
         in ninety days, which `context` stops handing to agents. */
      {
        kind: 'cards',
        heading: 'Learnings',
        span: 8,
        source: 'register.learnings',
        where: 'state is active',
        columns: [
          { field: 'lesson', as: 'title' },
          { field: 'kind', label: 'Kind', as: 'fact' },
          { field: 'project', label: 'Where it applies', as: 'scope' },
          { field: 'confirmed_on', as: 'when' },
        ],
        order: [{ field: 'seq', dir: 'desc' }],
        limit: 8,
        empty: 'Nothing learned yet.',
      },
      {
        kind: 'stat',
        span: 4,
        cells: [{ metric: 'learnings-faded', label: 'Faded', note: 'not confirmed in 90 days' }],
      },
      /* THE SKILLS IN USE, with the sentence that makes a session reach for each, its version and who changed it last. */
      {
        kind: 'table',
        heading: 'Skills',
        span: 12,
        source: 'register.skills',
        where: 'state is active',
        columns: [
          { field: 'name', label: 'Skill' },
          { field: 'trigger', label: 'When to use it' },
          { field: 'rev', label: 'Version' },
          { field: 'changed', label: 'Last change' },
        ],
        order: [{ field: 'seq', dir: 'desc' }],
        limit: 8,
        empty: 'No skills yet.',
      },
      /* WHERE THE STOPPED RUNS LEFT OFF, led by the next step, because that is what the next session starts from. A
         run that stopped without one has nothing to hand on, and is left out. */
      {
        kind: 'cards',
        heading: 'Where they left off',
        span: 12,
        source: 'sessions.live',
        where: 'state is idle or handoff, next is set',
        columns: [
          { field: 'next', as: 'title' },
          { field: 'agent', as: 'who' },
          { field: 'doing', label: 'Was doing', as: 'fact' },
          { field: 'project', label: 'Project', as: 'scope' },
          { field: 'last_seen', as: 'when' },
        ],
        limit: 6,
        empty: 'No run has left a next step.',
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
      { kind: 'note', span: 12, body: '{{trigger}}' },
      {
        kind: 'diff',
        heading: 'Versions',
        span: 12,
        source: 'register.skills',
        row: '{{spoken}}',
        field: 'body',
        versions: 5,
        empty: 'One version so far.',
      },
      /* THE LEARNINGS THIS VERSION TOOK IN, each a card that opens its row (GAP-12). `id is {{because}}` and not a note:
         `because` holds row ids, which `fill` writes into a sentence as `id is A or B`, so the cards are the lessons
         themselves and never the ids. A version drafted by Slash lists them in `because` when it is taken on Decide. */
      { kind: 'cards', heading: 'Learnings behind this version', span: 12, source: 'register.learnings', where: 'id is {{because}}', columns: [{ field: 'lesson', as: 'title' }, { field: 'confirmed_on', as: 'when' }], limit: 8, empty: 'No learning is written into this version yet.' },
      {
        kind: 'cards',
        heading: 'Learnings that bear on it',
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
        empty: 'No lesson names this skill yet.',
      },
    ],
  },
};

/*
 * WHAT A PROJECT RUNS ON IS NOT HERE ANY MORE. Until 1.3.0 this file exported three blocks the seed spliced into the
 * project template, which only a record built by the seed's installer ever got. It is now the `runs_on` source the
 * record computes (`packages/kernel/src/pages.ts`), which reads whichever of these lists exist, and one block on the
 * portfolio module's project template draws it on every record (`loop/finish/agents.md` §3 item 1).
 */

export const AGENTS_PACK: { manifest: PackManifest; registers: Record<string, SeedRegister>; pages: typeof AGENTS_PAGES; metrics: typeof AGENTS_METRICS } = {
  /* 1.2.0 ADDED ONE OPTIONAL FIELD, `credentials.note`, so a record on 1.1.1 is offered the update and loses no key by
     waiting: the import sends each key without its note to a list that has no such field, and names the update.
     1.3.0 IS A MINOR VERSION BECAUSE IT ONLY ADDS AND RELABELS: the growth and faded figures, the agents home drawn
     anew, a block on the skill page, `topic` relabelled and put on the learnings' short form in `project`'s place, and
     `because` added to the skills'. No list, page or field goes and no field changes type, so every row a record holds
     is kept as it is. */
  manifest: { id: 'agents', version: '1.3.0', requires: ['register.things'] },
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
