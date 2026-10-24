/**
 * A PROJECT'S PAGE ON A RECORD STILL ON AN OLDER USE CASE draws its whole shape (the audit of 25 October, Z1): founder
 * 3.2.0 and team 2.24.0 declare no `project` block, since the shape became blocks only in founder 3.3.0 and team
 * 2.25.0, and such a page drew no name, no hero and nothing of its work, blank on a phone. The page's own answer still
 * carries the shape, and the page is drawn with the two blocks the newer versions declare (`withShape`).
 *
 * ON A REAL RECORD: each use case installed as onboarding installs it, its project page put back as it was declared at
 * the version before the shape's blocks, and its version said so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../record/fixtures/fill.ts';
import * as held from '../record/held.ts';
import { blockOf, type LiveBlock } from '../record/page-live.ts';
import { partsOf } from './kinds/project.ts';
import { partsLaid } from './project-parts.ts';
import { onProject, SHAPE_DEFAULT, withShape } from './project-page.ts';
import { shapeFrom } from './shape-answer.ts';

/* LOADED BY A RUNTIME URL so the web's typecheck does not walk the record's sources, which other packages own. */
const at = (p: string) => new URL(`../../../../../packages/${p}`, import.meta.url).href;
const { createRecordApi } = await import(at('record/src/index.ts'));
const { fixedClock, openSqlite } = await import(at('kernel/test/sqlite.ts'));
const { install, normalise, plan } = await import(at('declare/src/index.ts'));
const { NOW, firstPartyManifest } = await import(at('seed/src/index.ts'));
const { modulesFor, useCase } = await import(at('seed/src/usecases/index.ts'));
const { carriedDocument, dayOf, moduleDocument } = await import(at('seed/src/usecases/install.ts'));

type Body = Record<string, unknown>;
const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const ok = <T>(r: { ok: boolean; value?: T; refusal?: { code: string; fix: string; at?: string } }): T => {
  assert.ok(r.ok, `${r.refusal?.code} at ${r.refusal?.at}: ${r.refusal?.fix}`);
  return r.value as T;
};

/** The version each use case was on before its project page declared the shape as blocks: his record's founder is on it. */
const BEFORE: Record<string, string> = { founder: '3.2.0', team: '2.24.0' };

/** Handed back or blocked and Money by month, as the project page declared them before the shape's blocks. */
const HANDED_BACK: Body = {
  kind: 'todo',
  heading: 'Handed back or blocked',
  icon: 'hourglass',
  span: 12,
  area: 'rail',
  source: 'register.tasks',
  where: 'thing is {{name}}, state is review or blocked',
  columns: [{ field: 'what' }, { field: 'state' }],
  order: [{ field: 'by', dir: 'asc' }],
  limit: 6,
  when: { metric: 'project-held-up:{{name}}', gt: 0 },
  empty: 'Nothing on {{name}} is handed back or blocked.',
};
const MONEY_BY_MONTH: Body = {
  kind: 'series',
  heading: 'Money by month',
  icon: 'chart-column',
  span: 12,
  series: [
    { metric: 'project-in-by-month:{{name}}', label: 'Money in' },
    { metric: 'project-out-by-month:{{name}}', label: 'Money out', dir: 'out' },
  ],
  back: 12,
  net: true,
};

/** The project page as the version before declared it: no `project` block, as `seed/test/quiet-update.test.ts` undoes it. */
const shapeBefore = (doc: Body, id: string): Body => ({
  ...doc,
  version: BEFORE[id],
  declarations: (doc.declarations as Body[]).map((d) =>
    d.page !== 'project'
      ? d
      : {
          ...d,
          blocks: (d.blocks as Body[]).flatMap((b): Body[] => {
            if (b.kind === 'project') return [];
            if (b.kind === 'section' && b.box === true && b.fold === true) return [(({ fold: _fold, ...section }) => section)(b)];
            if (b.key === 'stands-figures') return [b, HANDED_BACK];
            if (b.kind === 'note' && b.document === true && id === 'founder') return [b, MONEY_BY_MONTH];
            if (b.kind === 'feed' && b.heading === 'What changed') return [{ ...b, span: 6 }];
            if (b.kind === 'cards' && b.heading === 'Agents') return [{ ...b, span: 6 }];
            return [b];
          }),
        },
  ),
});

/** A record of the use case `id` made as onboarding makes one, its project page at the version before the shape's blocks. */
async function recordBefore(id: string) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const k = api.kernel;
  ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAZ', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  const host = {
    count: (register: string) => k.count(register),
    stage: (batch: unknown) => k.stageInstall(batch),
    transaction: (fn: () => unknown) => k.transaction(fn),
    reload: () => k.reload(),
    retire: (ids: string[]) => k.retire(ids),
    seed: (register: string, fields: Body) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }),
    remember: (row: unknown) => k.rememberPack(row),
    forget: (pack: string) => k.forgetPack(pack),
    claimed: (pack: string) => k.packClaims(pack),
  };
  const state = () => ({ format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations(), rows: k.census(), config: k.packSettings() });
  const put = async (doc: unknown) => {
    const pack = ok(await normalise(doc, { kind: 'local' }));
    const diff = await plan(pack, state());
    ok(await install(pack, diff, host, diff.planHash));
  };
  const lists = () => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));
  const today = dayOf(NOW);
  const u = useCase(id);
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...lists(), ...firstPartyManifest(m).provides.flatMap((p: string) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(moduleDocument(u, m, { today, holds, examples: true }));
  }
  await put(shapeBefore(carriedDocument(u, today, null, { examples: true }), id));
  return { sql, api, k };
}

for (const id of ['founder', 'team']) {
  test(`${id.toUpperCase()} ${BEFORE[id]}: A PROJECT'S PAGE THAT DECLARES NO PART OF ITS SHAPE IS DRAWN WITH ALL OF IT`, async () => {
    const { sql, api, k } = await recordBefore(id);
    try {
      assert.equal(k.packs().find((p: { id: string }) => p.id === `usecase-${id}`)?.version, BEFORE[id], 'the record is on the version before');
      const found = k.pages().find((p: { template?: string }) => p.template === 'project');
      assert.ok(found, 'the use case makes a page for a project');
      const page = ok<{ param: { register: string; seq: number }; blocks: Body[]; shape?: unknown }>(await api.page({ slug: found.slug, shape: true }, owner));
      assert.ok(!page.blocks.some((b) => b.kind === 'project'), 'the page declares no part of the shape, as his does');

      /* THE RECORD STILL ANSWERS THE SHAPE beside such a page. */
      assert.ok(page.shape, 'the page carries its shape');
      for (const [list, decl] of k.registers() as Iterable<[string, unknown]>) (held.REGISTERS as Record<string, unknown>)[list] = decl;
      const io = (async () => new Response(JSON.stringify({ ok: true, value: { rows: [], cursor: null, matched: 0 } }), { status: 200 })) as typeof fetch;
      const read = await shapeFrom('https://record.test', page.shape, io);
      assert.ok(read, 'and it is turned into what the parts draw');
      const title = held.REGISTERS[page.param.register]!.title;
      assert.ok(String(read.fields[title] ?? '').trim() !== '', 'the hero has the project’s name to draw');

      /* AND THE PAGE IS DRAWN WITH THE TWO BLOCKS THE NEWER VERSIONS DECLARE, after its own, so every write keeps its index. */
      const drawn = page.blocks.map((b) => blockOf(b as never, new Map(), NOW));
      const parted = withShape(drawn, (raw) => blockOf({ ...raw, parts: [...raw.parts], rows: [], matched: 0, refusals: [] } as never, new Map(), NOW));
      assert.equal(parted.length, drawn.length + 2);
      assert.deepEqual(parted.slice(0, drawn.length), drawn, 'the declared blocks are where they were');
      const shaped = onProject(parted as (LiveBlock & { key?: string })[], page.param.register);
      const laid = partsLaid(shaped, { hero: true, path: true, money: true, work: true, people: true, runsOn: true, today: false, band: true, known: true });
      const parts = laid.filter((b) => b.kind === 'project' && b.drawn).flatMap((b) => partsOf(b) ?? []);
      assert.deepEqual(parts, ['hero', 'path', 'money', 'what-is-open', 'who-is-on-it', 'runs-on', 'agents-here'], 'the name, the hero, Runs on and the agents are drawn');
    } finally {
      sql.close();
    }
  });
}

test('THE DEFAULT IS WHAT THE CURRENT VERSIONS DECLARE, and a page that declares its parts is left as it is', async () => {
  for (const id of ['founder', 'team']) {
    const project = (useCase(id).pack.declarations as Body[]).find((d) => d.page === 'project')!;
    const declared = (project.blocks as Body[]).filter((b) => b.kind === 'project').map((b) => b.parts);
    assert.deepEqual(declared, SHAPE_DEFAULT.map((d) => [...d.parts]), `${id} declares the parts the default draws`);
  }
  const own = [{ kind: 'project', parts: ['hero'] }, { kind: 'note' }];
  assert.deepEqual(withShape(own, () => ({ kind: 'never' })), own);
});
