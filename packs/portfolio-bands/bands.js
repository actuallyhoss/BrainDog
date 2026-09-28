/**
 * The revenue bands: what the projects take a month now, and the room left in their forecasts next and later.
 *
 * THE RULE. `now` is every project's latest monthly revenue, retired
 * ones that still pay included. A project's headroom is `max(0, base - now)`, where `base` is its base-case forecast
 * of monthly revenue a year out. Headroom on a project being earned from or built is `next`; on one that is parked it
 * is `later`; a retired project has none. One amount per currency, because two currencies are never added.
 *
 * WHICH LANE IS WHICH BAND IS THE TABLE BELOW, and it is the one place to change it. The lanes are Portfolio's own
 * four (`packages/seed/src/modules/portfolio.ts`), so the table names nothing a particular record or import brought.
 *
 * WHICH READING IS `now` AND WHICH IS `base` IS THE OWNER'S, NOT THIS FILE'S. They are the pack's two `list` settings,
 * set on its page and read from `ctx.config` on every run, so a record whose readings are named anything else sets its
 * own names and nobody edits this file. A first cut compiled in the two labels one importer wrote, and a record whose
 * readings were named anything else ran every day and wrote three zeros. Each side is a list, because one number can
 * arrive under an old name and a new one, and a reading is matched on the name whole or on the name followed by ", "
 * and the project, which is how a record names a reading when the Dashboard draws one tile a name. The project itself
 * is the `thing` the reading points at.
 *
 * NAMES THAT WOULD DRAW THE WRONG BAR STOP THE RUN WITH A SENTENCE (`measuresOf`), because a setting says what each
 * name is and never how the two sides stand to each other. Each of these would run every day, say `ok`, and draw the
 * wrong bar:
 *   - a side with no name matches nothing, so every band is zero;
 *   - one name on both sides is counted as `now` and never as `base`, because `bandsOf` asks `now` first;
 *   - a name that is another's name, a comma and more (`Takings` and `Takings, forecast`) is the same trap one step
 *     removed: a forecast reading named `Takings, forecast, Kiln` begins `Takings, `, which is how a reading of
 *     `Takings` names its project;
 *   - and either of those in another case, because the record's `starts` folds ASCII case, so a list asked for
 *     `takings` answers every reading of `Takings` as well.
 */

const LANES = { earning: 'next', building: 'next', parked: 'later' };
const BANDS = ['now', 'next', 'later'];
const REGISTER = 'revenue_bands';

/* THE RECORD ANSWERS ONE PAGE OF FIFTY, most recently written first, and `ctx.record.list` cannot ask for more. So
   readings are asked for one project and one measure at a time, where the fifty newest hold the latest, and a full page
   of projects is said in the run's log, because a band summed over the first fifty projects is short by the rest and
   nothing else would say so. ONE MEASURE A LIST, NOT BOTH: the first cut asked for both in one list, and on a self-host
   fifty daily readings of `now` written after a base typed once pushed the base off the page, so `later` fell to 0 on
   a run that said `ok` (`bands.test.ts`, the whole path). A `starts` on the bare measure also took the bear and bull
   cases an import writes beside the base, which are never used, so each name is matched whole or with its
   ", <project>" after it. */
const PAGE = 50;
const named = (measures) => ({ any: measures.flatMap((m) => [{ field: 'name', is: m }, { field: 'name', starts: `${m}, ` }]) });

/* ISO 4217'S MINOR DIGITS, where they are not two. A reading is a decimal in whole units and a band is money in minor
   units, and the sandbox has no `Intl` to ask. */
const DIGITS = { BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0, BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3, CLF: 4, UYW: 4 };
const minor = (value, currency) => Math.round(value * 10 ** (DIGITS[currency] ?? 2));

const measureOf = (name, measures) => measures.some((m) => name === m || name.startsWith(`${m}, `));

/* THE NAMES ARE COMPARED AS THE RECORD COMPARES THEM, and its `starts` folds ASCII case. Compared as exact text,
   `Takings` and `takings` passed, and the list asked for the forecast answered every reading of today as well: fifty of
   them written after a forecast typed once took `later` from 800,000 to 0 on a run that said nothing. */
const fold = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * The two sides of names from the settings, each trimmed and said once, or a thrown sentence saying why they would draw
 * the wrong bar. Thrown, so the run fails with that sentence and writes nothing, rather than writing a bar that is wrong.
 */
export function measuresOf(config) {
  const side = (name) => {
    const given = config?.[name];
    const list = (Array.isArray(given) ? given : typeof given === 'string' ? [given] : []).map((n) => String(n).trim()).filter((n) => n !== '');
    if (list.length === 0) throw new Error(`The bands need at least one ${name} name, set on this pack's page, or every band is zero.`);
    return [...new Set(list)];
  };
  const now = side('now');
  const base = side('base');
  for (const a of now)
    for (const b of base) {
      if (a === b) throw new Error(`${a} is named as both now and base, so it would be counted as now and never as the forecast.`);
      if (fold(a) === fold(b))
        throw new Error(`${a} and ${b} are one name to the record, which matches a name whatever its case, so the forecast is read beside every reading of today and fifty of those push it out of what the run reads.`);
      const [short, long] = a.length < b.length ? [a, b] : [b, a];
      if (fold(long).startsWith(`${fold(short)}, `))
        throw new Error(`${long} begins with ${short} and a comma, which is how a reading of ${short} names its project, so the two cannot be told apart.`);
    }
  return { now, base };
}

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
 * The three bands per currency, in minor units, from the projects, their readings and the two sides of names
 * `measuresOf` answered, and what could not be counted. Pure, so the rule is one function a reader can check without
 * the record around it.
 */
export function bandsOf(things, readings, { now: NOW, base: BASE }) {
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
  const measures = measuresOf(ctx.config);
  const things = await ctx.record.list('things');
  if (things.length >= PAGE)
    ctx.log(`The record answered a full page of ${PAGE} projects and may hold more, so the bands may be short by the rest.`);

  const readings = [];
  for (const t of things)
    for (const side of [measures.now, measures.base]) readings.push(...(await ctx.record.list('datapoints', { all: [{ field: 'thing', is: t.id }, named(side)] })));

  const { bands, said } = bandsOf(things, readings, measures);
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
