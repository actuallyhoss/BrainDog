/**
 * Paste a plan: a payment plan copied from a spreadsheet or a contract becomes the plan's parts on Instalments.
 *
 * WHAT A PERSON PASTES. One part to a line, as a date, an amount and optionally a name, separated by tabs, semicolons
 * or commas ("2027-01-15, 125000, Down payment"). A date is year-month-day, or day first with slashes, dots or
 * dashes (15/01/2027). An amount may carry a currency sign or thousands marks; an amount with commas in it goes in
 * quotes when commas separate the line. A first line that does not start with a date is the heading and is skipped.
 *
 * WHAT IT WRITES. One part for each good line, on Instalments, linked to this plan, money out, open, from the plan's
 * account when it has one, numbered by date. The amounts are in the plan's price currency (or its value's, or its
 * loan's). A line it cannot read is left out and counted in "What happened". The pasted text is then cleared.
 *
 * IT NEVER ADDS TO A PLAN THAT HAS PARTS, as Generate a plan does not. At most 120 parts.
 */
function cells(line) {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function dayOf(text) {
  let y, m, d;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (hit) [y, m, d] = [hit[1], hit[2], hit[3]];
  else {
    hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
    if (!hit) return null;
    [d, m, y] = [hit[1], hit[2], hit[3]];
  }
  const at = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (at.getUTCFullYear() !== Number(y) || at.getUTCMonth() !== Number(m) - 1 || at.getUTCDate() !== Number(d)) return null;
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** Minor units from "1,250,000.50", "E£ 1.250.000,50" or "125000", or null. */
function minorOf(text) {
  let t = text.replace(/[^0-9.,-]/g, '');
  if (!/[0-9]/.test(t)) return null;
  const neg = t.startsWith('-');
  t = t.replace(/-/g, '');
  const dot = t.lastIndexOf('.');
  const comma = t.lastIndexOf(',');
  const at = Math.max(dot, comma);
  let whole = t;
  let frac = '';
  if (at >= 0 && t.length - at - 1 >= 1 && t.length - at - 1 <= 2) {
    whole = t.slice(0, at);
    frac = t.slice(at + 1);
  }
  whole = whole.replace(/[.,]/g, '');
  if (whole === '' && frac === '') return null;
  const n = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(n) ? (neg ? -n : n) : null;
}

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  if (!id) return;
  const plan = await ctx.record.get(id);
  if (!plan || plan.register !== 'plans') return;
  const f = plan.fields;
  if (typeof f.paste !== 'string' || f.paste.trim() === '') return;
  const say = (said) => ctx.update('plans#' + plan.seq, { paste: null, plan_said: said }, plan.version);

  const named = await ctx.record.list('installments', { all: [{ field: 'plan', is: f.name }] });
  const linked = await ctx.record.list('installments', { all: [{ field: 'plan_row', is: plan.id }] });
  if (named.length + linked.length > 0) return say('This plan already has parts, so nothing was pasted in. Remove them first, or add the missing ones on Instalments.');
  const known = [f.price, f.value, f.mortgage_principal].find((m) => m && typeof m.currency === 'string');
  if (!known) return say('Say the price on the plan first, so the pasted amounts have a currency.');

  const lines = f.paste.split(/\r?\n/).filter((l) => l.trim() !== '');
  const good = [];
  let skipped = 0;
  lines.forEach((line, i) => {
    const c = cells(line);
    const due = dayOf(c[0] || '');
    const amount = minorOf(c[1] || '');
    if (!due || amount === null || amount <= 0) {
      if (!(i === 0 && !due)) skipped++;
      return;
    }
    good.push({ due, amount, label: c.slice(2).filter((x) => x !== '').join(', ') });
  });
  if (good.length === 0) return say('No line could be read. Each line is a date, an amount and optionally a name.');
  if (good.length > 120) return say('That is more than 120 parts. Paste it in two plans.');
  good.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const account = typeof f.account === 'string' && f.account !== '' ? { account: f.account } : {};
  good.forEach((p, i) => {
    ctx.write('installments', {
      what: p.label !== '' ? p.label : f.name + ', part ' + (i + 1) + ' of ' + good.length,
      plan: f.name,
      plan_row: plan.id,
      number: i + 1,
      parts: good.length,
      direction: 'out',
      amount: { amount: p.amount, currency: known.currency },
      due: p.due,
      state: 'open',
      ...account,
    });
  });
  say('Pasted ' + good.length + ' parts' + (skipped > 0 ? ', and left out ' + skipped + ' line' + (skipped === 1 ? '' : 's') + ' it could not read' : '') + '.');
}
