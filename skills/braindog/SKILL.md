---
name: braindog
description: Read and write the person's BrainDog record, the shared memory of their work, projects, money, keys and decisions that every agent working for them uses. Reach for it when you start work, when you need to know what was decided or what leads, when you finish something worth keeping, and whenever the person mentions their record, a task, a decision, a figure or a key.
---

# BrainDog

BrainDog is one person's record of their business: lists of typed rows (tasks, money, domains, people, decisions,
whatever their packs declare), pages that draw those rows, and a history nothing can rewrite. You and every other agent
they use read and write the same rows they do. Every write names who made it and when.

## Connecting

There are two ways in, and both give you the same tools.

- **Over HTTP**, at `https://brain.dog/mcp` (or the self-hosted address the person gives you), with a token in the
  `Authorization` header:

  ```json
  { "type": "http", "url": "https://brain.dog/mcp", "headers": { "Authorization": "Bearer <token>" } }
  ```

  The person mints the token in the app, or with `braindog token create --scope read|propose|write`. A token reads
  unless its scope says more.

- **On their machine**, through the command line: `braindog setup https://brain.dog/app/<slug>` signs in, adds the
  hooks and this skill, and registers `braindog mcp`, which serves the record over standard input and output with the
  sign-in the CLI keeps. No token is ever written into a config file that way.

Never put a token in a row, a note, a commit or a message.

## What to read first

1. Call `context`. It names your session, the project you are in, and the rules and skills that apply here.
2. Read `braindog:page/home` when the record has one: it is what the person has said leads.
3. `record_index` lists what the record holds, and `schema` gives one list's fields before you write to it.

Then use `get`, `list` and `search` for rows, `history` for how one changed, and `governance` for what is proposed,
decided and predicted.

## The rules you keep

- **Money is an integer in minor units with its currency.** Divide by 100 for GBP before saying it, by 1 for JPY, by
  1000 for KWD. Never add two currencies.
- **Writes are compare-and-set.** Send the version you read. On `VERSION_STALE`, read the row again and apply your change
  to the new copy; never resend the copy you held.
- **You never decide.** Lay out the options with `propose` and the person picks in their app.
- **You propose, and never write, anything that runs without a person.** Automations, rules, a pack, a skill's text,
  where a key applies: each goes through `propose` (read `braindog:grammar/automations` or `braindog:grammar/proposals`
  first), is tried against a sample, and runs only once the person accepts it.
- **Keys go in through the deposit door, never through you.** `braindog keys put "<label>"` reads the value from
  standard input. The record keeps what a key opens, never the key.
- **Say what you are doing.** Call `handoff` once you know the task, and again before you stop with the one next step.
  Record a dead end in `tried` when you rule it out. Record a learning only when a future session would otherwise get
  something wrong.
- **Write for a phone.** Short, plain sentences. A `note` is one sentence a person reads in six weeks.

## Refusals you will meet

A refusal is an answer, not an error to retry. It carries a code, a sentence naming the field (`at`) and the fix.
Correct the call and send it again changed, never unchanged.

| Code | What it means | What to do |
|---|---|---|
| `VERSION_STALE` | Someone wrote the row after you read it. | Read it again and re-apply your change. |
| `REQUIRED_MISSING`, `VALUE_MALFORMED`, `FIELD_UNKNOWN` | The call's shape is wrong at `at`. | Read `schema` for that list and fix that field. |
| `FORBIDDEN` | Your token's scope, or who you are, does not reach this. The sentence says which. | Propose it instead, or tell the person what scope you need. |
| `NEEDS_BROWSER_SESSION` | Only the person, signed in to the app, can do this (the vault, an approval). | Tell them what to do there. |
| `UNAUTHORIZED` | The token is missing, expired or revoked. | Ask the person for a new one, or to run `braindog login`. |
| `RATE_LIMITED` | Too much at once. | Wait the `retry_after` it gives. |
| `CURRENCY_UNKNOWN` | An amount names a currency no rate exists for. | Use the ISO code, as in `GBP`. |

Any other code works the same way: its sentence names the field and the fix, so read it before trying anything else.
