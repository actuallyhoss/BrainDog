# Connect an agent

Claude Code, Codex, Cursor and any other agent that speaks MCP can work in your record. It signs in with your yes, everything it writes carries its name, and it asks you before it changes anything it may not change itself.

## Set up a machine

On macOS or Linux, install the command line and point it at your record:

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```

On Windows, in PowerShell, the first line is `irm https://brain.dog/cli/install.ps1 | iex` and the second is the same. The command line needs Node.js 24.13 or later, and nothing needs an administrator.

`setup` takes five steps in order and prints one line for each:

- it signs the machine in, printing six digits for you to approve in the app;
- it adds the start and end hooks to Claude Code's settings;
- it registers the `braindog` MCP server with Claude Code;
- it writes the tools your record applies everywhere;
- it syncs your skills.

It stops at the first step that fails and says why. Run it again and a step that is already done is left alone. With `--dry-run` it writes nothing.

The sign-in is a token that can write, lasts ninety days and is kept in `hosts.json` in your config folder. The start hook says so two weeks before it runs out.

## By address

A client that takes an MCP address can use this one:

```code | text
https://app.brain.dog/mcp
```

The first time, the client opens BrainDog in your browser. You pick the record and what the agent may do, then press Allow:

```comparison | What you can allow
Scope | What the agent may do
Read | Read your record.
Propose | Read your record and propose changes, which wait for you to decide.
Write | Read your record, propose changes, and change rows directly.
```

The client is given a token that lasts ninety days, and after that it asks you again. For Claude Code the same address is one line:

```code | sh
claude mcp add --transport http braindog https://app.brain.dog/mcp
```

## As a Claude Code plugin

Inside Claude Code, `/plugin marketplace add actuallyhoss/BrainDog` then `/plugin install braindog@braindog` adds the MCP server by its address, the start and end hooks (which use the command line when it is installed) and the BrainDog skill in one step.

## As a process

A client that starts its servers as commands runs the command line instead, which uses the machine's sign-in:

```code | sh
braindog mcp --agent codex
```

`--agent` is `claude`, `codex`, `cursor` or `other`, and tells the record which agent is calling. Put the command where your client lists its MCP servers. No token goes in that file.

## With a token

A server or a script with no browser uses a token you make in the app, or with `braindog token create`. The command line reads it from `BRAINDOG_TOKEN`, and never takes a token as an argument. Over HTTP it goes in the `Authorization: Bearer` header, at `/mcp` and at `/api` alike. [What a key can do](/docs/api/tokens) says what each kind can open.

## What the agent is told

Before its first call, every agent is given the same short rules:

- Call `context` first. It names the session, the project and what applies there.
- Money is a whole number in the currency's smallest unit, with its currency. Two currencies are never added.
- Every write names the version it read. On `VERSION_STALE`, read the row again and apply the change to the new copy.
- An agent never decides. It lays out options with `propose`, and you choose in the app.
- A key never goes in a row, a note or a tool call. It goes in with `braindog keys put`.
- Keep the handoff true, and record a dead end when you rule it out.
- A refusal names the field and the fix. Correct the call rather than sending it again.

## Where to go next

- [The tools, by purpose](/docs/agents/tools), with an example of each.
- [Scopes](/docs/agents/scopes): what an agent may do, and what always needs you.
- [The command line](/docs/agents/cli): every command.
