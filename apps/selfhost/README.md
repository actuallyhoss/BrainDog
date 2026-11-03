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

Health: `curl localhost:${BRAINDOG_PORT:-8080}/healthz`. Every command the server has: `docker compose exec braindog node apps/selfhost/src/main.ts --help`.

The port is published on this machine only (`127.0.0.1`), so your own browser and a proxy on the same machine reach
it and nothing else does. To open it to your network, set `BRAINDOG_PUBLISH=0.0.0.0` in `.env` and serve https (see
What is off), since the server key and the sign-in cookie would otherwise cross it in the clear.

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
  as a custom connector. At a plain http address OAuth is off, since a sign-in there could be read on the network,
  except when the server listens on this machine alone (`BRAINDOG_LISTEN=127.0.0.1`), where nothing crosses the
  network: then a connector on this machine can add `http://localhost:8080/mcp`. The start log says which, in its
  `oauth:` line.
- **With no server key** (the start without Docker above), nobody signs in, so there are no tokens and no OAuth. The
  command line on that machine reaches it with `BRAINDOG_HOST=http://localhost:8080/<record name>` and no token.

## What is off, and how to turn it on

The server says each of these in one line when it starts. None is an error.

- Mail: off until `BRAINDOG_SMTP_URL` and `BRAINDOG_MAIL_FROM` are set. Passkeys and the server key work without it.
  When they are set, the start signs in to the mail server without sending anything and says `mail: signed in` or
  `mail: could not reach or sign in`. The domain of `BRAINDOG_MAIL_FROM` needs SPF and DKIM set up at your mail
  provider, or sign-in links land in spam.
- Inviting people works best with mail. Somebody new proves their address by opening a mail before they join. With
  mail on, the invitation is mailed at once, naming you and the BrainDog, and one press of Join is enough. Without
  mail, the link from the invite sheet works only for an address that already signs in here, so for somebody new
  whoever runs the server vouches for them instead (Invite without mail, below). Either way the owner needs a passkey
  before anybody else can join.
- Phone and browser notifications: off. They go out through BrainDog Cloud's keys, which a self-host does not have.
  Settings, Notifications says so; what is handed to somebody or mentions them waits in their bell and Needs you.
- The iPhone and Mac apps: they sign in to BrainDog Cloud only for now. Asked to sign in here, the server answers that
  in plain words; use the app in a browser instead.

Everything else works here as on the Cloud: roles and Settings, Who can do what; handing ownership to a colleague;
read-only links to a page or a project; seeing who else is on a page; mentions; importing contacts and bank statements.
The daily page checks run once a day in one go rather than in slices, since one process has no time limit per run.
- Model: off until someone adds their own key in the app (Settings, Keys). Nothing else needs it.
- Billing: always off. Nothing is charged or counted.
- Turnstile: off. Self-host has no public sign-up.
- OAuth: off at a plain http address, unless the server listens on this machine alone. See Connect your agents.
- Plugins: they send no requests to other servers until `BRAINDOG_OUTBOUND=on`. The public plugin registry is read
  either way; `BRAINDOG_KENNEL=off` stops that.

It may also say:

- `plain http on every interface` (or, on Docker, `plain http on your network`): the server key goes over the network
  unencrypted. Set `BRAINDOG_TLS_CERT` and `BRAINDOG_TLS_KEY`, put https in front, or keep it on this machine
  (`BRAINDOG_LISTEN=127.0.0.1` without Docker; leave `BRAINDOG_PUBLISH` unset with it).
- `This looks like it is behind a proxy`: requests arrive at an https address this process does not serve itself, and
  `BRAINDOG_TRUST_PROXY` is not set, so ten wrong keys from anywhere lock the server key for everyone. Set it (below).
- `the name changed from … to …`: `BRAINDOG_ORIGIN` or the certificate moved, and passkeys made at the old name stop
  working there; each device adds one again.
- `first time: a one-time sign-in link …`: until a passkey exists. The file is removed once the first passkey is added.

### Invite without mail

Invite them from People in the app first and choose what they can do. Then, on the server:

```sh
node apps/selfhost/src/main.ts invite ada@example.com
# Docker:
docker compose exec braindog node apps/selfhost/src/main.ts invite ada@example.com
```

It prints one link, in that terminal only, and you send it to them however you like. The link holds the proof the mail
would have carried, so opening it and pressing Join is enough. It works once, runs out in a day, and replaces the link
the invite sheet showed. When they join, Activity says they were invited by the server's operator.

- No invitation waiting? Say what they can do here instead: `--as read`, `append`, `write`, `decide` or `owner`
  (Can view, Can add, Can edit, Can decide, Owner).
- More than one BrainDog in the data folder? Name it with `--record <name>`.
- Somebody who already signs in here gets the plain link: they sign in, then open it.
- It reads the same settings as the server (`BRAINDOG_DATA`, `BRAINDOG_ORIGIN`, the key file), so run it with the same
  `.env`. Nothing reaches it over the network, and the link is never written to a file or a log.

### Behind a proxy

Caddy, nginx or cloudflared in front: set `BRAINDOG_ORIGIN` to the https address it answers at, and
`BRAINDOG_TRUST_PROXY`, so the sign-in lockout and the rate limits count the real caller. Best is the proxy's own
address (`BRAINDOG_TRUST_PROXY=127.0.0.1`, or the proxy container's own address in Docker): then each caller is counted
on its own, and nobody can lock you out by guessing. `1` is the quick setting: it believes `X-Forwarded-For` from
anything on this machine or a private network, so the whole LAN counts as a proxy, and anybody on it who reaches the
port can claim a new address per guess; a range such as `172.16.0.0/12` is the same for every machine in it. With `1` or
a range the wrong keys through each proxy are counted too: over 200 in fifteen minutes, keys through it are rate limited
to one every two seconds, one more waits its turn and the rest are told to try again (the right key still works when its
turn comes), and the log says so once. The
server's port must then be reachable only through the proxy: keep the default publish on `127.0.0.1`.

### Mail in

Forwarded mail (Settings, What comes in) is posted to `<your address>/in/email/<token>` as the raw message (RFC 5322)
in the request body, from something on the internet, so `BRAINDOG_ORIGIN` must be a public https address. Mail
providers do not post mail anywhere themselves: use a Cloudflare Email Worker that forwards `message.raw` with
`fetch`, or a procmail or Postfix pipe that runs `curl --data-binary @- <address>`. BrainDog checks each message's DKIM
signature against DNS itself, so a forwarder that rewrites the message breaks it, and that mail waits in the Inbox,
unfiled. The token is in the data folder; print the whole address with:

```sh
docker compose exec braindog sh -c 'echo "$BRAINDOG_ORIGIN/in/email/$(cat /data/home/inbound.token)"'
```

(`home` is the record's name.)

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
Without the key file your saved keys stay sealed; everything else in it is readable, so keep the copy as private as
the key. The same holds for a copy downloaded from Settings, Backups: it is the record without the key file, so keep
the key file (`docker compose cp braindog:/data/kek ~/braindog-backups/`) to put it back.

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
