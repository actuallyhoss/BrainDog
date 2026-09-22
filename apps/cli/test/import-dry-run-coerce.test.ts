/**
 * A dry run that says what the real run will refuse, a run's `tried` split without making a refusal of its own, and the
 * owner's local day where the importer used to take the UTC date.
 *
 * WHY THESE ARE ONE FILE. All three came out of one run of his real export (`loop/research-import-real.md`, findings 2,
 * 3 and 4): `--dry-run` ended 0 and promised 198 agent runs, the real run added 195 and ended 1, and one of the three it
 * lost was made by the planner itself, which split a `tried` on its line breaks and left an item holding the two
 * characters backslash and `n` with no line break beside it. The kernel's `TEXT_ESCAPED_NEWLINE` then refused an item
 * the whole string would have passed. So the tests here run against the kernel itself and not a stub, because what the
 * kernel refuses is the fact under test, and a stub would have to be taught it by hand.
 *
 * EVERY VALUE IS MADE UP. The titles, the runs' `tried` and the dates are invented to have the one shape each finding needs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hasEscapedNewline, openRecord, type Kernel } from '@braindog/kernel';
import { declarations } from '@braindog/seed';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import type { AgentIo } from '../src/skills.ts';
import { planLegacyTool } from '../src/legacy.ts';
import { applyPlan, importCommand, said, sinceSaid, type Door, type Run } from '../src/import.ts';

const NOW = Date.UTC(2026, 8, 22, 6);
const ACTOR = 'p_1';
const TODAY = '2026-09-22';

/** Line two of three holds a literal backslash-n in running text; the whole string has real line breaks either side. */
const TRIED = 'Ran the build\nPrinted the title, which came back as Line one\\nLine two\nGave up on the cache';
/**
 * A title holding the two characters backslash and `n` and no line break, which the kernel refuses as `doing`. Not a
 * Windows path: the kernel is being taught to let one of those through (finding 1), and this test is not about that.
 */
const PRINTED = 'Printed Line one' + String.fromCharCode(92) + 'nLine two as the title';

const exportOf = () => ({
  takenAt: '2026-09-21T22:30:00.000Z',
  rev: 7,
  db: { entities: [], events: [{ id: 'EV1', title: 'Filing window closes', kind: 'deadline', date: '2026-09-20' }] },
  sessions: [
    { id: 'S1', title: 'Title parser', state: 'done', tried: TRIED },
    { id: 'S2', title: PRINTED, state: 'done' },
  ],
});

async function record(): Promise<{ sql: { close: () => void }; kernel: Kernel }> {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(NOW));
  const put = await kernel.install(declarations() as never);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  return { sql, kernel };
}

/** The kernel behind `applyPlan`'s door, as `test/import-note.test.ts` builds it. */
function doorOf(kernel: Kernel): Door {
  return {
    schema: async (register) => {
      const decl = kernel.register(register);
      return decl ? { ok: true, value: decl } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } };
    },
    list: async ({ register, limit, cursor }) =>
      kernel.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined || cursor === null ? {} : { cursor }) }),
    create: async ({ register, fields, note }) => kernel.create(register, fields, { actor: ACTOR, ...(note === undefined ? {} : { note }) }),
    update: async ({ register, seq, patch, version, note }) =>
      kernel.update(register, `${register}#${String(seq)}`, patch, { actor: ACTOR, ...(version === undefined ? {} : { version }), ...(note === undefined ? {} : { note }) }),
    governance: async () => ({ ok: true, value: [] }),
    propose: async (p) => kernel.propose(p as never, ACTOR),
  };
}

test('A TRIED SPLIT ON ITS LINE BREAKS KEEPS A LITERAL BACKSLASH-N BESIDE A REAL ONE, so the kernel takes the run whole', async () => {
  assert.equal(hasEscapedNewline(TRIED), false, 'the whole string is one the kernel accepts, which is the premise');
  const plan = planLegacyTool(exportOf(), TODAY);
  const run = plan.rows.find((r) => r.key === 'legacy:session:S1');
  assert.ok(run, 'the run was not planned');
  const tried = run.fields.tried as string[];
  assert.deepEqual(
    tried.filter((item) => hasEscapedNewline(item)),
    [],
    'the split made an item the kernel refuses, where the string it came from was one it accepts',
  );
  assert.deepEqual(tried, ['Ran the build\nPrinted the title, which came back as Line one\\nLine two', 'Gave up on the cache'], 'nothing of the text was lost or changed');

  const { sql, kernel } = await record();
  const report = await applyPlan(plan, doorOf(kernel), { dryRun: false });
  assert.deepEqual(report.refused.filter((r) => r.label === 'S1'), [], 'the kernel refused the run the planner split');
  sql.close();
});

test('A DRY RUN NAMES THE ROW THE REAL RUN IS REFUSED, in the same sentence, and promises no row it will not deliver', async () => {
  const plan = planLegacyTool(exportOf(), TODAY);
  const { sql, kernel } = await record();
  const dry = await applyPlan(plan, doorOf(kernel), { dryRun: true });
  const real = await applyPlan(plan, doorOf(kernel), { dryRun: false });
  sql.close();

  assert.equal(real.refused.length, 1, `the real run was expected to lose S2 over its title: ${JSON.stringify(real.refused)}`);
  assert.equal(real.refused[0]!.label, 'S2');
  assert.match(real.refused[0]!.fix, /^doing contains the two characters backslash and n.*\(TEXT_ESCAPED_NEWLINE\)$/u);
  assert.deepEqual(dry.refused, real.refused, 'the dry run said nothing of what the real run was refused');
  assert.deepEqual(dry.tally.session, real.tally.session, 'the dry run counted as added a run the record refuses');
  assert.equal(dry.outcomes['legacy:session:S2'], 'refused');

  const printed = said(dry, { dryRun: true, file: 'export.json' });
  const at = printed.indexOf('Would be refused by the record:');
  assert.ok(at >= 0, `no refusal block in the dry run: ${printed.join(' | ')}`);
  assert.equal(printed[at + 1], said(real, { dryRun: false, file: 'export.json' }).find((l) => l.startsWith('- S2 ')), 'the dry run said it in other words');
});

/* THE SECOND IMPORT ASKS THE SAME QUESTION OF AN UPDATE. A run already in the record whose title later arrives as one
   the kernel refuses is a patch, not a create, and goes down a branch of its own in `applyPlan`; with the check taken
   out of that branch alone, the other four tests in this file all still passed. */
test('A DRY RUN OF A SECOND IMPORT NAMES THE UPDATE THE REAL RUN IS REFUSED, not just the create', async () => {
  const { sql, kernel } = await record();
  const first = exportOf();
  first.sessions[1]!.title = 'Printed the title';
  assert.deepEqual((await applyPlan(planLegacyTool(first, TODAY), doorOf(kernel), { dryRun: false })).refused, []);

  const plan = planLegacyTool(exportOf(), TODAY);
  const dry = await applyPlan(plan, doorOf(kernel), { dryRun: true });
  const real = await applyPlan(plan, doorOf(kernel), { dryRun: false });
  sql.close();

  assert.equal(real.refused.length, 1, `the real run was expected to refuse the new title: ${JSON.stringify(real.refused)}`);
  assert.deepEqual(dry.refused, real.refused, 'the dry run counted as updated a run the record refuses');
  assert.equal(dry.outcomes['legacy:session:S2'], 'refused');
  assert.deepEqual(dry.tally.session, real.tally.session);
});

/** The kernel on node:http, answering the six methods the importer calls the way the host does. */
async function host(kernel: Kernel): Promise<{ server: Server; base: string }> {
  const door = doorOf(kernel);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const method = url.pathname.replace(/^\/api\//u, '');
    let text = '';
    req.on('data', (c: Buffer) => (text += c.toString('utf8')));
    req.on('end', () => {
      const args: Record<string, unknown> = text ? (JSON.parse(text) as Record<string, unknown>) : Object.fromEntries(url.searchParams);
      if (typeof args.limit === 'string') args.limit = Number(args.limit);
      /* `schema` alone takes the register bare, as `packages/client` hands it on; every other door takes the arguments. */
      const call = method === 'schema' ? () => door.schema(String(args.register)) : (door as unknown as Record<string, (a: unknown) => Promise<unknown>>)[method];
      void (call ? call(args) : Promise.resolve({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: method } })).then((answer) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(answer));
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}` };
}

test('THE DRY RUN ENDS AS THE REAL RUN DOES, 1 over a row the record refuses, and the plan is made on the local day', async (t) => {
  const { sql, kernel } = await record();
  const { server, base } = await host(kernel);
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  t.after(() => sql.close());
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-dry-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'export.json'), JSON.stringify(exportOf()));
  const out: string[] = [];
  const io: AgentIo = { env: { BRAINDOG_HOST: base, BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never, cwd: dir, home: dir, out: (l) => out.push(l), say: () => {}, headers: async () => ({}) };

  /* 01:30 UTC on the 21st is 22:30 on the 20th at -03:00. The date is due on the 20th, so on the owner's day it is due
     today and still open; on the UTC date, or on whatever day the machine running this test is in, it is already past. */
  const now = () => new Date('2026-09-21T01:30:00.000Z');
  const west = () => -180;

  assert.equal(await importCommand(['legacy', 'export.json', '--dry-run'], io, undefined, now, west), 1, `the dry run ended 0: ${out.join(' | ')}`);
  assert.ok(out.includes('Would be refused by the record:'), 'the dry run printed no refusal block');
  const dryLines = out.splice(0);

  assert.equal(await importCommand(['legacy', 'export.json'], io, undefined, now, west), 1);
  assert.deepEqual(
    dryLines.filter((l) => l.startsWith('- S2 ')),
    out.filter((l) => l.startsWith('- S2 ')),
    'the refusal the dry run printed is not the one the real run printed',
  );

  const tasks = await kernel.list({ register: 'tasks', limit: 50 });
  assert.ok(tasks.ok);
  const date = tasks.value.rows.find((r) => (r.fields as { what?: unknown }).what === 'Filing window closes');
  assert.equal((date?.fields as { state?: unknown } | undefined)?.state, 'open', 'the plan was made on a day other than the owner\'s');
});

test('--since GIVES THE EXPORT\'S DAY IN THE SAME ZONE AS THE HEADER IT SITS BESIDE', () => {
  const run: Run = { at: '2026-09-22T00:10:00.000Z', host: 'home', file: 'export.json', taken: '2026-09-21T22:30:00.000Z', created: [], updated: [], refused: [], skipped: [] } as unknown as Run;
  const east = () => 180;
  assert.equal(sinceSaid([run], 'last', east).lines[0], '2026-09-22 03:10 +03:00 into home, export of 2026-09-22:');
});
