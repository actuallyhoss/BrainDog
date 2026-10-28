/**
 * A part of an add-on that waited for something the record did not hold arrives when the record holds it.
 *
 * BEFORE: an add-on's field that said `when: { holds: [people] }` was left out on a record without People, and stayed out
 * after People was installed, until somebody installed the add-on again by hand. Now every install and switch-on plans
 * each add-on with a part waiting once more, and a part whose wait is over lands with no press.
 *
 * Four things are held: the field is there after People arrives; two add-ons that wait on each other are each planned
 * once a pass and never in a loop; switching People off keeps the field; and a setting nobody installed yet does not ride
 * in with a part. A fifth, history saying who brought the part, is written and waits on the kernel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Diff = { planHash: string; approve: string[]; waiting: { at: string; holds: string[] }[] };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const HEAD = { version: '1.0.0', summary: 'A made-up add-on for tests.', author: 'Test Author', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} } };
const list = (id: string, name: string, more: Record<string, unknown> = {}, fields: Record<string, unknown>[] = []) => ({
  register: id,
  name,
  title: 'name',
  ...more,
  fields: [{ id: 'name', type: 'text', required: true }, ...fields, { id: 'tags', type: 'list', of: 'text' }],
});

/** A client book whose `contact` waits for People, as a link to a person or as plain words. */
const clientBook = (contact: Record<string, unknown>) => ({
  pack: 'client-book',
  ...HEAD,
  declarations: [
    list('clients', 'Clients', {}, [{ id: 'contact', ...contact, when: { holds: ['people'] } }, { id: 'site', type: 'text', when: { holds: ['sites'] } }]),
    { page: 'clients', title: 'Clients', requires: ['register.clients'], blocks: [{ kind: 'table', source: 'register.clients', columns: [{ field: 'name' }, { field: 'contact', when: { holds: ['people'] } }] }] },
  ],
});

async function fresh() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 13, 12)) });
  return { sql, api };
}

/** Plan and install one add-on as the owner pressing Install, and answer what its plan left waiting. */
async function put(api: Api, doc: unknown): Promise<Diff['waiting']> {
  const planned = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  return planned.diff.waiting;
}

/** People as BrainDog ships it, cut for a record that holds nothing else, as onboarding cuts it. */
const people = () => firstPartyDocument('people', { holds: ['people'] });

const fieldsOf = (api: Api, register: string): string[] =>
  (api.kernel.register(register)?.fields ?? []).map((f) => f.id).filter((id) => id !== 'tags');
const waitingOf = (api: Api, id: string): string[] => (api.kernel.packsWaiting().find((p) => p.id === id)?.waiting ?? []).map((w) => w.at);
/** How many times an add-on was installed, the first time and every time a plan made again landed. */
const installsOf = (sql: ReturnType<typeof openSqlite>, id: string): number =>
  sql.all<{ id: string }>("SELECT id FROM event WHERE kind = 'install' AND target = ?", `pack:${id}`).length;

test('PEOPLE ARRIVES AND THE FIELD THAT WAITED FOR IT IS THERE, with no press', async () => {
  const { sql, api } = await fresh();
  const waiting = await put(api, clientBook({ type: 'ref', to: 'people' }));
  /* THE FIRST STATE: no People, so the field is out and the add-on says what waits. */
  assert.deepEqual(fieldsOf(api, 'clients'), ['name']);
  assert.deepEqual(waiting.map((w) => w.at), ['register.clients.fields[1]', 'register.clients.fields[2]', 'page.clients.blocks[0].columns[1]']);
  assert.deepEqual(waitingOf(api, 'client-book'), waiting.map((w) => w.at), 'what waits is written on the add-on');

  await put(api, people());

  /* THE SECOND STATE: nothing was pressed for the client book, and its field and its column are there. */
  assert.deepEqual(fieldsOf(api, 'clients'), ['name', 'contact']);
  const page = JSON.parse(api.kernel.declarations().find((d) => d.id === 'page.clients')!.body) as { blocks: { columns: { field: string }[] }[] };
  assert.deepEqual(page.blocks[0]!.columns.map((c) => c.field), ['name', 'contact']);
  /* WHAT STILL WAITS FOR SOMETHING ELSE GOES ON WAITING, and is still said. */
  assert.deepEqual(waitingOf(api, 'client-book'), ['register.clients.fields[2]']);
  /* AND IT TAKES A VALUE, as any field of the list does. */
  const ann = said<{ id: string }>(await api.create({ register: 'people', fields: { name: 'Ann Okoro' } }, owner));
  said(await api.create({ register: 'clients', fields: { name: 'Halden', contact: ann.id } }, owner));

  assert.equal(installsOf(sql, 'client-book'), 2, 'installed once by hand and once by the plan made again');
  sql.close();
});

/* WAITS ON ONE LINE OF THE KERNEL (`rememberPack` signing an install that carries `because` with `by`, and keeping the
   sentence as the line's note). The record already hands both over; until that line lands the log says "system" and
   nothing else, so this is held as a todo and goes green by itself the day it does. */
test('HISTORY SAYS WHO BROUGHT THE PART, AND WHY', async () => {
  const { sql, api } = await fresh();
  await put(api, clientBook({ type: 'ref', to: 'people' }));
  await put(api, people());
  const line = sql.all<{ actor: string; note: string | null }>("SELECT actor, note FROM event WHERE kind = 'install' AND target = 'pack:client-book' ORDER BY rowid DESC LIMIT 1")[0];
  assert.equal(line?.actor, 'p_1', 'signed by the person whose install brought People');
  assert.equal(line?.note, '2 parts that waited for People arrived.');
  sql.close();
});

test('TWO ADD-ONS THAT WAIT ON EACH OTHER ARE EACH PLANNED ONCE A PASS, and what the pass made true lands after the next install', async () => {
  const { sql, api } = await fresh();
  /* `first` WAITS ON `second` TWICE OVER: `orders` for a list `second` holds from the start, and `returns` for a list
     of `second` that itself waits for `orders`. `first` is planned before `second`, so one pass cannot finish it. */
  const first = {
    pack: 'first',
    ...HEAD,
    declarations: [list('shops', 'Shops'), list('orders', 'Orders', { when: { holds: ['makers'] } }), list('returns', 'Returns', { when: { holds: ['parcels'] } })],
  };
  const second = { pack: 'second', ...HEAD, declarations: [list('makers', 'Makers'), list('parcels', 'Parcels', { when: { holds: ['orders'] } })] };
  await put(api, first);
  assert.deepEqual(waitingOf(api, 'first'), ['register.orders', 'register.returns']);

  await put(api, second);
  /* ONE PASS: `first` was planned once and took Orders, then `second` was planned once and took Parcels. Returns waits
     for Parcels, which that same pass brought, and `first` is not planned a second time for it. */
  assert.ok(api.kernel.register('orders'), 'Orders arrived');
  assert.ok(api.kernel.register('parcels'), 'Parcels arrived');
  assert.equal(api.kernel.register('returns'), undefined, 'Returns went in during the same pass, so an add-on was planned twice');
  assert.deepEqual(waitingOf(api, 'first'), ['register.returns']);
  assert.deepEqual(waitingOf(api, 'second'), []);
  assert.equal(installsOf(sql, 'first'), 2);
  assert.equal(installsOf(sql, 'second'), 2);

  /* THE NEXT INSTALL OF ANYTHING IS THE NEXT PASS, and nothing is left waiting after it. */
  await put(api, { pack: 'third', ...HEAD, declarations: [list('notes', 'Notes')] });
  assert.ok(api.kernel.register('returns'), 'Returns arrived on the next pass');
  assert.deepEqual(api.kernel.packsWaiting(), []);
  assert.equal(installsOf(sql, 'first'), 3);
  assert.equal(installsOf(sql, 'second'), 2, 'an add-on with nothing waiting is not planned again');

  /* AND A PASS WITH NOTHING WAITING WRITES NOTHING. */
  const events = sql.all<{ id: string }>('SELECT id FROM event').length;
  said(await api.disablePack({ id: 'third' }, owner));
  said(await api.enablePack({ id: 'third' }, owner));
  assert.equal(sql.all<{ id: string }>("SELECT id FROM event WHERE kind = 'install' AND target IN ('pack:first', 'pack:second')").length, 5);
  assert.ok(sql.all<{ id: string }>('SELECT id FROM event').length > events);
  sql.close();
});

test('SWITCHING OFF THE ADD-ON THAT MADE A PART TRUE KEEPS THE PART, and a later pass does not take it back out', async () => {
  const { sql, api } = await fresh();
  await put(api, clientBook({ type: 'text' }));
  await put(api, people());
  assert.deepEqual(fieldsOf(api, 'clients'), ['name', 'contact']);
  said(await api.create({ register: 'clients', fields: { name: 'Halden', contact: 'Ann Okoro' } }, owner));

  said(await api.disablePack({ id: 'people' }, owner));
  /* PEOPLE IS OFF, AND THE FIELD IS STILL ON THE LIST with what was typed in it. */
  assert.deepEqual(fieldsOf(api, 'clients'), ['name', 'contact']);
  const read = said<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'clients' }, owner));
  assert.equal(read.rows[0]!.fields.contact, 'Ann Okoro');

  /* THE LIST ITS OTHER PART WAITS FOR ARRIVES WHILE PEOPLE IS OFF. A plan made now would bring `site` and take `contact`
     out, since the record no longer holds People. A part is never removed without a press, so the add-on is left as it
     is, and `site` goes on waiting. */
  await put(api, { pack: 'site-list', ...HEAD, declarations: [list('sites', 'Sites')] });
  assert.deepEqual(fieldsOf(api, 'clients'), ['name', 'contact']);
  assert.deepEqual(waitingOf(api, 'client-book'), ['register.clients.fields[2]']);
  assert.equal(installsOf(sql, 'client-book'), 2);

  /* PEOPLE BACK ON IS A SWITCH-ON, which plans again: now nothing is lost, and `site` lands. */
  said(await api.enablePack({ id: 'people' }, owner));
  assert.deepEqual(fieldsOf(api, 'clients'), ['name', 'contact', 'site']);
  assert.deepEqual(api.kernel.packsWaiting(), []);
  sql.close();
});

test('A SETTING CHANGED AND NOT INSTALLED YET DOES NOT RIDE IN WITH A PART, and the part lands when the owner installs it', async () => {
  const { sql, api } = await fresh();
  /* TWO LISTS NAMED BY ONE SETTING, and only `samples` has a part waiting. */
  const ledger = {
    pack: 'sample-ledger',
    ...HEAD,
    config: { heading: { type: 'text', default: 'Sample invoices', label: 'Heading' } },
    declarations: [
      list('samples', '{{config:heading}}', {}, [{ id: 'payer', type: 'text', when: { holds: ['people'] } }]),
      list('drafts', '{{config:heading}} in draft'),
    ],
  };
  await put(api, ledger);
  said(await api.setPackConfig({ id: 'sample-ledger', values: { heading: 'Bills' } }, owner));
  assert.equal(api.kernel.register('drafts')?.name, 'Sample invoices in draft', 'a setting reaches a list at the next install, not before');

  await put(api, people());
  /* A PLAN MADE NOW WOULD RENAME BOTH LISTS, and nothing of `drafts` waited. Nobody pressed for that, so the add-on is left. */
  assert.equal(api.kernel.register('drafts')?.name, 'Sample invoices in draft');
  assert.equal(api.kernel.register('samples')?.name, 'Sample invoices');
  assert.deepEqual(waitingOf(api, 'sample-ledger'), ['register.samples.fields[1]']);
  assert.equal(installsOf(sql, 'sample-ledger'), 1);

  /* THE OWNER INSTALLS THE SETTING, and that install is what brings the part. */
  await put(api, ledger);
  assert.equal(api.kernel.register('drafts')?.name, 'Bills in draft');
  assert.deepEqual(fieldsOf(api, 'samples'), ['name', 'payer']);
  assert.deepEqual(api.kernel.packsWaiting(), []);
  sql.close();
});
