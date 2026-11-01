# Connect an agent

<!-- launch: codex -->
Claude Code, Codex, Cursor and any other agent that speaks MCP can work in your BrainDog. It signs in with your yes, everything it writes carries its name, and it asks you before it changes anything it may not change itself.
<!-- /launch -->
<!-- launch: !codex -->
Claude Code, Cursor and any other agent that speaks MCP can work in your BrainDog. It signs in with your yes, everything it writes carries its name, and it asks you before it changes anything it may not change itself.
<!-- /launch -->

## Set up a machine

On macOS or Linux, install the command line and point it at your BrainDog:

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```

On Windows, in PowerShell, the first line is `irm https://brain.dog/cli/install.ps1 | iex` and the second is the same. The command line needs Node.js 24.13 or later, and nothing needs an administrator.

<!-- launch: codex -->
`setup` sets up every app it finds on the machine (Claude Code, Codex, Cursor, Claude Desktop and VS Code) in six steps, and prints one line for each:
<!-- /launch -->
<!-- launch: !codex -->
`setup` sets up every app it finds on the machine (Claude Code, Cursor, Claude Desktop and VS Code) in six steps, and prints one line for each:
<!-- /launch -->

- it signs the machine in, printing six digits for you to approve in the app;
<!-- launch: codex -->
- it adds BrainDog's hooks and skill to Claude Code's settings, and in Codex a turn-end hook and BrainDog's part of `AGENTS.md`;
<!-- /launch -->
<!-- launch: !codex -->
- it adds BrainDog's hooks and skill to Claude Code's settings;
<!-- /launch -->
- it registers the `braindog` MCP server with each app;
- it writes the tools your BrainDog applies everywhere;
- it syncs your skills;
- it makes each kind of agent its own token, approved in the app the same way.

Before it changes an app's settings it shows what it will write and asks, and it keeps a copy of each file first. It stops at the first step that fails and says why. Run it again and a step that is already done is left alone. With `--dry-run` it writes nothing.

The sign-in is a token that can write, lasts ninety days and is kept in `hosts.json` in your config folder. The start hook says so two weeks before it runs out.

## By address

A client that takes an MCP address can use this one:

```code | text
https://app.brain.dog/mcp
```

The first time, the client opens BrainDog in your browser. You pick which BrainDog and what the agent may do, then press Allow:

```comparison | What you can allow
Scope | What the agent may do
Read | Read your BrainDog.
Propose | Read it and propose changes, which wait for you to decide.
Write | Read it, propose changes, and make changes directly.
```

The client is given a token that lasts ninety days, and after that it asks you again. For Claude Code the same address is one line:

```code | sh
claude mcp add --transport http braindog https://app.brain.dog/mcp
```

<!-- launch: repo -->
## As a Claude Code plugin

Inside Claude Code, `/plugin marketplace add actuallyhoss/BrainDog` then `/plugin install braindog@braindog` adds the MCP server by its address and BrainDog's session hooks in one step. The hooks use the command line when it is installed, and do nothing where `setup` has already added them.
<!-- /launch -->

## As a process

A client that starts its servers as commands runs the command line instead, which uses the machine's sign-in:

```code | sh
braindog mcp --agent cursor
```

<!-- launch: codex -->
`--agent` is `claude`, `codex`, `cursor` or `other`, and tells BrainDog which agent is calling. Put the command where your client lists its MCP servers. No token goes in that file.
<!-- /launch -->
<!-- launch: !codex -->
`--agent` is `claude`, `cursor` or `other`, and tells BrainDog which agent is calling. Put the command where your client lists its MCP servers. No token goes in that file.
<!-- /launch -->

## With a token

A server or a script with no browser uses a token you make in the app, or with `braindog token create`. The command line reads it from `BRAINDOG_TOKEN`, and never takes a token as an argument. Over HTTP it goes in the `Authorization: Bearer` header, at `/mcp` and at `/api` alike. [What a key can do](/docs/api/tokens) says what each kind can open.

## What the agent is told

Before its first call, every agent is given the same short rules:

- Call `context` first. It names the run, the project, the next step and what is waiting.
- Suggest, and let you decide in BrainDog. It asks with `propose`, and acts on its own only when you tell it to, passing on your words.
- Write short and plain, for a phone: names, never ids, and one line where one will do.
- Meet everyone it works with or hears of, with an email or a handle.
- A key never goes in a row, a note or a tool call. It goes in with `braindog keys put`.
- After a fix, a surprise or a dead end a later session would repeat, keep a learning.
- A refusal names the field and the fix, with the corrected call. Never send the same call again unchanged.

How money is written (whole numbers in the currency's smallest unit, with the currency), and what to do when a row changed since it was read, are told with the tools they are about.

## Where to go next

- [The tools, by purpose](/docs/agents/tools), with an example of each.
- [Scopes](/docs/agents/scopes): what an agent may do, and what always needs you.
- [The command line](/docs/agents/cli): every command.
