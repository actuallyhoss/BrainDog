/**
 * The record's automation methods beside `automations`: check a body, try it over a sample, switch one on or off, start
 * a finished run again, and read one rule's versions. The editor is built on all five, and an agent reaches
 * `tryAutomation` through `propose`'s `try` (`automation_try`).
 *
 * THE KERNEL DOES THE WORK AND THIS FILE ASKS WHO MAY. Checking is the install's own lint (`kernel.lint`), trying is the
 * real runner inside the kernel's `rehearse` (`kernel.tryAutomation`, `flow-try.ts`), switching is an install of the
 * next version, and starting again is `flow.ts`'s `retryRun`. What is decided here is only whether this caller may see
 * what the body touches, and that is asked the way `automations` asks it in `index.ts`.
 *
 * WHO MAY SEE A BODY IS EVERY LIST IT TOUCHES, BY THE KERNEL'S ONE WALK (`touches`), as `automations` holds an installed
 * rule. A lint refusal names a list's fields, and a try reads rows and figures and says what a `set_var` kept, so a body
 * reaching a list the caller cannot read is refused before either runs, in `readable`'s own sentence. A rule with no row
 * may reach any list, so it is tried and checked only by somebody who reads every one. The two record-wide questions
 * are asked as `index.ts` asks them (`wholeRecord`, `readsEveryList`), for `agents.ts`'s reason: this file is handed the
 * guards, and those two are built from them and the caller's own context.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { ACROSS as READS_ACROSS, ANY_LIST, touches, type Kernel, type Tried } from '@braindog/kernel';

import { BODY_DEPTH, deeperThan, pathOf, subjectOf } from '../automations.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';
import { readSight } from '../sight.ts';

type Body = Record<string, unknown>;

/** A body as the kernel's runner takes it. */
type FlowBody = Parameters<Kernel['tryAutomation']>[0];

/** What a try is started from, as `flow-try.ts` reads it. */
type Sample = Parameters<Kernel['tryAutomation']>[1];

/** What `checkAutomation` answers for a body that would install: its id, and whether it runs inside the write or as a run. */
export type Checked = { id: string; path: 'inline' | 'run' };

/** One version of a rule, newest first, as `automationVersions` answers it. */
export type AutomationVersion = {
  version: number;
  /** When it was installed. */
  at: string;
  /** Whether this is the version live now. */
  live: boolean;
  enabled: boolean;
  /** The pack that installed it, or `null` for one set in the app or accepted from a proposal. */
  pack: string | null;
  /** Who installed it, as the `declare` line signed it, or `null` for setup, which signs none. */
  by: string | null;
  body: Body;
};

/** What `setAutomation` answers: the rule, the version now live, and whether it runs. */
export type Switched = { rule: string; version: number; enabled: boolean; changed: boolean };

/**
 * The most versions one answer holds, newest first. A rule edited in the app gains a version at every save, and the
 * editor reads the recent ones to put one back; each carries its whole body.
 */
export const VERSIONS_SHOWN = 50;

/** The keys a try's sample takes. */
const SAMPLE_TAKES = ['row', 'arrival', 'payload', 'at'] as const;

const isObject = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, scoped, readable, admin, no, tail } = deps;
  const sight = readSight(kernel);

  /** Who a write is signed by: the person, or the person a token was minted for (`actorOf` in `index.ts`). */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  /** Whether the caller reads the record as a whole rather than the lists they were invited to (`wholeRecord` in `index.ts`). */
  const wholeRecord = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind === 'runner' || p.kind === 'share') return false;
    /* AND A LEVEL THAT READS, as `wholeRecord` now asks: `append` reads nothing of the record (`20 §1`). */
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /** Whether the caller reads every personal list, which only the owner himself does (`personalStop` in `index.ts`). */
  const readsPersonal = (ctx: CallContext): boolean => kernel.personalLists().every((list) => readable(ctx, list) === null);

  /** Whether the caller reads every list, and all of each, which a body that may touch any list needs (`readsEveryList` in `index.ts`). */
  const readsEveryList = (ctx: CallContext): boolean =>
    wholeRecord(ctx) && Object.keys(ctx.wheres ?? {}).length === 0 && Object.keys(ctx.levels ?? {}).every((list) => readable(ctx, list) === null) && readsPersonal(ctx);

  /** The live copy of a declaration, parsed, or `undefined`. */
  const liveBody = (id: string): unknown => {
    const found = sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', id)?.body;
    return found === undefined ? undefined : JSON.parse(found);
  };

  /** The field ids a list's live body declares, for a figure or a template the walk places by its fields. */
  const fieldsOf = (list: string): ReadonlySet<string> => {
    const declared = (liveBody(`register.${list}`) as { fields?: unknown } | undefined)?.fields;
    return new Set(Array.isArray(declared) ? declared.map((f) => (f as { id?: unknown } | null)?.id).filter((f): f is string => typeof f === 'string') : []);
  };

  /** Every name the kernel's walk gives a rule body, `ANY_LIST` among them for a figure it cannot place (`liveTouches`). */
  const touched = (id: string, body: unknown): Set<string> => {
    const { lists, unknown } = touches(id, body, { figure: (f) => [liveBody(`metric.${f}`)], door: (d) => liveBody(`ingest.${d}`), fields: fieldsOf });
    return unknown.size > 0 ? new Set([...lists, ANY_LIST]) : lists;
  };

  /**
   * Why this caller may not see a body, or `null` when they may: the first list it touches that they cannot read, in
   * `readable`'s own sentence, or the whole record where it may touch any list.
   */
  const unseen = (ctx: CallContext, id: string, body: unknown, at: string): Refusal | null => {
    for (const name of touched(id, body)) {
      if (name === READS_ACROSS || name === ANY_LIST) {
        if (name === READS_ACROSS ? wholeRecord(ctx) : readsEveryList(ctx)) continue;
        return {
          code: 'LEVEL_REQUIRED',
          fix: `${id} may reach any of your lists, since nothing ties it to one row, so it is shown to somebody who reads every list.`,
          at,
        };
      }
      const out = readable(ctx, name);
      if (out) return { ...out, at };
    }
    return null;
  };

  /** A key this call does not take, in the sentence `index.ts`'s `stray` uses. */
  const stray = (args: Body, takes: readonly string[]): Refusal | null => {
    const key = Object.keys(args).find((k) => !takes.includes(k));
    return key === undefined ? null : { code: 'FIELD_UNKNOWN', fix: `${key} is not something this call takes. It takes ${takes.join(', ')}.`, at: key, allowed: [...takes] };
  };

  /** A rule body as it would be installed, with its id, or the refusal for one that is not. */
  const bodyOf = (given: unknown): Result<{ id: string; body: Body }> => {
    if (given === undefined) return no('REQUIRED_MISSING', 'body is the automation as it would be installed: its rule, what starts it and its steps.', { at: 'body' });
    if (!isObject(given)) return no('VALUE_MALFORMED', 'body is one automation as it would be installed, such as {"rule":"chase","on":{"manual":true},"steps":[...]}.', { at: 'body' });
    /* BEFORE ANYTHING WALKS IT, as `dryRun` refuses one: the walks below recurse. */
    if (deeperThan(given)) return no('OUT_OF_BOUNDS', `This body nests more than ${BODY_DEPTH} levels deep, and no rule needs half that. Send the rule as it would be installed.`, { at: 'body' });
    if (typeof given.rule !== 'string' || given.rule === '') return no('REQUIRED_MISSING', 'body.rule is the automation\'s name, as its id says it: rule.<name>.', { at: 'body.rule' });
    return ok({ id: `rule.${given.rule}`, body: given });
  };

  /** The body as the install's own lint reads it, laid over the record as it stands, and set as it would be from the app. */
  const linted = (id: string, body: Body): Refusal | null => kernel.lint([{ id, kind: 'rule', body: body as never }]);

  return {
    /**
     * Whether an automation body would install, without installing it: `{ id, path }`, or the install's own refusal
     * with its `at` path inside the body. READ+.
     *
     * THE INSTALL'S LINT AND NOT A COPY OF IT: `kernel.lint` runs every check an install runs before it writes, the
     * host's own (whether it answers Slash) among them, so what this passes an install passes, and the editor never
     * draws a second opinion.
     */
    async checkAutomation(args: { body?: unknown } | undefined, ctx: CallContext): Promise<Result<Checked>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const extra = stray((args ?? {}) as Body, ['body']);
      if (extra) return { ok: false, refusal: extra };
      const got = bodyOf(args?.body);
      if (!got.ok) return got;
      const { id, body } = got.value;
      const hidden = unseen(ctx, id, body, 'body');
      if (hidden) return { ok: false, refusal: hidden };
      const fault = linted(id, body);
      if (fault) return { ok: false, refusal: fault };
      return ok({ id, path: pathOf(body) });
    },

    /**
     * An automation body's steps taken now over a sample, with nothing kept: `{ trigger, steps }`, each step `done`,
     * `would`, `waiting`, `failed` or `skipped` with its sentence (`kernel/src/flow-try.ts`). READ+, routed as a write
     * for `previewPage`'s reason: a body is no query string.
     *
     * LINTED FIRST, AS AN INSTALL WOULD, so a body the record would refuse is told why rather than tried. Then the real
     * runner inside the kernel's `rehearse`: every row, event, outbox job and schedule row the try made is rolled back,
     * so a call, a script, a question and a notice are said as what a live run would do and never leave the record.
     *
     * THE SAMPLE IS HELD TO THE CALLER TOO. A row named by id is read only from a list they read, and answered as missing
     * otherwise, as `get` answers it. A row given as fields is written for the try, rolled back with it, so it needs the
     * rung a create needs on the rule's list. An arrival named by id is one the inbox holds, which an owner in the app
     * reads (`inbox`), so anybody else gives what arrived as `sample.payload`.
     */
    async tryAutomation(args: { body?: unknown; sample?: unknown; step?: unknown; given?: unknown } | undefined, ctx: CallContext): Promise<Result<Tried>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const extra = stray((args ?? {}) as Body, ['body', 'sample', 'step', 'given']);
      if (extra) return { ok: false, refusal: extra };
      /* ONE STEP TRIED (`flow-try.ts`): `step` is the path of the step to stop after, `given` the answers of the steps before it by the name each was kept under. */
      if (args?.step !== undefined && typeof args.step !== 'string')
        return no('VALUE_MALFORMED', 'step names the step to try up to by its path, as steps[2].', { at: 'step' });
      if (args?.given !== undefined && !isObject(args.given))
        return no('VALUE_MALFORMED', 'given is the answers of the steps before it, by the name each was kept under: { "rate": <its answer> }.', { at: 'given' });
      const got = bodyOf(args?.body);
      if (!got.ok) return got;
      const { id, body } = got.value;
      const hidden = unseen(ctx, id, body, 'body');
      if (hidden) return { ok: false, refusal: hidden };
      /* AND EVERY LIST IT TOUCHES READ WHOLE: the try runs as the record, so a step quoting `{{trigger.row.<field>}}` or a
         figure answered a field hidden from this caller, or a total over rows their grant leaves out. */
      for (const name of touched(id, body))
        if (name !== READS_ACROSS && name !== ANY_LIST && (ctx.wheres?.[name] !== undefined || (ctx.hides?.[name]?.length ?? 0) > 0))
          return no('FORBIDDEN', 'You can see only part of a list this touches, so only somebody who sees all of it can try it.', { at: 'body' });

      const given = args?.sample ?? {};
      if (!isObject(given)) return no('VALUE_MALFORMED', 'sample is { row, arrival, payload, at }, each optional.', { at: 'sample', allowed: [...SAMPLE_TAKES] });
      const odd = Object.keys(given).find((k) => !(SAMPLE_TAKES as readonly string[]).includes(k));
      if (odd !== undefined) return no('FIELD_UNKNOWN', `sample.${odd} is not something a try starts from. It takes ${SAMPLE_TAKES.join(', ')}.`, { at: `sample.${odd}`, allowed: [...SAMPLE_TAKES] });
      if (typeof given.row === 'string') {
        const row = kernel.get(given.row);
        if (row === null || readable(ctx, row.register) !== null || !sight.admits(ctx, row)) return no('REF_UNKNOWN', `sample.row is ${given.row}, and there is no such row.`, { at: 'sample.row' });
      } else if (isObject(given.row)) {
        const list = subjectOf(body);
        const writes = list === null ? null : guard(ctx, 'append', list);
        if (writes) return { ok: false, refusal: { ...writes, at: 'sample.row' } };
      }
      if (given.arrival !== undefined && !(ctx.principal.kind === 'person' && guard(ctx, 'owner') === null))
        return no('FORBIDDEN', 'sample.arrival names an arrival in the inbox, which only an owner in the app reads. Give what arrived as sample.payload instead.', { at: 'sample.arrival' });

      const fault = linted(id, body);
      if (fault) return { ok: false, refusal: fault };
      return kernel.tryAutomation(body as unknown as FlowBody, given as Sample, actorOf(ctx), args?.step === undefined ? undefined : { upTo: args.step as string, given: args.given as Record<string, unknown> | undefined });
    },

    /**
     * Switch one automation on or off: a new version of the rule with `enabled` set, landed at once, answered with the
     * version now live. ADMIN, an owner in a browser, as `automationRun` is.
     *
     * AN INSTALL AND NOT A FLAG ON THE SIDE. `enabled` is the rule's own key, which the lint, the inline pass and the
     * runner all read (`flow.ts`'s `startRun`, `rules.ts`'s `runRules`), and a version that says `enabled: false` stops
     * the runs already going in the transaction that installs it (`kernel.install`). On is the key left out, as a rule
     * nobody switched is written. The version read is the one the install is held to, so a switch pressed over an edit
     * that landed since answers the conflict rather than putting the older body back. A pack's rule stays the pack's.
     */
    async setAutomation(args: { rule?: unknown; enabled?: unknown } | undefined, ctx: CallContext): Promise<Result<Switched>> {
      const stop = admin(ctx, 'switch an automation on or off');
      if (stop) return { ok: false, refusal: stop };
      const extra = stray((args ?? {}) as Body, ['rule', 'enabled']);
      if (extra) return { ok: false, refusal: extra };
      const named = args?.rule;
      if (typeof named !== 'string' || named === '') return no('REQUIRED_MISSING', 'Which automation? Name it by its id, such as chase.', { at: 'rule' });
      if (typeof args?.enabled !== 'boolean') return no('VALUE_MALFORMED', 'enabled is true to switch it on, or false to switch it off.', { at: 'enabled' });
      const enabled = args.enabled;
      const id = named.startsWith('rule.') ? named : `rule.${named}`;
      const live = sql.one<{ version: number; body: string; pack_id: string | null }>(
        "SELECT version, body, pack_id FROM declaration WHERE id = ? AND kind = 'rule' AND superseded_at IS NULL AND retired = 0",
        id,
      );
      if (!live) return no('DECLARATION_UNKNOWN', `There is no automation called ${id}.`, { at: 'rule' });
      const body = JSON.parse(live.body) as Body;
      if ((body.enabled !== false) === enabled) return ok({ rule: id, version: live.version, enabled, changed: false });
      const { enabled: _was, ...rest } = body;
      const next = enabled ? rest : { ...rest, enabled: false };
      const put = await kernel.install(
        [{ id, kind: 'rule', body: next as never, ...(live.pack_id === null ? {} : { pack: live.pack_id }) }],
        { id, version: live.version },
        { actor: actorOf(ctx) },
      );
      if (!put.ok) return put;
      const landed = put.value.find((d) => d.id === id);
      return tail(ok({ rule: id, version: landed?.version ?? live.version, enabled, changed: true }));
    },

    /**
     * Start a finished run again: a new run of the rule as it is installed now, with the trigger the first one had
     * (`flow.ts`'s `retryRun`). ADMIN, for `automationRun`'s reason: a run writes rows as the rule and may call out.
     */
    async retryRun(args: { run?: unknown } | undefined, ctx: CallContext) {
      const stop = admin(ctx, 'start a run again');
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Body, ['run']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.run !== 'string' || args.run === '') return no('REQUIRED_MISSING', 'Which run? Its id is on the automation, under runs.', { at: 'run' });
      return tail(kernel.retryRun(args.run, actorOf(ctx)));
    },

    /**
     * One rule's versions, newest first, each with its body, when it was installed, by whom and whether it ran READ+,
     * and held as `automations` holds a rule: a caller who cannot see the newest version is told there is no such
     * automation, and a version that touched a list they cannot read is left out.
     */
    async automationVersions(args: { rule?: unknown } | undefined, ctx: CallContext): Promise<Result<{ rule: string; versions: AutomationVersion[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const extra = stray((args ?? {}) as Body, ['rule']);
      if (extra) return { ok: false, refusal: extra };
      const named = args?.rule;
      if (typeof named !== 'string' || named === '') return no('VALUE_MALFORMED', 'An automation is named by its id, such as chase or rule.chase.', { at: 'rule' });
      const id = named.startsWith('rule.') ? named : `rule.${named}`;
      const rows = sql.all<{ version: number; body: string; pack_id: string | null; created_at: string; superseded_at: string | null; retired: number }>(
        "SELECT version, body, pack_id, created_at, superseded_at, retired FROM declaration WHERE id = ? AND kind = 'rule' ORDER BY version DESC LIMIT ?",
        id,
        VERSIONS_SHOWN,
      );
      const newest = rows[0];
      const missing = () => no<{ rule: string; versions: AutomationVersion[] }>('DECLARATION_UNKNOWN', `There is no automation called ${id}${id.endsWith('.') ? '' : '.'}`, { at: 'rule' });
      if (newest === undefined || unseen(ctx, id, JSON.parse(newest.body), 'rule') !== null) return missing();
      const versions: AutomationVersion[] = [];
      for (const r of rows) {
        const body = JSON.parse(r.body) as Body;
        if (unseen(ctx, id, body, 'rule') !== null) continue;
        const by = sql.one<{ actor: string }>(
          "SELECT actor FROM event WHERE kind = 'declare' AND target = ? AND to_v = ? ORDER BY rowid DESC LIMIT 1",
          `declaration:${id}`,
          String(r.version),
        );
        versions.push({
          version: r.version,
          at: r.created_at,
          live: r.superseded_at === null && r.retired === 0,
          enabled: body.enabled !== false,
          pack: r.pack_id,
          by: by?.actor ?? null,
          body,
        });
      }
      return ok({ rule: id, versions });
    },
  };
}
