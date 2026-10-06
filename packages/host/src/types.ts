/**
 * The record's answer shapes, as the client names them: `@braindog/host/types`.
 *
 * ONE DECLARATION PER ANSWER, AND IT IS THE RECORD'S. `packages/client/src/index.ts` wrote every answer shape out a second
 * time, and only `apps/selfhost/test/client.test.ts` held the two equal, so a field the record added or renamed reached
 * the client as a failed integration test at best and as a screen reading `undefined` at worst. A client method added
 * from now on names its answer from this file instead, so the shape is written once, where the method answers it.
 *
 * THROUGH THE HOST, BECAUSE THE CLIENT MAY NOT REACH THE RECORD. `31 §2` gives `client` (17) two edges, `ports` and
 * `host` (16), and `host` already depends on `record` (11), so a type-only re-export here lets the client name the
 * record's shapes without a new edge in any manifest or the lockfile. Nothing in this file exists at run time: every
 * line is erased, so the client's bundle carries no byte of the record by way of it.
 *
 * THE HAND-WRITTEN SHAPES STAY WHERE THEY ARE. The client's existing types are held by `client.test.ts`, and rewriting
 * them by reading, with nothing run, is where a build breaks. They move here one
 * at a time, each with the test that holds it.
 */

import type { RecordApi } from '@braindog/record';

export type {
  Attached,
  Automation,
  AutomationRow,
  AutomationRun,
  Boot,
  Brief,
  Context,
  Cursor,
  EventLine,
  HistoryPage,
  InboxPage,
  Level,
  LiveBrief,
  LiveRun,
  Page,
  RecordApi,
  Restored,
  ScriptRow,
  TokenReach,
  Version,
  Waiting,
  WhatsNew,
} from '@braindog/record';

/**
 * What a record method answers when it succeeds: `Answer<'whatsNew'>` is `WhatsNew`.
 *
 * READ OFF THE METHOD ITSELF, so an answer the record wrote inline, and never named, is still named once. A new client
 * method is `call<Answer<'x'>>('x', args)`, and a change to what `x` answers changes the client's type with it.
 *
 * `Extract` AND NOT `Result<infer T>`, because it asks only for the arm that carries a value: a method whose promise is
 * written as its own union, with the refusal arm spelled out, answers the same `T` as one written as `Result<T>`. A name
 * the record does not have is a type error at the call, and a key that is not a method answers `never`, never an
 * `unknown` that reads as anything.
 */
export type Answer<M extends keyof RecordApi> = RecordApi[M] extends (...args: never[]) => infer R
  ? Extract<Awaited<R>, { ok: true }> extends { value: infer T }
    ? T
    : never
  : never;

/**
 * `Answer<M>` for a method the record may not have in this build, and `Else` while it has not.
 *
 * FOR A ROUTE THE HOST SERVES BEFORE THE RECORD ANSWERS IT, as a row under `routes/` is: its handler answers
 * `NOT_IN_THIS_BUILD` until the record has the method of its name (`understand` was the first). The client's method is
 * typed from the record the moment the record has it, and nothing here is written a second time.
 */
export type AnswerOr<M extends string, Else> = M extends keyof RecordApi ? Answer<M> : Else;
