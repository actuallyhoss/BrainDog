/**
 * A proposal's step says what a pack lays on another pack's list and which values an update takes off stay, so Decide can
 * say both (`loop/research-held-landing.md`, brief E of wave forty-eight).
 *
 * THE STEP CARRIED `adds`, `changes`, `retires`, `keeps` AND `examples`, and neither of these. Measured on HEAD with the
 * seed catalogue before this landed: Personal set up on a fresh record filed its step as
 * `["pack","version","adds","examples"]`, so the five roles it lays on People (family, friend, landlord, tradesperson and
 * adviser) reached Decide as nothing at all. A People update that sheds `registrar` from a Personal record holding a
 * registrar row filed `{ adds: [], changes: ["register.people"] }`, while its plan kept the value on the list
 * (`stays: [{ id: "register.people", values: ["role.registrar"], rows: 1 }]`): the owner was asked about an update that
 * seemed to take a choice away, when it keeps it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY_VERSIONS } from '../../seed/src/index.ts';
import { seedCatalogue } from '../../seed/src/usecases/catalogue.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
type Step = { pack: string; from?: string; version: string; extends?: { id: string; adds: string[] }[]; stays?: { id: string; values: string[]; rows: number }[] };
type Decl = { register?: string; fields?: { id: string; values?: string[] }[] };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

/* THE MINOR ABOVE THE PEOPLE THAT SHIPS, read and not written, so raising People does not turn this red for a reason that
   is not its own. */
const [major, minor] = FIRST_PARTY_VERSIONS.people.split('.').map(Number) as [number, number];
const NEXT = `${major}.${minor + 1}.0`;

/** A record on the seed catalogue, whose People can be offered at `NEXT` without `registrar` once `shed()` is called. */
async function recordOf() {
  let shedding = false;
  const catalogue = seedCatalogue().map((e) =>
    e.id !== 'people'
      ? e
      : {
          ...e,
          get version() {
            return shedding ? NEXT : e.version;
          },
          doc: (o: Parameters<typeof e.doc>[0]) => {
            const doc = e.doc(o);
            if (!shedding || doc === null) return doc;
            for (const d of doc.declarations as Decl[])
              for (const f of d.register === 'people' ? (d.fields ?? []) : []) if (f.id === 'role') f.values = (f.values ?? []).filter((v) => v !== 'registrar');
            return { ...doc, version: NEXT };
          },
        },
  );
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 23, 12)), catalogue });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 's', name: 'S', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } });
  const planOf = async (body: Record<string, unknown>, kind: string): Promise<{ id: string; plan: Step[] }> => {
    const filed = value<{ id: string }>(await api.propose({ question: 'Take it?', body_kind: kind, body } as never, owner));
    return { id: filed.id, plan: value<{ body: { plan: Step[] } }>(await api.governance({ id: filed.id }, owner)).body.plan };
  };
  const accept = async (id: string) => value(await api.decide({ id, decide: { option: 'accept', reason: 'x' } } as never, owner));
  return { api, planOf, accept, shed: () => (shedding = true) };
}

test('PERSONAL SET UP SAYS WHAT IT LAYS ON PEOPLE, on its own step, by the values it adds', async () => {
  const { planOf } = await recordOf();
  const { plan } = await planOf({ why: ['x'], usecase: 'personal' }, 'arrange');
  const personal = plan.find((s) => s.pack === 'usecase-personal');
  assert.deepEqual(personal?.extends, [{ id: 'register.people', adds: ['role.family', 'role.friend', 'role.landlord', 'role.tradesperson', 'role.adviser'] }]);
  /* THE LIST'S OWN PACK LAYS NOTHING ON IT, and a step with nothing to say carries no key. */
  assert.equal('extends' in (plan.find((s) => s.pack === 'people') ?? {}), false, 'People was filed as extending its own list');
  assert.equal(plan.some((s) => 'stays' in s), false, 'a fresh record holds no rows, so no value stays');
});

test('A PEOPLE UPDATE THAT TAKES REGISTRAR OFF A PERSONAL RECORD HOLDING ONE SAYS IT STAYS, with the rows the list holds', async () => {
  const { api, planOf, accept, shed } = await recordOf();
  await accept((await planOf({ why: ['x'], usecase: 'personal' }, 'arrange')).id);
  value(api.kernel.create('people', { name: 'Ada', role: 'registrar' } as never, { actor: 'p_owner' }));
  shed();
  const { plan } = await planOf({ install: 'people' }, 'pack');
  const people = plan.find((s) => s.pack === 'people');
  assert.equal(people?.version, NEXT);
  assert.deepEqual(people?.stays, [{ id: 'register.people', values: ['role.registrar'], rows: 1 }]);
  /* AND PERSONAL'S ROLES, ALREADY ON THE LIST, ARE NOT SAID AS ADDED AGAIN: the update lays them back as they were. */
  assert.equal(plan.some((s) => 'extends' in s), false);
});
