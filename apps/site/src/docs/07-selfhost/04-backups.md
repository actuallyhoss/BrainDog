# Backups and restore

A self-hosted BrainDog copies itself every night, beside the record, and can be moved or restored from a single file. The one thing it cannot back up for you is the key file, which has to live somewhere else.

## The nightly copy

Once a day the server takes a copy of the whole record into the record's `snapshots` folder, and a copy of `directory.sqlite` into `directory-snapshots` in the data folder, because the directory is the only file that knows which name reaches which record and who can sign in to it.

```params | The nightly copy
When | 03:20 in UTC | set BRAINDOG_BACKUP_AT to another HH:MM, or to off
Kept | the 30 newest | apart from the ones you take yourself
Where | beside the record | in the snapshots folder, and directory-snapshots beside the directory
Caught up | when it next looks | a machine that was asleep takes the copy it missed
```

~~~code | As written
```params | The nightly copy
When | 03:20 in UTC | set BRAINDOG_BACKUP_AT to another HH:MM, or to off
Kept | the 30 newest | apart from the ones you take yourself
Where | beside the record | in the snapshots folder, and directory-snapshots beside the directory
Caught up | when it next looks | a machine that was asleep takes the copy it missed
```
~~~

In the app, the record's backups list every copy with its size, download any of them, and put one back. "Back up now" takes one straight away, kept apart from the nightly ones. A copy that cannot be written does not stop the server: it says so in one line and tries again on the clock.

These copies sit on the same disk as the record. They guard against a mistake, not against losing the machine, so copy the data folder, or the snapshots in it, somewhere else as well.

## The key file

Every key the record seals, and the signature on every export, depends on the key file, `kek` in the data folder unless `BRAINDOG_KEK_FILE` names another. Back it up somewhere other than the machine and other than the record's backups. A record restored without it opens, but its sealed keys stay shut and its exports go out unsigned.

## A copy to take away

```code | In a terminal
braindog export -o home.brainl --host https://braindog.example.com
braindog verify home.brainl
```

`export` takes the whole record as one `.brainl` file and checks it on your machine. It carries the sealed bytes and names the key they are wrapped by, so it is a backup rather than something to share; `--redact-grants` makes a copy to share instead, which cannot put the keys back. `verify` checks a file's format, every table against its manifest, and its signature, and sends nothing. The owner approves an export in the app with six digits, unless the command line holds the server key as `BRAINDOG_TOKEN`.

## Restoring onto a new server

A copy becomes the record a new server serves with `init --from`:

```code | In a terminal
node apps/selfhost/src/main.ts init home --from home.brainl
```

The file is checked first, against itself and against `--key <public key>` when you name one, then brought up to this build's tables, then imported whole: its own id, rows, members and keys. Only then does the directory name it. The owner is the one the file names. Put the old key file in place first, as `kek` in the data folder or through `BRAINDOG_KEK_FILE`, or the record's sealed keys will not open.

## Putting a record back in place

```code | In a terminal
braindog import home.brainl --host https://braindog.example.com
```

`import` checks the file on your machine, then replaces everything the record holds with the copy. A record takes back only its own copy, never another record's. The owner approves it in the app, unless the command line holds the server key.

## Moving from brain.dog

A record exported from brain.dog is a `.brainl` like any other, so `init --from` makes it the record your server serves. Its sealed keys were wrapped by brain.dog's keys rather than yours, so they stay shut on your server: add those keys again after the move.
