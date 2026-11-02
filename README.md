<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/media/banner-dark.svg">
  <img src=".github/media/banner-light.svg" width="830" alt="BrainDog">
</picture>

# A memory for your work, money and people, shared by you and every AI agent you use over MCP

BrainDog keeps your projects, money, people, keys and decisions in one record, tells you each morning what needs
you, and lets Claude, ChatGPT and Cursor read and write the same record you do. Use it to run a small business,
or your own life. It is open source, hosted at [brain.dog](https://brain.dog), and runs on your own machine too.

[Website](https://brain.dog) · [Docs](https://brain.dog/docs) · [Connect an agent](#connect-claude-and-other-agents) ·
[Run it yourself](#run-it-yourself) · [Add-ons](#add-ons-and-starters)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/media/screenshot-dark.png">
  <img src=".github/media/screenshot-light.png" width="830" alt="BrainDog's Money page: cash now, how long it lasts, what is coming up and the accounts">
</picture>

<sub>The Money page on the sample record. Every name and figure in it is made up.</sub>

## What you can do with it

- **Work.** Projects, tasks and what is late. Each project shows what happened and what is next, and an agent
  that picks one up starts from there and leaves a note when it stops.
- **Money.** Accounts, a ledger, bills and invoices, what is coming up, budgets, a forecast and how long the cash
  lasts. More than one currency, with daily rates. Import a bank statement as a CSV and file its lines in one
  press, or forward a bill or a bank alert and it gets filed.
- **People.** Clients, contacts, who owes you and who you owe. Import contacts from a CSV or a vCard.
- **Agents.** Every AI tool you connect signs in with your yes and puts its name on what it writes. You can see
  who is working on what right now.
- **Decisions.** Needs you holds every question waiting on you, with buttons to answer it. The answer is kept,
  with its reason.
- **Keys.** Keep API keys in the record. Your agents' commands can use them without the agent ever seeing them.
- **Colleagues.** Invite people by email with one of five roles (Owner, Can decide, Can edit, Can add, Can view),
  or share one project, list or row for as long as you say. You see who else is on a page, @mention someone in a
  comment, and hand ownership over when it is time. A read-only link to a project shows how it stands, with or
  without money.
- **Ask.** Press `/` and ask in plain words. It answers from your own numbers, and a change it makes comes with
  an undo.

The same record works for a studio with clients and invoices or for one person keeping track of bills,
subscriptions, savings, trips and renewals. What it holds grows with [add-ons](#add-ons-and-starters).

A few things hold everywhere. Every change has a name on it and an undo. History is never rewritten: rows are
added, never edited in place, so you can ask what the record said last Tuesday. Money, keys, sharing and deletes
wait for you, whatever an agent or a rule asks, unless you switch on letting your own agents act without asking.
Even then, keys, paying, your team, the owner and deleting or exporting all of it stay yours. And you can export
everything as one file at any time.

## Connect Claude and other agents

**By address.** Any client that takes an MCP server address can use this one:

```text
https://app.brain.dog/mcp
```

In Claude that is Settings, Connectors, Add custom connector. The first time, the client opens BrainDog in your
browser: you pick the record and what the agent may do, then press Allow.

**With the command line.** For Claude Code and other agents on your machine. It needs Node 24.13 or later.

```sh
curl -fsSL https://brain.dog/cli/install.sh | sh     # macOS and Linux
irm https://brain.dog/cli/install.ps1 | iex          # Windows, in PowerShell
braindog setup https://app.brain.dog/<your record>
```

`setup` signs the machine in (you approve six digits in the app), adds the Claude Code hooks, registers the MCP
server and places the [Agent Skill](skills/braindog/SKILL.md). [apps/cli/README.md](apps/cli/README.md) has the
rest, and [brain.dog/docs/agents/connect](https://brain.dog/docs/agents/connect) covers every client.

**As a Claude Code plugin.** Inside Claude Code, this adds the MCP server, the session hooks and the skill in one step:

```text
/plugin marketplace add actuallyhoss/BrainDog
/plugin install braindog@braindog
```

## Two ways to run it

**Hosted, at [app.brain.dog](https://app.brain.dog).** Each record is its own database on Cloudflare. Keys are
sealed, and a sealed copy is made every night. Sign-up is by invitation for now: ask for one at [brain.dog](https://brain.dog).

**Run it yourself.** Free, one container and one volume, no account with us.

### Run it yourself

```sh
git clone https://github.com/actuallyhoss/BrainDog braindog
cd braindog
cp selfhost.env.example .env      # set BRAINDOG_OWNER (your email) and BRAINDOG_SERVER_KEY (the server key)
docker compose up -d --build
docker compose logs braindog      # once started, it ends with the address
docker compose exec braindog cat /data/claim-link      # a one-time link: open it and add a passkey
```

Without Docker you need Node 24.13 or later and pnpm. This serves it to your own machine, where nobody signs in:

```sh
pnpm install
pnpm --filter @braindog/web build
export BRAINDOG_DATA=$HOME/braindog-data
node apps/selfhost/src/main.ts init <record name> --owner <your email>
node apps/selfhost/src/main.ts
```

Mail, a model for Slash and a public address are all optional and off until you set them.
[apps/selfhost/README.md](apps/selfhost/README.md) covers connecting agents, backups, restores and upgrades, and
[docs/49-SPEC-SELFHOST.md](docs/49-SPEC-SELFHOST.md) every setting the server reads.

## Add-ons and starters

Projects, Work, People and Agents are built in. Everything else is an add-on you install from the app's Add-ons
page: Money and its parts (investments and gold, property, insurance, debts, goals, trips, certificates, zakat),
bank and Stripe feeds, standups, project briefs and more. A starter is a set of add-ons and example rows for one
kind of work, such as a photographer, a landlord or a retainer business.

An add-on is data, not code: a readable file of lists, pages, figures, rules and small scripts that you can read
and diff before it is applied, and it installs through the same path a person presses. They live in
[`packs/`](packs/) (the folder keeps its old name), and [packs/README.md](packs/README.md) shows how to write one.

## How it's built

TypeScript throughout, on Node 24 with no build step for most packages.

- `packages/kernel` is the write path: one way in, an append-only ledger, types, filters, figures and rules.
- `packages/record` puts the kernel, the declarations and add-ons together into one record over SQLite, and
  `packages/mcp` serves it to agents.
- `apps/web` is the app, in SvelteKit. The same build is served by both hosts.
- `apps/worker` is the hosted version on Cloudflare Workers, one Durable Object with its own SQLite per record.
- `apps/selfhost` is the same record on one Node process over `node:sqlite`, and the container.
- `apps/cli` is the `braindog` command line and `apps/site` is brain.dog. `apps/apple` is the iPhone and Mac app,
  coming and not out yet, and `apps/desktop` is the older Mac shell, kept for Windows and Linux later.
- `packages/render` is the block dialect and its renderers, published on its own as `braindog-render`.
- `tools/gates` holds the source checks every change passes.

The design is written down first, in [`docs/`](docs/). [docs/00-README.md](docs/00-README.md) is the index, and
[docs/01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) the place to start.

## Docs

- [brain.dog/docs](https://brain.dog/docs): using BrainDog, connecting agents, the HTTP API and writing add-ons.
- [`docs/`](docs/): the numbered design and specification documents.
- [DEPLOYMENT.md](DEPLOYMENT.md): how the hosted version is deployed.

## Security

Please don't open a public issue for a vulnerability. [SECURITY.md](SECURITY.md) says how to report one privately,
and [docs/12-SECURITY.md](docs/12-SECURITY.md) is the security model in full.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: it covers the build, the tests,
the gates and the house style, and a pull request that skips it is usually sent back. Everyone here follows the
[code of conduct](CODE_OF_CONDUCT.md).

## Licence

BrainDog is open source under the Apache License 2.0 ([LICENSE](LICENSE)), except `packages/render`, which is under
the MIT License ([packages/render/LICENSE](packages/render/LICENSE)) so the block dialect can be embedded anywhere.
[LICENSING.md](LICENSING.md) explains the split.

The software is provided as is, without warranty of any kind, express or implied. See the licence texts for the full
terms.
