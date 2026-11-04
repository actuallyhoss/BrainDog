/**
 * An update that keeps a page the owner changed asks one question about what the page goes without (declare-edited-page-60).
 *
 * THE NIGHT PUT FOUNDER 2.6.0 IN OVER A HOME SOMEBODY HAD REARRANGED AND SAID NOTHING OF IT: the page was kept, and the
 * Late table and the title Today, which the version was written for, reached nobody. `declare` names what the page
 * lacks (`Diff.brings`, `keptQuestion`); this holds that the record asks it, through the update path a real record
 * takes (`slashTick`), and that each answer does what its words say.
 *
 * THE OLDER VERSION IS THE SEED'S OWN DOCUMENT with Home as 2.5.0 had it: called Overview, and with no table for what
 * is late (the shape `packages/declare/test/edited-page-update.test.ts` plans against).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shippedVersion } from '@braindog/seed/packs/quiet';
import { modulesFor, useCase } from '@braindog/seed/usecases';

import { costOf, pickCost } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';
import { seedCatalogue } from '../../seed/src/usecases/catalogue.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const PACK = 'usecase-founder';
const HOME = 'page.home-founder';

type Page = { page: string; title: string; blocks: { kind: string; heading?: string }[]; [key: string]: unknown };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record holding Founder 2.5.0, whose owner then moved Lapsing to the top of Home. */
async function record(now: { at: number }) {
  const sql = openSqlite();
  const catalogue = seedCatalogue();
  const api = await createRecordApi({ sql, clock: { now: () => now.at } as never, catalogue });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const put = async (id: string, older?: (doc: Record<string, unknown>) => Record<string, unknown>): Promise<void> => {
    const offered = catalogue.find((e) => e.id === id)!.doc({ holds: [...api.kernel.registers()].map(([list]) => list), usecase: 'founder' })! as Record<string, unknown>;
    const doc = older === undefined ? offered : older(offered);
    const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc, source: { kind: 'local' } }, owner));
    value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash }, owner));
  };
  /* A RECORD MADE BEFORE 2.7.0 HOLDS EVERY MODULE (founder 2.7.0 says `needs`). */
  for (const id of modulesFor(useCase('founder')!, ['people', ...useCase('founder')!.modules])) await put(id);
  await put(PACK, (doc) => ({
    ...doc,
    version: '2.5.0',
    declarations: (doc.declarations as Page[]).map((d) => (d.page === 'home-founder' ? { ...d, title: 'Founder home', blocks: d.blocks.filter((b) => b.heading !== 'Late') } : d)),
  }));
  const home = (): Page => JSON.parse(String(api.kernel.declarations().find((d) => d.id === HOME)!.body)) as Page;
  const was = home();
  assert.ok(was.blocks.some((b) => b.heading === 'Lapsing'), 'Home as 2.5.0 had it holds no Lapsing block to move');
  /* HIS OWN TITLE: the update's new words go in only where his page still says the pack's old ones (`reworded`). */
  const { page: slug, ...rest } = was;
  value(await api.setDeclaration({ body: { page: slug, ...rest, title: 'Overview', blocks: [...was.blocks.filter((b) => b.heading === 'Lapsing'), ...was.blocks.filter((b) => b.heading !== 'Lapsing')] } }, owner));
  return { api, sql, home };
}

const asked = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ id: string; status: string; body: string }>("SELECT id, status, body FROM suggestion WHERE body_kind = 'options' AND opened_by = 'system' AND json_extract(body, '$.about') LIKE '%you changed' ORDER BY rowid");
const holder = (sql: ReturnType<typeof openSqlite>): string | null =>
  sql.one<{ pack: string | null }>('SELECT pack_id AS pack FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0', HOME)?.pack ?? null;
const version = (api: Awaited<ReturnType<typeof createRecordApi>>) => api.kernel.packStates().find((p) => p.id === PACK)?.version;

test('THE NIGHT PUTS THE UPDATE IN, KEEPS THE PAGE, AND ASKS ONE QUESTION that names the Late table and the page\'s title', async () => {
  const now = { at: Date.UTC(2026, 9, 13, 3) };
  const { api, sql, home } = await record(now);
  await api.slashTick();

  assert.equal(version(api), shippedVersion(PACK), JSON.stringify(api.kernel.prefsOf('braindog:updates')));
  /* THE PAGE IS STILL THE OWNER'S: Overview, Lapsing first, no Late table. */
  assert.equal(holder(sql), null);
  assert.equal(home().title, 'Overview');
  assert.equal(home().blocks[0]?.heading, 'Lapsing');
  assert.equal(home().blocks.some((b) => b.heading === 'Late'), false);

  const open = asked(sql);
  assert.equal(open.length, 1);
  assert.equal(
    api.kernel.question(open[0]!.id),
    `Solo founder ${shippedVersion(PACK)} adds the Late table and the title Founder overview to your Overview page, which you changed. Your page is kept as you left it. Take the update's page, or keep yours.`,
  );
  const body = JSON.parse(open[0]!.body) as { about: string; options: { id: string; label: string; hard?: boolean }[] };
  assert.equal(body.about, `Solo founder ${shippedVersion(PACK)} adds to a page you changed`);
  assert.deepEqual(body.options.map((o) => [o.id, o.label]), [['keep', 'Keep my page'], ['take', "Take the update's page"]]);
  /* TAKING IS NOT PUT BACK BY UNDO, and the option says so. IT IS TAKING THAT IS HARD, NOT THE
     QUESTION: keeping changes nothing, so the question weighs as a call and each pick by its own. */
  assert.deepEqual(body.options.map((o) => o.hard === true), [false, true]);
  assert.equal(costOf('options', body), 'call');
  assert.equal(pickCost('options', body, 'take'), 'undo');
  assert.equal(pickCost('options', body, 'keep'), 'call');
  /* AND THE NIGHT'S LOG SAYS IT WAS ASKED. */
  const steps = (api.kernel.prefsOf('braindog:updates')['first-party'] as { steps: string[] }).steps;
  assert.ok(steps.includes(`Solo founder ${shippedVersion(PACK)} adds to a page you changed, and that is asked about on Decide.`), steps.join(' | '));

  /* THE NEXT NIGHT ASKS NOTHING MORE. */
  now.at += 86_400_000;
  await api.slashTick();
  assert.equal(asked(sql).length, 1);
  sql.close();
});

test("TAKE PUTS THE UPDATE'S PAGE IN UNDER THE ADD-ON, signed by whoever answered", async () => {
  const now = { at: Date.UTC(2026, 9, 13, 3) };
  const { api, sql, home } = await record(now);
  await api.slashTick();
  const q = asked(sql)[0]!;
  value(await api.decide({ id: q.id, decide: { option: 'take', reason: 'I want the Late table.' } }, owner));

  assert.equal(holder(sql), PACK);
  /* FOUNDER OVERVIEW, NOT TODAY, since Solo founder 3.8.0: Today is the record's own page (5496c124c). */
  assert.equal(home().title, 'Founder overview');
  assert.ok(home().blocks.some((b) => b.heading === 'Late'));
  assert.equal(api.kernel.detached().some((d) => d.id === HOME), false);
  const line = sql.one<{ actor: string; note: string | null }>("SELECT actor, note FROM event WHERE kind = 'declare' AND target = ? ORDER BY rowid DESC LIMIT 1", `declaration:${HOME}`);
  assert.equal(line?.actor, 'p_1');
  assert.equal(api.kernel.prefsOf('braindog:updates:kept')[q.id], undefined);
  /* AND THE NEXT NIGHT LEAVES IT THERE. */
  now.at += 86_400_000;
  await api.slashTick();
  assert.equal(holder(sql), PACK);
  assert.equal(asked(sql).filter((s) => s.status === 'open').length, 0);
  sql.close();
});

test('KEEP LEAVES THE PAGE AS IT WAS AND REMEMBERS WHAT WAS OFFERED, so the same table is not asked about again', async () => {
  const now = { at: Date.UTC(2026, 9, 13, 3) };
  const { api, sql, home } = await record(now);
  await api.slashTick();
  const q = asked(sql)[0]!;
  value(await api.decide({ id: q.id, decide: { option: 'keep', reason: 'Mine is how I work.' } }, owner));

  assert.equal(holder(sql), null);
  assert.equal(home().title, 'Overview');
  assert.deepEqual(api.kernel.prefsOf('braindog:updates:kept').declined, { [HOME]: ['block:table:Late', 'title:Founder overview'] });
  assert.equal(api.kernel.prefsOf('braindog:updates:kept')[q.id], undefined);
  sql.close();
});
