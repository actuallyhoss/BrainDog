/**
 * What one invocation may spend, and what happens to the work it cannot reach.
 *
 * THIS IS THE ONE CEILING THAT IS NOT ENFORCED BY THE THING IT PROTECTS. A record over its plan is
 * told `held` by the Directory and sends nothing; a request over two megabytes is cut off by the
 * reader. Cloudflare's subrequest limit is neither: it is not a refusal handed to the run that
 * broke it, it is the end of the whole invocation, every other record in it included. So the
 * counting has to happen BEFORE the run, here, or it does not happen at all.
 *
 * THE UNIT AND NOT THE RECORD, deliberately. What can go wrong in this arithmetic — a reservation
 * off by a page, a row finished when it should have been handed back, a budget that stops the first
 * run instead of the sixth — is all visible in `runActions` with counted steps, and driving a real
 * SQLite record would bury it under sixty lines of declaration. What the real record does with a
 * released row is `outbox.test.ts`'s.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  reserveFor,
  runActions,
  type ActionDecl,
  type Budget,
  type Metered,
  type Paged,
  type Ready,
  type RunnerSteps,
} from '../src/actions.ts';
import type { OutboxRow } from '../src/outbox.ts';

const job = (id: string): OutboxRow => ({ id, kind: 'pull.fetch', payload: '{}', attempts: 0, leasedUntil: 'lease' });

const decl = (over: Partial<ActionDecl> = {}): ActionDecl => ({ ingest: 'acme', channel: 'pull', ...over });

const metered = (): Metered =>
  ({
    ingest: 'acme',
    channel: 'pull',
    host: 'acme.example',
    status: 200,
    outcome: 'ok',
    requests: 1,
    bytes: 0,
    ms: 1,
    failures: 0,
  }) as unknown as Metered;

const ok = () => ({ outcome: 'ok' as const, requests: 1, bytes: 10, ms: 5, failures: 0, say: 'acme fetched one page.' });

const paged = (id: string, maxPages?: number): Paged => ({
  job: job(id),
  decl: decl(maxPages === undefined ? {} : { limits: { max_pages: maxPages } }),
  host: 'acme.example',
  paged: { ingest: 'acme' } as Paged['paged'],
});

/** Steps that do nothing but record what they were asked to do. */
function counted(prepare: (job: OutboxRow) => Ready | Paged | Metered, rows: OutboxRow[]) {
  const seen = { released: [] as string[], ran: [] as string[], dropped: 0 };
  const steps: RunnerSteps = {
    drain: () => ({ claimed: 0, done: 0, failed: 0, dead: 0 }),
    lease: () => rows,
    prepare,
    finish: () => metered(),
    release: () => {
      seen.dropped++;
    },
    dropPaged: () => metered(),
    meterPaged: (p) => {
      seen.ran.push(p.job.id);
      return metered();
    },
    releaseJob: (j) => {
      seen.released.push(j.id);
    },
  };
  return { steps, seen };
}

const pass = (steps: RunnerSteps, budget?: Budget) =>
  runActions(steps, (() => Promise.resolve({})) as never, 5, () => Promise.resolve(ok()), budget);

/* ── the arithmetic ──────────────────────────────────────────────────────── */

test('a connector reserves two per page plus a tail, and an unsaid page count is forty', () => {
  /* TWO PER PAGE BECAUSE EACH PAGE IS FETCHED AND THEN WRITTEN BACK, and six for the token step,
     the probe, the credential, the ack and the meter. A reservation short by the write-backs would
     be half the real cost, which is the same as having no ceiling on a long run. */
  assert.equal(reserveFor(paged('a', 10)), 26);
  assert.equal(reserveFor(paged('a')), 86, 'a declaration that says nothing is budgeted for forty pages');
  assert.equal(reserveFor(paged('a', 0)), 6);
});

test('a single-request action reserves the tail, and a job whose declaration has gone reserves nothing', () => {
  const ready: Ready = {
    job: job('a'),
    decl: decl({ channel: 'call' }),
    request: {} as Ready['request'],
    host: 'acme.example',
  };
  assert.equal(reserveFor(ready), 6);
  /* Already finished by `prepare`, and it sends nothing — so reserving for it would deny room to
     a run that is actually going to spend. */
  assert.equal(reserveFor(metered()), 0);
});

/* ── what the budget does to a pass ──────────────────────────────────────── */

test('A PASS THAT FITS SPENDS AND RUNS EVERYTHING, and says there is no more', async () => {
  const { steps, seen } = counted((j) => paged(j.id, 10), [job('a'), job('b')]);
  const budget: Budget = { left: 800, total: 800 };

  const out = await pass(steps, budget);

  assert.deepEqual(seen.ran, ['a', 'b']);
  assert.deepEqual(seen.released, []);
  assert.equal(out.more, false);
  assert.equal(budget.left, 800 - 26 - 26, 'each run reserved its own cost and no more');
});

test('THE RUN THAT WOULD NOT FIT IS HANDED BACK, NOT FINISHED, and so is everything behind it', async () => {
  const { steps, seen } = counted((j) => paged(j.id, 10), [job('a'), job('b'), job('c')]);
  /* Room for one run of twenty-six and not two. */
  const budget: Budget = { left: 40, total: 40 };

  const out = await pass(steps, budget);

  assert.deepEqual(seen.ran, ['a'], 'the first run went');
  /* BACK ON THE SHELF AND NOT ACKED. A connector finished here is a fetch window skipped: the row
     is gone, its cursor never moved, and the provider's rows for that window are simply missing. */
  assert.deepEqual(seen.released, ['b', 'c']);
  assert.equal(seen.dropped, 0, 'nothing was metered as dropped: these rows are still due');
  assert.equal(out.more, true, 'the host is told to ring again');
});

test('ONE RUN ALWAYS GOES, however dear it is, so a big connector is not released for ever', async () => {
  /* Eight hundred pages is 1,606 subrequests, more than a whole invocation holds. Released on the
     reservation alone it would be released on every pass, for ever, and nothing would say why. */
  const { steps, seen } = counted(() => paged('a', 800), [job('a')]);
  const budget: Budget = { left: 800, total: 800 };

  const out = await pass(steps, budget);

  assert.deepEqual(seen.ran, ['a']);
  assert.equal(out.more, false);
  assert.ok(budget.left < 0, 'it spent more than there was, and the pass after it is the one that stops');
});

test('a second pass on a spent budget runs nothing and releases everything', async () => {
  const { steps, seen } = counted((j) => paged(j.id, 10), [job('a'), job('b')]);
  /* What the pass above left behind: over already. */
  const budget: Budget = { left: -6, total: 800 };

  const out = await pass(steps, budget);

  assert.deepEqual(seen.ran, []);
  assert.deepEqual(seen.released, ['a', 'b']);
  assert.equal(out.more, true);
});

test('NO BUDGET IS NO CEILING, which is the self-host: nothing is reserved and nothing is released', async () => {
  /* A Node process has no subrequest limit, and a cap invented for it would be a cap that only
     ever refused legitimate work. The argument comes from the host that has the ceiling. */
  const { steps, seen } = counted((j) => paged(j.id, 800), [job('a'), job('b'), job('c')]);

  const out = await pass(steps);

  assert.deepEqual(seen.ran, ['a', 'b', 'c']);
  assert.deepEqual(seen.released, []);
  assert.equal(out.more, false);
});
