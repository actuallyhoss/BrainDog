---
name: braindog
description: Read and write the person's BrainDog record, the shared memory of their work, projects, money and decisions that every agent they use reads. Reach for it when you start work, when you need what was decided or what leads, and whenever they mention their record, a task, a decision, a figure or a key.
---

# BrainDog

BrainDog is one person's record: their work, projects, money and decisions, shared by every agent they use, and by
the colleagues they invite.

## Connect

- **In any app that takes an MCP address:** add `https://app.brain.dog/mcp`, or the address they give you.
  The app opens a sign-in and the person allows it in BrainDog, so no token is copied anywhere.
- **On their machine:** `braindog setup https://app.brain.dog/<slug>` signs in, adds the hooks and this skill, and
  registers `braindog mcp`, which serves the record with the sign-in the command keeps.
- **From a script:** a token they make in the app, or with `braindog token create --scope read|propose|write`, in the
  `Authorization` header:

  ```json
  { "type": "http", "url": "https://app.brain.dog/mcp", "headers": { "Authorization": "Bearer <token>" } }
  ```

Never put a token in a row, a note, a commit or a message.

## Then

Call `context` first. It names your run and your project. It leads with anything the person told you, then your next
step, your rules, who else is working here and your lane. The server's instructions carry the rules you keep.

Meet everyone you work with or are told about with `meet`, and give their email or handle when you have one.

## What the person told you

The person can tell an agent something from the BrainDog app. It comes back as an instruction with a handle like
`IN4`.

- `context` lists open instructions first. Any answer from BrainDog can also carry a line that starts "New for you".
  When a line says so, call `instructions`.
- `instructions` with no arguments reads what is waiting.
- `instructions {take:"IN4"}` takes one. If another run has it, you are told which, and you leave it.
- Before you stop, reply to every instruction you took:
  `instructions {reply:"IN4", said:"<what you did, one line>", state:"done"}`. State is `done`, `needs_you` or
  `declined`. Say why when it is not done. A reply that names what you changed lets the person undo it.
- Then call `handoff {next:"<the one next step>"}`.

The prompts `/braindog:start`, `/braindog:wrap` and `/braindog:ask` say these steps in order.

## Pages you made

An audit, a plan, a design or a before and after goes on the thing it is about, so the person sees it inside BrainDog.

- From a shell: `braindog attach page.html --on "<task, project, or SG5>"`. The pictures the page names beside it go
  up with it. The answer ends with the line that takes it back.
- Over MCP: `log {spoken:"<the thing>", note:"<its title>", page:"<the HTML>"}`, with pictures inline as `data:`.
- Read `braindog:design` before you design one, and follow its look rules: flat tiles, no pills, gradients or shadows,
  red only for what is late, failing or below nought, names never ids.
- The page loads nothing from elsewhere: no links out, no fonts or scripts from the web. Sent again under the same
  title, it is the next version.

## Anything else the app does

`act` makes any call the BrainDog app makes, by its name: settings and time zone, plugins and their settings,
automations, boards and Today, books and bills, sharing and people, Needs you, export. Read `braindog:calls` for every
call and what it takes, or, where resources are not read, `act {call:"calls", args:{q:"<a word>"}}`, then
`act {call:"<name>", args:{...}}`. A name it does not know is refused with the nearest call as `try`.

- It runs with your own grant. What you may not do in the app you may not do here; a change your rung asks about is
  filed on Needs you, as any other.
- What only the owner does in a browser (a plugin on or off, its settings, a declaration, taking a key out) is asked
  instead, and lands when the person says yes. Anything else refused that way is theirs: say so.
- Take back your own write with `act {call:"undoOwn", args:{batch:"<from the receipt>"}}`.
- Scripts and automations are no list of rows, and are read by name: `list {register:"scripts"}` or
  `{register:"automations"}` says each on a line, and `get {spoken:"<its id or title>"}` one whole, with its last runs.
  Your own and other agents' runs are the list `session`, Agent runs.
- Never a key's value, in or out. A key goes in with `braindog keys put <label>`, which reads standard input.
- A note longer than 280 characters is kept as several, in order, up to 1,400. Past that, send it as a page.

## When BrainDog does not do what they want

A plugin can. Look in the store before saying no, and build one before faking a feature with rows.

1. `act {call:"addons", args:{q:"<a few words>"}}` searches the store; `act {call:"addon", args:{id}}` reads one:
   who made it, how far it is trusted, and what it asks of theirs. If one fits, `act {call:"installPack", args:{id}}`
   asks them.
2. Otherwise read `braindog:grammar/pack` (or `act {call:"arrangement", args:{grammar:"pack"}}`), then
   `act {call:"addonNew", args:{id, title, fields}}` for a file that installs: a list, a page and a Today card.
3. Change it to do what they asked and `act {call:"addonCheck", args:{doc}}` until it says Ready. It names each refusal
   and what installing would add and ask them to approve, and files nothing.
4. `act {call:"installPack", args:{doc}}` puts it to them on Needs you. Nothing installs until they say yes.
5. To change it: `act {call:"addon", args:{id, file:true}}`, edit, raise its version, check, and ask again.

A plugin names every list of theirs it reads in `uses`, every host it calls, and a key only by its label.

## When you can act without asking

What you may do is your person's role and your token's scope, whichever is less. A colleague's agent sees what that
colleague sees and never more, and a write of theirs that reads what somebody else wrote is filed as a question.

The owner can turn on "Let your agents do everything without asking" in Settings > Agents. With it on, the owner's own
agents write without asking, money and deletes too, and each change still names you and can be undone. It never
covers: keys and their values, paying, inviting people or changing, stopping or removing them, changing the owner,
and deleting or exporting all of BrainDog. Those are refused `NEEDS_BROWSER_SESSION`: tell the person it is theirs to
do in the app. It never covers a colleague's agents.

To bring a colleague in, write their name with @ in a comment:
`act {call:"comment", args:{on:"tasks#3", body:"@Mira the proofs are in"}}`. A comment needs at least `propose`. They
are told only if they can see the row or question.

## Key numbers

`context` lists the key numbers you keep on the project under "Numbers", with when each was last reported. "Stale"
means one is overdue.

- Report a reading with `create` on Numbers (the readings list): the measure's name, the project, a `value` (or an
  `amount` for money) and `at`.
- Propose anything else with `propose`: a new key number, or a change to a target, cadence or owner.
- A money reading for a key number you do not keep is asked too, with `propose`.
- A key number's readings may carry its project after its name. `get {spoken:"kpi-stale:kpis#4"}` and a filter of
  the readings by the key number's name find them either way. Readings written twice: `act {call:"sameValues",
  args:{register:"datapoints", fields:["name","thing","at","value"]}}`.

## Stop and pause

The person can stop or pause your run. From then on every change is refused with `RUN_STOPPED` or `RUN_PAUSED`, and the
refusal says who and why. Only `instructions`, `handoff` and `log` on your own run still go through. Reply with
`instructions`, leave a handoff, and end. On `RUN_PAUSED`, wait until the person resumes you. Do not work around it, and
do not retry the same call.

## Refusals to expect

A refusal names the field and the fix, and its `try` is the corrected call. Never resend one unchanged.

- `PATCH_EMPTY` at `patch`: `update` was sent nothing to change. Put the fields in `patch`. To add a note only, use `log`.
- `NAME_AMBIGUOUS` at `spoken`: several things have that name. The refusal lists their handles. Say which one.
- `TOOL_OFF`: the person turned this tool off for you in Settings > Agents. Do not look for another way. If you need it,
  ask with `propose`.
- `NEEDS_BROWSER_SESSION`: only the person, signed in to the app, can do this. Say so, and do not look for another way.
- `RUN_STOPPED` and `RUN_PAUSED`: see above.
