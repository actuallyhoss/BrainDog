import { satisfies } from '../src/index.ts';

const cases: [string | null, string, boolean][] = [
  // [version, range, what semver says]
  ['1.10.0', '>=1.9.0', true],
  ['1.9.0', '>=1.10.0', false],
  ['1.0.0-alpha', '>=1.0.0', false],   // a prerelease is BELOW its release
  ['2.0.0-rc.1', '^2.0.0', false],
  ['1.0.0-alpha', '1.0.0', false],     // exact match must not match a prerelease
  ['0.9.0', '^0.1.0', false],          // caret on 0.x pins the MINOR
  ['0.1.9', '^0.1.0', true],
  ['1.2.3', '~1.2.0', true],           // tilde: >=1.2.0 <1.3.0
  ['0.2.0', '~1.2.0', false],          // 0.2.0 is nowhere near ~1.2.0
  ['9.9.9', 'not-a-range', false],
  ['0.0.0', 'not-a-range', false],
  ['1.2.3', '', true],                 // documented: empty is anything
  ['1.2.3', '   ', true],
  ['1.2.3', '>= 1.0.0', true],
];

let wrong = 0;
for (const [v, r, expect] of cases) {
  const got = satisfies(v, r);
  const flag = got === expect ? '   ' : '<<<';
  if (got !== expect) wrong++;
  console.log(`${flag} satisfies(${JSON.stringify(v).padEnd(14)}, ${JSON.stringify(r).padEnd(14)}) = ${String(got).padEnd(5)} semver says ${expect}`);
}
console.log(`\n${wrong} of ${cases.length} disagree with semver`);
