# The tools, by purpose

An agent reaches your record through a short list of MCP tools. Some only read; the rest write, and every write lands in History under the agent's name, like any change you make yourself.

Each example below is the tool's name and the arguments it is sent. A row is named the way a person says it: `tasks#41`, a list and its number, or a prefixed id such as `S42`.

## Finding your way

`record_index` says what the record holds: its lists, how many rows each has, its figures and its version. It is the cheap way to learn list names. `context` is the briefing for where the agent is: its session and project, open work, questions waiting on you, people, the keys and servers it may use (by name, never a value), skills and learnings. `schema` gives one list's fields, their types and what each may take, and is worth reading before a write.

```code | text
record_index {}
context {}
schema {"register": "tasks"}
```

## Reading rows

`get` reads one row or one figure. `list` reads the rows of one list, newest first, 20 unless `limit` asks for up to 500, narrowed by a predicate and paged with the `cursor` the last answer gave. Long text is cut at 280 characters and the row says so; name the field in `fields` to have it whole. `search` finds rows whose words match across every list the agent can see, up to 100. `history` gives the writes that made one row, in order, each with who and when.

```code | text
get {"spoken": "tasks#41"}
list {"register": "tasks", "where": {"field": "state", "is": "open"}, "limit": 50}
search {"q": "invoice march"}
history {"spoken": "tasks#41"}
```

## Catching up

`activity` is what changed in the whole record lately, newest first, up to 200: each write, the row it touched and who made it. It is how one session picks up after another. `governance` is what has been proposed and not yet answered, what was decided and why, and what was predicted.

```code | text
activity {"limit": 50}
governance {"status": "open"}
governance {"register": "decision", "id": "D12"}
```

## Changing things

`create` adds a row and answers with the number the record gave it. `update` changes a row and sends the version it read; a field set to null is cleared, and `deleted_at: true` deletes the row. `log` adds a note to a row and changes nothing else, and with no row named the note goes on the agent's own session. A note is one sentence, at most 280 characters.

```code | text
create {"register": "tasks", "fields": {"what": "Send the March invoices"}, "note": "Asked for in today's call."}
update {"spoken": "tasks#41", "patch": {"state": "done"}, "version": 3}
log {"spoken": "tasks#41", "note": "Waiting on the client's reply."}
```

`propose` puts a question in front of you with what the agent would do about it. It changes nothing until you answer in Needs you. The body is options, a set of row changes, a change to a list's shape, or a pack, settings or arrangement change.

```code | text
propose {"question": "Which client should we chase first?", "body_kind": "options", "body": {"options": [{"id": "a", "label": "Northwind", "because": "Two invoices are overdue."}, {"id": "b", "label": "Contoso", "because": "The larger balance."}]}}
```

`undo` takes back one of the agent's own writes. Every write ends in a receipt line that names what was done and the batch to undo it with, and `undo {"batch": "..."}` puts that write back. It will not touch anybody else's writes, and `dry` shows what would go back without doing it.

## Keeping the session

`handoff` keeps the session's handoff true: what it is doing, the one next step, a dead end it tried, a line of reasoning, and its state (`idle`, `handoff` to ask another session to take it on, or `done`). `tried` and `note` add to what is there. `meet` records someone the agent came across in the work, matched by email or handle and added if new, and links them to the project with where they were met.

```code | text
handoff {"doing": "Reconciling March", "next": "Match the two unpaid invoices to their payments."}
handoff {"tried": "Matching by amount alone: three payments share the same total."}
meet {"name": "Ada Park", "email": "ada@example.com", "where": "commit 4464966 in site"}
```

## The inbox

`triage` files one arrival from the inbox as a row in a list, or sets it aside. Only a token its owner gave the inbox reach may call it; [the inbox reach](/docs/agents/inbox) says how.

```code | text
triage {"arrival": "<id from braindog:inbox>", "register": "bills"}
triage {"arrival": "<id from braindog:inbox>", "ignore": true}
```

## When a call is refused

A refusal names the field and the fix, such as "A note is at most 280 characters, and this one is 312." Correct the call and send it again; the same call sent unchanged is refused the same way. A write the token's scope does not reach is refused with what it lacks, and [scopes](/docs/agents/scopes) lists them.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://brain.dog/app/<slug>
```
