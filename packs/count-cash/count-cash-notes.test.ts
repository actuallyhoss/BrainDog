/**
 * Count the cash 2.0.0: a count by note and coin, and the difference recorded as lines or as Discrepancy.
 *
 * Each case runs the road a person takes from the app: the pack is installed beside money-core and a count is written,
 * and the rule hands it to the script. An older count, with a typed total and nothing else, is filed as it always was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CallContext } from '../../packages/record/src/index.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const PACK = JSON.parse(readFileSync(new URL('./count-cash.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

type Entry = { what: string; on: string; direction: string; amount: { amount: number; currency: string }; category?: string; account: string };

test('NOTES AND COINS ARE ADDED UP, AND THE DIFFERENCE IS FILED AS LINES AND THE REST AS DISCREPANCY', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-count-cash-notes-'));
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => null, send: async () => new Response('{}'), resolve: async () => [] },
  });
  try {
    const person = running.directory.person$('ada@example.test', 'Ada');
    assert.ok(person.ok);
    const api = running.api;
    assert.ok((await api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
    const owner: CallContext = { principal: { kind: 'person', id: person.value.id, level: 'owner' } };
    const said = <T>(r: unknown): T => {
      const x = r as { ok: boolean; value: T };
      assert.ok(x.ok, fixOf(x as never));
      return x.value;
    };
    const put = async (doc: unknown) => {
      const planned = said<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
      said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
    };
    for (const id of ['portfolio', 'people', 'money-core']) await put(firstPartyDocument(id, { seeds: [] }));
    await put(PACK);

    const discrepancy = said<{ id: string }>(await api.create({ register: 'categories', fields: { name: 'Discrepancy', direction: 'both' } }, owner));
    const tips = said<{ id: string }>(await api.create({ register: 'categories', fields: { name: 'Tips', direction: 'out' } }, owner));
    const till = said<{ id: string }>(
      await api.create({ register: 'accounts', fields: { name: 'Cash (EGP)', kind: 'cash', balance: { amount: 100_000, currency: 'EGP' }, as_of: '2026-10-01', liquid: true } }, owner),
    );
    const settle = async () => {
      for (let i = 0; i < 3; i++) {
        await running.drain();
        await running.poll();
      }
    };
    const ledger = () =>
      running.sql
        .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'transactions' AND deleted_at IS NULL ORDER BY seq")
        .map((r) => JSON.parse(r.fields) as Entry);
    const count = (id: string) => api.kernel.get(id)?.fields as Record<string, unknown>;

    /* 3 x 200 + 2 x 50 + 4 x 0.25 = 701.00 against 1,000.00: 299.00 short, as two lines of 100.00 and 40.00 and 159.00 over. */
    const a = said<{ id: string }>(
      await api.create(
        {
          register: 'cash_counts',
          fields: {
            account: till.id,
            on: '2026-10-05',
            denominations: { currency: 'EGP', notes: { '200': 3, '50': 2, '0.25': 4 } },
            reconcile: 'lines',
            lines: [
              { what: 'Taxi', amount: 100, category: 'Tips' },
              { what: 'Coffee', amount: 40 },
            ],
          },
        },
        owner,
      ),
    );
    await settle();
    assert.deepEqual(count(a.id).counted, { amount: 70_100, currency: 'EGP' });
    assert.deepEqual(count(a.id).difference, { amount: -29_900, currency: 'EGP' });
    assert.deepEqual(
      ledger().map((t) => [t.what, t.direction, t.amount.amount, t.category ?? null]),
      [
        ['Taxi', 'out', 10_000, tips.id],
        ['Coffee', 'out', 4_000, null],
        ['Discrepancy', 'out', 15_900, discrepancy.id],
      ],
    );
    assert.match(String(count(a.id).said), /^Counted 3 × 200, 2 × 50, 4 × 0\.25\. Filed as 2 lines and the rest as Discrepancy in the Ledger\.$/);

    /* ALL OF IT AS DISCREPANCY, against the check the first count wrote. */
    const b = said<{ id: string }>(
      await api.create({ register: 'cash_counts', fields: { account: till.id, on: '2026-10-06', counted: { amount: 69_000, currency: 'EGP' }, reconcile: 'discrepancy' } }, owner),
    );
    await settle();

    assert.deepEqual(ledger().at(-1) && [ledger().at(-1)!.what, ledger().at(-1)!.amount.amount, ledger().at(-1)!.category], ['Discrepancy', 1_100, discrepancy.id]);
    assert.equal(count(b.id).said, 'Filed as Discrepancy in the Ledger.');

    /* A COUNT WITH NO CHOICE IS FILED AS IT ALWAYS WAS: one entry, no category. */
    const old = said<{ id: string }>(await api.create({ register: 'cash_counts', fields: { account: till.id, on: '2026-10-07', counted: { amount: 70_000, currency: 'EGP' } } }, owner));
    await settle();
    assert.deepEqual([ledger().at(-1)!.what, ledger().at(-1)!.category ?? null], ['Cash count difference', null]);
    assert.equal(count(old.id).said, 'Filed as one entry in the Ledger.');
    const before = ledger().length;

    /* A NOTE THAT IS NOT IN THE CURRENCY'S SET, lines above the difference, and a total that disagrees with the notes: each said on the count, nothing filed. */
    const odd = said<{ id: string }>(await api.create({ register: 'cash_counts', fields: { account: till.id, on: '2026-10-08', denominations: { currency: 'EGP', notes: { '500': 1 } } } }, owner));
    const over = said<{ id: string }>(
      await api.create({ register: 'cash_counts', fields: { account: till.id, on: '2026-10-08', counted: { amount: 60_000, currency: 'EGP' }, reconcile: 'lines', lines: [{ what: 'Rent', amount: 5_000 }] } }, owner),
    );
    const apart = said<{ id: string }>(
      await api.create({ register: 'cash_counts', fields: { account: till.id, on: '2026-10-08', counted: { amount: 1, currency: 'EGP' }, denominations: { currency: 'EGP', notes: { '10': 1 } } } }, owner),
    );
    await settle();
    assert.match(String(count(odd.id).said), /500 is not a EGP note or coin/);
    assert.match(String(count(over.id).said), /together they are more than the difference/);
    assert.match(String(count(apart.id).said), /not what the notes and coins add up to/);
    assert.equal(ledger().length, before);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
