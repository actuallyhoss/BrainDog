/**
 * Personal brings its own words for the people in a life, through `extends`, in place of relabelling a studio's.
 *
 * AN AGENT TOLD "FAMILY" WAS REFUSED. Personal gave People's studio values a person's words (`client` read as Family,
 * `registrar` as Landlord), so the screen said Family and the list did not have it. Driven on a record made the way
 * onboarding makes a Personal one, before this change:
 *
 *     role: family     ENUM_VALUE_UNKNOWN: role has no value family.
 *     role: landlord   ENUM_VALUE_UNKNOWN: role has no value landlord.
 *     role: client     ok
 *
 * So the words a person reads were not words anybody could write. Personal now lays its five on People's `role` as
 * values of the list, and the relabels go, because kept they would offer each word twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, labelsOf, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);

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
  config: k.packSettings(),
});

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

/** A record made the way onboarding makes one, as `usecase-install.test.ts` makes it: each module, then the use case's pack. */
async function made(id: string): Promise<{ k: Kernel; sql: NodeSql }> {
  const u = useCase(id)!;
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  const carried = carriedDocument(u, TODAY, null, { examples: true });
  if (carried) await put(k, carried);
  return { k, sql };
}

const roleOf = (k: Kernel): { values: string[] } => {
  const body = JSON.parse(k.declarations().find((d) => d.id === 'register.people')!.body) as { fields: { id: string; values?: string[] }[] };
  return body.fields.find((f) => f.id === 'role') as { values: string[] };
};

const WORDS = ['family', 'friend', 'landlord', 'tradesperson', 'adviser'];

test('a Personal record takes family and landlord as roles, and still takes client', async () => {
  const { k, sql } = await made('personal');
  value(k.create('people', { name: 'Mum', role: 'family' }, { actor: 'p_1' }));
  value(k.create('people', { name: 'Harbour Lettings', role: 'landlord' }, { actor: 'p_1' }));
  for (const role of WORDS) value(k.create('people', { name: `Somebody ${role}`, role }, { actor: 'p_1' }));
  value(k.create('people', { name: 'A client of mine', role: 'client' }, { actor: 'p_1' }));
  sql.close();
});

test('Family is offered once: a value of the list, and no longer a relabel of client', async () => {
  const { k, sql } = await made('personal');
  const role = roleOf(k);
  for (const word of WORDS) assert.equal(role.values.filter((v) => v === word).length, 1, `${word} is not offered exactly once`);
  assert.deepEqual(role.values.slice(-WORDS.length), WORDS, "Personal's words do not come after People's own");
  /* A RELABEL IS OVER A STUDIO VALUE ONLY, AND NEVER ONE OF THE FIVE WORDS, so no word is offered twice: once as its own
     value and once over a studio's, which is why 1.5.0 took the old relabels away. */
  const labels = useCase('personal')!.labels;
  const over = Object.keys(labels).filter((key) => key.startsWith('people.role.')).map((key) => key.slice('people.role.'.length));
  assert.deepEqual(over.filter((v) => WORDS.includes(v)), []);
  assert.ok(!Object.values(labels).some((word) => ['Family', 'Friend', 'Landlord', 'Tradesperson', 'Adviser'].includes(word)));
  sql.close();
});

/* THE STUDIO'S WORDS A HOUSEHOLD IS OFFERED, which are four of the five People's own list starts with. `registrar` is
   also one of the ten words `tools/gates/shell-words.mjs` keeps out of the core as a studio's. */
const STUDIO = ['client', 'contractor', 'accountant', 'registrar'];

/* THE WORDS A HOUSEHOLD IS OFFERED, as the form draws them: each value by the record's label for it, else its own.
   Run against 1.5.0 the household was offered client, contractor, accountant, registrar, collaborator, other, family,
   friend, landlord, tradesperson, adviser. THE OWNER'S CALL: relabel the studio's values in a
   household's words rather than hide them, because a hidden value leaves a row that holds one with a word the form no
   longer knows. The studio's values stay on the list, since the first test above still writes `client`. */
test("a household's People picker offers none of the studio's words, and no word twice", async () => {
  const { k, sql } = await made('personal');
  const read = k.packConfig('usecase-personal');
  assert.ok(read.ok, 'Personal holds no settings');
  const labels = labelsOf(read.value.values as Record<string, unknown>, read.value.config as never);
  const shown = roleOf(k).values.map((v) => labels[`people.role.${v}`] ?? v);
  sql.close();
  assert.deepEqual(shown.filter((w) => STUDIO.some((s) => w.toLowerCase().includes(s))), [], `a household is offered ${shown.join(', ')}`);
  assert.equal(new Set(shown.map((w) => w.toLowerCase())).size, shown.length, `a word is offered twice: ${shown.join(', ')}`);
});

test('a Founder record is not offered family: the words are laid by Personal, not by People', async () => {
  const { k, sql } = await made('founder');
  if (held(k).includes('people')) assert.ok(!roleOf(k).values.includes('family'));
  const refused = k.create('people', { name: 'Mum', role: 'family' }, { actor: 'p_1' }) as { ok: boolean; refusal?: { code: string } };
  assert.equal(refused.ok, false);
  sql.close();
});
