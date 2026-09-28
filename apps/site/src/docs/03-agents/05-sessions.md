# Sessions, handoffs and hooks

Every time an agent works in your record, the work is a session: a row with its own number, such as `S42`, that says which agent it is, on which machine, in which project and repository, and where it stands. Everything the agent writes is signed by its session, so History can say which run made a change.

## How a session starts

With the hooks in place (`braindog setup` adds them to Claude Code), the start hook runs when a Claude Code session opens. It reads the repository's branch and commit, tells the record which session this is, and prints the briefing into the conversation:

- this session and where it stands;
- the last handoff in this project;
- who else is working now, and where;
- the questions waiting on you;
- the skills, learnings, keys and tools that apply here, keys by name only.

A hook never stops a session. If the record does not answer within eight seconds, or the machine is not signed in, the hook prints one line saying why there is no briefing, and the session goes on.

An agent without the hooks starts with the `context` tool, which answers the same briefing. `braindog context` prints it again in a terminal.

## Keeping the handoff true

The handoff is what the next session reads first. An agent keeps it with the `handoff` tool, and a person can do the same from the command line:

```comparison | The parts of a handoff
Part | What it holds
doing | What this session is doing, set once the task is known
next | The one concrete next step. "Carry on" is not one
tried | A dead end, added when it is ruled out, so nobody tries it again
note | One line of reasoning. Notes add up rather than replace each other
state | Idle, handed off for another session to take on, or done
```

```code | sh
braindog session show
braindog session next "Match the two unpaid invoices to their payments."
braindog session tried "Matching by amount alone: three payments share one total."
braindog session end --state handoff
```

## How a session ends

The end hook runs when the Claude Code session closes. It first records the people met in the work: the authors of commits made since the session began, at most ten, leaving out bots and you. Then it marks the session idle with the branch and commit it stopped at.

Idle, never done. A terminal closing is not the work finishing, and a session that crashed never says it stopped. Only you or the agent marks a session done.

## Who else is working

`braindog:sessions/live` lists the sessions working now, on what, and in which repository, with how long since each was last heard from. Two sessions in one working folder overwrite each other's files, so a session that finds another one in its folder should coordinate with it or stop.

## People met along the way

When an agent comes across a person in the work (a commit author, a sender, a client), it calls `meet`. The person is matched by email or by a handle such as `github:octocat`, added to People if they are new, and linked to the session's project with where they were met. A record with People switched off refuses it and writes nothing.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://brain.dog/app/<slug>
```
