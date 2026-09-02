/**
 * `node src/proof.ts` — prints the generated palette, its contrast matrix and every finding.
 * This is the artefact that makes "the palette is derived, not picked" checkable by a person.
 */

import { HOUSE, HIGH_CONTRAST } from './index.ts';
import { INKS, INTENTS, SURFACES, type Built, type Scheme, parseColour } from './build.ts';
import { contrast, separation, toHex, rgbToLch } from './color.ts';
import { validate, refusals, warnings } from './checks.ts';
import { toCSS, A11Y_FORCED_COLORS } from './css.ts';

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
    ['info', p.accent],
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

const css = toCSS(HOUSE, HIGH_CONTRAST) + A11Y_FORCED_COLORS;
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

console.log(`  BrainDog red #F42A2A is oklch(${(() => {
  const c = rgbToLch(parseColour('#F42A2A'));
  return `${c.L.toFixed(3)} ${c.C.toFixed(3)} ${c.H.toFixed(1)}`;
})()})`);
console.log(`  danger-fill  dark  ${HOUSE.schemes.dark['danger-fill']}   light ${HOUSE.schemes.light['danger-fill']}`);
void toHex;

if (bad.length > 0) process.exitCode = 1;
