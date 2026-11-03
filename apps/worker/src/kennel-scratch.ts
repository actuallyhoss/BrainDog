/**
 * The Kennel's scratch install ("install-into-scratch validation"): before anything is listed,
 * the submitted add-on is installed into an empty record with the modules it requires, every page it brings is read,
 * and the first one that does not draw is the answer, in the record's own code and sentence, naming the page.
 *
 * WHY A RECORD AND NOT A CHECK. The address walker and the door's reads judge the file as text. A page that names a list
 * the add-on does not bring is legal text, and it broke only on the first record that installed it. The only judge of
 * whether a page draws is the record that draws it, so the scratch is that record: the same `planPack`, `installPack`
 * and `page` a person's record answers, and nothing written here decides what drawing means.
 *
 * THE RECORD IS HANDED IN (`open`). In a test it is the record over an in-memory SQLite, as `packages/kernel/test/sqlite.ts`
 * gives it; on the Cloud it is a record object under a reserved name. Either way it is DROPPED ONCE THE ANSWER IS KNOWN,
 * whatever the answer, and nothing of it is kept: the scratch is a question, not a record.
 *
 * WHAT IT DOES NOT ASK. Who is publishing, whether the id is theirs, and every rule of the file itself are the door's
 * (`@braindog/declare/kennel` `acceptSubmission`), asked after this. A use case's own modules are first-party and are
 * installed here as any required module is.
 */

import { no } from '@braindog/ports';
import type { Refusal, Result } from '@braindog/ports';

/** A pack document as a catalogue file holds it. */
export type Doc = Record<string, unknown>;

/** What a scratch call answers: the record's own result, a refusal or a conflict. */
type Answer<T> = { ok: true; value: T } | { ok: false; refusal?: Refusal; conflict?: unknown };

/** A block as a page read gives it back: `refusals` non-empty means it drew nothing (`packages/kernel/src/pages.ts`). */
export type ScratchBlock = { heading?: unknown; title?: unknown; refusals?: readonly Refusal[] };

/** The four calls the scratch asks of its record, as the record's owner, and the one that empties it. */
export type ScratchRecord = {
  planPack(args: { doc: unknown }): Promise<Answer<{ diff: { planHash: string; approve?: readonly string[] } }>>;
  installPack(args: { doc: unknown; planHash: string; approve: readonly string[] }): Promise<Answer<unknown>>;
  pages(): Promise<Answer<readonly { slug: string; title: string }[]>>;
  page(args: { slug: string }): Promise<Answer<{ title?: string; blocks: readonly ScratchBlock[] }>>;
  /** Everything the scratch holds, gone. Called once, after the answer, whatever it was. */
  drop(): void | Promise<void>;
};

export type ScratchDeps = {
  /** An empty record, opened for this one submission. */
  open: () => ScratchRecord | Promise<ScratchRecord>;
  /** The documents of the modules these ids name, as the Kennel and the bundled catalogue hold them. One left out is missing. */
  required: (ids: readonly string[]) => Promise<Doc[]>;
};

/** How many modules one scratch installs before the add-on, its requires and theirs counted together. */
export const SCRATCH_MODULES_MOST = 24;

/* The refusals that hold a block from a reader rather than ask its author to fix it (`WITHHELD_CODES`). The scratch reads
   as the owner, who is held from nothing, so one of these here is the record's sentence about access, not the page's. */
const WITHHELD = new Set(['FORBIDDEN', 'LEVEL_REQUIRED']);

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The ids a document requires: its `requires.packs`. */
export function requiredIds(doc: Doc): string[] {
  const requires = isMap(doc.requires) ? doc.requires : {};
  return isMap(requires.packs) ? Object.keys(requires.packs) : [];
}

const titleOf = (doc: Doc): string => text(doc.title) || text(doc.pack) || 'This plugin';

/** The page declarations a document brings, by their name, with the title each says. */
function pagesOf(doc: Doc): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of Array.isArray(doc.declarations) ? doc.declarations : [])
    if (isMap(d) && typeof d.page === 'string' && d.page !== '') out.set(d.page, text(d.title) || d.page);
  return out;
}

const refusalOf = (out: { refusal?: Refusal; conflict?: unknown }, fallback: string): Refusal =>
  out.refusal ?? { code: 'PLAN_STALE', fix: fallback };

/**
 * Every module the add-on stands on, each before what requires it, or the refusal naming the one nobody holds.
 *
 * WHOLE, NOT ONE LEVEL. A required module that requires another is installed on top of it, as a record installs it, so
 * a module the Kennel lists with a missing require of its own is named here too, and by who asked for it.
 */
async function modulesFor(doc: Doc, also: readonly string[], required: ScratchDeps['required']): Promise<Result<Doc[]>> {
  const own = text(doc.pack);
  const found = new Map<string, Doc>();
  const askedBy = new Map<string, string>();
  let asked = [...new Set([...also, ...requiredIds(doc)])].filter((id) => id !== own);
  for (const id of asked) askedBy.set(id, titleOf(doc));
  while (asked.length > 0) {
    if (found.size + asked.length > SCRATCH_MODULES_MOST)
      return no('DEPENDENCY_UNRESOLVED', `${titleOf(doc)} stands on more than ${SCRATCH_MODULES_MOST} plugins counted with what they require, and the Kennel installs at most that many to try it. Require fewer.`, {
        at: 'requires',
      });
    const docs = await required(asked);
    const byId = new Map(docs.filter(isMap).map((d) => [text(d.pack), d] as const));
    const missing = asked.find((id) => !byId.has(id));
    if (missing !== undefined)
      return no('DEPENDENCY_UNRESOLVED', `${askedBy.get(missing)} requires ${missing}, and neither the Kennel nor BrainDog holds a plugin by that name. Publish ${missing} first, or take it out of requires.`, {
        at: `requires.packs.${missing}`,
      });
    const next: string[] = [];
    for (const id of asked) {
      const module = byId.get(id)!;
      found.set(id, module);
      for (const r of requiredIds(module))
        if (r !== own && !found.has(r) && !asked.includes(r) && !next.includes(r)) {
          next.push(r);
          askedBy.set(r, titleOf(module));
        }
    }
    asked = next;
  }
  const ordered: Doc[] = [];
  const seen = new Set<string>();
  const visit = (id: string): void => {
    const module = found.get(id);
    if (module === undefined || seen.has(id)) return;
    seen.add(id);
    for (const r of requiredIds(module)) visit(r);
    ordered.push(module);
  };
  for (const id of found.keys()) visit(id);
  return { ok: true, value: ordered };
}

/** One document planned and installed as a person would, every line it calls out approved: the scratch runs nothing. */
async function put(record: ScratchRecord, doc: Doc): Promise<Refusal | null> {
  const planned = await record.planPack({ doc });
  if (!planned.ok) return refusalOf(planned, `${titleOf(doc)} could not be planned on an empty record. Send it again in a moment.`);
  const { planHash, approve = [] } = planned.value.diff;
  const landed = await record.installPack({ doc, planHash, approve });
  return landed.ok ? null : refusalOf(landed, `${titleOf(doc)} could not be installed on an empty record. Send it again in a moment.`);
}

const at = (slug: string, inner: string | undefined): string => `page.${slug}${inner ? `.${inner}` : ''}`;

/* A PAGE THE PLAN OR THE INSTALL REFUSES IS NAMED BY WHERE THE RECORD SAYS IT IS, `page.<name>` at the head of its `at`
   or of its sentence, and only when it is one of the add-on's own: the record's sentence names the page by its id. */
const PAGE_AT = /^page\.([^.[\s:]+)/u;
const PAGE_SAID = /\bpage\.([^.[\s:]+)/u;

function pageNamed(refusal: Refusal, brings: ReadonlyMap<string, string>): Refusal {
  const slug = PAGE_AT.exec(refusal.at ?? '')?.[1] ?? PAGE_SAID.exec(refusal.fix)?.[1];
  const title = slug === undefined ? undefined : brings.get(slug);
  return title === undefined ? refusal : { ...refusal, fix: `The page ${title} does not install on an empty record: ${refusal.fix}` };
}

/** The first part of a page read that did not draw, said with the page's name, or `null` when every part drew. */
function undrawn(slug: string, title: string, blocks: readonly ScratchBlock[]): Refusal | null {
  for (const [n, block] of blocks.entries()) {
    const refusal = (block.refusals ?? []).find((r) => !WITHHELD.has(r.code));
    if (refusal === undefined) continue;
    const part = text(block.heading) || text(block.title) || `number ${n + 1}`;
    return { ...refusal, fix: `On an empty record the page ${title} does not draw its part ${part}: ${refusal.fix}`, at: at(slug, `blocks[${n}]${refusal.at ? `.${refusal.at}` : ''}`) };
  }
  return null;
}

/**
 * Install `doc` into an empty record with the modules it requires (and `modules`, a use case's own), read every page it
 * brings, and answer the first refusal, or `null` when it all drew. The record is dropped before this returns.
 *
 * THE RECORD'S OWN CODE, AND ITS SENTENCE WITH THE PAGE NAMED. A plan or an install refused is answered as the record
 * said it, since that sentence already says what is wrong with the file; a page that does not draw says which page, by
 * the title it gives itself, because a page's refusal is about a list or a field and not about where it sits.
 */
export async function scratchInstall(doc: Doc, deps: ScratchDeps, modules: readonly string[] = [], drawn?: unknown[]): Promise<Refusal | null> {
  const needed = await modulesFor(doc, modules, deps.required);
  if (!needed.ok) return 'refusal' in needed ? needed.refusal : null;
  const record = await deps.open();
  try {
    for (const module of needed.value) {
      const refused = await put(record, module);
      if (refused !== null)
        return { ...refused, fix: `${titleOf(doc)} requires ${titleOf(module)}, which does not install on an empty record: ${refused.fix}`, at: `requires.packs.${text(module.pack)}` };
    }
    const before = await record.pages();
    const had = new Set(before.ok ? before.value.map((p) => p.slug) : []);
    const brings = pagesOf(doc);
    const refused = await put(record, doc);
    if (refused !== null) return pageNamed(refused, brings);
    const after = await record.pages();
    if (!after.ok) return refusalOf(after, 'The pages of an empty record could not be read. Send it again in a moment.');
    for (const p of after.value.filter((p) => !had.has(p.slug) || brings.has(p.slug))) {
      const title = text(p.title) || brings.get(p.slug) || p.slug;
      const read = await record.page({ slug: p.slug });
      if (!read.ok) {
        const r = refusalOf(read, `The page ${title} could not be read. Send it again in a moment.`);
        return { ...r, fix: `On an empty record the page ${title} does not draw: ${r.fix}`, at: at(p.slug, r.at) };
      }
      const part = undrawn(p.slug, title, read.value.blocks);
      if (part !== null) return part;
      /* THE ADD-ON'S OWN NEW PAGES AS THEY DREW, for a listing's picture: drawn here from its example rows, never from a person's record. */
      if (drawn !== undefined && !had.has(p.slug)) drawn.push(read.value);
    }
    return null;
  } finally {
    await record.drop();
  }
}

/** Who the scratch answers to: its owner, on a record nobody else will ever open. */
const OWNER = { principal: { kind: 'person', id: 'kennel-scratch', level: 'owner' } } as const;

/** The four calls of `createRecordApi`'s answer the scratch makes, each with the owner's context. */
export type ScratchApi = {
  planPack(args: { doc: unknown }, ctx: typeof OWNER): Promise<unknown>;
  installPack(args: { doc: unknown; planHash: string; approve?: readonly string[] }, ctx: typeof OWNER): Promise<unknown>;
  pages(ctx: typeof OWNER): Promise<unknown>;
  page(args: { slug: string }, ctx: typeof OWNER): Promise<unknown>;
};

/**
 * A record (`createRecordApi` over an empty database) as a scratch, read as its owner, with `drop` the way its database
 * goes: closed in memory in a test, emptied whole on the Cloud. A host's `open` is this over a fresh record.
 */
export function recordScratch(api: ScratchApi, drop: () => void | Promise<void>): ScratchRecord {
  return {
    planPack: async (args) => (await api.planPack(args, OWNER)) as Answer<{ diff: { planHash: string; approve?: readonly string[] } }>,
    installPack: async (args) => (await api.installPack(args, OWNER)) as Answer<unknown>,
    pages: async () => (await api.pages(OWNER)) as Answer<readonly { slug: string; title: string }[]>,
    page: async (args) => (await api.page(args, OWNER)) as Answer<{ title?: string; blocks: readonly ScratchBlock[] }>,
    drop,
  };
}
