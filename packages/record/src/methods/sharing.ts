/**
 * The share API (sharing plan slice 7): `sharing`, `share`, `unshare` and `sharePreview` for an owner or an Admin, and
 * `myShares` and `shareOnward` for whoever holds a share.
 *
 * A SHARE IS ONE ROW (§2.2) AND THE KERNEL KEEPS IT: `kernel.shareSave` and `kernel.shareRevoke` write the row, its
 * `access.grant` or `access.revoke` event in the §2.10 shape, and move the access epoch, all in one transaction. This
 * file decides whether a share may be kept: the grammar's rules (`checkShare`), never an owner as the target, the Plus
 * hook for somebody not on the record yet, and the inline confirm (§6, default 1).
 *
 * AGENTS NEVER SHARE. The owner's and Admin's methods are `team`, which refuses every token
 * `NEEDS_BROWSER_SESSION`; the grantee's two refuse a token the same way before anything else, because a person
 * shares and their agents do not, whatever the token's scope. `sharing` is this file's list of shares; `shares` was
 * already the page links' (`shares.ts`), and one surface keeps one method per name.
 *
 * SEEING AS SOMEBODY CHANGES NOTHING HERE EITHER: `team` refuses under `ctx.preview`, and `shareOnward` asks `write`,
 * which `allows` refuses there.
 */

import {
  checkShare,
  instant,
  moneyText,
  SHARE_TEMPLATES,
  lensOf,
  shareMeOf,
  shareSentenceOf,
  shareSubjectOf,
  shareTargetReaches,
  shareTargetWhole,
  sharedWithYou,
  sharesFor,
  type GroupKept,
  type HeldShare,
  type Json,
  type LensSources,
  type LensCatalog,
  type LensCatalogList,
  type Share,
  type ShareCaps,
  type ShareHide,
  type ShareKept,
  type ShareNames,
  type ShareRung,
  type ShareTarget,
  type ShareWhen,
} from '@braindog/kernel';
import type { Refusal, Result, Sql } from '@braindog/ports';
import { ok } from '@braindog/ports';

import { FRESH, type CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How long an ended share stays on the Sharing page, in days (§3.2, "Ended: the last 30 days"). */
export const SHARES_ENDED_DAYS = 30;
/** The most live shares one person holds, their groups' among them. */
export const SHARES_PER_PERSON_MOST = 50;
/**
 * The most bytes one person's lens may take on the hop to the record (§2.13), the Worker's `CTX_HEADER_MOST`. A
 * share that would take somebody past it is refused at save in the plan's own sentence.
 */
export const SHARE_CTX_MOST = 32 * 1024;
export const SHARE_CTX_TOO_LARGE = "This is more than one person's sharing can hold. Join some of these.";
/** The longest name a group takes, in characters. */
export const GROUP_NAME_MOST = 80;

const DAY_MS = 86_400_000;

/** One share as the Sharing page draws it: the grammar, its sentence, and who made it when. */
export type SharingRow = {
  id: string;
  sentence: string;
  effect: Share['effect'];
  who: Share['who'];
  /** Who it is shared with, as the page heads their shares: a person's name, a group's, or the address it waits for. */
  who_name: string | null;
  /** What it is about, as "Stop sharing Kiln with Priya?" says it: a project by its name, else the lists or rows. */
  subject: string;
  what: ShareTarget;
  can: ShareRung;
  caps: ShareCaps | null;
  hide: ShareHide | null;
  when: ShareWhen | null;
  parent_id: string | null;
  bundle: string | null;
  template: string | null;
  note: string | null;
  version: number;
  made_by: string;
  made_at: string;
  ended_at: string | null;
};

/** What `share` and `shareOnward` answer: the share kept, its version, and the sentence it is said in. */
export type Shared = { id: string; version: number; sentence: string };

/**
 * What `sharePreview` answers: the sentence, how many rows of each list the share reaches now, and the money it shows.
 *
 * `money` IS SAID PLAINLY, BECAUSE A GUEST READS IT (as decided on 21 October): `null` when the share reaches no
 * list with an amount in it; else the money lists it reaches by name, whether every amount is hidden from them, and,
 * for a project shared whole or in part, the project's own figures that they will read: what its row leads with, and
 * what its page's figures say about it over lists the share reaches ("GBP 18,400.00", `moneyText`), at most
 * `MONEY_SAID_MOST`. No figure is said when the amounts are hidden. A figure that reads nothing says `null`, so the
 * sentence says "nothing still to come in" and never leaves the figure out as if the page had none.
 */
export type SharePreview = {
  sentence: string;
  lists: { list: string; name: string; rows: number }[];
  money: { lists: string[]; hidden: boolean; figures: { label: string; said: string | null }[] } | null;
};

/** The most figures a preview says a project's money in. */
export const MONEY_SAID_MOST = 2;

/**
 * One line of "Seen and changed" (§2.10, §3.2): who, through which share, and what they did in plain words, such as
 * `{ who: 'Priya', via: 'Accountant', said: 'Money, 2 times. Opened M14.' }`. Names, never ids.
 */
export type ShareActivityLine = { who: string; via: string; said: string };

/** The longest a share may run and still count as one that ends: the longest template, ninety days, and a day over. */
const ENDS_WITHIN_MS = 91 * 86_400_000;

/** How far back "Seen and changed" reads by default, and at most, in days: the read counters are kept 400. */
export const SHARE_ACTIVITY_DAYS = 30;
export const SHARE_ACTIVITY_DAYS_MOST = 400;

/**
 * One of the caller's own shares, as "What you can see here" lists it (§3.4). `by` is who shared it, by name, and
 * `welcome` the first-open line said to the caller: "Ada shared Kiln with you. You can edit tasks in Kiln until 1 Dec."
 */
export type MyShare = {
  id: string;
  sentence: string;
  can: ShareRung;
  until: string | null;
  onward: boolean;
  live: boolean;
  by: string | null;
  welcome: string;
  /**
   * ON A SHARE THEY MAY SHARE ON (`onward`), what the onward sheet offers: the share's target and what it is about by
   * name, the lists it can be passed on one at a time (each whole, or inside its project), and the people on the record
   * it may go to, by name, owners and the caller left out. Absent on any other share.
   */
  what?: ShareTarget;
  subject?: string;
  lists?: { id: string; name: string }[];
  to?: { id: string; name: string }[];
};

/** A group as the Sharing page lists it: its name, its people by name beside their ids, and how many shares it holds. */
export type GroupRow = { id: string; name: string; people: { id: string; name: string | null }[]; shares: number };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const refuse = (code: string, fix: string, at: string): Result<never> => ({ ok: false, refusal: { code, fix, at } });

/** A token is never a sharer: the one sentence every share route gives one, before it reads anything. */
const AGENTS_NEVER: Refusal = { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; an agent cannot share or see what is shared.', at: 'principal' };
const personOnly = (ctx: CallContext): Refusal | null => (ctx.principal.kind === 'person' ? null : AGENTS_NEVER);

/** A person as a sentence says them: their name, else their address. */
const personName = (sql: Pick<Sql, 'one'>, id: string): string | undefined => {
  const row = sql.one<{ name: string | null; email: string | null }>('SELECT name, email FROM person WHERE id = ?', id);
  return row ? (row.name ?? row.email ?? undefined) : undefined;
};

/** Names, never ids, for a sentence (§3.5). */
export function namesOf(sql: Pick<Sql, 'one'>, catalog: LensCatalog): ShareNames {
  const listOf = (id: string): LensCatalogList | undefined => catalog.lists.find((l) => l.id === id);
  const rowOf = (id: string): { register: string; seq: number | null; fields: string } | undefined =>
    sql.one<{ register: string; seq: number | null; fields: string }>('SELECT register, seq, fields FROM entry WHERE id = ? AND deleted_at IS NULL', id);
  const titleOf = (id: string): string | undefined => {
    const row = rowOf(id);
    const l = row ? listOf(row.register) : undefined;
    const title = l?.fields.find((f) => f.title)?.id;
    if (!row || title === undefined) return undefined;
    try {
      const v = (JSON.parse(row.fields) as Record<string, unknown>)[title];
      return typeof v === 'string' && v !== '' ? v : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    person: (id) => personName(sql, id),
    group: (id) => {
      const g = sql.one<{ name: string }>('SELECT name FROM share_group WHERE id = ? AND retired_at IS NULL', id);
      if (!g) return undefined;
      const n = Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM share_group_member WHERE group_id = ?', id)?.n ?? 0);
      return { name: g.name, people: n };
    },
    list: (id) => listOf(id)?.name.toLowerCase(),
    meets: () => catalog.lists.find((l) => l.role === 'meets')?.name.toLowerCase(),
    project: titleOf,
    row: (list, id) => {
      const row = rowOf(id);
      const name = listOf(list)?.name;
      return row && name && row.seq !== null ? `${name.replace(/s$/i, '')} ${row.seq}` : titleOf(id);
    },
  };
}

/**
 * What an invitation says is shared with its address, before anybody accepts (§3.4): "Ada shared Pottery with you. You can
 * edit tasks in Pottery until 1 Dec." Said from the shares waiting for it, the sharer being whoever made the first; `null`
 * when nothing is waiting.
 */
export function sharedSaid(sql: Pick<Sql, 'one'>, catalog: LensCatalog, waiting: readonly ShareKept[], now: number, tz?: string): string | null {
  if (waiting.length === 0) return null;
  const by = waiting.find((s) => s.effect === 'allow')?.made_by;
  const text = sharedWithYou(waiting, by === undefined ? undefined : personName(sql, by), namesOf(sql, catalog), { now, ...(tz ? { tz } : {}) });
  return text === '' ? null : text;
}

/**
 * WHAT THE OWNER HAS SHARED OUT, as Today says it in one line (§6 default 1): how many live
 * shares, who they are with by name (three, then how many more), and the shares made in the last day, each as "You shared Kiln with
 * priya@studio.co." `needs` is true when one of those is wide (an address at Edit or Manage, or no end) and the owner
 * has no passkey to have confirmed it with, which is the one case the record could not ask "Confirm it's you" and so
 * the one that needs him: "Not you? Stop it."
 *
 * `null` WHEN NOTHING IS SHARED. ITS OWN READ AND NOT A PART OF `boot`, which an owner is answered byte for byte as he
 * was before sharing (the owner's non-interference, `lens-live.test.ts`): Today asks for it after it has drawn.
 */
export type SharedOut = { live: number; names: string[]; more: number; fresh: { id: string; said: string }[]; needs: boolean };

/** How many of the people and groups a share is with Today names before "and 2 more". */
export const SHARED_NAMED = 3;

/** How long a share counts as just made, for Today's line: a day. */
export const SHARED_FRESH_MS = DAY_MS;

export function sharedOut(sql: Pick<Sql, 'one'>, catalog: LensCatalog, live: readonly ShareKept[], me: string | null, confirmable: boolean, now: number): SharedOut | null {
  const allows = live.filter((s) => s.effect === 'allow' && !s.revoked_at);
  if (allows.length === 0) return null;
  const n = namesOf(sql, catalog);
  const whoOf = (s: ShareKept): string =>
    s.who.kind === 'person' ? (n.person?.(s.who.id) ?? 'somebody') : s.who.kind === 'group' ? (n.group?.(s.who.id)?.name ?? 'a group') : s.who.id;
  const fresh = allows.filter((s) => now - Date.parse(s.made_at) < SHARED_FRESH_MS).slice(0, 3);
  const wide = (s: ShareKept): boolean => (s.who.kind === 'email' && (s.can === 'edit' || s.can === 'manage')) || s.when?.until === undefined;
  /* WHO IT IS WITH, each once, newest share first, by name and never by id. */
  const named = [...new Map(allows.map((s) => [`${s.who.kind}:${s.who.id}`, whoOf(s)] as const)).values()];
  return {
    live: allows.length,
    names: named.slice(0, SHARED_NAMED),
    more: Math.max(0, named.length - SHARED_NAMED),
    fresh: fresh.map((s) => ({
      id: s.id,
      said: `${s.made_by === me ? 'You' : (personName(sql, s.made_by) ?? 'Somebody')} shared ${shareSubjectOf(s.what, n)} with ${whoOf(s)}.`,
    })),
    needs: !confirmable && fresh.some(wide),
  };
}

/** Every `stat` cell a page's blocks name, in the page's order, its block's children among them. */
function statCells(blocks: unknown): { metric: string; label?: string }[] {
  const out: { metric: string; label?: string }[] = [];
  const walk = (b: unknown): void => {
    if (Array.isArray(b)) return b.forEach(walk);
    if (!isObj(b)) return;
    if (Array.isArray(b.cells))
      for (const c of b.cells) if (isObj(c) && typeof c.metric === 'string') out.push({ metric: c.metric, ...(typeof c.label === 'string' ? { label: c.label } : {}) });
    if (Array.isArray(b.blocks)) walk(b.blocks);
  };
  walk(blocks);
  return out;
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, clock } = deps;
  const team = deps.team ?? ((ctx: CallContext, reads?: string) => deps.admin(ctx, reads));

  /** The grammar of a share as a caller sent it: what `checkShare` reads, and nothing it does not. */
  const grammarOf = (s: unknown): Share | null => {
    if (!isObj(s)) return null;
    const out: Record<string, unknown> = { effect: s.effect ?? 'allow', who: s.who, what: s.what, can: s.can };
    for (const k of ['caps', 'hide', 'when'] as const) if (s[k] !== undefined && s[k] !== null) out[k] = s[k];
    return out as Share;
  };

  /** The people who own this record: no share ever targets one (§2.3). */
  const owners = (): string[] => kernel.members().filter((m) => m.level === 'owner').map((m) => m.person_id);

  const names = (catalog: LensCatalog): ShareNames => namesOf(sql, catalog);

  const sentence = (s: Share | readonly Share[], catalog: LensCatalog): string => shareSentenceOf(s, names(catalog), { now: clock.now() });

  /** The live shares a grantee already holds, for the parameter budget and the per-person ceiling. */
  const othersOf = (who: Share['who'], but?: string): HeldShare[] => {
    if (who.kind === 'person') return (sharesFor(sql, who.id) ?? []).filter((s) => s.id !== but);
    return kernel.sharesKept().filter((s) => s.who.kind === who.kind && s.who.id === who.id && s.id !== but);
  };

  /**
   * How many bytes a person's lens takes on the hop to the record with these shares, as the Worker sends it (§2.13): the
   * role and the list rows they hold now, merged with these shares at this instant. Past `SHARE_CTX_MOST` the Worker
   * would not send it at all, so the share that would take them there is refused at save, never at their next call.
   */
  const heldBytes = (person: string, shares: HeldShare[], catalog: LensCatalog): number => {
    const rows = sql.all<{ register: string; level: NonNullable<LensSources['role']>; row_where: string | null }>('SELECT register, level, row_where FROM member WHERE person_id = ?', person);
    const parse = (t: string | null): Json | null => {
      if (t === null) return null;
      try {
        return JSON.parse(t) as Json;
      } catch {
        return null;
      }
    };
    const lens = lensOf(
      {
        person,
        role: rows.find((r) => r.register === '*')?.level ?? null,
        lists: rows.filter((r) => r.register !== '*').map((r) => ({ register: r.register, level: r.level, where: parse(r.row_where) })),
        shares,
        me: shareMeOf(sql, person, kernel.meetsList()?.register ?? null),
      },
      catalog,
      clock.now(),
    );
    return lens === null ? 0 : new TextEncoder().encode(JSON.stringify(lens.ctx)).length;
  };

  /** Whether a person is on the record at all: a member row, or a live share of their own. */
  const onRecord = (person: string): boolean =>
    sql.one('SELECT 1 AS y FROM member WHERE person_id = ? LIMIT 1', person) !== undefined || (sharesFor(sql, person) ?? []).length > 0;

  /**
   * Why this share may not be kept for this caller, or `null`: the grammar's rules, a grantee who is there, never an
   * owner, at most `SHARES_PER_PERSON_MOST` each, and the Plus hook for somebody not on the record yet.
   */
  const refusalOf = async (ctx: CallContext, s: Share, catalog: LensCatalog, but?: string): Promise<Refusal | null> => {
    const who = s.who;
    if (who.kind === 'person' && sql.one('SELECT 1 AS y FROM person WHERE id = ?', who.id) === undefined)
      return { code: 'REF_UNKNOWN', fix: 'There is nobody here by that id. Share with them by email instead.', at: 'who' };
    if (who.kind === 'group' && sql.one('SELECT 1 AS y FROM share_group WHERE id = ? AND retired_at IS NULL', who.id) === undefined)
      return { code: 'REF_UNKNOWN', fix: 'There is no group by that id.', at: 'who' };
    const others = othersOf(who, but);
    const bad = checkShare(s, catalog, { owners: owners(), others });
    if (bad) return bad;
    if (others.length >= SHARES_PER_PERSON_MOST)
      return { code: 'OUT_OF_BOUNDS', fix: `They already hold ${SHARES_PER_PERSON_MOST} shares. Stop one, or combine some of them.`, at: 'who' };
    if (who.kind === 'person' && heldBytes(who.id, [...others, { ...s, id: 'sh_trial' }], catalog) > SHARE_CTX_MOST)
      return { code: 'OUT_OF_BOUNDS', fix: SHARE_CTX_TOO_LARGE, at: 'share' };
    const outsider = who.kind === 'email' || (who.kind === 'person' && !onRecord(who.id));
    /* THE PLUS GATE (§2.15) IS THE HOST'S, which knows the plan and asks for it, so it may answer later. */
    return outsider ? ((await deps.plus?.(ctx, who)) ?? null) : null;
  };

  /**
   * THE INLINE CONFIRM (§6, default 1): widening to somebody not on the record at Edit or Manage, or a share with no
   * end, asks for a passkey proof in the last fifteen minutes, but only of somebody who has a passkey to give. Without
   * one the share goes ahead, and the owner's Today says so (slice 10). A deny never asks.
   */
  const unconfirmed = (ctx: CallContext, s: Share): Refusal | null => {
    if (s.effect !== 'allow' || ctx.confirmable !== true) return null;
    const outsider = s.who.kind === 'email' && (s.can === 'edit' || s.can === 'manage');
    /* AN END PAST THE LONGEST A TEMPLATE RUNS IS NO END: a share dated to the year 9999 lasts as long as one with none. */
    const until = s.when?.until;
    const endless = until === undefined || !(Date.parse(until) - clock.now() <= ENDS_WITHIN_MS);
    if (!outsider && !endless) return null;
    if (ctx.provedAt !== undefined && clock.now() - ctx.provedAt <= FRESH) return null;
    return { code: 'NEEDS_BROWSER_SESSION', fix: "Confirm it's you, then share again. Nothing was shared yet.", at: 'confirm' };
  };

  /** Who a share names, said as the page heads it: never an id. */
  const whoName = (who: Share['who'], n: ShareNames): string | null => {
    if (who.kind === 'person') return n.person?.(who.id) ?? null;
    if (who.kind === 'group') return n.group?.(who.id)?.name ?? null;
    return who.kind === 'email' ? who.id : null;
  };

  const rowOf = (s: ShareKept, catalog: LensCatalog, n: ShareNames = names(catalog)): SharingRow => ({
    id: s.id,
    sentence: shareSentenceOf(s, n, { now: clock.now() }),
    effect: s.effect,
    who: s.who,
    who_name: whoName(s.who, n),
    subject: shareSubjectOf(s.what, n),
    what: s.what,
    can: s.can,
    caps: s.caps ?? null,
    hide: s.hide ?? null,
    when: s.when ?? null,
    parent_id: s.parent_id,
    bundle: s.bundle,
    template: s.template,
    note: s.note,
    version: s.version,
    made_by: s.made_by,
    made_at: s.made_at,
    ended_at: s.revoked_at ?? null,
  });

  /**
   * What one share reaches now, list by list, counted as nobody reads (no private row): the share alone as an allow,
   * whenever its hours are, so the sheet says "She'll see 14 tasks now" for a deny as for an allow.
   */
  const reachOf = (s: Share, catalog: LensCatalog): SharePreview['lists'] => {
    const { when: _when, ...open } = s;
    const person = s.who.kind === 'person' ? s.who.id : 'p_trial';
    const me = s.who.kind === 'person' ? shareMeOf(sql, s.who.id, kernel.meetsList()?.register ?? null) : [];
    const lens = lensOf({ person, role: null, shares: [{ ...open, effect: 'allow', id: 'sh_trial' }], me }, catalog, clock.now());
    if (lens === null) return [];
    const out: SharePreview['lists'] = [];
    for (const l of catalog.lists) {
      const p = lens.pred.read[l.id];
      if (p === undefined || p === false) continue;
      const scope = kernel.scope({ principal: { kind: 'system', id: 'share' }, outbound: true, ...(p === true ? {} : { wheres: { [l.id]: p as Json } }) }, l.id);
      const got = kernel.list({ register: l.id, limit: 1 }, scope);
      out.push({ list: l.id, name: l.name, rows: got.ok ? got.value.matched : 0 });
    }
    return out;
  };

  /**
   * WHAT AN ADMIN MAY SHARE: only what they read whole themselves, never with themselves or a group they are in, and never
   * a change to a share about them. `team` let an Admin share the runs, Keys or a list the owner held from them with
   * themselves, and end a deny the owner had set on them. An owner is held to none of it.
   */
  const adminKeeps = (ctx: CallContext, s: Share | null, was: Share | null): Refusal | null => {
    const p = ctx.principal;
    if (p.kind !== 'person' || p.level === 'owner') return null;
    const aboutMe = (who: Share['who']): boolean =>
      (who.kind === 'person' && who.id === p.id) || (who.kind === 'group' && (kernel.groupKept(who.id)?.people ?? []).includes(p.id));
    if ((s !== null && aboutMe(s.who)) || (was !== null && aboutMe(was.who))) return { code: 'FORBIDDEN', fix: 'Only an owner can change what you can do here.', at: 'who' };
    if (s === null || s.effect !== 'allow') return null;
    const catalog = kernel.catalog();
    const kept = new Set(catalog.lists.filter((l) => l.ownerOnly === true || l.role === 'keys' || l.role === 'meets').map((l) => l.id));
    for (const l of reachOf(s, catalog))
      if (kept.has(l.list) || deps.readable(ctx, l.list) !== null || ctx.wheres?.[l.list] !== undefined || (ctx.hides?.[l.list]?.length ?? 0) > 0)
        return { code: 'FORBIDDEN', fix: `You can share only what you can see all of. Ask an owner to share ${l.name}.`, at: 'what' };
    return null;
  };

  /* ---------------------------------------------------------------------------------------------- the money shown */

  const moneyFields = (l: LensCatalogList): string[] => l.fields.filter((f) => !f.retired && !f.title && f.type === 'money').map((f) => f.id);

  /**
   * The money a share shows (`SharePreview.money`): the lists with an amount in them that it reaches rows of now, whether
   * every amount there is hidden by it, and for a project its own figures.
   *
   * THE PROJECT'S OWN FIGURES, AS ITS PAGE DRAWS THEM. The first amount its row says, by its field's label ("Earned in a
   * year"); then each money figure a page about that list's rows names for it (a `stat` cell's `<figure>:{{<title>}}`),
   * in the page's order, read as the record reads it, that is more than nothing and over lists the share reaches.
   * Named by the cell's label, else the figure's name, never an id.
   */
  const moneyShown = (s: Share, catalog: LensCatalog, lists: SharePreview['lists'], ctx: CallContext): SharePreview['money'] => {
    /* THE TEAM'S ALONE, as the preview that asks it is: the project's row and its figures are read for nobody else. */
    if (team(ctx, 'preview a share') !== null) return null;
    const byId = new Map(catalog.lists.map((l) => [l.id, l]));
    const reached = lists.filter((x) => x.rows > 0 && moneyFields(byId.get(x.list)!).length > 0);
    if (reached.length === 0) return null;
    const hide = hideMap(s.hide, catalog);
    const hidden = reached.every((x) => moneyFields(byId.get(x.list)!).every((f) => hide[x.list]?.includes(f)));
    const figures: { label: string; said: string | null }[] = [];
    if (!hidden && 'project' in s.what) {
      const project = s.what.project;
      const row = kernel.get(project);
      const l = row === null ? undefined : byId.get(row.register);
      if (row !== null && l !== undefined) {
        for (const f of l.fields) {
          const v = row.fields[f.id] as { amount?: unknown; currency?: unknown } | undefined;
          if (f.retired || f.type !== 'money' || hide[l.id]?.includes(f.id) || typeof v?.amount !== 'number' || v.amount <= 0 || typeof v.currency !== 'string') continue;
          figures.push({ label: f.label ?? f.id, said: moneyText(v.amount, v.currency) });
          break;
        }
        const title = l.fields.find((f) => f.title)?.id;
        const name = title === undefined ? undefined : row.fields[title];
        const reaches = new Set(lists.map((x) => x.list));
        for (const page of kernel.declarations().filter((d) => d.kind === 'page')) {
          if (figures.length >= MONEY_SAID_MOST || typeof name !== 'string' || title === undefined) break;
          const body = JSON.parse(page.body) as { for?: { register?: unknown }; blocks?: unknown };
          if (body.for?.register !== l.id) continue;
          for (const cell of statCells(body.blocks)) {
            if (figures.length >= MONEY_SAID_MOST) break;
            const m = /^([^:]+):\{\{(\w+)\}\}$/u.exec(cell.metric);
            if (m === null || m[2] !== title) continue;
            const decl = kernel.metricDecl(m[1]!);
            if (!decl || kernel.figureLists(decl).some((list) => !reaches.has(list))) continue;
            /* A MONEY FIGURE THAT READS NOTHING IS SAID AS NOTHING. With no bills on Kiln, "Still to come in" read nought and
               was left out, so the sentence named what Kiln earned and said nothing of what is owed, as if the page did not
               ask. A figure that is no money (a count of open tasks) is still left out. */
            if (typeof decl.format !== 'string' || !decl.format.startsWith('money')) continue;
            const label = cell.label ?? decl.name;
            const got = deps.figure?.(`${m[1]}:${name}`, ctx) ?? null;
            if (got === null || got.amount === 0) {
              if (!figures.some((x) => x.said === null && x.label === label)) figures.push({ label, said: null });
              continue;
            }
            if (got.amount < 0) continue;
            const said = moneyText(got.amount, got.currency);
            if (figures.some((x) => x.said === said)) continue;
            figures.push({ label, said });
          }
        }
      }
    }
    return { lists: reached.map((x) => x.name), hidden, figures };
  };

  /* ---------------------------------------------------------------------------------------------- an onward share */

  /** A hide as one map, every list's money fields spelt out where it said `types`, so two can be joined. */
  const hideMap = (h: ShareHide | undefined, catalog: LensCatalog): Record<string, string[]> => {
    if (!h) return {};
    if ('types' in h && Array.isArray(h.types)) {
      const out: Record<string, string[]> = {};
      for (const l of catalog.lists) {
        const money = l.fields.filter((f) => !f.retired && !f.title && f.type === 'money').map((f) => f.id);
        if (money.length) out[l.id] = money;
      }
      return out;
    }
    return Object.fromEntries(Object.entries(h as Record<string, string[]>).map(([k, v]) => [k, [...v]]));
  };

  /**
   * The target of an onward share inside its parent's, or `null` when it reaches past it (§2.1, manage). The same
   * target; a list the parent reaches whole; a condition joined to the parent's own on the same list; rows the parent
   * names; a project's lists the parent's project covers.
   */
  const inside = (parent: ShareTarget, asked: ShareTarget | undefined, catalog: LensCatalog): ShareTarget | null => {
    if (asked === undefined || JSON.stringify(asked) === JSON.stringify(parent)) return parent;
    const list = (id: string): LensCatalogList | undefined => catalog.lists.find((l) => l.id === id);
    const whole = (id: string): boolean => {
      const l = list(id);
      return l !== undefined && shareTargetWhole(parent, l);
    };
    if ('lists' in asked && Array.isArray(asked.lists) && !('project' in asked)) return asked.lists.length > 0 && asked.lists.every(whole) ? asked : null;
    if ('list' in asked) {
      if (whole(asked.list)) return asked;
      if (!('list' in parent) || parent.list !== asked.list) return null;
      if ('where' in parent) return 'where' in asked ? { list: asked.list, where: { all: [parent.where, asked.where] } as never } : null;
      if ('rows' in asked) return asked.rows.every((r) => parent.rows.includes(r)) ? asked : null;
      return { list: asked.list, where: { all: [{ field: 'id', in: [...parent.rows] }, asked.where] } as never };
    }
    if ('project' in asked && 'project' in parent && asked.project === parent.project) {
      const named = asked.lists ?? null;
      if (named === null) return parent.lists === undefined ? asked : null;
      return named.every((id) => {
        const l = list(id);
        return l !== undefined && shareTargetReaches(parent, l);
      })
        ? asked
        : null;
    }
    return null;
  };

  /* ------------------------------------------------------------------------------------ who was left with nothing */

  /** The people a share reaches by name: its person, or its group's members. An address reaches nobody here yet. */
  const reachedBy = (id: string): string[] => {
    const s = kernel.shareKept(id);
    if (s === null) return [];
    if (s.who.kind === 'person') return [s.who.id];
    if (s.who.kind === 'group') return kernel.groupKept(s.who.id)?.people ?? [];
    return [];
  };

  /**
   * THE LAST SHARE ENDED (§3.4): of these people, the ones with no member row who now hold nothing at all. The host
   * takes each off its Directory (`leave`), so the record drops from their switcher, and their next call is refused.
   */
  const leftOf = (people: Iterable<string>): string[] =>
    [...new Set(people)].filter((p) => sql.one('SELECT 1 AS y FROM member WHERE person_id = ? LIMIT 1', p) === undefined && kernel.access(p) === null).sort();

  /** A group as the Sharing page draws it: names, never ids, beside the ids it is changed by. */
  const groupOf = (g: GroupKept) => ({ id: g.id, name: g.name, people: g.people.map((p) => ({ id: p, name: personName(sql, p) ?? null })), shares: g.shares });

  /* ------------------------------------------------------------------------------------- seen and changed (§2.10) */

  /** A share as a line names it: its template's name, else its sentence. Never its id. */
  const shareName = (id: string, catalog: LensCatalog): string => {
    const s = kernel.shareKept(id);
    if (s === null) return 'a share since removed';
    if (s.template !== null) return SHARE_TEMPLATES.find((t) => t.id === s.template)?.name ?? s.template;
    return sentence(s, catalog);
  };

  /** Names said as a person says them: "M14", "M14 and M15", "M14, M15, M16 and 4 more". */
  const together = (names: readonly string[], most = 5): string => {
    if (names.length <= 1) return names[0] ?? '';
    if (names.length > most) return `${names.slice(0, most).join(', ')} and ${names.length - most} more`;
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  };

  /** How many times, in words. */
  const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? '2 times' : `${n} times`);

  /** A row as a line names it, `M14` or `tasks#3`, and never its id once it is gone. */
  const rowName = (id: string): string => {
    const name = kernel.nameOf(id);
    return name === id ? 'a row since removed' : name;
  };

  return {
    /**
     * "SEEN AND CHANGED" (§2.10): what somebody who is not an owner read and changed in the last `days` days (30 unless
     * asked, at most 400), for one person (`person`) or everybody, one line for each person and the shares that allowed
     * it, in plain words, such as "Money, 2 times. Opened M14." through the Accountant share. Names, never ids. Read off
     * the counters (`access_seen`) and the writes' lines (`access_via`), and an owner's or an Admin's in a browser.
     */
    async shareActivity(args: { person?: unknown; days?: unknown } | undefined, ctx: CallContext): Promise<Result<{ lines: ShareActivityLine[] }>> {
      const stop = team(ctx, 'see what was seen and changed');
      if (stop) return { ok: false, refusal: stop };
      const asked = args?.days;
      if (asked !== undefined && !(typeof asked === 'number' && Number.isSafeInteger(asked) && asked >= 1 && asked <= SHARE_ACTIVITY_DAYS_MOST))
        return refuse('OUT_OF_BOUNDS', `days is a whole number from 1 to ${SHARE_ACTIVITY_DAYS_MOST}.`, 'days');
      if (args?.person !== undefined && typeof args.person !== 'string') return refuse('VALUE_MALFORMED', 'person is the id of somebody on this BrainDog.', 'person');
      const person = typeof args?.person === 'string' && args.person !== '' ? args.person : null;
      const since = instant(clock.now() - (typeof asked === 'number' ? asked : SHARE_ACTIVITY_DAYS) * DAY_MS);
      const only = person === null ? '' : ' AND who = ?';
      const by = person === null ? [] : [person];
      const seen = sql.all<{ who: string; via: string; what: string; n: number }>(
        `SELECT who, via, what, SUM(n) AS n FROM access_seen WHERE day >= ?${only} GROUP BY who, via, what ORDER BY who, via, MIN(last_at), what`,
        since.slice(0, 10),
        ...by,
      );
      const wrote = sql.all<{ batch: string; who: string; via: string }>(`SELECT batch, who, via FROM access_via WHERE at >= ?${only} ORDER BY at, batch`, since, ...by);

      type Group = { who: string; via: string[]; lists: Map<string, number>; rows: string[]; searched: number; pages: Map<string, number>; tools: Map<string, number>; as: Map<string, number>; changed: string[] };
      const groups = new Map<string, Group>();
      const viaOf = (text: string): string[] => {
        try {
          const v = JSON.parse(text) as unknown;
          return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').sort() : [];
        } catch {
          return [];
        }
      };
      const groupOf = (who: string, viaText: string): Group => {
        const via = viaOf(viaText);
        const key = `${who}\u0000${via.join(',')}`;
        let g = groups.get(key);
        if (g === undefined) {
          g = { who, via, lists: new Map(), rows: [], searched: 0, pages: new Map(), tools: new Map(), as: new Map(), changed: [] };
          groups.set(key, g);
        }
        return g;
      };
      const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
      for (const r of seen) {
        const g = groupOf(r.who, r.via);
        const n = Number(r.n);
        const colon = r.what.indexOf(':');
        const kind = colon < 0 ? r.what : r.what.slice(0, colon);
        const of = colon < 0 ? '' : r.what.slice(colon + 1);
        if (kind === 'list') bump(g.lists, of, n);
        else if (kind === 'row') {
          const name = rowName(of);
          if (!g.rows.includes(name)) g.rows.push(name);
        } else if (kind === 'search') g.searched += n;
        else if (kind === 'page') bump(g.pages, of, n);
        else if (kind === 'mcp') bump(g.tools, of, n);
        else if (kind === 'preview') bump(g.as, of, n);
      }
      for (const w of wrote) {
        const g = groupOf(w.who, w.via);
        /* A WRITE'S FIRST LINE MAY CARRY NO BATCH OF ITS OWN, ITS ID BEING THE BATCH, as Undo reads it. */
        for (const t of sql.all<{ target: string }>("SELECT target FROM event WHERE (batch = ? OR id = ?) AND target LIKE 'entry:%' GROUP BY target ORDER BY MIN(rowid)", w.batch, w.batch)) {
          const name = rowName(t.target.slice('entry:'.length));
          if (!g.changed.includes(name)) g.changed.push(name);
        }
      }

      const catalog = kernel.catalog();
      const listName = (id: string): string => catalog.lists.find((l) => l.id === id)?.name ?? 'A list since removed';
      const lines: ShareActivityLine[] = [];
      for (const g of groups.values()) {
        const said: string[] = [];
        for (const [list, n] of g.lists) said.push(`${listName(list)}, ${times(n)}.`);
        if (g.rows.length) said.push(`Opened ${together(g.rows)}.`);
        if (g.searched > 0) said.push(`Searched ${times(g.searched)}.`);
        for (const [slug, n] of g.pages) said.push(`The ${slug} page, ${times(n)}.`);
        if (g.tools.size) said.push(`Their agent: ${together([...g.tools].map(([tool, n]) => `${tool} ${times(n)}`), 8)}.`);
        for (const [as, n] of g.as) said.push(`Saw this BrainDog as ${personName(sql, as) ?? 'somebody no longer here'}, ${times(n)}.`);
        if (g.changed.length) said.push(`Changed ${together(g.changed)}.`);
        if (said.length === 0) continue;
        const via = g.via.length > 0 ? together(g.via.map((id) => shareName(id, catalog)), 8) : g.as.size > 0 ? 'See as' : 'Their own access';
        lines.push({ who: personName(sql, g.who) ?? 'Somebody no longer here', via, said: said.join(' ') });
      }
      lines.sort((a, b) => a.who.localeCompare(b.who) || a.via.localeCompare(b.via));
      return ok({ lines });
    },

    /** Every share on the record, live and ended in the last 30 days, each said as one sentence (§3.2). */
    async sharing(_args: unknown, ctx: CallContext): Promise<Result<SharingRow[]>> {
      const stop = team(ctx, 'see what this BrainDog shares');
      if (stop) return { ok: false, refusal: stop };
      const catalog = kernel.catalog();
      const since = instant(clock.now() - SHARES_ENDED_DAYS * DAY_MS);
      const n = names(catalog);
      return ok(kernel.sharesKept(since).map((s) => rowOf(s, catalog, n)));
    },

    /** Every live group, by name: its people by name and how many live shares it holds (§3.2, Groups). */
    async groups(_args: unknown, ctx: CallContext): Promise<Result<GroupRow[]>> {
      const stop = team(ctx, 'see the groups this BrainDog shares with');
      if (stop) return { ok: false, refusal: stop };
      const ids = sql.all<{ id: string }>('SELECT id FROM share_group WHERE retired_at IS NULL ORDER BY name COLLATE NOCASE, id');
      const out: GroupRow[] = [];
      for (const { id } of ids) {
        const g = kernel.groupKept(id);
        if (g !== null) out.push(groupOf(g));
      }
      return ok(out);
    },

    /**
     * Share part of the record with somebody, or change a share (`id`). Checked against the grammar (`checkShare`),
     * never an owner, the Plus hook for an outsider, and the inline confirm; kept with its event and the epoch moved.
     */
    async share(args: { id?: unknown; share?: unknown; note?: unknown; template?: unknown; bundle?: unknown } | undefined, ctx: CallContext): Promise<Result<Shared>> {
      const stop = team(ctx);
      if (stop) return { ok: false, refusal: stop };
      const s = grammarOf(args?.share);
      if (s === null) return refuse('REQUIRED_MISSING', 'A share says who, what and at which rung: view, comment, edit or manage.', 'share');
      const id = typeof args?.id === 'string' && args.id !== '' ? args.id : undefined;
      const was = id === undefined ? null : kernel.shareKept(id);
      if (id !== undefined && (was === null || was.revoked_at)) return refuse('REF_UNKNOWN', 'There is no live share with that id. Share it again instead.', 'id');
      const catalog = kernel.catalog();
      const bad = (await refusalOf(ctx, s, catalog, id)) ?? adminKeeps(ctx, s, was);
      if (bad) return { ok: false, refusal: bad };
      const confirm = unconfirmed(ctx, s);
      if (confirm) return { ok: false, refusal: confirm };
      const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 500) : undefined);
      const note = text(args?.note);
      const template = text(args?.template);
      const bundle = text(args?.bundle);
      const out = kernel.shareSave(ctx.principal.id, {
        ...s,
        ...(id === undefined ? {} : { id }),
        ...(note === undefined ? {} : { note }),
        ...(template === undefined ? {} : { template }),
        ...(bundle === undefined ? {} : { bundle }),
      });
      if (!out.ok) return out;
      return deps.tail(ok({ ...out.value, sentence: sentence(s, catalog) }));
    },

    /**
     * What is shared out, for Today's one line (`sharedOut`): an owner's or an Admin's, never while seeing as, and `null`
     * when nothing is shared.
     */
    async sharedOut(_args: Record<string, never> | undefined, ctx: CallContext): Promise<Result<SharedOut | null>> {
      const stop = team(ctx);
      if (stop) return { ok: false, refusal: stop };
      return ok(sharedOut(sql, kernel.catalog(), kernel.sharesKept(), ctx.principal.id, ctx.confirmable === true, clock.now()));
    },

    /** Stop one share at once, and every share made onward from it (§2.2, `parent_id`). Revoking never asks to confirm. */
    async unshare(args: { id?: unknown; why?: unknown } | undefined, ctx: CallContext): Promise<Result<{ ended: string[]; left: string[] }>> {
      const stop = team(ctx);
      if (stop) return { ok: false, refusal: stop };
      const id = typeof args?.id === 'string' ? args.id : '';
      const was = id === '' ? null : kernel.shareKept(id);
      if (was === null || was.revoked_at) return refuse('REF_UNKNOWN', 'There is no live share with that id. It may have ended already.', 'id');
      const mine = adminKeeps(ctx, null, was);
      if (mine) return { ok: false, refusal: mine };
      const why = typeof args?.why === 'string' && args.why.trim() !== '' ? args.why.trim().slice(0, 500) : null;
      const ended = kernel.shareRevoke(ctx.principal.id, id, why);
      /* WHO EACH ENDED SHARE REACHED, READ AFTER IT ENDED: a group's members are still its members. */
      return deps.tail(ok({ ended, left: leftOf(ended.flatMap(reachedBy)) }));
    },

    /**
     * Make a group, rename one (`id`), or retire one (`retire: true`), which ends every share it holds. A group holds
     * nothing until a share names it; its people are put in and taken out by `groupMember`.
     */
    async groupPut(args: { id?: unknown; name?: unknown; retire?: unknown; why?: unknown } | undefined, ctx: CallContext) {
      const stop = team(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      const id = typeof args?.id === 'string' && args.id !== '' ? args.id : undefined;
      const live = id === undefined ? null : kernel.groupKept(id);
      if (id !== undefined && (live === null || live.retired_at !== null)) return refuse('REF_UNKNOWN', 'There is no group by that id.', 'id');
      if (args?.retire === true) {
        if (live === null) return refuse('REQUIRED_MISSING', 'Which group? Retiring one needs its id.', 'id');
        const why = typeof args.why === 'string' && args.why.trim() !== '' ? args.why.trim().slice(0, 500) : null;
        const ended = kernel.groupRetire(ctx.principal.id, live.id, why);
        return deps.tail(ok({ ...groupOf(kernel.groupKept(live.id)!), ended, left: leftOf(live.people) }));
      }
      const name = typeof args?.name === 'string' ? args.name.trim().replace(/\s+/g, ' ') : '';
      if (name === '') return refuse('REQUIRED_MISSING', 'A group needs a name, such as Accountants.', 'name');
      if ([...name].length > GROUP_NAME_MOST || /[\p{Cc}\p{Cf}]/u.test(name))
        return refuse('VALUE_MALFORMED', `A group's name is plain words, at most ${GROUP_NAME_MOST} characters.`, 'name');
      const out = kernel.groupSave(ctx.principal.id, { ...(id === undefined ? {} : { id }), name });
      if (!out.ok) return out;
      return deps.tail(ok({ ...groupOf(kernel.groupKept(out.value.id)!), ended: [] as string[], left: [] as string[] }));
    },

    /**
     * Put somebody on the record in a group (`in: true`) or take them out (`in: false`). Each share the group holds is
     * an event for them, so leaving ends the group's shares for them out loud. Never an owner, who holds everything.
     */
    async groupMember(args: { group?: unknown; person?: unknown; in?: unknown } | undefined, ctx: CallContext) {
      const stop = team(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      const group = typeof args?.group === 'string' ? args.group : '';
      const g = group === '' ? null : kernel.groupKept(group);
      if (g === null || g.retired_at !== null) return refuse('REF_UNKNOWN', 'There is no group by that id.', 'group');
      const person = typeof args?.person === 'string' ? args.person : '';
      if (person === '' || sql.one('SELECT 1 AS y FROM person WHERE id = ?', person) === undefined)
        return refuse('REF_UNKNOWN', 'There is nobody here by that id.', 'person');
      if (typeof args?.in !== 'boolean') return refuse('REQUIRED_MISSING', 'Put them in the group, or take them out?', 'in');
      if (args.in && owners().includes(person)) return refuse('FORBIDDEN', 'An owner already holds everything here, so a group adds nothing.', 'person');
      /* AN ADMIN NEITHER PUTS THEMSELVES IN A GROUP NOR TAKES THEMSELVES OUT: either changes what they hold. */
      if (ctx.principal.kind === 'person' && ctx.principal.level !== 'owner' && person === ctx.principal.id)
        return refuse('FORBIDDEN', 'Only an owner can change what you can do here.', 'person');
      const said = kernel.groupMember(ctx.principal.id, g.id, person, args.in) ?? [];
      return deps.tail(ok({ ...groupOf(kernel.groupKept(g.id)!), said, left: args.in ? [] : leftOf([person]) }));
    },

    /** A share as the sheet would keep it, kept nowhere: its sentence, and how many rows of each list it reaches now. */
    async sharePreview(args: { share?: unknown } | undefined, ctx: CallContext): Promise<Result<SharePreview>> {
      const stop = team(ctx, 'preview a share');
      if (stop) return { ok: false, refusal: stop };
      const s = grammarOf(args?.share);
      if (s === null) return refuse('REQUIRED_MISSING', 'A share says who, what and at which rung: view, comment, edit or manage.', 'share');
      const catalog = kernel.catalog();
      const bad = checkShare(s, catalog, { owners: owners() });
      if (bad) return { ok: false, refusal: bad };
      const lists = reachOf(s, catalog);
      return ok({ sentence: sentence(s, catalog), lists, money: moneyShown(s, catalog, lists, ctx) });
    },

    /** The shares the caller holds, their own and their groups', each as one sentence (§3.4). A person only. */
    async myShares(_args: unknown, ctx: CallContext): Promise<Result<MyShare[]>> {
      const agent = personOnly(ctx);
      const stop = scoped(ctx, 'read') && scoped(ctx, 'append');
      if (agent ?? stop) return { ok: false, refusal: (agent ?? stop)! };
      const catalog = kernel.catalog();
      const now = clock.now();
      const n = names(catalog);
      const held = sharesFor(sql, ctx.principal.id) ?? [];
      const denies = held.filter((s) => s.effect === 'deny');
      /* WHO SHARED IT, BY NAME: the kept row's maker, which the lens's own copy of the share does not carry. */
      const byOf = (id: string): string | null => {
        const made = kernel.shareKept(id)?.made_by;
        return made === undefined ? null : (personName(sql, made) ?? null);
      };
      /* WHO A SHARE MAY GO ON TO, read once: everybody on the record by a member row or a live share of their own, by
         name, never an owner and never the caller. Somebody with no name and no address is not offered. */
      let people: { id: string; name: string }[] | null = null;
      const peopleHere = (): { id: string; name: string }[] =>
        (people ??= (() => {
          const own = new Set(owners());
          const ids = sql
            .all<{ id: string }>(
              `SELECT person_id AS id FROM member
               UNION SELECT who AS id FROM share WHERE who_kind = 'person' AND effect = 'allow' AND revoked_at IS NULL`,
            )
            .map((r) => r.id)
            .filter((id) => id !== ctx.principal.id && !own.has(id) && onRecord(id));
          return [...new Set(ids)].flatMap((id) => {
            const name = personName(sql, id);
            return name === undefined ? [] : [{ id, name }];
          });
        })());
      return ok(
        held
          .filter((s) => s.effect === 'allow')
          .map((s) => {
            const by = byOf(s.id);
            const onward = s.can === 'manage' && s.caps?.onward !== false && s.who.kind === 'person';
            /* THE LISTS IT CAN BE PASSED ON ONE AT A TIME, as `inside` takes them: a project's lists it reaches, or the
               lists any other share reaches whole. */
            const lists = onward
              ? catalog.lists
                  .filter((l) => ('project' in s.what ? shareTargetReaches(s.what, l) : shareTargetWhole(s.what, l)))
                  .map((l) => ({ id: l.id, name: l.name }))
              : [];
            return {
              id: s.id,
              sentence: shareSentenceOf(s, n, { now }),
              can: s.can,
              until: s.when?.until ?? null,
              onward,
              live: (s.when?.from === undefined || Date.parse(s.when.from) <= now) && (s.when?.until === undefined || Date.parse(s.when.until) > now),
              by,
              welcome: sharedWithYou([s, ...denies], by ?? undefined, n, { now }),
              ...(onward ? { what: s.what, subject: shareSubjectOf(s.what, n), lists, to: peopleHere() } : {}),
            };
          }),
      );
    },

    /**
     * Share on what you manage (§2.1, the manage rung): to a person on the record, at most Edit, inside your own share
     * and never past it. It ends when yours does. A person only, never their agent.
     */
    async shareOnward(
      args: { from?: unknown; who?: unknown; can?: unknown; what?: unknown; caps?: unknown; hide?: unknown; when?: unknown; note?: unknown } | undefined,
      ctx: CallContext,
    ): Promise<Result<Shared>> {
      const agent = personOnly(ctx);
      const stop = scoped(ctx, 'write');
      if (agent ?? stop) return { ok: false, refusal: (agent ?? stop)! };
      const me = ctx.principal.id;
      const from = typeof args?.from === 'string' ? args.from : '';
      const parent = (sharesFor(sql, me) ?? []).find((s) => s.id === from && s.who.kind === 'person' && s.effect === 'allow');
      if (parent === undefined) return refuse('REF_UNKNOWN', 'You hold no share by that id. Pick one from what you can see here.', 'from');
      if (parent.can !== 'manage' || parent.caps?.onward === false) return refuse('FORBIDDEN', 'You can share this on only where you manage it.', 'from');
      const now = clock.now();
      if ((parent.when?.until !== undefined && Date.parse(parent.when.until) <= now) || (parent.when?.from !== undefined && Date.parse(parent.when.from) > now))
        return refuse('FORBIDDEN', 'Your share is not on right now, so you cannot share it on.', 'from');

      const who = typeof args?.who === 'string' ? args.who : '';
      if (who === '' || who === me) return refuse('REQUIRED_MISSING', 'Share it on with somebody else on this BrainDog, by id.', 'who');
      if (sql.one('SELECT 1 AS y FROM person WHERE id = ?', who) === undefined || !onRecord(who))
        return refuse('REF_UNKNOWN', 'You can share on only with somebody already here.', 'who');
      const can = args?.can;
      if (can !== 'view' && can !== 'comment' && can !== 'edit') return refuse('OUT_OF_BOUNDS', 'You can share it on at view, comment or edit, never manage.', 'can');

      const catalog = kernel.catalog();
      const what = inside(parent.what, isObj(args?.what) ? (args.what as ShareTarget) : undefined, catalog);
      if (what === null) return refuse('OUT_OF_BOUNDS', 'That reaches past what you manage. Pick something inside it.', 'what');
      /* `$me` IS READ FOR WHOEVER HOLDS A SHARE, so a condition on your own rows handed on would reach theirs instead. */
      if (JSON.stringify(what).includes('"$me"'))
        return refuse('OUT_OF_BOUNDS', 'Yours reaches the rows that are yours, which cannot be shared on as they are. Name the rows to share instead.', 'what');
      /* AND NEVER WHAT YOU ARE KEPT FROM: a share on a list somebody keeps from you would reach past your own reach. */
      const kept = (sharesFor(sql, me) ?? []).filter((d) => d.effect === 'deny');
      if (catalog.lists.some((l) => shareTargetReaches(what, l) && kept.some((d) => shareTargetReaches(d.what, l))))
        return refuse('OUT_OF_BOUNDS', 'Part of that is kept from you, so you cannot share it on. Pick a list nothing is kept from you on.', 'what');

      /* NEVER MORE THAN THE PARENT: its switches off stay off, its hidden fields stay hidden, its time bounds the child. */
      const asked = isObj(args?.caps) ? (args.caps as ShareCaps) : {};
      const pc = parent.caps ?? {};
      const caps: ShareCaps = {};
      for (const k of ['history', 'delete', 'agents'] as const) {
        const v = pc[k] === false ? false : asked[k];
        if (v !== undefined) caps[k] = v;
      }
      if (asked.create === true && pc.create !== false) caps.create = true;
      const hide = hideMap(parent.hide, catalog);
      for (const [l, fs] of Object.entries(hideMap(isObj(args?.hide) ? (args.hide as ShareHide) : undefined, catalog))) hide[l] = [...new Set([...(hide[l] ?? []), ...fs])].sort();
      const pw = parent.when ?? {};
      const aw = isObj(args?.when) ? (args.when as ShareWhen) : {};
      if (pw.hours !== undefined && aw.hours !== undefined && JSON.stringify(pw.hours) !== JSON.stringify(aw.hours))
        return refuse('OUT_OF_BOUNDS', 'Your share keeps its own hours, and one shared on from it keeps the same.', 'when.hours');
      const later = (a?: string, b?: string): string | undefined => (a === undefined ? b : b === undefined ? a : Date.parse(a) >= Date.parse(b) ? a : b);
      const sooner = (a?: string, b?: string): string | undefined => (a === undefined ? b : b === undefined ? a : Date.parse(a) <= Date.parse(b) ? a : b);
      const fromAt = later(pw.from, aw.from);
      const until = sooner(pw.until, aw.until);
      const hours = pw.hours ?? aw.hours;
      const when: ShareWhen = {
        ...(fromAt === undefined ? {} : { from: fromAt }),
        ...(until === undefined ? {} : { until }),
        ...(hours === undefined ? {} : { hours }),
        ...(pw.once === true || aw.once === true ? { once: true as const } : {}),
      };
      const s: Share = {
        effect: 'allow',
        who: { kind: 'person', id: who },
        what,
        can,
        ...(Object.keys(caps).length ? { caps } : {}),
        ...(Object.keys(hide).length ? { hide } : {}),
        ...(Object.keys(when).length ? { when } : {}),
      };
      const bad = await refusalOf(ctx, s, catalog);
      if (bad) return { ok: false, refusal: bad };
      const note = typeof args?.note === 'string' && args.note.trim() !== '' ? args.note.trim().slice(0, 500) : undefined;
      const out = kernel.shareSave(me, { ...s, parent_id: parent.id, ...(note === undefined ? {} : { note }) });
      if (!out.ok) return out;
      return deps.tail(ok({ ...out.value, sentence: sentence(s, catalog) }));
    },
  };
}
