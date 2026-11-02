# The command line

`braindog` signs a machine in to your BrainDog, serves it to the agents on that machine, lets their commands use keys they never see, and moves your BrainDog in and out as a file. This page covers the commands for machines and agents, [the next one](/docs/agents/cli-files) pages and packs, and [the last](/docs/agents/cli-record) automations and files. `braindog help` lists every command on your machine.

## Install it

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```

On Windows, in PowerShell, install it with `irm https://brain.dog/cli/install.ps1 | iex`. It needs Node.js 24.13 or later. Both scripts put one file in the `.braindog` folder in your home folder, check it against the checksum published beside it, and put a `braindog` command on your PATH. Run the same line again, or `braindog update`, to update. `braindog --version` says the build, the file format it writes, the kernel it expects and the block set it draws.

## Which BrainDog, and who

Most commands take `--host` for your BrainDog's address. Without it, the host comes from `BRAINDOG_HOST`, then the default in `hosts.json` in your config folder. The token comes from `BRAINDOG_TOKEN`, then the same file. A token is never an argument.

`--json` answers with one JSON document on standard output and moves every other line to standard error. `mcp`, `keys exec`, `keys headers`, `keys helper`, `run`, `hook`, `setup`, `env apply`, the `sync` commands other than `sync inventory`, `init` and `serve` do not take it.

## Signing in

```comparison | Machines
Command | What it does
braindog setup <host> | Sign in, add the hooks and the BrainDog skill, register the MCP server, write your tools, sync your skills, and make a token for each agent it wired, in that order, one line each. --dry-run writes nothing
braindog login <host> | Sign this machine in: six digits to approve in the app, and the token kept in the hosts file
braindog login <host> --keychain things#3 | Ask for keychain access that opens the keys of one project, named by its list and number, or, given a star, the keys that belong to no project.
braindog logout [<host>] | Remove this machine's sign-in, runner sign-in and keychain access for one host. Nothing is sent
braindog install | Show the hooks it would add to Claude Code's settings. --apply writes them and places the BrainDog skill. --replace takes out an older tool's hooks, servers and skills
braindog hook start | What Claude Code runs when a session starts: the briefing
braindog hook end | What Claude Code runs when a session ends: people met, and the session idle
braindog hook beat, prompt, tool, stop | What Claude Code runs after each tool call, on each prompt, before each tool call and when a turn ends: it keeps a long session working, passes on what you told the run in the app, and holds the run while you have stopped it
braindog mcp [--agent <name>] | Serve BrainDog to an agent over standard input and output. The agent starts it
```

## Keys

```comparison | The Keychain
Command | What it does
braindog keys put <label> | Put a key in the Keychain. At a terminal it asks for the value and shows nothing; otherwise it reads standard input. --opens says what it opens, --kind its kind, --keychain its project
braindog keys exec <label> -- <command> | Run the command with the key in one environment variable, named from the label unless --as names it. Never printed
braindog run <label> -- <command> | The same as keys exec, under a shorter name
braindog keys headers <label> --as <Header> | Print the key as one header for a program that reads it. Refuses a terminal
braindog keys helper <label> | Print the key alone, for Claude Code's apiKeyHelper. Refuses a terminal
braindog keys list | The keys your BrainDog holds, one line each, never a value
braindog keys scan [<folder>] | Name every key lying in a folder's files and the command that seals them. Sends nothing unless --deposit
braindog token create | Make a token for an agent and print it once. It reads unless --scope names propose or write. --days sets its life, --inbox gives it the inbox reach, and --name labels it. You approve the one mint in the app
braindog bypass on, or off | Open Settings › Agents at Let your agents do everything without asking, for you to turn it on or off there. An agent on the machine cannot turn it on for itself
```

## Sessions, skills and tools

```comparison | Agents
Command | What it does
braindog context | Print the briefing again: this session, the last handoff, who else is working, what waits on you, and what applies here
braindog session show | Say where the session this folder is in stands
braindog session next <text> | Leave the one next step
braindog session tried <text> | Add a dead end
braindog session note <text> | Add a line of reasoning
braindog session end | End it. --state says idle, handoff or done, and --next leaves a last step
braindog skills sync | Keep this machine's skills in step with a BrainDog you own: it says what it would copy and asks once (--yes where there is no terminal), then writes your skills where Claude Code reads them, proposes a local edit and adds a skill kept by hand
braindog skills off | Take that yes back: no session copies your skills or records your MCP servers
braindog tools scan | Record the MCP servers in .mcp.json and ~/.claude.json. A key found there is put in the Keychain, and only its name is recorded
braindog tools write | Show the Claude Code entries your tools become. --scope user or --scope project writes that one
```

`skills sync`, `tools scan` and `tools write` take `--dry-run`.

## Runners

A runner is a machine that runs jobs you approved, in Claude Code, with only the tools each job's kind allows.

```comparison | Runners
Command | What it does
braindog runner enrol <host> | Sign this machine in as a runner: six digits to approve in the app
braindog runner repos add <name> <folder> | Name a folder a job may run in. The host only ever sends the name
braindog runner repos list | List the names kept
braindog runner allow <kind> | Allow a job kind on this machine, for a runner with no terminal to ask
braindog runner run | Claim the jobs approved for this machine and run each, sending back what it does. --once runs one
braindog runner service on | Start the runner when you log in and keep it up with no terminal open. off stops it, status says how it is
```
