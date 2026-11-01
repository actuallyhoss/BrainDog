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
 * found nothing, no row and no figure, returns the `query` body and makes no `Inference` call at all.
 *
 * A FIGURE OR A TOTAL IS CITED AND NEVER TYPED. The draft may name up to three of the figures the
 * record keeps, and the host reads them with the rows; `sumsOf` adds up the rows read; the model is
 * handed both as braces it may copy (`figureLines`), and every brace in what it answers is kept on the
 * answer's body as what it stood for (`figuresOf`), so the palette draws a figure and never a brace.
 *
 * THE ASKER'S PRINCIPAL PROJECTS AND SLASH'S PRINCIPAL FILES. Every read runs under `ctx`, so the
 * record's own scoping decides what the model may be shown, and the record never has to trust this
 * package about who is asking. The one write runs under `{ kind: 'system', id: 'slash' }`, so the
 * suggestion is attributed to Slash and not to the person who happened to ask a question.
 */

import { no, ok, refused, type Refusal, type Result } from '@braindog/ports';
import { compile, type Schema } from '@braindog/where';

import type { Charge, Core } from './call.ts';
import { BODIES, fenced, fill, PROMPTS, type AnsweredKind, type PromptId } from './prompts.ts';
import {
  checkSchema,
  citable,
  cite,
  figuresOf,
  firstBytes,
  isRecord,
  type Allowed,
  type FigureName,
  type Figured,
  type ProjectedFigure,
  type Sum,
} from './project.ts';
import type {
  CallContext,
  Inference,
  Projection,
  ProjectionRegister,
  ProjectionRow,
  ProjectQuery,
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
 * IT IS A CLAIM THE PERSON CAN CHECK, not a reassurance. "Slash read nothing from the keychain" is a
 * sentence in marketing copy; a row in the same list as the registers it DID read, saying zero and
 * refused, is the same sentence somewhere a lie would be visible.
 */
const GRANT: ReadTrace = { register: 'grant', rows: 0, predicate: 'refused' };

/** `12 §5`: the register that holds credentials is not one Slash reads, whoever names it. */
const FORBIDDEN_REGISTERS = new Set(['grant']);

/**
 * The fold's line for the figures an ask read, beside the registers' lines.
 *
 * NOT A REGISTER ID, AND IT CANNOT BE ONE: a register's id starts with a letter (`34 §4`), so a pack's own list can never
 * be mistaken for this line. `rows` is how many figures were read and `predicate` their ids. The palette draws it in its
 * own words (`apps/web/src/lib/palette/slash.ts`, `FIGURES_TRACE`), and asks pass 2 on it when no row answered.
 */
export const FIGURES_TRACE = '@figures';

/** Figures one ask may read: as many as the predicate prompt asks for (`PREDICATE_USER`), and a model that names more is cut here. */
const FIGURES_ASKED = 3;

/** Figures the predicate prompt lists by name, at most. A record keeping more lists its first, in the record's order. */
const FIGURES_LISTED = 40;

/** An ask is one question, and 400 bytes of it. `11 §6`'s conversation budget, spent in one place. */
const ASK_BYTES = 400;

const VERBS_FOR: Record<string, Verb[]> = {
  query: ['edit', 'save', 'open'],
  options: ['decide', 'defer', 'dismiss'],
  rowset: ['decide', 'defer', 'dismiss'],
  change: ['decide', 'defer', 'dismiss'],
  pattern: ['decide', 'dismiss'],
};

/**
 * The name the host says it sent the model under, read structurally off its reply or its throw, or nothing.
 *
 * THE PACKAGE ASKS BY ROUTING NAME AND THE HOST MAPS IT, so the name `core.run` holds is the template's and not what ran.
 * Measured through the self-host with `SLASH_MODEL=llama3`: every `answer` row read `glm-5.3-flash`.
 * The host's `endpointInference` now says `model` on both (`packages/host/src/slash.ts`); an adapter that says nothing
 * keeps the template's name, which is what every row carried before.
 */
export const nameIn = (source: unknown): string | undefined => {
  const model = typeof source === 'object' && source !== null ? (source as { model?: unknown }).model : undefined;
  return typeof model === 'string' && model.trim() !== '' ? model : undefined;
};

/**
 * `engine`, and the name the host said it sent the last call under, off the reply or off the throw.
 *
 * THIS NAME WAS ONCE READ FOR `answer` AND NOT HERE, so one self-host wrote two names for one model: with `SLASH_MODEL=llama3`
 * an automation's row read `llama3`, and the palette's `read` and `propose` rows, sent to the same endpoint as the same
 * `llama3`, read `glm-5.3-flash` (`test/slash-ledger-model.test.ts`). A throw is read as a reply is, because the host's
 * marked throws say the name too and a plain one says none, which leaves the template's.
 */
const naming = (engine: Inference): { inference: Inference; sent(): string | undefined } => {
  let sent: string | undefined;
  return {
    inference: {
      complete: async (call) => {
        try {
          const reply = await engine.complete(call);
          sent = nameIn(reply);
          return reply;
        } catch (e) {
          sent = nameIn(e);
          throw e;
        }
      },
    },
    sent: () => sent,
  };
};

/** Slash's own principal. `30 §3`: every event this package causes carries actor `slash`. */
export const SLASH_CTX: CallContext = { principal: { kind: 'system', id: 'slash' } };

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
 * A currency's own decimals: GBP 2, JPY 0, KWD 3.
 *
 * ISO 4217's MINOR UNITS, RESTATED FROM `EXPONENT` IN `packages/kernel/src/ingest.ts` (and `braindog-render`'s, which a
 * test holds equal to it), because this package depends on neither and adding a dependency for one lookup is the wrong
 * trade. NOT `Intl`'s DIGITS: those are CLDR's, which print IQD with none where ISO and the record keep three, and ALL,
 * IRR, LBP and a handful more with none where both keep two, so an amount would reach the model a hundredfold or a
 * thousandfold off. A code the table does not name is two, as it is in both copies.
 */
const EXPONENT: Readonly<Record<string, number>> = {
  CLF: 4, UYW: 4,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};
const decimalsOf = (currency: string): number => EXPONENT[currency.toUpperCase()] ?? 2;

/**
 * Money, printed for the model to read: `EGP 5,005.00`, `JPY 1,299`, `KWD 1.500`.
 *
 * SHIFTED BY THE CURRENCY'S OWN DECIMALS AND NEVER BY A HUNDRED. Every amount was divided by a hundred, so `JPY 1299`
 * reached the model as `JPY 12.99`, and a total handed to it as a brace to quote was a figure it would talk about a
 * hundredfold wrong. The brace it quotes is still checked against minor units by `cite`, whatever this prints.
 */
const THOUSANDS = /\B(?=([0-9]{3})+(?![0-9]))/gu;
const printMoney = (amount: number, currency: string): string => {
  const places = decimalsOf(currency);
  const [units = '0', minor = ''] = (Math.abs(amount) / 10 ** places).toFixed(places).split('.');
  return `${currency} ${amount < 0 ? '-' : ''}${units.replace(THOUSANDS, ',')}${places === 0 ? '' : `.${minor}`}`;
};

/** One field's value as the model reads it: money as `EGP 5,005.00`, a quantity with its unit, the rest as text. */
export const printValue = (value: unknown): string => {
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

/** `%FIGURES%` on the predicate prompt: `id: name` for each figure the record keeps, or `none`. */
export const figureNameLines = (figures: readonly FigureName[]): string =>
  figures.length === 0 ? 'none' : figures.slice(0, FIGURES_LISTED).map((f) => `${f.id}: ${f.name}`).join('\n');

const CURRENCY = /^[A-Z]{3}$/u;

/** A figure's reading as the model reads it: money spelled as the rows spell it, anything else with its unit. */
const figureValue = (f: ProjectedFigure): string => {
  if (f.value === null) return 'not known';
  if (f.unit !== null && CURRENCY.test(f.unit)) return printMoney(Math.round(f.value), f.unit);
  return f.unit === null ? String(f.value) : `${f.value} ${f.unit}`;
};

/**
 * `%FIGURES%` on the proposal prompt: each figure read and each total, as the brace that cites it and what it reads.
 *
 * THE BRACE IS PRINTED WHOLE so the model copies it rather than builds it: a total's id carries its currency, and a model
 * left to spell `{{sum:…}}` from parts is a model that will one day spell a total nobody worked out.
 */
export const figureLines = (figures: readonly ProjectedFigure[], sums: readonly Sum[]): string => {
  const lines = [
    ...figures.map((f) => `{{${f.id}}} = ${figureValue(f)}, ${f.name}`),
    ...sums.map(
      (s) =>
        `{{sum:${s.id}}} = ${s.currency === null ? String(s.amount) : printMoney(s.amount, s.currency)}, the total of ${s.field} over the ${s.rows.length} rows of ${s.register} above`,
    ),
  ];
  return lines.length === 0 ? 'none' : lines.join('\n');
};

/** A `Schema` for `where`'s compiler, out of what the projection index says the register holds. */
const schemaOf = (register: ProjectionRegister): Schema => ({
  register: register.id,
  fields: Object.fromEntries(register.fields.map((f) => [f.id, { type: f.type }])),
});

/**
 * What pass 1 drafted, as pass 2 reads it back off the `call` row.
 *
 * `figures` IS THE IDS OF THE FIGURES THE QUESTION IS ABOUT, and it is written to the row only when there are some, so a
 * draft that names none reads back exactly as every draft did before figures were read.
 */
type Drafted = {
  registers: string[];
  where: Where | null;
  q: string | null;
  figures: string[];
};

/** The draft as the `call` row's `predicate` column holds it: keys sorted, `figures` only when it names one. */
const draftText = (d: Drafted): string =>
  canon({ registers: d.registers, where: d.where, q: d.q, ...(d.figures.length === 0 ? {} : { figures: d.figures }) });

/** What the `read` row for a drafting call says: the draft, what was read under it, and how the call went. */
type Drew = Drafted & {
  read: ReadTrace[];
  model: string;
  usage: { in: number; out: number };
  ms: number;
  status: 'ok' | 'nothing';
  code?: string | undefined;
  /** `Ran.served` of the drafting call, kept beside its code so the ledger can tell a timeout from a model not reached. */
  served?: boolean | undefined;
  /** `Ran.candidate` of the drafting call: the host's handle for the model on its route that answered. */
  candidate?: string | undefined;
};

type Read = Drew & {
  rows: ProjectionRow[];
  shown: ProjectionRegister[];
  allowed: Allowed;
  /** The figures the record read for this ask (`figures` is their ids, as drafted), and the totals over its rows. */
  readings: readonly ProjectedFigure[];
  sums: readonly Sum[];
};

/**
 * The code a call row settled the moment its model answered carries until the ask finishes and says how it went.
 *
 * `RECORD_UNAVAILABLE` BECAUSE THE ONLY THING LEFT TO GO WRONG IS THE RECORD. Once a model has answered, what remains of a
 * read is the rows projection and what remains of a proposal is the citation check and the filing, and a throw out of any
 * of them used to reach `finally` with the hold still pending, which `release` deletes (`test/slash-settles.test.ts`).
 * A code the ports already list, and not one of Slash's own, because a new one is an amendment to `30 §6`.
 */
const UNSETTLED = 'RECORD_UNAVAILABLE';

/**
 * What each model call here is on the ledger, said once and handed to its hold and its settle (`call.ts`, `Charge`).
 *
 * A QUESTION IS ONE OF HIS ASKS, ON ITS DRAFTING READ. The proposal is the second model call of that same question and
 * spends nothing, which is "one question is one ask" (`asksUsed`) written on the row where it used to be a kind the
 * count left out. The first plan and a file he asked to have read are his asks too, and say which they were.
 */
const ASKED = { purpose: 'ask', spends: 'person' } as const;
const PROPOSED = { purpose: 'ask', spends: 'none' } as const;
const PLANNED = { purpose: 'plan', spends: 'person' } as const;
/**
 * THE FIRST WORDS, READ ONCE ON THE HOUSE (1 Nov, his call through the coordinator): the read a new BrainDog makes of what
 * its owner wrote at sign-up, right after the build (`first: true` on the setup ask, `apps/web/src/lib/start/first-drafts.ts`),
 * spends none of the month's asks. Once per BrainDog: a second such ask is counted as any setup is.
 */
const FIRST_WORDS = { purpose: 'plan', spends: 'none' } as const;
/** Whether this BrainDog has had its first words read on the house already: any row of that charge, answered or not. */
const FIRST_WORDS_SQL = "SELECT COUNT(*) AS n FROM slash_call WHERE purpose = 'plan' AND spends = 'none'";

export type Palette = {
  read(question: string, ctx: CallContext, inference?: Inference): Promise<Result<Reading>>;
  propose(question: string, ctx: CallContext, byok?: Inference, askId?: string, inference?: Inference): Promise<Result<Proposal>>;
};

export const palette = (core: Core, record: RecordApi, fallback: Inference): Palette => {
  /**
   * Tier `a` is metered here, `byo` by the host, and tier `b` by nobody, because tier `b` is the owner's own key and asks
   * on it are listed and not capped. THAT HOLDS ONLY BECAUSE BOTH PASSES GO THERE: a
   * host hands the own key's adapter as `inference` as well as `byok`, so pass one drafts on it too. Before it did, pass
   * one drafted on the host's model on every tier, and five reads on `b` at `ask_cap: 1` made five calls on the operator's
   * key. `byo` still drafts and proposes on the host's own endpoint, so
   * the host counts it, in `packages/host/src/slash.ts` `slashGuardedEngine`, where the money is seen spent.
   */
  const spent = (kind: 'read' | 'propose' = 'read'): Refusal | null => {
    const s = core.settings();
    if (s.tier !== 'a' || core.asksUsed() < s.ask_cap) return null;
    /* THE ASK TURNED AWAY LEAVES ITS ROW (`TURNED_AWAY_SQL`, model-sign-49). */
    core.turnedAway(kind, s.tier);
    return {
      code: 'SLASH_BUDGET_SPENT',
      fix: `Slash is out of asks until ${core.resets().slice(0, 10)}. Add your own key, or wait.`,
    };
  };

  /**
   * Steps 3 to 6 of `46 §5.4`, and with `stored` step 5 alone.
   *
   * PASS 2 DOES NOT READ THE INDEX AGAIN EITHER (`46 §5.5` step 1: re-run step 5.4-5 with the stored
   * predicate). Pass 1 already dropped the keychain, fitted the predicate to the registers that take it
   * and wrote the result on the `call` row, so a second index projection would spend the record's
   * budget twice to arrive back at the same few ids. The registers the rows come back under are the
   * index pass 2 needs, and the projection carries them.
   */
  const look = async (
    question: string,
    ctx: CallContext,
    host: Inference,
    stored: Drafted | undefined,
    hold: string | undefined,
  ): Promise<Result<Read>> => {
    let registers: string[];
    let where: Where | null;
    let q: string | null;
    let figures: string[];
    /* Known before the rows are asked for on pass 1 only; pass 2 takes it off the projection. */
    let named: ProjectionRegister[] | undefined;
    let model = '-';
    let usage = { in: 0, out: 0 };
    let ms = 0;
    let code: string | undefined;
    let served: boolean | undefined;
    let candidate: string | undefined;

    if (stored) {
      registers = stored.registers.filter((id) => !FORBIDDEN_REGISTERS.has(id));
      where = stored.where;
      q = stored.q;
      figures = stored.figures;
    } else {
      const index = await record.project({ registers: [], budget: { tokens: 400 } }, ctx);
      if (!index.ok) return index;

      const known = index.value.index.registers.filter((r) => !FORBIDDEN_REGISTERS.has(r.id));
      if (known.length === 0)
        return ok({
          registers: [],
          where: null,
          q: null,
          figures: [],
          read: [GRANT],
          rows: [],
          shown: [],
          allowed: citable(EMPTY),
          readings: [],
          sums: [],
          model: '-',
          usage: { in: 0, out: 0 },
          ms: 0,
          status: 'nothing',
        });
      /* THE FIGURES THE RECORD KEEPS, BY NAME, and only where the host lists them: a projection that carries none is a
         prompt that says `none`, and a model that names a figure anyway has it dropped in `readBack`. */
      const keeps = ((index.value as Figured).index.figures ?? []).slice(0, FIGURES_LISTED);

      const drafter = naming(host);
      const ran = await core.run({
        id: 'predicate',
        slots: { '%INDEX%': indexLines(known), '%FIGURES%': figureNameLines(keeps), '%QUESTION%': question },
        inference: drafter.inference,
      });
      /* A CANDIDATE ON ITS OWN WIRE BYPASSES THE NAME-WATCHER, whose `sent()` would still hold an earlier attempt's name. */
      model = ran.candidate !== undefined ? ran.model : (drafter.sent() ?? ran.model);
      usage = ran.usage;
      ms = ran.ms;
      served = ran.served;
      candidate = ran.candidate;
      /* NO RETRY, AND A FALLBACK RATHER THAN A REFUSAL (`46 §10`). A predicate that did not come back,
         or came back ungrammatical, costs the ask its filter and not its answer: the keywords still
         search, and a second model call to fix the first one doubles the bill for one question. */
      if (refused(ran.out)) code = ran.out.refusal.code;
      const drafted = readBack(ran.out.ok ? ran.out.value : {}, known, keeps, question);
      const wanted = drafted.where;
      figures = drafted.figures;

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

    /* THE DRAFTING CALL IS SETTLED HERE, BEFORE THE ROWS ARE ASKED FOR, and not after they come back. The model has
       answered and been paid for, and every exit below this line used to leave the hold to `finally`: a projection the
       record refused was returned before `accountRead` ran, and one that threw never reached it, so `release` deleted the
       hold and no row said a model was called (`46 §4.1`'s table, last line; `test/slash-settles.test.ts` cases 1 to 4,
       measured with no row and `asks.used` 0, and at `ask_cap: 1` a second read reaching the model). Settled first, it is
       a row whatever the record does; the lines below and the caller's `accountRead` overwrite it by the same id with how
       the ask ended. */
    const drew = (read: ReadTrace[], ended: string | undefined): Drew => ({
      registers,
      where,
      q,
      figures,
      read,
      model,
      usage,
      ms,
      status: 'nothing',
      code: code ?? ended,
      served,
      candidate,
    });
    const drafting = stored === undefined ? hold : undefined;
    if (drafting !== undefined) accountRead(drew([GRANT], UNSETTLED), question, drafting);

    /* `figures` GOES ONLY WHEN THE DRAFT NAMES ONE, so a record whose host reads no figures is asked exactly what it was
       asked before. Built as a value and not written in the call, because `ProjectQuery` is the port's shape and the
       figures are the host's addition to it (`Figured`). */
    const asking: ProjectQuery & { budget: { tokens: number }; figures?: string[] } = {
      registers,
      ...(where === null ? {} : { where }),
      ...(q === null ? {} : { q }),
      ...(figures.length === 0 ? {} : { figures }),
      budget: { tokens: 6000 },
    };
    const rows = await record.project(asking, ctx);
    /* THE RECORD'S REFUSAL IS STILL THE ANSWER, and the row says it was what ended the ask. A model's own fault, a
       predicate that came back ungrammatical, stays the row's code, because the row is about the call. */
    if (!rows.ok) {
      if (drafting !== undefined) accountRead(drew([GRANT], refused(rows) ? rows.refusal.code : UNSETTLED), question, drafting);
      return rows;
    }

    const printed = canon(where);
    const read: ReadTrace[] = registers.map((id) => ({
      register: id,
      rows: rows.value.rows.filter((row) => row.register === id).length,
      predicate: where === null ? 'all' : printed,
    }));
    /* ONLY THE FIGURES IT ASKED FOR, whatever the projection carried, so a host that answers more cannot widen what the
       model is shown past what the draft named. */
    const readings = ((rows.value as Figured).figures ?? []).filter((f) => figures.includes(f.id));
    if (readings.length > 0) read.push({ register: FIGURES_TRACE, rows: readings.length, predicate: canon(readings.map((f) => f.id)) });
    read.push(GRANT);

    const shown = named ?? rows.value.index.registers.filter((r) => !FORBIDDEN_REGISTERS.has(r.id));
    const allowed = citable({ ...rows.value, figures: readings } as Figured, shown);
    return ok({
      registers,
      where,
      q,
      figures,
      read,
      rows: rows.value.rows,
      shown,
      allowed,
      readings,
      sums: [...allowed.sums.values()],
      model,
      usage,
      ms,
      status: rows.value.rows.length === 0 && readings.length === 0 ? 'nothing' : 'ok',
      ...(code === undefined ? {} : { code }),
      served,
      candidate,
    });
  };

  /**
   * The `read` row for a drafted predicate, written wherever the drafting happened.
   *
   * A `propose` WITH NO ASK ID DRAFTS ONE TOO, AND THAT IS A MODEL CALL LIKE ANY OTHER. `46 §4.1`
   * holds that a `call` row exists for every `Inference` call made, including the refused ones, and a
   * pass 2 that accounts only for the proposal leaves the call that chose the rows out of the audit:
   * the meter still balances, because only proposals are metered, but the person reading what Slash
   * did sees one call where two were made.
   */
  const accountRead = (it: Drew, question: string, askId: string): string => {
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
      /* THE WHOLE DRAFT AND NOT ONLY THE `where:`. Pass 2 needs the registers, the keywords and the figures as
         well, and re-drafting them is the second model call this shape exists to avoid. */
      predicate: draftText(it),
      read: it.read,
      ...ASKED,
      served: it.served,
      candidate: it.candidate,
    });
    return askId;
  };

  /* `inference` IS THE HOST'S MODEL FOR THIS ASK ALONE, and `fallback` is what answers when the host hands none. The host
     keys it for the asker, so the opening of a keychain key it makes is signed by them (`types.ts`, `Slash`). It is threaded
     through as an argument down to the one `core.run` that drafts, and nothing here stores it. */
  const read = async (question: string, ctx: CallContext, inference?: Inference): Promise<Result<Reading>> => {
    const stop = spent();
    if (stop) return { ok: false, refusal: stop };

    const asked = firstBytes(question.trim(), ASK_BYTES);
    if (asked === '')
      return no('VALUE_MALFORMED', 'Ask Slash a question first. A blank ask has nothing to read.', { at: 'question' });

    /* NO `await` BETWEEN `spent()` AND HERE. The hold is what the next ask's check counts, so it has to exist before
       this function first yields; `core.reserve` says why it is a row. The hold becomes the ask's own row, and its id
       the `ask_id`, on every path that called a model, and is given back on the ones that did not. */
    const held = core.reserve('read', core.settings().tier, PROMPTS.predicate.model, ASKED);
    try {
      const looked = await look(asked, ctx, inference ?? fallback, undefined, held);
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
    const stop = spent('propose');
    if (stop) return { ok: false, refusal: stop };

    const earlier =
      askId === undefined
        ? undefined
        : /* `slash_call` IS THE LEDGER'S NAME: `call.ts` renames the table
             `call` to it at build, idempotently. */
          core.sql.one<{ question: string; predicate: string | null }>(
            "SELECT question, predicate FROM slash_call WHERE id = ? AND kind = 'read'",
            askId,
          );
    const asked = firstBytes((earlier?.question ?? question).trim(), ASK_BYTES);
    if (asked === '')
      return no('VALUE_MALFORMED', 'Ask Slash a question first. A blank ask has nothing to read.', { at: 'question' });

    /* A SECOND PASS 2 ON ONE STORED `ask_id` IS REFUSED, NOT RUN AGAIN, since `asksUsed` stopped counting `propose`
       (`call.ts`): the one row that meters this question is the `read` pass 1 left, so a repeat call quoting the same
       `ask_id` would otherwise call a model for nothing the meter sees. The first pass 2 for an `ask_id` reserves its
       proposal under `<ask_id>:propose` rather than a fresh ulid (`core.reserve`'s `id`), so that row is still there
       to find here, whether the first pass 2 finished `ok` or failed after it held it; only a hold `release` deleted
       (the keychain-closed `FORBIDDEN` arm below, among others) leaves nothing, and that pass 2 never happened. */
    if (askId !== undefined && earlier !== undefined && core.sql.one('SELECT 1 AS n FROM slash_call WHERE id = ?', `${askId}:propose`) !== undefined)
      return no('ALREADY_KNOWN', 'This question already has an answer. Ask it again to draft a new one.', { at: 'ask_id' });

    const stored = earlier?.predicate == null ? undefined : storedDraft(earlier.predicate);
    /* EVERY MODEL CALL THIS PASS MAY MAKE IS HELD before the first `await`, as `read` holds its one. With a stored draft
       that is the proposal alone; with none it is the drafting `read` and then the proposal. Holding only the first left
       the second counted after the model answered: ten proposes with no `ask_id` sent together at `ask_cap: 2` admitted
       two, made four model calls and `status()` read 4 of 2, where the same ten sent one after another read 2 of 2. The
       check still runs once per call to this method, so one propose at the last ask still "starts one under the cap and
       ends one over" as `46 §5.5` records; two sent together no longer both do. */
    const s0 = core.settings();
    const proposing = core.reserve(
      'propose',
      s0.tier,
      s0.model ?? PROMPTS.propose.model,
      PROPOSED,
      askId === undefined ? undefined : `${askId}:propose`,
    );
    const drafting = stored === undefined ? core.reserve('read', s0.tier, PROMPTS.predicate.model, ASKED) : undefined;
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
    const looked = await look(asked, ctx, host, stored, drafting);
    if (!looked.ok) return looked;
    const it = looked.value;
    /* The draft this pass made itself is its own row, settling its hold; a stored one was accounted on pass 1. */
    if (drafting !== undefined) accountRead(it, asked, drafting);

    const body = { registers: it.registers, where: it.where, q: it.q };

    /* ZERO ROWS, ZERO INFERENCE (`23 §6`). No account row either: nothing was called, and spending an
       ask on a question the record answered by itself is a meter that bills for a model that never
       ran. The `query` body carries the predicate, so the client can still draw and save the view.
       A FIGURE READ IS AN ANSWER THE MODEL MAY TALK ABOUT, so "why is runway four months" goes on to the model when no
       row matched and the figure did. */
    if (it.rows.length === 0 && it.readings.length === 0)
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
       hands in an adapter for the ask, the same one pass one drafted on. No adapter means no open key,
       which is a sentence about the keychain and not a fault in the question, and the included model is
       never asked in its place: the owner chose where his questions go. On `a` and `byo` the proposal
       is the host's model, handed in for this ask. */
    const engine = s.tier === 'b' ? byok : host;
    if (engine === undefined)
      return no(
        'FORBIDDEN',
        'Your key is not open in this session. Open the keychain, or switch Slash to the included model.',
      );

    const kept = { rows: it.rows.length };
    const proposer = naming(engine);
    const ran = await core.run({
      id: 'propose',
      slots: { '%INDEX%': indexLines(it.shown), '%FIGURES%': figureLines(it.readings, it.sums), '%QUESTION%': asked },
      inference: proposer.inference,
      model: s.model ?? undefined,
      trim: {
        slot: '%ROWS%',
        lines: printRows(it.rows),
        onKept: (n) => {
          kept.rows = n;
        },
      },
    });
    /* THE ROW AND THE PROPOSAL BOTH SAY IT, because `model` ships with every output (`23 §1`) and a proposal naming a
       model nothing was sent is the ledger's fault again, one screen further out. */
    const used = ran.candidate !== undefined ? ran.model : (proposer.sent() ?? ran.model);

    const account = (status: 'ok' | 'refused' | 'error', code?: string, filed?: string): void =>
      core.account({
        id: callId,
        kind: 'propose',
        tier: s.tier,
        model: used,
        usage: ran.usage,
        ms: ran.ms,
        status,
        code,
        question: asked,
        predicate: draftText(it),
        read: trimmedRead(it.read, kept.rows),
        filed,
        candidate: ran.candidate,
        raw: ran.raw,
        ...PROPOSED,
      });

    /* SETTLED THE MOMENT THE MODEL ANSWERED, for the drafting call's reason in `look`: a filing that threw after the
       proposal's model answered left this hold to `finally`, and `release` deleted it (`test/slash-settles.test.ts` case
       5, measured with the `propose` row missing and `asks.used` one short). Every exit below overwrites it. */
    account('error', UNSETTLED);

    if (!ran.out.ok) {
      account('error', refused(ran.out) ? ran.out.refusal.code : 'UNREACHABLE');
      return ran.out;
    }

    const answer = ran.out.value;
    const kind = String(answer['body_kind']);
    /* THE REPLY'S SCHEMA NAMES THE KINDS IN `BODIES` AND ITS HAND CHECK ALREADY HELD THE ANSWER TO THEM. This arm is what
       happens when the two disagree, which is a bug in this package rather than in the model's answer. */
    if (!isAnswered(kind)) {
      account('error', 'PROPOSAL_SCHEMA');
      return no('PROPOSAL_SCHEMA', `Slash answered with a ${kind} body, which the palette does not file.`, {
        at: 'body_kind',
        allowed: Object.keys(BODIES),
      });
    }
    const said = isRecord(answer['body']) ? answer['body'] : {};
    /* THE BODY AGAINST ITS OWN KIND'S SCHEMA, which `core.run` could not do: the reply's schema offers the provider every
       shape in `BODIES`, and `checkSchema` reads no `anyOf`. `at` names the place under `body`, as the reply's own check does.
       A QUERY'S BODY IS NOT HELD TO IT, because nothing the model put there is kept: the engine writes a query's body out
       of its own draft, and refusing a cited answer over keys that are thrown away would cost the asker the answer. */
    const shaped = kind === 'query' ? null : checkSchema(BODIES[kind], said, 'body');
    if (shaped) {
      account('refused', shaped.code);
      return { ok: false, refusal: shaped };
    }

    const checked = checkText(String(answer['text']), said, kind, it.allowed, it.rows);
    if (!checked.ok) {
      account('refused', refused(checked) ? checked.refusal.code : undefined);
      return checked;
    }

    if (kind !== 'query' && checked.value.citations.length === 0) {
      account('refused', 'PROPOSAL_NO_ROWS');
      return no('PROPOSAL_NO_ROWS', 'A proposal names the rows behind it, or it is not filed.');
    }

    /* WHAT EVERY BRACE STANDS FOR, ON THE ANSWER'S BODY, so the palette draws it without a second read (`DrawnFigure`).
       A query's body is the draft, as it is with no rows. */
    const figures = figuresOf(checked.value.said, it.allowed, it.shown);
    const drawn = kind === 'query' ? { ...body, figures } : { ...checked.value.body, figures };
    /* NOTHING IS FILED WITH `figures`, which hold the titles and values of the rows and figures cited. What the record
       shows a filed question to is not what the asker could read: it holds a rowset back only from a reader who cannot
       read the list it names, and an options question that names no list from a reader who does not read the whole
       record (`holds` in `packages/record/src/index.ts`), which a member holding one list at `append` still does. Filed
       with its figures, either would hand her titles and amounts from a list she cannot read. So the filed body carries
       the braces and not what they stand for: Decide draws each one in words of its own (`cite.ts`), and the palette
       draws the whole answer from this reply, which goes to the asker alone. */
    const filing = checked.value.body;

    let filed: string | null = null;
    if (kind === 'options' || kind === 'rowset') {
      const put = await record.propose({ question: asked, body_kind: kind, body: filing, op_id: callId }, SLASH_CTX);
      if (!put.ok) {
        account('refused', refused(put) ? put.refusal.code : undefined);
        return put;
      }
      filed = put.value.id;
    }

    account('ok', undefined, filed ?? undefined);
    return ok({
      text: checked.value.text,
      citations: checked.value.citations,
      verbs: VERBS_FOR[kind] ?? [],
      body_kind: kind,
      body: drawn,
      model: used,
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
const readBack = (
  out: Record<string, unknown>,
  known: readonly ProjectionRegister[],
  keeps: readonly FigureName[],
  question: string,
): Drafted => {
  const named = strings(out['registers']);
  /* THE KEYCHAIN IS DROPPED BEFORE THE CALL AND NOT REFUSED AFTER IT (`46 §5.4` step 5). A model naming
     `grant` has guessed a register id, which is not misconduct; projecting it would be. */
  const registers = known.filter((r) => named.includes(r.id)).map((r) => r.id);
  const where = registers.length > 0 && isRecord(out['where']) ? (out['where'] as Where) : null;
  const q = typeof out['q'] === 'string' && out['q'].trim() !== '' ? out['q'] : where === null ? question : null;
  /* A FIGURE THE RECORD DID NOT LIST IS DROPPED, as a register it has not got is: the list is the record's, and a model
     that guessed an id has guessed, which is not a reason to read anything. */
  const asked = strings(out['figures']);
  const figures = keeps.filter((f) => asked.includes(f.id)).map((f) => f.id).slice(0, FIGURES_ASKED);
  return { registers, where, q, figures };
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

const isAnswered = (kind: string): kind is AnsweredKind => Object.hasOwn(BODIES, kind);

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
    registers: strings(parsed['registers']),
    where: isRecord(parsed['where']) ? (parsed['where'] as Where) : null,
    q: typeof parsed['q'] === 'string' ? parsed['q'] : null,
    figures: strings(parsed['figures']).slice(0, FIGURES_ASKED),
  };
};

/**
 * What the fold says when rows came off the end to fit the cap.
 *
 * ROWS ARE DROPPED FROM THE LAST REGISTER FIRST, because that is the end the printer trimmed. The
 * alternative, scaling every register down proportionally, reports counts no register contributed.
 * The figures' line is not a register and is never trimmed: the printer cuts rows and nothing else.
 */
const trimmedRead = (read: readonly ReadTrace[], kept: number): ReadTrace[] => {
  const registers = read.filter((r) => r.register !== 'grant' && r.register !== FIGURES_TRACE);
  const total = registers.reduce((n, r) => n + r.rows, 0);
  if (kept >= total) return [...read];
  let left = kept;
  const out = registers.map((r) => {
    const take = Math.min(r.rows, left);
    left -= take;
    return { ...r, rows: take };
  });
  out.push(...read.filter((r) => r.register === FIGURES_TRACE));
  out.push(GRANT);
  return out;
};

/** A row's source as the model may write it, `obligations#7` or `{{ref:obligations#7}}`, as the spoken id alone. */
const spokenOf = (from: string): string => {
  const t = from.trim();
  const inner = t.startsWith('{{') && t.endsWith('}}') ? t.slice(2, -2).trim() : t;
  return inner.startsWith('ref:') ? inner.slice('ref:'.length).trim() : inner;
};

const DIGITS = /[0-9]+/gu;

/**
 * Whether one proposed row's fields hold only what its sources hold, and no citation text.
 *
 * A BRACE IN A FIELD IS REFUSED, because it would be written into the row on accept, which is the defect the rowset shape
 * exists to end. A MONEY VALUE IS ONE A ROW HOLDS, exactly, by `cite`'s rule for a quoted amount. A RUN OF DIGITS IN
 * A WORD IS ONE ITS SOURCES SAY, so "Chase invoice 42" stands over a row titled "Invoice 42" and a due date copied from
 * its source stands, while a date or a number the model worked out has nothing behind it.
 */
const fieldsHold = (fields: Record<string, unknown>, sources: readonly ProjectionRow[], allowed: Allowed): boolean => {
  const said = sources.map((r) => `${r.summary} ${JSON.stringify(r.fields)}`).join(' ');
  for (const value of Object.values(fields)) {
    if (typeof value === 'string') {
      if (value.includes('{{') || value.includes('}}')) return false;
      for (const run of value.match(DIGITS) ?? []) if (!said.includes(run)) return false;
    } else if (typeof value === 'number') {
      /* A NUMBER IS DIGITS WITHOUT THE QUOTES, and held to the same rule: one its sources say, or none. */
      for (const run of String(value).match(DIGITS) ?? []) if (!said.includes(run)) return false;
    } else if (isRecord(value) && typeof value['amount'] === 'number' && typeof value['currency'] === 'string') {
      if (!allowed.money.has(`${value['amount']} ${value['currency']}`)) return false;
    }
  }
  return true;
};

/**
 * The citation rule over everything the model wrote, and the two softenings `23 §6` allows.
 *
 * A REFUSAL IS ABOUT THE WHOLE PROPOSAL AND A MISSING CITATION IS ABOUT ONE PART. They are different
 * faults: text holding an uncited digit is a figure nobody can check, and the answer is to file
 * nothing; an option whose reason names no row is a recommendation with no evidence, and the answer
 * is to stop recommending it while keeping the option a person may still choose. The `rowset` case
 * is the same shape: the row with nothing behind it is dropped and the rest are filed.
 *
 * THE BODY HAS PASSED ITS KIND'S SCHEMA BEFORE THIS RUNS (`BODIES`), so an option is `{ id, label, because }` and a row
 * is `{ fields, from }` here, and what is left to check is what a schema cannot say. `said` is every text the answer
 * carries a brace in, for `figuresOf`.
 *
 * A ROWSET FILES ITS FIELDS AS ITS ROWS AND ITS SOURCES BESIDE THEM. The kernel writes each of `rows` as it stands on
 * accept (`govern.ts`), so a row's `from` cannot ride inside it; `from[i]` is the spoken ids behind `rows[i]`, which the
 * kernel does not read and which is kept for a screen to draw beside the row.
 */
const checkText = (
  text: string,
  body: Record<string, unknown>,
  kind: AnsweredKind,
  allowed: Allowed,
  read: readonly ProjectionRow[],
): Result<{ text: string; citations: string[]; body: Record<string, unknown>; said: string[] }> => {
  const head = cite(text, allowed);
  if (!head.ok) return head;
  const citations = [...head.value.citations];
  const said = [text];
  const add = (found: readonly string[]): void => {
    for (const id of found) if (!citations.includes(id)) citations.push(id);
  };

  if (kind === 'options') {
    const options: Record<string, unknown>[] = [];
    const ids = new Set<string>();
    for (const raw of Array.isArray(body['options']) ? body['options'] : []) {
      if (!isRecord(raw)) continue;
      const option = { ...raw };
      /* ONE ID PER OPTION, because the id is what a decision records as its answer: two options under one id are one
         answer drawn twice, and whichever was pressed, the record would say the other. */
      const id = String(option['id']).trim();
      if (id === '' || ids.has(id))
        return no('PROPOSAL_SCHEMA', "The model's answer gave two options the same id, or one none. Nothing was filed; ask again.", { at: 'body.options' });
      ids.add(id);
      let cited = 0;
      for (const key of ['label', 'because']) {
        const value = option[key];
        if (typeof value !== 'string') continue;
        const checked = cite(value, allowed);
        if (!checked.ok) return checked;
        add(checked.value.citations);
        said.push(value);
        if (key === 'because') cited = checked.value.citations.length;
      }
      /* `recommended` NEEDS A REASON WITH A ROW IN IT (`23 §6`). Recommending on an uncited reason is
         the one place a model's opinion would be dressed up as evidence. */
      if (option['recommended'] === true && cited === 0) option['recommended'] = false;
      options.push(option);
    }
    return ok({ text, citations, body: { options }, said });
  }

  if (kind === 'rowset') {
    const register = String(body['register']);
    /* THE KEYCHAIN IS NEVER WRITTEN THROUGH SLASH, as it is never read: a row proposed into it is a credential a model
       made up, filed for a person to accept. */
    if (FORBIDDEN_REGISTERS.has(register))
      return no('PROPOSAL_SCHEMA', 'Slash does not propose rows for the keychain. Nothing was filed.', { at: 'body.register' });
    const bySpoken = new Map(read.map((r) => [r.spoken, r] as const));
    const rows: Record<string, unknown>[] = [];
    const from: string[][] = [];
    let dropped = 0;
    for (const raw of Array.isArray(body['rows']) ? body['rows'] : []) {
      const fields = isRecord(raw) && isRecord(raw['fields']) ? raw['fields'] : null;
      const sources = isRecord(raw) ? strings(raw['from']).map(spokenOf).filter((s) => allowed.spoken.has(s)) : [];
      const behind = sources.flatMap((s) => {
        const row = bySpoken.get(s);
        return row ? [row] : [];
      });
      if (fields === null || Object.keys(fields).length === 0 || behind.length === 0 || !fieldsHold(fields, behind, allowed)) {
        dropped++;
        continue;
      }
      const cited = [...new Set(sources)];
      add(cited);
      rows.push(fields);
      from.push(cited);
    }
    /* NOTHING LEFT IS NOTHING FILED, and said so here: the record would refuse an empty rowset as a body missing its
       rows, which is a sentence about the shape when the fault is that no row had anything behind it. */
    if (rows.length === 0) return no('PROPOSAL_NO_ROWS', 'No row Slash proposed had a row behind it, so none was filed.');
    return ok({ text, citations, body: { register, rows, from, ...(dropped === 0 ? {} : { dropped }) }, said });
  }

  return ok({ text, citations, body: {}, said });
};

/* ── the first run's two asks ──────────────────────────────────────────── */

/**
 * What the first run may build, as the browser hands it: the use cases and the modules this build ships, each module
 * with its lists and their field ids. HANDED IN AND NOT READ HERE, because this package may not import the catalogue
 * (`46 §1`); the host passes what the person's own screen was drawn from, and every id the model answers is held to it.
 */
export type SetupOffer = {
  usecases: readonly { id: string; title: string; summary: string }[];
  modules: readonly { id: string; name: string; lists: readonly { id: string; name: string; fields: readonly string[] }[] }[];
};

/** What one person typed about themselves, with the catalogue it is read against and their day (`YYYY-MM-DD`). */
export type SetupAsk = {
  said: string;
  offer: SetupOffer;
  today: string;
  /** The owner's sign-up words, read once on the house (`FIRST_WORDS`). */
  first?: boolean;
  /**
   * THE FIRST RUN IS A CONVERSATION (1 Nov, "i need the who are you to be a conversation with questions"): what BrainDog
   * asked so far, one question a line as `about: question`, in order. `said` is their answers in the same order. The
   * model reads the answers against the questions and asks the next one, never one whose `about` is here already.
   */
  asked?: string;
  /**
   * ONE TURN OF THE CONVERSATION, ASKED QUICKLY (1 Nov, lane onboard-speed): the `turn` template, what the answers point
   * at and the next question, in about fifty tokens on a fast model. The whole reading (`setup`) is asked without it.
   */
  quick?: boolean;
};

/** The setup the model proposed, every id one it was offered and every phrase one the person typed. */
export type SetupAnswer = {
  name: string | null;
  summary: string;
  usecase: string | null;
  also: string[];
  modules: string[];
  currency: string | null;
  heard: { phrase: string; became: string }[];
  names: { list: string; name: string }[];
  rows: { list: string; fields: Record<string, unknown> }[];
  draft: string | null;
  /**
   * The one question the model would ask back, where the answer would change what is built, or null.
   *
   * ONE, NEVER TWO (settled on 9 October, `apps/web/src/lib/start/question.ts`, over the scope's two). Absent where the
   * model said nothing about it, which reads as null.
   */
  ask?: SetupQuestion | null;
  /** Who answered, as the ledger names it. */
  by: string;
  /** A turn's quick answer (`quick` on the ask): its parts, phrases, currency and next question, and no names, entries or summary. */
  quick?: true;
};

/** What a question back may be about: the five things a first run builds differently on. */
export type SetupAbout = 'name' | 'kind' | 'things' | 'who_for' | 'currency' | 'work' | 'money' | 'people' | 'tools' | 'first';

/**
 * One question back: one line, and up to four short choices to tap. The conversation's own (1 Nov) are what they work
 * on (`work`), the money that comes in and goes out (`money`), who they work with (`people`), the AI tools and agents
 * they use (`tools`) and what to keep track of first (`first`), beside the five a single reading asked about.
 */
export type SetupQuestion = { about: SetupAbout; question: string; choices: string[] };

/** A list an export may go into, with each field's id, type and, for an enum, its values. */
export type MappingList = { id: string; name: string; fields: readonly { id: string; type: string; values?: readonly string[] | undefined }[] };

/** The first entries of a file the person exported elsewhere, and the lists it may go into. */
export type MappingAsk = { file: string; columns: readonly string[]; sample: readonly Readonly<Record<string, string>>[]; lists: readonly MappingList[] };

/** How the file maps into the record: a list and the columns that fill its fields, or a name for a new list. */
export type MappingAnswer = {
  list: string | null;
  fields: { column: string; field: string }[];
  fixed: { field: string; value: string }[];
  summary: string;
  name: string | null;
  by: string;
};

export type Setups = {
  proposeSetup(ask: SetupAsk, ctx: CallContext, inference?: Inference): Promise<Result<SetupAnswer>>;
  proposeMapping(ask: MappingAsk, ctx: CallContext, inference?: Inference): Promise<Result<MappingAnswer>>;
};

/** What a person types about themselves, at most: two thousand bytes, a long paragraph. */
const SAID_BYTES = 2000;
/** The entries of a file the model is shown, at most, and how long one value may be when it is. */
const SAMPLE_MOST = 8;
const VALUE_BYTES = 160;
/** Columns one file may name, as the schema's own ceiling on what it maps. */
const COLUMNS_MOST = 40;

const ISO = /^[A-Z]{3}$/u;
const lower = (s: string): string => s.toLocaleLowerCase();
const oneLine = (s: string, bytes: number): string => firstBytes(s.replace(/\s+/gu, ' ').trim(), bytes);
const textOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * WHAT THE MODEL SAID, HELD TO WHAT IT WAS OFFERED AND WHAT WAS TYPED. An id outside the offer is dropped, a phrase not in
 * the person's own words is dropped, a name they did not type is dropped, and a currency is kept only as a code. What it
 * cannot vouch for, the field values of an entry, is passed on as it came, and the browser checks each against the list's
 * own declaration before anything is shown (`apps/web/src/lib/start/propose.ts`, `fromModel`).
 */
export const setupOf = (raw: Record<string, unknown>, ask: SetupAsk, by: string): SetupAnswer => {
  const said = lower(ask.said);
  const cases = new Set(ask.offer.usecases.map((u) => u.id));
  const mods = new Set(ask.offer.modules.map((m) => m.id));
  const lists = new Map(ask.offer.modules.flatMap((m) => m.lists.map((l) => [l.id, new Set(l.fields)] as const)));
  const typed = (s: string): boolean => s !== '' && said.includes(lower(s));
  const usecase = cases.has(textOf(raw['usecase'])) ? textOf(raw['usecase']) : null;
  const name = textOf(raw['name']);
  const currency = textOf(raw['currency']).toUpperCase();
  const draft = oneLine(textOf(raw['draft']), 400);
  const heard: SetupAnswer['heard'] = [];
  for (const h of Array.isArray(raw['heard']) ? raw['heard'] : []) {
    const phrase = isRecord(h) ? textOf(h['phrase']) : '';
    const became = isRecord(h) ? oneLine(textOf(h['became']), 80) : '';
    if (typed(phrase) && became !== '' && !heard.some((x) => lower(x.phrase) === lower(phrase))) heard.push({ phrase, became });
  }
  const names: SetupAnswer['names'] = [];
  for (const n of Array.isArray(raw['names']) ? raw['names'] : []) {
    const list = isRecord(n) ? textOf(n['list']) : '';
    const word = isRecord(n) ? oneLine(textOf(n['name']), 40) : '';
    if (lists.has(list) && typed(word) && !names.some((x) => x.list === list)) names.push({ list, name: word });
  }
  const rows: SetupAnswer['rows'] = [];
  for (const r of Array.isArray(raw['rows']) ? raw['rows'] : []) {
    const list = isRecord(r) ? textOf(r['list']) : '';
    const fields = isRecord(r) && isRecord(r['fields']) ? r['fields'] : null;
    const own = lists.get(list);
    if (!own || fields === null) continue;
    const kept = Object.fromEntries(Object.entries(fields).filter(([k]) => own.has(k)));
    if (Object.keys(kept).length > 0) rows.push({ list, fields: kept });
  }
  const held = { name: typed(name) && name.length <= 60 ? name : null, currency: ISO.test(currency) ? currency : null };
  return {
    name: held.name,
    summary: oneLine(textOf(raw['summary']), 200),
    usecase,
    also: [...new Set(strings(raw['also']).filter((id) => cases.has(id) && id !== usecase))],
    modules: [...new Set(strings(raw['modules']).filter((id) => mods.has(id)))],
    currency: held.currency,
    heard,
    names,
    rows,
    draft: draft === '' ? null : draft,
    ask: questionOf(raw['ask'], { named: held.name !== null, priced: held.currency !== null || MONEY_SIGN.test(ask.said), asked: askedAbouts(ask.asked) }),
    by,
  };
};

const ABOUTS: ReadonlySet<string> = new Set<SetupAbout>(['name', 'kind', 'things', 'who_for', 'currency', 'work', 'money', 'people', 'tools', 'first']);
/** The most questions a conversation asks (`asked` lines read), and how long one line of it may be. */
const ASKED_MOST = 6;
const ASKED_LINE = 160;

/** The topics already asked, read off `asked`'s `about: question` lines. */
const askedAbouts = (asked: string | undefined): Set<string> =>
  new Set(
    (asked ?? '')
      .split('\n')
      .map((l) => (l.split(':')[0] ?? '').trim())
      .filter((a) => ABOUTS.has(a)),
  );
/** A question back is one line of this many characters at most, and a choice to tap this many. */
const QUESTION_MOST = 120;
const CHOICE_MOST = 24;
const CHOICES_MOST = 4;
/** A currency the person typed as a sign, so a question about which one is not asked of them. */
const MONEY_SIGN = /[$£€¥₹₩₺₦]/u;

/**
 * THE ONE QUESTION BACK, HELD TO WHAT A FIRST RUN CAN USE. Kept only about one of the five things it builds differently on,
 * as one line of 120 characters with at most four choices of 24 each; a question that does not fit is dropped whole and
 * never cut, because a cut question asks something the model did not. A name is not asked of someone who typed one, nor
 * a currency of someone who typed one. Where the model answered a list (the scope's first shape was two), the first that
 * holds is the one kept and the rest are dropped: one question, never two.
 */
const questionOf = (raw: unknown, typed: { named: boolean; priced: boolean; asked?: ReadonlySet<string> }): SetupQuestion | null => {
  for (const q of (Array.isArray(raw) ? raw : [raw]).filter(isRecord)) {
    const about = textOf(q['about']);
    const question = textOf(q['question']);
    const choices = Array.isArray(q['choices']) ? q['choices'] : [];
    if (!ABOUTS.has(about) || question === '' || /[\r\n]/u.test(question) || [...question].length > QUESTION_MOST) continue;
    if ((about === 'name' && typed.named) || (about === 'currency' && typed.priced)) continue;
    /* NEVER A TOPIC THE CONVERSATION ALREADY ASKED, whatever the model says. */
    if (typed.asked?.has(about)) continue;
    const said = choices.map(textOf);
    if (choices.length > CHOICES_MOST || said.some((c) => c === '' || /[\r\n]/u.test(c) || [...c].length > CHOICE_MOST)) continue;
    return { about: about as SetupAbout, question, choices: [...new Set(said)] };
  }
  return null;
};

/**
 * THE FILE'S MAPPING, HELD TO ITS COLUMNS AND THE LIST NAMED. A column the file does not have, a field the list does not
 * declare, a second column on one field, and a fixed value an enum does not take are each dropped; a list outside the
 * offer is no list, which is how the model says the file needs a new one.
 */
export const mappingOf = (raw: Record<string, unknown>, ask: MappingAsk, by: string): MappingAnswer => {
  const list = ask.lists.find((l) => l.id === textOf(raw['list'])) ?? null;
  const fields: MappingAnswer['fields'] = [];
  const fixed: MappingAnswer['fixed'] = [];
  if (list !== null) {
    const declared = new Map(list.fields.map((f) => [f.id, f] as const));
    for (const m of Array.isArray(raw['fields']) ? raw['fields'] : []) {
      const column = isRecord(m) ? textOf(m['column']) : '';
      const field = isRecord(m) ? textOf(m['field']) : '';
      const exact = ask.columns.find((c) => c === column) ?? ask.columns.find((c) => lower(c.trim()) === lower(column));
      if (exact === undefined || !declared.has(field) || fields.some((f) => f.field === field)) continue;
      fields.push({ column: exact, field });
    }
    for (const x of Array.isArray(raw['fixed']) ? raw['fixed'] : []) {
      const field = isRecord(x) ? textOf(x['field']) : '';
      const value = isRecord(x) ? textOf(x['value']) : '';
      const f = declared.get(field);
      if (f?.type !== 'enum' || !(f.values ?? []).includes(value) || fields.some((m) => m.field === field) || fixed.some((m) => m.field === field)) continue;
      fixed.push({ field, value });
    }
  }
  const name = oneLine(textOf(raw['name']), 40);
  return { list: list?.id ?? null, fields, fixed, summary: oneLine(textOf(raw['summary']), 200), name: list === null && name !== '' ? name : null, by };
};

/** Strings out of a value that should be a list of them, each cut to `bytes`. */
const texts = (v: unknown, bytes: number): string[] => strings(v).map((x) => oneLine(x, bytes)).filter((x) => x !== '');

/**
 * THE ASK AS THE DOOR HANDS IT, WHICH IS WHATEVER A BROWSER SENT: every list a list, every id text, every name cut to a
 * line, and an entry of the wrong shape dropped. What is left is what the prompt is built from and the answer held to,
 * so a malformed offer is a smaller offer and never a throw.
 */
export const setupAskOf = (raw: unknown): SetupAsk => {
  const r = isRecord(raw) ? raw : {};
  const offer = isRecord(r['offer']) ? r['offer'] : {};
  const usecases = (Array.isArray(offer['usecases']) ? offer['usecases'] : []).filter(isRecord).flatMap((u) =>
    typeof u['id'] === 'string' && u['id'] !== '' ? [{ id: oneLine(u['id'], 64), title: oneLine(textOf(u['title']), 80), summary: oneLine(textOf(u['summary']), 240) }] : [],
  );
  const modules = (Array.isArray(offer['modules']) ? offer['modules'] : []).filter(isRecord).flatMap((m) =>
    typeof m['id'] === 'string' && m['id'] !== ''
      ? [
          {
            id: oneLine(m['id'], 64),
            name: oneLine(textOf(m['name']), 80),
            lists: (Array.isArray(m['lists']) ? m['lists'] : []).filter(isRecord).flatMap((l) =>
              typeof l['id'] === 'string' && l['id'] !== '' ? [{ id: oneLine(l['id'], 64), name: oneLine(textOf(l['name']), 80), fields: texts(l['fields'], 64).slice(0, 40) }] : [],
            ),
          },
        ]
      : [],
  );
  const today = textOf(r['today']);
  /* WHAT WAS ASKED, ONE LINE A QUESTION, each cut to a line and the first six kept: a browser's text, read as data. */
  const asked = textOf(r['asked'])
    .split(/\r?\n/u)
    .map((l) => oneLine(l, ASKED_LINE))
    .filter((l) => l !== '')
    .slice(0, ASKED_MOST)
    .join('\n');
  return {
    said: textOf(r['said']),
    offer: { usecases: usecases.slice(0, 40), modules: modules.slice(0, 40) },
    today: /^\d{4}-\d{2}-\d{2}$/u.test(today) ? today : '',
    ...(r['first'] === true ? { first: true } : {}),
    ...(asked === '' ? {} : { asked }),
    ...(r['quick'] === true ? { quick: true } : {}),
  };
};

/** `setupAskOf`'s twin for a file: its name, its columns, its first entries as text, and the lists it may go into. */
export const mappingAskOf = (raw: unknown): MappingAsk => {
  const r = isRecord(raw) ? raw : {};
  const columns = texts(r['columns'], 80).slice(0, COLUMNS_MOST);
  const sample = (Array.isArray(r['sample']) ? r['sample'] : [])
    .filter(isRecord)
    .slice(0, SAMPLE_MOST)
    .map((e) => Object.fromEntries(columns.map((c) => [c, typeof e[c] === 'string' || typeof e[c] === 'number' ? String(e[c]) : ''])));
  const lists = (Array.isArray(r['lists']) ? r['lists'] : []).filter(isRecord).flatMap((l) =>
    typeof l['id'] === 'string' && l['id'] !== ''
      ? [
          {
            id: oneLine(l['id'], 64),
            name: oneLine(textOf(l['name']), 80),
            fields: (Array.isArray(l['fields']) ? l['fields'] : []).filter(isRecord).flatMap((f) =>
              typeof f['id'] === 'string' && typeof f['type'] === 'string'
                ? [{ id: oneLine(f['id'], 64), type: oneLine(f['type'], 24), ...(Array.isArray(f['values']) ? { values: texts(f['values'], 64).slice(0, 30) } : {}) }]
                : [],
            ),
          },
        ]
      : [],
  );
  return { file: oneLine(textOf(r['file']), 120), columns, sample, lists: lists.slice(0, 60) };
};

/** A string of the file's as one JSON-encoded line, with `<` written so it cannot open or close a fence. */
const quoted = (s: string): string => JSON.stringify(s).replaceAll('<', '\\u003c');

/** `id: title. summary`, one a line. */
const caseLines = (offer: SetupOffer): string => offer.usecases.map((u) => `${u.id}: ${u.title}. ${u.summary}`).join('\n');
/** `money-core (Money)` and under it one list a line, `  obligations (Bills and invoices): what, amount, due`. */
const moduleLines = (offer: SetupOffer): string =>
  offer.modules.map((m) => [`${m.id} (${m.name})`, ...m.lists.map((l) => `  ${l.id} (${l.name}): ${l.fields.join(', ')}`)].join('\n')).join('\n');
/** A turn's shorter offer: `money-core (Money): Bills and invoices, Accounts, …`, one module a line, no fields. */
const partLines = (offer: SetupOffer): string =>
  offer.modules.map((m) => `${m.id} (${m.name})${m.lists.length > 0 ? `: ${m.lists.map((l) => l.name).join(', ')}` : ''}`).join('\n');

/** What a turn may ask about next, in the order the rules ask: each with the words the model is told it means. */
const TURN_TOPICS: readonly (readonly [SetupAbout, string])[] = [
  ['work', 'work: the projects, clients or products they work on'],
  ['money', 'money: what comes in and what goes out'],
  ['currency', 'currency: which currency their money is in, once money has come up and they named none'],
  ['people', 'people: who they work with'],
  ['tools', 'tools: the AI assistants they use, such as Claude, ChatGPT or Cursor, never design or office software'],
  ['first', 'first: what to keep track of first'],
];

/** The topics a turn may still ask about: those not asked yet (`asked`), one a line, or a line saying there are none. */
const openLines = (asked: string | undefined): string => {
  const done = askedAbouts(asked);
  const open = TURN_TOPICS.filter(([t]) => !done.has(t)).map(([, line]) => line);
  return open.length > 0 ? open.join('\n') : 'none: every topic is asked, so about and q are null.';
};

/**
 * A TURN'S ANSWER READ INTO A READING'S SHAPE, and then held by `setupOf` as a whole reading is: `parts` are modules or use
 * cases by id, each with the words it came from (`heard`, said as the part's own name), `case` the use case, `cur` the
 * currency, and `about`, `q` and `taps` the next question. Nothing here is trusted that `setupOf` does not check again.
 */
const turnOf = (raw: Record<string, unknown>, ask: SetupAsk, by: string): SetupAnswer => {
  const named = new Map<string, string>([...ask.offer.usecases.map((u) => [u.id, u.title] as const), ...ask.offer.modules.map((m) => [m.id, m.name] as const)]);
  const cases = new Set(ask.offer.usecases.map((u) => u.id));
  const pairs = (Array.isArray(raw['parts']) ? raw['parts'] : []).flatMap((p) => (Array.isArray(p) && p.length === 2 ? [[textOf(p[0]), textOf(p[1])] as const] : []));
  const usecase = textOf(raw['case']);
  const about = textOf(raw['about']);
  const question = textOf(raw['q']);
  const reading = {
    name: null,
    summary: '',
    usecase: usecase === '' ? null : usecase,
    /* A USE CASE NAMED AS A PART IS ONE THEY ALSO DESCRIBED. */
    also: pairs.filter(([id]) => cases.has(id) && id !== usecase).map(([id]) => id),
    modules: pairs.filter(([id]) => !cases.has(id)).map(([id]) => id),
    currency: raw['cur'] ?? null,
    heard: pairs.flatMap(([id, phrase]) => (named.has(id) ? [{ phrase, became: named.get(id) }] : [])),
    names: [],
    rows: [],
    draft: null,
    ask: about === '' || question === '' ? null : { about, question, choices: Array.isArray(raw['taps']) ? raw['taps'] : [] },
  };
  return { ...setupOf(reading, ask, by), quick: true };
};

/** `transactions (Ledger): what:text · on:day · direction:enum[in/out]`, one a line. */
const listLines = (lists: readonly MappingList[]): string =>
  lists.map((l) => `${l.id} (${l.name}): ${l.fields.map((f) => `${f.id}:${f.type}${f.values && f.values.length > 0 ? `[${f.values.join('/')}]` : ''}`).join(' · ')}`).join('\n');

/** One model call for a first-run template, answering the checked object and the name it ran under, or the refusal. */
type Asking = (id: 'setup' | 'turn', question: string, slots: Record<string, string>) => Promise<Result<{ value: Record<string, unknown>; by: string }>>;

/**
 * THE STORE-FREE STEP FROM A SENTENCE TO A READING, which both doors take: the ask as the browser or the host handed it,
 * the two refusals that ask no model, the prompt's slots, one call through `asking`, and the answer held to the offer
 * and the words typed (`setupOf`). Who may ask, and who pays, is the caller's: `proposeSetup` holds and settles it on the
 * record's ledger, and `readSetup` leaves the count to the door that meters strangers.
 */
const setupStep = async (raw: SetupAsk, asking: Asking): Promise<Result<SetupAnswer>> => {
  const ask = setupAskOf(raw);
  const said = firstBytes(ask.said.trim(), SAID_BYTES);
  if (said === '') return no('VALUE_MALFORMED', 'Say who you are first. A blank answer has nothing to read.', { at: 'said' });
  if (ask.offer.usecases.length === 0 && ask.offer.modules.length === 0)
    return no('VALUE_MALFORMED', 'The first run offered nothing to choose from, so the model was not asked.', { at: 'offer' });
  const asked = ask.asked === undefined ? 'Nothing yet: this is their first answer, to "What do you do?".' : fenced('asked', ask.asked);
  /* A TURN IS THE SHORT ASK (`turn`): the parts by their lists' names, the topics still open, and no day. */
  if (ask.quick === true) {
    const out = await asking('turn', firstBytes(said, ASK_BYTES), {
      '%USECASES%': caseLines(ask.offer),
      '%MODULES%': partLines(ask.offer),
      '%ASKED%': asked,
      '%SAID%': fenced('said', said),
      '%OPEN%': openLines(ask.asked),
    });
    return out.ok ? ok(turnOf(out.value.value, { ...ask, said }, out.value.by)) : out;
  }
  const out = await asking('setup', firstBytes(said, ASK_BYTES), {
    '%USECASES%': caseLines(ask.offer),
    '%MODULES%': moduleLines(ask.offer),
    '%TODAY%': ask.today === '' ? 'not said' : ask.today,
    '%ASKED%': asked,
    '%SAID%': fenced('said', said),
  });
  return out.ok ? ok(setupOf(out.value.value, { ...ask, said }, out.value.by)) : out;
};

/**
 * One template asked once, with no ledger: `core.run`'s own call (`call.ts`) without the hold, the row or the route walk,
 * and with the same codes for the same faults. A model that threw is `UNREACHABLE`; a reply that is not JSON, not an
 * object or off the template's schema is `PROPOSAL_SCHEMA`, so the door can say which and fall back on the rules.
 */
const askedOnce = async (id: PromptId, slots: Record<string, string>, engine: Inference): Promise<Result<{ value: Record<string, unknown>; by: string }>> => {
  const template = PROMPTS[id];
  const named = naming(engine);
  let reply;
  try {
    reply = await named.inference.complete({
      model: template.model,
      messages: [
        { role: 'system', content: template.system },
        { role: 'user', content: fill(template.user, slots) },
      ],
      maxTokens: template.maxTokens,
      jsonSchema: template.schema,
    });
  } catch (e) {
    return no('UNREACHABLE', `The model did not answer${e instanceof Error && e.message !== '' ? `: ${e.message}` : ''}. Nothing was filed; ask again.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.text);
  } catch {
    return no('PROPOSAL_SCHEMA', 'The model did not answer with JSON. Nothing was filed; ask again.');
  }
  const fault = checkSchema(template.schema, parsed);
  if (fault) return { ok: false, refusal: fault };
  if (!isRecord(parsed)) return no('PROPOSAL_SCHEMA', 'The model did not answer with an object. Nothing was filed; ask again.');
  return ok({ value: parsed, by: named.sent() ?? template.model });
};

/**
 * THE FIRST READ, BEFORE THERE IS AN ACCOUNT: a stranger's sentence at sign-up read once through `inference`
 * and held by `setupOf`, as `proposeSetup` reads an owner's.
 *
 * NO RECORD, NO OWNER, NO LEDGER AND NO MONTH'S COUNT. There is no record yet to hold a row in or an owner to test, so the
 * door that calls this meters it (`packages/host/src/first-read.ts`: one address's reads a day, and the day's ceiling for
 * every stranger) and hands the model it pays for. Nothing here writes anywhere: the answer is what the sign-up page
 * draws, and the person's press after the mailed link is what builds.
 */
export const readSetup = (ask: SetupAsk, inference: Inference): Promise<Result<SetupAnswer>> =>
  setupStep(ask, (id, _question, slots) => askedOnce(id, slots, inference));

/**
 * The first run's two asks, over the ledger every other ask is held and settled in.
 *
 * ONE ASK EACH, COUNTED AS A QUESTION IS. Each holds a `read` row before its model is called, so the month's count and
 * `ask_cap` stop the next one as they stop a question at the palette (`asksUsed`), and a call that never reached a model
 * releases its hold. The person's own sentence is the row's `question`, as a question at the palette is; a file's
 * entries never are, only its name.
 *
 * THE OWNER ALONE, since the setup is the record's and the month's asks are theirs. Nothing here writes to the record:
 * the answer is a proposal the first run draws, and the person's one press is what writes it.
 */
export const setups = (core: Core, fallback: Inference): Setups => {
  const spent = (charge: Charge): Refusal | null => {
    const s = core.settings();
    if (s.tier !== 'a' || core.asksUsed() < s.ask_cap) return null;
    /* THE ASK TURNED AWAY LEAVES ITS ROW (`TURNED_AWAY_SQL`, model-sign-49), saying which ask it was. */
    core.turnedAway('read', s.tier, charge.purpose);
    return { code: 'SLASH_BUDGET_SPENT', fix: `Slash is out of asks until ${core.resets().slice(0, 10)}. Add your own key, or wait.` };
  };
  const owner = (ctx: CallContext): Refusal | null =>
    ctx.principal.kind === 'person' && ctx.principal.level === 'owner' ? null : { code: 'FORBIDDEN', fix: 'Only the owner of this BrainDog sets up what Slash keeps.' };

  /** Hold, ask, settle: the one path both asks take, answering the checked object or the refusal the ledger kept. */
  const asked = async (
    id: 'setup' | 'mapping' | 'turn',
    question: string,
    slots: Record<string, string>,
    inference: Inference | undefined,
    charge: Charge,
    trim?: { slot: string; lines: readonly string[] },
  ): Promise<Result<{ value: Record<string, unknown>; by: string }>> => {
    const s = core.settings();
    const template = PROMPTS[id];
    const model = s.model ?? template.model;
    const held = core.reserve('read', s.tier, model, charge);
    try {
      const named = naming(inference ?? fallback);
      const ran = await core.run({ id, slots, inference: named.inference, model, ...(trim ? { trim } : {}) });
      const by = ran.candidate !== undefined ? ran.model : (named.sent() ?? ran.model);
      core.account({
        id: held,
        kind: 'read',
        tier: s.tier,
        model: by,
        usage: ran.usage,
        ms: ran.ms,
        status: ran.out.ok ? 'ok' : 'error',
        code: refused(ran.out) ? ran.out.refusal.code : undefined,
        question,
        ...charge,
        served: ran.served,
        candidate: ran.candidate,
      });
      return ran.out.ok ? ok({ value: ran.out.value, by }) : ran.out;
    } finally {
      core.release(held);
    }
  };

  /* THE SAME STEP AS `readSetup`, between the owner's checks and the ledger's: one path from a sentence to a reading. */
  const proposeSetup = async (raw: SetupAsk, ctx: CallContext, inference?: Inference): Promise<Result<SetupAnswer>> => {
    /* THE FIRST WORDS ON THE HOUSE, ONCE (`FIRST_WORDS`): the owner's own, never a month spent, never a second time. */
    const onHouse = isRecord(raw) && raw['first'] === true && owner(ctx) === null && (core.sql.one<{ n: number }>(FIRST_WORDS_SQL)?.n ?? 0) === 0;
    const charge = onHouse ? FIRST_WORDS : PLANNED;
    const stop = owner(ctx) ?? (onHouse ? null : spent(PLANNED));
    if (stop) return { ok: false, refusal: stop };
    return setupStep(raw, (id, question, slots) => asked(id, question, slots, inference, charge));
  };

  const proposeMapping = async (raw: MappingAsk, ctx: CallContext, inference?: Inference): Promise<Result<MappingAnswer>> => {
    const stop = owner(ctx) ?? spent(ASKED);
    if (stop) return { ok: false, refusal: stop };
    const ask = mappingAskOf(raw);
    const columns = ask.columns;
    if (columns.length === 0 || ask.sample.length === 0) return no('VALUE_MALFORMED', 'The file has no columns or no entries to read.', { at: 'sample' });
    if (ask.lists.length === 0) return no('VALUE_MALFORMED', 'The first run offered no list to map the file into, so the model was not asked.', { at: 'lists' });
    /* EACH ENTRY IN ITS OWN FENCE, its values cut to a line: a file is somebody else's app's data, and a cell holding
       "ignore the above" is the case `fenced` exists for. */
    const lines = ask.sample.slice(0, SAMPLE_MOST).map((row, i) =>
      fenced(`entry-${i + 1}`, JSON.stringify(Object.fromEntries(columns.map((c) => [c, oneLine(String(row[c] ?? ''), VALUE_BYTES)])))),
    );
    const file = oneLine(ask.file, 120);
    const out = await asked(
      'mapping',
      `Read the file ${file}`,
      /* THE FILE'S NAME AND HEADINGS ARE ITS OWN TEXT TOO: one line each, and no `<` to close a fence with. */
      { '%FILE%': quoted(file), '%COLUMNS%': columns.map(quoted).join(', '), '%LISTS%': listLines(ask.lists) },
      inference,
      ASKED,
      { slot: '%SAMPLE%', lines },
    );
    return out.ok ? ok(mappingOf(out.value.value, { ...ask, columns }, out.value.by)) : out;
  };

  return { proposeSetup, proposeMapping };
};
