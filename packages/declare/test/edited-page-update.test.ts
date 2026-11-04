/**
 * An update that meets a page the owner changed keeps the page and says what the page goes without.
 *
 * A KEPT PAGE WAS KEPT SILENTLY. `plan` leaves a page the owner rearranged out of what is staged, which is right, and
 * named it under `kept` and nothing more. Founder 2.6.0 was written for two things on Home, the Late table and the
 * title Today (Founder overview since round 1030, which the tests below read), and on a record whose owner had moved one block on Home neither arrived and nothing said so.
 *
 * SO THE PLAN NAMES WHAT THE UPDATE ADDS THAT THE OWNER'S PAGE LACKS (`Diff.brings`), and `keptQuestion` says it as
 * the one question Decide asks. The page is still kept and the install still goes through: the owner chooses.
 *
 * FOUNDER 2.6.0 IS THE SEED'S OWN DOCUMENT. The page as 2.5.0 had it is that page with the title it had then and
 * without the Late table, which is all this rule reads of it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, keptQuestion, normalise, plan, type Host, type Installed, type Pack } from '../src/index.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../seed/src/index.ts';
import { useCaseDocument } from '../../seed/src/usecases/index.ts';

type Body = { title: string; blocks: { kind: string; heading?: string }[]; [key: string]: unknown };

const HOME = 'page.home-founder';

const packOf = async (doc: unknown): Promise<Pack> => {
  const read = await normalise(doc, { kind: 'local' });
  assert.ok(read.ok, JSON.stringify(read));
  return read.value;
};

/* 2.6.0 AS THE SEED BUILDS IT: 2.7.0 lays what 2.6.0 laid word for word and adds only `needs` (usecase-needs-102). */
const founder = (): Promise<Pack> => packOf({ ...useCaseDocument('founder', '2026-10-13'), version: '2.6.0' });

/** Home as Founder 2.5.0 had it: called Overview, and with no table for what is late. */
const before = (now: Body): Body => ({ ...now, title: 'Overview', blocks: now.blocks.filter((b) => b.heading !== 'Late') });

/**
 * A record holding every first-party add-on and Founder 2.5.0, with Home as `edit` leaves it, or as the pack wrote
 * it when there is no edit. An edited page is the owner's (`pack_id` null) and `detached` holds what it started from.
 */
async function recordWith(next: Pack, edit?: (home: Body) => Body): Promise<Installed> {
  const declarations: Installed['declarations'] = [];
  const packs: Installed['packs'] = [];
  for (const id of FIRST_PARTY) {
    const pack = await packOf(firstPartyDocument(id));
    packs.push({ id: pack.manifest.pack, version: pack.manifest.version });
    for (const d of pack.declarations) declarations.push({ id: d.id, version: 1, kind: d.kind, pack_id: pack.manifest.pack, body: d.canonical, checksum: `c-${d.id}` });
  }
  const detached: Record<string, { was: string; body: string }> = {};
  for (const d of next.declarations) {
    if (d.id !== HOME) {
      declarations.push({ id: d.id, version: 1, kind: d.kind, pack_id: next.manifest.pack, body: d.canonical, checksum: `c-${d.id}` });
      continue;
    }
    const was = JSON.stringify(before(d.body as unknown as Body));
    if (!edit) {
      declarations.push({ id: d.id, version: 1, kind: d.kind, pack_id: next.manifest.pack, body: was, checksum: `c-${d.id}` });
      continue;
    }
    detached[d.id] = { was: next.manifest.pack, body: was };
    declarations.push({ id: d.id, version: 2, kind: d.kind, pack_id: null, body: JSON.stringify(edit(JSON.parse(was) as Body)), checksum: `e-${d.id}` });
  }
  return { format: 1, primitives: 1, record_version: 9, packs: [...packs, { id: next.manifest.pack, version: '2.5.0' }], declarations, rows: {}, detached };
}

/** The owner's edit: Lapsing moved to the top of Home. */
const lapsingFirst = (home: Body): Body => ({ ...home, blocks: [...home.blocks.filter((b) => b.heading === 'Lapsing'), ...home.blocks.filter((b) => b.heading !== 'Lapsing')] });

const host = (log: string[]): Host => ({
  count: () => 0,
  stage: async (batch) => (log.push(...batch.map((d) => `stage:${d.id}`)), { ok: true, value: () => ({ ok: true, value: null }) }),
  transaction: (fn) => fn(),
  reload: () => undefined,
  retire: () => ({ ok: true, value: null }),
  seed: () => ({ ok: true, value: { id: 'x' } }),
  remember: (row) => log.push(`pack:${row.id}@${row.version}`),
  forget: () => undefined,
  claimed: () => [],
});

const names = (id: string): string => (id === 'usecase-founder' ? 'Founder' : id === HOME ? 'your Home page' : id);

/* SINCE UP1 AND RH2 (31 Oct) THE TITLE IS CARRIED IN, as a word the owner's page still held as the pack's, and so it is
   not asked about again: only the Late table is. */
test('Founder 2.6.0 over an edited Home keeps the page, carries the title Founder overview and names the Late table', async () => {
  const next = await founder();
  assert.equal(next.manifest.version, '2.6.0');
  const diff = await plan(next, await recordWith(next, lapsingFirst));

  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.kept.map((k) => k.id), [HOME]);
  const kept = diff.kept[0]!;
  assert.ok(kept.rebased !== undefined);
  const page = JSON.parse(kept.rebased) as Body;
  assert.equal(page.title, 'Founder overview');
  assert.equal(page.blocks[0]?.heading, 'Lapsing', 'the owner’s arrangement was lost');
  assert.ok(!page.blocks.some((b) => b.heading === 'Late'), 'a block the update adds was laid on the owner’s page');
  assert.ok(kept.words?.includes('Founder overview'));
  assert.deepEqual(diff.brings, [{ id: HOME, blocks: [{ kind: 'table', heading: 'Late' }] }]);
  assert.deepEqual(keptQuestion(diff, names), {
    about: 'Founder 2.6.0 adds to a page you changed',
    line: "Founder 2.6.0 adds the Late table to your Home page, which you changed. Your page is kept as you left it. Take the update's page, or keep yours.",
    pages: [HOME],
  });
});

test('the install goes through and the owner’s page stays theirs, staged after the pack’s', async () => {
  const next = await founder();
  const diff = await plan(next, await recordWith(next, lapsingFirst));
  const log: string[] = [];
  const staged: { id: string; pack?: string; body: unknown }[] = [];
  const h = host(log);
  const put = await install(next, diff, { ...h, stage: async (batch) => (staged.push(...(batch as unknown as typeof staged)), h.stage(batch)) }, diff.planHash, diff.approve);

  assert.ok(put.ok, JSON.stringify(put));
  const last = staged.filter((d) => d.id === HOME).at(-1);
  assert.ok(last !== undefined && last.pack === undefined, 'the update staged over the page the owner changed');
  assert.equal((last.body as Body).blocks[0]?.heading, 'Lapsing');
  assert.ok(log.includes('pack:usecase-founder@2.6.0'));
});

test('one question however many things the page lacks, and it is asked once for the update', async () => {
  const next = await founder();
  const diff = await plan(next, await recordWith(next, lapsingFirst));
  const asked = keptQuestion(diff, names);

  assert.ok(asked);
  assert.deepEqual(asked.pages, [HOME]);
  assert.ok(!/[—–]/u.test(asked.line), 'a dash in words a person reads');
  assert.ok(!asked.line.includes('page.home-founder') && !asked.line.includes('usecase-founder'), 'an id in words a person reads');
});

test('an owner who already has a Late table and calls the page Founder overview is asked nothing', async () => {
  const next = await founder();
  const late = (next.declarations.find((d) => d.id === HOME)?.body as unknown as Body).blocks.find((b) => b.heading === 'Late');
  assert.ok(late);
  const theirs = (home: Body): Body => ({ ...lapsingFirst(home), title: 'Founder overview', blocks: [late, ...lapsingFirst(home).blocks] });
  const diff = await plan(next, await recordWith(next, theirs));

  assert.deepEqual(diff.kept, [{ id: HOME }]);
  assert.equal(diff.brings, undefined);
  assert.equal(keptQuestion(diff, names), null);
});

test('a block the owner took off is not offered back, only what the update adds', async () => {
  const next = await founder();
  const without = (home: Body): Body => ({ ...home, blocks: home.blocks.filter((b) => b.heading !== 'Lapsing') });
  const diff = await plan(next, await recordWith(next, without));

  /* THE TITLE IS CARRIED IN, as on the page above, so only the Late table is offered, and Lapsing is not. */
  assert.deepEqual(diff.brings, [{ id: HOME, blocks: [{ kind: 'table', heading: 'Late' }] }]);
  const page = JSON.parse(diff.kept[0]!.rebased!) as Body;
  assert.equal(page.title, 'Founder overview');
  assert.ok(!page.blocks.some((b) => b.heading === 'Lapsing'), 'the block the owner took off came back');
});

test('a page nobody changed is updated as before, with nothing kept and nothing asked', async () => {
  const next = await founder();
  const diff = await plan(next, await recordWith(next));

  assert.deepEqual(diff.kept, []);
  assert.ok(diff.changes.some((c) => c.id === HOME));
  assert.equal(keptQuestion(diff, names), null);
});

test('the sentence reads as a person would say it: no "a cards", no "table table", and the title is never counted away', () => {
  const pack = { id: 'usecase-founder', version: '2.6.0' } as Parameters<typeof keptQuestion>[0]['pack'];
  const line = (blocks: { kind: string; heading?: string }[], title?: string): string =>
    keptQuestion({ pack, brings: [{ id: HOME, blocks, ...(title === undefined ? {} : { title }) }] }, names)?.line.split(', which you changed')[0] ?? '';

  assert.equal(line([{ kind: 'cards' }, { kind: 'stat' }, { kind: 'table' }]), 'Founder 2.6.0 adds cards, figures and a table to your Home page');
  assert.equal(line([{ kind: 'table', heading: 'Late table' }]), 'Founder 2.6.0 adds the Late table to your Home page');
  assert.equal(
    line([{ kind: 'stat', heading: 'Cash' }, { kind: 'lines', heading: 'Runway' }, { kind: 'table', heading: 'Late' }, { kind: 'note', heading: 'Next' }], 'Today'),
    'Founder 2.6.0 adds the Cash figures, the Runway block, 2 more blocks and the title Today to your Home page',
  );
});
