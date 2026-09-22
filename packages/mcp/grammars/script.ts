/**
 * What a `script` declaration may contain, said once, for an agent about to write one (`loop/research-shell-scripts.md`
 * section 7 and Brief 6). It is served at `braindog:grammar/script` and is never in a tool description, so the turn
 * budget `test/budget.test.ts` holds is untouched by it.
 *
 * WHY IT IS HERE AND NOT BESIDE THE OTHER TWO. `braindog:grammar/page` and `braindog:grammar/proposals` are the record's
 * (`packages/record/src/grammar.ts`, reached through `arrangement`), because the page grammar reads the render package's
 * block list and the voice keys, which only the record may import. This one reads nothing from any package: the kernel's
 * `scriptBody` is the lint and `@braindog/script` holds the ceilings, and `31-STACK` section 2 puts that package at rank
 * 23, above both this one (12) and the record (11), so neither may import it. So the numbers below are copies, and
 * `test/script.test.ts` holds each one to `CEILINGS`, `DEFAULT_LIMITS`, `SOURCE_BYTES`, `LOG_BYTES` and the kernel's
 * `FLOOR_MS`, and installs both examples through a real record. A copy nobody checks is how one of two becomes wrong.
 *
 * IT SAYS WHAT DOES NOT RUN YET. An accepted script is armed and queues a run on its clock, and no host in this build
 * runs one: nothing imports `@braindog/script`. An agent told only the grammar would propose a script and then wonder
 * for an hour why its series stayed empty.
 */

export const SCRIPT_GRAMMAR = {
  declaration: { id: 'script.<name>', kind: 'script', body: 'the header below, and source' },
  body: {
    script: 'the name, the same as in the id: lower-case letters, digits, - and _, starting with a letter, at most 32 (required)',
    title: 'text',
    runs: '{"every":"1h"}, no more often than every 15m; {"door":"<ingest id>"} whose arrivals start it; or {"rule":true} so a rule may run it. At least one (required)',
    egress: '["https://<host>"], each an origin written out in full with no path, port or placeholder; [] when it fetches nothing (required)',
    keys: '["<vault label>"], the keys it sends, by label; [] for none. A key needs an egress to go to (required)',
    reads: '["<register>"], what ctx.record may read; [] for none (required)',
    writes: '["<register>"], what ctx.write and ctx.update may change; [] for none (required)',
    limits: '{"cpu_ms","fetches","wall_ms","writes"}, whole numbers above 0; see limits for the defaults and the most it may ask',
    source: 'JavaScript whose default export is async function run(ctx) (required)',
    pack: 'the pack that owns it',
  },
  ctx: {
    'fetch(url, {method?, headers?, body?, key?})': 'one request, to an origin in egress; key is a label from keys, and the host adds it, so the script never holds its bytes. Answers {status, ok, headers, text(), json()}',
    'write(register, fields)': 'queue a new row in a register in writes',
    'update(spoken, patch, version)': 'queue a change to a row of a register in writes, at the version you read',
    'record.list(register, where?)': 'rows of a register in reads, with a predicate tree as list takes it',
    'record.get(spoken)': 'one row, of a register in reads',
    input: 'what started it: null on a schedule, and from a door its body and headers',
    'now()': "the run's instant, from the host clock",
    tz: "the record's timezone",
    'log(...parts)': 'kept on the run, cut at 8 KB',
  },
  nothing_else: 'there are no other globals: no fetch, require or process. Writes are applied together after the run, and a run that is refused writes none of them',
  limits: {
    default: { cpu_ms: 200, fetches: 5, wall_ms: 15_000, writes: 200 },
    most: { cpu_ms: 1_000, fetches: 20, wall_ms: 30_000, writes: 1_000 },
    source: '64 KB',
    memory: '32 MB',
  },
  examples: [
    {
      id: 'script.gold-rate',
      kind: 'script',
      body: {
        script: 'gold-rate',
        title: 'Gold price, 24k, per gram in EGP',
        runs: { every: '1h' },
        egress: ['https://api.goldapi.io'],
        keys: ['goldapi'],
        reads: [],
        writes: ['gold'],
        source:
          "export default async function run(ctx) {\n  const r = await ctx.fetch('https://api.goldapi.io/api/XAU/EGP', { key: 'goldapi' });\n  const { price_gram_24k } = await r.json();\n  ctx.write('gold', { at: ctx.now(), price: Math.round(price_gram_24k * 100) });\n}",
      },
    },
    {
      id: 'script.bank-sms',
      kind: 'script',
      body: {
        script: 'bank-sms',
        title: 'A bank message, read into a transaction',
        runs: { door: 'bank-sms' },
        egress: [],
        keys: [],
        reads: [],
        writes: ['transactions'],
        source:
          "export default async function run(ctx) {\n  const text = String(ctx.input?.body ?? '');\n  const m = /debited EGP ([0-9.,]+) at (.+)/i.exec(text);\n  if (!m) return ctx.log('not a debit:', text.slice(0, 80));\n  ctx.write('transactions', { amount: -Math.round(Number(m[1].replace(/,/g, '')) * 100), merchant: m[2].trim() });\n}",
      },
    },
  ],
  to_propose:
    'propose body_kind change with {"declaration_id":"script.<name>","to":<the declaration>}. The owner approves each origin and key in Decide, and a key must be in the vault before they can accept.',
  in_this_build:
    'an accepted script is scheduled and its runs are queued, and no host runs one yet; nothing starts a script from a door or a rule yet either. script_try, which runs one without writing, is not in this build.',
};
