# Run BrainDog yourself

BrainDog is Apache-2.0 (the renderer is MIT) and the self-host is free. One container, one volume, no account
with us. You need Docker with Compose, or Node 24.13 and pnpm.

## Zero to working in 5 minutes

```sh
git clone https://github.com/actuallyhoss/BrainDog braindog
cd braindog
cp selfhost.env.example .env
```

Edit `.env` and set two things:

- `BRAINDOG_OWNER`: your email. The first start makes your record for it.
- `BRAINDOG_TOKEN`: the server key. Make one with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.

```sh
docker compose up -d --build
docker compose logs braindog
```

The log ends with the address and a line starting "first time: open ..." holding a one-time link. Open it and add a passkey. It works once; `docker compose restart` prints a new one until a passkey exists.
Health: `curl localhost:8080/healthz`.

Without Docker: `pnpm install && pnpm --filter @braindog/web build`, then `node apps/selfhost/src/main.ts`.

## What is off, and how to turn it on

The server says each of these in one line when it starts. None is an error.

- Mail: off until `BRAINDOG_SMTP_URL` and `BRAINDOG_MAIL_FROM` are set. Passkeys and the server key work without it.
- Model: off until someone adds their own key in the app (Settings, Keys). Nothing else needs it.
- Billing: always off. Nothing is charged or counted.
- Turnstile: off. Self-host has no public sign-up.

Every setting is in `selfhost.env.example`. For a public address, put https in front (or set `BRAINDOG_TLS_CERT` and
`BRAINDOG_TLS_KEY`) and set `BRAINDOG_ORIGIN` to it. Passkeys are tied to that address, so choose it first.

## Backups

The server keeps a nightly copy of the record beside it (30 kept, time set by `BRAINDOG_BACKUP_AT`). That is on the
same disk, so also take one off it:

```sh
docker compose exec braindog node apps/selfhost/src/main.ts backup /data/backups
docker compose cp braindog:/data/backups ./backups
```

A backup folder holds the key file, so keep it as private as the key. Without the key the copy cannot be opened.

To restore, start the volume empty (a new machine, or `docker compose down -v`), then:

```sh
docker compose run --rm -v "$PWD/backups/braindog-<time>:/restore:ro" braindog \
  node apps/selfhost/src/main.ts restore /restore
docker compose up -d
```

It refuses a data folder that already holds a record. The restore drill is the same two steps on a spare machine,
then sign in and check your lists; do it once before you rely on a backup. For one record, a `.brainl` file from
`braindog export` goes back with `main.ts init <name> --from <file.brainl>`, and Settings, Backups in the app lists,
downloads and restores the nightly copies.

## Upgrade

```sh
docker compose exec braindog node apps/selfhost/src/main.ts backup /data/backups
git pull
docker compose up -d --build
docker compose logs --tail 20 braindog
```

Migrations run on start. If the log says the record belongs to a newer build, go back to the build you had, or restore
the copy from before the upgrade. Your `.env` and the volume are untouched by an upgrade.

More: `docs/49-SPEC-SELFHOST.md`.
