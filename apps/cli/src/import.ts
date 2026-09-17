/**
 * `braindog import legacy <export.json>`: move a the old tool record into this BrainDog (`loop/research-switch.md` §4).
 *
 * IT WRITES AS ANY AGENT DOES, over the API, with the token this machine signed in with: `create` and `update` for rows
 * and `propose` for an open question. So it works the same on a self-host and on app.brain.dog, and it can do nothing a
 * signed-in agent could not. Installing Solo founder and Agents is the owner's, in the app; a record without their lists
 * is told which to install, and nothing is written.
 *
 * RE-RUNNING UPDATES, IT NEVER ADDS A SECOND ROW. Every row carries its the old tool key in its tags (an agent run in its
 * `client_id`, a question in its body), each list is read once before writing, and a row found by its key is updated
 * only in the fields that differ. A question already asked is never asked again, answered or not.
 *
 * IT SAYS WHAT IT DID. Added, updated and unchanged by list, each row that changes with the fields that change, the
 * questions asked, everything left out with its reason, and every row the record refused with the record's own sentence.
 * `--dry-run` reads and reports and writes nothing.
 *
 * THE OWNER'S SETUP COMES BESIDE THE EXPORT (`--setup`): the organisations he runs and the numbers to poll, which the old tool
 * never kept. Organisations are rows like any other; a poll is filed on Decide as a pack to install, because it sends
 * requests to another server and only the owner approves that. `--draft-setup` prints a first one from the export.
 */

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { refused, type Result } from '@braindog/ports';

import { budgetOf, hostsPath, target, type Target } from './http.ts';
import { pollPack } from '@braindog/seed/usecases/founder-poll';

import { KEY_PREFIX, ORDER, draftSetup, holdsKey, PROVIDED_BY, isRef, planLegacyTool, readLegacyTool, readSetup, type Plan, type PlannedRow, type Setup } from './legacy.ts';
import type { AgentIo } from './skills.ts';

import { createClient } from '@braindog/client';

const USAGE = 'braindog import takes legacy <export.json> [--setup <setup.json>] [--host <host>] [--dry-run], or legacy <export.json> --draft-setup.';

/** The largest export this reads: the old tool's is about 108 KB of document and an audit of up to 100,000 lines. */
export const IMPORT_MOST_BYTES = 64 * 1024 * 1024;

type Row = { id: string; seq: number | null; version: number; fields: Record<string, unknown> };

/** The part of the client an import uses, so a test can hand it a record of its own. */
export type Door = {
  schema: (register: string) => Promise<Result<unknown>>;
  list: (args: { register: string; limit?: number; cursor?: string | null }) => Promise<Result<{ rows: unknown[]; cursor: string | null }>>;
  create: (args: { register: string; fields: Record<string, unknown>; note?: string }) => Promise<Result<unknown>>;
  update: (args: { register: string; seq: number; patch: Record<string, unknown>; version?: number; note?: string }) => Promise<Result<unknown>>;
  governance: (args: { register?: string; status?: string; limit?: number }) => Promise<Result<unknown>>;
  propose: (args: { question: string; body_kind: 'options' | 'pack'; body: Record<string, unknown> }) => Promise<Result<unknown>>;
};

export type Tally = { added: number; updated: number; unchanged: number };

export type Report = {
  missing: string[];
  tally: Record<string, Tally>;
  asked: number;
  alreadyAsked: number;
  /** Polls filed on Decide, and those already filed or installed. */
  polls: { filed: number; before: number };
  /** Each row that changes, with the fields that change. */
  changes: { register: string; label: string; fields: string[] }[];
  refused: { label: string; register: string; fix: string }[];
  plan: Plan;
};

/** The words a report names a list by. */
const NAMES: Readonly<Record<string, string>> = {
  things: 'Projects',
  people: 'People',
  tracks: 'Threads',
  tasks: 'Tasks',
  datapoints: 'Datapoints',
  learnings: 'Learnings',
  skills: 'Skills',
  tools: 'Tools',
  credentials: 'Keys (the index only)',
  accounts: 'Accounts',
  obligations: 'Money in and out',
  organisations: 'Organisations',
  session: 'Agent runs',
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fixOf = (r: Result<unknown>): string => (refused(r) ? `${r.refusal.fix} (${r.refusal.code})` : 'Somebody else changed it at the same moment. Run the import again.');
const unreachable = (r: Result<unknown>) => refused(r) && r.refusal.code === 'UNREACHABLE';

/** JSON with its keys in order, so two values that mean the same compare the same. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** The key a row was imported under: in its tags, or in `client_id` for an agent run. */
const keyOf = (register: string, fields: Record<string, unknown>): string | null => {
  if (register === 'session') return typeof fields.client_id === 'string' && fields.client_id.startsWith(KEY_PREFIX) ? fields.client_id : null;
  const tags = Array.isArray(fields.tags) ? fields.tags : [];
  return (tags.find((t) => typeof t === 'string' && t.startsWith(KEY_PREFIX)) as string | undefined) ?? null;
};

class Unreachable extends Error {}

/** Every row of one list, page by page. */
async function readAll(door: Door, register: string): Promise<Row[]> {
  const out: Row[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 1000; pages++) {
    const got = await door.list({ register, limit: 500, ...(cursor === null ? {} : { cursor }) });
    if (!got.ok) {
      if (unreachable(got)) throw new Unreachable();
      break;
    }
    for (const r of got.value.rows) if (isObj(r) && typeof r.id === 'string' && isObj(r.fields)) out.push(r as unknown as Row);
    cursor = got.value.cursor;
    if (cursor === null) break;
  }
  return out;
}

/**
 * Apply a plan through a door. Refs are resolved to the id of the row they name once it is written; a ref to a row in
 * the same list written later is set in a second pass.
 */
export async function applyPlan(plan: Plan, door: Door, o: { dryRun: boolean }): Promise<Report> {
  const report: Report = { missing: [], tally: {}, asked: 0, alreadyAsked: 0, polls: { filed: 0, before: 0 }, changes: [], refused: [], plan };
  const registers = ORDER.filter((r) => plan.rows.some((row) => row.register === r));

  for (const register of registers) {
    const has = await door.schema(register);
    if (!has.ok) {
      if (unreachable(has)) throw new Unreachable();
      report.missing.push(register);
    }
  }
  if (report.missing.length > 0) return report;

  const ids = new Map<string, string>();
  const existing = new Map<string, Row>();
  for (const register of registers)
    for (const row of await readAll(door, register)) {
      const key = keyOf(register, row.fields);
      if (key) {
        existing.set(key, row);
        ids.set(key, row.id);
      }
    }

  const later: { row: PlannedRow; field: string; value: unknown }[] = [];
  /** A planned value with its refs put as ids, or `undefined` when one names a row that is not written yet. */
  const resolveValue = (v: unknown): unknown => {
    if (isRef(v)) return ids.get(v.$ref);
    if (Array.isArray(v) && v.some(isRef)) {
      const got = v.map((x) => (isRef(x) ? ids.get(x.$ref) : x));
      return got.some((x) => x === undefined) ? undefined : got;
    }
    return v;
  };
  const planned = new Set(plan.rows.map((r) => r.key));

  for (const row of plan.rows) {
    const tally = (report.tally[row.register] ??= { added: 0, updated: 0, unchanged: 0 });
    const fields: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(row.fields)) {
      const put = resolveValue(value);
      if (put !== undefined) fields[field] = put;
      /* A ref to a row planned in this run and not written yet waits for the second pass; one to a row left out is dropped. */ else if ([value].flat().some((x) => isRef(x) && planned.has(x.$ref))) later.push({ row, field, value });
    }
    const found = existing.get(row.key);
    if (holdsKey(fields)) {
      report.refused.push({ label: row.label, register: row.register, fix: 'A field looked like a key itself, so the row was not sent.' });
      continue;
    }

    if (!found) {
      const create = row.register === 'session' ? fields : { ...fields, tags: [row.key] };
      if (o.dryRun) {
        tally.added++;
        ids.set(row.key, `(new ${row.key})`);
        continue;
      }
      const made = await door.create({ register: row.register, fields: create, note: 'Imported from the old tool.' });
      if (!made.ok) {
        if (unreachable(made)) throw new Unreachable();
        report.refused.push({ label: row.label, register: row.register, fix: fixOf(made) });
        continue;
      }
      const value = made.value as Row;
      ids.set(row.key, value.id);
      existing.set(row.key, value);
      tally.added++;
      continue;
    }

    const patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(fields)) if (stable(found.fields[field]) !== stable(value)) patch[field] = value;
    if (Object.keys(patch).length === 0) {
      tally.unchanged++;
      continue;
    }
    report.changes.push({ register: row.register, label: row.label, fields: Object.keys(patch) });
    if (o.dryRun) {
      tally.updated++;
      continue;
    }
    const done = await door.update({ register: row.register, seq: found.seq as number, patch, version: found.version, note: 'Imported again from the old tool.' });
    if (!done.ok) {
      if (unreachable(done)) throw new Unreachable();
      report.refused.push({ label: row.label, register: row.register, fix: fixOf(done) });
      continue;
    }
    existing.set(row.key, done.value as Row);
    tally.updated++;
  }

  /* THE SECOND PASS: a learning that replaces one written after it. Counted as part of the row already counted. */
  for (const { row, field, value } of later) {
    const put = resolveValue(value);
    const at = existing.get(row.key);
    if (put === undefined || !at || o.dryRun || stable(at.fields[field]) === stable(put)) continue;
    const done = await door.update({ register: row.register, seq: at.seq as number, patch: { [field]: put }, version: at.version, note: 'Imported from the old tool.' });
    if (done.ok) existing.set(row.key, done.value as Row);
    else if (unreachable(done)) throw new Unreachable();
    else report.refused.push({ label: row.label, register: row.register, fix: fixOf(done) });
  }

  const asked = new Set<string>();
  const installs = new Set<string>();
  if (plan.asks.length > 0 || plan.polls.length > 0) {
    const got = await door.governance({ register: 'suggestion', status: 'all', limit: 200 });
    if (!got.ok && unreachable(got)) throw new Unreachable();
    if (got.ok && Array.isArray(got.value))
      for (const s of got.value)
        if (isObj(s) && isObj(s.body)) {
          if (typeof s.body.from === 'string') asked.add(s.body.from);
          if (typeof s.body.install === 'string') installs.add(s.body.install);
        }
  }
  if (plan.asks.length > 0) {
    for (const ask of plan.asks) {
      if (asked.has(ask.key)) {
        report.alreadyAsked++;
        continue;
      }
      if (o.dryRun) {
        report.asked++;
        continue;
      }
      const done = await door.propose({ question: ask.question, body_kind: 'options', body: ask.body });
      if (!done.ok) {
        if (unreachable(done)) throw new Unreachable();
        report.refused.push({ label: ask.label, register: 'Decide', fix: fixOf(done) });
        continue;
      }
      report.asked++;
    }
  }

  /* A POLL IS A PACK TO INSTALL, filed once. Its project and organisation are the rows this import wrote or found. */
  for (const poll of plan.polls) {
    const pack = `poll-${poll.id}`;
    if (installs.has(pack)) {
      report.polls.before++;
      continue;
    }
    if (o.dryRun) {
      report.polls.filed++;
      continue;
    }
    const project = poll.project ? ids.get(poll.project) : undefined;
    const organisation = poll.organisation ? ids.get(poll.organisation) : undefined;
    const doc = pollPack({
      id: poll.id,
      url: poll.url,
      every: poll.every,
      ...(poll.grant ? { grant: poll.grant } : {}),
      ...(project ? { project } : {}),
      ...(organisation ? { organisation } : {}),
      measures: poll.measures,
    });
    const done = await door.propose({ question: `Poll ${hostOf(poll.url)} every ${poll.every} for ${and(poll.measures.map((m) => m.name))}?`, body_kind: 'pack', body: { install: pack, doc } });
    if (!done.ok) {
      if (unreachable(done)) throw new Unreachable();
      /* ALREADY INSTALLED, AND NOTHING NEWER: the record says so, and that is a poll filed before. */
      if (refused(done) && done.refusal.code === 'TRANSITION_ILLEGAL') report.polls.before++;
      else report.refused.push({ label: poll.label, register: 'Decide', fix: fixOf(done) });
      continue;
    }
    report.polls.filed++;
  }
  return report;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** A list said the way a sentence says it: `a, b and c`. */
const and = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${String(items.at(-1))}`);
const few = (items: string[], most = 8) => (items.length <= most ? items.join(', ') : `${items.slice(0, most).join(', ')} and ${String(items.length - most)} more`);

/** The report as the lines a person reads. */
export function said(report: Report, o: { dryRun: boolean; file: string }): string[] {
  const { plan } = report;
  const lines: string[] = [];
  const when = plan.taken ? `, exported ${plan.taken.slice(0, 10)}` : '';
  lines.push(`${o.dryRun || report.missing.length > 0 ? 'Read, and wrote nothing' : 'Imported'}: ${o.file}${when}.`);
  if (report.missing.length > 0) {
    const need = [...new Set(report.missing.map((r) => PROVIDED_BY[r] ?? r))];
    lines.push(`This BrainDog has no ${and(report.missing.map((r) => NAMES[r] ?? r))} lists, so nothing was written. Install ${and(need)} on this BrainDog first, then run the import again.`);
    return lines;
  }
  const verb = o.dryRun ? 'would be ' : '';
  for (const register of ORDER) {
    const t = report.tally[register];
    if (!t) continue;
    lines.push(`${NAMES[register] ?? register}: ${String(t.added)} ${verb}added, ${String(t.updated)} ${verb}updated, ${String(t.unchanged)} unchanged.`);
  }
  if (plan.asks.length > 0) lines.push(`Decide: ${String(report.asked)} ${o.dryRun ? 'would be asked' : 'asked'}, ${String(report.alreadyAsked)} asked before.`);
  if (plan.polls.length > 0)
    lines.push(`Polls: ${String(report.polls.filed)} ${o.dryRun ? 'would be filed' : 'filed'} on Decide for you to approve, ${String(report.polls.before)} filed before.`);
  if (report.changes.length > 0) {
    lines.push('', o.dryRun ? 'What would change:' : 'What changed:');
    const most = 40;
    for (const c of report.changes.slice(0, most)) lines.push(`- ${NAMES[c.register] ?? c.register}, ${c.label}: ${c.fields.join(', ')}.`);
    if (report.changes.length > most) lines.push(`- and ${String(report.changes.length - most)} more.`);
  }
  if (report.refused.length > 0) {
    lines.push('', 'Refused by the record:');
    for (const r of report.refused) lines.push(`- ${r.label} (${NAMES[r.register] ?? r.register}): ${r.fix}`);
  }
  if (plan.changed.length > 0) {
    lines.push('', 'Carried with a change:');
    for (const c of plan.changed) lines.push(`- ${c}`);
  }
  if (plan.skipped.length > 0) {
    lines.push('', 'Left out, and why:');
    for (const s of plan.skipped) lines.push(`- ${s.reason}: ${few(s.items)}.`);
  }
  lines.push('', 'No key value was read or sent. Keys are indexed by what they open; move a value with braindog keys put.');
  return lines;
}

/** `braindog import legacy <file>`, and the exit code: 0 done, 1 refused or partly refused, 3 the host did not answer. */
export async function importCommand(args: string[], io: AgentIo, today: string = new Date().toISOString().slice(0, 10)): Promise<number> {
  let values: { host?: string | undefined; 'dry-run'?: boolean | undefined; setup?: string | undefined; 'draft-setup'?: boolean | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { host: { type: 'string' }, 'dry-run': { type: 'boolean' }, setup: { type: 'string' }, 'draft-setup': { type: 'boolean' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const [source, file, ...more] = positionals;
  if (source !== 'legacy' || !file || more.length > 0) {
    io.say(USAGE);
    return 1;
  }
  const path = resolve(io.cwd, file);
  let text: string;
  try {
    if (statSync(path).size > IMPORT_MOST_BYTES) {
      io.say(`${file} is larger than an export this command reads.`);
      return 1;
    }
    text = readFileSync(path, 'utf8');
  } catch {
    io.say(`${file} could not be read.`);
    return 1;
  }
  const read = readLegacyTool(text);
  if (!read.ok) {
    io.say(read.fix);
    return 1;
  }
  if (values['draft-setup'] === true) {
    io.out(JSON.stringify(draftSetup(read.value), null, 2));
    return 0;
  }
  let setup: Setup | undefined;
  if (values.setup !== undefined) {
    let setupText: string;
    try {
      setupText = readFileSync(resolve(io.cwd, values.setup), 'utf8');
    } catch {
      io.say(`${values.setup} could not be read.`);
      return 1;
    }
    const got = readSetup(setupText);
    if (!got.ok) {
      io.say(got.fix);
      return 1;
    }
    setup = got.value;
  }
  const plan = planLegacyTool(read.value, today, setup);

  let to: Target;
  try {
    to = target(values.host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  const headers = await io.headers(to.key);
  const ms = budgetOf(io.env);
  /* ONE DEADLINE A REQUEST, not one for the run: an import is hundreds of requests, and each is as quick as any other. */
  const client = createClient({
    base: to.base,
    ...(to.token ? { token: to.token } : {}),
    fetch: async (input, init) => {
      const sent = new Headers(init?.headers);
      for (const [name, value] of Object.entries(headers)) sent.set(name, value);
      return fetch(input, { ...init, headers: sent, signal: AbortSignal.timeout(ms), redirect: 'error' });
    },
  });
  const door: Door = {
    schema: (register) => client.schema(register),
    list: (a) => client.list(a),
    create: (a) => client.create(a),
    update: (a) => client.update(a),
    governance: (a) => client.governance(a),
    propose: (a) => client.call('propose', a),
  };
  let report: Report;
  try {
    report = await applyPlan(plan, door, { dryRun: values['dry-run'] === true });
  } catch (e) {
    if (e instanceof Unreachable) {
      io.say(`${to.key} stopped answering part way. Run the import again: rows already written are found and not added twice.`);
      return 3;
    }
    throw e;
  }
  for (const line of said(report, { dryRun: values['dry-run'] === true, file })) io.out(line);
  return report.missing.length > 0 || report.refused.length > 0 ? 1 : 0;
}
