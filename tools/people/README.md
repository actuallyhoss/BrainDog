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
  is refused by name. What only some people say (what each phrase becomes, `expect.heard.became`; a shop's money tile,
  `expect.today.money`; its Orders sentence, `expect.offer.lead`) is checked only where a file holds it.
- `layla, omar, sam, nour, mona, yara, salma.json`: the other seven people of USE-B01 (Mariam stands in for Karim).
  `said` is the plain sentence; `says.plain`/`says.hard` are the sentence with and without a keyword; `expects` is the
  use case or none; `standing` is false for Yara and Salma; Omar and Nour carry an export in `file`.
- `expect/first-screen.mjs`: the day-0 screen checks over a rig's snapshot { path, width, text, roles, counts }; UNITS
  names the unit that turns each one green (no-count, nothing-before-press, no-example, team-no-task: USE-B07;
  people-only-them: USE-B06; rail-has-rows: USE-B02; no-tour: USE-B01).
- `sets/read-set.json` and `test/read-set.test.mjs`: forty sentences and the reading each must get; a sentence marked
  until may read wrong until that unit lands, and goes red if it reads right while still marked.
- `test/first-run.test.mjs`: checks the file, then one case a step: each check goes green on what that step shows
  when it works and red on what it shows when it breaks. Then it walks Mariam on a fresh self-host and fails on the
  first red step.

## Running it

Node 24, never the Mac's default Node 26, which breaks the SQLite the self-host uses:

```sh
export PATH=~/.nvm/versions/node/v24.13.0/bin:$PATH
node tools/people/check-files.mjs                      # every person file: "ok", or what is missing
node tools/people/expect/first-run.mjs                 # Mariam on a fresh self-host, seven lines
node --test tools/people/test/first-run.test.mjs       # the same walk as a test
node tools/people/expect/keep-it.mjs                    # step 4 on the hosted service, in one process: the mailed link, her sentence kept nowhere
node --test tools/people/test/first-screen.test.mjs
node --test tools/people/test/read-set.test.mjs
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
| 2. Her words light up | Read as the sign-up page reads it, with her phone's zone and its currency, her sentence reads as Shop. Whole phrases light up where she typed them: "a small candle shop" becomes Orders and Products, "freelance as a designer" Clients and Invoices, "who owes me" Money, in EGP. Her name becomes "you", the record is called "Mariam's Candles", and the places are Today, Orders, Products, Clients and Money, nothing more. No sample entries. | first-read-45, shop-usecase-45, signup-flow-46, uc6-heard-49 |
| 3. One question | Exactly one question ("Where do your orders come in?"). Each of its three answers says what it means, and it says it is the only question. Her answer is kept and nothing more is asked. | first-read-45, signup-flow-46 |
| 4. Keep it | The mailed link makes her, the free record is made and opened as the sign-up page does it, then the build she saw is kept, made by the page's own `accepting()` (`routes/signup/build.ts`), never a copy: Orders, Products, People, the Ledger and Bills and invoices, with her as the only person, nothing tagged as an example, and the record in EGP. | link-carry-45, signup-flow-46, signup-build-46, signin-46, uc6-signup-49 |
| 5. Tell it one real thing | The card previews her sentence as a client, an order and a paid item in Bills and invoices (a fresh shop holds no account, so not the Ledger). Nothing is added before the press. One press adds them all under one batch, and the lists grow by exactly that many. One Undo takes them all back: every list is back to its count, and each entry the press made is looked for by its number and gone. | capture-record-45, capture-read-45, first-today-parts-45, uc6-tell-49 |
| 6. Her first Today | Once she has told it something, the card is gone. Today, drawn by Home's own readers, has a money tile reading "In EGP 900". The next steps come in the order her answer puts them, Hide hides them, and nothing drawn from use is offered on day 0. | first-today-parts-45, home-first-46, uc6-today-49 |
| 7. A page for her pattern | With Orders read on three different weeks and four orders due this week, nothing is offered on day 13. On day 15 the pen offers `week:orders`, saying why in her list's own words, and the Orders page opens on its sentence: "N orders this month, N to ship this week, and Salma still owes EGP 1,350". | offer-pattern-45, offer-card-46, uc6-shop-49 |

The self-host has no sign-up, so the walk opens the record the way its owner does, with the server key, and builds it
the same way. Step 4's sign-up is walked on the hosted service instead, in one process (expect/keep-it.mjs): the mailed
link must carry her sentence, open "Mariam's Candles", and leave the sentence in no table and no log line. The passkey
needs a screen, so the line says "passkey: screen only". If either half fails, the line is red.

The walk writes only to a record it has just made. Before the build, the record the tab is in must have her record
name and hold no entries. If it is any other record, step 4 is red with "nothing was written to it" and steps 5 to 7
are not reached.

On a deployed host, step 7 says `not walked`, because the real clock cannot jump 15 days. Day 15 there
needs a standing record.

## What the walk cannot see

It reads the screens' own code and the host's answers, never pixels. Whether each step looks right at 390 and 1440 is
for the proof area's screenshot reader and for him.
