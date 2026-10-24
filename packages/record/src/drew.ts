/**
 * WHAT BRAINDOG DRAWS UNASKED, READ OFF THE RECORD (§45 "Who designs"; `design-agent.ts` `drewOffer`): the things that
 * have data for a picture and none, each with the draft keeping it would write, held to the design check before it is
 * filed, and the one "I drew X. Keep it?" a day it comes to.
 *
 * NO LIST AND NO PROJECT IS NAMED HERE. A project is a row of the list that declares `scopes:`, its stages are rows of a
 * list that declares `steps:` pointing at it, its work is rows of any list with a link to it, and a page is one somebody
 * wrote. So a record that keeps its projects under another name is read the same way.
 *
 * FILED AS A QUESTION SLASH ASKS, with a cause of its own (`drew:`), which is what keeps it to one a day and one at a
 * time, and what makes a no terminal: a cause once filed is never filed again. The reserved slot reads the cause and
 * offers Keep it on the page the drawing is about (`apps/web/src/lib/page/slot.ts`).
 *
 * READS ONLY. The caller files what `drewDraft` answers.
 */

import type { Kernel, RegisterDecl } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';
import { designCheck, shapeBlock, type ShapeList } from 'braindog-render';

import { DREW_A_DAY, drewAsk, drewKey, drewOffer, planDrawnOf, planOffered, planRows, PLAN_SHAPES, type PlanFacts, type PlanShape, type Unpictured } from './design-agent.ts';

/** A dated list is drawn by day once this many of its entries have a day. */
export const DATED_LEAST = 5;

/** The cause every drawing is filed under starts so, and nothing else's does. */
export const DREW_CAUSE = 'drew:';

/** The kinds that already show a list by day, so a page drawing one of them is not offered a calendar. */
const BY_DAY_KINDS: ReadonlySet<string> = new Set(['calendar', 'lanes', 'timeline', 'roadmap', 'heat']);

/** The kinds that list rows, which a dated list is drawn in when nothing shows it by day. */
const LISTING_KINDS: ReadonlySet<string> = new Set(['table', 'cards', 'todo', 'board', 'feed']);

/** The field a project row keeps its chosen plan shape in: a choice holding the plan shapes. */
export const PLAN_FIELD = 'drawn_as';

const NOT_EXAMPLE = `coalesce(json_extract(fields, '$.tags'), '') NOT LIKE '%"example"%'`;

type Block = { kind?: unknown; source?: unknown; [key: string]: unknown };
type PageBody = { page?: unknown; title?: unknown; blocks?: unknown; [key: string]: unknown };

const listOf = (b: Block): string | null => (typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null);
const shapeListOf = (r: RegisterDecl): ShapeList => ({
  id: r.id,
  name: r.name,
  title: r.title,
  fields: r.fields.filter((f) => f.retired !== true).map((f) => ({ id: f.id, type: f.type, ...(f.label ? { label: f.label } : {}), ...(f.values ? { values: f.values } : {}) })),
});

/** What a drawing is, with what keeping it writes: a page's declaration changed, or a project's row patched. */
export type Drawing = Unpictured & {
  keep:
    | { kind: 'page'; declaration: string; body: Record<string, unknown> }
    | { kind: 'row'; list: string; at: string; version: number; field: string }
    /* THE RULES COULD NOT DRAW IT (C14): the model is asked, about this page, in `drewAsk`'s words. */
    | { kind: 'model'; page: string; asked: string };
};

/**
 * A page somebody wrote that lists a dated list with nothing that shows it by day, with the page as it would be with a
 * calendar of that list at its end. A page a pack made is the pack's to design and is not read.
 */
function datedOf(sql: Sql, kernel: Kernel, reads: (list: string) => boolean): Drawing[] {
  const out: Drawing[] = [];
  const pages = sql.all<{ id: string; body: string }>(
    `SELECT id, body FROM declaration WHERE kind = 'page' AND superseded_at IS NULL AND retired = 0 AND coalesce(pack_id, json_extract(body, '$.pack')) IS NULL ORDER BY id`,
  );
  for (const p of pages) {
    let body: PageBody;
    try {
      body = JSON.parse(p.body) as PageBody;
    } catch {
      continue;
    }
    const blocks = Array.isArray(body.blocks) ? (body.blocks as Block[]) : [];
    const slug = typeof body.page === 'string' ? body.page : p.id.replace(/^page\./u, '');
    const title = typeof body.title === 'string' && body.title.trim() !== '' ? body.title.trim() : slug;
    const shown = new Set(blocks.filter((b) => typeof b.kind === 'string' && BY_DAY_KINDS.has(b.kind)).map(listOf));
    const listed = new Set(blocks.filter((b) => typeof b.kind === 'string' && LISTING_KINDS.has(b.kind)).map(listOf));
    for (const list of listed) {
      if (list === null || shown.has(list) || !reads(list)) continue;
      const decl = kernel.register(list);
      const day = decl?.fields.find((f) => f.retired !== true && f.type === 'day');
      if (!decl || !day) continue;
      const rows = Number(sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, ?) IS NOT NULL AND ${NOT_EXAMPLE}`, list, `$.${day.id}`)?.n ?? 0);
      if (rows < DATED_LEAST) continue;
      const block = shapeBlock({ kind: 'calendar', list: shapeListOf(decl), heading: `${decl.name} by day`, span: 12 });
      const found: Unpictured = { kind: 'dated', page: slug, pageTitle: title, list, listName: decl.name, rows };
      /* A CALENDAR THE RULES CANNOT DRAW, OR ONE THE DESIGN CHECK REFUSES, IS THE MODEL'S TO DRAW (C14), asked once. */
      if (!block || designCheck({ blocks: [block], reads }).length > 0) {
        out.push({ ...found, keep: { kind: 'model', page: slug, asked: drewAsk(found) } });
        continue;
      }
      out.push({ ...found, keep: { kind: 'page', declaration: p.id, body: { ...body, blocks: [...blocks, block] } } });
    }
  }
  return out;
}

/** Each project's plan facts, read off its stages and its open work, by the project's entry id. */
function planFactsOf(sql: Sql, kernel: Kernel, home: string, reads: (list: string) => boolean): Map<string, PlanFacts> {
  const facts = new Map<string, PlanFacts>();
  const at = (id: string): PlanFacts => {
    let f = facts.get(id);
    if (!f) facts.set(id, (f = { stages: 0, spans: 0, moments: 0, undated: 0 }));
    return f;
  };
  for (const [id, r] of kernel.registers()) {
    if (id === home || !reads(id)) continue;
    const link = r.fields.find((f) => f.retired !== true && f.type === 'ref' && f.to === home);
    if (!link) continue;
    /* A LIST OF STEPS POINTING AT THE PROJECT holds its stages. */
    if (r.steps !== undefined && r.steps.of === link.id) {
      for (const row of sql.all<{ at: string | null; n: number }>(`SELECT json_extract(fields, ?) AS at, count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND ${NOT_EXAMPLE} GROUP BY at`, `$.${link.id}`, id))
        if (typeof row.at === 'string') at(row.at).stages += Number(row.n);
      continue;
    }
    /* ANY OTHER LIST THAT POINTS AT IT, WITH A STATE, holds its work: open, by what it says of time. */
    if (r.state === undefined) continue;
    const day = r.fields.find((f) => f.retired !== true && f.type === 'day' && f.deadline === true) ?? r.fields.find((f) => f.retired !== true && f.type === 'day' && f.id !== r.finished);
    const span = r.fields.find((f) => f.retired !== true && f.type === 'duration');
    const done = r.done ?? [];
    const closed = done.length === 0 ? '' : ` AND coalesce(json_extract(fields, '$.${r.state}'), '') NOT IN (${done.map(() => '?').join(', ')})`;
    const rows = sql.all<{ at: string | null; dated: number; spans: number; n: number }>(
      `SELECT json_extract(fields, ?) AS at, ${day ? `json_extract(fields, '$.${day.id}') IS NOT NULL` : '0'} AS dated, ${span ? `json_extract(fields, '$.${span.id}') IS NOT NULL` : '0'} AS spans, count(*) AS n
         FROM entry WHERE register = ? AND deleted_at IS NULL AND ${NOT_EXAMPLE}${closed} GROUP BY at, dated, spans`,
      `$.${link.id}`,
      id,
      ...done,
    );
    for (const row of rows) {
      if (typeof row.at !== 'string') continue;
      const f = at(row.at);
      if (!row.dated) f.undated += Number(row.n);
      else if (row.spans) f.spans += Number(row.n);
      else f.moments += Number(row.n);
    }
  }
  return facts;
}

/** What a project's page draws its plan as, said where the design agent weighs it (`design-agent.ts`). */
export { planDrawnOf };

/**
 * Each project whose plan the design agent would draw another way (`planOffered`), with the row patch keeping it would
 * write: its plan field set to that shape. Drawn two ways at once, the one that reads best, so the other steps aside;
 * kept in a shape the project no longer has anything for, the shape it holds now. A project list with no plan field
 * holding the shape is offered nothing, since there is nowhere for a kept shape to stay.
 */
function plansOf(sql: Sql, kernel: Kernel, reads: (list: string) => boolean): Drawing[] {
  const homes = [...kernel.registers()].filter(([, r]) => r.scopes !== undefined);
  if (homes.length !== 1) return [];
  const [home, decl] = homes[0]!;
  if (!reads(home)) return [];
  const field = decl.fields.find((f) => f.id === PLAN_FIELD && f.retired !== true && f.type === 'enum');
  if (!field) return [];
  const facts = planFactsOf(sql, kernel, home, reads);
  const keeps = PLAN_SHAPES.filter((x) => (field.values ?? []).includes(x));
  const out: Drawing[] = [];
  for (const row of sql.all<{ id: string; seq: number | null; version: number; fields: string }>(`SELECT id, seq, version, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND ${NOT_EXAMPLE} ORDER BY seq`, home)) {
    const f = facts.get(row.id);
    if (!f || row.seq === null) continue;
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(row.fields) as Record<string, unknown>;
    } catch {
      continue;
    }
    const name = typeof fields[decl.title] === 'string' ? (fields[decl.title] as string).trim() : '';
    if (name === '') continue;
    const chosen = typeof fields[PLAN_FIELD] === 'string' && (PLAN_SHAPES as readonly string[]).includes(fields[PLAN_FIELD] as string) ? (fields[PLAN_FIELD] as PlanShape) : null;
    /* A SHAPE HE CHOSE HOLDS STILL (§45: "Kept designs hold still") while it draws, a page drawing one shape is already
       that shape, and one the list cannot keep is not offered (`planOffered`). */
    const offered = planOffered(f, chosen, keeps);
    if (offered === null) continue;
    out.push({
      kind: 'plan',
      list: home,
      seq: row.seq,
      name,
      shape: offered.shape,
      was: offered.was,
      rows: planRows(f, offered.shape),
      keep: { kind: 'row', list: home, at: `${home}#${row.seq}`, version: row.version, field: PLAN_FIELD },
    });
  }
  return out;
}

/** What the record holds of the drawings filed so far: the days one was filed, how many wait, and every cause asked. */
export function drewFiled(sql: Sql): { filedOn: string[]; waiting: number; asked: Set<string> } {
  const rows = sql.all<{ cause: string | null; status: string; opened_at: string }>(
    'SELECT cause, status, opened_at FROM suggestion WHERE cause LIKE ?',
    `${DREW_CAUSE}%`,
  );
  return {
    filedOn: rows.map((r) => r.opened_at.slice(0, 10)),
    waiting: rows.filter((r) => r.status === 'open').length,
    asked: new Set(rows.flatMap((r) => (typeof r.cause === 'string' ? [r.cause] : []))),
  };
}

/** Every drawing the record has data for and no picture of, the plans first. */
export function drawingsOf(sql: Sql, kernel: Kernel, reads: (list: string) => boolean = () => true): Drawing[] {
  return [...plansOf(sql, kernel, reads), ...datedOf(sql, kernel, reads)];
}

/** A question as Slash files one: its words, its kind and its body. */
export type DrewDraft = { key: string; question: string; body_kind: 'change' | 'options'; body: Record<string, unknown>; by: 'rules'; cause: string };

/**
 * Today's one drawing when the rules cannot draw it (C14): the words the model is asked, about the page, and what the
 * question it files says. The caller asks, holds what comes back to the design check, and files it with its cost.
 */
export type DrewAsk = { key: string; question: string; why: string; asked: string; page: string; cause: string };

/** The pref Slash keeps every drawing's key in that the model was asked, so none is asked of it twice. */
export const DREW_MODEL_PREF = 'drew.model';

/**
 * Today's one drawing as the question Slash files, or `null`. A page drawing is a change to that page, accepted to keep
 * it; a plan is two answers, Keep it with the row's plan set, and Throw away, which writes nothing.
 */
export function drewDraft(
  nowMs: number,
  drawings: readonly Drawing[],
  filed: ReturnType<typeof drewFiled>,
  /** Every key the model was asked before (`DREW_MODEL_PREF`), which is never offered again; empty with no model. */
  modelAsked: ReadonlySet<string> = new Set(),
  /** Whether a model is there to ask: without one, a drawing only the model could make is not offered. */
  model = false,
): DrewDraft | DrewAsk | null {
  const drawable = model ? drawings : drawings.filter((x) => x.keep.kind !== 'model');
  const offer = drewOffer({ nowMs, unpictured: drawable, filedOn: filed.filedOn, waiting: filed.waiting, asked: new Set([...filed.asked, ...modelAsked]) });
  if (offer === null) return null;
  const d = drawable.find((x) => drewKey(x) === offer.key);
  if (!d) return null;
  if (d.keep.kind === 'model') return { key: offer.key, question: offer.title, why: offer.why, asked: d.keep.asked, page: d.keep.page, cause: offer.key };
  const why = [offer.why];
  if (d.keep.kind === 'page')
    return {
      key: offer.key,
      question: offer.title,
      body_kind: 'change',
      body: { declaration_id: d.keep.declaration, to: { id: d.keep.declaration, kind: 'page', body: d.keep.body }, why, about: `page.${(d as { page: string }).page}` },
      by: 'rules',
      cause: offer.key,
    };
  const keep = d.keep;
  const shape = (d as { shape: PlanShape }).shape;
  return {
    key: offer.key,
    question: offer.title,
    body_kind: 'options',
    body: {
      about: keep.at,
      why,
      options: [
        { id: 'keep', label: 'Keep it', because: offer.why, recommended: true, patches: [{ at: keep.at, version: keep.version, patch: { [keep.field]: shape } }] },
        { id: 'away', label: 'Throw away', because: (d as { was: PlanShape | null }).was === null ? 'Its plan stays drawn both ways.' : 'Its plan stays as it was kept.' },
      ],
    },
    by: 'rules',
    cause: offer.key,
  };
}

export { DREW_A_DAY };
