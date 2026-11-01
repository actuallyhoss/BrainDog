/**
 * MONEY-CORE 3.30.0 (taken back from 3.32.2: the live check's patch, whose one page outside the round is `page.money-rules`, and file-paid, which adds `rule.payment-files-paid` and `script.file_paid` and changes `script.learn_category`; and round 1031, which adds the correction rules, `script.ledger_twice`, the figures by range, and changes the spending figures and pages; and 3.34.0, which adds `register.payee_names`, `rule.payee-named-back` and `script.name_payees`, and changes the Money pages and `script.offer_budgets`, so `page.money-bill` and `script.offer_budgets` are held here too, as 3.33.0 declared them unchanged since 3.30.0), PEOPLE 4.0.0 AND PORTFOLIO 1.30.0 AS c78754bdd (master before round 1030) DECLARED THEM, as the parts this build changed or
 * added, so every rebuild of an older version starts from what a record held before the round (`before1030`).
 *
 * GENERATED, NOT HAND-WRITTEN, as `founder-shipped.ts` is: at that commit, `firstPartyDocument(id, { seeds: [] })` for each
 * module, each declaration keyed by its kind and name and its place among those of the same key, and compared with this
 * build's. `was` holds the old body of each one the round changed, and `added` names each one it added. Nothing was
 * taken away. What these give is held to the released fingerprints in `quiet-update.test.ts`, so a body copied wrong is
 * caught there.
 */

type Body = Record<string, unknown>;

type Before = { version: string; now: string; added: readonly string[]; was: Readonly<Record<string, Body>> };

const BEFORE_1030: Readonly<Record<string, Before>> = {
 "money-core": {
  "version": "3.30.0",
  "now": "3.34.0",
  "added": [
   "metric.balance-by-account#0",
   "metric.accounts-open#0",
   "metric.budgets-monthly-total#0",
   "metric.budgets-weekly-total#0",
   "metric.budgets-yearly-total#0",
   "metric.budgets-weekly#0",
   "metric.budgets-yearly#0",
   "metric.spent-by-category-week#0",
   "metric.spent-by-category-year#0",
   "metric.pending-out-month#0",
   "metric.pending-lines#0",
   "metric.pending-out-month-count#0",
   "metric.unnamed-paid-90d#0",
   "metric.installments-a-month#0",
   "metric.received-a-month#0",
   "metric.received-three-months-back#0",
   "metric.spoken-for-month#0",
   "metric.spoken-for-share#0",
   "metric.stripe-below-zero-count#0",
   "metric.held-beyond-cash#0",
   "metric.owed-over-time#0",
   "metric.net-worth#0",
   "metric.net-worth-nights#0",
   "metric.spent-in-category-by-week#0",
   "metric.paid-to-by-week#0",
   "rule.payment-matches-again#0",
   "script.post_due#0",
   "rule.posted-replaced#0",
   "script.replace_posted#0",
   "rule.category-stays-asks#0",
   "rule.category-stays-yes#0",
   "script.category_stays#0",
   "rule.payment-files-paid#0",
   "script.file_paid#0",
   "metric.received-last#0",
   "metric.spent-last#0",
   "metric.left-last#0",
   "metric.received-three#0",
   "metric.spent-three#0",
   "metric.left-three#0",
   "metric.received-year#0",
   "metric.spent-year#0",
   "metric.left-year#0",
   "metric.received-all#0",
   "metric.spent-all#0",
   "metric.left-all#0",
   "rule.category-correction-asks#0",
   "rule.category-correction-yes#0",
   "script.category_correction#0",
   "script.ledger_twice#0",
   "metric.moved-since#0",
   "metric.filing-rule-filed#0",
   "metric.filing-rules#0",
   "metric.bills-open#0",
   "metric.repeating-held#0",
   "metric.bills-held#0",
   "metric.settled-out-7d#0",
   "register.payee_names#0",
   "rule.payee-named-back#0",
   "script.name_payees#0"
  ],
  "was": {
   "script.learn_category#0": {
    "script": "learn_category",
    "title": "Offer a filing rule from a category set by hand",
    "pack": "money-core",
    "runs": {
     "rule": true
    },
    "egress": [],
    "keys": [],
    "reads": [
     "transactions",
     "categories",
     "filing_rules"
    ],
    "writes": [
     "filing_rules"
    ],
    "limits": {
     "cpu_ms": 1000,
     "wall_ms": 30000
    },
    "source": "function filingFits(rule, entry, key) {\n  const r = rule && rule.fields ? rule.fields : rule;\n  if (!r || r.state !== 'on' || typeof r.match !== 'string' || r.match === '') return null;\n  const text = r.reads === 'description' ? entry.what : entry.counterparty_text;\n  if (typeof text !== 'string' || text === '') return null;\n  if (r.direction !== 'either' && r.direction !== entry.direction) return null;\n  if (typeof r.account === 'string' && r.account !== '' && r.account !== entry.account) return null;\n  /* THE LADDER'S CASE FOLD, A TO Z ALONE (`fold` in `packages/kernel/src/ingest.ts`), so no build folds more than it. */\n  const low = (t) => t.replace(/[A-Z]+/g, (run) => run.toLowerCase());\n  const long = [...r.match].length;\n  if (text === r.match) return { rung: 1, long, folded: false };\n  const how = r.match_by;\n  if (how === 'starts' && low(text).startsWith(low(r.match))) return { rung: 2, long, folded: false };\n  if (how === 'contains' && low(text).includes(low(r.match))) return { rung: 3, long, folded: false };\n  if (how === 'pattern') {\n    /* A PATTERN THE RECORD WOULD NOT RUN IS NOT RUN HERE: too long, one that does not compile, or a repeated group that\n       holds a repeat or a choice. The record refuses those where they are typed; this is for one stored before. */\n    if (long > 120 || /\\([^)]*[+*?|][^)]*\\)[+*{]/.test(r.match)) return null;\n    try {\n      return new RegExp(r.match, 'i').test([...text].slice(0, 512).join('')) ? { rung: 4, long, folded: false } : null;\n    } catch {\n      return null;\n    }\n  }\n  if (how === 'exact' && typeof key === 'function') {\n    const [a, b] = [key(text), key(r.match)];\n    if (typeof a === 'string' && a !== '' && a === b) return { rung: 1, long, folded: true };\n  }\n  return null;\n}\nfunction filingWinner(rules, entry) {\n  const fits = (r) => {\n    const r0 = r && r.fields ? r.fields : r;\n    const text = r0.reads === 'description' ? entry.what : entry.counterparty_text;\n    if (r0.state !== 'on' || typeof r0.match !== 'string' || r0.match === '' || typeof text !== 'string' || text === '') return null;\n    if (r0.direction !== 'either' && r0.direction !== entry.direction) return null;\n    if (typeof r0.account === 'string' && r0.account !== '' && r0.account !== entry.account) return null;\n    const low = (t) => t.replace(/[A-Z]+/g, (run) => run.toLowerCase());\n    const long = [...r0.match].length;\n    if (text === r0.match) return { rung: 1, long };\n    if (r0.match_by === 'starts' && low(text).startsWith(low(r0.match))) return { rung: 2, long };\n    if (r0.match_by === 'contains' && low(text).includes(low(r0.match))) return { rung: 3, long };\n    if (r0.match_by === 'pattern' && long <= 120 && !/\\([^)]*[+*?|][^)]*\\)[+*{]/.test(r0.match)) {\n      try {\n        if (new RegExp(r0.match, 'i').test([...text].slice(0, 512).join(''))) return { rung: 4, long };\n      } catch {\n        /* a pattern that does not compile fits nothing */\n      }\n    }\n    return null;\n  };\n  const best = (reads) => {\n    let won = null;\n    let tie = false;\n    for (const r of rules) {\n      const r0 = r && r.fields ? r.fields : r;\n      if ((r0.reads === 'description' ? 'description' : 'payee') !== reads) continue;\n      const f = fits(r);\n      if (!f) continue;\n      if (won === null || f.rung < won.rung || (f.rung === won.rung && f.long > won.long)) {\n        won = { id: r.id, rung: f.rung, long: f.long };\n        tie = false;\n      } else if (f.rung === won.rung && f.long === won.long) tie = true;\n    }\n    return won === null ? null : tie ? { tie: true } : { id: won.id };\n  };\n  const first = best('payee');\n  if (first && first.id) return first;\n  return best('description') ?? first;\n}\nfunction fileable(rule, entries, rivals, key, most) {\n  const others = rivals.filter((r) => r.id !== rule.id);\n  const out = [];\n  for (const e of entries) {\n    if (out.length >= most) break;\n    const fit = filingFits(rule, e.fields, key);\n    if (!fit) continue;\n    const won = filingWinner(fit.folded ? others : [rule, ...others], e.fields);\n    if (fit.folded ? won !== null : !(won && won.id === rule.id)) continue;\n    out.push(e);\n  }\n  return out;\n}\nasync function unfiled(ctx, where, from, to) {\n  const PAGE = 50;\n  const READS = 80;\n  const DAY = 86_400_000;\n  const at = (d) => Date.parse(`${d}T00:00:00Z`);\n  const dayOf = (t) => new Date(t).toISOString().slice(0, 10);\n  const rows = [];\n  const spans = [[at(from), at(to)]];\n  let reads = 0;\n  let short = false;\n  while (spans.length > 0) {\n    if (reads >= READS) {\n      short = true;\n      break;\n    }\n    const [a, b] = spans.shift();\n    reads += 1;\n    const page = await ctx.record.list('transactions', { all: [...where, { field: 'on', between: [dayOf(a), dayOf(b)] }] });\n    if (page.length >= PAGE && b > a) {\n      const mid = a + Math.floor((b - a) / DAY / 2) * DAY;\n      spans.unshift([a, mid]);\n      spans.unshift([mid + DAY, b]);\n      continue;\n    }\n    if (page.length >= PAGE) short = true;\n    rows.push(...page);\n  }\n  const day = (r) => (typeof r.fields.on === 'string' ? r.fields.on : '');\n  rows.sort((x, y) => (day(x) < day(y) ? 1 : day(x) > day(y) ? -1 : 0));\n  return { rows, short };\n}\nfunction learnAsk(whom, under, n, key, about) {\n  const more = n === 0 ? '' : ` ${n} more like it ${n === 1 ? 'has' : 'have'} no category.`;\n  return {\n    cause: `money.learn.${key}`,\n    question: `File every ${whom} under ${under} from now on?${more}`,\n    about,\n    options: [\n      {\n        id: 'yes',\n        label: 'Yes',\n        because:\n          n === 0\n            ? `A filing rule files every ${whom} under ${under} from now on.`\n            : `A filing rule files every ${whom} under ${under} from now on, and the ${n} already here are filed as one change you can undo.`,\n      },\n      { id: 'only-this-one', label: 'Only this one', because: `Nothing is written, and ${whom} is not asked about again.` },\n    ],\n  };\n}\nexport default async function run(ctx) {\n  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};\n  const said = input.register === 'transactions' && Number.isSafeInteger(input.seq) ? `transactions#${input.seq}` : typeof input.entry === 'string' ? input.entry : input.id;\n  const entry = typeof said === 'string' && said !== '' ? await ctx.record.get(said) : null;\n  if (!entry || entry.register !== 'transactions') {\n    ctx.log('The script was handed no Ledger entry, so nothing was asked.');\n    return null;\n  }\n  const f = entry.fields;\n  const text = typeof f.counterparty_text === 'string' ? f.counterparty_text.trim() : '';\n  if (text === '' || text !== f.counterparty_text) {\n    ctx.log('This entry has no bank text a filing rule could match whole, so nothing was asked.');\n    return null;\n  }\n  const whom = typeof f.payee === 'string' && f.payee.trim() !== '' ? f.payee.trim() : text;\n  if (f.direction !== 'in' && f.direction !== 'out') {\n    ctx.log(`The entry for ${whom} does not say which way the money went, so nothing was asked.`);\n    return null;\n  }\n  if (typeof f.category !== 'string' || f.category === '') {\n    ctx.log(`The entry for ${whom} has no category now, so nothing was asked.`);\n    return null;\n  }\n  /* AN ENTRY A RULE THAT IS ON FILED WAS NOT FILED BY HAND. */\n  if (typeof f.filed_by === 'string' && f.filed_by !== '') {\n    const by = await ctx.record.get(f.filed_by);\n    if (by && by.fields.state === 'on') {\n      ctx.log(`The entry for ${whom} was filed by a filing rule that is on, so nothing was asked.`);\n      return null;\n    }\n  }\n  const category = await ctx.record.get(f.category);\n  if (!category || category.register !== 'categories' || category.fields.state !== 'live') {\n    ctx.log(`The entry for ${whom} is under a category that is gone or retired, so nothing was asked.`);\n    return null;\n  }\n  const under = typeof category.fields.name === 'string' && category.fields.name !== '' ? category.fields.name : 'its category';\n\n  /* A RULE THAT IS ON AND NAMES THIS TEXT WHOLE, FOR THIS WAY, IS ALREADY THE ANSWER, or one Yes would tie with. */\n  const rivals = [];\n  for (const how of ['exact', 'starts', 'contains', 'pattern']) rivals.push(...(await ctx.record.list('filing_rules', { all: [{ field: 'state', is: 'on' }, { field: 'match_by', is: how }] })));\n  const named = rivals.find((r) => r.fields.reads !== 'description' && r.fields.match === text && (r.fields.direction === 'either' || r.fields.direction === f.direction) && !r.fields.account);\n  if (named) {\n    ctx.log(`A filing rule already files ${whom}, so nothing was asked and nothing was made.`);\n    return null;\n  }\n  const rule = { id: '', seq: null, version: 0, fields: { match: text, match_by: 'exact', reads: 'payee', direction: f.direction, category: category.id, state: 'on' } };\n\n  /* ANSWERED. Yes makes the rule; any other words write nothing. */\n  if (typeof input.answer === 'string') {\n    if (input.answer !== 'Yes') {\n      ctx.log(`Only this one: nothing was made for ${whom}.`);\n      return null;\n    }\n    ctx.write('filing_rules', rule.fields);\n    ctx.log(`A filing rule now files every ${whom} under ${under}. What it matches with no category is filed next, as one change.`);\n    return { made: text };\n  }\n\n  /* ASKED. The payee's key is the host's fold where it hands one, else the text's own letters and digits. */\n  const plain = (t) => t.normalize('NFKD').replace(/[^\\p{L}\\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase();\n  let folded = null;\n  let key;\n  if (typeof ctx.fold === 'function') {\n    try {\n      folded = await ctx.fold(text);\n    } catch {\n      folded = null;\n    }\n  }\n  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);\n  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);\n  const read = await unfiled(ctx, [{ field: 'category', empty: true }, { field: 'state', is: 'cleared' }, { field: 'transfer', is: false }, { field: 'direction', is: f.direction }], from, today);\n  if (typeof ctx.fold === 'function') {\n    const keys = new Map([[text, folded]]);\n    try {\n      for (const e of read.rows) {\n        const t = e.fields.counterparty_text;\n        if (typeof t === 'string' && !keys.has(t)) keys.set(t, await ctx.fold(t));\n      }\n      key = (t) => keys.get(t) ?? null;\n    } catch {\n      key = undefined;\n    }\n  }\n  const n = fileable(rule, read.rows.filter((e) => e.id !== entry.id), rivals, key, 500).length;\n  /* THE KIND OF KEY IS CUT (`bank:talabat` is `talabat`), so the cause reads as the payee it remembers. */\n  const cause = (typeof folded === 'string' && folded !== '' ? plain(folded.replace(/^[a-z]+:/, '')) : plain(text)).slice(0, 60) || 'payee';\n  ctx.log(`Asked whether every ${whom} goes under ${under}: ${n} more like it ${n === 1 ? 'has' : 'have'} no category.`);\n  return { ask: learnAsk(whom, under, n, cause, `transactions#${entry.seq}`) };\n}"
   },
   "page.money-rules#0": {
    "page": "money-rules",
    "title": "Filing rules",
    "nav": {
     "section": "Money",
     "order": 40
    },
    "icon": "tag",
    "requires": [
     "register.filing_rules",
     "register.transactions"
    ],
    "pack": "money-core",
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "rule-filed",
       "lt": 1
      },
      "body": "No rule has filed anything yet."
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "filed-by-rule-30d",
       "gte": 1
      },
      "body": "{{rules-filing-30d}} rule(s) filed {{filed-by-rule-30d}} entries in 30 days."
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "all": [
        {
         "metric": "rule-filed",
         "gte": 1
        },
        {
         "metric": "filed-by-rule-30d",
         "lt": 1
        }
       ]
      },
      "body": "Nothing filed in 30 days. {{rule-filed}} before that."
     },
     {
      "kind": "note",
      "span": 12,
      "when": {
       "metric": "txn-uncategorised",
       "gt": 0
      },
      "body": "{{txn-uncategorised}} entries with no category. [File them](/automations/txn-categorise?again=1)"
     },
     {
      "kind": "table",
      "heading": "Rules",
      "icon": "tag",
      "span": 12,
      "source": "register.filing_rules",
      "columns": [
       {
        "field": "match",
        "label": "Matches",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "match_by",
        "label": "How it matches",
        "width": "16ch"
       },
       {
        "field": "category",
        "label": "Category",
        "width": "minmax(10ch,18ch)"
       },
       {
        "field": "state",
        "label": "Status",
        "width": "8ch"
       }
      ],
      "order": [
       {
        "field": "rank",
        "dir": "asc"
       },
       {
        "field": "match",
        "dir": "asc"
       }
      ],
      "limit": 120,
      "empty": "No filing rules yet."
     },
     {
      "kind": "bar",
      "heading": "Entries each rule filed",
      "icon": "chart-bar",
      "span": 12,
      "source": "metric.rule-filed",
      "when": {
       "metric": "rules-filing",
       "gte": 2
      },
      "empty": "No rule has filed anything yet."
     },
     {
      "kind": "table",
      "heading": "Filed lately",
      "icon": "history",
      "span": 12,
      "source": "register.transactions",
      "where": "filed_by is set",
      "columns": [
       {
        "field": "filed_by",
        "label": "Rule",
        "width": "minmax(12ch,18ch)"
       },
       {
        "field": "what",
        "label": "Description",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "category",
        "label": "Category",
        "width": "minmax(10ch,18ch)"
       },
       {
        "field": "on",
        "label": "Date",
        "width": "13ch",
        "align": "end"
       }
      ],
      "order": [
       {
        "field": "created_at",
        "dir": "desc"
       }
      ],
      "limit": 6,
      "when": {
       "metric": "rule-filed",
       "gte": 1
      }
     }
    ]
   },
   "register.accounts#0": {
    "register": "accounts",
    "name": "Accounts",
    "icon": "money",
    "one": "account",
    "holds": "what is in each bank account, cash box and card, and the day that was true",
    "title": "name",
    "mobile": [
     "name",
     "balance",
     "as_of"
    ],
    "delete": "refuse_while_referenced",
    "state": "state",
    "done": [
     "closed"
    ],
    "pack": "money-core",
    "fields": [
     {
      "id": "name",
      "type": "text",
      "required": true,
      "search": true
     },
     {
      "id": "kind",
      "label": "Type",
      "type": "enum",
      "values": [
       "bank",
       "cash",
       "card"
      ],
      "index": true,
      "required": true
     },
     {
      "id": "balance",
      "type": "money",
      "required": true
     },
     {
      "id": "as_of",
      "label": "As of",
      "type": "day",
      "index": true,
      "required": true
     },
     {
      "id": "liquid",
      "label": "Counts as cash",
      "type": "bool",
      "default": true
     },
     {
      "id": "last4",
      "label": "Digits the bank prints",
      "type": "text"
     },
     {
      "id": "arrives",
      "label": "Arrives",
      "type": "day"
     },
     {
      "id": "limit",
      "label": "Credit limit",
      "type": "money"
     },
     {
      "id": "to_pay",
      "label": "To pay on it",
      "type": "money"
     },
     {
      "id": "to_pay_on",
      "label": "To pay as of",
      "type": "day"
     },
     {
      "id": "book",
      "label": "Book",
      "type": "ref",
      "to": "books",
      "index": true
     },
     {
      "id": "state",
      "label": "Status",
      "type": "enum",
      "values": [
       "open",
       "closed"
      ],
      "labels": {
       "open": "Open",
       "closed": "Closed"
      },
      "default": "open",
      "index": true
     },
     {
      "id": "tags",
      "type": "list",
      "of": "text"
     }
    ]
   },
   "register.categories#0": {
    "register": "categories",
    "name": "Categories",
    "icon": "tag",
    "one": "category",
    "holds": "what money is for, so a ledger can be read by where it goes",
    "title": "name",
    "mobile": [
     "name",
     "direction",
     "budget"
    ],
    "state": "state",
    "done": [
     "retired"
    ],
    "pack": "money-core",
    "fields": [
     {
      "id": "name",
      "type": "text",
      "required": true,
      "unique": true,
      "search": true
     },
     {
      "id": "direction",
      "label": "Which way",
      "type": "enum",
      "values": [
       "in",
       "out",
       "both"
      ],
      "labels": {
       "in": "Money in",
       "out": "Money out",
       "both": "Either way"
      },
      "index": true,
      "required": true
     },
     {
      "id": "match",
      "label": "Matches",
      "type": "text",
      "index": true
     },
     {
      "id": "match_by",
      "label": "How it matches",
      "type": "enum",
      "values": [
       "exact",
       "starts",
       "contains",
       "pattern"
      ],
      "labels": {
       "exact": "The whole description",
       "starts": "How it starts",
       "contains": "Anywhere in it",
       "pattern": "A pattern"
      },
      "default": "exact"
     },
     {
      "id": "budget",
      "label": "Most a month",
      "type": "money"
     },
     {
      "id": "icon",
      "label": "Icon",
      "type": "enum",
      "values": [
       "shopping-cart",
       "shopping-bag",
       "utensils",
       "coffee",
       "car",
       "plane",
       "train-front",
       "house",
       "zap",
       "phone",
       "heart-pulse",
       "gift",
       "ticket",
       "music",
       "graduation-cap",
       "dumbbell",
       "briefcase",
       "banknote",
       "piggy-bank",
       "landmark",
       "credit-card",
       "hand-coins",
       "repeat",
       "scale",
       "heart",
       "package",
       "tag"
      ]
     },
     {
      "id": "colour",
      "label": "Colour",
      "type": "enum",
      "values": [
       "pink",
       "violet",
       "blue",
       "teal",
       "yellow",
       "lime",
       "sky",
       "slate"
      ],
      "labels": {
       "pink": "Pink",
       "violet": "Violet",
       "blue": "Blue",
       "teal": "Teal",
       "yellow": "Yellow",
       "lime": "Lime",
       "sky": "Sky",
       "slate": "Slate"
      }
     },
     {
      "id": "budget_alert",
      "label": "Warn at percent",
      "type": "int",
      "min": 1,
      "max": 100
     },
     {
      "id": "rollover",
      "label": "Carries over",
      "type": "bool",
      "default": false
     },
     {
      "id": "parent",
      "label": "Under",
      "type": "ref",
      "to": "categories"
     },
     {
      "id": "budget_warned",
      "label": "Budget warning",
      "type": "enum",
      "values": [
       "near",
       "over"
      ],
      "labels": {
       "near": "Near its most",
       "over": "Over its most"
      }
     },
     {
      "id": "warned_month",
      "label": "Warned for",
      "type": "text"
     },
     {
      "id": "transfer",
      "label": "Money stays yours",
      "type": "bool",
      "default": false
     },
     {
      "id": "state",
      "label": "Status",
      "type": "enum",
      "values": [
       "live",
       "retired"
      ],
      "default": "live",
      "index": true,
      "required": true
     },
     {
      "id": "note",
      "type": "text"
     },
     {
      "id": "tags",
      "type": "list",
      "of": "text"
     }
    ]
   },
   "register.transactions#0": {
    "register": "transactions",
    "name": "Ledger",
    "icon": "rows",
    "one": "transaction",
    "holds": "money that has moved, with the day it moved, the account it moved through and what it was for",
    "title": "what",
    "mobile": [
     "what",
     "amount",
     "on"
    ],
    "state": "state",
    "done": [
     "cleared",
     "void"
    ],
    "pack": "money-core",
    "order": {
     "field": "on",
     "dir": "desc"
    },
    "delete": "refuse_while_referenced",
    "pairs": {
     "on": [
      "abs(amount)"
     ],
     "opposite": "direction",
     "across": "account",
     "within": "4d",
     "across_currency": {
      "tolerance": 2
     },
     "mark": "transfer",
     "where": {
      "all": [
       {
        "field": "state",
        "is": "cleared"
       },
       {
        "field": "party",
        "empty": true
       },
       {
        "any": [
         {
          "field": "settles",
          "empty": true
         },
         {
          "field": "transfer",
          "is": true
         }
        ]
       }
      ]
     }
    },
    "fields": [
     {
      "id": "what",
      "label": "Description",
      "type": "text",
      "required": true,
      "search": true
     },
     {
      "id": "on",
      "label": "Date",
      "type": "day",
      "index": true,
      "required": true
     },
     {
      "id": "direction",
      "label": "Which way",
      "type": "enum",
      "values": [
       "in",
       "out"
      ],
      "labels": {
       "in": "Money in",
       "out": "Money out"
      },
      "index": true,
      "required": true
     },
     {
      "id": "amount",
      "type": "money",
      "required": true,
      "currency_from": "account.balance",
      "currency_fixed": true
     },
     {
      "id": "available",
      "label": "Available after",
      "type": "money",
      "currency_from": "account.balance"
     },
     {
      "id": "balance_after",
      "label": "Balance after",
      "type": "money",
      "currency_from": "account.balance"
     },
     {
      "id": "account",
      "type": "ref",
      "to": "accounts",
      "index": true,
      "required": true
     },
     {
      "id": "category",
      "type": "ref",
      "to": "categories",
      "index": true
     },
     {
      "id": "filed_by",
      "label": "Filed by",
      "type": "ref",
      "to": "filing_rules"
     },
     {
      "id": "party",
      "label": "Who",
      "type": "ref",
      "to": "organisations"
     },
     {
      "id": "counterparty_text",
      "label": "As the bank wrote it",
      "type": "text",
      "search": true
     },
     {
      "id": "payee",
      "label": "Paid to or from",
      "type": "text",
      "search": true
     },
     {
      "id": "thing",
      "label": "Project",
      "type": "ref",
      "to": "things",
      "index": true
     },
     {
      "id": "book",
      "label": "Book",
      "type": "ref",
      "to": "books"
     },
     {
      "id": "state",
      "label": "Status",
      "type": "enum",
      "values": [
       "pending",
       "cleared",
       "void"
      ],
      "default": "cleared",
      "index": true,
      "required": true
     },
     {
      "id": "transfer",
      "label": "Between your own accounts",
      "type": "bool",
      "default": false,
      "index": true
     },
     {
      "id": "stays",
      "label": "Money stays yours",
      "type": "bool",
      "derive": {
       "via": {
        "ref": "category",
        "field": "transfer"
       }
      }
     },
     {
      "id": "settles",
      "label": "Settles",
      "type": "ref",
      "to": "obligations",
      "index": true
     },
     {
      "id": "note",
      "type": "text"
     },
     {
      "id": "parts",
      "label": "Split",
      "type": "json",
      "parts_of": "amount"
     },
     {
      "id": "tags",
      "type": "list",
      "of": "text"
     }
    ]
   },
   "register.recurring#0": {
    "register": "recurring",
    "name": "Repeating",
    "icon": "refresh",
    "one": "repeating item",
    "holds": "the money that comes in and goes out on a cadence, weekly to yearly, without anybody deciding again. Next is the next payment, and the days of the month every one after it",
    "title": "what",
    "mobile": [
     "what",
     "amount",
     "next_due"
    ],
    "state": "state",
    "done": [
     "ended"
    ],
    "pack": "money-core",
    "fields": [
     {
      "id": "what",
      "label": "Description",
      "type": "text",
      "required": true,
      "search": true
     },
     {
      "id": "direction",
      "label": "Which way",
      "type": "enum",
      "values": [
       "in",
       "out"
      ],
      "labels": {
       "in": "Money in",
       "out": "Money out"
      },
      "index": true,
      "required": true
     },
     {
      "id": "amount",
      "type": "money",
      "required": true,
      "qualifies": "every",
      "currency_from": "account.balance"
     },
     {
      "id": "every",
      "label": "How often",
      "type": "enum",
      "values": [
       "weekly",
       "fortnightly",
       "twice_monthly",
       "monthly",
       "quarterly",
       "yearly"
      ],
      "labels": {
       "weekly": "Every week",
       "fortnightly": "Every two weeks",
       "twice_monthly": "Twice a month",
       "monthly": "Every month",
       "quarterly": "Every quarter",
       "yearly": "Every year"
      },
      "index": true,
      "required": true
     },
     {
      "id": "next_due",
      "label": "Next",
      "type": "day",
      "index": true,
      "deadline": true,
      "required": true,
      "remind": [
       "-3d",
       "0d"
      ]
     },
     {
      "id": "last_paid",
      "label": "Last paid",
      "type": "day"
     },
     {
      "id": "last_amount",
      "label": "Last amount",
      "type": "money"
     },
     {
      "id": "day_of_month",
      "label": "Days of the month",
      "type": "text",
      "max": 12
     },
     {
      "id": "weekend",
      "label": "On a rest day",
      "type": "enum",
      "values": [
       "leave",
       "before",
       "after"
      ],
      "labels": {
       "leave": "Keep the day",
       "before": "The working day before",
       "after": "The working day after"
      },
      "default": "leave"
     },
     {
      "id": "started",
      "label": "Since",
      "type": "day"
     },
     {
      "id": "ends",
      "label": "Ends",
      "type": "day"
     },
     {
      "id": "account",
      "type": "ref",
      "to": "accounts",
      "index": true
     },
     {
      "id": "category",
      "type": "ref",
      "to": "categories",
      "index": true
     },
     {
      "id": "party",
      "label": "Who",
      "type": "ref",
      "to": "people"
     },
     {
      "id": "thing",
      "label": "Project",
      "type": "ref",
      "to": "things",
      "index": true
     },
     {
      "id": "book",
      "label": "Book",
      "type": "ref",
      "to": "books"
     },
     {
      "id": "state",
      "label": "Status",
      "type": "enum",
      "values": [
       "live",
       "paused",
       "ended"
      ],
      "default": "live",
      "index": true,
      "required": true
     },
     {
      "id": "note",
      "type": "text"
     },
     {
      "id": "tags",
      "type": "list",
      "of": "text"
     }
    ]
   },
   "register.snapshots#0": {
    "register": "snapshots",
    "name": "Snapshots",
    "icon": "history",
    "one": "snapshot",
    "holds": "what the money was on a night, so a figure can be compared with the day it was true",
    "title": "what",
    "mobile": [
     "what",
     "cash",
     "net"
    ],
    "pack": "money-core",
    "fields": [
     {
      "id": "what",
      "label": "Night",
      "type": "text",
      "search": true
     },
     {
      "id": "on",
      "label": "Date",
      "type": "day",
      "unique": true,
      "required": true
     },
     {
      "id": "cash",
      "label": "Cash",
      "type": "money",
      "required": true
     },
     {
      "id": "owed_to_me",
      "label": "Receivables",
      "type": "money"
     },
     {
      "id": "owed_by_me",
      "label": "Payables",
      "type": "money"
     },
     {
      "id": "net",
      "label": "Net",
      "type": "money"
     },
     {
      "id": "taken",
      "label": "Taken",
      "type": "enum",
      "values": [
       "nightly",
       "typed"
      ],
      "default": "nightly",
      "index": true,
      "required": true
     },
     {
      "id": "note",
      "type": "text"
     },
     {
      "id": "tags",
      "type": "list",
      "of": "text"
     }
    ]
   },
   "page.money#0": {
    "page": "money",
    "title": "Money",
    "nav": {
     "section": "Money",
     "order": 10,
     "place": 40
    },
    "icon": "money",
    "requires": [
     "register.accounts",
     "register.obligations",
     "register.transactions",
     "register.recurring",
     "register.installments",
     "register.categories",
     "register.books",
     "register.balances"
    ],
    "pack": "money-core",
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "all": [
        {
         "metric": "books-held",
         "lt": 2
        },
        {
         "metric": "runway-days",
         "beyond": false
        }
       ]
      },
      "body": "{{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}. {{card-to-pay}} to pay on the card, as of {{card-to-pay-on}}."
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "all": [
        {
         "metric": "books-held",
         "lt": 2
        },
        {
         "metric": "runway-days",
         "beyond": true
        }
       ]
      },
      "body": "Lasts the year on what is due. {{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}. {{card-to-pay}} to pay on the card, as of {{card-to-pay-on}}."
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "books-held",
       "gte": 2
      },
      "body": "Spread over {{cash-by-account.groups}} account(s). {{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}. {{card-to-pay}} to pay on the card, as of {{card-to-pay-on}}."
     },
     {
      "kind": "capture",
      "heading": "Add an account",
      "icon": "plus",
      "span": 12,
      "register": "accounts",
      "when": {
       "metric": "cash-accounts",
       "lt": 1
      }
     },
     {
      "kind": "stat",
      "lead": true,
      "span": 12,
      "cells": [
       {
        "metric": "cash-now",
        "label": "Cash now",
        "trend": "12w",
        "ahead": "runway-days",
        "note": "{{cash-now.moved}} on a month ago. Rate {{cash-now.rate_age}} · [Update](/r/fx)"
       },
       {
        "metric": "runs-out-on",
        "label": "Lasts",
        "note": "In {{runway-days}}"
       },
       {
        "metric": "lasts-no-income",
        "label": "If nothing comes in",
        "note": "Until {{lasts-no-income.on}}"
       },
       {
        "metric": "arriving-30d",
        "label": "Coming in, 30 days"
       },
       {
        "metric": "leaving-30d",
        "label": "Going out, 30 days"
       }
      ],
      "when": {
       "metric": "cash-accounts",
       "gt": 0
      }
     },
     {
      "kind": "timeline",
      "heading": "Coming up",
      "icon": "calendar",
      "source": "deadlines",
      "where": "amount is set, day after -31d",
      "horizon": 60,
      "columns": [
       {
        "field": "day"
       },
       {
        "field": "title"
       },
       {
        "field": "amount",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       }
      ],
      "limit": 6,
      "when": {
       "metric": "cash-accounts",
       "gt": 0
      },
      "empty": "Nothing due in two months."
     },
     {
      "kind": "bar",
      "heading": "Spent this month",
      "icon": "chart-bar",
      "source": "metric.spent-by-category-month",
      "unset": "Not filed yet",
      "when": {
       "metric": "spent-by-category-month",
       "gt": 0
      },
      "empty": "Nothing spent this month."
     },
     {
      "kind": "bar",
      "heading": "Accounts",
      "icon": "landmark",
      "source": "metric.cash-by-account",
      "limit": 12,
      "when": {
       "metric": "cash-now",
       "gt": 0
      }
     },
     {
      "kind": "timeline",
      "heading": "Ledger",
      "body": "{{filed-today}} filed today.",
      "icon": "receipt",
      "source": "register.transactions",
      "where": "state is not void",
      "columns": [
       {
        "field": "on"
       },
       {
        "field": "payee",
        "or": "what"
       },
       {
        "field": "amount",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       },
       {
        "field": "category"
       },
       {
        "field": "account"
       },
       {
        "field": "category",
        "as": "chip"
       }
      ],
      "order": [
       {
        "field": "on",
        "dir": "desc"
       }
      ],
      "limit": 6,
      "empty": "Nothing has moved yet."
     },
     {
      "kind": "progress",
      "heading": "Instalments",
      "icon": "credit-card",
      "cells": [
       {
        "metric": "installments-paid-by-plan",
        "label": "Paid"
       },
       {
        "metric": "installments-total-by-plan",
        "label": "Parts"
       },
       {
        "metric": "installments-next-due-by-plan",
        "label": "Next due"
       },
       {
        "metric": "installments-left-by-plan",
        "label": "Left"
       },
       {
        "metric": "installments-after-next-by-plan",
        "label": "Left after"
       }
      ],
      "when": {
       "metric": "installments-left",
       "gt": 0
      },
      "empty": "Nothing is being paid in parts."
     },
     {
      "kind": "section",
      "heading": "Heads up",
      "icon": "bell",
      "span": 12,
      "box": true,
      "when": {
       "metric": "cash-accounts",
       "gt": 0
      }
     },
     {
      "kind": "stat",
      "heading": "Cash now does not add up",
      "icon": "alert",
      "span": 12,
      "tone": "bad",
      "cells": [
       {
        "metric": "cash-cross-check",
        "label": "Cash now, less its entries added up",
        "note": "Should be nought"
       }
      ],
      "when": {
       "metric": "cash-cross-check",
       "not": 0
      }
     },
     {
      "kind": "note",
      "tone": "warn",
      "span": 12,
      "body": "Oldest balance from {{cash-as-of}}. [Update](/r/balances?new=1)",
      "when": {
       "metric": "balances-stale",
       "gt": 0
      }
     },
     {
      "kind": "note",
      "tone": "warn",
      "span": 12,
      "body": "Invoices {{bad:late}}: {{late-in}} to come in. [See them](/r/obligations?f=direction:is:owed_to_me&f=state:in:open,part&f=due:before:today)",
      "when": {
       "metric": "late-in",
       "gt": 0
      }
     },
     {
      "kind": "note",
      "tone": "bad",
      "span": 12,
      "says": [
       {
        "when": {
         "all": [
          {
           "metric": "installments-late",
           "gt": 0
          },
          {
           "metric": "overdue",
           "gt": 0
          }
         ]
        },
        "body": "{{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}. Bills late too: {{overdue}} to pay. [See them](/r/obligations?f=direction:is:owed_by_me&f=state:in:open,part&f=due:before:today)"
       },
       {
        "when": {
         "metric": "installments-late",
         "gt": 0
        },
        "body": "{{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}. [See it](/r/installments?f=state:is:open&f=direction:is:out&f=due:before:today)"
       },
       {
        "body": "Bills {{bad:late}}: {{overdue}} to pay. [See them](/r/obligations?f=direction:is:owed_by_me&f=state:in:open,part&f=due:before:today)"
       }
      ],
      "when": {
       "any": [
        {
         "metric": "overdue",
         "gt": 0
        },
        {
         "metric": "installments-late",
         "gt": 0
        }
       ]
      }
     }
    ]
   },
   "page.money-account#0": {
    "page": "money-account",
    "title": "{{name}}",
    "for": {
     "register": "accounts",
     "fleeting": true
    },
    "icon": "landmark",
    "requires": [
     "register.accounts",
     "register.transactions",
     "register.balances",
     "register.categories"
    ],
    "pack": "money-core",
    "filters": [
     {
      "field": "category",
      "control": "chips"
     },
     {
      "field": "month",
      "control": "segmented",
      "options": [
       {
        "value": "this",
        "label": "This month",
        "where": "on at least bom"
       },
       {
        "value": "last",
        "label": "Last month",
        "where": "on at least bom-1m, on before bom"
       },
       {
        "value": "older",
        "label": "Before that",
        "where": "on before bom-1m"
       }
      ]
     },
     {
      "field": "show",
      "control": "chips",
      "options": [
       {
        "value": "unfiled",
        "label": "Not filed yet",
        "where": "category is empty, parts is empty, transfer is false"
       },
       {
        "value": "moves",
        "label": "Between your accounts",
        "where": "transfer is true"
       },
       {
        "value": "in",
        "label": "Money in",
        "where": "direction is in, transfer is false, stays is not true"
       },
       {
        "value": "out",
        "label": "Money out",
        "where": "direction is out, transfer is false, stays is not true"
       }
      ]
     }
    ],
    "blocks": [
     {
      "kind": "cards",
      "lead": true,
      "span": 12,
      "source": "register.accounts",
      "where": "seq is {{seq}}",
      "columns": [
       {
        "field": "name",
        "as": "title"
       },
       {
        "field": "kind",
        "label": "Type",
        "as": "fact"
       },
       {
        "field": "last4",
        "label": "Digits",
        "as": "fact"
       },
       {
        "field": "book",
        "label": "Book",
        "as": "fact"
       },
       {
        "field": "as_of",
        "label": "Last confirmed",
        "as": "when"
       }
      ],
      "stale": {
       "field": "as_of",
       "after": "7d",
       "figure": "account-ages"
      },
      "limit": 1
     },
     {
      "kind": "stat",
      "heading": "Balance",
      "icon": "wallet",
      "span": 12,
      "cells": [
       {
        "metric": "account-now:{{name}}",
        "label": "The bank says"
       },
       {
        "metric": "account-lines:{{name}}",
        "label": "The lines add up to"
       }
      ]
     },
     {
      "kind": "stat",
      "heading": "Not in the ledger",
      "icon": "alert",
      "span": 12,
      "tone": "warn",
      "cells": [
       {
        "metric": "account-gap:{{name}}",
        "label": "Counted by the bank, with no line here",
        "note": "Missing from the Ledger"
       }
      ],
      "when": {
       "metric": "account-gap:{{name}}",
       "not": 0
      }
     },
     {
      "kind": "capture",
      "heading": "What it holds today",
      "icon": "check",
      "span": 12,
      "register": "balances",
      "where": "account is {{spoken}}"
     },
     {
      "kind": "series",
      "heading": "In and out, by month",
      "icon": "chart-column",
      "span": 12,
      "series": [
       {
        "metric": "account-in-by-month:{{spoken}}",
        "label": "Money in"
       },
       {
        "metric": "account-out-by-month:{{spoken}}",
        "label": "Money out",
        "dir": "out"
       }
      ],
      "back": 6,
      "net": true,
      "when": {
       "metric": "account-out-by-month:{{spoken}}",
       "empty": false
      },
      "empty": "Nothing moved."
     },
     {
      "kind": "table",
      "heading": "What moved",
      "icon": "receipt",
      "span": 12,
      "source": "register.transactions",
      "where": "account is {{spoken}}, state is not void",
      "columns": [
       {
        "field": "on",
        "label": "Date",
        "width": "11ch"
       },
       {
        "field": "payee",
        "or": "what",
        "label": "Who",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "category",
        "label": "For",
        "width": "minmax(10ch,16ch)"
       },
       {
        "field": "amount",
        "sign": {
         "field": "direction",
         "minus": "out"
        },
        "label": "Amount",
        "width": "15ch",
        "align": "end"
       },
       {
        "field": "balance_after",
        "label": "Bank says",
        "width": "15ch",
        "align": "end"
       }
      ],
      "order": [
       {
        "field": "on",
        "dir": "desc"
       }
      ],
      "limit": 50,
      "empty": "Nothing has moved yet."
     }
    ]
   },
   "page.money-accounts#0": {
    "page": "money-accounts",
    "title": "Accounts",
    "nav": {
     "section": "Money",
     "order": 11
    },
    "icon": "wallet",
    "requires": [
     "register.accounts",
     "register.balances",
     "register.transactions"
    ],
    "pack": "money-core",
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "body": "{{cash-now.apart}} in {{cash-by-account.groups}} account(s)."
     },
     {
      "kind": "stat",
      "heading": "All accounts",
      "icon": "landmark",
      "span": 12,
      "cells": [
       {
        "metric": "card-to-pay",
        "label": "To pay on the card"
       },
       {
        "metric": "cash-as-of",
        "label": "Oldest balance"
       },
       {
        "metric": "balances-stale",
        "label": "Older than a week"
       }
      ]
     },
     {
      "kind": "bar",
      "heading": "Balance",
      "icon": "wallet",
      "span": 6,
      "source": "metric.cash-by-account",
      "limit": 12,
      "when": {
       "metric": "cash-accounts",
       "gt": 0
      }
     },
     {
      "kind": "bar",
      "heading": "Ledger total",
      "icon": "receipt",
      "span": 6,
      "source": "metric.lines-by-account",
      "limit": 12,
      "when": {
       "metric": "cash-accounts",
       "gt": 0
      }
     },
     {
      "kind": "cards",
      "heading": "Your accounts",
      "icon": "landmark",
      "span": 12,
      "source": "register.accounts",
      "where": "state is not closed",
      "group": "kind",
      "columns": [
       {
        "field": "name",
        "as": "title"
       },
       {
        "field": "last4",
        "label": "Digits",
        "as": "fact"
       },
       {
        "field": "book",
        "label": "Book",
        "as": "fact"
       },
       {
        "field": "liquid",
        "label": "Counts as cash",
        "as": "fact"
       },
       {
        "field": "as_of",
        "label": "Last confirmed",
        "as": "when"
       }
      ],
      "order": [
       {
        "field": "seq",
        "dir": "asc"
       }
      ],
      "stale": {
       "field": "as_of",
       "after": "7d",
       "figure": "account-ages"
      },
      "empty": "No account yet."
     },
     {
      "kind": "capture",
      "heading": "Add an account",
      "icon": "plus",
      "span": 12,
      "register": "accounts"
     },
     {
      "kind": "section",
      "heading": "Closed",
      "icon": "archive",
      "span": 12,
      "fold": true
     },
     {
      "kind": "cards",
      "span": 12,
      "source": "register.accounts",
      "where": "state is closed",
      "columns": [
       {
        "field": "name",
        "as": "title"
       },
       {
        "field": "last4",
        "label": "Digits",
        "as": "fact"
       },
       {
        "field": "book",
        "label": "Book",
        "as": "fact"
       },
       {
        "field": "liquid",
        "label": "Counts as cash",
        "as": "fact"
       },
       {
        "field": "as_of",
        "label": "Last confirmed",
        "as": "when"
       }
      ],
      "order": [
       {
        "field": "seq",
        "dir": "asc"
       }
      ]
     }
    ]
   },
   "page.money-ledger#0": {
    "page": "money-ledger",
    "title": "Ledger",
    "nav": {
     "section": "Money",
     "order": 12
    },
    "icon": "receipt",
    "requires": [
     "register.transactions",
     "register.categories",
     "register.accounts"
    ],
    "pack": "money-core",
    "header": {
     "search": {
      "param": "q"
     }
    },
    "filters": [
     {
      "field": "account",
      "control": "chips"
     },
     {
      "field": "category",
      "control": "chips"
     },
     {
      "field": "month",
      "control": "segmented",
      "options": [
       {
        "value": "this",
        "label": "This month",
        "where": "on at least bom"
       },
       {
        "value": "last",
        "label": "Last month",
        "where": "on at least bom-1m, on before bom"
       },
       {
        "value": "older",
        "label": "Before that",
        "where": "on before bom-1m"
       }
      ]
     },
     {
      "field": "show",
      "control": "chips",
      "options": [
       {
        "value": "unfiled",
        "label": "Not filed yet",
        "where": "category is empty, parts is empty, transfer is false"
       },
       {
        "value": "moves",
        "label": "Between your accounts",
        "where": "transfer is true"
       },
       {
        "value": "in",
        "label": "Money in",
        "where": "direction is in, transfer is false, stays is not true"
       },
       {
        "value": "out",
        "label": "Money out",
        "where": "direction is out, transfer is false, stays is not true"
       }
      ]
     }
    ],
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "txn-uncategorised",
       "gt": 0
      },
      "body": "{{txn-uncategorised}} line(s) to file."
     },
     {
      "kind": "stat",
      "heading": "Last 30 days",
      "icon": "coins",
      "span": 12,
      "cells": [
       {
        "metric": "spent-30d",
        "label": "Out"
       },
       {
        "metric": "received-30d",
        "label": "In"
       },
       {
        "metric": "filed-for-you-30d",
        "label": "Filed for you"
       }
      ]
     },
     {
      "kind": "timeline",
      "heading": "Not filed yet",
      "icon": "inbox",
      "span": 12,
      "source": "register.transactions",
      "where": "state is not void, transfer is false, category is empty, parts is empty",
      "columns": [
       {
        "field": "on"
       },
       {
        "field": "payee",
        "or": "what"
       },
       {
        "field": "amount",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       },
       {
        "field": "category"
       },
       {
        "field": "account"
       },
       {
        "field": "category",
        "as": "chip"
       }
      ],
      "order": [
       {
        "field": "on",
        "dir": "desc"
       }
      ],
      "limit": 50,
      "when": {
       "metric": "txn-uncategorised",
       "gt": 0
      }
     },
     {
      "kind": "timeline",
      "heading": "Every line",
      "icon": "receipt",
      "span": 12,
      "source": "register.transactions",
      "where": "state is not void",
      "columns": [
       {
        "field": "on"
       },
       {
        "field": "payee",
        "or": "what"
       },
       {
        "field": "amount",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       },
       {
        "field": "category"
       },
       {
        "field": "account"
       },
       {
        "field": "category",
        "as": "chip"
       }
      ],
      "order": [
       {
        "field": "on",
        "dir": "desc"
       }
      ],
      "limit": 200,
      "empty": "No lines match."
     }
    ]
   },
   "page.money-budgets#0": {
    "page": "money-budgets",
    "title": "Budgets",
    "nav": {
     "section": "Money",
     "order": 13
    },
    "icon": "piggy-bank",
    "requires": [
     "register.categories",
     "register.transactions"
    ],
    "pack": "money-core",
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "budgets-set",
       "gt": 0
      },
      "body": "{{budgets-total}} a month across {{budgets-set}} categories."
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "budgets-set",
       "lt": 1
      },
      "body": "No budgets yet."
     },
     {
      "kind": "stat",
      "heading": "This month",
      "icon": "calendar",
      "span": 12,
      "cells": [
       {
        "metric": "spent-by-category-month",
        "label": "Spent so far"
       },
       {
        "metric": "spent-last-month",
        "label": "Last month"
       }
      ],
      "when": {
       "metric": "spent-by-category-month",
       "gt": 0
      }
     },
     {
      "kind": "note",
      "tone": "warn",
      "span": 12,
      "when": {
       "metric": "unfiled-month",
       "gt": 0
      },
      "body": "{{unfiled-spent-month}} this month has no category. [File them](/r/transactions?f=category:empty&f=parts:empty&f=direction:is:out&f=transfer:is:false&f=state:is:cleared&f=on:gte:bom)"
     },
     {
      "kind": "progress",
      "heading": "Each budget",
      "icon": "wallet",
      "span": 12,
      "when": {
       "metric": "budgets-set",
       "gt": 0
      },
      "source": "register.categories",
      "where": "state is live, direction is out, budget is set",
      "columns": [
       {
        "field": "name"
       },
       {
        "field": "budget"
       },
       {
        "field": "budget_alert"
       },
       {
        "field": "rollover"
       }
      ],
      "spent": "spent-by-category-month",
      "order": [
       {
        "field": "seq",
        "dir": "asc"
       }
      ],
      "limit": 30,
      "empty": "No budgets yet."
     },
     {
      "kind": "queue",
      "heading": "Offered budgets",
      "icon": "ask",
      "span": 12,
      "source": "governance.open",
      "where": "about is Budgets",
      "limit": 1,
      "when": {
       "metric": "questions-open:Budgets",
       "gt": 0
      }
     },
     {
      "kind": "bar",
      "heading": "Last month, by category",
      "icon": "chart-bar",
      "span": 12,
      "source": "metric.spent-by-category-last-month",
      "unset": "No category",
      "when": {
       "metric": "spent-last-month",
       "gt": 0
      },
      "empty": "Nothing spent last month."
     },
     {
      "kind": "table",
      "heading": "No budget yet",
      "icon": "tag",
      "span": 12,
      "source": "register.categories",
      "where": "state is live, direction is out, budget is empty",
      "columns": [
       {
        "field": "name",
        "label": "Category",
        "width": "minmax(14ch,1fr)"
       }
      ],
      "order": [
       {
        "field": "name",
        "dir": "asc"
       }
      ],
      "limit": 30,
      "when": {
       "metric": "budgets-unset",
       "gt": 0
      },
      "empty": "Every category has a budget."
     }
    ]
   },
   "page.money-coming#0": {
    "page": "money-coming",
    "title": "Coming up",
    "nav": {
     "section": "Money",
     "order": 14
    },
    "icon": "calendar-clock",
    "requires": [
     "register.accounts",
     "register.transactions",
     "register.recurring",
     "register.obligations",
     "register.installments"
    ],
    "pack": "money-core",
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "body": "Next 30 days: {{arriving-30d}} in, {{leaving-30d}} out."
     },
     {
      "kind": "stat",
      "heading": "Every month",
      "icon": "calendar",
      "span": 12,
      "cells": [
       {
        "metric": "every-month-in",
        "label": "In"
       },
       {
        "metric": "every-month-out",
        "label": "Out"
       },
       {
        "metric": "every-month-net",
        "label": "Left over"
       }
      ],
      "when": {
       "metric": "cash-accounts",
       "gt": 0
      }
     },
     {
      "kind": "todo",
      "heading": "Bills and invoices",
      "icon": "receipt",
      "span": 12,
      "source": "register.obligations",
      "where": "state is open or part, due before +61d",
      "columns": [
       {
        "field": "what"
       },
       {
        "field": "amount"
       },
       {
        "field": "due"
       },
       {
        "field": "party"
       }
      ],
      "order": [
       {
        "field": "due",
        "dir": "asc"
       }
      ],
      "limit": 12,
      "empty": "Nothing due in 60 days."
     },
     {
      "kind": "table",
      "heading": "This week",
      "icon": "calendar-days",
      "span": 12,
      "source": "deadlines",
      "horizon": 61,
      "where": "amount is set, day before bow+7d",
      "columns": [
       {
        "field": "title",
        "label": "What",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "day",
        "label": "When",
        "width": "14ch"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "16ch",
        "align": "end",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       }
      ],
      "limit": 20,
      "empty": "Nothing falls due this week."
     },
     {
      "kind": "table",
      "heading": "Next week",
      "icon": "calendar-days",
      "span": 12,
      "source": "deadlines",
      "horizon": 61,
      "where": "amount is set, day after bow+6d, day before bow+14d",
      "columns": [
       {
        "field": "title",
        "label": "What",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "day",
        "label": "When",
        "width": "14ch"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "16ch",
        "align": "end",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       }
      ],
      "limit": 20,
      "empty": "Nothing falls due next week."
     },
     {
      "kind": "table",
      "heading": "Later",
      "icon": "calendar-days",
      "span": 12,
      "source": "deadlines",
      "horizon": 61,
      "where": "amount is set, day after bow+13d",
      "columns": [
       {
        "field": "title",
        "label": "What",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "day",
        "label": "When",
        "width": "14ch"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "16ch",
        "align": "end",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       }
      ],
      "limit": 20,
      "empty": "Nothing else due in 60 days."
     },
     {
      "kind": "section",
      "heading": "Paused",
      "icon": "pause",
      "span": 12,
      "fold": true
     },
     {
      "kind": "table",
      "heading": "Paused lines",
      "icon": "refresh",
      "span": 12,
      "source": "register.recurring",
      "where": "state is paused",
      "columns": [
       {
        "field": "what",
        "label": "Description",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "every",
        "label": "Every",
        "width": "14ch"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "16ch",
        "align": "end"
       }
      ],
      "order": [
       {
        "field": "what",
        "dir": "asc"
       }
      ],
      "limit": 20,
      "empty": "Nothing paused."
     }
    ]
   },
   "page.money-reports#0": {
    "page": "money-reports",
    "title": "Reports",
    "nav": {
     "section": "Money",
     "order": 16
    },
    "icon": "chart-pie",
    "requires": [
     "register.transactions",
     "register.categories"
    ],
    "pack": "money-core",
    "filters": [
     {
      "field": "months",
      "control": "segmented",
      "options": [
       {
        "value": "this",
        "label": "This month",
        "where": "on at least bom"
       },
       {
        "value": "last",
        "label": "Last month",
        "where": "on at least bom-1m, on before bom"
       },
       {
        "value": "three",
        "label": "3 months",
        "where": "on at least bom-2m"
       },
       {
        "value": "year",
        "label": "12 months",
        "where": "on at least bom-11m"
       }
      ]
     }
    ],
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "out-by-month",
       "gt": 0
      },
      "body": "This month: {{received-month}} in, {{spent-by-category-month}} out, {{left-month}} left."
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "out-by-month",
       "lt": 1
      },
      "body": "Nothing has moved yet."
     },
     {
      "kind": "series",
      "heading": "In and out, by month",
      "icon": "chart-column",
      "span": 12,
      "series": [
       {
        "metric": "in-by-month",
        "label": "Money in"
       },
       {
        "metric": "out-by-month",
        "label": "Money out",
        "dir": "out"
       }
      ],
      "back": 12,
      "net": true,
      "when": {
       "metric": "out-by-month",
       "gt": 0
      },
      "empty": "Nothing moved."
     },
     {
      "kind": "stat",
      "heading": "Health",
      "icon": "heart-pulse",
      "span": 12,
      "cells": [
       {
        "metric": "kept-share-90d",
        "label": "Kept, 90 days"
       },
       {
        "metric": "spent-30d",
        "label": "Spent, 30 days"
       },
       {
        "metric": "received-30d",
        "label": "Came in, 30 days"
       },
       {
        "metric": "lasts-no-income",
        "label": "Lasts with no income"
       },
       {
        "metric": "cash-foreign-share",
        "label": "In other currencies"
       }
      ],
      "when": {
       "metric": "out-by-month",
       "gt": 0
      }
     },
     {
      "kind": "split",
      "heading": "Spending by category",
      "donut": true,
      "icon": "chart-pie",
      "span": 12,
      "source": "register.transactions",
      "where": "state is cleared, transfer is false, stays is not true, direction is out, on after -13m, on before +1d",
      "columns": [
       {
        "field": "category"
       },
       {
        "field": "amount"
       }
      ],
      "unset": "No category yet",
      "when": {
       "metric": "out-by-month",
       "gt": 0
      },
      "empty": "Nothing went out."
     },
     {
      "kind": "bar",
      "heading": "Paid most",
      "icon": "store",
      "span": 12,
      "source": "register.transactions",
      "where": "state is cleared, transfer is false, stays is not true, direction is out, on after -13m, on before +1d",
      "columns": [
       {
        "field": "payee"
       },
       {
        "field": "amount"
       }
      ],
      "unset": "No name yet",
      "limit": 10,
      "when": {
       "metric": "out-by-month",
       "gt": 0
      },
      "empty": "Nobody was paid."
     },
     {
      "kind": "bar",
      "heading": "Money in, by who paid",
      "icon": "hand-coins",
      "span": 12,
      "source": "register.transactions",
      "where": "state is cleared, transfer is false, stays is not true, direction is in, on after -13m, on before +1d",
      "columns": [
       {
        "field": "payee"
       },
       {
        "field": "amount"
       }
      ],
      "unset": "No name yet",
      "limit": 8,
      "when": {
       "metric": "in-by-month",
       "gt": 0
      },
      "empty": "Nothing came in."
     },
     {
      "kind": "section",
      "heading": "Against last month",
      "icon": "history",
      "span": 12,
      "fold": true,
      "when": {
       "metric": "spent-by-category-month",
       "gt": 0
      }
     },
     {
      "kind": "bar",
      "heading": "This month against last, by category",
      "icon": "chart-bar",
      "span": 12,
      "source": "metric.spent-vs-last-month",
      "unset": "No category",
      "when": {
       "metric": "spent-by-category-month",
       "gt": 0
      },
      "empty": "No categories yet."
     },
     {
      "kind": "section",
      "heading": "Where it went",
      "icon": "receipt",
      "span": 12,
      "fold": true,
      "when": {
       "metric": "cash-accounts",
       "gt": 0
      }
     },
     {
      "kind": "split",
      "heading": "This month, by category",
      "donut": true,
      "icon": "chart-pie",
      "span": 12,
      "source": "metric.spent-by-category-month",
      "unset": "No category yet",
      "when": {
       "metric": "spent-by-category-month",
       "gt": 0
      },
      "empty": "Nothing spent this month yet."
     },
     {
      "kind": "bar",
      "heading": "No category yet, by who was paid",
      "icon": "chart-bar",
      "span": 12,
      "source": "register.transactions",
      "where": "state is cleared, transfer is false, category is empty, parts is empty, on after -91d, direction is out",
      "columns": [
       {
        "field": "payee"
       },
       {
        "field": "amount"
       }
      ],
      "unset": "No name yet",
      "limit": 8,
      "when": {
       "metric": "txn-uncategorised",
       "gt": 0
      },
      "empty": "Everything paid out in the last 91 days has a category."
     }
    ]
   },
   "page.money-payees#0": {
    "page": "money-payees",
    "title": "Payees",
    "nav": {
     "section": "Money",
     "order": 17
    },
    "icon": "store",
    "requires": [
     "register.transactions",
     "register.filing_rules"
    ],
    "pack": "money-core",
    "filters": [
     {
      "field": "payee",
      "control": "chips"
     }
    ],
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "payees-paid-90d",
       "gt": 0
      },
      "body": "{{payees-paid-90d}} payee(s) paid in 90 days."
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "payees-paid-90d",
       "lt": 1
      },
      "body": "No payees paid in 90 days."
     },
     {
      "kind": "bar",
      "heading": "Paid most, 90 days",
      "icon": "store",
      "span": 12,
      "source": "register.transactions",
      "where": "state is cleared, transfer is false, stays is not true, on after -90d, on before +1d, direction is out",
      "columns": [
       {
        "field": "payee"
       },
       {
        "field": "amount"
       }
      ],
      "unset": "No name yet",
      "limit": 15,
      "empty": "Nobody paid in 90 days."
     },
     {
      "kind": "bar",
      "heading": "How often, 90 days",
      "icon": "repeat",
      "span": 12,
      "source": "metric.paid-times-by-payee-90d",
      "unset": "No name yet",
      "limit": 10,
      "when": {
       "metric": "payees-paid-90d",
       "gt": 0
      },
      "empty": "Nobody paid in 90 days."
     },
     {
      "kind": "split",
      "heading": "By category, 90 days",
      "donut": true,
      "icon": "chart-pie",
      "span": 12,
      "source": "register.transactions",
      "where": "state is cleared, transfer is false, stays is not true, on after -90d, on before +1d, direction is out",
      "columns": [
       {
        "field": "category"
       },
       {
        "field": "amount"
       }
      ],
      "unset": "No category yet",
      "empty": "Nothing out in 90 days."
     },
     {
      "kind": "timeline",
      "heading": "Last paid",
      "icon": "receipt",
      "span": 12,
      "source": "register.transactions",
      "where": "state is not void, transfer is false, stays is not true",
      "columns": [
       {
        "field": "on"
       },
       {
        "field": "payee",
        "or": "what"
       },
       {
        "field": "amount",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       },
       {
        "field": "category"
       },
       {
        "field": "account"
       },
       {
        "field": "category",
        "as": "chip"
       }
      ],
      "order": [
       {
        "field": "on",
        "dir": "desc"
       }
      ],
      "limit": 10,
      "empty": "Nothing has moved yet."
     },
     {
      "kind": "table",
      "heading": "Usual category",
      "icon": "tag",
      "span": 12,
      "source": "register.filing_rules",
      "where": "reads is payee, state is on",
      "columns": [
       {
        "field": "match",
        "label": "Payee",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "category",
        "label": "Category",
        "width": "minmax(10ch,18ch)"
       },
       {
        "field": "direction",
        "label": "Which way",
        "width": "12ch"
       }
      ],
      "order": [
       {
        "field": "match",
        "dir": "asc"
       }
      ],
      "limit": 60,
      "empty": "No usual categories yet."
     },
     {
      "kind": "section",
      "heading": "Money in",
      "icon": "hand-coins",
      "span": 12,
      "fold": true,
      "when": {
       "metric": "received-30d",
       "gt": 0
      }
     },
     {
      "kind": "bar",
      "heading": "Who paid in, 90 days",
      "icon": "hand-coins",
      "span": 12,
      "source": "register.transactions",
      "where": "state is cleared, transfer is false, stays is not true, on after -90d, on before +1d, direction is in",
      "columns": [
       {
        "field": "payee"
       },
       {
        "field": "amount"
       }
      ],
      "unset": "No name yet",
      "limit": 10,
      "empty": "Nothing in for 90 days."
     }
    ]
   },
   "metric.arriving-30d#0": {
    "metric": "arriving-30d",
    "name": "Coming in, 30 days",
    "pack": "money-core",
    "source": "forecast.runway",
    "legs": [
     {
      "register": "obligations",
      "on": "due",
      "amount": "amount",
      "where": "state is open or part, repeats is not monthly or quarterly or yearly",
      "incoming": {
       "field": "direction",
       "is": "owed_to_me"
      }
     },
     {
      "register": "recurring",
      "on": "next_due",
      "amount": "amount",
      "where": "state is live",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "every": {
       "field": "every",
       "months": {
        "monthly": 1,
        "quarterly": 3,
        "yearly": 12
       },
       "weeks": {
        "weekly": 1,
        "fortnightly": 2
       },
       "twice": {
        "twice_monthly": [
         1,
         15
        ]
       }
      },
      "ends": "ends",
      "days": "day_of_month",
      "weekend": "weekend"
     },
     {
      "register": "installments",
      "on": "due",
      "amount": "amount",
      "where": "state is open",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "group": "plan"
     },
     {
      "register": "accounts",
      "on": "arrives",
      "amount": "balance",
      "where": "liquid is false, arrives is set, kind is bank",
      "incoming": {
       "field": "kind",
       "is": "bank"
      }
     },
     {
      "register": "transactions",
      "on": "on",
      "amount": "amount",
      "where": "state is cleared, transfer is false, stays is not true",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "everyday": {
       "months": 3
      }
     }
    ],
    "value": {
     "walk": "in",
     "within": "30d"
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none",
    "snapshot": {
     "grain": "day",
     "into": "series.arriving-30d"
    }
   },
   "metric.leaving-30d#0": {
    "metric": "leaving-30d",
    "name": "Going out, 30 days",
    "pack": "money-core",
    "source": "forecast.runway",
    "legs": [
     {
      "register": "obligations",
      "on": "due",
      "amount": "amount",
      "where": "state is open or part, repeats is not monthly or quarterly or yearly",
      "incoming": {
       "field": "direction",
       "is": "owed_to_me"
      }
     },
     {
      "register": "recurring",
      "on": "next_due",
      "amount": "amount",
      "where": "state is live",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "every": {
       "field": "every",
       "months": {
        "monthly": 1,
        "quarterly": 3,
        "yearly": 12
       },
       "weeks": {
        "weekly": 1,
        "fortnightly": 2
       },
       "twice": {
        "twice_monthly": [
         1,
         15
        ]
       }
      },
      "ends": "ends",
      "days": "day_of_month",
      "weekend": "weekend"
     },
     {
      "register": "installments",
      "on": "due",
      "amount": "amount",
      "where": "state is open",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "group": "plan"
     },
     {
      "register": "accounts",
      "on": "arrives",
      "amount": "balance",
      "where": "liquid is false, arrives is set, kind is bank",
      "incoming": {
       "field": "kind",
       "is": "bank"
      }
     },
     {
      "register": "transactions",
      "on": "on",
      "amount": "amount",
      "where": "state is cleared, transfer is false, stays is not true",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "everyday": {
       "months": 3
      }
     }
    ],
    "value": {
     "walk": "out",
     "within": "30d"
    },
    "format": "money",
    "target": {
     "setting": "most_leaving_30d"
    },
    "window": "30d",
    "compare": "none",
    "snapshot": {
     "grain": "day",
     "into": "series.leaving-30d"
    }
   },
   "metric.every-month-out#0": {
    "metric": "every-month-out",
    "name": "Every month",
    "source": "register.recurring",
    "where": {
     "all": [
      {
       "field": "state",
       "is": "live"
      },
      {
       "field": "direction",
       "is": "out"
      },
      {
       "any": [
        {
         "field": "ends",
         "empty": true
        },
        {
         "field": "ends",
         "after": "yesterday"
        }
       ]
      }
     ]
    },
    "value": {
     "sum": {
      "product": [
       "amount",
       {
        "lookup": "per_month",
        "by": "every"
       }
      ]
     }
    },
    "lookups": {
     "per_month": {
      "weekly": 4.333333333333333,
      "fortnightly": 2.1666666666666665,
      "twice_monthly": 2,
      "monthly": 1,
      "quarterly": 0.3333333333333333,
      "yearly": 0.08333333333333333
     }
    },
    "format": "money",
    "target": {
     "setting": "most_out_every_month"
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.every-month-in#0": {
    "metric": "every-month-in",
    "name": "Every month, in",
    "source": "register.recurring",
    "where": {
     "all": [
      {
       "field": "state",
       "is": "live"
      },
      {
       "field": "direction",
       "is": "in"
      },
      {
       "any": [
        {
         "field": "ends",
         "empty": true
        },
        {
         "field": "ends",
         "after": "yesterday"
        }
       ]
      }
     ]
    },
    "value": {
     "sum": {
      "product": [
       "amount",
       {
        "lookup": "per_month",
        "by": "every"
       }
      ]
     }
    },
    "lookups": {
     "per_month": {
      "weekly": 4.333333333333333,
      "fortnightly": 2.1666666666666665,
      "twice_monthly": 2,
      "monthly": 1,
      "quarterly": 0.3333333333333333,
      "yearly": 0.08333333333333333
     }
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.every-month-net#0": {
    "metric": "every-month-net",
    "name": "Every month, left over",
    "source": "register.recurring",
    "value": {
     "sum_of": [
      {
       "metric": "every-month-in"
      },
      {
       "metric": "every-month-out",
       "minus": true
      }
     ]
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.every-month-by-category#0": {
    "metric": "every-month-by-category",
    "name": "Every month, by category",
    "source": "register.recurring",
    "where": {
     "all": [
      {
       "field": "state",
       "is": "live"
      },
      {
       "field": "direction",
       "is": "out"
      },
      {
       "any": [
        {
         "field": "ends",
         "empty": true
        },
        {
         "field": "ends",
         "after": "yesterday"
        }
       ]
      }
     ]
    },
    "value": {
     "sum": {
      "product": [
       "amount",
       {
        "lookup": "per_month",
        "by": "every"
       }
      ]
     }
    },
    "lookups": {
     "per_month": {
      "weekly": 4.333333333333333,
      "fortnightly": 2.1666666666666665,
      "twice_monthly": 2,
      "monthly": 1,
      "quarterly": 0.3333333333333333,
      "yearly": 0.08333333333333333
     }
    },
    "group_by": "category",
    "format": "money",
    "target": {
     "setting": "most_on_one_category"
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.spent-30d#0": {
    "metric": "spent-30d",
    "name": "Spent, 30 days",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on after -30d",
    "value": {
     "sum": "amount"
    },
    "format": "money",
    "target": {
     "setting": "most_spent_30d"
    },
    "window": "30d",
    "compare": "previous"
   },
   "metric.received-30d#0": {
    "metric": "received-30d",
    "name": "Received, 30 days",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is in, on after -30d",
    "value": {
     "sum": "amount"
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "previous"
   },
   "metric.received-7d#0": {
    "metric": "received-7d",
    "name": "Received, 7 days",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is in, settles is empty, on after -7d, on before +1d",
    "value": {
     "sum": "amount"
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "7d",
    "compare": "none"
   },
   "metric.txn-uncategorised#0": {
    "metric": "txn-uncategorised",
    "name": "Without a category",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, category is empty, parts is empty, on after -91d",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "lte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.budgets-total#0": {
    "metric": "budgets-total",
    "name": "Budgeted a month",
    "source": "register.categories",
    "where": "state is live, direction is out, budget is set",
    "value": {
     "sum": "budget"
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "register.categories#1": {
    "rule": "budget-near",
    "pack": "money-core",
    "register": "categories",
    "when": "budget_warned is near, warned_month is set",
    "then": [
     {
      "notify": {
       "say": "{{name}} is past {{budget_alert}}% of its {{money:budget}} budget this month."
      }
     }
    ],
    "once_per": [
     "entry",
     "warned_month"
    ]
   },
   "register.categories#2": {
    "rule": "budget-over",
    "pack": "money-core",
    "register": "categories",
    "when": "budget_warned is over, warned_month is set",
    "then": [
     {
      "notify": {
       "say": "{{name}} is over its {{money:budget}} budget this month."
      }
     }
    ],
    "once_per": [
     "entry",
     "warned_month"
    ]
   },
   "script.match_payment#0": {
    "script": "match_payment",
    "title": "Find what a payment paid",
    "pack": "money-core",
    "runs": {
     "rule": true
    },
    "egress": [],
    "keys": [],
    "reads": [
     "obligations",
     "installments",
     "recurring",
     "transactions"
    ],
    "writes": [
     "installments",
     "transactions"
    ],
    "source": "function matchPayment(payment, items, opts) {\n  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];\n  /* THE CURRENCIES WHOSE MINOR UNIT IS NOT A HUNDREDTH, for the words of a question only, as in `settle.js`. */\n  const PLACES = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3 };\n  const NONE = 'None of these';\n  /* HOW FAR APART THE TWO DAYS MAY BE, and how many things one question offers: the nearest, never a page of them. */\n  const DAYS = 10;\n  const MOST = 6;\n  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);\n  const words = (m) => {\n    const places = PLACES[m.currency] ?? 2;\n    const digits = String(Math.abs(m.amount)).padStart(places + 1, '0');\n    const whole = digits.slice(0, digits.length - places).replace(/\\B(?=(\\d{3})+$)/g, ',');\n    const rest = places === 0 ? '' : digits.slice(-places);\n    return `${m.currency} ${m.amount < 0 ? '-' : ''}${whole}${/^0*$/.test(rest) ? '' : `.${rest}`}`;\n  };\n  const dayOf = (d) => (typeof d === 'string' ? /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(d) : null);\n  const dayWords = (d) => {\n    const m = dayOf(d);\n    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(d);\n  };\n  /* WHOLE DAYS BETWEEN TWO DAYS, counted on the calendar and never on a clock, so no zone moves the tenth day. */\n  const apart = (a, b) => {\n    const [x, y] = [dayOf(a), dayOf(b)];\n    if (!x || !y) return null;\n    return Math.abs(Date.UTC(Number(x[1]), Number(x[2]) - 1, Number(x[3])) - Date.UTC(Number(y[1]), Number(y[2]) - 1, Number(y[3]))) / 86_400_000;\n  };\n  /* MORE THAN 2% OFF, in whole minor units: no division, so no rounding decides whether a person is asked. */\n  const off = (paid, expected) => Math.abs(paid - expected) * 100 > Math.abs(expected) * 2;\n  const plain = (text) => text.toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, '') || null;\n  const fold = opts && typeof opts.fold === 'function' ? opts.fold : plain;\n  const keysOf = (texts) => {\n    const keys = [];\n    for (const text of texts) {\n      const key = typeof text === 'string' && text.trim() !== '' ? fold(text) : null;\n      if (typeof key === 'string' && key !== '' && !keys.includes(key)) keys.push(key);\n    }\n    return keys;\n  };\n\n  const p = payment.fields;\n  const paid = moneyOf(p.amount);\n  const on = typeof p.on === 'string' && dayOf(p.on) ? p.on : '';\n  if (!paid || !on) return { nothing: 'The payment has no amount or no day, so nothing was looked for.' };\n  if (p.state !== 'cleared') return { nothing: 'The payment has not cleared, so nothing was looked for.' };\n  if (typeof p.settles === 'string' && p.settles !== '') return { nothing: 'The payment already settles a bill, so nothing else was looked for.' };\n  if (items.some((i) => i.list === 'installments' && i.fields.paid_by === payment.id)) return { nothing: 'An instalment already names this payment, so nothing else was looked for.' };\n  /* WHO IT WAS PAID TO OR FROM: the name a person gave, the bank's words, and the description, each folded. */\n  const mine = keysOf([p.payee, p.counterparty_text, p.what]);\n  if (mine.length === 0) return { nothing: 'The payment names nobody, so nothing was looked for.' };\n  const who = [p.payee, p.counterparty_text, p.what].find((t) => typeof t === 'string' && t.trim() !== '').trim();\n  /* MONEY IN CAME FROM SOMEBODY, and is never said as paid to them. */\n  const whom = `${p.direction === 'in' ? 'from' : 'to'} ${who}`;\n\n  const found = [];\n  for (const item of items) {\n    const f = item.fields;\n    const bill = item.list === 'obligations';\n    const line = item.list === 'recurring';\n    if (!bill && !line && item.list !== 'installments') continue;\n    if (bill ? f.state !== 'open' && f.state !== 'part' : f.state !== (line ? 'live' : 'open')) continue;\n    const way = bill ? { owed_by_me: 'out', owed_to_me: 'in' }[f.direction] : f.direction;\n    if (!way || way !== p.direction) continue;\n    const due = moneyOf(f.amount);\n    if (!due || due.currency !== paid.currency) continue;\n    const day = line ? f.next_due : f.due;\n    const gap = apart(on, day);\n    if (gap === null || gap > DAYS) continue;\n    /* A LINE THAT ALREADY COUNTS A PAYMENT ON OR AFTER THIS DAY has been paid by it or by a later one (`settle`). */\n    if (line && typeof f.last_paid === 'string' && on <= f.last_paid) continue;\n    if (!keysOf(bill || line ? [f.what] : [f.what, f.plan]).some((k) => mine.includes(k))) continue;\n    const held = bill ? moneyOf(f.paid_so_far) : null;\n    const left = held && held.currency === due.currency && held.amount > 0 && held.amount < due.amount ? due.amount - held.amount : due.amount;\n    const name = String(f.what ?? '').trim() || 'This';\n    const kind = bill ? (way === 'in' ? 'an invoice of' : 'a bill of') : 'an instalment of';\n    const some = left === due.amount ? '' : ` with ${words({ amount: left, currency: due.currency })} left,`;\n    const label = line ? `${name}, repeating at ${words(due)}, next ${dayWords(day)}` : `${name}, ${kind} ${words(due)}${some} due ${dayWords(day)}`;\n    /* THE LINK, AND NOTHING ELSE: where it lives on the payment or on the instalment, at the version read. */\n    const writes = bill\n      ? [{ id: payment.spoken, version: payment.version, fields: { settles: item.id } }]\n      : line\n        ? []\n        : [{ id: item.spoken, version: item.version, fields: { paid_by: payment.id } }];\n    const expected = { amount: left, currency: due.currency };\n    found.push({ item, name, day, gap, label, writes, agrees: !off(paid.amount, left), expected });\n  }\n  /* A BILL AND A REPEATING LINE UNDER ONE NAME ARE THE SAME MONEY TWICE (B6 of 24 October): the bill takes the payment,\n     and the bill being paid asks to move the line on (`move-line.js`), so the line is no second answer here. */\n  const billKeys = found.filter((c) => c.item.list === 'obligations').flatMap((c) => keysOf([c.item.fields.what]));\n  for (let i = found.length - 1; i >= 0; i--) if (found[i].item.list === 'recurring' && keysOf([found[i].item.fields.what]).some((k) => billKeys.includes(k))) found.splice(i, 1);\n  if (found.length === 0) return { nothing: `Nothing open ${whom} falls within ten days of ${dayWords(on)}, so the ${words(paid)} was left as it is.` };\n\n  /* THE SAME MONEY FIRST, THEN THE NEAREST DAY, and a label said twice is numbered so each answer is its own. */\n  found.sort((a, b) => Number(b.agrees) - Number(a.agrees) || a.gap - b.gap);\n  const offered = found.slice(0, MOST);\n  const seen = {};\n  for (const c of offered) {\n    seen[c.label] = (seen[c.label] ?? 0) + 1;\n    if (seen[c.label] > 1) c.label = `${c.label} (${seen[c.label]})`;\n  }\n  const linkOf = (c) => ({ link: { list: c.item.list, item: c.item.spoken, id: c.item.id }, writes: c.writes, said: `This payment is for ${c.name}, due ${dayWords(c.day)}.` });\n\n  /* AN ANSWER PICKED IS THE LINK, by its words or its handle; \"None of these\" and words nobody offered link nothing. */\n  if (opts && typeof opts.answer === 'string') {\n    const picked = offered.find((c) => c.label === opts.answer || c.item.spoken.replace('#', '-') === opts.answer);\n    return picked ? linkOf(picked) : { nothing: `The payment ${whom} was left as it is, linked to nothing.` };\n  }\n  if (found.length === 1 && found[0].agrees) return linkOf(found[0]);\n\n  const question = p.direction === 'in' ? `Which of these was the ${words(paid)} from ${who} on ${dayWords(on)} for?` : `Which of these did the ${words(paid)} to ${who} on ${dayWords(on)} pay?`;\n  const options = offered.map((c) => ({\n    id: c.item.spoken.replace('#', '-'),\n    label: c.label,\n    because: c.agrees ? 'The amount agrees, and its amount stays as written.' : `It expects ${words(c.expected)} and this was ${words(paid)}. Its amount stays as written.`,\n    ...(c.writes.length > 0 ? { patches: c.writes } : {}),\n  }));\n  options.push({ id: 'none', label: NONE, because: 'Nothing is linked, and the payment stays as it is.' });\n  return { ask: { cause: `money.match.${payment.spoken}`, question, about: who, options } };\n}\nexport default async function run(ctx) {\n  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};\n  const named = async (said) => {\n    if (typeof said !== 'string' || said === '') return null;\n    if (/^transactions#\\d+$/.test(said)) return said;\n    if (!/^[0-9A-Za-z_-]+$/.test(said)) return null;\n    const row = await ctx.record.get(said);\n    return row && row.register === 'transactions' && Number.isSafeInteger(row.seq) ? `transactions#${row.seq}` : null;\n  };\n  const at = (await named(input.payment)) ?? (input.register === 'transactions' && Number.isSafeInteger(input.seq) ? `transactions#${input.seq}` : null);\n  if (!at) {\n    ctx.log('The script was handed no payment, so nothing was looked for.');\n    return null;\n  }\n  const paymentRow = await ctx.record.get(at);\n  if (!paymentRow) {\n    ctx.log('The payment is no longer in the record, so nothing was looked for.');\n    return null;\n  }\n  const payment = { list: 'transactions', id: paymentRow.id, spoken: at, version: paymentRow.version, fields: paymentRow.fields };\n  const way = payment.fields.direction;\n  if (way !== 'in' && way !== 'out') {\n    ctx.log('The payment does not say which way the money went, so nothing was looked for.');\n    return null;\n  }\n\n  /* THE DECISION'S TEN DAYS AND THE RECORD'S PAGE, said again here because `run` reads nothing of `matchPayment`'s. */\n  const DAYS = 10;\n  const PAGE = 50;\n  const at0 = typeof payment.fields.on === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(payment.fields.on) ? Date.parse(`${payment.fields.on}T00:00:00Z`) : NaN;\n  const dayFrom = (n) => new Date(at0 + n * 86_400_000).toISOString().slice(0, 10);\n  const shaped = (list) => (r) => ({ list, id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });\n  let full = false;\n  const open = async (list, state, direction, day) => {\n    const rows = await ctx.record.list(list, { all: [state, { field: 'direction', is: direction }, { field: day, between: [dayFrom(-DAYS), dayFrom(DAYS)] }] });\n    if (rows.length >= PAGE) full = true;\n    return rows.map(shaped(list));\n  };\n  /* A PAYMENT WITH NO DAY READS NOTHING: the decision says why, and there is no window to ask the lists for. */\n  const items = Number.isNaN(at0)\n    ? []\n    : [\n        ...(await open('obligations', { field: 'state', in: ['open', 'part'] }, way === 'out' ? 'owed_by_me' : 'owed_to_me', 'due')),\n        ...(await open('installments', { field: 'state', is: 'open' }, way, 'due')),\n        ...(await open('recurring', { field: 'state', is: 'live' }, way, 'next_due')),\n      ];\n  if (full) ctx.log('Fifty or more things are open within ten days of this payment, so it may have been compared with only some of them.');\n  /* AN INSTALMENT THAT ALREADY NAMES THIS PAYMENT is paid, so it is not among the open ones: it is asked for by name. A\n     host that refuses the question leaves the check to the link itself, which a paid instalment no longer takes. */\n  try {\n    items.push(...(await ctx.record.list('installments', { field: 'paid_by', is: payment.id })).map(shaped('installments')));\n  } catch {\n    /* nothing to add */\n  }\n\n  const opts = {};\n  if (typeof input.answer === 'string') opts.answer = input.answer;\n  if (typeof ctx.fold === 'function') {\n    const keys = new Map();\n    const texts = [payment.fields.payee, payment.fields.counterparty_text, payment.fields.what, ...items.flatMap((i) => [i.fields.what, i.fields.plan])];\n    /* A HOST THAT REFUSES A FOLD (it answers only so many a run) leaves the whole compare plain, as a host that hands\n       none does: keys for some names and not for others would be two ideas of a payee in one decision. It is said. */\n    try {\n      for (const text of texts) if (typeof text === 'string' && !keys.has(text)) keys.set(text, await ctx.fold(text));\n      opts.fold = (text) => keys.get(text) ?? null;\n    } catch {\n      ctx.log('The names were compared by their letters and digits for this payment, since the fuller compare could not be finished.');\n    }\n  }\n\n  const out = matchPayment(payment, items, opts);\n  if (out.nothing) {\n    ctx.log(out.nothing);\n    return null;\n  }\n  /* NO QUESTION WITH AN ANSWER THAT DOES NOTHING, WHERE THE CALLER SAYS SO (`input.asks: 'linked'`, as Money's rule\n     does). An answer that names a repeating line carries no link, and nothing runs on an answer picked yet, so picking\n     it would change nothing. The payment is left as it is and the run says why. */\n  if (out.ask && input.asks === 'linked' && out.ask.options.some((o) => o.id !== 'none' && !(Array.isArray(o.patches) && o.patches.length > 0))) {\n    ctx.log('More than one thing fits this payment and one of them is a repeating line, which an answer cannot link yet, so nothing was asked.');\n    return null;\n  }\n  if (out.ask) return { ask: out.ask };\n  for (const w of out.writes) ctx.update(w.id, w.fields, w.version);\n  ctx.log(out.said);\n  return { matched: out.link.item, item: out.link.id, list: out.link.list };\n}"
   },
   "script.settle_matched_line#0": {
    "script": "settle_matched_line",
    "title": "Mark a repeating line paid by its payment",
    "pack": "money-core",
    "runs": {
     "rule": true
    },
    "egress": [],
    "keys": [],
    "reads": [
     "obligations",
     "installments",
     "recurring",
     "transactions"
    ],
    "writes": [
     "obligations",
     "recurring",
     "transactions"
    ],
    "source": "function matchPayment(payment, items, opts) {\n  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];\n  /* THE CURRENCIES WHOSE MINOR UNIT IS NOT A HUNDREDTH, for the words of a question only, as in `settle.js`. */\n  const PLACES = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3 };\n  const NONE = 'None of these';\n  /* HOW FAR APART THE TWO DAYS MAY BE, and how many things one question offers: the nearest, never a page of them. */\n  const DAYS = 10;\n  const MOST = 6;\n  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);\n  const words = (m) => {\n    const places = PLACES[m.currency] ?? 2;\n    const digits = String(Math.abs(m.amount)).padStart(places + 1, '0');\n    const whole = digits.slice(0, digits.length - places).replace(/\\B(?=(\\d{3})+$)/g, ',');\n    const rest = places === 0 ? '' : digits.slice(-places);\n    return `${m.currency} ${m.amount < 0 ? '-' : ''}${whole}${/^0*$/.test(rest) ? '' : `.${rest}`}`;\n  };\n  const dayOf = (d) => (typeof d === 'string' ? /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(d) : null);\n  const dayWords = (d) => {\n    const m = dayOf(d);\n    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(d);\n  };\n  /* WHOLE DAYS BETWEEN TWO DAYS, counted on the calendar and never on a clock, so no zone moves the tenth day. */\n  const apart = (a, b) => {\n    const [x, y] = [dayOf(a), dayOf(b)];\n    if (!x || !y) return null;\n    return Math.abs(Date.UTC(Number(x[1]), Number(x[2]) - 1, Number(x[3])) - Date.UTC(Number(y[1]), Number(y[2]) - 1, Number(y[3]))) / 86_400_000;\n  };\n  /* MORE THAN 2% OFF, in whole minor units: no division, so no rounding decides whether a person is asked. */\n  const off = (paid, expected) => Math.abs(paid - expected) * 100 > Math.abs(expected) * 2;\n  const plain = (text) => text.toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, '') || null;\n  const fold = opts && typeof opts.fold === 'function' ? opts.fold : plain;\n  const keysOf = (texts) => {\n    const keys = [];\n    for (const text of texts) {\n      const key = typeof text === 'string' && text.trim() !== '' ? fold(text) : null;\n      if (typeof key === 'string' && key !== '' && !keys.includes(key)) keys.push(key);\n    }\n    return keys;\n  };\n\n  const p = payment.fields;\n  const paid = moneyOf(p.amount);\n  const on = typeof p.on === 'string' && dayOf(p.on) ? p.on : '';\n  if (!paid || !on) return { nothing: 'The payment has no amount or no day, so nothing was looked for.' };\n  if (p.state !== 'cleared') return { nothing: 'The payment has not cleared, so nothing was looked for.' };\n  if (typeof p.settles === 'string' && p.settles !== '') return { nothing: 'The payment already settles a bill, so nothing else was looked for.' };\n  if (items.some((i) => i.list === 'installments' && i.fields.paid_by === payment.id)) return { nothing: 'An instalment already names this payment, so nothing else was looked for.' };\n  /* WHO IT WAS PAID TO OR FROM: the name a person gave, the bank's words, and the description, each folded. */\n  const mine = keysOf([p.payee, p.counterparty_text, p.what]);\n  if (mine.length === 0) return { nothing: 'The payment names nobody, so nothing was looked for.' };\n  const who = [p.payee, p.counterparty_text, p.what].find((t) => typeof t === 'string' && t.trim() !== '').trim();\n  /* MONEY IN CAME FROM SOMEBODY, and is never said as paid to them. */\n  const whom = `${p.direction === 'in' ? 'from' : 'to'} ${who}`;\n\n  const found = [];\n  for (const item of items) {\n    const f = item.fields;\n    const bill = item.list === 'obligations';\n    const line = item.list === 'recurring';\n    if (!bill && !line && item.list !== 'installments') continue;\n    if (bill ? f.state !== 'open' && f.state !== 'part' : f.state !== (line ? 'live' : 'open')) continue;\n    const way = bill ? { owed_by_me: 'out', owed_to_me: 'in' }[f.direction] : f.direction;\n    if (!way || way !== p.direction) continue;\n    const due = moneyOf(f.amount);\n    if (!due || due.currency !== paid.currency) continue;\n    const day = line ? f.next_due : f.due;\n    const gap = apart(on, day);\n    if (gap === null || gap > DAYS) continue;\n    /* A LINE THAT ALREADY COUNTS A PAYMENT ON OR AFTER THIS DAY has been paid by it or by a later one (`settle`). */\n    if (line && typeof f.last_paid === 'string' && on <= f.last_paid) continue;\n    if (!keysOf(bill || line ? [f.what] : [f.what, f.plan]).some((k) => mine.includes(k))) continue;\n    const held = bill ? moneyOf(f.paid_so_far) : null;\n    const left = held && held.currency === due.currency && held.amount > 0 && held.amount < due.amount ? due.amount - held.amount : due.amount;\n    const name = String(f.what ?? '').trim() || 'This';\n    const kind = bill ? (way === 'in' ? 'an invoice of' : 'a bill of') : 'an instalment of';\n    const some = left === due.amount ? '' : ` with ${words({ amount: left, currency: due.currency })} left,`;\n    const label = line ? `${name}, repeating at ${words(due)}, next ${dayWords(day)}` : `${name}, ${kind} ${words(due)}${some} due ${dayWords(day)}`;\n    /* THE LINK, AND NOTHING ELSE: where it lives on the payment or on the instalment, at the version read. */\n    const writes = bill\n      ? [{ id: payment.spoken, version: payment.version, fields: { settles: item.id } }]\n      : line\n        ? []\n        : [{ id: item.spoken, version: item.version, fields: { paid_by: payment.id } }];\n    const expected = { amount: left, currency: due.currency };\n    found.push({ item, name, day, gap, label, writes, agrees: !off(paid.amount, left), expected });\n  }\n  /* A BILL AND A REPEATING LINE UNDER ONE NAME ARE THE SAME MONEY TWICE (B6 of 24 October): the bill takes the payment,\n     and the bill being paid asks to move the line on (`move-line.js`), so the line is no second answer here. */\n  const billKeys = found.filter((c) => c.item.list === 'obligations').flatMap((c) => keysOf([c.item.fields.what]));\n  for (let i = found.length - 1; i >= 0; i--) if (found[i].item.list === 'recurring' && keysOf([found[i].item.fields.what]).some((k) => billKeys.includes(k))) found.splice(i, 1);\n  if (found.length === 0) return { nothing: `Nothing open ${whom} falls within ten days of ${dayWords(on)}, so the ${words(paid)} was left as it is.` };\n\n  /* THE SAME MONEY FIRST, THEN THE NEAREST DAY, and a label said twice is numbered so each answer is its own. */\n  found.sort((a, b) => Number(b.agrees) - Number(a.agrees) || a.gap - b.gap);\n  const offered = found.slice(0, MOST);\n  const seen = {};\n  for (const c of offered) {\n    seen[c.label] = (seen[c.label] ?? 0) + 1;\n    if (seen[c.label] > 1) c.label = `${c.label} (${seen[c.label]})`;\n  }\n  const linkOf = (c) => ({ link: { list: c.item.list, item: c.item.spoken, id: c.item.id }, writes: c.writes, said: `This payment is for ${c.name}, due ${dayWords(c.day)}.` });\n\n  /* AN ANSWER PICKED IS THE LINK, by its words or its handle; \"None of these\" and words nobody offered link nothing. */\n  if (opts && typeof opts.answer === 'string') {\n    const picked = offered.find((c) => c.label === opts.answer || c.item.spoken.replace('#', '-') === opts.answer);\n    return picked ? linkOf(picked) : { nothing: `The payment ${whom} was left as it is, linked to nothing.` };\n  }\n  if (found.length === 1 && found[0].agrees) return linkOf(found[0]);\n\n  const question = p.direction === 'in' ? `Which of these was the ${words(paid)} from ${who} on ${dayWords(on)} for?` : `Which of these did the ${words(paid)} to ${who} on ${dayWords(on)} pay?`;\n  const options = offered.map((c) => ({\n    id: c.item.spoken.replace('#', '-'),\n    label: c.label,\n    because: c.agrees ? 'The amount agrees, and its amount stays as written.' : `It expects ${words(c.expected)} and this was ${words(paid)}. Its amount stays as written.`,\n    ...(c.writes.length > 0 ? { patches: c.writes } : {}),\n  }));\n  options.push({ id: 'none', label: NONE, because: 'Nothing is linked, and the payment stays as it is.' });\n  return { ask: { cause: `money.match.${payment.spoken}`, question, about: who, options } };\n}\nconst settle = function settle(item, payment, opts) {\n  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];\n  /* THE CURRENCIES WHOSE MINOR UNIT IS NOT A HUNDREDTH, for the words of a question only: no figure is computed from\n     this table, and a code it does not hold reads to two places, as most do. */\n  const PLACES = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3 };\n  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);\n  const words = (m) => {\n    const places = PLACES[m.currency] ?? 2;\n    const digits = String(Math.abs(m.amount)).padStart(places + 1, '0');\n    const whole = digits.slice(0, digits.length - places).replace(/\\B(?=(\\d{3})+$)/g, ',');\n    const rest = places === 0 ? '' : digits.slice(-places);\n    return `${m.currency} ${m.amount < 0 ? '-' : ''}${whole}${/^0*$/.test(rest) ? '' : `.${rest}`}`;\n  };\n  const dayWords = (d) => {\n    const m = typeof d === 'string' ? /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(d) : null;\n    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(d);\n  };\n  /* MORE THAN 2% OFF, in whole minor units: no division, so no rounding decides whether a person is asked. */\n  const off = (paid, expected) => Math.abs(paid - expected) * 100 > Math.abs(expected) * 2;\n\n  const f = item.fields;\n  const name = String(f.what ?? '').trim() || 'This';\n  /* \"IT WENT THROUGH\", PRESSED ON A REPEATING LINE PAST ITS DAY (`recurring-went-through` in `../rules.ts`), with no\n     payment: a person says the money moved, and nothing says how much or on what day. So \"Next\" moves one cycle on, by\n     the same rule as a payment's (a day, later than the one the line names), and nothing else is written: \"Last paid\"\n     and \"Last amount\" are what a payment showed, and none did. */\n  if (opts && opts.told) {\n    if (item.list !== 'recurring') return { nothing: `${name} is not a repeating line, so nothing moved.` };\n    if (f.state !== 'live') return { nothing: `${name} is not live, so nothing moved.` };\n    /* A LINE NO LONGER PAST ITS DAY WAS MOVED SINCE IT WAS ASKED ABOUT, by its payment or a person, and pressing the\n       answer again would skip a cycle that has not come yet. `today` is the record's day, which the caller hands. */\n    if (typeof opts.today === 'string' && typeof f.next_due === 'string' && f.next_due >= opts.today)\n      return { nothing: `${name} is not past its day any more, so nothing moved.` };\n    const next = opts.next;\n    if (!(typeof next === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(next) && typeof f.next_due === 'string' && next > f.next_due))\n      return { nothing: `${name} was handed no later day to move to, so its Next stayed where it was.` };\n    return { writes: [{ id: item.spoken, version: item.version, fields: { next_due: next } }], said: `${name} went through for ${dayWords(f.next_due)}, and Next is ${dayWords(next)}.` };\n  }\n  const p = payment.fields;\n  const due = moneyOf(f.amount);\n  const paid = moneyOf(p.amount);\n  const on = typeof p.on === 'string' ? p.on : '';\n  if (!due || !paid || !on) return { nothing: `${name} or its payment has no amount or no day, so nothing was marked paid.` };\n  if (due.currency !== paid.currency) return { nothing: `${name} is in ${due.currency} and the payment is in ${paid.currency}, so nothing was marked paid.` };\n  const way = item.list === 'obligations' ? { owed_by_me: 'out', owed_to_me: 'in' }[f.direction] : f.direction;\n  if (way && p.direction && way !== p.direction) return { nothing: `${name} is money ${way} and the payment is money ${p.direction}, so nothing was marked paid.` };\n\n  /* A PAYMENT PAYS ONE THING. One that already names a bill in \"Settles\" is that bill's, and marking a second thing paid\n     with it would count the same money twice and leave the first bill paid by nothing. */\n  const taken = typeof p.settles === 'string' && p.settles !== '';\n  if (taken && (item.list !== 'obligations' || p.settles !== item.id)) return { nothing: `The payment already settles something else, so ${name} was not marked paid.` };\n\n  const change = (fields) => ({ id: item.spoken, version: item.version, fields });\n  const ask = (question, options) => ({ ask: { cause: `money.settle.${item.spoken}`, question, about: name, options } });\n\n  /* MONEY THAT HAS NOT MOVED PAYS NOTHING, AND MONEY TAKEN BACK UNPAYS. A payment that is pending or void marks nothing\n     paid, whoever hands it. One that names a bill has that bill counted again from its other payments (`opts.before`),\n     so a bill it had paid goes back to part paid with what is left, or to open with nothing in \"Paid so far\", and\n     loses its day. COUNTED, NOT SUBTRACTED: the sum written is what the other payments come to, so a second run finds\n     the bill as the first left it and writes nothing.\n\n     A BILL A PERSON MARKED PAID IS LEFT ALONE. Every close this script makes writes \"Paid so far\" with it, so a paid\n     bill with none was closed by hand, and no payment's status reopens it. */\n  if (p.state !== 'cleared') {\n    const why = p.state === 'void' ? 'was made void' : 'has not cleared';\n    const unpaid = { nothing: `The payment for ${name} ${why}, so nothing was marked paid.` };\n    if (item.list !== 'obligations' || p.settles !== item.id) return unpaid;\n    if (f.state !== 'open' && f.state !== 'part' && f.state !== 'paid') return { nothing: `${name} is not open, so the payment changed nothing.` };\n    const held = moneyOf(f.paid_so_far);\n    const counted = held && held.currency === due.currency ? held.amount : null;\n    if (f.state === 'paid' && counted === null) return { nothing: `${name} was marked paid by hand, so the payment that ${why} changed nothing.` };\n    /* WITH NO COUNT HANDED there is nothing to write the bill back to: what it holds may or may not have this payment in it. */\n    if (!opts || !Number.isSafeInteger(opts.before)) return unpaid;\n    const left = opts.before;\n    /* A SUM SOMEBODY TYPED IS LEFT ALONE. What this script wrote in \"Paid so far\" is what the cleared\n       payments came to: the others alone, or the others and this one while it counted. A sum that is neither was typed\n       by hand, and a payment that paid none of it takes none of it away: a bill marked half paid kept its half, and lost\n       it the day a pending payment was logged against it. */\n    if (counted !== null && counted !== left && counted !== left + paid.amount)\n      return { nothing: `${name} has a Paid so far that somebody typed, so the payment that ${why} changed nothing.` };\n    const sum = left === 0 ? null : { amount: left, currency: due.currency };\n    /* PAYMENTS THAT STILL REACH THE AMOUNT keep the bill as it is: this branch never closes one, and reopens none. */\n    const to = left === 0 ? 'open' : left < due.amount ? 'part' : f.state;\n    const fields = {};\n    if (to !== f.state) fields.state = to;\n    if (f.state === 'paid' && to !== 'paid') fields.settled = null;\n    if ((counted ?? 0) !== left) fields.paid_so_far = sum;\n    if (Object.keys(fields).length === 0) return unpaid;\n    if (left === 0) return { writes: [change(fields)], said: `${name} is open again, since its payment ${why}.` };\n    if (left < due.amount) return { writes: [change(fields)], said: `${name} is part paid, ${words(sum)} of ${words(due)}, since one of its payments ${why}.` };\n    return { writes: [change(fields)], said: `${name} still has ${words(sum)} paid, since one of its payments ${why}.` };\n  }\n\n  if (item.list === 'obligations') {\n    if (f.state !== 'open' && f.state !== 'part') return { nothing: `${name} is not open, so the payment changed nothing.` };\n    /* WHAT WAS PAID BEFORE THIS PAYMENT: the sum the caller counted from the payments that name the bill, and failing\n       that the bill's own \"Paid so far\", when it is in the bill's currency. */\n    const held = moneyOf(f.paid_so_far);\n    const before = opts && Number.isSafeInteger(opts.before) ? opts.before : held && held.currency === due.currency ? held.amount : 0;\n    const total = { amount: before + paid.amount, currency: due.currency };\n    /* THE LINK STAYS ON THE PAYMENT, and is written only where it is not there yet. */\n    const link = p.settles === item.id ? [] : [{ id: payment.spoken, version: payment.version, fields: { settles: item.id } }];\n    const closed = [change({ state: 'paid', settled: on, paid_so_far: total }), ...link];\n    /* RUN AGAIN FOR A PAYMENT ALREADY COUNTED, the bill holds this sum and the link: nothing is written a second time. */\n    if (total.amount < due.amount && f.state === 'part' && link.length === 0 && held && held.currency === due.currency && held.amount === total.amount)\n      return { nothing: `${name} already counts this payment, so nothing changed.` };\n    if (total.amount < due.amount)\n      return { writes: [change({ state: 'part', paid_so_far: total }), ...link], said: `${name} is part paid: ${words(total)} of ${words(due)}.` };\n    if (off(total.amount, due.amount))\n      /* SEVERAL PAYMENTS ARE NOT \"THIS TIME\": the sum is said as a sum once an earlier payment is in it. */\n      return ask(before === 0 ? `${name} was ${words(total)} this time, not ${words(due)}. Mark it paid?` : `The payments for ${name} come to ${words(total)}, not ${words(due)}. Mark it paid?`, [\n        { label: 'Mark it paid', because: `It is paid on ${dayWords(on)}, and keeps ${words(due)} as its amount.`, patches: closed },\n        { label: 'Leave it open', because: 'Nothing changes, and it stays in what is still to pay.' },\n      ]);\n    return { writes: closed, said: `${name} is paid, on ${dayWords(on)}.` };\n  }\n\n  if (item.list === 'installments') {\n    if (f.state !== 'open') return { nothing: `${name} is not open, so the payment changed nothing.` };\n    const closed = [change({ state: 'paid', settled: on, paid_by: payment.id })];\n    if (off(paid.amount, due.amount))\n      return ask(`${name} was ${words(paid)} this time, not ${words(due)}. Mark it paid?`, [\n        { label: 'Mark it paid', because: `It is paid on ${dayWords(on)}, and keeps ${words(due)} as its amount.`, patches: closed },\n        { label: 'Leave it open', because: 'Nothing changes, and it stays in what is still to pay.' },\n      ]);\n    return { writes: closed, said: `${name} is paid, on ${dayWords(on)}.` };\n  }\n\n  if (item.list === 'recurring') {\n    if (f.state !== 'live') return { nothing: `${name} is not live, so the payment changed nothing.` };\n    /* THE SAME PAYMENT HANDED TWICE MOVES THE LINE ONCE: a payment on or before the last one counted is that one or an\n       older one, and \"Next\" has already moved past it. */\n    if (typeof f.last_paid === 'string' && on <= f.last_paid) return { nothing: `${name} already counts a payment on ${dayWords(f.last_paid)}, so nothing moved.` };\n    /* A RUN NOBODY PRESSED ASKS NOTHING (`opts.quiet`, as a payment's arrival hands it): the payment is not counted on\n       the line, whatever day it would move to, and the one sentence that says why is the caller's to keep on the payment. */\n    if (off(paid.amount, due.amount) && opts && opts.quiet)\n      return { left: `${words(paid)} is not the ${words(due)} ${name} repeats at, so this payment was not counted on it.` };\n    const next = opts ? opts.next : undefined;\n    /* A DAY, AND A LATER ONE THAN THE LINE NAMES, or no day at all (`null`, below). Anything else was worked out from a\n       line that has moved since, and writing it would walk \"Next\" backwards. */\n    const later = typeof next === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(next) && typeof f.next_due === 'string' && next > f.next_due;\n    if (next === undefined || (next !== null && !later)) return { nothing: `${name} was handed no later day to move to, so its Next stayed where it was.` };\n    const last = { last_paid: on, last_amount: paid };\n    /* NO LATER DAY, past the line's end or on a cycle nobody can read: the payment is kept and \"Next\" stays. */\n    const moved = later ? { next_due: next, ...last } : last;\n    const said = moved.next_due ? `${name} is paid for ${dayWords(f.next_due)}, and Next is ${dayWords(next)}.` : `${name} is paid for ${dayWords(f.next_due)}, and has no later day.`;\n    if (off(paid.amount, due.amount))\n      return ask(`${name} was ${words(paid)} this time, not ${words(due)}. Change the line?`, [\n        { label: 'Change the line', because: `Every payment ahead is counted at ${words(paid)}.`, patches: [change({ ...moved, amount: paid })] },\n        { label: `Keep ${words(due)}`, because: `This payment was a one-off, and the ones ahead stay at ${words(due)}.`, patches: [change(moved)] },\n      ]);\n    return { writes: [change(moved)], said };\n  }\n\n  return { nothing: `${name} is in a list a payment does not settle, so nothing changed.` };\n};\nconst find = async function run(ctx) {\n  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};\n  const named = async (said) => {\n    if (typeof said !== 'string' || said === '') return null;\n    if (/^transactions#\\d+$/.test(said)) return said;\n    if (!/^[0-9A-Za-z_-]+$/.test(said)) return null;\n    const row = await ctx.record.get(said);\n    return row && row.register === 'transactions' && Number.isSafeInteger(row.seq) ? `transactions#${row.seq}` : null;\n  };\n  const at = (await named(input.payment)) ?? (input.register === 'transactions' && Number.isSafeInteger(input.seq) ? `transactions#${input.seq}` : null);\n  if (!at) {\n    ctx.log('The script was handed no payment, so nothing was looked for.');\n    return null;\n  }\n  const paymentRow = await ctx.record.get(at);\n  if (!paymentRow) {\n    ctx.log('The payment is no longer in the record, so nothing was looked for.');\n    return null;\n  }\n  const payment = { list: 'transactions', id: paymentRow.id, spoken: at, version: paymentRow.version, fields: paymentRow.fields };\n  const way = payment.fields.direction;\n  if (way !== 'in' && way !== 'out') {\n    ctx.log('The payment does not say which way the money went, so nothing was looked for.');\n    return null;\n  }\n\n  /* THE DECISION'S TEN DAYS AND THE RECORD'S PAGE, said again here because `run` reads nothing of `matchPayment`'s. */\n  const DAYS = 10;\n  const PAGE = 50;\n  const at0 = typeof payment.fields.on === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(payment.fields.on) ? Date.parse(`${payment.fields.on}T00:00:00Z`) : NaN;\n  const dayFrom = (n) => new Date(at0 + n * 86_400_000).toISOString().slice(0, 10);\n  const shaped = (list) => (r) => ({ list, id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });\n  let full = false;\n  const open = async (list, state, direction, day) => {\n    const rows = await ctx.record.list(list, { all: [state, { field: 'direction', is: direction }, { field: day, between: [dayFrom(-DAYS), dayFrom(DAYS)] }] });\n    if (rows.length >= PAGE) full = true;\n    return rows.map(shaped(list));\n  };\n  /* A PAYMENT WITH NO DAY READS NOTHING: the decision says why, and there is no window to ask the lists for. */\n  const items = Number.isNaN(at0)\n    ? []\n    : [\n        ...(await open('obligations', { field: 'state', in: ['open', 'part'] }, way === 'out' ? 'owed_by_me' : 'owed_to_me', 'due')),\n        ...(await open('installments', { field: 'state', is: 'open' }, way, 'due')),\n        ...(await open('recurring', { field: 'state', is: 'live' }, way, 'next_due')),\n      ];\n  if (full) ctx.log('Fifty or more things are open within ten days of this payment, so it may have been compared with only some of them.');\n  /* AN INSTALMENT THAT ALREADY NAMES THIS PAYMENT is paid, so it is not among the open ones: it is asked for by name. A\n     host that refuses the question leaves the check to the link itself, which a paid instalment no longer takes. */\n  try {\n    items.push(...(await ctx.record.list('installments', { field: 'paid_by', is: payment.id })).map(shaped('installments')));\n  } catch {\n    /* nothing to add */\n  }\n\n  const opts = {};\n  if (typeof input.answer === 'string') opts.answer = input.answer;\n  if (typeof ctx.fold === 'function') {\n    const keys = new Map();\n    const texts = [payment.fields.payee, payment.fields.counterparty_text, payment.fields.what, ...items.flatMap((i) => [i.fields.what, i.fields.plan])];\n    /* A HOST THAT REFUSES A FOLD (it answers only so many a run) leaves the whole compare plain, as a host that hands\n       none does: keys for some names and not for others would be two ideas of a payee in one decision. It is said. */\n    try {\n      for (const text of texts) if (typeof text === 'string' && !keys.has(text)) keys.set(text, await ctx.fold(text));\n      opts.fold = (text) => keys.get(text) ?? null;\n    } catch {\n      ctx.log('The names were compared by their letters and digits for this payment, since the fuller compare could not be finished.');\n    }\n  }\n\n  const out = matchPayment(payment, items, opts);\n  if (out.nothing) {\n    ctx.log(out.nothing);\n    return null;\n  }\n  /* NO QUESTION WITH AN ANSWER THAT DOES NOTHING, WHERE THE CALLER SAYS SO (`input.asks: 'linked'`, as Money's rule\n     does). An answer that names a repeating line carries no link, and nothing runs on an answer picked yet, so picking\n     it would change nothing. The payment is left as it is and the run says why. */\n  if (out.ask && input.asks === 'linked' && out.ask.options.some((o) => o.id !== 'none' && !(Array.isArray(o.patches) && o.patches.length > 0))) {\n    ctx.log('More than one thing fits this payment and one of them is a repeating line, which an answer cannot link yet, so nothing was asked.');\n    return null;\n  }\n  if (out.ask) return { ask: out.ask };\n  for (const w of out.writes) ctx.update(w.id, w.fields, w.version);\n  ctx.log(out.said);\n  return { matched: out.link.item, item: out.link.id, list: out.link.list };\n};\nconst LEG = {\"on\":\"next_due\",\"every\":{\"field\":\"every\",\"months\":{\"monthly\":1,\"quarterly\":3,\"yearly\":12},\"weeks\":{\"weekly\":1,\"fortnightly\":2},\"twice\":{\"twice_monthly\":[1,15]}},\"ends\":\"ends\",\"days\":\"day_of_month\",\"weekend\":\"weekend\"};\nexport default async function run(ctx) {\n  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};\n  const over = (more) => Object.create(ctx, Object.fromEntries(Object.entries(more).map(([name, value]) => [name, { value }])));\n  const shaped = (at, row) => ({ list: at.split('#')[0], id: row.id, spoken: at, version: row.version, fields: row.fields });\n  const say = (words) => (ctx.log(words), null);\n  const unmoved = 'This repeating line was handed no day to move to, so nothing on it changed.';\n  /* THE WALK'S DAY, OR NONE: a line it cannot step, or a step that failed. */\n  const dayAfter = (fields) => Promise.resolve().then(() => ctx.cycle(fields.next_due, { leg: LEG, fields })).then((d) => (typeof d === 'string' ? d : undefined), () => undefined);\n  const write = (out, at) => {\n    if (!out.writes) return say(out.nothing || out.left || 'Nothing was asked, and nothing on the line changed.');\n    for (const w of out.writes) ctx.update(w.id, w.fields, w.version);\n    ctx.log(out.said);\n    return { settled: at };\n  };\n  /* THE ONE OPEN BILL FOR A LINE'S MONEY, marked paid on the day it was answered: the same way, the same currency, the\n     same name (letters and digits, as `move_line` compares them) and a due day within ten days of the line's Next.\n     None, or more than one, and no bill is touched. */\n  const paidBill = async (line, today) => {\n    const way = { out: 'owed_by_me', in: 'owed_to_me' }[line.direction];\n    const money = line.amount && typeof line.amount === 'object' ? line.amount : null;\n    const day = typeof line.next_due === 'string' ? Date.parse(line.next_due + 'T00:00:00Z') : NaN;\n    const plain = (t) => (typeof t === 'string' ? t.toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, '') : '');\n    if (!way || !money || Number.isNaN(day) || !plain(line.what) || typeof today !== 'string') return null;\n    const from = (n) => new Date(day + n * 86400000).toISOString().slice(0, 10);\n    const rows = await ctx.record.list('obligations', { all: [{ field: 'state', in: ['open', 'part'] }, { field: 'direction', is: way }, { field: 'due', between: [from(-10), from(10)] }] });\n    const found = rows.filter((r) => r.fields.amount && r.fields.amount.currency === money.currency && plain(r.fields.what) === plain(line.what) && String(r.fields.due) <= today);\n    if (found.length !== 1) return null;\n    const bill = found[0];\n    ctx.update('obligations#' + bill.seq, { state: 'paid', settled: today }, bill.version);\n    ctx.log((String(bill.fields.what).trim() || 'The bill') + ' is marked paid, since you said it went through.');\n    return { settled: 'obligations#' + bill.seq };\n  };\n\n  if (input.answer === 'It went through') {\n    const at = input.register === 'recurring' && Number.isSafeInteger(input.seq) ? 'recurring#' + input.seq : null;\n    const row = at ? await ctx.record.get(at) : null;\n    if (!row) return say('The answer named no repeating line, so nothing moved.');\n    const today = typeof ctx.today === 'function' ? await ctx.today() : undefined;\n    /* THE BILL FOR THE SAME MONEY IS PAID TOO: \"it went through\" is said of the money, and a bill left open for it read\n       late on Today the day after he said so. Marked whether or not the line can be moved on. */\n    const bill = await paidBill(row.fields, today);\n    if (typeof ctx.cycle !== 'function') return (say(unmoved), bill);\n    const moved = write(settle(shaped(at, row), null, { told: true, next: await dayAfter(row.fields), today }), at);\n    return moved ?? bill;\n  }\n\n  const found = await find(over({ input: { payment: input.payment }, update: () => {}, log: () => {} }));\n  if (!found) return null;\n  /* ONE LINE, FOUND BY ITSELF OR OFFERED ALONE: an offer of one line is a line whose amount is off. */\n  const offered = found.ask ? found.ask.options.filter((o) => o.id !== 'none') : [];\n  const at = found.ask ? (offered.length === 1 && /^recurring-\\d+$/.test(offered[0].id) ? offered[0].id.replace('-', '#') : null) : found.list === 'recurring' ? found.matched : null;\n  if (!at) return null;\n  if (typeof ctx.cycle !== 'function') return say(unmoved);\n  const [paymentRow, lineRow] = [await ctx.record.get(input.payment), await ctx.record.get(at)];\n  if (!paymentRow || !lineRow || !Number.isSafeInteger(paymentRow.seq)) return null;\n  const payment = shaped('transactions#' + paymentRow.seq, paymentRow);\n  const out = settle(shaped(at, lineRow), payment, { next: await dayAfter(lineRow.fields), quiet: true });\n  /* SAID ON THE PAYMENT, WHERE IT HOLDS NO NOTE OF ITS OWN: a person's words are never written over. */\n  if (out.left && !(typeof payment.fields.note === 'string' && payment.fields.note.trim() !== '')) ctx.update(payment.spoken, { note: out.left }, payment.version);\n  return write(out, at);\n}"
   },
   "script.plans_from_names#0": {
    "script": "plans_from_names",
    "title": "Give each plan a page and count what is left after each part",
    "pack": "money-core",
    "runs": {
     "every": "1d",
     "rule": true
    },
    "egress": [],
    "keys": [],
    "reads": [
     "installments",
     "plans"
    ],
    "writes": [
     "installments",
     "plans"
    ],
    "limits": {
     "writes": 1000
    },
    "source": "function planKey(name) {\n  return typeof name === 'string' ? name.normalize('NFKD').replace(/\\p{M}/gu, '').normalize('NFC').toLowerCase().replace(/\\s+/gu, ' ').trim() : '';\n}\nfunction twinsAsk(twins) {\n  if (!Array.isArray(twins) || twins.length === 0) return null;\n  const seq = (p) => String(p.spoken).split('#')[1];\n  const name = (p) => String(p.fields.name).trim();\n  const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs.join(''));\n  const pairs = twins.map((t) => and([t.keep, ...t.others].map(name)));\n  const one = twins.length === 1;\n  const question = one\n    ? `${pairs[0]} are one plan written ${twins[0].others.length === 1 ? 'two' : 'several'} ways. Make them one plan?`\n    : `${and(twins.map((t) => name(t.keep)))} are each one plan written more than one way (${pairs.join('; ')}). Make each one plan?`;\n  const because = one\n    ? `The parts of ${and(twins[0].others.map(name))} move to ${name(twins[0].keep)}, and ${and(twins[0].others.map(name))} is closed and kept, linked to ${name(twins[0].keep)}. Nothing is deleted.`\n    : 'The parts of each second plan move to the first, and the second is closed and kept, linked to the first. Nothing is deleted.';\n  const patches = twins.flatMap((t) =>\n    t.others.map((o) => ({ id: o.spoken, version: o.version, fields: { one_with: t.keep.id, ...(o.fields.state === 'paid' || o.fields.state === 'cancelled' ? {} : { state: 'cancelled' }) } })),\n  );\n  return {\n    cause: `plans.twins:${twins.map((t) => [t.keep, ...t.others].map(seq).join('.')).join('_')}`,\n    question,\n    about: twins.map((t) => name(t.keep)),\n    options: [\n      { id: 'one', label: 'Make them one', because, patches },\n      { id: 'apart', label: 'Keep them apart', because: 'Each plan keeps its own parts, and this is not asked again.' },\n    ],\n  };\n}\nfunction plansFromNames(parts, plans) {\n  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);\n  const isDay = (v) => typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v);\n  const seqOf = (r) => Number(String(r.spoken).split('#')[1]) || 0;\n  const oldestFirst = (rows) => [...rows].sort((a, b) => seqOf(a) - seqOf(b));\n  const open = (p) => p.fields.state !== 'paid' && p.fields.state !== 'cancelled';\n  const keyOf = planKey;\n\n  /* A PLAN MADE ONE WITH ANOTHER IS NO PLAN OF ITS OWN while the plan it names is here: its parts are the other's. One\n     that names a plan no longer here is a plan again, so its parts are not left with nowhere to go. */\n  const ids = new Set(plans.map((p) => p.id));\n  const madeOne = (p) => typeof p.fields.one_with === 'string' && p.fields.one_with !== p.id && ids.has(p.fields.one_with);\n\n  /* THE OLDEST ROW OF A NAME IS THE PLAN. Two rows of one name are twins, asked about and never chosen between. */\n  const named = new Map();\n  for (const plan of oldestFirst(plans)) {\n    const key = keyOf(plan.fields.name);\n    if (key === '' || madeOne(plan)) continue;\n    if (!named.has(key)) named.set(key, []);\n    named.get(key).push(plan);\n  }\n  const twinned = new Set([...named].filter(([, rows]) => rows.length > 1).map(([key]) => key));\n\n  /* A TWIN'S PARTS ARE GROUPED BY THEIR TEXT AS WRITTEN, as every part was before, so each stays with its own plan until\n     he answers. Every other name's parts are one group however they are written. */\n  const groups = new Map();\n  for (const part of oldestFirst(parts)) {\n    const text = part.fields.plan;\n    const key = keyOf(text);\n    if (key === '') continue;\n    const at = twinned.has(key) ? `${key}\\u0000${text}` : key;\n    if (!groups.has(at)) groups.set(at, { key, text, parts: [] });\n    groups.get(at).parts.push(part);\n  }\n\n  const out = { plans: [], writes: [], waiting: 0, twins: [...twinned].map((key) => ({ keep: named.get(key)[0], others: named.get(key).slice(1) })) };\n  for (const { key, text, parts: group } of groups.values()) {\n    const plan = twinned.has(key) ? named.get(key).find((p) => p.fields.name === text) : named.get(key)?.[0];\n    /* NOTHING NEW UNDER A TWIN'S NAME: a part whose text is neither twin's waits for his answer. */\n    if (!plan && twinned.has(key)) continue;\n    const state = group.some(open) ? 'open' : group.some((p) => p.fields.state === 'paid') ? 'paid' : 'cancelled';\n    if (!plan) {\n      /* WHO AND THE ACCOUNT ONLY WHEN THE PARTS AGREE: a plan paid from two accounts names neither. */\n      const agreed = (field) => {\n        const said = new Set(group.map((p) => p.fields[field]).filter((v) => typeof v === 'string' && v !== ''));\n        return said.size === 1 ? { [field]: [...said][0] } : {};\n      };\n      out.plans.push({ name: text.trim().replace(/\\s+/gu, ' '), state, ...agreed('party'), ...agreed('account') });\n      out.waiting += group.length;\n    } else if (plan.fields.state !== state && plan.fields.state !== 'paid' && plan.fields.state !== 'cancelled' && state !== 'cancelled') {\n      /* A CLOSED PLAN IS NEVER OPENED HERE. No read says who closed it, and a plan somebody marked paid by hand while a\n         part was still open was opened again that night, with a line saying so. */\n      out.writes.push({ id: plan.spoken, version: plan.version, fields: { state } });\n    }\n\n    /* WALKED FROM THE LAST PART BACK, keeping one running sum a currency: what is left after a part is the sum as it\n       stands when the walk reaches it, and an open part then adds itself for the parts before it. */\n    const counted = group.filter((p) => moneyOf(p.fields.amount) && isDay(p.fields.due));\n    const numberOf = (p) => (Number.isSafeInteger(p.fields.number) ? p.fields.number : Infinity);\n    counted.sort((a, b) => (a.fields.due < b.fields.due ? -1 : a.fields.due > b.fields.due ? 1 : numberOf(a) - numberOf(b) || seqOf(a) - seqOf(b)));\n    const left = new Map();\n    const sums = new Map();\n    for (let i = counted.length - 1; i >= 0; i--) {\n      const { amount, currency } = counted[i].fields.amount;\n      left.set(counted[i], { amount: sums.get(currency) ?? 0, currency });\n      if (open(counted[i])) sums.set(currency, (sums.get(currency) ?? 0) + amount);\n    }\n\n    for (const part of group) {\n      const fields = {};\n      if (plan && part.fields.plan_row !== plan.id) fields.plan_row = plan.id;\n      const after = left.get(part);\n      const held = moneyOf(part.fields.left_after);\n      if (after && Number.isSafeInteger(after.amount) && !(held && held.amount === after.amount && held.currency === after.currency)) fields.left_after = after;\n      if (Object.keys(fields).length > 0) out.writes.push({ id: part.spoken, version: part.version, fields });\n    }\n  }\n  return out;\n}\nexport default async function run(ctx) {\n  const PAGE = 50;\n  const MOST = 900;\n  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};\n  const every = async (list, where) => {\n    const rows = [];\n    let after = null;\n    for (;;) {\n      /* IN ROW NUMBER ORDER: a list answers in its own order, and `seq` below the lowest of a page skips rows. */\n      const tests = [...(where ? [where] : []), ...(after === null ? [] : [{ field: 'seq', gt: after }])];\n      const page = await ctx.record.list(list, tests.length === 0 ? undefined : tests.length === 1 ? tests[0] : { all: tests }, { order: 'seq' });\n      for (const r of page) rows.push({ list, id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });\n      if (page.length < PAGE) return rows;\n      after = Math.max(...page.map((r) => r.seq));\n    }\n  };\n\n  const handed =\n    typeof input.part === 'string' && /^installments#\\d+$/.test(input.part)\n      ? input.part\n      : input.register === 'installments' && Number.isSafeInteger(input.seq)\n        ? `installments#${input.seq}`\n        : null;\n  const handedPlan =\n    typeof input.plan === 'string' && /^plans#\\d+$/.test(input.plan) ? input.plan : input.register === 'plans' && Number.isSafeInteger(input.seq) ? `plans#${input.seq}` : null;\n  let name = null;\n  if (handed) {\n    const row = await ctx.record.get(handed);\n    if (!row) {\n      ctx.log('The part is no longer in the record, so no plan was counted.');\n      return null;\n    }\n    name = row.fields.plan;\n    if (typeof name !== 'string' || name.trim() === '') {\n      ctx.log('The part names no plan, so no plan was counted.');\n      return null;\n    }\n  } else if (handedPlan) {\n    /* THE SECOND PASS: the plan is in the record now, so its parts can be linked to it. A plan nobody's part names\n       reads no part and writes nothing. */\n    const row = await ctx.record.get(handedPlan);\n    if (!row) {\n      ctx.log('The plan is no longer in the record, so no part was linked.');\n      return null;\n    }\n    name = row.fields.name;\n    if (typeof name !== 'string' || name.trim() === '') return null;\n  }\n  /* ONE PLAN'S PARTS ARE ASKED FOR BY A WORD OF ITS NAME, and kept only where the whole name is that plan's however it\n     is written. The record's `contains` folds capitals and nothing else, so a name with a letter beyond them reads every\n     part. Every plan is read, since a plan written another way is still the one its parts belong to: there are few. */\n  const key = name === null ? null : planKey(name);\n  const word = key === null || !/^[\\x20-\\x7e\\s]*$/u.test(name) ? null : key.split(' ').reduce((a, b) => (b.length > a.length ? b : a), '');\n  const read = await every('installments', word === null || word === '' ? undefined : { field: 'plan', contains: word });\n  const parts = key === null ? read : read.filter((p) => planKey(p.fields.plan) === key);\n  const plans = await every('plans');\n\n  const out = plansFromNames(parts, plans);\n  const made = out.plans.slice(0, MOST);\n  const writes = out.writes.slice(0, MOST - made.length);\n  const more = made.length < out.plans.length || writes.length < out.writes.length;\n  /* THE QUESTION ABOUT TWINS IS THE NIGHT'S, over every plan, so a part's run and the night's never ask it two ways. */\n  const ask = key === null ? twinsAsk(out.twins) : null;\n  if (made.length === 0 && writes.length === 0) return ask === null ? null : { plans: 0, parts: 0, more: false, ask };\n  for (const plan of made) ctx.write('plans', plan);\n  for (const w of writes) ctx.update(w.id, w.fields, w.version);\n\n  /* SAID IN NAMES AND COUNTS, never a list's number: the first three plans made, and how many more. */\n  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;\n  const names = made.map((p) => p.name);\n  const listed = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('');\n  const ofParts = writes.filter((w) => w.id.startsWith('installments#'));\n  const linked = ofParts.filter((w) => 'plan_row' in w.fields).length;\n  const counted = ofParts.filter((w) => 'left_after' in w.fields).length;\n  const did = [];\n  if (made.length > 0) did.push(`made ${count(made.length, 'plan', 'plans')}, ${listed}`);\n  if (linked > 0) did.push(`linked ${count(linked, 'part to its plan', 'parts to their plans')}`);\n  if (counted > 0) did.push(`counted what is left after ${count(counted, 'part', 'parts')}`);\n  const sentences = [];\n  if (did.length > 0) {\n    const said = did.length === 1 ? did[0] : `${did.slice(0, -1).join(', ')}, and ${did.at(-1)}`;\n    sentences.push(`${said[0].toUpperCase()}${said.slice(1)}.`);\n  }\n  const byId = new Map(plans.map((p) => [p.spoken, p.fields.name]));\n  for (const w of writes) if (byId.has(w.id)) sentences.push(`${byId.get(w.id)} is ${w.fields.state === 'paid' ? 'paid' : 'open'}.`);\n  if (more) sentences.push('The rest waits for the next run.');\n  ctx.log(sentences.join(' '));\n  return { plans: made.length, parts: ofParts.length, more, ...(ask === null ? {} : { ask }) };\n}"
   },
   "script.budget_watch#0": {
    "script": "budget_watch",
    "title": "Mark a budget near or over its most this month",
    "pack": "money-core",
    "runs": {
     "every": "1d",
     "rule": true
    },
    "egress": [],
    "keys": [],
    "reads": [
     "categories",
     "transactions"
    ],
    "writes": [
     "categories"
    ],
    "limits": {
     "cpu_ms": 1000,
     "wall_ms": 30000
    },
    "source": "function budgetWarnings(categories, entries, month) {\n  const spent = new Map();\n  for (const e of entries) {\n    const by = e.fields.category;\n    const amount = e.fields.amount;\n    if (typeof by !== 'string' || by === '' || !amount || typeof amount.amount !== 'number' || typeof amount.currency !== 'string') continue;\n    const per = spent.get(by) ?? new Map();\n    per.set(amount.currency, (per.get(amount.currency) ?? 0) + amount.amount);\n    spent.set(by, per);\n  }\n  const writes = [];\n  for (const c of categories) {\n    const budget = c.fields.budget;\n    if (!budget || typeof budget.amount !== 'number' || !(budget.amount > 0) || typeof budget.currency !== 'string') continue;\n    const used = spent.get(c.id)?.get(budget.currency) ?? 0;\n    const alert = typeof c.fields.budget_alert === 'number' && c.fields.budget_alert >= 1 && c.fields.budget_alert <= 100 ? c.fields.budget_alert : null;\n    const level = used > budget.amount ? 'over' : alert !== null && used * 100 >= budget.amount * alert ? 'near' : null;\n    if (level === null) continue;\n    const told = c.fields.warned_month === month ? c.fields.budget_warned : null;\n    if (told === level || told === 'over') continue;\n    writes.push({ id: c.spoken, version: c.version, fields: { budget_warned: level, warned_month: month } });\n  }\n  return writes;\n}\nexport default async function run(ctx) {\n  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);\n  const [y, m] = today.split('-').map(Number);\n  const month = today.slice(0, 7);\n  const from = `${month}-01`;\n  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;\n\n  const PAGE = 50;\n  const every = async (list, tests) => {\n    const rows = [];\n    let below = null;\n    for (;;) {\n      const all = [...tests, ...(below === null ? [] : [{ field: 'seq', lt: below }])];\n      const page = await ctx.record.list(list, { all });\n      for (const r of page) rows.push({ id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });\n      if (page.length < PAGE) return rows;\n      below = Math.min(...page.map((r) => r.seq));\n    }\n  };\n\n  const categories = await every('categories', [\n    { field: 'state', is: 'live' },\n    { field: 'budget', present: true },\n  ]);\n  if (categories.length === 0) {\n    ctx.log('No category has a budget, so there is nothing to warn about.');\n    return null;\n  }\n  const entries = await every('transactions', [\n    { field: 'state', is: 'cleared' },\n    { field: 'transfer', is: false },\n    { field: 'direction', is: 'out' },\n    { field: 'on', gte: from },\n    { field: 'on', lt: to },\n  ]);\n  const writes = budgetWarnings(categories, entries, month);\n  for (const w of writes) ctx.update(w.id, w.fields, w.version);\n  ctx.log(writes.length === 0 ? 'No budget passed its warning this month since the last run.' : `${writes.length} budget warning(s) marked for ${month}.`);\n  return { marked: writes.length };\n}"
   },
   "page.money-book#0": {
    "page": "money-book",
    "title": "{{name}}",
    "for": {
     "register": "books"
    },
    "nav": {
     "section": "Money",
     "order": 20
    },
    "icon": "book",
    "requires": [
     "register.books",
     "register.accounts",
     "register.obligations",
     "register.transactions",
     "register.recurring",
     "register.installments"
    ],
    "pack": "money-core",
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "tone": "warn",
      "span": 12,
      "when": {
       "metric": "categories-against-direction",
       "is": 1
      },
      "body": "1 category is marked the other way from how the Ledger books it. [See Categories](/r/categories)."
     },
     {
      "kind": "note",
      "lead": true,
      "tone": "warn",
      "span": 12,
      "when": {
       "metric": "categories-against-direction",
       "gt": 1
      },
      "body": "{{categories-against-direction}} categories are marked the other way from how the Ledger books them. [See Categories](/r/categories)."
     },
     {
      "kind": "stat",
      "lead": true,
      "heading": "What you have",
      "icon": "wallet",
      "span": 4,
      "cells": [
       {
        "metric": "book-cash:{{name}}",
        "label": "Cash now"
       }
      ]
     },
     {
      "kind": "forecast",
      "heading": "Cash ahead",
      "icon": "chart-line",
      "span": 8,
      "source": "forecast.runway",
      "opening": {
       "metric": "book-cash:{{name}}"
      },
      "from": [
       {
        "register": "obligations",
        "on": "due",
        "amount": "amount",
        "where": "state is open or part, repeats is not monthly or quarterly or yearly, book is {{name}}",
        "incoming": {
         "field": "direction",
         "is": "owed_to_me"
        }
       },
       {
        "register": "recurring",
        "on": "next_due",
        "amount": "amount",
        "where": "state is live, book is {{name}}",
        "incoming": {
         "field": "direction",
         "is": "in"
        },
        "every": {
         "field": "every",
         "months": {
          "monthly": 1,
          "quarterly": 3,
          "yearly": 12
         },
         "weeks": {
          "weekly": 1,
          "fortnightly": 2
         },
         "twice": {
          "twice_monthly": [
           1,
           15
          ]
         }
        },
        "ends": "ends",
        "days": "day_of_month",
        "weekend": "weekend"
       },
       {
        "register": "installments",
        "on": "due",
        "amount": "amount",
        "where": "state is open, book is {{name}}",
        "incoming": {
         "field": "direction",
         "is": "in"
        },
        "group": "plan"
       },
       {
        "register": "accounts",
        "on": "arrives",
        "amount": "balance",
        "where": "liquid is false, arrives is set, kind is bank, book is {{name}}",
        "incoming": {
         "field": "kind",
         "is": "bank"
        }
       }
      ],
      "horizon": 84,
      "horizons": [
       84,
       180,
       365,
       730,
       1825,
       "last"
      ],
      "axis": "fit",
      "knobs": [
       "horizon",
       "late",
       "spend",
       "count",
       "grow",
       "drift"
      ],
      "late": "days-late-in",
      "under": 30,
      "empty": "Nothing dated ahead yet."
     },
     {
      "kind": "stat",
      "heading": "This month",
      "icon": "coins",
      "span": 12,
      "cells": [
       {
        "metric": "book-in-month:{{name}}",
        "label": "In this month"
       },
       {
        "metric": "book-out-month:{{name}}",
        "label": "Out this month"
       },
       {
        "metric": "book-net-month:{{name}}",
        "label": "Net"
       }
      ],
      "when": {
       "metric": "book-net-month:{{name}}",
       "empty": false
      }
     },
     {
      "kind": "stat",
      "heading": "What is due",
      "icon": "scale",
      "span": 12,
      "cells": [
       {
        "metric": "book-owed-to:{{name}}",
        "label": "Due to come in"
       },
       {
        "metric": "book-owed-by:{{name}}",
        "label": "Due to go out"
       },
       {
        "metric": "book-lasts-until:{{name}}",
        "label": "Money lasts until"
       }
      ]
     },
     {
      "kind": "note",
      "span": 12,
      "when": {
       "metric": "book-lasts-until:{{name}}",
       "beyond": true
      },
      "body": "Lasts the year on what is due."
     },
     {
      "kind": "series",
      "heading": "In and out, by month",
      "icon": "chart-column",
      "span": 12,
      "series": [
       {
        "metric": "book-in-by-month:{{name}}",
        "label": "Money in"
       },
       {
        "metric": "book-out-by-month:{{name}}",
        "label": "Money out",
        "dir": "out"
       }
      ],
      "back": 12,
      "net": true,
      "when": {
       "metric": "book-net-by-month:{{name}}",
       "empty": false
      },
      "empty": "Nothing moved in {{name}}."
     },
     {
      "kind": "cards",
      "heading": "Accounts",
      "icon": "landmark",
      "span": 8,
      "source": "register.accounts",
      "where": "book is {{name}}, state is not closed",
      "columns": [
       {
        "field": "name",
        "as": "title"
       },
       {
        "field": "balance",
        "as": "figure"
       },
       {
        "field": "kind",
        "label": "Type",
        "as": "fact"
       },
       {
        "field": "as_of",
        "label": "Last confirmed",
        "as": "when"
       }
      ],
      "order": [
       {
        "field": "seq",
        "dir": "asc"
       }
      ],
      "stale": {
       "field": "as_of",
       "after": "7d",
       "figure": "account-ages"
      },
      "empty": "No accounts yet."
     },
     {
      "kind": "capture",
      "heading": "Add an account",
      "icon": "plus",
      "span": 4,
      "register": "accounts",
      "where": "book is {{spoken}}"
     },
     {
      "kind": "section",
      "heading": "Coming and going",
      "icon": "calendar",
      "span": 12,
      "fold": true
     },
     {
      "kind": "calendar",
      "heading": "Due in the next 30 days",
      "icon": "calendar",
      "span": 8,
      "source": "register.obligations",
      "where": "state is open or part, due after yesterday, due before +31d, book is {{name}}",
      "columns": [
       {
        "field": "what"
       },
       {
        "field": "due"
       }
      ],
      "back": 0,
      "ahead": 1,
      "empty": "Nothing due in 30 days."
     },
     {
      "kind": "bridge",
      "heading": "The next 30 days",
      "icon": "scale",
      "span": 4,
      "source": "forecast.runway",
      "opening": {
       "metric": "book-cash:{{name}}"
      },
      "from": [
       {
        "register": "obligations",
        "on": "due",
        "amount": "amount",
        "where": "state is open or part, repeats is not monthly or quarterly or yearly, book is {{name}}",
        "incoming": {
         "field": "direction",
         "is": "owed_to_me"
        }
       },
       {
        "register": "recurring",
        "on": "next_due",
        "amount": "amount",
        "where": "state is live, book is {{name}}",
        "incoming": {
         "field": "direction",
         "is": "in"
        },
        "every": {
         "field": "every",
         "months": {
          "monthly": 1,
          "quarterly": 3,
          "yearly": 12
         },
         "weeks": {
          "weekly": 1,
          "fortnightly": 2
         },
         "twice": {
          "twice_monthly": [
           1,
           15
          ]
         }
        },
        "ends": "ends",
        "days": "day_of_month",
        "weekend": "weekend"
       },
       {
        "register": "installments",
        "on": "due",
        "amount": "amount",
        "where": "state is open, book is {{name}}",
        "incoming": {
         "field": "direction",
         "is": "in"
        },
        "group": "plan"
       },
       {
        "register": "accounts",
        "on": "arrives",
        "amount": "balance",
        "where": "liquid is false, arrives is set, kind is bank, book is {{name}}",
        "incoming": {
         "field": "kind",
         "is": "bank"
        }
       }
      ],
      "horizon": 30,
      "empty": "Nothing in the next 30 days."
     },
     {
      "kind": "split",
      "heading": "Where this month's money went",
      "donut": true,
      "icon": "chart-pie",
      "span": 12,
      "source": "register.transactions",
      "where": "state is cleared, transfer is false, stays is not true, direction is out, on at least bom, book is {{name}}",
      "columns": [
       {
        "field": "category"
       },
       {
        "field": "amount"
       }
      ],
      "limit": 6,
      "unset": "Uncategorised",
      "when": {
       "metric": "book-spent-month:{{name}}",
       "gt": 0
      }
     },
     {
      "kind": "timeline",
      "heading": "What moved",
      "icon": "receipt",
      "span": 12,
      "source": "register.transactions",
      "where": "state is not void, book is {{name}}",
      "columns": [
       {
        "field": "on"
       },
       {
        "field": "what"
       },
       {
        "field": "amount",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       }
      ],
      "order": [
       {
        "field": "on",
        "dir": "desc"
       }
      ],
      "limit": 12,
      "empty": "Nothing has moved yet."
     }
    ]
   },
   "page.money-forecast#0": {
    "page": "money-forecast",
    "title": "Forecast",
    "nav": {
     "section": "Money",
     "order": 15
    },
    "icon": "chart-line",
    "requires": [
     "register.accounts",
     "register.obligations",
     "register.transactions",
     "register.recurring",
     "register.installments"
    ],
    "pack": "money-core",
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "body": "With nothing coming in, cash lasts to {{lasts-no-income.on}}."
     },
     {
      "kind": "forecast",
      "heading": "Cash ahead",
      "icon": "chart-line",
      "span": 12,
      "source": "forecast.runway",
      "opening": {
       "metric": "cash-now"
      },
      "recorded": "cash-now",
      "from": [
       {
        "register": "obligations",
        "on": "due",
        "amount": "amount",
        "where": "state is open or part, repeats is not monthly or quarterly or yearly",
        "incoming": {
         "field": "direction",
         "is": "owed_to_me"
        }
       },
       {
        "register": "recurring",
        "on": "next_due",
        "amount": "amount",
        "where": "state is live",
        "incoming": {
         "field": "direction",
         "is": "in"
        },
        "every": {
         "field": "every",
         "months": {
          "monthly": 1,
          "quarterly": 3,
          "yearly": 12
         },
         "weeks": {
          "weekly": 1,
          "fortnightly": 2
         },
         "twice": {
          "twice_monthly": [
           1,
           15
          ]
         }
        },
        "ends": "ends",
        "days": "day_of_month",
        "weekend": "weekend"
       },
       {
        "register": "installments",
        "on": "due",
        "amount": "amount",
        "where": "state is open",
        "incoming": {
         "field": "direction",
         "is": "in"
        },
        "group": "plan"
       },
       {
        "register": "accounts",
        "on": "arrives",
        "amount": "balance",
        "where": "liquid is false, arrives is set, kind is bank",
        "incoming": {
         "field": "kind",
         "is": "bank"
        }
       },
       {
        "register": "services",
        "on": "renews",
        "amount": "cost",
        "where": "state is not cancelled",
        "every": {
         "field": "cycle",
         "months": {
          "monthly": 1,
          "yearly": 12,
          "two_yearly": 24
         }
        }
       },
       {
        "register": "transactions",
        "on": "on",
        "amount": "amount",
        "where": "state is cleared, transfer is false, stays is not true",
        "incoming": {
         "field": "direction",
         "is": "in"
        },
        "everyday": {
         "months": 3
        }
       }
      ],
      "horizon": 91,
      "horizons": [
       91,
       183,
       365,
       "last"
      ],
      "axis": "fit",
      "knobs": [
       "horizon",
       "late",
       "spend",
       "count",
       "grow",
       "drift",
       "sell"
      ],
      "late": "days-late-in",
      "under": 30,
      "when": {
       "metric": "cash-accounts",
       "gt": 0
      },
      "empty": "Nothing is dated ahead yet."
     },
     {
      "kind": "series",
      "heading": "In and out, by month ahead",
      "icon": "chart-column",
      "span": 12,
      "series": [
       {
        "metric": "in-by-month",
        "then": "in-ahead-by-month",
        "label": "Money in"
       },
       {
        "metric": "out-by-month",
        "then": "out-ahead-by-month",
        "label": "Money out",
        "dir": "out"
       }
      ],
      "back": 1,
      "ahead": 3,
      "net": true,
      "when": {
       "metric": "cash-accounts",
       "gt": 0
      },
      "empty": "Nothing dated ahead yet."
     },
     {
      "kind": "table",
      "heading": "Instalments, the year ahead",
      "icon": "credit-card",
      "span": 12,
      "source": "register.installments",
      "where": "state is open, due before +366d",
      "columns": [
       {
        "field": "what",
        "label": "Description",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "due",
        "label": "Due",
        "width": "12ch",
        "align": "end"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "15ch",
        "align": "end",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       }
      ],
      "order": [
       {
        "field": "due",
        "dir": "asc"
       }
      ],
      "limit": 12,
      "when": {
       "metric": "installments-left",
       "gt": 0
      },
      "empty": "No instalments due this year."
     },
     {
      "kind": "table",
      "heading": "What repeats",
      "icon": "refresh",
      "span": 12,
      "source": "register.recurring",
      "where": "state is live",
      "columns": [
       {
        "field": "what",
        "label": "Description",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "every",
        "label": "Every",
        "width": "12ch"
       },
       {
        "field": "next_due",
        "label": "Next",
        "width": "12ch",
        "align": "end"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "15ch",
        "align": "end",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       }
      ],
      "order": [
       {
        "field": "next_due",
        "dir": "asc"
       }
      ],
      "limit": 12,
      "empty": "Nothing repeats yet."
     },
     {
      "kind": "bar",
      "heading": "Left to pay, by plan",
      "icon": "chart-bar",
      "span": 12,
      "source": "metric.installments-left-by-plan",
      "when": {
       "metric": "installments-left",
       "gt": 0
      },
      "empty": "Nothing is being paid in parts."
     }
    ]
   },
   "metric.book-spent-month#0": {
    "metric": "book-spent-month",
    "name": "Paid out of one book this month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on at least bom, book is {{it}}",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.runway-days#0": {
    "metric": "runway-days",
    "name": "Days the money lasts",
    "pack": "money-core",
    "source": "forecast.runway",
    "legs": [
     {
      "register": "obligations",
      "on": "due",
      "amount": "amount",
      "where": "state is open or part, repeats is not monthly or quarterly or yearly",
      "incoming": {
       "field": "direction",
       "is": "owed_to_me"
      }
     },
     {
      "register": "recurring",
      "on": "next_due",
      "amount": "amount",
      "where": "state is live",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "every": {
       "field": "every",
       "months": {
        "monthly": 1,
        "quarterly": 3,
        "yearly": 12
       },
       "weeks": {
        "weekly": 1,
        "fortnightly": 2
       },
       "twice": {
        "twice_monthly": [
         1,
         15
        ]
       }
      },
      "ends": "ends",
      "days": "day_of_month",
      "weekend": "weekend"
     },
     {
      "register": "installments",
      "on": "due",
      "amount": "amount",
      "where": "state is open",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "group": "plan"
     },
     {
      "register": "accounts",
      "on": "arrives",
      "amount": "balance",
      "where": "liquid is false, arrives is set, kind is bank",
      "incoming": {
       "field": "kind",
       "is": "bank"
      }
     },
     {
      "register": "transactions",
      "on": "on",
      "amount": "amount",
      "where": "state is cleared, transfer is false, stays is not true",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "everyday": {
       "months": 3
      }
     }
    ],
    "opening": {
     "metric": "cash-now"
    },
    "value": {
     "walk": "days_to_zero",
     "within": "365d"
    },
    "format": "days",
    "target": {
     "gte": 365
    },
    "window": "30d",
    "compare": "none",
    "home": 2,
    "snapshot": {
     "grain": "day",
     "into": "series.runway-days"
    }
   },
   "metric.lasts-no-income#0": {
    "metric": "lasts-no-income",
    "name": "Days the money lasts with no income",
    "pack": "money-core",
    "source": "forecast.runway",
    "legs": [
     {
      "register": "obligations",
      "on": "due",
      "amount": "amount",
      "where": "state is open or part, repeats is not monthly or quarterly or yearly, direction is owed by me",
      "incoming": {
       "field": "direction",
       "is": "owed_to_me"
      }
     },
     {
      "register": "recurring",
      "on": "next_due",
      "amount": "amount",
      "where": "state is live, direction is out",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "every": {
       "field": "every",
       "months": {
        "monthly": 1,
        "quarterly": 3,
        "yearly": 12
       },
       "weeks": {
        "weekly": 1,
        "fortnightly": 2
       },
       "twice": {
        "twice_monthly": [
         1,
         15
        ]
       }
      },
      "ends": "ends",
      "days": "day_of_month",
      "weekend": "weekend"
     },
     {
      "register": "installments",
      "on": "due",
      "amount": "amount",
      "where": "state is open, direction is out",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "group": "plan"
     },
     {
      "register": "transactions",
      "on": "on",
      "amount": "amount",
      "where": "state is cleared, transfer is false, stays is not true",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "everyday": {
       "months": 3
      }
     }
    ],
    "opening": {
     "metric": "cash-now"
    },
    "value": {
     "walk": "days_to_zero",
     "within": "1825d"
    },
    "format": "days",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.runs-out-on#0": {
    "metric": "runs-out-on",
    "name": "The day the money runs out",
    "pack": "money-core",
    "source": "forecast.runway",
    "legs": [
     {
      "register": "obligations",
      "on": "due",
      "amount": "amount",
      "where": "state is open or part, repeats is not monthly or quarterly or yearly",
      "incoming": {
       "field": "direction",
       "is": "owed_to_me"
      }
     },
     {
      "register": "recurring",
      "on": "next_due",
      "amount": "amount",
      "where": "state is live",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "every": {
       "field": "every",
       "months": {
        "monthly": 1,
        "quarterly": 3,
        "yearly": 12
       },
       "weeks": {
        "weekly": 1,
        "fortnightly": 2
       },
       "twice": {
        "twice_monthly": [
         1,
         15
        ]
       }
      },
      "ends": "ends",
      "days": "day_of_month",
      "weekend": "weekend"
     },
     {
      "register": "installments",
      "on": "due",
      "amount": "amount",
      "where": "state is open",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "group": "plan"
     },
     {
      "register": "accounts",
      "on": "arrives",
      "amount": "balance",
      "where": "liquid is false, arrives is set, kind is bank",
      "incoming": {
       "field": "kind",
       "is": "bank"
      }
     },
     {
      "register": "transactions",
      "on": "on",
      "amount": "amount",
      "where": "state is cleared, transfer is false, stays is not true",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "everyday": {
       "months": 3
      }
     }
    ],
    "opening": {
     "metric": "cash-now"
    },
    "value": {
     "walk": "zero_on",
     "within": "365d"
    },
    "format": "day",
    "target": {
     "gte": 47482
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.in-ahead-by-month#0": {
    "metric": "in-ahead-by-month",
    "name": "Coming in, by month ahead",
    "pack": "money-core",
    "source": "forecast.runway",
    "legs": [
     {
      "register": "obligations",
      "on": "due",
      "amount": "amount",
      "where": "state is open or part, repeats is not monthly or quarterly or yearly",
      "incoming": {
       "field": "direction",
       "is": "owed_to_me"
      }
     },
     {
      "register": "recurring",
      "on": "next_due",
      "amount": "amount",
      "where": "state is live",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "every": {
       "field": "every",
       "months": {
        "monthly": 1,
        "quarterly": 3,
        "yearly": 12
       },
       "weeks": {
        "weekly": 1,
        "fortnightly": 2
       },
       "twice": {
        "twice_monthly": [
         1,
         15
        ]
       }
      },
      "ends": "ends",
      "days": "day_of_month",
      "weekend": "weekend"
     },
     {
      "register": "installments",
      "on": "due",
      "amount": "amount",
      "where": "state is open",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "group": "plan"
     },
     {
      "register": "accounts",
      "on": "arrives",
      "amount": "balance",
      "where": "liquid is false, arrives is set, kind is bank",
      "incoming": {
       "field": "kind",
       "is": "bank"
      }
     },
     {
      "register": "transactions",
      "on": "on",
      "amount": "amount",
      "where": "state is cleared, transfer is false, stays is not true",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "everyday": {
       "months": 3
      }
     }
    ],
    "value": {
     "walk": "in",
     "within": "125d"
    },
    "bucket": "month",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.out-ahead-by-month#0": {
    "metric": "out-ahead-by-month",
    "name": "Going out, by month ahead",
    "pack": "money-core",
    "source": "forecast.runway",
    "legs": [
     {
      "register": "obligations",
      "on": "due",
      "amount": "amount",
      "where": "state is open or part, repeats is not monthly or quarterly or yearly",
      "incoming": {
       "field": "direction",
       "is": "owed_to_me"
      }
     },
     {
      "register": "recurring",
      "on": "next_due",
      "amount": "amount",
      "where": "state is live",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "every": {
       "field": "every",
       "months": {
        "monthly": 1,
        "quarterly": 3,
        "yearly": 12
       },
       "weeks": {
        "weekly": 1,
        "fortnightly": 2
       },
       "twice": {
        "twice_monthly": [
         1,
         15
        ]
       }
      },
      "ends": "ends",
      "days": "day_of_month",
      "weekend": "weekend"
     },
     {
      "register": "installments",
      "on": "due",
      "amount": "amount",
      "where": "state is open",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "group": "plan"
     },
     {
      "register": "accounts",
      "on": "arrives",
      "amount": "balance",
      "where": "liquid is false, arrives is set, kind is bank",
      "incoming": {
       "field": "kind",
       "is": "bank"
      }
     },
     {
      "register": "transactions",
      "on": "on",
      "amount": "amount",
      "where": "state is cleared, transfer is false, stays is not true",
      "incoming": {
       "field": "direction",
       "is": "in"
      },
      "everyday": {
       "months": 3
      }
     }
    ],
    "value": {
     "walk": "out",
     "within": "125d"
    },
    "bucket": "month",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.in-by-month#0": {
    "metric": "in-by-month",
    "name": "Money in, by month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is in, on after -13m",
    "value": {
     "sum": "amount"
    },
    "group_by": "on",
    "bucket": "month",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.out-by-month#0": {
    "metric": "out-by-month",
    "name": "Money out, by month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on after -13m",
    "value": {
     "sum": "amount"
    },
    "group_by": "on",
    "bucket": "month",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.net-by-month#0": {
    "metric": "net-by-month",
    "name": "Left over, by month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on after -13m",
    "value": {
     "sum": {
      "product": [
       "amount",
       {
        "lookup": "sign",
        "by": "direction"
       }
      ]
     }
    },
    "lookups": {
     "sign": {
      "in": 1,
      "out": -1
     }
    },
    "group_by": "on",
    "bucket": "month",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.spent-by-category-month#0": {
    "metric": "spent-by-category-month",
    "name": "Spent this month, by category",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on at least bom",
    "value": {
     "sum": "amount"
    },
    "group_by": "category",
    "format": "money",
    "target": {
     "setting": "most_spent_on_one_category"
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.uncategorised-share-30d#0": {
    "metric": "uncategorised-share-30d",
    "name": "Out with no category, 30 days",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on after -30d",
    "value": {
     "ratio": {
      "of": {
       "empty": "category"
      },
      "per": {
       "count": "id"
      }
     }
    },
    "format": "pct",
    "target": {
     "lte": 0.2
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.spent-last-month#0": {
    "metric": "spent-last-month",
    "name": "Spent last month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on at least bom-1m, on before bom",
    "value": {
     "sum": "amount"
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.spent-by-category-last-month#0": {
    "metric": "spent-by-category-last-month",
    "name": "Spent last month, by category",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on at least bom-1m, on before bom",
    "value": {
     "sum": "amount"
    },
    "group_by": "category",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.spent-by-category-to-date-last-month#0": {
    "metric": "spent-by-category-to-date-last-month",
    "name": "Spent last month to this day, by category",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on at least bom-1m, on at most -1m",
    "value": {
     "sum": "amount"
    },
    "group_by": "category",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.spent-vs-last-month#0": {
    "metric": "spent-vs-last-month",
    "name": "Spent this month against last, by category",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on at least bom",
    "value": {
     "diff": {
      "of": {
       "sum": "amount"
      },
      "per": {
       "sum": "amount"
      },
      "before": "month_ago"
     }
    },
    "group_by": "category",
    "format": "money",
    "target": {
     "lte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.budget-passed-on#0": {
    "metric": "budget-passed-on",
    "name": "The day a category passed its budget",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, on at least bom, category is {{it}}",
    "value": {
     "running": {
      "sum": "amount",
      "order": "on",
      "until": {
       "gte": {
        "field": "budget",
        "of": "category"
       }
      }
     }
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.book-in-month#0": {
    "metric": "book-in-month",
    "name": "Money into one book this month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on at least bom, direction is in, book is {{it}}",
    "value": {
     "sum": "amount"
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.book-out-month#0": {
    "metric": "book-out-month",
    "name": "Money out of one book this month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on at least bom, direction is out, book is {{it}}",
    "value": {
     "sum": "amount"
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.book-net-month#0": {
    "metric": "book-net-month",
    "name": "Left over in one book this month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on at least bom, book is {{it}}",
    "value": {
     "sum": {
      "product": [
       "amount",
       {
        "lookup": "sign",
        "by": "direction"
       }
      ]
     }
    },
    "lookups": {
     "sign": {
      "in": 1,
      "out": -1
     }
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.book-in-by-month#0": {
    "metric": "book-in-by-month",
    "name": "Money into one book, by month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on after -13m, direction is in, book is {{it}}",
    "value": {
     "sum": "amount"
    },
    "group_by": "on",
    "bucket": "month",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.book-out-by-month#0": {
    "metric": "book-out-by-month",
    "name": "Money out of one book, by month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on after -13m, direction is out, book is {{it}}",
    "value": {
     "sum": "amount"
    },
    "group_by": "on",
    "bucket": "month",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.book-net-by-month#0": {
    "metric": "book-net-by-month",
    "name": "Left over in one book, by month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on after -13m, book is {{it}}",
    "value": {
     "sum": {
      "product": [
       "amount",
       {
        "lookup": "sign",
        "by": "direction"
       }
      ]
     }
    },
    "lookups": {
     "sign": {
      "in": 1,
      "out": -1
     }
    },
    "group_by": "on",
    "bucket": "month",
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.unfiled-spent-month#0": {
    "metric": "unfiled-spent-month",
    "name": "Spent this month with no category",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, category is empty, on at least bom",
    "value": {
     "sum": "amount"
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.unfiled-month#0": {
    "metric": "unfiled-month",
    "name": "Entries this month with no category",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is out, category is empty, parts is empty, on at least bom",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "lte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.payees-paid-90d#0": {
    "metric": "payees-paid-90d",
    "name": "Payees paid, 90 days",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on after -90d, on before +1d, direction is out, payee is set",
    "value": {
     "distinct": "payee"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "90d",
    "compare": "none"
   },
   "metric.paid-times-by-payee-90d#0": {
    "metric": "paid-times-by-payee-90d",
    "name": "Times paid, by payee, 90 days",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on after -90d, on before +1d, direction is out",
    "value": {
     "count": "id"
    },
    "group_by": "payee",
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "90d",
    "compare": "none"
   },
   "metric.paid-last-by-payee#0": {
    "metric": "paid-last-by-payee",
    "name": "Last paid, by payee",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on after -90d, on before +1d, direction is out",
    "value": {
     "max": "on"
    },
    "group_by": "payee",
    "format": "day",
    "target": {
     "gte": 0
    },
    "window": "90d",
    "compare": "none"
   },
   "metric.kept-share-90d#0": {
    "metric": "kept-share-90d",
    "name": "Kept of money in, 90 days",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on after -90d, on before +1d",
    "value": {
     "ratio": {
      "of": {
       "sum": {
        "product": [
         "amount",
         {
          "lookup": "sign",
          "by": "direction"
         }
        ]
       }
      },
      "per": {
       "sum": {
        "product": [
         "amount",
         {
          "lookup": "in_only",
          "by": "direction"
         }
        ]
       }
      }
     }
    },
    "lookups": {
     "sign": {
      "in": 1,
      "out": -1
     },
     "in_only": {
      "in": 1,
      "out": 0
     }
    },
    "format": "pct",
    "target": {
     "gte": 0.2
    },
    "window": "90d",
    "compare": "none"
   },
   "metric.received-month#0": {
    "metric": "received-month",
    "name": "Money in this month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, direction is in, on at least bom",
    "value": {
     "sum": "amount"
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.left-month#0": {
    "metric": "left-month",
    "name": "Left over this month",
    "source": "register.transactions",
    "where": "state is cleared, transfer is false, stays is not true, on at least bom",
    "value": {
     "sum": {
      "product": [
       "amount",
       {
        "lookup": "sign",
        "by": "direction"
       }
      ]
     }
    },
    "lookups": {
     "sign": {
      "in": 1,
      "out": -1
     }
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.filed-for-you-30d#0": {
    "metric": "filed-for-you-30d",
    "pack": "money-core",
    "name": "Filed for you, 30 days",
    "source": "events.transactions",
    "where": "by is agent or door or rule",
    "value": {
     "count": "made"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.filed-today#0": {
    "metric": "filed-today",
    "pack": "money-core",
    "name": "Filed today",
    "source": "events.transactions",
    "value": {
     "count": "made"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "1d",
    "compare": "none"
   },
   "metric.account-now#0": {
    "metric": "account-now",
    "name": "This account now",
    "source": "register.accounts",
    "where": "name is {{it}}",
    "value": {
     "rolled": {
      "balance": "balance",
      "as_of": "as_of",
      "checks": [
       {
        "register": "balances",
        "by": "account",
        "balance": "balance",
        "on": "as_of"
       },
       {
        "register": "transactions",
        "by": "account",
        "balance": "balance_after",
        "on": "on"
       }
      ],
      "moves": {
       "register": "transactions",
       "by": "account",
       "on": "on",
       "amount": "amount",
       "direction": "direction",
       "out": "out",
       "where": "state is cleared"
      }
     }
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.account-lines#0": {
    "metric": "account-lines",
    "name": "This account by its lines",
    "source": "register.accounts",
    "where": "name is {{it}}",
    "value": {
     "rolled": {
      "balance": "balance",
      "as_of": "as_of",
      "moves": {
       "register": "transactions",
       "by": "account",
       "on": "on",
       "amount": "amount",
       "direction": "direction",
       "out": "out",
       "where": "state is cleared"
      }
     }
    },
    "format": "money",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "rule.invoice-chased#0": {
    "rule": "invoice-chased",
    "name": "Mark an invoice as chased",
    "pack": "money-core",
    "on": {
     "decided": {
      "about": "rule.invoice-late",
      "option": "Chase it"
     }
    },
    "steps": [
     {
      "set": {
       "field": "chased",
       "to": "{{trigger.day}}"
      }
     },
     {
      "note": "You chose to chase this in Decide."
     },
     {
      "if": {
       "all": [
        {
         "field": "chase_draft",
         "empty": true
        },
        {
         "field": "state",
         "is": "part"
        },
        {
         "field": "paid_so_far",
         "present": true
        }
       ]
      },
      "then": [
       {
        "set": {
         "field": "chase_draft",
         "to": "The invoice for {{short:amount}} was due on {{on:due}}, and {{short:amount-paid_so_far}} of it is still to pay. Could you tell me when the rest will be paid?"
        }
       }
      ]
     },
     {
      "if": {
       "all": [
        {
         "field": "chase_draft",
         "empty": true
        },
        {
         "none": [
          {
           "all": [
            {
             "field": "state",
             "is": "part"
            },
            {
             "field": "paid_so_far",
             "present": true
            }
           ]
          }
         ]
        }
       ]
      },
      "then": [
       {
        "set": {
         "field": "chase_draft",
         "to": "The invoice for {{short:amount}} was due on {{on:due}}. Could you tell me when it will be paid?"
        }
       }
      ]
     }
    ]
   },
   "page.money-plan#0": {
    "page": "money-plan",
    "title": "{{name}}",
    "for": {
     "register": "plans"
    },
    "nav": {
     "section": "Money",
     "order": 30
    },
    "icon": "calendar",
    "requires": [
     "register.plans",
     "register.installments"
    ],
    "pack": "money-core",
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "plan-parts:{{name}}",
       "lt": 1
      },
      "body": "No instalments for {{name}} yet."
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "all": [
        {
         "metric": "plan-parts:{{name}}",
         "gte": 1
        },
        {
         "metric": "plan-parts-open:{{name}}",
         "gte": 1
        }
       ]
      },
      "says": [
       {
        "when": {
         "metric": "property-value-of:{{name}}",
         "empty": false
        },
        "body": "{{plan-parts-paid:{{name}}}} of {{plan-parts:{{name}}}} parts paid, the last due on {{plan-last-due:{{name}}}}. [Property](/p/properties) has what it is worth and your equity."
       },
       {
        "body": "{{plan-parts-paid:{{name}}}} of {{plan-parts:{{name}}}} parts paid, the last due on {{plan-last-due:{{name}}}}."
       }
      ]
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "all": [
        {
         "metric": "plan-parts:{{name}}",
         "gte": 1
        },
        {
         "metric": "plan-parts-open:{{name}}",
         "lt": 1
        }
       ]
      },
      "says": [
       {
        "when": {
         "metric": "property-value-of:{{name}}",
         "empty": false
        },
        "body": "{{plan-parts-paid:{{name}}}} of {{plan-parts:{{name}}}} parts paid, and nothing is left. The last was due on {{plan-last-due:{{name}}}}. [Property](/p/properties) has what it is worth and your equity."
       },
       {
        "body": "{{plan-parts-paid:{{name}}}} of {{plan-parts:{{name}}}} parts paid, and nothing is left. The last was due on {{plan-last-due:{{name}}}}."
       }
      ]
     },
     {
      "kind": "stat",
      "heading": "Where it stands",
      "icon": "wallet",
      "tone": "bad",
      "span": 12,
      "when": {
       "metric": "plan-parts:{{name}}",
       "gte": 1
      },
      "cells": [
       {
        "metric": "plan-paid:{{name}}",
        "label": "Paid in"
       },
       {
        "metric": "plan-left:{{name}}",
        "label": "Left"
       },
       {
        "metric": "plan-late:{{name}}",
        "label": "Late"
       }
      ]
     },
     {
      "kind": "progress",
      "heading": "Parts paid",
      "icon": "credit-card",
      "span": 12,
      "cells": [
       {
        "metric": "plan-parts-paid-by-plan:{{name}}",
        "label": "Paid"
       },
       {
        "metric": "plan-parts-by-plan:{{name}}",
        "label": "Parts"
       },
       {
        "metric": "plan-next-due-by-plan:{{name}}",
        "label": "Next due"
       },
       {
        "metric": "plan-left-by-plan:{{name}}",
        "label": "Left"
       },
       {
        "metric": "plan-after-next-by-plan:{{name}}",
        "label": "Left after"
       }
      ],
      "when": {
       "metric": "plan-parts:{{name}}",
       "gte": 1
      },
      "empty": "No parts of {{name}} yet."
     },
     {
      "kind": "series",
      "heading": "Paid in all, over time",
      "icon": "chart-column",
      "span": 12,
      "series": [
       {
        "metric": "plan-paid-by-quarter:{{name}}",
        "label": "Paid in all",
        "running": true
       }
      ],
      "back": 24,
      "when": {
       "metric": "plan-parts-paid:{{name}}",
       "gt": 0
      },
      "empty": "Nothing paid on {{name}} yet."
     },
     {
      "kind": "todo",
      "heading": "Upcoming",
      "icon": "calendar-clock",
      "span": 12,
      "source": "register.installments",
      "where": "plan is {{name}}, state is open",
      "columns": [
       {
        "field": "what"
       },
       {
        "field": "note"
       },
       {
        "field": "due"
       },
       {
        "field": "amount"
       }
      ],
      "order": [
       {
        "field": "due",
        "dir": "asc"
       }
      ],
      "limit": 6,
      "empty": "Nothing left to pay on {{name}}."
     },
     {
      "kind": "table",
      "heading": "Paid",
      "icon": "receipt",
      "span": 12,
      "source": "register.installments",
      "where": "plan is {{name}}, state is paid",
      "columns": [
       {
        "field": "due",
        "label": "Due",
        "width": "13ch"
       },
       {
        "field": "what",
        "label": "Description",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "15ch",
        "align": "end"
       },
       {
        "field": "settled",
        "label": "Paid on",
        "width": "13ch"
       },
       {
        "field": "paid_by",
        "label": "Paid by",
        "width": "minmax(10ch,18ch)"
       }
      ],
      "order": [
       {
        "field": "due",
        "dir": "desc"
       }
      ],
      "limit": 120,
      "empty": "Nothing paid on {{name}} yet."
     },
     {
      "kind": "section",
      "heading": "Every part still to come",
      "icon": "calendar-clock",
      "span": 12,
      "fold": true
     },
     {
      "kind": "table",
      "span": 12,
      "source": "register.installments",
      "where": "plan is {{name}}, state is open",
      "columns": [
       {
        "field": "due",
        "label": "Due",
        "width": "13ch"
       },
       {
        "field": "what",
        "label": "Description",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "15ch",
        "align": "end"
       },
       {
        "field": "left_after",
        "label": "Left after",
        "width": "15ch",
        "align": "end"
       }
      ],
      "order": [
       {
        "field": "due",
        "dir": "asc"
       }
      ],
      "limit": 120,
      "empty": "Nothing left to pay on {{name}}."
     },
     {
      "kind": "table",
      "heading": "Cancelled",
      "icon": "calendar-x",
      "span": 12,
      "source": "register.installments",
      "where": "plan is {{name}}, state is cancelled",
      "columns": [
       {
        "field": "due",
        "label": "Due",
        "width": "13ch"
       },
       {
        "field": "what",
        "label": "Description",
        "width": "minmax(14ch,1fr)"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "15ch",
        "align": "end"
       }
      ],
      "order": [
       {
        "field": "due",
        "dir": "asc"
       }
      ],
      "limit": 120,
      "when": {
       "metric": "plan-parts-cancelled:{{name}}",
       "gte": 1
      }
     }
    ]
   },
   "page.money-bill#0": {
    "page": "money-bill",
    "title": "{{what}}",
    "for": {
     "register": "obligations",
     "fleeting": true
    },
    "icon": "obligation",
    "requires": [
     "register.obligations",
     "register.transactions"
    ],
    "pack": "money-core",
    "blocks": [
     {
      "kind": "cards",
      "lead": true,
      "span": 12,
      "source": "register.obligations",
      "where": "seq is {{seq}}",
      "columns": [
       {
        "field": "what",
        "as": "title"
       },
       {
        "field": "amount",
        "as": "figure"
       },
       {
        "field": "party",
        "label": "Who",
        "as": "fact"
       },
       {
        "field": "state",
        "label": "Status",
        "as": "fact"
       },
       {
        "field": "due",
        "label": "Due",
        "as": "when"
       }
      ],
      "limit": 1
     },
     {
      "kind": "table",
      "heading": "Still to pay",
      "icon": "calendar-clock",
      "span": 12,
      "source": "register.obligations",
      "where": "seq is {{seq}}, state is open or part",
      "columns": [
       {
        "field": "due",
        "label": "Due",
        "width": "13ch"
       },
       {
        "field": "amount",
        "label": "Amount",
        "width": "15ch",
        "align": "end"
       },
       {
        "field": "paid_so_far",
        "label": "Paid so far",
        "width": "15ch",
        "align": "end"
       },
       {
        "field": "state",
        "label": "Status",
        "width": "11ch"
       }
      ],
      "limit": 1
     },
     {
      "kind": "timeline",
      "heading": "Parts paid",
      "icon": "receipt",
      "span": 12,
      "source": "register.transactions",
      "where": "settles is {{spoken}}, state is not void",
      "columns": [
       {
        "field": "on"
       },
       {
        "field": "payee",
        "or": "what"
       },
       {
        "field": "amount",
        "sign": {
         "field": "direction",
         "minus": "out"
        }
       },
       {
        "field": "category"
       },
       {
        "field": "account"
       },
       {
        "field": "category",
        "as": "chip"
       }
      ],
      "order": [
       {
        "field": "on",
        "dir": "desc"
       }
      ],
      "limit": 12
     }
    ]
   },
   "script.offer_budgets#0": {
    "script": "offer_budgets",
    "title": "Offer a budget for each category from last month's spending",
    "pack": "money-core",
    "runs": {
     "every": "1d",
     "rule": true
    },
    "egress": [],
    "keys": [],
    "reads": [
     "categories",
     "transactions"
    ],
    "writes": [
     "categories"
    ],
    "limits": {
     "cpu_ms": 1000,
     "wall_ms": 30000
    },
    "source": "function roundUp(minor, exp) {\n  const unit = 10 ** exp;\n  const major = minor / unit;\n  if (!(major > 0)) return 0;\n  const mag = 10 ** Math.floor(Math.log10(major));\n  const lead = major / mag;\n  const step = Math.max(1, lead <= 2 ? mag / 5 : lead <= 5 ? mag / 2 : mag);\n  return Math.round(Math.ceil(major / step - 1e-9) * step * unit);\n}\nfunction said(minor, currency, exp) {\n  const major = Math.round(minor / 10 ** exp);\n  return `${currency} ${String(major).replace(/\\B(?=(\\d{3})+(?!\\d))/gu, ',')}`;\n}\nfunction budgetOffer(categories, entries, home, month, last) {\n  const EXP = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, HUF: 0, KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3 };\n  const exp = (c) => (Object.hasOwn(EXP, c) ? EXP[c] : 2);\n  const spent = new Map();\n  for (const e of entries) {\n    const by = e.fields.category;\n    const amount = e.fields.amount;\n    if (typeof by !== 'string' || by === '' || !amount || typeof amount.amount !== 'number' || typeof amount.currency !== 'string') continue;\n    const per = spent.get(by) ?? new Map();\n    per.set(amount.currency, (per.get(amount.currency) ?? 0) + amount.amount);\n    spent.set(by, per);\n  }\n  const offered = [];\n  let apart = 0;\n  for (const c of categories) {\n    const per = spent.get(c.id);\n    if (!per) continue;\n    const currencies = [...per.keys()];\n    const currency = currencies.length === 1 ? currencies[0] : null;\n    if (currency === null || (home && currency !== home)) {\n      apart += 1;\n      continue;\n    }\n    const minor = per.get(currency);\n    if (!(minor > 0)) continue;\n    const limit = roundUp(minor, exp(currency));\n    const name = typeof c.fields.name === 'string' && c.fields.name.trim() !== '' ? c.fields.name.trim() : 'A category';\n    offered.push({ c, name, limit, currency, minor });\n  }\n  if (offered.length === 0) return null;\n  offered.sort((a, b) => b.minor - a.minor || (a.name < b.name ? -1 : 1));\n  const MOST = 20;\n  const kept = offered.slice(0, MOST);\n  const each = kept.map((o) => `${o.name} ${said(o.limit, o.currency, exp(o.currency))}`);\n  const listed = each.length > 4 ? `${each.slice(0, 4).join(', ')} and ${each.length - 4} more` : each.length > 1 ? `${each.slice(0, -1).join(', ')} and ${each.at(-1)}` : each[0];\n  const one = kept.length === 1;\n  const left = apart === 0 ? '' : ` ${apart} spent in another currency ${apart === 1 ? 'is' : 'are'} left for you to set.`;\n  return {\n    cause: `money.budgets.${month}`,\n    question: one ? `Give ${kept[0].name} a budget of ${each[0].slice(kept[0].name.length + 1)} a month?` : `Use these monthly budgets? ${listed}.`,\n    about: 'Budgets',\n    options: [\n      {\n        id: 'use',\n        label: 'Use these',\n        because: `Each is what ${one ? 'it' : 'the category'} spent in ${last}, rounded up, and you can change any of them later.${left}`,\n        patches: kept.map((o) => ({ id: o.c.spoken, version: o.c.version, fields: { budget: { amount: o.limit, currency: o.currency } } })),\n      },\n      { id: 'not-now', label: 'Not now', because: 'No budget is set, and this is not offered again this month.' },\n    ],\n  };\n}\nexport default async function run(ctx) {\n  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);\n  const [y, m] = today.split('-').map(Number);\n  const first = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}-01`;\n  const month = today.slice(0, 7);\n  const lastY = m === 1 ? y - 1 : y;\n  const lastM = m === 1 ? 12 : m - 1;\n  const from = first(lastY, lastM);\n  const to = first(y, m);\n  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];\n\n  const PAGE = 50;\n  const every = async (list, tests) => {\n    const rows = [];\n    let below = null;\n    for (;;) {\n      const all = [...tests, ...(below === null ? [] : [{ field: 'seq', lt: below }])];\n      const page = await ctx.record.list(list, { all });\n      for (const r of page) rows.push({ id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });\n      if (page.length < PAGE) return rows;\n      below = Math.min(...page.map((r) => r.seq));\n    }\n  };\n\n  const categories = (await every('categories', [{ field: 'state', is: 'live' }, { field: 'direction', is: 'out' }])).filter(\n    (c) => c.fields.budget === null || c.fields.budget === undefined || c.fields.budget === '',\n  );\n  if (categories.length === 0) {\n    ctx.log('Every category money goes out on has a budget, so none was offered.');\n    return null;\n  }\n  const entries = await every('transactions', [\n    { field: 'state', is: 'cleared' },\n    { field: 'transfer', is: false },\n    { field: 'direction', is: 'out' },\n    { field: 'on', gte: from },\n    { field: 'on', lt: to },\n  ]);\n  const config = ctx.config && typeof ctx.config === 'object' ? ctx.config : {};\n  const home = typeof config.home_currency === 'string' && /^[A-Z]{3}$/u.test(config.home_currency.trim()) ? config.home_currency.trim() : null;\n  const ask = budgetOffer(categories, entries, home, month, MONTHS[lastM - 1]);\n  if (ask === null) {\n    ctx.log(`Nothing was spent in ${MONTHS[lastM - 1]} on a category with no budget, so none was offered.`);\n    return null;\n  }\n  ctx.log(`${ask.options[0].patches.length} budget(s) offered from ${MONTHS[lastM - 1]}'s spending, waiting on your answer.`);\n  return { offered: ask.options[0].patches.length, ask };\n}"
   }
  }
 },
 "people": {
  "version": "4.0.0",
  "now": "4.2.2",
  "added": [
   "metric.organisations-known#0"
  ],
  "was": {
   "page.people#0": {
    "page": "people",
    "title": "People",
    "nav": {
     "section": "People",
     "order": 10,
     "place": 50
    },
    "icon": "people",
    "requires": [
     "register.people",
     "register.organisations"
    ],
    "blocks": [
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "people-quiet",
       "is": 0
      },
      "body": "{{questions-open-in:people}} question(s) for you, {{people-count}} contact(s)"
     },
     {
      "kind": "note",
      "lead": true,
      "span": 12,
      "when": {
       "metric": "people-quiet",
       "gt": 0
      },
      "body": "{{questions-open-in:people}} question(s) for you, {{people-quiet.first}} has been quiet since {{people-quiet.since}}, and {{people-quiet.more}} other(s) have too"
     },
     {
      "kind": "queue",
      "heading": "Waiting on you",
      "icon": "ask",
      "span": 12,
      "source": "governance.open",
      "where": "list is people",
      "limit": 3,
      "when": {
       "metric": "questions-open-in:people",
       "gt": 0
      }
     },
     {
      "kind": "note",
      "span": 12,
      "when": {
       "metric": "held-twice",
       "gt": 0
      },
      "body": "{{held-twice-shown}} people may be on this record twice, {{held-twice}} too many. [See them](/r/people?twice=1)."
     },
     {
      "kind": "cards",
      "heading": "Everyone",
      "icon": "people",
      "span": 6,
      "source": "register.people",
      "where": "merged_into is empty, self is not true",
      "columns": [
       {
        "field": "name",
        "label": "Name",
        "as": "who"
       },
       {
        "field": "note",
        "label": "Who they are",
        "as": "reply"
       },
       {
        "field": "projects",
        "label": "Met in",
        "as": "fact"
       },
       {
        "field": "in_touch",
        "label": "Last spoke",
        "as": "when"
       }
      ],
      "order": [
       {
        "field": "in_touch",
        "dir": "desc"
       },
       {
        "field": "seq",
        "dir": "desc"
       }
      ],
      "limit": 50,
      "empty": "Nobody yet. Add someone, or an agent adds whoever it meets in a commit or a mail."
     },
     {
      "kind": "table",
      "heading": "Organisations",
      "icon": "building",
      "span": 6,
      "source": "register.organisations",
      "where": "merged_into is empty, retired_on is empty, kind is set",
      "when": {
       "metric": "organisations-count",
       "gt": 0
      },
      "columns": [
       {
        "field": "name",
        "label": "Organisation",
        "width": "minmax(14ch,2fr)"
       },
       {
        "field": "kind",
        "label": "Kind",
        "width": "10ch"
       }
      ],
      "order": [
       {
        "field": "name",
        "dir": "asc"
       }
      ]
     },
     {
      "kind": "note",
      "span": 6,
      "when": {
       "metric": "organisations-from-card-texts",
       "gt": 0
      },
      "body": "{{organisations-from-card-texts}} shop(s) from card texts, {{organisations-from-card-texts.names}}, kept apart from the organisations. [See them](/r/organisations)."
     },
     {
      "kind": "agents",
      "heading": "What agents did",
      "icon": "activity",
      "span": 12,
      "source": "activity",
      "where": "list is people or organisations",
      "first": 3
     }
    ]
   },
   "metric.people-in-touch-30d#0": {
    "metric": "people-in-touch-30d",
    "name": "In touch, 30 days",
    "source": "register.people",
    "where": "in_touch after -31d",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none",
    "snapshot": {
     "grain": "day",
     "into": "series.people-in-touch-30d"
    }
   },
   "metric.people-in-touch-12w#0": {
    "metric": "people-in-touch-12w",
    "name": "In touch, 12 weeks",
    "source": "register.people",
    "where": "in_touch after -84d",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.people-in-touch-90d#0": {
    "metric": "people-in-touch-90d",
    "name": "In touch, 3 months",
    "source": "register.people",
    "where": "in_touch after -91d",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.organisations-count#0": {
    "metric": "organisations-count",
    "name": "Organisations",
    "source": "register.organisations",
    "where": "merged_into is empty, retired_on is empty, kind is set",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.people-quiet#0": {
    "metric": "people-quiet",
    "name": "Quiet for three months",
    "source": "register.people",
    "where": "in_touch before -90d",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   }
  }
 },
 "portfolio": {
  "version": "1.30.0",
  "now": "1.30.2",
  "added": [],
  "was": {
   "register.things#0": {
    "register": "things",
    "icon": "thing",
    "name": "Projects",
    "one": "project",
    "holds": "what you are building, and the plan for each",
    "title": "name",
    "mobile": [
     "name",
     "lane",
     "revenue"
    ],
    "state": "lane",
    "pack": "portfolio",
    "identity": {
     "mark": "mark",
     "accent": "hue"
    },
    "scopes": {
     "repos": "repos",
     "folders": "folders"
    },
    "delete": "refuse_while_referenced",
    "fields": [
     {
      "id": "name",
      "type": "text",
      "required": true,
      "search": true
     },
     {
      "id": "about",
      "label": "About",
      "type": "text",
      "search": true
     },
     {
      "id": "kind",
      "label": "Kind",
      "type": "enum",
      "values": [
       "business",
       "client",
       "product",
       "content"
      ],
      "labels": {
       "business": "Business",
       "client": "Client work",
       "product": "Product",
       "content": "Content"
      },
      "index": true
     },
     {
      "id": "lane",
      "label": "Status",
      "type": "enum",
      "values": [
       "building",
       "earning",
       "parked",
       "retired"
      ],
      "labels": {
       "building": "Building",
       "earning": "Earning",
       "parked": "Parked",
       "retired": "Finished"
      },
      "index": true,
      "required": true
     },
     {
      "id": "revenue",
      "label": "Earned in a year",
      "type": "money"
     },
     {
      "id": "earned_before",
      "label": "Earned the year before",
      "type": "money"
     },
     {
      "id": "since",
      "type": "day"
     },
     {
      "id": "health",
      "label": "Health",
      "type": "enum",
      "values": [
       "on_track",
       "at_risk",
       "off_track"
      ],
      "labels": {
       "on_track": "On track",
       "at_risk": "At risk",
       "off_track": "Off track"
      },
      "index": true
     },
     {
      "id": "next",
      "label": "Next step",
      "type": "text"
     },
     {
      "id": "progress",
      "label": "How far along",
      "type": "decimal",
      "unit": "%",
      "min": 0,
      "max": 100
     },
     {
      "id": "aim",
      "label": "Aiming for",
      "type": "day",
      "index": true
     },
     {
      "id": "agent",
      "label": "Agent",
      "type": "text",
      "index": true
     },
     {
      "id": "draft",
      "label": "Not kept yet",
      "type": "bool",
      "default": false,
      "hidden_from_agents": true
     },
     {
      "id": "mark",
      "type": "text",
      "hidden_from_agents": true
     },
     {
      "id": "hue",
      "type": "int",
      "hidden_from_agents": true
     },
     {
      "id": "note",
      "type": "document"
     },
     {
      "id": "repos",
      "label": "Repositories",
      "type": "list",
      "of": "text"
     },
     {
      "id": "folders",
      "label": "Folders",
      "type": "list",
      "of": "text"
     },
     {
      "id": "domains",
      "label": "Domains",
      "type": "list",
      "of": "text"
     },
     {
      "id": "drawn_as",
      "label": "Plan drawn as",
      "type": "enum",
      "values": [
       "path",
       "roadmap"
      ],
      "labels": {
       "path": "Its stages",
       "roadmap": "A roadmap"
      }
     },
     {
      "id": "tags",
      "type": "list",
      "of": "text"
     }
    ]
   },
   "metric.projects-not-in-play#0": {
    "metric": "projects-not-in-play",
    "name": "Parked or finished",
    "source": "register.things",
    "where": "lane is parked or retired",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   },
   "metric.projects-retired#0": {
    "metric": "projects-retired",
    "name": "Finished",
    "source": "register.things",
    "where": "lane is retired",
    "value": {
     "count": "id"
    },
    "format": "int",
    "target": {
     "gte": 0
    },
    "window": "30d",
    "compare": "none"
   }
  }
 }
};

const keyOf = (d: Body): string =>
  ['register', 'metric', 'page', 'rule', 'script', 'door', 'pattern'].map((k) => (typeof d[k] === 'string' ? `${k}.${String(d[k])}` : '')).find(Boolean) ?? JSON.stringify(d);

/**
 * A module's document as it was before round 1030: what the round added taken off, and what it changed put back. Only a
 * document at the version this build ships is turned back, so a document already turned back is left as it is.
 */
export function before1030(id: string, doc: Body): Body {
  const was = BEFORE_1030[id];
  if (was === undefined || doc.version !== was.now) return doc;
  const seen = new Map<string, number>();
  const declarations = (doc.declarations as Body[]).flatMap((d) => {
    const k = keyOf(d);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    const at = `${k}#${n}`;
    if (was.added.includes(at)) return [];
    return [was.was[at] ?? d];
  });
  return { ...doc, version: was.version, declarations };
}
