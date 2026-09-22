/**
 * The `via: pull` runner, connector half: the pull fixtures whose `raises:` is in this package,
 * driven through `runPull` the way the Worker's alarm and the self-host's timer drive it.
 *
 * `40 §6` gives the whole family to `connect/test`, and five of its seven belong here. The other two
 * name `packages/host/src/actions.ts`, and `packages/host/test/refusals-pull.test.ts` drives them
 * through `sendAction`. The split is not a preference. `runPull` raises `PULL_ORIGIN_REFUSED` and
 * `PULL_REQUEST_REFUSED` WITH an address (`fetch.page[1]` for a redirect off the base), and the send
 * loop a non-paging action runs raises the same two codes as `{ code, fix }` with nowhere to put
 * one. Measured on September 22nd 2026: `pull-origin-refused.yaml`, handed to this file in a
 * connector's shape, answered `at: fetch.page[1]` where the fixture claims none. A runner that drove
 * the family through one surface would have called two correct fixtures wrong. So this file takes
 * the fixtures whose `raises:` is here, which is what every runner so far has followed, and the
 * count below says how many that is.
 *
 * ─── WHAT A FIXTURE CARRIES ─────────────────────────────────────────────────────────────────────
 *
 *   declare:  one connector, as `IngestDecl`: `id`, `fetch`, `writes`. It pages, which is what makes
 *             it this runner's (`pages()` in `packages/kernel/src/actions.ts` is the same fork).
 *   grant:    the credential's stored fields, sealed here under a key made for the test, or absent
 *             for a connector that declares no auth. Sealed rather than handed in plain because the
 *             run opens it itself, and a runner that skipped the opening would skip a step that
 *             refuses.
 *   answers:  the provider's replies, one per request the run makes, in order: `status`, `headers`,
 *             `body` (an object is sent as JSON, a string as it is) and `ms`, how long the request
 *             took. `ms` moves the clock, which is the only way `PULL_LEASE_EDGE` is reached by a
 *             run rather than by a lease that expired before it started: `run.ts` checks the edge
 *             before each page and never during one. A request past the last answer fails the test
 *             by name rather than repeating the last answer, so a fixture says how many requests
 *             its refusal costs.
 *
 * THE EXTRACTOR IS STUBBED, as it is in `run.test.ts`: every element of `items` is a row. None of
 * these codes is raised by extraction, and `@braindog/extract` answering for a page is a second
 * surface under test that none of the five fixtures claims.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Http } from '@braindog/ports';

import { family as familyOf, type Fixture, type Keys } from '../../../fixtures/corpus.ts';
import {
  runPull,
  seal,
  type ConnectDeps, type Extraction, type ExtractFn, type IngestDecl, type OutboxRow,
} from '../src/index.ts';
import { kekOf, storeOf, wrapDek } from './grants.ts';

const RECORD = 'rec_fixture';
const NOW = Date.parse('2026-01-20T09:00:00Z');
const SLOT = '2026-01-20T08:00:00Z';
/** Five minutes, which is the lease `30 §8` gives a leased row and the one `run.test.ts` uses. */
const LEASE = 300_000;

const json = <T>(keys: Keys, key: string, where: string): T | undefined => {
  const raw = keys.get(key);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`${where}'s \`${key}:\` is not a flow collection this reader can hand to JSON.parse: ${String(e)}`);
  }
};

const family: Fixture[] = familyOf('pull');
const mine = family.filter((f) => f.keys.get('raises')?.startsWith('packages/connect/'));

/* THE COUNTS ARE ASSERTED SO THAT AN EIGHTH CANNOT ARRIVE UNDRIVEN. `40 §6` says the family is
   seven; five raise in this package and two in the host's send loop. A fixture whose `raises:` is in
   neither is driven by nobody, and it finds that out here. */
test('every pull fixture is driven by one of the two runners, and five of the seven by this one', () => {
  assert.equal(family.length, 7);
  assert.equal(mine.length, 5);
  for (const f of family) {
    const raises = f.keys.get('raises') ?? '';
    assert.ok(
      raises.startsWith('packages/connect/') || raises === 'packages/host/src/actions.ts',
      `${f.name} raises from ${raises}, which neither pull runner drives`,
    );
  }
  for (const f of mine) assert.ok(f.keys.has('declare'), `${f.name} carries no \`declare:\`, so nothing drives it`);
});

type Answer = { status?: number; headers?: Record<string, string>; body?: unknown; ms?: number };

/** Every element of `items` is a row, as it came. */
const extract: ExtractFn = (_decl, raw): Extraction => {
  const body = JSON.parse(raw.body) as { items?: Record<string, unknown>[] };
  return {
    rows: (body.items ?? []).map((item) => ({
      fields: item as Extraction['rows'][number]['fields'],
      confidence: 'exact' as const,
      outcome: {},
    })),
    confidence: 'exact',
  };
};

for (const fixture of mine) {
  const where = `fixtures/refusals/${fixture.name}`;

  test(`${fixture.name} raises ${fixture.keys.get('code')} from the scheduled run`, async () => {
    const decl = json<IngestDecl>(fixture.keys, 'declare', where)!;
    const fields = json<Record<string, string>>(fixture.keys, 'grant', where);
    const answers = json<Answer[]>(fixture.keys, 'answers', where) ?? [];

    let now = NOW;
    let asked = 0;
    const http: Http = {
      fetch: (url) => {
        const answer = answers[asked];
        asked += 1;
        if (answer === undefined)
          throw new assert.AssertionError({ message: `${where} carries ${answers.length} answers and the run made request ${asked}, to ${url.href}` });
        now += answer.ms ?? 0;
        return Promise.resolve(
          new Response(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {}), {
            status: answer.status ?? 200,
            headers: { 'content-type': 'application/json', ...answer.headers },
          }),
        );
      },
    };

    const kek = await kekOf();
    const keys = storeOf({ kek_1: kek });
    const dek = fields === undefined ? null : await wrapDek(kek, 'kek_1', RECORD);
    const grant =
      fields === undefined || dek === null
        ? null
        : await seal(new TextEncoder().encode(JSON.stringify(fields)), 'grant_1', 1, dek, RECORD, keys);

    const job: OutboxRow<'pull.fetch'> = {
      id: 'ob_1',
      kind: 'pull.fetch',
      leased_until: new Date(NOW + LEASE).toISOString(),
      attempts: 0,
      payload: {
        ingest: decl.id,
        decl,
        declaration_version: 1,
        grant,
        dek,
        record: { id: RECORD, tz: 'Africa/Cairo' },
        cursor: { watermark: null },
        slot: SLOT,
      },
    };

    let acked: string | undefined;
    const deps: ConnectDeps = {
      http,
      keys,
      clock: { now: () => now },
      extract,
      currencies: { EGP: { exponent: 2 } },
      lookup: () => [],
      record: {
        applyPull: (args) => Promise.resolve({ wrote: args.rows.length, kept: 0 }),
        ackOutbox: (_id, _state, _result, error) => {
          acked = error;
          return Promise.resolve();
        },
      },
    };

    const out = await runPull(job, deps);

    assert.ok(out.error, `${where}'s run ended ${out.outcome} with no refusal`);
    assert.equal(out.error.code, fixture.keys.get('code'));
    assert.equal(out.error.at, fixture.keys.get('at'), `${where} claims \`at: ${fixture.keys.get('at')}\``);

    /* A SENTENCE, NOT THE FIXTURE'S SENTENCE. `PULL_FIXES` fills `<at>`, `<found>` and `<wanted>` at
       the moment of the refusal, so a fixture's `fix:` is the reader's summary of it; what holds of
       every one is that it is a sentence, which is `30 §6`'s whole requirement of a fix. */
    assert.ok(/[.?!]$/.test(out.error.fix.trim()), `${where} was refused with "${out.error.fix}", which is not a sentence`);

    /* EVERY ANSWER WAS ASKED FOR. A fixture with a spare one is a fixture whose claim about which
       request refused is not the one the run made. */
    assert.equal(asked, answers.length, `${where} carries ${answers.length} answers and the run made ${asked} requests`);
    /* AND THE REFUSAL REACHED THE ACK, where the record reads it; only a `failed` ack carries a code. */
    if (acked !== undefined) assert.equal(acked, fixture.keys.get('code'));
  });
}
