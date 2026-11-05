/**
 * A crash: what the caller is told, and what the operator is told, which are not the same thing.
 *
 * THE REASON USED TO GO TO THE CALLER AND NOWHERE ELSE. `serveApi`'s catch wrote the thrown message into the 500's
 * `fix`, and nothing logged it. Measured: a handler throwing the driver's sentence
 * `SQLITE_AUTH: not authorized, row alice@example.com` answered `boot could not be answered: SQLITE_AUTH: not
 * authorized, row alice@example.com.` to whoever asked, on both hosts, and left no line in either host's log. So a
 * row's value reached a stranger, and the person who could fix the fault had nothing to read.
 *
 * SO IT IS SPLIT, THE WAY `/mcp` ALREADY SPLITS IT (`packages/mcp/src/rpc.ts`, the catch in `handle`). The caller gets
 * a reference and a sentence that says nothing of the reason; the log gets one JSON line with the same reference, the
 * place, and the reason. Whether the reason belongs in that line is an open question, because `53 §2.3` keeps field
 * values out of log lines and a driver's sentence can hold one. Until it is settled, the default is the one built here: the sentence is the one thing that diagnoses a crash, so it is logged, and
 * it is never answered.
 *
 * THE REASON GOES THROUGH THE FLOOR (`log-floor.ts`), which settles what follows from the open question above for keys
 * and addresses: the sentence stays, and what is shaped like either does not. This is the one line in the tree that is
 * built to hold whatever was thrown, so it holds it through the floor even on a host that has not installed it.
 *
 * ONE FUNCTION FOR EVERY DOOR. `serveApi` calls it here; the Worker's router and the self-host's outer catch are the
 * other two places a crash is answered, and the reason this module exists apart from `index.ts` is that
 * three doors answering a crash three ways is the drift `index.ts`'s header is about.
 *
 * NO CLOCK AND NO `node:` IMPORT, because `tools/gates/stack.mjs` refuses both under `packages/`. The line carries no
 * time of its own: Workers Logs and a process supervisor both stamp every line they take, and a time written here
 * would be a second clock that can disagree with theirs.
 */

import { reasonOf } from './log-floor.ts';

/** Where a crash's line goes. `console.error` unless a test hands in its own. */
export type CrashLog = (line: string) => void;

/** The 500's body: the envelope every answer has, with a sentence the caller can quote and nothing else. */
export type Crashed = { ok: false; refusal: { code: 'INTERNAL'; fix: string } };

/**
 * Log a crash under a new reference, and answer the envelope that carries only the reference.
 *
 * `where` IS THE DOOR AND THE PATH, `/api/boot` and not the caller's whole URL: a query string is words the caller
 * chose, and a field value in a log line is what `53 §2.3` forbids.
 *
 * THE LOG IS ALLOWED TO FAIL. A `log` that throws is swallowed, because the answer must still be built; a crash nobody
 * logged is worse than one that was logged, and a crash nobody answered is worse than both.
 */
export function crashed(where: string, e: unknown, log: CrashLog = (line) => console.error(line)): Crashed {
  const ref = crypto.randomUUID();
  try {
    log(JSON.stringify({ op: 'crash', ref, where, error: reasonOf(e) }));
  } catch {
    /* Nothing else to do with it: see the comment above. */
  }
  return {
    ok: false,
    refusal: {
      code: 'INTERNAL',
      fix: `${where} could not be answered, and the reason is in this host's log under ${ref}. Quote that to whoever runs it.`,
    },
  };
}
