/**
 * The revenue bands: what the projects take a month now, and the room left in their forecasts next and later.
 *
 * THE OLD TOOL'S RULE (`loop/research-legacy-keeps.md` section 3). `now` is every project's latest monthly revenue,
 * retired ones that still pay included. A project's headroom is `max(0, base - now)`, where `base` is its base-case
 * forecast of monthly revenue a year out. Headroom on a project being earned from or built is `next`; on one that is
 * parked (the old tool's `explore`) it is `later`; a retired project has none. One amount per currency, because two
 * currencies are never added.
 *
 * WHICH LANE IS WHICH BAND IS THE TABLE BELOW, and it is the one place to change it. the old tool's `maintain` arrives here
 * as `earning` (`LANES` in `apps/cli/src/legacy.ts`), so a maintained project's headroom is counted in `next`, and
 * its `infra` arrives as `building`, where it counts too. the old tool gave neither any headroom.
 *
 * THE READINGS ARE MATCHED BY PROJECT, NOT BY NAME ALONE. The import names each one "<measure>, <project>" because the
 * Dashboard draws one tile a name, so the measure is the text before that comma and the project is the `thing` it
 * points at. "Revenue, next twelve months" is the import's first label for the base case, and it is the same number:
 * `outlook.rev12[1]` is a monthly figure a year out, not a twelve-month total (section 3 again, measured on his record).
 */

const NOW = ['Monthly revenue'];
const BASE = ['Monthly revenue a year out: base', 'Revenue, next twelve months'];
const LANES = { earning: 'next', building: 'next', parked: 'later' };
const BANDS = ['now', 'next', 'later'];
const REGISTER = 'revenue_bands';

/* THE RECORD ANSWERS ONE PAGE OF FIFTY, most recently written first, and `ctx.record.list` cannot ask for more. So
   readings are asked for one project and one measure at a time, where the fifty newest hold the latest, and a full page
   of projects is said in the run's log, because a band summed over the first fifty projects is short by the rest and
   nothing else would say so. ONE MEASURE A LIST, NOT BOTH: the first cut asked for both in one list, and on a self-host
   fifty daily Monthly revenue readings written after a base typed once pushed the base off the page, so `later` fell
   from 1,415,000 to 0 on a run that said `ok` (`bands.test.ts`, the whole path). A `starts` on the bare measure also
   took the bear and bull cases, three readings an import that are never used, so each name is matched whole or with
   its ", <project>" after it. */
const PAGE = 50;
const named = (measures) => ({ any: measures.flatMap((m) => [{ field: 'name', is: m }, { field: 'name', starts: `${m}, ` }]) });

/* ISO 4217'S MINOR DIGITS, where they are not two. A reading is a decimal in whole units and a band is money in minor
   units, and the sandbox has no `Intl` to ask. */
const DIGITS = { BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0, BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3, CLF: 4, UYW: 4 };
const minor = (value, currency) => Math.round(value * 10 ** (DIGITS[currency] ?? 2));

const measureOf = (name, measures) => measures.some((m) => name === m || name.startsWith(`${m}, `));

/** The reading's currency, or `null` when its unit is not three letters and it cannot be money. */
const currencyOf = (r) => {
  const unit = String(r.fields.unit ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(unit) ? unit : null;
};

/** The later of two readings: by when it was true, then by when it was written. */
const later = (a, b) => {
  if (a === undefined) return b;
  const x = String(a.fields.at ?? '');
  const y = String(b.fields.at ?? '');
  return y > x || (y === x && String(b.updated_at) > String(a.updated_at)) ? b : a;
};

/**
 * The three bands per currency, in minor units, from the projects and their readings, and what could not be counted.
 * Pure, so the rule is one function a reader can check against section 3 without the record around it.
 */
export function bandsOf(things, readings) {
  const latest = new Map();
  for (const r of readings) {
    /* THE SEED'S EXAMPLE ROWS ARE LEFT OUT, as every dashboard over datapoints leaves them out. */
    if (r.fields.source === 'example' || typeof r.fields.value !== 'number') continue;
    const name = String(r.fields.name ?? '');
    const kind = measureOf(name, NOW) ? 'now' : measureOf(name, BASE) ? 'base' : null;
    if (kind === null) continue;
    const key = `${r.fields.thing}|${kind}`;
    latest.set(key, later(latest.get(key), r));
  }

  const bands = {};
  const said = [];
  const add = (currency, band, amount) => {
    bands[currency] ??= { now: 0, next: 0, later: 0 };
    bands[currency][band] += amount;
  };
  for (const t of things) {
    const name = String(t.fields.name ?? t.id);
    const now = latest.get(`${t.id}|now`);
    const base = latest.get(`${t.id}|base`);
    const nowIn = now === undefined ? null : currencyOf(now);
    const baseIn = base === undefined ? null : currencyOf(base);
    if (now !== undefined && nowIn === null) said.push(`${name}'s monthly revenue is in ${JSON.stringify(now.fields.unit ?? '')}, which is not a currency, so it is not counted.`);
    if (nowIn !== null) add(nowIn, 'now', minor(now.fields.value, nowIn));

    const band = LANES[t.fields.lane];
    if (band === undefined || base === undefined) continue;
    if (baseIn === null) {
      said.push(`${name}'s base case is in ${JSON.stringify(base.fields.unit ?? '')}, which is not a currency, so it adds no headroom.`);
      continue;
    }
    if (nowIn !== null && nowIn !== baseIn) {
      said.push(`${name} takes ${nowIn} today and is forecast in ${baseIn}, and two currencies are not subtracted, so it adds no headroom.`);
      continue;
    }
    const taking = nowIn === null ? 0 : minor(now.fields.value, nowIn);
    add(baseIn, band, Math.max(0, minor(base.fields.value, baseIn) - taking));
  }
  return { bands, said };
}

export default async function run(ctx) {
  const things = await ctx.record.list('things');
  if (things.length >= PAGE)
    ctx.log(`The record answered a full page of ${PAGE} projects and may hold more, so the bands may be short by the rest.`);

  const readings = [];
  for (const t of things)
    for (const measures of [NOW, BASE]) readings.push(...(await ctx.record.list('datapoints', { all: [{ field: 'thing', is: t.id }, named(measures)] })));

  const { bands, said } = bandsOf(things, readings);
  for (const line of said) ctx.log(line);

  /* ONE ROW A BAND AND A CURRENCY, UPDATED IN PLACE, so the split draws today's bar and not every day's bars summed.
     A band that has not moved is not written again, and a currency no project holds any more goes to zero rather than
     standing at whatever it last was. */
  const held = new Map();
  for (const r of await ctx.record.list(REGISTER)) {
    const amount = r.fields.amount;
    if (amount && typeof amount.currency === 'string') held.set(`${amount.currency}|${r.fields.band}`, r);
  }
  const currencies = [...new Set([...Object.keys(bands), ...[...held.keys()].map((k) => k.split('|')[0])])].sort();
  const at = ctx.now();
  for (const currency of currencies) {
    for (const band of BANDS) {
      const amount = { amount: bands[currency]?.[band] ?? 0, currency };
      const row = held.get(`${currency}|${band}`);
      if (row === undefined) {
        if (bands[currency] !== undefined) ctx.write(REGISTER, { band, amount, at });
      } else if (row.fields.amount.amount !== amount.amount) {
        ctx.update(`${REGISTER}#${row.seq}`, { amount, at }, row.version);
      }
    }
  }
}
