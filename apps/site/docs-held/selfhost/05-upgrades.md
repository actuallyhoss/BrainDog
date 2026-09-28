# Upgrades and keys

Nothing on a self-hosted BrainDog upgrades by itself. You choose when to take a new build, and the record's tables are brought up to date the first time the new build opens it.

## Upgrading

```steps | Taking a new build
Take a copy | press "Back up now" in the app, or copy the data folder | so there is a way back
Stop the server | it closes the record so the file is whole | Ctrl+C, or docker stop
Take the new source | pull it, then pnpm install and pnpm --filter @braindog/web build | or build the image again
Start it | the record's tables are brought up to date as it opens | one line says what it serves
```

~~~code | As written
```steps | Taking a new build
Take a copy | press "Back up now" in the app, or copy the data folder | so there is a way back
Stop the server | it closes the record so the file is whole | Ctrl+C, or docker stop
Take the new source | pull it, then pnpm install and pnpm --filter @braindog/web build | or build the image again
Start it | the record's tables are brought up to date as it opens | one line says what it serves
```
~~~

Each change to the record's tables is a numbered migration, applied once, in order, and recorded in the record with a checksum. A build never changes a migration that has already been applied; it adds a new one.

## When a build and a record disagree

A server started on a record it cannot open does not exit. It serves every request a 503 with the reason, and `/healthz` answers with the code, so you can read what is wrong from the outside:

- **`SCHEMA_NEWER`**: the record was written by a newer build than this one, which is what happens after going back to an older build. Deploy the newer build again. A build never opens a record it does not understand.
- **`SCHEMA_MISMATCH`**: a migration already applied to the record is not the text this build holds. The build is wrong, not the record.

## Rotating the key file

The key file wraps every key the record seals. To change it, keep the old one beside the new one with `.prev` on the end:

```code | In the data folder
mv kek kek.prev
```

Then give the server a new key file, either by letting it make one as `kek` or by naming one with `BRAINDOG_KEK_FILE` and putting the old one beside it as `<file>.prev`, and start it. As it starts, it moves every key in the record from the old wrapping to the new one before anybody asks for a key, and says what it did. Keep `.prev` until no backup taken before the change will ever be restored, then remove it.

## Sessions

People stay signed in across restarts because the session key is derived from the key file. `BRAINDOG_SESSION_SECRET` sets it separately, as at least 32 random characters, for a server that should keep sessions across a new key file, or end them all without changing it.

## After an incident

If a key held by an agent or a machine may have leaked, set `BRAINDOG_TOKENS_VALID_FROM` to an instant with its zone, such as `2026-09-25T12:00:00Z`, and restart. Every agent key and device grant the record issued before that instant is then refused, and the people who hold them sign in again. A value that does not read refuses every bearer, the safe way for it to fail, and the server says why once.

Changing `BRAINDOG_TOKEN` itself replaces the server key; anything that held the old one stops working at the restart.
