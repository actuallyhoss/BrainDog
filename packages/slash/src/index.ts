/**
 * `@braindog/slash`: the assistant's engine.
 *
 * WHAT IT DOES, AND THE ONE THING IT REFUSES. It answers the palette's fallback row in two passes,
 * it proposes an ingest pattern for messages nothing parsed, it answers an automation's `ask_slash`
 * question in the shape the rule asked for, and it keeps the settings and the meter behind those.
 * It does not write a row: its only write is `record.propose`, its actor is `slash`, and `30 §3`'s
 * query over the event log (`actor = 'slash' AND kind NOT IN ('suggest', 'propose', 'predict')`)
 * is empty by construction rather than by policy.
 *
 * THREE BOUNDARIES, EACH STRUCTURAL RATHER THAN POLICED (`46 §1`):
 *
 *   1 · The ports are `{ Sql, Clock, Inference }`. No `Http`, no `Dispatch`, no `KeyStore`, so this
 *       package cannot fetch a URL, send a mail or unwrap a key. There is no third thing to reach.
 *   2 · The record is read through `project()` alone, whose `secret` fields are already labels
 *       (`30 §9` rule 3), and `grant` is dropped from any register list before the call.
 *   3 · It never sees a credential, the customer's own model key included. Tier B is an `Inference`
 *       adapter the HOST builds after opening the grant under the asker's session; what arrives
 *       here is an object with a `complete()` method and nothing else.
 *
 * WHAT IS BUILT HERE AND WHAT IS NOT. `46 §2` describes eleven methods; this is five of them, the
 * five the interface audits agree on, and `answer`, which `46 §2` does not name and
 * `loop/research-infer-ask.md` §4 does. `triage`, `digestProse`, `embed` and `analyseDraft` have no
 * caller in this tree yet, and `AUDIT-interface-B` IB-60 is explicit that tier A `triage` has no
 * dispatcher at all: no outbox kind carries it and no record step calls it. The tier C dispatcher
 * (`jobs`) is the other half, and it waits on the record's six JOBS methods, which do not exist
 * either. `shapeOf` IS here, because it is the deterministic half of triage and needs no model:
 * `24 §4.3` groups unmatched arrivals on exactly that string, and `46 §13` D15 fixes it as code's
 * and never the model's.
 *
 * HOW A HOST LOADS IT. `SLASH_ENDPOINT` unset means the host never imports this package, registers
 * no route, and answers `{ version, slash: false }` (`46 §13` D4). Absence is the default and
 * presence is proven, which is why nothing here reads an environment variable: the decision is the
 * host's, one level up, where it can be made without loading the module it is about. An erasure is
 * the one other reason to load it, and a host does so only where Slash's ledger exists to erase
 * from (`eraseSlash`, `erase.ts`).
 */

import { no, ok, type Result } from '@braindog/ports';

import { answering } from './answer.ts';
import { core as makeCore, openStore, TIERS } from './call.ts';
import { patterns } from './jobs.ts';
import { palette } from './propose.ts';
import type { CallContext, Settings, Slash, SlashDeps, Status, Tier } from './types.ts';

export { eraseSlash } from './erase.ts';
export { STORE_VERSION } from './call.ts';
export { cite, citable, shapeOf, tokens } from './project.ts';
export { answerSchema } from './answer.ts';
export { ANSWER_SYSTEM, MODELS, PROMPTS, SYSTEM } from './prompts.ts';
export type { ModelId, ModelRate, PromptId, PromptTemplate } from './prompts.ts';
export type {
  Ask,
  CallContext,
  Citable,
  Inference,
  InferenceCall,
  InferenceReply,
  Principal,
  Projection,
  ProjectionRegister,
  ProjectionRow,
  ProjectQuery,
  Proposal,
  RawPayload,
  ReadTrace,
  Reading,
  RecordApi,
  Settings,
  Slash,
  SlashDeps,
  Status,
  Tier,
  Verb,
  Where,
} from './types.ts';
export { VERBS } from './types.ts';

/**
 * What a host says about its own money and its own models, beside the ports.
 *
 * `priced` NAMES THE TIERS WHOSE CALLS THE HOST PAYS FOR IN NEURONS, and the ledger prices those rows and no others.
 * Unset is `['a']`, which is `46 §4.1`: a customer's key and a self-host endpoint are billed by whoever owns them. The
 * package cannot see that for itself, because what answers tier `byo` is whatever `SlashDeps.inference` is, and on the
 * Worker with no endpoint that is Workers AI on the operator's account (`loop/research-batch-sixty-audit.md` finding 4).
 *
 * `tiers` NAMES THE TIERS THE HOST RUNS AT ALL, and unset is all three. A tier outside it is refused at `configure`, and
 * one already stored is read as `a`, the included model, with the row left as it was saved (`call.ts` `settings`). The
 * Worker names `a` and `b`: `byo` asks the host's endpoint for a model the owner typed, and on the Cloud there is no
 * endpoint of the owner's to ask (C15 in `loop/finish/agents.md`, until the own-key choice replaces the three tiers).
 *
 * Arguments and not fields of `SlashDeps` because `SlashDeps` is the ports, and neither of these is a port.
 */
export type SlashOptions = { priced?: readonly Tier[] | undefined; tiers?: readonly Tier[] | undefined };

/** Each tier as a sentence names it, for the refusal that lists the ones a host runs. */
const TIER_NAMED: Record<Tier, string> = { a: 'the included model', b: 'your own key', byo: 'your own endpoint' };

/** `the included model, your own key, or your own endpoint`, for however many a host runs. */
const namedTiers = (tiers: readonly Tier[]): string => {
  const names = tiers.map((t) => TIER_NAMED[t]);
  const last = names.pop();
  if (last === undefined) return 'no model';
  if (names.length === 0) return last;
  return `${names.join(', ')}${names.length > 1 ? ',' : ''} or ${last}`;
};

/**
 * A grant id and not a key: `g_` and a 26-character ULID (`34 §4`).
 *
 * THIS IS THE ONLY DOOR A CREDENTIAL COULD WALK IN THROUGH, so it is the one place that checks. An
 * owner configuring tier B names a grant the record's vault already holds; an owner who pastes the
 * key itself into that box has handed a plaintext to a package whose entire boundary argument is
 * that it never holds one, and it would then sit in Slash's own SQLite, in a column called
 * `grant_id`, until somebody exported the database. The shape is cheap to check and the failure
 * mode is not recoverable, which is the whole test for whether a check earns its line.
 */
const GRANT_ID = /^g_[0-9A-HJKMNP-TV-Z]{26}$/u;

/**
 * Build a Slash over one record's storage.
 *
 * `46 §7`: under 5 ms and no network. It is called on the cold path of a Durable Object, so anything
 * expensive here is latency on the first ask of the day, which is why `openStore` reads two rows and
 * opens no transaction on a store already at its version.
 *
 * THE MONTH IS UTC AND THE SPEC SAYS THE RECORD'S TIME ZONE. The zone lives on the record and this
 * package's `RecordApi` has no method that answers it; inventing one to make a meter roll over at
 * local midnight would be an edge added for a cosmetic difference of a few hours on one day a
 * month. It is written down here rather than left as a silent assumption, and it is the line to
 * change when `project` grows a way to ask.
 */
export function createSlash(deps: SlashDeps, options: SlashOptions = {}): Slash {
  /* NO PRAGMA, BECAUSE A DURABLE OBJECT REFUSES IT. Measured in workerd on 22 September: `PRAGMA user_version = 1` threw
     `not authorized: SQLITE_AUTH` out of the object's authorizer, so on the Worker every ask answered 500 before a model
     was called (`apps/worker/test/slash-in-do.test.ts`), until the statement was wrapped. The store's version is a row
     now (`STORE_VERSION`, `slash_meta`), so nothing here asks the pragma at all. */
  openStore(deps.sql);
  deps.sql.exec(
    'INSERT OR IGNORE INTO slash_settings (singleton, tier, model, grant_id, ask_cap, updated_at) VALUES (1, ?, NULL, NULL, ?, ?)',
    'a',
    80,
    new Date(deps.clock.now()).toISOString(),
  );

  const tiers = options.tiers ?? TIERS;
  const core = makeCore(deps.sql, deps.clock, deps.inference, options.priced, tiers);
  const asking = palette(core, deps.record, deps.inference);
  const pattern = patterns(core, deps.record, deps.inference);
  const automation = answering(core, deps.inference);

  const status = (): Status => {
    const s = core.settings();
    return {
      tier: s.tier,
      /* ON TIER `a` THE ROUTING TABLE DECIDES AND `settings.model` IS NULL, so the name a person is
         shown is the model that would actually answer their next ask rather than an empty box. */
      model: s.tier === 'a' ? 'glm-5.3-flash' : (s.model ?? 'glm-5.3-flash'),
      asks: { used: core.asksUsed(), cap: s.ask_cap, resets: core.resets() },
    };
  };

  const configure = (
    patch: Partial<Pick<Settings, 'tier' | 'model' | 'grant_id' | 'ask_cap'>>,
    ctx: CallContext,
  ): Result<Settings> => {
    /* THE OWNER AND NOBODY ELSE (`46 §5.2`). Switching tiers spends somebody's money and names a
       vault grant; a member with `write` on one register is not the person who decides either. */
    if (ctx.principal.kind !== 'person' || ctx.principal.level !== 'owner')
      return no('FORBIDDEN', 'Only the record owner changes how Slash is set up.');

    const before = core.settings();
    const tier = patch.tier ?? before.tier;
    if (!tiers.includes(tier))
      return no('ENUM_VALUE_UNKNOWN', `Slash runs on ${namedTiers(tiers)} on this host.`, {
        at: 'tier',
        allowed: tiers,
      });

    const askCap = patch.ask_cap ?? before.ask_cap;
    if (!Number.isInteger(askCap) || askCap < 0)
      return no('VALUE_MALFORMED', 'The monthly ask limit is a whole number of asks, and zero turns Slash off.', {
        at: 'ask_cap',
      });

    const grant = patch.grant_id === undefined ? before.grant_id : patch.grant_id;
    if (grant !== null && !GRANT_ID.test(grant))
      return no('VALUE_MALFORMED', 'That is not a grant id. Put the key in the vault first, then name the grant here.', {
        at: 'grant_id',
      });
    if (tier === 'b' && grant === null)
      return no('VALUE_MALFORMED', 'Tier B answers with your own key, so it needs the vault grant that holds one.', {
        at: 'grant_id',
      });

    const model = patch.model === undefined ? before.model : patch.model;
    if (tier !== 'a' && (model === null || model.trim() === ''))
      return no('VALUE_MALFORMED', 'Name the model your key or your endpoint answers with.', { at: 'model' });

    const after: Settings = {
      tier,
      /* TIER `a` HAS NO MODEL OF ITS OWN (`46 §4.1`): the routing table decides per job, so a name
         left behind from a previous tier would be a setting that reads as though it were in force. */
      model: tier === 'a' ? null : model,
      grant_id: grant,
      ask_cap: askCap,
      updated_at: core.now(),
    };
    deps.sql.exec(
      'UPDATE slash_settings SET tier = ?, model = ?, grant_id = ?, ask_cap = ?, updated_at = ? WHERE singleton = 1',
      after.tier,
      after.model,
      after.grant_id,
      after.ask_cap,
      after.updated_at,
    );
    return ok(after);
  };

  return {
    read: asking.read,
    propose: asking.propose,
    proposePattern: pattern.proposePattern,
    answer: automation.answer,
    configure,
    status,
  };
}
