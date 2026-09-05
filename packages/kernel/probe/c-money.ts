/* Probe C: `money` has no `sep`, so `number()` always uses ',' as the thousands separator.
   A European payload (1.234,56) is read a thousand times too small. */
import { extractField } from '../src/index.ts';
const deps: any = { find: () => null };
const cases: [string, string][] = [
  ['EGP 1,316.24', 'anglo'],
  ['EUR 1.234,56', 'european'],
  ['EUR 12.500,00', 'european'],
  ['EUR 1.234.567,89', 'european'],
];
for (const [text, kind] of cases) {
  const got = extractField(deps, { money: { currency: 'EUR' } } as never, text);
  console.log(`${kind.padEnd(9)} ${text.padEnd(18)} -> ${JSON.stringify(got)}`);
}
console.log('--- decimal, which DOES take a sep ---');
console.log("decimal sep ',' on 1.234,56 ->", JSON.stringify(extractField(deps, { decimal: {} } as never, '1.234,56')));
console.log("decimal sep '.' on 1.234,56 ->", JSON.stringify(extractField(deps, { decimal: { sep: '.' } } as never, '1.234,56')));
console.log('--- int ---');
console.log("int on 1.234 ->", JSON.stringify(extractField(deps, { int: {} } as never, 'qty 1.234')));
