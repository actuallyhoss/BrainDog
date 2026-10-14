# The inbox reach

Your inbox holds whatever arrived and no rule filed: forwarded bank texts and receipts, webhook calls, anything sent in. Because it holds whatever anybody sent, only you read it, until you give one agent's token the inbox reach so it can sort the inbox for you.

## Why it is closed by default

An arrival can carry anything: a bank alert, a receipt with an address on it, a message somebody forwarded by mistake. So the inbox belongs to the record's owner, and a person invited to part of the record never sees it. A token does not reach it either, whatever its scope, unless its owner gave it the reach.

## Giving a token the reach

The reach is chosen when the token is made, by an owner, for a token over the whole record:

```code | sh
braindog token create --name "Inbox sorter" --scope write --inbox
```

You approve that one mint in the app with six digits, and the token is printed once. A token made by somebody who is not an owner, or one held to part of the record, is refused at the inbox with a sentence that says what it lacks.

The reach opens the inbox and lifts nothing else. The token still acts at its scope: a read token with the reach can read the inbox and change nothing, and filing an arrival makes a row, so a token that could not create a row in that list cannot file into it.

## Reading the inbox

`braindog:inbox` lists what arrived and nothing filed yet, newest first, with how many arrivals are in each state. `braindog:inbox/{state}` lists one state:

```comparison | The states of an arrival
State | What it means
untriaged | No rule filed it, and it waits on a person
review | A rule knew its shape but could not read all of it, and it waits on a person
skipped | A skip rule set it aside. A skip rule that is too wide shows here
matched | Filed as a row
proposed | A rule filed it, and waits for you to confirm that once on Decide
ignored | Set aside by hand. Its bytes are kept
all | Every state
```

An arrival that could not be checked (a webhook without its right token or signature, or mail that failed its checks) is still stored, so you can see it, but no rule ever files it.

Reading the inbox needs a token its owner gave the inbox reach. The owner mints one with braindog token create --inbox.

## Every state at once, and one arrival whole

The `inbox` read takes two more arguments, each asked alone:

```code | text
inbox {"digest": true}
inbox {"id": "<id>"}
```

`digest: true` answers every state in one read: `counts`, how many arrivals are in each of the six states, and `states`, the newest 100 of each. A body is cut to 180 characters, and a line whose body was longer says `cut: true`.

`id` answers one arrival whole, with its full body. An id that is no arrival in this inbox is refused with a sentence that says so.

Neither goes with `state`, `cursor`, `limit` or `repeats`, or with the other: the record refuses the extra key by name.

## Filing and setting aside

```code | text
triage {"arrival": "<id>", "register": "bills", "fields": {"payee": "City Water"}, "note": "Monthly water bill."}
triage {"arrival": "<id>", "ignore": true}
```

`triage` files one arrival as a row in the list named, with the fields given, or titled from the arrival when none are. `ignore: true` sets it aside instead, keeping its bytes. Filing an arrival that is already filed answers with its row and writes nothing, so an agent that lost an answer and asks again still files one row. The row and the change to the arrival are both signed by the agent's session.

Over HTTP, `POST /api/triage` also takes `back: true`, which puts a filed or set-aside arrival back in the inbox, so an agent that filed the wrong thing can undo it through the same door.

## When the same kind keeps arriving

After three arrivals of the same shape, Slash suggests how to file them. Say yes on Decide and the rest go in on their own. An agent with the reach can tidy what is left, and propose a rule with `propose` when it sees a pattern.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://brain.dog/app/<slug>
```
