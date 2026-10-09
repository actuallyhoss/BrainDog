/**
 * An update that takes away a door the record is using says so, and finds the add-on that takes it over (REC-A16, step 2).
 *
 * Driven on a fresh record as the scope draws it: an add-on, `banky`, holding a text door with a live address and one
 * arrival, and a second door nobody has used. `banky` 1.1.0 drops both. The host offers `teller`, by the same author,
 * which declares the text door, and `stranger`, by somebody else, which declares it too and is listed first.
 *
 * `installed` IS READ HERE AS THE RECORD'S `installedState` READS IT (`index.ts`), packs, live declarations and `used`,
 * because the record does not hand that out and `takersFor` asks it of the arranger's own `installed`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Installed } from '@braindog/declare';
import { createRecordApi, type CallContext } from '../src/index.ts';
import type { CatalogueEntry } from '../src/arrange.ts';
import { LIVE_DAYS, liveIngests, retireMarks, takersFor } from '../src/arrange-retires.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
type Body = Record<string, unknown>;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const NOTES = { register: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] };
const door = (id: string, pack: string) => ({
  ingest: id,
  pack,
  channel: 'webhook',
  verify: { kind: 'path' },
  description: 'Texts from my phone.',
  extract: { body: { text: { after: 'Paid ' } } },
  writes: { register: 'notes' },
});
const doc = (pack: string, version: string, author: string, declarations: Body[], requires: Record<string, string> = {}): Body => ({
  pack,
  version,
  title: pack === 'teller' ? 'Teller' : pack === 'stranger' ? 'Stranger' : 'Banky',
  summary: 'Texts.',
  author,
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: requires },
  declarations,
});

const BANKY_1 = doc('banky', '1.0.0', 'Halden', [NOTES, door('text-door', 'banky'), door('quiet-door', 'banky')]);
const BANKY_2 = doc('banky', '1.1.0', 'Halden', [NOTES]);
const TELLER = doc('teller', '1.0.0', 'Halden', [door('text-door', 'teller')], { banky: '^1.1.0' });
const STRANGER = doc('stranger', '1.0.0', 'Somebody', [door('text-door', 'stranger')]);
const OTHER = doc('other', '1.0.0', 'Halden', [door('other-door', 'other')]);

const entry = (d: Body, title: string): CatalogueEntry => ({ id: String(d.pack), kind: 'pack', title, summary: 'Texts.', modules: [], version: String(d.version), doc: () => structuredClone(d) });
const CATALOGUE = [entry(BANKY_2, 'Banky'), entry(STRANGER, 'Stranger'), entry(OTHER, 'Other'), entry(TELLER, 'Teller')];

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const put = async (d: Body) => {
    const { diff } = value<{ diff: { planHash: string; approve?: string[] } }>(await api.planPack({ doc: d }, owner));
    value(await api.installPack({ doc: d, planHash: diff.planHash, approve: diff.approve } as never, owner));
  };
  await put(BANKY_1);
  const installed = (): Installed => ({
    format: 1,
    primitives: 1,
    record_version: api.kernel.version(),
    packs: api.kernel.packs(),
    declarations: api.kernel.declarations() as Installed['declarations'],
    rows: {},
    used: [
      ...sql.all<{ id: string }>('SELECT DISTINCT ingest_id AS id FROM ingest_receipt').map((r) => `ingest.${r.id}`),
      ...sql.all<{ id: string }>("SELECT DISTINCT substr(actor, 8) AS id FROM event WHERE actor LIKE 'ingest:%'").map((r) => `ingest.${r.id}`),
      ...addressed(),
    ],
    addressed: addressed(),
  });
  /* A TOKEN HELD, read as `heldDigest` reads it but without its check that no retire broke it: these tests mint again. */
  const addressed = () => sql.all<{ id: string }>("SELECT substr(key, 14) AS id FROM dog_meta WHERE key LIKE 'ingest_token.%'").map((r) => `ingest.${r.id}`);
  const arrive = (sha: string) =>
    value<{ ingest: string | null; state: string; reason?: string }>(
      api.kernel.arrive({ channel: 'webhook', ingest: 'text-door', verified: true, body: 'Paid 120 at the corner shop', sha256: sha }),
    );
  return { sql, api, clock, put, installed, arrive };
}

test('BEFORE THE UPDATE THE TEXT DOOR IS LIVE, by its address and its arrival, and the quiet door is not', async () => {
  const { sql, api, installed, arrive } = await record();
  assert.deepEqual([...liveIngests(api.kernel.patternReport(LIVE_DAYS), installed())], [], 'a fresh door with nothing is not live');
  value(await api.ingestMint({ ingest: 'text-door' }, owner));
  assert.deepEqual([...liveIngests(api.kernel.patternReport(LIVE_DAYS), installed())], ['ingest.text-door'], 'the address alone makes it live');
  const out = arrive('retires-1');
  assert.deepEqual([out.ingest, out.state], ['text-door', 'matched'], out.reason);
  const live = liveIngests(api.kernel.patternReport(LIVE_DAYS), installed());
  assert.ok(live.has('ingest.text-door'));
  assert.ok(!live.has('ingest.quiet-door'), 'a door with no arrival and no address is not live');
  sql.close();
});

test('an arrival alone makes a door live, for thirty days', async () => {
  const { sql, api, clock, installed, arrive } = await record();
  arrive('retires-2');
  assert.deepEqual([...liveIngests(api.kernel.patternReport(LIVE_DAYS), installed())], ['ingest.text-door']);
  /* READ OFF THE KERNEL'S REPORT, and not only off `used`. */
  assert.deepEqual([...liveIngests(api.kernel.patternReport(LIVE_DAYS), { ...installed(), used: [] })], ['ingest.text-door']);
  clock.advance((LIVE_DAYS + 1) * 86_400_000);
  /* `used` REMEMBERS THE CLAIM FOR EVER, and `addressed` does not hold it: this door has no address. */
  const after = liveIngests(api.kernel.patternReport(LIVE_DAYS), installed());
  assert.deepEqual([...after], [], 'an arrival thirty-one days ago does not make a door live');
  /* A HOST THAT CANNOT SAY WHICH DOORS HOLD AN ADDRESS has `used` read in its place, and says more, never less. */
  assert.deepEqual([...liveIngests(api.kernel.patternReport(LIVE_DAYS), (({ addressed: _gone, ...rest }) => rest)(installed()))], ['ingest.text-door']);
  sql.close();
});

test('THE UPDATE THAT DROPS THE TEXT DOOR FINDS THE PUBLISHER\'S OWN ADD-ON THAT DECLARES IT, as a second step', async () => {
  const { sql, api, installed, arrive } = await record();
  value(await api.ingestMint({ ingest: 'text-door' }, owner));
  arrive('retires-3');
  const takers = await takersFor({ kernel: api.kernel, catalogue: CATALOGUE, installed }, ['banky'], new Map());
  assert.deepEqual([...takers.live], ['ingest.text-door']);
  /* `stranger` IS LISTED FIRST AND DECLARES THE DOOR TOO; `other` IS THE SAME AUTHOR'S AND DOES NOT. */
  assert.deepEqual(Object.fromEntries(takers.by), { 'ingest.text-door': { pack: 'teller', name: 'Teller' } });
  assert.deepEqual(takers.adds, ['teller'], 'the add-on joins the same arrangement');
  assert.deepEqual(takers.docs.size, 0, 'a short-list add-on needs no fetched document');
  /* WHAT THE STEP FILES for each retire, read off `declare`'s plan with the same live set. */
  assert.deepEqual(retireMarks({ id: 'ingest.text-door', live: true }, takers), { live: true, taken_by: { pack: 'teller', name: 'Teller' } });
  assert.deepEqual(retireMarks({ id: 'ingest.quiet-door' }, takers), {}, 'the quiet door retires as before');
  /* ONE ALREADY IN THE ARRANGEMENT IS NAMED AND NOT ADDED TWICE. */
  const asked = await takersFor({ kernel: api.kernel, catalogue: CATALOGUE, installed }, ['banky', 'teller'], new Map());
  assert.deepEqual([asked.adds, Object.fromEntries(asked.by)], [[], { 'ingest.text-door': { pack: 'teller', name: 'Teller' } }]);
  sql.close();
});

test('with no add-on that declares it, the live retire is marked and names nobody', async () => {
  const { sql, api, installed } = await record();
  value(await api.ingestMint({ ingest: 'text-door' }, owner));
  const takers = await takersFor({ kernel: api.kernel, catalogue: [entry(BANKY_2, 'Banky'), entry(OTHER, 'Other')], installed }, ['banky'], new Map());
  assert.deepEqual([[...takers.live], takers.adds, takers.by.size], [['ingest.text-door'], [], 0]);
  assert.deepEqual(retireMarks({ id: 'ingest.text-door', live: true }, takers), { live: true });
  /* NOT EVEN ONE ALREADY IN THE ARRANGEMENT, by the same author, is named for a door it does not declare. */
  const along = await takersFor({ kernel: api.kernel, catalogue: [entry(BANKY_2, 'Banky'), entry(OTHER, 'Other')], installed }, ['banky', 'other'], new Map());
  assert.deepEqual([along.adds, along.by.size], [[], 0]);
  /* AND A RECORD USING NO DOOR READS NO CATALOGUE: nothing to take over. */
  const { sql: sql2, api: api2, installed: installed2 } = await record();
  const none = await takersFor({ kernel: api2.kernel, catalogue: CATALOGUE, installed: installed2 }, ['banky'], new Map());
  assert.deepEqual([none.live.size, none.adds, none.by.size], [0, [], 0]);
  sql.close();
  sql2.close();
});

test('AFTER THE UPDATE AND ITS SECOND STEP, the text door answers under the add-on that took it, and its address is minted again', async () => {
  const { sql, api, put, installed, arrive } = await record();
  value(await api.ingestMint({ ingest: 'text-door' }, owner));
  arrive('retires-4');
  const takers = await takersFor({ kernel: api.kernel, catalogue: CATALOGUE, installed }, ['banky'], new Map());
  /* THE ONE YES, in the order the arrangement installs: the update, then what takes the door over. */
  await put(BANKY_2);
  for (const id of takers.adds) await put(CATALOGUE.find((e) => e.id === id)!.doc({ holds: [] })!);
  const held = api.kernel.declarations().find((d) => d.id === 'ingest.text-door');
  assert.equal(held?.pack_id, 'teller', 'the door is declared again, under Teller');
  assert.equal(api.kernel.declarations().find((d) => d.id === 'ingest.quiet-door'), undefined, 'the quiet door is gone');
  /* THE OLD ADDRESS DOES NOT SURVIVE A RETIRE (`heldDigest`): the owner mints again, and texts file. */
  const doors = value<{ id: string; held: boolean }[]>(await (api as unknown as { doors: (c: CallContext) => Promise<unknown> }).doors(owner));
  assert.deepEqual(doors.map((d) => [d.id, d.held]), [['text-door', false]]);
  value(await api.ingestMint({ ingest: 'text-door' }, owner));
  const out = arrive('retires-5');
  assert.deepEqual([out.ingest, out.state], ['text-door', 'matched'], out.reason);
  /* AND NOTHING IS LEFT TO TAKE OVER: banky is at the version on offer. */
  const again = await takersFor({ kernel: api.kernel, catalogue: CATALOGUE, installed }, ['banky'], new Map());
  assert.deepEqual([again.adds, again.by.size], [[], 0]);
  sql.close();
});

test('a pattern reading a live door is live too, and a channel the report names is not a declaration', () => {
  const row = (id: string, body: Body) => ({ id, version: 1, kind: 'ingest' as const, pack_id: 'banky', body: JSON.stringify(body), checksum: id });
  const report = {
    days: LIVE_DAYS,
    since: '',
    doors: [
      { door: 'phone', said: 'Phone', patterns: [], unread: 2 },
      { door: 'webhook', said: 'Messages', patterns: [], unread: 1 },
    ],
  };
  const live = liveIngests(report, {
    declarations: [row('ingest.phone', { ingest: 'phone', channel: 'webhook' }), row('ingest.card', { ingest: 'card', channel: 'webhook', door: 'phone' }), row('ingest.mail', { ingest: 'mail', channel: 'email' })],
    used: [],
  });
  assert.deepEqual([...live].sort(), ['ingest.card', 'ingest.phone']);
});
