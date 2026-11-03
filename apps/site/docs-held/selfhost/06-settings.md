# Every setting

A self-hosted BrainDog is configured entirely through its environment, read when the server starts. A setting that is half there, or wrong, stops the server with one sentence naming the fix, rather than starting a server that quietly does less than you asked.

## Where the record is

```params | Where the record is
BRAINDOG_DATA | the data folder | /data when unset; holds the key file, the directory and each record's folder
BRAINDOG_FILE | one record file to serve | instead of finding it in the data folder; also given as serve <file>
BRAINDOG_KEK_FILE | the key file | kek in the data folder when unset; a missing one is made, readable by its owner only
BRAINDOG_OWNER | the owner's email for init | stands in for --owner
```

## Who can reach it

```params | Who can reach it
BRAINDOG_TOKEN | the server key | without it, loopback only and no sign-in; with it, every interface and everybody signs in
PORT | the port | 8080 when unset
BRAINDOG_HOST | the interface to listen on | loopback without a server key, every interface with one
BRAINDOG_ORIGIN | the address people use | needed behind a proxy; taken from the certificate when TLS is here
BRAINDOG_TLS_CERT | the certificate file, PEM | set with BRAINDOG_TLS_KEY, or neither
BRAINDOG_TLS_KEY | its private key file, PEM | must be the key the certificate was made for
BRAINDOG_TRUST_PROXY | 1 behind a proxy | counts sign-in attempts by the client rather than the proxy
BRAINDOG_SESSION_SECRET | the session key's source | at least 32 characters; derived from the key file when unset
BRAINDOG_TOKENS_VALID_FROM | an instant with its zone | agent keys and device grants issued before it are refused
```

## Mail

```params | Mail
BRAINDOG_SMTP_URL | where mail goes | smtps://user:password@host:465, or smtp:// on 587 with STARTTLS
BRAINDOG_MAIL_FROM | who mail is from | one address; set both mail settings or neither
```

## Backups

```params | Backups
BRAINDOG_BACKUP_AT | when the nightly copy is taken | HH:MM in UTC, 03:20 when unset, or off
```

## Packs

```params | Packs
BRAINDOG_CATALOGUE | a catalogue folder of your own | offered first; the one bundled with the app when unset
BRAINDOG_KENNEL | the public catalogue | the Kennel on brain.dog when unset, or off for none
BRAINDOG_OUTBOUND | whether plugins send requests to other servers | off when unset, and their scheduled actions are held; on lets them. The public catalogue has its own switch, BRAINDOG_KENNEL
```

## The app

```params | The app
BRAINDOG_SHELL | the built app to serve | the web build in the source when unset
```

## As written

Each table above is a `params` block, the kind [lists and tables](/docs/dialect/lists) describes. The first one reads:

~~~code | As written
```params | Where the record is
BRAINDOG_DATA | the data folder | /data when unset; holds the key file, the directory and each record's folder
BRAINDOG_FILE | one record file to serve | instead of finding it in the data folder; also given as serve <file>
BRAINDOG_KEK_FILE | the key file | kek in the data folder when unset; a missing one is made, readable by its owner only
BRAINDOG_OWNER | the owner's email for init | stands in for --owner
```
~~~
