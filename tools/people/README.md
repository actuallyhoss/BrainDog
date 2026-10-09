# People

Made-up people who sign up and use BrainDog the way a stranger would, and the checks that say whether what they see
is right. This folder holds data and checks only. Use case 6 of the vision mockup (his word of 9 October) is walked
here for one person, Mariam. The other seven people of USE-B01 and their nightly use come in later batches.

## Files

- `mariam.json`: who she is, what she types at "Who are you?", the starting point she would tap, her one answer
  (`messages`), her address at a test sink, her first real thing ("Nadia wants 3 vanilla jars for Friday, paid 900 on
  InstaPay"), what she tells on later days, and under `expect` what each step must show.
- `expect/first-run.mjs`: the walk. `expect.*` are pure checks, one for each step, that take what was seen and answer
  `{ id, pass, saw }`. `walk(person, host)` goes through the seven steps the way a browser does and hands each check
  what it saw. `selfHost(person)` starts a fresh self-host on a clock the walk can move. `deployed(origin, linkFile)`
  is a host already running.
- `check-files.mjs`: checks every person file for every field the walk reads, with no network. A file missing a field
  is refused by name.
- `test/first-run.test.mjs`: checks the file, checks that every step's check goes red on a broken step, then walks
  Mariam on a fresh self-host and fails on the first red step.

## Running it

Node 24, never the Mac's default Node 26, which breaks the SQLite the self-host uses:

```sh
export PATH=~/.nvm/versions/node/v24.13.0/bin:$PATH
node tools/people/check-files.mjs                      # every person file: "ok", or what is missing
node tools/people/expect/first-run.mjs                 # Mariam on a fresh self-host, seven lines
node --test tools/people/test/first-run.test.mjs       # the same walk as a test
```

After a deploy, on the hosted service:

```sh
node tools/people/expect/first-run.mjs --base https://<the host> --link-file /tmp/mariam-link.txt
```

The walk asks for the sign-up link, then waits up to five minutes for whoever reads the test mailbox to put the link
in that file.

## The seven lines

Each line is the step's number and name, then `green`, `red` or `not walked`, then what the walk saw. Red says what
was wrong. The walk keeps going after a red step wherever it can, so one run names every broken step. It exits 1 if
any step is red.

| Step | What green means | Who builds it |
| --- | --- | --- |
| 1. Who are you? | The heading is "Who are you?", the five starting points include hers, and the three promises are made: free with no card, nothing saved until you keep it, yours to export or move. No tour, checklist or "N of M". | signup-flow-46 |
| 2. Her words light up | Her sentence reads as Shop. Each phrase it heard lights up where she typed it. Her name becomes "you", the record is called "Mariam's Candles", Today comes first, then Orders, Products, People and Money. No sample entries. | first-read-45, shop-usecase-45, signup-flow-46 |
| 3. One question | Exactly one question ("Where do your orders come in?"). Each of its three answers says what it means, and it says it is the only question. Her answer is kept and nothing more is asked. | first-read-45, signup-flow-46 |
| 4. Keep it | The mailed link makes her, the free record is made and opened as the sign-up page does it, then the build she saw is kept: Orders, Products, People and Money, with her as the only person in People, nothing tagged as an example, and the record in EGP. | link-carry-45, signup-flow-46, signup-build-46, signin-46 |
| 5. Tell it one real thing | The card previews her sentence as a client, an order and money in. Nothing is added before the press. One press adds them all under one batch, and the lists grow by exactly that many. One Undo takes them all back: every list is back to its count, and each entry the press made is looked for by its number and gone. | capture-record-45, capture-read-45, first-today-parts-45 |
| 6. Her first Today | Once she has told it something, the card is gone. The next steps come in the order her answer puts them, Hide hides them, and nothing drawn from use is offered on day 0. | first-today-parts-45, home-first-46 |
| 7. A page for her pattern | With Orders read on three different weeks and four orders due this week, nothing is offered on day 13. On day 15 the pen offers `week:orders`, saying why in her list's own words. | offer-pattern-45, offer-card-46 |

On the self-host, step 4 says `not walked` and "sign-up not walked: self-host". The self-host has no sign-up, so the
walk opens the record the way its owner does, with the server key, and builds it the same way. If the build fails, the
line is red.

The walk writes only to a record it has just made. Before the build, the record the tab is in must have her record
name and hold no entries. If it is any other record, step 4 is red with "nothing was written to it" and steps 5 to 7
are not reached.

On a deployed host, step 7 says `not walked`, because the real clock cannot jump 15 days. Day 15 there
needs a standing record.

## What the walk cannot see

It reads the screens' own code and the host's answers, never pixels. Whether each step looks right at 390 and 1440 is
for the proof area's screenshot reader and for him.
