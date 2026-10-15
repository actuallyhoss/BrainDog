/**
 * A zip of tables is one list for each (`importFiles` in `accept.ts`, USE-B10 job 7): what one press writes when the
 * person brought a Notion export, or any zip, and the first run drew one tile for each table inside.
 *
 * THE ZIP IS WRITTEN HERE BY HAND, with the same tiny writer `lib/start/zip.test.ts` uses (stored entries only), and read
 * by `readExports` as the page reads it. THE RECORD IS A FAKE that keeps every call: a list of a file's own is filed and
 * accepted (`propose`, `decide`), its entries go in through `setup`, and what it refuses is said back. Every name here
 * is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { byRules, exportLists, leftSaid, readExports, type Export } from '../../lib/start/export.ts';
import { accept, importFile, importFiles, type Accepting, type Imported, type SetupRow } from './accept.ts';
import { propose } from '../../lib/start/propose.ts';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

/** A zip as a zip tool writes one, every entry stored: local headers, the central directory and its end. */
function zipOf(puts: readonly { name: string; data: string }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let at = 0;
  for (const p of puts) {
    const name = text(p.name);
    const data = text(p.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(18, data.byteLength, true);
    local.setUint32(22, data.byteLength, true);
    local.setUint16(26, name.byteLength, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint32(20, data.byteLength, true);
    central.setUint32(24, data.byteLength, true);
    central.setUint16(28, name.byteLength, true);
    central.setUint32(42, at, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    directory.push(new Uint8Array(central.buffer), name);
    at += 30 + name.byteLength + data.byteLength;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, puts.length, true);
  end.setUint16(10, puts.length, true);
  end.setUint32(12, directory.reduce((n, d) => n + d.byteLength, 0), true);
  end.setUint32(16, at, true);
  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, a) => n + a.byteLength, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.byteLength;
  }
  return out;
}

/** A workspace export of two tables and a page of notes, the tables named as Notion names them, with an id after. */
const WORKSPACE = zipOf([
  { name: 'Garden/Plants 0123456789abcdef0123456789abcdef.csv', data: 'Plant,Pot size\nFern,12\nCactus,8\nIvy,10\n' },
  { name: 'Garden/Recipes 89abcdef0123456789abcdef01234567.csv', data: 'Dish,Serves\nSoup,4\nStew,6\n' },
  { name: 'Garden/Watering notes.md', data: '# Water on Sundays\n' },
]);

type Call = { name: string; args: Record<string, unknown> };

/**
 * A RECORD THAT KEEPS EVERY CALL. A list of a file's own is filed with `propose` and accepted with `decide`; one whose
 * declarations name a list in `refuse` is refused, and a call to `throws` throws. Entries go in through `setup`, all or
 * none, and a call holding `refuse me` is refused.
 */
function fakeClient(refuse: readonly string[] = [], throws: readonly string[] = []) {
  const calls: Call[] = [];
  const held: SetupRow[] = [];
  const ok = (value: unknown) => ({ ok: true as const, value });
  const no = { ok: false as const, refusal: { code: 'VALUE_MALFORMED', fix: 'Not today.' } };
  const names = (args: Record<string, unknown>): string => JSON.stringify(args.body ?? {});
  const client = {
    call: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name !== 'propose') return ok({});
      if (throws.some((r) => names(args).includes(`"register.${r}"`))) throw new TypeError('fetch failed');
      if (refuse.some((r) => names(args).includes(`"register.${r}"`))) return no;
      return ok({ id: `S${calls.length}` });
    },
    setup: async (body: { rows?: SetupRow[] }) => {
      calls.push({ name: 'setup', args: body as Record<string, unknown> });
      const rows = body.rows ?? [];
      if (rows.some((r) => r.fields.what === 'refuse me')) return ok({ done: {}, failed: [{ part: 'rows', why: 'Not today.' }] });
      held.push(...rows);
      return ok({ done: {}, failed: [] });
    },
    packs: async () => ok([{ id: 'work', disabled_at: null, registers: ['tracks', 'updates', 'tasks'] }]),
  };
  return { calls, held, client: client as never };
}

/** Every export a zip brought, each mapped by the rules as the page maps one where there is no model. */
async function brought(zip: Uint8Array): Promise<{ imported: Imported[]; left: string | null }> {
  const read = await readExports('workspace.zip', zip);
  assert.ok(!('why' in read), 'the zip was refused');
  return { imported: read.exports.map((file: Export) => ({ file, mapping: byRules(file, exportLists(), 'en-GB') })), left: leftSaid(read.left) };
}

const STATES = [{ id: 'work', disabled_at: null, registers: ['tracks', 'updates', 'tasks'] }] as never;
const registersOf = (calls: readonly Call[]): string[] => [...new Set(calls.filter((c) => c.name === 'setup').flatMap((c) => ((c.args.rows as SetupRow[] | undefined) ?? []).map((r) => r.register)))];

test('A ZIP OF TWO TABLES IS TWO TILES, and the one press writes two lists, in the order they stand', async () => {
  const { imported, left } = await brought(WORKSPACE);
  assert.deepEqual(
    imported.map((i) => i.file.file),
    ['Plants.csv', 'Recipes.csv'],
  );
  assert.equal(left, 'One page of notes was left out.');
  const { calls, held, client } = fakeClient();
  const failed = await importFiles(client, imported, null, 'en-GB', STATES);
  assert.deepEqual(failed, []);
  /* EACH LIST OF ITS OWN IS FILED, ACCEPTED, THEN FILLED, before the next file is begun. */
  assert.deepEqual(
    calls.map((c) => c.name),
    ['propose', 'decide', 'setup', 'propose', 'decide', 'setup'],
  );
  assert.deepEqual(registersOf(calls), ['plants', 'recipes']);
  assert.equal(held.filter((r) => r.register === 'plants').length, 3);
  assert.equal(held.filter((r) => r.register === 'recipes').length, 2);
});

test('TWO TABLES OF THE SAME NAME ARE TWO LISTS, never one list written twice', async () => {
  const { imported } = await brought(
    zipOf([
      { name: 'Home/Plants 0123456789abcdef0123456789abcdef.csv', data: 'Plant,Pot size\nFern,12\nCactus,8\n' },
      { name: 'Office/Plants 89abcdef0123456789abcdef01234567.csv', data: 'Plant,Pot size\nPalm,30\n' },
    ]),
  );
  const { calls, client } = fakeClient();
  assert.deepEqual(await importFiles(client, imported, null, 'en-GB', STATES), []);
  const lists = registersOf(calls);
  assert.equal(lists.length, 2, `both tables went into ${lists.join(', ')}`);
  assert.equal(lists[0], 'plants');
});

test('ONE THE RECORD REFUSED DOES NOT STOP THE NEXT, and each is answered in its own line, in order', async () => {
  const { imported } = await brought(WORKSPACE);
  const refused = fakeClient(['plants']);
  const failed = await importFiles(refused.client, imported, null, 'en-GB', STATES);
  assert.deepEqual(failed, [{ said: 'Plants could not be brought in.', why: 'Not today.' }]);
  assert.deepEqual(registersOf(refused.calls), ['recipes'], 'the second list was not written');
  assert.equal(refused.held.length, 2);

  /* A CALL THAT THREW IS ANSWERED TOO, and both refused are said in the order the tiles stood. */
  const both = fakeClient(['recipes'], ['plants']);
  assert.deepEqual(await importFiles(both.client, imported, null, 'en-GB', STATES), [
    { said: 'Plants could not be brought in.', why: '' },
    { said: 'Recipes could not be brought in.', why: 'Not today.' },
  ]);
  assert.equal(both.held.length, 0);
});

test('ONE EXPORT GOES IN EXACTLY AS importFile WROTE IT', async () => {
  const one = await readExports('todoist.csv', text('CONTENT,DATE\nBuy flour,2026-10-05\nrefuse me,\nCall the bank,\n'));
  assert.ok(!('why' in one));
  assert.equal(one.exports.length, 1);
  assert.equal(leftSaid(one.left), null, 'one plain file left nothing out');
  const imported: Imported = { file: one.exports[0]!, mapping: byRules(one.exports[0]!, exportLists(), 'en-GB') };
  const a = fakeClient();
  const b = fakeClient();
  const alone = await importFile(a.client, imported, null, 'en-GB', STATES);
  const many = await importFiles(b.client, [imported], null, 'en-GB', STATES);
  assert.deepEqual(many, alone);
  assert.deepEqual(alone, [{ said: '1 of 3 from your file did not go into Tasks.', why: 'Not today.' }]);
  const strip = (calls: readonly Call[]) => calls.map((c) => ({ ...c, args: { ...c.args, key: undefined } }));
  assert.deepEqual(strip(b.calls), strip(a.calls));
  assert.deepEqual(b.held, a.held);
  assert.equal(a.held.length, 2);
});

test('THE PRESS CARRIES EVERY TILE: accept with two files writes two lists', async () => {
  const { imported } = await brought(WORKSPACE);
  const sentence = 'I keep a garden';
  const asked: Accepting = {
    sentence,
    proposal: propose(sentence, { zone: 'Europe/London', locale: 'en-GB' }),
    usecase: null,
    also: [],
    modules: [],
    currency: null,
    today: '2026-10-15',
    email: null,
    nav: [],
    imported,
    locale: 'en-GB',
  };
  const { calls, client } = fakeClient();
  const out = await accept(client, asked);
  assert.deepEqual(out.failed, []);
  assert.deepEqual(registersOf(calls), ['plants', 'recipes']);
});
