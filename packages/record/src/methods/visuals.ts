/**
 * Visuals: `attachVisual`, `visuals`, `visual` and `settleVisual`, a page with its pictures hung on a task, a project, a
 * question or a decision. Asked as a note is asked, since it changes no value; the bytes stay in the
 * host's store.
 *
 * A VERSION MAY COME AS A DRAFT (`draft: true`), which waits beside the version the visual stands at and never replaces
 * it. AN AGENT'S VERSION IS A DRAFT BY DEFAULT (owner's call, 24 Oct): one a token, a runner or BrainDog itself hands in
 * waits unless it says `draft: false`, while a person's own version is kept as it comes. A person settles it in BrainDog with `settleVisual`: Keep, so the visual stands at it; Throw away; or Try again,
 * which throws it away and tells the run that drew it to draw it again, as a draft.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import {
  PICTURE_NAME,
  VISUAL_PAGE_MOST,
  VISUAL_PICTURE_TYPES,
  VISUAL_PICTURES_BYTES_MOST,
  VISUAL_PICTURES_MOST,
  VISUAL_TITLE_MOST,
  visualPage,
  type VisualBody,
  type VisualHeld,
  type VisualPicture,
  type VisualVersion,
  type WriteContext,
} from '@braindog/kernel';

import { ladder } from '../ladder.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/**
 * Where a host keeps a visual's bytes: its pages by their hash, and the file store's pictures, which it only looks at.
 * On the Cloud both are in `BLOBS` under the record's prefix; on a self-host, in its `blobs/` folder.
 */
export type VisualStore = {
  /** Keeps a page's bytes under their hash. The same bytes again change nothing. */
  putPage(sha256: string, bytes: Uint8Array): Promise<void>;
  /** A page's bytes, or `null` when this host holds none under that hash. */
  getPage(sha256: string): Promise<Uint8Array | null>;
  /** What the file store holds under one hash: its length and its type, or `null`. */
  file(sha256: string): Promise<{ bytes: number; mime: string } | null>;
  /** The file store's bytes under one hash, or `null`: an attachment's words are read from them (`attachments.ts`). */
  getFile?(sha256: string): Promise<Uint8Array | null>;
  /** Keeps bytes in the file store under their hash, for a file an agent hands in as text. The same bytes again change nothing. */
  putFile?(sha256: string, bytes: Uint8Array, mime: string): Promise<void>;
};

/** One picture as a call names it: the name the page uses, and the hash its bytes were put under. */
export type PictureNamed = { name: string; sha256: string };

/** What `attachVisual` takes. */
export type AttachVisualArgs = { on: string; page: string; title?: string; pictures?: PictureNamed[]; visual?: string; draft?: boolean };

/** What `attachVisual` answers: the receipt. `batch` is what an undo takes back. */
export type VisualAttached = {
  visual: string;
  version: number;
  title: string;
  on: string;
  pictures: number;
  batch: string | null;
  said: string;
  unchanged?: true;
  /** Present when the version came as a draft: it waits to be kept or thrown away. */
  draft?: true;
};

/**
 * One visual as `visuals` lists it: where it stands, and what its page and pictures are by hash. `draft` is the version
 * waiting beside it, or `null`; `kept` is false for a visual whose only versions are drafts, listed by its draft.
 */
export type VisualListed = {
  id: string;
  title: string;
  version: number;
  kept: boolean;
  draft: { version: number; by: string; at: string } | null;
  versions: number;
  by: string;
  at: string;
  page: { sha256: string; bytes: number };
  pictures: VisualPicture[];
};

/**
 * One visual whole as `visual` answers it: the version asked, its page's text, and every version without theirs. Each
 * version names the write it was made in (`batch`), which `undo` takes back, so the app's Undo needs no receipt.
 */
export type VisualRead = {
  id: string;
  on: string;
  title: string;
  version: number;
  /** The version the visual stands at, and the draft waiting beside it: each a number, or `null` for none. */
  kept: number | null;
  draft: number | null;
  by: string;
  at: string;
  page: string;
  pictures: VisualPicture[];
  /** Every version; `draft` is true for one handed in as a draft and never kept. */
  versions: { version: number; title: string; by: string; at: string; bytes: number; pictures: number; batch: string | null; draft: boolean }[];
};

/** The three presses a draft offers. */
export const SETTLE_AS = ['keep', 'throw', 'again'] as const;

/** What `settleVisual` takes: the visual, the version pressed on, and the press. */
export type SettleVisualArgs = { id: string; version: number; as: (typeof SETTLE_AS)[number] };

/**
 * What `settleVisual` answers: the version the visual stands at now, in one sentence, the write an undo takes back, and
 * for Try again the instruction it filed.
 */
export type VisualSettled = { visual: string; kept: number | null; batch: string | null; said: string; told?: string };

const SHA = /^[0-9a-f]{64}$/;
const BYTES = new TextEncoder();
const TEXT = new TextDecoder();

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const words = (s: string): string => s.toLowerCase().replace(/\s+/gu, ' ').trim();
const sized = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The sentence for a thing that is not there and for one the caller may not see, which must be the same sentence. */
const NOTHING = 'There is nothing by that name you can see. Name a task, a project, a question or a decision as it is spoken, or by its name.';

/** What a thing is on, as the log keys it, with its list when it is a task or a project. */
type On = { target: string; list: string | null; id: string; words: string };

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, scoped, sightOf, spokenAs, sight, no, tail, clock } = deps;
  const trust = ladder({ sql, kernel, now: () => clock.now() });

  /** The writer as the record signs writes: a token by its run, a person as herself (`writerOf` in `index.ts`). */
  const writerOf = (ctx: CallContext): WriteContext =>
    deps.writer?.(ctx) ?? { actor: ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.kind === 'person' ? ctx.principal.id : 'system' };

  /** A question's words as it was asked, or `null`. */
  const askedOf = (id: string): string | null => {
    const r = sql.one<{ q: string | null }>(
      "SELECT coalesce(to_v, note) AS q FROM event WHERE kind = 'suggest' AND target = ? AND field IS NULL AND coalesce(to_v, '') <> 'reopened' ORDER BY rowid DESC LIMIT 1",
      `suggestion:${id}`,
    )?.q;
    if (typeof r !== 'string') return null;
    try {
      const v: unknown = JSON.parse(r);
      return typeof v === 'string' ? v : r;
    } catch {
      return r;
    }
  };

  /** A thing in words: its title and its list, or the question it asks. Never its id, and nothing this caller may not see. */
  const wordsOf = (ctx: CallContext, target: string): string => {
    if (sightOf(ctx, target) === null) return 'it';
    if (target.startsWith('entry:')) {
      const row = kernel.get(target.slice('entry:'.length));
      const title = row === null ? null : kernel.titleOfRow(row.id);
      const list = row === null ? null : (kernel.registers().get(row.register)?.name ?? null);
      return `${title ? `"${clip(title, 60)}"` : 'it'}${list ? ` in ${list}` : ''}`;
    }
    if (target.startsWith('suggestion:')) {
      const q = askedOf(target.slice('suggestion:'.length));
      return q ? `the question "${clip(q, 60)}"` : 'the question';
    }
    const d = kernel.governanceRow('decision', target.slice('decision:'.length));
    return typeof d?.question === 'string' ? `the decision on "${clip(d.question, 60)}"` : 'the decision';
  };

  /**
   * What `on` names, for this caller, or the refusal. A question or a decision by its number or its handle, a task or a
   * project by its spoken id, and anything else by its name: one thing called that is it, several are named back.
   */
  const thingOf = (ctx: CallContext, on: unknown): On | Refusal => {
    if (typeof on !== 'string' || on.trim() === '')
      return { code: 'REQUIRED_MISSING', fix: 'Say what it is on: a task, a project, a question or a decision, as it is spoken or by its name.', at: 'on' };
    const said = on.trim();
    const governed = /^(SG|D)([1-9][0-9]*)$/u.exec(said);
    const handle = spokenAs(said);
    const number = governed ? said : handle;
    if (number !== null) {
      const target = `${number.startsWith('SG') ? 'suggestion' : 'decision'}:${number}`;
      return sightOf(ctx, target) === null ? { code: 'REF_UNKNOWN', fix: NOTHING, at: 'on' } : { target, list: null, id: number, words: wordsOf(ctx, target) };
    }
    const row = kernel.get(said);
    if (row !== null) {
      const target = `entry:${row.id}`;
      return sightOf(ctx, target) === null ? { code: 'REF_UNKNOWN', fix: NOTHING, at: 'on' } : { target, list: row.register, id: row.id, words: wordsOf(ctx, target) };
    }
    /* BY ITS NAME, as `get` takes one: the one thing whose title is these words, case and spacing aside. */
    if (said.length > 200) return { code: 'REF_UNKNOWN', fix: NOTHING, at: 'on' };
    const hits = kernel.search(said, { limit: 20 }).filter((h) => sightOf(ctx, `entry:${h.id}`) !== null);
    const exact = hits.filter((h) => words(kernel.titleOfRow(h.id) ?? '') === words(said));
    const picked = exact.length > 0 ? exact : hits.length === 1 ? hits : [];
    if (picked.length === 0) return { code: 'REF_UNKNOWN', fix: NOTHING, at: 'on' };
    if (picked.length > 1) {
      const handles = picked.slice(0, 5).map((h) => kernel.nameOf(h.id) ?? h.id);
      return { code: 'NAME_AMBIGUOUS', fix: `${picked.length} things are called ${clip(said, 60)}: ${handles.join(', ')}. Say which by how it is spoken.`, at: 'on', allowed: handles };
    }
    const one = kernel.get(picked[0]!.id)!;
    return { target: `entry:${one.id}`, list: one.register, id: one.id, words: wordsOf(ctx, `entry:${one.id}`) };
  };

  /** Why this caller may not hang a visual on this thing, or `null`: what a note asks of a task, what `propose` asks of a question. */
  const mayDraw = (ctx: CallContext, at: On): Refusal | null => {
    if (at.list === null) return guard(ctx, 'propose');
    const held = guard(ctx, 'append', at.list);
    if (held) return held;
    if (!sight.mayWrite(ctx, at.list, at.id)) return { code: 'REF_UNKNOWN', fix: NOTHING, at: 'on' };
    if (ctx.principal.kind !== 'token') return null;
    const grant = trust.grantOf(ctx.principal.id);
    if (grant === null) return null;
    /* AN AGENT'S NOTE FLOOR (`noteFault`): a thing another person made, or a list of keys, is not drawn on by an agent. */
    const fault = trust.noteFault({ token: ctx.principal.id, scope: grant.scope, person: grant.person, run: null, app: null }, at.list, at.id);
    if (fault === null) return null;
    /* The floor's own words up to its reason, then what a visual does instead. */
    const floor = fault.split(', so ')[0] ?? fault;
    return { code: 'FORBIDDEN', fix: `${floor}, so an agent's visual is not put on it. Put it on a question you ask with propose instead.`, at: 'on' };
  };

  const listed = (v: VisualHeld): VisualListed => ({
    id: v.id,
    title: v.title,
    version: v.now.n,
    kept: v.kept,
    draft: v.draft === null ? null : { version: v.draft.n, by: v.draft.by, at: v.draft.at },
    versions: v.versions,
    by: v.now.by,
    at: v.now.at,
    page: { sha256: v.now.page, bytes: v.now.bytes },
    pictures: v.now.pictures,
  });

  /** A thing as `thingOf` answers it, from where the log keys it, or `null` for one this caller may not see. */
  const onOf = (ctx: CallContext, target: string): On | null => {
    if (sightOf(ctx, target) === null) return null;
    if (target.startsWith('entry:')) {
      const row = kernel.get(target.slice('entry:'.length));
      return row === null ? null : { target, list: row.register, id: row.id, words: wordsOf(ctx, target) };
    }
    return { target, list: null, id: target.slice(target.indexOf(':') + 1), words: wordsOf(ctx, target) };
  };

  const sameBody = (a: VisualBody, b: VisualVersion | null): boolean =>
    b !== null && a.page === b.page && a.title === b.title && JSON.stringify(a.pictures) === JSON.stringify(b.pictures);

  return {
    /**
     * Hang a page on a thing, or give one it carries a new version. DATA. The same title again is its next version, so a
     * redraw is one visual with a history; the same page, title and pictures again write nothing.
     */
    async attachVisual(args: AttachVisualArgs, ctx: CallContext): Promise<Result<VisualAttached>> {
      const stop = scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Partial<Record<keyof AttachVisualArgs, unknown>>;
      const at = thingOf(ctx, a.on);
      if ('code' in at) return { ok: false, refusal: at };
      const held = mayDraw(ctx, at);
      if (held) return { ok: false, refusal: held };

      if (typeof a.page !== 'string' || a.page.trim() === '') return no('REQUIRED_MISSING', 'Send the page itself as page: HTML with its style and script.', { at: 'page' });
      if (a.page.length > VISUAL_PAGE_MOST * 4) return no('OUT_OF_BOUNDS', `A page is at most ${VISUAL_PAGE_MOST / 1024} KB without its pictures.`, { at: 'page' });
      const named = a.pictures ?? [];
      if (!Array.isArray(named)) return no('VALUE_MALFORMED', 'pictures is a list of { name, sha256 }, one for each picture the page names.', { at: 'pictures' });
      if (named.length > VISUAL_PICTURES_MOST) return no('OUT_OF_BOUNDS', `A visual names at most ${VISUAL_PICTURES_MOST} pictures, and this one names ${named.length}.`, { at: 'pictures' });
      const seen = new Set<string>();
      for (const p of named) {
        const q = (p ?? {}) as Record<string, unknown>;
        if (typeof q.name !== 'string' || !PICTURE_NAME.test(q.name))
          return no('VALUE_MALFORMED', 'A picture is named as the page names it, such as img/today.jpg: letters, digits, dots, dashes, underscores and slashes.', { at: 'pictures' });
        if (typeof q.sha256 !== 'string' || !SHA.test(q.sha256)) return no('VALUE_MALFORMED', `The picture ${q.name} needs its sha256, as the file door answered it.`, { at: 'pictures' });
        if (seen.has(q.name)) return no('VALUE_MALFORMED', `The picture ${q.name} is named twice.`, { at: 'pictures' });
        seen.add(q.name);
      }
      const checked = visualPage(a.page, seen);
      if ('fault' in checked) return no('VALUE_MALFORMED', `This page cannot be kept because ${checked.fault}`, { at: 'page' });

      const titled = typeof a.title === 'string' && a.title.trim() !== '' ? a.title.replace(/\s+/gu, ' ').trim() : checked.title;
      if (titled === null) return no('REQUIRED_MISSING', 'Give it a title, or a <title> in the page, so it can be named where it shows.', { at: 'title' });
      const title = clip(titled, VISUAL_TITLE_MOST);

      const store = deps.visuals;
      if (store === undefined)
        return no('NOT_IN_THIS_BUILD', 'This BrainDog keeps no pages drawn on a row: it has no file store. Say what the page shows in a note instead, with log and no page.', { at: 'page' });

      /* EVERY PICTURE IS ONE THE FILE STORE HOLDS, a picture and no larger than the store takes, asked of the store and
         never taken from the call: what the page names is what was kept. */
      const pictures: VisualPicture[] = [];
      let total = 0;
      for (const p of named as PictureNamed[]) {
        const file = await store.file(p.sha256);
        if (file === null)
          return no('REF_UNKNOWN', `The picture ${p.name} is not kept here. Put it with PUT /api/files/${p.sha256} first, then hand the page in.`, { at: 'pictures' });
        if (!VISUAL_PICTURE_TYPES.includes(file.mime))
          return no('VALUE_MALFORMED', `${p.name} is not a picture a visual shows: PNG, JPEG, GIF, WebP or AVIF.`, { at: 'pictures' });
        pictures.push({ name: p.name, sha256: p.sha256, mime: file.mime, bytes: file.bytes });
        total += file.bytes;
      }
      if (total > VISUAL_PICTURES_BYTES_MOST)
        return no('OUT_OF_BOUNDS', `Its pictures come to ${sized(total)}, and a visual holds ${sized(VISUAL_PICTURES_BYTES_MOST)}. Make them smaller.`, { at: 'pictures' });

      const bytes = BYTES.encode(checked.page);
      const page = hex(await crypto.subtle.digest('SHA-256', bytes));
      if (a.draft !== undefined && typeof a.draft !== 'boolean') return no('VALUE_MALFORMED', 'draft is true for a version to be kept or thrown away, or left out.', { at: 'draft' });
      /* AN AGENT DRAWS, AND A PERSON DECIDES: anybody but a person hands a draft in unless it says otherwise. */
      const draft = a.draft ?? ctx.principal.kind !== 'person';
      const body: VisualBody = { title, page, bytes: bytes.byteLength, pictures, ...(draft ? { draft: true as const } : {}) };

      /* WHICH VISUAL: the one named, or the one this thing carries under this title, or a new one. */
      const on = kernel.visualsOn(at.target);
      let id: string | undefined;
      if (a.visual !== undefined) {
        if (typeof a.visual !== 'string' || kernel.visualOn(a.visual) !== at.target) return no('REF_UNKNOWN', 'There is no such visual on this to give a new version.', { at: 'visual' });
        id = a.visual;
      } else id = on.find((v) => words(v.title) === words(title))?.id;
      const whole = id === undefined ? null : kernel.visualOf(id);
      const now = whole?.now ?? null;
      /* THE SAME PAGE AGAIN WRITES NOTHING: as the version it stands at, or as the draft already waiting. */
      const same = [whole?.draft ?? null, now].find((v) => v !== null && sameBody(body, v)) ?? null;
      if (id !== undefined && same !== null)
        return ok({
          visual: id,
          version: same.n,
          title,
          on: at.words,
          pictures: pictures.length,
          batch: null,
          said: same === now ? `${title} on ${at.words} is already this version.` : `${title} on ${at.words} already waits as this draft.`,
          unchanged: true,
          ...(same === now ? {} : { draft: true as const }),
        });

      /* ONLY NEW BYTES WEIGH: a picture or a page the visual already had costs the record nothing again. */
      const had = new Set(now === null ? [] : [now.page, ...now.pictures.map((p) => p.sha256)]);
      const weight = (had.has(page) ? 0 : bytes.byteLength) + pictures.filter((p) => !had.has(p.sha256)).reduce((n, p) => n + p.bytes, 0);

      await store.putPage(page, bytes);
      const fresh = id === undefined;
      const wrote = kernel.writeVisual({
        target: at.target,
        ...(id === undefined ? {} : { id }),
        said: { body },
        weight,
        note: draft ? `Drew a draft of the visual "${clip(title, 80)}".` : fresh ? `Added the visual "${clip(title, 80)}".` : `A new version of the visual "${clip(title, 80)}".`,
        w: { ...writerOf(ctx), ...(ctx.batch === undefined ? {} : { batch: ctx.batch }) },
      });
      if (!wrote.ok) return wrote as Result<never>;
      const n = wrote.value.n ?? 1;
      const said = draft
        ? `Version ${n} of "${clip(title, 80)}" waits on ${at.words} as a draft, to be kept or thrown away in BrainDog.`
        : fresh
          ? `Put "${clip(title, 80)}" on ${at.words}${pictures.length > 0 ? `, with ${pictures.length === 1 ? 'one picture' : `${pictures.length} pictures`}` : ''}.`
          : `Version ${n} of "${clip(title, 80)}" is on ${at.words}.`;
      return tail(ok({ visual: wrote.value.id, version: n, title, on: at.words, pictures: pictures.length, batch: wrote.value.batch, said, ...(draft ? { draft: true as const } : {}) }));
    },

    /** Every visual a thing carries now, oldest first, each by its hashes and without its page. READ+. */
    async visuals(args: { on: string }, ctx: CallContext): Promise<Result<{ on: string; visuals: VisualListed[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const at = thingOf(ctx, args?.on);
      if ('code' in at) return { ok: false, refusal: at };
      return ok({ on: at.words, visuals: kernel.visualsOn(at.target).map(listed) });
    },

    /**
     * One visual: the version asked (the draft waiting when none is, else the one it stands at), its page's text and its
     * pictures by hash, and every version by who made it and when. READ+. A visual taken away is read by naming a version.
     */
    async visual(args: { id: string; version?: number }, ctx: CallContext): Promise<Result<VisualRead>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const id = typeof args?.id === 'string' ? args.id.trim() : '';
      const whole = id === '' ? null : kernel.visualOf(id);
      if (whole === null || sightOf(ctx, whole.target) === null) return no('REF_UNKNOWN', 'There is no visual by that id you can see.', { at: 'id' });
      const asked = args.version;
      if (asked !== undefined && (typeof asked !== 'number' || !Number.isSafeInteger(asked) || asked < 1 || asked > whole.versions.length))
        return no('OUT_OF_BOUNDS', `This visual has versions 1 to ${whole.versions.length}.`, { at: 'version' });
      const one = asked === undefined ? (whole.draft ?? whole.now) : whole.versions[asked - 1]!;
      if (one === null) return no('REF_UNKNOWN', `This visual was taken away. Name a version, 1 to ${whole.versions.length}, to read one.`, { at: 'version' });
      const store = deps.visuals;
      if (store === undefined) return no('NOT_IN_THIS_BUILD', 'This BrainDog keeps no visuals: it has no file store.', { at: 'host' });
      const bytes = await store.getPage(one.page);
      if (bytes === null) return no('REF_UNKNOWN', 'This version is named here and its page is not on this host. Hand it in again.', { at: 'version' });
      return ok({
        id: whole.id,
        on: wordsOf(ctx, whole.target),
        title: one.title,
        version: one.n,
        kept: whole.now?.n ?? null,
        draft: whole.draft?.n ?? null,
        by: one.by,
        at: one.at,
        page: TEXT.decode(bytes),
        pictures: one.pictures,
        versions: whole.versions.map((v) => ({ version: v.n, title: v.title, by: v.by, at: v.at, bytes: v.bytes, pictures: v.pictures.length, batch: v.batch, draft: v.draft })),
      });
    },

    /**
     * A person settles a version in BrainDog. DATA, a person's alone: an agent suggests, and the person
     * decides. `keep` makes the visual stand at the draft that waits; `throw` throws that draft away; `again` throws it
     * away when it waits and tells the run that drew the version to draw it again, as a draft. Each names the version
     * pressed on, so a press on a screen a newer version has passed is refused rather than settling the wrong one.
     */
    async settleVisual(args: SettleVisualArgs, ctx: CallContext): Promise<Result<VisualSettled>> {
      if (ctx.principal.kind === 'token')
        return no('NEEDS_BROWSER_SESSION', 'A person keeps or throws away a draft, in BrainDog. Hand the next version in as a draft.', { at: 'principal' });
      const stop = scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Partial<Record<keyof SettleVisualArgs, unknown>>;
      if (!(SETTLE_AS as readonly unknown[]).includes(a.as)) return no('ENUM_VALUE_UNKNOWN', `as is one of ${SETTLE_AS.join(', ')}.`, { at: 'as', allowed: SETTLE_AS });
      const id = typeof a.id === 'string' ? a.id.trim() : '';
      const whole = id === '' ? null : kernel.visualOf(id);
      if (whole === null || sightOf(ctx, whole.target) === null) return no('REF_UNKNOWN', 'There is no visual by that id you can see.', { at: 'id' });
      const version = a.version;
      if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1 || version > whole.versions.length)
        return no('OUT_OF_BOUNDS', `This visual has versions 1 to ${whole.versions.length}.`, { at: 'version' });
      const at = onOf(ctx, whole.target);
      if (at === null) return no('REF_UNKNOWN', 'There is no visual by that id you can see.', { at: 'id' });
      const held = mayDraw(ctx, at);
      if (held) return { ok: false, refusal: held };
      const one = whole.versions[version - 1]!;
      const waits = whole.draft?.n === version;
      const title = clip(one.title, 80);
      if (a.as !== 'again' && !waits)
        return no('TRANSITION_ILLEGAL', `Version ${version} of "${title}" is not a draft waiting now, so there is nothing to ${a.as === 'keep' ? 'keep' : 'throw away'}.`, { at: 'version' });

      /* TRY AGAIN ASKS WHO DREW IT: the run itself while it is open, else the next run of its kind. */
      let told: string | undefined;
      if (a.as === 'again') {
        const row = /^S[1-9][0-9]*$/u.test(one.by) ? kernel.get(one.by) : null;
        const run = row !== null && row.register === 'session' ? row : null;
        if (run === null) return no('TRANSITION_ILLEGAL', `Version ${version} of "${title}" was not drawn by an agent, so there is nobody to ask to draw it again.`, { at: 'version' });
        const open = run.state === 'active' || run.state === 'idle';
        /* ONLY THE OWNER'S PRESS IS AN INSTRUCTION, as only the owner instructs (`instruct`), and only to the run that drew
           it while it is open: an ended run's kind reaches anyone's next run, the owner's own among them. The words name the
           visual by id and never by what its author wrote, which would reach that run in the presser's voice. */
        if (ctx.principal.kind === 'person' && ctx.principal.level === 'owner' && open) {
          const said = `Draw visual ${whole.id} again: version ${version} was not it. Hand the new one in as a draft, with braindog attach --draft --visual ${whole.id}, or log with page and draft: true.`;
          const task = at.list === null ? null : kernel.nameOf(at.id);
          const asked = kernel.instruct(writerOf(ctx), { said, to_run: one.by, ...(task === null ? {} : { task }) });
          if (!asked.ok) return asked as Result<never>;
          told = asked.value.id;
        }
      }
      let batch: string | null = null;
      if (waits) {
        const wrote = kernel.writeVisual({
          target: whole.target,
          id: whole.id,
          said: a.as === 'keep' ? { keep: one.line } : { drop: one.line },
          weight: 0,
          note: a.as === 'keep' ? `Kept the draft of the visual "${title}".` : `Threw away the draft of the visual "${title}".`,
          w: { ...writerOf(ctx), ...(ctx.batch === undefined ? {} : { batch: ctx.batch }) },
        });
        if (!wrote.ok) return wrote as Result<never>;
        batch = wrote.value.batch;
      }
      const kept = kernel.visualOf(whole.id)?.now?.n ?? null;
      const said =
        a.as === 'keep'
          ? `Kept version ${version} of "${title}".`
          : a.as === 'throw'
            ? `Threw away version ${version} of "${title}"${kept === null ? '' : `. It stands at version ${kept}`}.`
            : told !== undefined
              ? `Asked ${one.by} to draw "${title}" again. The new version comes as a draft.`
              : `${one.by} is not at work now, so nobody was asked to draw "${title}" again. Ask its next run in the conversation.`;
      return tail(ok({ visual: whole.id, kept, batch, said, ...(told === undefined ? {} : { told }) }));
    },
  };
}
