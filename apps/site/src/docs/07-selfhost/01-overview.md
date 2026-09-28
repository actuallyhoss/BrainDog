# Running your own BrainDog

A self-hosted BrainDog is one process on a machine you run, serving one record from one file, with the same app, the same MCP and the same command line as the hosted one. Two commands set it up: `init` makes the record, and `serve` serves it.

## What you need

- Node.js 24.13 or later, and pnpm, which Node's corepack provides.
- A copy of the BrainDog source code.
- A folder for the record's data, which only the user running the server can read.

Or Docker, and nothing else: [the container image](/docs/selfhost/container) builds the same thing into one image.

## Build it

From the top of the source:

```code | In a terminal
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @braindog/web build
```

The last line builds the app the server hands to browsers. The server itself runs from the TypeScript source, so there is nothing else to build.

## Make the record

```code | In a terminal
export BRAINDOG_DATA="$HOME/braindog-data"
node apps/selfhost/src/main.ts init home --owner you@example.com
```

`init <name> --owner <email>` makes everything, in an order that never leaves a name pointing at a record that failed to arrive:

```tree | What init makes in the data folder
braindog-data
  kek
  directory.sqlite
  home
    record.brain
    blobs
    snapshots
    inbound.token
```

~~~code | As written
```tree | What init makes in the data folder
braindog-data
  kek
  directory.sqlite
  home
    record.brain
    blobs
    snapshots
    inbound.token
```
~~~

- `kek` is the key file every key in the record is wrapped by. It is made readable by its owner only, and the server refuses to start with one anybody else can read. Back it up somewhere other than this machine: without it the record's sealed keys cannot be opened, and a copy of the record cannot be signed.
- `directory.sqlite` knows which name reaches which record, who owns it, and their passkeys.
- `home/record.brain` is the record: one SQLite database holding every list, row, page and change.
- `inbound.token` is the secret part of the address forwarded email arrives at.

`BRAINDOG_DATA` is `/data` when it is not set, which suits a container and rarely a laptop. `BRAINDOG_OWNER` stands in for `--owner`. A name already taken, or once given up, is refused before anything is written, so a failed `init` never costs the name you wanted.

## Serve it

```code | In a terminal
node apps/selfhost/src/main.ts serve
```

It finds the record in the data folder and says one line about it, then one line about who may get in. With no other settings it listens on `http://localhost:8080`, on this machine only, and nobody signs in: a request that carries nothing is the owner. That is the safe start, and the right one for a record only you use from this machine.

To reach it from a phone or another machine, give it a server key and a name, as [reaching it](/docs/selfhost/reach) sets out. `PORT` changes the port.

## The command line

In a copy of the source, `node apps/cli/src/main.ts` is the `braindog` command, so `braindog init` and `braindog serve` run the two commands above. The `braindog` installed from brain.dog runs them too when `BRAINDOG_SELFHOST` names the self-host's `main.ts`.

Point the command line at your server with `--host http://localhost:8080` on a command, and it works against your record as it does against one on brain.dog: MCP for your agents, keys, pages, packs, export and import. Once the server has a server key, `BRAINDOG_TOKEN` set to it in the command line's environment lets `export`, `import` and `token create` go ahead without an approval in the app.

## One record to a server

A server serves one record. If the data folder holds more than one, `serve` says which and stops, and `serve <data>/<name>/record.brain` names the one to serve.

## Next

- [The container image](/docs/selfhost/container)
- [Reaching it: TLS and sign-in](/docs/selfhost/reach)
- [Backups and restore](/docs/selfhost/backups)
- [Upgrades and keys](/docs/selfhost/upgrades)
- [Every setting](/docs/selfhost/settings)
