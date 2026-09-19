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
    mobile: ['lesson', 'kind', 'project'],
    fields: [
      { id: 'lesson', label: 'Lesson', type: 'text', required: true, min: 12, max: 400, search: true },
      /* The failure that taught it. Required, because a lesson with no failure behind it cannot be
         checked when it stops being true. */
      { id: 'because', label: 'Because', type: 'text', required: true, min: 24, max: 600, search: true },
      { id: 'kind', label: 'Kind', type: 'enum', values: ['method', 'fact'], required: true, index: true },
      { id: 'project', label: 'Where it applies', type: 'ref', to: 'things', index: true, scope: { widen: 'person' } },
      { id: 'topic', label: 'Topic', type: 'text', index: true },
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
    mobile: ['name', 'trigger', 'rev'],
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
 * The pack's pages (`loop/research-agent-path.md` §7): what the agents are doing and what they found
 * out, at `/p/agents`, and a page per skill with its versions.
 *
 * NO PEOPLE ON THEM. "People met lately" would make the page require `register.people`, and then a
 * record without People could not take this pack. The people an agent meets are on the People page.
 *
 * "WORKING NOW" READS `register.session` UNTIL THE INSTALL CHECK ADMITS `sessions.live`. The page
 * layer computes that source, and `declare.ts` admits only `forecast.runway` among the computed
 * ones, so a block naming it would stop the pack installing. The rows are the same: the runs not
 * done or abandoned, the most recently seen first.
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
         listed here as working, the run that closed a minute ago beside the one typing now. */
      {
        kind: 'cards',
        heading: 'Working now',
        span: 12,
        source: 'sessions.live',
        where: 'state is active',
        columns: [
          { field: 'doing', as: 'title' },
          { field: 'agent', as: 'who' },
          { field: 'project', label: 'Project', as: 'fact' },
          { field: 'next', label: 'Next', as: 'fact' },
          { field: 'last_seen', as: 'when' },
        ],
        limit: 12,
        empty: 'No agent is working right now.',
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
          { field: 'project', label: 'Project', as: 'fact' },
          { field: 'last_seen', as: 'when' },
        ],
        limit: 6,
        empty: 'No run has left a next step.',
      },
      {
        kind: 'cards',
        heading: 'Learnings',
        span: 6,
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
        kind: 'cards',
        heading: 'Skills',
        span: 6,
        source: 'register.skills',
        where: 'state is active',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'trigger', label: 'When to use it', as: 'fact' },
          { field: 'rev', label: 'Version', as: 'fact' },
          { field: 'project', label: 'Where it applies', as: 'scope' },
        ],
        order: [{ field: 'seq', dir: 'desc' }],
        limit: 8,
        empty: 'No skills yet.',
      },
      /* WHAT THE AGENTS RUN ON: the servers and tools they recorded, and the keys by name. A key is its label and what
         it opens, never its value, which no page can read. */
      {
        kind: 'cards',
        heading: 'Tools and servers',
        span: 6,
        source: 'register.tools',
        where: 'state is active',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'trigger', label: 'When to use it', as: 'fact' },
          { field: 'transport', label: 'Transport', as: 'fact' },
          { field: 'project', label: 'Where it applies', as: 'scope' },
          { field: 'seen', as: 'when' },
        ],
        order: [{ field: 'seq', dir: 'desc' }],
        limit: 8,
        empty: 'No tools recorded yet.',
      },
      {
        kind: 'cards',
        heading: 'Keys',
        span: 6,
        source: 'register.credentials',
        where: 'state is not retired',
        columns: [
          { field: 'label', as: 'title' },
          { field: 'opens', label: 'What it opens', as: 'fact' },
          { field: 'project', label: 'Where it applies', as: 'scope' },
          { field: 'verified', as: 'when' },
        ],
        order: [{ field: 'seq', dir: 'desc' }],
        limit: 8,
        empty: 'No keys kept yet.',
      },
    ],
  },
  /* One page per skill in use. The trigger leads, because it is the sentence that makes a session
     reach for the skill, and the versions follow, each against the one before it. */
  skill: {
    page: 'skill',
    title: '{{name}}',
    for: { register: 'skills', where: 'state is active' },
    icon: 'skill',
    requires: ['register.skills'],
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
    ],
  },
};

/**
 * What a project page gains where this pack is installed: the keys, tools and skills it runs on, its
 * own first and then the ones that apply everywhere.
 *
 * BLOCKS FOR THE SEED'S `project` TEMPLATE, AND NOT A PAGE OF THEIR OWN, because a second template
 * over projects would put a second page at every project's address. They are not written into the
 * template itself either: the template ships in the starter pack, which a record without this pack
 * installs, and a page requiring a register the record lacks is refused.
 *
 * `project is {{name}}` AND NOT `{{spoken}}`, because a ref is matched by its title. A retired row is
 * left out by state, so a skill nobody uses is not listed as one the project runs on. Each list is in name order, the project's own rows first.
 */
export const RUNS_ON: { requires: readonly string[]; blocks: readonly Record<string, unknown>[] } = {
  requires: ['register.credentials', 'register.tools', 'register.skills'],
  blocks: [
    { kind: 'section', heading: 'Runs on', icon: 'plug', span: 12 },
    {
      kind: 'spec',
      heading: 'Keys',
      span: 4,
      source: 'register.credentials',
      where: 'project is {{name}}, state is not retired',
      inherit: true,
      columns: [{ field: 'label' }, { field: 'project', as: 'scope' }],
      order: [{ field: 'label', dir: 'asc' }],
      limit: 8,
      empty: 'No keys apply to {{name}}.',
    },
    {
      kind: 'spec',
      heading: 'Tools',
      span: 4,
      source: 'register.tools',
      where: 'project is {{name}}, state is not retired',
      inherit: true,
      columns: [{ field: 'name' }, { field: 'project', as: 'scope' }],
      order: [{ field: 'name', dir: 'asc' }],
      limit: 8,
      empty: 'No tools apply to {{name}}.',
    },
    {
      kind: 'spec',
      heading: 'Skills',
      span: 4,
      source: 'register.skills',
      where: 'project is {{name}}, state is active',
      inherit: true,
      columns: [{ field: 'name' }, { field: 'project', as: 'scope' }],
      order: [{ field: 'name', dir: 'asc' }],
      limit: 8,
      empty: 'No skills apply to {{name}}.',
    },
  ],
};

export const AGENTS_PACK: { manifest: PackManifest; registers: Record<string, SeedRegister>; pages: typeof AGENTS_PAGES } = {
  manifest: { id: 'agents', version: '1.1.1', requires: ['register.things'] },
  registers: AGENTS_REGISTERS,
  pages: AGENTS_PAGES,
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
      ...Object.values(AGENTS_PAGES),
    ],
  };
}
