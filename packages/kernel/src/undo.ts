/**
 * Undo on the server: put back what one write, one decision or one agent's run changed, read from the log.
 *
 * WHY IT IS HERE AND NOT ON THE SCREEN. The screen's Undo builds the inverse of what it just sent and offers it for six
 * seconds (`web/lib/data/optimistic.ts`), which covers a press and nothing else: an agent's run, a rule's cascade or a
 * decision accepted yesterday had no way back but by hand. The log already holds what an undo needs (`index.ts`'s
 * `writing`): one event per changed field with `from` and `to`, a `create` carrying the whole row, a `batch` shared by
 * everything one write caused, and every write signed by whoever made it, `S42` for a run. An agent that acts
 * on its own must be "always undoable", and this is what makes that true.
 *
 * WHAT EACH LINE OF THE LOG BECOMES, walked per row:
 *   - a `create` becomes a delete, unless somebody outside the undo has changed the row since
 *   - an `edit` or a `state` move goes back to its `from`, but only while the row still holds its `to`. A value somebody
 *     changed since is theirs now, and the plan says who and leaves it
 *   - `tag` and `untag` swap, element by element
 *   - a `delete` becomes a restore, and a `restore` a delete again
 *   - a `note` stays: it is something somebody said, and saying it is not undone
 *   - a value the log withheld (`--redacted--`, every money amount and key) or lost (`--erased--`) cannot be put back,
 *     and the plan says so rather than guessing
 *   - a message the undone writes queued and that has not gone yet is stopped; one already gone is named as gone.
 *
 * AND A DECLARATION AN ACCEPTED CHANGE REPLACED GOES BACK TOO (batch 62). The table keeps every version, and nothing
 * walked it: a decision that reworded a page or renamed a list had a plan with no step in it, which is why such a
 * question was weighed hard to undo. The plan now holds one step for it, `declare`, and the undo installs the earlier
 * version's body again AS A NEW VERSION, never by clearing `superseded_at`: history is appended to, so the table
 * reads before, changed, and before again. It is left, with a sentence, when the earlier version cannot stand any
 * more: somebody changed it again on top, it was taken out, the earlier body was erased, a list it reads is gone, or
 * the list has a field since that the earlier version lacks and that holds answers now.
 * Installing hashes, which is asynchronous, and the undo is one synchronous transaction, so it is two calls:
 * `undoStaged` checks and hashes what would go back, and `undoApply` handed its answer writes it with the rest.
 *
 * AND A VISUAL GOES BACK TO THE VERSION IT STOOD AT. A visual is lines in the log (`visual.ts`), so the undo appends one
 * line saying the version before, or that it is taken away, and never removes a line: a version stays in its history.
 * AN ATTACHED FILE THE SAME WAY (`attachment.ts`): a file attached goes off again, a file taken off comes back at the
 * version it stood at, and a rename takes its old name back, each one line on it, its bytes never touched.
 *
 * TWO STEPS AND A HASH, so a person sees what will happen before it does. `undoPlan` reads and writes nothing and
 * answers plain lines in names, never ids, with a hash of exactly what it would do. `undoApply` works the plan out
 * again inside one transaction and refuses when its hash is not the one the person saw (`PLAN_STALE`): something moved
 * in between, and what they agreed to is no longer what would happen. Each write is also compare-and-set on the
 * version the plan read, so nothing slips between the check and the write.
 *
 * ONE NEW BATCH FOR THE WHOLE UNDO, so an undo is itself one change and can be undone the same way. Its writes run with
 * the rules off, as `undoMerge`'s do: putting something back does not start the things the original write started.
 *
 * AND THE LADDER IS TOLD. Every batch put back gets a line in `undone` (migration 25): who made it, the agent the ladder
 * knows them as, and the kinds it was, so "none undone" can be read and an undone kind drops back to Ask. A run's own
 * row and a decision each get one note saying what was put back, so their history reads it.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { BACKFILL_ACTOR } from './backfill.ts';
import { agentOf, kindOfEvent, shapeIn } from './change-kind.ts';
import type { Json } from './coerce.ts';
import { jcs, type Declaration } from './declare.ts';
import { COVERED, ONE_AT_A_TIME, askAgainLetGo } from './govern.ts';
import type { Patch } from './index.ts';
import { keyedLists, mergeFieldOf } from './entities.ts';
import type { RoleList } from './roles.ts';
import type { KernelParts } from './parts.ts';
import { reopenedTail } from './ingest.ts';
import { SESSION, SESSION_PREFIX } from './session.ts';
import { SLASH, slashMayWrite } from './slash.ts';
import { attempt } from './tx.ts';
import { VISUAL_FIELD, isVersion, visualLines, visualSaid, visualState, type VisualLine } from './visual.ts';
import { ATTACHED_FIELD, attachedLines, attachedSaid, attachedState, isAttachedVersion, type AttachedLine } from './attachment.ts';

/* ── what is asked and what is answered ──────────────────────────────────── */

/**
 * What to undo: one write and everything it caused (`batch`), what one decision wrote (`decision`, `D12`), or
 * everything one agent's run wrote and the rule cascades it started (`run`, `S42`).
 *
 * `row` NARROWS ANY OF THE THREE TO ONE ROW, by its list and number: "Only this one" on a step of the plan. The plan
 * then puts back what the scope did to that row and nothing else, leaves the question a decision answered decided, and
 * stops only a message that row queued. Its hash is that row's alone, so a hash from the whole plan is refused.
 */
export type UndoScope = ({ batch: string } | { decision: string } | { run: string }) & { row?: UndoRow };

/** One row by its list and number, as a person's screen holds it: `tasks` and 3, never an id. */
export type UndoRow = { register: string; seq: number };

/** What one step does, as a word a screen can pick an icon by. */
export type UndoDo = 'remove' | 'restore' | 'delete' | 'set' | 'untag' | 'tag' | 'stop' | 'declare';

/**
 * One thing the undo puts back, in names.
 *
 * `row` IS A HANDLE, NEVER SHOWN: the row's id, so a screen can key a line and open the row, and `register` and `seq`
 * say it the way `UndoScope.row` asks for it. Everything a person reads
 * is in `line`, and in `title`, `list`, `label`, `from` and `to` for a screen that lays the line out itself.
 */
export type UndoStep = {
  do: UndoDo;
  row?: string;
  /** The row's list and number, which `UndoScope.row` takes back to undo this row alone. Absent only on a `stop`. */
  register?: string;
  seq?: number;
  title: string;
  list?: string;
  label?: string;
  /** What it goes back to, in words. */
  from?: string;
  /** What it says now, in words. */
  to?: string;
  line: string;
};

/** One thing the undo leaves as it is, and why, in plain words. */
export type UndoSkip = { row?: string; title: string; why: string; line: string };

export type UndoPlan = {
  /** One sentence for the whole of it: "Puts back 3 changes. Leaves 1 as it is." */
  say: string;
  /** Every line a person reads, what it does first and what it leaves after. */
  lines: string[];
  steps: UndoStep[];
  skipped: UndoSkip[];
  /** How many notes the undone writes left, which stay. */
  notes: number;
  /** What `undoApply` must be handed back, so it does what this plan said and nothing else. */
  hash: string;
  /** It was put back before, and nothing is left to do. */
  already: boolean;
};

/** One batch put back, for the ladder: who made it, the agent it knows them as, and the kinds it was. */
export type UndoneMark = { batch: string; actor: string | null; agent: string | null; kinds: string[] };

export type UndoApplied = {
  /** The undo's own batch, which undoes it in turn. */
  batch: string;
  /** How many changes were put back. */
  put: number;
  say: string;
  lines: string[];
  /** What was left, including a step the write path refused when it came to it, with its sentence. */
  skipped: UndoSkip[];
  undone: UndoneMark[];
};

/** What the undo writes through: the record's own write path, inside its own transaction. */
export type UndoParts = Pick<KernelParts, 'sql' | 'clock' | 'mint' | 'transaction' | 'write'> & {
  /** The write path through the door an accepted decision's writes use, for a move undoing that decision puts back. */
  decidedWrite?: KernelParts['write'];
  /** The mail door asking about one mail again (RM4), for a filing undone out of a question that was asked one at a time. */
  askMail?: (raw: string) => void;
};

/** Narrows what a person's plan may show: a list she cannot read is left out without a word. */
export type UndoOptions = { reads?: (register: string) => boolean };

/**
 * Checks and hashes declarations now, and hands back their write for a transaction the caller owns: the kernel's
 * `stageInstall`, which is every check an install runs and none of the writing.
 */
export type UndoStage = (batch: readonly Declaration[]) => Promise<Result<() => Result<unknown>>>;

/**
 * What `undoStaged` made ready, handed to `undoApply` as it is: for each question whose change goes back, the write of
 * the earlier versions, or the refusal the checks gave, which the undo answers among `skipped` in its own words.
 */
export type UndoDeclared = { ready: Map<string, { write: () => Result<unknown> } | { refused: Result<never> }> };

/* ── reading the log ─────────────────────────────────────────────────────── */

type Line = {
  rowid: number;
  id: string;
  ts: string;
  actor: string;
  kind: string;
  target: string | null;
  field: string | null;
  from_v: string | null;
  to_v: string | null;
  note: string | null;
  batch: string | null;
};

const COLUMNS = 'rowid, id, ts, actor, kind, target, field, from_v, to_v, note, batch';

/** The batch a line belongs to: its own id when it is the first line of a write that was given none. */
const keyOf = (l: Line): string => l.batch ?? l.id;

/** A run's spoken name as its writes are signed. */
const RUN = new RegExp(`^${SESSION_PREFIX}\\d+$`);

type Scoped = { keys: string[]; lines: Line[]; decisions: string[]; empty: string };

/**
 * The lines a scope covers, oldest first, and the batches they make. A refusal when the scope names nothing.
 *
 * ONE PARAMETER FOR A LIST, through `json_each`, because a Durable Object allows a hundred bound values and a run can
 * have written in more batches than that.
 *
 * EVERY KEY IS A BATCH'S OWN, `coalesce(batch, id)`. A key matched a line's id too, so an event id from inside a larger
 * batch undid that one line, and the ladder's mark, keyed by the real batch, was looked up by the id and never made. A
 * key given now is read as the batch its line belongs to, and an id matches only the first line of a write given no
 * batch, which is the one line whose own id is its batch.
 */
function scoped(sql: Sql, scope: UndoScope): Result<Scoped> {
  const byKeys = (keys: readonly string[]): Line[] =>
    sql.all<Line>(
      `SELECT ${COLUMNS} FROM event WHERE batch IN (SELECT value FROM json_each(?)) OR (batch IS NULL AND id IN (SELECT value FROM json_each(?))) ORDER BY rowid`,
      JSON.stringify(keys),
      JSON.stringify(keys),
    );
  const decisionsOf = (keys: readonly string[]): string[] =>
    sql
      .all<{ target: string }>(
        "SELECT target FROM event WHERE kind = 'decide' AND batch IN (SELECT value FROM json_each(?)) ORDER BY rowid",
        JSON.stringify(keys),
      )
      .map((r) => r.target.slice('decision:'.length));

  if ('batch' in scope) {
    const given = typeof scope.batch === 'string' ? scope.batch.trim() : '';
    const key =
      given === '' ? '' : (sql.one<{ k: string }>('SELECT coalesce(batch, id) AS k FROM event WHERE id = ? OR batch = ? ORDER BY rowid LIMIT 1', given, given)?.k ?? given);
    const lines = key === '' ? [] : byKeys([key]);
    if (lines.length === 0) return no('ROW_UNKNOWN', 'There is no change with that mark here, so there is nothing to undo.', { at: 'batch' });
    return ok({ keys: [key], lines, decisions: decisionsOf([key]), empty: 'That change left nothing that can be put back.' });
  }
  if ('decision' in scope) {
    const id = typeof scope.decision === 'string' ? scope.decision.trim() : '';
    const made = id === '' ? undefined : sql.one<{ batch: string | null }>("SELECT batch FROM event WHERE kind = 'decide' AND target = ? ORDER BY rowid DESC LIMIT 1", `decision:${id}`);
    if (!made) return no('ROW_UNKNOWN', 'That decision is not here, so there is nothing to undo.', { at: 'decision' });
    /* A DECISION FROM BEFORE ITS EVENT CARRIED A BATCH cannot be told apart from the writes around it. */
    if (made.batch === null)
      return no('ROW_UNKNOWN', 'That decision was made before decisions kept what they changed, so it cannot be undone from here. Change the rows it wrote instead.', { at: 'decision' });
    return ok({ keys: [made.batch], lines: byKeys([made.batch]), decisions: [id], empty: 'That decision changed nothing that can be put back.' });
  }
  if ('run' in scope) {
    const run = typeof scope.run === 'string' ? scope.run.trim() : '';
    if (!RUN.test(run)) return no('VALUE_MALFORMED', `A run is named as its writes are signed, ${SESSION_PREFIX}42.`, { at: 'run' });
    const keys = sql
      .all<{ k: string }>('SELECT DISTINCT coalesce(batch, id) AS k FROM event WHERE actor = ?', run)
      .map((r) => r.k);
    /* A RUN THAT WROTE NOTHING IS A PLAN OF NOTHING, not a refusal: its page asks on every open, and `empty` says it. */
    return ok({ keys, lines: byKeys(keys), decisions: decisionsOf(keys), empty: 'That run changed nothing that can be put back.' });
  }
  return no('VALUE_MALFORMED', 'Say what to undo: a batch, a decision or a run.', { at: 'scope' });
}

/**
 * The one row `scope.row` narrows the undo to, as its id, or `null` when it narrows nothing. A refusal at `row` when
 * it is not a list and a number, names no row of this record, or names one the scope never changed. A row in a list
 * she cannot read is one this record does not hold, as far as she is told.
 */
function onlyRow(sql: Sql, scope: UndoScope, lines: readonly Line[], opts: UndoOptions): Result<string | null> {
  const said = (scope as { row?: unknown }).row;
  if (said === undefined) return ok(null);
  const r = isMap(said) ? said : {};
  if (typeof r.register !== 'string' || r.register.trim() === '' || typeof r.seq !== 'number' || !Number.isInteger(r.seq) || r.seq < 1)
    return no('VALUE_MALFORMED', 'Say the one to undo by its list and number: { register: "tasks", seq: 3 }.', { at: 'row' });
  const register = r.register.trim();
  const id = opts.reads && !opts.reads(register) ? undefined : sql.one<{ id: string }>('SELECT id FROM entry WHERE register = ? AND seq = ?', register, r.seq)?.id;
  if (id === undefined) return no('ROW_UNKNOWN', 'That one is not here, so there is nothing of it to undo.', { at: 'row' });
  if (!lines.some((l) => l.target === `entry:${id}`))
    return no('ROW_UNKNOWN', 'This change did not touch that one, so there is nothing of it to undo here.', { at: 'row' });
  return ok(id);
}

/* ── the lists, as a person reads them ───────────────────────────────────── */

type FieldShape = {
  id: string;
  type: string;
  of?: string;
  label?: string;
  values?: string[];
  labels?: Record<string, string>;
  retired?: boolean;
  by?: string;
  transitions?: Record<string, { to?: string[]; by?: string }>;
};

type ListDecl = { id: string; name: string; one: string | null; title: string | null; state: string | null; finished: string | null; fields: Map<string, FieldShape> };

/** The field every list takes, declared or not (`index.ts`'s `withTags`). */
const TAGS: FieldShape = { id: 'tags', type: 'list', of: 'text', label: 'Tags' };

/**
 * The field a list's rows are merged by, read the way the kernel's merge door reads it (`entities.ts`'s `keyedLists`
 * over every live list, since a role is resolved across them), or `undefined` for a list whose rows are never merged.
 */
function mergeFieldIn(sql: Sql, register: string): string | undefined {
  const all: RoleList[] = [];
  for (const row of sql.all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0")) {
    const body = parse(row.body);
    if (isMap(body) && typeof body.id === 'string') all.push(body as unknown as RoleList);
  }
  const list = keyedLists(all).find((l) => l.register === register);
  return list === undefined ? undefined : mergeFieldOf(list);
}

function listsOf(sql: Sql): (register: string) => ListDecl | null {
  const seen = new Map<string, ListDecl | null>();
  return (register) => {
    if (seen.has(register)) return seen.get(register) ?? null;
    const row = sql.one<{ body: string }>(
      "SELECT body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1",
      `register.${register}`,
    );
    let decl: ListDecl | null = null;
    if (row) {
      const body = parse(row.body);
      if (isMap(body)) {
        const fields = new Map<string, FieldShape>();
        for (const f of Array.isArray(body.fields) ? body.fields : [])
          if (isMap(f) && typeof f.id === 'string' && typeof f.type === 'string') fields.set(f.id, f as unknown as FieldShape);
        if (!fields.has('tags')) fields.set('tags', TAGS);
        const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
        decl = {
          id: register,
          name: str(body.name) ?? spaced(register),
          one: str(body.one),
          title: str(body.title),
          state: str(body.state),
          finished: str(body.finished),
          fields,
        };
      }
    }
    seen.set(register, decl);
    return decl;
  };
}

type Held = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; deleted_at: string | null };

function rowsOf(sql: Sql, ids: readonly string[]): Map<string, Held> {
  const out = new Map<string, Held>();
  if (ids.length === 0) return out;
  for (const r of sql.all<{ id: string; register: string; seq: number; fields: string; version: number; deleted_at: string | null }>(
    'SELECT id, register, seq, fields, version, deleted_at FROM entry WHERE id IN (SELECT value FROM json_each(?))',
    JSON.stringify(ids),
  )) {
    const fields = parse(r.fields);
    out.set(r.id, {
      id: r.id,
      register: r.register,
      seq: Number(r.seq),
      fields: isMap(fields) ? (fields as Record<string, Json>) : {},
      version: Number(r.version),
      deleted_at: r.deleted_at,
    });
  }
  return out;
}

/** A row's name: its title field, or "an untitled task" when it has none. Never its id or number. */
function titleOf(row: { fields: Record<string, unknown> } | null, decl: ListDecl | null): string {
  const said = row && decl?.title ? row.fields[decl.title] : undefined;
  if (typeof said === 'string' && said.trim() !== '') return clip(said.trim(), 80);
  return `an untitled ${decl?.one ?? 'one'}`;
}

/** What a line says of a row nothing names any more. */
const SOMETHING = 'something';

/** The title in a sentence: quoted when it is a name, bare when it is "an untitled task". */
const named = (title: string): string => (title.startsWith('an untitled ') || title === SOMETHING ? title : `"${title}"`);

const labelOf = (f: FieldShape): string => {
  const said = typeof f.label === 'string' && f.label.trim() !== '' ? f.label.trim() : spaced(f.id);
  /* Lower-cased in a sentence, unless it is a run of capitals like "VAT". */
  return /^[A-Z]{2}/.test(said) ? said : said.charAt(0).toLowerCase() + said.slice(1);
};

const spaced = (id: string): string => {
  const s = id.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A value as a person reads it, or `null` when it has no short form (a document, a file, a JSON value): the line then
 * says "the earlier text" and does not print the text.
 */
function spoken(value: unknown, f: FieldShape, nameOfRow: (id: string) => string | null): string | null {
  if (value === null || value === undefined) return 'empty';
  const type = f.type === 'list' ? (f.of ?? 'text') : f.type;
  if (Array.isArray(value)) {
    const each = value.map((v) => spoken(v, { ...f, type }, nameOfRow));
    return each.some((v) => v === null) ? null : each.length === 0 ? 'empty' : each.join(', ');
  }
  switch (type) {
    case 'bool':
      return value === true ? 'yes' : 'no';
    case 'enum':
      return typeof value === 'string' ? (f.labels?.[value] ?? spaced(value)) : null;
    case 'ref':
      return typeof value === 'string' ? (nameOfRow(value) ?? 'something since removed') : null;
    case 'day': {
      const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
      return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : String(value);
    }
    case 'instant': {
      const ms = typeof value === 'string' ? Date.parse(value) : NaN;
      if (Number.isNaN(ms)) return String(value);
      const d = new Date(ms);
      const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hm}`;
    }
    case 'int':
    case 'decimal':
    case 'duration':
      return typeof value === 'number' || typeof value === 'string' ? String(value) : null;
    case 'quantity':
      return isMap(value) && value.value !== undefined ? `${String(value.value)} ${typeof value.unit === 'string' ? value.unit : ''}`.trim() : null;
    case 'text':
    case 'email':
    case 'url':
      return typeof value === 'string' ? `"${clip(value.replace(/\s+/g, ' '), 60)}"` : null;
    default:
      return null;
  }
}

/** Who an actor is, as a person reads it. Never an id: a person by name, a run by its agent. */
function whoOf(sql: Sql, actor: string): string {
  if (actor.startsWith('p_')) return sql.one<{ name: string | null }>('SELECT name FROM person WHERE id = ?', actor)?.name?.trim() || 'Someone';
  if (RUN.test(actor)) {
    const agent = sql.one<{ a: unknown }>("SELECT json_extract(fields, '$.agent') AS a FROM entry WHERE register = ? AND seq = ?", SESSION, Number(actor.slice(SESSION_PREFIX.length)))?.a;
    return typeof agent === 'string' && agent !== 'other' && agent !== '' ? spaced(agent) : 'An agent';
  }
  if (actor === SLASH) return 'Slash';
  /* AN AGENT'S KEY UNDOING ITS OWN WRITE was "Someone undid this" (audit 10k, AK15). */
  if (actor.startsWith('t_') || actor.startsWith('agent:')) return 'An agent';
  if (actor === 'rule:ladder' || actor === 'rule:additive' || actor === 'rule:update' || actor === 'rule:handled' || actor === 'system') return 'BrainDog';
  if (actor.startsWith('rule:')) return 'A rule';
  if (actor.startsWith('ingest:')) return 'An import';
  return 'Someone';
}

/** The words `whoOf` answers that are not a name, and so take a small letter inside a sentence. */
const GENERIC = new Set(['Someone', 'An agent', 'A rule', 'An import']);

/** Who an actor is inside a sentence: "a rule has changed it since", beside "Mara has changed it since". */
function whoIn(sql: Sql, actor: string): string {
  const said = whoOf(sql, actor);
  return GENERIC.has(said) ? said.charAt(0).toLowerCase() + said.slice(1) : said;
}

/* ── the plan ────────────────────────────────────────────────────────────── */

/** What one row's undo writes, in the order `undoApply` writes it. */
type Work = {
  id: string;
  register: string;
  version: number;
  /** `restore`: bring it back first. `remove`: take it out last. */
  restore: boolean;
  remove: boolean;
  /** The order a removal goes in: the newest made goes first, so a row is never taken from under one that points at it. */
  made: number;
  patch: Patch;
  /** The record's own fields it puts back, which no patch may name: a run's `project`. */
  stamp?: Record<string, Json>;
  /** A move back out of a state only a decision leaves, under an undo of that decision: written as a decision's is. */
  decided?: true;
  steps: UndoStep[];
  /** The lines whose change this puts back, for the kinds the ladder is told. */
  from: Line[];
};

type Stop = { id: string; state: string; step: UndoStep };

/**
 * `lines` are the ones the plan puts back from, only the row's under `scope.row`; `every` is every line of the scope's
 * batches, which the ladder reads for who made each.
 */
type Worked = { plan: UndoPlan; work: Work[]; stops: Stop[]; declares: Declared[]; visuals: Pictured[]; files: Filed[]; keys: string[]; lines: Line[]; every: Line[]; decisions: string[] };

/** One declaration an accepted change replaced, and the earlier version the undo installs again as a new one. */
type Declared = {
  /** The question whose change this puts back: what was changed together goes back together. */
  suggestion: string;
  /** The batch the decision was written in, for the ladder's mark. */
  key: string;
  id: string;
  kind: string;
  pack: string | null;
  /** The version the change installed, which must still be the live one. */
  installed: number;
  /** The version it replaced, and its body as the table holds it. */
  prior: number;
  body: string;
  /** What its history line says, naming the question a person answered. */
  note: string;
  step: UndoStep;
};

/**
 * What undoing `scope` would do, in names, and the hash `undoApply` needs. Reads only.
 */
export function undoPlan(sql: Sql, scope: UndoScope, opts: UndoOptions = {}): Result<UndoPlan> {
  const out = worked(sql, scope, opts);
  return out.ok ? ok(out.value.plan) : out;
}

function worked(sql: Sql, scope: UndoScope, opts: UndoOptions): Result<Worked> {
  const got = scoped(sql, scope);
  if (!got.ok) return got;
  const { keys, lines: every, decisions } = got.value;
  /* ONLY THIS ONE: every line but the row's is out of the plan, and so out of its hash. */
  const only = onlyRow(sql, scope, every, opts);
  if (!only.ok) return only;
  const lines = only.value === null ? every : every.filter((l) => l.target === `entry:${only.value}`);
  const inScope = new Set(lines.map((l) => l.id));
  const lists = listsOf(sql);

  const byRow = new Map<string, Line[]>();
  let notes = 0;
  for (const l of lines) {
    if (l.target === null || !l.target.startsWith('entry:')) continue;
    const id = l.target.slice('entry:'.length);
    byRow.set(id, [...(byRow.get(id) ?? []), l]);
  }
  const rows = rowsOf(sql, [...byRow.keys()]);

  const nameOfRow = (id: string): string | null => {
    const r = rows.get(id) ?? rowsOf(sql, [id]).get(id);
    if (!r) return null;
    if (!rows.has(id)) rows.set(id, r);
    return titleOf(r, lists(r.register));
  };
  /** Lines on a row after `after`, or between two, that the undo does not cover: somebody else's since. */
  const othersOn = (target: string, after: number, field?: string, before?: number): Line[] =>
    sql
      .all<Line>(
        `SELECT ${COLUMNS} FROM event WHERE target = ? AND rowid > ? ${before === undefined ? '' : 'AND rowid < ?'} ${field === undefined ? '' : 'AND field = ?'} ORDER BY rowid`,
        ...([target, after, ...(before === undefined ? [] : [before]), ...(field === undefined ? [] : [field])] as (string | number)[]),
      )
      .filter((l) => !inScope.has(l.id) && l.kind !== 'note');

  const work: Work[] = [];
  const skipped: UndoSkip[] = [];
  /* THE ROWS THE PLAN LEAVES WHOLLY ALONE, and the ones it never speaks of: a message one of them queued is not stopped. */
  const leftAlone = new Set<string>();
  const skip = (row: string | undefined, title: string, why: string): void => {
    if (row !== undefined) leftAlone.add(row);
    skipped.push({ ...(row === undefined ? {} : { row }), title, why, line: `Leaves ${named(title)} as it is: ${why}.` });
  };
  /**
   * The project a run is placed in, by name. A run holds it as the project's spoken id (`things#3`, or `P3` on a list
   * with its own prefix), which a person never reads; a value that is no handle is a name as somebody wrote it, and so
   * is letters and a number no list prefixes its rows with ("Web3"). `null` when it names a project the record no
   * longer holds, or one with no name.
   */
  const placeName = (said: unknown): string | null => {
    if (typeof said !== 'string' || said.trim() === '') return null;
    const hashed = /^([a-z][a-z0-9_]*)#(\d+)$/.exec(said);
    const prefixed = hashed ? null : /^([A-Za-z]+)(\d+)$/.exec(said);
    const register = hashed
      ? hashed[1]!
      : prefixed
        ? sql.one<{ r: string }>(
            "SELECT json_extract(body, '$.id') AS r FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_extract(body, '$.seq_prefix') = ? LIMIT 1",
            prefixed[1]!,
          )?.r
        : undefined;
    if (!hashed && (!prefixed || register === undefined)) {
      if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(said)) return said.trim();
      const row = nameOfRow(said);
      return row === null || row.startsWith('an untitled ') ? null : row;
    }
    if (register === undefined) return null;
    const found = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND seq = ? AND deleted_at IS NULL', register, Number((hashed ?? prefixed)![2]));
    const fields = found ? parse(found.fields) : null;
    const title = isMap(fields) ? titleOf({ fields }, lists(register)) : null;
    return title === null || title.startsWith('an untitled ') ? null : title;
  };
  /**
   * A run the overnight walk placed, unplaced: the work that does it, or `null` when the run is left as it is (with a
   * line saying why when somebody has moved it since).
   *
   * ITS PLACEMENT IS ONE OF TWO LINES, both signed `rule:backfill`: a `project` edit, from nothing to the project, or,
   * from before a placement wrote its move as a line, a stamp naming no field. The walk only places a run with no
   * project, so what it goes back to is nothing. A stamp says nothing of what it set, so it goes back only while it is
   * the run's last line; a `project` edit, while the run still holds what it set and nobody has placed it since.
   */
  const placedBack = (row: Held, evs: readonly Line[]): Work | null => {
    const placing = evs.filter((e) => e.actor === BACKFILL_ACTOR && e.kind === 'edit' && (e.field === null || e.field === 'project'));
    const decl = lists(SESSION);
    const f = decl?.fields.get('project');
    if (placing.length === 0 || !decl || !f || row.deleted_at !== null) return null;
    const held = row.fields.project;
    if (typeof held !== 'string' || held.trim() === '') return null;
    const last = placing[placing.length - 1]!;
    const bare = last.field === null;
    const title = titleOf(row, decl);
    const label = labelOf(f);
    const target = `entry:${row.id}`;
    const since = othersOn(target, last.rowid, bare ? undefined : 'project');
    if (since.length > 0 || (!bare && !same(held, parse(last.to_v)))) {
      const who = since.length > 0 ? whoIn(sql, since[since.length - 1]!.actor) : 'someone';
      skip(row.id, title, bare ? `${who} has changed it since` : `${who} has changed ${label} since`);
      return null;
    }
    const first = placing.find((e) => e.field === 'project');
    const from = first === undefined || erasedOrWithheld(first.from_v) ? null : parse(first.from_v);
    /* The walk reads a run whose project is empty or blank as one in none, and so does the line. */
    const none = from === null || (typeof from === 'string' && from.trim() === '');
    const back = none ? null : placeName(from);
    const now = placeName(held);
    return {
      id: row.id,
      register: SESSION,
      version: row.version,
      restore: false,
      remove: false,
      made: 0,
      patch: {},
      stamp: { project: from as Json },
      steps: [
        {
          do: 'set',
          row: row.id,
          register: SESSION,
          seq: row.seq,
          title,
          list: decl.name,
          label,
          ...(back === null ? {} : { from: back }),
          ...(now === null ? {} : { to: now }),
          line:
            back === null
              ? `Takes ${named(title)} out of ${now === null ? 'its project' : `the ${now} project`}.`
              : `Moves ${named(title)} back to the ${back} project${now === null ? '' : ` (now ${now})`}.`,
        },
      ],
      from: placing,
    };
  };

  /* WHAT THIS UNDO BRINGS BACK, worked out before any row is: a link back to one of them is not a link to a row
     deleted since, since the restore is written first (`rank`). One Undo of a fold puts each link back on the one it
     named. The same tests as the loop's own restore below. */
  const restoredHere = new Set<string>();
  for (const [id, evs] of byRow) {
    const row = rows.get(id);
    if (!row || row.deleted_at === null || row.register === SESSION || !lists(row.register)) continue;
    if (opts.reads && !opts.reads(row.register)) continue;
    if (evs.some((e) => e.kind === 'create')) continue;
    const gone = evs.filter((e) => e.kind === 'delete' || e.kind === 'restore');
    if (gone.length > 0 && gone[0]!.kind === 'delete' && gone[gone.length - 1]!.kind === 'delete') restoredHere.add(id);
  }

  for (const [id, evs] of byRow) {
    const row = rows.get(id);
    const madeBy = evs.find((e) => e.kind === 'create');
    /* A list she cannot read is left out without a word. */
    if (row && opts.reads && !opts.reads(row.register)) {
      leftAlone.add(id);
      continue;
    }
    /* A RUN'S OWN ROW IS THE RECORD KEEPING ITS BOOKS: when it was last heard from, what it says it is doing. Its notes
       are its own too, and so is the one an earlier undo left on it. All but the project the overnight walk put it in,
       which is the walk's guess and nobody's word, and goes back as any edit does. */
    if (row && row.register === SESSION) {
      const placed = placedBack(row, evs);
      if (placed) work.push(placed);
      else leftAlone.add(id);
      continue;
    }
    notes += evs.filter((e) => e.kind === 'note' && !isVisualLine(e) && !isAttachedLine(e)).length;
    const changes = evs.filter((e) => e.kind !== 'note');
    if (changes.length === 0) continue;
    if (!row) {
      /* PURGED: the row is gone from the table, and with it the list that said which field names it. */
      skip(undefined, SOMETHING, 'it has been removed for good');
      continue;
    }
    const decl = lists(row.register);
    const title = titleOf(row, decl);
    if (!decl) {
      skip(id, title, `its list is no longer here`);
      continue;
    }
    const target = `entry:${id}`;
    const last = changes[changes.length - 1]!.rowid;
    const w: Work = { id, register: row.register, version: row.version, restore: false, remove: false, made: madeBy?.rowid ?? 0, patch: {}, steps: [], from: [] };
    const step = (s: Omit<UndoStep, 'row' | 'register' | 'seq' | 'title' | 'list'>, from: Line[]): void => {
      w.steps.push({ ...s, row: id, register: row.register, seq: row.seq, title, list: decl.name });
      w.from.push(...from);
    };

    /* ── made by the undo's writes: it goes, unless somebody has worked on it since ── */
    if (madeBy) {
      const later = changes.at(-1)!;
      if (row.deleted_at !== null) {
        if (later.kind !== 'delete') skip(id, title, 'it has already been deleted');
        continue;
      }
      const since = othersOn(target, madeBy.rowid);
      if (since.length > 0) {
        skip(id, title, `${whoIn(sql, since[since.length - 1]!.actor)} has changed it since`);
        continue;
      }
      w.remove = true;
      step({ do: 'remove', line: `Removes ${named(title)} from ${decl.name}.` }, changes);
      work.push(w);
      continue;
    }

    /* ── deleted or restored by them: the other way, while it is still as they left it ── */
    const gone = changes.filter((e) => e.kind === 'delete' || e.kind === 'restore');
    const wasLive = gone.length === 0 ? row.deleted_at === null : gone[0]!.kind === 'delete';
    const leftLive = gone.length === 0 ? wasLive : gone[gone.length - 1]!.kind === 'restore';
    if (wasLive !== leftLive) {
      const now = row.deleted_at === null;
      if (now !== leftLive) skip(id, title, now ? 'it is already back' : 'it has been deleted again since');
      else if (wasLive) {
        w.restore = true;
        step({ do: 'restore', line: `Brings back ${named(title)} in ${decl.name}.` }, gone);
      } else {
        w.remove = true;
        step({ do: 'delete', line: `Deletes ${named(title)} from ${decl.name} again.` }, gone);
      }
    }
    if (w.remove) {
      work.push(w);
      continue;
    }
    /* A ROW DELETED SINCE, by somebody else, has its fields left alone: putting them back would change a row nobody sees. */
    const fieldLines = changes.filter((e) => e.field !== null && e.kind !== 'delete' && e.kind !== 'restore');
    if (fieldLines.length > 0 && row.deleted_at !== null && !w.restore) {
      skip(id, title, 'it has been deleted since');
      continue;
    }

    /* ── field by field ── */
    const byField = new Map<string, Line[]>();
    for (const e of fieldLines) byField.set(e.field!, [...(byField.get(e.field!) ?? []), e]);
    for (const [field, fl] of byField) {
      /* THE RECORD'S OWN FIELDS (`_pair`, `_rule`) AND THE DAY IT FILLS IN ON A MOVE, which follow the write rather than lead it. */
      if (field.startsWith('_') || field === decl.finished) continue;
      const f = decl.fields.get(field);
      const label = f ? labelOf(f) : spaced(field).toLowerCase();
      if (!f || f.retired) {
        skip(id, title, `${label} is no longer on ${decl.name}`);
        continue;
      }
      const tagged = fl.filter((e) => e.kind === 'tag' || e.kind === 'untag');
      const valued = fl.filter((e) => e.kind === 'edit' || e.kind === 'state' || e.kind === 'link');
      const held = row.fields[field];

      if (tagged.length > 0) {
        /* ELEMENT BY ELEMENT: what each was before the first of these lines, and after the last. */
        const first = new Map<string, string>();
        const lastOp = new Map<string, string>();
        const raw = new Map<string, unknown>();
        for (const e of tagged) {
          const said = e.kind === 'tag' ? e.to_v : e.from_v;
          if (said === null || erasedOrWithheld(said)) continue;
          const v = parse(said);
          const k = JSON.stringify(v);
          if (!first.has(k)) first.set(k, e.kind);
          lastOp.set(k, e.kind);
          raw.set(k, v);
        }
        /* SOMEBODY ELSE'S SINCE, OR IN BETWEEN, element by element: a tag a person took off and put back is theirs now,
           though it reads as it did. A line on the field that names no element (a whole value written over it) makes
           every element theirs. */
        const theirs = new Map<string, string>();
        let wholly: string | null = null;
        for (const o of othersOn(target, tagged[0]!.rowid, field)) {
          const said = o.kind === 'tag' ? o.to_v : o.kind === 'untag' ? o.from_v : null;
          if (said === null || erasedOrWithheld(said)) wholly = o.actor;
          else theirs.set(JSON.stringify(parse(said)), o.actor);
        }
        const list = Array.isArray(held) ? [...(held as unknown[])] : [];
        const has = (k: string): boolean => list.some((x) => JSON.stringify(x) === k);
        let changed = false;
        for (const [k, op] of first) {
          const before = op === 'untag';
          const after = lastOp.get(k) === 'tag';
          if (before === after || has(k) !== after) continue;
          const v = raw.get(k);
          const word = spoken(v, f, nameOfRow) ?? String(v);
          const by = theirs.get(k) ?? wholly;
          if (by !== null) {
            skip(id, title, `${whoIn(sql, by)} has changed ${field === 'tags' ? `the ${word} tag` : `${word} in ${label}`} since`);
            continue;
          }
          if (after) {
            list.splice(list.findIndex((x) => JSON.stringify(x) === k), 1);
            step({ do: 'untag', label, to: word, line: field === 'tags' ? `Takes the ${word} tag off ${named(title)}.` : `Takes ${word} off ${label} on ${named(title)}.` }, tagged);
          } else {
            list.push(v);
            step({ do: 'tag', label, from: word, line: field === 'tags' ? `Puts the ${word} tag back on ${named(title)}.` : `Puts ${word} back in ${label} on ${named(title)}.` }, tagged);
          }
          changed = true;
        }
        if (changed) w.patch[field] = list.length === 0 ? null : (list as Json);
      }

      if (valued.length === 0) continue;
      const head = valued[0]!;
      const tail = valued[valued.length - 1]!;
      if (erasedOrWithheld(head.from_v) || erasedOrWithheld(tail.to_v)) {
        const erased = (head.from_v ?? '').includes(ERASED_MARK) || (tail.to_v ?? '').includes(ERASED_MARK);
        skip(id, title, erased ? `the earlier ${label} was erased` : `BrainDog keeps no copy of the earlier ${label}`);
        continue;
      }
      const from = parse(head.from_v);
      const to = parse(tail.to_v);
      if (same(from, to)) continue;
      if (same(held ?? null, from)) continue;
      if (f.type === 'secret' || f.of === 'secret') {
        skip(id, title, `a key is never put back by an undo`);
        continue;
      }
      if (f.by === 'decide') {
        skip(id, title, `${label} changes only by a decision`);
        continue;
      }
      /* SOMEBODY ELSE CHANGED IT IN BETWEEN, so the earliest `from` is not what the row held before the last of them. */
      const between = othersOn(target, head.rowid, field, tail.rowid);
      if (between.length > 0) {
        skip(id, title, `${whoIn(sql, between[between.length - 1]!.actor)} changed ${label} in between`);
        continue;
      }
      /* AND SINCE, whether or not the row still holds the `to`: a person who set it away and back again has said it
         twice, and it is theirs now though it reads the same. */
      const since = othersOn(target, tail.rowid, field);
      if (since.length > 0 || !same(held ?? null, to)) {
        skip(id, title, `${since.length > 0 ? whoIn(sql, since[since.length - 1]!.actor) : 'someone'} has changed ${label} since`);
        continue;
      }
      /* A MOVE BACK HAS TO BE A MOVE THE LIST ALLOWS, read here so the plan does not promise one the write would refuse. */
      if (field === decl.state && typeof held === 'string') {
        const way = f.transitions?.[held];
        if (way && Array.isArray(way.to) && !way.to.includes(typeof from === 'string' ? from : '')) {
          skip(id, title, `${decl.name} does not let it move from ${spoken(held, f, nameOfRow)} back to ${spoken(from, f, nameOfRow)}`);
          continue;
        }
        /* UNDOING THE DECISION THAT MADE IT IS DECIDING: the person taking a decision back moves it back too,
           through the door a decision's own writes use (`decidedWrite`). Any other undo leaves it to a decision. */
        if (way?.by === 'decide' && !('decision' in scope)) {
          skip(id, title, `moving it from ${spoken(held, f, nameOfRow)} needs a decision`);
          continue;
        }
        if (way?.by === 'decide') w.decided = true;
      }
      /* UNDOING THE DECISION THAT MERGED IT IS DECIDING TOO: the merge door moves a merge field only by a decision or by
         undoMerge, so the decision's own undo writes it back through the decided door. */
      if ('decision' in scope && mergeFieldIn(sql, decl.id) === field) w.decided = true;
      /* A LINK BACK TO A ROW DELETED SINCE would be refused by the write; the plan says so first. */
      if ((f.type === 'ref' || f.of === 'ref') && from !== null) {
        const ids = (Array.isArray(from) ? from : [from]).filter((x): x is string => typeof x === 'string');
        const there = rowsOf(sql, ids);
        const lost = ids.find((x) => there.get(x)?.deleted_at !== null && !restoredHere.has(x));
        if (lost !== undefined) {
          skip(id, title, `${there.get(lost) ? named(titleOf(there.get(lost)!, lists(there.get(lost)!.register))) : 'what it pointed at'} has been deleted since`);
          continue;
        }
      }
      w.patch[field] = from as Json;
      const was = spoken(from, f, nameOfRow);
      const now = spoken(held, f, nameOfRow);
      const line =
        was === null || now === null
          ? `Puts the earlier ${label} back on ${named(title)}.`
          : field === decl.state
            ? `Moves ${named(title)} back to ${was} (now ${now}).`
            : from === null
              ? `Clears the ${label} of ${named(title)} (now ${now}).`
              : /* "Sets due on "Ship" back to" READ AS A DAY AND A FIELD RUN TOGETHER (audit 10k, AK22). */
                `Sets the ${label} of ${named(title)} back to ${was} (now ${now}).`;
      step({ do: 'set', label, ...(was === null ? {} : { from: was }), ...(now === null ? {} : { to: now }), line }, valued);
    }
    if (w.restore || Object.keys(w.patch).length > 0) work.push(w);
  }

  const acted = new Set(work.map((w) => w.id));
  const stops = stopsOf(sql, lines, keys, (id) => byRow.has(id) && (acted.has(id) || !leftAlone.has(id)), skipped, only.value);

  /* A DECLARATION IS NOBODY'S ONE ROW, so under `row` none goes back and none is spoken of. */
  const declares = only.value === null ? declaredIn(sql, lines, opts, (title, why) => skip(undefined, title, why)) : [];
  const visuals = picturedIn(sql, lines, keys, opts, (title, why) => skip(undefined, title, why));
  const files = filedIn(sql, lines, keys, opts, (title, why) => skip(undefined, title, why));

  /* THE ORDER IT IS WRITTEN IN, and so the order it is read in: rows back first, values next, removals last. */
  work.sort((a, b) => rank(a) - rank(b) || (a.remove && b.remove ? b.made - a.made : 0));
  const steps = [...work.flatMap((w) => w.steps), ...declares.map((d) => d.step), ...visuals.map((v) => v.step), ...files.map((f) => f.step), ...stops.map((s) => s.step)];
  const count = steps.length;
  /* ANY OF ITS BATCHES, since a run's own bookkeeping batches are never put back and so never marked. */
  /* UNDER `row`, ONLY WHEN AN UNDO HAS PUT THAT ROW BACK SINCE: another row's undo marks the batch too, and the mark
     keeps the first undo's batch only, so it is the row's own lines that say so. */
  const already =
    count === 0 &&
    (only.value === null
      ? sql.one('SELECT 1 AS y FROM undone WHERE batch IN (SELECT value FROM json_each(?)) LIMIT 1', JSON.stringify(keys))
      : sql.one('SELECT 1 AS y FROM event WHERE target = ? AND rowid > ? AND note = ? LIMIT 1', `entry:${only.value}`, lines[lines.length - 1]!.rowid, PUT_BACK)) !==
      undefined;

  const say =
    count === 0
      ? already
        ? 'This was undone already.'
        : skipped.length > 0
          ? `Nothing can be put back. ${skipped.length === 1 ? 'One change is' : `${skipped.length} changes are`} left as ${skipped.length === 1 ? 'it is' : 'they are'}.`
          : got.value.empty
      : `Puts back ${count === 1 ? 'one change' : `${count} changes`}.${skipped.length > 0 ? ` Leaves ${skipped.length === 1 ? 'one as it is' : `${skipped.length} as they are`}.` : ''}`;
  /* A QUESTION WHOSE DECLARATION GOES BACK IS NOT ASKED AGAIN: it was drawn against a version that is history now. */
  const again = count > 0 && skipped.length === 0 && declares.length === 0 && answered(sql, lines).length > 0 ? [ASKED_AGAIN] : [];
  const lineList = [...steps.map((s) => s.line), ...skipped.map((s) => s.line), ...again, ...(notes > 0 ? [notes === 1 ? 'The note stays.' : 'The notes stay.'] : [])];
  const hash = digest(
    jcs({
      work: work.map((w) => ({ id: w.id, v: w.version, r: w.restore, x: w.remove, p: w.patch as Json, ...(w.stamp === undefined ? {} : { s: w.stamp }) })),
      stops: stops.map((s) => [s.id, s.state]),
      skipped: skipped.map((s) => s.line),
      ...(only.value === null ? {} : { only: only.value }),
      /* ONLY WHEN THERE IS ONE, so a plan with none has the hash it always had. */
      ...(declares.length === 0 ? {} : { declares: declares.map((d) => [d.id, d.installed, d.prior]) }),
      ...(visuals.length === 0 ? {} : { visuals: visuals.map((v) => (v.draft === null ? [v.field, v.head, v.back] : [v.field, v.head, v.back, v.draft])) }),
      ...(files.length === 0 ? {} : { files: files.map((f) => [f.field, f.head, f.says as Json]) }),
    } as unknown as Json),
  );
  return ok({ plan: { say, lines: lineList, steps, skipped, notes, hash, already }, work, stops, declares, visuals, files, keys, lines, every, decisions });
}

/* ── a visual a change drew ──────────────────────────────────────────────── */

/** Whether a line is one of a visual's (`visual.ts`), which the plan puts back as a visual and never counts as a note. */
const isVisualLine = (l: Line): boolean => l.kind === 'note' && typeof l.field === 'string' && l.field.startsWith(VISUAL_FIELD);

/**
 * One visual the scope drew on, and where it goes back to: `back` is a version line, `null` takes it away, and `draft`
 * is the draft that waits again, or `null` for none.
 */
type Pictured = { target: string; field: string; head: number; back: string | null; draft: string | null; keys: string[]; step: UndoStep };

/**
 * The visuals the scope drew, each back to where it stood before. One somebody changed since is left with who; one an
 * undo of this scope already put back is passed over in silence.
 */
function picturedIn(sql: Sql, lines: readonly Line[], keys: readonly string[], opts: UndoOptions, skip: (title: string, why: string) => void): Pictured[] {
  const groups = new Map<string, Line[]>();
  for (const l of lines) if (isVisualLine(l) && l.target !== null) groups.set(`${l.target} ${l.field}`, [...(groups.get(`${l.target} ${l.field}`) ?? []), l]);
  if (groups.size === 0) return [];
  const undoneBy = new Set(
    sql.all<{ b: string }>('SELECT by_batch AS b FROM undone WHERE batch IN (SELECT value FROM json_each(?))', JSON.stringify(keys)).map((r) => r.b),
  );
  const out: Pictured[] = [];
  for (const [, mine] of groups) {
    const target = mine[0]!.target!;
    const field = mine[0]!.field!;
    /* A list she cannot read is left out without a word, as its rows are. */
    if (target.startsWith('entry:') && opts.reads) {
      const list = sql.one<{ r: string }>('SELECT register AS r FROM entry WHERE id = ?', target.slice('entry:'.length))?.r;
      if (list !== undefined && !opts.reads(list)) continue;
    }
    const all: VisualLine[] = visualLines(sql, target, field);
    const first = mine[0]!.rowid;
    const last = mine[mine.length - 1]!.rowid;
    const since = all.filter((l) => l.rowid > last);
    const title = [...all].reverse().map((l) => visualSaid(l.to_v)).find(isVersion)?.title ?? 'a visual';
    /* LINES SINCE THAT LEFT IT WHERE THE SCOPE LEFT IT change nothing it would put back: a version drawn and undone. A
       visual is where it stands and the draft waiting beside it, so a draft handed in, kept or thrown away is put back too. */
    const same = (a: { standing: string | null; draft: string | null }, b: typeof a): boolean => a.standing === b.standing && a.draft === b.draft;
    const now = visualState(all);
    if (since.length > 0 && !same(now, visualState(all.filter((l) => l.rowid <= last)))) {
      if (since.every((l) => l.batch !== null && undoneBy.has(l.batch))) continue;
      skip(title, `${whoIn(sql, since[since.length - 1]!.actor)} has changed it since`);
      continue;
    }
    const before = visualState(all.filter((l) => l.rowid < first));
    if (same(before, now)) continue;
    const back = before.standing;
    const line =
      back === now.standing
        ? before.draft === null
          ? `Throws the draft of the visual ${named(title)} away.`
          : `Puts the draft of the visual ${named(title)} back.`
        : back === null && before.draft === null
          ? `Takes the visual ${named(title)} away.`
          : `Puts the earlier version of the visual ${named(title)} back.`;
    out.push({
      target,
      field,
      head: all[all.length - 1]!.rowid,
      back,
      draft: before.draft,
      keys: [...new Set(mine.map(keyOf))],
      step: { do: back === null && before.draft === null ? 'remove' : 'set', title, label: 'visual', line },
    });
  }
  return out;
}

/* ── a file a change attached, renamed or took off ───────────────────────── */

/** Whether a line is one of an attachment's (`attachment.ts`), which the plan puts back as a file and never counts as a note. */
const isAttachedLine = (l: Line): boolean => l.kind === 'note' && typeof l.field === 'string' && l.field.startsWith(ATTACHED_FIELD);

/** One attachment the scope changed, and the lines that put it back where it stood: off, back at a version, its old name. */
type Filed = { target: string; field: string; head: number; says: Record<string, unknown>[]; keys: string[]; step: UndoStep };

/**
 * The attachments the scope changed, each back to where it stood before: a file attached goes off, one taken off comes
 * back at the version it stood at, a new version gives way to the one before, a rename takes the old name back. One
 * somebody changed since is left with who; one an undo of this scope already put back is passed over in silence.
 */
function filedIn(sql: Sql, lines: readonly Line[], keys: readonly string[], opts: UndoOptions, skip: (title: string, why: string) => void): Filed[] {
  const groups = new Map<string, Line[]>();
  for (const l of lines) if (isAttachedLine(l) && l.target !== null) groups.set(`${l.target} ${l.field}`, [...(groups.get(`${l.target} ${l.field}`) ?? []), l]);
  if (groups.size === 0) return [];
  const undoneBy = new Set(
    sql.all<{ b: string }>('SELECT by_batch AS b FROM undone WHERE batch IN (SELECT value FROM json_each(?))', JSON.stringify(keys)).map((r) => r.b),
  );
  const out: Filed[] = [];
  for (const [, mine] of groups) {
    const target = mine[0]!.target!;
    const field = mine[0]!.field!;
    if (target.startsWith('entry:') && opts.reads) {
      const list = sql.one<{ r: string }>('SELECT register AS r FROM entry WHERE id = ?', target.slice('entry:'.length))?.r;
      if (list !== undefined && !opts.reads(list)) continue;
    }
    const all: AttachedLine[] = attachedLines(sql, target, field);
    const first = mine[0]!.rowid;
    const last = mine[mine.length - 1]!.rowid;
    const since = all.filter((l) => l.rowid > last);
    const title = attachedState(all).name ?? [...all].reverse().map((l) => attachedSaid(l.to_v)).find(isAttachedVersion)?.name ?? 'a file';
    const same = (a: { standing: string | null; name: string | null }, b: typeof a): boolean => a.standing === b.standing && a.name === b.name;
    const now = attachedState(all);
    if (since.length > 0 && !same(now, attachedState(all.filter((l) => l.rowid <= last)))) {
      if (since.every((l) => l.batch !== null && undoneBy.has(l.batch))) continue;
      skip(title, `${whoIn(sql, since[since.length - 1]!.actor)} has changed it since`);
      continue;
    }
    const before = attachedState(all.filter((l) => l.rowid < first));
    if (same(before, now)) continue;
    /* WHAT PUTS IT BACK, IN ORDER: where it stands, then its name, read as `attachedState` would read the lines after. */
    const says: Record<string, unknown>[] = [];
    if (before.standing !== now.standing) says.push(before.standing === null ? { gone: true } : { back: before.standing });
    if (before.standing !== null && before.name !== null) {
      const after = attachedState([...all, ...says.map((x, i) => ({ ...all[all.length - 1]!, rowid: Number.MAX_SAFE_INTEGER - says.length + i, id: `undo-${i}`, to_v: jcs(x as Json) }))]);
      if (after.name !== before.name) says.push({ rename: before.name });
    }
    if (says.length === 0) continue;
    const line =
      before.standing === null
        ? `Takes the file ${named(title)} off.`
        : now.standing === null
          ? `Puts the file ${named(before.name ?? title)} back.`
          : before.standing !== now.standing
            ? `Puts the earlier version of the file ${named(before.name ?? title)} back.`
            : `Names the file ${named(title)} ${named(before.name ?? title)} again.`;
    out.push({
      target,
      field,
      head: all[all.length - 1]!.rowid,
      says,
      keys: [...new Set(mine.map(keyOf))],
      step: { do: before.standing === null ? 'remove' : 'set', title, label: 'file', line },
    });
  }
  return out;
}

/* ── a declaration a change replaced ─────────────────────────────────────── */

/** How a put back's own history line begins, which is also how a plan knows a change went back already. */
const DECLARED_BACK = 'Put back by an undo';

/** What a person calls a kind of declaration, where it is not the kind's own word. */
const KIND_WORD: Record<string, string> = { register: 'list', metric: 'figure', ingest: 'pattern' };

type HeldDecl = { version: number; kind: string; pack: string | null; body: string; retired: number };
const DECL = 'version, kind, pack_id AS pack, body, retired';

/** A declaration's name as a person reads it: what its body calls it, or its id's own words. Never the id. */
function declName(body: unknown, id: string): string {
  const b = isMap(body) ? body : {};
  const said = [b.name, b.title].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return said ? clip(said.trim(), 80) : spaced(id.slice(id.indexOf('.') + 1));
}

/** A change to one field's type, which lands by rewriting the answers under it (`api/retype.ts`). */
const retypes = (to: unknown): boolean => isMap(to) && ('retype' in to || 'narrow' in to) && !('add' in to) && !('retire' in to);

/**
 * The versions one accepted change installed, each with the version it replaced.
 *
 * FROM THE HISTORY LINE THE INSTALL WROTE, which names the question ("Proposed by Robin in SG4."), holds both
 * versions, and covers every member of a bundle. An install signed by nobody writes no line, and then the body says
 * it for a whole declaration: `from_version`, or the version whose body is `from`'s, and the next version after it,
 * made no earlier than the decision and holding exactly what `to` said. Anything less sure is not a step.
 */
function replacedBy(sql: Sql, suggestion: string, body: Record<string, unknown>, decided: Line): { id: string; installed: number; prior: number }[] {
  const said = sql.all<{ target: string; from_v: string | null; to_v: string | null }>(
    "SELECT target, from_v, to_v FROM event WHERE kind = 'declare' AND target_kind = 'declaration' AND rowid > ? AND instr(coalesce(note, ''), ?) > 0 ORDER BY rowid",
    decided.rowid,
    ` in ${suggestion}.`,
  );
  /* A LINE WITH NO `from` IS A DECLARATION THAT WAS NEW: it replaced nothing, so there is no earlier one to put back. */
  if (said.length > 0)
    /* AND A LINE WHOSE TWO VERSIONS ARE ONE IS A RETIRE (`retire` in `index.ts`), which made no version to go back from. */
    return said.flatMap((e) =>
      e.from_v === null || e.to_v === null || e.from_v === e.to_v ? [] : [{ id: e.target.slice('declaration:'.length), installed: Number(e.to_v), prior: Number(e.from_v) }],
    );
  const id = body.declaration_id;
  const to = body.to;
  if (typeof id !== 'string' || !isMap(to) || to.id !== id || !isMap(to.body)) return [];
  const from = body.from;
  const prior =
    typeof body.from_version === 'number'
      ? body.from_version
      : isMap(from) && isMap(from.body)
        ? (sql.one<{ v: number | null }>('SELECT MAX(version) AS v FROM declaration WHERE id = ? AND body = ? AND superseded_at IS NOT NULL', id, jcs(from.body as Json))?.v ?? null)
        : null;
  if (prior === null) return [];
  const next = sql.one<{ version: number; body: string }>(
    'SELECT version, body FROM declaration WHERE id = ? AND version > ? AND created_at >= ? ORDER BY version LIMIT 1',
    id,
    prior,
    decided.ts,
  );
  return next && next.body === jcs(to.body as Json) ? [{ id, installed: next.version, prior }] : [];
}

/** The name of a list a declaration reads that this record no longer holds, or `null` when every one is there. */
function goneList(sql: Sql, kind: string, body: unknown): string | null {
  if (kind === 'register' || !isMap(body)) return null;
  const needs = [
    ...(Array.isArray(body.requires) ? body.requires.filter((r): r is string => typeof r === 'string' && r.startsWith('register.')).map((r) => r.slice('register.'.length)) : []),
    ...(typeof body.register === 'string' ? [body.register] : []),
  ];
  for (const r of new Set(needs)) {
    const held = sql.one<{ body: string; live: number }>(
      'SELECT body, (superseded_at IS NULL AND retired = 0) AS live FROM declaration WHERE id = ? ORDER BY version DESC LIMIT 1',
      `register.${r}`,
    );
    if (held?.live === 1) continue;
    return held ? declName(parse(held.body), `register.${r}`) : spaced(r);
  }
  return null;
}

/**
 * The field of a list that the earlier version does not have and that holds answers now, as a person reads it, or
 * `null`. Putting the list back would leave those answers with no field to show under, and nothing would say so.
 */
function filledSince(sql: Sql, was: unknown, now: unknown): string | null {
  if (!isMap(was) || !isMap(now) || typeof now.id !== 'string') return null;
  const ids = (body: Record<string, unknown>): FieldShape[] =>
    (Array.isArray(body.fields) ? body.fields : []).filter((f): f is FieldShape => isMap(f) && typeof f.id === 'string' && /^[a-z][a-z0-9_]*$/.test(f.id));
  const had = new Set(ids(was).map((f) => f.id));
  for (const f of ids(now)) {
    if (had.has(f.id) || f.retired === true) continue;
    const filled = sql.one("SELECT 1 AS y FROM entry WHERE register = ? AND deleted_at IS NULL AND coalesce(json_type(fields, ?), 'null') <> 'null' LIMIT 1", now.id, `$.${f.id}`);
    if (filled) return labelOf(f);
  }
  return null;
}

/**
 * The declarations the scope's accepted changes replaced and that can go back, each as one step; one that cannot is
 * handed to `skip` with why, in the order the checks are written: it is somebody else's now, it is gone, or there is
 * no whole earlier version to install.
 *
 * NOTHING IS REWRITTEN. The step installs the earlier body as the next version, so the version the change made stays
 * in the table, superseded, beside the one it replaced.
 */
function declaredIn(sql: Sql, lines: readonly Line[], opts: UndoOptions, skip: (title: string, why: string) => void): Declared[] {
  const out: Declared[] = [];
  const at = (id: string, version: number): HeldDecl | undefined => sql.one<HeldDecl>(`SELECT ${DECL} FROM declaration WHERE id = ? AND version = ?`, id, version);
  for (const l of lines) {
    if (l.kind !== 'resolve' || l.to_v !== 'addressed' || !l.target?.startsWith('suggestion:')) continue;
    const suggestion = l.target.slice('suggestion:'.length);
    const asked = sql.one<{ kind: string; body: string }>('SELECT body_kind AS kind, body FROM suggestion WHERE id = ?', suggestion);
    const body = asked?.kind === 'change' ? parse(asked.body) : null;
    if (!isMap(body)) continue;
    const decision = lines.find((d) => d.kind === 'decide' && keyOf(d) === keyOf(l) && d.target?.startsWith('decision:'))?.target?.slice('decision:'.length);
    const question = decision === undefined ? null : (sql.one<{ q: string | null }>('SELECT question AS q FROM decision WHERE id = ?', decision)?.q ?? null);
    const note = question === null || question.trim() === '' ? `${DECLARED_BACK}.` : `${DECLARED_BACK} of the answer to "${clip(question.trim(), 160)}"`;

    for (const c of replacedBy(sql, suggestion, body, l)) {
      const target = `declaration:${c.id}`;
      const live = sql.one<HeldDecl>(`SELECT ${DECL} FROM declaration WHERE id = ? AND superseded_at IS NULL ORDER BY version DESC LIMIT 1`, c.id);
      if (!live || !at(c.id, c.installed)) continue;
      const now = parse(live.body);
      /* A LIST SHE CANNOT READ is left out without a word, as its rows are. */
      if (opts.reads && live.kind === 'register' && !opts.reads(isMap(now) && typeof now.id === 'string' ? now.id : c.id.slice('register.'.length))) continue;
      /* PUT BACK ALREADY: an undo's own line stands on the version this change installed. */
      if (sql.one("SELECT 1 AS y FROM event WHERE kind = 'declare' AND target = ? AND from_v = ? AND note LIKE ? LIMIT 1", target, String(c.installed), `${DECLARED_BACK}%`)) continue;

      const title = declName(now, c.id);
      if (retypes(body.to)) {
        skip(title, 'this changed what kind of answer one of its fields takes and rewrote the answers already there, which is not put back from here');
        continue;
      }
      if (live.version !== c.installed) {
        const by = sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'declare' AND target = ? AND to_v = ? ORDER BY rowid DESC LIMIT 1", target, String(live.version))?.actor;
        skip(title, `${by ? `${whoIn(sql, by)} has changed it` : 'it has been changed'} again since, and putting this back would undo that as well`);
        continue;
      }
      if (live.retired) {
        skip(title, 'it has been taken out since');
        continue;
      }
      const prior = at(c.id, c.prior);
      if (!prior) {
        skip(title, 'BrainDog no longer holds how it read before');
        continue;
      }
      if (erasedOrWithheld(prior.body)) {
        skip(title, 'part of how it read before has been erased or is withheld, so there is no whole copy to put back');
        continue;
      }
      if (prior.retired) {
        skip(title, 'it was out of use before this change, and taking it out again is not done from here');
        continue;
      }
      const was = parse(prior.body);
      const filled = prior.kind === 'register' ? filledSince(sql, was, now) : null;
      if (filled !== null) {
        skip(title, `putting it back would take ${named(filled)} off the list, and that holds answers now`);
        continue;
      }
      const gone = goneList(sql, prior.kind, was);
      if (gone !== null) {
        skip(title, `the list it reads, ${named(gone)}, is no longer here`);
        continue;
      }
      const word = KIND_WORD[live.kind] ?? live.kind;
      const before = declName(was, c.id);
      const line =
        before === title
          ? `Puts the ${word} ${named(title)} back to how it read before this change.`
          : `Puts the ${word} ${named(title)} back to how it read before this change, as ${named(before)}.`;
      out.push({
        suggestion,
        key: keyOf(l),
        id: c.id,
        kind: prior.kind,
        pack: prior.pack,
        installed: c.installed,
        prior: c.prior,
        body: prior.body,
        note: clip(note, 280),
        step: { do: 'declare', title, label: word, ...(before === title ? {} : { from: before, to: title }), line },
      });
    }
  }
  return out;
}

/** The note on what an undo writes, which is how a row says it was put back. */
const PUT_BACK = 'Put back by an undo.';

const rank = (w: Work): number => (w.remove ? 2 : w.restore ? 0 : 1);

/* ── what the writes sent, or were about to ──────────────────────────────── */

/**
 * The messages the undone writes queued, matched to them since an outbox row carries no batch: one naming the batch or
 * one of its rows the plan puts back or finds already back (a rule's call), never one it leaves as somebody made it, and an interrupt's email and push, queued in the same moment as the rule's urgent
 * note, whose words the rule also wrote into the batch. Only what leaves the record to reach a person or another app:
 * an embedding or a model's draft is the record's own work and is not stopped.
 *
 * STOPPED IS `done` WITH THE MOMENT IT WAS STOPPED IN ITS PAYLOAD, the way an erased one is `done` (`0001`'s schedule
 * note: there is no `cancelled`), and the retry that would have put a failed one back is closed with it.
 */
function stopsOf(sql: Sql, lines: readonly Line[], keys: readonly string[], undoes: (row: string) => boolean, skipped: UndoSkip[], only: string | null): Stop[] {
  if (lines.length === 0) return [];
  const first = lines[0]!.ts;
  const lastMs = Date.parse(lines[lines.length - 1]!.ts);
  const until = new Date((Number.isNaN(lastMs) ? Date.parse(first) : lastMs) + WINDOW_MS).toISOString();
  const queued = sql.all<{ id: string; kind: string; payload: string; state: string; created: string }>(
    "SELECT id, kind, payload, state, created FROM outbox WHERE created >= ? AND created <= ? AND kind IN ('notify.email','notify.push','notify.webhook','pull.fetch') ORDER BY created, id",
    first,
    until,
  );
  if (queued.length === 0) return [];
  const keySet = new Set(keys);
  const said = new Set(lines.filter((l) => l.kind === 'note' && l.note !== null).map((l) => l.note!));
  const actors = new Set(lines.map((l) => l.actor));
  /* THE INTERRUPTS: an urgent note with no row, by one of the undone writers, saying what the batch said. */
  const urgent = sql
    .all<{ ts: string; actor: string; note: string | null }>("SELECT ts, actor, note FROM event WHERE kind = 'note' AND target IS NULL AND field = 'urgent' AND ts >= ? AND ts <= ?", first, until)
    .filter((u) => actors.has(u.actor) && u.note !== null && said.has(u.note))
    .map((u) => Date.parse(u.ts));
  const near = (created: string): boolean => urgent.some((t) => Math.abs(Date.parse(created) - t) <= WINDOW_MS);

  const out: Stop[] = [];
  for (const q of queued) {
    const p = parse(q.payload);
    const body = isMap(p) ? p : {};
    if (body.cancelled !== undefined) continue;
    /* ONLY THIS ONE stops what that row queued, and nothing the batch or an interrupt queued for all of it. */
    const ours =
      only !== null
        ? body.entry === only && undoes(only)
        : (typeof body.batch === 'string' && keySet.has(body.batch)) ||
          (typeof body.entry === 'string' && undoes(body.entry)) ||
          ((q.kind === 'notify.email' || q.kind === 'notify.push') && near(q.created));
    if (!ours) continue;
    const what =
      q.kind === 'notify.email'
        ? `the email ${typeof body.subject === 'string' ? `"${clip(body.subject, 60)}"` : 'it queued'}`
        : q.kind === 'notify.push'
          ? 'a phone alert'
          : q.kind === 'notify.webhook'
            ? 'a message to another app'
            : 'a call to another app';
    if (q.state === 'pending' || q.state === 'failed')
      out.push({ id: q.id, state: q.state, step: { do: 'stop', title: what, line: `Stops ${what} before it goes out.` } });
    else if (q.state === 'leased') skipped.push({ title: what, why: 'it is already on its way', line: `Leaves ${what}: it is already on its way.` });
    else if (q.state === 'done') skipped.push({ title: what, why: 'it has already gone out', line: `Leaves ${what}: it has already gone out.` });
  }
  return out;
}

/** How far from the undone writes a message they queued can be stamped, since the outbox reads the clock again. */
const WINDOW_MS = 5_000;

/* ── applying it ─────────────────────────────────────────────────────────── */

/**
 * Put back what `undoPlan` showed for `scope`, as `actor`, when `hash` is still what it would do.
 *
 * ONE TRANSACTION AND ONE BATCH. A step the write path refuses when it comes to it (a value that no longer fits, a row
 * another still points at) is rolled back on its own and answered among `skipped` with the write path's sentence, so
 * one row that cannot go back does not hold back the rest the person agreed to.
 */
/** What changed together goes back together: the plan's declarations, by the question that changed them. */
function byQuestion(declares: readonly Declared[]): Map<string, Declared[]> {
  const out = new Map<string, Declared[]>();
  for (const d of declares) out.set(d.suggestion, [...(out.get(d.suggestion) ?? []), d]);
  return out;
}

/**
 * Make ready the declarations an undo of `scope` would put back: each earlier body checked and hashed through `stage`
 * against the record as it is now. Writes nothing. Its answer goes to `undoApply`, which writes inside its own
 * transaction, so the declaration, the rows and the marks land together or not at all.
 *
 * A REFUSAL IS KEPT, NOT ANSWERED: the earlier version of a page may name a field that has gone since, and the undo
 * then leaves that one with the check's own sentence and still puts back the rest the person agreed to.
 */
export async function undoStaged(sql: Sql, stage: UndoStage, scope: UndoScope, opts: UndoOptions = {}): Promise<Result<UndoDeclared>> {
  const got = worked(sql, scope, opts);
  if (!got.ok) return got;
  const ready: UndoDeclared['ready'] = new Map();
  for (const [suggestion, group] of byQuestion(got.value.declares)) {
    const batch = group.map((d): Declaration => ({ id: d.id, kind: d.kind as Declaration['kind'], body: JSON.parse(d.body) as Declaration['body'], ...(d.pack === null ? {} : { pack: d.pack }) }));
    const staged = await stage(batch);
    ready.set(suggestion, staged.ok ? { write: staged.value } : { refused: staged as Result<never> });
  }
  return ok({ ready });
}

/** What a declaration step answers when `undoApply` was handed nothing made ready for it. */
const NOT_READY = 'how it read before was not made ready to go back in, so ask for this undo again';

/**
 * `declared` IS `undoStaged`'S ANSWER FOR THIS SCOPE, and without it a declaration step is left with a sentence: the
 * rows still go back.
 */
export function undoApply(parts: UndoParts, scope: UndoScope, hash: string, actor: string, opts: UndoOptions = {}, declared?: UndoDeclared): Result<UndoApplied> {
  const { sql } = parts;
  return attempt(sql, parts.transaction, () => {
    const got = worked(sql, scope, opts);
    if (!got.ok) return got;
    const { plan, work, stops, declares, visuals, files, keys, lines, every, decisions } = got.value;
    if (typeof hash !== 'string' || hash !== plan.hash)
      return no<UndoApplied>('PLAN_STALE', 'Something changed since this undo was shown. Look at it again, then put it back.', { at: 'hash' });

    const batch = parts.mint();
    const at = new Date(parts.clock.now()).toISOString();
    const w = { actor, batch, cascade: false, note: PUT_BACK };
    const done: UndoStep[] = [];
    const skipped = [...plan.skipped];
    const put: Line[] = [];

    const versionOf = (id: string): number => Number(sql.one<{ v: number }>('SELECT version AS v FROM entry WHERE id = ?', id)?.v ?? 0);
    for (const one of work) {
      const wrote = attempt(sql, parts.transaction, (): Result<null> => {
        let version = one.version;
        if (one.restore) {
          const back = parts.write(one.register, one.id, { deleted_at: null }, { ...w, version });
          if (!back.ok) return back as Result<never>;
          version = versionOf(one.id);
        }
        if (Object.keys(one.patch).length > 0 || one.stamp !== undefined) {
          const writes = one.decided === true ? (parts.decidedWrite ?? parts.write) : parts.write;
          const set = writes(one.register, one.id, one.patch, { ...w, version, ...(one.stamp === undefined ? {} : { stamp: one.stamp }) });
          if (!set.ok) return set as Result<never>;
          version = versionOf(one.id);
        }
        if (one.remove) {
          const gone = parts.write(one.register, one.id, { deleted_at: at }, { ...w, version });
          if (!gone.ok) return gone as Result<never>;
        }
        return ok(null);
      });
      if (wrote.ok) {
        done.push(...one.steps);
        put.push(...one.from);
      } else {
        const title = one.steps[0]?.title ?? SOMETHING;
        const why = refusalWords(sql, wrote, title);
        skipped.push({ row: one.id, title, why, line: `Leaves ${named(title)} as it is: ${why}.` });
      }
    }

    /* ── a filing taken back puts its mail back in the inbox (audit 10k, AK12) ──
       `triage` files an arrival as a row and marks it `matched` in the same batch (the kernel's `fileArrival`). Undoing
       that batch took the row away and left the mail marked filed, so the inbox said "1 filed" of a row that was gone and
       the arrival could not be filed again. Once the row is put back, the arrival goes back to where it was filed from,
       with a `state` line of its own, as `returnArrival` writes one; an arrival moved on since is left as it is. */
    const putKeys = new Set(put.map(keyOf));
    for (const l of every) {
      if (l.kind !== 'state' || l.target === null || !l.target.startsWith('inbox_raw:') || !putKeys.has(keyOf(l))) continue;
      const to = parse(l.to_v);
      const from = parse(l.from_v);
      if (to !== 'matched' || (from !== 'untriaged' && from !== 'review')) continue;
      const id = l.target.slice('inbox_raw:'.length);
      const now = sql.one<{ state: string }>('SELECT state FROM inbox_raw WHERE id = ?', id)?.state;
      if (now !== 'matched') continue;
      slashMayWrite(actor, 'state');
      sql.exec('UPDATE inbox_raw SET state = ? WHERE id = ?', from, id);
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch) VALUES (?, ?, ?, 'state', ?, 'inbox_raw', 'state', ?, ?, ?, ?)",
        parts.mint(),
        at,
        actor,
        l.target,
        jcs('matched'),
        jcs(from),
        'Filing undone; in the inbox again.',
        batch,
      );
      /* AND THE QUESTION ITS FILING LET GO OF IT FROM HOLDS IT AGAIN (RL10). */
      askAgainLetGo(sql, () => parts.mint(), at, every.filter((e) => e.batch === l.batch), id, actor, batch);
      /* AND A QUESTION ITS FILING CLOSED SO ITS MAIL WAS ASKED ONE AT A TIME (RM4) asks this mail on its own again. */
      if (every.some((e) => e.batch === l.batch && e.kind === 'resolve' && e.to_v === 'moot' && typeof e.note === 'string' && e.note.startsWith(ONE_AT_A_TIME)))
        parts.askMail?.(id);
    }

    /* ── the declarations, each question's together: the earlier bodies as new versions, and a history line each ── */
    const declaredBack = new Set<string>();
    for (const [suggestion, group] of byQuestion(declares)) {
      const ready = declared?.ready.get(suggestion);
      const wrote: Result<null> =
        ready === undefined
          ? no('PLAN_STALE', NOT_READY, { at: 'declared' })
          : 'refused' in ready
            ? ready.refused
            : attempt(sql, parts.transaction, (): Result<null> => {
                const put = ready.write();
                if (!put.ok) return put as Result<never>;
                for (const d of group) {
                  /* WHAT IS LIVE NOW MUST BE A NEWER VERSION HOLDING THE EARLIER BODY, or the write was not this one's. */
                  const live = sql.one<HeldDecl>(`SELECT ${DECL} FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1`, d.id);
                  if (!live || live.version <= d.installed || live.body !== d.body) return no('PLAN_STALE', 'it did not go back to how it read before', { at: 'declared' });
                  slashMayWrite(actor, 'declare', live);
                  sql.exec(
                    "INSERT INTO event (id, ts, actor, kind, target, target_kind, from_v, to_v, note, batch) VALUES (?, ?, ?, 'declare', ?, 'declaration', ?, ?, ?, ?)",
                    parts.mint(),
                    at,
                    actor,
                    `declaration:${d.id}`,
                    String(d.installed),
                    String(live.version),
                    d.note,
                    batch,
                  );
                }
                return ok(null);
              });
      for (const d of group) {
        if (wrote.ok) {
          done.push(d.step);
          declaredBack.add(d.key);
        } else {
          const why = refusalWords(sql, wrote, d.step.title);
          skipped.push({ title: d.step.title, why, line: `Leaves ${named(d.step.title)} as it is: ${why}.` });
        }
      }
    }

    /* ── the visuals, each one line saying the version it stands at again, or that it is taken away ── */
    const picturedBack = new Set<string>();
    for (const v of visuals) {
      slashMayWrite(actor, 'note');
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note, batch) VALUES (?, ?, ?, 'note', ?, ?, ?, ?, ?, ?)",
        parts.mint(),
        at,
        actor,
        v.target,
        v.target.slice(0, v.target.indexOf(':')),
        v.field,
        jcs({ ...(v.back === null ? { gone: true } : { back: v.back }), ...(v.draft === null ? {} : { draft: v.draft }) } as Json),
        PUT_BACK,
        batch,
      );
      done.push(v.step);
      for (const k of v.keys) picturedBack.add(k);
    }

    /* ── the files, each a line or two: off, or back at the version it stood at, and its old name ── */
    for (const f of files) {
      slashMayWrite(actor, 'note');
      for (const said of f.says)
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note, batch) VALUES (?, ?, ?, 'note', ?, ?, ?, ?, ?, ?)",
          parts.mint(),
          at,
          actor,
          f.target,
          f.target.slice(0, f.target.indexOf(':')),
          f.field,
          jcs(said as Json),
          PUT_BACK,
          batch,
        );
      done.push(f.step);
      for (const k of f.keys) picturedBack.add(k);
    }

    for (const s of stops) {
      sql.exec("UPDATE outbox SET state = 'done', leased_until = NULL, payload = json_set(payload, '$.cancelled', ?) WHERE id = ? AND state IN ('pending','failed')", at, s.id);
      sql.exec("UPDATE schedule SET state = 'done' WHERE kind = 'retry' AND key = ? AND state IN ('pending','failed','paused')", `outbox:${s.id}`);
      done.push(s.step);
    }

    /* ── the ladder's marks, per batch that had something put back ── */
    const kinds = new Map<string, Set<string>>();
    for (const l of put) {
      const k = keyOf(l);
      const list = l.target === null ? null : sql.one<{ r: string }>('SELECT register AS r FROM entry WHERE id = ?', l.target.slice('entry:'.length))?.r;
      const kind = list ? kindOfEvent({ list, kind: l.kind, field: l.field, to_v: l.to_v }, shapeIn(sql, list)) : null;
      const of = kinds.get(k) ?? new Set<string>();
      if (kind) of.add(kind.key);
      kinds.set(k, of);
    }
    /* A stopped message belongs to the batches it was matched to; its batch is marked when nothing else of it was. Under
       `row`, that is the batches that wrote the row, not every one of a run's. */
    /* A DECLARATION PUT BACK MARKS ITS DECISION'S BATCH, with the kinds its rows gave it and none of its own. */
    for (const k of declaredBack) if (!kinds.has(k)) kinds.set(k, new Set());
    /* A VISUAL PUT BACK MARKS ITS BATCH THE SAME WAY, with no kind: a visual changes no value, so no rung climbed on it. */
    for (const k of picturedBack) if (!kinds.has(k)) kinds.set(k, new Set());
    if (stops.length > 0 && kinds.size === 0) for (const k of scope.row === undefined ? keys : [...new Set(lines.map(keyOf))]) kinds.set(k, new Set());
    /* A SECOND UNDO OF THE SAME BATCH, putting back what the first left, adds its kinds to the mark the first made: the
       ladder reads one line per batch, and a kind put back later is as undone as one put back first. Who made it and
       the undo that first marked it stay as they were. */
    const undone: UndoneMark[] = [];
    for (const k of keys) {
      const of = kinds.get(k);
      if (!of) continue;
      const by = makerOf(sql, k, every);
      const mark: UndoneMark = { batch: k, actor: by, agent: by === null ? null : agentOf(sql, by), kinds: [...of].sort() };
      undone.push(mark);
      const had = sql.one<{ kinds: string | null }>('SELECT kinds FROM undone WHERE batch = ?', k);
      const was = had?.kinds ? parse(had.kinds) : [];
      const all = [...new Set([...(Array.isArray(was) ? was.filter((x): x is string => typeof x === 'string') : []), ...mark.kinds])].sort();
      sql.exec(
        'INSERT INTO undone (batch, by_batch, actor, agent, kinds, undone_by, at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (batch) DO UPDATE SET kinds = excluded.kinds',
        k,
        batch,
        mark.actor,
        mark.agent,
        JSON.stringify(all),
        actor,
        at,
      );
    }

    const count = done.length;
    const say =
      count === 0
        ? 'Nothing was put back.'
        : `Put back ${count === 1 ? 'one change' : `${count} changes`}.${skipped.length > 0 ? ` Left ${skipped.length === 1 ? 'one as it was' : `${skipped.length} as they were`}.` : ''}`;

    /* ── one note where the change came from: the run's own row, and the decision ── */
    if (count > 0) {
      slashMayWrite(actor, 'note');
      const note = clip(`${whoOf(sql, actor)} undid this. ${say}`, 280);
      const runs = new Set(undone.map((u) => u.actor).filter((a): a is string => a !== null && RUN.test(a)));
      if ('run' in scope) runs.add(scope.run.trim());
      for (const run of runs) {
        const row = sql.one<{ id: string }>('SELECT id FROM entry WHERE register = ? AND seq = ?', SESSION, Number(run.slice(SESSION_PREFIX.length)));
        if (row) noteOn(sql, parts.mint(), at, actor, `entry:${row.id}`, 'entry', note, batch);
      }
      for (const d of decisions) noteOn(sql, parts.mint(), at, actor, `decision:${d}`, 'decision', note, batch);
    }

    /* ── the question a decision answered: asked again when all of it went back, and marked undone when some stayed ──
       UNDER `row` THE REST OF IT STAYS, so the question reads undone in part, and is asked again only when this row was
       the last of it left to put back. */
    const asked = count > 0 ? answered(sql, every) : [];
    const { row: one, ...all } = scope;
    const rest = one === undefined || asked.length === 0 ? null : worked(sql, all as UndoScope, opts);
    /* A QUESTION WHOSE DECLARATION WENT BACK READS UNDONE AND IS NOT ASKED AGAIN: it was drawn against a version that
       is history now, so a yes to it could never land. */
    const whole = declaredBack.size === 0 && skipped.length === 0 && (rest === null || (rest.ok && rest.value.plan.steps.length === 0 && rest.value.plan.skipped.length === 0));
    for (const q of asked) {
      if (!whole && q.as === 'undone') continue;
      if (whole) {
        /* A NEWER OPEN QUESTION MAY HOLD ITS CAUSE NOW, and one open question holds a cause at a time (migration 31): this one
           reopens without it, as govern.ts's `reopen` does. */
        sql.exec(
          `UPDATE suggestion SET status = 'open', resolved_as = NULL, defer_until = NULL, defer_why = NULL,
             cause = CASE WHEN EXISTS (SELECT 1 FROM suggestion o WHERE o.status = 'open' AND o.cause = suggestion.cause AND o.id <> suggestion.id) THEN NULL ELSE cause END
           WHERE id = ?`,
          q.id,
        );
        readAgain(sql, q.id, every);
        /* A REOPENED "which account" QUESTION HOLDS ITS TEXTS AGAIN at once, not at the next text. */
        reopenedTail(sql, q.id);
      } else sql.exec("UPDATE suggestion SET resolved_as = 'undone' WHERE id = ?", q.id);
      governLine(sql, parts.mint(), at, actor, whole ? 'suggest' : 'resolve', q.id, whole ? 'reopened' : 'undone', batch);
    }
    const again = asked.length > 0 && whole ? [ASKED_AGAIN] : [];

    return ok({ batch, put: count, say, lines: [...done.map((s) => s.line), ...skipped.map((s) => s.line), ...again], skipped, undone });
  });
}

/**
 * Who made a batch, for the ladder: for a decision, whoever filed the question it answered (the agent that drafted
 * the rows), and otherwise whoever wrote its first line.
 */
function makerOf(sql: Sql, key: string, lines: readonly Line[]): string | null {
  /* NOT A QUESTION CLOSED AS MOOT BESIDE IT, such as the mail door's own question a filing settles: that one was not
     the answer, and its asker did not make the batch. */
  const resolved = lines.find((l) => keyOf(l) === key && l.kind === 'resolve' && l.to_v !== 'moot' && l.target?.startsWith('suggestion:'));
  if (resolved) {
    const by = sql.one<{ by: string }>('SELECT opened_by AS by FROM suggestion WHERE id = ?', resolved.target!.slice('suggestion:'.length))?.by;
    if (by) return by;
  }
  return lines.find((l) => keyOf(l) === key)?.actor ?? null;
}

/** What a plan and an undo say of a question that goes back to Decide. */
const ASKED_AGAIN = 'Puts the question back in Decide.';

/**
 * The questions the lines' decisions answered and that still read as accepted, or as partly undone by an earlier undo:
 * the ones an undo of them reopens, each with how it reads now.
 *
 * WITHOUT THIS DECIDE SHOWED IT DECIDED. Only `entry:` lines are walked, so the rows an accepted question wrote went
 * back and the question stayed resolved, and the record said both that it was undone and that it was decided. A second
 * undo that puts back what the first left reopens it too.
 */
function answered(sql: Sql, lines: readonly Line[]): { id: string; as: string }[] {
  /* AND THE QUESTIONS IT COVERED, closed as moot in its batch with `COVERED`'s line: asked again with it. */
  const covered = (l: Line): boolean => l.to_v === 'moot' && typeof l.note === 'string' && l.note.startsWith(COVERED);
  const ids = [
    ...new Set(
      lines.filter((l) => l.kind === 'resolve' && (l.to_v === 'addressed' || covered(l)) && l.target?.startsWith('suggestion:')).map((l) => l.target!.slice('suggestion:'.length)),
    ),
  ];
  return ids.flatMap((id) => {
    const q = sql.one<{ r: string }>("SELECT resolved_as AS r FROM suggestion WHERE id = ? AND status = 'resolved' AND resolved_as IN ('addressed', 'undone', 'moot')", id);
    return q ? [{ id, as: q.r }] : [];
  });
}

/**
 * A rowset question asked again, read at the versions its rows hold now, so a yes to it can land.
 *
 * WITHOUT THIS EVERY REOPENED ROWSET WAS STALE. Each update row carries the version it was read at, the decision's
 * writes moved it on, and so did the undo's, so accepting the question again was refused as changed since, with nothing
 * the person could do but wait for it to be asked anew. A row is read again only when the decision wrote it and it holds
 * now, field by field of the patch, what it held before the decision: what the decision changed is back to what it was
 * before, a list it tagged or untagged is whole what it was before, and a field it left alone still holds the value the
 * patch asks for. A row somebody has changed in a way the question never saw keeps its old version, and stays refused.
 */
function readAgain(sql: Sql, id: string, lines: readonly Line[]): void {
  const asked = sql.one<{ kind: string; body: string }>('SELECT body_kind AS kind, body FROM suggestion WHERE id = ?', id);
  const body = asked?.kind === 'rowset' ? parse(asked.body) : null;
  if (!isMap(body) || typeof body.register !== 'string' || !Array.isArray(body.rows)) return;
  const answer = lines.find((l) => l.kind === 'resolve' && l.to_v === 'addressed' && l.target === `suggestion:${id}`);
  if (!answer) return;
  const key = keyOf(answer);
  const theirs = lines.filter((l) => keyOf(l) === key && l.target?.startsWith('entry:'));
  const rows = [...rowsOf(sql, [...new Set(theirs.map((l) => l.target!.slice('entry:'.length)))]).values()].filter((r) => r.register === body.register);
  if (rows.length === 0) return;
  /* A ROW AS A BODY NAMES ONE: its id, `tasks#3`, or its list's own prefix, `LN3`. */
  const prefix = sql.one<{ p: string | null }>(
    "SELECT json_extract(body, '$.seq_prefix') AS p FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND json_extract(body, '$.id') = ? ORDER BY version DESC LIMIT 1",
    body.register,
  )?.p;
  const named = (at: string): Held | undefined =>
    rows.find((r) => at === r.id || at === `${r.register}#${r.seq}` || (typeof prefix === 'string' && prefix !== '#' && at === `${prefix}${r.seq}`));

  let moved = false;
  const fresh = body.rows.map((one: unknown) => {
    if (!isMap(one) || typeof one.at !== 'string' || !isMap(one.patch)) return one;
    const row = named(one.at.trim());
    if (!row || row.deleted_at !== null || row.version === one.version) return one;
    const wrote = theirs.filter((l) => l.target === `entry:${row.id}`);
    const holds = Object.entries(one.patch).every(([field, asks]) => {
      /* A DELETE THE DECISION MADE is put back by the row being live, which it is. */
      if (field === 'deleted_at') return true;
      const held = row.fields[field] ?? null;
      const on = wrote.filter((l) => l.field === field);
      if (on.length === 0) return same(held, asks);
      const valued = on.find((l) => l.kind === 'edit' || l.kind === 'state' || l.kind === 'link');
      if (valued) return !erasedOrWithheld(valued.from_v) && same(held, parse(valued.from_v));
      /* A LIST IS BACK WHEN IT IS WHOLE WHAT IT WAS: the patch less what the decision tagged, plus what it took off. Only
         its own elements gone is not enough, since a yes writes the patch's whole list over anything added since. */
      if (!Array.isArray(asks)) return false;
      const was = asks.map((x) => jcs(x as Json));
      for (const l of on) {
        const said = l.kind === 'tag' ? l.to_v : l.kind === 'untag' ? l.from_v : null;
        if (said === null || erasedOrWithheld(said)) return false;
        const one = jcs(parse(said) as Json);
        if (l.kind === 'untag') was.push(one);
        else if (was.includes(one)) was.splice(was.indexOf(one), 1);
        else return false;
      }
      const list = Array.isArray(held) ? held.map((x) => jcs(x as Json)) : [];
      return jcs(list.sort() as Json) === jcs(was.sort() as Json);
    });
    if (!holds) return one;
    moved = true;
    return { ...one, version: row.version };
  });
  if (moved) sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, rows: fresh }), id);
}

/** A question's line in the log, as `govern.ts` writes a reopen (`suggest`, `reopened`) and a verdict (`resolve`). */
function governLine(sql: Sql, id: string, at: string, actor: string, kind: 'suggest' | 'resolve', suggestion: string, to: string, batch: string): void {
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note, batch) VALUES (?, ?, ?, ?, ?, 'suggestion', ?, 'Undone.', ?)",
    id,
    at,
    actor,
    kind,
    `suggestion:${suggestion}`,
    to,
    batch,
  );
}

function noteOn(sql: Sql, id: string, at: string, actor: string, target: string, kind: string, note: string, batch: string): void {
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note, batch) VALUES (?, ?, ?, 'note', ?, ?, ?, ?)",
    id,
    at,
    actor,
    target,
    kind,
    note,
    batch,
  );
}

/**
 * A write path's refusal as the end of a sentence: its own words, without the closing stop.
 *
 * IN NAMES. The write path speaks to callers and names a row by its handle ("codes#3 already has that code"), and a
 * person reads this line, so a handle becomes the row's name, or "another one" when that is the name of the row the line
 * is already about, and an id it cannot name becomes "another one" too.
 */
function refusalWords(sql: Sql, r: Result<unknown>, about: string): string {
  const fix = !r.ok && 'refusal' in r ? r.refusal.fix : 'it has changed since';
  const lists = listsOf(sql);
  const s = fix
    .trim()
    .replace(/[.\s]+$/, '')
    .replace(/\b([a-z][a-z0-9_]*)#(\d+)\b/g, (_, register: string, seq: string) => {
      const row = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND seq = ?', register, Number(seq));
      const fields = row ? parse(row.fields) : null;
      const title = isMap(fields) ? titleOf({ fields }, lists(register)) : null;
      return title === null || title === about || title.startsWith('an untitled ') ? 'another one' : named(title);
    })
    .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/g, 'another one');
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/* ── small things ────────────────────────────────────────────────────────── */

const REDACTED_MARK = '--redacted--';
const ERASED_MARK = '--erased--';

const erasedOrWithheld = (v: string | null): boolean => v !== null && (v.includes(REDACTED_MARK) || v.includes(ERASED_MARK));

function parse(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Two values as the write path compares them: absent is `null`, and order inside an object does not count. */
const same = (a: unknown, b: unknown): boolean => jcs((a ?? null) as Json) === jcs((b ?? null) as Json);

/**
 * A short fingerprint of a plan, FNV-1a over 64 bits. It tells two plans apart and is not a seal: anybody who can call
 * apply can ask for the plan, so there is nothing to forge.
 */
function digest(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
