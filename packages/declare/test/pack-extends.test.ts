/**
 * A pack that lays fields and enum values on a list another pack owns, through `extends` (`loop/research-shell-next.md`
 * Brief P, M1 and L1, `loop/DIRECTION.md` §22).
 *
 * TWO WAYS IN, AND BOTH WERE SHUT OR SILENT. Driven through `createRecordApi` on a record holding every first-party pack,
 * before `extends` existed:
 *
 *     a pack declaring register.things with one more field   PROVIDES_CONFLICT  register.things belongs to portfolio
 *     the same as an add-on file                             PROVIDES_CONFLICT  This add-on declares a list called things
 *     extends beside a page                                  ok, and a write of domain FIELD_UNKNOWN
 *     extends alone                                          PACK_MALFORMED     domains declares nothing
 *
 * The first two are right and stay: a module's list declared whole by a stranger is two owners of one list. The third is
 * the one that hurt, because it looked like it worked: the install answered `ok`, the key was dropped without a word,
 * and the field was never there. So every first-party list was the only place a field could live, and a household's
 * roles, a domain on a project and an importer's fields had nowhere to go.
 *
 * THE RECORD'S OWN PATH, NOT A HAND-BUILT `Installed`, for `plan-additive.test.ts`'s reason: the laid-over body is staged
 * with no pack, and whether the owning module's next update keeps it is a question only `detached()` answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Diff } from '../src/index.ts';
import { readPackFile } from '../src/catalogue.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown): Refusal => {
  const x = r as Out;
  assert.ok(!x.ok, 'it was accepted');
  return x.refusal!;
};

type Field = { id: string; type: string; values?: string[]; [k: string]: unknown };
type Doc = { version: string; declarations: Record<string, unknown>[]; [k: string]: unknown };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

async function recordOf(ids: readonly string[] = FIRST_PARTY): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)) });
  for (const id of ids) said(await put(api, firstPartyDocument(id)));
  return { api, close: () => sql.close() };
}

/** Plan and install, and the install's answer as it is: a refusal is a value here, for the tests that want one. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const planned = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;
  if (!planned.ok) return planned;
  const diff = (planned.value as { diff: Diff }).diff;
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> => said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

const listOf = (api: Api, id: string): { body: { fields: Field[] }; pack_id: string | null } => {
  const d = api.kernel.declarations().find((x) => x.id === `register.${id}`)!;
  return { body: JSON.parse(d.body) as { fields: Field[] }, pack_id: d.pack_id };
};

const DOMAIN: Field = { id: 'domain', label: 'Domain', type: 'url' };

/** A pack `domains` laying `domain` on Projects, with a page of its own unless `alone`. */
const domains = (version = '1.0.0', alone = false, extend: Record<string, unknown> = { 'register.things': { fields: [DOMAIN] } }) => ({
  pack: 'domains',
  version,
  summary: 'A domain on each project.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  extends: extend,
  ...(alone
    ? {}
    : {
        declarations: [
          { page: 'domains', title: 'Domains', requires: ['register.things'], blocks: [{ kind: 'table', heading: 'Every domain', source: 'register.things', columns: [{ field: 'name' }, { field: 'domain' }] }] },
        ],
      }),
});

test('M1: extends beside a page installs, and a row is then written with the field it lays on Projects', async () => {
  const { api, close } = await recordOf();
  said(await put(api, domains()));
  const things = listOf(api, 'things');
  assert.ok(things.body.fields.some((f) => f.id === 'domain'), 'the install answered ok and dropped extends without a word');
  const made = said<{ id: string }>(api.kernel.create('things', { name: 'acme.example', lane: 'earning', domain: 'https://acme.example/' }, { actor: 'p_1' }));
  assert.equal(api.kernel.get(made.id)!.fields.domain, 'https://acme.example/');
  close();
});

test('M1: extends alone is a pack that changes something, and installs', async () => {
  const { api, close } = await recordOf();
  said(await put(api, domains('1.0.0', true)));
  assert.ok(listOf(api, 'things').body.fields.some((f) => f.id === 'domain'));
  close();
});

test('the plan names what each pack lays on whose list, before anybody presses Install', async () => {
  const { api, close } = await recordOf();
  const diff = await planOf(api, domains());
  assert.deepEqual(diff.extends.map((e) => [e.id, e.adds]), [['register.things', ['domain']]]);
  assert.deepEqual(diff.conflicts, []);
  close();
});

test("L1 STAYS REFUSED: a module's list declared whole by another pack is still two owners of one list", async () => {
  const { api, close } = await recordOf();
  const things = (structuredClone(firstPartyDocument('portfolio')) as unknown as Doc).declarations.find((d) => d.register === 'things' && Array.isArray(d.fields)) as { fields: Field[] };
  const whole = {
    pack: 'domains',
    version: '1.0.0',
    summary: 'A domain on each project.',
    author: 'Halden',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ ...things, fields: [...things.fields, DOMAIN] }],
  };
  const r = refusal(await put(api, whole));
  assert.equal(r.code, 'PROVIDES_CONFLICT');
  assert.match(r.fix, /register\.things belongs to portfolio, and two packs cannot own one declaration/u);
  const file = refusal(await readPackFile(JSON.stringify(whole)));
  assert.equal(file.code, 'PROVIDES_CONFLICT');
  assert.match(file.fix, /This add-on declares a list called things, which belongs to BrainDog's Portfolio module/u);
  close();
});

test('the same file passes readPackFile, with extends in the pack it reads', async () => {
  const file = said<{ pack: { manifest: { extends?: unknown } } }>(await readPackFile(JSON.stringify(domains())));
  assert.deepEqual(file.pack.manifest.extends, { 'register.things': { fields: [DOMAIN] } });
});

test("Portfolio's next minor keeps the field extends laid on Projects, and the row written under it", async () => {
  const { api, close } = await recordOf();
  said(await put(api, domains()));
  const made = said<{ id: string }>(api.kernel.create('things', { name: 'acme.example', lane: 'earning', domain: 'https://acme.example/' }, { actor: 'p_1' }));
  /* STAGED WITH NO PACK, so it reads as the record's own from here and a later uninstall of Portfolio cannot take it. */
  assert.equal(listOf(api, 'things').pack_id, null);

  const [major, minor] = FIRST_PARTY_VERSIONS.portfolio.split('.').map(Number) as [number, number];
  const next = structuredClone(firstPartyDocument('portfolio')) as unknown as Doc;
  next.version = `${major}.${minor + 1}.0`;
  next.declarations = next.declarations.map((x) =>
    x.register === 'things' && Array.isArray(x.fields) ? { ...x, fields: [...(x.fields as Field[]), { id: 'launched', label: 'Launched', type: 'day' }] } : x,
  );
  const diff = await planOf(api, next);
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.kept.map((k) => [k.id, k.adds]), [['register.things', ['domain']]]);
  said(await put(api, next));
  const ids = listOf(api, 'things').body.fields.map((f) => f.id);
  assert.deepEqual(ids.slice(-2), ['launched', 'domain']);
  said(api.kernel.update('things', made.id, { launched: '2026-09-01' }, { actor: 'p_1' }));
  assert.deepEqual([api.kernel.get(made.id)!.fields.domain, api.kernel.get(made.id)!.fields.launched], ['https://acme.example/', '2026-09-01']);
  close();
});

test("a pack extending People's role with family installs, and family is then a role a row can hold", async () => {
  const { api, close } = await recordOf();
  const household = domains('1.0.0', true, { 'register.people': { values: { role: ['family'] } } });
  said(await put(api, { ...household, pack: 'household' }));
  const role = listOf(api, 'people').body.fields.find((f) => f.id === 'role')!;
  assert.deepEqual(role.values!.slice(-2), ['other', 'family']);
  said(api.kernel.create('people', { name: 'Mum', role: 'family' }, { actor: 'p_1' }));
  close();
});

test('installing the same extends again changes nothing and is not refused', async () => {
  const { api, close } = await recordOf();
  said(await put(api, domains()));
  const version = api.kernel.declarations().find((d) => d.id === 'register.things')!.version;
  const diff = await planOf(api, domains());
  assert.deepEqual(diff.extends.map((e) => [e.id, e.adds]), [['register.things', []]]);
  said(await put(api, domains()));
  assert.equal(api.kernel.declarations().find((d) => d.id === 'register.things')!.version, version);
  close();
});

test('extends naming a list the record lacks is refused at the plan, naming the list and the module that declares it', async () => {
  const { api, close } = await recordOf([]);
  const r = refusal(await api.planPack({ doc: domains('1.0.0', true), source: { kind: 'local' } } as never, owner));
  assert.equal(r.code, 'REGISTER_UNRESOLVED');
  assert.equal(r.at, 'extends.register.things');
  assert.match(r.fix, /things/u);
  assert.match(r.fix, /Install portfolio first/u);
  close();
});

test('a required field is refused at required, because extends lays only what every writer may leave out', async () => {
  const r = refusal(await normalise(domains('1.0.0', true, { 'register.things': { fields: [{ ...DOMAIN, required: true }] } })));
  assert.equal(r.code, 'PACK_MALFORMED');
  assert.equal(r.at, 'extends.register.things.fields.domain.required');
});

test('a field the list has already in another shape, and a value on a field that is not a closed list, are refused at install', async () => {
  const { api, close } = await recordOf();
  const other = refusal(await put(api, domains('1.0.0', true, { 'register.things': { fields: [{ id: 'name', type: 'url' }] } })));
  assert.equal(other.code, 'PROVIDES_CONFLICT');
  assert.equal(other.at, 'extends.register.things.fields.name');
  const open = refusal(await put(api, domains('1.0.0', true, { 'register.people': { values: { note: ['family'] } } })));
  assert.equal(open.code, 'VALUE_MALFORMED');
  assert.equal(open.at, 'extends.register.people.values.note');
  const none = refusal(await put(api, domains('1.0.0', true, { 'register.people': { values: { kin: ['family'] } } })));
  assert.equal(none.code, 'FIELD_UNKNOWN');
  assert.equal(none.at, 'extends.register.people.values.kin');
  close();
});

test('a pack cannot extend a list it declares itself: the field belongs in its own declaration', async () => {
  const doc = {
    ...domains('1.0.0', true, { 'register.shelves': { fields: [DOMAIN] } }),
    declarations: [{ register: 'shelves', name: 'Shelves', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
  };
  const r = refusal(await normalise(doc));
  assert.equal(r.code, 'PACK_MALFORMED');
  assert.equal(r.at, 'extends.register.shelves');
});

test('uninstalling the pack that extended a list leaves the field and what rows hold in it, as the record’s own', async () => {
  const { api, close } = await recordOf();
  said(await put(api, domains()));
  const made = said<{ id: string }>(api.kernel.create('things', { name: 'acme.example', lane: 'earning', domain: 'https://acme.example/' }, { actor: 'p_1' }));
  said(await api.uninstallPack({ id: 'domains' } as never, owner));
  assert.ok(listOf(api, 'things').body.fields.some((f) => f.id === 'domain'));
  assert.equal(api.kernel.get(made.id)!.fields.domain, 'https://acme.example/');
  said(api.kernel.update('things', made.id, { name: 'acme.example (live)' }, { actor: 'p_1' }));
  close();
});
