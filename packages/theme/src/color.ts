/**
 * Colour arithmetic for the theme generator. No dependencies, and every constant has a source,
 * because 28 §4.2 requires one.
 *
 *   OKLab matrices .............. Bjorn Ottosson, 2020
 *   Brettel planes and matrices . Brettel, Vienot & Mollon 1997, via libDaltonLens (public domain)
 *   Delta-E 2000 ................ Sharma, Wu & Dalal 2005
 *   APCA ........................ APCA-W3 0.1.9 — advisory only, never a gate (28 §4.1)
 *   Gamut mapping ............... CSS Color 4 §14.2.1
 *
 * sRGB decoding is the exact piecewise transfer function, NOT gamma 2.2. The most-copied
 * implementation omits this and produces visibly dark, wrong results (28 §4.2).
 */

export type Rgb = { r: number; g: number; b: number }; // 0..1 sRGB, may be out of gamut
export type Lch = { L: number; C: number; H: number };  // OKLCH, L 0..1, H degrees
export type Lab = { L: number; a: number; b: number };  // CIELAB D65

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ── sRGB transfer ────────────────────────────────────────────────────────── */

export const lin = (v: number): number =>
  v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

export const unlin = (v: number): number =>
  v < 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

/* ── OKLab ────────────────────────────────────────────────────────────────── */

export function oklabToRgb(L: number, a: number, bb: number): Rgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = L - 0.0894841775 * a - 1.291485548 * bb;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

export function rgbToOklab(rgb: Rgb): Lab {
  const R = lin(rgb.r);
  const G = lin(rgb.g);
  const B = lin(rgb.b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export const lchToRgb = (c: Lch): Rgb =>
  oklabToRgb(c.L, c.C * Math.cos((c.H * Math.PI) / 180), c.C * Math.sin((c.H * Math.PI) / 180));

export function rgbToLch(rgb: Rgb): Lch {
  const o = rgbToOklab(rgb);
  const H = (Math.atan2(o.b, o.a) * 180) / Math.PI;
  return { L: o.L, C: Math.hypot(o.a, o.b), H: H < 0 ? H + 360 : H };
}

/* ── Gamut ────────────────────────────────────────────────────────────────── */

const EPS = 1e-6;
export const inGamut = (c: Rgb): boolean =>
  c.r >= -EPS && c.r <= 1 + EPS && c.g >= -EPS && c.g <= 1 + EPS && c.b >= -EPS && c.b <= 1 + EPS;

/**
 * CSS Color 4 §14.2.1: binary-search chroma down until the colour is inside sRGB.
 * Never let the browser clip — measured in Chrome 152, three authored chromas paint one colour
 * and getComputedStyle hands back the authored string, so it cannot be detected from JS (28 §2.1).
 */
export function gamutMap(c: Lch): Lch {
  if (inGamut(lchToRgb(c))) return c;
  if (c.L >= 1) return { L: 1, C: 0, H: c.H };
  if (c.L <= 0) return { L: 0, C: 0, H: c.H };
  let lo = 0;
  let hi = c.C;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(lchToRgb({ L: c.L, C: mid, H: c.H }))) lo = mid;
    else hi = mid;
  }
  return { L: c.L, C: lo, H: c.H };
}

/* ── Hex, and the quantisation the browser will actually paint ────────────── */

const byte = (v: number) => Math.round(clamp01(v) * 255);

export const toHex = (rgb: Rgb): string =>
  '#' +
  [rgb.r, rgb.g, rgb.b]
    .map((v) => byte(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

export function fromHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  return {
    r: parseInt(s.slice(0, 2), 16) / 255,
    g: parseInt(s.slice(2, 4), 16) / 255,
    b: parseInt(s.slice(4, 6), 16) / 255,
  };
}

/** Every measurement is taken on the quantised colour, because that is what ships. */
export const quantise = (c: Lch): Rgb => fromHex(toHex(lchToRgb(gamutMap(c))));

/**
 * How much chroma the gamut mapper had to take off, as a fraction of what was asked for.
 *
 * THIS IS THE ONLY PLACE THE ANSWER EXISTS. Once a colour is a hex it is inside sRGB by
 * construction — `quantise` clamps, `fromHex` divides by 255 — so asking a hex whether it is in
 * gamut is asking whether a number between 0 and 1 is between 0 and 1, which is what check J did
 * over all 4096 three-digit values without ever being false. What can be wrong is that the emitted
 * colour is a CLIPPED version of the one the palette was solved as, and the mapper is the only thing
 * that knows.
 *
 * ABSOLUTE CHROMA, NOT A FRACTION. A surface at L 0.999 carries 0.014 of chroma and keeps 0.004 of
 * it — 72% lost, and correctly so: near white there is almost no chroma to have, and the whisper of
 * hue that survives is the whole intent. As a fraction that reads as a catastrophe and as an amount
 * it reads as 0.010, which is what it is. A saturated accent giving up 0.06 is the case worth
 * refusing, and only the absolute measure tells the two apart.
 */
export const clipped = (c: Lch): number => Math.max(0, c.C - gamutMap(c).C);

/* ── WCAG 2.1 contrast ────────────────────────────────────────────────────── */

export const relLuminance = (c: Rgb): number =>
  0.2126 * lin(clamp01(c.r)) + 0.7152 * lin(clamp01(c.g)) + 0.0722 * lin(clamp01(c.b));

export function contrast(a: Rgb, b: Rgb): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Solve for the OKLab lightness that hits a target contrast against `ground`, on one side of it.
 * Bisection over the QUANTISED, gamut-mapped colour — solving against the ideal and shipping the
 * rounded one is how a palette misses its own floor by 0.02 (39 §5.6).
 */
export function solveL(target: number, C: number, H: number, ground: Rgb, dir: 'up' | 'down'): Lch {
  const gl = rgbToOklab(ground).L;
  let lo = dir === 'up' ? gl : 0;
  let hi = dir === 'up' ? 1 : gl;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const got = contrast(quantise({ L: mid, C, H }), ground);
    if (dir === 'up') {
      if (got < target) lo = mid;
      else hi = mid;
    } else if (got < target) hi = mid;
    else lo = mid;
  }
  return gamutMap({ L: dir === 'up' ? hi : lo, C, H });
}

/* ── CIELAB and Delta-E 2000 ────────────────────────────────────────── */

const KAPPA = 24389 / 27;
const EPSILON = 216 / 24389;
const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

export function rgbToCielab(rgb: Rgb): Lab {
  const R = lin(clamp01(rgb.r));
  const G = lin(clamp01(rgb.g));
  const B = lin(clamp01(rgb.b));
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Sharma, Wu & Dalal 2005. */
export function deltaE2000(p: Lab, q: Lab): number {
  const C1 = Math.hypot(p.a, p.b);
  const C2 = Math.hypot(q.a, q.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const a1 = (1 + G) * p.a;
  const a2 = (1 + G) * q.a;
  const Cp1 = Math.hypot(a1, p.b);
  const Cp2 = Math.hypot(a2, q.b);
  const hp = (bb: number, aa: number) => {
    if (bb === 0 && aa === 0) return 0;
    const d = (Math.atan2(bb, aa) * 180) / Math.PI;
    return d < 0 ? d + 360 : d;
  };
  const hp1 = hp(p.b, a1);
  const hp2 = hp(q.b, a2);
  const dLp = q.L - p.L;
  const dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * Math.PI) / 360);
  const Lbar = (p.L + q.L) / 2;
  const Cbp = (Cp1 + Cp2) / 2;
  let hbar = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hbar += hp1 + hp2 < 360 ? 360 : -360;
    hbar /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos(((hbar - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hbar * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hbar + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hbar - 63) * Math.PI) / 180);
  const dTheta = 30 * Math.exp(-Math.pow((hbar - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lbar - 50, 2));
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin((2 * dTheta * Math.PI) / 180) * Rc;
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) +
      Math.pow(dCp / Sc, 2) +
      Math.pow(dHp / Sh, 2) +
      Rt * (dCp / Sc) * (dHp / Sh),
  );
}

/* ── Brettel 1997, all three deficiencies, severity 1.0 ───────────────────── */

export type Deficiency = 'protan' | 'deutan' | 'tritan';

type Plane = { m1: number[]; m2: number[]; n: number[] };

const PLANES: Record<Deficiency, Plane> = {
  protan: {
    m1: [0.1498, 1.19548, -0.34528, 0.10764, 0.84864, 0.04372, 0.00384, -0.0054, 1.00156],
    m2: [0.1457, 1.16172, -0.30742, 0.10816, 0.85291, 0.03892, 0.00386, -0.00524, 1.00139],
    n: [0.00048, 0.00393, -0.00441],
  },
  deutan: {
    m1: [0.36477, 0.86381, -0.22858, 0.26294, 0.64245, 0.09462, -0.02006, 0.02728, 0.99278],
    m2: [0.37298, 0.88166, -0.25464, 0.25954, 0.63506, 0.1054, -0.0198, 0.02784, 0.99196],
    n: [-0.00281, -0.00611, 0.00892],
  },
  tritan: {
    m1: [1.01277, 0.13548, -0.14826, -0.01243, 0.86812, 0.14431, 0.07589, 0.805, 0.11911],
    m2: [0.93678, 0.18979, -0.12657, 0.06154, 0.81526, 0.1232, -0.37562, 1.12767, 0.24796],
    n: [0.03901, -0.02788, -0.01113],
  },
};

export function simulate(rgb: Rgb, d: Deficiency): Rgb {
  const p = PLANES[d];
  const v = [lin(clamp01(rgb.r)), lin(clamp01(rgb.g)), lin(clamp01(rgb.b))];
  const dot = v[0]! * p.n[0]! + v[1]! * p.n[1]! + v[2]! * p.n[2]!;
  const m = dot >= 0 ? p.m1 : p.m2;
  const out = [0, 1, 2].map(
    (i) => m[i * 3]! * v[0]! + m[i * 3 + 1]! * v[1]! + m[i * 3 + 2]! * v[2]!,
  );
  return { r: unlin(clamp01(out[0]!)), g: unlin(clamp01(out[1]!)), b: unlin(clamp01(out[2]!)) };
}

/** Delta-E 2000 between two colours as a dichromat sees them — the metric check F uses. */
export const separation = (a: Rgb, b: Rgb, d: Deficiency): number =>
  deltaE2000(rgbToCielab(simulate(a, d)), rgbToCielab(simulate(b, d)));

/* ── APCA-W3 0.1.9 — computed, stored, never a gate (28 §4.1) ─────────────── */

const apcaY = (c: Rgb) => {
  const y =
    0.2126729 * Math.pow(clamp01(c.r), 2.4) +
    0.7151522 * Math.pow(clamp01(c.g), 2.4) +
    0.072175 * Math.pow(clamp01(c.b), 2.4);
  return y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y;
};

export function apcaLc(text: Rgb, bg: Rgb): number {
  const Yt = apcaY(text);
  const Yb = apcaY(bg);
  if (Math.abs(Yb - Yt) < 0.0005) return 0;
  const raw =
    Yb > Yt
      ? (Math.pow(Yb, 0.56) - Math.pow(Yt, 0.57)) * 1.14
      : (Math.pow(Yb, 0.65) - Math.pow(Yt, 0.62)) * 1.14;
  if (Math.abs(raw) < 0.1) return 0;
  return Math.round((raw > 0 ? raw - 0.027 : raw + 0.027) * 100);
}
