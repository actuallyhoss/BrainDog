/* A typed decimal as a whole number of units and how many places those units are, read off its shortest spelling. A
   decimal field holds at most fifteen significant digits, so that spelling is the one that was typed: 4.004 is 4004 in
   thousandths, never 4.00399999999999955946. */
function exact(n) {
  const [mantissa, power = '0'] = String(n).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { units: BigInt(whole + fraction), places: fraction.length - Number(power) };
}

/* Several decimals brought to the finest places any of them has, so they add as whole numbers. */
function inCommon(list) {
  const read = list.map(exact);
  const places = Math.max(0, ...read.map((r) => r.places));
  return { places, units: read.map((r) => r.units * 10n ** BigInt(places - r.places)) };
}

/* Whole units back to a number, through its decimal spelling, which Number reads to the nearest double; or null when the
   spelling has more than the fifteen significant digits a decimal field holds, which the record would refuse. */
function decimal(units, places) {
  const digits = units.toString().padStart(places + 1, '0');
  if (digits.replace(/^0+/, '').replace(/0+$/, '').length > 15) return null;
  return Number(places === 0 ? digits : digits.slice(0, -places) + '.' + digits.slice(-places));
}

/* WHAT MAKING, PACKING AND SENDING ONE COST, ADDED EXACTLY, AND THE LEAST PRICE THEY ALLOW. The least price is five
   halves of the costs, the price at which they are exactly two fifths of it, worked out in whole numbers here. The page
   judges the price live against it, as the figure price less least price, so a price typed a moment ago is judged at
   once and never against a verdict stored before it. */
export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  const rows = id ? [await ctx.record.get(id)] : await ctx.record.list('checks', {});
  for (const row of rows) {
    if (!row) continue;
    const costs = [row.fields.making, row.fields.packing, row.fields.sending];
    let cost = null;
    let least = null;
    /* ALL THREE OR NOTHING: a sum of some of the costs was read as the cost, and passed. */
    if (costs.every((n) => typeof n === 'number')) {
      const common = inCommon(costs);
      const sum = common.units.reduce((total, n) => total + n, 0n);
      cost = decimal(sum, common.places);
      least = cost === null ? null : decimal(sum * 25n, common.places + 1);
      if (least === null) cost = null;
    }
    if ((row.fields.cost ?? null) === cost && (row.fields.least ?? null) === least) continue;
    ctx.update('checks#' + row.seq, { cost, least }, row.version);
  }
}
