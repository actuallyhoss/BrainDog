/**
 * The agent door's own signs, the record's half: `heard`, DATA, and `doorSigns`, READ+ (AGT-B01, DIRECTION §40 "the
 * agent door lists its tools and its briefing is true").
 *
 * WHAT A MARK IS AND WHAT THE MARKS ADD UP TO IS THE KERNEL'S (`kernel/src/door.ts`): one row a run a kind, a count that
 * adds, a time that keeps the slowest. These two are the doors to it and nothing else.
 *
 * `heard` TAKES FIVE KEYS AND REFUSES ANY OTHER in the usual sentence, so a surface that sends a field by a wrong name is
 * told, not counted wrong. It never opens a run: the kernel writes against the caller's run, or against its token when
 * there is none, because a mark that opened a run would make the session it counts. Anybody who may leave anything on
 * the record may leave a mark about their own connection, a reader and an appender alike, since a session that only
 * reads still said hello and was given the tools.
 *
 * `doorSigns` IS THE WHOLE RECORD'S, as `signs` is: it counts every session of every key, so a member held to one list
 * is refused in one sentence.
 */

import type { Kernel, DoorMark } from '@braindog/kernel';
import { DOOR_KINDS, type WriteContext } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Heard = ReturnType<Kernel['heard']>;
type DoorSigns = ReturnType<Kernel['doorMarks']>;

/** What `heard` takes, in the order its refusal names them. */
export const HEARD_TAKES = ['kind', 'n', 'ms', 'build', 'client'] as const;

/** What `doorSigns` takes: how many days back, 1 to 30, seven when it names none. */
export const DOOR_SIGNS_TAKES = ['days'] as const;

/** The longest build or client name a mark takes, the kernel's own bound (`DOOR_TEXT_MOST`). */
const TEXT_MOST = 80;

/** How far back the signs read at most: the sweep keeps 30 days of marks. */
const DAYS_MOST = 30;

const DAY = 24 * 60 * 60 * 1000;

export function methods(deps: RecordDeps) {
  const { kernel, scoped, no, clock } = deps;

  /** Whether the caller reads the record as a whole, as `whole` in `signs.ts` asks it: a level that reads, every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /** A mark's five keys checked, each in the sentence a refusal is written in, or the mark the kernel keeps. */
  const markOf = (args: unknown): { mark: DoorMark } | { refused: Heard } => {
    if (args === null || typeof args !== 'object' || Array.isArray(args))
      return { refused: no('VALUE_MALFORMED', 'heard takes one mark, such as { "kind": "called", "n": 3 }.', { at: 'args' }) as Heard };
    const a = args as Record<string, unknown>;
    const stray = Object.keys(a).find((k) => !(HEARD_TAKES as readonly string[]).includes(k));
    if (stray !== undefined)
      return { refused: no('FIELD_UNKNOWN', `${stray} is not something heard takes. It takes ${HEARD_TAKES.join(', ')}.`, { at: stray, allowed: [...HEARD_TAKES] }) as Heard };
    if (typeof a.kind !== 'string' || !(DOOR_KINDS as readonly string[]).includes(a.kind))
      return { refused: no('ENUM_VALUE_UNKNOWN', `kind is one of ${DOOR_KINDS.join(', ')}.`, { at: 'kind', allowed: [...DOOR_KINDS] }) as Heard };
    const mark: DoorMark = { kind: a.kind as DoorMark['kind'] };
    for (const key of ['n', 'ms'] as const) {
      const v = a[key];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
        return { refused: no('VALUE_MALFORMED', `${key} is a whole number, 0 or more${key === 'ms' ? ', in milliseconds' : ''}.`, { at: key }) as Heard };
      mark[key] = v;
    }
    for (const key of ['build', 'client'] as const) {
      const v = a[key];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'string' || v.trim() === '')
        return { refused: no('VALUE_MALFORMED', `${key} is a line of text, such as ${key === 'build' ? '0.9.2' : 'claude-code 2.1.4'}.`, { at: key }) as Heard };
      if (v.trim().length > TEXT_MOST)
        return { refused: no('OUT_OF_BOUNDS', `${key} is at most ${String(TEXT_MOST)} characters, and this one is ${String(v.trim().length)}.`, { at: key }) as Heard };
      mark[key] = v.trim();
    }
    return { mark };
  };

  return {
    /**
     * One mark of how this session met the agent door: it said hello, was given the tools, made calls, waited on its
     * start hook. DATA. Kept against the caller's run, or its token when it has none; it opens no run and changes no row.
     */
    async heard(args: unknown, ctx: CallContext): Promise<Heard> {
      const stop = scoped(ctx, 'read') && scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop } as Heard;
      const p = ctx.principal;
      if (p.kind !== 'token' && p.kind !== 'person')
        return no('FORBIDDEN', 'heard is how an agent or a person says how they met the door, and this caller is neither.', { at: 'principal' }) as Heard;
      const checked = markOf(args);
      if ('refused' in checked) return checked.refused;
      const w: WriteContext =
        p.kind === 'token'
          ? { actor: `agent:${ctx.session?.agent ?? 'other'}`, principal: { kind: 'token', token: p.id }, session: ctx.session ?? {} }
          : { actor: p.id, principal: { kind: 'person' } };
      return kernel.heard(w, checked.mark);
    },

    /**
     * What the door's marks of the last `days` add up to (seven when it names none): sessions that said hello, were given
     * the tools and made a call, the builds they ran, INTERNAL answers, the start hook's times and the longest card,
     * with the one line a person reads. READ+, a reader of the whole record. It changes nothing.
     */
    async doorSigns(args: unknown, ctx: CallContext): Promise<DoorSigns> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop } as DoorSigns;
      if (!whole(ctx)) return no('FORBIDDEN', 'The door’s signs count every session on the record, and this caller is held to part of it.', { at: 'principal' }) as DoorSigns;
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = typeof a === 'object' && !Array.isArray(a) ? Object.keys(a).find((k) => !(DOOR_SIGNS_TAKES as readonly string[]).includes(k)) : 'args';
      if (stray !== undefined)
        return no('FIELD_UNKNOWN', `${stray} is not something doorSigns takes. It takes days, how many days back.`, { at: stray, allowed: [...DOOR_SIGNS_TAKES] }) as DoorSigns;
      if (a.days === undefined || a.days === null) return kernel.doorMarks();
      const days = typeof a.days === 'string' && /^\d+$/.test(a.days.trim()) ? Number(a.days) : a.days;
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > DAYS_MOST)
        return no('OUT_OF_BOUNDS', `days is a whole number from 1 to ${String(DAYS_MOST)}, since marks are kept ${String(DAYS_MOST)} days.`, { at: 'days' }) as DoorSigns;
      return kernel.doorMarks(clock.now() - days * DAY);
    },
  };
}
