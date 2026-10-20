/**
 * The share API (sharing plan slice 7): `sharing`, `share`, `unshare` and `sharePreview` for an owner or an Admin, and
 * `myShares` and `shareOnward` for whoever holds a share.
 *
 * A SHARE IS ONE ROW (§2.2) AND THE KERNEL KEEPS IT: `kernel.shareSave` and `kernel.shareRevoke` write the row, its
 * `access.grant` or `access.revoke` event in the §2.10 shape, and move the access epoch, all in one transaction. This
 * file decides whether a share may be kept: the grammar's rules (`checkShare`), never an owner as the target, the Plus
 * hook for somebody not on the record yet, and the inline confirm (§6, default 1).
 *
 * AGENTS NEVER SHARE (T3). The owner's and Admin's methods are `team`, which refuses every token
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
  lensOf,
  shareMeOf,
  shareSentenceOf,
  shareTargetReaches,
  shareTargetWhole,
  sharesFor,
  type HeldShare,
  type Json,
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
import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import { FRESH, type CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How long an ended share stays on the Sharing page, in days (§3.2, "Ended: the last 30 days"). */
export const SHARES_ENDED_DAYS = 30;
/** The most live shares one person holds, their groups' among them (T14). */
export const SHARES_PER_PERSON_MOST = 50;

const DAY_MS = 86_400_000;

/** One share as the Sharing page draws it: the grammar, its sentence, and who made it when. */
export type SharingRow = {
  id: string;
  sentence: string;
  effect: Share['effect'];
  who: Share['who'];
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

/** What `sharePreview` answers: the sentence, and how many rows of each list the share reaches now. */
export type SharePreview = { sentence: string; lists: { list: string; name: string; rows: number }[] };

/** One of the caller's own shares, as "What you can see here" lists it (§3.4). */
export type MyShare = { id: string; sentence: string; can: ShareRung; until: string | null; onward: boolean; live: boolean };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const refuse = (code: string, fix: string, at: string): Result<never> => ({ ok: false, refusal: { code, fix, at } });

/** A token is never a sharer (T3): the one sentence every share route gives one, before it reads anything. */
const AGENTS_NEVER: Refusal = { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; an agent cannot share or see what is shared.', at: 'principal' };
const personOnly = (ctx: CallContext): Refusal | null => (ctx.principal.kind === 'person' ? null : AGENTS_NEVER);

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

  const personName = (id: string): string | undefined => {
    const row = sql.one<{ name: string | null; email: string | null }>('SELECT name, email FROM person WHERE id = ?', id);
    return row ? (row.name ?? row.email ?? undefined) : undefined;
  };

  /** Names, never ids, for a sentence (§3.5). */
  const names = (catalog: LensCatalog): ShareNames => {
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
      person: personName,
      group: (id) => {
        const g = sql.one<{ name: string }>('SELECT name FROM share_group WHERE id = ? AND retired_at IS NULL', id);
        if (!g) return undefined;
        const n = Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM share_group_member WHERE group_id = ?', id)?.n ?? 0);
        return { name: g.name, people: n };
      },
      list: (id) => listOf(id)?.name.toLowerCase(),
      project: titleOf,
      row: (list, id) => {
        const row = rowOf(id);
        const name = listOf(list)?.name;
        return row && name && row.seq !== null ? `${name.replace(/s$/i, '')} ${row.seq}` : titleOf(id);
      },
    };
  };

  const sentence = (s: Share | readonly Share[], catalog: LensCatalog): string => shareSentenceOf(s, names(catalog), { now: clock.now() });

  /** The live shares a grantee already holds, for the parameter budget and the per-person ceiling. */
  const othersOf = (who: Share['who'], but?: string): HeldShare[] => {
    if (who.kind === 'person') return (sharesFor(sql, who.id) ?? []).filter((s) => s.id !== but);
    return kernel.sharesKept().filter((s) => s.who.kind === who.kind && s.who.id === who.id && s.id !== but);
  };

  /** Whether a person is on the record at all: a member row, or a live share of their own. */
  const onRecord = (person: string): boolean =>
    sql.one('SELECT 1 AS y FROM member WHERE person_id = ? LIMIT 1', person) !== undefined || (sharesFor(sql, person) ?? []).length > 0;

  /**
   * Why this share may not be kept for this caller, or `null`: the grammar's rules, a grantee who is there, never an
   * owner, at most `SHARES_PER_PERSON_MOST` each, and the Plus hook for somebody not on the record yet.
   */
  const refusalOf = (ctx: CallContext, s: Share, catalog: LensCatalog, but?: string): Refusal | null => {
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
    const outsider = who.kind === 'email' || (who.kind === 'person' && !onRecord(who.id));
    return outsider ? (deps.plus?.(ctx, who) ?? null) : null;
  };

  /**
   * THE INLINE CONFIRM (§6, default 1): widening to somebody not on the record at Edit or Manage, or a share with no
   * end, asks for a passkey proof in the last fifteen minutes, but only of somebody who has a passkey to give. Without
   * one the share goes ahead, and the owner's Today says so (slice 10). A deny never asks.
   */
  const unconfirmed = (ctx: CallContext, s: Share): Refusal | null => {
    if (s.effect !== 'allow' || ctx.confirmable !== true) return null;
    const outsider = s.who.kind === 'email' && (s.can === 'edit' || s.can === 'manage');
    const endless = s.when?.until === undefined;
    if (!outsider && !endless) return null;
    if (ctx.provedAt !== undefined && clock.now() - ctx.provedAt <= FRESH) return null;
    return { code: 'NEEDS_BROWSER_SESSION', fix: "Confirm it's you, then share again. Nothing was shared yet.", at: 'confirm' };
  };

  const rowOf = (s: ShareKept, catalog: LensCatalog): SharingRow => ({
    id: s.id,
    sentence: sentence(s, catalog),
    effect: s.effect,
    who: s.who,
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

  return {
    /** Every share on the record, live and ended in the last 30 days, each said as one sentence (§3.2). */
    async sharing(_args: unknown, ctx: CallContext): Promise<Result<SharingRow[]>> {
      const stop = team(ctx, 'see what this record shares');
      if (stop) return { ok: false, refusal: stop };
      const catalog = kernel.catalog();
      const since = instant(clock.now() - SHARES_ENDED_DAYS * DAY_MS);
      return ok(kernel.sharesKept(since).map((s) => rowOf(s, catalog)));
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
      const bad = refusalOf(ctx, s, catalog, id);
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

    /** Stop one share at once, and every share made onward from it (§2.2, `parent_id`). Revoking never asks to confirm. */
    async unshare(args: { id?: unknown; why?: unknown } | undefined, ctx: CallContext): Promise<Result<{ ended: string[] }>> {
      const stop = team(ctx);
      if (stop) return { ok: false, refusal: stop };
      const id = typeof args?.id === 'string' ? args.id : '';
      const was = id === '' ? null : kernel.shareKept(id);
      if (was === null || was.revoked_at) return refuse('REF_UNKNOWN', 'There is no live share with that id. It may have ended already.', 'id');
      const why = typeof args?.why === 'string' && args.why.trim() !== '' ? args.why.trim().slice(0, 500) : null;
      return deps.tail(ok({ ended: kernel.shareRevoke(ctx.principal.id, id, why) }));
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
      return ok({ sentence: sentence(s, catalog), lists: reachOf(s, catalog) });
    },

    /** The shares the caller holds, their own and their groups', each as one sentence (§3.4). A person only. */
    async myShares(_args: unknown, ctx: CallContext): Promise<Result<MyShare[]>> {
      const agent = personOnly(ctx);
      const stop = scoped(ctx, 'read') && scoped(ctx, 'append');
      if (agent ?? stop) return { ok: false, refusal: (agent ?? stop)! };
      const catalog = kernel.catalog();
      const now = clock.now();
      const held = sharesFor(sql, ctx.principal.id) ?? [];
      return ok(
        held
          .filter((s) => s.effect === 'allow')
          .map((s) => ({
            id: s.id,
            sentence: sentence(s, catalog),
            can: s.can,
            until: s.when?.until ?? null,
            onward: s.can === 'manage' && s.caps?.onward !== false && s.who.kind === 'person',
            live: (s.when?.from === undefined || Date.parse(s.when.from) <= now) && (s.when?.until === undefined || Date.parse(s.when.until) > now),
          })),
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
      if (who === '' || who === me) return refuse('REQUIRED_MISSING', 'Share it on with somebody else on the record, by id.', 'who');
      if (sql.one('SELECT 1 AS y FROM person WHERE id = ?', who) === undefined || !onRecord(who))
        return refuse('REF_UNKNOWN', 'You can share on only with somebody already on this record.', 'who');
      const can = args?.can;
      if (can !== 'view' && can !== 'comment' && can !== 'edit') return refuse('OUT_OF_BOUNDS', 'You can share it on at view, comment or edit, never manage.', 'can');

      const catalog = kernel.catalog();
      const what = inside(parent.what, isObj(args?.what) ? (args.what as ShareTarget) : undefined, catalog);
      if (what === null) return refuse('OUT_OF_BOUNDS', 'That reaches past what you manage. Pick something inside it.', 'what');

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
      const bad = refusalOf(ctx, s, catalog);
      if (bad) return { ok: false, refusal: bad };
      const note = typeof args?.note === 'string' && args.note.trim() !== '' ? args.note.trim().slice(0, 500) : undefined;
      const out = kernel.shareSave(me, { ...s, parent_id: parent.id, ...(note === undefined ? {} : { note }) });
      if (!out.ok) return out;
      return deps.tail(ok({ ...out.value, sentence: sentence(s, catalog) }));
    },
  };
}
