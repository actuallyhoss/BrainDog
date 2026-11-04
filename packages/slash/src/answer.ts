/**
 * `answer`: one automation's question to Slash, in the shape its rule asked for.
 *
 * WHAT IT IS FOR. A rule's `ask_slash` step parks its run and queues an `infer.ask` row: the question, filled with the
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
 * `46 §4.1` CHECK admits no kind for this and changing it is the package's first schema change (`createSlash`); every
 * count already reads `kind = 'read'` correctly for it. On his own key the row is listed with his other asks and nothing
 * caps it, as a person's read there is not capped.
 *
 * ON HIS OWN KEY THE QUESTION GOES TO HIS KEY. The host hands `answer` an adapter over the key he picked, opened in the
 * rule's name (`apps/worker/src/slash.ts` `workerSlashAnswers`), because he chose where Slash's questions go and a rule's
 * question is one of them. Installing the rule is his consent to its question being
 * asked with nobody signed in, as it always was for the included model's key.
 */

import { no, ok, refused, type Result } from '@braindog/ports';

import type { Core } from './call.ts';
import { ANSWER_SCHEMA, fenced, PROMPTS } from './prompts.ts';
import { nameIn, printValue } from './propose.ts';
import type { Ask, Inference } from './types.ts';

const SHAPES: readonly string[] = ['text', 'number', 'choice'];

/** The code a status no retry mends is answered with (`stoppedSentence`). */
const STOPPED = 'PULL_REQUEST_REFUSED';

/**
 * What a rule's question is on the ledger: an automation's ask, and one of his own.
 *
 * AN AUTOMATION'S ASK SPENDS HIS ALLOWANCE, the default taken for him: the rule is his, it asks because
 * he wrote it to, and a rule that asked on the background's count could spend the month's headlines in an afternoon.
 * Said once here and handed to the hold and to every settle; a rung no model answered is written `none` by the ledger
 * (`call.ts`, `unspent`), so the ladder's retries cost his month nothing.
 */
const CHARGE = { purpose: 'automation', spends: 'person' } as const;

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

/** What a throw out of `complete` said about a status the provider will answer again on every rung. */
type Stopped = { status: number; key: string | null };

/**
 * The host's `refused` mark on a thrown error (`SlashRefusedError`, `packages/host/src/slash.ts`), read structurally as
 * `heardIn` reads `answered`, or `null` for any other throw.
 *
 * `key` IS A NAME THE HOST WROTE, `your own key for Slash`, and never the key. Anything that is not a string is read as
 * no key at all, so a host that leaves it out gets the keyless sentence rather than a sentence with `undefined` in it.
 */
const stoppedIn = (e: unknown): Stopped | null => {
  if (typeof e !== 'object' || e === null) return null;
  const status = (e as { refused?: unknown }).refused;
  if (typeof status !== 'number' || !Number.isInteger(status)) return null;
  const key = (e as { key?: unknown }).key;
  return { status, key: typeof key === 'string' && key !== '' ? key : null };
};

/**
 * The run's sentence for a status the provider will answer the same way on the next rung.
 *
 * 401 AND 403 NAME THE KEY, because they are facts about it and the owner's next step is the keychain, which is the rule
 * `packages/kernel/src/actions.ts` `finishAction` keeps for a scheduled action's 401 ("refused the key ... with 401").
 * Every other status is named bare, since this package cannot tell a wrong model name from a wrong path, and the status
 * is what the owner can look up.
 */
const stoppedSentence = (ask: Ask, step: number, stopped: Stopped): string =>
  stopped.status === 401 || stopped.status === 403
    ? `rule.${ask.rule} asked Slash at step ${step}, and the provider refused ${stopped.key ?? 'a request that carried no key'} (${stopped.status}), so the run stopped there rather than ask it again.`
    : `rule.${ask.rule} asked Slash at step ${step}, and the provider answered ${stopped.status} with no completion, which asking again would not change, so the run stopped there.`;

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
 * THE RULE IS CHECKED BECAUSE EVERY SENTENCE NAMES IT, and the payload an older kernel queued carried no `rule`
 * at all: answered, every refusal would have read `rule.undefined`. The rest are the lint's own checks, made
 * again because a host hands this a JSON payload and not a type.
 */
const malformed = (ask: Ask): Result<{ text: string }> | null => {
  if (typeof ask.rule !== 'string' || ask.rule === '' || !Number.isInteger(ask.step) || ask.step < 0)
    return no('VALUE_MALFORMED', 'An automation\'s question names its rule and its step, and this one did not, so Slash did not answer it.', { at: 'rule' });
  const where = `rule.${ask.rule}'s question at step ${ask.step + 1}`;
  if (typeof ask.question !== 'string' || ask.question.trim() === '')
    return no('VALUE_MALFORMED', `${where} is blank, so Slash had nothing to answer.`, { at: 'question' });
  if (!SHAPES.includes(ask.shape))
    return no('VALUE_MALFORMED', `${where} asks for a ${String(ask.shape)}, and Slash answers a sentence, a number or a choice.`, {
      at: 'shape',
      allowed: SHAPES,
    });
  if (ask.shape === 'choice' && (!Array.isArray(ask.choices) || ask.choices.length === 0))
    return no('VALUE_MALFORMED', `${where} asks Slash to choose and lists no choices.`, { at: 'choices' });
  return null;
};

export const answering = (core: Core, fallback: Inference): { answer(ask: Ask, inference?: Inference): Promise<Result<{ text: string }>> } => ({
  async answer(ask, inference) {
    const bad = malformed(ask);
    if (bad) return bad;
    const step = ask.step + 1;

    const s = core.settings();
    /* THE CAP IS CHECKED HERE ON TIER `a` ONLY, as `read`'s is (`propose.ts`, `spent`). Tier `b` is his own key, whose
       asks are listed and not capped. On `byo` the host's own endpoint answers, and the host's `slashGuardedEngine`
       (`packages/host/src/slash.ts`) is what holds that tier to `ask_cap`; that guard wraps `answer` as well as `read` and
       `propose` (`packages/host/test/slash-guard-answer.test.ts`). It is not guarded here as well, because the host counts
       that tier with its own query over this same table, and a second check here would be a second copy of that count to
       drift from it. The row below carries the settings' tier so the count for its tier sees it. */
    if (s.tier === 'a' && core.asksUsed() >= s.ask_cap) {
      /* THE ASK TURNED AWAY LEAVES ITS ROW (`TURNED_AWAY_SQL`, model-sign-49). */
      core.turnedAway('read', s.tier, CHARGE.purpose);
      return no(
        'SLASH_BUDGET_SPENT',
        `rule.${ask.rule} asked Slash at step ${step}, and this month's Slash questions are used until ${firstOf(core.resets())}. Raise the monthly limit, or wait.`,
      );
    }

    /* NO `await` BETWEEN THE CHECK AND THE HOLD, for `read`'s reason: the hold is what the next ask's count includes, so
       ten answers sent together at a cap of two make two model calls (`test/answer.test.ts`, case 3). */
    const held = core.reserve('read', s.tier, PROMPTS.answer.model, CHARGE);
    try {
      /* THE MODEL THE HOST HANDS IN FOR THIS JOB, keyed in the rule's name: his own key where he chose it, and otherwise the
         host's. With none handed in, the host's model this engine was built on. */
      const engine = inference ?? fallback;
      /* THE PROVIDER'S OWN WORDS ARE KEPT for the one sentence that needs them. `core.run` folds them into a sentence
         written for a person at the palette ("ask again"), and a host retrying on the outbox's ladder wants the status. */
      let lost = '';
      /* AND WHETHER THE MODEL WAS REACHED, read off the same throw. `core.run` calls every throw `UNREACHABLE`, and the
         host marks the ones that came after its endpoint answered (`SlashAnsweredError`, `packages/host/src/slash.ts`). It
         is read here and not in `core.run` because this is the one caller that settles `UNREACHABLE` under `-`: `read`'s
         and `propose`'s rows already keep the model's name whichever way the call went. */
      let heard: Heard | null = null;
      /* AND WHETHER THE PROVIDER ANSWERED A STATUS NO RETRY MENDS (`stoppedIn`), and whether the host sent anything at all.
         Both are read off the same throw as `heard`, for the same reason. */
      let stopped: Stopped | null = null;
      let unsent = false;
      /* AND WHETHER THE HOST SAYS ITS MODEL WAS CALLED AND THEN THREW, `reached: true` on the throw. That is a call a
         platform may have billed and one `read` already settles under the model's name, so it is settled here the same
         way (see `account` below). A throw without the mark is still a model not reached. */
      let touched = false;
      /* AND THE NAME THE HOST SENT, off a reply that came back. `core.run` keeps the template's (`nameIn`). */
      let sent: string | undefined;
      /* EACH CALL STARTS WITH NO MARKS, so a route's walk leaves the last attempt's: a provider candidate's 401
         after the included model threw is read as that 401, and under the provider's own name. `core.run` hands each
         candidate's own wire through `watch`. */
      const watch = (wire: Inference): Inference => ({
        complete: async (call) => {
          lost = '';
          heard = null;
          stopped = null;
          unsent = false;
          touched = false;
          sent = undefined;
          try {
            const reply = await wire.complete(call);
            sent = nameIn(reply);
            return reply;
          } catch (e) {
            lost = e instanceof Error ? e.message : String(e);
            heard = heardIn(e);
            stopped = stoppedIn(e);
            unsent = typeof e === 'object' && e !== null && (e as { sent?: unknown }).sent === false;
            touched = typeof e === 'object' && e !== null && (e as { reached?: unknown }).reached === true;
            throw e;
          }
        },
      });
      const watched = watch(engine);

      const ran = await core.run({
        id: 'answer',
        slots: { '%QUESTION%': encoded(ask.question.trim()), '%SHAPE%': shapeLine(ask) },
        inference: watched,
        watch,
        schema: answerSchema(ask),
        /* THE FIELDS COME OFF THE END WHEN THE PROMPT IS OVER ITS CAP, and the question never does. */
        trim: { slot: '%ABOUT%', lines: Object.entries(ask.about ?? {}).map(([field, value]) => fenced(field, printValue(value))) },
      });

      /* `rule.<id> step <n>` AND NEVER THE QUESTION. The kernel filled the question with the run's row, and `46 §4.1`
         keeps a row's values out of this ledger; the rule and the step are what a person reading it can look up. */
      /* A MODEL NOT REACHED IS SETTLED UNDER `-`, THE LEDGER'S MARK FOR A ROW THAT CALLED NOTHING, and every count passes
         over it: the tier `a` count here (`asksUsed`), his own key's list, and the host's for `byo`. Settled under the model's name,
         three `ECONNREFUSED` answers were measured at `ask_cap: 3` leave the
         fourth `SLASH_BUDGET_SPENT` on tiers `a` and `b`, and the host asks an `UNREACHABLE` again up to the ladder's
         eighth rung. The row stays, so an outage is still in the ledger. `PROPOSAL_SCHEMA` keeps the model's name,
         because there the model did answer and was paid for. */
      /* AND A MODEL THAT ANSWERED WITH WHAT THE HOST COULD NOT READ KEEPS ITS NAME, with the provider's own count where
         the body held one. A probe measured the self-host serve four
         completions of 16,000 tokens each for one question, the ledger holding four rows under `-` with `tokens_out` 0,
         and `ask_cap` seeing none of them. */
      /* THE CASTS ARE FOR THE COMPILER, which narrows both to their first value here because it cannot see the closure
         assign them. */
      const reached = heard as Heard | null;
      const refusedBy = stopped as Stopped | null;
      /* A CANDIDATE ON ITS OWN WIRE IS NAMED AS THE WALK RAN IT, `ran.model`. */
      const used = ran.candidate !== undefined ? ran.model : ((sent as string | undefined) ?? reached?.model ?? ran.model);
      /* ONE BINDING THROW HAD TWO PRICES UNTIL THIS LINE. Measured:
         the Worker's included model threw after `AI.run` was called, and a person's read settled it under
         `glm-5.3-flash`, priced 9 neurons on the prompt estimate and counted, while this path settled the same throw
         under `-`, priced 0 and uncounted, and the host's ladder asked it again up to the eighth rung with nobody
         counting what the platform may have billed on each. A throw the host marks `reached` is now settled as `read`
         settles it, under the model's name, so the operator's ceiling sees each rung's neurons. HIS MONTH'S CAP DOES NOT,
         since store version 3: the row is an `UNREACHABLE`, the ledger writes it as spending nothing, and a binding
         that threw is a retry and not one of his asks ("a non-2xx status from the model is retried and not counted"). */
      const unreached = (code: string | undefined): boolean => (code === 'UNREACHABLE' && !(touched as boolean)) || code === STOPPED;
      const account = (status: 'ok' | 'error', code?: string): void =>
        core.account({
          id: held,
          kind: 'read',
          tier: s.tier,
          /* `PULL_REQUEST_REFUSED` IS UNDER `-` TOO, for `UNREACHABLE`'s reason: the provider served no completion, so
             no count may read the row, and it stays so a refusal is still in the ledger. */
          model: unreached(code) ? '-' : used,
          usage: reached?.usage ?? ran.usage,
          ms: ran.ms,
          status,
          code,
          question: `rule.${ask.rule} step ${step}`,
          candidate: ran.candidate,
          raw: ran.raw,
          ...CHARGE,
        });

      if (!ran.out.ok) {
        const code = refused(ran.out) ? ran.out.refusal.code : 'UNREACHABLE';
        /* NOTHING WAS SENT, SO NOTHING IS WRITTEN: the host found its key would not open before any request left
           (`SlashKeyClosedError`, which only a host that asked for `keyRequired` throws). Returning here leaves the hold
           to `finally`, whose `release` deletes it, so the ledger reads as it does for a record with no key at all
           (`46 §5.2`). `FORBIDDEN` AND NOT `UNREACHABLE`, because the next rung would find the same key closed and open
           the keychain again for nothing. The sentence is the host's, since this package cannot say what the host's keychain is
           called; each host answers its own over it on his own key (`apps/worker/src/slash.ts`, `apps/selfhost/src/slash.ts`). */
        if (code === 'UNREACHABLE' && (unsent as boolean))
          return no('FORBIDDEN', `rule.${ask.rule} asked Slash at step ${step}: ${sentence(lost)}`, { at: 'grant' });
        /* A STATUS NO RETRY MENDS ENDS THE RUN, UNCOUNTED. Measured before it:
           a 400, a 401 and a 404 each asked eight times over about four hours on the owner's key, ending "could not be
           reached" about a provider that answered every time. Any code but `UNREACHABLE` is one `serveAsks` acks `done`.
           `PULL_REQUEST_REFUSED` IS BORROWED, from the family whose row in `30 §6` reads "a 4xx the declaration did not
           expect", which is what the kernel's own `finishAction` answers for a scheduled `call`'s 4xx; a code of Slash's
           own is an amendment to `30 §6`, `REFUSAL_CODES` and a fixture, and none of those is this file. */
        if (code === 'UNREACHABLE' && refusedBy !== null) {
          account('error', STOPPED);
          return no(STOPPED, stoppedSentence(ask, step, refusedBy));
        }
        /* `ANSWER_UNREADABLE`, A CODE OF ITS OWN IN `30 §6`, where an earlier build borrowed `PROPOSAL_SCHEMA`. That code is
           output that was read and failed its schema, and a caller branching on it would look at the question's shape
           for a fault that is in the size or the framing of the reply: the host never got as far as the schema. Any code
           but `UNREACHABLE` is one `serveAsks` acks `done`, so the run stops on this sentence and the ladder does not ask
           the same model again. */
        if (code === 'UNREACHABLE' && reached !== null) {
          account('error', 'ANSWER_UNREADABLE');
          return no(
            'ANSWER_UNREADABLE',
            `rule.${ask.rule} asked Slash at step ${step}, and the model answered with something Slash could not read: ${sentence(lost)} The run stopped there rather than ask it again.`,
            { at: 'answer' },
          );
        }
        account('error', code);
        /* `sentence` AND NOT A FULL STOP OF OUR OWN, because the host's status throw ends in one: a 503 read "answered
           503.." as the run's error once a status became a plain throw again (`test/slash-status-retried.test.ts`). */
        if (code === 'UNREACHABLE')
          return no('UNREACHABLE', `rule.${ask.rule} asked Slash at step ${step}, and the model did not answer${lost === '' ? '.' : `: ${sentence(lost)}`}`);
        return no('PROPOSAL_SCHEMA', `Slash's answer to rule.${ask.rule} at step ${step} was not ${wanted(ask)}, so the run stopped there.`, {
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
        return no('PROPOSAL_SCHEMA', `Slash's answer to rule.${ask.rule} at step ${step} was blank, so the run stopped there.`, { at: 'answer' });
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
