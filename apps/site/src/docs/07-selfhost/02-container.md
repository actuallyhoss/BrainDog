# The container image

The self-host also builds as one container image: the record server and the app it serves, from the whole source tree, installed as BrainDog's own checks install it. The record lives in a volume, never in the image.

## Build the image

From the top of the source:

```code | In a terminal
docker build -f apps/selfhost/Dockerfile -t braindog .
```

The image is Node 24 on Debian, with the source installed exactly as the lockfile says and the app built into it. It runs as an unprivileged user, keeps the record in `/data`, and listens on port 8080.

## Make the record

`init` runs once, in a throwaway container over the volume:

```code | In a terminal
docker run --rm -v braindog:/data braindog node apps/selfhost/src/main.ts init home --owner you@example.com
```

The key file, the record and the directory are all made inside the volume. Nothing that opens the record is in the image or in its build: no server key, no key file and no address to listen on.

## Run it

```code | In a terminal
docker run -d --name braindog -v braindog:/data -p 8080:8080 --env-file /srv/braindog.env braindog
```

The env file is where the server key and the name live, decided on the machine that holds the record rather than baked into a layer anybody can pull. A minimal one, for a server behind a proxy that terminates TLS:

```code | /srv/braindog.env
BRAINDOG_TOKEN=a-long-random-server-key
BRAINDOG_ORIGIN=https://braindog.example.com
BRAINDOG_TRUST_PROXY=1
```

Keep that file readable by its owner only. [Reaching it](/docs/selfhost/reach) explains each line and the other two ways to serve it, and [every setting](/docs/selfhost/settings) lists the rest.

## Without a server key, it is sealed in

A server with no `BRAINDOG_TOKEN` treats every request as its owner's, so it listens only on its own loopback address. In a container, that means nothing outside it can reach it, whatever `-p` says. That is on purpose: a record nobody gave a key to is a record nobody else can open. Set `BRAINDOG_TOKEN` and the server listens on every interface, and asks everybody to sign in.

## Health

The image carries a health check that asks `/healthz` from inside the container, so `docker ps` says whether it is healthy. `/healthz` answers from the moment the process starts. A record this build cannot open, such as one written by a newer build, is served as a refusal: every request answers 503 with the reason, and `/healthz` names its code, so the container reports unhealthy rather than restarting in a loop.

## Stopping

`docker stop` sends the signal the server waits for: it finishes what it is writing, closes the record so the file is whole, and exits.

## Mail and backups in a container

The nightly copy is written inside the volume, beside the record, so a copy of the volume carries the record and its recent copies together. Keep the key file somewhere else as well, since a volume copy that holds the key file and the record together opens both. To send mail, add `BRAINDOG_SMTP_URL` and `BRAINDOG_MAIL_FROM` to the env file, as [reaching it](/docs/selfhost/reach) describes.
