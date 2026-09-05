import { studio, owner, token, J, REC } from './lib.ts';
const { api, sql, clock } = await studio();

console.log('--- createToken argument abuse ---');
for (const days of ['5', '400', true, [5], NaN, 1e309, -1, 0.5, 365.9, null, undefined, { valueOf: () => 5 }]) {
  const r = await api.createToken({ scope: 'read', days: days as any }, owner) as any;
  console.log(` days=${J(days)} typeof=${typeof days} ->`, r.ok ? `OK expires ${r.value.expires_at}` : `${r.refusal.code}`);
}
console.log(' scope=[read] ->', J(await api.createToken({ scope: ['read'] as any }, owner)));
console.log(' args=undefined ->', J(await api.createToken(undefined as any, owner)));
const big = 'x'.repeat(100_000);
const huge = await api.createToken({ scope: 'read', label: big }, owner) as any;
console.log(' 100KB label ->', huge.ok, 'stored label len:', sql.one<{n:number}>('SELECT length(label) AS n FROM token WHERE id = ?', huge.value.id)!.n);

console.log('\n--- does any error/event carry the secret? ---');
const made = await api.createToken({ scope: 'write', label: 'agent' }, owner) as any;
const secret = made.value.bearer.split('.').slice(1).join('.');
const ev = sql.all('SELECT * FROM event');
console.log(' secret in any event row?', JSON.stringify(ev).includes(secret));
console.log(' secret in listTokens?  ', JSON.stringify((await api.listTokens(owner) as any).value).includes(secret));

console.log('\n--- verifyToken edge cases ---');
const cases: [string, string][] = [
  ['several dots', `${REC}.a.b.c`],
  ['real bearer + extra dots', made.value.bearer.replace(/(.{10})/, '$1.')],
  ['empty secret', `${REC}.`],
  ['no dot', REC],
  ['just a dot', '.'],
  ['empty', ''],
  ['other record', `rec_other.${secret}`],
  ['good', made.value.bearer],
];
for (const [name, b] of cases) {
  const r = await api.kernel.verifyToken(b) as any;
  console.log(` ${name.padEnd(26)} ->`, r.ok ? `OK ${r.value.scope}` : r.refusal.code);
}

console.log('\n--- expires_at exactly now ---');
const short = await api.createToken({ scope: 'read', days: 1 }, owner) as any;
clock.set(Date.parse(short.value.expires_at));
console.log(' at exactly expires_at ->', J(await api.kernel.verifyToken(short.value.bearer)));
clock.set(Date.parse(short.value.expires_at) - 1);
console.log(' one ms before        ->', ((await api.kernel.verifyToken(short.value.bearer)) as any).ok);
sql.close();
