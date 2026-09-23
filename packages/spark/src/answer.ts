/**
 * `answer`: one automation's question to Spark, in the shape its rule asked for (`loop/research-infer-ask.md` §4).
 *
 * WHAT IT IS FOR. A rule's `ask_spark` step parks its run and queues an `infer.ask` row: the question, filled with the
 * run's row; the shape (`text`, `number` or `choice`); and the `about:` fields the rule named. A host leases the row, hands
 * it here, and acks with the text this returns, and the kernel's `answerStep` holds that text to the shape again before
 * the run carries on. This package is the model call and the meter between those two ends, and nothing else.
 *
 * NO PROJECTION AND NO CITATION. The palette reads the record through `project` and has every figure pinned to a row by
 * `cite`; here the kernel has already chosen the fields, with no `secret` or `file` among them (`UNSENDABLE`), and the
 * answer is a value a rule's next step compares, so there is nothing to cite and nothing to read. `RecordApi` is not
 * handed in, which is how "reads nothing from the record" is kept by construction rather than by a test alone.
 *
 * METERED AS A PERSON'S READ IS. Owner question 2's default (§5): one ask per model call, on the one `ask_cap`, so a
 * clock rule spends the same allowance a person does and stops at the same line. The row is `kind = 'read'` because the
 * `46 §4.1` CHECK admits no kind for this and changing it is the package's first schema change (`createSpark`); every
 * count already reads `kind = 'read'` correctly for it, and the host's tier `b` exemption for a stored draft asks
 * `predicate IS NOT NULL`, which this row never is.
 */

import { no, ok, refused, type Result } from '@braindog/ports';

import type { Core } from './call.ts';
import { ANSWER_SCHEMA, fenced, PROMPTS } from './prompts.ts';
import { printValue } from './propose.ts';
import type { Ask, Inference } from './types.ts';

const SHAPES: readonly string[] = ['text', 'number', 'choice'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `2026-12-01T00:00:00.000Z` as `1 December`, the way the run's sentence says it (§4's table). */
const firstOf = (iso: string): string => `1 ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(0, 10)}`;

/** JSON-encoded, with `<` escaped as `fenced` escapes it, so nothing in it can close a fence or start a line. */
const encoded = (text: string): string => JSON.stringify(text).replaceAll('<', '\\u003c');

/**
 * The result schema for one ask: `ANSWER_SCHEMA` with `answer` typed by the shape.
 *
 * A CHOICE IS AN ENUM AND THE ENDPOINT ENFORCES IT. `endpointInference` sends this with `strict: true`, and `checkSchema`
 * reads the same object when the reply lands, so "maybe" to a rule that offered `urgent` or `can wait` is refused here
 * as `PROPOSAL_SCHEMA` and not first discovered by the kernel.
 */
export const answerSchema = (ask: Pick<Ask, 'shape' | 'choices'>): object => ({
  ...ANSWER_SCHEMA,
  properties: {
    answer:
      ask.shape === 'number'
        ? { type: 'number' }
        : ask.shape === 'choice'
          ? { type: 'string', enum: [...(ask.choices ?? [])] }
          : { type: 'string' },
  },
});

/** What a throw out of `complete` said about the model: it was reached, and what it reported spending, if anything. */
type Heard = { usage: { in: number; out: number } | undefined; model: string | undefined };

const count = (value: unknown): number | undefined => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined);

/**
 * The name the host says it sent the model under, read structurally off its reply or its throw, or nothing.
 *
 * THE PACKAGE ASKS BY ROUTING NAME AND THE HOST MAPS IT, so the name `core.run` holds is the template's and not what ran.
 * Measured on 23 September through the self-host with `SPARK_MODEL=llama3`: every `answer` row read `glm-5.3-flash`.
 * The host's `endpointInference` now says `model` on both (`packages/host/src/spark.ts`); an adapter that says nothing
 * keeps the template's name, which is what every row carried before.
 */
const nameIn = (source: unknown): string | undefined => {
  const model = typeof source === 'object' && source !== null ? (source as { model?: unknown }).model : undefined;
  return typeof model === 'string' && model.trim() !== '' ? model : undefined;
};

/**
 * The host's `answered: true` mark on a thrown error, read structurally, or `null` for a model not reached.
 *
 * THE COUNT IS TAKEN ONLY WHOLE. A `usage` with one number missing or not a count is dropped for the prompt estimate
 * `core.run` already made, because `tokens_in` and `tokens_out` are `INTEGER NOT NULL` and a half-read count billed as
 * zero would under-bill the half nobody reported.
 */
const heardIn = (e: unknown): Heard | null => {
  if (typeof e !== 'object' || e === null || (e as { answered?: unknown }).answered !== true) return null;
  const model = nameIn(e);
  const usage = (e as { usage?: unknown }).usage;
  if (typeof usage !== 'object' || usage === null) return { usage: undefined, model };
  const tin = count((usage as { in?: unknown }).in);
  const tout = count((usage as { out?: unknown }).out);
  return { usage: tin === undefined || tout === undefined ? undefined : { in: tin, out: tout }, model };
};

/** The provider's sentence, ending in one full stop, so the run's sentence can carry on after it. */
const sentence = (said: string): string => (said === '' ? 'it gave no reason.' : /[.!?]$/u.test(said) ? said : `${said}.`);

const shapeLine = (ask: Ask): string =>
  ask.shape === 'number'
    ? 'a number in "answer", written as a JSON number: no unit, no currency sign, no words.'
    : ask.shape === 'choice'
      ? `exactly one of these choices in "answer", copied as written: ${encoded(JSON.stringify(ask.choices ?? []))}`
      : 'one plain sentence of at most three hundred characters in "answer".';

/**
 * An ask the kernel could not have sent, refused before anything is held or called.
 *
 * THE RULE IS CHECKED BECAUSE EVERY SENTENCE NAMES IT, and the payload the kernel queued before Brief A carried no `rule`
 * at all (§3 item 9): answered, every refusal would have read `rule.undefined`. The rest are the lint's own checks, made
 * again because a host hands this a JSON payload and not a type.
 */
const malformed = (ask: Ask): Result<{ text: string }> | null => {
  if (typeof ask.rule !== 'string' || ask.rule === '' || !Number.isInteger(ask.step) || ask.step < 0)
    return no('VALUE_MALFORMED', 'An automation\'s question names its rule and its step, and this one did not, so Spark did not answer it.', { at: 'rule' });
  const where = `rule.${ask.rule}'s question at step ${ask.step + 1}`;
  if (typeof ask.question !== 'string' || ask.question.trim() === '')
    return no('VALUE_MALFORMED', `${where} is blank, so Spark had nothing to answer.`, { at: 'question' });
  if (!SHAPES.includes(ask.shape))
    return no('VALUE_MALFORMED', `${where} asks for a ${String(ask.shape)}, and Spark answers a sentence, a number or a choice.`, {
      at: 'shape',
      allowed: SHAPES,
    });
  if (ask.shape === 'choice' && (!Array.isArray(ask.choices) || ask.choices.length === 0))
    return no('VALUE_MALFORMED', `${where} asks Spark to choose and lists no choices.`, { at: 'choices' });
  return null;
};

export const answering = (core: Core, fallback: Inference): { answer(ask: Ask, inference?: Inference): Promise<Result<{ text: string }>> } => ({
  async answer(ask, inference) {
    const bad = malformed(ask);
    if (bad) return bad;
    const step = ask.step + 1;

    const s = core.settings();
    /* THE CAP IS CHECKED HERE ON TIER `a` ONLY, as `read`'s is (`propose.ts`, `spent`). On `b` and `byo` this package
       does not refuse on the count at all: the host's model answers there too, and the host's `sparkGuardedEngine`
       (`packages/host/src/spark.ts`) is what holds those tiers to `ask_cap`. That guard names `read` and `propose` and
       not this method, so until it names `answer` (Brief C, in `packages/host`) an automation on `b` or `byo` is
       unbounded. It is not guarded here as well, because the host counts those tiers with its own query over this same
       table, and a second check here would be a second copy of that count to drift from it. The row below carries the
       settings' tier so that guard's `kind = 'read' AND tier IN ('b', 'byo')` count already sees it. */
    if (s.tier === 'a' && core.asksUsed() >= s.ask_cap)
      return no(
        'SPARK_BUDGET_SPENT',
        `rule.${ask.rule} asked Spark at step ${step}, and this month's asks are spent until ${firstOf(core.resets())}. Raise the monthly limit, or wait.`,
      );

    /* NO `await` BETWEEN THE CHECK AND THE HOLD, for `read`'s reason: the hold is what the next ask's count includes, so
       ten answers sent together at a cap of two make two model calls (`test/answer.test.ts`, case 3). */
    const held = core.reserve('read', s.tier, PROMPTS.answer.model);
    try {
      /* THE HOST'S MODEL ON EVERY TIER, never tier `b`'s own key (owner question 4's default): the adapter handed in is
         keyed in the rule's name, and a rule nobody is signed in to has no session to open the owner's key under. */
      const engine = inference ?? fallback;
      /* THE PROVIDER'S OWN WORDS ARE KEPT for the one sentence that needs them. `core.run` folds them into a sentence
         written for a person at the palette ("ask again"), and a host retrying on the outbox's ladder wants the status. */
      let lost = '';
      /* AND WHETHER THE MODEL WAS REACHED, read off the same throw. `core.run` calls every throw `UNREACHABLE`, and the
         host marks the ones that came after its endpoint answered (`SparkAnsweredError`, `packages/host/src/spark.ts`). It
         is read here and not in `core.run` because this is the one caller that settles `UNREACHABLE` under `-`: `read`'s
         and `propose`'s rows already keep the model's name whichever way the call went. */
      let heard: Heard | null = null;
      /* AND THE NAME THE HOST SENT, off a reply that came back. `core.run` keeps the template's (`nameIn`). */
      let sent: string | undefined;
      const watched: Inference = {
        complete: async (call) => {
          try {
            const reply = await engine.complete(call);
            sent = nameIn(reply);
            return reply;
          } catch (e) {
            lost = e instanceof Error ? e.message : String(e);
            heard = heardIn(e);
            throw e;
          }
        },
      };

      const ran = await core.run({
        id: 'answer',
        slots: { '%QUESTION%': encoded(ask.question.trim()), '%SHAPE%': shapeLine(ask) },
        inference: watched,
        schema: answerSchema(ask),
        /* THE FIELDS COME OFF THE END WHEN THE PROMPT IS OVER ITS CAP, and the question never does. */
        trim: { slot: '%ABOUT%', lines: Object.entries(ask.about ?? {}).map(([field, value]) => fenced(field, printValue(value))) },
      });

      /* `rule.<id> step <n>` AND NEVER THE QUESTION. The kernel filled the question with the run's row, and `46 §4.1`
         keeps a row's values out of this ledger; the rule and the step are what a person reading it can look up. */
      /* A MODEL NOT REACHED IS SETTLED UNDER `-`, THE LEDGER'S MARK FOR A ROW THAT CALLED NOTHING, and both counts pass
         over it: the tier `a` count here (`asksUsed`) and the host's for `b` and `byo`. Settled under the model's name,
         `loop/research-batch-forty-two-audit.md` finding 6 measured three `ECONNREFUSED` answers at `ask_cap: 3` leave the
         fourth `SPARK_BUDGET_SPENT` on tiers `a` and `b`, and the host asks an `UNREACHABLE` again up to the ladder's
         eighth rung. The row stays, so an outage is still in the ledger. `PROPOSAL_SCHEMA` keeps the model's name,
         because there the model did answer and was paid for. */
      /* AND A MODEL THAT ANSWERED WITH WHAT THE HOST COULD NOT READ KEEPS ITS NAME, with the provider's own count where
         the body held one. `loop/research-batch-forty-six-audit.md` finding 4 measured the self-host serve four
         completions of 16,000 tokens each for one question, the ledger holding four rows under `-` with `tokens_out` 0,
         and `ask_cap` seeing none of them. */
      /* THE CASTS ARE FOR THE COMPILER, which narrows both to their first value here because it cannot see the closure
         assign them. */
      const reached = heard as Heard | null;
      const used = (sent as string | undefined) ?? reached?.model ?? ran.model;
      const account = (status: 'ok' | 'error', code?: string): void =>
        core.account({
          id: held,
          kind: 'read',
          tier: s.tier,
          model: code === 'UNREACHABLE' ? '-' : used,
          usage: reached?.usage ?? ran.usage,
          ms: ran.ms,
          status,
          code,
          question: `rule.${ask.rule} step ${step}`,
        });

      if (!ran.out.ok) {
        const code = refused(ran.out) ? ran.out.refusal.code : 'UNREACHABLE';
        /* `ANSWER_UNREADABLE`, A CODE OF ITS OWN IN `30 §6`, where wave 47 borrowed `PROPOSAL_SCHEMA`. That code is
           output that was read and failed its schema, and a caller branching on it would look at the question's shape
           for a fault that is in the size or the framing of the reply: the host never got as far as the schema. Any code
           but `UNREACHABLE` is one `serveAsks` acks `done`, so the run stops on this sentence and the ladder does not ask
           the same model again. */
        if (code === 'UNREACHABLE' && reached !== null) {
          account('error', 'ANSWER_UNREADABLE');
          return no(
            'ANSWER_UNREADABLE',
            `rule.${ask.rule} asked Spark at step ${step}, and the model answered with something Spark could not read: ${sentence(lost)} The run stopped there rather than ask it again.`,
            { at: 'answer' },
          );
        }
        account('error', code);
        /* `sentence` AND NOT A FULL STOP OF OUR OWN, because the host's status throw ends in one: a 503 read "answered
           503.." as the run's error once Q8's default made it a plain throw again (`test/spark-status-retried.test.ts`). */
        if (code === 'UNREACHABLE')
          return no('UNREACHABLE', `rule.${ask.rule} asked Spark at step ${step}, and the model did not answer${lost === '' ? '.' : `: ${sentence(lost)}`}`);
        return no('PROPOSAL_SCHEMA', `Spark's answer to rule.${ask.rule} at step ${step} was not ${wanted(ask)}, so the run stopped there.`, {
          at: 'answer',
          ...(ask.shape === 'choice' ? { allowed: [...(ask.choices ?? [])] } : {}),
        });
      }

      const said = ran.out.value['answer'];
      const text = typeof said === 'number' ? String(said) : String(said).trim();
      /* AN EMPTY SENTENCE PASSES THE SCHEMA AND ANSWERS NOTHING. Sent on, `ack` hands `''` to `answerStep` as a string,
         which holds only `number` and `choice` to a shape, so a `text` step would carry the run on with an empty value
         in `vars` and the rule's next step would act on it. */
      if (text === '') {
        account('error', 'PROPOSAL_SCHEMA');
        return no('PROPOSAL_SCHEMA', `Spark's answer to rule.${ask.rule} at step ${step} was blank, so the run stopped there.`, { at: 'answer' });
      }
      account('ok');
      return ok({ text });
    } finally {
      core.release(held);
    }
  },
});

const wanted = (ask: Ask): string =>
  ask.shape === 'number' ? 'the number it asked for' : ask.shape === 'choice' ? `one of ${(ask.choices ?? []).join(', ')}` : 'a sentence';
