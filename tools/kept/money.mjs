/**
 * The kept lane's money checks: a rates poll, Stripe against the stand-in, a salary rule on the
 * primitives, and a bank text through card-alerts' door. Each answers one line or two, `{ name, pass, said }`, with
 * `skipped` and why where it had nothing to do, and `todo` where what it asserts waits on work named in the line.
 *
 * WHAT EACH WRITES WAS READ FROM ITS OWN PACK'S TEST FIRST: `packs/rates-poll/rates-poll.test.ts` (one `fx` row a
 * currency, filled by `fill.ts`), `packs/stripe/stripe.test.ts` (one account a kind and a currency, named "Stripe …",
 * the key by its label, three refusals pause), `packs/card-alerts/card-alerts.test.ts` (a text at a twin's door files a
 * transaction on the card its digits name), and money-core's `filing_rules` (a rule files a matching entry, `filed_by`).
 *
 * EVERY NAME AND FIGURE HERE IS INVENTED. Nothing is his: no payee, no project, no currency he keeps.
 */

import { randomBytes } from 'node:crypto';

import { fillRates } from '../../packs/rates-poll/fill.ts';
import { api, clockIngests, create, installFromCatalogue, ok, postToDoor, putKey, red, rowsOf, skip, turn } from './steps.mjs';

/** The host the stand-in answers the lane's own JSON addresses on. Invented, and never a host anybody serves. */
export const STAND_IN_HOST = 'standin.kept.example';

/** Stripe's own host, which the stand-in answers in its place on the harness: every Stripe line says so. */
export const STRIPE_HOST = 'api.stripe.com';

const NOT_STRIPE = ' (not against Stripe: the stand-in answered for it)';

const today = () => new Date().toISOString().slice(0, 10);

/** `{ name, pass: true, todo: true, said }`: what this line asserts waits on work it names, and is not counted red. */
export const todo = (ctx, name, said) => ({ ...ok(ctx, name, said), todo: true });

/** Why a step that needs the stand-in skips on a host the lane does not stand in for. */
const NO_STAND_IN = 'this host has no JSON address of the lane’s to call (SHL-C03’s probe is not built), so nothing could be fed';

/** The run a script's last turn left, from the record's own list of scripts: `{ outcome, say, status }`, or null. */
async function lastRun(ctx, script) {
  const out = await api(ctx, 'scripts', {});
  const row = (out.said?.value ?? []).find((s) => s?.script === script);
  return row ? { outcome: row.last?.outcome ?? null, say: String(row.last?.say ?? ''), status: row.status, refused: row.refused?.in_a_row ?? 0 } : null;
}

/** What the record's actions say of one, for a line that names why a poll wrote nothing. */
async function actionSaid(ctx, ingest) {
  const out = await api(ctx, 'actions', {});
  const row = (Array.isArray(out.said?.value) ? out.said.value : (out.said?.value?.actions ?? [])).find((a) => a?.ingest === ingest || a?.id === `ingest.${ingest}`);
  return String(row?.last?.say ?? row?.last?.outcome ?? row?.state ?? 'it left no word');
}

/**
 * `rates-poll`: the rates file filled with the lane's own address, a rate row written; then a second poll of a
 * commodity, gold, writes a gold rate, or its line is a todo naming the fault (a poll writing a commodity's rate is
 * the numbers area's, ev-numbers 5).
 */
export async function rates(ctx) {
  const name = 'rates-poll';
  if (!ctx.standIn) return [skip(ctx, name, NO_STAND_IN)];
  const s = ctx.standIn;
  /* The rates service's own answer, its base currency under its own key (no refusal code). */
  const base = 'USD';
  s.answer(STAND_IN_HOST, '/rates.json', { result: 'success', base_code: base, rates: { USD: 1, EUR: 0.92, GBP: 0.79 } });
  s.answer(STAND_IN_HOST, '/gold.json', { result: 'success', base_code: base, rates: { USD: 1, XAU: 0.00041 } });
  const spec = (id, path, codes) => ({ id, url: `https://${STAND_IN_HOST}${path}`, every: '1d', base: 'USD', rates: codes.map((c) => ({ currency: c, path: `rates.${c}` })) });
  const fxFrom = async () => ((await rowsOf(ctx, 'fx')).rows ?? []).filter((r) => r?.fields?.source === STAND_IN_HOST);
  const put = await installFromCatalogue(ctx, 'rates-open-er-api-com', { fill: (doc) => fillRates(doc, spec('kept', '/rates.json', ['EUR', 'GBP'])) });
  if (!put.pass) return [red(ctx, name, put.said)];
  const ingests = clockIngests(put.doc);
  const ran = await turn(ctx, { ingests, done: async () => (await fxFrom()).length > 0 });
  if (ran.refused) return [red(ctx, name, `Run now was refused: “${ran.refused}”`)];
  const wrote = await fxFrom();
  const withdrawn = put.withdrawn ? ` The catalogue lists it as withdrawn (“${put.withdrawn}”), and it still installs by its name.` : '';
  const first = wrote.length > 0
    ? ok(ctx, name, `the poll wrote ${wrote.length} rate${wrote.length === 1 ? '' : 's'} to Exchange rates from the lane’s own address.${withdrawn}`)
    : red(ctx, name, `the poll ran and wrote no rate: “${await actionSaid(ctx, ingests[0])}”`);
  const gold = 'rates-poll gold';
  const second = await installFromCatalogue(ctx, 'rates-open-er-api-com', { fill: (doc) => fillRates(doc, spec('kept-gold', '/gold.json', ['XAU'])) });
  if (!second.pass) return [first, todo(ctx, gold, `a poll of gold could not be set up: ${second.said}`)];
  const goldIngests = clockIngests(second.doc);
  const isGold = (r) => r?.fields?.currency === 'XAU' || r?.fields?.base === 'XAU';
  await turn(ctx, { ingests: goldIngests, done: async () => (await fxFrom()).some(isGold) });
  return (await fxFrom()).some(isGold)
    ? [first, ok(ctx, gold, 'a second poll, of gold, wrote a gold rate.')]
    : [first, todo(ctx, gold, `a second poll, of gold, wrote no gold rate: “${await actionSaid(ctx, goldIngests[0])}”`)];
}

/** The script a document declares, by its id, or null. */
const scriptOf = (doc) => (doc?.declarations ?? []).find((x) => typeof x?.script === 'string')?.script ?? null;

/**
 * `stripe`, against the stand-in: a key of the lane's own in the vault under the label the file names, the add-on
 * installed, one turn, account rows written, and every call of the turn to a host the stand-in holds (read from the
 * stand-in's own log of the run). Then `stripe refused key`: the stand-in refuses the key, and after the turns the
 * script pauses at, it is paused and says so. Both lines are marked "not against Stripe".
 */
export async function stripe(ctx) {
  const name = 'stripe';
  const refusedName = 'stripe refused key';
  if (!ctx.standIn) {
    const why = `${NO_STAND_IN}; Stripe’s own test mode is job 6, with STRIPE_TEST_READ`;
    return [skip(ctx, name, why), skip(ctx, refusedName, why)];
  }
  const s = ctx.standIn;
  let refuse = false;
  const answer = (body) => () => (refuse ? new Response('{"error":{"type":"invalid_request_error","message":"Invalid API Key provided"}}', { status: 401, headers: { 'content-type': 'application/json' } }) : body);
  s.answer(STRIPE_HOST, '/v1/balance', answer({ object: 'balance', livemode: false, available: [{ amount: 184_205, currency: 'usd' }], pending: [{ amount: 2_500, currency: 'usd' }] }));
  s.answer(STRIPE_HOST, '/v1/payouts', answer({ object: 'list', data: [], has_more: false }));
  const key = await putKey(ctx, { label: 'stripe', opens: STRIPE_HOST, value: `standin-${randomBytes(12).toString('hex')}` });
  if (!key.ok) return [red(ctx, name, `the key could not be put in the vault: “${key.fix}”${NOT_STRIPE}`), skip(ctx, refusedName, 'there is no key to refuse.')];
  const put = await installFromCatalogue(ctx, 'stripe');
  if (!put.pass) return [red(ctx, name, `${put.said}${NOT_STRIPE}`), skip(ctx, refusedName, 'it is not installed.')];
  const script = scriptOf(put.doc);
  const stripeRows = async () => ((await rowsOf(ctx, 'accounts')).rows ?? []).filter((r) => /^stripe\b/iu.test(String(r?.fields?.name ?? '')));
  const mark = s.calls.length;
  const ran = await turn(ctx, { done: async () => (await stripeRows()).length > 0 });
  if (ran.skipped) return [skip(ctx, name, ran.skipped), skip(ctx, refusedName, ran.skipped)];
  const run = script ? await lastRun(ctx, script) : null;
  const wrote = await stripeRows();
  const strays = s.calls.slice(mark).filter((c) => c.host !== STRIPE_HOST && !s.holds(c.host)).map((c) => c.host);
  const on = key.turnedOn ? ' Its agents were turned on first, to hold the key.' : '';
  let first;
  if (wrote.length === 0) first = red(ctx, name, `no account row was written: ${run?.say ? `“${run.say}”` : 'the script left no word'}${NOT_STRIPE}`);
  else if (strays.length > 0) first = red(ctx, name, `it wrote ${wrote.length} account rows and also called ${strays.length} host${strays.length === 1 ? '' : 's'} nobody named${NOT_STRIPE}`);
  else if (!s.calls.slice(mark).some((c) => c.host === STRIPE_HOST)) first = red(ctx, name, `it wrote account rows without calling Stripe’s host${NOT_STRIPE}`);
  else first = ok(ctx, name, `it wrote ${wrote.length} account rows and called only Stripe’s host.${on}${NOT_STRIPE}`);
  if (!first.pass) return [first, skip(ctx, refusedName, 'the script did not run here, so a refusal could not be seen.')];
  refuse = true;
  const most = Number((await lastRun(ctx, script))?.refused ?? 0) + 3;
  for (let i = 0; i < most; i++) {
    await turn(ctx);
    if ((await lastRun(ctx, script))?.status === 'paused') break;
  }
  const after = await lastRun(ctx, script);
  return after?.status === 'paused'
    ? [first, ok(ctx, refusedName, `a key Stripe refused paused the script, and it says so: “${after.say}”${NOT_STRIPE}`)]
    : [first, red(ctx, refusedName, `a key Stripe refused did not pause the script: it reads ${after?.status ?? 'nothing'}, “${after?.say ?? ''}”${NOT_STRIPE}`)];
}

/** An account of the lane's own: invented, in euros, at nought today. */
const account = (ctx, fields) => create(ctx, 'accounts', { balance: { amount: 0, currency: 'EUR' }, as_of: today(), ...fields });

/**
 * `salary-rule`: a rule built on the primitives, as his imported "Salary: holds …" rules are, and nothing
 * for it in any add-on: a category, an account, a filing rule that files money in whose text holds a payer's name, and
 * a matching row. Green when the row is filed by the rule, read back from the row (`filed_by`, `category`). A row
 * written by hand that the rule leaves alone is tried again after one turn, which is when a record files what waited.
 */
export async function salaryRule(ctx) {
  const name = 'salary-rule';
  /* THE RECORD'S OWN SALARY CATEGORY WHEN ITS STARTING SET HAS ONE (a name is unique on the list), and one made if not. */
  const held = ((await rowsOf(ctx, 'categories')).rows ?? []).find((r) => String(r?.fields?.name ?? '').toLowerCase() === 'salary');
  const cat = held ? { id: String(held.id) } : await create(ctx, 'categories', { name: 'Salary', direction: 'in' });
  if (!cat.id) return [red(ctx, name, `the category could not be made: “${cat.fix}”`)];
  const acct = await account(ctx, { name: 'Studio current account', kind: 'bank', liquid: true });
  if (!acct.id) return [red(ctx, name, `the account could not be made: “${acct.fix}”`)];
  const rule = await create(ctx, 'filing_rules', { match: 'ALDER PAYROLL', match_by: 'contains', reads: 'payee', direction: 'in', category: cat.id, state: 'on', note: 'Salary: holds ALDER PAYROLL' });
  if (!rule.id) return [red(ctx, name, `the rule could not be made: “${rule.fix}”`)];
  const row = await create(ctx, 'transactions', { what: 'ALDER PAYROLL OCT', counterparty_text: 'ALDER PAYROLL OCT', direction: 'in', on: today(), amount: { amount: 420_000, currency: 'EUR' }, account: acct.id });
  if (!row.id) return [red(ctx, name, `the matching row could not be written: “${row.fix}”`)];
  const filed = async () => {
    const got = ((await rowsOf(ctx, 'transactions')).rows ?? []).find((r) => String(r?.id) === row.id);
    return got?.fields?.filed_by === rule.id || got?.fields?.category === cat.id ? got : null;
  };
  if (await filed()) return [ok(ctx, name, 'a filing rule built on the lists filed a matching row under its category as it was written.')];
  const ran = await turn(ctx, { done: async () => (await filed()) !== null });
  if (await filed()) return [ok(ctx, name, 'a filing rule built on the lists filed a matching row under its category, one turn after it was written.')];
  return [red(ctx, name, `a filing rule did not fire on a matching row${ran.skipped ? ` (${ran.skipped})` : ', even after a turn'}.`)];
}

/**
 * `card-alerts`: installed, a card of the lane's own with invented digits, and a charge alert posted as a text to the
 * file's text doors with each one's own token, as a phone Shortcut posts it. Green when one door filed a transaction
 * on that card. The doors are the file's own webhook ingests, read from the file and never named here.
 */
export async function cardAlerts(ctx) {
  const name = 'card-alerts';
  const put = await installFromCatalogue(ctx, 'card-alerts');
  if (!put.pass) return [red(ctx, name, put.said)];
  const card = await account(ctx, { name: 'Studio card', kind: 'card', liquid: false, last4: '4471' });
  if (!card.id) return [red(ctx, name, `the card could not be made: “${card.fix}”`)];
  const doors = (put.doc.declarations ?? []).filter((x) => x?.channel === 'webhook' && typeof x?.ingest === 'string').map((x) => x.ingest);
  if (doors.length === 0) return [red(ctx, name, 'the file declares no text door.')];
  const onCard = async () => ((await rowsOf(ctx, 'transactions')).rows ?? []).filter((r) => r?.fields?.account === card.id);
  const text = 'Your card ending 4471 was debited EUR 42.99 at FENWICK CLOUD on 18/09/26. If this was not you, call us.';
  const said = [];
  for (const door of doors) {
    const posted = await postToDoor(ctx, door, text);
    if (!posted.ok) said.push(posted.fix);
    const rows = await onCard();
    if (rows.length > 0) return [ok(ctx, name, `a bank text posted to its door with its own token filed ${rows.length === 1 ? 'a row' : `${rows.length} rows`} on the card, “${rows[0].fields.what}”.`)];
  }
  return [red(ctx, name, `a bank text posted to ${doors.length} door${doors.length === 1 ? '' : 's'} filed no row${said.length ? `: “${said[0]}”` : ''}.`)];
}

/** The money checks, in the order the lane runs them, by the line each one starts. */
export const MONEY = { 'rates-poll': rates, stripe, 'salary-rule': salaryRule, 'card-alerts': cardAlerts };
