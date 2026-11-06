/**
 * Two offers a list earns by growing as it is used (`29 §3` T4 and the open-count trigger; W.146:
 * "make sure it's something that grows as user uses it").
 *
 * A GROUPING (`groupingsOffered`): a list that a page draws as a table and that holds `GROUP_ROWS_FEWEST` entries or
 * more is offered that table grouped by its best field: a choice or a link filled on `GROUP_FILLED` of its entries,
 * taking `GROUP_VALUES` different values, so each heading names something and a screen holds the headings. What keeping
 * it writes is the page's whole declaration with `group:` given to that one table, and nothing else moved.
 *
 * OPEN WORK (`openRowsOffered`): a list with an open state, one that declares a state with an end (`done`, or a value no
 * move leaves; a list that plays `hand` hands rows through that state too), holding more than `OPEN_MOST` open entries
 * each made `OPEN_DAYS` days ago or more, is offered a page "Open <list>" of what is still open, grouped by the state.
 * It is not the bare row count `29 §3` refuses: it counts what is open, and over days, read off the entries' own
 * `created_at`, so no new store keeps a count. A list a page already draws cut by its state is not offered it.
 *
 * BOTH ARE OFFERS AND NOTHING MORE. Neither asks, files or decides: each is a pen item the person keeps with one press
 * or lets go. Both wait `PEN_YOUNG_DAYS` from the day a person first used the record (`usedOf`, as the week offer reads
 * it), and a dismissal in `pen.dismissed` holds, since each id is made by `signatureOf`. One item a list at most.
 *
 * THE COUNTS SIT HERE, BESIDE THE OFFERS. `GROWS` lives in `design-agent.ts`, which this job does not own; these five
 * are named once here and nowhere else.
 */

import type { Json, RegisterDecl } from '@braindog/kernel';

import { LAPSE_DAYS, type Offer as Weighed } from './design-agent.ts';
import { PEN_COLUMNS_MOST, PEN_ROWS_DRAWN, PEN_YOUNG_DAYS, manySaid, saidWords, signatureOf, usedIn, type PenDeps, type PenItem } from './emergent.ts';

/** The entries a list holds before its table is worth grouping: a long list read by headings, not by scrolling. */
export const GROUP_ROWS_FEWEST = 300;
/** The share of the entries a field must fill to group them by it, as a column is offered at (`PEN_COLUMN_FILLED`). */
export const GROUP_FILLED = 0.8;
/** The different values a grouping field takes: one is no grouping, and past twelve the headings are a list again. */
export const GROUP_VALUES = { fewest: 2, most: 12 } as const;
/** The open entries a list holds before its open work is worth a page of its own: more than this. */
export const OPEN_MOST = 12;
/** The days each of those entries has stood open, so a busy morning is not a pile. */
export const OPEN_DAYS = 3;

/**
 * Where these offers sit in the queue's tiers (`design-agent.ts`: pages 4000 to 4999, blocks 3000 to 3999). Open work
 * is a page, so it ranks in the page tier between a slowly growing list's page and a week; a grouping is a block
 * on a page that is already drawn, ranked by its entries as the recommender ranks a block.
 */
const OPEN_RANK = 4500;
const BLOCK_RANK = 3000;

const DAY_MS = 86_400_000;
/** The byte ceilings the page check holds a nav section, a heading, a label and an empty sentence to. */
const SECTION_BYTES = 40;
const HEADING_BYTES = 80;
const LABEL_BYTES = 40;
const EMPTY_BYTES = 200;
const ORDER_MOST = 9999;
/** The field types a table never draws as a column, as the pen's own pages leave them out (`emergent.ts`). */
const NOT_A_COLUMN: ReadonlySet<string> = new Set(['secret', 'document', 'json', 'list']);

type Block = Record<string, Json>;
type Field = RegisterDecl['fields'][number];
type HeldPage = { id: string; slug: string; title: string; body: Record<string, Json>; blocks: Block[] };
/** How the queue weighs an item made here, kept beside it so `growsWeighed` can hand the recommender's shape back. */
type Weight = { rank: number; basis: string; change: Weighed['change'] };

const WEIGHTS = new WeakMap<PenItem, Weight>();

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const fit = (text: string, most: number): string | null => {
  let out = text.trim();
  while (out !== '' && bytes(out) > most) out = [...out].slice(0, -1).join('').trimEnd();
  return out === '' ? null : out;
};
const isBlock = (value: Json | undefined): value is Block => value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
const listOf = (block: Block): string | null =>
  typeof block.source === 'string' && block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
const labelOf = (field: { id: string; label?: string | undefined }): string => {
  const said = typeof field.label === 'string' && field.label.trim() !== '' ? field.label.trim() : field.id.replace(/_/gu, ' ');
  return said.charAt(0).toUpperCase() + said.slice(1);
};
const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);
const count = (n: number): string => n.toLocaleString('en');

/** The pages the record holds a declaration for, parsed, leaving out a page that takes a parameter (`emergent.ts`). */
function heldPages(declared: readonly { id: string; kind: string; body: string }[]): HeldPage[] {
  const held: HeldPage[] = [];
  for (const row of declared) {
    if (row.kind !== 'page' || row.body.includes('{{')) continue;
    let body: Json;
    try {
      body = JSON.parse(row.body) as Json;
    } catch {
      continue;
    }
    if (!isBlock(body) || !Array.isArray(body.blocks) || !body.blocks.every(isBlock)) continue;
    const slug = typeof body.page === 'string' ? body.page : row.id.slice('page.'.length);
    const title = typeof body.title === 'string' && body.title.trim() !== '' ? body.title.trim() : slug;
    held.push({ id: row.id, slug, title, body, blocks: body.blocks });
  }
  return held;
}

/** The singular a list declares for itself (`one`), read off its declaration, as the pen's other sentences say it. */
function oneOf(declared: readonly { id: string; kind: string; body: string }[], list: string): string | undefined {
  const row = declared.find((d) => d.kind === 'register' && d.id === `register.${list}`);
  if (!row || !row.body.includes('"one"')) return undefined;
  try {
    const one = (JSON.parse(row.body) as { one?: unknown }).one;
    return typeof one === 'string' && one.trim() !== '' ? one.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Whether the record is still too young to read growth into: no person has used it, or the first did under a fortnight ago. */
function young(deps: PenDeps): boolean {
  if (!deps.use) return true;
  const first = usedIn(deps.use).first;
  return first === null || deps.use.nowMs - Date.parse(first) < PEN_YOUNG_DAYS * DAY_MS;
}

/* ── a grouping for a long table ────────────────────────────────────────────────────────────────────────────────── */

/** A field a table may group by, how many entries fill it and how many values they take. */
type Best = { field: Field; filled: number; values: number };

/**
 * The field `list` is best grouped by: a choice or a link (the kinds `declare.ts` lets a table group by), filled on at
 * least `GROUP_FILLED` of its `rows`, taking `GROUP_VALUES` different values. The most filled wins, then the one with
 * fewer headings, then the one declared first. `filled` is the `matched` of a one-row read, so the record counts it.
 */
function bestField(deps: PenDeps, list: string, decl: RegisterDecl, rows: number): Best | null {
  const { kernel, use } = deps;
  let best: Best | null = null;
  for (const field of decl.fields) {
    if (field.retired === true || (field.type !== 'enum' && field.type !== 'ref')) continue;
    const got = kernel.list({ register: list, where: { field: field.id, present: true } as never, limit: 1 });
    const filled = got.ok ? got.value.matched : 0;
    if (filled < rows * GROUP_FILLED) continue;
    const r = use!.sql.one<{ n: number }>(
      'SELECT count(DISTINCT json_extract(fields, ?)) AS n FROM entry WHERE register = ? AND deleted_at IS NULL',
      `$.${field.id}`,
      list,
    );
    const values = Number(r?.n ?? 0);
    if (values < GROUP_VALUES.fewest || values > GROUP_VALUES.most) continue;
    if (best === null || filled > best.filled || (filled === best.filled && values < best.values)) best = { field, filled, values };
  }
  return best;
}

/**
 * The grouping offers: for each list a page the record holds draws as a table with no `group:`, holding
 * `GROUP_ROWS_FEWEST` entries or more, that table grouped by the list's `bestField`. The page's first such table over
 * the list is the one offered, on the first page by its address, and a page that already groups the list is left alone.
 * The item is `block:<page>:group:<list>`, the shape a block offer's signature takes, so the recommender and a dismissal
 * read it the same way. Every item passes the lint keeping it meets.
 */
export function groupingsOffered(deps: PenDeps): PenItem[] {
  const { kernel, reads, dismissed, use, labels } = deps;
  if (!use || young(deps)) return [];
  const lists = new Map(kernel.registers());
  const declared = kernel.declarations();
  const lapses = dayOf(use.nowMs + LAPSE_DAYS * DAY_MS);
  const spoken = new Set<string>();
  const out: PenItem[] = [];

  for (const page of heldPages(declared).sort((a, b) => a.slug.localeCompare(b.slug))) {
    for (const [at, table] of page.blocks.entries()) {
      const list = table.kind === 'table' && table.group === undefined ? listOf(table) : null;
      if (list === null || spoken.has(list)) continue;
      const decl = lists.get(list);
      const id = signatureOf('block', `${page.slug}:group:${list}`);
      if (!decl || !reads(list) || dismissed.has(id) || page.blocks.some((b) => listOf(b) === list && b.group !== undefined)) continue;
      const rows = kernel.count(list);
      if (rows < GROUP_ROWS_FEWEST) continue;
      const best = bestField(deps, list, decl, rows);
      if (best === null) continue;

      const blocks = page.blocks.map((b, i) => (i === at ? { ...b, group: best.field.id } : b));
      const body: Record<string, Json> = { ...page.body, blocks };
      if (kernel.lint([{ id: page.id, kind: 'page', body }]) !== null) continue;
      spoken.add(list);
      const said = saidWords(list, decl.name, oneOf(declared, list), labels);
      const field = lower(fit(labelOf(best.field), LABEL_BYTES) ?? best.field.id);
      const tenths = Math.floor((best.filled / rows) * 10);
      const item: PenItem = {
        id,
        kind: 'block',
        register: list,
        title: `Group ${said.name} by ${field}?`,
        why: `${count(rows)} ${manySaid(said.name, said.one, said.proper)}, and ${tenths === 10 ? 'every one' : `${tenths} in 10`} ${tenths === 10 ? 'has' : 'have'} ${/^[aeiou]/iu.test(field) ? 'an' : 'a'} ${field}. Grouped by it, the table on ${page.title} reads as ${best.values} headings, not one long table.`,
        change: { to: { id: page.id, kind: 'page', body } },
        lapses,
      };
      WEIGHTS.set(item, {
        rank: BLOCK_RANK + Math.min(999, rows),
        basis: `${best.field.id}@${rows}`,
        change: { kind: 'block', page: page.slug, list, block: 'group', draft: item.change.to },
      });
      out.push(item);
    }
  }
  return out;
}

/* ── a page of the open work ────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The values of a list's state that end it: the `done` it declares, else, where it declares its moves, each value no
 * move leaves. A state with no end has nothing that is open, since nothing is ever finished.
 */
function endsOf(decl: RegisterDecl, state: Field): string[] {
  const values = (state as { values?: readonly string[] }).values ?? [];
  if ((decl.done?.length ?? 0) > 0) return values.filter((v) => decl.done!.includes(v));
  const moves = (state as { transitions?: Readonly<Record<string, { to: readonly string[] }>> }).transitions;
  return moves === undefined ? [] : values.filter((v) => (moves[v]?.to.length ?? 0) === 0);
}

/**
 * The live entries of `list` that are open (their state is none of `ends`, or unset) and were made at or before
 * `before`, leaving out the example entries a pack seeds, which nobody added and nobody has to finish.
 */
function openSince(deps: PenDeps, list: string, state: string, ends: readonly string[], before: string): number {
  /* THROUGH `kernel.count`, as `pen.filled` and `pen.week` are, so the read names its list and the hold moves with it. Read on
     the raw `Sql` it was held on no list at all, and thirteen jobs all finished were still offered for up to an hour. */
  const tagged = deps.kernel.registers().get(list)?.fields.some((f) => f.id === 'tags' && f.type === 'list' && !f.retired) === true;
  const where = { all: [{ field: 'created_at', before }, { field: state, not_in: [...ends] }, ...(tagged ? [{ field: 'tags', lacks: 'example' }] : [])] };
  const read = (): number => deps.kernel.count(list, where as never);
  return deps.held === undefined ? read() : deps.held(JSON.stringify(['pen.open', list, state, ends, before]), read);
}

/**
 * The open-work offers: for each list the caller reads with an open state, more than `OPEN_MOST` entries open that
 * were made `OPEN_DAYS` days ago or more, and no page the record holds that draws it cut by its state, a page
 * "Open <list>" of what is open, grouped by the state, oldest first. Its id is `page:<list>:open`, never the list's
 * plain `page:<list>`, so turning down one does not turn down the other.
 */
export function openRowsOffered(deps: PenDeps): PenItem[] {
  const { kernel, reads, pages, dismissed, use, labels } = deps;
  if (!use || young(deps)) return [];
  const declared = kernel.declarations();
  const held = heldPages(declared);
  const taken = new Set([...pages.map((p) => p.slug), ...held.map((p) => p.slug)]);
  const lastIn = new Map<string, number>();
  for (const p of pages) if (p.nav) lastIn.set(p.nav.section, Math.max(lastIn.get(p.nav.section) ?? 0, p.nav.order));
  /* THE DAY IT BEGINS AND NOT THE MILLISECOND, so the count can be held while the list stands (`openSince`): "made a fortnight ago or more", to the day. */
  const before = new Date(use.nowMs - OPEN_DAYS * DAY_MS).toISOString().slice(0, 10);
  const lapses = dayOf(use.nowMs + LAPSE_DAYS * DAY_MS);
  const out: PenItem[] = [];

  for (const [id, decl] of kernel.registers()) {
    const sig = signatureOf('page', `${id}:open`);
    if (dismissed.has(sig) || !reads(id)) continue;
    const live = decl.fields.filter((f) => f.retired !== true);
    const state = live.find((f) => f.id === decl.state && f.type === 'enum');
    const ends = state ? endsOf(decl, state) : [];
    if (!state || ends.length === 0) continue;
    const cut = (b: Block): boolean => listOf(b) === id && b.where !== undefined && JSON.stringify(b.where).includes(`"${state.id}"`);
    if (held.some((p) => p.blocks.some(cut))) continue;
    const n = openSince(deps, id, state.id, ends, before);
    if (n <= OPEN_MOST) continue;
    const slug = [`${id}-open`, `open-${id}`].find((s) => !taken.has(s));
    const shown = live.filter((f) => !NOT_A_COLUMN.has(f.type)).slice(0, PEN_COLUMNS_MOST);
    if (slug === undefined || shown.length === 0) continue;

    const said = saidWords(id, decl.name, oneOf(declared, id), labels);
    const source = `register.${id}`;
    const title = fit(`Open ${said.name}`, HEADING_BYTES) ?? 'Open';
    const drawnBy = pages.find((p) => p.nav && p.registers.includes(id));
    const section = drawnBy?.nav?.section ?? fit(said.name, SECTION_BYTES) ?? id;
    const body: Record<string, Json> = {
      page: slug,
      title,
      origin: 'derived',
      derived_from: source,
      requires: [source],
      /* THE SYSTEM NEVER WRITES NAV (`29 §2`). This is what keeping would write, at the end of the list's section. */
      nav: { section, order: Math.min((lastIn.get(section) ?? 0) + 10, ORDER_MOST) },
      blocks: [
        {
          kind: 'table',
          source,
          where: { field: state.id, not_in: ends },
          group: state.id,
          columns: shown.map((f) => ({ field: f.id, label: fit(labelOf(f), LABEL_BYTES) ?? f.id })),
          order: [{ field: 'seq', dir: 'asc' }],
          limit: PEN_ROWS_DRAWN,
          empty: fit(`Nothing in ${said.name} is open.`, EMPTY_BYTES) ?? 'Nothing is open.',
        },
      ],
    };
    if (kernel.lint([{ id: `page.${slug}`, kind: 'page', body }]) !== null) continue;
    taken.add(slug);
    const draft = { id: `page.${slug}`, kind: 'page', body };
    const item: PenItem = {
      id: sig,
      kind: 'page',
      register: id,
      title,
      why: `${count(n)} ${manySaid(said.name, said.one, said.proper)} have stood open for ${OPEN_DAYS} days or more. Want a page of the open ones, by ${lower(labelOf(state))}?`,
      change: { to: draft },
      list: id,
      draft,
      lapses,
    };
    WEIGHTS.set(item, { rank: OPEN_RANK + Math.min(n, 498), basis: `open@${n}`, change: { kind: 'page', list: id, draft } });
    out.push(item);
  }
  return out;
}

/**
 * The items above as the queue weighs them (`design-agent.ts` `Offer`), for `penQueued` to put beside what `recommend`
 * answered, since the recommender has no rule for either. An item not made here weighs nothing and is left out.
 */
export const growsWeighed = (items: readonly PenItem[]): Weighed[] =>
  items.flatMap((item) => {
    const w = WEIGHTS.get(item);
    return w ? [{ key: item.id, class: 'arrange' as const, rank: w.rank, basis: w.basis, lapses: item.lapses, title: item.title, why: item.why, change: w.change }] : [];
  });
