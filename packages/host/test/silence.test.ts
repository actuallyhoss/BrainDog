/**
 * THE TWO PLACES WHERE A FAILURE IN THIS PACKAGE BECAME SILENCE.
 *
 * `serveApi`'s own header says it in as many words: *"NOTHING THROWS ACROSS THIS BOUNDARY, and this
 * is where that promise is kept. A handler that threw used to escape here, and the caller never
 * wrote a response at all: the socket stayed open, the request hung, and on the self-host the
 * SERVER then never closed."* The promise was kept for the handler and for nothing after it. The
 * status was worked out and the body was serialised on the line AFTER the try, so two ordinary
 * answers still escaped as exceptions, and `httpStatus`'s own comment records the same fault being
 * found once before and fixed at its cause rather than at its shape: *"`serveApi` then handed that
 * to `new Response` and got a `RangeError`, thrown from the line after the try whose own comment
 * promises nothing throws across this boundary."*
 *
 * AND `fixOf`'s THIRD ARM. `@braindog/ports` has three answers and only two of them carry words, so
 * a not-ok answer carrying neither came back as the empty string. `src/connector.ts` line 127 turns
 * that straight into `new Error(fixOf(wrote))`, which `runPull` records as the run's `error.fix`,
 * and the record then writes a run event whose whole sentence is `<ingest> stopped at <at>: `. The
 * shape is not hypothetical in this tree: `httpStatus` enumerates it as its 500 case and the client
 * mints `UNREACHABLE` for exactly that body arriving over the wire.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, ok, type Result } from '@braindog/ports';

import { serveApi, type Handler } from '../src/index.ts';

type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

const answering = (out: unknown): Record<string, Handler> => ({ boot: (async () => out) as Handler });

const asked = (handlers: Record<string, Handler>): Promise<Response> =>
  serveApi(new Request('https://x/api/boot'), handlers, {});

test('A VALUE THAT CANNOT BE SERIALISED IS A 500 WITH A SENTENCE, not a request nobody ever answered', async () => {
  /* `Param` — what `@braindog/ports` says a driver may hand back — includes `bigint`, and
     `JSON.stringify` throws on one. Measured against the code before this: the call came out of
     `serveApi` as `TypeError: Do not know how to serialize a BigInt`, thrown from `json` at
     `src/index.ts:707`, with no `Response` ever built. */
  const res = await asked(answering(ok(1n)));
  assert.equal(res.status, 500);
  const body = (await res.json()) as Answer;
  assert.equal(body.ok, false);
  assert.equal(body.refusal?.code, 'INTERNAL');
  assert.match(body.refusal?.fix ?? '', /^\/api\/boot could not be answered, /);
});

test('and so is a value that points at itself', async () => {
  /* The same line, the other way to reach it: `TypeError: Converting circular structure to JSON`. */
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const res = await asked(answering(ok(circular)));
  assert.equal(res.status, 500);
  assert.equal(((await res.json()) as Answer).refusal?.code, 'INTERNAL');
});

test('and so is a handler that answers something that is not a Result at all', async () => {
  /* `httpStatus` reads `.ok` off whatever it is given, and it was read one line outside the guard:
     `TypeError: Cannot read properties of undefined (reading 'ok')`, again with no response. */
  for (const nothing of [undefined, null, 'ok']) {
    const res = await asked(answering(nothing));
    assert.equal(res.status, 500, String(nothing));
    assert.equal(((await res.json()) as Answer).refusal?.code, 'INTERNAL', String(nothing));
  }
});

test('and a handler that throws answers a reference, and the reason goes to the log and nowhere else', async () => {
  /* THIS TEST USED TO PIN THE LEAK AS CORRECT: it asserted the fix was `boot could not be answered: the database is on
     fire.`, the thrown message verbatim, so the sentence a driver writes about a row reached whoever asked.
     It now asserts the other half: the same reference in the answer and in the
     one line logged, and the reason only in the line. `test/crash.test.ts` holds the probe's own sentence. */
  const lines: unknown[] = [];
  const was = console.error;
  console.error = (line: unknown) => void lines.push(line);
  let res: Response;
  try {
    res = await asked({
      boot: () => {
        throw new Error('the database is on fire');
      },
    });
  } finally {
    console.error = was;
  }
  assert.equal(res.status, 500);
  const fix = ((await res.json()) as Answer).refusal?.fix ?? '';
  assert.ok(!fix.includes('fire'), `the reason reached the caller: ${fix}`);
  assert.equal(lines.length, 1);
  const line = JSON.parse(String(lines[0])) as { op: string; ref: string; error: string };
  assert.equal(line.op, 'crash');
  assert.ok(fix.includes(line.ref), `the answer does not carry the logged reference ${line.ref}: ${fix}`);
  assert.equal(line.error, 'Error: the database is on fire');
});

test('and every ordinary answer keeps the status and the body it had', async () => {
  const fine = await asked(answering(ok({ registers: [] })));
  assert.equal(fine.status, 200);
  assert.deepEqual(await fine.json(), { ok: true, value: { registers: [] } });

  const refused = await asked(answering({ ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'There is no register called atlantis.' } }));
  assert.equal(refused.status, 422);
  assert.equal(((await refused.json()) as Answer).refusal?.code, 'REGISTER_UNKNOWN');

  const clashed = await asked(answering({ ok: false, conflict: { version: 7, current: { id: 'x' }, actor: 'p_ada' } }));
  assert.equal(clashed.status, 409);
});

test('A NOT-OK ANSWER CARRYING NO REASON STILL SAYS SOMETHING, because connector.ts throws its sentence', async () => {
  /* `src/connector.ts:127` is `if (!wrote.ok) throw new Error(fixOf(wrote));`. With the empty
     string that is `new Error('')`, and `runPull` writes it onto the run as `error.fix`, so the
     event a person reads is `balance stopped at page 1: ` and nothing else. */
  const reasonless = { ok: false } as unknown as Result<number>;
  const said = fixOf(reasonless);
  assert.notEqual(said, '', 'a failure with no sentence is a failure nobody can read');
  assert.ok(said.length > 20, `the sentence was ${JSON.stringify(said)}`);
  assert.equal(new Error(fixOf(reasonless)).message, said);

  /* AND THE TWO ARMS THAT DO CARRY WORDS ARE UNTOUCHED. */
  assert.equal(fixOf({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask a person to sign in.' } }), 'Ask a person to sign in.');
  assert.match(fixOf({ ok: false, conflict: { version: 41, current: null, actor: 'p_ada' } }), /^p_ada changed this since you read it\./);
  assert.equal(fixOf(ok(1)), '');
});
