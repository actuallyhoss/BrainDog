/**
 * Every ref an agent is handed, sent back through every tool that writes a row.
 *
 * THE SHAPE THIS FILE IS WRITTEN AGAINST IS A ROUND TRIP CLOSED AT SOME TOOLS AND NOT OTHERS. It was found three
 * times in one commit: `create` and `update`
 * took `LN8` because this package qualified it on the way in, and `propose`'s `rowset` did not, so the owner pressed
 * accept on a skill whose `because` read back `["LN6"]` and was told `because[0] takes a row id or a spoken id`. A
 * task read while its project was live and sent back after the project went was refused `thing names things#5, and
 * there is no such row`, for a value the task already held. Each repair before it had been as wide as the one case
 * it was measured on.
 *
 * SO NEITHER SIDE IS A HAND LIST. The tools that answer a ref are found by calling every tool in `TOOLS` and reading
 * which answers carry a row with a ref field set, the ref fields read from the record's own schema. The tools that
 * take one are every tool in `TOOLS` that writes and takes fields, a patch or a body. A tool added to either side is
 * driven here without a line changing, and a writer with no way to send a row here is red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools, TOOLS } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const agent: CallContext = {
  principal: { kind: 'token', id: 't', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'refs', cwd: '/Users/studio/Code/kiln-type' },
} as CallContext;
const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };

type Said = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
type Shaped = { spoken: string; version: number; fields: Record<string, unknown>; deleted_at?: string };
type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Mcp = ReturnType<typeof tools<CallContext>>;

const valueOf = <T>(r: Said): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.value as T;
};

/** The rows the fixture reads back: a task on a live project, a task on one about to go, a learning superseding another, and skills#5. */
type Fixture = { api: Api; doomed: Shaped; onDoomed: Shaped; onKiln: Shaped; first: Shaped; second: Shaped };

/**
 * PROJECTS AS PORTFOLIO 1.15.0 DECLARED THEM, with no `delete:` rule. 1.16.0 refuses deleting a project anything points
 * at, and a record from before it can still hold live rows pointing at a deleted project, which is what this reads.
 */
async function withoutDeleteRule(kernel: { declarations(): { id: string; version: number; body: string }[]; install(d: never, e: { id: string; version: number }): Promise<{ ok: boolean }> }): Promise<void> {
  const things = kernel.declarations().find((d) => d.id === 'register.things');
  assert.ok(things, 'the seed declares no Projects');
  const { delete: _rule, ...body } = JSON.parse(things.body) as Record<string, unknown>;
  const out = await kernel.install([{ id: 'register.things', kind: 'register', body }] as never, { id: 'register.things', version: things.version });
  assert.ok(out.ok, JSON.stringify(out));
}

async function fixture(): Promise<Fixture> {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 22, 9)) });
  await installSeed(api.kernel);
  await withoutDeleteRule(api.kernel as never);
  const mcp = tools(api);
  const make = async (register: string, fields: Record<string, unknown>) => valueOf<Shaped>(await mcp.call('create', { register, fields }, agent));
  const doomed = await make('things', { name: 'A project that goes', lane: 'building' });
  const onDoomed = await make('tasks', { what: 'Work on the project that goes', thing: doomed.spoken });
  const onKiln = await make('tasks', { what: 'Work on Kiln', thing: 'things#1' });
  const base = { lesson: 'A ref is sent back as it came.', because: 'Measured while writing this file.', kind: 'fact' };
  const first = await make('learnings', base);
  /* IN ITS OWN WORDS: two learnings saying the same lesson are one (`same:` on learnings), and the second is refused. */
  const second = await make('learnings', { ...base, lesson: 'A ref is sent back as it came, every time.', supersedes: first.spoken });
  return { api, doomed, onDoomed, onKiln, first, second };
}

/**
 * How to ask each tool something that could answer a row, keyed by every name in `TOOLS`. The test is red for a
 * tool without an entry, so a new tool is asked before it ships. Whether its answer carries a ref is read, not said.
 */
const ASK: Record<string, (fx: Fixture) => Record<string, unknown>[]> = {
  record_index: () => [{}],
  context: () => [{}],
  /* NOTHING TO ASK: `instructions` answers what he told a run, and the owner here is no run. */
  instructions: () => [],
  /* AND `history` IS ASKED THROUGH `get`, which it was folded into. */
  get: (fx) => [fx.onDoomed, fx.onKiln, fx.second].map((r): Record<string, unknown> => ({ spoken: r.spoken })).concat([{ spoken: 'skills#5' }, { spoken: fx.onDoomed.spoken, history: true }]),
  list: (fx) => [
    { register: 'tasks', where: { field: 'what', is: fx.onDoomed.fields.what } },
    { register: 'learnings', where: { field: 'supersedes', is: fx.first.spoken } },
  ],
  search: () => [{ q: 'project that goes' }],
  activity: () => [{ limit: 20 }],
  governance: () => [{}],
  propose: () => [{ question: 'Is this a question?', body_kind: 'options', body: { options: [{ id: 'a', label: 'A', because: 'a' }, { id: 'b', label: 'B', because: 'b' }] } }],
  create: () => [{ register: 'tasks', fields: { what: 'Made to be read back', thing: 'things#1' } }],
  update: (fx) => [{ spoken: fx.onDoomed.spoken, patch: { what: fx.onDoomed.fields.what } }],
  log: (fx) => [{ spoken: fx.onDoomed.spoken, note: 'Read for the round trip.' }],
  handoff: () => [{ next: 'Send every ref back.' }],
  meet: () => [{ name: 'Ada Lovelace', email: 'ada@example.com', where: 'the refs round trip' }],
  /* NOTHING TO ASK: `triage` files an arrival from the inbox, and this record holds none, so it answers no row. */
  triage: () => [],
  /* NOTHING TO ASK: `act` is handed its calls by a host and this is the record alone, and the rows it writes go through
     the record's `create` and `update`, which are asked above. */
  act: () => [],
};

/** A row an answer carried, with its register and the ref fields it has set. */
type Answered = { tool: string; spoken: string; register: string; fields: Record<string, unknown>; refs: string[] };

async function refFieldsOf(api: Api, register: string): Promise<string[]> {
  const schema = valueOf<{ fields: { id: string; type: string; of?: string }[] }>(await api.schema({ register }, owner));
  return schema.fields.filter((f) => f.type === 'ref' || (f.type === 'list' && f.of === 'ref')).map((f) => f.id);
}

/** Every object in an answer shaped like a row: a spoken id and its fields. */
function rowsIn(value: unknown, out: Shaped[] = []): Shaped[] {
  if (Array.isArray(value)) for (const v of value) rowsIn(v, out);
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.spoken === 'string' && o.fields && typeof o.fields === 'object' && !Array.isArray(o.fields)) out.push(o as Shaped);
    for (const v of Object.values(o)) rowsIn(v, out);
  }
  return out;
}

async function answered(fx: Fixture, mcp: Mcp): Promise<Answered[]> {
  const out: Answered[] = [];
  for (const tool of TOOLS) {
    for (const args of ASK[tool.name]!(fx)) {
      const said = (await mcp.call(tool.name, args, agent)) as Said;
      for (const row of rowsIn(said.ok ? said.value : null)) {
        const raw = fx.api.kernel.get(row.spoken, { includeDeleted: true });
        if (!raw) continue;
        const refs = (await refFieldsOf(fx.api, raw.register)).filter((id) => row.fields[id] !== undefined && row.fields[id] !== null);
        if (refs.length > 0 && !out.some((a) => a.tool === tool.name && a.spoken === row.spoken))
          out.push({ tool: tool.name, spoken: row.spoken, register: raw.register, fields: row.fields, refs });
      }
    }
  }
  return out;
}

/** The row ids a row stores in its ref fields, which is what a round trip must leave as it found them. */
const storedRefs = (api: Api, spoken: string, refs: string[]): Record<string, unknown> => {
  const raw = api.kernel.get(spoken, { includeDeleted: true });
  assert.ok(raw, `${spoken} is not a row`);
  return Object.fromEntries(refs.map((id) => [id, raw.fields[id]]));
};

/**
 * The ways to send a row back, keyed by every tool that writes and takes fields, a patch or a body. `in place` writes
 * the row the answer came from, and `new` writes a row carrying the same fields.
 */
type Send = { how: string; place: 'in place' | 'new'; send: (fx: Fixture, mcp: Mcp, a: Answered) => Promise<{ said: Said; id: string | null }> };

const accepted = async (fx: Fixture, filed: Said): Promise<Said> => {
  if (!filed.ok) return filed;
  const id = (filed.value as { id: string }).id;
  return (await fx.api.decide({ id, decide: { option: 'accept', reason: 'The round trip.' } }, owner)) as Said;
};

const SEND: Record<string, Send[]> = {
  update: [
    {
      how: 'update',
      place: 'in place',
      send: async (fx, mcp, a) => {
        const version = fx.api.kernel.get(a.spoken)!.version;
        const said = (await mcp.call('update', { spoken: a.spoken, patch: a.fields, version }, agent)) as Said;
        return { said, id: fx.api.kernel.get(a.spoken)!.id };
      },
    },
  ],
  create: [
    {
      how: 'create',
      place: 'new',
      send: async (fx, mcp, a) => {
        const said = (await mcp.call('create', { register: a.register, fields: a.fields }, agent)) as Said;
        return { said, id: said.ok ? fx.api.kernel.get((said.value as Shaped).spoken)!.id : null };
      },
    },
  ],
  propose: [
    {
      how: 'propose rowset, updating the row',
      place: 'in place',
      send: async (fx, mcp, a) => {
        const row = fx.api.kernel.get(a.spoken)!;
        const body = { register: a.register, rows: [{ at: a.spoken, version: row.version, patch: a.fields }] };
        const said = await accepted(fx, (await mcp.call('propose', { question: `Send ${a.spoken} back?`, body_kind: 'rowset', body }, agent)) as Said);
        return { said, id: row.id };
      },
    },
    {
      how: 'propose rowset, creating a row',
      place: 'new',
      send: async (fx, mcp, a) => {
        const body = { register: a.register, rows: [a.fields] };
        const said = await accepted(fx, (await mcp.call('propose', { question: `Copy ${a.spoken}?`, body_kind: 'rowset', body }, agent)) as Said);
        return { said, id: said.ok ? ((said.value as { wrote: string[] }).wrote[0] ?? null) : null };
      },
    },
  ],
};

test('the writers here are exactly the tools that write and take fields, a patch or a body', () => {
  const takes = TOOLS.filter((t) => {
    const props = Object.keys((t.input as { properties?: Record<string, unknown> }).properties ?? {});
    return t.writes && props.some((p) => p === 'fields' || p === 'patch' || p === 'body');
  })
    /* `triage` WRITES A ROW ONLY OUT OF AN ARRIVAL IN THE INBOX, so a row an agent already holds has no way through it. */
    .filter((t) => t.name !== 'triage')
    .map((t) => t.name);
  assert.deepEqual(Object.keys(SEND).sort(), takes.sort(), 'a tool that writes a row has no way to send one back here');
  assert.deepEqual(Object.keys(ASK).sort(), TOOLS.map((t) => t.name).sort(), 'a tool is not asked anything here');
});

/**
 * Every answered row through every writer, and what each must do.
 *
 * IN PLACE, EVERY ANSWER IS TAKEN AND THE ROW'S REFS ARE LEFT AS THEY WERE, whichever tool answered it and whether its
 * target has gone since. A NEW ROW TAKES A LIVE TARGET AND REFUSES A GONE ONE BY NAME, at the field and saying it was
 * deleted: the record has always refused a new ref to a deleted row by its spoken id, and a copy is a new ref. The
 * same target handed back as a row id is taken, because the record does not look a row id up; that is its own
 * question and not this file's.
 */
async function roundTrip(fx: Fixture, mcp: Mcp, rows: Answered[], deleted: Set<string>): Promise<{ wrong: string[]; sent: number; goneByName: number }> {
  const wrong: string[] = [];
  let sent = 0;
  let goneByName = 0;
  for (const a of rows) {
    const before = storedRefs(fx.api, a.spoken, a.refs);
    /* A GONE TARGET THE ANSWER NAMED, as against one it handed back as a row id. The record looks a name up and takes
       a row id as it comes, for any row, so a copy carrying the id is taken and stores the same ref. */
    const gone = a.refs.some((r) => {
      const ids = [before[r]].flat();
      const said = [a.fields[r]].flat();
      return ids.some((id, i) => typeof id === 'string' && deleted.has(id) && said[i] !== id);
    });
    for (const sends of Object.values(SEND))
      for (const s of sends) {
        const { said, id } = await s.send(fx, mcp, a);
        sent++;
        const at = `${a.tool}'s ${a.spoken} (${a.refs.map((r) => `${r}=${JSON.stringify(a.fields[r])}`).join(', ')}) through ${s.how}`;
        if (s.place === 'new' && gone) {
          goneByName++;
          const field = String(said.refusal?.at).replace(/\[\d+\]$/, '');
          if (said.ok || said.refusal?.code !== 'VALUE_MALFORMED' || !a.refs.includes(field) || !/was deleted/.test(said.refusal.fix))
            wrong.push(`${at}: ${JSON.stringify(said)}, and a new ref to a deleted row is refused at its field, saying so`);
          continue;
        }
        /* A COPY MADE ON A LIST THAT SAYS WHAT MAKES TWO OF ITS ROWS THE SAME (`same:`) IS THAT ROW AGAIN, refused
           ALREADY_KNOWN with the call that changes the one held, so its refs go back through the other doors only. */
        if (s.how === 'create' && !said.ok && said.refusal?.code === 'ALREADY_KNOWN' && fx.api.kernel.register(a.register)?.same !== undefined) continue;
        /* A ROWSET THAT CHANGES NOTHING IS NOT FILED (`ALREADY_KNOWN`): the row already holds exactly what was sent, which
           is the round trip this file asks for, so its refs are read as they are and must still be as they were. */
        const same = s.place === 'in place' && !said.ok && said.refusal?.code === 'ALREADY_KNOWN';
        if (!said.ok && !same) {
          wrong.push(`${at}: ${JSON.stringify(said.refusal)}`);
          continue;
        }
        const after = storedRefs(fx.api, id!, a.refs);
        if (JSON.stringify(after) !== JSON.stringify(before)) wrong.push(`${at}: stored ${JSON.stringify(after)}, was ${JSON.stringify(before)}`);
      }
  }
  return { wrong, sent, goneByName };
}

test('every ref any tool answers goes back through every tool that writes a row, before and after its target is deleted', async () => {
  const fx = await fixture();
  const mcp = tools(fx.api);

  /* READ WHILE EVERY TARGET IS LIVE, then the project is deleted. The copy an agent holds from before the delete is the
     ordinary case: another session, or the person, deleted the project with its tasks left on it. */
  const live = await answered(fx, mcp);
  const who = new Set(live.map((a) => a.tool));
  for (const tool of ['get', 'list', 'create', 'update']) assert.ok(who.has(tool), `${tool} answered no ref: ${JSON.stringify([...who])}`);
  assert.ok(live.some((a) => a.fields.thing === fx.doomed.spoken), 'no answer named the project about to go');
  assert.ok(live.some((a) => /^LN\d+$/.test(String(a.fields.supersedes))), 'no answer named a prefixed ref');
  assert.ok(live.some((a) => Array.isArray(a.fields.because) && a.fields.because.every((v) => /^LN\d+$/.test(String(v)))), 'no answer named a prefixed list');

  valueOf(await mcp.call('update', { spoken: fx.doomed.spoken, patch: { deleted_at: true }, version: fx.doomed.version }, agent));
  const deleted = new Set([fx.api.kernel.get(fx.doomed.spoken, { includeDeleted: true })!.id]);

  /* AND READ AGAIN AFTER, by a fresh set of tools as each MCP message is, which answers the gone target in its own form. */
  const after = await answered(fx, tools(fx.api));

  const before = await roundTrip(fx, mcp, live, deleted);
  const since = await roundTrip(fx, tools(fx.api), after, deleted);
  assert.deepEqual([...before.wrong, ...since.wrong], []);
  /* NOT A LOOP OVER NOTHING: how many sends there were, and that the refusal of a gone target by name was reached. */
  assert.ok(before.sent + since.sent >= 40, `${String(before.sent + since.sent)} sends`);
  assert.ok(before.goneByName > 0, 'no copy named the deleted project');
});

test('a list of refs holding a deleted row goes back through update, and a copy of it is refused at the element', async () => {
  /* THE LIST HALF OF WHAT A FIELD ALREADY HOLDS WAS DRIVEN BY NOTHING ABOVE. The round trip deletes a project, which
     only a single `thing` points at, so `holds` answering `held === id` for an array as well passed all three tests
     here; measured by mutation, and then this case made to fail on that mutation. skills#5 cites its learning in
     `because`, a `list<ref>`, and the learning is what goes.

     READ BEFORE THE DELETE, because a read after it answers the gone learning as its row id
     (`["01M345FTM0B76YN8SC04YFYS8J"]`, measured), which the record takes for any row and so tests nothing here. The
     name is the form that has to be looked up, and the copy an agent holds from before is the one that carries it. */
  const fx = await fixture();
  const mcp = tools(fx.api);
  const read = valueOf<Shaped>(await mcp.call('get', { spoken: 'skills#5' }, agent));
  const cites = read.fields.because;
  const cited = String(Array.isArray(cites) ? cites[0] : cites);
  assert.match(cited, /^LN\d+$/, `skills#5 cites ${cited}`);
  const learning = fx.api.kernel.get(cited)!;
  valueOf(await mcp.call('update', { spoken: cited, patch: { deleted_at: true }, version: learning.version }, agent));

  const before = fx.api.kernel.get('skills#5')!;
  const back = (await tools(fx.api).call('update', { spoken: 'skills#5', patch: read.fields, version: before.version }, agent)) as Said;
  assert.ok(back.ok, `update refused its own fields: ${JSON.stringify(back)}`);
  assert.deepEqual(fx.api.kernel.get('skills#5')!.fields.because, before.fields.because);

  const copy = (await tools(fx.api).call('create', { register: 'skills', fields: read.fields }, agent)) as Said;
  assert.equal(copy.ok, false, `a copy citing the deleted ${cited} was taken`);
  assert.equal(copy.refusal?.at, 'because[0]');
  assert.match(String(copy.refusal?.fix), /was deleted/);
});

test('log on a deleted row says it is deleted', async () => {
  /* MEASURED BEFORE: `log` on things#5 after its delete answered `{spoken, version, updated_at}`, ok, and nothing in it
     said the row was gone; the whole-row answer it replaced had carried `deleted_at`. */
  const fx = await fixture();
  const mcp = tools(fx.api);
  const gone = valueOf<Shaped>(await mcp.call('update', { spoken: fx.doomed.spoken, patch: { deleted_at: true }, version: fx.doomed.version }, agent));
  assert.equal(typeof gone.deleted_at, 'string');
  const logged = valueOf<Shaped>(await mcp.call('log', { spoken: fx.doomed.spoken, note: 'Carried from another session.' }, agent));
  assert.equal(logged.deleted_at, gone.deleted_at, `log answered ${JSON.stringify(logged)}`);
  const live = valueOf<Shaped>(await mcp.call('log', { spoken: fx.onKiln.spoken, note: 'Still here.' }, agent));
  assert.equal(Object.hasOwn(live, 'deleted_at'), false, 'a live row is said to be deleted');
});
