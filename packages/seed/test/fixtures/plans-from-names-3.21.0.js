/* money-core 3.21.0's plans script as it was released, read by `quiet-update.test.ts` to put 3.21.0 back. */

/**
 * A plan as a row of its own, and what is left of it after each part (REC-B12 jobs 1 and 2), as the decision, the
 * script a host runs round it, and the declaration a pack document carries.
 *
 * A PLAN WAS ONLY A NAME ITS PARTS SHARED. Handed the parts on Instalments and the rows on Plans, `plansFromNames`
 * answers with what follows:
 *   - each distinct plan text with no row on Plans becomes one, named as the parts name it, with who and the account
 *     when every part that names one names the same;
 *   - each part is linked to the plan its text names ("Part of");
 *   - each part holds what is left once it is paid ("Left after"): the plan's open parts due after it, added up, so
 *     the last part reads nought;
 *   - a plan with no part still open is paid. A plan that reads paid or cancelled stays as it reads, whatever its parts
 *     say: closing one may be a person's word, and opening it again is theirs alone.
 *
 * THE TEXT IS MATCHED AS IT IS WRITTEN, letter for letter, because Cash ahead groups parts by the same text
 * (`CASH_LEGS`, `group: 'plan'`) and a plan's name is unique the same way. "Desk" and "desk" are two plans in both
 * places until somebody writes them alike. A blank text is no plan.
 *
 * TWO CURRENCIES ARE NEVER ADDED. What is left after a part is counted in that part's own currency, from the open
 * parts in it, and a part in another is left out of the sum. A part with no amount or no day is counted nowhere and
 * is told nothing about what is left.
 *
 * PARTS DUE ON ONE DAY are counted in the order of their numbers, then the order they were written in, so two parts on
 * one day do not each leave the other out.
 *
 * TWO RUNS MAKE A PLAN WHOLE, AND A THIRD WRITES NOTHING. What a script writes is in the record only once its run is
 * over, so a plan made in this run has no id to link to yet: `waiting` counts the parts whose link is the next run's.
 * The next run is not the night's: a plan made starts the script again for that plan (`run`, handed a plan), so the
 * first part of a new plan does not show an empty "Part of" until tomorrow. The plan's number is not guessed and
 * written in the same run, because a plan somebody else made in between would take the number and the part with it.
 * Every change is written only where the record holds something else, at the version the part was read at.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `plansFromNames`, AND NOTHING BUT `plansFromNames` BY `run`: the two texts together
 * are the script (`PLANS_FROM_NAMES_SCRIPT.source`).
 */

export function plansFromNames(parts, plans) {
  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);
  const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const seqOf = (r) => Number(String(r.spoken).split('#')[1]) || 0;
  const oldestFirst = (rows) => [...rows].sort((a, b) => seqOf(a) - seqOf(b));
  const open = (p) => p.fields.state !== 'paid' && p.fields.state !== 'cancelled';

  /* THE OLDEST ROW OF A NAME IS THE PLAN. The name is unique, so there is one; were there ever two, every run would
     still pick the same one. */
  const named = new Map();
  for (const plan of oldestFirst(plans)) {
    const name = plan.fields.name;
    if (typeof name === 'string' && name.trim() !== '' && !named.has(name)) named.set(name, plan);
  }
  const groups = new Map();
  for (const part of oldestFirst(parts)) {
    const name = part.fields.plan;
    if (typeof name !== 'string' || name.trim() === '') continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(part);
  }

  const out = { plans: [], writes: [], waiting: 0 };
  for (const [name, group] of groups) {
    const plan = named.get(name);
    const state = group.some(open) ? 'open' : group.some((p) => p.fields.state === 'paid') ? 'paid' : 'cancelled';
    if (!plan) {
      /* WHO AND THE ACCOUNT ONLY WHEN THE PARTS AGREE: a plan paid from two accounts names neither. */
      const agreed = (field) => {
        const said = new Set(group.map((p) => p.fields[field]).filter((v) => typeof v === 'string' && v !== ''));
        return said.size === 1 ? { [field]: [...said][0] } : {};
      };
      out.plans.push({ name, state, ...agreed('party'), ...agreed('account') });
      out.waiting += group.length;
    } else if (plan.fields.state !== state && plan.fields.state !== 'paid' && plan.fields.state !== 'cancelled' && state !== 'cancelled') {
      /* A CLOSED PLAN IS NEVER OPENED HERE. No read says who closed it, and a plan somebody marked paid by hand while a
         part was still open was opened again that night, with a line saying so. */
      out.writes.push({ id: plan.spoken, version: plan.version, fields: { state } });
    }

    /* WALKED FROM THE LAST PART BACK, keeping one running sum a currency: what is left after a part is the sum as it
       stands when the walk reaches it, and an open part then adds itself for the parts before it. */
    const counted = group.filter((p) => moneyOf(p.fields.amount) && isDay(p.fields.due));
    const numberOf = (p) => (Number.isSafeInteger(p.fields.number) ? p.fields.number : Infinity);
    counted.sort((a, b) => (a.fields.due < b.fields.due ? -1 : a.fields.due > b.fields.due ? 1 : numberOf(a) - numberOf(b) || seqOf(a) - seqOf(b)));
    const left = new Map();
    const sums = new Map();
    for (let i = counted.length - 1; i >= 0; i--) {
      const { amount, currency } = counted[i].fields.amount;
      left.set(counted[i], { amount: sums.get(currency) ?? 0, currency });
      if (open(counted[i])) sums.set(currency, (sums.get(currency) ?? 0) + amount);
    }

    for (const part of group) {
      const fields = {};
      if (plan && part.fields.plan_row !== plan.id) fields.plan_row = plan.id;
      const after = left.get(part);
      const held = moneyOf(part.fields.left_after);
      if (after && Number.isSafeInteger(after.amount) && !(held && held.amount === after.amount && held.currency === after.currency)) fields.left_after = after;
      if (Object.keys(fields).length > 0) out.writes.push({ id: part.spoken, version: part.version, fields });
    }
  }
  return out;
}

/**
 * The script: read the parts and the plans, decide, write the plans that are missing and the changes to the parts.
 *
 * HANDED ONE PART, IT DOES THAT PART'S PLAN ALONE, which is what a rule starts when a part is written: the part as
 * its list and its number (`{ id, register: 'installments', seq }`), or as "installments#7" under `part`. Handed
 * nothing, as the clock hands it each night and an update does once, it does every plan there is. A part moved to
 * another plan leaves its old plan's figures as they were until that night.
 *
 * HANDED ONE PLAN, IT DOES THAT PLAN ALONE, the same way (`{ id, register: 'plans', seq }`, or "plans#3" under `plan`):
 * what a rule starts when a plan is made, by this script a moment ago or by a person, so its parts are linked then.
 *
 * A SCRIPT'S LIST IS ONE PAGE OF FIFTY, THE NEWEST MADE FIRST, and a plan that runs ten years is 120 parts. So each
 * list is read a page at a time, each next page asking for numbers below the lowest one read, until a page comes back
 * short. A figure counted from the first page alone would be wrong and look right.
 *
 * IT STOPS AT 900 WRITES, under the 1,000 its declaration asks for, makes the plans first, and says the rest waits. A
 * run that was refused for one write too many would have written nothing at all.
 */
export default async function run(ctx) {
  const PAGE = 50;
  const MOST = 900;
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const every = async (list, where) => {
    const rows = [];
    let below = null;
    for (;;) {
      const tests = [...(where ? [where] : []), ...(below === null ? [] : [{ field: 'seq', lt: below }])];
      const page = await ctx.record.list(list, tests.length === 0 ? undefined : tests.length === 1 ? tests[0] : { all: tests });
      for (const r of page) rows.push({ list, id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });
      if (page.length < PAGE) return rows;
      below = Math.min(...page.map((r) => r.seq));
    }
  };

  const handed =
    typeof input.part === 'string' && /^installments#\d+$/.test(input.part)
      ? input.part
      : input.register === 'installments' && Number.isSafeInteger(input.seq)
        ? `installments#${input.seq}`
        : null;
  const handedPlan =
    typeof input.plan === 'string' && /^plans#\d+$/.test(input.plan) ? input.plan : input.register === 'plans' && Number.isSafeInteger(input.seq) ? `plans#${input.seq}` : null;
  let name = null;
  if (handed) {
    const row = await ctx.record.get(handed);
    if (!row) {
      ctx.log('The part is no longer in the record, so no plan was counted.');
      return null;
    }
    name = row.fields.plan;
    if (typeof name !== 'string' || name.trim() === '') {
      ctx.log('The part names no plan, so no plan was counted.');
      return null;
    }
  } else if (handedPlan) {
    /* THE SECOND PASS: the plan is in the record now, so its parts can be linked to it. A plan nobody's part names
       reads no part and writes nothing. */
    const row = await ctx.record.get(handedPlan);
    if (!row) {
      ctx.log('The plan is no longer in the record, so no part was linked.');
      return null;
    }
    name = row.fields.name;
    if (typeof name !== 'string' || name.trim() === '') return null;
  }
  const parts = await every('installments', name === null ? undefined : { field: 'plan', is: name });
  const plans = await every('plans', name === null ? undefined : { field: 'name', is: name });

  const out = plansFromNames(parts, plans);
  const made = out.plans.slice(0, MOST);
  const writes = out.writes.slice(0, MOST - made.length);
  const more = made.length < out.plans.length || writes.length < out.writes.length;
  if (made.length === 0 && writes.length === 0) return null;
  for (const plan of made) ctx.write('plans', plan);
  for (const w of writes) ctx.update(w.id, w.fields, w.version);

  /* SAID IN NAMES AND COUNTS, never a list's number: the first three plans made, and how many more. */
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const names = made.map((p) => p.name);
  const listed = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('');
  const ofParts = writes.filter((w) => w.id.startsWith('installments#'));
  const linked = ofParts.filter((w) => 'plan_row' in w.fields).length;
  const counted = ofParts.filter((w) => 'left_after' in w.fields).length;
  const did = [];
  if (made.length > 0) did.push(`made ${count(made.length, 'plan', 'plans')}, ${listed}`);
  if (linked > 0) did.push(`linked ${count(linked, 'part to its plan', 'parts to their plans')}`);
  if (counted > 0) did.push(`counted what is left after ${count(counted, 'part', 'parts')}`);
  const sentences = [];
  if (did.length > 0) {
    const said = did.length === 1 ? did[0] : `${did.slice(0, -1).join(', ')}, and ${did.at(-1)}`;
    sentences.push(`${said[0].toUpperCase()}${said.slice(1)}.`);
  }
  const byId = new Map(plans.map((p) => [p.spoken, p.fields.name]));
  for (const w of writes) if (byId.has(w.id)) sentences.push(`${byId.get(w.id)} is ${w.fields.state === 'paid' ? 'paid' : 'open'}.`);
  if (more) sentences.push('The rest waits for the next run.');
  ctx.log(sentences.join(' '));
  return { plans: made.length, parts: ofParts.length, more };
}

/**
 * The script as Money's pack document writes it, as `LAST_DAY_SCRIPT` is: no egress, no keys, reading and writing
 * Instalments and Plans, once a day and when a rule hands it a part. `limits.writes` is the most a script may ask for,
 * since a first run on plans that reach 2036 writes every part once.
 */
export const PLANS_FROM_NAMES_SCRIPT = {
  script: 'plans_from_names',
  title: 'Give each plan a page and count what is left after each part',
  pack: 'money-core',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['installments', 'plans'],
  writes: ['installments', 'plans'],
  limits: { writes: 1000 },
  source: `${plansFromNames.toString()}\nexport default ${run.toString()}`,
};
