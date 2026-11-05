/**
 * Attachments: `attachFile`, `attachments`, `attachment`, `renameAttachment`, `removeAttachment` and `restoreAttachment`, a
 * file put on a task, a project, any row, a question or a decision for context (`kernel/src/attachment.ts`).
 *
 * WHO SEES ONE IS WHO SEES THE THING. The lines are on the thing's log target, so `sightOf` answers for them as it does
 * for its notes; the bytes are answered by the file door only to a caller who sees a thing they are attached to
 * (`fileHeld`). WHO ADDS ONE is who may add a note there (`append` on its list, the agent note floor for a token). WHO
 * TAKES ONE OFF OR RENAMES IT is who put it, or anybody who may write the list; an agent changes only what an agent put,
 * never a person's file.
 *
 * WHAT A FILE IS IS READ HERE, FROM ITS BYTES AND ITS NAME (`attachedType`), and never taken from the call: the door kept
 * the bytes, and the store is asked for them again. Its words are read once, now, and kept as a page beside it, so an
 * agent reading it later asks for text and never for bytes. A file whose words hold a key is refused: keys go in Keys.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import {
  ATTACHED_MOST,
  attachedName,
  attachedText,
  attachedType,
  holdsKnownKey,
  roomSaid,
  type AttachedBody,
  type AttachedHeld,
  type AttachedKind,
  type AttachedVersion,
  type WriteContext,
} from '@braindog/kernel';

import { ladder } from '../ladder.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What `attach` takes: the thing, the file's name, and either the hash the file door answered or the text itself. */
export type AttachFileArgs = { on: string; name: string; sha256?: string; text?: string; id?: string };

/** One attachment as `attachments` lists it, and as `get` names it to an agent. */
export type AttachmentListed = {
  id: string;
  name: string;
  kind: AttachedKind;
  mime: string;
  bytes: number;
  sha256: string;
  version: number;
  versions: number;
  by: string;
  at: string;
  /** How many characters of words it holds for an agent to read, or 0 for none. */
  chars: number;
};

/** What `attach` answers. `batch` is what Undo takes back; `unchanged` when the same file was already this version. */
export type Attached = { id: string; name: string; kind: AttachedKind; version: number; on: string; batch: string | null; said: string; unchanged?: true };

/** One attachment read: the version asked or the one it stands at, its words (a slice), and every version. */
export type AttachmentRead = AttachmentListed & {
  on: string;
  gone: boolean;
  text: string | null;
  from: number;
  more: number | null;
  history: { version: number; name: string; bytes: number; by: string; at: string; line: string }[];
};

/** The most characters of a file's words one read answers, and where the next read starts. */
export const ATTACHMENT_READ_MOST = 12_000;

/** The most characters an agent may hand in as a file's text in one call. */
export const ATTACH_TEXT_MOST = 2 * 1024 * 1024;

const TEXT = new TextDecoder();
const BYTES = new TextEncoder();
const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const words = (s: string): string => s.toLowerCase().replace(/\s+/gu, ' ').trim();
const SHA = /^[0-9a-f]{64}$/u;

/** The sentence for a thing that is not there and for one the caller may not see, which must be the same sentence. */
const NOTHING = 'There is nothing by that name you can see. Name a task, a project or a row as it is spoken, or by its name.';
const NO_FILE = 'There is no attachment by that id you can see.';

type On = { target: string; list: string | null; id: string; words: string };

const listedOf = (h: { id: string; name: string; now: AttachedVersion; versions: number; made_by: string }): AttachmentListed => ({
  id: h.id,
  name: h.name,
  kind: h.now.kind,
  mime: h.now.mime,
  bytes: h.now.bytes,
  sha256: h.now.sha256,
  version: h.now.n,
  versions: h.versions,
  by: h.now.by,
  at: h.now.at,
  chars: h.now.text?.chars ?? 0,
});

export function methods(deps: RecordDeps) {
  const { kernel, guard, scoped, sightOf, spokenAs, sight, no, tail, clock, sql } = deps;
  const trust = ladder({ sql, kernel, now: () => clock.now() });

  const writerOf = (ctx: CallContext): WriteContext =>
    deps.writer?.(ctx) ?? { actor: ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.kind === 'person' ? ctx.principal.id : 'system' };

  /** A thing in words: its title and its list. Never its id, and nothing this caller may not see. */
  const wordsOf = (ctx: CallContext, target: string): string => {
    if (sightOf(ctx, target) === null) return 'it';
    if (target.startsWith('entry:')) {
      const row = kernel.get(target.slice('entry:'.length));
      const title = row === null ? null : kernel.titleOfRow(row.id);
      const list = row === null ? null : (kernel.registers().get(row.register)?.name ?? null);
      return `${title ? `"${clip(title, 60)}"` : 'it'}${list ? ` in ${list}` : ''}`;
    }
    return target.startsWith('suggestion:') ? `the question ${target.slice('suggestion:'.length)}` : `the decision ${target.slice('decision:'.length)}`;
  };

  /** What `on` names for this caller: a row by its spoken id or name, a question as SG9, a decision as D3. */
  const thingOf = (ctx: CallContext, on: unknown): On | Refusal => {
    if (typeof on !== 'string' || on.trim() === '') return { code: 'REQUIRED_MISSING', fix: 'Say what it goes on: a task, a project or a row, as it is spoken or by its name.', at: 'on' };
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

  /** The thing an attachment is on, for this caller, or `null` when they may not see it. */
  const onOf = (ctx: CallContext, target: string): On | null => {
    if (sightOf(ctx, target) === null) return null;
    if (target.startsWith('entry:')) {
      const row = kernel.get(target.slice('entry:'.length));
      return row === null ? null : { target, list: row.register, id: row.id, words: wordsOf(ctx, target) };
    }
    return { target, list: null, id: target.slice(target.indexOf(':') + 1), words: wordsOf(ctx, target) };
  };

  /** Why this caller may not put a file on this thing, or `null`: what a note asks of a row, what `propose` asks of a question. */
  const mayAdd = (ctx: CallContext, at: On): Refusal | null => {
    if (at.list === null) return guard(ctx, 'propose');
    const held = guard(ctx, 'append', at.list);
    if (held) return held;
    if (!sight.mayWrite(ctx, at.list, at.id)) return { code: 'REF_UNKNOWN', fix: NOTHING, at: 'on' };
    if (ctx.principal.kind !== 'token') return null;
    const grant = trust.grantOf(ctx.principal.id);
    if (grant === null) return null;
    /* AN AGENT'S NOTE FLOOR (`noteFault`): a thing another person made, or a list of keys, gets no file from an agent. */
    const fault = trust.noteFault({ token: ctx.principal.id, scope: grant.scope, person: grant.person, run: null, app: null }, at.list, at.id);
    if (fault === null) return null;
    const floor = fault.split(', so ')[0] ?? fault;
    return { code: 'FORBIDDEN', fix: `${floor}, so an agent does not attach a file to it. Ask in a question with propose instead.`, at: 'on' };
  };

  /**
   * Why this caller may not rename or take off this attachment, or `null`. Who may add may change their own; changing
   * somebody else's takes `write` on the list. An agent changes only what an agent put: a person's file is never an
   * agent's to take off.
   */
  const mayChange = (ctx: CallContext, at: On, madeBy: string): Refusal | null => {
    const add = mayAdd(ctx, at);
    if (add) return add;
    const person = /^p_/u.test(madeBy);
    if (ctx.principal.kind === 'token')
      return person ? { code: 'FORBIDDEN', fix: 'A person attached this file, so an agent leaves it as it is. Say what should change in a note instead.', at: 'id' } : null;
    if (ctx.principal.kind === 'person' && ctx.principal.id === madeBy) return null;
    if (at.list === null) return guard(ctx, 'write');
    return guard(ctx, 'write', at.list);
  };

  const store = () => deps.visuals;

  /** Reads one attachment the caller may see, or the refusal in the one sentence that does not say whether it exists. */
  const seen = (ctx: CallContext, id: unknown) => {
    const key = typeof id === 'string' ? id.trim() : '';
    const whole = key === '' ? null : kernel.attachmentOf(key);
    const at = whole === null ? null : onOf(ctx, whole.target);
    return whole === null || at === null ? null : { whole, at };
  };

  return {
    /**
     * Put a file on a thing, or give one it carries a new version. DATA. The same name on the same thing again is its
     * next version, so a file re-sent is one attachment with a history; the same bytes again write nothing.
     */
    async attachFile(args: AttachFileArgs, ctx: CallContext): Promise<Result<Attached>> {
      const stop = scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Partial<Record<keyof AttachFileArgs, unknown>>;
      const at = thingOf(ctx, a.on);
      if ('code' in at) return { ok: false, refusal: at };
      const held = mayAdd(ctx, at);
      if (held) return { ok: false, refusal: held };
      const name = attachedName(a.name);
      if (name === null) return no('REQUIRED_MISSING', 'Give the file its name, with its ending, such as brief.pdf or mockup.html.', { at: 'name' });
      const files = store();
      if (files === undefined || files.getFile === undefined)
        return no('NOT_IN_THIS_BUILD', 'This BrainDog keeps no files: it has no file store. Say what the file holds in a note instead.', { at: 'file' });

      /* THE BYTES: handed in as text by an agent, or kept by the file door first and named here by their hash. */
      let bytes: Uint8Array;
      let sha256: string;
      if (a.text !== undefined) {
        if (typeof a.text !== 'string' || a.text.trim() === '') return no('VALUE_MALFORMED', 'text is what the file holds, such as the HTML of an artifact or a markdown write-up.', { at: 'text' });
        if (a.text.length > ATTACH_TEXT_MOST) return no('OUT_OF_BOUNDS', 'A file handed in as text is at most 2 MB. Attach a larger one with braindog attach.', { at: 'text' });
        if (files.putFile === undefined) return no('NOT_IN_THIS_BUILD', 'This BrainDog takes files through its file door only. Attach it with braindog attach.', { at: 'text' });
        bytes = BYTES.encode(a.text);
        sha256 = hex(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)));
      } else {
        if (typeof a.sha256 !== 'string' || !SHA.test(a.sha256))
          return no('REQUIRED_MISSING', 'Name the file by the sha256 the file door answered (PUT /api/files?name=...), or hand its words in as text.', { at: 'sha256' });
        sha256 = a.sha256;
        /* ATTACHING A FILE IS NOT HOW TO READ ONE. What is attached is there for whoever sees the thing, so a hash somebody was
           kept from became bytes on a thing of their own. Told as a file nobody kept, so the answer does not say it exists. */
        const got = deps.fileHeld(sha256, ctx) ? null : await files.getFile(sha256);
        if (got === null) return no('REF_UNKNOWN', `There is no file kept here under that hash. Put it with PUT /api/files?name=${encodeURIComponent(name)} first.`, { at: 'sha256' });
        bytes = got;
      }
      if (bytes.byteLength === 0) return no('VALUE_MALFORMED', 'This file is empty.', { at: 'file' });
      if (bytes.byteLength > ATTACHED_MOST) return no('OUT_OF_BOUNDS', `A file here is at most ${ATTACHED_MOST / 1024 / 1024} MB.`, { at: 'file' });
      const type = attachedType(bytes, name);

      /* ITS WORDS, read now and kept as a page, so an agent reads text later. A key in them is refused, as in a row. */
      const words$ = await attachedText(bytes, type.mime);
      if (words$ !== null && holdsKnownKey(words$))
        return no('VALUE_MALFORMED', 'This file holds what looks like a key, and a key never goes in a file here. Put it in Keys (braindog keys put), and attach the file without it.', { at: 'file' });

      /* WHICH ATTACHMENT: the one named, or the one this thing carries under this name, or a new one. */
      const on = kernel.attachmentsOn(at.target);
      let id: string | undefined;
      if (a.id !== undefined) {
        if (typeof a.id !== 'string' || kernel.attachmentOn(a.id) !== at.target) return no('REF_UNKNOWN', 'There is no such attachment on this to give a new version.', { at: 'id' });
        id = a.id;
      } else id = on.find((h) => words(h.name) === words(name))?.id;
      const whole = id === undefined ? null : kernel.attachmentOf(id);
      if (whole !== null) {
        const change = mayChange(ctx, at, whole.made_by);
        if (change) return { ok: false, refusal: change };
      }
      if (whole?.now && whole.now.sha256 === sha256)
        return ok({ id: whole.id, name: whole.name, kind: whole.now.kind, version: whole.now.n, on: at.words, batch: null, said: `${whole.name} on ${at.words} is already this file.`, unchanged: true });

      /* NEW BYTES WEIGH; bytes already attached somewhere in this record cost nothing again. */
      const known = kernel.attachmentTargetsNaming(sha256).length > 0;
      if (a.text !== undefined && !known) await files.putFile!(sha256, bytes, type.mime);
      let text: AttachedBody['text'];
      let weight = known ? 0 : bytes.byteLength;
      if (words$ !== null) {
        const page = BYTES.encode(words$);
        const pageSha = hex(await crypto.subtle.digest('SHA-256', Uint8Array.from(page)));
        await files.putPage(pageSha, page);
        text = { sha256: pageSha, chars: words$.length };
        if (!known) weight += page.byteLength;
      }
      const body: AttachedBody = { name, sha256, mime: type.mime, kind: type.kind, bytes: bytes.byteLength, ...(text === undefined ? {} : { text }) };
      const fresh = whole === null;
      const wrote = kernel.writeAttachment({
        target: at.target,
        ...(whole === null ? {} : { id: whole.id }),
        said: { body },
        weight,
        note: fresh ? `Attached ${clip(name, 120)}.` : `A new version of ${clip(name, 120)}.`,
        w: { ...writerOf(ctx), ...(ctx.batch === undefined ? {} : { batch: ctx.batch }) },
      });
      if (!wrote.ok) return wrote as Result<never>;
      const n = wrote.value.n ?? 1;
      const said = fresh ? `Attached ${name} to ${at.words}.` : `Version ${n} of ${name} is on ${at.words}.`;
      return tail(ok({ id: wrote.value.id, name, kind: type.kind, version: n, on: at.words, batch: wrote.value.batch, said }));
    },

    /**
     * Every file the caller can see on any thing, every version of each, taken off or not, by its hash: what a pull
     * (`braindog attach --pull <dir>`) downloads beside the record's own export, which holds the lines. READ+.
     */
    async attachmentFiles(_args: unknown, ctx: CallContext): Promise<Result<{ files: { sha256: string; name: string; mime: string; bytes: number; id: string; version: number; on: string; standing: boolean }[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const files: { sha256: string; name: string; mime: string; bytes: number; id: string; version: number; on: string; standing: boolean }[] = [];
      for (const whole of kernel.attachmentsEvery()) {
        const at = onOf(ctx, whole.target);
        if (at === null) continue;
        for (const v of whole.versions) files.push({ sha256: v.sha256, name: v.name, mime: v.mime, bytes: v.bytes, id: whole.id, version: v.n, on: at.words, standing: whole.now?.line === v.line });
      }
      return ok({ files });
    },

    /**
     * After a restore or an import whose files were pushed back (`braindog attach --push <dir>`): every version whose
     * bytes are here and whose words are not has its words read again from its bytes and kept, under the hash its line
     * names when they read the same. DATA. Answers how many were mended, and how many files are still missing.
     */
    async mendAttachments(_args: unknown, ctx: CallContext): Promise<Result<{ mended: number; missing: number; differ: number; said: string }>> {
      const stop = scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const held = guard(ctx, 'write');
      if (held) return { ok: false, refusal: held };
      const files = store();
      if (files === undefined || files.getFile === undefined) return no('NOT_IN_THIS_BUILD', 'This BrainDog keeps no files: it has no file store.', { at: 'file' });
      let mended = 0;
      let missing = 0;
      let differ = 0;
      const seenSha = new Set<string>();
      for (const whole of kernel.attachmentsEvery())
        for (const v of whole.versions) {
          if (seenSha.has(v.sha256)) continue;
          seenSha.add(v.sha256);
          const bytes = await files.getFile(v.sha256);
          if (bytes === null) {
            missing++;
            continue;
          }
          if (v.text === undefined || (await files.getPage(v.text.sha256)) !== null) continue;
          const words$ = await attachedText(bytes, v.mime);
          if (words$ === null) continue;
          const page = BYTES.encode(words$);
          const pageSha = hex(await crypto.subtle.digest('SHA-256', Uint8Array.from(page)));
          /* KEPT ONLY UNDER ITS OWN HASH: words read another way since are not the words the line names. */
          if (pageSha !== v.text.sha256) {
            differ++;
            continue;
          }
          await files.putPage(pageSha, page);
          mended++;
        }
      const said =
        missing === 0
          ? `Every attached file is here.${mended > 0 ? ` The words of ${mended === 1 ? 'one was' : `${mended} were`} read again.` : ''}`
          : `${missing === 1 ? 'One attached file is' : `${missing} attached files are`} not here yet. Push them back with braindog attach --push <folder>.`;
      return ok({ mended, missing, differ, said });
    },

    /**
     * How much room the record's files take of what it keeps for them, for Settings > Usage: bytes used and the most, the
     * plan whose room it is, and one sentence. READ.
     */
    async attachmentRoom(_args: unknown, ctx: CallContext): Promise<Result<{ used: number; most: number; plan: string | null; next: { plan: string; most: number } | null; said: string }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const room = kernel.attachedRoom();
      const share = room.most > 0 ? Math.min(100, Math.round((room.used / room.most) * 100)) : 0;
      const said =
        room.used === 0
          ? `No files attached yet. ${room.plan === null ? 'This BrainDog keeps' : `${room.plan} keeps`} ${roomSaid(room.most)} for them.`
          : `Files take ${roomSaid(room.used)} of ${roomSaid(room.most)} (${share}%).${room.next !== null && share >= 80 ? ` ${room.next.plan} keeps ${roomSaid(room.next.most)}.` : ''}`;
      return ok({ ...room, said });
    },

    /** Every file a thing carries now, oldest first, each by its name, kind, size and who put it. READ+. */
    async attachments(args: { on: string }, ctx: CallContext): Promise<Result<{ on: string; attachments: AttachmentListed[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const at = thingOf(ctx, args?.on);
      if ('code' in at) return { ok: false, refusal: at };
      return ok({ on: at.words, attachments: kernel.attachmentsOn(at.target).map((h: AttachedHeld) => listedOf(h)) });
    },

    /**
     * One attachment: the version asked or the one it stands at, a slice of its words from `from`, and every version.
     * READ+. A file taken off is still read by naming a version, so an Undo can be offered on it.
     */
    async attachment(args: { id: string; version?: number; from?: number }, ctx: CallContext): Promise<Result<AttachmentRead>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const found = seen(ctx, args?.id);
      if (found === null) return no('REF_UNKNOWN', NO_FILE, { at: 'id' });
      const { whole, at } = found;
      const asked = args.version;
      if (asked !== undefined && (typeof asked !== 'number' || !Number.isSafeInteger(asked) || asked < 1 || asked > whole.versions.length))
        return no('OUT_OF_BOUNDS', `This file has versions 1 to ${whole.versions.length}.`, { at: 'version' });
      const one = asked === undefined ? (whole.now ?? whole.versions[whole.versions.length - 1]!) : whole.versions[asked - 1]!;
      const from = typeof args.from === 'number' && Number.isSafeInteger(args.from) && args.from > 0 ? args.from : 0;
      let text: string | null = null;
      let more: number | null = null;
      if (one.text !== undefined) {
        const page = await store()?.getPage(one.text.sha256);
        if (page !== null && page !== undefined) {
          const all = TEXT.decode(page);
          text = all.slice(from, from + ATTACHMENT_READ_MOST);
          more = from + ATTACHMENT_READ_MOST < all.length ? from + ATTACHMENT_READ_MOST : null;
        }
      }
      return ok({
        ...listedOf({ id: whole.id, name: whole.name, now: one, versions: whole.versions.length, made_by: whole.made_by }),
        on: at.words,
        gone: whole.now === null,
        text,
        from,
        more,
        history: whole.versions.map((v) => ({ version: v.n, name: v.name, bytes: v.bytes, by: v.by, at: v.at, line: v.line })),
      });
    },

    /** Give an attachment a new name. DATA. Its versions keep theirs; the next version brings its own. */
    async renameAttachment(args: { id: string; name: string }, ctx: CallContext): Promise<Result<{ id: string; name: string; batch: string; said: string }>> {
      const stop = scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const found = seen(ctx, args?.id);
      if (found === null) return no('REF_UNKNOWN', NO_FILE, { at: 'id' });
      const { whole, at } = found;
      const held = mayChange(ctx, at, whole.made_by);
      if (held) return { ok: false, refusal: held };
      const name = attachedName(args.name);
      if (name === null) return no('REQUIRED_MISSING', 'Give it a name, such as Brief v2.pdf.', { at: 'name' });
      if (name === whole.name) return no('VALUE_MALFORMED', `It is already called ${name}.`, { at: 'name' });
      const wrote = kernel.writeAttachment({ target: whole.target, id: whole.id, said: { rename: name }, weight: 0, note: `Renamed ${clip(whole.name, 120)} to ${clip(name, 120)}.`, w: { ...writerOf(ctx), ...(ctx.batch === undefined ? {} : { batch: ctx.batch }) } });
      if (!wrote.ok) return wrote as Result<never>;
      return tail(ok({ id: whole.id, name, batch: wrote.value.batch, said: `Renamed ${whole.name} to ${name}.` }));
    },

    /** Take an attachment off its thing. DATA. Its bytes stay, so `restoreAttachment` puts it back. */
    async removeAttachment(args: { id: string }, ctx: CallContext): Promise<Result<{ id: string; batch: string; said: string }>> {
      const stop = scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const found = seen(ctx, args?.id);
      if (found === null) return no('REF_UNKNOWN', NO_FILE, { at: 'id' });
      const { whole, at } = found;
      const held = mayChange(ctx, at, whole.made_by);
      if (held) return { ok: false, refusal: held };
      if (whole.now === null) return no('TRANSITION_ILLEGAL', `${whole.name} was already removed.`, { at: 'id' });
      const wrote = kernel.writeAttachment({ target: whole.target, id: whole.id, said: { gone: true }, weight: 0, note: `Removed ${clip(whole.name, 120)}.`, w: { ...writerOf(ctx), ...(ctx.batch === undefined ? {} : { batch: ctx.batch }) } });
      if (!wrote.ok) return wrote as Result<never>;
      return tail(ok({ id: whole.id, batch: wrote.value.batch, said: `Removed ${whole.name} from ${at.words}.` }));
    },

    /** Put an attachment back at a version: the newest when none is named. DATA. Undo for a removal, or a step back. */
    async restoreAttachment(args: { id: string; version?: number }, ctx: CallContext): Promise<Result<{ id: string; version: number; batch: string; said: string }>> {
      const stop = scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const found = seen(ctx, args?.id);
      if (found === null) return no('REF_UNKNOWN', NO_FILE, { at: 'id' });
      const { whole, at } = found;
      const held = mayChange(ctx, at, whole.made_by);
      if (held) return { ok: false, refusal: held };
      const asked = args.version;
      if (asked !== undefined && (typeof asked !== 'number' || !Number.isSafeInteger(asked) || asked < 1 || asked > whole.versions.length))
        return no('OUT_OF_BOUNDS', `This file has versions 1 to ${whole.versions.length}.`, { at: 'version' });
      const one = whole.versions[(asked ?? whole.versions.length) - 1]!;
      if (whole.now?.line === one.line) return no('TRANSITION_ILLEGAL', `${whole.name} is already at version ${one.n}.`, { at: 'version' });
      if (whole.now === null && kernel.attachmentsOn(whole.target).length >= 100) return no('OUT_OF_BOUNDS', 'This carries 100 files, the most one thing takes. Remove one first.', { at: 'id' });
      const wrote = kernel.writeAttachment({ target: whole.target, id: whole.id, said: { back: one.line }, weight: 0, note: whole.now === null ? `Put ${clip(whole.name, 120)} back.` : `Put version ${one.n} of ${clip(whole.name, 120)} back.`, w: { ...writerOf(ctx), ...(ctx.batch === undefined ? {} : { batch: ctx.batch }) } });
      if (!wrote.ok) return wrote as Result<never>;
      return tail(ok({ id: whole.id, version: one.n, batch: wrote.value.batch, said: whole.now === null ? `Put ${whole.name} back on ${at.words}.` : `${whole.name} is at version ${one.n} again.` }));
    },
  };
}
