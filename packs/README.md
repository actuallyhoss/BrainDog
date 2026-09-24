# `packs/`

Features that are data on the record, not code in BrainDog. Each folder is one pack: the pack file a record installs,
any script it runs, and the test that proves it installs and does what it says.

It exists because of one rule (`loop/DIRECTION.md` sections 22 and 24): **BrainDog is the shell**. The core ships
primitives, lists, fields, pages, blocks, scripts and automations, and a use case is built on top of them. A feature
that knows about a kind of business, a bank or one person's projects does not go in `packages/` or `apps/`. It goes
here, as a file anybody could have written, installed through the same `planPack` and `installPack` a person presses
in the app. If a feature needs something the shell cannot yet say, the missing piece is built as a primitive, for
everyone, and the feature stays a pack on top of it.

```
packs/<id>/
  <id>.pack.json   the pack: its lists, what it lays on other packs' lists (`extends`), its pages
  <id>.test.ts     a fresh record, the pack installed, and what a person or an agent then sees
  *.js             a script the pack runs, when it has one
  package.json     so `pnpm test` runs the test with every other workspace
```

## What a pack here is held to

**It installs through the record's own door.** A test builds a record with `createRecordApi`, installs the modules the
pack needs, then plans and installs the pack file exactly as it ships. A test that built the declarations by hand
would pass while the file refused.

**It proves itself red first.** Each test opens by asserting the record does not already do what the pack adds, so a
pack whose fields turn out to exist already, or whose page is drawn by something else, fails its own first test
instead of passing for the wrong reason.

**It lays, it does not take.** A pack that adds to another pack's list does it with `extends`, which accepts only
optional fields and new values on a closed list. Those leave every row readable and every other writer free to go on
writing what it wrote, so the plan asks nobody to press anything. Uninstalling the pack takes its pages away and leaves
what people wrote in its fields, as the record's own.

**It names nobody.** Fixtures are invented projects and invented wording. A pack is a file people share, and a test
that quoted somebody's record would publish it.

## What is here

| Pack | What it adds |
| --- | --- |
| `project-brief` | On each project, one line saying what it is, the plan, and what is in the way; and a Briefs page drawing all three over the projects in play. |
| `portfolio-bands` | A daily script that splits the revenue across projects into now, next and later, one amount per currency, and a split bar that draws the three. |
| `rates-poll` | Exchange rates fetched on a schedule into the record, for whichever currencies it names. |
| `mercury` | Balances from a Mercury bank account, pulled on a schedule through a key held in the vault. |

## What is not here yet

The catalogue still reads the first-party packs from `packages/seed`. Moving them, and reading the catalogue from this
folder, is its own piece of work; until then a pack here is installed from its file.
