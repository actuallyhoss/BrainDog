/* Probe B: `arrive` when the register REFUSES the extracted row.
   Module doc (ingest.ts:14-21, :105): "THE RAW IS STORED FIRST AND ALWAYS" /
   "A FAILURE DOWNGRADES RATHER THAN DISCARDS ... not that the bytes go away." */
import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';
const NOW = Date.UTC(2026, 8, 5, 12);
const TX: Declaration = { id: 'register.transactions', kind: 'register', body: { id: 'transactions', name: 'Transactions', title: 'merchant', fields: [
  { id: 'merchant', type: 'text', required: true },
  { id: 'amount', type: 'money' },
  { id: 'kind', type: 'enum', values: ['debit', 'credit'] },
] } as never };
/* The pattern reads a `kind` the register does not admit — a payload the register refuses. */
const ING: Declaration = { id: 'ingest.hsbc', kind: 'ingest', body: {
  ingest: 'hsbc', channel: 'email',
  extract: { merchant: { text: { between: ['at ', ' on'] } }, kind: { enum: { map: { reversed: 'reversal' } } } },
  writes: { register: 'transactions' },
} as never };
const sql = openSqlite();
const k = await openRecord(sql, fixedClock(NOW));
console.log('install:', JSON.stringify(await k.install([TX, ING])).slice(0,200));
const before = sql.one<any>('SELECT count(*) AS n FROM inbox_raw')!.n;
const out = k.arrive({ channel: 'email', headers: { From: 'a@b.c', Subject: 'x' }, body: 'card reversed at Halden Coffee on 03/04/26', sha256: 'sha-1' });
console.log('arrive returned:', JSON.stringify(out));
console.log('inbox_raw rows before/after:', before, '/', sql.one<any>('SELECT count(*) AS n FROM inbox_raw')!.n);
console.log('inbox_raw contents:', sql.all<any>('SELECT id, state, reason FROM inbox_raw'));
console.log('ingest_receipt rows:', sql.one<any>('SELECT count(*) AS n FROM ingest_receipt')!.n);
console.log('entry rows:', sql.one<any>('SELECT count(*) AS n FROM entry')!.n);
console.log('observation rows (the "write.refused" signal):', sql.all('SELECT kind, subject, n FROM observation'));
sql.close();
