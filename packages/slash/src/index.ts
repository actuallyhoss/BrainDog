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
 * five every caller needs, and `answer`, which `46 §2` does not name and an automation's
 * `ask_slash` step needs. `triage`, `embed` and `analyseDraft` have no
 * caller in this tree yet, and tier A `triage` has no
 * dispatcher at all: no outbox kind carries it and no record step calls it. The tier C dispatcher
 * (`jobs`) is the other half: it waits on `job.<id>` declarations, which `packages/kernel/src/flow.ts`'s
 * runner reads, not on this package's own dispatch. The record's JOBS methods exist, in
 * `packages/record/src/jobs.ts`. `shapeOf` IS here, because it is the deterministic half of triage and needs no
 * model: `24 §4.3` groups unmatched arrivals on exactly that string, and `46 §13` D15 fixes it as code's
 * and never the model's.
 *
 * HOW A HOST LOADS IT. A host with no model to offer never imports this package, registers no
 * route, and answers `{ version, slash: false }` (`46 §13` D4). Absence is the default and presence
 * is proven, which is why nothing here reads an environment variable: the decision is the host's,
 * one level up, where it can be made without loading the module it is about. An erasure is the one
 * other reason to load it, and a host does so only where Slash's ledger exists to erase from
 * (`eraseSlash`, `erase.ts`).
 *
 * WHERE THE MODEL IS, THE OWNER SAYS. `source` is the model the host includes, or a key of his own
 * at a provider he named (`Setup`). This package stores that choice and never acts on the key: the
 * host reads the choice back (`slashOwnKeyOf` in `packages/host/src/slash.ts`), opens the key, and
 * hands each ask an `Inference` over it, so the third boundary above still holds on his own key.
 */

import { no, ok, type Result } from '@braindog/ports';

import { answering } from './answer.ts';
import { chats } from './chat.ts';
import { DEEP_CAP, DEEP_GRANT, DEEP_HARDER, DEEP_MODEL, deepSetupOf, deepSpent } from './deep.ts';
import { core as makeCore, openStore, TIERS } from './call.ts';
import { patterns } from './jobs.ts';
import { palette, setups } from './propose.ts';
import {
  ASK_CAP_DEFAULT,
  BACKGROUND_ASKS_MONTH,
  PROVIDERS,
  type Asked,
  type CallContext,
  type Provider,
  type Setup,
  type SetupPatch,
  type Slash,
  type SlashDeps,
  type SlashRoute,
  type Source,
  type Status,
  type Tier,
} from './types.ts';

export { eraseSlash } from './erase.ts';
export { CALLS_MOST, STEPS_MOST, calc, checkFigures, numbersIn, openChat } from './chat.ts';
export { DEEP_CALLS_MOST, DEEP_CAP, DEEP_CAP_CENTS_DEFAULT, DEEP_GRANT, DEEP_HARDER, DEEP_MODEL, DEEP_STEPS_MOST, DEEP_SYSTEM, deepMicros, deepToolOf, wantsDeep } from './deep.ts';
export { health as engineHealth, said as engineSaid, ANSWER_STALE_DAYS, FAILS_DOWN, HEALTH_DAYS, LEDGER_ANSWERED, LEDGER_FAILED } from './health.ts';
export type { EngineFacts, EngineHealth, EngineSaid } from './health.ts';
export { STORE_VERSION } from './call.ts';
export { core as ledgerCore, openStore as openLedger } from './call.ts';
export type { Charge, StoreStep } from './call.ts';
export { cite, citable, shapeOf, tokens } from './project.ts';
export { answerSchema } from './answer.ts';
export { ANSWER_SYSTEM, CHAT_SYSTEM, MODELS, PROMPTS, SYSTEM } from './prompts.ts';
export type { ModelId, ModelRate, PromptId, PromptTemplate, Routed, TemplatePurpose } from './prompts.ts';
export type {
  Ask,
  Asked,
  CallContext,
  ChatActed,
  ChatAction,
  ChatEvent,
  ChatFigure,
  ChatInput,
  ChatMode,
  ChatRan,
  ChatRun,
  ChatThread,
  ChatThreads,
  ChatTool,
  ChatTools,
  Citable,
  Deep,
  DeepBlock,
  DeepCall,
  DeepInference,
  DeepMessage,
  DeepReply,
  DeepSetup,
  DeepStream,
  DeepTool,
  DeepUsage,
  Inference,
  InferenceCall,
  InferenceReply,
  Principal,
  Projection,
  ProjectionRegister,
  ProjectionRow,
  ProjectQuery,
  Proposal,
  Provider,
  Purpose,
  RawPayload,
  ReadTrace,
  Reading,
  RecordApi,
  Settings,
  Setup,
  SetupPatch,
  Slash,
  SlashCandidate,
  SlashDeps,
  SlashPurpose,
  SlashRoute,
  Source,
  Spends,
  Status,
  Tier,
  Verb,
  Where,
} from './types.ts';
export { ASK_CAP_DEFAULT, ASK_CAP_FREE, BACKGROUND_ASKS_MONTH, PROVIDERS, VERBS } from './types.ts';
export { mappingAskOf, mappingOf, readSetup, setupAskOf, setupOf, type MappingAnswer, type MappingAsk, type MappingList, type SetupAbout, type SetupAnswer, type SetupAsk, type SetupOffer, type SetupQuestion } from './propose.ts';
export type { IngestDeclaration, PatternDraft } from './jobs.ts';
export { SKILL_BODY_MOST, SKILL_DRAFT_INSTRUCTIONS, SKILL_LEARNINGS_MOST, skillDraftShaped, type SkillDraftInput, type SkillDrafted } from './skill-draft.ts';

/**
 * The two `slash_meta` keys the own key's provider and address are kept under (`Setup`).
 *
 * `packages/host/src/slash.ts` READS THE SAME TWO NAMES, written out there because that package may not import this one
 * (`46 §5.1`); a rename here is a rename there, in the same change.
 */
export const OWN_PROVIDER = 'own.provider';
export const OWN_BASE_URL = 'own.base_url';

/** The asks `history` answers when its caller names no number, and the most it answers when one names more. */
export const ASKS_LISTED = 20;
export const ASKS_MOST = 100;

/** The two sources, as the owner names them. */
const SOURCES: readonly Source[] = ['included', 'key'];

/**
 * What a host says about its own money and its own models, beside the ports.
 *
 * `priced` NAMES THE TIERS WHOSE CALLS THE HOST PAYS FOR IN NEURONS, and the ledger prices those rows and no others.
 * Unset is `['a']`, which is `46 §4.1`: a customer's key and a self-host endpoint are billed by whoever owns them. The
 * package cannot see that for itself, because what answers tier `byo` is whatever `SlashDeps.inference` is, and on the
 * Worker with no endpoint that is Workers AI on the operator's account.
 *
 * `tiers` NAMES THE TIERS THE HOST RUNS AT ALL, and unset is all three. A tier outside it is refused at `configure`, and
 * one already stored is read as `a`, the included model, with the row left as it was saved (`call.ts` `settings`). The
 * Worker names `a` and `b`, the included model and his own key: `byo` asks the host's endpoint for a model the owner
 * typed, and the Cloud has no endpoint but its included model.
 *
 * Arguments and not fields of `SlashDeps` because `SlashDeps` is the ports, and neither of these is a port.
 */
export type SlashOptions = {
  priced?: readonly Tier[] | undefined;
  tiers?: readonly Tier[] | undefined;
  route?: SlashRoute | undefined;
  /** How a retry waits before it asks a model again (`digestProse`, `jobs.ts`). Absent is the clock's own; a test waits for nothing. */
  wait?: ((ms: number) => Promise<void>) | undefined;
};

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
 * owner choosing his own key picks a grant the record's keychain already holds; an owner who pastes the
 * key itself into that box has handed a plaintext to a package whose entire boundary argument is
 * that it never holds one, and it would then sit in Slash's own SQLite, in a column called
 * `grant_id`, until somebody exported the database. The shape is cheap to check and the failure
 * mode is not recoverable, which is the whole test for whether a check earns its line.
 */
const GRANT_ID = /^g_[0-9A-HJKMNP-TV-Z]{26}$/u;

/**
 * The tier a patch asks for, or `undefined` for one that leaves it: `source` first, then the older `tier`.
 *
 * `included` IS `a` WHATEVER `tier` SAYS ("tiers a/b/byo become included or own key"). It once answered `byo`
 * where the patch said `byo` too, so a save from the settings door could still write the third form the owner retired.
 * A row already stored on `byo` is left as it was saved and reads as `included` with its model name (`status`, and the
 * save of nothing below), so a self-host that set it keeps its model and its count. A bare `tier` is the store's own
 * word, kept for one release for the callers that still send it.
 */
const tierAsked = (patch: SetupPatch): Tier | undefined =>
  patch.source === 'key' ? 'b' : patch.source === 'included' ? 'a' : patch.tier;

/** A provider this package knows, read off a stored or a typed value. */
const providerOf = (value: unknown): Provider | null =>
  typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value) ? (value as Provider) : null;

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
  /* NO PRAGMA, BECAUSE A DURABLE OBJECT REFUSES IT. Measured in workerd: `PRAGMA user_version = 1` threw
     `not authorized: SQLITE_AUTH` out of the object's authorizer, so on the Worker every ask answered 500 before a model
     was called (`apps/worker/test/slash-in-do.test.ts`), until the statement was wrapped. The store's version is a row
     now (`STORE_VERSION`, `slash_meta`), so nothing here asks the pragma at all. */
  openStore(deps.sql, { now: deps.clock.now() });
  deps.sql.exec(
    'INSERT OR IGNORE INTO slash_settings (singleton, tier, model, grant_id, ask_cap, updated_at) VALUES (1, ?, NULL, NULL, ?, ?)',
    'a',
    ASK_CAP_DEFAULT,
    new Date(deps.clock.now()).toISOString(),
  );

  const tiers = options.tiers ?? TIERS;
  const core = makeCore(deps.sql, deps.clock, deps.inference, options.priced, tiers, options.route);
  const asking = palette(core, deps.record, deps.inference);
  const pattern = patterns(core, deps.record, deps.inference, options.wait);
  const automation = answering(core, deps.inference);
  const firstRun = setups(core, deps.inference);
  const talk = chats(core);

  /** Where the own key is asked, as the owner last saved it, whatever the tier is now. */
  const own = (): { provider: Provider | null; base_url: string | null } => {
    const rows = deps.sql.all<{ key: string; value: string }>('SELECT key, value FROM slash_meta WHERE key IN (?, ?)', OWN_PROVIDER, OWN_BASE_URL);
    const said = (key: string): string | undefined => rows.find((r) => r.key === key)?.value;
    const base = said(OWN_BASE_URL);
    return { provider: providerOf(said(OWN_PROVIDER)), base_url: base === undefined || base === '' ? null : base };
  };
  const remember = (key: string, value: string | null): void => {
    if (value === null) deps.sql.exec('DELETE FROM slash_meta WHERE key = ?', key);
    else deps.sql.exec('INSERT INTO slash_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
  };

  /* HIS OWN KEY'S ASKS THIS MONTH, the count `status` lists on that source and nothing stops at, over tier `b`, which is
     where an own key's rows are kept, with the same `model <> '-'` as the included count (`call.ts`, `asksUsed`).
     A PATTERN PRESS IS AN ASK ON HIS KEY AS A QUESTION IS. `POST /api/slash/pattern` settles a `kind = 'pattern'` row
     (`jobs.ts`), and left out of this count a press was a call to his provider the listing never showed. The included
     count reads `read` and `propose` alone until `call.ts` counts the press as well, which this unit asked of its owner. */
  const keyedAsks = (): number =>
    deps.sql.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM slash_call WHERE tier = 'b' AND kind IN ('read', 'propose', 'pattern') AND model <> '-' AND ts >= ?",
      core.monthStart(),
    )?.n ?? 0;

  const status = (): Status => {
    const s = core.settings();
    const key = s.tier === 'b';
    return {
      source: key ? 'key' : 'included',
      tier: s.tier,
      /* THE PROVIDER ONLY WHERE IT ANSWERS. A provider saved before the owner went back to the included model is kept for
         the next time he picks his key, and naming it now would say a model answers that does not. */
      provider: key ? (own().provider ?? 'openai') : null,
      /* ON TIER `a` THE ROUTING TABLE DECIDES AND `settings.model` IS NULL, so the name a person is
         shown is the model that would actually answer their next ask rather than an empty box. The one name tier `a`
         keeps is the one a self-host's owner typed for its own endpoint under "Included" (`modelKept` in `configure`). */
      model: s.model ?? 'glm-5.3-flash',
      /* ONE COUNT FOR WHAT IS SHOWN AND WHAT STOPS AN ASK. On the included model it is the count `spent()` refuses on
         (`propose.ts`); on his own key it is the same kinds of row on his tier, listed and never a limit. */
      asks: { used: key ? keyedAsks() : core.asksUsed(), cap: s.ask_cap, resets: core.resets(), capped: !key },
      /* AND THE RECORD'S OWN WORK BESIDE HIS, a count of its own (`spends = 'background'`), so Settings shows the two apart. */
      background: { used: core.backgroundUsed(), cap: BACKGROUND_ASKS_MONTH },
      /* DEEP, ON HIS OWN ANTHROPIC KEY: set when he picked a key for it, or when his own key for Slash is Anthropic's. Its
         spend is the month's, priced from what the provider counted (`deep.ts`), never a number of asks. */
      deep: {
        key: deepSetupOf(deps.sql).grant_id !== null || (key && own().provider === 'anthropic'),
        model: DEEP_MODEL,
        harder: DEEP_HARDER,
        cap_cents: deepSetupOf(deps.sql).cap_cents,
        spent_cents: Math.ceil(deepSpent(deps.sql, core.monthStart()) / 10_000),
      },
    };
  };

  const configure = (patch: SetupPatch, ctx: CallContext): Result<Setup> => {
    /* THE OWNER AND NOBODY ELSE (`46 §5.2`). Switching tiers spends somebody's money and names a
       keychain grant; a member with `write` on one register is not the person who decides either. */
    if (ctx.principal.kind !== 'person' || ctx.principal.level !== 'owner')
      return no('FORBIDDEN', 'Only the owner of this BrainDog changes how Slash is set up.');

    const before = core.settings();
    const stored = own();

    /* A SAVE OF NOTHING READS WHAT IS SAVED, AND WRITES NOTHING. Settings needs the address and the key he picked to draw
       his own key's form as he left it, and `status` is read by every signed-in person, so neither goes there: a
       colleague is not told which keychain grant the owner's key lives in. `updated_at` stays the last real save's. */
    if (Object.keys(patch).length === 0) {
      const saved: Setup = { ...before, source: before.tier === 'b' ? 'key' : 'included', provider: stored.provider, base_url: stored.base_url, deep: deepSetupOf(deps.sql) };
      return ok(saved);
    }

    /* DEEP'S KEY IS A GRANT IN THE KEYCHAIN, PICKED BY ITS ID AS HIS OWN KEY IS, and its cap a whole number of cents. The
       host holds the grant to a live API token before this sees it (`slashGuardedEngine`). */
    const deepBefore = deepSetupOf(deps.sql);
    const deepGrant = patch.deep_grant_id === undefined ? deepBefore.grant_id : patch.deep_grant_id;
    if (deepGrant !== null && !GRANT_ID.test(deepGrant))
      return no('VALUE_MALFORMED', 'That is not a grant id. Put your Anthropic key in the keychain first, then pick it for Deep.', { at: 'deep_grant_id' });
    const deepCap = patch.deep_cap_cents ?? deepBefore.cap_cents;
    if (!Number.isInteger(deepCap) || deepCap < 0 || deepCap > 1_000_000)
      return no('VALUE_MALFORMED', "Deep's monthly cap is a whole number of cents, and zero turns Deep off.", { at: 'deep_cap_cents' });

    if (patch.source !== undefined && !SOURCES.includes(patch.source))
      return no('ENUM_VALUE_UNKNOWN', 'Slash runs on the included model or on your own key.', { at: 'source', allowed: SOURCES });

    const tier = tierAsked(patch) ?? before.tier;
    if (!tiers.includes(tier))
      return no('ENUM_VALUE_UNKNOWN', `Slash runs on ${namedTiers(tiers)} on this host.`, {
        at: patch.source !== undefined ? 'source' : 'tier',
        allowed: patch.source !== undefined ? SOURCES.filter((s) => tiers.includes(s === 'key' ? 'b' : 'a')) : tiers,
      });

    const askCap = patch.ask_cap ?? before.ask_cap;
    if (!Number.isInteger(askCap) || askCap < 0)
      return no('VALUE_MALFORMED', 'The monthly ask limit is a whole number of asks, and zero turns Slash off.', {
        at: 'ask_cap',
      });

    const grant = patch.grant_id === undefined ? before.grant_id : patch.grant_id;
    if (grant !== null && !GRANT_ID.test(grant))
      return no('VALUE_MALFORMED', 'That is not a grant id. Put the key in the keychain first, then name the grant here.', {
        at: 'grant_id',
      });
    if (tier === 'b' && grant === null)
      return no('VALUE_MALFORMED', 'Your own key is a key in the keychain, so pick the one Slash answers with.', {
        at: 'grant_id',
      });

    const typed = patch.model === undefined ? before.model : patch.model;
    /* TRIMMED ON THE WAY IN, because the name goes on the wire as stored: `  llama3:8b \n` saved ok and was then asked for
       as exactly that, which no provider serves (`apps/web/src/lib/ui/slash-model.ts` measured it). */
    const model = typed === null ? null : typed.trim();
    if (tier !== 'a' && (model === null || model === ''))
      return no('VALUE_MALFORMED', 'Name the model your key or your endpoint answers with.', { at: 'model' });
    /* "INCLUDED" ON A SELF-HOST TAKES A MODEL NAME, the one its own endpoint serves, where `byo` used to. A host
       runs a typed name on its endpoint where it runs `byo` at all; the Cloud names `a` and `b` alone, and there a name on
       tier `a` would go to the included model's own table, which is why it is dropped there. A name is kept where this
       patch typed it, or where it was the host's own model's already and the patch leaves the tier (a new limit, or
       Included again over a row stored on `byo`); going back from his own key never carries the key's model across, and
       a bare `tier: 'a'` still clears it, as it always has. */
    const modelKept =
      tier === 'a' &&
      tiers.includes('byo') &&
      model !== null &&
      model !== '' &&
      (patch.model !== undefined || (patch.tier === undefined && before.tier !== 'b'));

    /* THE PROVIDER IS ONE OF TWO SHAPES, and a record set to its own key before there were two was set to the one there was,
       chat completions, which is what it reads as when it names none. */
    if (patch.provider !== undefined && patch.provider !== null && providerOf(patch.provider) === null)
      return no('ENUM_VALUE_UNKNOWN', 'Slash asks your own key through Anthropic Messages or an OpenAI-compatible endpoint.', {
        at: 'provider',
        allowed: PROVIDERS,
      });
    const provider = patch.provider === undefined ? stored.provider : patch.provider;

    /* AN ADDRESS ONLY OVER https, SINCE THE KEY RIDES IN ITS HEADERS. Whether the host it names is a public one is the
       host's to check, where the address is resolved and sent (`slashBaseUrlOf` in `packages/host/src/slash.ts`), both
       at this door and again on every call; this package has no network to ask. */
    const base = patch.base_url === undefined ? stored.base_url : patch.base_url === null || patch.base_url.trim() === '' ? null : patch.base_url.trim();
    if (base !== null && !httpsAddress(base))
      return no('VALUE_MALFORMED', 'Slash sends your key only to an https address, such as https://api.anthropic.com.', { at: 'base_url' });

    const after: Setup = {
      tier,
      source: tier === 'b' ? 'key' : 'included',
      /* TIER `a` HAS NO MODEL OF ITS OWN (`46 §4.1`): the routing table decides per job, so a name
         left behind from a previous tier would be a setting that reads as though it were in force. The one it keeps is a
         name this save typed, on a host whose own endpoint serves a typed name (`modelKept`). */
      model: tier === 'a' ? (modelKept ? model : null) : model,
      grant_id: grant,
      ask_cap: askCap,
      updated_at: core.now(),
      provider: tier === 'b' ? (provider ?? 'openai') : provider,
      base_url: base,
      deep: { grant_id: deepGrant, cap_cents: deepCap },
    };
    deps.sql.transactionSync(() => {
      deps.sql.exec(
        'UPDATE slash_settings SET tier = ?, model = ?, grant_id = ?, ask_cap = ?, updated_at = ? WHERE singleton = 1',
        after.tier,
        after.model,
        after.grant_id,
        after.ask_cap,
        after.updated_at,
      );
      remember(OWN_PROVIDER, after.provider);
      remember(OWN_BASE_URL, after.base_url);
      remember(DEEP_GRANT, after.deep.grant_id);
      remember(DEEP_CAP, String(after.deep.cap_cents));
    });
    return ok(after);
  };

  /* THE LEDGER, NEWEST FIRST, FOR THE PERSON WHO PAYS FOR IT. A hold still in flight is not an ask yet and is left out; the
     order is the ledger's own, the order the calls were settled in (`call.ts`, `account`). Each says what it was for, the
     `purpose` the store has written since version 3, so the page that lists them can count his own apart from the record's. */
  const history = (limit: number, ctx: CallContext): Result<{ asks: Asked[] }> => {
    if (ctx.principal.kind !== 'person' || ctx.principal.level !== 'owner')
      return no('FORBIDDEN', 'Only the owner of this BrainDog reads what Slash was asked.');
    const most = Number.isInteger(limit) && limit > 0 ? Math.min(limit, ASKS_MOST) : ASKS_LISTED;
    const asks = deps.sql
      .all<Asked>(
        "SELECT id, ts, kind, purpose, status, code, question, model, filed FROM slash_call WHERE code IS NOT 'SLASH_PENDING' ORDER BY rowid DESC LIMIT ?",
        most,
      )
      .map((r) => ({ id: r.id, ts: r.ts, kind: r.kind, purpose: r.purpose, status: r.status, code: r.code, question: r.question, model: r.model, filed: r.filed }));
    return ok({ asks });
  };

  return {
    read: asking.read,
    propose: asking.propose,
    /* A PATTERN ON HIS OWN KEY IS DRAFTED ON IT, over the same ledger: `patterns` is a factory over the core and the model it
       is handed, so the model for this one ask is a second closure and not a slot. The included model's is built once. */
    proposePattern: (samples, ctx, inference) => (inference === undefined ? pattern : patterns(core, deps.record, inference)).proposePattern(samples, ctx),
    draftPattern: pattern.draftPattern,
    digestProse: pattern.digestProse,
    embedTexts: pattern.embedTexts,
    answer: automation.answer,
    /* THE FIRST RUN'S TWO ASKS, on the same ledger and the same month's count as a question (`setups` in `propose.ts`). */
    proposeSetup: (ask, ctx, inference) => firstRun.proposeSetup(ask, ctx, inference),
    proposeMapping: (ask, ctx, inference) => firstRun.proposeMapping(ask, ctx, inference),
    configure,
    status,
    history,
    /* A CONVERSATION (`chat.ts`), on the same ledger and the same month's count as a question. */
    chat: talk.chat,
    act: talk.act,
    thread: talk.thread,
    threads: talk.threads,
    rename: talk.rename,
    remove: talk.remove,
  };
}

/** An address that parses and is `https:`, and nothing else is claimed of it here (`configure`). */
const httpsAddress = (raw: string): boolean => {
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
};
