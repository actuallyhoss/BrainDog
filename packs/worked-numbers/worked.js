/**
 * Worked numbers: a number worked out from other numbers, written into Numbers beside the ones it came from.
 *
 * THE RULE. A recipe names the measure it writes, the project it is about, and how it is worked:
 *   - `change`      (newest - earlier) x `per` / the real span between the two, where earlier is the newest reading
 *                   `over` or more before the newest one. A feed that reports every hour gives a span of exactly
 *                   `over`, so the change is the newest less the one `over` before it and nothing is scaled; a feed
 *                   that missed a day gives a longer span, and the change is scaled back to `per`.
 *   - `ratio`       a / b
 *   - `share`       a / (a + b)
 *   - `sum`         a + b
 *   - `difference`  a - b
 * where a is the newest reading of `of` and b the newest reading of `with`. `per` is `over` when the recipe names none.
 *
 * FOUR THINGS WRITE NOTHING AND SAY WHY IN THE LOG, because a nought written for "could not tell" is drawn as a
 * nought: a measure with no reading, an earlier reading more than twice `over` back (a fortnight's change is not a
 * week's, stretched), a divisor of nought, and two measures in two currencies. Money worked with a plain number as
 * though it were one is the same mistake and is refused beside it. One recipe that cannot be worked does not stop the
 * next.
 *
 * A NUMBER IS RENEWED WHEN A READING UNDER IT IS. Run every day over readings that stopped a month ago, the same
 * answer would be written every day with today's date, and a number nothing renews would look alive. So a recipe whose
 * readings are no newer than its last answer is left standing and the log says so.
 *
 * MONEY IS WHOLE MINOR UNITS AND A CURRENCY. A reading's `amount` is that already. An older reading is a number whose
 * unit is a currency's three capital letters, and it is turned by the digits table before anything is worked.
 */

const NUMBERS = 'datapoints';
const RECIPES = 'recipes';
const SOURCE = 'worked';
const WEEK = 7 * 86_400;

/* WHAT EACH KIND IS CALLED IN A SENTENCE, and whether it reads a second measure. */
const KINDS = {
  change: { said: 'a change', second: false },
  ratio: { said: 'a ratio', second: true, mixed: 'divided' },
  share: { said: 'a share', second: true, mixed: 'shared' },
  sum: { said: 'a sum', second: true, mixed: 'added' },
  difference: { said: 'a difference', second: true, mixed: 'taken from each other' },
};

/* THE RECORD ANSWERS ONE PAGE OF FIFTY, most recently written first, and `ctx.record.list` cannot ask for more. So a
   reading is asked for one measure at a time, as the revenue bands ask (`packs/portfolio-bands/bands.js`), and by its
   name whole: the measure, or the measure, a comma and the project, which is how a record names a reading when the
   Dashboard draws one tile a name. AND A FULL PAGE IS ASKED PAST (`newest`), because most recently written is not
   newest: a feed that catches up sends old readings after new ones, and fifty of those hide the newest. */
const PAGE = 50;
const ROUNDS = 40;

/* ISO 4217'S MINOR DIGITS, where they are not two, as the bands hold them: the sandbox has no `Intl` to ask. */
const DIGITS = { BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0, BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3, CLF: 4, UYW: 4 };
const scale = (currency) => 10 ** (DIGITS[currency] ?? 2);
const CURRENCY = /^[A-Z]{3}$/;

/* A DECIMAL HOLDS FIFTEEN SIGNIFICANT DIGITS and the record refuses a sixteenth, which a division makes at once. */
const tidy = (n) => Number(n.toPrecision(12));

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const fold = (s) => s.toLowerCase();

/** A length of time as a person says it: days from a day up, hours under it, minutes under an hour. */
export function lengthSaid(seconds) {
  const [n, word] = seconds >= 86_400 ? [seconds / 86_400, 'day'] : seconds >= 3_600 ? [seconds / 3_600, 'hour'] : [seconds / 60, 'minute'];
  const round = Math.round(n * 10) / 10;
  return `${round} ${word}${round === 1 ? '' : 's'}`;
}

/**
 * A reading as a figure to work with: `n` in minor units and its `currency` when it is money, or `n` as it stands and
 * `currency: null`; `at` is when it was true, in milliseconds. `null` for a row that is not a reading: the seed's
 * example, one with no time, or one with neither an amount nor a number.
 */
export function figureOf(r) {
  const at = Date.parse(text(r.fields.at));
  if (!Number.isFinite(at) || r.fields.source === 'example') return null;
  const a = r.fields.amount;
  if (a !== null && typeof a === 'object' && Number.isInteger(a.amount) && CURRENCY.test(text(a.currency))) return { n: a.amount, currency: text(a.currency), unit: '', at };
  if (typeof r.fields.value !== 'number' || !Number.isFinite(r.fields.value)) return null;
  const unit = text(r.fields.unit);
  return CURRENCY.test(unit) ? { n: Math.round(r.fields.value * scale(unit)), currency: unit, unit: '', at } : { n: r.fields.value, currency: null, unit, at };
}

/**
 * A recipe as the run reads it, or `{ why }` when it says too little to be worked. `names` answers the names a
 * measure's readings go by on the recipe's project.
 */
export function recipeOf(fields, names) {
  const how = KINDS[fields.how];
  if (how === undefined) return { why: 'it does not say how it is worked.' };
  const of = text(fields.of);
  const second = how.second ? text(fields.with) : '';
  if (of === '') return { why: 'it names no measure to work from.' };
  if (how.second && second === '') return { why: `${how.said} needs a second measure.` };
  /* A RECIPE THAT WROTE THE MEASURE IT READS would read its own answer as the newest reading from the second day on. */
  const reads = [...names(of), ...(how.second ? names(second) : [])].map(fold);
  if (reads.includes(fold(text(fields.name)))) return { why: 'it would write the measure it reads.' };
  const over = Number.isInteger(fields.over) ? fields.over : WEEK;
  if (over <= 0) return { why: 'the time it looks back over is nothing.' };
  const per = Number.isInteger(fields.per) && fields.per > 0 ? fields.per : over;
  return { how: fields.how, of, with: second, over, per, unit: text(fields.unit) };
}

/**
 * What a recipe comes to from the figures it reads, or `{ why }` when it comes to nothing that should be written.
 * `a` is the newest of `of`, `b` the newest of `with`, and `earlier` the one a change is measured from. Pure, so the
 * arithmetic is one function a reader can check without the record around it.
 */
export function workedOf(recipe, { a, b, earlier }) {
  const money = (n, currency, unit) => ({ amount: { amount: Math.round(n), currency }, unit });
  const plain = (n, unit) => ({ value: tidy(n), unit });

  if (recipe.how === 'change') {
    if (a.currency !== earlier.currency) return { why: `${recipe.of} changed what it is counted in between its two readings.` };
    const span = (a.at - earlier.at) / 1_000;
    if (span > 2 * recipe.over)
      return { why: `the reading of ${recipe.of} before its newest is ${lengthSaid(span)} older, which is more than twice the ${lengthSaid(recipe.over)} asked for.` };
    const n = ((a.n - earlier.n) * recipe.per) / span;
    return a.currency === null ? plain(n, recipe.unit || a.unit) : money(n, a.currency, recipe.unit);
  }

  if (a.currency !== null && b.currency !== null && a.currency !== b.currency)
    return { why: `${recipe.of} is in ${a.currency} and ${recipe.with} is in ${b.currency}, and two currencies are never worked together.` };
  const mixed = (a.currency === null) !== (b.currency === null);
  const both = a.currency !== null && !mixed;

  if (recipe.how === 'ratio') {
    if (b.n === 0) return { why: `${recipe.with} is nought, and nothing is divided by nought.` };
    /* MONEY OVER A COUNT IS MONEY, what one customer brings. Money over money is a plain number, and a count over
       money is a count for each whole unit of it. */
    if (a.currency !== null && b.currency === null) return money(a.n / b.n, a.currency, recipe.unit);
    return plain(b.currency !== null && a.currency === null ? a.n / (b.n / scale(b.currency)) : a.n / b.n, recipe.unit);
  }

  if (mixed) {
    const [is, not] = a.currency === null ? [recipe.with, recipe.of] : [recipe.of, recipe.with];
    return { why: `${is} is money and ${not} is not, so the two cannot be ${KINDS[recipe.how].mixed}.` };
  }
  if (recipe.how === 'share') {
    if (a.n + b.n === 0) return { why: `${recipe.of} and ${recipe.with} come to nought together, and nothing is divided by nought.` };
    return plain(a.n / (a.n + b.n), recipe.unit);
  }
  const n = recipe.how === 'sum' ? a.n + b.n : a.n - b.n;
  return both ? money(n, a.currency, recipe.unit) : plain(n, recipe.unit || (a.unit === b.unit ? a.unit : ''));
}

export default async function run(ctx) {
  const now = ctx.now();
  const recipes = await ctx.record.list(RECIPES);
  if (recipes.length >= PAGE) ctx.log(`The record answered a full page of ${PAGE} worked numbers and may hold more, so the rest were not worked out this time.`);

  /* ONE ASKING A QUESTION, however many recipes read the same measure. */
  const asked = new Map();
  const ask = (register, where) => {
    const key = `${register}|${JSON.stringify(where)}`;
    if (!asked.has(key)) asked.set(key, ctx.record.list(register, where));
    return asked.get(key);
  };

  /**
   * The newest reading among those `filter` picks, on or before `bound` when there is one. A page that is not full
   * held every such reading. A full one may not have, so the record is asked for anything newer than the best so far,
   * until it answers nothing or a page that is not full.
   */
  const newest = async (filter, bound) => {
    let best = null;
    for (let round = 0; round < ROUNDS; round += 1) {
      const where = { all: [...filter, ...(bound === undefined ? [] : [{ field: 'at', lte: new Date(bound).toISOString() }]), ...(best === null ? [] : [{ field: 'at', gt: new Date(best.at).toISOString() }])] };
      const page = await ask(NUMBERS, where);
      const before = best;
      for (const r of page) {
        const f = figureOf(r);
        if (f !== null && (best === null || f.at > best.at)) best = f;
      }
      if (page.length < PAGE || best === before) return best;
    }
    return best;
  };

  /* IN THE ORDER THEY WERE MADE, so two runs over the same recipes write in the same order. */
  for (const r of [...recipes].sort((x, y) => x.seq - y.seq)) {
    const name = text(r.fields.name);
    const thing = typeof r.fields.thing === 'string' && r.fields.thing !== '' ? r.fields.thing : null;
    const project = thing === null ? '' : text((await ask('things', { field: 'id', is: thing }))[0]?.fields.name);
    const names = (measure) => (project === '' ? [measure] : [measure, `${measure}, ${project}`]);
    const on = thing === null ? '' : ` on ${project === '' ? 'its project' : project}`;
    const not = (why) => ctx.log(`${name} was not worked out: ${why}`);

    const recipe = recipeOf(r.fields, names);
    if (recipe.why !== undefined) {
      not(recipe.why);
      continue;
    }
    /* THE READINGS OF ONE MEASURE ON THIS RECIPE'S PROJECT, or the ones with no project when it names none. */
    const about = thing === null ? { field: 'thing', empty: true } : { field: 'thing', is: thing };
    const readings = (measure) => [about, { any: names(measure).map((n) => ({ field: 'name', is: n })) }, { field: 'source', not: 'example' }];

    const got = { a: await newest(readings(recipe.of)), b: null, earlier: null };
    if (got.a === null) {
      not(`${recipe.of} has no reading${on}.`);
      continue;
    }
    if (recipe.how === 'change') {
      got.earlier = await newest(readings(recipe.of), got.a.at - recipe.over * 1_000);
      if (got.earlier === null) {
        not(`${recipe.of} has no reading${on} from ${lengthSaid(recipe.over)} or more before its newest.`);
        continue;
      }
    } else {
      got.b = await newest(readings(recipe.with));
      if (got.b === null) {
        not(`${recipe.with} has no reading${on}.`);
        continue;
      }
    }
    const out = workedOf(recipe, got);
    if (out.why !== undefined) {
      not(out.why);
      continue;
    }
    const last = await newest([about, { field: 'name', is: name }, { field: 'source', is: SOURCE }]);
    if (last !== null && last.at >= Math.max(got.a.at, got.b?.at ?? 0)) {
      ctx.log(`${name} stands as it was: no reading under it is newer than the last time it was worked out.`);
      continue;
    }

    const figure = out.amount === undefined ? { value: out.value } : { amount: out.amount };
    ctx.write(NUMBERS, { name, ...figure, ...(out.unit === '' ? {} : { unit: out.unit }), ...(thing === null ? {} : { thing }), at: now, source: SOURCE });
    /* AND THE RECIPE IS TOLD WHAT IT CAME TO, so its page draws each one beside its newest value and when. */
    ctx.update(`${RECIPES}#${r.seq}`, { ...figure, worked_at: now }, r.version);
  }
}
