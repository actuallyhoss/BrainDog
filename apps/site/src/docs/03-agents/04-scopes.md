# Scopes: what an agent may do

Every agent works under a token, and every token has one of three scopes: read, propose or write. Each opens what the one before it does and a little more. None of them lets an agent decide for you.

## The three scopes

```comparison | The ladder
Scope | What it opens | What it is for
Read | Every read tool and resource the person behind the token can read | An agent that answers questions
Propose | Read, and putting questions to you with propose; keeping its session with handoff; recording people with meet | An agent that works beside you and asks before anything changes
Write | Propose, and changing rows directly with create, update and log | An agent you trust with your lists
```

A token made from the command line reads unless you ask for more. A machine signed in with `braindog login` or `braindog setup` can write. A client that connects by address lets you pick on the consent screen.

## A token is always somebody's

A token carries the person who made it and can never do more than they can. What it reaches is the smaller of its scope and that person's levels, list by list, checked on every call. So a colleague who may only read the Clients list gets a token that only reads it, whatever its scope says; if you take their access away, their tokens stop with it; and if you suspend them, their agents stop too.

A list the token cannot read stays out of its answers: a search does not reach it, and a block on a page that reads it is withheld rather than drawn.

## What always needs you

There is no admin scope, and there never will be one. These need somebody signed in to the app:

- answering a question in Needs you, which no token reaches;
- inviting or removing people;
- making, listing and revoking tokens, report keys and door addresses;
- installing, removing and turning off packs;
- running an automation now, and starting a paused one again;
- exporting the record, putting it back, and deleting it;
- listing and revoking what each key opens.

An agent that wants one of these asks with `propose`, and you decide. Some fields are marked the same way: a skill's text, for one, only changes when you accept a proposal.

## One operation at a time

A few of those can be started from the command line: `braindog export`, `braindog import` and `braindog token create`. Each one prints six digits for you to approve in the app, and the approval opens that one operation, once, for ten minutes. It is never a standing permission.

## What a refusal says

```comparison | Refusals about reach
Status | Code | What it means
403 | FORBIDDEN | Outside what this token may reach. The sentence says what it lacks
403 | LEVEL_REQUIRED | The list is in reach, but the level on it is too low for this
403 | NEEDS_BROWSER_SESSION | Only a person signed in to the app can do this
401 | UNAUTHORIZED | The token is wrong, ended or revoked
```

A 403 will not change on a retry. Ask for a token that reaches further, or `propose` the change instead.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/app/<slug>
```
