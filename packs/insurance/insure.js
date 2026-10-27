/**
 * What each policy has cost so far and where it stands: the premiums paid since it started, the premiums in a year, the
 * share of its term gone, and what its illustration says the fund is worth this year.
 *
 * STARTED WITH A ROW'S ID when its premium, start, maturity or illustration is written, it works that row out. Started
 * with no id, once a day, it works out every policy still running, so the term moves on without anybody touching a row.
 *
 * THE PREMIUM IS THE REPEATING LINE THE POLICY POINTS AT. Its amount and how often it comes round are read from there,
 * so a premium changed in Repeating changes this the next time it runs. Premiums paid is the number of payments that
 * fell between the policy's first day (its own start, else the line's "Since") and today, or its maturity if that came
 * first, times the line's amount. A line that ended stops counting at its end. A policy with no premium line, or with
 * no first day, is left as it is.
 *
 * THE DAYS PAYMENTS FALL ON ARE COUNTED FROM THE FIRST DAY: every month on the same day of the month (the last day of a
 * shorter month), every week or two on the same weekday, twice a month on that day and the fifteen days after it.
 *
 * THE ILLUSTRATION is what the insurer printed: `{ "rows": [ { "year": 2030, "low": 900000, "mid": 1100000, "high":
 * 1400000 } ] }` with amounts in the smallest unit of the policy's cover (or of `currency` when it names one). The
 * mid figure of this year's row, or of the latest earlier year, is written into `illustrated`. Rows it cannot read are
 * left out and nothing is made up.
 *
 * THE ILLUSTRATION IS ALSO LAID OUT AS ROWS, one a year of the policy in `illustration_years` (year, age, low, mid, high),
 * so the policy's page can table them and draw the three lines. A row of the illustration may name an `age`; otherwise
 * it is the policy's `age_at_start` plus the years since it started. A year the illustration no longer holds is taken
 * out, and a year already laid out is only written when a figure changed.
 *
 * It never writes a fund value: that is what the insurer's statement says, typed with the day it is from.
 */

const DAY_MS = 86_400_000;
const PER_YEAR = { weekly: 52, fortnightly: 26, twice_monthly: 24, monthly: 12, quarterly: 4, yearly: 1 };
const MONTHS = { monthly: 1, quarterly: 3, yearly: 12, twice_monthly: 1 };

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const ms = (day) => Date.parse(`${day}T00:00:00Z`);
const dayOf = (n) => new Date(n).toISOString().slice(0, 10);
const money = (m) => m !== null && typeof m === 'object' && typeof m.amount === 'number' && typeof m.currency === 'string';
const same = (a, b) => (money(a) && money(b) ? a.amount === b.amount && a.currency === b.currency : a === b);

/** `day` moved on by `n` months, keeping its day of the month or the last day of a shorter month. */
function months(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const first = Date.UTC(y, m - 1 + n, 1);
  const last = new Date(Date.UTC(y, m + n, 0)).getUTCDate();
  const at = new Date(first);
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), Math.min(d, last));
}

/** How many payments of a line that comes round `every` fall from `start` to `end`, both included. */
function payments(start, end, every) {
  if (!isDay(start) || !isDay(end) || end < start) return 0;
  const stop = ms(end);
  let count = 0;
  if (every === 'weekly' || every === 'fortnightly') {
    const step = (every === 'weekly' ? 7 : 14) * DAY_MS;
    return Math.floor((stop - ms(start)) / step) + 1;
  }
  const gap = MONTHS[every];
  if (!gap) return 0;
  for (let n = 0; n < 2400; n++) {
    const at = months(start, n * gap);
    if (at > stop) break;
    count += 1;
    if (every === 'twice_monthly' && at + 15 * DAY_MS <= stop) count += 1;
  }
  return count;
}

/** The mid figure the illustration gives for this year, or for the latest year before it. */
function illustratedMid(text, year, currency) {
  let doc = text;
  if (typeof doc === 'string') {
    try { doc = JSON.parse(doc); } catch { return null; }
  }
  const rows = doc && Array.isArray(doc.rows) ? doc.rows : [];
  let best = null;
  for (const r of rows) {
    if (!r || typeof r.year !== 'number' || typeof r.mid !== 'number') continue;
    if (r.year <= year && (best === null || r.year > best.year)) best = r;
  }
  if (best === null) return null;
  const code = typeof doc.currency === 'string' ? doc.currency : currency;
  return code ? { amount: Math.round(best.mid), currency: code } : null;
}

/** The illustration's readable rows, one a year, as money in the currency the illustration or the policy is in. */
function illustrationRows(text, currency, startYear, ageAtStart) {
  let doc = text;
  if (typeof doc === 'string') {
    try { doc = JSON.parse(doc); } catch { return []; }
  }
  const code = doc && typeof doc.currency === 'string' ? doc.currency : currency;
  const list = doc && Array.isArray(doc.rows) ? doc.rows : [];
  if (!code) return [];
  const seen = new Map();
  for (const r of list) {
    if (!r || !Number.isInteger(r.year) || typeof r.low !== 'number' || typeof r.mid !== 'number' || typeof r.high !== 'number') continue;
    const age = Number.isInteger(r.age) ? r.age : startYear !== null && Number.isInteger(ageAtStart) ? ageAtStart + (r.year - startYear) : null;
    seen.set(r.year, { year: r.year, age, low: { amount: Math.round(r.low), currency: code }, mid: { amount: Math.round(r.mid), currency: code }, high: { amount: Math.round(r.high), currency: code } });
  }
  return [...seen.values()].sort((a, b) => a.year - b.year);
}

/** Bring the policy's `illustration_years` rows level with its illustration. */
async function layOut(ctx, row, cover) {
  const f = row.fields;
  const startYear = isDay(f.starts_on) ? Number(f.starts_on.slice(0, 4)) : null;
  const want = f.illustration ? illustrationRows(f.illustration, cover, startYear, f.age_at_start) : [];
  const have = await ctx.record.list('illustration_years', { field: 'policy', is: row.id });
  const byYear = new Map(have.filter((h) => !h.fields.deleted_at && !h.deleted_at).map((h) => [h.fields.year, h]));
  for (const w of want) {
    const h = byYear.get(w.year);
    byYear.delete(w.year);
    if (!h) {
      ctx.write('illustration_years', Object.fromEntries(Object.entries({ policy: row.id, ...w }).filter(([, v]) => v !== null)));
      continue;
    }
    const patch = {};
    for (const key of ['age', 'low', 'mid', 'high']) if (!same(h.fields[key] ?? null, w[key])) patch[key] = w[key];
    if (Object.keys(patch).length > 0) ctx.update('illustration_years#' + h.seq, patch, h.version);
  }
  for (const h of byYear.values()) ctx.update('illustration_years#' + h.seq, { deleted_at: true }, h.version);
}

async function work(ctx, row, today) {
  const f = row.fields;
  const line = typeof f.premium === 'string' ? await ctx.record.get(f.premium) : null;
  const next = {};
  const set = (key, value) => {
    if (value === null ? f[key] !== null && f[key] !== undefined : !same(f[key], value)) next[key] = value;
  };
  if (line && money(line.fields.amount) && PER_YEAR[line.fields.every]) {
    const amount = line.fields.amount;
    set('per_year', { amount: Math.round(amount.amount * PER_YEAR[line.fields.every]), currency: amount.currency });
    const start = isDay(f.starts_on) ? f.starts_on : isDay(line.fields.started) ? line.fields.started : null;
    if (start !== null) {
      let end = today;
      if (isDay(f.matures_on) && f.matures_on < end) end = f.matures_on;
      if (isDay(line.fields.ends) && line.fields.ends < end) end = line.fields.ends;
      const n = payments(start, end, line.fields.every);
      set('paid', { amount: n * amount.amount, currency: amount.currency });
      set('payments', n);
    }
  }
  if (isDay(f.starts_on) && isDay(f.matures_on) && f.matures_on > f.starts_on) {
    const gone = (ms(today) - ms(f.starts_on)) / (ms(f.matures_on) - ms(f.starts_on));
    set('term_pct', Math.max(0, Math.min(100, Math.round(gone * 100))));
  }
  const cover = money(f.cover) ? f.cover.currency : money(f.fund_value) ? f.fund_value.currency : null;
  const mid = f.illustration ? illustratedMid(f.illustration, Number(today.slice(0, 4)), cover) : null;
  if (mid !== null || f.illustrated) set('illustrated', mid);
  if (Object.keys(next).length > 0) ctx.update('policies#' + row.seq, next, row.version);
  await layOut(ctx, row, cover);
}

/**
 * Every row of a list that `where` lets through. A script's list is one page of fifty, in the list's own order and with
 * no cursor, so the rows are asked for by number instead: the top number is found by asking above the highest seen,
 * then (0, top] is cut in halves until each half comes back short. At most 60 reads; `short` says some were left.
 */
async function every(ctx, register, where) {
  const PAGE = 50;
  const READS = 60;
  let reads = 0;
  const ask = (above, upto) => {
    reads += 1;
    const parts = [...(where ? [where] : []), ...(above > 0 ? [{ field: 'seq', gt: above }] : []), ...(upto === null ? [] : [{ field: 'seq', lte: upto }])];
    return parts.length === 0 ? ctx.record.list(register) : ctx.record.list(register, parts.length === 1 ? parts[0] : { all: parts });
  };
  const first = await ask(0, null);
  if (first.length < PAGE) return first;
  const seen = new Map(first.map((r) => [r.id, r]));
  let top = Math.max(...first.map((r) => r.seq));
  for (;;) {
    if (reads >= READS) break;
    const above = await ask(top, null);
    for (const r of above) seen.set(r.id, r);
    if (above.length < PAGE) break;
    top = Math.max(...above.map((r) => r.seq));
  }
  const spans = [[0, top]];
  let short = false;
  while (spans.length > 0) {
    if (reads >= READS) {
      short = true;
      break;
    }
    const [a, b] = spans.pop();
    const page = await ask(a, b);
    for (const r of page) seen.set(r.id, r);
    if (page.length >= PAGE && b - a > 1) {
      const mid = Math.floor((a + b) / 2);
      spans.push([a, mid], [mid, b]);
    }
  }
  const rows = [...seen.values()];
  rows.short = short;
  return rows;
}

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  const today = typeof ctx.today === 'function' ? ctx.today() : ctx.now().slice(0, 10);
  const rows = id ? [await ctx.record.get(id)] : await every(ctx, 'policies', { field: 'state', is: 'live' });
  for (const row of rows) if (row) await work(ctx, row, today);
}
