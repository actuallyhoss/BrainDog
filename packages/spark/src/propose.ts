/**
 * The palette's second mode: `read`, then `propose`. Two calls, `46 §13` D12.
 *
 * TWO CALLS AND NOT ONE, AND NOT A STREAM. Pass 1 drafts a predicate, projects the rows and hands
 * them back; the client draws them BY CODE, so the answer a person sees first is rows out of their
 * own record rather than a model's account of them. Pass 2 is the only part that needs the model
 * to say anything, and Escape between the two is a free cancellation because there is nothing in
 * flight. `23 §7`'s streaming row is this shape: retrieval progress is pass 1's `read`, not a
 * token stream.
 *
 * PASS 2 DOES NOT DRAFT THE PREDICATE AGAIN. The `call` row holds what pass 1 drafted, and
 * `propose(question, ctx, byok, askId)` re-projects with it. That is `46 §13` D2's "the record is
 * the cache": the ROWS are not cached, because rows move between two passes and a proposal about
 * rows that have moved is worse than a second read, but the predicate is, because drafting it
 * twice is a second model call answering a question already answered.
 *
 * ZERO ROWS MEANS NO SECOND CALL. `23 §6`: if nothing matched, the rows were the answer, and asking
 * a model to talk about an empty list is how a product starts inventing. `propose` on an ask that
 * found nothing returns the `query` body and makes no `Inference` call at all.
 *
 * THE ASKER'S PRINCIPAL PROJECTS AND SPARK'S PRINCIPAL FILES. Every read runs under `ctx`, so the
 * record's own scoping decides what the model may be shown, and the record never has to trust this
 * package about who is asking. The one write runs under `{ kind: 'system', id: 'spark' }`, so the
 * suggestion is attributed to Spark and not to the person who happened to ask a question.
 */

import { no, ok, refused, type Refusal, type Result } from '@braindog/ports';
import { compile, type Schema } from '@braindog/where';

import type { Core } from './call.ts';
import { PROMPTS } from './prompts.ts';
import { citable, cite, firstBytes, isRecord } from './project.ts';
import type {
  CallContext,
  Citable,
  Inference,
  Projection,
  ProjectionRegister,
  ProjectionRow,
  Proposal,
  Reading,
  ReadTrace,
  RecordApi,
  Verb,
  Where,
} from './types.ts';

/**
 * The last line of the fold, on every ask, whatever happened (`46 §4.2`).
 *
 * IT IS A CLAIM THE PERSON CAN CHECK, not a reassurance. "Spark read nothing from the vault" is a
 * sentence in marketing copy; a row in the same list as the registers it DID read, saying zero and
 * refused, is the same sentence somewhere a lie would be visible.
 */
const GRANT: ReadTrace = { register: 'grant', rows: 0, predicate: 'refused' };

/** `12 §5`: the register that holds credentials is not one Spark reads, whoever names it. */
const FORBIDDEN_REGISTERS = new Set(['grant']);

/** An ask is one question, and 400 bytes of it. `11 §6`'s conversation budget, spent in one place. */
const ASK_BYTES = 400;

const VERBS_FOR: Record<string, Verb[]> = {
  query: ['edit', 'save', 'open'],
  options: ['decide', 'defer', 'dismiss'],
  rowset: ['decide', 'defer', 'dismiss'],
  change: ['decide', 'defer', 'dismiss'],
  pattern: ['decide', 'dismiss'],
};

/** Spark's own principal. `30 §3`: every event this package causes carries actor `spark`. */
export const SPARK_CTX: CallContext = { principal: { kind: 'system', id: 'spark' } };

const EMPTY: Projection = { rows: [], index: { registers: [], open_questions: [] }, budget: { used: 0, limit: 0 } };

/**
 * A stable rendering of a value, for the `call` row and the fold.
 *
 * KEYS SORTED, because the string is compared: two asks that drafted the same predicate with the
 * keys in a different order are one predicate, and `JSON.stringify` would call them two. This is
 * JCS in the one respect that matters here and is not a JCS implementation.
 */
export const canon = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};

/**
 * `%INDEX%`: one line per register, `id (n rows, n open): field:type · field:type`.
 *
 * THE OPEN COUNT IS PRINTED ONLY WHERE THE PROJECTION CARRIED ONE. A host bridging `project` over the record's `list` cannot
 * count non-terminal rows without a scan per register (`types.ts`, `ProjectionRegister`), and `${undefined} open` printed a
 * prompt line reading `tasks (2 rows, undefined open)`, which is worse than saying nothing and is what this measured.
 */
export const indexLines = (registers: readonly ProjectionRegister[]): string =>
  registers
    .map(
      (r) =>
        `${r.id} (${r.rows} rows${r.open === undefined ? '' : `, ${r.open} open`}): ${r.fields.map((f) => `${f.id}:${f.type}`).join(' · ')}`,
    )
    .join('\n');

/**
 * Money, printed for the model to read: `EGP 5,005.00`.
 *
 * `ponytail:` THE EXPONENT IS TWO FOR EVERY CURRENCY, which is wrong for the handful that have
 * none. `JPY 1299` printed as `JPY 12.99` is a figure off by a hundred in a prompt, and the guard
 * against it reaching a person is `cite`: a quoted amount has to match a row's minor units exactly,
 * and `1299 JPY` is what the row holds either way. Swap for the exponent table of `34 §2.3` when a
 * record with a zero-exponent currency exists to test it against.
 */
const THOUSANDS = /\B(?=([0-9]{3})+(?![0-9]))/gu;
const printMoney = (amount: number, currency: string): string => {
  const [units = '0', cents = '00'] = (Math.abs(amount) / 100).toFixed(2).split('.');
  return `${currency} ${amount < 0 ? '-' : ''}${units.replace(THOUSANDS, ',')}.${cents}`;
};

const printValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(printValue).join(', ');
  if (typeof value === 'object') {
    const o = value as { amount?: unknown; currency?: unknown; value?: unknown; unit?: unknown };
    if (typeof o.amount === 'number' && typeof o.currency === 'string') return printMoney(o.amount, o.currency);
    if (typeof o.value === 'number' && typeof o.unit === 'string') return `${o.value} ${o.unit}`;
    return JSON.stringify(value);
  }
  return String(value);
};

/** `%ROWS%`: one line per row. Digits are fine here, this is the model's INPUT and not its output. */
export const printRows = (rows: readonly ProjectionRow[]): string[] =>
  rows.map(
    (row) =>
      `${row.spoken} | ${row.summary} | ${Object.entries(row.fields)
        .map(([f, v]) => `${f}: ${printValue(v)}`)
        .join(' · ')}`,
  );

/** A `Schema` for `where`'s compiler, out of what the projection index says the register holds. */
const schemaOf = (register: ProjectionRegister): Schema => ({
  register: register.id,
  fields: Object.fromEntries(register.fields.map((f) => [f.id, { type: f.type }])),
});

/** What pass 1 drafted, as pass 2 reads it back off the `call` row. */
type Drafted = {
  registers: string[];
  where: Where | null;
  q: string | null;
};

type Read = Drafted & {
  read: ReadTrace[];
  rows: ProjectionRow[];
  shown: ProjectionRegister[];
  allowed: Citable;
  model: string;
  usage: { in: number; out: number };
  ms: number;
  status: 'ok' | 'nothing';
  code?: string;
};

export type Palette = {
  read(question: string, ctx: CallContext, inference?: Inference): Promise<Result<Reading>>;
  propose(question: string, ctx: CallContext, byok?: Inference, askId?: string, inference?: Inference): Promise<Result<Proposal>>;
};

export const palette = (core: Core, record: RecordApi, fallback: Inference): Palette => {
  /**
   * Tier `a` is metered here and the other two are not, AND THE REASON THIS LINE ONCE GAVE, "on `b` and `byo` the asker
   * is paying", IS FALSE. Pass one drafts on `fallback`, the host's endpoint and key, on every tier (`look` below), and on
   * `byo` the proposal does too, since the settings hold no address of the owner's. Only tier `b`'s proposal is on the
   * asker's key. Measured at `ask_cap: 1`: five reads on `b` made five calls on the operator's key
   * (`loop/research-batch-thirty-one-audit.md` §3), and on `byo` the four reads after the first all answered 200
   * (`apps/selfhost/test/spark-byok-guard.test.ts`, red before the host counted `byo`). The host meters those drafts and
   * the `byo` proposal (`apps/selfhost/test/spark-byo-propose.test.ts`), in
   * `packages/host/src/spark.ts` `sparkGuardedEngine`, because the count is of money this package never sees spent.
   */
  const spent = (): Refusal | null => {
    const s = core.settings();
    if (s.tier !== 'a' || core.asksUsed() < s.ask_cap) return null;
    return {
      code: 'SPARK_BUDGET_SPENT',
      fix: `Spark is out of asks until ${core.resets().slice(0, 10)}. Add your own key, or wait.`,
    };
  };

  /**
   * Steps 3 to 6 of `46 §5.4`, and with `stored` step 5 alone.
   *
   * PASS 2 DOES NOT READ THE INDEX AGAIN EITHER (`46 §5.5` step 1: re-run step 5.4-5 with the stored
   * predicate). Pass 1 already dropped the vault, fitted the predicate to the registers that take it
   * and wrote the result on the `call` row, so a second index projection would spend the record's
   * budget twice to arrive back at the same few ids. The registers the rows come back under are the
   * index pass 2 needs, and the projection carries them.
   */
  const look = async (question: string, ctx: CallContext, host: Inference, stored?: Drafted): Promise<Result<Read>> => {
    let registers: string[];
    let where: Where | null;
    let q: string | null;
    /* Known before the rows are asked for on pass 1 only; pass 2 takes it off the projection. */
    let named: ProjectionRegister[] | undefined;
    let model = '-';
    let usage = { in: 0, out: 0 };
    let ms = 0;
    let code: string | undefined;

    if (stored) {
      registers = stored.registers.filter((id) => !FORBIDDEN_REGISTERS.has(id));
      where = stored.where;
      q = stored.q;
    } else {
      const index = await record.project({ registers: [], budget: { tokens: 400 } }, ctx);
      if (!index.ok) return index;

      const known = index.value.index.registers.filter((r) => !FORBIDDEN_REGISTERS.has(r.id));
      if (known.length === 0)
        return ok({
          registers: [],
          where: null,
          q: null,
          read: [GRANT],
          rows: [],
          shown: [],
          allowed: citable(EMPTY),
          model: '-',
          usage: { in: 0, out: 0 },
          ms: 0,
          status: 'nothing',
        });

      const ran = await core.run({
        id: 'predicate',
        slots: { '%INDEX%': indexLines(known), '%QUESTION%': question },
        inference: host,
      });
      model = ran.model;
      usage = ran.usage;
      ms = ran.ms;
      /* NO RETRY, AND A FALLBACK RATHER THAN A REFUSAL (`46 §10`). A predicate that did not come back,
         or came back ungrammatical, costs the ask its filter and not its answer: the keywords still
         search, and a second model call to fix the first one doubles the bill for one question. */
      if (refused(ran.out)) code = ran.out.refusal.code;
      const drafted = readBack(ran.out.ok ? ran.out.value : {}, known, question);
      const wanted = drafted.where;

      const asked = drafted.registers.length > 0 ? known.filter((r) => drafted.registers.includes(r.id)) : known;
      /* A PREDICATE THE GRAMMAR REFUSES IS DROPPED AND NEVER RETURNED (`46 §6`, the grammar row). The
         person asked a question; a `VIA_TWICE` out of a model they never saw is not their repair.
         IT IS CHECKED PER REGISTER, and the registers it does not fit are dropped rather than the
         predicate: `state is open` is a sentence about obligations and not about domains, and a model
         that names both has written one good filter and one register too many. The predicate survives
         only if some register takes it, because a filter applied to nothing is a filter that was not
         applied, and saying `all` in the fold would then be the truth of what was read. */
      const fitting = wanted === null ? [] : asked.filter((r) => compile(wanted, schemaOf(r)).bad.length === 0);
      const usable = wanted !== null && fitting.length > 0 ? wanted : null;
      named = usable === null ? asked : fitting;
      registers = named.map((r) => r.id);
      where = usable;
      q = usable === null ? (drafted.q ?? question) : drafted.q;
    }

    const rows = await record.project(
      {
        registers,
        ...(where === null ? {} : { where }),
        ...(q === null ? {} : { q }),
        budget: { tokens: 6000 },
      },
      ctx,
    );
    if (!rows.ok) return rows;

    const printed = canon(where);
    const read: ReadTrace[] = registers.map((id) => ({
      register: id,
      rows: rows.value.rows.filter((row) => row.register === id).length,
      predicate: where === null ? 'all' : printed,
    }));
    read.push(GRANT);

    return ok({
      registers,
      where,
      q,
      read,
      rows: rows.value.rows,
      shown: named ?? rows.value.index.registers.filter((r) => !FORBIDDEN_REGISTERS.has(r.id)),
      allowed: citable(rows.value),
      model,
      usage,
      ms,
      status: rows.value.rows.length === 0 ? 'nothing' : 'ok',
      ...(code === undefined ? {} : { code }),
    });
  };

  /**
   * The `read` row for a drafted predicate, written wherever the drafting happened.
   *
   * A `propose` WITH NO ASK ID DRAFTS ONE TOO, AND THAT IS A MODEL CALL LIKE ANY OTHER. `46 §4.1`
   * holds that a `call` row exists for every `Inference` call made, including the refused ones, and a
   * pass 2 that accounts only for the proposal leaves the call that chose the rows out of the audit:
   * the meter still balances, because only proposals are metered, but the person reading what Spark
   * did sees one call where two were made.
   */
  const accountRead = (it: Read, question: string, askId: string): string => {
    core.account({
      id: askId,
      kind: 'read',
      tier: core.settings().tier,
      model: it.model,
      usage: it.usage,
      ms: it.ms,
      status: it.code === undefined ? it.status : 'error',
      code: it.code,
      question,
      /* THE WHOLE DRAFT AND NOT ONLY THE `where:`. Pass 2 needs the registers and the keywords as
         well, and re-drafting them is the second model call this shape exists to avoid. */
      predicate: canon({ registers: it.registers, where: it.where, q: it.q }),
      read: it.read,
    });
    return askId;
  };

  /* `inference` IS THE HOST'S MODEL FOR THIS ASK ALONE, and `fallback` is what answers when the host hands none. The host
     keys it for the asker, so the opening of a vault key it makes is signed by them (`types.ts`, `Spark`). It is threaded
     through as an argument down to the one `core.run` that drafts, and nothing here stores it. */
  const read = async (question: string, ctx: CallContext, inference?: Inference): Promise<Result<Reading>> => {
    const stop = spent();
    if (stop) return { ok: false, refusal: stop };

    const asked = firstBytes(question.trim(), ASK_BYTES);
    if (asked === '')
      return no('VALUE_MALFORMED', 'Ask Spark a question first. A blank ask has nothing to read.', { at: 'question' });

    /* NO `await` BETWEEN `spent()` AND HERE. The hold is what the next ask's check counts, so it has to exist before
       this function first yields; `core.reserve` says why it is a row. The hold becomes the ask's own row, and its id
       the `ask_id`, on every path that called a model, and is given back on the ones that did not. */
    const held = core.reserve('read', core.settings().tier, PROMPTS.predicate.model);
    try {
      const looked = await look(asked, ctx, inference ?? fallback);
      if (!looked.ok) return looked;
      const it = looked.value;

      return ok({ ask_id: accountRead(it, asked, held), predicate: it.where, q: it.q, read: it.read, rows: it.rows });
    } finally {
      core.release(held);
    }
  };

  const propose = async (
    question: string,
    ctx: CallContext,
    byok?: Inference,
    askId?: string,
    inference?: Inference,
  ): Promise<Result<Proposal>> => {
    const stop = spent();
    if (stop) return { ok: false, refusal: stop };

    const earlier =
      askId === undefined
        ? undefined
        : core.sql.one<{ question: string; predicate: string | null }>(
            "SELECT question, predicate FROM call WHERE id = ? AND kind = 'read'",
            askId,
          );
    const asked = firstBytes((earlier?.question ?? question).trim(), ASK_BYTES);
    if (asked === '')
      return no('VALUE_MALFORMED', 'Ask Spark a question first. A blank ask has nothing to read.', { at: 'question' });

    const stored = earlier?.predicate == null ? undefined : storedDraft(earlier.predicate);
    /* EVERY MODEL CALL THIS PASS MAY MAKE IS HELD before the first `await`, as `read` holds its one. With a stored draft
       that is the proposal alone; with none it is the drafting `read` and then the proposal. Holding only the first left
       the second counted after the model answered: ten proposes with no `ask_id` sent together at `ask_cap: 2` admitted
       two, made four model calls and `status()` read 4 of 2, where the same ten sent one after another read 2 of 2. The
       check still runs once per call to this method, so one propose at the last ask still "starts one under the cap and
       ends one over" as `46 §5.5` records; two sent together no longer both do. */
    const s0 = core.settings();
    const proposing = core.reserve('propose', s0.tier, s0.tier === 'a' ? PROMPTS.propose.model : (s0.model ?? PROMPTS.propose.model));
    const drafting = stored === undefined ? core.reserve('read', s0.tier, PROMPTS.predicate.model) : undefined;
    try {
      return await pass2(asked, ctx, byok, inference ?? fallback, stored, drafting, proposing);
    } finally {
      if (drafting !== undefined) core.release(drafting);
      core.release(proposing);
    }
  };

  const pass2 = async (
    asked: string,
    ctx: CallContext,
    byok: Inference | undefined,
    host: Inference,
    stored: Drafted | undefined,
    drafting: string | undefined,
    callId: string,
  ): Promise<Result<Proposal>> => {
    const looked = await look(asked, ctx, host, stored);
    if (!looked.ok) return looked;
    const it = looked.value;
    /* The draft this pass made itself is its own row, settling its hold; a stored one was accounted on pass 1. */
    if (drafting !== undefined) accountRead(it, asked, drafting);

    const body = { registers: it.registers, where: it.where, q: it.q };

    /* ZERO ROWS, ZERO INFERENCE (`23 §6`). No account row either: nothing was called, and spending an
       ask on a question the record answered by itself is a meter that bills for a model that never
       ran. The `query` body carries the predicate, so the client can still draw and save the view. */
    if (it.rows.length === 0)
      return ok({
        text: '',
        citations: [],
        verbs: VERBS_FOR['query'] ?? [],
        body_kind: 'query',
        body,
        model: '-',
        filed: null,
        read: it.read,
      });

    const s = core.settings();
    /* TIER `b` IS THE CUSTOMER'S OWN KEY AND THIS PACKAGE HAS NEVER SEEN IT (`46 §5.9`). The host opens
       the grant under the asker's own browser session, decrypts it where key material belongs, and
       hands in an adapter for one call. No adapter means no open key, which is a sentence about the
       vault and not a fault in the question. On `a` and `byo` the proposal is the host's model, handed in for this ask. */
    const engine = s.tier === 'b' ? byok : host;
    if (engine === undefined)
      return no(
        'FORBIDDEN',
        'Your key is not open in this session. Open the vault, or switch Spark to the included model.',
      );

    const kept = { rows: it.rows.length };
    const ran = await core.run({
      id: 'propose',
      slots: { '%INDEX%': indexLines(it.shown), '%QUESTION%': asked },
      inference: engine,
      model: s.tier === 'a' ? undefined : (s.model ?? undefined),
      trim: {
        slot: '%ROWS%',
        lines: printRows(it.rows),
        onKept: (n) => {
          kept.rows = n;
        },
      },
    });

    const account = (status: 'ok' | 'refused' | 'error', code?: string, filed?: string): void =>
      core.account({
        id: callId,
        kind: 'propose',
        tier: s.tier,
        model: ran.model,
        usage: ran.usage,
        ms: ran.ms,
        status,
        code,
        question: asked,
        predicate: canon({ registers: it.registers, where: it.where, q: it.q }),
        read: trimmedRead(it.read, kept.rows),
        filed,
      });

    if (!ran.out.ok) {
      account('error', refused(ran.out) ? ran.out.refusal.code : 'UNREACHABLE');
      return ran.out;
    }

    const answer = ran.out.value;
    const kind = String(answer['body_kind']);
    const said = isRecord(answer['body']) ? answer['body'] : {};

    const checked = checkText(String(answer['text']), said, kind, it.allowed);
    if (!checked.ok) {
      account('refused', refused(checked) ? checked.refusal.code : undefined);
      return checked;
    }

    if (kind !== 'query' && checked.value.citations.length === 0) {
      account('refused', 'PROPOSAL_NO_ROWS');
      return no('PROPOSAL_NO_ROWS', 'A proposal names the rows behind it, or it is not filed.');
    }

    let filed: string | null = null;
    if (kind === 'options' || kind === 'rowset') {
      const put = await record.propose(
        { question: asked, body_kind: kind, body: checked.value.body, op_id: callId },
        SPARK_CTX,
      );
      if (!put.ok) {
        account('refused', refused(put) ? put.refusal.code : undefined);
        return put;
      }
      filed = put.value.id;
    } else if (kind !== 'query') {
      /* THE SCHEMA ADMITS THREE BODIES AND THE HAND CHECK ALREADY SAID SO. This arm is what happens
         when the two disagree, which is a bug in this package rather than in the model's answer. */
      account('error', 'PROPOSAL_SCHEMA');
      return no('PROPOSAL_SCHEMA', `Spark answered with a ${kind} body, which the palette does not file.`, {
        at: 'body_kind',
        allowed: ['query', 'options', 'rowset'],
      });
    }

    account('ok', undefined, filed ?? undefined);
    return ok({
      text: checked.value.text,
      citations: checked.value.citations,
      verbs: VERBS_FOR[kind] ?? [],
      body_kind: kind === 'options' ? 'options' : kind === 'rowset' ? 'rowset' : 'query',
      body: checked.value.body,
      model: ran.model,
      filed,
      read: trimmedRead(it.read, kept.rows),
    });
  };

  return { read, propose };
};

/**
 * The model's answer to the `predicate` prompt, read defensively.
 *
 * THE SCHEMA CHECK HAS ALREADY PASSED AND THIS STILL CHECKS. `where` is `{ type: ['object','null'] }`
 * in the schema, which says nothing about whether it is a predicate, and `registers` is a list of
 * strings that may name registers this record has not got. Both are narrowed here, where the answer
 * to "it is not one of ours" is to drop it rather than to refuse.
 */
const readBack = (out: Record<string, unknown>, known: readonly ProjectionRegister[], question: string): Drafted => {
  const named = Array.isArray(out['registers'])
    ? (out['registers'] as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];
  /* THE VAULT IS DROPPED BEFORE THE CALL AND NOT REFUSED AFTER IT (`46 §5.4` step 5). A model naming
     `grant` has guessed a register id, which is not misconduct; projecting it would be. */
  const registers = known.filter((r) => named.includes(r.id)).map((r) => r.id);
  const where = registers.length > 0 && isRecord(out['where']) ? (out['where'] as Where) : null;
  const q = typeof out['q'] === 'string' && out['q'].trim() !== '' ? out['q'] : where === null ? question : null;
  return { registers, where, q };
};

/** The `call` row's `predicate` column, read back as the draft pass 1 stored. */
const storedDraft = (text: string): Drafted | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  return {
    registers: Array.isArray(parsed['registers'])
      ? (parsed['registers'] as unknown[]).filter((r): r is string => typeof r === 'string')
      : [],
    where: isRecord(parsed['where']) ? (parsed['where'] as Where) : null,
    q: typeof parsed['q'] === 'string' ? parsed['q'] : null,
  };
};

/**
 * What the fold says when rows came off the end to fit the cap.
 *
 * ROWS ARE DROPPED FROM THE LAST REGISTER FIRST, because that is the end the printer trimmed. The
 * alternative, scaling every register down proportionally, reports counts no register contributed.
 */
const trimmedRead = (read: readonly ReadTrace[], kept: number): ReadTrace[] => {
  const registers = read.filter((r) => r.register !== 'grant');
  const total = registers.reduce((n, r) => n + r.rows, 0);
  if (kept >= total) return [...read];
  let left = kept;
  const out = registers.map((r) => {
    const take = Math.min(r.rows, left);
    left -= take;
    return { ...r, rows: take };
  });
  out.push(GRANT);
  return out;
};

/**
 * The citation rule over everything the model wrote, and the two softenings `23 §6` allows.
 *
 * A REFUSAL IS ABOUT THE WHOLE PROPOSAL AND A MISSING CITATION IS ABOUT ONE PART. They are different
 * faults: text holding an uncited digit is a figure nobody can check, and the answer is to file
 * nothing; an option whose reason names no row is a recommendation with no evidence, and the answer
 * is to stop recommending it while keeping the option a person may still choose. The `rowset` case
 * is the same shape: the row with nothing behind it is dropped and the rest are filed.
 */
const checkText = (
  text: string,
  body: Record<string, unknown>,
  kind: string,
  allowed: Citable,
): Result<{ text: string; citations: string[]; body: Record<string, unknown> }> => {
  const head = cite(text, allowed);
  if (!head.ok) return head;
  const citations = [...head.value.citations];
  const add = (found: readonly string[]): void => {
    for (const id of found) if (!citations.includes(id)) citations.push(id);
  };

  if (kind === 'options' && Array.isArray(body['options'])) {
    const options: Record<string, unknown>[] = [];
    for (const raw of body['options'] as unknown[]) {
      if (!isRecord(raw)) continue;
      const option = { ...raw };
      let cited = 0;
      for (const key of ['label', 'because']) {
        const value = option[key];
        if (typeof value !== 'string') continue;
        const checked = cite(value, allowed);
        if (!checked.ok) return checked;
        add(checked.value.citations);
        if (key === 'because') cited = checked.value.citations.length;
      }
      /* `recommended` NEEDS A REASON WITH A ROW IN IT (`23 §6`). Recommending on an uncited reason is
         the one place a model's opinion would be dressed up as evidence. */
      if (option['recommended'] === true && cited === 0) option['recommended'] = false;
      options.push(option);
    }
    return ok({ text, citations, body: { ...body, options } });
  }

  if (kind === 'rowset' && Array.isArray(body['rows'])) {
    const rows: unknown[] = [];
    let dropped = 0;
    for (const raw of body['rows'] as unknown[]) {
      if (!isRecord(raw)) {
        dropped++;
        continue;
      }
      let cited = 0;
      for (const value of Object.values(raw)) {
        if (typeof value !== 'string') continue;
        const checked = cite(value, allowed);
        if (!checked.ok) return checked;
        add(checked.value.citations);
        cited += checked.value.citations.length;
      }
      if (cited === 0) dropped++;
      else rows.push(raw);
    }
    return ok({ text, citations, body: { ...body, rows, ...(dropped === 0 ? {} : { dropped }) } });
  }

  return ok({ text, citations, body });
};
