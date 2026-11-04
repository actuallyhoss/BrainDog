/**
 * Undo on the server: one change (`batch`), what one decision did (`decision`), or every change one agent run made
 * (`run`), put back by the record from its own log, and never by a screen guessing the way back.
 *
 * A ROUTE-ONLY MODULE, like `decide-write.ts`: the client carries the route table as a value, and the fetch is handed in
 * so a test drives every branch without a socket.
 *
 * DRY FIRST, THEN WITH THE HASH. The record answers what would go back, in names (`steps`, `skipped`) and a `hash` of
 * that plan; applying sends the hash back, so what goes back is the plan that was read and nothing a write since then
 * slipped into it. A change somebody made since is skipped and said, never overwritten. `undoChange`, `undoDecision`
 * and `undoRun` do both in one press, for an Undo on a receipt; `undoPlan` and `undoApply` are the two halves, for a
 * panel that shows the plan before the person confirms it (Undo this run).
 *
 * FOUR ANSWERS. `undone` says what went back in one sentence. `refused` is the record's own sentence. `conflict` is a
 * plan that moved between the read and the press. `missing` is a record on a build with no server undo
 * (`NOT_IN_THIS_BUILD`, or a host that has no such route), which a caller holding the screen's own way back answers with
 * that instead (`undo-back.ts`).
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import { dropDecision } from './answers-out.ts';
import { forget, type Fetch } from './boot-live.ts';

/**
 * What is put back: one write, what one decision did, or one run's every change. `row` narrows a write to the part of it
 * on one row, the row's own number on its list, for a byline's "Only this one" (`page/row-host.svelte.ts`).
 */
export type UndoScope = { batch: string; row?: RowHandle } | { decision: string } | { run: string };

/** A row by its list and number, as a page knows it. A handle the record is sent, never words a person reads. */
export type RowHandle = { register: string; seq: number };

/**
 * One change the plan puts back, in names: the row's title, the field's label, the value it goes back to, `do` the word
 * a screen picks an icon by (`remove`, `restore`, `set`...), and `line` the record's own sentence for it.
 *
 * AND WHICH ROW, AS HANDLES NEVER DRAWN: `row` the record's id for it, `list` its list's name, and `at` its list and
 * number where the record says them. A byline reads them to tell the steps on its own row from the rest (`page/byline-undo.ts`), never the title.
 */
export type UndoStep = {
  title: string;
  label: string | null;
  from: unknown;
  to: unknown;
  do: string;
  line: string;
  row: string | null;
  list: string | null;
  at: RowHandle | null;
};

/** One change the plan leaves alone, and why: somebody changed it since, it was sent already, it was erased. */
export type UndoSkip = { title: string; why: string; line: string };

/** `say` is the record's one sentence for the whole plan ("Puts back 3 changes. Leaves 1 as it is."), `''` when it sent none. */
export type UndoPlan = { say: string; steps: UndoStep[]; skipped: UndoSkip[]; hash: string };

export type Undone =
  | { from: 'undone'; put: number; skipped: UndoSkip[]; said: string }
  | { from: 'refused'; fix: string }
  | { from: 'conflict'; fix: string }
  | { from: 'missing'; fix: string };

export const undoWords = {
  put: (n: number) => (n === 1 ? 'Put back 1 change.' : `Put back ${n} changes.`),
  nothing: 'There was nothing left to put back.',
  skipped: (n: number) => (n === 1 ? 'Skipped 1 that changed since or cannot come back.' : `Skipped ${n} that changed since or cannot come back.`),
  /* ONE SKIPPED IS SAID BY ITS OWN REASON, which is the record's sentence about that row. */
  skippedOne: (title: string, why: string) => `Left ${title} as it is: ${why.replace(/\.$/u, '')}.`,
  moved: 'Something changed as it was being put back, so nothing was. Look again, then undo it.',
} as const;

type Wire = { ok: true; value: unknown } | { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };

const isRow = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/* THE TWO WAYS A RECORD SAYS IT HAS NO SERVER UNDO: its handler's `NOT_IN_THIS_BUILD`, or a host with no such route. */
const MISSING = new Set(['NOT_IN_THIS_BUILD', 'ROUTE_UNKNOWN']);
/* AND THE TWO A PLAN MOVED UNDER: the kernel's `PLAN_STALE` (the hash is not the plan it would do now, `undo.ts`), and a
   row's version moving inside the write. */
const MOVED = new Set(['PLAN_STALE', 'VERSION_STALE']);

/**
 * The plan as the record answered it, or `null` for an answer this build cannot read. A step or a skip with no title is
 * said as the record's `do` or `why` alone, and one that is not an object is left out: it is the count and the sentence
 * that a person reads, and those come from the rest.
 */
export function planOf(v: unknown): UndoPlan | null {
  if (!isRow(v) || typeof v.hash !== 'string' || v.hash === '') return null;
  const steps = (Array.isArray(v.steps) ? v.steps : []).filter(isRow).map((s) => ({
    title: text(s.title) ?? '',
    label: text(s.label),
    from: s.from,
    to: s.to,
    do: text(s.do) ?? '',
    line: text(s.line) ?? '',
    row: text(s.row),
    list: text(s.list),
    at: text(s.register) !== null && typeof s.seq === 'number' && Number.isInteger(s.seq) ? { register: text(s.register)!, seq: s.seq } : null,
  }));
  const skipped = (Array.isArray(v.skipped) ? v.skipped : []).filter(isRow).map((s) => ({ title: text(s.title) ?? '', why: text(s.why) ?? '', line: text(s.line) ?? '' }));
  return { say: text(v.say) ?? '', steps, skipped, hash: v.hash };
}

/** What went back, in one sentence: how many, and what was left and why. */
export function undoneSaid(put: number, skipped: readonly UndoSkip[]): string {
  const head = put === 0 ? undoWords.nothing : undoWords.put(put);
  if (skipped.length === 0) return head;
  const one = skipped.length === 1 ? skipped[0]! : null;
  return `${head} ${one && one.title !== '' && one.why !== '' ? undoWords.skippedOne(one.title, one.why) : undoWords.skipped(skipped.length)}`;
}

const failed = (out: Exclude<Wire, { ok: true }>): Exclude<Undone, { from: 'undone' }> => {
  if ('conflict' in out) return { from: 'conflict', fix: undoWords.moved };
  if (MISSING.has(out.refusal.code)) return { from: 'missing', fix: out.refusal.fix };
  if (MOVED.has(out.refusal.code)) return { from: 'conflict', fix: undoWords.moved };
  return { from: 'refused', fix: out.refusal.fix };
};

/** The route and the arguments for a scope: `undo` takes a batch, narrowed to one row or not, or a decision; `undoRun` a run. */
const routeOf = (scope: UndoScope): { name: 'undo' | 'undoRun'; args: Record<string, unknown> } =>
  'run' in scope
    ? { name: 'undoRun', args: { run: scope.run } }
    : 'batch' in scope
      ? { name: 'undo', args: { batch: scope.batch, ...(scope.row ? { row: { register: scope.row.register, seq: scope.row.seq } } : {}) } }
      : { name: 'undo', args: { decision: scope.decision } };

/** Read what would go back, without changing anything. */
export async function undoPlan(base: string, scope: UndoScope, io?: Fetch): Promise<{ from: 'plan'; plan: UndoPlan } | Exclude<Undone, { from: 'undone' }>> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const { name, args } = routeOf(scope);
  const out = (await client.call(name, { ...args, dry: true })) as Wire;
  if (!out.ok) return failed(out);
  const plan = planOf(out.value);
  return plan ? { from: 'plan', plan } : { from: 'refused', fix: copy.recordNotReached };
}

/**
 * Put back the plan that was read, by its hash. The count is the record's where it answers one (`steps` or `put`), and
 * the plan's otherwise, less whatever it says it skipped at the last moment.
 */
export async function undoApply(base: string, scope: UndoScope, plan: UndoPlan, io?: Fetch): Promise<Undone> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const { name, args } = routeOf(scope);
  const out = (await client.call(name, { ...args, hash: plan.hash })) as Wire;
  if (!out.ok) return failed(out);
  forget();
  /* THE QUESTION THAT DECISION CLOSED IS OPEN AGAIN, and may be drawn (`answers-out.ts`). */
  if ('decision' in scope) dropDecision(scope.decision);
  const answered = isRow(out.value) ? out.value : {};
  const skipped = Array.isArray(answered.skipped) ? (planOf({ hash: plan.hash, skipped: answered.skipped })?.skipped ?? plan.skipped) : plan.skipped;
  const put = typeof answered.put === 'number' && Number.isInteger(answered.put) ? answered.put : Array.isArray(answered.steps) ? answered.steps.length : plan.steps.length;
  return { from: 'undone', put, skipped, said: undoneSaid(put, skipped) };
}

/** Dry, then with the hash: one press. */
async function undoScope(base: string, scope: UndoScope, io?: Fetch): Promise<Undone> {
  const read = await undoPlan(base, scope, io);
  if (read.from !== 'plan') return read;
  return undoApply(base, scope, read.plan, io);
}

/** Put back one write, by the batch it was made under: a row's byline Undo, and a receipt's where the write said its batch. */
export const undoChange = (base: string, batch: string, io?: Fetch): Promise<Undone> => undoScope(base, { batch }, io);

/** Put back what one decision did, by its id (`D12`): the Undo after Accept on a decision card. */
export const undoDecision = (base: string, decision: string, io?: Fetch): Promise<Undone> => undoScope(base, { decision }, io);

/** Put back every change one agent run made, by its handle (`S42`). A panel that shows the plan first uses `undoPlan`. */
export const undoRun = (base: string, run: string, io?: Fetch): Promise<Undone> => undoScope(base, { run }, io);
