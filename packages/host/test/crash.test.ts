/**
 * A crash answers a reference and logs the reason.
 *
 * THE REASON WAS IN THE ANSWER AND NOWHERE ELSE. `serveApi`'s catch wrote the thrown message into the 500's `fix`, so
 * the caller read the driver's sentence and the operator read nothing: the probe behind §2.1 (`probe-host-throw.txt`)
 * threw `SQLITE_AUTH: not authorized, row alice@example.com` from a handler and got back `{"code":"INTERNAL","fix":"boot
 * could not be answered: SQLITE_AUTH: not authorized, row alice@example.com."}`, with no line logged on either host.
 * A row's value in a stranger's answer is a leak, and a crash that leaves no trace where the operator looks is a crash
 * nobody fixes. `DEPLOYMENT.md` records one real case of the shape, `not authorized: SQLITE_AUTH`.
 *
 * SO THE TWO HALVES ARE SPLIT, AS `/mcp` ALREADY SPLITS THEM (`packages/mcp/src/rpc.ts`, its catch): the caller gets a
 * reference and a sentence that carries nothing of the reason, and the log gets one JSON line with the same reference
 * and the reason. Quoting the reference is how a customer's report finds its line.
 *
 * `console.error` IS REPLACED FOR THE LENGTH OF ONE CALL, because `serveApi` takes no log and should not: the line goes
 * where every other line of both hosts goes, stderr on the self-host and Workers Logs on the Cloud.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

/* A NAMESPACE IMPORT, SO THIS FILE LOADS AGAINST A TREE WITHOUT `crashed`. A named import of an export that does not
   exist is a link error, and the first test below would then have been red for the wrong reason: it would never have
   run, and so it could not have shown the reason reaching the caller, which is the red this file exists to show. */
import * as host from '../src/index.ts';

type Answer = { ok: boolean; refusal?: { code: string; fix: string } };

/** The probe's sentence, as `probe-host-throw.txt` threw it. A row's value is in it, which is the point. */
const REASON = 'SQLITE_AUTH: not authorized, row alice@example.com';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/** Run `f` with `console.error` collecting its lines instead of printing them. */
async function logged<T>(f: () => Promise<T>): Promise<{ out: T; lines: unknown[][] }> {
  const lines: unknown[][] = [];
  const was = console.error;
  console.error = (...said: unknown[]) => void lines.push(said);
  try {
    return { out: await f(), lines };
  } finally {
    console.error = was;
  }
}

test("A HANDLER'S EXCEPTION IS IN THE LOG AND NOT IN THE ANSWER", async () => {
  const { out: res, lines } = await logged(() =>
    host.serveApi(
      new Request('https://record.test/api/boot'),
      {
        boot: () => {
          throw new Error(REASON);
        },
      },
      {},
    ),
  );
  assert.equal(res.status, 500);
  const body = (await res.json()) as Answer;
  assert.equal(body.ok, false);
  assert.equal(body.refusal?.code, 'INTERNAL');
  const fix = body.refusal?.fix ?? '';
  /* NOT ONE WORD OF IT. Each piece separately, because a repair that dropped the email and kept `SQLITE_AUTH` would
     still be telling a stranger which engine answers and what it refused. */
  for (const word of ['SQLITE_AUTH', 'not authorized', 'alice@example.com', 'alice'])
    assert.ok(!fix.includes(word), `the answer carries "${word}": ${fix}`);
  const ref = UUID.exec(fix)?.[0];
  assert.ok(ref, `the answer carries no reference to quote: ${fix}`);

  assert.equal(lines.length, 1, 'one line per crash');
  const line = JSON.parse(String(lines[0]?.[0])) as Record<string, unknown>;
  assert.equal(line.op, 'crash');
  assert.equal(line.ref, ref, 'the log line is found by the reference the caller was given');
  assert.equal(line.where, '/api/boot');
  assert.match(String(line.error), /SQLITE_AUTH: not authorized, row \[an address\]/);
});

test('crashed MINTS A NEW REFERENCE EACH TIME AND WRITES THE LINE TO THE LOG IT IS GIVEN', () => {
  const lines: string[] = [];
  const first = host.crashed('/api/create', new TypeError('no such table: record'), (line) => lines.push(line));
  const second = host.crashed('/api/create', new TypeError('no such table: record'), (line) => lines.push(line));
  assert.deepEqual(Object.keys(first).sort(), ['ok', 'refusal']);
  assert.equal(first.ok, false);
  assert.equal(first.refusal.code, 'INTERNAL');
  assert.ok(!first.refusal.fix.includes('no such table'), first.refusal.fix);
  const refs = lines.map((l) => (JSON.parse(l) as { ref: string }).ref);
  assert.equal(refs.length, 2);
  assert.notEqual(refs[0], refs[1], 'two crashes, one reference: the second report would find the first line');
  assert.ok(first.refusal.fix.includes(refs[0] ?? '?') && second.refusal.fix.includes(refs[1] ?? '?'));
  /* THE ERROR'S NAME TRAVELS WITH ITS MESSAGE, because `TypeError` against `Error` is half of what a reader diagnoses. */
  assert.equal((JSON.parse(lines[0] ?? '{}') as { error: string }).error, 'TypeError: no such table: record');
});

test('a thrown value that is not an Error is still named, and a log that throws does not take the answer with it', () => {
  const lines: string[] = [];
  host.crashed('/api/boot', 'a string, thrown', (line) => lines.push(line));
  /* AN OBJECT WHOSE `toString` THROWS is the one value `String(e)` cannot name, and the catch that calls this is the
     last line before the socket: anything that escapes here is the hung request `serveApi`'s header is about. */
  const hostile = {
    toString() {
      throw new Error('no');
    },
  };
  host.crashed('/api/boot', hostile, (line) => lines.push(line));
  assert.equal((JSON.parse(lines[0] ?? '{}') as { error: string }).error, 'a string, thrown');
  assert.equal(typeof (JSON.parse(lines[1] ?? '{}') as { error: unknown }).error, 'string');

  const answered = host.crashed('/api/boot', new Error('x'), () => {
    throw new Error('the log is gone');
  });
  assert.equal(answered.refusal.code, 'INTERNAL');
});

test('and an ordinary answer writes no line at all', async () => {
  const { out: res, lines } = await logged(() =>
    host.serveApi(new Request('https://record.test/api/boot'), { boot: async () => ok({ registers: [] }) }, {}),
  );
  assert.equal(res.status, 200);
  assert.equal(lines.length, 0);
});
