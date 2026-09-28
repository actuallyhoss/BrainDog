# The inbox and doors

Things arrive in your record on their own: forwarded mail, bank texts, what a phone or another service posts, what a connected service reports. A rule files what it recognises into the right list. Anything no rule claims waits in the Inbox for you.

## Ways in

```comparison | How things reach your record
Door | What sends to it | Where you set it up
Forwarded mail | A forwarding rule at your mail provider | Settings, under Ingest
A web address | A phone shortcut, a script, another service's webhook | Automations, under Doors, and Settings, under Ingest
A connector | Stripe, Mercury and other add-ons that fetch on a clock | Add-ons
A report key | A project sending its own numbers to a page | On that page, under Send numbers here
```

## Forward your mail

```steps
Make an address | It is shown once, so copy it before you leave the screen | Settings, under Ingest
Point a forwarding rule at it | Your mail provider posts each message to the address | At your mail provider
Watch the Inbox | Each message arrives as a row in the Inbox, until a rule files it | In the Inbox
```

One record takes one mail address at a time. Making a new address replaces the old one, which is also how you deal with one that has leaked. **Stop taking forwarded mail** turns it off, and anything still posted to the old address is refused.

A message whose forwarder did not report that the sender passed the mail checks (DKIM or SPF) is kept unfiled, rather than matched against your rules.

Making or stopping an address needs a sign-in from the last fifteen minutes, because it decides where your statements go.

## Web addresses that take things in

A door is a web address a phone, a script or another service posts to, and what arrives is written to the list the door names. To add one, ask an agent to set it up and approve the change it proposes on Decide. Then make its address:

- **Make the address** shows it once. Copy it before you leave the screen.
- Send each item as the body of a POST to the address. The address is the whole of the check, so nothing else needs setting up.
- **Make a new address** replaces the one in use. Anything still posting to the old one is turned away at once.

BrainDog keeps only a fingerprint of an address, so it cannot show you one again. If you have lost it, make a new one.

## The Inbox

The Inbox is what the rules did not claim. Each arrival leads with its subject, then who sent it and the first words, then when it came. Its text is always shown as plain text, never run or drawn as a page.

```steps
Open it | Enter opens the arrival under the cursor | In the Inbox
File it | Choose the list, then File it (or e). It becomes a row there and leaves the Inbox | In the Inbox
Or archive it | Archive this (or Delete) keeps it, out of the way | In the Inbox
```

Select several with x to file or archive them at once. What left the Inbox is still listed, under Filed and Archived, each line saying who filed or archived it: you, a colleague, an agent or a rule. What a person or an agent filed or archived can be put back in the Inbox.

The top of the Inbox counts what the rules filed this week and what still waits.

## Teach it a rule

Arrivals that are alike are drawn together. Once three or more alike are waiting, the group offers two ways to make a rule:

- **Ask Slash for a pattern**, where the host has a model. Slash drafts a rule from them and puts it on Decide. Drafting a pattern is Slash's background work, so it does not spend your asks.
- **Make a rule from these** opens the pattern builder. Select the words in a sample that give the amount, the date or the name, and the builder finds them again in every sample, showing how many it matched. Try it, then save it.

When the owner saves a rule, what it reads waits on Decide until they press **Trust it now**. A colleague's rule is sent to the owner as a proposal. Once a rule is trusted, arrivals like those are filed as they come in, with no Slash and no asks.

## Connectors

A connector is an add-on that fetches on a clock. Stripe reads your balance and the payouts on their way to the bank. Mercury reads your account balances and recent transactions. Card alerts reads a card alert, forwarded by mail or posted as a text, into Money as a transaction.

Installing one shows each service it will call, with which key and how often, before you accept. Its key lives in the Vault. Each connector is listed under Automations, under Scheduled, and says when it last ran and why it paused, if it did. A figure fed by one that has stopped shows a gap and says it is stale, rather than holding yesterday's number.

## Agents and the Inbox

An agent you connect reads the Inbox only if you allowed it to when you connected it. It can then read the arrivals no rule has filed yet, and it cannot file or archive them. See [Agents](/docs/agents).
