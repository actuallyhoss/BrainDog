/**
 * `node scripts/proof.ts` — prints the generated palette, its contrast matrix and every finding.
 * This is the artefact that makes "the palette is derived, not picked" checkable by a person.
 *
 * IN `scripts/` AND NOT IN `src/`, because it names `process` — which exists in neither runtime this
 * package ships to. The stack gate is right to refuse that under `src/`, and was not looking for it:
 * a script that runs on a laptop is not package source, and the directory is what says so.
 */

import { readFile } from 'node:fs/promises';

import { HOUSE, HIGH_CONTRAST } from '../src/index.ts';
import { INKS, INTENTS, SURFACES, type Built, type Scheme, parseColour } from '../src/build.ts';
import { contrast, separation, toHex, rgbToLch } from '../src/color.ts';
import { validate, refusals, warnings } from '../src/checks.ts';
import { toCSS, forcedColors } from '../src/css.ts';

/* THE REAL BLOCK, READ FROM THE FILE THE APP LOADS. Building it here with `forcedColors(…)` and
   then asking `validate` whether the stylesheet contains one is the caller handing in the thing
   being looked for — check L cannot fail that way, and this proof is the artefact that is supposed
   to make the checks believable to a person. */
const FORCED = await readFile(new URL('../../skin/a11y.css', import.meta.url), 'utf8');
void forcedColors;

const pad = (s: string, n: number) => s.padEnd(n);
const num = (n: number) => n.toFixed(2).padStart(6);

function matrix(built: Built, scheme: Scheme) {
  const p = built.schemes[scheme];
  console.log(`\n  ${scheme.toUpperCase()} — ink on surface (AA body text needs 4.50)\n`);
  console.log('  ' + pad('', 13) + SURFACES.map((s) => pad(s, 8)).join(''));
  for (const role of [...INKS, 'accent-text', 'edge', ...INTENTS] as const) {
    const row = SURFACES.map((s) => pad(num(contrast(parseColour(p[role]), parseColour(p[s]))).trim(), 8)).join('');
    console.log('  ' + pad(role, 13) + row);
  }
  console.log('\n  ' + pad('role', 14) + pad('value', 10) + 'oklch');
  for (const [role, value] of Object.entries(p)) {
    const c = rgbToLch(parseColour(value));
    console.log(
      '  ' +
        pad(role, 14) +
        pad(value, 10) +
        `${c.L.toFixed(3)} ${c.C.toFixed(3)} ${c.H.toFixed(1)}`,
    );
  }
}

function separability(built: Built, scheme: Scheme) {
  const p = built.schemes[scheme];
  const set: [string, string][] = [
    ['good', p.earn],
    ['warn', p.warn],
    ['bad', p.danger],
    /* `p.info`, NOT `p.accent`. Check F measures the four INTENTS; this printed the accent under the
       word `info` and called it the same table, so the artefact that exists to make the gate
       checkable by a person could print a passing figure for a pair the gate refuses. */
    ['info', p.info],
  ];
  console.log(`\n  ${scheme.toUpperCase()} — intent separability, delta-E 2000 after Brettel 1997 at severity 1.0`);
  console.log('  ' + pad('pair', 14) + pad('protan', 9) + pad('deutan', 9) + 'tritan');
  let worst = Infinity;
  for (let i = 0; i < set.length; i++)
    for (let j = i + 1; j < set.length; j++) {
      const vals = (['protan', 'deutan', 'tritan'] as const).map((d) =>
        separation(parseColour(set[i]![1]), parseColour(set[j]![1]), d),
      );
      worst = Math.min(worst, ...vals);
      console.log(
        '  ' + pad(`${set[i]![0]} / ${set[j]![0]}`, 14) + vals.map((v) => pad(v.toFixed(1), 9)).join(''),
      );
    }
  console.log(`  worst pair: ${worst.toFixed(1)} — the floor is 10 with glyphs, 20 without.`);
}

for (const built of [HOUSE, HIGH_CONTRAST]) {
  console.log('\n' + '═'.repeat(72));
  console.log(`  theme.${built.id}   seed ${built.seed.accent}   neutral hue ${built.seed.neutralHue}`);
  console.log('═'.repeat(72));
  matrix(built, 'dark');
  matrix(built, 'light');
  separability(built, 'dark');
  separability(built, 'light');
}

const css = toCSS(HOUSE, HIGH_CONTRAST) + FORCED;
const findings = [...validate(HOUSE, css), ...validate(HIGH_CONTRAST, css)];
const bad = refusals(findings);
const warn = warnings(findings);

console.log('\n' + '═'.repeat(72));
console.log(`  the validator — 16 checks, both schemes, every surface`);
console.log('═'.repeat(72));
for (const w of warn) console.log(`  warn   ${w.check}  ${w.fix}`);
for (const b of bad) console.log(`  REFUSE ${b.check}  ${b.fix}`);
console.log(
  bad.length === 0
    ? `\n  PASS — ${findings.length} findings, 0 refusals, ${warn.length} warnings.\n`
    : `\n  REFUSED — ${bad.length} floors breached.\n`,
);

console.log(`  BrainDog red #CF413A is oklch(${(() => {
  const c = rgbToLch(parseColour('#CF413A'));
  return `${c.L.toFixed(3)} ${c.C.toFixed(3)} ${c.H.toFixed(1)}`;
})()})`);
console.log(`  danger-fill  dark  ${HOUSE.schemes.dark['danger-fill']}   light ${HOUSE.schemes.light['danger-fill']}`);
void toHex;

if (bad.length > 0) process.exitCode = 1;
