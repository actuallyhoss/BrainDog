/**
 * An add-on's own entries through its life (phase 8): moved by a major version's `migrate`, binned by "Remove with its
 * data", and put back by installing it again inside the window.
 *
 * NOTHING HERE DELETES FOR GOOD. Removing with data writes `deleted_at` on each of the add-on's own rows through the
 * write path, under one batch, which is the bin every other delete uses: the log keeps every line, the night's sweep
 * purges after thirty days as it does any binned row, and until then the rows can come back. The batch is kept with the
 * add-on's id (`BINNED`), and installing the add-on again inside the window puts them back in the install's own
 * transaction (`restoreWithin`), the way a reinstall already puts back its settings and schedules.
 *
 * ONLY ITS OWN LISTS. A list it `uses` is the person's and is never touched; nor is a field it laid on one of theirs.
 * A row of its own that one of the person's rows still links to is refused by the write path (`DELETE_WHILE_REFERENCED`)
 * and stays, counted in the answer.
 *
 * A MOVE IS REHEARSED BEFORE IT IS WRITTEN. The migrate runs in the host's sandbox first (`tryScript`, which writes
 * nothing and reaches nothing outside), reading the entries as the version held keeps them, and answers the writes it
 * would make. Those are checked against the add-on's own lists and then written inside the install's transaction, after
 * the new shape has landed (`InstallOptions.within`). Any write refused rolls the whole update back, so the version
 * held stays installed with its entries as they were.
 */

import type { Result } from '@braindog/ports';
import { isRefusalCode, no, ok } from '@braindog/ports';
import type { Pack } from '@braindog/declare';
import { binnedStoreHolder, REMOVED_WINDOW_DAYS, scriptBody, type Kernel } from '@braindog/kernel';

/** Where the batch of a removal with data is kept, by add-on id, in the record's own settings. */
export const BINNED = 'braindog:binned';

/** What a removal with data kept: the batch its deletes share, how many rows went into the bin by list, and when. */
export type Binned = { batch: string; rows: number; lists: Record<string, number>; at: string };

const DAY = 86_400_000;

/** The batch an add-on's removal with data left, while it is still inside the window, or `null`. */
export function binnedOf(kernel: Kernel, id: string, now: number): Binned | null {
  const kept = kernel.prefsOf(BINNED)[id] as Binned | undefined;
  if (kept === undefined || typeof kept.batch !== 'string') return null;
  const at = Date.parse(kept.at);
  return Number.isFinite(at) && now - at <= REMOVED_WINDOW_DAYS * DAY ? kept : null;
}

/** The lists an add-on declares, by id, from what it claims. */
export const ownLists = (claimed: readonly string[]): string[] => claimed.filter((d) => d.startsWith('register.')).map((d) => d.slice('register.'.length));

/**
 * Every live row of the add-on's own lists into the bin, under `batch`, inside the caller's transaction.
 *
 * IN PASSES, as clearing the examples does: a row another of its own rows links to is refused while that one stands. A
 * row still refused when a pass bins nothing is kept, and counted.
 */
export function binOwnRows(kernel: Kernel, lists: readonly string[], w: { actor: string; batch: string; note: string }): { binned: Record<string, number>; kept: number } {
  const binned: Record<string, number> = {};
  let left: { list: string; id: string }[] = [];
  for (const list of lists) {
    binned[list] = 0;
    for (let cursor: string | null = null; ; ) {
      const page = kernel.list({ register: list, limit: 500, cursor });
      if (!page.ok) break;
      left.push(...page.value.rows.map((r) => ({ list, id: r.id })));
      if (page.value.cursor === null || page.value.rows.length === 0) break;
      cursor = page.value.cursor;
    }
  }
  for (let more = true; more && left.length > 0; ) {
    const refused: typeof left = [];
    for (const row of left) {
      const out = kernel.write(row.list, row.id, { deleted_at: true }, { actor: w.actor, batch: w.batch, note: w.note, cascade: false });
      if (out.ok) binned[row.list] = (binned[row.list] ?? 0) + 1;
      else refused.push(row);
    }
    more = refused.length < left.length;
    left = refused;
  }
  return { binned, kept: left.length };
}

/**
 * The function an install runs inside its transaction to put back what a removal with data binned, or `undefined` when
 * nothing of this add-on was removed with its data. Put back through the kernel's own undo of that batch, so a row the
 * bin's own sweep has purged since, or one changed since, is left as the undo leaves it and the rest come back. NO
 * WINDOW IS ASKED HERE: the sweep is the window, and a batch whose rows are all gone puts back nothing.
 */
export function restoreWithin(kernel: Kernel, id: string, actor: string): (() => Result<unknown>) | undefined {
  const binned = kernel.prefsOf(BINNED)[id] as Binned | undefined;
  /* WHAT ITS SCRIPTS KEPT (`ctx.store`) COMES BACK TOO, binned beside the rows and put back first; an add-on that kept
     state and had no rows of its own to bin still gets its state back. */
  const stored = Object.keys(kernel.prefsOf(binnedStoreHolder(id))).length > 0;
  if (binned === undefined || typeof binned.batch !== 'string') return stored ? () => ok({ restored: 0, store_keys: kernel.restoreAddonStore(id) }) : undefined;
  return () => {
    if (stored) kernel.restoreAddonStore(id);
    const planned = kernel.undoPlan({ batch: binned.batch });
    if (!planned.ok) return planned;
    if (planned.value.already || planned.value.steps.length === 0) {
      kernel.setPref(BINNED, id, null);
      return ok({ restored: 0 });
    }
    const back = kernel.undoApply({ batch: binned.batch }, planned.value.hash, actor);
    if (!back.ok) return back;
    kernel.setPref(BINNED, id, null);
    return ok({ restored: planned.value.steps.length });
  };
}

/** One write a migrate answered, as the sandbox hands it back. */
type MoveWrite = { op: 'create'; register: string; fields: unknown } | { op: 'update'; spoken: string; patch: unknown; version: number };

/** What `rehearseMove` is handed: the add-on, the lists the version held declares, and the record's reads and sandbox. */
export type MoveRehearsal = {
  pack: Pack;
  /** The lists the version held declares, which the move may read. */
  heldLists: readonly string[];
  kernel: Kernel;
  record: { id: string; tz: string };
  config: Record<string, unknown>;
  tryScript:
    | ((draft: { record: { id: string; tz: string }; body: Record<string, unknown>; config: Record<string, never>; input: unknown; reads: { list(register: string, where: unknown, options?: unknown): Promise<unknown[]>; get(spoken: string): Promise<unknown> }; owner: boolean; stale: boolean; asker: string }) => Promise<unknown>)
    | undefined;
  reads: { list(register: string, where: unknown, options?: unknown): Promise<unknown[]>; get(spoken: string): Promise<unknown> };
  asker: string;
};

/**
 * Run the update's migrate in the sandbox, writing nothing, and answer the function that writes what it would have
 * written, inside the install's transaction. A move that reads or writes past the add-on's own lists, calls out, or is
 * refused in the sandbox is refused here, before the install starts, and nothing changes.
 */
export async function rehearseMove(r: MoveRehearsal, actor: string): Promise<Result<{ within: () => Result<unknown>; writes: number }>> {
  const m = r.pack.manifest.migrate;
  const id = r.pack.manifest.pack;
  if (m === undefined) return no('DECLARATION_INVALID', `${id} has no migrate to run.`, { at: 'migrate' });
  const newLists = r.pack.declarations.filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));
  const readable = new Set([...r.heldLists, ...newLists]);
  const outside = m.reads.find((l) => !readable.has(l));
  if (outside !== undefined)
    return no('OUT_OF_BOUNDS', `${id}'s migrate reads ${outside}, which is not one of its own lists. A move of entries reads only the add-on's own lists.`, { at: 'migrate.reads' });
  const notOwn = m.writes.find((l) => !newLists.includes(l));
  if (notOwn !== undefined)
    return no('OUT_OF_BOUNDS', `${id}'s migrate writes ${notOwn}, which ${r.pack.manifest.version} does not declare. A move of entries writes only the add-on's own lists.`, { at: 'migrate.writes' });
  const body: Record<string, unknown> = {
    script: 'migrate',
    title: m.says,
    pack: id,
    runs: { rule: true },
    egress: [],
    keys: [],
    reads: m.reads,
    writes: m.writes,
    source: m.source,
    ...(m.limits === undefined ? {} : { limits: m.limits }),
  };
  const bad = scriptBody({ id: `migrate.${id}`, body });
  if (bad) return { ok: false, refusal: { ...bad, at: `migrate.${bad.at ?? 'source'}` } };
  if (r.tryScript === undefined)
    return no('NOT_IN_THIS_BUILD', `${id} ${r.pack.manifest.version} moves your entries on the way, and this BrainDog cannot run the move, so nothing was installed. You still have the version you had.`);

  /* THE READS ARE HELD TO WHAT THE MOVE NAMED, whatever the caller may read. */
  const reads = {
    list: (register: string, where: unknown, options?: unknown) => {
      if (!m.reads.includes(register)) return Promise.reject(new Error(`The move reads ${m.reads.join(', ')}, so ${register} was not read.`));
      return r.reads.list(register, where, options);
    },
    get: (spoken: string) => r.reads.get(spoken),
  };
  const answer = (await r.tryScript({ record: r.record, body, config: r.config as Record<string, never>, input: null, reads, owner: false, stale: false, asker: r.asker })) as
    | { writes?: MoveWrite[]; refused?: { code: string | null; why: string }; held?: { say: string }; log?: string }
    | null;
  if (answer === null || typeof answer !== 'object') return no('DECLARATION_INVALID', `${id}'s move of your entries did not answer, so nothing was installed. You still have the version you had.`, { at: 'migrate' });
  if (answer.held !== undefined) return no('OUT_OF_BOUNDS', `${answer.held.say} Nothing was installed, and you still have the version you had.`, { at: 'migrate' });
  if (answer.refused !== undefined) {
    const code = answer.refused.code !== null && isRefusalCode(answer.refused.code) ? answer.refused.code : 'DECLARATION_INVALID';
    return no(code, `${id}'s move of your entries stopped: ${answer.refused.why} Nothing was installed, and you still have the version you had.`, { at: 'migrate' });
  }
  const writes = Array.isArray(answer.writes) ? answer.writes : [];
  /* EACH WRITE AGAIN, ON THE HOST'S SIDE: a create into one of its new lists named in `writes`, an update to a row in one. */
  for (const w of writes) {
    const list = w.op === 'create' ? w.register : (r.kernel.get(w.spoken)?.register ?? null);
    if (list === null || !m.writes.includes(list))
      return no('OUT_OF_BOUNDS', `${id}'s move would write ${w.op === 'create' ? w.register : w.spoken}, outside the lists it names, so nothing was installed.`, { at: 'migrate.writes' });
  }
  const batch = `migrate_${id}_${r.pack.manifest.version}`;
  const within = (): Result<unknown> => {
    for (const w of writes) {
      const out =
        w.op === 'create'
          ? r.kernel.write(w.register, null, (w.fields ?? {}) as never, { actor, batch, note: m.says, cascade: false })
          : r.kernel.write(r.kernel.get(w.spoken)?.register ?? '', w.spoken, (w.patch ?? {}) as never, {
              actor,
              batch,
              note: m.says,
              cascade: false,
              ...(Number.isSafeInteger(w.version) ? { version: w.version } : {}),
            });
      if (!out.ok) {
        const fix = 'refusal' in out ? out.refusal.fix : 'the entry changed while it was moved';
        const at = w.op === 'create' ? w.register : (r.kernel.nameOf(w.spoken) ?? w.spoken);
        return no('refusal' in out ? out.refusal.code : 'VERSION_STALE', `${id}'s move of your entries was refused at ${at}: ${fix} Nothing was installed, and you still have the version you had.`, { at: 'migrate' });
      }
    }
    return ok({ moved: writes.length });
  };
  return ok({ within, writes: writes.length });
}
