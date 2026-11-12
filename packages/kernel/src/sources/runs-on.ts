/**
 * `runs_on`: what one project runs on, its keys, tools, skills and scheduled actions.
 *
 * IT READS THE LISTS BELOW AND THE SCHEDULED ACTIONS BESIDE THEM, which belong to no list, so `registersOf` names each
 * list, the runs and the whole record; that walk reads `RUNS_ON_LISTS` from here. Moved out of `pages.ts` with its
 * answer unchanged (`sources/index.ts`).
 *
 * THE PREFIX A RUN'S NAME STARTS WITH COMES ON THE KIT and is passed to the two reads that ask whether an actor is a
 * run, since it is the list of runs' own (`session.ts`) and a module imports nothing of the kernel at run time.
 */

import { refused, type Refusal } from '@braindog/ports';
import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { Json } from '../coerce.ts';
import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import { actionEntry, monthOf } from './actions.ts';
import type { Also, Source } from './index.ts';

/**
 * What a `runs_on` block's `where` and columns may name about one thing a project runs on.
 *
 * `quiet` IS THE EVALUATOR'S AND NOT AN AUTHOR'S: it holds a word on every row that applies everywhere and nothing on
 * the project's own, so a host fills the card's `quiet` role from it and draws the global rows faint, as it draws a run
 * gone quiet on `sessions.live`. A declaration does not name that role (`declare.ts` `CARD_ROLES`).
 *
 * `used_runs` AND `used_agents` SAY WHO USED IT, AND HOW OFTEN, over ninety days: how many runs, and the agents
 * of those runs by name, newest first and three at most, "Claude Code, Codex". `used_agent` stays beside them, the one
 * agent of the run that used it last, for the pages that name it. A thing nobody used has 0 and nothing.
 *
 * `runs`, `requests`, `bytes`, `failures` AND `held` ARE A SCHEDULED ACTION'S MONTH, the same numbers from the same row
 * as the `actions` read and the `usage.*` sources (`monthOf`), so a project's page and the usage page cannot disagree.
 * An action with no runs has zeros; a key, a tool or a skill is no action and has nothing.
 */
const RUNS_ON: Schema = {
  register: 'runs_on',
  fields: {
    kind: { type: 'enum', values: ['key', 'tool', 'skill', 'action'] },
    name: { type: 'text' },
    scope: { type: 'enum', values: ['project', 'global'] },
    state: { type: 'text' },
    detail: { type: 'text' },
    used_by: { type: 'text' },
    used_agent: { type: 'text' },
    used_at: { type: 'instant' },
    used_runs: { type: 'int' },
    used_agents: { type: 'text' },
    spoken: { type: 'text' },
    quiet: { type: 'text' },
    runs: { type: 'int' },
    requests: { type: 'int' },
    bytes: { type: 'int' },
    failures: { type: 'int' },
    held: { type: 'int' },
  },
};

/** What a row that is no action holds in the month's counts: nothing, since only an action runs. */
const NO_MONTH = { runs: null, requests: null, bytes: null, failures: null, held: null };

/**
 * The lists `runs_on` reads, in the order it draws them, each with what one of its rows is called there and the field
 * said beside its name: what a key opens, how a tool is reached, which version a skill is at.
 *
 * NAMED BY THE AGENTS PACK'S LIST IDS, and each is read only where the record holds it and places its rows in projects
 * of the kind `about:` names: a record without the pack has none of them, and the block draws its `empty:` rather than
 * refusing for a list somebody chose not to install.
 */
export const RUNS_ON_LISTS = [
  { register: 'credentials', kind: 'key', detail: 'opens' },
  { register: 'tools', kind: 'tool', detail: 'transport' },
  { register: 'skills', kind: 'skill', detail: 'rev' },
] as const;

/**
 * How many rows `runs_on` reads from each list for the project, and as many again for everywhere (`inScope` reads at
 * most 200). A tool's last use is one history read per tool row, so one block reads at most twice this many histories.
 * The scheduled actions are the record's whole schedule, which its declarations bound.
 */
const RUNS_ON_EACH = 50;

/** How far back a use counts toward a row's `used_runs` and `used_agents`: ninety days, as his scope says it. */
const USED_DAYS = 90;

/** The most agents `used_agents` names, the ones whose runs used the thing last. */
const USED_AGENTS_MOST = 3;

/**
 * One thing's use: the run that used it last, when anybody last did, and every run that used it since the window opened,
 * by its handle, the newest use first and each run once. A person's use or an agent's with no run is in `at` and in no
 * run, as `used_by` has it.
 */
type Use = { by: string | null; at: string | null; runs: readonly string[] };
const NOT_USED: Use = { by: null, at: null, runs: [] };

/** The distinct runs among uses read newest first, each once, in the order they last used it. */
const runsAmong = (uses: readonly { actor: string; ts: string }[], since: string, SESSION_PREFIX: string): string[] => {
  const runs: string[] = [];
  for (const u of uses) if (u.ts >= since && isRun(u.actor, SESSION_PREFIX) && !runs.includes(u.actor)) runs.push(u.actor);
  return runs;
};

/**
 * Whether an actor is a run's name as an event is signed with it, `S47`: the only actor `used_by` answers, because a
 * person is not a run. THE PREFIX IS THE `session` LIST'S OWN (`SESSION_PREFIX`), so this and the runs it names cannot
 * spell a run two ways.
 */
const isRun = (actor: string, SESSION_PREFIX: string): boolean => actor.startsWith(SESSION_PREFIX) && /^[1-9][0-9]*$/u.test(actor.slice(SESSION_PREFIX.length));

/** A project and everything it runs on, in the order a block draws it, or the refusal that stopped the read (`null`: a read that failed without one). */
type Gathered = { home: Entry; all: Entry[] } | { refusal: Refusal | null };

/** Every key, tool, skill and scheduled action of the project `projects#seq`, its own first and then what applies everywhere. */
function gathered(deps: PageDeps, kit: SourceKit, projects: string, seq: number, spoken: string): Gathered {
  const { agentOf, SESSION, SESSION_PREFIX } = kit;
  const found = deps.list({ register: projects, where: { field: 'seq', is: seq }, limit: 1 });
  if (!found.ok) return { refusal: refused(found) ? found.refusal : null };
  const home = found.value.rows[0];
  if (!home) return { refusal: { code: 'VALUE_MALFORMED', fix: `${spoken} is not a row of ${projects}, so there is no project to read.`, at: 'about' } };

  const scalar = (v: Json | undefined): string | null => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : null);
  const byName = (a: Entry, b: Entry): number => {
    const x = String(a.fields.name ?? '');
    const y = String(b.fields.name ?? '');
    return x < y ? -1 : x > y ? 1 : 0;
  };
  /* THE AGENT A RUN IS, read once a run and called as the run's own name calls it (`agentOf` in `session.ts`), so a cell
     says "Claude Code" beside the run's handle and never the handle alone. A run the caller may not read, or one gone,
     names no agent, and the host draws the day by itself. */
  const agents = new Map<string, string | null>();
  const agentNamed = (run: string | null): string | null => {
    if (run === null) return null;
    if (!agents.has(run)) {
      const found = deps.list({ register: SESSION, where: { field: 'seq', is: Number(run.slice(SESSION_PREFIX.length)) }, limit: 1 });
      const fields = found.ok ? found.value.rows[0]?.fields : undefined;
      agents.set(run, fields ? agentOf({ agent: scalar(fields.agent) ?? undefined, client: scalar(fields.client) ?? undefined }).name : null);
    }
    return agents.get(run)!;
  };
  /* THE AGENTS OF THE RUNS, newest first, each named once and three at most: "Claude Code, Codex". A run whose agent is
     not read is counted in `used_runs` and names nobody here, so the line is never a handle. */
  const agentsNamed = (runs: readonly string[]): string | null => {
    const names: string[] = [];
    for (const run of runs) {
      const agent = agentNamed(run);
      if (agent !== null && !names.includes(agent)) names.push(agent);
      if (names.length === USED_AGENTS_MOST) break;
    }
    return names.length ? names.join(', ') : null;
  };
  const since = new Date(deps.ctx.nowMs - USED_DAYS * 86_400_000).toISOString();
  const own: Entry[] = [];
  const everywhere: Entry[] = [];
  for (const list of RUNS_ON_LISTS) {
    const schema = deps.schemaOf(list.register);
    if (!schema || deps.scopeOf!(list.register)?.to !== projects) continue;
    const read = deps.inScope!(list.register, home.id, { open: true, limit: RUNS_ON_EACH });
    if (!read.ok) return { refusal: refused(read) ? read.refusal : null };
    const title = deps.titleOf(list.register) ?? '';
    const secret = Object.keys(schema.fields).find((f) => schema.fields[f]?.type === 'secret');
    const shaped = (r: Entry, scope: 'project' | 'global'): Entry => {
      const used: Use =
        list.kind === 'key' ? keyUse(deps, r, secret, SESSION_PREFIX, since) : list.kind === 'tool' ? toolUse(deps, list.register, r, SESSION_PREFIX, since) : NOT_USED;
      return {
        ...r,
        fields: {
          kind: list.kind,
          name: scalar(r.fields[title]) ?? '',
          scope,
          state: r.state,
          detail: scalar(r.fields[list.detail]),
          used_by: used.by,
          used_agent: agentNamed(used.by),
          used_at: used.at,
          used_runs: used.runs.length,
          used_agents: agentsNamed(used.runs),
          spoken: r.seq === null ? r.id : `${list.register}#${r.seq}`,
          quiet: scope === 'global' ? 'global' : null,
          ...NO_MONTH,
        },
      };
    };
    own.push(...read.value.rows.map((r) => shaped(r, 'project')).sort(byName));
    everywhere.push(...read.value.inherited.map((r) => shaped(r, 'global')).sort(byName));
  }
  /* A SCHEDULED ACTION RUNS FOR ONE PROJECT OR FOR ALL OF THEM, and one that has finished runs on nothing. Its
     declaration holds the project as the row's id; the spoken id is taken too, as the way a person would write it. */
  const acts = { project: [] as Entry[], global: [] as Entry[] };
  for (const a of deps.actions?.() ?? []) {
    if (a.state === 'done') continue;
    const scope = a.project === null ? 'global' : a.project === home.id || a.project === spoken ? 'project' : null;
    if (scope === null) continue;
    acts[scope].push({
      ...actionEntry(a),
      fields: { kind: 'action', name: a.ingest, scope, state: a.state, detail: a.next, used_by: null, used_agent: null, used_at: null, used_runs: 0, used_agents: null, spoken: a.ingest, quiet: scope === 'global' ? 'global' : null, ...monthOf(a) },
    });
  }
  return { home, all: [...own, ...acts.project.sort(byName), ...everywhere, ...acts.global.sort(byName)] };
}

/**
 * What one project runs on: its keys, tools, skills and scheduled actions, then the ones that apply everywhere, each
 * group by name.
 *
 * NEARER WINS AS `inScope` DECIDES IT, the one read `context` and `inherit:` are built on, so a project's own skill hides
 * the global one of the same name here exactly as it does for an agent working in that project, and a retired row is
 * left out as a finished one is there.
 *
 * NO ROW OF A LIST IS HANDED BACK AS IT IS: each answer row is built from the fields `RUNS_ON` names, so the grant a
 * key's row points at is used to ask who opened it and goes no further, and nothing else of the key's row travels.
 */
function runsOnBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, typesOf, markOf, SPOKEN } = kit;
  if (!deps.inScope || !deps.scopeOf)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read what a project runs on onto a page yet.', at: 'source' }) };
  const about = typeof block.about === 'string' ? SPOKEN.exec(block.about) : null;
  if (!about)
    return {
      ...base,
      refusals: also({ code: 'REQUIRED_MISSING', fix: 'runs_on reads what one project runs on, and about: names that project by its row, such as things#1.', at: 'about' }),
    };
  const projects = about[1]!;
  const spoken = String(block.about);
  if (block.order?.length)
    return {
      ...base,
      refusals: also({ code: 'DECLARATION_INVALID', fix: "runs_on comes the project's own first, then what applies everywhere, each by name, so it takes no order:.", at: 'order' }),
    };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(RUNS_ON.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `What a project runs on has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(RUNS_ON.fields) }),
    };
  const said = predicateOf(block.where, RUNS_ON, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };

  /* EVERYTHING THE PROJECT RUNS ON IS GATHERED ONCE FOR A READ (`ctx.walks`), and each block keeps its own rows of it. A
     project's page draws four of these blocks, keys, tools, skills and what applies everywhere, and each gathered every
     kind again with who used each: on a lived-in record that was most of the page's time. The memo hands on what the
     gathering read, so a block that took it is still held by those lists. */
  const gather = (): Gathered => gathered(deps, kit, projects, Number(about[2]), spoken);
  const got = deps.ctx.walks ? deps.ctx.walks.once(`runs_on ${spoken}`, gather) : gather();
  if ('refusal' in got) return { ...base, refusals: got.refusal === null ? also() : also(got.refusal) };
  const home = got.home;
  /* A COPY, since a block's rows are its own to shape after this. */
  const all = structuredClone(got.all);

  const scalar = (v: Json | undefined): string | null => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : null);
  /* WITH THE ROW, because `seq is 3` is a sentence the grammar reads over any schema and answers from the row's column,
     and `evaluate` throws rather than guess when it is handed only the fields. */
  const kept = all.filter((r) => evaluate(said.predicate, r.fields, RUNS_ON, r));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  const rows = kept.slice(0, limit);
  /* HOW MANY THAT APPLY EVERYWHERE THE BLOCK'S SENTENCE KEPT, COUNTED BEFORE THE CUT, so a block that shows five of them
     can say how many more there are. They come last, so the rows that apply everywhere among `rows` are a tail of it. */
  const inherited = kept.filter((r) => r.fields.scope === 'global').length;
  /* EACH ROW'S CHIP IS THE PROJECT'S OR NONE, as `scopesOf` answers a block over one of these lists. */
  const name = scalar(home.fields[deps.titleOf(projects) ?? '']) ?? spoken;
  const mark = markOf(home, deps.identityOf?.(projects) ?? null);
  return {
    ...base,
    rows,
    matched: kept.length,
    inherited,
    types: typesOf(RUNS_ON),
    scopes: rows.map((r) => (r.fields.scope === 'project' ? name : null)),
    scope_marks: rows.map((r) => (r.fields.scope === 'project' ? mark : null)),
  };
}

/**
 * Who opened a key last, when that was a run, and when it was last opened by anybody; `null` in both when nobody has.
 * The grant's id is the value of the key row's secret field, and it is asked about and never answered.
 *
 * THE RUNS THAT OPENED IT IN THE WINDOW come from every open the host hands (`keyUses`), or from the last one alone.
 */
function keyUse(deps: PageDeps, row: Entry, secret: string | undefined, SESSION_PREFIX: string, since: string): Use {
  const grant = secret === undefined ? undefined : row.fields[secret];
  if (typeof grant !== 'string' || grant === '') return NOT_USED;
  const last = deps.keyOpened?.(grant) ?? null;
  if (!last) return NOT_USED;
  const runs = runsAmong(deps.keyUses ? deps.keyUses(grant, since) : [last], since, SESSION_PREFIX);
  return { by: isRun(last.actor, SESSION_PREFIX) ? last.actor : null, at: last.ts, runs };
}

/**
 * When a tool was last seen, as its own `seen` says, the run that wrote that, from the row's history, and every run that
 * wrote it in the window, the newest first.
 *
 * THE HISTORY IS READ ONLY FOR A TOOL SEEN AT ALL, so a tool nobody has used costs no read. A WRITE OF `seen` IS A USE,
 * as `usedBy` counts one (`SEEN_WRITTEN` in the record's `methods/agents.ts`): an edit of the field, or a create that
 * arrived holding it.
 */
function toolUse(deps: PageDeps, register: string, row: Entry, SESSION_PREFIX: string, since: string): Use {
  const seen = row.fields.seen;
  const at = typeof seen === 'string' && seen !== '' ? seen : null;
  if (at === null || row.seq === null || !deps.history) return { ...NOT_USED, at };
  const events = deps.history(register, `${register}#${row.seq}`);
  const wrote = events.ok
    ? events.value
        .filter((e) => e.field === 'seen' || (e.field === null && e.to !== null && typeof e.to === 'object' && !Array.isArray(e.to) && Object.hasOwn(e.to, 'seen')))
        .reverse()
    : [];
  const last = wrote[0];
  return { by: last && isRun(last.actor, SESSION_PREFIX) ? last.actor : null, at, runs: runsAmong(wrote, since, SESSION_PREFIX) };
}

/* NOT `whole`, THOUGH A BLOCK OVER IT IS NAMED `*`: `registersOf` adds that name itself, after the lists this reads. */
export const runsOn: Source = { read: runsOnBlock };
