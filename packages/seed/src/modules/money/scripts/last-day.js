/**
 * Money's answer about paydays on a month's last day, as the script a host runs and the declaration a pack document
 * carries.
 *
 * A LINE WHOSE "NEXT" IS A MONTH'S LAST DAY SAYS ONE OF TWO THINGS. A salary on 30 September may be paid on the last
 * day of every month, or on the 30th. Before `day_of_month` the walk read every such line as the last day, so a payday
 * typed on the 30th walked to 31 October. This used to be a question, "2 repeating lines fall on the last day of their
 * month. Is each the last day, or that date?", and it had one answer every time, so the record decides it:
 *   - A YEARLY LINE KEEPS ITS DATE: a domain renewed on 28 February renews on the 28th.
 *   - A LINE IS ON THE LAST DAY only when its own past payments moved with the month's end: paid on two different month
 *     ends (its Since and its Last paid, say 30 April and 31 May, or 28 February and 31 March).
 *   - EVERY OTHER LINE KEEPS ITS DATE: a bill on the 30th of November is billed on the 30th.
 * Each line decided gets `day_of_month`, `last` or the day itself, as the script's own write, with Undo, and nothing is
 * asked. Once filled, the next run finds the line holds days and leaves it.
 *
 * AN ANSWER TO A QUESTION ASKED BEFORE THIS (`ctx.input.answer`, by the rule that asked in its own words) still fills the
 * lines that hold no days, the way it did.
 *
 * THE 31ST IS NOT DECIDED: the last day and that date are the same day in every month, since a day past a short month's
 * end walks on its end. Only the 28th, 29th and 30th, where the two readings part. Weekly and fortnightly lines are left
 * too, since a day of the month means nothing to them, and so is twice a month, whose two days one answer cannot give.
 *
 * NOTHING OUTSIDE `run` IS READ BY IT: its source is the script (`LAST_DAY_SCRIPT.source`), and a sandbox runs that text
 * alone.
 */
export default async function run(ctx) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const LAST = 'The last day';
  const DATE = 'That date';

  /* LIVE AND MONTHLY OR LONGER, and nothing about the new field, so a record still on a Money that has no `day_of_month`
     asks the host nothing it would refuse; the filter on the field is here instead. NARROW ON PURPOSE: a script's list
     is one page with no cursor (`listOptions` in `packages/host/src/script.ts` takes nothing but `includeDeleted`), so
     weekly lines left in would push month-end ones off it on a record with many. */
  const rows = await ctx.record.list('recurring', {
    all: [
      { field: 'state', is: 'live' },
      { field: 'every', in: ['monthly', 'quarterly', 'yearly'] },
    ],
  });
  const asked = [];
  const ymd = (d) => (typeof d === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null);
  const monthEndOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (const row of rows) {
    const f = row.fields;
    const days = typeof f.day_of_month === 'string' ? f.day_of_month.trim() : f.day_of_month;
    if (days !== undefined && days !== null && days !== '') continue;
    if (f.every !== 'monthly' && f.every !== 'quarterly' && f.every !== 'yearly') continue;
    const m = ymd(f.next_due);
    if (!m) continue;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (day !== monthEndOf(year, month) || day === 31) continue;
    /* THE MONTH ENDS ITS OWN PAST PAYMENTS FELL ON, by their day: two different ones say it moves with the month. */
    const ends = new Set();
    for (const past of [f.started, f.last_paid]) {
      const p = ymd(past);
      if (p && Number(p[3]) === monthEndOf(Number(p[1]), Number(p[2]))) ends.add(Number(p[3]));
    }
    const last = f.every !== 'yearly' && ends.size >= 2;
    asked.push({ row, day, last, said: `${f.what}, ${day} ${MONTHS[month - 1]}` });
  }

  /* `day_of_month` AND NOTHING ELSE, on each line, with the version it was read at: the gate refuses a write whose line
     was edited since, so a decision never overwrites what a person typed meanwhile. */
  const patches = (value) => asked.map((a) => ({ id: `recurring#${a.row.seq}`, version: a.row.version, fields: { day_of_month: value(a) } }));
  const options = [
    { label: LAST, patches: patches(() => 'last') },
    { label: DATE, patches: patches((a) => String(a.day)) },
  ];

  const answer = ctx.input && typeof ctx.input.answer === 'string' ? ctx.input.answer : null;
  if (answer !== null) {
    const picked = options.find((o) => o.label === answer);
    if (!picked) {
      ctx.log(`"${answer}" is not one of the answers, so no line was filled.`);
      return null;
    }
    for (const p of picked.patches) ctx.update(p.id, p.fields, p.version);
    return { filled: picked.patches.length };
  }

  if (asked.length === 0) return null;
  /* DECIDED, NOT ASKED: each line by its own payments, as the top says. */
  const decided = patches((a) => (a.last ? 'last' : String(a.day)));
  for (const p of decided) ctx.update(p.id, p.fields, p.version);
  const onLast = asked.filter((a) => a.last).map((a) => a.said);
  const onDate = asked.filter((a) => !a.last).map((a) => a.said);
  ctx.log(
    [
      onLast.length > 0 ? `On the last day of each month, since their payments moved with the month's end: ${aboutOf(onLast)}.` : '',
      onDate.length > 0 ? `Kept on their date: ${aboutOf(onDate)}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  return { filled: decided.length, last: onLast.length, date: onDate.length };

  /* AS MANY NAMES AS FIT 80 BYTES and the rest counted ("Rent, 30 June; Salary, 30 September and 3 more"), the way
     the host joins a list (`aboutOf` in `packages/kernel/src/script-run.ts`). Written out here because a sandbox runs
     this function's text alone. */
  function aboutOf(names) {
    const MOST = 80;
    const bytes = (s) => {
      let n = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0);
        n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
      }
      return n;
    };
    const more = (k) => (k < names.length ? ` and ${names.length - k} more` : '');
    for (let k = names.length; k >= 1; k -= 1) {
      const said = names.slice(0, k).join('; ') + more(k);
      if (bytes(said) <= MOST) return said;
    }
    let first = '';
    for (const ch of names[0]) {
      if (bytes(first + ch + '…' + more(1)) > MOST) break;
      first += ch;
    }
    return first.trimEnd() + '…' + more(1);
  }
}

/**
 * The script as Money's pack document writes it, the way Work writes its own (`workScript` in `../../work.ts`): no egress,
 * no keys, reading and writing Repeating, once a day and when a rule hands it an answer.
 */
export const LAST_DAY_SCRIPT = {
  script: 'last_day',
  title: 'Decide whether a payment on a month end is the last day or that date',
  pack: 'money-core',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['recurring'],
  writes: ['recurring'],
  source: `export default ${run.toString()}`,
};
