# 06 · Pages

> **A page is a row, not a file.**

Which is what makes "the Money page" something a freelancer never sees and a studio does — and
what turns onboarding from a blank screen into a choice.

---

## 1 · The page document, whole

```yaml
page: invoicing
title: Invoicing
nav: { section: Money, order: 20, icon: receipt }
requires: [register.invoices, register.clients]

blocks:
  - kind: stat
    heading: This quarter
    cells:
      - { metric: invoiced-q, label: Invoiced }
      - { metric: unpaid-90d, label: Unpaid over 90d }
      - { metric: mean-days-to-pay, label: Mean days to pay }

  - kind: table
    heading: Open
    source: register.invoices
    where:
      all:
        - { field: state, in: [sent, part] }
    columns:
      - { field: seq,    label: "#",      width: 4ch, align: end }
      - { field: client, label: Client,   link: true }
      - { field: amount, label: Amount,   align: end }
      - { field: due,    label: Due,      tone_when: { before: today, tone: bad } }
    order: [{ field: due, dir: asc }]
    empty: "Nothing outstanding."
    limit: 50

  - kind: note
    tone: info
    when: { metric: unpaid-90d, gt: 0 }
    body: "{{unpaid-90d}} has been outstanding over 90 days. UK statutory interest is 8% above base."
```

**That block is the authoring grammar, and there are two forms of this document.** The one above is
what the kernel accepts and what a pack ships. `columns:`, `cells:` and `order:` are lists of objects
and have to be: a column carries `label`, `width`, `align`, `link`, `tone_when` and `as`, and
`declare.ts` refuses a bare name with *"a column names a field"*. **`link` and `tone_when` are
specified and not built**: nothing reads either on either page path, a row that has somewhere to go
is already a link in whole, and the only tone a row wears is the one its register's own declaration
gives it, so the worked example above declares two keys that do nothing today. `where:` is the one key with two
legal spellings — the tree above, **and** the sentence `state is sent or part` — because `predicateOf`
(`kernel/src/metrics.ts`) takes `Predicate | string` and hands a string to `parseWhere`
([38-SPEC-WHERE](38-SPEC-WHERE.md)); every page the seed ships is written in the sentence form.

**The other form is the source view, and it is a summary rather than a round trip.** What a person
opens as *"how this is built"* — and downloads as `<page>.dog`, one page to one file — is printed by
`apps/web/src/lib/dog/source.ts`, which is the reference for that form. It flattens a column list to
bare field names, `cells:` to metric ids, `order:` to `due asc`, and prints `where:` as the sentence
the record holds. **`label`, `width`, `align`, `link`, `tone_when` and `as` are not in it**, so it is
text to read, diff and send, not text to feed back in as a declaration: everything it prints is true,
and it does not print everything. A page is the `.dog`; the whole record is a `.brain`
([03-DOG-FORMAT](03-DOG-FORMAT.md) §1).

Four properties worth naming:

**`requires` names registers, so a page cannot appear without its data.** A nav entry that opens
an empty screen is worse than no nav entry. Uninstall the pack that owns `register.invoices` and
this page leaves the nav automatically.

**`empty` is mandatory on every source-bound block.** An empty state that says nothing is a
dead end, and a record is *mostly* empty on day one. The empty string may interpolate, so it can
say something true rather than something generic.

> **And it must be null-safe, because day one is exactly when it renders.** A path whose value is
> missing renders `—`, never `null`, `undefined`, `NaN` or a sentence about a payment that never
> happened — which is why the string above interpolates nothing. An earlier draft used
> `{{invoices.last_paid | ago}}` in this very example, and a later one a conditional `{{? … }}`;
> neither form exists ([05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §7.2). Typed forms take a
> path — `{{ago:invoices.last_paid}}` — and a figure that only makes sense once a payment exists
> belongs in a block that has rows, not in `empty:`.

**`when` makes a block conditional.** Its leaf is the `where:` leaf shape with `metric:` in place of
`field:`, evaluated against the metric's current value at render and never compiled to SQL — the same
borrowing `required_when:` makes ([02-DATA-MODEL](02-DATA-MODEL.md) §5). The note above does not
render when the figure is zero. A page that shows a warning that does not apply teaches people to
ignore warnings.

**Rendered at runtime from the declaration against live rows.** No build step, no generated
code, no deploy to change a page. The rendering happens in the browser: the web app is a **static
shell** and no server renders a request; `toHTML` serves the mirror, exports, tests and the digest
email, never a page over HTTP ([36-SPEC-RENDER](36-SPEC-RENDER.md) §12, [50-SPEC-WEB](50-SPEC-WEB.md)
§13 #1). The read behind a page is `page({ slug })`, answered per block — `rows`, `total`, `drawn`,
`stale_at` ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.3).

### 1.1 · The keys

Every key, typed, with its default. A form is generated from this table ([21-AUTHORING](21-AUTHORING.md)
A7), and the install-time check refuses a key that is not in it, by name.

**On the page**

| Key | Type | Default | Required |
|---|---|---|---|
| `page` | the page id — `^[a-z][a-z0-9_]{0,31}$` | — | yes |
| `title` | text | — | yes |
| `nav` | `{ section: text, order: int, icon: glyph }` | absent — not in nav | no |
| `requires` | `[register.<id>, …]` — a list; the manifest's `requires` is a different key on a different object ([04-PACKS](04-PACKS.md) §2) | — | yes |
| `origin` | `derived \| person \| pack` | set by whoever writes the row: `pack` by the installer, `derived` by a trigger ([29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §3), `person` otherwise | no |
| `derived_from` | a declaration id — `register.domains` | — | when `origin: derived` |
| `placed` | bool — in nav, or in the holding pen | `true` | no |
| `tone` | intent — `good \| warn \| bad \| info` | — | no |
| `filters` | `[{ field, control }]` — reader filters every block honours ([21-AUTHORING](21-AUTHORING.md) §3.5) | `[]` | no |
| `header` | `{ count, action, filters, search, state }` — [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §5 | derived from the register | no |
| `blocks` | `[block]`, at most 24 | — | yes |

**On a block**

| Key | Type | Default | Required |
|---|---|---|---|
| `kind` | one of the twenty — [05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §2 — or a `block.<id>` this pack declares or the record has installed. A pack kind is **page-only** at stage 0: a write-up's fence takes the kinds that are not page-only ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.5) | — | yes |
| `heading` | text. On a `section` it is the section, drawn as a heading | — | `section` |
| `span` | int, 1–12 | 12 | no |
| `source` | `register.<id>` · `metric.<id>` · `block.<n>` (another block on this page) · `activity` (what was done in the record, with the kind of actor; a `feed`'s) · `sessions.live` (the runs working now) · `actions` (the record's scheduled actions, one row each). On a `section` it is what the count counts; on a `diff`, the register whose row it reads | — | `table`, `cards`, `feed`, `diff` |
| `where` | a predicate — [02-DATA-MODEL](02-DATA-MODEL.md) §6 | every row | no |
| `when` | `{ metric: <id>, <op>: v }` — evaluated at render, never compiled | always drawn | no |
| `columns` | `[{ field, label?, width?, align?: start \| end, link?: bool (**specified and not built**: no evaluator reads it, and a row that has somewhere to go is already a link in whole), tone_when? (**specified and not built**: no evaluator reads it, and a row's tone comes from its register's state field, not from its block), as? }]`. `as` is the column's role on a `cards` block: `title \| figure \| fact \| trend \| ring \| who \| when \| mark`, one figure and at most three facts. Absent, the first text column is the title, the first figure that never truncates is the figure, and the rest are facts. On a `table` or a `cards` block, `as: scope` on the register's scope field draws where the row applies instead: the project's name, or Everywhere | — | `table`, `cards` |
| `inherit` | bool. On a block over a register with a scope field ([02-DATA-MODEL](02-DATA-MODEL.md) §5), the rows of the project its `where` names, then the rows that apply everywhere. A project's row hides a global row of the same title where the field says `same: nearer`; otherwise both show. The project is named in `where` as `project is {{name}}` | `false` | no |
| `order` | `[{ field, dir: asc \| desc }]` | the first indexed date descending, else `seq` descending ([29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §5) | no |
| `limit` | int | 50, at most 500 | no |
| `empty` | text, interpolatable | — | **yes, on every block with a `source`** |
| `cells` | `[{ metric, label }]` | — | `stat` |
| `tone` | intent | — | no |
| `body` | markdown in the dialect | — | `note` |
| `icon` | a glyph name, drawn beside a `section`'s heading | — | no |
| `fold` | bool. A `section` that starts shut, folding the blocks after it up to the next section; one press opens it | `false` | no |
| `since` | `seen`, the reader's read mark. On a `feed`, the rows after it are new; the evaluator writes the `seen` row where it falls, with an empty time when the reader has no mark yet | absent: nothing is new | no |
| `first` | int, 1–50. On a `feed`, the most rows it draws, newest first, a collapsed burst being one row; what is past it goes in one last row per group, so no count loses anything | every row | no |
| `row` | a spoken id, interpolatable: `'{{spoken}}'` on a template. On a `diff`, the row whose history it reads | — | `diff` |
| `field` | a field id on that row, `document` or `text`. On a `diff`, the field whose versions it compares | — | `diff` |
| `versions` | int, 2–10. On a `diff`, how many versions it shows, newest first; each is compared with the one before it, one `diff` fence each | `2` | no |
| *`accepts` names* | on a pack-declared `kind`, the keys its `accepts:` names are legal here, typed `register · metric · number · text` ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.6) | per the block declaration | as the declaration says |

`tone_when` on a column is a `where:` leaf without `field:` — the column supplies it — plus a `tone`,
evaluated at render like `when`. **It is specified and not built.** No evaluator reads it: the app's
declared-page path builds a column from `field`, `label`, `width`, `align` and `as`, deriving
`truncate` from the register, and the kernel's page layer calls `where.evaluate` only to filter
`activity`, `actions` and `sessions.live`. A row's tone is `toneOf`'s, from the register's state
field and its declared deadline field, so a declared page wears the same tone the register's own
grid draws.

A `cards` block lays one card per row in a grid that fills its container at 17rem a card, one column
on a narrow one; the title opens the row. A `section` is a full-width heading with a count aside, and
the blocks after it sit under it. Neither is a box: a card is one surface, and a section is a heading
and air.

A `feed` reads `{ source: activity, where: "actor is agent", since: seen, first: 20, empty: … }`: the
rows are grouped as agents, rules and you, with counts, and a burst is one row, "Claude: 14 saves on
Variable axis QA". The host stamps the read mark when the reader leaves the page, never when it opens,
so the rows that were new are still new on the way out. A `diff` reads `{ source: register.skills,
row: '{{spoken}}', field: body, versions: 5, empty: … }` on a skill's page, and Decide draws the same
kind for a document field in a proposed change. `sessions.live` is the runs working now: the rows of
the kernel's `session` register not in one of its `done` states, the most recently seen first, so its
`where` and columns name that register's fields and it takes no `order`. A run holds its project as a
spoken id, `things#1`, so the block's `scopes` name each run's project by its title, and a host draws
that name. A run not heard from within the kernel's `STALE_MS` is drawn dimmed, through the cards'
`quiet` role, which the evaluator writes and a declaration does not. `actions` is the record's
scheduled actions, one row each and the same list as the `actions` read: its `where` and columns name
`ingest`, `channel`, `project`, `host`, `every`, `key`, `state`, `next`, `last_at`, `last_outcome`,
`last_status`, `last_note`, `runs` and `failures`, a key is its label, and it takes no `order`. All four
sources are computed by the kernel (`pages.ts`), alongside `forecast.runway`.

**A live figure comes with the answer.** Outside a template, every `{{path}}` in a block's `heading`,
`body`, `empty` and authored cells that the record holds a value for is on the block as `values`, keyed
by the path as written ([05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §7.1): a metric's reading
(`{{due-30d}}`, money as `{ amount, currency }`), a row's field by spoken id (`{{tasks#125.state}}`),
and a register's count (`{{blockers.count}}`). The paths inside a typed form count (`{{ago:tasks#3.due}}`)
and a code span does not. A field is read from the row's own properties, and only when the register
declares it as a figure: a document, a note, a secret, a ref and a list are not figures. Nothing else is
worked out, so `{{tasks.open}}` is not answered yet. A path the record holds nothing for is absent and
draws `—`, a block that does not draw reads none, and the registers a path names are the block's
registers (`registersOf`). Inside a template, `{{field}}` fills from the row's own fields the same way,
and an expanded page carries `param: { register, seq, title }`, the row it is about.

The agents pack draws them. `/p/agents` is "Working now", "Learnings" and "Skills" as `cards`; a
skill's page is its trigger as a `note` and "Versions" as a `diff`; and a project page gains "Runs on",
a `section` over its keys, tools and skills, each with `inherit: true`, `where: project is {{name}}`
and the retired rows left out by state. `{{spoken}}` does not match a ref, which matches by title.

The feed's evaluator reads the newest 500 events. An actor is an agent (a run, `agent:<name>` or
`spark`), a rule (`rule:`, `ingest:` or `system`) or you (a person), and a feed's `where` asks about
`actor`, `kind` and `target`. Consecutive events by one actor, of one kind, on one row are one row
with a count. A diff's versions are the values its field held, newest first: the value it was
created with, then each edit to that field.

A block with `inherit: true` reads through the kernel's `inScope`, the read a run's `context` is
built on, so a page and a briefing cannot disagree about which skill applies. Kiln's page shows
Kiln's `review-pr` and not the global one of that name; Portage, with no `review-pr` of its own,
shows the global one. The project's rows come first, and `inherited` counts the rows after them that
apply everywhere, which the page draws faint under "From everywhere". Keys and learnings, whose scope
field does not say `same: nearer`, add up instead. *An earlier draft of this document defined none of these; thirty-seven
keys were in use across four documents with no type, default or required flag between them.*

---

## 2 · One grammar, seven consumers

`where:` here is the same `where:` in [02-DATA-MODEL](02-DATA-MODEL.md) §6 that rules, metrics,
alarms, `immutable_when:` locks, self-improvement predictions and ingest `match:` use — seven, and
pages are the first. On the Firefly III precedent: 33 action classes and
**zero** trigger classes, because triggers reuse the search grammar. "New filter", "new trigger"
and "new metric predicate" are one commit, and it is one thing to secure instead of seven. The canonical list is [02-DATA-MODEL](02-DATA-MODEL.md) §6.

---

## 3 · Nav is rows — and only a person writes it

> **Pages can appear on their own. Navigation cannot.** [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md)
> specifies structure that emerges as the record fills — the first row in a register produces a
> whole page, header and all, derived from the declaration. It lands in a holding pen. **The system
> never writes nav order after first install**, because a controlled study measured static menus
> faster than adaptive ones and Microsoft shipped the alternative and withdrew it.


```
Money       ← section
  Overview      order 10   page.money         (money-core)
  Invoicing     order 20   page.invoicing     (freelancer-uk)
Estate
  Domains       order 10   page.domains       (estate)
  Services      order 20   page.services      (estate)
Work
  Board         order 10   native
Decide
  Open          order 10   native
```

Sections come from the pages themselves; a section with no visible page does not render. Order
is an integer a customer can drag, and dragging writes a row — so the nav a customer arranged
survives a pack upgrade — and an upgrade that would move something is **shown in the install
diff and then ignored**. The nav is the user's.

---

## 4 · Packs are how a record gets a second shape

> **This is NOT the first-run screen.** The first run is one typed row, specified in
> [19-INTERFACE](19-INTERFACE.md) §6, and it deliberately involves no packs at all: asking a
> brand-new user to approve four install diffs written in the language of metrics and nav order —
> before they have seen a single row of their own — is worse than a tour. Pack selection is offered
> *after* there is a record to compare against, and it is optional forever.
>
> The screen below is therefore the **second** screen, not the first, and the mock has been left as
> a picker because that is what it is once the user has a reason to open it.

This is the answer to the recorded likeliest cause of death: *"the record's value is proportional
to what is in it, and on day one it is empty."* `throughline` is this exact architecture at 21★.

```
  What are you running?                        pick as many as fit

  ▣ Money            what you owe, what you're owed, installments
  ▣ Estate           domains, hosting, subscriptions, renewals
  ▢ People           collaborators, contractors, accountants
  ▢ Work             tasks, tracks, dates
  ▢ Portfolio        the things you run, and the plan for each
  ▢ Agents           learnings, skills, credentials — what each tool is for, and what it opens

  Each one adds a set of typed collections and the screens for them,
  plus one example row you can delete.
```

The six are the first-party packs of [04-PACKS](04-PACKS.md) §6. *An earlier draft's picker offered
four, with `Skills` as a pack; `skills` is a register inside `agents`.*

*(Amended September 15th 2026: People is ticked here already, not offered as a choice. The first-run
conversation's opening turn, "who are you," installs it with no diff to approve, the same exception
this section already grants the register turn one's own screen chooses, and writes the person's own
row before this picker is ever seen. `loop/research-modular.md` §2 has the flow, and §1.7 has why
People, alone of the six, is a special case here.)*

*(Built September 15th 2026, for the row and not for the picker: the first run writes the person's
own People row only while People is on, and this picker is still unbuilt.)*

*(Built September 15th 2026, turn 2: on day one a sentence does this picker's first job. "What's your
business?" turns on the first-party packs its words name, with no diff to approve, under the same
exception as above. On a live record it turns on a pack that is off and does not install one the
record lacks, because the app holds no document per first-party pack; that is still this screen's
job, with its diffs.)*

Three things that arrive with a pack, and the third is the one that matters:

1. Registers — the shape.
2. Pages — the screens, in nav.
3. **One worked example row, marked as an example, deletable in one click.**

An empty table teaches nothing. A single row showing a real obligation with a real due date and a
real currency teaches the whole model in four seconds, and it is the difference between a record
somebody fills in and a record somebody abandons.

> **The cold start is attacked by packs, and packs are therefore not optional scope.** They are
> the mitigation for the highest-ranked death in the record. That is the argument for building
> the pack format first, before anything declarative.

---

## 5 · Native and authored, identical in nav

| Tier | Is | Editable in app |
|---|---|---|
| `authored` | a row: frontmatter + blocks | yes |
| `native` | code | no |

Both appear in nav the same way, and a customer cannot tell which is which — which is the test
of whether the engine is good enough.

Native exists because some screens encode judgement that a template cannot carry. A board that
groups two ways, remembers a held row so ticking something does not delete the queue, and steps
with `j`/`k` is not a table with a filter. Where that judgement came from measurement, it stays
in code.

---

## 6 · Prove the engine by building what does not exist

The temptation is to prove the page engine by re-drawing an existing screen. That proves nothing
except that a template can imitate something already working, and it risks a regression on a
screen somebody uses daily.

**Instead: the first two authored pages are pages that do not exist yet.**

In the prior record's own audit, `services` and `domains` already had API routes and *no screens
at all*. That is free proof that the missing thing is the **shape**, not the data. Build those as
authored pages first. If the engine can produce a genuinely useful Domains page — renewal dates,
cost per year, what each domain points at, sorted by what expires soonest — from a declaration,
the engine is real.

Only then, and only one at a time, does a native screen become authored — **and only when the
authored one is provably as good**, judged by a person using it, not by a diff of the markup.

---

## 7 · What a page cannot do

| Refused | Because |
|---|---|
| Contain a script, a style, an iframe or a remote image | see [04-PACKS](04-PACKS.md) §7 |
| Query outside its `requires` | a page cannot read a register it did not declare |
| Write | pages are read surfaces; writes are forms, rules and the API |
| Nest a page in a page | a layout engine is a different product |
| Set a colour, a font or a spacing value | intent only |
| Bind a block to a metric across mixed currencies | refused at install, not at render |

---

## 8 · Forms, since a page cannot write

A register declaration is enough to generate a form: the field types give the controls, `required`
gives the validation, `enum` gives the options, `ref` gives the picker. Generated forms cover
every register with no declaration of their own.

Three rules, each from a real failure mode:

1. **A label is visible, always.** A placeholder is not a label — it disappears exactly when a
   user needs it, and it fails contrast in most themes.
2. **An error appears next to its field**, not only in a summary at the top. Both, for a long
   form; never only the summary.
3. **The keyboard finishes the job.** `⌘/Ctrl+Enter` submits from anywhere in the form. A form
   that requires a pointer to submit is a form that is slower than the CLI, and this buyer has a
   CLI.

---

*Next: [07-INGEST-AND-RULES](07-INGEST-AND-RULES.md) — five ways in, and patterns instead of
parsers.*
