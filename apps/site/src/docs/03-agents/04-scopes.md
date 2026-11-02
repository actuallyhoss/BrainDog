# Scopes: what an agent may do

Every agent works under a token, and every token has one of three scopes: read, propose or write. Each opens what the one before it does and a little more. None of them lets an agent decide for you: a write token acts on its own only where you tell it to, passing your words.

## The three scopes

```comparison | The ladder
Scope | What it opens | What it is for
Read | Every read tool and resource the person behind the token can read | An agent that answers questions
Propose | Read, and putting questions to you with propose; keeping its session with handoff; recording people with meet | An agent that works beside you and asks before anything changes
Write | Propose, and changing rows directly with create, update and log | An agent you trust with your lists
```

A token made from the command line reads unless you ask for more. A machine signed in with `braindog login` or `braindog setup` can write. A client that connects by address lets you pick on the consent screen.

## A token is always somebody's

A token carries the person who made it and can never do more than they can. What it reaches is the smaller of its scope and that person's levels, list by list, checked on every call. So a colleague who may only read the Clients list gets a token that only reads it, whatever its scope says; if you take their access away, their tokens stop with it; and if you suspend them, their agents stop too. The owner sees every colleague's agents in Settings › Agents, under Colleagues' agents, with when each was last used, and can revoke any of them. If you hand your BrainDog over, your own tokens drop to Can decide with you at once.

A list the token cannot read stays out of its answers: a search does not reach it, and a block on a page that reads it is withheld rather than drawn.

## What always needs you

There is no admin scope, and there never will be one. These need somebody signed in to the app:

- answering a question in Needs you, which no token reaches on its own. When you tell an agent the answer, it may pass it on with your words as `said`, while "Agents answer when you say so" is on in Settings › Agents. It never answers a question it asked itself, one somebody else asked, or one about a key or an amount of money;
- inviting people, changing what they can do, stopping or removing them;
- handing ownership over, or making somebody an owner;
- making, listing and revoking tokens, report keys and door addresses;
- installing, removing and turning off packs;
- running an automation now, and starting a paused one again;
- exporting your BrainDog, putting it back, and deleting it;
- listing and revoking what each key opens.

A write token asks before money, keys and deletes. When you tell it to make one of those changes, it passes your words as `said` and a delete goes through; money and keys still wait for you in BrainDog.

## Letting your own agents act without asking

Settings › Agents has one switch for the owner: **Let your agents do everything without asking**. Off, agents ask before deletes, money, keys, add-ons and settings, and after reading things from outside. On, your own agents do anything you can do here without asking: money, settings, add-ons, your team, sharing, making keys, imports and exports. Each change still names its agent and can be undone.

The switch never covers three things:

- giving this BrainDog to someone else;
- deleting the whole BrainDog, or erasing a person for good;
- reading a key's value. A key is only ever added with `braindog keys put`, and an agent's export leaves the keys' sealed bytes out.

An agent also never makes an owner, changes one, or changes the owner it acts for, and paying stays in Billing. The switch covers only the owner's own agents, with a key that writes across the whole BrainDog. A colleague's agents are never covered: they ask, and never do more than their person may. An agent may turn the switch off, never on.

With the switch off, **Agents answer when you say so** lets an agent do the same things when you tell it to: it sends your words as `said` with the call, and they are kept beside what it did.

Otherwise an agent that wants one of these asks with `propose`, and you decide. Some fields are marked the same way: a skill's text, for one, only changes when you accept a proposal.

## One operation at a time

A few of those can be started from the command line: `braindog export`, `braindog import` and `braindog token create`. Each one prints six digits for you to approve in the app, and the approval opens that one operation, once, for ten minutes. It is never a standing permission.

## What a refusal says

```comparison | Refusals about reach
Status | Code | What it means
403 | FORBIDDEN | Outside what this token may reach. The sentence says what it lacks
403 | LEVEL_REQUIRED | The list is in reach, but the level on it is too low for this
403 | NEEDS_BROWSER_SESSION | Only a person signed in to the app can do this, unless the owner lets their own agents do everything without asking
401 | UNAUTHORIZED | The token is wrong, ended or revoked
```

A 403 will not change on a retry. Ask for a token that reaches further, or `propose` the change instead.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```
