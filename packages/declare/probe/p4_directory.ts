import { createDirectory } from '../../record/src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const sql = openSqlite();
const dir = createDirectory(sql, fixedClock(Date.UTC(2026, 8, 5, 12)));

const val = <T>(r: any): T => { if (!r.ok) throw new Error(`${r.refusal.code}: ${r.refusal.fix}`); return r.value; };

const ada = val<any>(dir.person$('ada@x.test', 'Ada'));
const bob = val<any>(dir.person$('bob@x.test', 'Bob'));
const mal = val<any>(dir.person$('mal@x.test', 'Mal'));
const rec = val<any>(dir.provision({ slug: 'the-studio', email: 'ada@x.test' }));
console.log('provisioned:', JSON.stringify(rec));

console.log('\n=== A. `leave` guards the last owner. Does `join`? ===');
console.log('owners before :', sql.all("SELECT person, level FROM dir_member WHERE record = ?", rec.record));
console.log('leave(ada)    :', JSON.stringify(dir.leave(rec.record, ada.id)));
// the guard held. now the same demotion through `join`:
console.log('join(ada,read):', JSON.stringify(dir.join(rec.record, ada.id, 'read')));
console.log('owners after  :', sql.all("SELECT person, level FROM dir_member WHERE record = ?", rec.record));
const owners = sql.one<{ n: number }>("SELECT count(*) AS n FROM dir_member WHERE record = ? AND level = 'owner'", rec.record)!;
console.log(`>>> the record now has ${owners.n} owner(s). "A record keeps one owner" — via leave only.`);

console.log('\n=== B. Can `join` put somebody on a CLOSED record? ===');
const r2 = val<any>(dir.provision({ slug: 'halden', email: 'bob@x.test' }));
console.log('close(halden) :', JSON.stringify(dir.close(r2.record)));
console.log('resolve(halden):', JSON.stringify(dir.resolve('halden')));
console.log('join(mal,owner):', JSON.stringify(dir.join(r2.record, mal.id, 'owner')));
console.log('levelOf(mal)  :', dir.levelOf(r2.record, mal.id));
console.log('recordsOf(mal):', JSON.stringify(dir.recordsOf(mal.id)));
console.log('>>> Mal was added to a closed record and levelOf reports owner on it.');

console.log('\n=== C. Does a refusal inside transactionSync roll back? ===');
const before = sql.all("SELECT slug, record, released_at FROM dir_slug ORDER BY rowid");
console.log('slugs before  :', JSON.stringify(before));
console.log('rename to bad :', JSON.stringify(dir.rename('the-studio', 'API')));
console.log('rename to taken:', JSON.stringify(dir.rename('the-studio', 'halden')));
console.log('slugs after   :', JSON.stringify(sql.all("SELECT slug, record, released_at FROM dir_slug ORDER BY rowid")));

console.log('\n=== D. Case, and a released name coming back ===');
console.log('resolve("The-Studio") :', JSON.stringify(dir.resolve('The-Studio')));
console.log('rename ok             :', JSON.stringify(dir.rename('the-studio', 'the-atelier')));
console.log('resolve("the-studio") :', JSON.stringify(dir.resolve('the-studio')), '(tombstoned, must be null)');
console.log('provision old name    :', JSON.stringify(dir.provision({ slug: 'the-studio', email: 'bob@x.test' })));

sql.close();
