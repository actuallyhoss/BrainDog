# The command line: automations and files

The last of `braindog`: automations and scripts, the record as one file you can keep, check and put back, and another tool's export brought in. [The first page](/docs/agents/cli) covers signing in, keys and sessions.

## Automations and scripts

```comparison | Automations
Command | What it does
braindog automations list | Say every automation you can read, what starts it and how its runs went
braindog automations show <id> | One automation, with its last ten runs step by step
braindog automations run <id> | Start one now. A person in the app only, so a token is told so
braindog automations cancel <run> | Stop a run that has not finished. A person in the app only
braindog scripts resume <id> | Start a script paused by three refused runs in a row. A person in the app only
```

An agent that wants an automation run asks with `propose`, and you press Run now in the app.

## The record as a file

```comparison | Files
Command | What it does
braindog export | Take the record as a .brainl file and check it here. --redact-grants makes a copy to share that cannot put keys back, and -o names the file
braindog import <file.brainl> | Check the file here, then put the record back from it, in place of everything it holds now. It takes only this record's own copy
braindog verify <file> | Check a .brainl file on this machine: its format, every table against its manifest, and its signature. --key names the key to check it against
```

`export` and `import` each ask you to approve that one operation in the app with six digits. A backup made by `export` carries the keys sealed, and names the key they are sealed under; a copy made with `--redact-grants` is safe to hand to somebody and cannot put the keys back. `verify` sends nothing, except to fetch a key when you name one by its address.

## Bringing in another tool

```code | sh
braindog import <adapter> export.json --dry-run
braindog import <adapter> export.json
```

`import` with an adapter moves another tool's export into your record: the adapter is a pack that knows that tool's shape. Running it again updates what it added rather than adding it twice, and no key's value is ever read from the export. `--dry-run` says what it would do and writes nothing.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://brain.dog/app/<slug>
```
