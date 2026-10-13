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

import { refused } from '@braindog/ports';
import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { Json } from '../coerce.ts';
import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import { actionEntry } from './actions.ts';
import type { Also, Source } from './index.ts';

/**
 * What a `runs_on` block's `where` and columns may name about one thing a project runs on.
 *
 * `quiet` IS THE EVALUATOR'S AND NOT AN AUTHOR'S: it holds a word on every row that applies everywhere and nothing on
 * the project's own, so a host fills the card's `quiet` role from it and draws the global rows faint, as it draws a run
 * gone quiet on `sessions.live`. A declaration does not name that role (`declare.ts` `CARD_ROLES`).
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
    spoken: { type: 'text' },
    quiet: { type: 'text' },
  },
};

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

/**
 * Whether an actor is a run's name as an event is signed with it, `S47`: the only actor `used_by` answers, because a
 * person is not a run. THE PREFIX IS THE `session` LIST'S OWN (`SESSION_PREFIX`), so this and the runs it names cannot
 * spell a run two ways.
 */
const isRun = (actor: string, SESSION_PREFIX: string): boolean => actor.startsWith(SESSION_PREFIX) && /^[1-9][0-9]*$/u.test(actor.slice(SESSION_PREFIX.length));

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
  const { predicateOf, typesOf, markOf, agentOf, SPOKEN, SESSION, SESSION_PREFIX } = kit;
  if (!deps.inScope || !deps.scopeOf)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read what a project runs on onto a page yet.', at: 'source' }) };
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

  const found = deps.list({ register: projects, where: { field: 'seq', is: Number(about[2]) }, limit: 1 });
  if (!found.ok) return { ...base, refusals: refused(found) ? also(found.refusal) : also() };
  const home = found.value.rows[0];
  if (!home) return { ...base, refusals: also({ code: 'VALUE_MALFORMED', fix: `${spoken} is not a row of ${projects}, so there is no project to read.`, at: 'about' }) };

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
  const own: Entry[] = [];
  const everywhere: Entry[] = [];
  for (const list of RUNS_ON_LISTS) {
    const schema = deps.schemaOf(list.register);
    if (!schema || deps.scopeOf(list.register)?.to !== projects) continue;
    const read = deps.inScope(list.register, home.id, { open: true, limit: RUNS_ON_EACH });
    if (!read.ok) return { ...base, refusals: refused(read) ? also(read.refusal) : also() };
    const title = deps.titleOf(list.register) ?? '';
    const secret = Object.keys(schema.fields).find((f) => schema.fields[f]?.type === 'secret');
    const shaped = (r: Entry, scope: 'project' | 'global'): Entry => {
      const used = list.kind === 'key' ? keyUse(deps, r, secret, SESSION_PREFIX) : list.kind === 'tool' ? toolUse(deps, list.register, r, SESSION_PREFIX) : { by: null, at: null };
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
          spoken: r.seq === null ? r.id : `${list.register}#${r.seq}`,
          quiet: scope === 'global' ? 'global' : null,
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
      fields: { kind: 'action', name: a.ingest, scope, state: a.state, detail: a.next, used_by: null, used_agent: null, used_at: null, spoken: a.ingest, quiet: scope === 'global' ? 'global' : null },
    });
  }
  const all = [...own, ...acts.project.sort(byName), ...everywhere, ...acts.global.sort(byName)];
  /* WITH THE ROW, because `seq is 3` is a sentence the grammar reads over any schema and answers from the row's column,
     and `evaluate` throws rather than guess when it is handed only the fields. */
  const kept = all.filter((r) => evaluate(said.predicate, r.fields, RUNS_ON, r));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  const rows = kept.slice(0, limit);
  /* EACH ROW'S CHIP IS THE PROJECT'S OR NONE, as `scopesOf` answers a block over one of these lists. */
  const name = scalar(home.fields[deps.titleOf(projects) ?? '']) ?? spoken;
  const mark = markOf(home, deps.identityOf?.(projects) ?? null);
  return {
    ...base,
    rows,
    matched: kept.length,
    types: typesOf(RUNS_ON),
    scopes: rows.map((r) => (r.fields.scope === 'project' ? name : null)),
    scope_marks: rows.map((r) => (r.fields.scope === 'project' ? mark : null)),
  };
}

/**
 * Who opened a key last, when that was a run, and when it was last opened by anybody; `null` in both when nobody has.
 * The grant's id is the value of the key row's secret field, and it is asked about and never answered.
 */
function keyUse(deps: PageDeps, row: Entry, secret: string | undefined, SESSION_PREFIX: string): { by: string | null; at: string | null } {
  const grant = secret === undefined ? undefined : row.fields[secret];
  const last = typeof grant === 'string' && grant !== '' ? (deps.keyOpened?.(grant) ?? null) : null;
  return last ? { by: isRun(last.actor, SESSION_PREFIX) ? last.actor : null, at: last.ts } : { by: null, at: null };
}

/**
 * When a tool was last seen, as its own `seen` says, and the run that wrote that, from the row's history.
 *
 * THE HISTORY IS READ ONLY FOR A TOOL SEEN AT ALL, so a tool nobody has used costs no read.
 */
function toolUse(deps: PageDeps, register: string, row: Entry, SESSION_PREFIX: string): { by: string | null; at: string | null } {
  const seen = row.fields.seen;
  const at = typeof seen === 'string' && seen !== '' ? seen : null;
  if (at === null || row.seq === null || !deps.history) return { by: null, at };
  const events = deps.history(register, `${register}#${row.seq}`);
  const wrote = events.ok
    ? events.value
        .filter((e) => e.field === 'seen' || (e.field === null && e.to !== null && typeof e.to === 'object' && !Array.isArray(e.to) && Object.hasOwn(e.to, 'seen')))
        .at(-1)
    : undefined;
  return { by: wrote && isRun(wrote.actor, SESSION_PREFIX) ? wrote.actor : null, at };
}

/* NOT `whole`, THOUGH A BLOCK OVER IT IS NAMED `*`: `registersOf` adds that name itself, after the lists this reads. */
export const runsOn: Source = { read: runsOnBlock };
