/**
 * A new or changed filing rule files what it matches that has no category, as the decision, the
 * script a host runs round it, and the declaration a pack document carries. `learn-category.js` reads the same
 * decision, so the count a question promises is the number this files.
 *
 * WHY. `txn-categorise` files an entry when it is written, so a rule made today filed nothing already in the Ledger: a
 * person who wrote "TALABAT, Outing" on Monday still had last month's forty Talabat entries with no category on Tuesday.
 *
 * THE SAME MATCH THE CATEGORY RULE READS (`linkOf` in `packages/kernel/src/rules.ts`), written again here because a
 * sandbox runs this file's text alone. The text the rule `reads` ("As the bank wrote it" or the description), the way
 * the money goes or either, the rule's account or none, and the ladder: the whole text, how it starts, anywhere in it,
 * a pattern, and on one rung the longest. AN ENTRY ANOTHER RULE WOULD FILE IS LEFT TO THAT RULE, and one two rules fit
 * equally is left with no category, because no category is better than a wrong one. A rule that reads
 * "As the bank wrote it" wins over one on the description where both fit, as the category rule's later step does.
 *
 * ONE STEP WIDER THAN THE CATEGORY RULE, AND ONLY ON THE WHOLE TEXT: where the host hands `ctx.fold`, a rule's whole
 * text also fits an entry whose bank spelling folds to the same payee (`GEIDEA*TALABAT 0423 CAIRO` is `TALABAT`), as
 * `match-payment.js` compares payees. Only where no other rule fits that entry at all, so the fold can file what the
 * ladder missed and never take an entry from the rule the ladder would give it.
 *
 * ONE BATCH, ONE UNDO. Every entry this run files is written in the run's one batch (`finishScript` in
 * `packages/kernel/src/script-run.ts`), so taking the change back puts every one of them back to no category.
 *
 * NOTHING ON A CLOCK. It starts when a rule is made, or its text, how it matches, what it reads, which way, its category,
 * its account or its status changes and it is on. A rule that is off files nothing.
 */

/**
 * How one filing rule fits one entry: `{ rung, long, folded }`, or `null`. `rung` is the ladder's (1 the whole text, 2
 * how it starts, 3 anywhere in it, 4 a pattern), `long` the rule's text in characters, `folded` true where only the
 * payee key made it fit. `key` folds a text to its payee key, or is left out.
 */
export function filingFits(rule, entry, key) {
  const r = rule && rule.fields ? rule.fields : rule;
  if (!r || r.state !== 'on' || typeof r.match !== 'string' || r.match === '') return null;
  const text = r.reads === 'description' ? entry.what : entry.counterparty_text;
  if (typeof text !== 'string' || text === '') return null;
  if (r.direction !== 'either' && r.direction !== entry.direction) return null;
  if (typeof r.account === 'string' && r.account !== '' && r.account !== entry.account) return null;
  /* THE LADDER'S CASE FOLD, A TO Z ALONE (`fold` in `packages/kernel/src/ingest.ts`), so no build folds more than it. */
  const low = (t) => t.replace(/[A-Z]+/g, (run) => run.toLowerCase());
  const long = [...r.match].length;
  if (text === r.match) return { rung: 1, long, folded: false };
  const how = r.match_by;
  if (how === 'starts' && low(text).startsWith(low(r.match))) return { rung: 2, long, folded: false };
  if (how === 'contains' && low(text).includes(low(r.match))) return { rung: 3, long, folded: false };
  if (how === 'pattern') {
    /* A PATTERN THE RECORD WOULD NOT RUN IS NOT RUN HERE: too long, one that does not compile, or a repeated group that
       holds a repeat or a choice. The record refuses those where they are typed; this is for one stored before. */
    if (long > 120 || /\([^)]*[+*?|][^)]*\)[+*{]/.test(r.match)) return null;
    try {
      return new RegExp(r.match, 'i').test([...text].slice(0, 512).join('')) ? { rung: 4, long, folded: false } : null;
    } catch {
      return null;
    }
  }
  if (how === 'exact' && typeof key === 'function') {
    const [a, b] = [key(text), key(r.match)];
    if (typeof a === 'string' && a !== '' && a === b) return { rung: 1, long, folded: true };
  }
  return null;
}

/**
 * The rule the category rule would file this entry by, among `rules`, read by the ladder alone: `{ id }`, `{ tie: true }`
 * where two that file different categories fit equally, or `null` where none fits. "As the bank wrote it" first, then the description, as the category
 * rule's two steps go, and a tie on the first leaves the second to decide.
 */
export function filingWinner(rules, entry) {
  const fits = (r) => {
    const r0 = r && r.fields ? r.fields : r;
    const text = r0.reads === 'description' ? entry.what : entry.counterparty_text;
    if (r0.state !== 'on' || typeof r0.match !== 'string' || r0.match === '' || typeof text !== 'string' || text === '') return null;
    if (r0.direction !== 'either' && r0.direction !== entry.direction) return null;
    if (typeof r0.account === 'string' && r0.account !== '' && r0.account !== entry.account) return null;
    const low = (t) => t.replace(/[A-Z]+/g, (run) => run.toLowerCase());
    const long = [...r0.match].length;
    if (text === r0.match) return { rung: 1, long };
    if (r0.match_by === 'starts' && low(text).startsWith(low(r0.match))) return { rung: 2, long };
    if (r0.match_by === 'contains' && low(text).includes(low(r0.match))) return { rung: 3, long };
    if (r0.match_by === 'pattern' && long <= 120 && !/\([^)]*[+*?|][^)]*\)[+*{]/.test(r0.match)) {
      try {
        if (new RegExp(r0.match, 'i').test([...text].slice(0, 512).join(''))) return { rung: 4, long };
      } catch {
        /* a pattern that does not compile fits nothing */
      }
    }
    return null;
  };
  const best = (reads) => {
    let won = null;
    let level = [];
    for (const r of rules) {
      const r0 = r && r.fields ? r.fields : r;
      if ((r0.reads === 'description' ? 'description' : 'payee') !== reads) continue;
      const f = fits(r);
      if (!f) continue;
      if (won === null || f.rung < won.rung || (f.rung === won.rung && f.long > won.long)) {
        won = { rung: f.rung, long: f.long };
        level = [{ id: r.id, category: r0.category }];
      } else if (f.rung === won.rung && f.long === won.long) level.push({ id: r.id, category: r0.category });
    }
    if (won === null) return null;
    /* A TIE WHOSE RULES ALL FILE ONE CATEGORY IS NO TIE, as the record's ladder reads it: the oldest rule files it. */
    if (level.length > 1 && !level.every((l) => typeof l.category === 'string' && l.category !== '' && l.category === level[0].category)) return { tie: true };
    return { id: level.map((l) => l.id).sort()[0] };
  };
  const first = best('payee');
  if (first && first.id) return first;
  return best('description') ?? first;
}

/**
 * The entries `rule` would file among `entries`, newest first and at most `most`: each one it fits that no other rule
 * in `rivals` takes from it. Where it fits by the ladder it must be the ladder's own pick; where it fits only by the
 * payee key, no rival may fit at all.
 */
export function fileable(rule, entries, rivals, key, most) {
  const others = rivals.filter((r) => r.id !== rule.id);
  const out = [];
  for (const e of entries) {
    if (out.length >= most) break;
    const fit = filingFits(rule, e.fields, key);
    if (!fit) continue;
    const won = filingWinner(fit.folded ? others : [rule, ...others], e.fields);
    if (fit.folded ? won !== null : !(won && won.id === rule.id)) continue;
    out.push(e);
  }
  return out;
}

/**
 * The Ledger entries of `from` to `to` that `where` lets through, newest first, read a page at a time: a script's list
 * is one page of fifty with no cursor, so a span that comes back full is cut in two and each half read again, down to
 * one day. `short` says some were not read: one day held a full page, or the reads ran out.
 */
export async function unfiled(ctx, where, from, to) {
  const PAGE = 50;
  const READS = 80;
  const DAY = 86_400_000;
  const at = (d) => Date.parse(`${d}T00:00:00Z`);
  const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
  const rows = [];
  const spans = [[at(from), at(to)]];
  let reads = 0;
  let short = false;
  while (spans.length > 0) {
    if (reads >= READS) {
      short = true;
      break;
    }
    const [a, b] = spans.shift();
    reads += 1;
    const page = await ctx.record.list('transactions', { all: [...where, { field: 'on', between: [dayOf(a), dayOf(b)] }] });
    if (page.length >= PAGE && b > a) {
      const mid = a + Math.floor((b - a) / DAY / 2) * DAY;
      spans.unshift([a, mid]);
      spans.unshift([mid + DAY, b]);
      continue;
    }
    if (page.length >= PAGE) short = true;
    rows.push(...page);
  }
  const day = (r) => (typeof r.fields.on === 'string' ? r.fields.on : '');
  rows.sort((x, y) => (day(x) < day(y) ? 1 : day(x) > day(y) ? -1 : 0));
  return { rows, short };
}

/**
 * The script. Started by `rule-files-back` with the rule's list and number (`input.register`, `input.seq`, `input.id`),
 * or handed `input.rule` as a person names it ("filing_rules#3"). It reads the rule, its category, the other rules that
 * are on and the Ledger entries of the last 400 days with no category, and writes each one it files with the rule's
 * category and the rule in "Filed by", in one batch. One log line says what it did.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const said = typeof input.rule === 'string' && input.rule !== '' ? input.rule : input.register === 'filing_rules' && Number.isSafeInteger(input.seq) ? `filing_rules#${input.seq}` : input.id;
  const rule = typeof said === 'string' && said !== '' ? await ctx.record.get(said) : null;
  if (!rule || rule.register !== 'filing_rules') {
    ctx.log('The script was handed no filing rule, so nothing was filed.');
    return null;
  }
  const r = rule.fields;
  const name = typeof r.match === 'string' ? r.match : 'This rule';
  if (r.state !== 'on') {
    ctx.log(`${name} is off, so it filed nothing.`);
    return null;
  }
  const category = typeof r.category === 'string' && r.category !== '' ? await ctx.record.get(r.category) : null;
  if (!category || category.register !== 'categories' || category.deleted_at || category.fields.state !== 'live') {
    ctx.log(`${name} files under a category that is gone or retired, so it filed nothing.`);
    return null;
  }
  const under = typeof category.fields.name === 'string' ? category.fields.name : 'its category';

  /* THE 400 DAYS ARE THE RECORD'S, from its own today, never the sandbox's clock. */
  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);
  const where = [
    { field: 'category', empty: true },
    { field: 'state', is: 'cleared' },
    { field: 'transfer', is: false },
    ...(r.direction === 'in' || r.direction === 'out' ? [{ field: 'direction', is: r.direction }] : []),
    ...(typeof r.account === 'string' && r.account !== '' ? [{ field: 'account', is: r.account }] : []),
  ];
  const read = await unfiled(ctx, where, from, today);

  /* EVERY RULE THAT IS ON, one read for each way of matching, so a record with many rules is not cut at one page. */
  const rivals = [];
  for (const how of ['exact', 'starts', 'contains', 'pattern']) {
    const page = await ctx.record.list('filing_rules', { all: [{ field: 'state', is: 'on' }, { field: 'match_by', is: how }] });
    if (page.length >= 50) read.short = true;
    rivals.push(...page);
  }

  /* THE FOLD IS THE HOST'S, asked once for each text before the decision, as `match-payment.js` asks it. A host that
     refuses one leaves every text compared by the ladder alone. */
  let key;
  if (typeof ctx.fold === 'function' && r.match_by === 'exact') {
    const keys = new Map();
    const texts = [r.match, ...read.rows.map((e) => (r.reads === 'description' ? e.fields.what : e.fields.counterparty_text))];
    try {
      for (const t of texts) if (typeof t === 'string' && !keys.has(t)) keys.set(t, await ctx.fold(t));
      key = (t) => keys.get(t) ?? null;
    } catch {
      key = undefined;
    }
  }

  const MOST = 500;
  const filed = fileable(rule, read.rows, rivals, key, MOST);
  for (const e of filed) ctx.update(`transactions#${e.seq}`, { category: category.id, filed_by: rule.id }, e.version);
  const n = filed.length;
  const more = read.short ? ' Some entries could not be read, so a few may still have no category.' : '';
  const cut = n >= MOST ? ` It files at most ${MOST} at once.` : '';
  ctx.log(
    n === 0
      ? `${name} matched no entry of the last 400 days that has no category, so nothing was filed.${more}`
      : `${name} filed ${n} ${n === 1 ? 'entry' : 'entries'} of the last 400 days under ${under}, as one change you can undo.${cut}${more}`,
  );
  return n === 0 ? null : { filed: n };
}

/**
 * The script as Money's pack document writes it: no egress, no keys, started by a rule and never by the clock. It reads
 * the rule, its category, the other rules and the Ledger, and writes only the Ledger's category and "Filed by". At most
 * 500 writes, its own ceiling, and the time to read a Ledger of a few thousand entries a page at a time.
 */
export const FILE_BACK_SCRIPT = {
  script: 'file_back',
  title: 'File what a filing rule matches',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['filing_rules', 'categories', 'transactions'],
  writes: ['transactions'],
  limits: { writes: 500, cpu_ms: 1000, wall_ms: 30000 },
  source: `${filingFits.toString()}
${filingWinner.toString()}
${fileable.toString()}
${unfiled.toString()}
export default ${run.toString()}`,
};
