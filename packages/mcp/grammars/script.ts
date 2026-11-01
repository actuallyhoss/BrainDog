/**
 * What a `script` declaration may contain, said once, for an agent about to write one. It is served at
 * `braindog:grammar/script` and is never in a tool description, so the turn budget `test/budget.test.ts` holds is
 * untouched by it.
 *
 * WHY IT IS HERE AND NOT BESIDE THE OTHER TWO. `braindog:grammar/page` and `braindog:grammar/proposals` are the record's
 * (`packages/record/src/grammar.ts`, reached through `arrangement`), because the page grammar reads the render package's
 * block list and the voice keys, which only the record may import. This one reads nothing from any package: the kernel's
 * `scriptBody` is the lint and refuses a header over the ceilings (`SCRIPT_CEILINGS`), and `@braindog/script` holds the
 * sandbox's own copy. `31-STACK` section 2 ranks that package 12, below
 * this one (13) and above the record (11), so the record may not import it and this package could, but this package's
 * row names 2 and 11 only and its manifest has no `@braindog/script`, and an edge taken for five numbers is an edge the
 * graph gate holds for good. So the numbers below are copies, and `test/script.test.ts` holds each one to `CEILINGS`,
 * `DEFAULT_LIMITS`, `SOURCE_BYTES`, `LOG_BYTES` and the kernel's `FLOOR_MS`, and installs both examples through a real
 * record. A copy nobody checks is how one of two becomes wrong. `script_try` took no edge either: it reaches the sandbox
 * through the record's `scriptTry`, which each host wires, so the copies stay.
 *
 * IT SAYS WHAT RUNS, AND WHERE. It said nothing started a script from a door or a rule, which stopped being true when a
 * rule's `script` step queued one (`startScript` in `kernel/src/flow.ts`) and a verified arrival at a script's door did
 * (`startAtDoor` in `kernel/src/script.ts`). And it said 32 MB of memory as though every host held it: that is the
 * QuickJS sandbox's `HEAP_BYTES`, the self-host's, and a Cloud run is a Worker held to what the platform gives one.
 *
 * ITS EXAMPLES ARE NOBODY'S USE CASE. The second was a bank message read into a transaction;
 * it is a webhook's JSON now, which is what a door hands a script, and its amount is taken in minor units as sent.
 */

export const SCRIPT_GRAMMAR = {
  declaration: { id: 'script.<name>', kind: 'script', body: 'the header below, and source' },
  body: {
    script: 'the name, the same as in the id: lower-case letters, digits, - and _, starting with a letter, at most 32 (required)',
    title: 'text',
    runs: '{"every":"1h"}, no more often than every 15m; {"every":"1d","at":"09:00"} every day at that time in the record\'s time zone (at needs an every of whole days: 1d, 2d or 1w); {"door":"<ingest id>"} whose verified arrivals start it; or {"rule":true} so a rule may run it. At least one of every, door and rule (required)',
    egress: '["https://<host>"], each an origin written out in full with no path, port or placeholder; [] when it fetches nothing (required)',
    keys: '["<keychain label>"], the keys it sends, by label; [] for none. A key needs an egress to go to (required)',
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
    'record.list(register, where?, options?)':
      'rows of a register in reads, with a predicate tree as list takes it. A secret field is left off, and a predicate that names one is refused. Options {"includeDeleted":true} also answers the rows a person deleted, each with deleted_at set',
    'record.get(spoken)': 'one row, of a register in reads. A secret field is left off',
    input: "what started it: null on a schedule, {\"body\",\"headers\"} from a door, and from a rule the row's id and the fields its step hands on",
    'now()': "the run's instant, from the host clock",
    tz: "the record's timezone",
    'log(...parts)': 'kept on the run, cut at 8 KB',
  },
  nothing_else: 'there are no other globals: no fetch, require or process. Writes are applied together after the run, and a run that is refused writes none of them',
  limits: {
    default: { cpu_ms: 200, fetches: 5, wall_ms: 15_000, writes: 200 },
    most: { cpu_ms: 1_000, fetches: 20, wall_ms: 30_000, writes: 1_000 },
    source: '64 KB',
    memory: "32 MB on a self-host. On the Cloud a run is a Worker and holds what the platform lets one hold, so write to the 32 MB",
    over_the_most: 'a limit over the most, or source over 64 KB, is refused when it is proposed',
  },
  examples: [
    {
      id: 'script.usd-eur',
      kind: 'script',
      body: {
        script: 'usd-eur',
        title: 'The US dollar in euros, every hour',
        runs: { every: '1h' },
        egress: ['https://api.example.com'],
        keys: ['rates-api'],
        reads: [],
        writes: ['rates'],
        source:
          "export default async function run(ctx) {\n  const r = await ctx.fetch('https://api.example.com/rates?base=USD&symbols=EUR', { key: 'rates-api' });\n  const { rates } = await r.json();\n  ctx.write('rates', { at: ctx.now(), base: 'USD', quote: 'EUR', rate: rates.EUR });\n}",
      },
    },
    {
      id: 'script.payment-hook',
      kind: 'script',
      body: {
        script: 'payment-hook',
        title: "A payment webhook's JSON, read into a transaction",
        runs: { door: 'payments' },
        egress: [],
        keys: [],
        reads: [],
        writes: ['transactions'],
        source:
          "export default async function run(ctx) {\n  let event;\n  try {\n    event = JSON.parse(ctx.input?.body ?? '');\n  } catch {\n    return ctx.log('not JSON');\n  }\n  if (!Number.isInteger(event?.amount)) return ctx.log('no amount in minor units');\n  ctx.write('transactions', { amount: event.amount, merchant: String(event.description ?? '') });\n}",
      },
    },
  ],
  to_propose:
    'propose body_kind change with {"declaration_id":"script.<name>","to":<the declaration>}. The owner approves each origin and key in Decide, and a key must be in the keychain before they can accept.',
  to_try:
    'the same change with "try":true beside "to", or "try":{"input":...} to hand it what a door would. It runs now and answers script_try: the writes it would make, its log and any refusal. Nothing is written and nothing is proposed, so send it again without try when it works. It fetches for real and counts as a run of the plan. For an agent it opens no key and only reads, a GET or a HEAD without a body, twenty trials a record a day; the owner\'s trial sends what the draft asks.',
  in_this_build:
    "an accepted script runs on the self-host and on the Cloud: on its clock, from a rule's script step when it says rule:true, and from every verified arrival at its door, within a daily cap, and the script's history says when arrivals went past it. An arrival nothing verified starts nothing. A trial runs on a self-host whose actions are on, and on the Cloud.",
};
