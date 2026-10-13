/**
 * A service's TYPE, said as a name: Server, Database, Storage and Network join the eight, since estate 2.2.0.
 *
 * WHY THIS FILE EXISTS. A record that came in from a cloud account brought four types of its own, a value each and no
 * label, and the Services page drew the month by type with a key where every other part read a name: "vm" beside
 * "Domain". The list had no word for a machine, a database, a bucket or what sits in front of them, so the importer
 * made one up for each.
 *
 * THREE THINGS ARE HELD HERE. The four are declared with their names. A record that added a type of its own keeps it
 * through the update that brings the four, with the rows that hold it. And a type nobody named is still read as words,
 * "Edge cache" and never `edge_cache`, in the month by type on the page.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';

import { FIRST_PARTY, NOW, firstPartyDocument } from '../src/index.ts';
import { gbp } from '../src/modules/base.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const OWNER = { actor: 'p_1' };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Field = { id: string; type: string; values?: string[]; labels?: Record<string, string>; [k: string]: unknown };
type Doc = { version: string; declarations: Record<string, unknown>[]; seeds?: unknown[]; [k: string]: unknown };
type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve?: unknown; stays: { id: string; values: string[] }[] };

const NAMED = { server: 'Server', database: 'Database', storage: 'Storage', network: 'Network' } as const;
const EIGHT = ['domain', 'hosting', 'saas', 'certificate', 'subscription', 'membership', 'insurance', 'utility'];

/** Estate with no example rows, so the only services on the record are the ones a test makes. */
const estate = (): Doc => structuredClone(firstPartyDocument('estate', { seeds: [] })) as unknown as Doc;

const kindIn = (doc: Doc): Field => {
  const services = doc.declarations.find((d) => d.register === 'services' && Array.isArray(d.fields)) as { fields: Field[] } | undefined;
  assert.ok(services, 'Estate declares Services');
  return services.fields.find((f) => f.id === 'kind')!;
};

/**
 * Estate as a record held it before the four: the eight types, and `own` after them with no label, which is how an
 * import adds a type. One version back, so the pack as it is now is an update to it.
 */
const before = (own: readonly string[]): Doc => {
  const d = estate();
  d.version = '2.1.0';
  for (const x of d.declarations) {
    if (x.register !== 'services' || !Array.isArray(x.fields)) continue;
    x.fields = (x.fields as Field[]).map((f) =>
      f.id === 'kind' ? { ...f, values: [...EIGHT, ...own], labels: Object.fromEntries(Object.entries(f.labels ?? {}).filter(([k]) => EIGHT.includes(k))) } : f,
    );
  }
  return d;
};

/** Estate as it is now, at a version after `before`'s whatever the table says today, so the plan is always an update. */
const now = (): Doc => {
  const d = estate();
  if (d.version === '2.1.0') d.version = '2.2.0';
  return d;
};

async function put(api: Api, doc: unknown): Promise<Diff> {
  const diff = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
  return diff;
}

/** A record with every first-party pack and no example rows, Estate as `doc`. */
async function recordOf(doc: Doc): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) await put(api, id === 'estate' ? doc : firstPartyDocument(id, { seeds: [] }));
  return { api, close: () => sql.close() };
}

const liveKind = (api: Api): Field => {
  const body = JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.services')!.body) as { fields: Field[] };
  return body.fields.find((f) => f.id === 'kind')!;
};

type Part = { label?: unknown; key?: unknown };
type Block = { kind: string; heading?: string; refusals?: { code: string; fix: string }[]; [k: string]: unknown };

/** Every word the month by type draws, whatever the block calls the place it keeps them. */
function monthByType(api: Api): { block: Block; words: string } {
  const blocks = said<{ blocks: Block[] }>(api.kernel.page('estate')).blocks;
  const block = blocks.find((b) => b.heading === 'Each month, by type');
  assert.ok(block, `no month by type among ${blocks.map((b) => b.heading).join(', ')}`);
  assert.deepEqual(block.refusals ?? [], [], 'the month by type was refused');
  return { block, words: JSON.stringify(block) };
}

const labelsOf = (block: Block): string[] => {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object') {
      const label = (v as Part).label;
      if (typeof label === 'string') out.push(label);
      Object.values(v).forEach(walk);
    }
  };
  walk(block);
  return out;
};

const service = (name: string, kind: string, minor: number): Record<string, unknown> => ({
  name,
  provider: 'Fenwick Cloud',
  kind,
  cost: gbp(minor),
  cycle: 'monthly',
  state: 'live',
});

test('SERVICES DECLARES SERVER, DATABASE, STORAGE AND NETWORK, each with its name, after the eight it had', () => {
  const kind = kindIn(estate());
  assert.deepEqual(kind.values, [...EIGHT, ...Object.keys(NAMED)], 'the eight keep their places and the four come after');
  for (const [value, name] of Object.entries(NAMED)) assert.equal(kind.labels?.[value], name);
  assert.deepEqual(
    (kind.values ?? []).filter((v) => typeof kind.labels?.[v] !== 'string' || kind.labels[v] === ''),
    [],
    'a type the pack declares with no name is drawn as its key',
  );
});

test('A SERVICE OF EACH NEW TYPE IS TAKEN, and the month by type says Server, Database, Storage and Network', async () => {
  const { api, close } = await recordOf(estate());
  let minor = 9_000;
  for (const value of Object.keys(NAMED)) said(api.kernel.create('services', service(`The ${value}`, value, (minor -= 1_000)), OWNER));
  const { block, words } = monthByType(api);
  const labels = labelsOf(block);
  for (const [value, name] of Object.entries(NAMED)) {
    assert.ok(labels.includes(name), `${name} is not among ${labels.join(', ')}`);
    assert.doesNotMatch(words, new RegExp(`"label":"${value}"`, 'u'), `${value} is drawn as its key`);
  }
  close();
});

/**
 * A RECORD'S OWN TYPE STAYS, WITH THE ROW THAT HOLDS IT. The update lists twelve types and the record's list holds
 * the eight and two of its own; `laidBack` lays the two back after the twelve because a row holds each, so the row can
 * still be edited, and the four arrive beside them.
 */
test("AN UPDATE TO THE FOUR KEEPS A TYPE THE RECORD ADDED ITSELF, and the row that holds it can still be edited", async () => {
  const { api, close } = await recordOf(before(['vm', 'edge_cache']));
  const vm = said<{ id: string }>(api.kernel.create('services', service('Build box', 'vm', 5_400), OWNER));
  said(api.kernel.create('services', service('Front of the site', 'edge_cache', 1_200), OWNER));
  const diff = await put(api, now());
  const kind = liveKind(api);
  assert.deepEqual(kind.values, [...EIGHT, ...Object.keys(NAMED), 'vm', 'edge_cache'], "the record's own two come after the pack's twelve");
  assert.deepEqual(diff.stays.map((s) => [s.id, s.values]), [['register.services', ['kind.vm', 'kind.edge_cache']]], 'the plan says which types it keeps');
  for (const [value, name] of Object.entries(NAMED)) assert.equal(kind.labels?.[value], name);
  said(api.kernel.update('services', vm.id, { note: 'Rebuilt in March' }, OWNER));
  assert.equal(api.kernel.get(vm.id)!.fields.kind, 'vm');
  said(api.kernel.create('services', service('The database', 'database', 2_000), OWNER));
  close();
});

/**
 * A TYPE NOBODY NAMED IS STILL WORDS. `edge_cache` has no label on the record's list, and the month by type reads it
 * "Edge cache": its first letter raised and its underscore a space (`wordsOf` in `packages/kernel/src/metrics.ts`),
 * never the key as it is stored. A person can then rename it, which is the only way it reads better than that.
 */
test('A TYPE WITH NO NAME IS DRAWN IN SENTENCE CASE, never as its key, beside the four that have one', async () => {
  const { api, close } = await recordOf(before(['vm', 'edge_cache']));
  said(api.kernel.create('services', service('Build box', 'vm', 5_400), OWNER));
  said(api.kernel.create('services', service('Front of the site', 'edge_cache', 1_200), OWNER));
  await put(api, now());
  said(api.kernel.create('services', service('The server', 'server', 3_000), OWNER));
  const { block, words } = monthByType(api);
  const labels = labelsOf(block);
  for (const name of ['Vm', 'Edge cache', 'Server']) assert.ok(labels.includes(name), `${name} is not among ${labels.join(', ')}`);
  for (const key of ['vm', 'edge_cache', 'server']) assert.ok(!labels.includes(key), `${key} is drawn as its key`);
  assert.doesNotMatch(words, /"label":"[a-z][a-z0-9]*_[a-z0-9_]*"/u, 'a label on the block still carries an underscore');
  close();
});
