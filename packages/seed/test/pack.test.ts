/**
 * The seed, through the pack format.
 *
 * THE ONLY CONTENT THIS PRODUCT SHIPS, run through the format it asks everybody else to use. A pack
 * format that works on the fixtures in its own tests and falls over on a register with transitions,
 * a metric with a `product`, a page with a template and a metric id with hyphens in it is a format
 * nobody finds out about until a customer writes one — and by then it is a published grammar.
 *
 * SO THIS IS THE DIFFERENTIAL TEST. The same declarations, installed both ways, have to produce the
 * same record: the same registers with the same fields, the same pages that draw, the same figures.
 * Anything else means the pack format is a second definition of what a declaration is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { AGENTS_REGISTERS, AUTOMATIONS, INGESTS, METRICS, PAGES, REGISTERS, RULES, declarations, ingestDeclarations, automationDeclarations, installSeed, metricDeclarations, packDocument, pageDeclarations, ruleDeclarations } from '../src/index.ts';

const NOW = Date.UTC(2026, 8, 3, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

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

/* ── it is a pack ────────────────────────────────────────────────────────── */

test('THE PRODUCT’S OWN SHAPE IS A LEGAL PACK, which is the test the format most needs', async () => {
  const pack = value<Pack>(await normalise(packDocument(), { kind: 'local' }));

  /* INGESTS COUNT, AND THEY DID NOT USED TO. The pack document carried registers, pages, metrics and
     rules; the arrival patterns shipped separately and a record got them only by another route. Now
     they are in the document, so the sum has a fifth term. Derived rather than typed out on purpose:
     a hard 85 here would go stale the next time a pattern is added, which is the whole failure this
     line exists to catch. */
  assert.equal(
    pack.declarations.length,
    Object.keys(REGISTERS).length + Object.keys(PAGES).length + Object.keys(METRICS).length + Object.keys(RULES).length + Object.keys(INGESTS).length + AUTOMATIONS.length,
  );
  assert.equal(pack.manifest.provides.length, pack.declarations.length, 'two declarations share an id');

  // Hyphens survive where they belong and nowhere else: a metric is an address, a register is SQL.
  assert.ok(pack.manifest.provides.includes('metric.owed-to-you'));
  assert.ok(pack.manifest.provides.every((id) => !id.startsWith('register.') || !id.includes('-')));

  // And a register comes out in the shape the record stores.
  const obligations = pack.declarations.find((d) => d.id === 'register.obligations')!;
  assert.equal((obligations.body as { id?: string }).id, 'obligations');
  assert.equal((obligations.body as { register?: string }).register, undefined, 'the document key survived into the stored body');
});

test('AND INSTALLING IT PRODUCES THE RECORD THE SEED DOES', async () => {
  /* Two ways to install one set of declarations is one way too many unless they agree. */
  const direct = await record();
  /* `ingestDeclarations()` IS IN THIS LIST NOW, and leaving it out is what made this test fail
     rather than what made it pass. The pack document gained the arrival patterns; the direct call
     here still named four of the five kinds, so the two sides installed different records and the
     test correctly said so. The point of the test is that the two ways agree, which means this
     list has to be the whole of what the seed installs, not most of it.
     `automationDeclarations()` JOINED IT FOR THE SAME REASON when Work 1.8.0 put two rules and their scripts in the
     document: with it left out, the pack side held `rule.close_follow_ups` and the direct side did not. */
  value(await direct.k.install([...declarations(), ...pageDeclarations(), ...metricDeclarations(), ...ruleDeclarations(), ...ingestDeclarations(), ...automationDeclarations()]));

  const viaPack = await record();
  const pack = value<Pack>(await normalise(packDocument()));
  const diff: Diff = await plan(pack, stateOf(viaPack.k));
  value(await install(pack, diff, hostFor(viaPack.k), diff.planHash));

  const shapes = (k: Kernel) =>
    k
      .declarations()
      .filter((d) => d.kind !== 'theme')
      .map((d) => [d.id, d.body] as [string, string])
      .sort((a, b) => a[0].localeCompare(b[0]));

  assert.deepEqual(shapes(viaPack.k), shapes(direct.k), 'the pack installed different declarations');

  // The pack row says what is installed, and every register drew its indexes.
  assert.deepEqual(viaPack.k.packs().map((p) => p.id), ['braindog-starter']);
  for (const register of Object.keys(REGISTERS)) assert.ok(viaPack.k.register(register), `${register} did not arrive`);

  direct.sql.close();
  viaPack.sql.close();
});

test('and its plan says what it would do before anybody has to read the file', async () => {
  const { k, sql } = await record();
  const diff = await plan(value<Pack>(await normalise(packDocument())), stateOf(k));

  assert.equal(diff.direction, 'install');
  assert.equal(
    diff.adds.length,
    Object.keys(REGISTERS).length + Object.keys(PAGES).length + Object.keys(METRICS).length + Object.keys(RULES).length + Object.keys(INGESTS).length + AUTOMATIONS.length,
  );
  assert.deepEqual(diff.conflicts, []);
  assert.equal(diff.orphans, 0);
  assert.deepEqual(diff.touches, { rows_read: 0, rows_written: 0 });
  assert.equal(diff.requires.format.ok, true);
  assert.ok(diff.seeds.count > 0, 'a pack that seeds nothing arrives as eight empty registers');
  sql.close();
});

test('AND EVERY SEED IS A ROW THE REGISTER WOULD HAVE ACCEPTED ANYWAY', async () => {
  /* A seed goes through the write path like anything else, so a seed the register refuses is an
     install that stops halfway — which is the one thing a pack must never do to somebody's record. */
  const { k, sql } = await record();
  const pack = value<Pack>(await normalise(packDocument()));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));

  /* ONE ROW A LIST, and categories as their starter set (ruling 341), so the seeds are counted by list. */
  const rows = new Map<string, number>();
  for (const seed of pack.seeds) rows.set(seed.register, (rows.get(seed.register) ?? 0) + 1);
  let seeded = 0;
  for (const [register, n] of rows) {
    assert.equal(k.count(register), n, `${register} does not hold its example rows`);
    for (let i = 1; i <= n; i++) assert.deepEqual(k.get(`${register}#${i}`)!.fields.tags, ['example'], `${register}'s example is not marked as one`);
    seeded += n;
  }
  assert.ok(seeded > 0);
  assert.ok((rows.get('categories') ?? 0) >= 6, 'categories arrive as a starter set');
  sql.close();
});

test('and taking it out keeps every row it seeded', async () => {
  const { k, sql } = await record();
  const pack = value<Pack>(await normalise(packDocument()));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
  const before = k.count('obligations');

  const { uninstall } = await import('@braindog/declare');
  const out = value<{ rows_kept: Record<string, number> }>(uninstall('braindog-starter', hostFor(k)));
  assert.equal(out.rows_kept.obligations, before);
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'obligations' AND deleted_at IS NULL").length, before);
  assert.deepEqual(k.packs(), []);
  sql.close();
});

/* ── and the demonstration is still a demonstration ──────────────────────── */

test('the full seed is a dataset and not a pack, and stays one', async () => {
  // Forty cross-linked rows are a demonstration; a pack's seeds are one example per register.
  const { k, sql } = await record();
  const out = value<{ rows: number; registers: number }>(await installSeed(k));
  assert.ok(out.rows > 30, 'the demonstration lost its rows');
  assert.equal(out.registers, Object.keys(REGISTERS).length + Object.keys(AGENTS_REGISTERS).length);
  sql.close();
});
