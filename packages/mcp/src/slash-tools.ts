/**
 * Slash's tools in a conversation: the reads an agent has here, said the way an agent reads them, and the writes a
 * person asks Slash for, made through the record's own write path as that person.
 *
 * THE SAME READS AND NOT A SECOND SET. Every read is one of this package's tools (`tools` in `index.ts`), called in
 * process with the asker's context, and the model reads its brief answer: the words an agent is shown, already short,
 * every row named by its id. A read the asker may not make is refused here as it is refused to an agent.
 *
 * A WRITE LANDS AT ONCE ONLY WHEN THREE THINGS HOLD: the person asked for something to be done in this message, the
 * turn has read nothing from outside the record, and the write is on no floor (`kindsOfWrite`, the ladder's own reading
 * of a write: money amounts, keys, sharing, deletes, who someone is, a row another person made, add-ons). Otherwise it
 * is held, with the write it would make, and lands on the person's yes (`apply`). What lands carries its batch, which is
 * what the record's `undo` takes back.
 *
 * STRUCTURAL, so Slash's engine (`@braindog/slash`, `ChatTools`) takes it without either package importing the other.
 */

import { codeOf, fixOf, type Result, type Sql } from '@braindog/ports';
import { kindsOfWrite, madeByIn, shapeIn, type Floor, type ListShape } from '@braindog/kernel';

import { tools as agentTools, type McpSurface } from './index.ts';

type Args = Record<string, unknown>;
type Answer<T = unknown> = Promise<Result<T>>;

/** One tool as the model is told of it. */
export type SlashTool = { name: string; args: string; about: string; writes?: boolean };

/** What a write did, or would do on a yes, as the engine shows it. `op` is the write itself, kept and never shown. */
export type SlashToolAction = { kind: 'done' | 'ask'; title: string; detail?: string; undo?: { batch: string }; href?: string; op?: Args };

export type SlashToolRan = {
  text: string;
  outside?: string | null;
  action?: SlashToolAction;
  navigate?: { href: string; label: string };
  step?: string;
};

/** How the engine's run stands when a tool is called (`ChatRun` in `@braindog/slash`). */
export type SlashToolRun = { askOnly: boolean; asked: boolean; said: string; outside: string | null };

export type SlashChatTools = {
  list: readonly SlashTool[];
  call(name: string, args: Args, run: SlashToolRun): Promise<SlashToolRan>;
  apply(op: Args): Promise<Result<{ receipt: string; undo?: { batch: string }; href?: string }>>;
  ref(id: string): Promise<{ ref: string; label: string } | null>;
  /** Up to three short lines of what matters now, for an empty palette: no model is asked. */
  now(): Promise<{ text: string; href?: string }[]>;
};

/** The record's methods this file calls beyond what an agent's surface names. Each optional, as a host may not answer it. */
export type SlashSurface<C> = McpSurface<C> & {
  slashPropose?(args: { asked: string; page?: string }, ctx: C): Answer;
};

export type SlashToolDeps = {
  /** The record's own SQLite, which the ladder's reading of a write is asked of (`shapeIn`, `madeByIn`). */
  sql: Sql;
  /** The asker, as the record names a person: who a row another person made is another's to. */
  person: string | null;
};

const TOOLS: readonly SlashTool[] = [
  { name: 'search', args: 'q', about: 'Find anything by its words, in every list' },
  { name: 'lists', args: 'list?', about: 'The lists this record keeps, with their counts. With list: its fields, by the ids add and change take' },
  { name: 'figures', args: 'words', about: 'The figures the record works out (cash, runway, totals, forecast) whose names match, each with its value now' },
  { name: 'list', args: 'list, where?, limit?', about: 'Rows of one list, newest first. where: {"field":"state","is":"open"}' },
  { name: 'open', args: 'id', about: 'One row whole with what it links to, by its id or its name; or one figure by its id, such as cash or runway' },
  { name: 'today', args: '', about: 'What matters now: what is late, what is due, what stopped and what waits on them' },
  { name: 'waiting', args: '', about: 'The questions waiting on them in Decide' },
  { name: 'changes', args: '', about: 'What changed lately, and who changed it' },
  { name: 'people', args: 'name?', about: 'The people they know' },
  { name: 'projects', args: '', about: 'Their projects' },
  { name: 'pages', args: '', about: 'The pages of this BrainDog' },
  { name: 'add', args: 'list, fields', about: 'Add a row to a list, its fields by field id: {"what":"Call the bank","by":"2026-11-02"}', writes: true },
  { name: 'change', args: 'id, fields', about: "Change some fields of one row, by the row's id", writes: true },
  { name: 'person', args: 'name, email?, note?', about: 'Add a person they know', writes: true },
  { name: 'draft', args: 'what, page?', about: 'Draft a new page, a change to a page, or an automation, from what they described, for them to look at in Decide', writes: true },
  { name: 'go', args: 'to', about: 'Take them to a page, a list, a row, or to decide, inbox, automations, settings or agents' },
];

/** The places the app has that are not a list, a row or a page, by the words a person uses for them. */
const PLACES: Readonly<Record<string, { href: string; label: string }>> = {
  decide: { href: '/decide', label: 'Decide' },
  decisions: { href: '/decide', label: 'Decide' },
  inbox: { href: '/inbox', label: 'Inbox' },
  automations: { href: '/automations', label: 'Automations' },
  settings: { href: '/settings', label: 'Settings' },
  agents: { href: '/agents', label: 'Agents' },
  keys: { href: '/keychain', label: 'Keys' },
  keychain: { href: '/keychain', label: 'Keys' },
  usage: { href: '/usage', label: 'Usage' },
  slash: { href: '/slash', label: 'Slash' },
  today: { href: '/', label: 'Today' },
  home: { href: '/', label: 'Today' },
};

/** Each floor as the reason a write waits, the start of a sentence. */
const FLOOR_SAID: Readonly<Record<Floor, string>> = {
  delete: 'It takes something away',
  keys: 'It touches a list that holds keys',
  money: 'It sets a money amount',
  sharing: 'It changes who can see it',
  identity: 'It changes who someone is',
  others: 'Someone else made that row',
  addons: 'It changes an add-on',
  outside: 'It reaches outside the record',
};

const QUALIFIED = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u;
const NOTE_MOST = 200;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const clip = (s: string, most: number): string => (s.length <= most ? s : `${s.slice(0, most - 1)}…`);

type Row = { id: string; register: string; seq: number | null; version: number; fields: Record<string, unknown>; batch?: string };
const isRow = (x: unknown): x is Row => isObject(x) && typeof x.id === 'string' && typeof x.register === 'string' && isObject(x.fields);

/** A row's own name, as far as its fields say one. */
const titleOf = (fields: Record<string, unknown>): string => {
  for (const key of ['name', 'title', 'what', 'summary', 'subject', 'label', 'description']) {
    const v = text(fields[key]);
    if (v !== '') return clip(v, 80);
  }
  return '';
};

/**
 * The lists holding rows that arrived from outside the record: a door, a feed or a project's report key made them. A
 * read of one is text nobody here wrote, which drops the rest of the turn to asking. Read once a turn; a record whose
 * log cannot be read this way reads as having none.
 */
export function slashOutsideLists(sql: Sql): Set<string> {
  try {
    return new Set(
      sql
        .all<{ register: string }>(
          `SELECT DISTINCT x.register AS register FROM event e JOIN entry x ON x.id = substr(e.target, 7)
           WHERE e.kind = 'create' AND e.target LIKE 'entry:%'
           AND ((e.actor >= 'ingest:' AND e.actor < 'ingest;') OR (e.actor >= 'report:' AND e.actor < 'report;'))`,
        )
        .map((r) => r.register),
    );
  } catch {
    return new Set();
  }
}

/**
 * The tools for one conversation turn, over the record as `ctx`. Built per turn: the naming caches inside the agent
 * tools live as long as it does, and the lists from outside are read once for it.
 */
export function slashTools<C>(surface: SlashSurface<C>, ctx: C, deps: SlashToolDeps): SlashChatTools {
  const agent = agentTools(surface);
  let outside: Set<string> | null = null;
  const outsideOf = (lists: readonly string[]): string | null => {
    outside ??= slashOutsideLists(deps.sql);
    const hit = lists.find((l) => outside!.has(l));
    return hit === undefined ? null : `rows that arrived from outside the record (${hit})`;
  };

  let lists: Promise<{ id: string; name: string }[]> | null = null;
  const listsNow = (): Promise<{ id: string; name: string }[]> =>
    (lists ??= surface.boot(ctx).then((b) => (b.ok ? b.value.registers.map((r) => ({ id: r.id, name: r.name })) : [])));
  const listNamed = async (said: string): Promise<{ id: string; name: string } | null> => {
    const want = said.trim().toLowerCase();
    if (want === '') return null;
    const all = await listsNow();
    return all.find((l) => l.id === want) ?? all.find((l) => l.name.toLowerCase() === want) ?? all.find((l) => l.name.toLowerCase().includes(want)) ?? null;
  };
  const nameOfList = async (id: string): Promise<string> => (await listsNow()).find((l) => l.id === id)?.name ?? id;
  const listFor = async (test: (l: { id: string; name: string }) => boolean): Promise<{ id: string; name: string } | null> =>
    (await listsNow()).find(test) ?? null;

  /** A row by its id or its name, as the asker may read it, or `null`. */
  const rowOf = async (id: string): Promise<Row | null> => {
    const said = id.trim();
    if (said === '') return null;
    const got = await surface.get({ spoken: said }, ctx);
    return got.ok && isRow(got.value) ? got.value : null;
  };

  /** What an agent's tool answers, in its words. A refusal is its own sentence, which the model reads and mends. */
  const read = async (name: string, args: Args): Promise<string> => {
    const said = await agent.answer(name, args, ctx);
    return said.text;
  };

  const hrefOfRow = (r: { register: string; seq: number | null }): string | undefined =>
    r.seq === null ? undefined : `/r/${encodeURIComponent(r.register)}/${r.seq}`;
  const spokenOfRow = (r: { register: string; seq: number | null; id: string }): string => (r.seq === null ? r.id : `${r.register}#${r.seq}`);

  /** Fields a list does not declare, said back with the ones it does, or `null`. */
  const strays = (shape: ListShape, fields: Args): string | null => {
    const known = new Set(shape.fields.map((f) => f.id));
    const wrong = Object.keys(fields).filter((k) => !known.has(k));
    return wrong.length === 0 ? null : `${wrong.join(', ')} ${wrong.length === 1 ? 'is not a field' : 'are not fields'} of that list. Its fields: ${[...known].join(', ')}.`;
  };

  /**
   * Whether a write lands now, and if not, why it waits. The ladder's own reading of the write first, since a floor
   * holds whatever else is true; then outside text; then a question that was not asking for anything to be done.
   */
  const waitsFor = (run: SlashToolRun, floor: Floor | null): string | null => {
    if (floor !== null) return `${FLOOR_SAID[floor]}, so it waits for your yes.`;
    if (run.askOnly) return `This turn read ${run.outside ?? 'something from outside the record'}, so it waits for your yes.`;
    if (!run.asked) return 'You asked a question rather than for this, so it waits for your yes.';
    return null;
  };

  const noteOf = (said: string): string => clip(`Asked of Slash: ${said}`, NOTE_MOST);

  /** Make one write the engine kept, or this turn decided to make now. */
  const apply = async (op: Args): Promise<Result<{ receipt: string; undo?: { batch: string }; href?: string }>> => {
    const doing = text(op['do']);
    const note = typeof op['note'] === 'string' ? op['note'] : undefined;
    if (doing === 'add' || doing === 'change') {
      const register = text(op['list']);
      const out =
        doing === 'add'
          ? await surface.create({ register, fields: isObject(op['fields']) ? op['fields'] : {}, ...(note === undefined ? {} : { note }) }, ctx)
          : await surface.update(
              {
                register,
                seq: Number(op['seq']),
                patch: isObject(op['patch']) ? op['patch'] : {},
                ...(typeof op['version'] === 'number' ? { version: op['version'] } : {}),
                ...(note === undefined ? {} : { note }),
              },
              ctx,
            );
      if (!out.ok) return out as Result<never>;
      if (!isRow(out.value)) return { ok: true, value: { receipt: 'Put it on Decide for a yes there.', href: '/decide' } };
      const row = out.value;
      const named = titleOf(row.fields);
      const list = await nameOfList(row.register);
      const href = hrefOfRow(row);
      return {
        ok: true,
        value: {
          receipt: doing === 'add' ? `Added ${named ? `“${named}” ` : ''}to ${list}.` : `Changed ${named ? `“${named}”` : spokenOfRow(row)}.`,
          ...(typeof row.batch === 'string' && row.batch !== '' ? { undo: { batch: row.batch } } : {}),
          ...(href === undefined ? {} : { href }),
        },
      };
    }
    if (doing === 'draft') {
      if (!surface.slashPropose) return { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Drafting pages is not answered by this record yet.' } };
      const page = text(op['page']);
      const out = await surface.slashPropose({ asked: text(op['what']), ...(page === '' ? {} : { page }) }, ctx);
      if (!out.ok) return out as Result<never>;
      const filed = isObject(out.value) && Array.isArray(out.value.filed) ? out.value.filed.filter(isObject) : [];
      const first = filed[0];
      if (first === undefined) {
        const why = isObject(out.value) && Array.isArray(out.value.dropped) ? out.value.dropped.filter((d): d is string => typeof d === 'string') : [];
        return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: why[0] ?? 'Nothing came of that draft. Try describing it another way.', at: 'what' } };
      }
      const question = text(first['question']);
      return { ok: true, value: { receipt: `Drafted “${clip(question, 100)}”. It waits for you in Decide.`, href: `/decide/${encodeURIComponent(text(first['id']))}` } };
    }
    return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'There is nothing to do for that.' } };
  };

  /** A write decided: made now with its receipt, or held with its reason. Either way the words the model reads next. */
  const decided = async (title: string, op: Args, wait: string | null): Promise<SlashToolRan> => {
    if (wait !== null)
      return {
        text: `Held for their yes: ${title}. ${wait} Tell them it is waiting for them.`,
        action: { kind: 'ask', title, detail: wait, op },
      };
    const out = await apply(op);
    if (!out.ok) return { text: `That was refused: ${fixOf(out) || codeOf(out)}` };
    return {
      text: `Done: ${out.value.receipt}${out.value.href === undefined ? '' : ` Its link is ${out.value.href}.`} They can undo it.`,
      action: {
        kind: 'done',
        title: out.value.receipt.replace(/\.$/u, ''),
        ...(out.value.undo === undefined ? {} : { undo: out.value.undo }),
        ...(out.value.href === undefined ? {} : { href: out.value.href }),
      },
    };
  };

  /** A new row in `list`, read as the ladder reads it. */
  const adding = async (listSaid: string, fields: Args, run: SlashToolRun): Promise<SlashToolRan> => {
    const list = await listNamed(listSaid);
    const shape = list === null ? null : shapeIn(deps.sql, list.id);
    if (list === null || shape === null) return { text: `There is no list called ${listSaid || 'that'}. Call lists() to see them.` };
    const stray = strays(shape, fields);
    if (stray !== null) return { text: stray };
    const kinds = kindsOfWrite({ list: list.id, op: 'create', patch: fields, shape, person: deps.person });
    const floor = kinds.find((k) => k.floor !== null)?.floor ?? null;
    const named = titleOf(fields);
    const title = `Add ${named ? `“${named}” ` : 'a row '}to ${list.name}`;
    return { ...(await decided(title, { do: 'add', list: list.id, fields, note: noteOf(run.said) }, waitsFor(run, floor))), step: `Adding to ${list.name}` };
  };

  const call = async (name: string, args: Args, run: SlashToolRun): Promise<SlashToolRan> => {
    switch (name) {
      case 'search': {
        const q = text(args['q']);
        const found = await agent.answer('search', { q, limit: 12 }, ctx);
        const hits = found.result.ok && isObject(found.result.value) && Array.isArray(found.result.value.rows) ? found.result.value.rows : [];
        const registers = hits.flatMap((h) => (isObject(h) && typeof h.register === 'string' ? [h.register] : []));
        return { text: found.text, outside: outsideOf(registers), step: `Searching for “${clip(q, 40)}”` };
      }
      case 'lists': {
        const list = text(args['list']);
        const one = list === '' ? null : await listNamed(list);
        return { text: await read('record_index', one === null ? {} : { register: one.id }), step: one === null ? 'Looking at what is kept' : `Reading the fields of ${one.name}` };
      }
      case 'list': {
        const one = await listNamed(text(args['list'] ?? args['register']));
        if (one === null) return { text: `There is no list called ${text(args['list']) || 'that'}. Call lists() to see them.` };
        const limit = typeof args['limit'] === 'number' ? Math.min(Math.max(1, Math.floor(args['limit'])), 30) : 20;
        return {
          text: await read('list', { register: one.id, limit, ...(isObject(args['where']) ? { where: args['where'] } : {}) }),
          outside: outsideOf([one.id]),
          step: `Reading ${one.name}`,
        };
      }
      case 'open': {
        const id = text(args['id'] ?? args['spoken']);
        const row = await rowOf(id);
        return {
          text: await read('get', { spoken: id }),
          ...(row === null ? {} : { outside: outsideOf([row.register]) }),
          step: `Opening ${row === null ? clip(id, 40) : titleOf(row.fields) || id}`,
        };
      }
      case 'figures': {
        if (!surface.figures) return { text: 'This record does not list its figures here. lists() names the lists instead.' };
        const all = await surface.figures(ctx);
        if (!all.ok) return { text: fixOf(all) };
        const words = text(args['words'] ?? args['q']).toLowerCase().split(/[^a-z0-9]+/u).filter((w) => w.length > 1);
        const scored = all.value
          .filter((f) => f.param !== true)
          .map((f) => {
            const said = `${f.id} ${f.name ?? ''}`.toLowerCase();
            return { f, score: words.length === 0 ? 1 : words.filter((w) => said.includes(w)).length };
          })
          .filter((x) => x.score > 0)
          .sort((a, z) => z.score - a.score)
          .slice(0, 12);
        if (scored.length === 0) return { text: `No figure is named like ${words.join(' ') || 'that'}. Try other words, or search.` };
        /* THE BEST FEW ARE READ NOW, so a question about cash is answered in one call and not two. */
        const lines: string[] = [];
        for (const [i, { f }] of scored.entries()) {
          if (i < 4) {
            const read = await agent.answer('get', { spoken: f.id }, ctx);
            lines.push(read.result.ok ? read.text.split('\n')[0] ?? `${f.name ?? f.id} (${f.id})` : `${f.name ?? f.id} (${f.id})`);
          } else lines.push(`${f.name ?? f.id} (${f.id}): open it to read`);
        }
        return { text: lines.join('\n'), step: 'Working out the figures' };
      }
      case 'today': {
        const out = await agent.read('braindog:briefing', ctx);
        const cards = out.ok && isObject(out.value) && Array.isArray(out.value.cards) ? out.value.cards.filter(isObject) : [];
        const lines = cards.map((c) => `- ${text(c['line'])}${typeof c['row'] === 'string' && c['row'] !== '' ? ` (${c['row']})` : ''}`);
        return { text: !out.ok ? fixOf(out) : lines.length === 0 ? 'Nothing is late, due or waiting today.' : lines.join('\n'), step: 'Looking at today' };
      }
      case 'waiting':
        return { text: await read('governance', { register: 'suggestion', status: 'open', limit: 15 }), step: 'Checking what waits on you' };
      case 'changes':
        return { text: await read('activity', { limit: 15 }), step: 'Reading what changed' };
      case 'people': {
        const people = await listFor((l) => l.id === 'people' || /\bpeople\b|contacts/iu.test(l.name));
        if (people === null) return { text: 'This record keeps no list of people.' };
        const who = text(args['name']);
        return {
          text: who === '' ? await read('list', { register: people.id, limit: 30 }) : await read('search', { q: who, limit: 10 }),
          outside: outsideOf([people.id]),
          step: `Reading ${people.name}`,
        };
      }
      case 'projects': {
        const projects = await listFor((l) => l.id === 'projects' || l.id === 'things' || /project/iu.test(l.name));
        if (projects === null) return { text: 'This record keeps no list of projects.' };
        return { text: await read('list', { register: projects.id, limit: 30 }), step: `Reading ${projects.name}` };
      }
      case 'pages': {
        const pages = await surface.pages(ctx);
        if (!pages.ok) return { text: fixOf(pages) };
        return { text: pages.value.map((p) => `- ${p.title} (${p.slug})`).join('\n') || 'This BrainDog has no pages of its own yet.', step: 'Looking at the pages' };
      }
      case 'add':
        return adding(text(args['list'] ?? args['register']), isObject(args['fields']) ? args['fields'] : {}, run);
      case 'person': {
        const people = await listFor((l) => l.id === 'people' || /\bpeople\b|contacts/iu.test(l.name));
        if (people === null) return { text: 'This record keeps no list of people.' };
        const shape = shapeIn(deps.sql, people.id);
        const has = (id: string): boolean => shape?.fields.some((f) => f.id === id) ?? false;
        const fields: Args = {};
        const name = text(args['name']);
        if (name === '') return { text: 'person needs a name.' };
        fields[has('name') ? 'name' : (shape?.fields.find((f) => f.type === 'text')?.id ?? 'name')] = name;
        if (text(args['email']) !== '' && has('email')) fields['email'] = text(args['email']);
        const note = text(args['note']);
        if (note !== '') for (const f of ['notes', 'note', 'about']) if (has(f)) {
          fields[f] = note;
          break;
        }
        return adding(people.id, fields, run);
      }
      case 'change': {
        const id = text(args['id'] ?? args['spoken']);
        const row = await rowOf(id);
        if (row === null) return { text: `Nothing you can read is called ${id || 'that'}. search finds it by its words.` };
        if (row.seq === null) return { text: `${id} is not a row that can be changed here.` };
        const patch = isObject(args['fields']) ? args['fields'] : isObject(args['patch']) ? args['patch'] : {};
        if (Object.keys(patch).length === 0) return { text: 'change needs fields: the field ids and their new values.' };
        const shape = shapeIn(deps.sql, row.register);
        if (shape === null) return { text: `${id} is in a list this record no longer keeps.` };
        const stray = strays(shape, patch);
        if (stray !== null) return { text: stray };
        const kinds = kindsOfWrite({ list: row.register, op: 'update', patch, shape, madeBy: madeByIn(deps.sql, row.id), person: deps.person, was: row.fields });
        const floor = kinds.find((k) => k.floor !== null)?.floor ?? null;
        const named = titleOf(row.fields) || spokenOfRow(row);
        /* EACH FIELD BY THE LABEL ITS LIST GIVES IT, "Due" and not `by`, where the declaration has one. */
        const fields = Object.keys(patch)
          .map((id) => {
            const named = (shape.fields.find((f) => f.id === id) as { label?: unknown } | undefined)?.label;
            return typeof named === 'string' && named.trim() !== '' ? named.trim().toLowerCase() : id;
          })
          .join(', ');
        const title = `Change ${fields} on “${named}”`;
        const op = { do: 'change', list: row.register, seq: row.seq, patch, version: row.version, note: noteOf(run.said) };
        return { ...(await decided(title, op, waitsFor(run, floor))), step: `Changing “${clip(named, 40)}”` };
      }
      case 'draft': {
        const what = text(args['what']);
        if (what === '') return { text: 'draft needs what: what they want, in their words.' };
        const page = text(args['page']);
        const op = { do: 'draft', what, ...(page === '' ? {} : { page }) };
        /* A DRAFT CHANGES NOTHING UNTIL IT IS ACCEPTED ON DECIDE, so the only reasons it waits are a turn that read
           outside text and a question that did not ask for it. */
        return { ...(await decided(`Draft “${clip(what, 80)}”`, op, waitsFor(run, null))), step: 'Drafting it' };
      }
      case 'go': {
        const to = text(args['to']);
        const place = PLACES[to.toLowerCase()];
        if (place !== undefined) return { text: `Opened ${place.label}.`, navigate: place, step: `Opening ${place.label}` };
        const row = QUALIFIED.test(to) || /^[A-Z]{1,4}[1-9][0-9]*$/u.test(to) ? await rowOf(to) : null;
        if (row !== null && row.seq !== null) {
          const label = titleOf(row.fields) || to;
          return { text: `Opened ${label}.`, navigate: { href: hrefOfRow(row)!, label }, step: `Opening ${label}` };
        }
        const pages = await surface.pages(ctx);
        const want = to.toLowerCase();
        const page = pages.ok ? (pages.value.find((p) => p.slug === want) ?? pages.value.find((p) => p.title.toLowerCase() === want) ?? pages.value.find((p) => p.title.toLowerCase().includes(want))) : undefined;
        if (page !== undefined) return { text: `Opened ${page.title}.`, navigate: { href: `/p/${encodeURIComponent(page.slug)}`, label: page.title }, step: `Opening ${page.title}` };
        const list = await listNamed(to);
        if (list !== null) return { text: `Opened ${list.name}.`, navigate: { href: `/r/${encodeURIComponent(list.id)}`, label: list.name }, step: `Opening ${list.name}` };
        return { text: `Nothing is called ${to || 'that'}. pages() and lists() say what there is.` };
      }
      default:
        return { text: `There is no tool called ${name}.` };
    }
  };

  const ref = async (id: string): Promise<{ ref: string; label: string } | null> => {
    const row = await rowOf(id);
    return row === null || row.seq === null ? null : { ref: `${row.register}#${row.seq}`, label: titleOf(row.fields) };
  };

  /**
   * What matters now, from the record's own briefing and with no model: its first three cards, each linked where the
   * card names a row, or else how many questions wait.
   */
  const now = async (): Promise<{ text: string; href?: string }[]> => {
    const out = await agent.read('braindog:briefing', ctx);
    const cards = out.ok && isObject(out.value) && Array.isArray(out.value.cards) ? out.value.cards.filter(isObject) : [];
    const lines: { text: string; href?: string }[] = [];
    for (const c of cards) {
      const line = text(c['line']);
      if (line === '') continue;
      const row = text(c['row']);
      const at = QUALIFIED.exec(row);
      const href = at ? `/r/${encodeURIComponent(at[1]!)}/${at[2]}` : /^SG[1-9]/u.test(row) || row.startsWith('suggestion') ? '/decide' : undefined;
      lines.push({ text: line, ...(href === undefined ? {} : { href }) });
      if (lines.length === 3) break;
    }
    if (lines.length > 0) return lines;
    const boot = await surface.boot(ctx);
    const said = boot.ok ? (boot.value as { waiting?: unknown }).waiting : undefined;
    const waiting = Array.isArray(said) ? said.length : 0;
    return waiting > 0 ? [{ text: waiting === 1 ? 'One question waits for you.' : `${waiting} questions wait for you.`, href: '/decide' }] : [];
  };

  return { list: TOOLS, call, apply, ref, now };
}
