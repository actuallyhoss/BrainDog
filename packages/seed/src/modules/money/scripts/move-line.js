/**
 * A PAID BILL MOVES ITS REPEATING LINE ON, ASKED ONCE (B6 of the 24 October scope). A bill and a repeating line can be
 * the same money twice: "Studio salary" as a bill due 9 October and as a line whose Next was 9 October. The bill was
 * marked paid on 23 October and the line kept 9 October, so Today read the salary two weeks late.
 *
 * WHAT IT LOOKS FOR. Handed a bill that is paid, `twinLine` keeps the live repeating lines going the same way, in the
 * same currency, under the same name (folded, as `match_payment` folds a payee), whose Next is within ten days of the
 * bill's due day. EXACTLY ONE IS THE LINE; none or several and nothing is asked.
 *
 * IT ASKS, AND WRITES NOTHING BY ITSELF. `moveLine` is one question on Decide, "Studio salary is paid for 9 October.
 * Move its repeating line on to 31 October?", whose first answer carries the one write: Next, one cycle on, the day
 * the host's `ctx.cycle` walks (Cash ahead's own step). "Leave it" writes nothing. Last paid and Last amount are a
 * payment's, and a bill marked paid by hand had none, so they are left alone, as "It went through" leaves them.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `twinLine` OR `moveLine`, AND NOTHING BUT THEM BY `run`: the texts together are
 * the script (`MOVE_LINE_SCRIPT.source`).
 */

import { CASH_LEGS } from '../legs.ts';

/** WHAT THE WALK READS OF A REPEATING LINE TO STEP IT, Cash ahead's own leg, written into the script as data. */
const LEG = (({ on, every, ends, days, weekend }) => ({ on, every, ends, days, weekend }))(CASH_LEGS.find((l) => l.register === 'recurring'));

export function twinLine(bill, lines, opts) {
  const DAYS = 10;
  const dayOf = (d) => (typeof d === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null);
  const apart = (a, b) => {
    const [x, y] = [dayOf(a), dayOf(b)];
    if (!x || !y) return null;
    return Math.abs(Date.UTC(Number(x[1]), Number(x[2]) - 1, Number(x[3])) - Date.UTC(Number(y[1]), Number(y[2]) - 1, Number(y[3]))) / 86_400_000;
  };
  const plain = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || null;
  const fold = opts && typeof opts.fold === 'function' ? opts.fold : plain;
  const keyOf = (text) => (typeof text === 'string' && text.trim() !== '' ? fold(text) : null);
  const f = bill.fields;
  if (bill.list !== 'obligations' || f.state !== 'paid') return { nothing: 'The bill is not paid, so no line was looked for.' };
  const way = { owed_by_me: 'out', owed_to_me: 'in' }[f.direction];
  const currency = f.amount && typeof f.amount === 'object' ? f.amount.currency : null;
  const key = keyOf(f.what);
  if (!way || !currency || !key || !dayOf(f.due)) return { nothing: 'The bill has no name, way, amount or due day, so no line was looked for.' };
  const found = lines.filter((l) => {
    const g = l.fields;
    if (l.list !== 'recurring' || g.state !== 'live' || g.direction !== way) return false;
    if (!g.amount || typeof g.amount !== 'object' || g.amount.currency !== currency) return false;
    const gap = apart(g.next_due, f.due);
    return gap !== null && gap <= DAYS && keyOf(g.what) === key;
  });
  if (found.length !== 1) return { nothing: found.length === 0 ? 'Nothing repeats under this bill\'s name, so nothing was asked.' : 'More than one line repeats under this bill\'s name, so nothing was asked.' };
  return { line: found[0] };
}

export function moveLine(bill, line, next) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayWords = (d) => {
    const m = typeof d === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(d);
  };
  const g = line.fields;
  const name = String(bill.fields.what ?? '').trim() || 'This';
  /* A DAY, AND A LATER ONE THAN THE LINE NAMES: anything else would walk Next backwards or nowhere. */
  if (!(typeof next === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(next) && typeof g.next_due === 'string' && next > g.next_due))
    return { nothing: `${name} has no later day to move to, so nothing was asked.` };
  return {
    ask: {
      cause: `money.line.${line.spoken}`,
      question: `${name} is paid for ${dayWords(bill.fields.due)}. Move its repeating line on to ${dayWords(next)}?`,
      about: line.spoken,
      options: [
        { label: 'Move it on', because: `Next becomes ${dayWords(next)}, so the line is not read late.`, patches: [{ id: line.spoken, version: line.version, fields: { next_due: next } }] },
        { label: 'Leave it', because: `The line keeps ${dayWords(g.next_due)} as its Next.` },
      ],
    },
  };
}

/**
 * The script: `input.bill` is the paid bill, by id or as "obligations#2". It reads the bill and the live lines whose
 * Next falls within ten days of its due day, finds the one line under its name, asks the host for that line's next day
 * and ends its run with the one question. `LEG` is Cash ahead's leg for Repeating, written into the source by the pack.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const said = typeof input.bill === 'string' ? input.bill : '';
  if (!/^obligations#\d+$/.test(said) && !/^[0-9A-Za-z_-]+$/.test(said)) {
    ctx.log('The script was handed no bill, so no line was looked for.');
    return null;
  }
  const row = await ctx.record.get(said);
  if (!row || row.register !== 'obligations' || !Number.isSafeInteger(row.seq)) return null;
  const bill = { list: 'obligations', id: row.id, spoken: `obligations#${row.seq}`, version: row.version, fields: row.fields };
  const way = { owed_by_me: 'out', owed_to_me: 'in' }[bill.fields.direction];
  const at = typeof bill.fields.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bill.fields.due) ? Date.parse(`${bill.fields.due}T00:00:00Z`) : NaN;
  if (!way || Number.isNaN(at)) {
    ctx.log('The bill has no way or no due day, so no line was looked for.');
    return null;
  }
  const dayFrom = (n) => new Date(at + n * 86_400_000).toISOString().slice(0, 10);
  const rows = await ctx.record.list('recurring', { all: [{ field: 'state', is: 'live' }, { field: 'direction', is: way }, { field: 'next_due', between: [dayFrom(-10), dayFrom(10)] }] });
  const lines = rows.map((r) => ({ list: 'recurring', id: r.id, spoken: `recurring#${r.seq}`, version: r.version, fields: r.fields }));
  const opts = {};
  if (typeof ctx.fold === 'function') {
    const keys = new Map();
    try {
      for (const text of [bill.fields.what, ...lines.map((l) => l.fields.what)]) if (typeof text === 'string' && !keys.has(text)) keys.set(text, await ctx.fold(text));
      opts.fold = (text) => keys.get(text) ?? null;
    } catch {
      ctx.log('The names were compared by their letters and digits, since the fuller compare could not be finished.');
    }
  }
  const twin = twinLine(bill, lines, opts);
  if (twin.nothing) {
    ctx.log(twin.nothing);
    return null;
  }
  if (typeof ctx.cycle !== 'function') {
    ctx.log('The host hands no next day, so nothing was asked.');
    return null;
  }
  let next;
  try {
    next = await ctx.cycle(twin.line.fields.next_due, { leg: LEG, fields: twin.line.fields });
  } catch {
    next = undefined;
  }
  const out = moveLine(bill, twin.line, next);
  if (out.nothing) {
    ctx.log(out.nothing);
    return null;
  }
  return { ask: out.ask };
}

/**
 * The script as Money's pack document writes it: no egress, no keys, started by `bill-moves-line` and never by the
 * clock. It reads Bills and Repeating and writes nothing itself: the one write is the answer's.
 */
export const MOVE_LINE_SCRIPT = {
  script: 'move_line',
  title: 'Ask to move a repeating line on when its bill is paid',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['obligations', 'recurring'],
  writes: ['recurring'],
  source: `${twinLine.toString()}\n${moveLine.toString()}\nconst LEG = ${JSON.stringify(LEG)};\nexport default ${run.toString()}`,
};

/** A BILL MARKED PAID, by its payment or by hand, starts `script.move_line` on the bill. */
export const MOVE_LINE_RULE = {
  rule: 'bill-moves-line',
  name: 'Ask to move a repeating line on when its bill is paid',
  pack: 'money-core',
  on: { written: { register: 'obligations', op: ['update'], fields: ['state'] } },
  when: 'state is paid',
  steps: [{ script: { id: 'move_line', as: 'asking', input: { bill: '{{trigger.entry}}' } } }],
};

/** The rule and the script, as Money's automations spread them. */
export const MOVE_LINE = [MOVE_LINE_RULE, MOVE_LINE_SCRIPT];
