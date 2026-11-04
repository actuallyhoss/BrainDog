/**
 * Mercury and Stripe on one record, each refused in turn.
 *
 * PER-PROVIDER PARTIAL FAILURE: a Mercury outage keeps the last Mercury rows. Two feeds write into the
 * same Accounts, and each finds its own accounts by a field of its own (`mercury_account`, `stripe_kind`), never by a
 * name. So one feed's bad hour has nothing to touch in the other's: a key Stripe refuses stops Stripe's run and writes
 * nothing, Mercury's run that hour is good, and Stripe's last figures stand as they were. And the other way round.
 *
 * AND NEITHER COUNTS THE OTHER'S MONEY: Mercury's first contact looks only at bank accounts no feed keeps, so Stripe's
 * accounts are never a candidate, and on a record holding nothing typed, Mercury's accounts count as cash from the
 * first hour, one a Mercury account.
 *
 * The whole path, as the self-host runs it: both files installed through the record's own door, both keys opened from
 * the vault for their own host only, both scripts run on the hour.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fixOf } from '../../packages/ports/src/index.ts';
import type { CallContext } from '../../packages/record/src/index.ts';
import type { NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = new Date(Date.UTC(2026, 8, 20, 9)).toISOString();
const MERCURY = JSON.parse(readFileSync(new URL('./mercury.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const STRIPE = JSON.parse(readFileSync(new URL('../stripe/stripe.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const scriptOf = (doc: Record<string, unknown>): string =>
  String((doc.declarations as Record<string, unknown>[]).find((d) => typeof d.script === 'string')?.script);

/** One Mercury account as `/api/v1/accounts` answers it, its balance in whole dollars. */
const mercuryAccount = (id: string, name: string, currentBalance: number) => ({ id, name, nickname: null, kind: 'checking', status: 'active', currentBalance, availableBalance: currentBalance });

/** Stripe's `/v1/balance`, in cents, one currency. */
const stripeBalance = (available: number, pending: number) => ({
  object: 'balance',
  available: [{ amount: available, currency: 'usd' }],
  pending: [{ amount: pending, currency: 'usd' }],
});

type Account = { name: string; amount: number; currency: string; liquid: number; mercury: string | null; stripe: string | null };
const accountsIn = (sql: Pick<NodeSql, 'all'>): Account[] =>
  sql
    .all<Account>(
      `SELECT json_extract(fields, '$.name') AS name, json_extract(fields, '$.balance.amount') AS amount, json_extract(fields, '$.balance.currency') AS currency,
              json_extract(fields, '$.liquid') AS liquid, json_extract(fields, '$.mercury_account') AS mercury, json_extract(fields, '$.stripe_kind') AS stripe
       FROM entry WHERE register = 'accounts' AND deleted_at IS NULL ORDER BY name`,
    )
    .map((r) => ({ ...r }));

/** The cash the record counts, in one currency: every live account that counts as cash, summed in minor units. */
const cashIn = (rows: Account[], currency: string): number => rows.filter((r) => r.liquid === 1 && r.currency === currency).reduce((n, r) => n + r.amount, 0);

test('STRIPE AND MERCURY ON ONE RECORD: one account a Mercury account, none counted twice, and a refused key stops only its own feed', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-both-feeds-'));
  /* WHAT EACH BANK ANSWERS THIS HOUR, and whether it refuses the key. */
  const now = {
    mercury: { refuse: false, accounts: [mercuryAccount('acc_ops', 'Mercury Checking ••4417', 18_420.5), mercuryAccount('acc_res', 'Mercury Savings ••9002', 250_000)] },
    stripe: { refuse: false, balance: stripeBalance(1_842_050, 250_000) },
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: {
      /* NOT KEYS: words that name whose they are, so a leak would say where it came from. */
      openKey: async (grant) => ({ 'Mercury (read only)': 'KEY-OF-mercury', stripe: 'KEY-OF-stripe' })[grant.label] ?? null,
      send: async (url) => {
        if (url.host === 'api.mercury.com') {
          if (now.mercury.refuse) return json({ errors: { message: 'Unauthorized' } }, 401);
          return json(url.pathname === '/api/v1/accounts' ? { accounts: now.mercury.accounts } : { total: 0, transactions: [] });
        }
        if (now.stripe.refuse) return json({ error: { message: 'Invalid API Key provided' } }, 401);
        return json(url.pathname === '/v1/balance' ? now.stripe.balance : { object: 'list', data: [], has_more: false });
      },
      resolve: async (host) => (host === 'api.mercury.com' || host === 'api.stripe.com' ? [{ address: '203.0.113.10', family: 4 }] : []),
    },
  });
  try {
    const person = running.directory.person$('ada@example.test', 'Ada');
    assert.ok(person.ok);
    const api = running.api;
    assert.ok((await api.createRecord({ id: ID, slug: 'kiln', name: 'Kiln', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
    const owner: CallContext = { principal: { kind: 'person', id: person.value.id, level: 'owner' } };
    const put = async (doc: unknown) => {
      const planned = await api.planPack({ doc, source: { kind: 'local' } } as never, owner);
      assert.ok(planned.ok, fixOf(planned as never));
      const diff = (planned.value as { diff: { planHash: string; approve: string[] } }).diff;
      const done = await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner);
      assert.ok(done.ok, fixOf(done as never));
    };
    for (const id of ['portfolio', 'people', 'money-core']) await put(firstPartyDocument(id, { seeds: [] }));
    /* THE VAULT ENTRIES FIRST, each opening its own host only: a row, a label and what it opens, and no bytes. */
    for (const [id, label, opens] of [['g_stripe', 'stripe', 'api.stripe.com'], ['g_mercury', 'Mercury (read only)', 'api.mercury.com']] as const)
      running.sql.exec(
        "INSERT INTO grant (id, label, opens, kind, kdf, wrapped_by, kek_id, created_at, sealed_under) VALUES (?, ?, ?, 'api_token', 'none', 'kek', 'k_test', ?, 'connector')",
        id,
        label,
        opens,
        NOW,
      );
    await put(STRIPE);
    await put(MERCURY);

    const scripts = { mercury: scriptOf(MERCURY), stripe: scriptOf(STRIPE) };
    /** The last word each script's run left in the record: its outcome and its log. */
    const lastRun = (script: string): { outcome?: string; log?: string; note: string } => {
      const events = running.sql.all<{ to_v: string | null; note: string }>('SELECT note, to_v FROM event WHERE target = ? AND to_v IS NOT NULL ORDER BY rowid', `declaration:script.${script}`);
      const last = events[events.length - 1];
      return { ...(JSON.parse(last?.to_v ?? '{}') as { outcome?: string; log?: string }), note: last?.note ?? 'no run event' };
    };
    const hour = async () => {
      for (const script of Object.values(scripts))
        running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script' AND key = ?", new Date(Date.now() - 1_000).toISOString(), script);
      await running.poll();
    };
    const good = (script: string) => {
      const run = lastRun(script);
      assert.equal(run.outcome, 'ok', `${script}: ${run.note} ${run.log ?? ''}`);
    };

    /* THE FIRST HOUR, BOTH GOOD. One account a Mercury account, carrying its id, and Stripe's two, each carrying its
       kind. Mercury's count as cash from the first hour, since the record holds no bank account a person typed that
       could be the same money; Stripe's pending money does not. */
    await hour();
    good(scripts.mercury);
    good(scripts.stripe);
    const first = accountsIn(running.sql);
    assert.deepEqual(
      first.map((r) => [r.name, r.amount, r.currency, r.liquid, r.mercury ?? r.stripe]),
      [
        ['Mercury Checking ••4417', 1_842_050, 'USD', 1, 'acc_ops'],
        ['Mercury Savings ••9002', 25_000_000, 'USD', 1, 'acc_res'],
        ['Stripe available USD', 1_842_050, 'USD', 1, 'available'],
        ['Stripe pending USD', 250_000, 'USD', 0, 'pending'],
      ],
    );
    /* NONE COUNTED TWICE: no account is both feeds', and the cash is each feed's money once. */
    assert.equal(first.some((r) => r.mercury !== null && r.stripe !== null), false);
    assert.equal(cashIn(first, 'USD'), 1_842_050 + 25_000_000 + 1_842_050);

    /* THE SECOND HOUR, STRIPE REFUSES ITS KEY AND MERCURY'S MONEY MOVED. Stripe's run is refused with its sentence and
       writes nothing, so its last figures stand; Mercury's run is good and its balance moves. */
    const stripeBefore = first.filter((r) => r.stripe !== null);
    now.stripe.refuse = true;
    now.mercury.accounts = [mercuryAccount('acc_ops', 'Mercury Checking ••4417', 17_000), mercuryAccount('acc_res', 'Mercury Savings ••9002', 250_000)];
    await hour();
    good(scripts.mercury);
    const refusedStripe = lastRun(scripts.stripe);
    assert.equal(refusedStripe.outcome, 'refused', refusedStripe.note);
    assert.match(refusedStripe.log ?? '', /Stripe refused the key "Stripe \(read only\)" \(401\)/);
    const second = accountsIn(running.sql);
    assert.deepEqual(second.filter((r) => r.stripe !== null), stripeBefore);
    assert.deepEqual(
      second.filter((r) => r.mercury !== null).map((r) => [r.mercury, r.amount, r.liquid]),
      [
        ['acc_ops', 1_700_000, 1],
        ['acc_res', 25_000_000, 1],
      ],
    );

    /* THE THIRD HOUR, THE OTHER WAY ROUND: Stripe's key works again and its money moved, and Mercury refuses. Mercury's
       last figures stand, and Stripe's move. */
    const mercuryBefore = second.filter((r) => r.mercury !== null);
    now.stripe.refuse = false;
    now.stripe.balance = stripeBalance(2_042_050, 0);
    now.mercury.refuse = true;
    await hour();
    good(scripts.stripe);
    const refusedMercury = lastRun(scripts.mercury);
    assert.equal(refusedMercury.outcome, 'refused', refusedMercury.note);
    assert.match(refusedMercury.log ?? '', /Mercury refused the key labelled "Mercury \(read only\)" \(401\)/);
    const third = accountsIn(running.sql);
    assert.deepEqual(third.filter((r) => r.mercury !== null), mercuryBefore);
    assert.deepEqual(
      third.filter((r) => r.stripe !== null).map((r) => [r.stripe, r.amount]),
      [
        ['available', 2_042_050],
        ['pending', 0],
      ],
    );

    /* THE FOURTH HOUR, BOTH GOOD AGAIN: still four accounts, one a Mercury account, and nothing written twice by the
       hours that were refused. */
    now.mercury.refuse = false;
    await hour();
    good(scripts.mercury);
    good(scripts.stripe);
    const fourth = accountsIn(running.sql);
    assert.equal(fourth.length, 4);
    assert.deepEqual(fourth.filter((r) => r.mercury !== null).map((r) => r.mercury), ['acc_ops', 'acc_res']);
    assert.equal(cashIn(fourth, 'USD'), 1_700_000 + 25_000_000 + 2_042_050);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
