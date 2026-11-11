/**
 * The record learns from a person's hand: a category set on a Ledger entry by hand asks once whether
 * every entry from that payee should go there, as the question, the script a host runs round it, and the declaration a
 * pack document carries.
 *
 * WHAT IT ASKS. A person sets one Talabat entry to Outing, and the record asks "File every Talabat under Outing from now
 * on? 14 more like it have no category." Yes makes the filing rule: the bank's text, the whole of it, read from "As the
 * bank wrote it", the way the entry went, and the category. Making it starts `file_back`, which files the 14 as one
 * change with one Undo. "Only this one" writes nothing.
 *
 * ASKED ONCE A PAYEE, EVER. The question's cause is `money.learn.` and the payee's key, and the record holds one
 * question a cause: one still waiting is joined, and one answered is not asked again, whichever answer it was. The cause
 * is the memory, so nothing else is kept.
 *
 * DECIDED ONLY WHEN HE ALREADY DID. A payee he filed under one category by hand three times or more, and never under
 * another, gets its rule at once, with Undo, and no question. Otherwise nothing is written until Yes is pressed, and
 * the question is raised only by the write of a category: never on a clock and never at night. It is signed by the script (`script:learn_category`), as every
 * script's question is, and never by `system`.
 *
 * ONLY A PERSON'S HAND STARTS IT, AS FAR AS THE RECORD CAN TELL. A rule's own write starts no other rule, and every
 * write a rule or a script makes of a category also writes "Filed by" (`txn-categorise`, `file_back` and this script's
 * Yes), so the rule that starts this asks for "Filed by" empty. A bank's or an import's new entry is a create, and the
 * rule starts on an update alone. What the record cannot yet tell is an agent's edit from a person's: no trigger says
 * who wrote.
 *
 * THE COUNT IS `file_back`'S OWN DECISION (`fileable` in `file-back.js`), run on the rule Yes would make, so the number
 * the question says is the number Yes files.
 */

import { fileable, filingFits, filingWinner, unfiled } from './file-back.js';
import { BILL_KINDS as KINDS } from './file-paid.js';

/**
 * The words of the question for one payee, its category and how many more would be filed: `{ cause, question, about,
 * options }`. `whom` is the payee as a person reads it, `key` the payee's key for the cause, `about` the entry.
 */
export function learnAsk(whom, under, n, key, about) {
  const more = n === 0 ? '' : ` ${n} more like it ${n === 1 ? 'has' : 'have'} no category.`;
  return {
    cause: `money.learn.${key}`,
    question: `File every ${whom} under ${under} from now on?${more}`,
    about,
    options: [
      {
        id: 'yes',
        label: 'Yes',
        because:
          n === 0
            ? `A filing rule files every ${whom} under ${under} from now on.`
            : `A filing rule files every ${whom} under ${under} from now on, and the ${n} already here are filed as one change you can undo.`,
      },
      { id: 'only-this-one', label: 'Only this one', because: `Nothing is written, and ${whom} is not asked about again.` },
    ],
  };
}

/**
 * The script. Started by `category-teaches` with the entry's list and number when a person sets its category, and by
 * `category-taught` with the same entry and `input.answer` once Yes is pressed. Asked, it counts and asks; answered Yes,
 * it makes the rule and nothing else, since a run's new row hands back no id for "Filed by" and `file_back`, which the
 * new rule starts, is what files the rest.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const said = input.register === 'transactions' && Number.isSafeInteger(input.seq) ? `transactions#${input.seq}` : typeof input.entry === 'string' ? input.entry : input.id;
  const entry = typeof said === 'string' && said !== '' ? await ctx.record.get(said) : null;
  if (!entry || entry.register !== 'transactions') {
    ctx.log('The script was handed no Ledger entry, so nothing was asked.');
    return null;
  }
  const f = entry.fields;
  const text = typeof f.counterparty_text === 'string' ? f.counterparty_text.trim() : '';
  if (text === '' || text !== f.counterparty_text) {
    ctx.log('This entry has no bank text a filing rule could match whole, so nothing was asked.');
    return null;
  }
  const whom = typeof f.payee === 'string' && f.payee.trim() !== '' ? f.payee.trim() : text;
  if (f.direction !== 'in' && f.direction !== 'out') {
    ctx.log(`The entry for ${whom} does not say which way the money went, so nothing was asked.`);
    return null;
  }
  if (typeof f.category !== 'string' || f.category === '') {
    ctx.log(`The entry for ${whom} has no category now, so nothing was asked.`);
    return null;
  }
  /* AN ENTRY A RULE THAT IS ON FILED WAS NOT FILED BY HAND. */
  if (typeof f.filed_by === 'string' && f.filed_by !== '') {
    const by = await ctx.record.get(f.filed_by);
    if (by && by.fields.state === 'on') {
      ctx.log(`The entry for ${whom} was filed by a filing rule that is on, so nothing was asked.`);
      return null;
    }
  }
  const category = await ctx.record.get(f.category);
  if (!category || category.register !== 'categories' || category.fields.state !== 'live') {
    ctx.log(`The entry for ${whom} is under a category that is gone or retired, so nothing was asked.`);
    return null;
  }
  const under = typeof category.fields.name === 'string' && category.fields.name !== '' ? category.fields.name : 'its category';
  /* AN ENTRY THE BILL IT PAYS FILED WAS NOT FILED BY HAND (`file_paid`, `settle_matched_line`): it settles a bill whose
     kind is this category's name, or a repeating line under this category counted a payment on its day. */
  const bare = (t) => (typeof t === 'string' ? t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '');
  const bill = typeof f.settles === 'string' && f.settles !== '' ? await ctx.record.get(f.settles) : null;
  const kind = bill && typeof bill.fields.category === 'string' ? bill.fields.category : '';
  const byBill = kind !== '' && [bare(kind), bare(KINDS[kind])].includes(bare(category.fields.name));
  if (byBill || (typeof f.on === 'string' && (await ctx.record.list('recurring', { all: [{ field: 'category', is: category.id }, { field: 'last_paid', is: f.on }] })).length > 0)) {
    ctx.log(`The entry for ${whom} was filed by what it pays, so nothing was asked.`);
    return null;
  }

  /* A RULE THAT IS ON AND ALREADY FITS THIS ENTRY, by the ladder, its way and its account, is the answer or one Yes
     would tie with. Asked by matching, since a rule on how the text starts or on its account copied whole ties with it. */
  const rivals = [];
  for (const how of ['exact', 'starts', 'contains', 'pattern']) rivals.push(...(await ctx.record.list('filing_rules', { all: [{ field: 'state', is: 'on' }, { field: 'match_by', is: how }] })));
  const named = rivals.find((r) => filingFits(r, f) !== null);
  if (named) {
    ctx.log(`A filing rule already files ${whom}, so nothing was asked and nothing was made.`);
    return null;
  }
  const rule = { id: '', seq: null, version: 0, fields: { match: text, match_by: 'exact', reads: 'payee', direction: f.direction, category: category.id, state: 'on' } };

  /* ANSWERED. Yes makes the rule; any other words write nothing. */
  if (typeof input.answer === 'string') {
    if (input.answer !== 'Yes') {
      ctx.log(`Only this one: nothing was made for ${whom}.`);
      return null;
    }
    ctx.write('filing_rules', rule.fields);
    ctx.log(`A filing rule now files every ${whom} under ${under}. What it matches with no category is filed next, as one change.`);
    return { made: text };
  }

  /* FILED THE SAME WAY BY HAND AT LEAST `SURE` TIMES, AND NEVER ANOTHER WAY, IS ALREADY HIS ANSWER: the rule is made
     at once, said in the log and the feed, and undone like any write. "File every Stripe under Game sales from now on?"
     after the fourth Stripe line he filed there was a question with one answer. One page of his lines is read; a
     payee with more lines than a page holds, or one ever filed elsewhere, is asked about as before. */
  const SURE = 3;
  const same = await ctx.record.list('transactions', { all: [{ field: 'counterparty_text', is: text }, { field: 'direction', is: f.direction }] });
  const filed = same.filter((e) => typeof e.fields.category === 'string' && e.fields.category !== '');
  const here = filed.filter((e) => e.fields.category === category.id).length + (filed.some((e) => e.id === entry.id) ? 0 : 1);
  if (same.length < 50 && filed.every((e) => e.fields.category === category.id) && here >= SURE) {
    ctx.write('filing_rules', rule.fields);
    ctx.log(`You filed ${whom} under ${under} ${here} times and never anywhere else, so a filing rule now files every ${whom} there. Undo takes it back.`);
    return { made: text, said: `Every ${whom} is filed under ${under} from now on, as you filed it ${here} times.` };
  }

  /* ASKED. The payee's key is the host's fold where it hands one, else the text's own letters and digits. */
  const plain = (t) => t.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase();
  let folded = null;
  let key;
  if (typeof ctx.fold === 'function') {
    try {
      folded = await ctx.fold(text);
    } catch {
      folded = null;
    }
  }
  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);
  const read = await unfiled(ctx, [{ field: 'category', empty: true }, { field: 'state', is: 'cleared' }, { field: 'transfer', is: false }, { field: 'direction', is: f.direction }], from, today);
  if (typeof ctx.fold === 'function') {
    const keys = new Map([[text, folded]]);
    try {
      for (const e of read.rows) {
        const t = e.fields.counterparty_text;
        if (typeof t === 'string' && !keys.has(t)) keys.set(t, await ctx.fold(t));
      }
      key = (t) => keys.get(t) ?? null;
    } catch {
      key = undefined;
    }
  }
  const n = fileable(rule, read.rows.filter((e) => e.id !== entry.id), rivals, key, 500).length;
  /* THE KIND OF KEY IS CUT (`bank:talabat` is `talabat`), so the cause reads as the payee it remembers. */
  const cause = (typeof folded === 'string' && folded !== '' ? plain(folded.replace(/^[a-z]+:/, '')) : plain(text)).slice(0, 60) || 'payee';
  ctx.log(`Asked whether every ${whom} goes under ${under}: ${n} more like it ${n === 1 ? 'has' : 'have'} no category.`);
  return { ask: learnAsk(whom, under, n, cause, `transactions#${entry.seq}`) };
}

/**
 * The script as Money's pack document writes it: no egress, no keys, started by a rule and never by the clock. It
 * reads the entry, its category, the filing rules and the Ledger, and writes only one filing rule, on Yes.
 */
export const LEARN_CATEGORY_SCRIPT = {
  script: 'learn_category',
  title: 'Offer a filing rule from a category set by hand',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['transactions', 'categories', 'filing_rules', 'obligations', 'recurring'],
  writes: ['filing_rules'],
  limits: { cpu_ms: 1000, wall_ms: 30000 },
  source: `${filingFits.toString()}
${filingWinner.toString()}
${fileable.toString()}
${unfiled.toString()}
${learnAsk.toString()}
const KINDS = ${JSON.stringify(KINDS)};
export default ${run.toString()}`,
};
