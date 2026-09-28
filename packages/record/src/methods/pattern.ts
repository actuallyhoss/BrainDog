/**
 * The ingest pattern builder's two reads: `tryPattern`, the dry run, and `anchorsFor`, the ways to find a selection
 * again (`loop/finish/platform.md` §4.0 T, `loop/finish/contracts.md` rows `tryPattern` and `anchorsFor`). The reading
 * itself is `../pattern.ts`; this file is who may ask and what they may send.
 *
 * READ+, AND THE INBOX'S OWN GATE AFTER IT. Both read arrivals, and the inbox holds whatever was sent in, about any
 * list or none, so they are asked what `inbox` asks: an owner, or a token an owner gave the `inbox` reach, over the
 * whole record. A colleague who files a `pattern` proposal from the builder reads her samples through this gate too,
 * so the builder is an owner's screen and a proposal is how anybody else suggests one (from Decide or Slash).
 *
 * BOTH WRITE NOTHING. A try is repeated on every change the person makes, so it must cost a read and nothing more.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import { anchorsIn, bodyOf, notIngest, readerFor, samplesAsked, samplesOf, tryOn, type Anchor, type Tried } from '../pattern.ts';
import type { RecordDeps } from './index.ts';

/** The most characters of a field's name the anchor search takes, which is longer than any field a list declares. */
const FIELD_CHARS_MOST = 64;

export function methods(deps: RecordDeps) {
  const { sql, guard, scoped, readable, no } = deps;

  /**
   * The inbox's gate, after the READ+ guard: an owner, or a token whose owner gave it the `inbox` reach (`inboxReached`
   * in `index.ts`, with `Array.isArray` for its reason), and never a caller held to part of the record.
   */
  const inboxStop = (ctx: CallContext): Refusal | null => {
    const p = ctx.principal;
    const reached = p.kind === 'token' && p.level === 'owner' && Array.isArray(p.reach) && p.reach.includes('inbox');
    if (!reached) {
      const owner = guard(ctx, 'owner');
      if (owner) return { ...owner, code: 'FORBIDDEN' };
    }
    if (ctx.registers !== undefined && ctx.registers !== '*')
      return { code: 'FORBIDDEN', fix: 'The inbox belongs to the whole record, and this caller is held to part of it.', at: 'principal' };
    return null;
  };

  /** The caller's reach into a list, for a `lookup`: what `list` would let her read. */
  const reads = (ctx: CallContext) => (register: string) => readable(ctx, register) === null;

  return {
    /**
     * Try a pattern on 1 to 10 samples, writing nothing: `{ ingest, samples, pasted? }`, where `ingest` is the body or
     * the declaration it installs as, `samples` arrivals by id and `pasted` the text of messages pasted into the builder,
     * read after them. Answers which samples it claims and every field read from each. READ+ with the inbox's gate.
     */
    async tryPattern(args: { ingest?: unknown; samples?: unknown; pasted?: unknown } | undefined, ctx: CallContext): Promise<Result<Tried>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const gate = inboxStop(ctx);
      if (gate) return { ok: false, refusal: gate };
      const a = (args ?? {}) as Record<string, unknown>;
      const body = bodyOf(a.ingest);
      if (!body) return { ok: false, refusal: notIngest() };
      const asked = samplesAsked(a);
      if (!asked.ok) return asked;
      const samples = samplesOf(sql, asked.value.ids, asked.value.pasted);
      if (!samples.ok) return samples;
      return ok(tryOn(readerFor(sql, reads(ctx)), sql, body, samples.value));
    },

    /**
     * The ways to find a selection again: `{ sample, field, start, end, samples, pasted?, type? }`, where `sample` is the
     * arrival the text was selected in (or `paste:<n>`), `start` and `end` the selection in its body as it arrived, and
     * `type` the field's type when the builder knows it. Answers candidates best first, each scored against every
     * sample. No pattern text is taken: every anchor is cut from the sample. READ+ with the inbox's gate.
     */
    async anchorsFor(
      args: { sample?: unknown; field?: unknown; start?: unknown; end?: unknown; samples?: unknown; pasted?: unknown; type?: unknown } | undefined,
      ctx: CallContext,
    ): Promise<Result<Anchor[]>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const gate = inboxStop(ctx);
      if (gate) return { ok: false, refusal: gate };
      const a = (args ?? {}) as Record<string, unknown>;
      if (typeof a.field !== 'string' || a.field === '' || a.field.length > FIELD_CHARS_MOST)
        return no('REQUIRED_MISSING', 'Which field is the selection for? Name it.', { at: 'field' });
      if (typeof a.sample !== 'string' || a.sample === '') return no('REQUIRED_MISSING', 'Which sample was the text selected in?', { at: 'sample' });
      const start = a.start;
      const end = a.end;
      if (!(Number.isSafeInteger(start) && Number.isSafeInteger(end) && (start as number) >= 0 && (end as number) > (start as number)))
        return no('VALUE_MALFORMED', 'A selection is where it starts and where it ends in the sample, the end after the start.', { at: 'start' });
      if (a.type !== undefined && typeof a.type !== 'string') return no('VALUE_MALFORMED', 'A field type is a word, as the list declares it.', { at: 'type' });
      const asked = samplesAsked(a);
      if (!asked.ok) return asked;
      const samples = samplesOf(sql, asked.value.ids, asked.value.pasted);
      if (!samples.ok) return samples;
      const chosen = samples.value.find((s) => s.key === a.sample);
      if (!chosen) return no('REF_UNKNOWN', 'The text was selected in a message that is not one of the samples.', { at: 'sample' });
      if ((end as number) > chosen.body.length) return no('OUT_OF_BOUNDS', 'The selection runs past the end of the message.', { at: 'end' });
      return ok(
        anchorsIn(readerFor(sql, reads(ctx)), samples.value, chosen, {
          start: start as number,
          end: end as number,
          ...(typeof a.type === 'string' ? { type: a.type } : {}),
        }),
      );
    },
  };
}
