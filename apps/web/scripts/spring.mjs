/**
 * Emit the `linear()` stops for `--ease-spring`.
 *
 * A damped spring at zeta 0.7467, omega 6.56. Analytic overshoot is e^(-pi*z/sqrt(1-z^2)) = 1.029,
 * and the LAST STOP IS FORCED TO EXACTLY 1 — a spring that overshoots and settles at 0.998 leaves a
 * one-pixel gap on every panel forever (13 §9).
 *
 *   node scripts/spring.mjs
 */

const Z = 0.7467;
const W = 6.56;
const WD = W * Math.sqrt(1 - Z * Z);
const STOPS = 24;

const x = (t) => 1 - Math.exp(-Z * W * t) * (Math.cos(WD * t) + ((Z * W) / WD) * Math.sin(WD * t));

/** Settle time: the last moment the curve is more than a thousandth away from home. */
let settle = 0;
for (let t = 0; t < 8; t += 0.001) if (Math.abs(x(t) - 1) > 0.001) settle = t;

const values = Array.from({ length: STOPS }, (_, i) => x((i / (STOPS - 1)) * settle));
values[STOPS - 1] = 1;

const peak = Math.max(...values);
if (peak > 1.05) throw new Error(`spring peaks at ${peak.toFixed(4)}; the ceiling is 1.05 (13 §9)`);

console.log(`/* zeta ${Z}, omega ${W}, settle ${settle.toFixed(3)}s, peak ${peak.toFixed(4)} */`);
console.log(`linear(${values.map((v) => v.toFixed(4)).join(', ')})`);
