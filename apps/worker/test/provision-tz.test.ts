/**
 * `POST /auth/provision` takes the record's time zone, through `export default`'s own `fetch` and a real `Directory$`.
 * `loop/research-first-sign-in.md` friction 12.
 *
 * THE TIME ZONE WAS ALWAYS `UTC`, AND NOTHING LATER CHANGES IT. `provision()` wrote `tz: 'UTC'` for every record, and
 * the walk searched every settings area and `copy.ts` for a screen that renames a record or moves its zone and found
 * none. For somebody in London that is every digest, every due date and every "today" an hour out for half the year,
 * decided on the night he provisions by a field he was never offered.
 *
 * SO THE BODY CARRIES IT, AND THE WORKER CHECKS IT BEFORE THE DIRECTORY WRITES ANYTHING. `createRecord` checks the zone
 * too (`packages/kernel/src/provision.ts`), but it runs inside the record, after `prepare` has minted the owner as a
 * `dir_person` row: a zone refused there leaves a person in the Directory with no record behind them. So the refused
 * cases below count `dir_person` before and after, and require that the record was never asked to exist. Measured: with
 * the zone checked after `prepare`, the count went up by one on `Mars/Olympus` and that assertion was the one that failed.
 *
 * THE RECORD IS A DOUBLE THAT KEEPS WHAT IT WAS HANDED, because what a record does with its zone is the kernel's and
 * is tested there. What is held here is what the Worker hands it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled, objectStorage } from './bundled-worker.ts';

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
const OPERATOR = 'operator-key-for-tests-only-0123456789abcdef';

/** A Worker with a real Directory and a record double, and a `provision` that answers the status, the body and what the record was given. */
async function host() {
  const { default: worker, Directory$ } = await bundled();
  const made: { tz?: unknown }[] = [];
  const records = { idFromName: (n: string) => n, get: () => ({ create: async (args: { tz?: unknown }) => (made.push(args), null) }) };
  /* KEYLESS ON PURPOSE, which `keyless.ts` allows only when it is written down. The keys are `provision.test.ts`'s
     question; a zone is decided before them and has nothing to do with them. */
  const env: Record<string, unknown> = {
    PUBLIC_HOST: HOST,
    SESSION_SECRET: 'fake-session-secret-for-tests-only-0123456789',
    PROVISION_KEY: OPERATOR,
    PROVISION_WITHOUT_KEYS: 'yes',
    RECORD: records,
  };
  const blocked: Promise<unknown>[] = [];
  const storage = objectStorage();
  const state = { storage, id: { toString: () => 'directory' }, blockConcurrencyWhile: (f: () => Promise<unknown>) => (blocked.push(f()), blocked.at(-1)), waitUntil: () => {} };
  const directory = new Directory$(state, env);
  await Promise.all(blocked);
  env['DIRECTORY'] = { idFromName: (n: string) => n, get: () => directory };
  /* THE DIRECTORY MAKES ITS TABLES ON FIRST USE, so counting people before the first provision read `no such table`. */
  (directory as unknown as { knows(id: string): boolean }).knows('rec_00000000000000000000000000');
  const people = () => Number((storage.sql.exec('SELECT count(*) AS n FROM dir_person').toArray()[0] as { n: number }).n);

  const provision = async (body: object) => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/auth/provision`, {
        method: 'POST',
        headers: { authorization: `Bearer ${OPERATOR}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
      { waitUntil: () => {} },
    );
    const text = await res.text();
    return { status: res.status, text, json: JSON.parse(text) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } } };
  };
  return { provision, made, people };
}

test('A ZONE IN THE BODY IS THE ZONE THE RECORD IS MADE WITH, not UTC', async () => {
  const { provision, made } = await host();
  const out = await provision({ slug: 'sam', email: 'owner@example.test', name: 'Sam', tz: 'Europe/London' });
  assert.equal(out.status, 200, out.text);
  assert.equal(made.length, 1);
  assert.equal(made[0]!.tz, 'Europe/London', 'the record was made in a zone other than the one the operator typed');
});

test('and it is written in the runtime\'s own spelling, so a zone typed in lower case is the zone every reader finds', async () => {
  /* `Intl` accepts `europe/london` and answers `Europe/London` from `resolvedOptions`. Stored as typed, the record would
     hold a spelling no other record has, and a comparison by name anywhere would call them two zones. */
  const { provision, made } = await host();
  const out = await provision({ slug: 'sam', email: 'owner@example.test', tz: '  europe/london ' });
  assert.equal(out.status, 200, out.text);
  assert.equal(made[0]!.tz, 'Europe/London');
});

test('with no zone in the body the record is UTC, as every record provisioned before this was', async () => {
  const { provision, made } = await host();
  const out = await provision({ slug: 'sam', email: 'owner@example.test', name: 'Sam' });
  assert.equal(out.status, 200, out.text);
  assert.equal(made[0]!.tz, 'UTC');
});

test('A ZONE THE RUNTIME DOES NOT KNOW IS REFUSED AT tz, before the Directory has written a person', async () => {
  const { provision, made, people } = await host();
  for (const tz of ['Mars/Olympus', '', 42, '+01:00']) {
    const before = people();
    const out = await provision({ slug: 'sam', email: 'owner@example.test', name: 'Sam', tz });
    /* 422, WHICH IS `httpStatus` FOR `VALUE_MALFORMED` everywhere, the slug's own refusal from `prepare` included. */
    assert.equal(out.status, 422, `${JSON.stringify(tz)} was not refused: ${out.text}`);
    assert.equal(out.json.refusal?.code, 'VALUE_MALFORMED', out.text);
    assert.equal(out.json.refusal?.at, 'tz', out.text);
    assert.equal(made.length, 0, `${JSON.stringify(tz)} reached the record`);
    assert.equal(people(), before, `${JSON.stringify(tz)} left a person in the Directory with no record behind them`);
  }
  /* AND THE NAME IS STILL HIS. A refusal that had claimed the slug would make the retry below `ALREADY_KNOWN`, and the
     Directory never gives a name out twice. */
  const retried = await provision({ slug: 'sam', email: 'owner@example.test', name: 'Sam', tz: 'Europe/London' });
  assert.equal(retried.status, 200, retried.text);
  assert.equal(made.length, 1);
});
