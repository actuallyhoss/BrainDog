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

**A release is signed.** `tools/ship/cli-sign.mjs` writes `dist/braindog.mjs.sig` at deploy: an ed25519 signature over the sum, the build
and the release's time, with a key that is only in the login keychain of the Mac that releases (the generic password item
`braindog-cli-release`, never the record's Keychain, which the Worker can open). `node tools/ship/cli-key.mjs` makes it once, and
pins the public half in `src/release-key.ts`, both install scripts and the list below. Once a build is pinned, `braindog update` and the
scripts refuse a build with no signature or another key's before it runs. With nothing pinned they hold to the sum, so a command from
before the pin keeps working until it updates. `braindog update` also refuses a build older than the one running, so an old signed build
cannot be served again as an update; after a real rollback, `braindog update --older` takes it. Install scripts have nothing running to
compare with, so they do not hold to this.

**The keys published here are the check against somebody rewriting the site.** The install scripts come from the site, so whoever can
change the site can change the `PIN` in them too. This list is in the repository and not on the site: read the script before you run it,
and compare its `PIN` line with these. A command already installed needs no such check, since its pin is inside it.

<!-- release-keys -->
None yet.
<!-- /release-keys -->

**If this Mac's key is lost.** A command believes the keys its own build pinned, so what it costs depends on whether a second key was
already out:

- With a second key: on a second Mac, `node tools/ship/cli-key.mjs --again`, commit, and release from the first Mac as usual. From that
  release on every updated command believes both, so if the first Mac's key is lost, the second Mac goes on releasing and nothing else
  happens. Commands that never took a release after the second key was pinned are in the case below. A second key on the same Mac
  would protect nothing, so `cli-key.mjs` refuses it.
- With no second key: `node tools/ship/cli-key.mjs --again` on any Mac, commit and release. New installs work, but every installed
  command refuses that release as "not BrainDog's", correctly, since it cannot tell this from an attacker. Each machine has to run the
  install line once, after comparing its `PIN` with the list above. Nothing stops working in the meantime; those commands just stay
  on the build they have. Say so somewhere people will see it, and not on the site alone.

A key that may have been copied, rather than lost, is the same steps, plus taking its line out of the pin everywhere and off the list.

In a checkout, `node apps/cli/src/main.ts` runs the same command from its TypeScript sources, and says its build is
`dev+0000000`. The tests run those sources directly (`pnpm --filter braindog-cli test`).

The specification is [48-SPEC-CLI](../../docs/48-SPEC-CLI.md).
