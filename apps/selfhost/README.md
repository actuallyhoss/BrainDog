# Run BrainDog yourself

BrainDog is Apache-2.0 (the renderer is MIT) and the self-host is free. One container, one volume, no account
with us. You need Docker with Compose, or Node 24.13 and pnpm.

## Zero to working in 5 minutes

Start at the top of your copy of this repository:

```sh
cp selfhost.env.example .env
```

Edit `.env` and set two things:

- `BRAINDOG_OWNER`: your email. The first start makes your record for it.
- `BRAINDOG_SERVER_KEY`: the server key. Make one with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.

```sh
docker compose up -d --build
docker compose logs braindog
docker compose exec braindog cat /data/claim-link
```

Once it has started, the log ends with the address and says a one-time sign-in link is in `/data/claim-link`. The
last line prints that link: open it and add a passkey. It works once, for 24 hours, and `docker compose restart` makes
a new one until a passkey exists. The link is never written to the log, because anybody who reads it could sign in as
you.

Health: `curl localhost:8080/healthz`. Every command the server has: `docker compose exec braindog node apps/selfhost/src/main.ts --help`.

An older `.env` that says `BRAINDOG_TOKEN` and `BRAINDOG_HOST` still works. The new names are there because the
`braindog` command line reads those two as its own.

### Without Docker

From the top of the repository:

```sh
pnpm install
pnpm --filter @braindog/web build
export BRAINDOG_DATA="$HOME/braindog-data"
node apps/selfhost/src/main.ts init <record name> --owner <your email>
node apps/selfhost/src/main.ts
```

That serves `http://localhost:8080` to this machine only, and nobody signs in: any request from this machine is you.
To sign in with a passkey and connect agents, also export `BRAINDOG_SERVER_KEY` before the last line; it then listens
on your network too, unless you set `BRAINDOG_LISTEN=127.0.0.1`. Without the web build the server still starts, and
says the app is not built.

## Connect your agents

The address of your record is the server's address and the record's name, such as `http://localhost:8080/home`.

- **The command line and the agents on a machine.** Install `braindog` as the top-level README says, sign in to the
  app in your browser, then run `braindog setup http://localhost:8080/home`. You approve six digits in the app, and it
  connects Claude Code and the other agents it finds.
- **A script, or a client that takes a token.** `braindog token create --host http://localhost:8080/home` prints a
  token once. Send it as `Authorization: Bearer <token>` to `http://localhost:8080/mcp`.
- **Claude's and ChatGPT's connectors** sign in with OAuth, which needs the server at an https address: put https in
  front (or set `BRAINDOG_TLS_CERT` and `BRAINDOG_TLS_KEY`), set `BRAINDOG_ORIGIN` to it, and add `<that address>/mcp`
  as a custom connector. At a plain http address OAuth is off, since a sign-in there could be read on the network. The
  start log says which, in its `oauth:` line.
- **With no server key** (the start without Docker above), nobody signs in, so there are no tokens and no OAuth. The
  command line on that machine reaches it with `BRAINDOG_HOST=http://localhost:8080/<record name>` and no token.

## What is off, and how to turn it on

The server says each of these in one line when it starts. None is an error.

- Mail: off until `BRAINDOG_SMTP_URL` and `BRAINDOG_MAIL_FROM` are set. Passkeys and the server key work without it.
- Model: off until someone adds their own key in the app (Settings, Keys). Nothing else needs it.
- Billing: always off. Nothing is charged or counted.
- Turnstile: off. Self-host has no public sign-up.
- OAuth: off at a plain http address. See Connect your agents.

Every setting is in `selfhost.env.example`. For a public address, put https in front (or set `BRAINDOG_TLS_CERT` and
`BRAINDOG_TLS_KEY`) and set `BRAINDOG_ORIGIN` to it. Passkeys are tied to that address, so choose it first. If you
change `BRAINDOG_PORT`, the default address follows it; set `BRAINDOG_ORIGIN` too when people reach the server some
other way.

## Backups

The server keeps a nightly copy of the record beside it (30 kept, time set by `BRAINDOG_BACKUP_AT`). That is on the
same disk, so also take one off it, into a folder outside this repository:

```sh
docker compose exec braindog node apps/selfhost/src/main.ts backup /data/backups
mkdir -p ~/braindog-backups
docker compose cp braindog:/data/backups/. ~/braindog-backups/
```

A backup folder holds the key file, the record and its inbound mail token (the secret forwarded mail is sent in with),
so keep it as private as the key. Never put one in this repository folder: everything in it is sent to `docker build`.
`.dockerignore` keeps backups, key files and `.env` out, and the image will not build or start if one gets in anyway.
Without the key file the copy cannot be opened.

To restore, start the volume empty (a new machine, or `docker compose down -v`, which deletes the record in it), then:

```sh
docker compose run --rm --user root -v "$HOME/braindog-backups/braindog-<time>:/restore:ro" braindog \
  sh -c 'node apps/selfhost/src/main.ts restore /restore && chown -R node:node /data'
docker compose up -d
```

The backup is read from where it is, mounted read-only, and never copied into the build folder. It runs as root so it
can read your files whatever user owns them, and then hands the data to the server's user. It refuses a data folder
that already holds a record. The restore drill is the same two steps on a spare machine, then sign in and check your
lists; do it once before you rely on a backup.

A `.brainl` file from `braindog export` holds one record, and goes into an empty volume the same way:

```sh
docker compose run --rm --user root -v "$HOME/Downloads:/import:ro" braindog \
  sh -c 'node apps/selfhost/src/main.ts init <record name> --from /import/<file>.brainl && chown -R node:node /data'
docker compose up -d
```

`init` refuses a data folder that already holds a record, since the server serves one. Settings, Backups in the app
lists, downloads and restores the nightly copies.

## Upgrade

```sh
docker compose exec braindog node apps/selfhost/src/main.ts backup /data/backups
mkdir -p ~/braindog-backups
docker compose cp braindog:/data/backups/. ~/braindog-backups/
git pull
docker compose up -d --build
docker compose logs --tail 20 braindog
```

Migrations run on start. If the log says the record belongs to a newer build, go back to the build you had, or restore
the backup from before the upgrade (Backups, above). Your `.env` and the volume are untouched by an upgrade.

More: `docs/49-SPEC-SELFHOST.md`.
