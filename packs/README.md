# `packs/`

Plugins that are data on a record, not code in BrainDog. Each folder here is one plugin (the files and the command
line still call it a pack): the file a record
installs, any script it runs, and the tests that prove it installs and does what it says. They are written to be
read. If you are about to write your first plugin, start with `hello`, then open the one below nearest to what you
want to make.

**BrainDog is the shell.** The core ships lists, fields, pages, blocks, figures, digests, scripts and automations, and
every plugin and starter is built on top of them. A feature that knows about a kind of business, a bank or one person's projects
does not go in `packages/` or `apps/`. It goes here, as a file anybody could have written, installed through the same
`planPack` and `installPack` a person presses in the app. If a feature needs something the shell cannot yet say, the
missing piece is built as a primitive, for everyone, and the feature stays a pack on top of it.

## The folder

```
packs/<id>/
  <id>.pack.json   the plugin: its manifest, its lists, what it lays on other plugins' lists (`extends`),
                   and its pages, figures, rules, digests and scripts
  <id>.test.json   rows to write into a scratch BrainDog, and what the record should then hold
  <id>.test.ts     a fresh record, the plugin installed exactly as it ships, and what a person or an agent then sees
  *.js             a script the plugin runs, when it has one
  README.md        what it adds, in a few lines, when it has one
  package.json     so `pnpm test` runs the test with every other workspace; it has no dependencies
  tsconfig.json    so the test is typechecked with the rest
```

`braindog pack new <id>` writes the start of this folder: the pack file with one list, a page over it and two example
rows, its `<id>.test.json` and a README. `packs/hello` is that folder with BrainDog's name on it, and its
`hello.test.ts` runs `pack check` and `pack test` through the command line's own functions.

A script lives twice: as `<name>.js`, which is the file you edit and read, and as the `source` of its declaration in
the pack file, which is what a record runs. The pack's test holds the two to be the same text, byte for byte. A script
opens with a comment saying what it does, in words a person deciding whether to install it can follow.

## The manifest

The top of a pack file says what the plugin is and what it needs. Its keys are the ones `MANIFEST_KEYS` names in
`packages/declare/src/catalogue.ts`; a record passes over any other key, and the Kennel refuses it.

- `pack` and `version`: the id a record holds it under, and its version as three numbers.
- `title` and `summary`: what a person sees on the Plugins page and in the plan before installing it.
- `changes`: what this version changed, in words a person will notice, at most 500 characters. The catalogue shows it
  as the version's notes.
- `author` and `license`.
- `icon` (optional): the name of one icon from the app's icon set, drawn beside the plugin in the store and the installed list.
- `requires`: the format and primitives it is written for, and each plugin it needs installed first, with a version
  range, as `"money-core": ">=3.0.0 <4.0.0"`.
- `uses`: every place of yours it reads or changes that is not its own, by id, as
  `["register.transactions", "metric.cash-now", "page.project", "activity"]` (a view of the whole record, such as
  `activity` or `governance.open`, is named as a block's `source` says it). A person sees these in plain words before installing,
  and a plugin can reach nothing it does not name. A file that says `uses` is held to it wherever it is read, and the
  store takes no plugin whose `uses` leaves one out. `braindog addon check` prints what it uses and the line to write.
- `declarations`: the lists, pages, figures, rules, digests and scripts it adds. Beside them, `extends` lays optional
  fields on another plugin's list, `config` declares the settings a person sets on the plugin's page, and `seeds` are
  example rows.

**A published version never changes.** A record that installed 1.0.0 is held to its checksum, so any change is a new
version, and the version says how big the change is: a major when a list, a page or a module goes or a field changes
type; a minor when a declaration, a module or a host is added; a patch for anything else, such as a changed page, rule,
script, title or word.

## The tests

A pack can carry a test of each kind, and they do different jobs. Every pack here has a `.test.ts` (`<id>.test.ts`, or
`bands.test.ts` in `portfolio-bands`); `hello` and `reading-list` carry a `<id>.test.json` beside it, as
`braindog pack new` starts every new one.

**`<id>.test.json` is the author's test**, the one `braindog pack test <folder>` runs. It installs the plugin in a
scratch BrainDog on your machine, after the modules it needs and its example rows, then writes each of `rows` as a
person would, with the record's rules running, and says each of `expect` as passed or failed:

```json
{
  "rows":   [ { "list": "items", "fields": { "name": "Check the test runs" } } ],
  "expect": [ { "list": "items", "count": 3 },
              { "figure": "open-items", "value": 3 },
              { "row": 1, "field": "state", "is": "open" } ]
}
```

A count counts the example rows too, `row` counts the rows above it from one, and a figure is read the way a page
reads it.

**`<id>.test.ts` is the repository's test**, run by `pnpm test` with every other workspace; the catalogue tool below
refuses a pack without one. It builds a record with `createRecordApi`, installs what the pack needs, then plans and
installs the pack file exactly as it ships, because a test that built the declarations by hand would pass while the
file was refused. Each one is held to these habits:

- **It proves itself red first.** It opens by asserting the record does not already do what the pack adds, so a pack
  whose fields turn out to exist already, or whose page is drawn by something else, fails its own first test instead
  of passing for the wrong reason.
- **It lays, it does not take.** A pack that adds to another pack's list does it with `extends`, which accepts only
  optional fields and new values on a closed list. Those leave every row readable and every other writer free to go
  on writing what it wrote. Uninstalling the pack takes its pages away and leaves what people wrote in its fields, as
  the record's own.
- **It runs on a fixed clock.** Anything that runs on a schedule is tested by moving the clock: the install arms it,
  the clock moves to the hour it was armed for, and the record's own drain runs it. `week-in-money` and `standup` do
  this with a digest.
- **It names nobody.** Fixtures are invented projects and invented wording. A pack is a file people share, and a test
  that quoted somebody's record would publish it.

## Checking and publishing to the Kennel

```
braindog pack check <folder>     read it, warn on any manifest key the Kennel does not take, install it in a
                                 scratch BrainDog and draw each page it adds, saying every refusal with its code
braindog pack test <folder>      run its <id>.test.json, as above
braindog pack preview <folder>   start a scratch BrainDog on this machine with the plugin in its catalogue
braindog pack publish <id>.pack.json --kennel [--sign <key file>]
```

`check`, `test` and `preview` send nothing. `publish --kennel` submits the file to the Kennel, as the person signed in
or signed with an author key made by `braindog pack key`, and says whether it is listed or waits for review. A later
version of the same plugin is published the same way, with its `changes` line saying what moved.
`braindog pack yank <id> <version> --reason <why>` withdraws a published version and says why.

## What is here

Roughly from the simplest to the most involved, each with what it shows you how to do.

| Folder | What it adds | What it shows |
| --- | --- | --- |
| `hello` | A list of things to do and a page of what is still open. | The smallest plugin, exactly as `braindog pack new` starts one, with its `.test.json`. |
| `reading-list` | Books, articles and papers to read, what is being read now, and a line on each one finished. | A list with a state, and a page with one table for each state. |
| `harbour-look` | A sea blue-green in place of the house red, on a cooler grey, in light and in dark. | A pack that is only a theme: one `theme` declaration and nothing else. |
| `roadmap` | Your dated tasks on one time axis, each dragged to a new date. | A page over another plugin's list, named in `requires`. |
| `project-brief` | On each project, one line on what it is, the plan, and what is in the way. | `extends`: optional fields laid on another plugin's list, and a block added to its page. |
| `pad` | Notes beside the work, each with room for a reply under it. | A list and its page and nothing else, so it installs on any record, model or not. |
| `pad-second-opinion` | A second opinion from Slash written under each note on the pad, spending your record's model allowance. | A plugin that needs another (`requires`) and brings only an automation that asks Slash and writes the answer back, with no code. |
| `standup` | One message every morning: what moved, what is blocked, and what agents finished. | A daily digest whose sections are left out when empty, so a quiet morning sends nothing. |
| `agent-notes` | Two short notes a day about your agents: what they ask you, what they did, what is stuck. | Two daily digests over computed sources, every section left out when empty, in the app and by push, never by mail. |
| `profiles` | Each setup your agents run under, every machine it is on, and what no longer matches there. | Two personal lists only the owner reads, one playing an agents part by its `role:`, a Profiles field laid on Tools and Skills by `extends`, and automations that read a day passing. |
| `setup-sync` | What each of your machines carries to the next, sealed on the machine before it leaves, with each machine's last bundle and the last restore drill. | A plugin that needs two others (`requires`), three personal lists the command line finds by a `role:` and by their fields, eight starter things, and automations that ask when a machine goes quiet or a drill is due. |
| `week-in-money` | One message every Monday: cash now, what fell due each way, and what money arrived. | A weekly digest with a figure, and two sentences from Slash on top (`prose: slash`). |
| `holdings` | What you hold rather than spend, with what each one cost and what they cost together. | Figures over a list, and a small script run by a rule and once a day. |
| `dates` | The days somebody else fixed: a deadline, a window with a last day, and a date that comes round. | A script started by a rule on a daily clock, and a row moved by an update so its history keeps every turn. |
| `estate` | Domains, hosting, subscriptions, memberships, insurance and bills, and when each one renews. | Parts that wait on what a record holds (`when: { holds }`), settings a figure is held to, and a test that holds the file equal to the module it replaces. |
| `people` | Clients, contractors and accountants, the organisations they are with, and where each one was seen. | Parts that wait on two lists it does not own (`when: { holds }`), and a test that holds the file equal to the module it replaces on every record BrainDog makes. |
| `work` | Tasks, the threads of work they belong to, and how each thread is going. | A module's whole file with every cut it can make written as `when: { holds }`, two scripts kept as files beside it, and a test over every mix of the neighbours it reads that says out loud what it cannot say yet. |
| `portfolio` | What you are building, and the plan for each. | A module's whole file with its one cut written as `when: { holds }`, and a test that holds the file equal to the module on a record with Work and without it. |
| `worked-numbers` | Numbers worked out from your other numbers every day: a change over a week, a ratio, a share, a sum or a difference. | A daily script that reads another plugin's list and writes into it, with a value laid on that list by `extends`. |
| `count-cash` | A count of a cash box or an account, kept as a balance check with the difference in the ledger. | A script started by an automation on each new row, writing into another plugin's lists. |
| `money-watch` | A charge made twice and a payment that repeats, each asked about once, with a flag that switches itself off after three answers in a row that change nothing. | A script that writes a line in its own list, asks about it on the next run, and acts when the answer is written on the line. |
| `subscriptions` | What your subscriptions cost a month and a year, trials ending, what renews next and a price that went up. | Optional fields laid on Money's Repeating by `extends`, so the forecast already walks them, and a script that keeps the old price. |
| `splits` | Costs shared with a partner or friends, settling up, and where each person stands. | A list a script keeps from two others, and a Ledger field whose rule writes a row in the pack's own list. |
| `tax-set-aside` | A tax rate on a category of money in, the part of each payment to put aside, tax paid and the tax bills due. | Fields laid on three of Money's lists, and one script started by a line and by a category, each by its own rule. |
| `receipts` | A receipt on each Ledger line, a receipt sent in alone matched to its line, and the lines still wanting one. | A `file` field laid on the Ledger, a match that asks on Decide when two lines fit, and a nightly run that looks again. |
| `savings-circle` | A savings circle's months and your payout, written as a plan's parts. | A script that writes Money's Instalments from fields laid on Plans, so Cash ahead and Coming up count them. |
| `portfolio-bands` | What your projects take a month now, and the room left next and later, drawn as one bar. | A daily script, with settings a person fills in on the plugin's page. |
| `card-alerts` | A card alert, forwarded by mail or posted as a text message, read into Money as a transaction. | Doors that read a message into a list, one pattern for each wording. |
| `bank-hsbc-eg` | HSBC Egypt's alert mails and text messages read into Money, with the balance each one prints. | Many wordings behind one bank's doors, each tested with an invented message. |
| `stripe` | The Stripe balance and the payouts on their way to the bank, every hour, into Money's accounts. | A script that calls out to one host with a key held in the vault. |
| `mercury` | Mercury balances and the last thirty days of transactions, into Money. | A script that calls out, with how often it asks as a setting. |
| `rates-poll` | What one currency is worth in each other currency the record holds, every day. | A poll of a public address on a schedule. |
| `live-feed` | Figures polled from a stats address every hour. | The same, as the smallest example of a poll. |
| `launch-desk` | A desk for launching a thing in parts, with each part's next step, a calendar and a price check. | A whole set of pages and example rows for one kind of work, built on other plugins. |
| `task-tiers` | Four numbers on a task, and its priority worked out with the sum as the reason. | Optional fields laid on another plugin's list by `extends`, and a script that writes two fields its own automation does not watch. |
| `landlord` | The flats you rent out, each tenancy's rent, deposit and end day, the rent that came in and the repairs. | A starter nobody here runs, as a file only, with figures that hop back through a link (`pointed`) and a page per row in a rail section of its own. |
| `retainer-hours` | Each client's retainer, the hours it buys a month and the hours used, and what was billed of what was worked. | A starter nobody here runs, as a file only, on top of People, with a page whose figures add up the hours on each retainer since the first of the month. |
| `job-starter` | Three kinds of job to run on your own machine: a review of the week, a sort of what arrived, and where a repository stands. | Job kinds as declarations, installed through Decide, each reading and proposing and never skipping its permissions. |

## How the packs here reach a record

`node tools/catalogue/from-packs.mjs` publishes every `packs/<folder>/<folder>.pack.json` into
`apps/web/static/catalogue/`, the catalogue the app ships and every host serves at `/catalogue/`. It goes
through `publishTo`, the door `braindog pack publish` uses, so the file is read the way a record reads it and its
index line says what it reaches. From there:

- **The app** lists it on the Plugins page only when `packs/listed.json` names its catalogue id. Listing is opt in and only
  the owner adds an id there; a pack it does not name installs by id and is in no listing. The app asks the owner on
  Decide to install it.
- **The CLI** installs it by id, `braindog pack install project-brief`, from the host's catalogue, or from the file
  itself, `braindog pack install packs/project-brief/project-brief.pack.json`. `--dry-run` says what it would ask and
  sends nothing.

The catalogue id is the one the file gives itself, not its folder's name.

**The tool holds each version to what it published.** A pack edited without a later `version` stops it, and so does a
version that takes a list, page or field away without being a major. Run the tool after a pack's change is committed,
never over one still being written: a version it publishes is fixed.

**A pack with no test stops the tool.** Any `*.test.ts`, `*.test.mjs` or `*.test.js` beside the pack file counts. A
folder with no `<folder>.pack.json`, such as an import adapter, is passed over.

The first-party modules are still read from `packages/seed`, and moving them here is its own piece of work.
