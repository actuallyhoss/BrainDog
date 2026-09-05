import { studio, owner, J } from './lib.ts';
const { api, sql } = await studio();

// 1) A person with ONLY register-scoped rows and no '*' row.
sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_ghost','obligations','read')");
const all = (await api.members(owner) as any).value;
console.log('1) members():', J(all));

// 2) register-scoped level ABOVE the record level
const bo = await api.invite({ person: 'p_2', level: 'read', registers: { obligations: 'owner' } }, owner);
console.log('2) invite read + obligations:owner ->', J(bo));

// 3) registers as an array
console.log('3) registers as array   :', J(await api.invite({ person: 'p_3', level: 'read', registers: ['obligations'] as any }, owner)));
// 4) registers with __proto__ via JSON.parse
const proto = JSON.parse('{"__proto__":{"x":1},"obligations":"write"}');
console.log('4) registers __proto__  :', J(await api.invite({ person: 'p_4', level: 'read', registers: proto }, owner)));
// 5) registers containing '*'
console.log("5) registers {'*':owner}:", J(await api.invite({ person: 'p_5', level: 'read', registers: { '*': 'owner' } as any }, owner)));
// 6) registers {} vs undefined
await api.invite({ person: 'p_6', level: 'read', registers: { obligations: 'write' } }, owner);
console.log('6a) after {} :', J((await api.invite({ person: 'p_6', level: 'read', registers: {} }, owner) as any).value?.scoped));
await api.invite({ person: 'p_7', level: 'read', registers: { obligations: 'write' } }, owner);
console.log('6b) after undefined :', J((await api.invite({ person: 'p_7', level: 'read' }, owner) as any).value?.scoped));
// 7) invite with no args at all
console.log('7) invite(undefined):', J(await api.invite(undefined as any, owner)));
// 8) removeMember with odd arg
console.log('8) removeMember({}) :', J(await api.removeMember({} as any, owner)));
console.log('9) removeMember(undef):', J(await api.removeMember(undefined as any, owner)));
sql.close();
