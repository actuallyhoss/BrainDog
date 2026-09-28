<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/media/banner-dark.svg">
  <img src=".github/media/banner-light.svg" width="830" alt="BrainDog">
</picture>

# Give your business a memory

A company knows a great deal that never reaches its codebase. What it is owed and by whom. What
renews on Tuesday. Which key opens which account. Who decided the thing nobody can remember
deciding. That knowledge usually lives in one person's head, six spreadsheets and a Slack thread.

BrainDog keeps it in one record instead: typed, append-only, and yours.

Your agents get a key to it. Claude, Codex and Cursor read and write the same rows you do, over MCP,
and every row says who wrote it and when. Nothing is edited in place, so nothing is quietly lost.
Ask what the record said last Tuesday and it will tell you.

## What it is

- **Typed rows.** Money has an amount, a currency and a date. Domains have renewal dates. "What is
  due in October" is a question with an answer, not a search.
- **One record every agent shares.** Over MCP, with the permissions you give each token. An agent
  proposes; you decide in the app, and the decision becomes a numbered row with its reason.
- **A history that cannot be rewritten**, by anyone, including you. There is one write path and the
  event log is append-only by construction ([docs/30-BLUEPRINT.md](docs/30-BLUEPRINT.md) §4).
- **Extensions are data.** A pack declares lists, pages, metrics and rules as readable text with no
  code in it, so every extension is a file you can read and diff before it is applied.
- **Your data is a file.** One SQLite file per record (`.brain`), and a signed line-per-row dump
  (`.brainl`). Export is never withheld, on any plan, in any state.

## Two ways to run it

**Hosted, at [brain.dog](https://brain.dog).** One record per customer, on Cloudflare. Nothing to
install but the command line, if you want your agents on it.

**On your own machine.** The same packages run as one Node process over `node:sqlite`. You need
Node 24.13 or later and pnpm:

```sh
git clone https://github.com/actuallyhoss/braindog
cd braindog
pnpm install
pnpm --filter @braindog/web build
node apps/selfhost/src/main.ts init <record name> --owner <your email>
node apps/selfhost/src/main.ts
```

[BUILD.md](BUILD.md) has the rest, and [docs/49-SPEC-SELFHOST.md](docs/49-SPEC-SELFHOST.md) every
setting the server reads.

### The container

The self-host also builds as one image, the server and the app it serves, with the record in a
volume:

```sh
docker build -f apps/selfhost/Dockerfile -t braindog .
docker run --rm -v braindog:/data braindog node apps/selfhost/src/main.ts init <record name> --owner <your email>
docker run -d -v braindog:/data -p 8080:8080 --env-file braindog.env braindog
```

Nothing that opens the record is baked into the image. The env file names the server key and the
address to listen on; without them the server answers only from inside the container.

## The command line

`braindog` signs a machine in to a record, serves that record to an agent over MCP, keeps keys out of
an agent's hands while letting its commands use them, and moves a record in and out as a file. It
needs Node 24.13 or later.

```sh
curl -fsSL https://brain.dog/cli/install.sh | sh     # macOS and Linux
irm https://brain.dog/cli/install.ps1 | iex          # Windows, in PowerShell
braindog setup https://brain.dog/app/<your record>
```

`setup` signs in, adds the Claude Code hooks, places the Agent Skill and registers the MCP server.
[apps/cli/README.md](apps/cli/README.md) covers each part.

### For agents

[skills/braindog/SKILL.md](skills/braindog/SKILL.md) is the Agent Skill: what BrainDog is to an
agent, how it connects (`https://brain.dog/mcp` with a token, or `braindog mcp`), what to read first,
the rules it keeps, and the refusals it will meet. `braindog install` places it in each Claude Code
profile.

## Where things are

| | |
|---|---|
| `docs/` | the numbered specification documents, and the source of truth. [docs/00-README.md](docs/00-README.md) is the index |
| `packages/kernel` | the write path, the ledger, types, filters, metrics and rules |
| `packages/render` | the block dialect and its renderers, published separately as `braindog-render` under MIT |
| `apps/web` | the record's own interface |
| `apps/worker` | the Cloudflare host |
| `apps/selfhost` | the Node host, and the container |
| `apps/cli` | the command line |
| `apps/site` | the site at brain.dog |
| `packs/` | the packs a record can install |
| `tools/gates` | the source checks every change passes |

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md) covers the build, the tests, the gates and the house style, which
is worth reading before a first pull request. [SECURITY.md](SECURITY.md) is how to report a
vulnerability, and [docs/12-SECURITY.md](docs/12-SECURITY.md) is the security model in full.

## Licence

BrainDog is open source under the Apache License 2.0 ([LICENSE](LICENSE)), except `packages/render`,
which is under the MIT License ([packages/render/LICENSE](packages/render/LICENSE)) so the block
dialect can be embedded anywhere. [LICENSING.md](LICENSING.md) explains the split.

The software is provided as is, without warranty of any kind, express or implied. See the licence
texts for the full terms.
