/**
 * Undo on the server, the record's half: `undo`, one write and what it caused or one decision, and `undoRun`, everything
 * one agent's run wrote. Both ADMIN.
 *
 * WHAT IS PUT BACK AND HOW IS THE KERNEL'S (`kernel/src/undo.ts`): the plan in names, the hash of exactly what it would
 * do, and one transaction under one new batch that is itself undoable. This file decides who may ask and says the answer
 * plainly.
 *
 * AN OWNER IN A BROWSER, AND NO TOKEN OF ANY KIND (ADR-060). Undo writes to any row the change touched, a run's on every
 * list it wrote to, and taking back what an agent did is the person's call about that agent, never the agent's own: a
 * run that could undo itself could also undo the owner's correction of it.
 *
 * TWO CALLS, A LOOK AND A PRESS. `dry` answers what would be put back and what would be left, with `hash`; applying needs
 * that hash, so what lands is what was read, and the kernel refuses `PLAN_STALE` when something moved in between.
 *
 * AND THE LADDER IS TOLD (`ladder.ts`), IN THE UNDO'S OWN TRANSACTION. Every batch put back that an agent or Slash made
 * takes that agent back to Ask on the kinds it was, so a kind the owner had to undo is asked about again before it is
 * done again, and an undo that lands never leaves the ladder where it was (research-audit-20 L3). Which agent it was is
 * the ladder's, and the answer never carries it: no grant's id leaves the record.
 *
 * AND A CHANGE THE NIGHTLY WALK MADE IS PUT BACK AS THE WALK PUTS IT BACK (research-audit-20 H1). A batch every line of
 * which is signed `rule:backfill` (a slice of the walk, or the runs placed by answering its question) goes to the
 * kernel's `undoBackfill`, which unplaces a run, unlinks a payment and removes an organisation nothing else links to,
 * none of which the general undo reads. Its plan is said here in the same names and with the same hash a press needs,
 * so a row's byline and Undo on a walk's line work as on any other change.
 *
 * AND A MATCH THE RECORD MADE IS PUT BACK AS A MERGE IS PUT BACK (ENG-B04). A batch the kernel says is a fold (`isFold`)
 * is planned by `foldPlan` and put back by `undoMerge`, whole: the general undo read it line by line and gave back the
 * one carried key. The look, the hash and the answer are the same, so the tile that lists matches presses this.
 * `isFold` IS ASKED FIRST, since `foldPlan` answers a plan for a batch that holds a decision too, and that one goes back
 * by its decision. THE PRESS ANSWERS THE WRITE DOOR'S REFUSAL WHEN THERE IS ONE, said in names, because the plan is read
 * from the log and cannot foresee it. And the batch such an undo wrote is not undone from here (`unfolded`).
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { BACKFILL_ACTOR, ladderAgentOf, sessionDeclaration, ulids, type UndoApplied, type UndoPlan, type UndoRow, type UndoScope, type UndoSkip, type UndoStep } from '@braindog/kernel';

import { ladder } from '../ladder.ts';
import { isHandle, spokenOf } from '../question-handles.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What an undo answers once it is done: how many changes it put back and every line a person reads, and its own batch. */
export type Undone = Omit<UndoApplied, 'undone'>;

const said = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** The kernel's own list of runs, whose placement the walk writes by a stamp and the general undo leaves alone. */
const SESSION = (sessionDeclaration().body as unknown as { id: string }).id;

/** A short fingerprint of a plan, FNV-1a over 64 bits, as the kernel's undo prints its own. Not a seal: it tells two plans apart. */
const digest = (text: string): string => {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
};

/** `row` as an undo takes it, `{ register, seq }` with a positive whole number, or `null` for anything else. */
const rowOf = (v: unknown): UndoRow | null => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const { register, seq, ...rest } = v as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || !said(register) || typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) return null;
  return { register: register.trim(), seq };
};

/** Two stored values as the walk compares them: absent is `null`. */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function methods(deps: RecordDeps) {
  const { kernel, sql, admin, guard, readable, tail, no, clock, sight } = deps;
  const trust = ladder({ sql, kernel, now: () => clock.now() });
  /** A batch for one row put back, minted on the record's clock as the record mints every other. */
  const mint = ulids(() => clock.now());

  /** Who signs an undo: the person in the browser. */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  /**
   * Why this caller may not put a declaration back, or `null` when they may: the one who decides what the record is, an
   * owner signed in, and no token whoever holds it.
   *
   * ASKED AT THE STEP AND NOT ONLY AT THE DOOR (audit 62, claim 8). Both methods below are behind `admin`, which refuses
   * the same callers today, so this is asked twice for them. It is asked here as well because a put back that installs
   * an earlier page, rule or list is a decision about the record, and the day a door is opened to somebody else (an
   * agent taking back its own run, say) the rows may go back and this still may not. It reads the caller itself and
   * the ladder, never the door's guard, so widening the door does not widen this.
   */
  const decides = (ctx: CallContext): ReturnType<typeof guard> => {
    const sentence = 'This would put a page, a rule or a list back to how it read before, and only the owner decides that, signed in.';
    if (ctx.principal.kind === 'token') return { code: 'NEEDS_BROWSER_SESSION', fix: `${sentence} Open it from the app.`, at: 'principal' };
    /* Somebody signed in below owner is in the app already, so they are told who to ask and not where to go. */
    const stop = guard(ctx, 'owner');
    return stop === null ? null : { ...stop, fix: `${sentence} Ask the owner to put it back.` };
  };

  /**
   * The plan, or the undo applied, for one scope. Shared by both methods, which differ only in what they name.
   * `reads` leaves out a list the caller cannot read, which for an owner is none.
   */
  const run = async (scope: UndoScope, args: { dry?: unknown; hash?: unknown }, ctx: CallContext, row?: UndoRow, self = false): Promise<Result<UndoPlan | Undone>> => {
    if (args.dry !== undefined && typeof args.dry !== 'boolean') return no('VALUE_MALFORMED', 'dry is true to see what would be put back, and false or left out to put it back.', { at: 'dry' });
    const opts = { reads: (register: string) => readable(ctx, register) === null };
    const walk = 'batch' in scope && walked(scope.batch) ? scope.batch : null;
    /* A MATCH THE RECORD MADE GOES BACK AS A MERGE GOES BACK, before anything of the general undo is asked: that one
       reads the batch line by line, and a fold is put back whole or not at all. */
    if (walk === null && 'batch' in scope && kernel.isFold(scope.batch)) return foldUndo(scope.batch, args, ctx, row);
    /* AND A MATCH PUT BACK IS NOT MATCHED AGAIN FROM HERE. The batch a fold's undo wrote is not a fold, so the general
       undo would read it line by line: it deletes the one who came back and folds nobody, with no link moved and no key
       carried, which is a person lost and not a match. Refused, the look and the press alike, until the kernel can
       fold the two again by that batch. */
    if (walk === null && 'batch' in scope && unfolded(scope.batch))
      return no('NOT_IN_THIS_BUILD', 'That change put a match back, and it cannot be undone from here. If the two are one person after all, merge them from the list they are in.', { at: 'batch' });
    /* ONE ROW OF THE CHANGE WHEN `row` NAMES ONE, the kernel's undo and the walk's alike, so Undo on one line of a
       change that touched many puts back that line's row and leaves the rest (`scope.row`, `onlyRow` in the kernel). */
    if (walk === null) scope = row === undefined ? scope : { ...scope, row };
    const only = walk === null || row === undefined ? null : walkRow(walk, row, opts.reads);
    if (only !== null && !only.ok) return only;
    const one = only === null ? null : only.value;
    /* A DECLARATION GOES BACK ONLY FOR WHOEVER DECIDES, the look and the press alike, and the whole undo is refused
       rather than done in part: the plan's hash is of everything it shows, so there is no half of it to apply. The
       walk writes rows and never a declaration, and a caller who decides is not asked for a second plan. */
    const stop = walk === null ? decides(ctx) : null;
    if (stop !== null) {
      const plan = kernel.undoPlan(scope, opts);
      if (plan.ok && plan.value.steps.some((s) => s.do === 'declare')) return { ok: false, refusal: stop };
    }
    if (args.dry === true) return walk === null ? kernel.undoPlan(scope, opts) : ok(walkPlan(walk, opts.reads, one));
    if (!said(args.hash))
      return no('REQUIRED_MISSING', 'Undo shows what it will put back before it does. Ask with dry first, then send the hash it answers.', { at: 'hash' });
    const broken = kernel.refused();
    if (broken) return { ok: false, refusal: broken };
    if (walk !== null) return walkUndo(walk, args.hash, actorOf(ctx), opts.reads, one);
    /* A DECLARATION AN ACCEPTED CHANGE REPLACED IS MADE READY FIRST AND WRITTEN SECOND (batch 62): checking and hashing
       the earlier body is asynchronous and the undo is one synchronous transaction, so the kernel stages here and the
       transaction below writes what was staged with the rows and the marks. */
    const declared = await kernel.undoStage(scope, opts);
    if (!declared.ok) return declared;
    /* THE LADDER DROPS INSIDE THE UNDO'S TRANSACTION: a throw in between takes the undo back with it. */
    let out: Result<UndoApplied>;
    try {
      out = kernel.transaction(() => {
        const applied = kernel.undoApply(scope, args.hash as string, actorOf(ctx), opts, declared.value);
        /* AN AGENT TAKING BACK ITS OWN WRITE IS NOT DEMOTED FOR IT: the ladder drops for an owner's undo, not a correction. */
        if (applied.ok && !self)
          for (const mark of applied.value.undone) {
            /* A QUESTION THE LADDER LANDED (Slash's attach) is signed by the ladder, so who asked is read from the question. */
            const by = mark.agent !== null ? { agent: mark.agent, kinds: mark.kinds } : trust.landed(mark.batch);
            if (by !== null) trust.drop(by.agent, by.kinds, 'undone');
          }
        return applied;
      });
    } finally {
      /* The list cache is the table's again whether the undo landed or rolled back, as after any staged write. */
      if (declared.value.ready.size > 0) kernel.reload();
    }
    if (!out.ok) return out;
    const { undone: _marks, ...answer } = out.value;
    return tail({ ok: true, value: answer });
  };

  /* ── a match the record made ─────────────────────────────────────── */

  /** The kind a fold is on the ladder: an agent whose fold was put back asks before it folds again. */
  const FOLD_KIND = 'fold';

  /** Whether `batch` is the one a fold's undo wrote: `undone` names it as what put a fold back. */
  const unfolded = (batch: string): boolean => sql.all<{ batch: string }>('SELECT batch FROM undone WHERE by_batch = ?', batch).some((u) => kernel.isFold(u.batch));

  /**
   * The write door's refusal of a put back, said to a person. The door names a row by its handle (`people#3 already has
   * that email`), so the handle becomes the row's name, and an id it cannot name becomes "somebody else".
   */
  const doorWords = (fix: string): string =>
    fix
      .trim()
      .replace(/[.\s]+$/u, '')
      .replace(/\b([a-z][a-z0-9_]*)#(\d+)\b/gu, (_, register: string, seq: string) => {
        const row = kernel.get({ register, seq: Number(seq) });
        const title = row ? kernel.titleOfRow(row.id) : null;
        return title !== null && title.trim() !== '' ? title : 'somebody else';
      })
      .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/gu, 'somebody else');

  /** One batch read for the first time, or again: `foldPlan` answers nothing for a batch that folded nobody. */
  const foldLook = (batch: string): UndoPlan | null => {
    const plan = kernel.foldPlan(batch);
    if (plan === null) return null;
    /* PUT BACK BEFORE, AND NOTHING OF IT LEFT TO DO, is said as any undo says it. One an earlier undo put back in part
       still lists what is left, and that is what a press does. */
    if (!plan.already || plan.steps.length > 0) return { ...plan, already: false };
    return { ...plan, say: 'This was put back already.', lines: [], steps: [], skipped: [] };
  };

  /**
   * The look and the press for a fold the strong rules or the bands made (`kernel.isFold`): what `matched` lists and a
   * screen draws Undo on.
   *
   * BY `undoMerge`, NEVER LINE BY LINE. The general undo reads each line of the batch on its own, so it gave back the
   * one carried key and left the rest with "Leaves ... as it is"; the kernel's own inverse brings the one folded back
   * with their keys, empties what the one kept was carried, and points every link that moved back.
   *
   * THE SAME TWO CALLS AND THE SAME ANSWER AS ANY UNDO, so no screen changes: a plan in names with a hash, and applying
   * needs that hash against the plan read again. One of the two cannot be named: there is no half of a match to undo.
   *
   * THE LADDER DROPS INSIDE THE UNDO'S TRANSACTION, as for the general undo: whoever made the fold, when it is an agent,
   * is back at Ask on folding. The mark in `undone` is `undoMerge`'s own, which is how a second look knows it was taken back.
   */
  const foldUndo = (batch: string, args: { dry?: unknown; hash?: unknown }, ctx: CallContext, row?: UndoRow): Result<UndoPlan | Undone> | Promise<Result<Undone>> => {
    if (row !== undefined) return no('VALUE_MALFORMED', 'A match is put back whole, so both come back together. Undo it without naming one of them.', { at: 'row' });
    const plan = foldLook(batch);
    if (plan === null) return no('ROW_UNKNOWN', 'There is no match under that change, so there is nothing of it to undo.', { at: 'batch' });
    if (args.dry === true) return ok(plan);
    if (!said(args.hash))
      return no('REQUIRED_MISSING', 'Undo shows what it will put back before it does. Ask with dry first, then send the hash it answers.', { at: 'hash' });
    const broken = kernel.refused();
    if (broken) return { ok: false, refusal: broken };
    if (plan.hash !== args.hash) return no('PLAN_STALE', 'Something changed since this undo was shown. Look at it again, then put it back.', { at: 'hash' });
    if (plan.already) return ok({ batch, put: 0, say: 'Nothing was put back: it was undone already.', lines: [], skipped: [] });
    const by = actorOf(ctx);
    const out = kernel.transaction((): Result<Undone> => {
      const before = sql.one<{ n: number | null }>('SELECT max(rowid) AS n FROM event')?.n ?? 0;
      const maker = sql.one<{ actor: string | null }>('SELECT actor FROM event WHERE batch = ? OR (batch IS NULL AND id = ?) ORDER BY rowid LIMIT 1', batch, batch)?.actor ?? null;
      const put = kernel.undoMerge(batch, { actor: by });
      /* THE PLAN IS READ FROM THE LOG AND CANNOT FORESEE THE WRITE DOOR (somebody else took the address the one coming
         back held, say). `undoMerge` puts nothing back when any write of it is refused, so the door's own refusal is
         answered, its code kept and its sentence said in names, and the press never says done on the plan's word. */
      if (!put.ok) {
        if (!('refusal' in put)) return put;
        return { ok: false, refusal: { ...put.refusal, fix: `This match was not put back, and nothing changed: ${doorWords(put.refusal.fix)}. Change that first, then undo it again.` } };
      }
      /* The undo's own batch, the one its first line was written under. It is answered as any undo answers its own, and
         is not itself undone from here (`unfolded`). */
      const wrote = sql.one<{ batch: string | null; id: string }>('SELECT batch, id FROM event WHERE rowid > ? ORDER BY rowid LIMIT 1', before);
      const own = wrote === undefined ? batch : (wrote.batch ?? wrote.id);
      const agent = maker === null ? null : ladderAgentOf(sql, maker);
      /* `undoMerge` keeps its own mark in `undone` as it puts the fold back, so nothing is written there from here. */
      if (wrote !== undefined && agent !== null) trust.drop(agent, [FOLD_KIND], 'undone');
      const n = wrote === undefined ? 0 : plan.steps.length;
      /* The plan's own sentence, said as done: "Puts back 2 ..., leaves 1 as it is" is "Put back 2 .... Left 1 as it is." */
      const done = `${plan.say.replace(/^Puts /u, 'Put ').replace(/, leaves /u, '. Left ').replace(/\.$/u, '')}.`;
      return ok({ batch: own, put: n, say: n === 0 ? 'Nothing was put back: it was changed since.' : done, lines: n === 0 ? [] : plan.steps.map((s) => s.line), skipped: plan.skipped });
    });
    return out.ok ? tail(out) : out;
  };

  /**
   * The row of the walk's batch one `{ register, seq }` names, as the kernel's `onlyRow` reads one: a row in a list she
   * cannot read is one this record does not hold, and a row the batch never touched has nothing of it to put back.
   */
  const walkRow = (batch: string, row: UndoRow, reads: (register: string) => boolean): Result<string> => {
    const id = reads(row.register) ? sql.one<{ id: string }>('SELECT id FROM entry WHERE register = ? AND seq = ?', row.register, row.seq)?.id : undefined;
    if (id === undefined) return no('ROW_UNKNOWN', 'That one is not in this record, so there is nothing of it to undo.', { at: 'row' });
    if (walkLines(batch, id).length === 0) return no('ROW_UNKNOWN', 'This change did not touch that one, so there is nothing of it to undo here.', { at: 'row' });
    return ok(id);
  };

  /* ── what the nightly walk wrote ─────────────────────────────────── */

  /** Whether a batch is the walk's own: it wrote something, and every line of it is signed `rule:backfill`. */
  const walked = (batch: string): boolean =>
    sql.one('SELECT 1 AS y FROM event WHERE batch = ? AND actor = ? LIMIT 1', batch, BACKFILL_ACTOR) !== undefined &&
    sql.one('SELECT 1 AS y FROM event WHERE batch = ? AND actor <> ? LIMIT 1', batch, BACKFILL_ACTOR) === undefined;

  /** A row as a person reads it: its title, or one of its list ("a run", "a payment"), never an id. */
  const titled = (id: string, register: string): string => {
    const t = kernel.titleOfRow(id);
    if (t !== null && t.trim() !== '') return t.length > 80 ? `${t.slice(0, 79)}…` : t;
    if (register === SESSION) return 'a run';
    const one = (kernel.register(register)?.name ?? '').trim().toLowerCase().replace(/ies$/u, 'y').replace(/([^s])s$/u, '$1');
    return one === '' ? 'something' : `${/^[aeiou]/u.test(one) ? 'an' : 'a'} ${one}`;
  };

  /**
   * What putting back one walk's batch would do, in names, read the way `undoBackfill` decides it: an organisation it
   * made goes unless something links to it now, a run it placed is unplaced unless it moved since, a payment it linked is
   * unlinked while it still points where the walk pointed it, and a name it taught an organisation is forgotten. Anything
   * else is left, with why. `reads` leaves out a list the caller cannot read, which for an owner is none.
   *
   * NEWEST LINE FIRST, AS `undoBackfill` PUTS THEM BACK, so an organisation the walk made and linked payments to in the
   * same slice is read after those links are taken back, and is said as removed, which it is, and never as left. Said
   * in the order the walk wrote them.
   */
  const walkPlan = (batch: string, reads: (register: string) => boolean, only: string | null = null): UndoPlan => {
    const already = sql.one('SELECT 1 AS y FROM undone WHERE batch = ?', batch) !== undefined;
    const lines = walkLines(batch, only);
    const steps: UndoStep[] = [];
    const skipped: UndoSkip[] = [];
    const step = (s: Omit<UndoStep, 'line'>, line: string): void => void steps.push({ ...s, line });
    const leave = (row: string, title: string, why: string): void => void skipped.push({ row, title, why, line: `Leaves ${title} as it is: ${why}.` });
    /* The fields this plan puts back on each row, read first: a link one of them holds is gone by the time a row it
       points at is removed. */
    const freed = new Map<string, Set<string>>();
    /** Whether a row other than `id` still points at it once this plan has put back what it puts back. */
    const linkedTo = (id: string): boolean =>
      sql
        .all<{ id: string; fields: string }>('SELECT id, fields FROM entry WHERE deleted_at IS NULL AND id <> ? AND instr(fields, ?) > 0', id, `"${id}"`)
        .some((r) => {
          const gone = freed.get(r.id);
          if (gone === undefined) return true;
          const kept = Object.entries(JSON.parse(r.fields) as Record<string, unknown>).filter(([f]) => !gone.has(f));
          return JSON.stringify(Object.fromEntries(kept)).includes(`"${id}"`);
        });
    for (const line of already ? [] : lines) {
      const id = line.target.slice('entry:'.length);
      const row = kernel.get(id);
      if (!row || !reads(row.register)) continue;
      const title = titled(row.id, row.register);
      const list = kernel.register(row.register)?.name;
      /* EACH STEP SAYS ITS ROW AS `undo({ row })` TAKES IT BACK, so "Only this one" on a walk's line works as on any other. */
      const at = { register: row.register, ...(row.seq === null ? {} : { seq: row.seq }) };
      let to: unknown = null;
      let from: unknown = null;
      try {
        to = line.to_v === null ? null : JSON.parse(line.to_v);
        from = line.from_v === null ? null : JSON.parse(line.from_v);
      } catch {
        continue;
      }
      if (line.kind === 'create') {
        if (linkedTo(row.id)) leave(row.id, title, 'something else links to it now');
        else step({ ...at, do: 'delete', row: row.id, title, ...(list === undefined ? {} : { list }) }, `Remove ${title}${list === undefined ? '' : ` from ${list}`}`);
      } else if (line.kind === 'edit' && row.register === SESSION && (line.field === null || line.field === 'project')) {
        const held = typeof row.fields.project === 'string' && row.fields.project.trim() !== '' ? row.fields.project : null;
        if (held === null) continue;
        const since = sql.one('SELECT 1 AS y FROM event WHERE target = ? AND rowid > ? AND (batch IS NULL OR batch <> ?) LIMIT 1', line.target, line.at, batch);
        const ours = line.field === null ? !since : same(held, to);
        const project = kernel.titleOfRow(held);
        if (ours) step({ ...at, do: 'set', row: row.id, title, ...(project === null ? {} : { from: project }) }, project === null ? `Take ${title} out of its project` : `Take ${title} out of ${project}`);
        else leave(row.id, title, 'it has been moved since');
      } else if (line.kind === 'tag' && line.field !== null) {
        const held = Array.isArray(row.fields[line.field]) ? (row.fields[line.field] as unknown[]).map(String) : [];
        /* A REPOSITORY LISTED ON A PROJECT WHEN ITS QUESTION WAS ANSWERED is said by its own last name, never its host. */
        const repo = kernel.register(row.register)?.scopes?.repos === line.field ? String(to).replace(/[\\/]+$/u, '').replace(/\.git$/iu, '').split(/[\\/:]+/u).at(-1) : undefined;
        if (held.includes(String(to)))
          step({ ...at, do: 'untag', row: row.id, title }, repo ? `Take the repository ${repo} off ${title}` : `Forget a name ${title} was matched by`);
      } else if (line.kind === 'edit' && line.field !== null) {
        if (!same(row.fields[line.field], to)) {
          leave(row.id, title, 'it has been changed since');
          continue;
        }
        const spec = kernel.register(row.register)?.fields.find((f) => f.id === line.field);
        const target = spec?.type === 'ref' && typeof to === 'string' ? kernel.titleOfRow(to) : null;
        const label = typeof spec?.label === 'string' && spec.label.trim() !== '' ? spec.label.trim().toLowerCase() : (line.field ?? '').replace(/[_-]+/gu, ' ');
        /* WHAT IT HELD BEFORE COMES BACK, as `undoBackfill` writes it, so a field that had a value is never said as cleared. */
        const said = from !== null ? `Put ${label} on ${title} back as it was` : target === null ? `Clear ${label} on ${title}` : `Unlink ${title} from ${target}`;
        step({ ...at, do: 'set', row: row.id, title, ...(target === null ? {} : { from: target }) }, said);
        freed.set(row.id, (freed.get(row.id) ?? new Set<string>()).add(line.field));
      }
    }
    steps.reverse();
    skipped.reverse();
    const n = steps.length;
    const m = skipped.length;
    const say = already
      ? 'This was put back already.'
      : `${n === 0 ? 'Puts nothing back.' : n === 1 ? 'Puts back 1 change.' : `Puts back ${n} changes.`}${m === 0 ? '' : m === 1 ? ' Leaves 1 as it is.' : ` Leaves ${m} as they are.`}`;
    const hash = digest(JSON.stringify({ batch, only, already, steps: steps.map((s) => [s.do, s.row, s.line]), skipped: skipped.map((s) => [s.row, s.why]) }));
    return { say, lines: [...steps.map((s) => s.line), ...skipped.map((s) => s.line)], steps, skipped, notes: 0, hash, already };
  };

  /** The walk's own lines of one batch, newest first, and only those on one row when `only` names it. */
  const walkLines = (batch: string, only: string | null) =>
    sql.all<{ at: number; kind: string; target: string; field: string | null; from_v: string | null; to_v: string | null }>(
      `SELECT rowid AS at, kind, target, field, from_v, to_v FROM event WHERE batch = ? AND actor = ? AND ${only === null ? "target LIKE 'entry:%'" : 'target = ?'} ORDER BY rowid DESC`,
      batch,
      BACKFILL_ACTOR,
      ...(only === null ? [] : [`entry:${only}`]),
    );

  /**
   * SOME ROWS OF THE WALK'S BATCH PUT BACK, as `undoBackfill` puts back each of its lines, newest first, in one
   * transaction and one batch of its own signed as the walk's, so the rest of the batch stays and can still be put back
   * later. The batch is not marked undone, since not all of it is. For one row a person picked, and for every row the
   * plan listed when the batch also wrote to a list the caller does not read (`walkUndo`).
   */
  const walkRowsUndo = (batch: string, only: ReadonlySet<string>): number =>
    kernel.transaction(() => {
      let minted: string | null = null;
      let undone = 0;
      const w = (version: number) => ({ actor: BACKFILL_ACTOR, batch: (minted ??= mint()), cascade: false, version });
      const lines = only.size === 1 ? walkLines(batch, [...only][0]!) : walkLines(batch, null).filter((l) => only.has(l.target.slice('entry:'.length)));
      for (const line of lines) {
        const r = kernel.get(line.target.slice('entry:'.length));
        if (!r) continue;
        let to: unknown = null;
        let was: unknown = null;
        try {
          to = line.to_v === null ? null : JSON.parse(line.to_v);
          was = line.from_v === null ? null : JSON.parse(line.from_v);
        } catch {
          continue;
        }
        let out: { ok: boolean } | null = null;
        if (line.kind === 'create') {
          if (!sql.one('SELECT 1 AS y FROM entry WHERE deleted_at IS NULL AND id <> ? AND instr(fields, ?) > 0 LIMIT 1', r.id, `"${r.id}"`))
            out = kernel.write(r.register, r.id, { deleted_at: new Date(clock.now()).toISOString() } as never, w(r.version));
        } else if (line.kind === 'edit' && r.register === SESSION && (line.field === null || line.field === 'project')) {
          const since = sql.one('SELECT 1 AS y FROM event WHERE target = ? AND rowid > ? AND (batch IS NULL OR batch <> ?) LIMIT 1', line.target, line.at, batch);
          const ours = line.field === null ? !since : same(r.fields.project, to);
          if (ours && said(r.fields.project)) out = kernel.write(r.register, r.id, {}, { ...w(r.version), stamp: { project: null } });
        } else if (line.kind === 'tag' && line.field !== null) {
          const held = Array.isArray(r.fields[line.field]) ? (r.fields[line.field] as unknown[]).map(String) : [];
          if (held.includes(String(to))) out = kernel.write(r.register, r.id, { [line.field]: held.filter((k) => k !== String(to)) } as never, w(r.version));
        } else if (line.kind === 'edit' && line.field !== null) {
          if (same(r.fields[line.field], to)) out = kernel.write(r.register, r.id, { [line.field]: was } as never, w(r.version));
        }
        if (out?.ok) undone += 1;
      }
      return undone;
    });

  /** The walk's batch put back by the kernel's own inverse, once the plan read is still the plan. */
  const walkUndo = async (batch: string, hash: string, by: string, reads: (register: string) => boolean, only: string | null = null): Promise<Result<Undone>> => {
    const plan = walkPlan(batch, reads, only);
    if (plan.hash !== hash) return no('PLAN_STALE', 'Something changed since this undo was shown. Look at it again, then put it back.', { at: 'hash' });
    if (plan.already) return ok({ batch, put: 0, say: 'Nothing was put back: it was undone already.', lines: [], skipped: [] });
    /* ONLY THE LINES THE PLAN LISTED (research-audit-22 L1): a batch that also wrote to a list the caller does not read
       is put back row by row, those rows alone, and `undoBackfill`, which reads every list, is not asked. */
    const hidden = only === null && walkLines(batch, null).some((l) => {
      const r = kernel.get(l.target.slice('entry:'.length));
      return r !== null && !reads(r.register);
    });
    if (only !== null || hidden) {
      const rows = new Set(plan.steps.flatMap((s) => (s.row === undefined ? [] : [s.row])));
      const put = rows.size === 0 ? 0 : walkRowsUndo(batch, rows);
      return tail({
        ok: true as const,
        value: { batch, put, say: put === 0 ? 'Nothing was put back: it was changed since.' : put === 1 ? 'Put back 1 change.' : `Put back ${put} changes.`, lines: plan.steps.map((s) => s.line), skipped: plan.skipped },
      });
    }
    const out = kernel.undoBackfill(batch, by);
    if (!out.ok) return out;
    const put = out.value.undone;
    return tail({
      ok: true as const,
      value: {
        batch: out.value.batch ?? batch,
        put,
        say: put === 0 ? 'Nothing was put back: it was changed since.' : put === 1 ? 'Put back 1 change.' : `Put back ${put} changes.`,
        lines: plan.steps.map((s) => s.line),
        skipped: plan.skipped,
      },
    });
  };

  return {
    /**
     * Put back one write and everything it caused (`{ batch }`), or what one decision wrote (`{ decision }`, `D12` or its
     * handle). `{ dry: true }` answers the plan and its hash; `{ hash }` applies it. ADMIN, an owner in a browser.
     */
    async undo(args: { batch?: unknown; decision?: unknown; row?: unknown; dry?: unknown; hash?: unknown } | undefined, ctx: CallContext): Promise<Result<UndoPlan | Undone>> {
      const stop = admin(ctx, 'undo a change');
      if (stop) return { ok: false, refusal: stop };
      const a = args ?? {};
      if (said(a.batch) === said(a.decision))
        return no('REQUIRED_MISSING', 'Say what to undo: one change by its batch, or one decision.', { at: said(a.batch) ? 'decision' : 'batch' });
      const row = a.row === undefined || a.row === null ? undefined : rowOf(a.row);
      if (row === null) return no('VALUE_MALFORMED', 'Say the one to undo by its list and number: { register: "tasks", seq: 3 }.', { at: 'row' });
      const given = said(a.decision) ? a.decision.trim() : null;
      const decision = given !== null && isHandle(given) ? (spokenOf(sql, given) ?? given) : given;
      return run(decision === null ? { batch: String(a.batch).trim() } : { decision }, a, ctx, row);
    },

    /**
     * Take back one write the caller's own run made, by the batch its receipt gave: the agent door's `undo` tool. Plans
     * and applies in one call (the plan is read and its hash sent back inside it). `{ dry: true }` only answers the plan.
     *
     * OWN WRITES ONLY, AND THE OWNER'S UNDO STAYS THE OWNER'S (ADR-060). Every actor on the batch must be the caller's run
     * or a rule its write started; one line by anybody else, or by the nightly walk, refuses the whole batch.
     */
    async undoOwn(args: { batch?: unknown; dry?: unknown } | undefined, ctx: CallContext): Promise<Result<UndoPlan | Undone>> {
      const stop = guard(ctx, 'write');
      if (stop) return { ok: false, refusal: stop };
      const a = args ?? {};
      if (!said(a.batch)) return no('REQUIRED_MISSING', 'Say which write to take back, by the batch its receipt gave.', { at: 'batch' });
      const batch = a.batch.trim();
      const mine = new Set<string>();
      if (ctx.principal.kind === 'token') {
        const found = kernel.findRun(ctx.session ?? {}, ctx.principal.id);
        if (found !== null) [found.id, kernel.nameOf(found.id)].forEach((x) => typeof x === 'string' && mine.add(x));
      } else mine.add(actorOf(ctx));
      const actors = sql.all<{ actor: string | null }>('SELECT DISTINCT actor FROM event WHERE batch = ? OR (batch IS NULL AND id = ?)', batch, batch).map((e) => e.actor);
      const nothing = () => no<UndoPlan | Undone>('ROW_UNKNOWN', 'No write was made under that batch, so there is nothing to take back.', { at: 'batch' });
      if (actors.length === 0) return nothing();
      /* EVERY ROW IT WOULD PUT BACK IS ONE THE CALLER MAY STILL WRITE (sharing plan §2.6). A row since moved out of her
         rule, or kept private by its maker, is answered as a batch that wrote nothing, so the undo proves nothing. */
      for (const { target } of sql.all<{ target: string }>(
        "SELECT DISTINCT target FROM event WHERE (batch = ? OR (batch IS NULL AND id = ?)) AND target LIKE 'entry:%'",
        batch,
        batch,
      )) {
        const row = kernel.get(target.slice('entry:'.length), { includeDeleted: true });
        if (row !== null && !sight.mayWrite(ctx, row.register, row.id)) return nothing();
      }
      const own = actors.some((x) => x !== null && mine.has(x));
      const foreign = actors.some((x) => x === null || (!mine.has(x) && !x.startsWith('rule:')));
      if (!own || foreign)
        return no('FORBIDDEN', 'That change was not made by your run, so only the owner can put it back, from the app. You can take back only the writes your own receipts name.', { at: 'batch' });
      const plan = await run({ batch }, { dry: true }, ctx, undefined, true);
      if (!plan.ok || a.dry === true) return plan;
      const seen = plan.value as UndoPlan;
      if (seen.already) return ok({ batch, put: 0, say: 'Nothing was put back: it was undone already.', lines: [], skipped: [] });
      return run({ batch }, { hash: seen.hash }, ctx, undefined, true);
    },

    /**
     * Put back everything one agent's run wrote, and the rule cascades its writes started: `{ run: 'S42' }`. `{ dry: true }`
     * answers the plan and its hash; `{ hash }` applies it. ADMIN, an owner in a browser.
     */
    async undoRun(args: { run?: unknown; dry?: unknown; hash?: unknown } | undefined, ctx: CallContext): Promise<Result<UndoPlan | Undone>> {
      const stop = admin(ctx, "undo an agent's run");
      if (stop) return { ok: false, refusal: stop };
      const a = args ?? {};
      if (!said(a.run)) return no('REQUIRED_MISSING', 'Say which run to undo, as its name such as S42.', { at: 'run' });
      return run({ run: a.run.trim() }, a, ctx);
    },
  };
}
