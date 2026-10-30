# Keys and grants

Your BrainDog keeps the keys your agents use (API tokens, passwords, SSH keys, recovery codes) sealed in its Keychain. An agent's command can use a key without the agent ever reading it, and BrainDog says which run used which key and when.

## What BrainDog knows about a key

A key is a row in Keys: a name, what it opens, the provider, its kind, the project it belongs to, when it expires, and whether it still works. The value itself is sealed, and nothing that lists keys ever shows it: not a tool, not a resource, not the app's list. The briefing names the keys that apply to a session by name only. A key with an expiry day reminds you two weeks and two days before.

A key never goes in a row, a note or a tool call. An agent that finds one puts it in the Keychain instead.

## Putting a key in

```code | sh
braindog keys put deploy-token --opens "Deploys to the staging server" --kind api_token
```

At a terminal, `keys put` asks for the value and shows nothing as you type or paste it. A script pipes it in instead: `printf '%s' "$DEPLOY_TOKEN" | braindog keys put deploy-token`. The value is never an argument, because an argument is kept in shell history and shown in every process list. The host seals it and BrainDog keeps only the sealed bytes. On a machine with no keychain access, the machine's sign-in is used: the key goes into the session's project as a new key, and a name already there is refused, so a sign-in that leaks can add a key and never swap one.

## Using a key

```code | sh
braindog run deploy-token -- ./deploy.sh
braindog keys exec deploy-token --as API_TOKEN -- node sync.js
```

`run`, or `keys exec` under its longer name, opens the key and hands it to one command in one environment variable, named from the key unless `--as` names it. It is never printed, never written to a file and never put on the command line. A variable that would change the command itself, such as `PATH`, `NODE_OPTIONS` or `LD_PRELOAD`, is refused before anything is sent.

`keys headers` prints a key as one HTTP header, for a program that asks for its headers on standard output, such as Claude Code's `headersHelper`. It refuses to print to a terminal.

## Keychain access

Reading a key back takes keychain access, which is separate from the sign-in:

```code | sh
braindog login https://app.brain.dog/<slug> --keychain my-project
```

It prints six digits for you to approve in the app. The grant opens the keys of that one project; `--keychain '*'` asks for the keys that belong to no project. It is kept on the machine beside the sign-in, and `braindog logout` removes both. Every time a key is opened BrainDog logs it against the session that asked, so each key's page can say which runs used it, on which machine, and when.

Only you, signed in to the app, can see the list of grants and revoke one. An agent that wants a key to apply somewhere else proposes it.

## Tools and MCP servers

```code | sh
braindog tools scan
braindog tools write --scope user
```

`tools scan` records the MCP servers this machine has in `.mcp.json` and `~/.claude.json`. A key it finds in one is put in the Keychain, and only its name is recorded. `tools write` shows the Claude Code entries your BrainDog's tools become and writes them only for the scope you name. No entry holds a key: a server that needs one names the command that opens it.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```
