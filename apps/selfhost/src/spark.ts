/**
 * Spark's model on the self-host: an endpoint named in the environment, and the key it is called with.
 *
 * NOTHING CONFIGURED, NOTHING LOADED. With no `SPARK_ENDPOINT` the record gets no model and Spark's own rules draft, which is
 * the product working, not a degraded one (`docs/46` §5.1).
 *
 * THE KEY IS THE HOST'S OR THE PERSON'S, NEVER THE RECORD'S TO READ. `SPARK_KEY` in the environment, when the operator set one;
 * otherwise the person's own key in the vault under the label `spark`, opened through this host's key store on each call
 * (`actions.ts` `keyOpener`, which counts the opening under a `grant.read` event). Neither is written anywhere. The builder is
 * `@braindog/host/spark`'s, the one the Worker uses too.
 *
 * TWO FEATURES SHARE THE NAME AND THIS FILE NOW BUILDS BOTH. `sparkModelFor` is the model behind the RECORD's Spark, which
 * proposes how a BrainDog is ARRANGED; `sparkEngineFor` is `@braindog/spark`, `docs/46`'s engine, which answers a typed
 * question about what is IN the record. `1f85a49a` settled that neither is a newer version of the other, and the app is where
 * the edge to the package belongs: `46 §5.1` has the host `import()` it once and only when an endpoint is configured, so the
 * decision cannot live in `@braindog/host/spark`, a module every host loads.
 *
 * AND `sparkDoor` IS THE THIRD NAME HERE, because a builder is not a caller: `POST /api/spark/read` is what a
 * request reaches. Neither is reached in this process today. `server.ts` has yet to mount the door, so the door
 * has no caller either and the engine is built by nothing in this app at all; `sparkDoor`'s own memo below
 * carries the measurement, the three edits `server.ts` wants, and what happened when they were driven.
 */

import { SPARK_KEY_LABEL, sparkFromEnv as fromEnv, sparkInferenceOf, sparkModelOf, sparkRecord, type SparkHostConfig } from '@braindog/host/spark';
import { sparkAskDoor, type SparkAskDoor } from '@braindog/host';
import type { Clock, Sql } from '@braindog/ports';
import type { CallContext, RecordApi, SparkModel } from '@braindog/record';
import type { Spark } from '@braindog/spark';

import { keyOpener } from './actions.ts';
import type { KeyStore } from './keys.ts';

export { SPARK_KEY_LABEL };

export type SparkConfig = SparkHostConfig & {
  send?: ((input: URL, init: RequestInit) => Promise<Response>) | undefined;
};

/** `SPARK_ENDPOINT`, `SPARK_MODEL`, `SPARK_KEY`, or nothing. */
export const sparkFromEnv = (env: Record<string, string | undefined>): SparkConfig | undefined => fromEnv(env);

/** The endpoint deps both ports are built from. Written once because the key discipline is the part that must not be copied. */
const wireOf = (config: SparkConfig, api: () => RecordApi, store: KeyStore | undefined) => ({
  grants: () => api().kernel.grants(),
  openKey: (grant: { id: string; label: string }) => keyOpener(api(), store)(grant),
  send: config.send ?? ((input: URL, init: RequestInit) => fetch(input, init)),
});

/** The model the record is handed, or `undefined`. An address that is not http or https is refused at boot, loudly. */
export function sparkModelFor(config: SparkConfig | undefined, api: () => RecordApi, store: KeyStore | undefined): SparkModel | undefined {
  if (!config) return undefined;
  return sparkModelOf(config, wireOf(config, api, store));
}

export type SparkEngineDeps = {
  /**
   * Spark's OWN SQLite, and the caller's to supply.
   *
   * IT IS NOT THE RECORD'S DATABASE (`46 §2`), and it is a parameter here rather than a second file opened beside
   * `record.sqlite` because the caller is the one that already owns this process's files: `server.ts` takes `options.file`,
   * and where the `settings` and `call` tables of `46 §4.1` live is that same decision. This file neither knows the path nor
   * guesses one.
   */
  sql: Sql;
  clock: Clock;
};

/**
 * `@braindog/spark` over this host's endpoint and this record's guarded reads, or nothing at all.
 *
 * THE IMPORT IS DYNAMIC AND THE REFUSAL COMES FIRST, in that order, which is the whole of `46 §5.1`: a self-host with no
 * endpoint configured never evaluates the module, and the keyless e2e row stays byte-identical. Reversing those two lines
 * would keep the feature working and lose the property the loading rule exists for.
 *
 * `sparkRecord` IS THE BRIDGE AND NOT THE RECORD'S OWN `project`, which does not exist yet: it composes the projection out of
 * `boot`, `schema`, `list`, `search` and `get`, so every read runs under the asker's own level and scoping. When the record
 * grows `project`, the bridge goes and the record's stub is passed instead.
 */
export async function sparkEngineFor(
  config: SparkConfig | undefined,
  api: () => RecordApi,
  store: KeyStore | undefined,
  deps: SparkEngineDeps,
): Promise<Spark | undefined> {
  if (!config) return undefined;
  const inference = sparkInferenceOf(config, wireOf(config, api, store));
  if (inference === undefined) return undefined;
  const { createSpark } = await import('@braindog/spark');
  return createSpark({ sql: deps.sql, clock: deps.clock, inference, record: sparkRecord(api()) });
}

/**
 * `POST /api/spark/read` for this process: the door `@braindog/host` serves, over the builder above.
 *
 * THIS IS THE CALLER THE BUILDER HAD NOT GOT, AND NOTHING CALLS IT EITHER, so say both. Finding 2 of
 * `loop/research-batch-five-audit.md` is the absence, and it reproduces exactly. Re-measured on 2026-09-21 with
 * `throw new Error(…)` on the first line of `sparkEngineFor`: `node --test --experimental-strip-types
 * "apps/selfhost/test/*.test.ts"` is 204 tests, 202 pass, 0 fail, 2 skipped, which is byte for byte the
 * unmutated tally. Not one test in this app reaches its own builder, so the three reds the mutation does
 * produce are all in `apps/worker/test/spark.test.ts`, two of them driving THIS file's builder from the other
 * app's suite. Three passes added the dependency, then the builder, then the door below; `grep -rn sparkDoor
 * apps` finds this declaration and no call, which is the same sentence the audit wrote about `sparkEngineFor`.
 *
 * AND THE PRODUCT ANSWERS A 404, which is the measurement that settles it and which no grep can give. A real
 * `start({ file, port: 0, spark: { url, model, key, send } })` reports `spark: true` at `/api/version` and
 * answers `POST /api/spark/read` with 404 `ROUTE_UNKNOWN` "There is no method called spark/read.", from
 * `serveApi`, because nothing stands in front of it. Every path this process serves is unmoved by the engine
 * either way.
 *
 * THE MOUNT IS THREE EDITS TO `server.ts` AND THEY WERE DRIVEN GREEN, in memory through a `node:module`
 * `registerHooks` load hook so that no file outside this pass's own list was written: one `openSqlite` for
 * Spark's own database beside `const sql` at `:751`, one `spark: sparkDoor(sparkConfig, () => api,
 * options.keys, { sql: sparkSql, clock }, origins)` in the `site` literal at `:1129` (with `sparkConfig`
 * lifted out of the `sparkModelFor` call at `:796`, since both ports must read one config), and
 * `servesSpark(path)` ahead of `servesKeys(path)` at the dispatch at `:1352`. Under that patch, one real
 * question over a real socket answered 200 with the record's two open rows and not the third, the predicate the
 * model drafted, the fold's `{ register: 'tasks', rows: 2 }` and its closing `{ register: 'grant', rows: 0,
 * predicate: 'refused' }`, on exactly one model call, while `/api/boot` and `/api/list?register=tasks` still
 * answered 200 and three rows.
 *
 * TWO OF THE DOOR'S OWN REFUSALS ARE UNREACHABLE HERE, AND THAT IS THE DISPATCH ORDER RATHER THAN A DEFECT.
 * Mounted at `:1352` the door sits behind `contextFor`, so under the patch a bearer this record does not know
 * answered 401 `UNAUTHORIZED` and a page at `https://evil.example` answered 403 `FORBIDDEN` in this host's own
 * CSRF sentence, not the door's 403 `NEEDS_BROWSER_SESSION` at `principal` or its 403 at `origin`. `serveKeys`
 * sits at the same place for the same reason and inherits the same order, and a bearer that IS known does reach
 * the door and is refused there, which is the case `46 §5.2` is written for. The door keeps both checks anyway
 * because the Worker's mount is inside `Record$` and answers for itself.
 *
 * WHEN THE ENGINE IS BUILT IS `sparkAskDoor`'s AND NOT THIS FILE'S, for the reason every other line here defers
 * to `@braindog/host/spark`: the Worker asks the same question of the same builder, and a rule about when to
 * build drifts between two hosts exactly as a rule about how to open a key would. What is this file's is WHICH
 * builder, which is the whole of the edge to the thirteenth package.
 */
export function sparkDoor(
  config: SparkConfig | undefined,
  api: () => RecordApi,
  store: KeyStore | undefined,
  deps: SparkEngineDeps,
  origins: ReadonlySet<string>,
): SparkAskDoor<CallContext> {
  return sparkAskDoor(origins, () => sparkEngineFor(config, api, store, deps));
}
