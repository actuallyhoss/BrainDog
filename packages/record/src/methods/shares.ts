/**
 * The record's links to one page: `openShare`, `closeShare` and `shares` for the owner, and `sharedPage` for whoever
 * holds a link.
 *
 * NO TABLE AND NO KEY. A link is two events of kinds the ledger already has: `share.open` when the owner opens it and
 * `share.close` when it is closed, each on `target: 'share:<id>'` with the page's slug in `field`, and `share.open`
 * holding the instant it stops opening in `to_v`. They hold a slug and two instants and no person's words, so erasure
 * has nothing to take from them. The token is the host's (`packages/host/src/share.ts`), signed under a key the record
 * never holds, and nothing in this file sees one.
 *
 * A LINK OPENS THE PAGE AS ITS OWNER COULD READ IT NOW, AND ONLY WHILE THEY STILL CAN. Every read asks again whether the
 * link was closed, whether it has run out, whether the person who opened it is still an owner of this record and not
 * suspended, and whether the page is still here. Each of those is the one refusal `SHUT`, which each host answers as
 * one 404 with no body, so a stranger holding a link learns that it does not open and nothing else.
 *
 * AND ONE LEVEL DEEP, WHICH IS A LIST OF WHAT IS KEPT AND NOT A LIST OF WHAT IS TAKEN. The page's answer is built for
 * the owner and carries row ids, the lists and fields each block reads, addresses of other pages and whatever a block
 * kind added last month. A list of keys to take off leaks the first key nobody thought of, so `shownBlock` builds each
 * block from nothing: how it is drawn (`LOOKS`), what the record computed that names no row (`FIGURES`), and each row's
 * own values of the fields the block draws, by field type (`SHOWN_TYPES`). A kind that writes, links, or reads across
 * the record is drawn as its heading and nothing else (`HEADING_ONLY`, `ACROSS`).
 */

import { instant, ulids, type BlockResult, type Entry, type FieldType, type Json, type PageResult, type RegisterDecl } from '@braindog/kernel';
import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How long a link opens for when the owner does not say, and the longest they may say, in days. */
export const SHARE_DAYS = 30;
export const SHARE_DAYS_MOST = 90;

/** The most links `shares` answers, newest first. It walks only the `share:` targets, through the ledger's index. */
export const SHARES_LISTED_MOST = 500;

/** The longest share id a caller's `closeShare` is looked up by. The record mints ULIDs, which are shorter. */
const SHARE_ID_MOST = 64;

const DAY_MS = 86_400_000;

/**
 * The one answer to a link that does not open, whatever the reason: closed, run out, an opener who is no longer an
 * owner, a page that is gone, a link naming a page it was not opened for, or a caller that is not a link at all.
 *
 * ONE SENTENCE FOR ALL OF THEM, because the hosts answer it as a bare 404, and a signed-in person asking `/api/sharedPage`
 * without a link is told no more than a stranger with a dead one.
 */
const SHUT: Refusal = { code: 'PAGE_UNKNOWN', fix: 'This link does not open a page. Ask whoever sent it for a new one.', at: 'share' };

/** What `openShare` answers, before the host signs `token` and `url` into it (`ShareOpened` in `@braindog/host`). */
export type ShareOpened = { id: string; slug: string; expires_at: string };

/** One link as `shares` lists it: never its token, which only the host could make and nobody keeps. */
export type ShareRow = { id: string; slug: string; title: string; opened_at: string; expires_at: string; closed_at: string | null };

/** What `sharedPage` answers: the page one link opens, as `shownPage` builds it. */
export type SharedPage = {
  title: string;
  read_at: string | null;
  /** The page's two columns, when it has them: the rail's width in twelfths, and whether it stays in view. */
  layout: { rail?: number; sticky?: boolean } | null;
  /** When the link stops opening, so the reader can say so. */
  expires_at: string;
  blocks: Record<string, unknown>[];
};

/** How a block is drawn: the owner's words on the page and where they sit. None names a list, a field, a row or a page. */
const LOOKS = ['kind', 'heading', 'span', 'area', 'tone', 'lead', 'range', 'tiles', 'people', 'box', 'fold', 'icon', 'empty', 'body'] as const;

/**
 * What the record computed that names no row: counts, figures, buckets and the flags aligned with the rows a block drew.
 * `readings`, `walk` and `walks` are not here because each carries something that does (a figure's refusal, a step's
 * list and row), and each is rebuilt below with that taken off.
 */
const FIGURES = [
  'matched', 'fx', 'walkFx', 'bars', 'measures', 'past', 'lateness', 'late_name', 'sells', 'rings', 'nexts', 'trends', 'done_now',
  'next', 'open', 'short_now', 'inherited', 'scopes', 'scope_marks', 'window',
] as const;

/**
 * The kinds drawn as their heading and nothing else. `capture` and `inputs` write; a `link` block is links; `feed`,
 * `queue` and `agents` read the whole record's log and questions and name rows of every list; a `diff` names who
 * changed a row and when.
 */
const HEADING_ONLY: ReadonlySet<string> = new Set(['capture', 'inputs', 'link', 'feed', 'queue', 'agents', 'diff']);

/** And the computed sources that read across the whole record, whatever kind draws them, as `index.ts`'s `ACROSS` holds. */
const ACROSS: ReadonlySet<string> = new Set(['activity', 'actions', 'governance.open', 'governance.later', 'governance.decided', 'sessions.live']);

/**
 * The field types whose values a shared row keeps. Absent are `ref` (another row's id), `file` (a stored file the
 * stranger cannot fetch), `document` (a second level of its own), `json`, `secret`, and `url`, which `valueShown` keeps
 * only when it leaves this BrainDog.
 */
const SHOWN_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'text', 'int', 'duration', 'decimal', 'money', 'quantity', 'day', 'instant', 'bool', 'enum', 'email',
]);

/** What a block the record could not draw for the owner says on a shared page: the owner's sentence could name a list. */
const NOT_SHOWN: Refusal = { code: 'FORBIDDEN', fix: 'This part of the page cannot be shown through a link.' };

const isRecord = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** A plain value: a string, a number, a boolean or null. Anything with keys is a level this page does not go down. */
const isScalar = (x: unknown): x is string | number | boolean | null => x === null || ['string', 'number', 'boolean'].includes(typeof x);

/** An address into this BrainDog, a path or a fragment, which is a link to another page or row and never shown. */
const inside = (x: unknown): boolean => typeof x === 'string' && /^\s*[/#]/u.test(x);

/**
 * The owner's words with every link into this BrainDog left as its words: `[the handbook](/p/handbook)` is shown as
 * `the handbook`. A link that leaves is kept, because it opens nothing of the record's.
 */
const wordsShown = (text: string): string => text.replace(/\[([^\]]*)\]\(\s*[/#][^)]*\)/gu, '$1');

/** An address that leaves this BrainDog: the only kind of `url` value a shared row keeps. */
const outward = (x: unknown): boolean => typeof x === 'string' && /^(?:https:\/\/|mailto:)/iu.test(x.trim());

/** One field's value as a shared row shows it, or `undefined` for a value it does not. */
const valueShown = (field: RegisterDecl['fields'][number], value: Json | undefined): Json | undefined => {
  if (value === undefined) return undefined;
  if (field.type === 'url') return outward(value) ? value : undefined;
  if (field.type === 'list') {
    if (field.of === undefined || !SHOWN_TYPES.has(field.of) || !Array.isArray(value)) return undefined;
    return value.filter((v) => isScalar(v) && !inside(v));
  }
  if (!SHOWN_TYPES.has(field.type) || !isScalar(value)) return undefined;
  return inside(value) ? undefined : value;
};

/**
 * One row as a shared page shows it: the values of the fields the block draws, and its state. No id, no list, no number,
 * no version and no instants, so nothing on it names the row or leads to it.
 */
const rowShown = (row: Entry, drawn: readonly string[], lists: ReadonlyMap<string, RegisterDecl>) => {
  const decl = lists.get(row.register);
  const fields: Record<string, Json> = {};
  for (const id of drawn) {
    const field = decl?.fields.find((f) => f.id === id);
    if (field === undefined || !Object.hasOwn(row.fields, id)) continue;
    const shown = valueShown(field, row.fields[id]);
    if (shown !== undefined) fields[id] = shown;
  }
  return { fields, state: row.state };
};

/** A column as a shared block keeps it: the field it draws, its label, its role and its money sign. */
type ColumnShown = { field: string; label?: string; as?: string; sign?: { field: string; minus: string } };

/** A walk's step without the list and the row it came from (`source`, `spoken`). */
const stepShown = (step: unknown) => {
  if (!isRecord(step)) return null;
  const { day, label, delta, balance, from, of } = step;
  return { day, label, delta, balance, ...(from === undefined ? {} : { from }), ...(of === undefined ? {} : { of }) };
};

/** A cash walk with every step's list and row taken off, and its refusals too, since a refusal names a list. */
const walkShown = (walk: unknown) => {
  if (!isRecord(walk)) return null;
  const steps = Array.isArray(walk.steps) ? walk.steps.map(stepShown).filter((s) => s !== null) : [];
  const kept: Record<string, unknown> = { steps, crossed: walk.crossed === null ? null : stepShown(walk.crossed), refusals: [] };
  for (const key of ['from', 'currency', 'mixed', 'converted', 'missing', 'days', 'horizon', 'past'] as const)
    if (walk[key] !== undefined) kept[key] = walk[key];
  return kept;
};

/**
 * One block as a shared page shows it, built from nothing (this file's header says why).
 *
 * THE FIELDS A ROW KEEPS ARE THE ONES THE BLOCK'S COLUMNS DRAW, and the list's title field for a block that names no
 * columns, which is what a card or a list without columns draws. A `sign` names a second field a money column reads.
 */
const shownBlock = (b: BlockResult, lists: ReadonlyMap<string, RegisterDecl>): Record<string, unknown> => {
  const block = b as unknown as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const key of LOOKS) if (block[key] !== undefined) kept[key] = block[key];
  if (typeof kept.body === 'string') kept.body = wordsShown(kept.body);
  const bare = { ...kept, rows: [], matched: 0, refusals: [] };
  if (typeof b.kind !== 'string' || HEADING_ONLY.has(b.kind) || (typeof b.source === 'string' && ACROSS.has(b.source))) return bare;
  if (b.refusals.length > 0) return { ...bare, refusals: [NOT_SHOWN] };

  for (const key of FIGURES) if (block[key] !== undefined) kept[key] = block[key];
  if (typeof block.target === 'number') kept.target = block.target;

  const columns = (b.columns ?? []).map((c) => {
    const shown: ColumnShown = { field: c.field };
    if (c.label !== undefined) shown.label = c.label;
    if (c.as !== undefined) shown.as = c.as;
    if (c.sign !== undefined) shown.sign = { field: c.sign.field, minus: c.sign.minus };
    return shown;
  });
  if (columns.length > 0) kept.columns = columns;
  const drawn = (register: string): string[] =>
    columns.length > 0 ? columns.flatMap((c) => (c.sign === undefined ? [c.field] : [c.field, c.sign.field])) : [lists.get(register)?.title ?? ''];
  kept.rows = b.rows.map((row) => rowShown(row, drawn(row.register), lists));

  if (b.readings !== undefined)
    kept.readings = b.readings.map((r) => ({
      metric: r.metric,
      ...(r.label === undefined ? {} : { label: r.label }),
      reading: r.reading,
      ...(r.trend === undefined ? {} : { trend: r.trend }),
      ...(r.target === undefined ? {} : { target: r.target }),
    }));
  if (b.walk !== undefined) kept.walk = walkShown(b.walk);
  if (b.walks !== undefined) kept.walks = b.walks.map(walkShown);

  /* WHAT A BLOCK WRITES OUT ITSELF, cell by cell, keeps its plain values, with an address into this BrainDog blanked. */
  const authored = block.authored;
  if (Array.isArray(authored))
    kept.authored = authored.map((row) => ({
      cells:
        isRecord(row) && Array.isArray(row.cells)
          ? row.cells.map((c) => (!isScalar(c) || inside(c) ? '' : typeof c === 'string' ? wordsShown(c) : c))
          : [],
    }));
  /* AND THE `{{path}}` VALUES ITS WORDS ARE FILLED WITH, when each is a plain value. */
  if (isRecord(block.values))
    kept.values = Object.fromEntries(Object.entries(block.values).filter(([, v]) => isScalar(v) && !inside(v)));

  kept.refusals = [];
  return kept;
};

/** The page as a link shows it: its title, when it was read, its layout, when the link closes and each block. */
const shownPage = (page: PageResult, expires_at: string, lists: ReadonlyMap<string, RegisterDecl>): SharedPage => {
  const layout = isRecord(page.layout) ? page.layout : null;
  return {
    title: page.title,
    read_at: typeof page.read_at === 'string' ? page.read_at : null,
    layout:
      layout === null
        ? null
        : {
            ...(typeof layout.rail === 'number' ? { rail: layout.rail } : {}),
            ...(typeof layout.sticky === 'boolean' ? { sticky: layout.sticky } : {}),
          },
    expires_at,
    blocks: page.blocks.map((b) => shownBlock(b, lists)),
  };
};

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, admin, no, tail, clock } = deps;
  const mint = ulids(() => clock.now());

  /** The `share.open` of one link, or `undefined` for an id this record never opened. */
  const openedOf = (id: string) =>
    sql.one<{ actor: string; slug: string | null; opened_at: string; expires_at: string | null }>(
      "SELECT actor, field AS slug, ts AS opened_at, to_v AS expires_at FROM event WHERE target = ? AND kind = 'share.open' LIMIT 1",
      `share:${id}`,
    );

  /** When a link was closed, or `null` while it is open. `share.close` is for good, so the first one is the one. */
  const closedAt = (id: string): string | null =>
    sql.one<{ ts: string }>("SELECT ts FROM event WHERE target = ? AND kind = 'share.close' ORDER BY ts LIMIT 1", `share:${id}`)?.ts ?? null;

  /**
   * Whether this person is an owner of the whole record now, and not suspended: the one person a link reads the page as.
   * The query `kernel/src/index.ts` asks for the owners it writes to, held to one person.
   */
  const ownsNow = (person: string): boolean =>
    sql.one(
      "SELECT 1 AS x FROM member m JOIN person p ON p.id = m.person_id WHERE m.person_id = ? AND m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL LIMIT 1",
      person,
    ) !== undefined;

  return {
    /**
     * Open a link to one page for `days`, 1 to 90 and 30 unless said. ADMIN.
     *
     * A PERSON, SIGNED IN, AND NOT A SELF-HOST'S OPEN MODE. A link is read from anywhere for up to ninety days, which is
     * the argument `createToken` makes about a bearer (`CallContext.credentialed`): something that outlives the
     * machine's boundary needs a credential to mint. And the link reads the page as the person who opened it, so it is
     * opened by a person, whose id is the event's actor.
     *
     * THE HOST SIGNS THE LINK after this answers (`withShareLinks`, and `linkOpened` at the Worker's door), and a host
     * with no key refuses before this is asked, so no `share.open` is written for a link nobody could be handed.
     */
    async openShare(args: { slug?: unknown; days?: unknown } | undefined, ctx: CallContext): Promise<Result<ShareOpened>> {
      const stop = admin(ctx);
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'person' || ctx.credentialed === false)
        return no('NEEDS_BROWSER_SESSION', 'A link can be read from anywhere, so opening one needs the owner signed in. Open this from the app.', { at: 'principal' });
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      const said: Record<string, unknown> = isRecord(args) ? args : {};
      const slug = said.slug;
      if (typeof slug !== 'string' || slug === '') return no('REQUIRED_MISSING', 'A link opens one page, so say which page.', { at: 'slug' });
      const days = said.days === undefined ? SHARE_DAYS : said.days;
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > SHARE_DAYS_MOST)
        return no('OUT_OF_BOUNDS', `A link opens for a whole number of days from 1 to ${SHARE_DAYS_MOST}, and ${SHARE_DAYS} unless you say.`, { at: 'days' });
      if (!kernel.pages().some((p) => p.slug === slug)) return no('PAGE_UNKNOWN', 'There is no such page to share.', { at: 'slug' });
      const now = clock.now();
      const id = mint();
      const expires_at = instant(now + days * DAY_MS);
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v) VALUES (?, ?, ?, 'share.open', ?, 'share', ?, ?)",
        mint(),
        instant(now),
        ctx.principal.id,
        `share:${id}`,
        slug,
        expires_at,
      );
      return tail(ok({ id, slug, expires_at }));
    },

    /**
     * Close one link for good. ADMIN. Closing a closed link answers when it was closed and writes nothing, so a second
     * press is not a second event. Sharing the page again opens a new link with a new id.
     */
    async closeShare(args: { id?: unknown } | undefined, ctx: CallContext): Promise<Result<{ id: string; closed_at: string }>> {
      const stop = admin(ctx);
      if (stop) return { ok: false, refusal: stop };
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      const id = isRecord(args) ? args.id : undefined;
      if (typeof id !== 'string' || id === '') return no('REQUIRED_MISSING', 'A link is closed by its id, as shares lists it.', { at: 'id' });
      const link = id.length > SHARE_ID_MOST ? undefined : openedOf(id);
      if (link === undefined) return no('REF_UNKNOWN', 'This record opened no link with that id. shares lists every one.', { at: 'id' });
      const was = closedAt(id);
      if (was !== null) return ok({ id, closed_at: was });
      const closed_at = instant(clock.now());
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field) VALUES (?, ?, ?, 'share.close', ?, 'share', ?)",
        mint(),
        closed_at,
        ctx.principal.id,
        `share:${id}`,
        link.slug,
      );
      return tail(ok({ id, closed_at }));
    },

    /**
     * Every link this record opened, newest first, open and closed, and never a token. ADMIN.
     *
     * `title` IS THE PAGE'S TITLE NOW, and empty for a page that is no longer here, because the events hold the slug and
     * no words. Read through the ledger's `(target, ts)` index over the `share:` targets alone (`share;` is the first
     * text after them), so the walk is the links and never the whole ledger.
     */
    async shares(_args: unknown, ctx: CallContext): Promise<Result<ShareRow[]>> {
      const stop = admin(ctx, 'list the links to your pages');
      if (stop) return { ok: false, refusal: stop };
      const titles = new Map(kernel.pages().map((p) => [p.slug, p.title]));
      const rows = sql.all<{ target: string; slug: string | null; opened_at: string; expires_at: string | null; closed_at: string | null }>(
        `SELECT o.target AS target, o.field AS slug, o.ts AS opened_at, o.to_v AS expires_at,
                (SELECT MIN(c.ts) FROM event c WHERE c.target = o.target AND c.kind = 'share.close') AS closed_at
           FROM event o
          WHERE o.target >= 'share:' AND o.target < 'share;' AND o.kind = 'share.open'
          ORDER BY o.ts DESC, o.id DESC
          LIMIT ?`,
        SHARES_LISTED_MOST,
      );
      return ok(
        rows.map((r) => ({
          id: r.target.slice('share:'.length),
          slug: r.slug ?? '',
          title: titles.get(r.slug ?? '') ?? '',
          opened_at: r.opened_at,
          expires_at: r.expires_at ?? r.opened_at,
          closed_at: r.closed_at,
        })),
      );
    },

    /**
     * The page one link opens, one level deep. READ+, and the share principal only.
     *
     * THE GUARD ASKS THE LADDER OF EVERYBODY BUT A LINK, and refuses them anyway. `allows` refuses a share principal
     * every rung, so every other method refuses it; this is the one method it opens, and nobody else opens it. Every way
     * a link does not open is `SHUT`.
     *
     * NOTHING IS WRITTEN, NOT EVEN `page`'s `page.render` LINE. That line counts the owner's opens of a page, and a link
     * posted somewhere public would count a stranger's reads as hers. So this asks the kernel for the page itself; the
     * owner reads every list, so `page`'s `heldBlock` would hold nothing back from her, and `shownBlock` then keeps what a
     * link may show.
     */
    async sharedPage(_args: unknown, ctx: CallContext): Promise<Result<SharedPage>> {
      const stop = ctx.principal.kind === 'share' ? null : (scoped(ctx, 'read') ?? SHUT);
      if (stop) return { ok: false, refusal: stop };
      const link = ctx.principal;
      if (link.kind !== 'share' || kernel.refused()) return { ok: false, refusal: SHUT };
      const opened = link.id.length > SHARE_ID_MOST ? undefined : openedOf(link.id);
      if (opened === undefined || opened.slug !== link.slug || opened.expires_at === null) return { ok: false, refusal: SHUT };
      const ends = Date.parse(opened.expires_at);
      if (!Number.isFinite(ends) || clock.now() >= ends) return { ok: false, refusal: SHUT };
      if (closedAt(link.id) !== null || !ownsNow(opened.actor)) return { ok: false, refusal: SHUT };
      if (!kernel.pages().some((p) => p.slug === link.slug)) return { ok: false, refusal: SHUT };
      const out = kernel.page(link.slug);
      if (!out.ok) return { ok: false, refusal: SHUT };
      return ok(shownPage(out.value, opened.expires_at, kernel.registers()));
    },
  };
}
