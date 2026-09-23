/**
 * `proposePattern`: the raw inbox's one affordance (`07 §4`, `23 §4`).
 *
 * WHAT IT IS FOR. Messages keep arriving that no declared pattern parses, and they are the same
 * message every time: one sender, one subject, one amount in one place. A person can write the
 * ingest declaration by hand, and almost nobody does. So the samples go to a model, which proposes
 * one, and the proposal lands in the review queue with its samples attached.
 *
 * THE MODEL WRITES A PATTERN AND NEVER INSTALLS ONE. Three things make that structural rather than
 * promised. The only write on `RecordApi` is `propose`, so there is no method here that could
 * install anything. `writes.confidence` is OVERWRITTEN to `needs-review` after the model has
 * answered, so a pattern Spark derived can never write a row without a person seeing it first
 * (`46 §13` D14), which is what makes `11 §9`'s injection suite pass by construction rather than by
 * detection. And every anchor is checked against the samples, so a pattern that would match
 * nothing, or match something the messages never said, is refused before anybody is asked about it.
 *
 * THE SAMPLES ARE UNTRUSTED AND ARE FENCED AS SUCH. They arrived from outside; a sample telling the
 * model to write to the vault register is the case this is shaped around, and the answer is not a
 * classifier. It is that the fence is JSON-encoded so it cannot be closed, the register has to be
 * one the projection listed, the confidence is not the model's to set, and a person decides.
 */

import { no, ok, refused, type Result } from '@braindog/ports';

import type { Core } from './call.ts';
import { anchorFault, isRecord } from './project.ts';
import { fenced } from './prompts.ts';
import { indexLines, nameIn, SPARK_CTX } from './propose.ts';
import type { CallContext, Inference, Proposal, RawPayload, RecordApi } from './types.ts';

/** `12 §5`: the register that holds credentials is not one a derived pattern may write to. */
const FORBIDDEN_REGISTERS = new Set(['grant']);

export const patterns = (
  core: Core,
  record: RecordApi,
  fallback: Inference,
): {
  proposePattern(samples: readonly RawPayload[], ctx: CallContext): Promise<Result<Proposal>>;
} => ({
  async proposePattern(samples, ctx) {
    if (samples.length === 0)
      return no('VALUE_MALFORMED', 'A pattern is proposed from the messages it has to match, and none were given.', {
        at: 'samples',
      });

    const index = await record.project({ registers: [], budget: { tokens: 400 } }, ctx);
    if (!index.ok) return index;
    const known = index.value.index.registers.filter((r) => !FORBIDDEN_REGISTERS.has(r.id));

    const callId = core.mint();
    const s = core.settings();
    /* THE ROW AND THE PROPOSAL NAME WHAT THE HOST SENT, read off the reply or the marked throw as `propose` reads it.
       `core.run` holds the template's name, so on a self-host with `SPARK_MODEL=llama3` every pattern row read
       `glm-5.3-flash` (audit fifty §4, `test/pattern-model.test.ts`). `naming` in `propose.ts` is private to that
       module, so this is the same wrapper over the same exported `nameIn`, as `answer.ts` has its own. */
    let sent: string | undefined;
    const engine: Inference = {
      complete: async (call) => {
        try {
          const reply = await fallback.complete(call);
          sent = nameIn(reply);
          return reply;
        } catch (e) {
          sent = nameIn(e);
          throw e;
        }
      },
    };
    const ran = await core.run({
      id: 'pattern',
      slots: {
        '%N%': String(samples.length),
        '%SAMPLES%': samples.map((raw) => fenced(raw.id, sampleText(raw))).join('\n'),
        '%INDEX%': indexLines(known),
      },
      inference: engine,
    });
    const used = sent ?? ran.model;

    const account = (status: 'ok' | 'refused' | 'error', code?: string, filed?: string): void =>
      core.account({
        id: callId,
        kind: 'pattern',
        tier: s.tier,
        model: used,
        usage: ran.usage,
        ms: ran.ms,
        status,
        code,
        /* THE QUESTION IS THE SHAPE AND NOT THE MESSAGE. `call` rows are read by a person auditing what
           Spark did; a sender's subject line in the audit is the payload leaking into the log. */
        read: [{ register: 'inbox_raw', rows: samples.length, predicate: 'shape' }],
        filed,
      });

    /* SETTLED THE MOMENT THE MODEL ANSWERED, as `propose.ts` settles its three sites since `538bc705`. A filing that threw
       below left no row at all, one model call and zero rows (`test/pattern-settles.test.ts` case 1); every exit below
       overwrites this one by the call's id. `RECORD_UNAVAILABLE` for `propose.ts`'s reason: the record is all that is left
       to go wrong. */
    account('error', 'RECORD_UNAVAILABLE');

    if (!ran.out.ok) {
      account('error', refused(ran.out) ? ran.out.refusal.code : 'UNREACHABLE');
      return ran.out;
    }

    const ingest = isRecord(ran.out.value['ingest']) ? { ...ran.out.value['ingest'] } : null;
    if (ingest === null) {
      account('error', 'PROPOSAL_SCHEMA');
      return no('PROPOSAL_SCHEMA', 'The model answered without an ingest body. Nothing was filed; ask again.', {
        at: 'ingest',
      });
    }

    /* THE ANCHOR CHECK IS THE CITATION RULE FOR A PATTERN (`46 §5.3` 5b). An anchor that is not in a
       sample is a fabrication, and the cost of not catching it is a declaration that silently
       matches nothing until somebody wonders why the inbox is still full. */
    const fabricated = anchorFault(ingest, samples);
    if (fabricated) {
      account('refused', fabricated.code);
      return { ok: false, refusal: fabricated };
    }

    const writes = isRecord(ingest['writes']) ? { ...ingest['writes'] } : {};
    const register = typeof writes['register'] === 'string' ? writes['register'] : '';
    if (!known.some((r) => r.id === register)) {
      account('refused', 'REGISTER_UNKNOWN');
      return no('REGISTER_UNKNOWN', `This record has no register called ${register || 'that'}, so nothing was filed.`, {
        at: 'writes.register',
        allowed: known.map((r) => r.id),
      });
    }

    /* OVERWRITTEN AND NOT VALIDATED (`46 §5.3` 5c). Reading the model's `confidence` and refusing
       `exact` would be a check that passes when the model is honest; writing the value is a check
       that passes when it is not. `on_conflict` is the same argument: a derived pattern that
       overwrites an existing row is a derived pattern that can lose one. */
    writes['confidence'] = 'needs-review';
    ingest['writes'] = writes;
    ingest['on_conflict'] = 'skip';

    const ids = samples.map((raw) => raw.id);
    const put = await record.propose(
      {
        question: `A pattern for the ${samples.length} messages nothing has parsed`,
        body_kind: 'pattern',
        body: { ingest, samples: ids },
        op_id: callId,
      },
      SPARK_CTX,
    );
    if (!put.ok) {
      account('refused', refused(put) ? put.refusal.code : undefined);
      return put;
    }

    account('ok', undefined, put.value.id);
    return ok({
      /* NO TEXT, AND THAT IS NOT AN OVERSIGHT. The review screen draws the pattern against its samples
         with the per-field hit counts the record's dry run computes; a sentence from the model about
         its own pattern would be the one part of that screen nobody could check. */
      text: '',
      citations: ids,
      verbs: ['decide', 'dismiss'],
      body_kind: 'pattern',
      body: { ingest, samples: ids },
      model: used,
      filed: put.value.id,
      read: [{ register: 'inbox_raw', rows: samples.length, predicate: 'shape' }],
    });
  },
});

/**
 * The three fields of a payload the prompt may see: who it is from, what it says it is, what it says.
 *
 * `ts`, `channel` AND THE ROW ID ARE NOT IN HERE, and the anchor check is why. Every anchor has to
 * stand verbatim in one of these three, so a field the model can read and the check cannot is a
 * field the model can copy an anchor out of and have it accepted. The id is outside the fence, as
 * the fence's own attribute, because that is how the reply is tied back to a row.
 */
const sampleText = (raw: RawPayload): string =>
  `from: ${raw.from ?? ''}\nsubject: ${raw.subject ?? ''}\n\n${raw.body}`;
