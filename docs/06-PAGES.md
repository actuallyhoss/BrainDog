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
**The sentence says `is`, `is not`, `before`, `after`, `on`, `is empty`, `is set`, `has` and `lacks`**, with `or`
between alternatives and a comma between clauses. `has` and `lacks` are the two words §1.2 of
[34-GRAMMARS](34-GRAMMARS.md) gives `list<T>` and [21-AUTHORING](21-AUTHORING.md) §4.2 already phrases in English,
so nothing is translated in either direction and a page prints the sentence the record takes back. `has not` is
read as `lacks` and never printed, the way `is present` is read as `is set`.

**The other form is the source view, and it is the stored declaration, whole.** What a person opens
as *"how this is built"*, downloads as `<page>.dog` (one page to one file) and writes with
`braindog page pull` is the body the record holds for the page, read through `arrangement({ page })`
(`apps/web/src/lib/dog/read.ts`) and printed by `dogText` in `packages/dog`, which is the reference
for the form. **It is lossless**: `parseDog` reads the file back to the same body, key for key, so a
file edited and applied changes exactly what was edited and nothing else. It is terse where terse is
exact. A column that is only its field prints bare (`columns: [client, amount]`), as does a cell that
is only its metric; an order prints as `[due asc]`; `where:` prints as the sentence the record holds;
a flat list or a flat set of keys prints in brackets, `[a, b]` and `{ section: Money, order: 20 }`;
anything deeper (a column with `tone_when`, a `where` tree, authored rows) prints as one line of JSON
after its key. Text that would read back as something else, such as `"2024"` or `"true"`, is quoted,
and text with line breaks is a `|` block under its key. Page keys come first in the order `page title
for nav icon tone layout requires blocks`, and a block's in the order `kind heading area span source
register row where when columns cells order limit`, each followed by the rest alphabetically. A page
made for each row of a list has no declaration of its own, so its source is its template's, which
`sourceOf` names as `template` and `braindog page pull` says it wrote. Every file the first version of
the format wrote still parses, except one holding `authored: N rows`, because that version only
counted the rows. A page is the `.dog`; the whole record is a `.brain`
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

A `when` is one leaf, or `{ all: [leaf, leaf] }` of two or more leaves that must every one hold. `all`
is flat: nothing stands beside it and no `all` sits inside one, and the declaration is refused
otherwise. A leaf's test is one of three: a comparison (`gt`, `gte`, `lt`, `lte`, `is`, `not`),
`empty: true|false`, or `beyond: true|false`. `beyond: true` holds while the reading carries `beyond`,
a walk to zero that looked as far as it walks and never went under; such a reading has no value, so
it meets no comparison and `beyond` is the leaf's whole test.

**Rendered at runtime from the declaration against live rows.** No build step, no generated
code, no deploy to change a page. The rendering happens in the browser: the web app is a **static
shell** and no server renders a request; `toHTML` serves the mirror, exports, tests and the digest
email, never a page over HTTP ([36-SPEC-RENDER](36-SPEC-RENDER.md) §12, [50-SPEC-WEB](50-SPEC-WEB.md)
§13 #1). The read behind a page is `page({ slug })`, answered per block — `rows`, `total`, `drawn`,
`stale_at` ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.3).

### 1.1 · The keys

Every key, typed, with its default. A form is generated from this table ([21-AUTHORING](21-AUTHORING.md)
A7), and the install-time check refuses a key that is not in it, by name, with what to write instead
(`size:` is told that a block is made wider with `span:`; `tabs:` on a page, that tabs are said in `nav`).
*Until September 25th 2026 that sentence was not true: a block key nobody reads installed and was refused
only when the page was opened, a page key nobody reads installed and was handed to the host unread, and
a page naming a `block.<id>` kind installed and read its rows.* The two lists are one list now,
`packages/kernel/src/block-keys.ts`, read by the install check and by the read, and a key only some kinds
read (the kinds its row below names, "On a `feed`") is refused on any other kind at both, naming the
kinds that read it. Before the page list was closed,
every page declaration `packages/seed` and `packs/` ship was walked, thirty-four of them, and they use
`page`, `title`, `nav`, `icon`, `requires`, `blocks`, `for`, `pack`, `origin` and `placed`, so each is in
the table.

**On the page**

| Key | Type | Default | Required |
|---|---|---|---|
| `page` | the page id — `^[a-z][a-z0-9_]{0,31}$` | — | yes |
| `title` | text | — | yes |
| `nav` | `{ section: text, order: int, icon: glyph, tabs?: bool }`. `tabs: true` draws every page in that section, a template's pages included, as a strip of tabs at the top of each of them, in nav order, each tab its own address. Any other key under `nav` is refused | absent: not in nav | no |
| `icon` | a glyph name, drawn beside the page's entry in the rail | — | no |
| `for` | `{ register, where? }`: the page is a template, one page per row that `where` admits, `{{field}}` filled from the row and the slug made from its title | — | no |
| `pack` | the id of the pack that ships the page, as the pack's file writes it. Who owns a declaration is the record's own column, not this key | — | no |
| `layout` | `{ rail: 3 \| 4 \| 5, sticky?: bool }`: a main column and a side rail `rail` twelfths wide, the rail kept in view while the main column scrolls when `sticky`. The main column is its own twelve-column flow, so a `span` keeps its meaning inside it; the rail is one stack, and falls under the main column on a narrow screen. Any other width is refused `OUT_OF_BOUNDS` | one column | no |
| `requires` | `[register.<id>, …]` — a list; the manifest's `requires` is a different key on a different object ([04-PACKS](04-PACKS.md) §2) | — | yes |
| `origin` | `derived \| person \| pack` | set by whoever writes the row: `pack` by the installer, `derived` by a trigger ([29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §3), `person` otherwise | no |
| `derived_from` | a declaration id — `register.domains` | — | when `origin: derived` |
| `placed` | bool — in nav, or in the holding pen | `true` | no |
| `tone` | intent — `good \| warn \| bad \| info` | — | no |
| `filters` | `[{ field, control: chips \| segmented }]`, at most 4, each a field of the lists the page's blocks read: reader filters ([21-AUTHORING](21-AUTHORING.md) §3.5). Every block over a list with the field is narrowed by the reader's choice (`page`'s `filter`, a value by field, `{ project: '12' }`), and the answer carries `filters: [{ field, label, control, chosen, values: [{ value, label, count }], reads }]`, counting open rows only, each count under the other choices. A filter counted from a list the reader may not read (its `reads`) is answered with no values and nothing chosen, and its choice narrows nothing | `[]` | no |
| `header` | `{ count, action, filters, search, state }`, [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §5. **Specified and not built**, and refused `NOT_IN_THIS_BUILD` for the same reason | derived from the register | no |
| `blocks` | `[block]`, at most 24 | — | yes |

**On a block**

| Key | Type | Default | Required |
|---|---|---|---|
| `kind` | a kind this build draws, [05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §2. A `block.<id>` a pack declares is **refused `NOT_IN_THIS_BUILD`**, on the page and as a declaration, because nothing in this build draws one: admitted by prefix, it installed and read its rows with nowhere to draw them | — | yes |
| `area` | `main \| rail`: which of the page's two columns the block sits in. Refused on a page with no `layout` | `main` | no |
| `heading` | text. On a `section` it is the section, drawn as a heading | — | `section` |
| `span` | int, 1–12 | 12 | no |
| `source` | `register.<id>` · `metric.<id>` (on a `bar` or `split`, a figure grouped by a word, whose parts it draws; any other kind refuses it) · `block.<n>` (another block on this page) · `activity` (what was done in the record, with the kind of actor; a `feed`'s) · `sessions.live` (the runs working now) · `actions` (the record's scheduled actions, one row each) · `runs_on` (what one project runs on, the project named by `about:`) · `deadlines` (what falls due across the lists, overdue first) · `figures.home` (the figures pinned to Home, on a `stat`) · `signs` (the record's vital signs) · `handoffs.open` (the next steps runs left and nobody has taken, newest first). On a `section` it is what the count counts; on a `diff`, the register whose row it reads | — | `table`, `cards`, `feed`, `diff` |
| `where` | a predicate — [02-DATA-MODEL](02-DATA-MODEL.md) §6. On a `capture`, what a new row is filled with: each `is` of one value on an enum or a text field, at the top of the predicate or under a top-level `all`, other than the title. A set (`is open or doing`), a date and a link are never filled in, because each would be a value nobody chose | every row | no |
| `register` | a register id, which the page `requires`. On a `capture`, the list a new row is added to; a `capture` takes no `source`, because it reads no row. On `inputs`, the list whose one row it edits, and it takes no `source` either | — | `capture`, `inputs` |
| `when` | `{ metric: <id>, <op>: v }`, `{ metric: <id>, empty: bool }`, `{ metric: <id>, beyond: bool }`, or `{ all: [leaf, leaf, …] }` of two or more — evaluated at render, never compiled | always drawn | no |
| `columns` | `[{ field, label?, width?, align?: start \| end, link?: bool (**specified and not built**: no evaluator reads it, and a row that has somewhere to go is already a link in whole), tone_when? (**specified and not built**: no evaluator reads it, and a row's tone comes from its register's state field, not from its block), as? }]`. `as` is the column's role on a `cards` block: `title \| figure \| fact \| trend \| ring \| who \| when \| mark \| next \| reply \| hue \| picture`, one figure and at most three facts. `picture` names a `file` field and leads the card with it, the row carrying the stored `{ sha256, mime, bytes, name }`; `hue` names an `int` field, 0 to 359, drawn only on the card's mark. Either over a field of another type is refused at read, naming the fields that are. A column's `label` is filled as a heading is, its `{{path}}`s answered in `values`. `next` names a field of the list whose rows are steps of the cards' rows (`steps:` on that list), and the block answers `nexts`, aligned with `rows`: that field of the first step under each card that is not done, in the order the steps declare, `null` for a card with no open step. `reply` is a field drawn under the card's title in a quieter voice, the second opinion under a note. Absent, the first text column is the title, the first figure that never truncates is the figure, and the rest are facts. On a `table` or a `cards` block, `as: scope` on the register's scope field draws where the row applies instead: the project's name, or Everywhere. The block answers `scopes`, those names aligned with `rows`, and `scope_marks` beside them: `{ mark, hue }` of the project, read from the fields its list names in `identity:` (either `null` when the project holds none), or `null` for a row that applies everywhere. `sign: { field, minus }` on a money column writes each figure with `+` or `−`, `−` where the enum `field` holds `minus`: a word on the figure, never a colour. A column whose `field` is `changed`, on a register with no field of that name, says who changed the row last and the day, from its history. | — | `table`, `cards` |
| `inherit` | bool. On a block over a register with a scope field ([02-DATA-MODEL](02-DATA-MODEL.md) §5), the rows of the project its `where` names, then the rows that apply everywhere. A project's row hides a global row of the same title where the field says `same: nearer`; otherwise both show. The project is named in `where` as `project is {{name}}` | `false` | no |
| `order` | `[{ field, dir: asc \| desc }]` | the first indexed date descending, else `seq` descending ([29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §5) | no |
| `limit` | int. A `calendar` takes none (it draws every row in its months, at most 500), nor does a `lanes` (every lane in its window, at most 200); a `gallery` at most 24 | 50, at most 500 | no |
| `empty` | text, interpolatable | — | **yes, on every block with a `source`** |
| `cells` | `[{ metric, label, trend?, note? }]`. `note` is the line under the figure in place of its target, and may name other figures as `{{id}}`; `N thing(s)` after a figure is said `1 thing` or `2 things` | — | `stat` |
| `series` | 1–4 of `{ metric, then?, each?, label?, dir?: in \| out }`. On a `series`, each line is a metric grouped by a date and a bucket, every line the same bucket and one currency; `then` names the metric that answers the buckets after the current one (money due, where `metric` is money paid); `each`, on a series by month, names an ungrouped monthly figure added to every month after the current one (what repeats, at its monthly share), so a repeating bill is in every month ahead rather than only the one its next due day falls in. `in` stands on the zero rule, `out` hangs under it | — | `series` |
| `back` | int, 1–24. On a `series`, how many buckets it draws up to and including the current one; leading buckets no line has a value in are trimmed. On a `calendar`, 0 to 12, how many whole months before this one it shows | `6`; on a `calendar`, `2` | no |
| `ahead` | int, 0–12. On a `series`, how many buckets after the current one it draws. On a `calendar`, 0 to 12, how many whole months after this one it shows | `0` | no |
| `net` | bool. On a `series`, draw in minus out per bucket as a line | `false` | no |
| `recorded` | a series id, `cash-now` or `series.cash-now`. On a `forecast` over `forecast.runway`, the series its `opening` figure is remembered in, drawn solid over the ninety days before today; any other series is refused, because the line would join two measures at today | nothing before today | no |
| `stale` | `{ field, after, figure? }`: a day field and a window. On a `cards` block, a row whose day is older than the window says it is out of date beside that day, with the watch glyph. With `figure`, a rolled figure that reads `as_of` and groups by a field of the card's list, each card's day is that figure's group for it, written into `field` in the answer, so a book's account cards are dated by the bank's last word rather than a typed day | never | no |
| `knobs` | a list of `horizon · late · spend · leave`. On a `forecast`, the what-ifs a reader may move: the horizon, clients paying later, spending the record does not know, and leaving out a large movement. They are arithmetic over the walk on the page, in memory, never in the address and never written | no knobs | no |
| `late` | a metric id. On a `forecast`, the figure its late knob marks as "on average so far: N days", read from paid rows as a fact rather than a guess | no mark | no |
| `under` | int, 1–365. On a `forecast`, say under the chart "Cash goes under in N days" when the walk goes under within this many days | never said | no |
| `horizon` | int, days. On a `forecast`, how far ahead the walk reads, or `last` for its last dated movement (`forecast.ts` `runway`). Over `deadlines`, how many days ahead of today a row may fall due, 0 to 366 | 180 on a `forecast`, 14 over `deadlines` | no |
| `horizons` | a list of lengths, each a whole number of days or `last` (the walk's last dated movement), at most `HORIZONS_MOST` of them (`pages.ts`). On a `forecast`, the lengths its horizon knob offers | the knob's own | no |
| `headline` | `under`. On a `forecast`, the page's opening line already says when the money runs out, so the sentence over the chart is left off and the flag on the crossing stays. The record answers it only while a lead `note` on the page is drawn | absent | no |
| `unset` | text. On a `bar` or `split`, the label of a last row holding what no part does (rows with no value in the grouped field, or the figure less its parts), linked to those rows; absent, those rows are not drawn apart | not drawn apart | no |
| `tone` | intent | — | no |
| `hours` | int, 1 to 168. On a `lanes`, how many hours back from now it shows | `24` | no |
| `tones` | `{ <value>: good \| warn \| bad \| info }`, such as `{ off_track: bad }`. On a `bar` or `split`, the tone of a part by the value it groups; on a `cards`, of a card by its title's value; on a `lanes`, of a lane by the value of its fourth column, and refused where the lanes name three. A value it does not name is neutral | — | no |
| `body` | markdown in the dialect | — | `note` |
| `icon` | a glyph name, drawn beside a `section`'s heading | — | no |
| `fold` | bool. A `section` that starts shut, folding the blocks after it up to the next section; one press opens it | `false` | no |
| `since` | `seen`, the reader's read mark. On a `feed`, the rows after it are new; the evaluator writes the `seen` row where it falls, with an empty time when the reader has no mark yet | absent: nothing is new | no |
| `first` | int, 1–50. On a `feed` or `agents`, the most rows it draws, newest first, a collapsed burst being one row; what is past it goes in one last row per group, so no count loses anything. On a `steps` block, the short view: the first `n` rows not done, with `matched` still the whole count, so "N more" is `matched` less the rows; refused over a list that does not declare `steps:`, where no row is known to be done | every row | no |
| `short` | `{ where: <sentence>, label: <text, at most 24 bytes> }`. On a `steps` block, the path's short view: the rows `where` admits, named `label` on the switch. The block still answers every row up to `limit`, and `short_now`, whether each row is in the short view, aligned with `rows`, so a host switches views without a second read | none | no |
| `row` | a spoken id, interpolatable: `'{{spoken}}'` on a template. On a `diff`, the row whose history it reads. On `inputs`, the row it edits | on `inputs`, the list's first row | `diff` |
| `about` | a spoken id, interpolatable: `'{{spoken}}'` on a template. Over `runs_on`, the project whose keys, tools, skills and actions it reads. Read by a `table` and a `cards` block | none | a block over `runs_on` |
| `lead` | bool. On a `stat`, its first figure is the screen's one hero figure; on `cards`, the first card is drawn two tracks wide; on a `note`, its body is the page's opening sentence, said with the plural and nought rules a figure's note has | `false` | no |
| `range` | bool. On a `progress` over a register, each row is a band from its low to its high on one scale shared by the rows (the largest high), what was spent marked on it, and a total line. It names four columns in order: the label, what was spent, the low and the high, the last three number or money fields in one currency | `false` | no |
| `tiles` | bool. On a `queue`, one tile per question, showing its recommended option as what it is | `false` | no |
| `who` | bool. On a `heat`, a line a person with a dot in each of the twelve weeks they were in touch, `columns: [{ field: <a day> }, { field: <a name> }]`. Written `people` before People 2.6.0, which the record still reads | `false` | no |
| `box` | bool. On a `section`, the blocks after it, up to the next section, are drawn on one surface | `false` | no |
| `panel` | `actions \| reporting`. On a `section` of a page per row (`for:`), the host panel drawn for the page's row under the section's heading: what the row's work runs on and is scheduled to do, or where its numbers are sent. Refused on a page with no `for:`. It is not `source: actions`, which lists the record's scheduled actions | none | no |
| `field` | a field id on that row, `document` or `text`. On a `diff`, the field whose versions it compares | — | `diff` |
| `versions` | int, 2–10. On a `diff`, how many versions it shows, newest first; each is compared with the one before it, one `diff` fence each | `2` | no |
| *`accepts` names* | on a pack-declared `kind`, the keys its `accepts:` names are legal here, typed `register · metric · number · text` ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.6) | per the block declaration | as the declaration says |

`tone_when` on a column is a `where:` leaf without `field:` — the column supplies it — plus a `tone`,
evaluated at render like `when`. **It is specified and not built.** No evaluator reads it: the app's
declared-page path builds a column from `field`, `label`, `width`, `align` and `as`, deriving
`truncate` from the register, and the kernel's page layer calls `where.evaluate` only to filter
the rows of a computed source, such as `activity`, `sessions.live` or `runs_on`. A row's tone is
`toneOf`'s, from the register's state field and its declared deadline field, so a declared page
wears the same tone the register's own grid draws.

A `cards` block lays one card per row in a grid that fills its container at 17rem a card, one column
on a narrow one; the title opens the row. A `section` is a full-width heading with a count aside, and
the blocks after it sit under it. Neither is a box: a card is one surface, and a section is a heading
and air.

**A path, an option shown as what it is, and one row to type into.** A `steps` block over a list that
declares `steps: { of, done, order? }` answers `done_now`, whether each row is done, aligned with `rows`,
and `next`, the index of the first row not done (`null` when every row is); with no `order:` of its own it
reads in the order the list declares for its steps. A question's options body may give an option `shows`,
exactly one of `{ swatch: ['#rrggbb', …] }` (one to eight colours, six hex digits each), `{ figure: text }`
or `{ file: { row, field } }` (a file the record already holds), and may say what the question is `about`:
the queue carries each on `QueueOption.shows` and `QueueQuestion.about`, and `governance.open`'s `where`
reads `about` beside `who`, `kind` and `cost`, so `where: about is {{name}}` on a template draws one area's
calls. A swatch is the option's content, drawn only inside that option's box. An `inputs` block,
`{ kind: inputs, register, row?, columns? }`, reads one row, the one `row:` names or the list's first, and
answers `rows: [that row]` and `types`, each drawn field's type; a ref, a list, a file or a document cannot
be typed into, so named in `columns` it is refused, and with no `columns` it is left out. The write is the host's, through the row writer, and every block over the list
answers the new figures on the next read.

**A calendar, links, a gallery and an embed.** A `calendar` over a list names `columns: [{ field: <title> },
{ field: <a day or an instant> }]` and reads every row whose day falls from the first day of the month `back`
months ago to the last day of the month `ahead` months on, in the record's own zone, in day order. It answers
`window: { from, to, today }`, each a day, so a host draws the months and an agenda from one read. It takes no
`limit`: past 500 rows in its months it is refused `OUT_OF_BOUNDS` with both numbers, as a kind that adds its
rows up is. Written out, a row is `{ cells: [title, day] }`. A `link` names `columns: [title, address, note?]`,
the address a `url` or `text` field, or writes its rows out; an address is `https:`, `mailto:`, `#` or a path of
this BrainDog, and a row written out with any other is refused: "A link is an https address, a mailto or a path
of this BrainDog." A `gallery` names `columns: [{ field: <caption> }, { field: <a file field> }]`, or writes each
row out as `{ cells: [caption, file:<list>#<seq>/<field>] }`, at most 24 either way. It answers `files`, each
file as the record stores it, `{ sha256, mime, bytes, name }`, aligned with the rows it draws and `null` where
the record holds none, and a list a written-out file names is one of the block's lists (`registersOf`). An
`embed` is one row written out, `{ cells: [address, title?, shape?] }`, the shape `16:9` (the default), `4:3`,
`1:1` or `9:16`; its address is from one of the players `EMBED_PROVIDERS` names
(`packages/kernel/src/kinds/embed.ts`), and any other is refused at install naming them, without repeating the
address. A `roadmap` over a list names two or three columns: the title, the day each row is due by and its
effort in days, the effort optional. With none, one, or more than three it is refused, naming the three.

**Lanes.** A `lanes` over a list names three or four columns, `columns: [title, start, end, tone column?]`: the
title a text or a choice, the start and the end `instant` fields, and the fourth a choice, a text or a yes or no
whose value `tones:` turns into a tone. It reads every row that overlaps the last `hours:` hours: started by now,
and not ended before they open. A row with no end is still going; a row with no start is left out. It answers
`window: { from, to, now }`, each an instant written in the record's zone, and `lanes`, each
`{ title, start, end, tone?, href? }` aligned with `rows`, in start order. A lane keeps its own start and end,
never cut to the window, so a host says "Since Monday" of one that began before it. Now is the as-of instant when
the read has one. It takes no `limit`, since lanes that drew only the first rows read would show an hour as idle
that was not: past 200 rows in its hours it is refused `OUT_OF_BOUNDS` with both numbers. Written out, a row is
`{ cells: [title, start, end, value] }`, the end left empty while it is still going; a start that does not read,
or an end before its start, is refused.

A `feed` reads `{ source: activity, where: "actor is agent", since: seen, first: 20, empty: … }`: the
rows are grouped as agents, rules and you, with counts, and a burst is one row, "Claude: 14 saves on
Variable axis QA". The host stamps the read mark when the reader leaves the page, never when it opens,
so the rows that were new are still new on the way out. A `diff` reads `{ source: register.skills,
row: '{{spoken}}', field: body, versions: 5, empty: … }` on a skill's page, and Decide draws the same
kind for a document field in a proposed change. `sessions.live` is the runs working now: the rows of
the kernel's `session` register not in one of its `done` states, the most recently seen first, so its
`where` and columns name that register's fields and it takes no `order`. A run holds its project as a
spoken id, `things#1`, so the block's `scopes` name each run's project by its title and its
`scope_marks` carry that project's mark and hue, and a host draws both. A run not heard from within
the kernel's `STALE_MS` is drawn dimmed, through the cards' `quiet` role, which the evaluator writes
and a declaration does not. `actions` is the record's scheduled actions, one row each and the same
list as the `actions` read: its `where` and columns name `ingest`, `channel`, `project`, `host`,
`every`, `key`, `state`, `next`, `last_at`, `last_outcome`, `last_status`, `last_note`, `runs` and
`failures`, a key is its label, and it takes no `order`. These sources, and the ones below, are
computed by the kernel (`pages.ts`, `COMPUTED`), alongside `forecast.runway`.

`runs_on` is what one project runs on, read as `{ source: runs_on, about: '{{spoken}}', empty: … }` on the
project's page: its keys, tools, skills and scheduled actions, then the ones that apply everywhere, each group by
name. It reads whichever of the lists `credentials`, `tools` and `skills` the record holds and places in projects of
the list `about:` names, so a page over it needs no `requires` for them, and on a record without them and with no
scheduled action for the project or for everywhere it draws its `empty:`. Nearer wins as it does for an agent in
that project: where the list says `same: nearer`, a project's own tool or skill hides a global one of the same name,
and a row in one of its list's `done` states, such as a retired key, is left out. Its `where` and columns name
`kind` (`key`, `tool`, `skill` or `action`), `name`, `scope` (`project` or `global`), `state`, `detail` (what a
key opens, a tool's transport, a skill's version, an action's next run), `used_by`, `used_at`, `spoken` (the row's
own id, or an action's) and `quiet`, and it takes no `order`. `used_by` is the run, `S47`, that last opened a key or last wrote a tool's `seen`, and `null`
when that was not a run; `used_at` is when the key was last opened or the tool last seen. A key's sealed value and
its grant never reach the answer. Every row that applies everywhere carries a word in `quiet`, so a host draws it
faint, and the block answers `scopes` and `scope_marks` for the project's own rows and `null` for the rest. Because
it draws scheduled actions, which belong to no list, a reader who may not read the whole record is held the block.

**What a module's page reads across the lists.** `deadlines` is what falls due, read as `{ source: deadlines,
horizon: 14, empty: … }` by a `table`, a `timeline` or a `todo`: every row of every list the reader may read that
falls due on a `day` field the list declares `deadline: true`, is not in one of the list's `done` states, and falls
due within `horizon` days of today (the record's local day), overdue first and then by day. Each row is
`{ list, row, title, day, amount, direction }`: `row` is the row's spoken id, `tasks#12`, and `list` its list, so
`where: list is tasks or services` narrows it; `amount` is the money due and `direction` is `in` or `out`, both
`null` on a list with no money. Which field is the amount and which way it moves is read from what the record
already declares: a cash walk's leg over the list names both (`amount`, and `incoming` for money arriving, every
other row of the leg going out); otherwise the list's one money field is the amount, and only an enum of exactly
`in` and `out` says the way. It takes no `order`. `figures.home` is the figures pinned to Home, drawn by a `stat`
with no `cells`: every metric that declares `home:` a whole number from 1 to 9, in that order, at most
`FIGURES_HOME_MOST` of them (`pages.ts`), each read and labelled as a `cells:` figure is. Both are named in `registersOf` by the lists they read, so a reader who
may not read one of them is held the block. `activity` and `governance.open` answer `list` on each row too, the
list of the row its `target` or its question's `about` names (`null` when it names none), and each `where` reads it:
`{ source: activity, where: "list is transactions" }`, `{ source: governance.open, where: "list is obligations" }`.
A `forecast` with the `sell` knob and no `sell:` offers every figure the reader may read that declares
`sellable: true`, in the walk's own money, and a `forecast` answers `fx`, the record's home currency and dated rates,
as a `bar` and a `split` do.

**A kind that adds its rows up reads the whole match, or refuses.** `bar`, `chips`, `gauge`, `heat`,
`progress` and `split` over a register read up to 200 rows whatever their `limit` (on these, `limit`
cuts the groups drawn, never the rows read), and a `where` matching more is refused `OUT_OF_BOUNDS`
with both numbers in the sentence, because a total over part of the rows is a wrong number rather than
a short list. A `heat` reads `columns: [{ field: <a day> }, { field: <a number> }]` and adds the rows on
one day together; measured before it joined the list, sixty rows on sixty days answered fifty and drew
ten busy days as gaps. A `ring` over a register is progress: one row the kernel counts, answered with
its own columns `label | value | target` and `matched: 1`. The whole is every row the block's scope
admits: the page's project and the rows that apply everywhere when it has `inherit: true`, and the list
otherwise. The `where` is the part, counted inside the whole. A ring that wants another whole says so in
its own `of:` sentence over the same list, so `where: state is done` with `of: list is work` draws the
work list's done share, where `where: list is work, state is done` alone draws that share of every row
(2 of 100 on a list of 4 work chores, 2 done, and 96 home ones, against 2 of 4 with the `of:`). The
label is the block's `heading`, or the list's id when it has none, never the sentence. `of:` on any other
block, or on a ring that is not over a list, is refused at `of`. A ring reads no row, so it has no
ceiling; `limit: 0` draws nothing, as it does on every block; and a `ring` over a register that names
`columns:` is refused, because the row it draws is not made of the register's fields. Written out in its
fence, a `ring` is still the rows its author wrote: one is progress, two to five are parts.

**A live figure comes with the answer.** Outside a template, every `{{path}}` in a block's `heading`,
`body`, `empty` and authored cells that the record holds a value for is on the block as `values`, keyed
by the path as written ([05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §7.1): a metric's reading
(`{{due-30d}}`, money as `{ amount, currency }`), a row's field by spoken id (`{{tasks#125.state}}`),
and a register's count (`{{blockers.count}}`). The paths inside a typed form count (`{{ago:tasks#3.due}}`)
and a code span does not. A field is read from the row's own properties, and only when the register
declares it as a figure: a document, a note, a secret, a ref and a list are not figures. It also answers
how many of a list's rows are in one state (`{{tasks.open}}`, where `open` is a value of the list's `state`
enum; a word the enum does not hold answers nothing). A column's `label` is read for paths as a heading is. A path the record holds nothing for is absent and
draws `—`, a block that does not draw reads none, and the registers a path names are the block's
registers (`registersOf`). Inside a template, `{{field}}` fills from the row's own fields the same way,
and an expanded page carries `param: { register, seq, title }`, the row it is about.

The agents pack draws them. `/p/agents` is "Working now", "Learnings" and "Skills" as `cards`; a
skill's page is its trigger as a `note` and "Versions" as a `diff`; and a project page gains "Runs on",
a `section` over its keys, tools and skills, each with `inherit: true`, `where: project is {{name}}`
and the retired rows left out by state. `{{spoken}}` does not match a ref, which matches by title.

The feed's evaluator reads the newest 500 events. An actor is an agent (a run, `agent:<name>` or
`slash`), a rule (`rule:`, `ingest:` or `system`) or you (a person), and a feed's `where` asks about
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

### 1.2 · Adding a kind

A block's `kind:` is either one `packages/kernel/src/pages.ts` reads itself or one registered in
`packages/kernel/src/kinds/index.ts` (`BLOCK_KIND_MODULES`). A registered kind is a module: `keys`, the keys only it
reads, which the install and the read admit on it and refuse on every other kind; `validate`, its own check, run at
install with the page and the block's place put in front of its sentence, and again at read; and
`read(deps, block, base)`, its answer, asked after the keys nobody reads, `when:` and the `{{path}}` values and before
any of `pages.ts`'s own arms. Adding one is three files and three lines: that module and its registry line, the app's
drawer in `apps/web/src/lib/page/kinds/<kind>.ts` with its line in `BLOCK_KIND_DRAWERS`, and the renderer's row in
`packages/render/src/kinds.ts` `TABLE`. The counts of the kinds are the integrator's.

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
row before this picker is ever seen. People is the one special case of the six, because "who are you" is
answered at sign-in whatever else is installed.)*

*(Built September 15th 2026, for the row and not for the picker: the first run writes the person's
own People row only while People is on, and this picker is still unbuilt.)*

*(Built September 15th 2026, turn 2: on day one a sentence does this picker's first job. "What's your
business?" turns on the first-party packs its words name, with no diff to approve, under the same
exception as above. On a live record it turns on a pack that is off and does not install one the
record lacks, because the app holds no document per first-party pack; that is still this screen's
job, with its diffs.)*

*(Contradicts the shell direction, noted September 22nd 2026: the sentence is read by a fixed word table,
`LEXICON` in `apps/web/src/lib/shape.ts:65-73`, that maps words to the six first-party packs
(domains and subscriptions turn on `estate`, invoices and VAT turn on `money-core`). A fixed keyword
table is a list of use cases compiled into the app. The direction is that the sentence goes to
Slash, or to a rule set a pack brings, and comes back as proposed lists, fields and pages the person
accepts. The code ships the primitives; the use cases are added at run time or brought by a pack.)*

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

*(Revised September 22nd 2026: packs are one source against the cold start,
and optional. The others are the record proposing its own shape from the first rows
([29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §3, T1) and Slash proposing lists and fields from what the person
says. The pack format is still built first, because it is the mechanism every one of those writes
through; what is no longer true is that a new record needs a shipped pack to be useful.)*

### 4.1 · A pack adds a block to another pack's page

A pack's manifest may say `adds: [{ page: page.<name>, block: {...}, after?: <heading> }]`
([04-PACKS](04-PACKS.md) §2). The plan and the install sheet say "adds a block to <page> from
<pack>" for each; a page the record lacks plans as unresolved and the pack does not install
(`PAGE_UNKNOWN`). The block is checked as the page's own would be, against the page's `for:`.

The record draws the page with its own blocks in their stored order and lays each addition after
the first of its own blocks whose `heading` is `after`, or after all of them when there is no
`after` or the page no longer has that heading. Additions come in pack id order and then in the
order each pack wrote them. On a page made from a template the addition is filled from the row as
the page's own blocks are, so `{{name}}` is the project's name. Each added block's answer carries
`added: <pack id>`.

The addition is never written into the page's declaration. It is read off the adding pack's stored
manifest each time the page is read (`packages/kernel/src/page-adds.ts`), so updating either pack
keeps the other's addition, and uninstalling or turning off the adding pack takes it away. A page the
person arranged keeps their order: a block of the same kind and heading already on the page is taken
as the addition placed by them and is not drawn twice, and an addition they have not placed goes
after its `after` block or last. At 390 an addition follows the page's order in one column, as every
block does. `packs/project-brief` uses it to put the one line, the plan and what is in the way on
Portfolio's project page, after "Where it stands".

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
| Nest a page in a page | a layout engine is a different product. A `layout` is not one: the blocks are still one list in one order, each saying whether it sits in the main column or the rail, and a `section` with `box: true` draws the blocks under it on one surface without holding them |
| Set a colour, a font or a spacing value | intent only. A swatch in an option's `shows` is not a colour the page sets: it is the option's content (which lining), six hex digits drawn only inside that option |
| Carry a key nobody reads | refused at install by name, with what to write instead, because a word that installs and is drawn by nothing is a mistake nobody hears about until a reader meets it |
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

## 9 · Proposing a whole change before it lands

`installPack` and `setDeclaration` land one thing at a time. `change` (MCP) and the app's Slash draft a **change**,
several declarations together, and both need to see every page it touches drawn before anybody accepts it.

`previewChange` (record method, READ+, `writes: true` in `ROUTES` as `previewPage` is, though it writes nothing)
takes `{ to: Decl | { declarations: Decl[] }, rows?: Record<string, Record<string, Json>[]>, about?: string }`, where
`Decl = { id, kind, body }` is exactly what `change`'s own `to` takes. `rows` are sample rows per list (at most 20 a
list, 100 in all), written inside the rehearsal so a page with nothing in its lists yet still draws something; `about`
names the row a `for:` template is drawn over, as a spoken id `<list>#<seq>`, defaulting to the first row its `where`
admits after `rows` land, and, with no row at all, the template draws unfilled with "No row of `<list>` yet, so this
page is drawn with its placeholders." The answer is `{ pages: PreviewedPage[] }`, each `blocks` exactly what `page`
answers for that page and `was` the page as installed now (`null` for a new one), so a reviewer sees before and after
side by side. It runs inside `kernel.rehearse` (§0), so nothing it touches is written, observed or spent.

Slash drafts through the same door. `slashDraft` (ADMIN, writes only the ask ledger's row) takes
`{ asked: string, page?: string }`, `page` naming the slug the description is about so its stored declaration goes
into the model's input, and answers `{ by, drafts: { question, change, rows, preview }[], dropped }`: each draft is
linted and rehearsed with `previewChange` before it is shown, a refusal goes back to the model once as a repair round
(at most two repair asks a press), and a draft still refused is dropped with its sentence in `dropped` rather than
shown broken. `slashPropose` takes the same `page?` and files what `slashDraft` would answer, through the ordinary
proposal door (§10). Neither writes a page; accepting one is the owner's `setDeclaration`, same as any other change.

**`.dog` v2** (`packages/dog`) is the round-trip format §1's `<page>.dog` download is, now built: `dogText(body)`
prints a page's stored declaration as text and `parseDog(text)` reads it back, `parseDog(dogText(b)).value` deep-
equalling `b` for every body the kernel admits. Page keys print `page title for nav icon tone layout requires blocks`
first, block keys `kind heading area span source register row where when columns cells order limit` first, each then
the rest alphabetically; a scalar prints bare when it reads back as itself and would not be read as another type,
otherwise as a JSON string; a column with only `field` prints bare (`columns: [client, amount]`); a string with a
newline prints as a `|` block. A CLI pull, edit and check round-trips through this format (`braindog page pull`,
`braindog page check`); pushing one back is `braindog page push`. A bearer token still applies nothing, under ADR-060
(§10) unamended: from a token the push is proposed as one change and waits on Decide, and the page changes when a
person accepts it there, the same as any other write to a declaration a person did not type into a form.

**The page reader, after the split** (`apps/web/src/lib/page/`). `PageView.svelte` takes
`{ slug, got, mode?: 'page' | 'home' | 'preview', showSource?, reread?, was? }`. `page` is everything: head, source,
Edit layout, writes. `home` has no head, no source and no Edit layout, and writes stay on: it is what Home mounts a
declared page through. `preview` is inert: no writes, no arrange, no source, and, with `was`, a "Now · After" switch
(one showing at a time below 390px) so a reviewer sees a `PreviewedPage` the way `previewChange` answered it. The
reader is split by job: `PageView.svelte` (frame and head), `PageBody.svelte` (main, rail, box runs, span flow, the
`j`/`k` keys), `BlockSlot.svelte` (one block: chrome, empty, refusal, the draw, `RenderOptions`, panels),
`Arrange.svelte` (Edit layout), `page-writes.ts` (the `Writes` object behind tick, move, capture, inputs, reschedule
and the queue's gate), `SourceView.svelte`, and `panels/{Actions,Reporting,PollForm,ActionRows}.svelte`. `oninput` is
passed to a block only when the reader holds `write` or above on its list, so a read-only viewer never sees a control
that would refuse the moment it was pressed.

**The holding pen** (`boot`'s `pen: PenItem[]`, owner and whole-record readers only, empty when `pen.suggest` is
off) is what §3's "it lands in a holding pen" names: what the record would add on its own if the owner asked, at most
24, strongest first. `PenItem = { id, kind: 'page' | 'block' | 'column', register, title, why, change: { to: Decl } }`.
`id` is the dismissal signature (`page:<list>`, `block:<page>:<kind>:<list>`, `column:<page>:<block>:<field>`), and an
id in the person's `pen.dismissed` is never answered again, on any device. `why` is one sentence in the record's own
words ("Parts has 7 rows and no page yet."), and `change.to` is a whole declaration: accepting it is the owner's
`setDeclaration`, one click, and previewing it first is `previewChange({ to })` above. A page item's `change.to`
carries its own `nav:`, so the system proposes nav placement but never writes it unasked (§3). `setPref`'s
`PREF_KEYS` carry `pen.suggest: boolean` (the switch that turns the pen off) and `pen.dismissed: string[]` (at most
500, oldest let go first) beside the nav order and shape keys.

---

*Next: [07-INGEST-AND-RULES](07-INGEST-AND-RULES.md) — five ways in, and patterns instead of
parsers.*
