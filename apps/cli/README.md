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

To sign this machine in to your record, run `braindog login` with the record's address, as in
`braindog login https://brain.dog/app/<your record>`, and approve the six digits it prints in the app.

To remove it, delete the `.braindog` folder in your home folder and the PATH line the install added.

## Where the file comes from

`pnpm --filter braindog-cli build` runs `scripts/bundle.mjs`, which bundles `src/main.ts` and everything it imports
into `dist/braindog.mjs` with esbuild, stamps it with its build (the date and the commit, which `braindog --version`
prints first), and writes `dist/braindog.mjs.sha256` beside it. Every deploy of `master` builds it that way and
publishes both at `https://brain.dog/cli/`, next to the two install scripts, whose sources are in
`apps/site/static/cli/`.

In a checkout, `node apps/cli/src/main.ts` runs the same command from its TypeScript sources, and says its build is
`dev+0000000`. The tests run those sources directly (`pnpm --filter braindog-cli test`).

The specification is [48-SPEC-CLI](../../docs/48-SPEC-CLI.md).
