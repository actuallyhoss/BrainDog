---
name: braindog
description: Read and write the person's BrainDog record, the shared memory of their work, projects, money and decisions that every agent they use reads. Reach for it when you start work, when you need what was decided or what leads, and whenever they mention their record, a task, a decision, a figure or a key.
---

# BrainDog

BrainDog is one person's record: their work, projects, money and decisions, shared by every agent they use.

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

## Key numbers

`context` lists the key numbers you keep on the project under "Numbers", with when each was last reported. "Stale"
means one is overdue.

- Report a reading with `create` on Numbers (the readings list): the measure's name, the project, a `value` (or an
  `amount` for money) and `at`.
- Propose anything else with `propose`: a new key number, or a change to a target, cadence or owner.
- A money reading for a key number you do not keep is asked too, with `propose`.

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
- `RUN_STOPPED` and `RUN_PAUSED`: see above.
