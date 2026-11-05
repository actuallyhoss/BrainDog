# braindog

BrainDog's command line. It signs a machine in to a record, serves that record to an agent over MCP, keeps keys out of
an agent's hands while letting its commands use them, and moves a record in and out as a file. `braindog --help` lists
every command.

## Install

It needs [Node.js](https://nodejs.org) 24.13 or later. On Windows, in PowerShell:

```powershell
irm https://brain.dog/cli/install.ps1 | iex
```

On macOS or Linux:

```sh
curl -fsSL https://brain.dog/cli/install.sh | sh
```

Then check it:

```sh
braindog --version
```

Both scripts put one file, `braindog.mjs`, in `~/.braindog/bin` (`%USERPROFILE%\.braindog\bin` on Windows), after
checking it against the SHA-256 published beside it, and a `braindog` command beside it that runs it with Node. That
folder goes on your PATH if it is not there already: on Windows in your user PATH, elsewhere through one line in your
shell's startup file, so a new terminal finds it. Nothing needs an administrator. Run the same line again to update.

## Set up a machine

One line sets a machine up from your record:

```sh
braindog setup https://app.brain.dog/<your record>
```

It signs the machine in (approve the six digits it prints in the app), adds BrainDog's hooks to Claude Code's settings
after showing you what it will add, registers the `braindog` MCP server in Claude Code and the other agent apps it
finds, writes the tools and skills your record holds, and makes each agent a token of its own. Each step prints one
line. `braindog setup <address> --dry-run` shows the steps and changes nothing, and running it again changes only
what is missing.

On a self-host, put its address in place of `https://app.brain.dog/<your record>`. With the server key in
`BRAINDOG_TOKEN`, no sign-in is asked for, and each agent's token is made from the key.

To sign the machine in and nothing else, run `braindog login https://app.brain.dog/<your record>`.

To remove it, delete the `.braindog` folder in your home folder and the PATH line the install added.

## Where the file comes from

`pnpm --filter braindog-cli build` runs `scripts/bundle.mjs`, which bundles `src/main.ts` and everything it imports
into `dist/braindog.mjs` with esbuild, stamps it with its build (the date and the commit, which `braindog --version`
prints first), and writes `dist/braindog.mjs.sha256` beside it, and `dist/braindog.mjs.build`, the one line `braindog update` reads. Every deploy of `master` builds it that way and
publishes both at `https://brain.dog/cli/`, next to the two install scripts, whose sources are in
`apps/site/static/cli/`.

**A release is signed.** `tools/ship/cli-sign.mjs` writes `dist/braindog.mjs.sig` at deploy, an ed25519 signature over the
sum and the build, with a key kept under the label `braindog-cli-signing-key`. Once its public half is pinned
(`src/release-key.ts`, and `PIN` in both install scripts), `braindog update` and the scripts refuse a build with no
signature or another key's before it runs. With nothing pinned they hold to the sum, so a command from before the pin
keeps working until it updates. Make the key once:

```
braindog login <your BrainDog's address> --keychain '*'
node tools/ship/cli-key.mjs
git add apps/cli/src/release-key.ts apps/site/static/cli/install.sh apps/site/static/cli/install.ps1
```

`node tools/ship/cli-key.mjs --again` adds a second key beside the first, and the last two stay pinned, so a key can be
moved over one release. The scripts come from the site too, so the pin only holds against somebody who can rewrite the
site if you compare it with the key published here.

In a checkout, `node apps/cli/src/main.ts` runs the same command from its TypeScript sources, and says its build is
`dev+0000000`. The tests run those sources directly (`pnpm --filter braindog-cli test`).

The specification is [48-SPEC-CLI](../../docs/48-SPEC-CLI.md).
