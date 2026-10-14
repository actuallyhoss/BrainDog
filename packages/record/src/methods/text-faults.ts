/**
 * The record checks its own words: `textFaults` (READ+), PGS-B15 job a. It walks every page the caller may open and
 * every document field of every list they may read (`text-check.ts`) and answers `{ count, line, faults }`, the line
 * being the one sentence ("14 values on 6 pages name nothing") and each fault its place and its fix.
 *
 * NO SECOND SCANNER. Which paths name nothing is the kernel's answer: a page's blocks carry `unnamed`, and a document
 * off any page is read as a note block over its own row (`kernel.block` with `here`), as `checkPaths` reads one. A
 * page's blocks are held from the caller exactly when the census holds them, so a fault never names a path of a list
 * they cannot open, and a path over such a list is said as naming nothing, which is what their page shows.
 *
 * EACH FAULT CARRIES ITS ADDRESS (`at`) beside its names: the page's slug, or for a document drawn on no page its list's
 * id and its entry's number, so the app opens the place without matching a name.
 *
 * A DOCUMENT IS FOUND ONCE. A row's note drawn on the row's page is the same words twice, so the page's part is left
 * out and the document's fault names the page it is drawn on.
 *
 * IT WRITES NOTHING AND RUNS ONLY WHEN ASKED. It files no question and nothing calls it at night: the question and the
 * three times it runs are job b's (`index.ts`), which reads this same walk.
 */

import { whereFor, type BlockResult, type Entry, type PageBlock, type PageResult } from '@braindog/kernel';
import type { Result } from '@braindog/ports';
import { TYPED } from 'braindog-render';

import { ROUND_MS, pagesToLint } from '../page-lint.ts';
import { textFaultLine, textFaults, type LongText, type TextFault, type TextPage, type TextPart } from '../text-check.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What `textFaults` answers: how many faults, the one sentence, and the first `FAULTS_MOST` of them. */
export type TextFaultsRead = { count: number; pages: number; line: string; faults: TextFault[]; truncated: boolean };

/** The most faults one answer carries. The count and the sentence are over all of them. */
export const FAULTS_MOST = 100;
/** The most rows one list is read for its documents, so a list of a hundred thousand notes cannot hold the host. */
export const TEXT_ROWS_MOST = 2_000;

const DAY_MS = 86_400_000;

/** The words before a colon that are forms and never a figure's name. */
const NOT_FIGURES: ReadonlySet<string> = new Set([...TYPED, 'bad', 'icon']);

/** The sources that read across the whole record (`ACROSS` in `index.ts`), shown only to a caller who reads it whole. */
const ACROSS: ReadonlySet<string> = new Set(['activity', 'actions', 'governance.open', 'governance.later', 'governance.decided', 'signs']);

/** A field as a person says it when it carries no label: `effort_days` as "Effort days". */
const words = (id: string): string => {
  const w = id.replace(/[-_.]+/g, ' ').trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
};

export function methods(deps: RecordDeps) {
  const { kernel, scoped, readable, sql, clock, no } = deps;

  /** Whether the caller reads the record whole, as the census asks it. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*') && Object.keys(ctx.wheres ?? {}).length === 0;
  };
  const everyList = (ctx: CallContext): boolean =>
    deps.readsEveryList?.(ctx) ?? (whole(ctx) && Object.keys(ctx.levels ?? {}).every((list) => readable(ctx, list) === null));

  /** Whether a block is held from the caller, as the census holds it, so its words are not read for them. */
  const held = (ctx: CallContext, b: BlockResult): boolean => {
    const lists = kernel.blockRegisters(b as unknown as PageBlock);
    const source = typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null;
    return (
      (typeof b.source === 'string' && ACROSS.has(b.source) && !(b.source.startsWith('governance.') ? everyList(ctx) : whole(ctx))) ||
      lists.some((id) => readable(ctx, id) !== null) ||
      lists.some((id) => id !== source && Object.hasOwn(ctx.wheres ?? {}, id))
    );
  };

  /** Whether a path reads a list the caller may not, which names nothing to them. */
  const hidden = (ctx: CallContext, path: string): boolean =>
    kernel.blockRegisters({ kind: 'note', body: `{{${path}}}` } as unknown as PageBlock).some((id) => readable(ctx, id) !== null);

  /** When a page's declaration was last written, as milliseconds, or `null` when it cannot be read. */
  const writtenAt = (page: string): number | null => {
    try {
      const row = sql.one<{ created_at: string }>(
        "SELECT created_at FROM declaration WHERE id = ? AND kind = 'page' AND superseded_at IS NULL AND retired = 0",
        `page.${page}`,
      );
      const at = row ? Date.parse(row.created_at) : Number.NaN;
      return Number.isFinite(at) ? at : null;
    } catch {
      return null;
    }
  };

  /**
   * Every document field of every list the caller may read, each with the paths in it that name nothing to them. A row
   * is read through the caller's own grant on the list (`whereFor`), so a member held to some rows reads only those.
   */
  const documents = (ctx: CallContext, start: number): (LongText & { key: string })[] => {
    const out: (LongText & { key: string })[] = [];
    for (const [id, list] of kernel.registers()) {
      if (readable(ctx, id) !== null) continue;
      const docs = list.fields.filter((f) => f.type === 'document' && !f.retired);
      if (docs.length === 0) continue;
      const own = list.fields.filter((f) => !f.retired).map((f) => f.id);
      const ownLists = list.fields.filter((f) => f.type === 'list').map((f) => f.id);
      const rule = whereFor(ctx.wheres, id);
      let read = 0;
      for (let cursor: string | null | undefined; cursor !== null && read < TEXT_ROWS_MOST && clock.now() - start <= ROUND_MS; ) {
        const got = kernel.list({ register: id, limit: 500, reads: (other: string) => readable(ctx, other) === null, ...(cursor ? { cursor } : {}) }, rule);
        if (!got.ok) break;
        for (const row of got.value.rows as Entry[]) {
          read += 1;
          const title = row.fields[list.title];
          const name = typeof title === 'string' && title.trim() !== '' ? title.trim() : 'Untitled';
          for (const f of docs) {
            const text = row.fields[f.id];
            if (typeof text !== 'string' || (!text.includes('{{') && !/^(?:`{3,}|~{3,})/m.test(text))) continue;
            let unnamed: string[];
            try {
              unnamed = kernel.block({ kind: 'note', body: text } as unknown as PageBlock, { here: row }).unnamed ?? [];
            } catch {
              unnamed = [];
            }
            const paths = [...text.replace(/`[^`]*`/g, ' ').matchAll(/\{\{([^{}:]*)\}\}/g)].map((m) => (m[1] ?? '').trim());
            const shut = paths.filter((p) => !own.includes(p) && !unnamed.includes(p) && hidden(ctx, p));
            out.push({
              key: `${id}#${row.seq}`, ...(typeof row.seq === 'number' ? { at: { list: id, seq: row.seq } } : {}), list: list.name, row: name, field: f.label?.trim() || words(f.id), text,
              unnamed: [...unnamed.filter((p) => !own.includes(p)), ...shut], own, ownLists,
            });
          }
        }
        cursor = got.value.cursor;
      }
    }
    return out;
  };

  /** The names the caller may be told of: the figures, and each list they read with its count and its states. */
  const namesFor = (ctx: CallContext, texts: readonly string[]) => {
    const all: string[] = [];
    const states: Record<string, string[]> = {};
    for (const [id, list] of kernel.registers()) {
      if (readable(ctx, id) !== null) continue;
      const state = list.state === undefined ? undefined : list.fields.find((f) => f.id === list.state);
      states[id] = [...(state?.values ?? [])];
      all.push(id, `${id}.count`, ...states[id]!.map((v) => `${id}.${v}`));
    }
    const declared = kernel.declarations().filter((d) => d.kind === 'metric').map((d) => d.id.slice('metric.'.length));
    /* A FIGURE ASKED WITH ITS PARAMETER, `{{plan-left:Flat}}`: a built-in one is asked of the kernel, once a word. */
    const asked = new Set(texts.flatMap((t) => [...t.matchAll(/\{\{\s*([a-z][a-z0-9_-]*)\s*:/g)].map((m) => m[1]!)).filter((w) => !NOT_FIGURES.has(w)));
    const built = [...asked].filter((w) => !declared.includes(w) && (kernel.block({ kind: 'note', body: `{{${w}}}` } as unknown as PageBlock).unnamed ?? []).length === 0);
    const figures = [...declared, ...built].filter((f) => !hidden(ctx, f));
    return { all: [...all, ...figures], figures, states };
  };

  /**
   * The pages the caller may open, in the page lint's order and within its time, each as its parts: a heading and a
   * document per block it draws and does not hold from them. A part that is a document already gathered for the row the
   * page is about is left out, and that document is told the page's title.
   */
  const pagesFor = (ctx: CallContext, docs: (LongText & { key: string })[], start: number): TextPage[] => {
    const opens = (p: { registers: string[]; about: { register: string } | null }): boolean =>
      (p.registers.length === 0 || p.registers.some((id) => readable(ctx, id) === null)) && (p.about === null || readable(ctx, p.about.register) === null);
    const listed = kernel.pages().filter(opens);
    const out: TextPage[] = [];
    for (const p of pagesToLint(listed)) {
      if (out.length > 0 && clock.now() - start > ROUND_MS) break;
      let answer: PageResult;
      try {
        const got = kernel.page(p.slug);
        if (!got.ok) continue;
        answer = got.value;
      } catch {
        continue;
      }
      const key = p.about ? `${p.about.register}#${p.about.seq}` : null;
      const mine = key === null ? [] : docs.filter((d) => d.key === key);
      const pinned = new Set(answer.look?.pinned ?? []);
      /* A PINNED NOTE'S AGE is the later of when the page was written and when the thing it is about last changed. */
      const at = Math.max(writtenAt(p.template ?? p.slug) ?? 0, p.about?.updated_at ? Date.parse(p.about.updated_at) || 0 : 0);
      const days = at > 0 ? Math.floor((clock.now() - at) / DAY_MS) : null;
      const parts: TextPart[] = [];
      for (const b of answer.blocks) {
        if (b.drawn === false || held(ctx, b)) continue;
        const name = typeof b.heading === 'string' && b.heading.trim() !== '' ? b.heading.trim() : answer.title;
        const unnamed = [...(b.unnamed ?? [])];
        if (typeof b.heading === 'string' && b.heading.includes('{{')) parts.push({ name, text: b.heading, unnamed, page: true });
        const body = (b as { body?: unknown }).body;
        if (typeof body !== 'string' || body.trim() === '') continue;
        const doc = mine.find((d) => body.includes(d.text));
        if (doc) {
          doc.onPage = answer.title;
          doc.at = { slug: p.slug };
          doc.page = true;
        }
        /* WHAT THE PAGE SAYS AROUND THE DOCUMENT is still the page's own words. */
        const text = doc ? body.replace(doc.text, ' ') : body;
        if (text.trim() === '') continue;
        const pin = b.kind === 'note' && typeof b.key === 'string' && pinned.has(b.key) && days !== null ? { pinned: { days } } : {};
        parts.push({ name, text, unnamed, page: true, ...pin });
      }
      out.push({ title: answer.title, slug: p.slug, parts });
    }
    return out;
  };

  return {
    /**
     * `{}`: every fault in the words of the pages the caller may open and the documents of the lists they may read, as
     * `{ count, pages, line, faults, truncated }`. The first `FAULTS_MOST` faults are carried, and the count and the line
     * are over all of them. READ+, held to what the caller may read, and it writes nothing.
     */
    async textFaults(args: unknown, ctx: CallContext): Promise<Result<TextFaultsRead>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const extra = args !== null && typeof args === 'object' ? Object.keys(args)[0] : undefined;
      if (extra !== undefined) return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes nothing.`, { at: extra, allowed: [] });
      const start = clock.now();
      const docs = documents(ctx, start);
      const pages = pagesFor(ctx, docs, start);
      const names = namesFor(ctx, [...docs.map((d) => d.text), ...pages.flatMap((p) => p.parts.map((x) => x.text))]);
      const found = textFaults(pages, docs.map(({ key: _key, ...d }) => d), names);
      return {
        ok: true,
        value: {
          count: found.faults.length,
          pages: found.pages,
          line: textFaultLine(found),
          faults: found.faults.slice(0, FAULTS_MOST),
          truncated: found.faults.length > FAULTS_MOST,
        },
      };
    },
  };
}
