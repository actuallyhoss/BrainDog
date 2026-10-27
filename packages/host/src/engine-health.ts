/**
 * The engine's health, built over a host's own engine and its facts: the read `GET /api/slash/health` answers a
 * signed-in person, and the one the record's `engineHealth` hands a read token, the command line and the daily vital sign.
 *
 * ONE BUILDER FOR BOTH, so the door and the record say the same sentence about the same ledger. Each host hands it Slash's
 * own SQLite, whether it has a model at all, its keychain rows, and the package's two functions (`engineHealth` and
 * `engineSaid` in `@braindog/slash`), loaded the way the host already loads that package.
 *
 * STRUCTURAL, AS `slash-ask.ts` IS: this package must not depend on `@braindog/slash` (`46 §5.1`), so the two functions are
 * handed in and their shapes restated here, and a host with no model never loads them: `off` is answered here, in the
 * package's own sentence, without importing anything.
 *
 * WHAT ONLY THE HOST KNOWS. Whether a model is configured, and whether the owner's own key is still a live key in the keychain.
 * A key the keychain will not open leaves no ledger row, so the ledger alone cannot say `key_closed` for it. Whether the key
 * would open for this session is the keychain's gate and needs a fresh proof, so it is not asked here: a revoked or missing
 * grant is the one closed key a read can see without opening anything.
 */

import type { Sql } from '@braindog/ports';

import { slashOwnKeyOf } from './slash.ts';

/** `@braindog/slash`'s `EngineHealth`, restated. */
export type EngineHealth = {
  state: 'answering' | 'not_answering' | 'never_asked' | 'off' | 'key_closed';
  last_ok: string | null;
  since: string | null;
  answeredBy?: { model: string; at: string } | undefined;
  lastWords?: string | undefined;
  doubleShare?: number | undefined;
  doubleOf?: { twice: number; asks: number } | undefined;
  spent?: { person: number; background: number } | undefined;
  passedOver?: number | undefined;
};

/** `@braindog/slash`'s `EngineSaid`: one sentence, and whose it is to fix. */
export type EngineSaid = { text: string; whose: 'ours' | 'yours' | null };

/** `@braindog/slash`'s `EngineFacts`: what the host knows that the ledger cannot. */
export type EngineFacts = { model: boolean; own_key?: boolean | undefined; key_open?: boolean | null | undefined };

/** What the door and the record answer. */
export type EngineHealthRead = { health: EngineHealth; said: EngineSaid };

/** The package's two functions, as `import('@braindog/slash')` hands them. */
export type EngineHealthFns = {
  engineHealth(sql: Sql, clock: { now(): number }, facts: EngineFacts): EngineHealth;
  engineSaid(health: EngineHealth, nowMs: number): EngineSaid;
};

export type EngineHealthDeps = {
  /** Slash's own SQLite, the one the host hands `createSlash`, holding `slash_call`. */
  sql: Sql;
  clock: { now(): number };
  /** Whether this host has a model behind Slash at all: `/api/version`'s `slash`. */
  model: boolean;
  /** The package's two functions, loaded only where `model` is true. */
  load: () => Promise<EngineHealthFns>;
  /** The record's keychain rows, to say whether the key the owner picked for Slash is still a live one. Absent, nobody can tell. */
  grants?: (() => readonly { id: string; kind?: string | undefined; revoked_at: string | null }[]) | undefined;
};

/** `@braindog/slash`'s `off`, said here so a host with no model loads nothing to say it. */
const OFF: EngineHealthRead = {
  health: { state: 'off', last_ok: null, since: null },
  said: { text: 'Slash has no model on this host, so BrainDog works from its rules.', whose: null },
};

/** The kind of keychain row a key for Slash is (`SLASH_GRANT_KIND` in `slash.ts`). */
const API_TOKEN = 'api_token';

/** The read, built once per host and asked on every look: nothing is cached, so a failure a second ago is in it. */
export function engineHealthRead(deps: EngineHealthDeps): () => Promise<EngineHealthRead> {
  return async () => {
    if (!deps.model) return OFF;
    const fns = await deps.load();
    const own = slashOwnKeyOf(deps.sql);
    const live =
      own === null || deps.grants === undefined
        ? null
        : deps.grants().some((g) => g.id === own.grant_id && g.revoked_at === null && (g.kind === undefined || g.kind === API_TOKEN));
    const facts: EngineFacts = { model: true, own_key: own !== null, key_open: live === false ? false : null };
    const health = fns.engineHealth(deps.sql, deps.clock, facts);
    return { health, said: fns.engineSaid(health, deps.clock.now()) };
  };
}
