/**
 * A project's one line is typed on its card on Projects: the In play cards say `edit: true` on `about`
 * and on nothing else, the page still installs on a fresh record, and the line reaches the page the web draws.
 *
 * WHAT IS TYPED IS THE WEB'S (`apps/web/src/lib/page/card-writes.ts`), through the writer every page write uses. Here
 * the declaration alone: what Portfolio says, and that the record takes it. Six tiles or fewer before the fold is
 * `calm-pages.test.ts`'s, over every page.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { PORTFOLIO_PAGES } from '../src/modules/portfolio.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const PERSON = { actor: 'p_1' };

type Column = { field?: string; as?: string; edit?: boolean; metric?: string };
type Block = { kind: string; heading?: string; columns?: Column[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
});

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** A fresh record holding Projects and Work, and nothing else: no example entries. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const lists = (id: 'portfolio' | 'work') => firstPartyManifest(id).provides.filter((p) => p.startsWith('register.')).map((p) => p.slice('register.'.length));
  const holds = [...lists('portfolio'), ...lists('work')];
  await put(k, firstPartyDocument('portfolio', { seeds: [], holds }));
  await put(k, firstPartyDocument('work', { seeds: [], holds }));
  return k;
}

const blocksOf = (page: unknown): Block[] => ((page as { blocks?: Block[] }).blocks ?? []) as Block[];
const edited = (b: Block): string[] => (b.columns ?? []).filter((c) => c.edit === true).map((c) => c.field ?? c.metric ?? '?');

test('THE IN PLAY CARDS SAY edit ON about, AND NO OTHER COLUMN ON ANY PORTFOLIO PAGE DOES', () => {
  const inPlay = blocksOf(PORTFOLIO_PAGES.portfolio).filter((b) => b.kind === 'cards' && b.heading === 'In play');
  assert.equal(inPlay.length, 1, 'Projects has one In play tile');
  const about = inPlay[0]!.columns?.find((c) => c.field === 'about');
  assert.deepEqual(about, { field: 'about', as: 'reply', edit: true }, 'the one line under the name, typed on in place');
  for (const [slug, page] of Object.entries(PORTFOLIO_PAGES))
    for (const b of blocksOf(page)) assert.deepEqual(edited(b), b === inPlay[0] ? ['about'] : [], `${slug}: ${b.heading ?? b.kind}`);
});

test('THE DOCUMENT A RECORD INSTALLS CARRIES IT, so Projects on every record that has Portfolio is typed on', () => {
  const doc = firstPartyDocument('portfolio') as { declarations: Record<string, unknown>[] };
  const projects = doc.declarations.find((d) => d.page === 'portfolio');
  assert.ok(projects, 'Portfolio declares its Projects page');
  const inPlay = blocksOf(projects).find((b) => b.kind === 'cards' && b.heading === 'In play');
  assert.deepEqual(inPlay && edited(inPlay), ['about']);
});

test('PROJECTS STILL INSTALLS ON A FRESH RECORD, and its In play cards draw the line with edit on its column', async () => {
  const k = await fresh();
  const name = PROJECTS[0];
  value(k.create('things', { name, about: 'A small press, printed by hand', lane: 'building' }, PERSON));
  const out = k.page('portfolio');
  assert.ok(out.ok, sayOf(out));
  const inPlay = out.value.blocks.find((b) => b.kind === 'cards' && b.heading === 'In play');
  assert.ok(inPlay, 'In play is drawn while a project is in play');
  assert.deepEqual(inPlay.refusals, [], JSON.stringify(inPlay.refusals));
  assert.equal(inPlay.rows[0]?.fields.about, 'A small press, printed by hand');
  /* THE WEB READS `edit` OFF THE BLOCK'S COLUMNS (`BlockSlot.svelte`), so the evaluated page keeps it. */
  const columns = (inPlay as unknown as { columns?: Column[] }).columns ?? [];
  assert.equal(columns.find((c) => c.field === 'about')?.edit, true, JSON.stringify(columns));
});
