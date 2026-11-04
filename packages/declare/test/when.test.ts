/**
 * The parts of an add-on that wait on what the record holds: `resolveWhen`, `holdsOf`, `settleWhen`.
 *
 * BEFORE: a stranger's add-on could not say "this field is there once the record has People". Only the seed's own
 * documents were cut per record (`firstPartyDocument(id, { holds })`), by code nobody else could reach. Now a part says
 * `when: { holds: [people] }`, the plan keeps it with the key taken off when the record holds People, takes it out and
 * names it in `waiting` when it does not, and the install stages exactly what the plan said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Installed, type Pack } from '../src/index.ts';
import { holdsOf, readPackFile, reachOf, resolveWhen, settleWhen } from '../src/catalogue.ts';
import { holdingParts } from '../../kernel/src/declare.ts';
import { validateDeclaration } from '@braindog/kernel';

const PEOPLE = { holds: ['people'] };

const DOC = {
  pack: 'client-book',
  version: '1.0.0',
  summary: 'A made-up client book for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    {
      register: 'clients',
      name: 'Clients',
      title: 'name',
      fields: [
        { id: 'name', type: 'text', required: true },
        { id: 'contact', type: 'ref', to: 'people', when: PEOPLE },
        { id: 'note', type: 'text' },
        { id: 'tags', type: 'list', of: 'text' },
      ],
    },
    {
      page: 'clients',
      title: 'Clients',
      requires: ['register.clients'],
      blocks: [
        { kind: 'table', source: 'register.clients', columns: [{ field: 'name' }, { field: 'contact', when: PEOPLE }] },
        { kind: 'table', source: 'register.clients', when: { holds: ['projects'] }, columns: [{ field: 'name' }] },
      ],
    },
    { register: 'visits', name: 'Visits', title: 'what', when: { holds: ['meets'] }, fields: [{ id: 'what', type: 'text' }, { id: 'tags', type: 'list', of: 'text' }] },
  ],
  seeds: [
    { register: 'clients', fields: { name: 'Halden' } },
    { register: 'visits', fields: { what: 'Lunch' } },
  ],
};

async function packOf(doc: unknown = DOC): Promise<Pack> {
  const out = await normalise(doc);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
}

const bodyOf = (pack: Pack, id: string) => pack.declarations.find((d) => d.id === id)?.body as Record<string, unknown> | undefined;
const fieldIds = (pack: Pack) => (bodyOf(pack, 'register.clients')!.fields as { id: string }[]).map((f) => f.id).filter((id) => id !== 'tags');

test('ON A RECORD WITHOUT PEOPLE the field, its column, the block and the list that wait are out, and each is named', async () => {
  const { pack, waiting } = resolveWhen(await packOf(), new Set());
  assert.deepEqual(fieldIds(pack), ['name', 'note']);
  assert.deepEqual(waiting, [
    { at: 'register.clients.fields[1]', holds: ['people'] },
    { at: 'page.clients.blocks[0].columns[1]', holds: ['people'] },
    { at: 'page.clients.blocks[1]', holds: ['projects'] },
    { at: 'register.visits', holds: ['meets'] },
  ]);
  assert.equal(pack.declarations.some((d) => d.id === 'register.visits'), false);
  /* A LIST THAT WAITS TAKES ITS EXAMPLES WITH IT. */
  assert.deepEqual(pack.seeds.map((s) => s.register), ['clients']);
  /* AND A FIELD THAT WAITS TAKES ITS VALUE OUT OF EACH EXAMPLE, which the record would refuse as a field it lacks. */
  const valued = structuredClone(DOC);
  valued.seeds[0]!.fields = { name: 'Halden', contact: 'Ann' } as never;
  const plain = await packOf(valued);
  assert.deepEqual(resolveWhen(plain, new Set()).pack.seeds[0]!.fields, { name: 'Halden' });
  assert.deepEqual(resolveWhen(plain, new Set(['people'])).pack.seeds[0]!.fields, { name: 'Halden', contact: 'Ann' });
  assert.deepEqual(settleWhen(plain, resolveWhen(plain, new Set()).waiting).seeds[0]!.fields, { name: 'Halden' });
  /* WHAT IS KEPT IS WHAT THE RECORD STORES: its canonical is its body's, and the kernel takes it. */
  for (const d of pack.declarations) {
    assert.equal(d.canonical, JSON.stringify(JSON.parse(d.canonical)));
    assert.equal(JSON.stringify(d.body).includes('"holds"'), false, d.id);
    assert.equal(validateDeclaration({ id: d.id, kind: d.kind, body: d.body }), null, d.id);
  }
});

test('ON A RECORD WITH PEOPLE every part is in, the key taken off, and the people role lets the list in too', async () => {
  const { pack, waiting } = resolveWhen(await packOf(), new Set(['people', 'meets', 'projects']));
  assert.deepEqual(waiting, []);
  assert.deepEqual(fieldIds(pack), ['name', 'contact', 'note']);
  assert.equal(JSON.stringify(pack.declarations.map((d) => d.body)).includes('"holds"'), false);
  assert.deepEqual(pack.seeds.map((s) => s.register), ['clients', 'visits']);
});

test('WHAT THE RECORD HOLDS is its lists, the roles they play, and the lists the add-on brings that wait on nothing', async () => {
  const installed = {
    declarations: [
      { id: 'register.people', kind: 'register', body: JSON.stringify({ register: 'people', fields: [] }) },
      { id: 'register.rates_eu', kind: 'register', body: JSON.stringify({ register: 'rates_eu', rates: { currency: 'c' }, fields: [] }) },
      { id: 'page.home', kind: 'page', body: '{}' },
    ],
  } as unknown as Installed;
  const held = holdsOf(installed, await packOf());
  assert.deepEqual([...held].sort(), ['clients', 'meets', 'people', 'rates', 'rates_eu']);
  /* AND SO, PLANNED OVER THAT RECORD, ONLY THE BLOCK WAITING ON PROJECTS WAITS. */
  assert.deepEqual(resolveWhen(await packOf(), held).waiting.map((w) => w.at), ['page.clients.blocks[1]']);
});

test("A LIST THE ADD-ON BRINGS, LET IN BY THE RECORD, LETS IN WHAT WAITS ON IT, whatever order the file says them in", async () => {
  const doc = structuredClone(DOC);
  doc.declarations[0]!.fields![1] = { id: 'visit', type: 'ref', to: 'visits', when: { holds: ['visits'] } };
  const { waiting } = resolveWhen(await packOf(doc), new Set(['people', 'meets', 'projects']));
  assert.deepEqual(waiting, []);
  /* TWO THAT WAIT ON EACH OTHER BOTH WAIT, AND THE SETTLING STOPS. */
  const loop = structuredClone(DOC);
  loop.declarations[2]!.when = { holds: ['loops'] };
  loop.declarations.push({ register: 'loops', name: 'Loops', title: 'what', when: { holds: ['visits'] }, fields: [{ id: 'what', type: 'text' }] } as never);
  assert.deepEqual(resolveWhen(await packOf(loop), new Set()).waiting.filter((w) => !w.at.includes('[')).map((w) => w.at), ['register.visits', 'register.loops']);
});

test("THE INSTALL STAGES WHAT THE PLAN SAID, read off its waiting and not off the record again", async () => {
  const pack = await packOf();
  for (const held of [new Set<string>(), new Set(['people']), new Set(['people', 'meets', 'projects'])]) {
    const planned = resolveWhen(pack, held);
    assert.deepEqual(settleWhen(pack, planned.waiting), planned.pack);
  }
  /* A PACK WITH NOTHING THAT WAITS COMES BACK AS IT WAS. */
  const plain = await packOf({ ...DOC, declarations: [{ register: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text' }] }], seeds: [] });
  assert.equal(resolveWhen(plain, new Set()).pack, plain);
});

test("A BLOCK'S FIGURE TEST IS NOT A PART THAT WAITS: the plan leaves it as it is, for the page to read", async () => {
  const doc = structuredClone(DOC);
  doc.declarations[1]!.blocks![1]!.when = { metric: 'owed', gt: 0 } as never;
  const pack = await packOf(doc);
  const { pack: out, waiting } = resolveWhen(pack, new Set(['people', 'meets']));
  assert.deepEqual(waiting, []);
  assert.deepEqual((bodyOf(out, 'page.clients')!.blocks as { when?: unknown }[])[1]!.when, { metric: 'owed', gt: 0 });
  assert.deepEqual(settleWhen(pack, waiting), out);
});

test("THE PLACES A PART MAY WAIT ARE THE KERNEL'S: every leaf the kernel finds, the plan takes out", async () => {
  const doc = {
    ...DOC,
    seeds: [],
    declarations: [
      {
        register: 'moves',
        name: 'Moves',
        title: 'what',
        fields: [{ id: 'what', type: 'text' }, { id: 'who', type: 'text', when: PEOPLE }],
        pairs: { on: ['what'], when: PEOPLE },
        meets: { name: 'what', when: PEOPLE },
      },
      {
        page: 'moves',
        title: 'Moves',
        blocks: [{ kind: 'table', source: 'register.moves', columns: [{ field: 'what', when: PEOPLE }], legs: [{ register: 'people', when: PEOPLE }] }],
      },
      { metric: 'moved', name: 'Moved', legs: [{ register: 'people', when: PEOPLE }] },
    ],
  };
  const pack = await packOf(doc);
  const kernel = pack.declarations.flatMap((d) =>
    holdingParts(d.kind, d.body as never).flatMap(({ at, part }) => ((part as { when?: { holds?: unknown } }).when?.holds ? [`${d.id}.${at}`] : [])),
  );
  assert.deepEqual(resolveWhen(pack, new Set()).waiting.map((w) => w.at), kernel);
  assert.equal(kernel.length, 6);
});

test('THE CATALOGUE SAYS WHAT A FILE WAITS FOR, and refuses a part that waits in a shape no plan can read', async () => {
  const file = await readPackFile(DOC);
  assert.ok(file.ok, JSON.stringify(file));
  assert.deepEqual(reachOf(file.value).waits, ['people', 'projects', 'meets']);
  const plain = await readPackFile({ ...DOC, declarations: [DOC.declarations[0]].map((d) => ({ ...d, fields: [{ id: 'name', type: 'text' }] })), seeds: [] });
  assert.ok(plain.ok);
  assert.equal('waits' in reachOf(plain.value), false);
  /* A PART WAITING ON A LIST THE ADD-ON ITSELF BRINGS waits on nothing once it is in. */
  const own = structuredClone(DOC);
  own.declarations[1]!.blocks![1]!.when = { holds: ['clients'] };
  const owned = await readPackFile(own);
  assert.ok(owned.ok, JSON.stringify(owned));
  assert.deepEqual(reachOf(owned.value).waits, ['people', 'meets']);

  const required = structuredClone(DOC);
  required.declarations[0]!.fields![1] = { id: 'contact', type: 'text', required: true, when: PEOPLE } as never;
  const refused = await readPackFile(required);
  assert.ok(!refused.ok && 'refusal' in refused, JSON.stringify(refused));
  {
    assert.equal(refused.refusal.at, 'register.clients.fields[1].when');
    assert.match(refused.refusal.fix, /is required and waits for people/u);
  }
});

test('THE CUTS A FILE CANNOT WRITE: a role and hand lose a field that waits, and a page its requires', async () => {
  const PROJECTS = { holds: ['projects'] };
  const doc = {
    ...DOC,
    seeds: [],
    declarations: [
      {
        register: 'contacts',
        name: 'Contacts',
        title: 'name',
        fields: [{ id: 'name', type: 'text', required: true }, { id: 'email', type: 'text', when: PEOPLE }, { id: 'owner', type: 'ref', to: 'people', when: PEOPLE }],
        mobile: ['name', 'email'],
        hand: { person: 'owner' },
        meets: { name: 'name', email: 'email' },
      },
      {
        page: 'contacts',
        title: 'Contacts',
        requires: ['register.contacts', 'register.projects'],
        filters: [{ field: 'name', when: PROJECTS }],
        blocks: [
          { kind: 'table', source: 'register.contacts', columns: [{ field: 'name' }] },
          { kind: 'table', source: 'register.projects', when: PROJECTS, columns: [{ field: 'name' }] },
        ],
      },
    ],
  };
  const pack = await packOf(doc);
  const without = resolveWhen(pack, new Set()).pack;
  const list = bodyOf(without, 'register.contacts')!;
  assert.deepEqual(list.meets, { name: 'name' }, 'the role keeps only the fields that are there');
  assert.deepEqual(list.mobile, ['name', 'email'], 'the short view keeps it, as the seed modules do');
  assert.deepEqual(list.hand, {});
  const page = bodyOf(without, 'page.contacts')!;
  assert.deepEqual(page.requires, ['register.contacts'], 'a list only a waiting block read is no longer required');
  assert.deepEqual(page.filters, []);
  /* HELD, NOTHING IS CUT, and settleWhen gives the same body from the plan's waiting. */
  const held = resolveWhen(pack, new Set(['people', 'projects']));
  assert.deepEqual(held.waiting, []);
  assert.deepEqual(bodyOf(held.pack, 'register.contacts')!.meets, { name: 'name', email: 'email' });
  assert.deepEqual(bodyOf(held.pack, 'page.contacts')!.requires, ['register.contacts', 'register.projects']);
  const plan = resolveWhen(pack, new Set());
  assert.deepEqual(bodyOf(settleWhen(pack, plan.waiting), 'register.contacts'), list);
  assert.deepEqual(bodyOf(settleWhen(pack, plan.waiting), 'page.contacts'), page);
});

test('A BLOCK DRAWN ON A FIGURE THAT WAITS WAITS WITH IT, and a sentence loses its clause over a field that waits', async () => {
  const doc = {
    ...DOC,
    declarations: [
      {
        register: 'clients',
        name: 'Clients',
        title: 'name',
        fields: [
          { id: 'name', type: 'text', required: true },
          { id: 'contact', type: 'ref', to: 'people', when: PEOPLE },
          { id: 'project', type: 'ref', to: 'projects', when: { holds: ['projects'] } },
        ],
      },
      { metric: 'clients-with-contact', name: 'With a contact', source: 'register.clients', op: 'count', where: 'contact is set', when: PEOPLE },
      { metric: 'clients-unfiled', name: 'Unfiled', source: 'register.clients', op: 'count', where: 'project is empty, contact is empty' },
      {
        page: 'clients',
        title: 'Clients',
        requires: ['register.clients'],
        blocks: [
          { kind: 'table', heading: 'Spoken to', source: 'register.clients', when: { metric: 'clients-with-contact', gt: 0 }, columns: [{ field: 'name' }] },
          { kind: 'table', heading: 'Unfiled', source: 'register.clients', where: 'project is empty, contact is empty', columns: [{ field: 'name' }] },
        ],
      },
    ],
    seeds: [],
  };
  const pack = await packOf(doc);
  const body = (p: Pack, id: string) => p.declarations.find((d) => d.id === id)!.body as { blocks?: { heading: string; when?: unknown; where?: string }[]; where?: string };

  /* WITHOUT PEOPLE: the block goes with its figure and is named, and "contact is empty" is true of every row, so it goes
     from the sentence and the rest stands. */
  const apart = resolveWhen(pack, new Set(['projects']));
  assert.deepEqual(apart.waiting, [
    { at: 'register.clients.fields[1]', holds: ['people'] },
    { at: 'metric.clients-with-contact', holds: ['people'] },
    { at: 'page.clients.blocks[0]', holds: ['people'] },
  ]);
  assert.deepEqual(body(apart.pack, 'page.clients').blocks!.map((b) => [b.heading, b.where]), [['Unfiled', 'project is empty']]);
  assert.equal(body(apart.pack, 'metric.clients-unfiled').where, 'project is empty');
  /* WITH NEITHER THE WHOLE SENTENCE WAS TRUE OF EVERY ROW, so no sentence is left to read. */
  const neither = resolveWhen(pack, new Set());
  assert.equal(body(neither.pack, 'metric.clients-unfiled').where, undefined);
  assert.equal(body(neither.pack, 'page.clients').blocks![0]!.where, undefined);

  /* WITH PEOPLE: the block stays with its own figure test, and the sentence is as it was written. */
  const whole = resolveWhen(pack, new Set(['people', 'projects']));
  assert.deepEqual(whole.waiting, []);
  assert.deepEqual(body(whole.pack, 'page.clients').blocks![0]!.when, { metric: 'clients-with-contact', gt: 0 });
  assert.equal(body(whole.pack, 'page.clients').blocks![1]!.where, 'project is empty, contact is empty');

  /* THE INSTALL STAGES WHAT THE PLAN SAID, by the same road. */
  assert.deepEqual(settleWhen(pack, apart.waiting).declarations.map((d) => d.id), apart.pack.declarations.map((d) => d.id));
  assert.equal(body(settleWhen(pack, apart.waiting), 'metric.clients-unfiled').where, 'project is empty');
});
