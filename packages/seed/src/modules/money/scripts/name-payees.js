/**
 * Payee names, put on the Ledger's lines: a line whose bank words start with a payee name's "When the bank writes"
 * reads that name in "Paid to or from" (`payee`), since money-core 3.34.0 (next-money, M9).
 *
 * TWO WAYS IN, ONE SCRIPT. A payee name written or changed names the lines already there, the last 400 days of them
 * (`payee-named-back`), and once a day it names the lines that came in since. NOT ON EVERY LINE THAT COMES IN: a rule
 * started on each new line ran it a hundred times on one statement brought in, the most a script runs in a day. Either
 * way a line is named only where nobody named it, or where its name is the bank's own words, so a name typed by hand
 * stays.
 *
 * THE LONGEST MATCH WINS, as a filing rule's ladder does on one rung: "GOOGLE *WORKSPACE" beats "GOOGLE". Two of one
 * length name nothing, since a wrong name is worse than the bank's. Case is folded A to Z alone, as the ladder folds it.
 */

import { unfiled } from './file-back.js';

/** The payee name that fits a line's bank words, or `null`: the longest start that fits, and none on a tie. */
export function payeeNameFor(names, text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const low = (t) => t.replace(/[A-Z]+/g, (run) => run.toLowerCase()).trim();
  const said = low(text);
  let won = null;
  let tie = false;
  for (const n of names) {
    const f = n && n.fields ? n.fields : n;
    if (!f || typeof f.match !== 'string' || typeof f.name !== 'string' || f.match.trim() === '' || f.name.trim() === '') continue;
    if (!said.startsWith(low(f.match))) continue;
    const long = [...f.match.trim()].length;
    if (won === null || long > won.long) {
      won = { name: f.name.trim(), long };
      tie = false;
    } else if (long === won.long && f.name.trim() !== won.name) tie = true;
  }
  return won === null || tie ? null : won.name;
}

/** Whether a line may be named: it has no name, or its name is the bank's own words. */
export function nameable(fields) {
  const payee = typeof fields.payee === 'string' ? fields.payee.trim() : '';
  const bank = typeof fields.counterparty_text === 'string' ? fields.counterparty_text.trim() : '';
  return payee === '' || payee === bank;
}

/** The text a line is named by: the bank's words, else its description. */
export const bankWords = (fields) => (typeof fields.counterparty_text === 'string' && fields.counterparty_text.trim() !== '' ? fields.counterparty_text : fields.what);

export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const names = await ctx.record.list('payee_names', { field: 'match', present: true });
  /* THE NAME THAT STARTED THE RUN, READ BY ITS NUMBER as a filing rule's run reads its rule (`file-back.js`): the list
     read in the same change may not hold it yet. */
  const said = input.register === 'payee_names' && Number.isSafeInteger(input.seq) ? `payee_names#${input.seq}` : typeof input.id === 'string' && input.id !== '' ? input.id : null;
  const own = said === null ? null : await ctx.record.get(said);
  if (own && own.register === 'payee_names' && !names.some((n) => n.id === own.id)) names.push(own);
  if (names.length === 0) {
    ctx.log('No payee names are kept, so no line was named.');
    return null;
  }
  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);
  const MOST = 500;
  /* READ A SPAN AT A TIME, as a filing rule files back (`unfiled`), so 400 days are not cut at one page. */
  const read = await unfiled(ctx, [{ field: 'state', in: ['cleared', 'pending'] }], from, today);
  let n = 0;
  for (const line of read.rows) {
    if (n >= MOST) break;
    if (!nameable(line.fields)) continue;
    const name = payeeNameFor(names, bankWords(line.fields));
    if (name === null || name === line.fields.payee) continue;
    ctx.update(`transactions#${line.seq}`, { payee: name }, line.version);
    n += 1;
  }
  ctx.log(n === 0 ? 'No line of the last 400 days needed a payee name.' : `Named ${n} ${n === 1 ? 'line' : 'lines'} by their payee names, as one change you can undo.`);
  return n === 0 ? null : { named: n };
}

export const NAME_PAYEES_SCRIPT = {
  script: 'name_payees',
  title: 'Name Ledger lines by their payee names',
  pack: 'money-core',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['payee_names', 'transactions'],
  writes: ['transactions'],
  limits: { writes: 500, cpu_ms: 1000, wall_ms: 30000 },
  source: `${payeeNameFor.toString()}
${nameable.toString()}
const bankWords = ${bankWords.toString()};
${unfiled.toString()}
export default ${run.toString()}`,
};
