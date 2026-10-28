/**
 * Money's question about paydays on a month's last day, as the script a host runs and the declaration
 * a pack document carries.
 *
 * A LINE WHOSE "NEXT" IS A MONTH'S LAST DAY SAYS ONE OF TWO THINGS, and the record cannot tell which. A salary on
 * 30 September may be paid on the last day of every month, or on the 30th. Before `day_of_month` the walk read every such
 * line as the last day, so a payday typed on the 30th walked to 31 October. So the record asks once, for all of them:
 * "3 repeating lines fall on the last day of their month. Is each the last day, or that date?", and the answer fills
 * `day_of_month` on each, `last` or the day itself. A record with no such line asks nothing.
 *
 * ONE QUESTION, NEVER ONE A LINE. The run returns the one question with its cause, `money.last-day`, and each answer as
 * the patches it makes, so the host files at most one open question for the cause and picking an answer is the writes
 * (the shell's "a scheduled script may end its run by filing one question": `scope/area-record-a.md`). Handed an
 * answer as `ctx.input.answer`, by a rule that asked in its own words, the run makes the same writes itself. Once
 * answered, every line it asked about holds days, so the next run finds none and asks nothing.
 *
 * THE 31ST IS NOT ASKED ABOUT: the last day and that date are the same day in every month, since a day past a short
 * month's end walks on its end. Only the 28th, 29th and 30th, where the two readings part. Weekly and fortnightly lines
 * are not asked about either, since a day of the month means nothing to them, and nor is twice a month, whose two days
 * one answer cannot give.
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
  for (const row of rows) {
    const f = row.fields;
    const days = typeof f.day_of_month === 'string' ? f.day_of_month.trim() : f.day_of_month;
    if (days !== undefined && days !== null && days !== '') continue;
    if (f.every !== 'monthly' && f.every !== 'quarterly' && f.every !== 'yearly') continue;
    const m = typeof f.next_due === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.next_due) : null;
    if (!m) continue;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const monthEnd = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day !== monthEnd || day === 31) continue;
    asked.push({ row, day, said: `${f.what}, ${day} ${MONTHS[month - 1]}` });
  }

  /* `day_of_month` AND NOTHING ELSE, on each line asked about, with the version it was read at: the gate refuses a pick
     whose line was edited since, so an answer days later never overwrites what a person typed meanwhile. */
  const patches = (value) => asked.map((a) => ({ id: `recurring#${a.row.seq}`, version: a.row.version, fields: { day_of_month: value(a) } }));
  /* EACH ANSWER SAYS WHAT IT DOES TO THE DAYS AHEAD, since the two labels alone read alike to somebody who never
     thought about it. */
  const it = asked.length === 1 ? 'It' : 'Each';
  const options = [
    { label: LAST, because: `${it} moves with the month's end: the 31st in a long month, the 28th or 29th in February.`, patches: patches(() => 'last') },
    { label: DATE, because: `${it} stays on that day, and falls on the month's end only when a month is shorter.`, patches: patches((a) => String(a.day)) },
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
  const n = asked.length;
  const question =
    n === 1
      ? '1 repeating line falls on the last day of its month. Is it the last day, or that date?'
      : `${n} repeating lines fall on the last day of their month. Is each the last day, or that date?`;
  return { ask: { cause: 'money.last-day', question, about: aboutOf(asked.map((a) => a.said)), options } };

  /* ONE `about`, AS MANY NAMES AS FIT THE GATE'S 80 BYTES and the rest counted ("Rent, 30 June; Salary, 30 September
     and 3 more"), the way the host joins a list (`aboutOf` in `packages/kernel/src/script-run.ts`), so what Decide shows
     is what the script said. Written out here because a sandbox runs this function's text alone. */
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
  title: 'Ask whether a payment on a month end is the last day or that date',
  pack: 'money-core',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['recurring'],
  writes: ['recurring'],
  source: `export default ${run.toString()}`,
};
