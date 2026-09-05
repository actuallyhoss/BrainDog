import { studio, owner, J, NOW } from './lib.ts';
import { createRecordApi } from '../../record/src/index.ts';
import { openSqlite, fixedClock } from '../test/sqlite.ts';

const { api, sql } = await studio();
const made = await api.createToken({ scope: 'write', label: 'agent' }, owner);
const bearer = (made as any).value.bearer;
console.log('minted id      :', (made as any).value.id);
const hash = sql.one<{hash:string}>('SELECT hash FROM token')!.hash;
console.log('stored hash    :', hash);

const lines = (await api.export({}, owner) as any).value as string[];
console.log('export lines   :', lines.length);
const hits = lines.filter((l) => l.includes('token') || l.includes(hash) || l.includes('t_0'));
console.log('lines mentioning token/hash:', J(hits));
console.log('members in export:', J(lines.filter((l)=>l.startsWith('member')||l.includes('person'))));
console.log('--- section names ---');
console.log(J([...new Set(lines.map((l)=>l.split(/[\s\t]/)[0]))]));
sql.close();
