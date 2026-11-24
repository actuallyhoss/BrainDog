/**
 * `total` in Slash (`src/slash-tools.ts`): every matching row added, each currency apart, never a page of them.
 *
 * MEASURED 24 NOVEMBER (the Slash audit, finding 11): Quick could list at most 30 rows and had no way to add the rest, so a
 * total over more ledger lines was calc over the rows it was shown, said as if checked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';
import { slashTools } from '../src/slash-tools.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };
const run = { askOnly: false, asked: false, said: 'how much in total', outside: null };

async function seeded() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await installSeed(api.kernel)).ok);
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'o@example.test', 'Olive')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_seed', '*', 'owner')");
  return { sql, tools: slashTools(api as never, owner, { sql, person: 'p_seed', now: clock.now }) };
}

const pounds = (minor: number): string => `£${(minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

test('A TOTAL ADDS EVERY MATCHING ROW, past the page list shows, split by which way the money went', async () => {
  const { sql, tools } = await seeded();
  const byWay = sql.all<{ way: string; n: number; minor: number }>(
    "SELECT json_extract(fields, '$.direction') AS way, count(*) AS n, sum(json_extract(fields, '$.amount.amount')) AS minor FROM entry WHERE register = 'transactions' AND deleted_at IS NULL GROUP BY way ORDER BY way",
  );
  const all = byWay.reduce((n, w) => n + w.n, 0);
  assert.ok(all > 30, `the seed ledger holds ${String(all)} rows, more than a page`);
  const listed = (await tools.call('list', { list: 'ledger' }, run)).text;
  assert.match(listed, /For a total, call total; never add these up\./u);
  const said = (await tools.call('total', { list: 'ledger' }, run)).text;
  assert.match(said, new RegExp(`over all ${String(all)} matching rows`, 'u'));
  for (const w of byWay) assert.ok(said.includes(`direction ${w.way}: ${pounds(w.minor)} over ${String(w.n)} rows`), `${said}\n${JSON.stringify(w)}`);
  sql.close();
});

test('A FILTER THAT FIXES THE WAY IS ONE SUM; a list with nothing to add and a field that adds nothing say so plainly', async () => {
  const { sql, tools } = await seeded();
  const out = (await tools.call('total', { list: 'ledger', where: { direction: 'out' } }, run)).text;
  assert.match(out, /^amount over all \d+ matching rows of Ledger: £[\d,]+\.\d\d\.$/u, out);
  const none = await tools.call('total', { list: 'tasks' }, run);
  assert.match(none.text, /holds no amount or number to add up, so there is no total/u);
  const wrong = await tools.call('total', { list: 'ledger', field: 'what' }, run);
  assert.equal(wrong.refused, true);
  assert.match(wrong.text, /The ones that add up: amount/u);
  sql.close();
});
