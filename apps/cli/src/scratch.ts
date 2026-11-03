/**
 * A scratch record in memory, for the SDK to plan, install, test and draw a pack in before anybody else sees it:
 * `pack check`, `pack test`, and the operator's `kennel review show` and `list`.
 *
 * THE RECORD'S OWN CODE, NOT A COPY OF ITS RULES. The kernel is opened over `node:sqlite` exactly as
 * `packages/kernel/test/sqlite.ts` opens it for the tests, and a pack goes through `declare`'s `normalise`, `plan` and
 * `install` with a `Host` over that kernel, the same four steps the record's `planPack` and `installPack` take. So a
 * refusal said here is the refusal the record would give, with its code, and not a guess at one.
 *
 * WHAT THE RECORD ADDS THAT THIS DOES NOT: the theme check (`@braindog/record`'s `normaliseChecked`), because the CLI
 * does not depend on the record or on `@braindog/theme` (`docs/31-STACK.md` row 21). A theme a record would refuse is
 * still refused when the pack is installed there.
 *
 * ITS REQUIREMENTS FIRST, as `tools/catalogue/previews.mjs` installs them: a pack that needs one of BrainDog's modules
 * is given all of them, in `FIRST_PARTY` order with their example rows, because the modules' lists point at one another.
 * A pack that needs any other pack is said as such, because nothing on this machine can vouch for that pack's file.
 *
 * NOTHING LEAVES IT. The database is `:memory:`, nobody signs in, and it is closed by the caller when the command ends.
 */

import { DatabaseSync } from 'node:sqlite';

import { install, normalise, plan, unresolvedFault, type Applied, type Host, type Installed } from '@braindog/declare';
import { MANIFEST_KEYS, PREVIEW_FORMAT, type CatalogueFile, type Preview } from '@braindog/declare/catalogue';
import { FORMAT_VERSION, openRecord, type Json, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Refusal, Result, Row, Sql } from '@braindog/ports';
import { FIRST_PARTY, agentsPackDocument, firstPartyDocument } from '@braindog/seed/packs';
import { PRIMITIVES_VERSION } from 'braindog-render';

import { oneLine } from './clip.ts';

/** The owner of a scratch record, whose name each example row and each install is written under. */
const ACTOR = 'p_scratch';

/** The one module of BrainDog's that is not in `FIRST_PARTY`, named by its pack id. */
const AGENTS = 'agents';

/** The `Sql` port over an in-memory `node:sqlite`, the adapter the kernel's own tests use, with the same transactions. */
function memorySql(): Sql & { close(): void } {
  /* Foreign keys off, as on both hosts: `node:sqlite` turns them on unless told. */
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  let depth = 0;
  return {
    close: () => db.close(),
    exec(text: string, ...params: Param[]): void {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all<T = Row>(text: string, ...params: Param[]): T[] {
      return db.prepare(text).all(...(params as never[])) as T[];
    },
    one<T = Row>(text: string, ...params: Param[]): T | undefined {
      return db.prepare(text).get(...(params as never[])) as T | undefined;
    },
    /* A NESTED CALL IS A SAVEPOINT, as on both hosts (`apps/selfhost` `openSqlite`), so a pack checked here keeps or
       loses an inner throw's writes as the record would. */
    transactionSync<T>(fn: () => T): T {
      const savepoint = depth > 0 ? `dog_tx_${depth}` : null;
      db.exec(savepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec(savepoint ? `RELEASE ${savepoint}` : 'COMMIT');
        return value;
      } catch (e) {
        if (db.isTransaction) {
          if (savepoint) {
            db.exec(`ROLLBACK TO ${savepoint}`);
            db.exec(`RELEASE ${savepoint}`);
          } else db.exec('ROLLBACK');
        }
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/** One scratch record: its kernel, a way to install a pack document into it, its pages, and the close that ends it. */
export type Scratch = {
  kernel: Kernel;
  /** Plan and install one pack document, as `planPack` then `installPack` with exactly what the plan asked to approve. */
  put: (doc: unknown) => Promise<Result<Applied>>;
  /** The slug of every page the record holds now. */
  slugs: () => string[];
  /** One row's fields as the record holds them now, after every rule its write set off, or `null` for no such row. */
  fieldsOf: (id: string) => Record<string, Json> | null;
  close: () => void;
};

/** A new, empty scratch record whose clock reads `now`. */
export async function openScratch(now: number = Date.now()): Promise<Scratch> {
  const sql = memorySql();
  const kernel = await openRecord(sql, { now: () => now });
  /* THE FOUR FUNCTIONS A PACK INSTALL NEEDS FROM A RECORD, as `packHost` in `@braindog/record` binds them. Example rows go
     through the write path with `cascade: false`, so a pack's seeds fire none of its rules. */
  const host: Host = {
    count: (register) => kernel.count(register),
    stage: (batch) => kernel.stageInstall(batch as never),
    transaction: (fn) => kernel.transaction(fn),
    reload: () => kernel.reload(),
    retire: (ids, by) => kernel.retire(ids, by ?? { actor: ACTOR }),
    seed: (register, fields, note) => kernel.create(register, { ...fields, tags: ['example'] }, { actor: ACTOR, cascade: false, pack: true, ...(note === undefined ? {} : { note }) } as never) as never,
    /* AND AN UPDATE GOES OVER THE ROWS THE LAST INSTALL REMEMBERED PLANTING, as `packHost` does. */
    planted: (pack) => kernel.packPlanted(pack),
    reseed: (register, row, fields) => {
      const held = kernel.get(row);
      if (!held || held.deleted_at) return { ok: true, value: null };
      return kernel.update(register, row, fields, { actor: ACTOR, cascade: false, pack: true } as never) as never;
    },
    today: () => new Date(now).toISOString().slice(0, 10),
    remember: (row) => kernel.rememberPack({ ...row, by: ACTOR } as never),
    forget: (id) => kernel.forgetPack(id),
    claimed: (pack) => kernel.packClaims(pack),
    keyReady: (name, paged) => kernel.keyReady(name, paged),
  };
  /* THIS BUILD'S FORMAT AND PRIMITIVES, as the record's `installedState` says them, so a pack asking for a later one is refused here too. */
  const state = (): Installed => ({
    format: FORMAT_VERSION,
    primitives: PRIMITIVES_VERSION,
    record_version: kernel.version(),
    packs: kernel.packs(),
    declarations: kernel.declarations() as Installed['declarations'],
    rows: kernel.census(),
    config: kernel.packSettings(),
  });
  return {
    kernel,
    async put(doc) {
      const pack = await normalise(doc, { kind: 'local' });
      if (!pack.ok) return pack;
      const diff = await plan(pack.value, state());
      /* A LIST NOTHING HOLDS IS REFUSED AT THE PLAN, as the record's `planPack` refuses it, so the repair is said first. */
      const unheld = unresolvedFault(diff);
      if (unheld) return { ok: false, refusal: unheld };
      return install(pack.value, diff, host, diff.planHash, diff.approve);
    },
    slugs: () => kernel.pages().map((p) => p.slug),
    fieldsOf: (id) => {
      const row = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', id);
      return row ? (JSON.parse(row.fields) as Record<string, Json>) : null;
    },
    close: () => sql.close(),
  };
}

/**
 * The packs a document says it needs, split into whether it needs BrainDog's modules and the ids of any other pack.
 *
 * A USE CASE'S `modules` COUNT AS MODULES, because a shared use case names BrainDog's modules there rather than under
 * `requires.packs`.
 */
export function needsOf(doc: unknown): { modules: boolean; agents: boolean; others: string[] } {
  const d = (typeof doc === 'object' && doc !== null ? doc : {}) as { requires?: { packs?: unknown }; modules?: unknown };
  const packs = typeof d.requires?.packs === 'object' && d.requires.packs !== null ? Object.keys(d.requires.packs) : [];
  const named = [...packs, ...(Array.isArray(d.modules) ? d.modules.filter((m): m is string => typeof m === 'string') : [])];
  const firstParty = new Set<string>(FIRST_PARTY);
  /* AGENTS IS ONE OF BrainDog's MODULES AND NOT ONE OF `FIRST_PARTY`: its document is `agentsPackDocument`, installed after them. */
  return {
    modules: named.some((id) => firstParty.has(id)),
    agents: named.includes(AGENTS),
    others: [...new Set(named.filter((id) => !firstParty.has(id) && id !== AGENTS))],
  };
}

/** Where a scratch install stopped: which step, the sentence, and the record's refusal when it gave one. */
export type ScratchStop = { ok: false; step: 'needs' | 'install'; why: string; refusal: Refusal | null };

/** A scratch record with `doc` installed after what it needs, and the pages installing it added; the caller closes it. */
export type ScratchInstalled = { ok: true; scratch: Scratch; applied: Applied; added: string[] };

/**
 * `doc` installed in a new scratch record after its requirements, or where that stopped. The scratch is closed on every
 * stop, so only a success hands one back, and closing that one is the caller's.
 */
export async function installInScratch(doc: Record<string, unknown> | null, now: number = Date.now(), alsoNeeds: readonly string[] = []): Promise<ScratchInstalled | ScratchStop> {
  const needs = needsOf({ ...(doc ?? {}), modules: [...alsoNeeds] });
  if (needs.others.length > 0)
    return {
      ok: false,
      step: 'needs',
      why: `It needs ${needs.others.join(', ')}, which ${needs.others.length === 1 ? 'is' : 'are'} not one of BrainDog's modules, so a scratch BrainDog on this machine cannot hold ${needs.others.length === 1 ? 'it' : 'them'} first.`,
      refusal: null,
    };
  const scratch = await openScratch(now);
  const modules: [string, unknown][] = [
    ...(needs.modules ? FIRST_PARTY.map((id): [string, unknown] => [id, firstPartyDocument(id)]) : []),
    ...(needs.agents ? [[AGENTS, agentsPackDocument()] as [string, unknown]] : []),
  ];
  for (const [id, module] of modules) {
    const done = await scratch.put(module);
    if (!done.ok) {
      scratch.close();
      const refusal = 'refusal' in done ? done.refusal : null;
      return { ok: false, step: 'needs', why: `BrainDog's ${id} module, which it needs, did not install in the scratch BrainDog${refusal ? `: ${refusal.fix} (${refusal.code})` : '.'}`, refusal };
    }
  }
  const before = new Set(scratch.slugs());
  /* A USE CASE THAT ONLY ARRANGES BrainDog's MODULES carries no pack of its own, so installing it is the modules above. */
  if (doc === null) return { ok: true, scratch, applied: { pack: '', version: '', declarations: 0, seeds: 0, retired: 0 }, added: [] };
  const put = await scratch.put(doc);
  if (!put.ok) {
    scratch.close();
    const refusal = 'refusal' in put ? put.refusal : null;
    return { ok: false, step: 'install', why: refusal ? `${refusal.fix} (${refusal.code})` : 'The scratch BrainDog did not install it.', refusal };
  }
  return { ok: true, scratch, applied: put.value, added: scratch.slugs().filter((s) => !before.has(s)) };
}

/**
 * Everything wrong with a drawn page, one line each: a page that could not be expanded, or a block or a figure the
 * record answered with a refusal. A page is drawn whole even when one block is wrong, so this is the
 * only place that fault shows before somebody opens the page.
 */
export function pageFaults(page: PageResult): string[] {
  const out: string[] = [];
  const said = (r: unknown): r is Refusal => typeof r === 'object' && r !== null && typeof (r as Refusal).code === 'string' && typeof (r as Refusal).fix === 'string';
  const top = (page as Record<string, unknown>).refusal;
  if (said(top)) out.push(`${top.fix} (${top.code})`);
  for (const [i, block] of page.blocks.entries()) {
    const b = block as unknown as Record<string, unknown>;
    for (const key of ['refusal', 'error']) if (said(b[key])) out.push(`block ${i + 1}: ${(b[key] as Refusal).fix} (${(b[key] as Refusal).code})`);
    for (const r of (b.readings as { metric: string; refusal?: unknown }[] | undefined) ?? [])
      if (said(r.refusal)) out.push(`block ${i + 1}, figure ${r.metric}: ${r.refusal.fix} (${r.refusal.code})`);
  }
  return out;
}

/** The pages `slugs` names, each as the record draws it, made into a `Preview`; or the first page that did not draw. */
export function previewOf(scratch: Scratch, slugs: readonly string[], now: Date): Result<Preview> {
  const pages: Preview['pages'] = [];
  for (const slug of slugs) {
    const page = scratch.kernel.page(slug);
    if (!page.ok) return page as Result<never>;
    pages.push(page.value as Preview['pages'][number]);
  }
  return { ok: true, value: { format: PREVIEW_FORMAT, made_at: now.toISOString(), pages } };
}

/** A figure the record declares, read as a page's `stat` block would read it, or `null` when it declares no such figure. */
export function readFigure(scratch: Scratch, id: string): Result<{ value: number | null; unit: string | null }> | null {
  const decl = scratch.kernel.metricDecl(id);
  if (decl === null) return null;
  const read = scratch.kernel.metric(decl);
  return read.ok ? { ok: true, value: { value: read.value.value, unit: read.value.unit } } : (read as Result<never>);
}

/** The keys of an add-on's manifest that are not in `MANIFEST_KEYS`: a record passes over them, and the Kennel holds a file to that list. */
export const strayKeys = (doc: Record<string, unknown>): string[] => Object.keys(doc).filter((k) => !(MANIFEST_KEYS as readonly string[]).includes(k));

/** What `check` found, as lines to print, whether the file would install, and the scratch it installed into when it did. */
export type Checked = { ok: boolean; lines: string[]; held: ScratchInstalled | null };

/**
 * A file planned and installed in a scratch record, each page it adds drawn, and every refusal said with its code:
 * `pack check`, `usecase` files through the same door, and the operator's `kennel review show`.
 *
 * `keep` hands the scratch back open, for `pack test` and a review's preview to go on in; otherwise it is closed here.
 * Warnings (a key outside the manifest's list) are said and do not fail the check; a refusal or a page that does not
 * draw does, because the record would give the same answer to the person installing it.
 */
export async function checkInScratch(file: CatalogueFile, keep = false, now: number = Date.now()): Promise<Checked> {
  const lines: string[] = [];
  let doc: Record<string, unknown> | null;
  let modules: readonly string[] = [];
  if (file.kind === 'pack') {
    doc = file.file.doc;
    for (const key of strayKeys(doc))
      lines.push(`  Warning: ${oneLine(key)} is not a key a plugin's manifest says. BrainDog passes over it, and the Kennel takes only ${MANIFEST_KEYS.join(', ')}.`);
  } else {
    doc = file.shared.doc;
    modules = file.shared.usecase.modules;
  }
  const held = await installInScratch(doc, now, modules);
  if (!held.ok) {
    lines.push(held.step === 'needs' ? `  Not planned: ${oneLine(held.why)}` : `  Refused in a scratch BrainDog: ${oneLine(held.why)}`);
    return { ok: false, lines, held: null };
  }
  const { applied, added } = held;
  const needs = needsOf({ ...(doc ?? {}), modules: [...modules] });
  lines.push(
    `  Installs in a scratch BrainDog${needs.modules || needs.agents ? ' after the modules it needs' : ''}: ${applied.declarations} declarations and ${applied.seeds} example rows, and ${added.length === 1 ? 'one page' : `${added.length} pages`}.`,
  );
  let ok = true;
  for (const slug of added) {
    const page = held.scratch.kernel.page(slug);
    const faults = page.ok ? pageFaults(page.value) : ['refusal' in page ? `${page.refusal.fix} (${page.refusal.code})` : 'it did not draw.'];
    if (faults.length > 0) ok = false;
    for (const fault of faults) lines.push(`  Page ${oneLine(slug)}: ${oneLine(fault)}`);
  }
  if (!keep) held.scratch.close();
  return { ok, lines, held: keep ? held : null };
}
