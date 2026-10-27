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
 * THE TEXT IS MATCHED WHATEVER ITS CAPITALS, ACCENTS AND SPACES, SINCE money-core 3.22.0 (the audit of 25 October,
 * Y1). It was matched letter for letter, so parts that said "harbourview" beside a plan called "Harbourview" made a second plan
 * of that name, and the plan's page said "1 of 39 paid" over parts numbered 2 to 40. "Desk", "desk " and "Désk" are
 * one plan now, named as its oldest part writes it, and Cash ahead groups them the same way (`forecast.ts`). A blank
 * text is no plan.
 *
 * TWO PLANS ALREADY HERE UNDER ONE SUCH NAME ARE A QUESTION, NEVER A FOLD. Their parts stay with the plan their own
 * text names, as they did before, and nothing new is made under that name. The run over every plan asks once
 * (`twinsAsk`): make each pair one, which closes the second plan and keeps it, linked to the first by "Made one with"
 * (`one_with`), or keep them apart. Nothing is moved, closed or deleted until he answers. Once the second plan says
 * which plan it was made one with, it is no plan of its own here: its parts move to the first on the next run, which
 * his answer starts (`plan-made-one`).
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
 * NOTHING OUTSIDE THIS FILE IS READ BY `plansFromNames` OR `run`: its four functions together are the script
 * (`PLANS_FROM_NAMES_SCRIPT.source`), `planKey` and `twinsAsk` beside the two.
 */

export function plansFromNames(parts, plans) {
  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);
  const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const seqOf = (r) => Number(String(r.spoken).split('#')[1]) || 0;
  const oldestFirst = (rows) => [...rows].sort((a, b) => seqOf(a) - seqOf(b));
  const open = (p) => p.fields.state !== 'paid' && p.fields.state !== 'cancelled';
  const keyOf = planKey;

  /* A PLAN MADE ONE WITH ANOTHER IS NO PLAN OF ITS OWN while the plan it names is here: its parts are the other's. One
     that names a plan no longer here is a plan again, so its parts are not left with nowhere to go. */
  const ids = new Set(plans.map((p) => p.id));
  const madeOne = (p) => typeof p.fields.one_with === 'string' && p.fields.one_with !== p.id && ids.has(p.fields.one_with);

  /* THE OLDEST ROW OF A NAME IS THE PLAN. Two rows of one name are twins, asked about and never chosen between. */
  const named = new Map();
  for (const plan of oldestFirst(plans)) {
    const key = keyOf(plan.fields.name);
    if (key === '' || madeOne(plan)) continue;
    if (!named.has(key)) named.set(key, []);
    named.get(key).push(plan);
  }
  const twinned = new Set([...named].filter(([, rows]) => rows.length > 1).map(([key]) => key));

  /* A TWIN'S PARTS ARE GROUPED BY THEIR TEXT AS WRITTEN, as every part was before, so each stays with its own plan until
     he answers. Every other name's parts are one group however they are written. */
  const groups = new Map();
  for (const part of oldestFirst(parts)) {
    const text = part.fields.plan;
    const key = keyOf(text);
    if (key === '') continue;
    const at = twinned.has(key) ? `${key}\u0000${text}` : key;
    if (!groups.has(at)) groups.set(at, { key, text, parts: [] });
    groups.get(at).parts.push(part);
  }

  const out = { plans: [], writes: [], waiting: 0, twins: [...twinned].map((key) => ({ keep: named.get(key)[0], others: named.get(key).slice(1) })) };
  for (const { key, text, parts: group } of groups.values()) {
    const plan = twinned.has(key) ? named.get(key).find((p) => p.fields.name === text) : named.get(key)?.[0];
    /* NOTHING NEW UNDER A TWIN'S NAME: a part whose text is neither twin's waits for his answer. */
    if (!plan && twinned.has(key)) continue;
    const state = group.some(open) ? 'open' : group.some((p) => p.fields.state === 'paid') ? 'paid' : 'cancelled';
    if (!plan) {
      /* WHO AND THE ACCOUNT ONLY WHEN THE PARTS AGREE: a plan paid from two accounts names neither. */
      const agreed = (field) => {
        const said = new Set(group.map((p) => p.fields[field]).filter((v) => typeof v === 'string' && v !== ''));
        return said.size === 1 ? { [field]: [...said][0] } : {};
      };
      out.plans.push({ name: text.trim().replace(/\s+/gu, ' '), state, ...agreed('party'), ...agreed('account') });
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
 * A SCRIPT'S LIST IS ONE PAGE OF FIFTY, IN THE LIST'S OWN ORDER, and a plan that runs ten years is 120 parts. So each
 * list is read a page at a time, in row number order (`{ order: 'seq' }`), each next page asking for numbers above the highest one read, until a page comes back
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
    let after = null;
    for (;;) {
      /* IN ROW NUMBER ORDER: a list answers in its own order, and `seq` below the lowest of a page skips rows. */
      const tests = [...(where ? [where] : []), ...(after === null ? [] : [{ field: 'seq', gt: after }])];
      const page = await ctx.record.list(list, tests.length === 0 ? null : tests.length === 1 ? tests[0] : { all: tests }, { order: 'seq' });
      for (const r of page) rows.push({ list, id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });
      if (page.length < PAGE) return rows;
      after = Math.max(...page.map((r) => r.seq));
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
  /* ONE PLAN'S PARTS ARE ASKED FOR BY A WORD OF ITS NAME, and kept only where the whole name is that plan's however it
     is written. The record's `contains` folds capitals and nothing else, so a name with a letter beyond them reads every
     part. Every plan is read, since a plan written another way is still the one its parts belong to: there are few. */
  const key = name === null ? null : planKey(name);
  const word = key === null || !/^[\x20-\x7e\s]*$/u.test(name) ? null : key.split(' ').reduce((a, b) => (b.length > a.length ? b : a), '');
  const read = await every('installments', word === null || word === '' ? undefined : { field: 'plan', contains: word });
  const parts = key === null ? read : read.filter((p) => planKey(p.fields.plan) === key);
  const plans = await every('plans');

  const out = plansFromNames(parts, plans);
  const made = out.plans.slice(0, MOST);
  const writes = out.writes.slice(0, MOST - made.length);
  const more = made.length < out.plans.length || writes.length < out.writes.length;
  /* THE QUESTION ABOUT TWINS IS THE NIGHT'S, over every plan, so a part's run and the night's never ask it two ways. */
  const ask = key === null ? twinsAsk(out.twins) : null;
  if (made.length === 0 && writes.length === 0) return ask === null ? null : { plans: 0, parts: 0, more: false, ask };
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
  return { plans: made.length, parts: ofParts.length, more, ...(ask === null ? {} : { ask }) };
}

/** A plan's name however it is written: no accents, lower case, one space between words and none at the ends. */
export function planKey(name) {
  return typeof name === 'string' ? name.normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim() : '';
}

/**
 * The one question about plans here twice under one name, or `null` when there are none: every pair in one question,
 * by their names, whose yes closes each second plan and links it to the first ("Made one with"), and whose no leaves
 * both as they are. Only the second plans are changed by the answer, so a part paid while it waits does not make the
 * answer stale; their parts follow on the run the answer starts.
 *
 * ONE QUESTION A SET OF TWINS, EVER. Its cause is the plans' own numbers, so a night that finds it waiting or answered
 * adds nothing, and a plan closed by hand is closed already and not closed again.
 */
export function twinsAsk(twins) {
  if (!Array.isArray(twins) || twins.length === 0) return null;
  const seq = (p) => String(p.spoken).split('#')[1];
  const name = (p) => String(p.fields.name).trim();
  const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs.join(''));
  const pairs = twins.map((t) => and([t.keep, ...t.others].map(name)));
  const one = twins.length === 1;
  const question = one
    ? `${pairs[0]} are one plan written ${twins[0].others.length === 1 ? 'two' : 'several'} ways. Make them one plan?`
    : `${and(twins.map((t) => name(t.keep)))} are each one plan written more than one way (${pairs.join('; ')}). Make each one plan?`;
  const because = one
    ? `The parts of ${and(twins[0].others.map(name))} move to ${name(twins[0].keep)}, and ${and(twins[0].others.map(name))} is closed and kept, linked to ${name(twins[0].keep)}. Nothing is deleted.`
    : 'The parts of each second plan move to the first, and the second is closed and kept, linked to the first. Nothing is deleted.';
  const patches = twins.flatMap((t) =>
    t.others.map((o) => ({ id: o.spoken, version: o.version, fields: { one_with: t.keep.id, ...(o.fields.state === 'paid' || o.fields.state === 'cancelled' ? {} : { state: 'cancelled' }) } })),
  );
  return {
    cause: `plans.twins:${twins.map((t) => [t.keep, ...t.others].map(seq).join('.')).join('_')}`,
    question,
    about: twins.map((t) => name(t.keep)),
    options: [
      { id: 'one', label: 'Make them one', because, patches },
      { id: 'apart', label: 'Keep them apart', because: 'Each plan keeps its own parts, and this is not asked again.' },
    ],
  };
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
  source: `${planKey.toString()}\n${twinsAsk.toString()}\n${plansFromNames.toString()}\nexport default ${run.toString()}`,
};
