import { studio, owner, J } from './lib.ts';
const { api, sql } = await studio();
const made = await api.createToken({ scope: 'propose', label: 'x' }, owner);
console.log('createToken:', J(made));
sql.close();
