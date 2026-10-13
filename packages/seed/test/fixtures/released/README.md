# Released documents

One file for each first-party module and each pack in `packs/`, as brain.dog last served it:
`<id>-<version>.json`. `packages/seed/test/update-keeps-rows.test.ts` installs each one on a record, writes rows,
lets two nights pass, updates to the document in this tree and checks that nothing a person had was lost.

The files here were written from build `2026.10.10+6342372` (commit `63423720`, batches 34 to 50), the last deploy
on 13 October 2026.

## After a deploy

    export PATH=~/.nvm/versions/node/v24.13.0/bin:$PATH
    node packages/seed/test/fixtures/released/freeze.mjs <the deployed commit>

`freeze.mjs` unpacks that commit into a temporary folder with `git archive`, asks the commit's own code for each
module's document and reads each pack's file as it shipped, and writes whatever is not here yet. A file already here
is left alone, because a released version never changes; `--again` writes it over. It is the only thing that calls
git: the test reads these files and nothing else.

Keep the older files. The test takes every file here to the current version, so a record that skipped a release is
covered too. Take one away only when no record can still be on that version.

## What the files hold

A module's file is the whole document with its example rows, which the test leaves out when it installs. A pack's
file is its `<folder>.pack.json`, so a template (`live-feed`, `rates-poll`) is here unfilled and the test fills it
with the pack's own `fill.ts`. No file holds a key: a pack names the label of a key in the vault and never the key.

A module or a pack with no file here is new since the last deploy. The test names it and skips it.
