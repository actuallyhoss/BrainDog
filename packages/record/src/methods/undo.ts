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
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { BACKFILL_ACTOR, sessionDeclaration, type UndoApplied, type UndoPlan, type UndoScope, type UndoSkip, type UndoStep } from '@braindog/kernel';

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

/** Two stored values as the walk compares them: absent is `null`. */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function methods(deps: RecordDeps) {
  const { kernel, sql, admin, readable, tail, no, clock } = deps;
  const trust = ladder({ sql, kernel, now: () => clock.now() });

  /** Who signs an undo: the person in the browser. */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  /**
   * The plan, or the undo applied, for one scope. Shared by both methods, which differ only in what they name.
   * `reads` leaves out a list the caller cannot read, which for an owner is none.
   */
  const run = async (scope: UndoScope, args: { dry?: unknown; hash?: unknown }, ctx: CallContext): Promise<Result<UndoPlan | Undone>> => {
    if (args.dry !== undefined && typeof args.dry !== 'boolean') return no('VALUE_MALFORMED', 'dry is true to see what would be put back, and false or left out to put it back.', { at: 'dry' });
    const opts = { reads: (register: string) => readable(ctx, register) === null };
    const walk = 'batch' in scope && walked(scope.batch) ? scope.batch : null;
    if (args.dry === true) return walk === null ? kernel.undoPlan(scope, opts) : ok(walkPlan(walk, opts.reads));
    if (!said(args.hash))
      return no('REQUIRED_MISSING', 'Undo shows what it will put back before it does. Ask with dry first, then send the hash it answers.', { at: 'hash' });
    const broken = kernel.refused();
    if (broken) return { ok: false, refusal: broken };
    if (walk !== null) return walkUndo(walk, args.hash, actorOf(ctx), opts.reads);
    /* THE LADDER DROPS INSIDE THE UNDO'S TRANSACTION: a throw in between takes the undo back with it. */
    const out = kernel.transaction(() => {
      const applied = kernel.undoApply(scope, args.hash as string, actorOf(ctx), opts);
      if (applied.ok) for (const mark of applied.value.undone) if (mark.agent !== null) trust.drop(mark.agent, mark.kinds);
      return applied;
    });
    if (!out.ok) return out;
    const { undone: _marks, ...answer } = out.value;
    return tail({ ok: true, value: answer });
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
  const walkPlan = (batch: string, reads: (register: string) => boolean): UndoPlan => {
    const already = sql.one('SELECT 1 AS y FROM undone WHERE batch = ?', batch) !== undefined;
    const lines = sql.all<{ at: number; kind: string; target: string; field: string | null; from_v: string | null; to_v: string | null }>(
      "SELECT rowid AS at, kind, target, field, from_v, to_v FROM event WHERE batch = ? AND actor = ? AND target LIKE 'entry:%' ORDER BY rowid DESC",
      batch,
      BACKFILL_ACTOR,
    );
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
        else step({ do: 'delete', row: row.id, title, ...(list === undefined ? {} : { list }) }, `Remove ${title}${list === undefined ? '' : ` from ${list}`}`);
      } else if (line.kind === 'edit' && row.register === SESSION && (line.field === null || line.field === 'project')) {
        const held = typeof row.fields.project === 'string' && row.fields.project.trim() !== '' ? row.fields.project : null;
        if (held === null) continue;
        const since = sql.one('SELECT 1 AS y FROM event WHERE target = ? AND rowid > ? AND (batch IS NULL OR batch <> ?) LIMIT 1', line.target, line.at, batch);
        const ours = line.field === null ? !since : same(held, to);
        const project = kernel.titleOfRow(held);
        if (ours) step({ do: 'set', row: row.id, title, ...(project === null ? {} : { from: project }) }, project === null ? `Take ${title} out of its project` : `Take ${title} out of ${project}`);
        else leave(row.id, title, 'it has been moved since');
      } else if (line.kind === 'tag' && line.field !== null) {
        const held = Array.isArray(row.fields[line.field]) ? (row.fields[line.field] as unknown[]).map(String) : [];
        if (held.includes(String(to))) step({ do: 'untag', row: row.id, title }, `Forget a name ${title} was matched by`);
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
        step({ do: 'set', row: row.id, title, ...(target === null ? {} : { from: target }) }, said);
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
    const hash = digest(JSON.stringify({ batch, already, steps: steps.map((s) => [s.do, s.row, s.line]), skipped: skipped.map((s) => [s.row, s.why]) }));
    return { say, lines: [...steps.map((s) => s.line), ...skipped.map((s) => s.line)], steps, skipped, notes: 0, hash, already };
  };

  /** The walk's batch put back by the kernel's own inverse, once the plan read is still the plan. */
  const walkUndo = async (batch: string, hash: string, by: string, reads: (register: string) => boolean): Promise<Result<Undone>> => {
    const plan = walkPlan(batch, reads);
    if (plan.hash !== hash) return no('PLAN_STALE', 'Something changed since this undo was shown. Look at it again, then put it back.', { at: 'hash' });
    if (plan.already) return ok({ batch, put: 0, say: 'Nothing was put back: it was undone already.', lines: [], skipped: [] });
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
    async undo(args: { batch?: unknown; decision?: unknown; dry?: unknown; hash?: unknown } | undefined, ctx: CallContext): Promise<Result<UndoPlan | Undone>> {
      const stop = admin(ctx, 'undo a change');
      if (stop) return { ok: false, refusal: stop };
      const a = args ?? {};
      if (said(a.batch) === said(a.decision))
        return no('REQUIRED_MISSING', 'Say what to undo: one change by its batch, or one decision.', { at: said(a.batch) ? 'decision' : 'batch' });
      const given = said(a.decision) ? a.decision.trim() : null;
      const decision = given !== null && isHandle(given) ? (spokenOf(sql, given) ?? given) : given;
      return run(decision === null ? { batch: String(a.batch).trim() } : { decision }, a, ctx);
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
