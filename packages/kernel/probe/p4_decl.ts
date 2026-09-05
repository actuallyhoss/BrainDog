import { studio, owner, J } from './lib.ts';
const { api, sql } = await studio();

const t = async (name: string, fn: () => Promise<unknown>) => {
  try { console.log(` ${name.padEnd(46)} ->`, J(await fn())?.slice(0, 260)); }
  catch (e) { console.log(` ${name.padEnd(46)} -> !!! THREW:`, (e as Error).constructor.name, (e as Error).message.slice(0, 200)); }
};

console.log('--- setDeclaration / retireDeclaration ---');
await t('setDeclaration(undefined)', () => api.setDeclaration(undefined as any, owner));
await t('setDeclaration({})', () => api.setDeclaration({} as any, owner));
await t('setDeclaration({body:undefined})', () => api.setDeclaration({ body: undefined }, owner));
await t('setDeclaration({body:null})', () => api.setDeclaration({ body: null }, owner));
await t('setDeclaration({body:"x"})', () => api.setDeclaration({ body: 'x' }, owner));
await t('setDeclaration({body:[]})', () => api.setDeclaration({ body: [] }, owner));
await t('setDeclaration proto-poison', () => api.setDeclaration({ body: JSON.parse('{"__proto__":{"pwn":1},"id":"register.x"}') }, owner));
await t('retireDeclaration(undefined)', () => api.retireDeclaration(undefined as any, owner));
await t('retireDeclaration({id:""})', () => api.retireDeclaration({ id: '' }, owner));
await t('retireDeclaration({id:{}})', () => api.retireDeclaration({ id: {} as any }, owner));

console.log('\n--- export / import ---');
await t("export({sections:['local']})", () => api.export({ sections: ['local'] }, owner));
await t("export({sections:'local'})", () => api.export({ sections: 'local' as any }, owner));
await t('export({sections:[123]})', () => api.export({ sections: [123] as any }, owner));
await t('import(undefined)', () => api.import(undefined as any, owner));
await t('import({lines:[]})', () => api.import({ lines: [] }, owner));
await t('import({lines:["garbage"]})', () => api.import({ lines: ['garbage'] }, owner));
await t('import({lines:[null]})', () => api.import({ lines: [null] as any }, owner));
await t('import({lines:["#dogl 1","#table token id,hash"]})', () => api.import({ lines: ['#dogl 1', '#table token id,person_id,hash,scope,label,created_at,expires_at', '["t_x","p_1","deadbeef","write",null,"2026-01-01T00:00:00.000Z",null]'] }, owner));
sql.close();
