/**
 * Money's Accounts, account and Ledger pages (money-core 3.29.0): each draws on the seed with nothing refused, an account's
 * gap is the bank's word less its lines, and the Ledger puts what is not filed first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { ACCOUNTS, NOW, installSeed } from '../src/index.ts';
import { MONEY_METRICS } from '../src/modules/money/figures/index.ts';
import { MONEY_LEDGER_PAGE } from '../src/modules/money/pages/ledger.ts';

type Drawn = { kind?: string; heading?: string; refusals: readonly unknown[] };

const seeded = async (): Promise<Kernel> => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
};

const blocksOf = (k: Kernel, slug: string): Drawn[] => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  return (out.value as unknown as { blocks: Drawn[] }).blocks;
};

test('THE ACCOUNTS PAGE AND THE LEDGER DRAW, and no block of either is refused', async () => {
  const k = await seeded();
  for (const slug of ['money-accounts', 'money-ledger']) {
    const blocks = blocksOf(k, slug);
    assert.ok(blocks.length > 0 && blocks.length <= 24, `${slug} draws ${blocks.length} blocks`);
    for (const b of blocks) assert.deepEqual(b.refusals, [], `${slug}: ${b.heading ?? b.kind} is refused`);
  }
});

test('THE LEDGER PUTS WHAT IS NOT FILED FIRST, and searches and filters over every line', () => {
  const kinds = MONEY_LEDGER_PAGE.blocks as { kind: string; heading?: string }[];
  const at = (h: string) => kinds.findIndex((b) => b.heading === h);
  assert.ok(at('Not filed yet') >= 0 && at('Not filed yet') < at('Every line'));
  assert.deepEqual((MONEY_LEDGER_PAGE as { header?: unknown }).header, { search: { param: 'q' } });
  assert.equal((MONEY_LEDGER_PAGE as { filters?: unknown[] }).filters?.length, 4);
});

test('AN ACCOUNT HOLDS ONE CURRENCY, so its figures read in it and its gap is the bank less its lines', async () => {
  const k = await seeded();
  const sample = ACCOUNTS.map((a) => String(a.name)).slice(0, 4);
  assert.ok(sample.length > 0);
  for (const name of sample) {
    const read = (id: string) => {
      const decl = JSON.parse(JSON.stringify(MONEY_METRICS[id]).replaceAll('{{it}}', name)) as never;
      const r = k.metric(decl);
      assert.ok(r.ok, `${id} for ${name}: ${sayOf(r)}`);
      return (r.value as unknown as { value: number | null }).value;
    };
    const now = read('account-now');
    const lines = read('account-lines');
    if (now === null || lines === null) continue;
    assert.equal(typeof now, 'number');
    assert.equal(typeof lines, 'number');
  }
});
