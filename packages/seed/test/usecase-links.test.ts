/**
 * A use case's examples point at each other once they are in (`links.ts`): a seed carries no link (42 §5.2), so the
 * installer links them by title, only example rows whose field is still empty, and never fails for a refused write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { USE_CASES, modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';
import { exampleLinks, linkExamples, titleFieldOf, type LinkIo, type LinkRow } from '../src/usecases/links.ts';

const TODAY = dayOf(NOW);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

type Body = Record<string, unknown>;
const packOf = (id: string) => (useCase(id)!.pack ?? {}) as { declarations?: Body[]; seeds?: { register: string; fields: Body }[] };

test('EVERY LINK NAMES A REF FIELD AND TWO EXAMPLE ROWS THE USE CASE REALLY SEEDS', () => {
  let counted = 0;
  for (const u of USE_CASES) {
    const pack = packOf(u.usecase);
    for (const l of exampleLinks(u.usecase)) {
      counted += 1;
      const decl = pack.declarations?.find((d) => d.register === l.register);
      const field = (decl?.fields as Body[] | undefined)?.find((f) => f.id === l.field);
      assert.equal(field?.type, 'ref', `${u.usecase}: ${l.register}.${l.field}`);
      assert.equal(field?.to, l.to, `${u.usecase}: ${l.register}.${l.field} points at ${String(field?.to)}`);
      const seeded = (register: string, title: string) =>
        (pack.seeds ?? []).some((s) => s.register === register && s.fields[titleFieldOf(u.usecase, register) ?? ''] === title);
      assert.ok(seeded(l.register, l.title), `${u.usecase}: no example ${l.register} titled ${l.title}`);
      assert.ok(seeded(l.to, l.target), `${u.usecase}: no example ${l.to} titled ${l.target}`);
    }
  }
  assert.ok(counted >= 12);
  assert.deepEqual(exampleLinks('usecase-student'), exampleLinks('student'));
  assert.deepEqual(exampleLinks('business'), []);
});

test('ONLY AN EXAMPLE WITH THE FIELD EMPTY IS LINKED, AND A REFUSED WRITE IS SKIPPED', async () => {
  const rows: Record<string, LinkRow[]> = {
    courses: [{ seq: 4, fields: { name: 'Introduction to statistics', tags: ['example'] } }],
    assignments: [
      { seq: 1, fields: { what: 'Problem set 1: probability', tags: ['example'] } },
    ],
    study_sessions: [{ seq: 2, fields: { what: 'Go over the lecture on conditional probability', course: 'c_mine', tags: ['example'] } }],
  };
  const writes: string[] = [];
  const io: LinkIo = {
    rows: async (r) => rows[r] ?? null,
    link: async (register, seq, field, spoken) => {
      writes.push(`${register}#${seq}.${field}=${spoken}`);
      return true;
    },
  };
  assert.equal(await linkExamples(io, 'student'), 1);
  assert.deepEqual(writes, ['assignments#1.course=courses#4']);

  /* A ROW SOMEBODY WROTE, WITH THE SAME TITLE, IS NOT AN EXAMPLE AND IS LEFT ALONE; a refusal counts nothing. */
  writes.length = 0;
  rows.assignments = [{ seq: 1, fields: { what: 'Problem set 1: probability', tags: [] } }];
  assert.equal(await linkExamples(io, 'student'), 0);
  assert.deepEqual(writes, []);
  rows.assignments = [{ seq: 1, fields: { what: 'Problem set 1: probability', tags: ['example'] } }];
  assert.equal(await linkExamples({ ...io, link: async () => false }, 'student'), 0);
  assert.equal(await linkExamples({ rows: async () => { throw new Error('down'); }, link: io.link }, 'student'), 0);
});

test('ON A REAL RECORD, A STUDENT, A GUIDE AND A TEAM OPEN WITH THEIR EXAMPLES LINKED', async () => {
  for (const id of ['student', 'guide', 'team']) {
    const u = useCase(id)!;
    const sql = openSqlite();
    const k: Kernel = await openRecord(sql, fixedClock(NOW));
    const host: Host = {
      count: (register) => k.count(register),
      stage: (batch) => k.stageInstall(batch as never),
      transaction: (fn) => k.transaction(fn),
      reload: () => k.reload(),
      retire: (ids) => k.retire(ids),
      seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
      remember: (row) => k.rememberPack(row),
      forget: (x) => k.forgetPack(x),
      claimed: (pack) => k.packClaims(pack),
    };
    const held = () => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice(9));
    const put = async (doc: unknown) => {
      const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
      const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
      const diff = await plan(pack, state);
      value(await install(pack, diff, host, diff.planHash));
    };
    for (const m of modulesFor(u, ['people'])) {
      if (m === 'agents') continue;
      const holds = new Set([...held(), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
      await put(moduleDocument(u, m, { today: TODAY, holds }));
    }
    await put(carriedDocument(u, TODAY));

    const io: LinkIo = {
      rows: async (register) => {
        const read = k.list({ register, limit: 200 });
        return read.ok ? read.value.rows : null;
      },
      link: async (register, seq, field, spoken) => k.update(register, `${register}#${seq}`, { [field]: spoken }, { actor: 'p_owner', cascade: false }).ok,
    };
    const links = exampleLinks(id);
    assert.equal(await linkExamples(io, id), links.length, id);
    assert.equal(await linkExamples(io, id), 0, `${id}: a second pass links nothing again`);
    for (const l of links) {
      const row = value<{ rows: LinkRow[] }>(k.list({ register: l.register, limit: 50 })).rows.find((r) => r.fields[titleFieldOf(id, l.register)!] === l.title);
      assert.ok(row?.fields[l.field], `${id}: ${l.register} ${l.title} has no ${l.field}`);
    }
    sql.close();
  }
});
