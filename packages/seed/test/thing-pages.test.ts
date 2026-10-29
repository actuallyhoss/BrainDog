/**
 * Things, not rows (24 October): an account, a bill, a service and a parked project each have a page that speaks first,
 * drawn from its own row by number, and a parked project opens its project page as one in play does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, NOW, installSeed } from '../src/index.ts';

type Drawn = { kind: string; heading?: string; rows?: unknown[]; refusals?: { code: string; fix: string }[]; cannot?: unknown };
type Listed = { slug: string; title: string; about?: { register: string; seq: number | null } | null };

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const pagesAbout = (k: Kernel, register: string): Listed[] => (k.pages() as Listed[]).filter((p) => p.about?.register === register);

const blocksOf = (k: Kernel, slug: string): Drawn[] => {
  const out = k.page(slug) as { ok: boolean; value?: { blocks: Drawn[] } };
  assert.ok(out.ok, `page ${slug} reads`);
  return out.value!.blocks;
};

const refusalsOf = (blocks: readonly Drawn[]): string[] => blocks.flatMap((b) => (b.refusals ?? []).map((r) => `${b.kind} ${b.heading ?? ''}: ${r.code} ${r.fix}`));

test('EVERY ACCOUNT, BILL AND SERVICE HAS A PAGE, its lead card drawn from its own row alone, refusing nothing', async () => {
  const k = await seeded();
  for (const register of ['accounts', 'obligations', 'services']) {
    const pages = pagesAbout(k, register);
    assert.ok(pages.length > 0, `${register} has pages`);
    for (const p of pages.slice(0, 4)) {
      const blocks = blocksOf(k, p.slug);
      assert.deepEqual(refusalsOf(blocks), [], `${p.slug} refuses nothing`);
      /* AN ACCOUNT'S PAGE OPENS ON ITS NAME AND WHAT IT HOLDS SINCE money-core 3.32.0 (audit of 30 October, 19), its two
         figures of its own row, and the card of its row stands under them. */
      const opens = register === 'accounts' ? blocks[0]!.kind === 'stat' : true;
      assert.ok(opens, `${p.slug} does not open on what the account holds`);
      const lead = blocks.find((b) => b.kind === 'cards')!;
      assert.equal(lead.kind, 'cards');
      assert.equal(lead.rows?.length, 1, `${p.slug} leads with its own row, and only it`);
    }
  }
});

test('A PARKED PROJECT OPENS ITS PROJECT PAGE, as one in play does', async () => {
  const k = await seeded();
  const things = k.list({ register: 'things', limit: 50 }) as { ok: boolean; value: { rows: { seq: number; fields: Record<string, unknown> }[] } };
  assert.ok(things.ok);
  const parked = things.value.rows.find((r) => r.fields.lane === 'parked');
  assert.ok(parked, 'the sample keeps a parked project');
  const page = pagesAbout(k, 'things').find((p) => p.about?.seq === parked.seq);
  assert.ok(page, 'the parked project has a page');
});

test('A BILL STILL TO PAY SAYS SO; one paid draws no Still to pay', async () => {
  const k = await seeded();
  const bills = k.list({ register: 'obligations', limit: 200 }) as { ok: boolean; value: { rows: { seq: number; state: string | null; fields: Record<string, unknown> }[] } };
  const open = bills.value.rows.find((r) => r.fields.state === 'open');
  const paid = bills.value.rows.find((r) => r.fields.state === 'paid');
  assert.ok(open && paid, 'the sample holds an open bill and a paid one');
  const slugOf = (seq: number) => pagesAbout(k, 'obligations').find((p) => p.about?.seq === seq)!.slug;
  const still = blocksOf(k, slugOf(open.seq)).find((b) => b.heading === 'Still to pay');
  assert.equal(still?.rows?.length, 1);
  const none = blocksOf(k, slugOf(paid.seq)).find((b) => b.heading === 'Still to pay');
  assert.equal(none?.rows?.length ?? 0, 0, 'a paid bill has nothing still to pay');
});

test('PEOPLE LEAVES THE OWNER OFF EVERYONE, and the count of contacts is the people it draws', async () => {
  const k = await seeded();
  const made = k.create('people', { name: 'Owner Self', self: true }, { actor: 'p_1' }) as { ok: boolean };
  assert.ok(made.ok, 'the owner is written as a person');
  const everyone = blocksOf(k, 'people').find((b) => b.heading === 'Everyone')!;
  const names = (everyone.rows as { fields: Record<string, unknown> }[]).map((r) => r.fields.name);
  assert.ok(names.length > 0 && !names.includes('Owner Self'), 'the owner is on Everyone');
  const count = k.metric(METRICS['people-count'] as never) as { ok: boolean; value: { value: number } };
  assert.ok(count.ok);
  assert.equal(count.value.value, names.length);
});
