# The tools, by purpose

An agent reaches your BrainDog through a short list of MCP tools. Some only read; the rest write, and every write lands in History under the agent's name, like any change you make yourself.

Each example below is the tool's name and the arguments it is sent. A row is named the way a person says it: `tasks#41`, a list and its number, or a prefixed id such as `S42`.

## Finding your way

`context` is the first call and the briefing for where the agent is: what you told it, its session and project, open work, questions waiting on you, who else is working, the keys and servers it may use (by name, never a value), skills and learnings. `record_index` says what your BrainDog holds: its lists, how many rows each has, its figures and its version. It is the cheap way to learn list names. Given a list, it answers that list's fields, their types and what each may take, which is worth reading before a write.

```code | text
context {}
record_index {}
record_index {"register": "tasks"}
```

## What you told it

`instructions` is how an agent answers what you tell it from the app. With nothing sent it reads what is waiting for it; `take` claims one so no other agent starts on it; `reply` answers it with what was said and how it ended: done, needs you, or declined. `context` puts what you told it first, so an agent sees it before anything else.

```code | text
instructions {}
instructions {"take": "IN4"}
instructions {"reply": "IN4", "said": "Sent the March invoices.", "state": "done"}
```

## Reading rows

`get` reads one row or one figure. `list` reads the rows of one list, newest first, narrowed by a predicate. A list of 60 rows or fewer comes back whole; a longer one comes 20 at a time, and `limit` asks for up to 100. The `cursor` the last answer gave reads the next page. Long text is cut at 280 characters and the row says so; name the field in `fields` to have it whole. `search` finds rows whose words match across every list the agent can see, up to 100. `get` with `history` also gives the writes that made the row, in order, each with who and when.

```code | text
get {"spoken": "tasks#41"}
list {"register": "tasks", "where": {"field": "state", "is": "open"}, "limit": 50}
search {"q": "invoice march"}
get {"spoken": "tasks#41", "history": true}
```

Scripts and automations are read by name too. `get` answers one by its id or its whole title, with dashes, spaces and capitals read alike, so `bake-numbers`, `Bake numbers` and `script.bake_numbers` are the same script: what it reads and writes, its next and last run, and the rules that start it. An automation also says why it is idle and its last five runs. `list` with `scripts` or `automations` gives them a line each.

```code | text
get {"spoken": "bake-numbers"}
list {"register": "scripts"}
list {"register": "automations"}
```

When `get` finds nothing by that name and search turns up one row, the answer starts with "Nothing is called" so the agent knows it is a guess. A list named by one word of its name, such as `runs` for Agent runs, gets the right name back as a `try`.

## Catching up

`activity` is what changed across your BrainDog lately, newest first, 20 at a time unless `limit` asks for up to 100, paged with `cursor`: each write, the row it touched and who made it. It is how one session picks up after another. `governance` is what has been proposed and not yet answered, what was decided and why, and what was predicted.

```code | text
activity {"limit": 50}
governance {"status": "open"}
governance {"register": "decision", "id": "D12"}
```

## Changing things

`create` adds a row and answers with the number it was given. `update` changes a row and sends the version it read; a field set to null is cleared, and `deleted_at: true` deletes the row. `log` adds a note to a row and changes nothing else, and with no row named the note goes on the agent's own session. A note longer than 280 characters is kept as several notes, in order, up to 1,400; a longer one goes on the row as a page.

```code | text
create {"register": "tasks", "fields": {"what": "Send the March invoices"}, "note": "Asked for in today's call."}
update {"spoken": "tasks#41", "patch": {"state": "done"}, "version": 3}
log {"spoken": "tasks#41", "note": "Waiting on the client's reply."}
```

`propose` puts a question in front of you with what the agent would do about it. It changes nothing until you answer in Needs you. The body is options, a set of row changes, a change to a list's shape, or a pack, settings or arrangement change.

```code | text
propose {"question": "Which client should we chase first?", "body_kind": "options", "body": {"options": [{"id": "a", "label": "Northwind", "because": "Two invoices are overdue."}, {"id": "b", "label": "Contoso", "because": "The larger balance."}]}}
```

## Anything else the app does

`act` makes any call the app makes, by its name, with the agent's own grant: settings, plugins and their settings, automations, boards, books, sharing, Needs you, export. `braindog:calls` lists every call it makes and what each takes. A client that reads no resources can ask `act` itself: the call `calls` with a word in `q` lists the calls whose name or line holds it. A call that is misnamed is refused with the nearest one as its `try`. The record decides who may make each one, as it does in the app, and a change the agent's rung asks about waits on Needs you. What only you do in a browser (a plugin on or off, its settings, a declaration, taking a key out of service) is asked instead, and lands when you say yes. A key's value never passes through it either way.

```code | text
act {"call": "calls", "args": {"q": "automation"}}
act {"call": "setZone", "args": {"tz": "Africa/Cairo"}}
act {"call": "sameValues", "args": {"register": "datapoints", "fields": ["name", "thing", "at", "value"]}}
```

Every write ends in a receipt line that names what was done and the batch to undo it with, and `act {"call": "undoOwn", "args": {"batch": "..."}}` puts that write back. It will not touch anybody else's writes, and `dry` shows what would go back without doing it.

## Keeping the session

`handoff` keeps the session's handoff true: what it is doing, the one next step, a dead end it tried, a line of reasoning, and its state (`idle`, `handoff` to ask another session to take it on, or `done`). `tried` and `note` add to what is there. `meet` records someone the agent came across in the work, matched by email or handle and added if new, and links them to the project with where they were met.

```code | text
handoff {"doing": "Reconciling March", "next": "Match the two unpaid invoices to their payments."}
handoff {"tried": "Matching by amount alone: three payments share the same total."}
meet {"name": "Ada Park", "email": "ada@example.com", "where": "session in site"}
```

## The inbox

`triage` files one arrival from the inbox as a row in a list, or sets it aside. Only a token its owner gave the inbox reach may call it; [the inbox reach](/docs/agents/inbox) says how.

```code | text
triage {"arrival": "<id from braindog:inbox>", "register": "obligations"}
triage {"arrival": "<id from braindog:inbox>", "ignore": true}
```

## When a call is refused

A refusal names the field and the fix, such as "A note is at most 280 characters, and this one is 312." Correct the call and send it again; the same call sent unchanged is refused the same way. A write the token's scope does not reach is refused with what it lacks, and [scopes](/docs/agents/scopes) lists them.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```
