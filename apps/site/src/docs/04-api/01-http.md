# The HTTP API

Everything an agent does over MCP, a script can do over plain HTTP: one address per method, a token in the header, and one shape for every answer. The app and the command line use the same methods.

## Calling a method

Each method is at `https://brain.dog/api/<method>`. The token names the record, so the address does not. A read may be a GET with its arguments in the query string, or a POST with a JSON body; a write is always a POST.

```code | sh
curl -s "https://brain.dog/api/get?spoken=tasks%2341" -H "Authorization: Bearer $BRAINDOG_TOKEN"
curl -s https://brain.dog/api/list -H "Authorization: Bearer $BRAINDOG_TOKEN" -H "content-type: application/json" -d '{"register": "tasks", "where": {"field": "state", "is": "open"}, "limit": 50}'
curl -s https://brain.dog/api/update -H "Authorization: Bearer $BRAINDOG_TOKEN" -H "content-type: application/json" -d '{"register": "tasks", "seq": 41, "patch": {"state": "done"}, "version": 3, "note": "Sent on Friday."}'
```

The row is `tasks%2341` in the first line because `#` has to be written `%23` in an address. A body is at most one megabyte. A method the host does not know is answered 404, with every method's name in `allowed`.

## The answer

Every answer is one of three shapes: the value, a refusal, or a conflict.

```code | json
{"ok": true, "value": {}}
{"ok": false, "refusal": {"code": "OUT_OF_BOUNDS", "fix": "A note is at most 280 characters, and this one is 312.", "at": "note"}}
{"ok": false, "conflict": {"version": 4}}
```

`fix` is a sentence saying what to change, and `at` names the argument it is about. A conflict says the version the row is at now, which is the one to read and send again. The status carries the same news for anything that reads statuses:

```comparison | Statuses
Status | What it means | What to do
200 | It worked | Read value
422 | A refusal about what was sent | Change what at names, then send it again
409 | Somebody changed the row since you read it | Read it again and apply your change to the new copy
401 | The token is wrong, ended or revoked | Get a new one
403 | Out of this token's reach, or a person's in the app only | Nothing on a retry. Propose it, or ask for more
400 | The body is not a JSON object | Send one
404 | No method by that name | Check the name against allowed
405 | A write sent as a GET | Send it as a POST
413 | The body is too big | Send less
429 | Too many requests this minute | Wait the seconds in Retry-After
503 | The record is not available for now | Try again later
```

## What a token may call

A token reaches the record's reads and its everyday writes, each held to the token's scope and the levels of the person who made it.

```comparison | Reads
Method | What it answers
boot | What the record holds, how many rows each list has, and who is asking
whoami | Who you are to this record, and which verbs you reach
schema, get, list, search, history | Lists and rows, as the MCP tools of the same names give them
backlinks | What points at one row, from the other lists
whatsNew, recentHistory | What changed, newest first, held to what you may see
context, sessionsLive | The briefing, and who else is working now
pages, page, metric, figures | Pages with every block worked out, and figures
governance, comments | Questions, decisions and predictions, and the comments on a row
packs, packConfig, arrangement | How the record is arranged
actions, automations, scripts | What runs on its own, and how its runs went
views, view | A list's saved views
usedBy | Which sessions used one key or one tool
inbox | The inbox, for a token given the inbox reach
```

```comparison | Writes
Method | What it does
create, update, log | Add a row, change one against its version, or add a note
propose | Put a question in front of a person. It changes nothing by itself
attach, handoff | Say which session this agent is, and keep its handoff true
meet | Someone met in the work
comment, resolveComment | Say something about a row, and resolve a comment
triage | File or set aside an arrival, for a token given the inbox reach
report | Send rows with a report key, and nothing else
previewPage, previewChange | Draw a page or a change nobody has installed. Nothing is written
checkAutomation, tryAutomation, scriptTry | Try an automation or a script before proposing it. Nothing is written, and a script's try counts as a run
```

The rest (members and invitations, tokens, packs, exports, the vault) takes a person signed in to the app. [Scopes](/docs/agents/scopes) lists it.

## How fast

Each token may make 600 reads and 120 writes a minute. Past either, the answer is 429 with the seconds to wait. [Usage and limits](/docs/api/usage) has the rest.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://brain.dog/app/<slug>
```
