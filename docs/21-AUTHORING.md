# 21 · Authoring

The creative tools: how a person builds a register, a page, a query, a theme, an ingest pattern and
a pack — without writing code, and without being able to produce something ugly or unsafe.

---

## 1 · Twelve axioms

Every surface below is derived from these. Where a decision looks arbitrary, it is one of these
applied.

| # | Axiom | Consequence |
|---|---|---|
| **A1** | **The declaration is the only model. Every UI is a lens over it.** | There is no sync between text and UI because **there is not a second document** |
| **A2** | **Nothing applies without a diff.** | Publish, install, update, revert and every AI proposal pass through one diff component |
| **A3** | **The preview is the real renderer.** | No authoring surface may contain a second drawing implementation. Lint-enforced |
| **A4** | **Malformed degrades visibly, and the degradation is actionable.** | A block that will not draw shows its own source, one sentence, and a `Fix` button |
| **A5** | **Seeds, not blanks.** | Every new declaration is created as a working shape with example rows |
| **A6** | **The author names intent; the system picks values.** | `warn`, not a hex. `Roomy`, not `24px` |
| **A7** | **Forms are generated from the schema the parser validates against.** | A form cannot drift from the format, because it is not written by hand |
| **A8** | **Every closed list is fully visible in its control, and the control expresses 100% of the format.** | If a dropdown exists, the dropdown *is* the language |
| **A9** | **Never silently change meaning.** | If a surface cannot represent something it **says so and refuses** — it does not approximate |
| **A10** | **AI proposes into visible controls, never into storage**, approved item by item | an AI predicate lands in the query builder with a match count, and waits |
| **A11** | **Every value shows where it came from**, and provenance is clickable | five states, one menu — §2 |
| **A12** | **One validator, three callers.** | UI, HTTP and MCP hit the same guards with the same messages |

And one rule governing copy — with the scope an earlier draft omitted, which made the refusal copy
in [13-UI](13-UI.md) §6 a violation of this document:

| Surface | Rule |
|---|---|
| A **control** — button, field, toggle, meter | a label and what to do. **Never** a ratio, a limit, a standard's name or an internal metric |
| A **refusal** | **names the measurement, because the measurement IS the instruction.** *"(faint on s3) is 3.61:1. Body text needs 4.5:1"* is not an explanation of the UI; it is the fix, stated |
| A **first use of a product noun** | one clause of definition, in place — see §14 |

A refusal is the main teaching surface in a system that refuses this much, so it gets the numbers. A
control never does. The two halves stop conflicting once the scope is written down.

### Where the UI/declaration line falls

Home Assistant published the only rigorous version of this reasoning (Home Assistant ADR-0010): config belongs in
the UI where it is *discovered*, *credentialed* or *per-instance* — and, the part that matters here,
because credentials in a shareable file *"prevents them from sharing their configuration."*

| UI-owned, stored in the account | Declaration-owned, shareable |
|---|---|
| connected inboxes, channels, tokens | registers, pages, blocks, ingest, rules, metrics, themes, digests |
| `secret` pointers | everything else |
| which packs are installed, at what version, with what inputs | the packs themselves |

---

## 2 · Provenance — the cross-cutting mechanism

Webflow's best invention is not its box model. It is that **every property tells you where its
value came from, and clicking takes you there.** Take it whole; drop the CSS.

Every editable value in every authoring surface renders in one of five states:

| State | Means | Click does |
|---|---|---|
| plain | unset, using the default | — |
| **blue** | set here, at this scope | reset to inherited |
| **orange** | inherited from a named outer scope | **jump to that scope and edit it there** |
| **pink** | a one-off override at this scope only | reset, naming the inherited value |
| **purple dot** | from a theme role or a pack input | open the role / the input |

And above every property list, a **Chain menu** naming the full scope path, root first, each entry
navigable:

```
Chain:  pack invoices-egypt 1.2.0  ›  page renewals  ›  block overdue  ›  desktop
```

Scopes, outermost first: **pack default → account default → the declaration → the block instance →
the viewport.** Nothing else in the surveyed field answers *"where did this come from and how do I
change it there"* in one glance and one click.

---

## 3 · The page builder

### 3.1 A list, not a canvas — and the reason is published, not aesthetic

**All three input modes ship, but drag-and-drop does exactly one job.**

- **Drag governs order only.** No pixel positions, no free placement.
- **Width is a property**, stored as `span: 1–12` ([06-PAGES](06-PAGES.md) §1.1).
- **Everything else is a form** in the inspector.
- **Text-with-preview** is a lens over the same page, always one click away, never the only way.

Home Assistant replaced its masonry dashboard layout and wrote down why: a **1-pixel** height
difference could move a card from the leftmost column to the rightmost; positions shifted across
screen sizes so **users lost spatial memory of where a control lived**; and the logic was
unintuitive enough to make customisation trial-and-error. Their replacement flows sections in a Z
pattern, chosen for *"simplicity, predictability, and memorability"* **over space optimisation** —
and their framing line is the one to keep: *"drag and drop isn't merely an engineering problem —
it's fundamentally a design challenge requiring architectural changes."*

Two corrections to received wisdom, since they change what there is to steal: **Retool never
migrated from free-drag to a grid** (it has had a 12-column grid for years and added a flex escape
hatch in 2024), and **Airtable's Interface Designer is not a free canvas either** — it is a
reflowing flex-grid whose drop preview shows dashed lines *and how neighbours move in response*,
plus wide/narrow snap buttons.

**Span control, adopting Home Assistant's exact trick:** they store `columns` over a 12-column grid
with a multiplier of 3 — ours is `span`, same grid; the size control steps by 3 normally and by 1 in
"Precise mode" — and **Precise mode is not stored, it is inferred** from `span % 3 !== 0`. No extra
state to keep in sync.

```
Width    [ Full ] Half  Third        ← 12 / 6 / 4
         ⌐ Precise                    ← appears only when the stored value is none of those
```

> **Why an amateur cannot produce something ugly:** spacing, type, colour, radius and density all
> come from the theme. **The only authorable dimensions are order and span.** There is no ugly
> available, for the same reason there is no insecure available — the vocabulary has no word for it.

### 3.2 Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Renewals      ● draft    [ Build │ Text ]  [ ◉ View as ▾ ] [Discard] [Publish] │
├────────────────┬───────────────────────────────────┬───────────────────────────┤
│ OUTLINE     ⌕  │  ┌──── phone ──── desktop ────┐   │ overdue          ⌕ filter │
│ ⠿ heading      │                                   │ ───────────────────────── │
│ ⠿ pick project │   Renewals                        │ Show me                   │
│ ⠿ overdue   ◀  │   [ bake ▾ ]   ← reader control   │  [ domains          ▾ ]   │
│ ⠿ soon         │                                   │  ⌐ or from  [ pick … ▾ ]  │
│ ⠿ rate         │   ┌─ Overdue ───────────────┐     │ that is                   │
│                │   │ example.com  14 Sep  ⚠    │ ▸   │  [ overdue          ▾ ]   │
│ + Add block    │   │ quartz.gg  19 Sep  ⚠    │     │ as                        │
│                │   └─────────────────────────┘     │  [ table            ▾ ]   │
│ WHERE IT LIVES │                                   │                           │
│ slug /renewals │   [ Data │ Empty │ Loading ]      │ Matches 2 of 41.          │
│ nav  Records ▾ │                                   │ Nearly matched 3 ▸        │
│ needs domains  │                                   │ Width [Full] Half Third   │
│                │                                   │ Empty  Nothing is overdue.│
│                │                                   │ Chain: page › block       │
└────────────────┴───────────────────────────────────┴───────────────────────────┘
```

**`Build │ Text` is a permanent, first-class segmented control.** Grafana's users reported never
noticing its equivalent — *"the tiny `code` button at the top right. I didn't realize explain/code
were even clickable at first."* Discoverability of the lens switch is the difference between a
two-audience tool and a one-audience tool.

**`View as` impersonates a reader** (Airtable's), which is what makes the fixed/reader filter split
in §3.5 verifiable.

**The inspector's property grouping is Retool's**, and it is worth explaining why: Retool faced 40
disparate property sections across 100+ component types with three *overlapping* grouping concepts
applied simultaneously, so the same property appeared in several places. The fix was **sequential
layering, not simultaneous**:

1. **Which part** of the block you are editing — heading, rows, empty state, footer. Properties stay
   hidden until that part is selected.
2. **Which kind of property**: Content · Behaviour · Appearance.
3. **Basic vs advanced**, behind a collapsible.

Plus two mechanisms that matter more than the taxonomy: **unset properties are hidden and added via
`+`** (a list editor, not 40 empty fields), and **a written classification flowchart** so whoever
adds the next property files it the same way. That governance step is why theirs scaled.

Multi-select several blocks and shared properties edit at once, differing values shown as
**`Mixed`**.

### 3.3 Insertion: live-rendered previews seeded with the user's own data

`+ Add block` opens a sheet of **drawn** cards grouped by purpose — *Say something · Show a figure ·
Show a list · Show a plan · Show media · Let the reader…*

Home Assistant's card picker is the reference implementation and its source comments are worth
copying verbatim in spirit: *"a preview is a live DOM node, so every section a card shows up in
needs its own element."*

| Mechanism | Detail |
|---|---|
| Every tile is a **live rendered block**, not a screenshot | with a stub config synthesised from **the user's real data**, instantiated inside a `try` |
| **On failure the tile degrades to the kind's description** in the same slot | the layout never breaks |
| Previews are `tabindex="-1"` with a **transparent overlay absorbing clicks** | so you cannot tab into a preview or fire its own controls |
| A third-party kind previews **only if it opts in** | otherwise the tile shows its description |

Fill priority: **real rows** from a register the page already requires → a **seeded specimen** of
three synthetic correctly-typed rows at reduced opacity with a `sample` tag → **never** lorem, never
an icon, never a wireframe.

That answers *"how do you show what a block will look like before it has data"*: it is not a data
problem, it is a **shape** problem, and a shape can be seeded.

**And offer the inverse tab.** `By block │ By field` — pick `renews` and be shown the four kinds
that draw a date well, each already bound. (Home Assistant added exactly this in 2026.6.)

Selecting inserts the block **already bound and already drawing**: source = the page's primary
register, predicate = `everything`, slots auto-filled with the first type-compatible field.
**The user's first act is narrowing, never starting.**

### 3.4 Binding without a query language: the sentence

```
Show me   [ domains ▾ ]        ← source
that is   [ overdue ▾ ]        ← a NAMED predicate
as        [ table ▾ ]          ← kind, filtered to those the source can fill
```

The middle control never contains an expression. It contains **names**, from four places:

| Source of names | Example |
|---|---|
| **Saved predicates** on the register | `overdue`, `unpaid`, `mine` |
| **Generated candidates** from field types | one per `day` field × {overdue, next 7, next 30}; one per `enum` value; both polarities of every `bool`; `present`/`empty` for optionals; one per existing `ref` target |
| **`Everything`** | always first |
| **`Something else…`** | opens the query builder; its result gets **named** and joins row 1 |

> **Candidates are ranked by live match count, and zero-match candidates are not offered.** That
> single rule does more than any amount of copy: the picker only ever contains predicates that
> produce a page with something on it.

```
  Everything                          41
  overdue                              2
  renews in the next 30 days           7
  has no owner                         4
  ─────────────────────────────────
  Something else…
```

**A block's source may be another block on the same page.** Airtable's most under-appreciated
mechanism: an element's source can name a table *or another element*. Master-detail and
cross-filtering become a field on each block rather than event wiring — so the dependency graph is
serialisable, diffable and **statically checkable** ("connected blocks must share a source" is a
static rule, not a runtime error).

**Projection** is a short list of **slot pickers**, each filtered to the types that fit the slot. A
`bar`'s magnitude slot offers only int/decimal/money/duration. **A non-programmer cannot put text in
a number slot because it is not offered** — there is no validation message because there is no
invalid state.

### 3.5 Builder filters vs reader filters

Airtable's split, adopted verbatim:

```
Fixed      status is active            ← the reader cannot change this
Reader     project  [ any ▾ ]          ← rendered as a control on the page
           renews   [ any time ▾ ]
```

A page-level `filters:` key declares reader filters once — `filters: [{ field: project, control: picker },
{ field: renews, control: range }]`, the same shape as [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §5's
`header.filters` — and every block honours them. *An earlier draft called this a `params` block;
`params` is a drawn kind ([05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §2).*

### 3.6 Empty and loading are previewable in one click

`[ Data │ Empty │ Loading ]` under the live page. `Empty` renders every block's `empty:` string in
place, seeded from the predicate and editable. **Empty states are the most-neglected and
most-often-seen surface in a record app**; one-click preview is the cheapest quality win available.

### 3.7 Trial-fit and graded demotion — the best mechanism in the survey

Switching Build ↔ Text **cannot fail**, and the mechanism is Home Assistant's, whose source comments
state the intent exactly: *"Error: Configuration broken - do not save"* versus *"Warning: GUI editor
can't handle configuration - ok to save."*

1. **One config object.** The visual editor is a **validator**, never a parallel model.
2. On every change the form's setter runs inside `try/catch`.
3. **Failures are graded**, and the grading is the insight:

| Failure | Severity | Save | Message |
|---|---|---|---|
| required key missing | **error** | blocked | `Required key 'source' is missing.` |
| **unknown key** | **warning** | **allowed** | `Key 'x' is not expected here.` |
| wrong type | warning | allowed | names the key, the expected type, and the actual value |

4. On failure it **auto-switches to text**, byte-identical, with a banner.
5. **The return toggle is disabled while warnings exist** — never let a round trip silently drop
   keys.

**Where BrainDog departs, and it is the most important decision in the builder.** Home Assistant's
whole-object bail-out — *"Visual editor is not supported for this configuration"* — strands the user
in YAML for an entire card because one key is unmodelled. Third-party keys trip it too.

> **An unmodelled key renders as one labelled raw row inside an otherwise working inspector**,
> preserved byte-for-byte, with everything around it editable. **Per-node fallback, never
> per-object.**

**And when the gap is real, extend the vocabulary rather than special-casing.** Home Assistant's
templates-in-the-visual-editor problem was closed *"no intent to fix"*, then dissolved by shipping a
**`template` selector** — one new control type retired a whole class of bail-outs. Institutionalise
it: **a construct that repeatedly falls to the raw row is a missing control type.**

### 3.8 Editing a page as a file: `.dog` v2

The in-app text-with-preview lens of §3.1 is one way to a page's own text. The other is a file, `braindog page pull
<slug>` writing `<slug>.dog` in the lossless dialect of [06-PAGES](06-PAGES.md) §9 (`packages/dog`): the stored
declaration's exact JSON body, printed in a fixed key order with terse sugar preserved (`columns: [client, amount]`
stays bare, a sentence prints as itself), so a page pulled, edited by hand or by an agent, and checked (`braindog
page check <file>`, the same lint the app runs) round-trips without losing a rail, a lead sentence or a tab. What it
does not do is push itself: `braindog page push <file>` is refused to a bearer token ([ADR-060](16-DECISIONS.md),
unamended: no ADMIN method is ever held by a token), because applying an edited declaration is the same act as
accepting one in the app, and needs the same proof a browser session gives. A `.dog` file is therefore pulled and
checked from anywhere, but applied only by opening it in `SourceView` (§3.1's text lens) and pressing Save, or by an
owner's session.

A page's body also carries `{{icon:<name>}}` inline, a glyph and never a path
([05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §7.2): typed in a `note`'s markdown or any other body text the same
way a typed interpolation is, and drawn 1em high in the words' own colour by whatever the host answers
`RenderOptions.icon` with, so the builder's live preview and a pulled `.dog` file show the same rocket before the
same word.

The four newest kinds (`calendar`, `link`, `gallery`, `embed`) need no builder work of their own beyond what A7
already gives every kind: their keys (`panel`, `short`, and each kind's own columns and cells,
[06-PAGES](06-PAGES.md) §1.1) generate a form from the same schema the parser validates against, so a new kind
neither special-cases the inspector nor waits for one.

---

## 4 · The query builder

### 4.1 Four surfaces, one tree

| Surface | When |
|---|---|
| **A · the sentence** | 1 condition — 80% of predicates, and it should cost one row |
| **B · the stack** | 2–*n* conditions, flat |
| **C · groups** | mixed logic, depth ≤ 3 |
| **D · the text lens** | always available, default never |

All four edit one tree. There is no mode a user can get stuck in.

**And one component serves every call site** — the seven consumers in
[02-DATA-MODEL](02-DATA-MODEL.md) §6, plus the three that reach the same compiler through another
declaration (register validation, digest sections, collaboration scopes). One thing to learn. Airtable
proved the model with five call sites and then **excluded automations**, where condition groups still
cannot nest at all. Take the reuse; do not take the exception.

### 4.2 Typed operators, phrased as English

Operators are filtered by field type, because per-type lists are short, complete and sayable:

| type | operators |
|---|---|
| text | is · is not · in · not in · contains · starts · ends · empty · present |
| document | contains · empty · present |
| int/decimal/duration | is · is not · **at least** · **at most** · more than · less than · empty · present |
| money/quantity | the same, with a currency or a unit on the literal |
| day/instant | is · before · after · between · at least · at most · empty · present |
| enum | is · is not · in · not in · empty · present |
| ref | is · is not · in · not in · empty · present · **through** — `via:`, one hop |
| bool | is on · is off |
| `list<T>` | has · lacks · empty · present |
| the register itself | **matches** — full-text over its `search:` fields; offered once, never per field |

`contains` is a substring test on one field, forty bytes at most; `matches` is the full-text search
([02-DATA-MODEL](02-DATA-MODEL.md) §6; the EBNF is [34-GRAMMARS](34-GRAMMARS.md) §1). **Never `>=`; always
`is at least`.** Symbols are a second language. *An earlier draft of this table gave numerics a
`between` the format does not have, and enums alone an `in` that text and refs also take.* The CI test
in §4.5 enumerates the grammar, so this table cannot drift from it.

Typed value controls carry most of the accessibility: a `day` gets relative preset chips (`today`,
`in 7 days`, `overdue`, `this month`); `money` shows the register's median so "over" has a
reference; **an `enum` multi-select silently rewrites `is` → `in` when a second chip is picked** —
which is how `in` gets taught, by never being chosen.

**And publish the capability table.** Metabase publishes a per-database function-support matrix,
which is why its users can predict what will work. The operator table above is a page *in the
product*, not just in this spec.

### 4.3 The stack, and the quantifier decision

```
Match  [ all ] any  none   of:                     Matches 6 of 320.

   status   is         unpaid            ● ⊙
   and
   due      is before  in 7 days     ▾   ● ⊙

   + Add condition      + Add group
```

**The quantifier is a word, stated once, before the rows** — then **repeated passively between
them**, where the `and` is *not a control*, only a label reflecting the header.

That redundancy is the position, and it is a considered trade: between-row *selectors* read
beautifully at two rows and become a menace at five, because the user must trust that four selectors
all say the same thing and nothing promises it. Header-only scales but forces the reader to hold the
header in memory. **Header control plus passive echo gets both**, with exactly one control, so there
is no ambiguity about what clicking the echo would do — nothing; it is not clickable.

*Held with moderate confidence. The test is in §9.*

Each row carries a **live pass badge** (`●`/`○`) and a **mute toggle** `⊙` — a condition you can
silence in place is how you find the one that is wrong.

### 4.4 Groups, capped at 3

```
Match  [ all ] any  none   of:                     Matches 4 of 320.
┌╴
│  status   is        unpaid
│  and
│  ┏━ any of:  (2)                          ⌄  ⋯ ┓
│  ┃    due      is before   in 7 days             │
│  ┃    or                                         │
│  ┃    amount   is at least  EGP 10,000.00        │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
│  and
│  ┌╍ none of:  (1)                         ⌄  ⋯ ┐
│  ╎    tag      has        disputed               │
│  └╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍┘
│  + Add condition   + Add group  (2 of 3 levels)
└╴
```

Six rendering rules:

1. **A group is a card with a left rail**, tinted by depth from three theme steps — so depth is
   legible peripherally, without counting brackets.
2. **A rail heavier than its parent's means the quantifier changed.** The eye finds the logic change
   before it reads a word. `none of` is **dashed**.
3. **One 20px indent step per level, and only two steps exist.** Nesting cannot walk off a phone.
4. **`none of` is a word, never a `not` checkbox.** Negation must be the group's *name* — a checkbox
   puts the most consequential thing in a predicate somewhere trivially missed.
5. **`⋯` always offers `Unwrap`.** Unwrap is the escape from accidental nesting, and **its absence
   is why people abandon these builders: they get in and cannot get out.**
6. **`+ Add group` greys out at the cap** and states the level count. Airtable does exactly this, and
   greying beats erroring after the fact.

**Depth 3 is the industry-converged answer** — Airtable is exactly 3, Notion is *"up to three layers
deep."* Deeper predicates want **named composition** — save the inner predicate, reference it —
which is a better answer than depth 4 and reuses the picker mechanism already built. The format has
it: `predicates:` on the register, referenced as `{ predicate: overdue }`
([02-DATA-MODEL](02-DATA-MODEL.md) §5); the expansion counts toward the depth, and a cycle is refused
(`PREDICATE_CYCLE`).

**The builder normalises, and the normalisation is identity-preserving.** Same-quantifier nesting
flattens on commit: `all[ all[a,b], c ]` → `all[a,b,c]`. That kills the largest source of unreadable
trees.

> **That is the only rewrite permitted, and A9 is why.** Grafana's query builder rewrote a query's
> **operator precedence** and shipped it silently — `topk(5, a/b)` became `topk(5,a)/b` — filed by
> Grafana's own engineer with the expected behaviour stated exactly: *"Query builder wouldn't change
> order of operations of code query without displaying the warning modal."* A normalisation that
> provably preserves meaning is fine. One that *changes* meaning must not exist.

### 4.5 The round trip

| Direction | Rule |
|---|---|
| text → visual | parse. On a parse error the visual side **keeps the last good tree, greyed**, with one line: `Unparsed after "{ field: due, before:".` **It never clears the tree and never refuses to switch back** |
| visual → text | pretty-print from the tree with **one canonical form**. Deterministic, idempotent |
| notes | **first-class fields on nodes**, so they survive by being data |
| comments | live on CST nodes. A comment on a deleted node is **collected into a trailing `# removed:` line**, never eaten |
| unrepresentable node | an **opaque chip showing its own source text**, editable only as text, everything around it fully editable |

The text lens is the **YAML flow form** of [02-DATA-MODEL](02-DATA-MODEL.md) §6 — one leaf per line,
quantifier first, keys in the order `via field <op>` — converted through `declare`, the only package
that holds a YAML parser. `where.parse` itself takes the JSON tree, the storage form, and `where.print`
emits RFC 8785 canonical JSON ([33-CONTRACTS](33-CONTRACTS.md) §1, [34-GRAMMARS](34-GRAMMARS.md) §1), so
the two properties below are over JSON trees. The sentence forms in §4.6 — `status is unpaid` — were
described here as the English restatement of §13's last row, read-only and never parsed. **They are
parsed.** `predicateOf` hands any `where` that arrives as a string to `parseWhere`, so a sentence is
a second way in to the same compiler, and it was one before `has` and `lacks` were added and is one
after. The line is corrected rather than deleted because what it got right is the *direction*: the
restatement in §13 is a read, and nothing round-trips through English.

What is genuinely missing is a grammar for the spoken form. There is no word list and no EBNF for it
anywhere in these documents, only examples, which is a fair part of how a whole field type came to be
reachable from one surface and not the other: `tags has 2` parsed to `{ has: '2' }` and `projects has
Kiln` to the four letters `Kiln`, because the schema the sentence reads published an element type for
a `list<enum>` and for nothing else. That one is closed — the schema carries `of` now, and `has` and
`lacks` narrow a list to its element before the value is read — but it was reachable because nobody
had written the grammar down, and the next one will be reachable the same way.

Two property tests are the entire safety story:

```
∀ t ∈ trees the builder can construct :   parse(print(t)) ≡ t
∀ s ∈ corpus                          :   print(parse(s)) ≡ print(parse(print(parse(s))))
```

And one stronger guarantee than any surveyed product offers: **the builder can construct only trees
the printer prints exactly.** A CI test enumerates the grammar and asserts a control exists for every
node — *and runs the other direction*, asserting every control has a storage location.

Grafana's Builder/Code toggle works because a real parser sits behind it, and the gaps are
instructive: `abs()` missing from the registry, `stddev by` producing *"Could not find operation
`__stddev_by`"*, and **Grafana's own template variables breaking its own parser**.

### 4.6 The count, and the thing nobody builds

```
Matches 4 of 320.     Sample 5 ▸     Nearly matched 3 ▸
```

- **`Matches n of N`**, debounced. Table stakes — HubSpot, PostHog, Mailchimp all have it.
- **`Sample`** — the first five matching rows, drawn by the register's **real** row component.
  Metabase's per-step preview is the proven version, and it is the cheapest fix for the fundamental
  problem of declarative pipelines: *the user cannot see where intent diverged from result.* Grafana
  has the identical structure, **lacks** the preview, and its own engineers have an open, untested
  epic trying to add one — the strongest possible evidence this is the right primitive.
- **`Nearly matched`** — rows failing **exactly one** condition, with the failing condition named.
  **Absent from every product surveyed, and the one worth building**, because the question is never
  *"how many matched"*; it is *"why isn't this invoice in there."*

```
Nearly matched 3
   example.com      fails:  status is unpaid   (it is "paid")
   quartz.gg      fails:  due before +7d     (due in 19 days)
```

**Zero-match guard**, with relax chips that state the count each would yield:

```
Matches nothing.     Relax:  [ status is unpaid → 12 ]  [ due before +7d → 3 ]
```

### 4.7 AI in the query builder

A `Describe it` field at the top. The AI writes into **the visual builder**, never into text and
never into storage (A10). Every produced row is marked **proposed** until approved, and **approval
is per row, top to bottom** — Notion's August 2026 model, and the single best AI-review mechanism
anyone has shipped: *"Your agents can now propose changes instead of making them directly… move top
to bottom to approve each one."* `Approve all` exists; it is one button and it is not the default.
The match count appears before anything can be committed.

The alternative is documented and grim. Airtable's Omni has no plan, no diff, no approval and no
undo: *"I asked it to undo and it could not… Omni is not super safe in terms of preventing data
loss."* And *"all the Omni produced pages are incredibly buggy and impossible to tweak"* — with the
missing affordance named exactly: *"I was hoping… clicking on elements or updating the source
directly."*

---

## 5 · The register editor

Two columns — field list, field inspector — and a header carrying two **meters**: `Fields 12/64`,
`Indexed 6/8`. **Meters, never errors:** at the cap the `+ Add field` button disables and reads
`64 of 64`. Airtable greys out its add-group control at the nesting limit rather than erroring after
the fact, and that pattern generalises to every budget in the product.

**The type grid shows values, not names.** Each cell renders a real specimen — `money` →
`EGP 1,299.00`, `day` → `2026-09-14`, `duration` → `3d 4h`, `secret` → `••••••••`. A non-programmer
picks a type by recognising the thing they want to store.

**Per-type options are generated from the type's own schema** (A7). Three independent products
converged on this — Home Assistant's selector-driven forms with zero UI code, Obsidian's Style
Settings generating UI from a declaration, Budibase's `settings[]` with `dependsOn` — so it is the
settled answer. The control vocabulary is **Framer's**, which is the richest available: String,
Number (min/max/step/unit), Boolean, Enum (with a segmented-control option), Object, **Array with
`maxCount`**, Date, Link, plus **`hidden(props)`** for conditional controls, markdown
`description`, and `optional`. Add Home Assistant's two best ideas: **a select renders radio buttons
at ≤5 options and a dropdown above**, and a **`choose`** control letting the author pick which
selector to use.

**Display rules, not a per-column table.** Grafana's single best mechanism is **field defaults plus
ordered override rules with matchers**: *fields matching `/_pct$/` → percent, 1 decimal* keeps
working when a new column appears. Configuration scales **sublinearly** with the data. Matchers here:
by name · by name pattern · by type · by tone. And each rule gets an **eye toggle to mute it in
place** — the cheapest debugging affordance in any pipeline UI.

**The inspector has a search box.** Once a config surface passes ~30 controls, filter-by-name beats
better organisation.

### Type change is a conversion preview, not a warning

> **This preview is built** (GAP-8): `previewRetype` draws it over the list's live rows and writes nothing;
> `retypeField` files the answered conversion as one `change` body — `{ retype: { register, field, as, answers } }`
> for a field whose type moves, `{ narrow: ... }` for one that only tightens — and lands only once every failing
> row has an answer of `clear`, `keep` (a sibling text field beside it) or `{ to: <value> }` (typed by hand). An
> owner's lands at once; anybody else's waits on Decide. `FIELD_TYPE_CHANGED` and `REQUIRED_ON_POPULATED` still
> refuse an ordinary pack update ([04-PACKS](04-PACKS.md) §5): this governed path is the only one that converts
> rows.

Airtable's failure here is severe and documented in its community rather than its docs: text→number
**silently truncates integers above 2⁵³−1**, with video evidence and no staff reply. Airtable
already has the parts — it can duplicate a field with data — and still does not preview.

```
amount:  text → money (EGP)
1,204 convert.  3 do not.

  row 88   "tbc"          → cannot read a number   [ clear ] [ keep as text ]
  row 341  "1,250 + vat"  → cannot read a number   [ clear ] [ keep as text ]
  row 902  ""             → empty                   (fine)

Sample:  "1,250.00" → EGP 1,250.00     "3400" → EGP 3,400.00

                                    [ Cancel ]  [ Convert 1,204 rows ]
```

**All three failures must be resolved before the button enables.** `keep as text` creates a sibling
field automatically — the user is never forced to choose between their data and their schema.

**Key immutability:** the display label is free; the stored key is auto-slugged and frozen after
first write. Renaming is an explicit migration — retire the old key, add the new — with its own diff
and blast-radius line; a declaration id is never renamed (`ID_RENAMED`, [04-PACKS](04-PACKS.md) §5).

---

## 6 · The theme editor

*Built by GAP-3 (W2), as Settings > Appearance "Edit the look": every role, its three tabs, the scales chosen
never typed, and the specimen beside it, as this section specifies.*

**Roles, and only roles.** Every role is a **light/dark pair in one row, two swatches** — there is no
"make a dark theme" step. And **there is no other colour surface in the product**: an author who
wants red says `bad`.

The right pane is **every block kind and every control, live, in one scrolling column** — the
specimen gallery promoted to a product surface. A theme editor whose preview is less than the full
specimen ships a broken `gauge`.

**Editing a role — three tabs, in the order people need them:**

| Tab | What |
|---|---|
| **Nudge** (default) | three sliders in words: `Darker ⟷ Lighter`, `Duller ⟷ Richer`, `Hue`. **No numbers** |
| **Pick** | a perceptual OKLCH grid. **Out-of-gamut cells are absent, not clipped** — clipping shifts hue, defeating the point of choosing one |
| **Enter** | hex/oklch text, for someone with a brand colour |

**Scales are chosen, never typed:** Rhythm Tight/Normal/Airy · Corners Square/Soft/Round/Pill ·
Density Compact/Comfortable/Roomy. Type is not a theme's to set: the scale is fixed at eight steps, and
the reader's own Text setting — Small/Normal/Large, the body step among `t-sm`/`t-base`/`t-md`
([13-UI](13-UI.md) §3) — picks the size. **No numeric spacing entry exists** —
hand-typed spacing is the fastest route to an ugly theme and the format does not need it.

Steal from Figma: **modes as columns** (light/dark for free) and **aliasing** with `Detach`. Invert
its *scoping* idea — **a role declares where it may be drawn**, which is what makes the
contrast-pair set finite and checkable. Skip Figma's one mistake: Styles and Variables as two
overlapping systems for one job.

### The contrast gate, in the user's language

The user never sees "WCAG", a ratio or a grade. They see **pairs**, and a pair is readable or it is
not. **The pair set is declared by the app, not inferred** — the app knows what it draws on what, so
the checked set is finite, known and complete.

A failing pair is not described. **It is shown, at real size, in real words, with the fix as a
button:**

```
┌─────────────────────────────────────────────────────────┐
│  ┌───────────────────────────┐                          │
│  │  Overdue in 3 days        │   ← actual warn on s2    │
│  └───────────────────────────┘                          │
│  Too faint to read.                                      │
│  [ Darken warn ]   [ Lighten the panel ]   [ Use this ▨ ]│
└─────────────────────────────────────────────────────────┘
```

Four decisions:

1. **The failure is shown before it is named.** The user's eyes are the primary evidence; the checker
   is the second opinion. Number-first presentations teach people to argue with the number.
2. **The verdict is four words.**
3. **The fix is a button**, and it **moves lightness only** — preserving hue and chroma, so the fix
   still looks like the colour the user chose. This converts an accessibility lecture into a click,
   which is the whole difference between a gate people route around and a gate people use.
4. **The severity words are the user's:** `Fails` (blocked) · `Tight` (allowed, flagged) · `Fine`.

**Thresholds:** WCAG 2.2 is the gate. APCA is computed as a second opinion and used only to mark
`Tight` — because APCA is explicitly **not** the WCAG 3 contrast method and WCAG 3 is *"perhaps 2030
at the soonest."* Cheap, honest about its status, never blocking.

**Colour vision** gets a `Vision` selector on the specimen — a *look*, not a gate, **with one
exception that is a gate: the intent roles must be separable by lightness in greyscale.** Tone is
the app's only semantic colour channel, and [13-UI](13-UI.md) §2.3 measured what happens when it is
not: five hues tuned to the same contrast target against the same ground collapse to the same
luminance, and `earn` vs `danger` came out at **1.07:1** under deuteranopia.

**A refusal must come with a route.** A theme pack that fails is refused with each failing pair
*drawn*, **no `Install anyway`**, and a **`Fix and install`** that opens the theme with the failing
roles pre-selected and the one-axis fixes staged as a diff. *A refusal with no route forward is how
you get forks.*

---

## 7 · The dialect editor

### The argument: none of the three obvious answers

| Option | Why not |
|---|---|
| **Plain text** | the columns are positional and fixed — right for a stored format, and exactly what a human miscounts |
| **A rich editor over the whole document** | the store is markdown plus a dialect with one parser. A document model needs a serialiser that agrees with the parser *forever*, and **the first disagreement corrupts the only copy of somebody's writing** |
| **Split-pane source \| preview** | doubles the width and halves the reading measure, fatal on a phone — and answers the wrong question. The author asks *"does this block look right"*, not *"does the document parse"* |

### The answer: segment-addressed, in place

> **The unit of editing is the segment.** The document is rendered by the real renderer. Every
> paragraph, heading, list and drawn block is addressed by its character span in the source.
> Clicking one swaps *that segment only* for a control sized to its shape; committing splices that
> span and leaves every other character alone.

Three properties fall out: a bug can damage one paragraph, never the document; the read view **is**
the renderer (A3); and a drawn block gets a form that **knows its shape**.

Two segmenter properties are load-bearing: **offsets are into the raw string, never into normalised
output**, and **the blank lines between segments belong to nobody**, so splicing a paragraph cannot
reflow the document around it.

**The form per kind** gives each block its real columns — the row shapes of
[05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §2.1: `stat` is Label · Figure · Note · Tone; `chips` is
Glyph · Figure · Word · Tone. **Glyph** is a picker of drawn glyphs, never a name typed from memory.
**Tone** is a **4-way** segmented control rendered *in* the tones. **`bar`'s Number draws its bar live**
as you type. Each row's drawn form sits directly beneath its inputs, so the block assembles under
the hands.

### The value preview

**A correction worth stating plainly:** the inline evaluated preview is widely credited to Retool
and its documentation describes no such thing — Retool's evaluated values live in a separate Debug
Console and State browser. **Budibase has the real mechanism**, and it is better than what I would
have designed: a debounced side panel headed literally **`Preview`** or **`Error`**, a browsable
bindings list where **each entry shows its evaluated sample value**, a copy button, a real empty
state (*"Your expression will be evaluated here"*), and **the author's own console output rendered
with source line numbers**.

Combine it with Notion's one-region rule: **the same region becomes the error list**, so there is no
state where the user is looking at a stale value.

### Readable ↔ stored references — take the UX, not the mechanism

Budibase's most valuable idea and its worst implementation, in one place. **The idea:** every
reference carries a `readableBinding` shown to the human and a `runtimeBinding` stored and
evaluated. The store always holds runtime; the UI always shows readable. That is what lets a
declarative record stay renameable while reading like English.

**The implementation is regex substitution over free text**, and the edge-case tail is instructive:
longest-name-first sorting, consumed-match blanking, and a pass whose own comment explains that a
binding named `a` would otherwise turn `hah` into `h[a]h` — plus a real corruption bug where
copy/paste surfaces the runtime form and the conversion then runs on already-runtime text.

> **Store references as structured nodes** — `{kind:"ref", target:"invoices", field:"vendor"}` — and
> resolve display names at render time. Same benefit, entire bug class gone. And a field rename
> updates every reference for free, while `Find usages` becomes a tree walk rather than a string
> search.

### Malformed → a visible fence, made actionable

```
┌──────────────────────────────────────────────┐
│  ```steps | The plan                          │
│  | why it matters                             │
│  ```                                          │
├──────────────────────────────────────────────┤
│  steps needs a title in the first column.     │
│  Row 1 has none.                    [ Fix ]   │
└──────────────────────────────────────────────┘
```

**`Fix` opens the form pre-filled with everything that did parse.** Never a red banner, never a
grammar rule, never a bare line number. Metabase shows what bad error text costs: picking a column
in a filter expression yields **`Unknown Segment: Discount`** instead of "missing comparison value"
— filed by Metabase's own engineer.

**And one rule above all:** there is exactly one renderer, and **no authoring surface may import a
drawing primitive the read path does not use.** Lint-enforced. This is A3 made mechanical, and it is
what stops the preview from slowly becoming a second, wrong app.

---

## 8 · The ingest pattern builder

### Screen 1 — samples

A drop zone, a forwarding address, `Paste text`. One line of copy:

> **Forward three that look different from each other.**    `Samples 2 of 3`

Three is the floor and the counter says so. `Propose from 2` exists but is secondary — a pattern
built from one sample breaks next month, and the counter teaches that without a paragraph.

### Screen 2 — the proposal, as a table with **one column per sample**

```
┌ From: Orange invoices ─────────────── match: from contains "orange.eg" ──────┐
│      field      from     transform                    S1        S2       S3   │
│ 3/3  amount     body     between "Total:" ⟶ money      1,250.00  3,400.00  ✗   │
│ 3/3  due        body     after "Due" ⟶ date            ✓         ✓        ✓    │
│ 3/3  vendor     subject  before " invoice" ⟶ text      Orange ✓  Orange ✓ Voda✓│
│ 0/3  reference  body     between "Ref:" ⟶ text         ✗         ✗        ✗    │
│ writes: invoices                                  [ Fix 2 rows ]  [ Continue ] │
└───────────────────────────────────────────────────────────────────────────────┘
```

Four properties:

1. **One column per sample.** Agreement is a row of ticks; disagreement is a single visual hole.
   *"This transform found EGP 1,250.00 in all 3 samples"* is not a sentence the UI says — it is three
   green cells and a `3/3` chip.
2. **Cells show the typed result; hover shows the raw matched text.** The two failure modes —
   *matched the wrong text* vs *typed the right text wrongly* — need different fixes and are
   indistinguishable if you show only one.
3. **Confidence is never a number.** `3/3`, `2/3`, `0/3` — the only honest metric available, and more
   actionable than any score.
4. **`match:` is shown as a sentence and is editable**, because "which messages does this claim"
   decides whether the whole thing is safe.

### Screen 3 — fixing, in order of how often it works

1. **Select-to-anchor.** Drag across the value you wanted. The builder proposes anchor sentences from
   the surrounding text and **scores every proposal against all samples immediately**, best first.
   The user picks a sentence; **they never type a pattern.**
2. **Add an alternative.** `first` takes an ordered list of ways, rendered as a numbered list with
   `+ Another way`. A vendor who words it differently becomes a second line — **this is why `first`
   exists and why no regex is needed.**
3. **Fall back.** `default`, as the last line of the same list.
4. **Don't claim it.** Add a condition to `match:`.

**The missing anchor is shown struck through with *"not in this one"*** — the commonest failure is an
anchor that simply is not present, and the fastest fix is seeing that fact.

> **There is no field anywhere in this builder where a regular expression could be typed.**

Zapier's Email Parser is the counter-example: one template per mailbox, widely reported to break on
any layout variation. Ours is a **structural** fix — a list of ways, scored against all samples —
not an AI one.

### Screen 4 — dry run, then a holding tray

> **The first 10 live runs land in a holding tray, not the register.** Each held row gets
> `Accept`/`Reject`; a rejection re-opens the sample viewer with that message added as a sample.
> After 10 accepted it writes directly and the tray becomes a log.

An ingest never writes unreviewed rows into the record until it has proven itself on real traffic. **A
pattern built from three samples is a hypothesis.**

**And patterns rot, so assume it.** Any live message where a `3/3` field comes back empty raises a
suggestion: *"3 fields missing in the last 4 messages from Orange."* One click pins that message as a
new sample and reopens the builder.

### As built (September 28th 2026)

The builder is `/inbox/pattern` (`apps/web/src/routes/inbox/pattern/+page.svelte`, with
`apps/web/src/lib/pattern/`), and the record's half is `tryPattern` and `anchorsFor`
(`packages/record/src/pattern.ts`). It opens from an Inbox group of alike arrivals ("Make a rule from
these") and from a `pattern` proposal on Decide ("Open in the builder").

- **Samples** are the arrivals named plus any pasted in, at most `SAMPLES_MOST` of them, and the screen
  counts them. An arrival erased since is left out with a sentence saying so.
- **The table** is one column per sample, each cell the typed value `tryPattern` read through the
  kernel's own extractor, the raw text behind it on hover or a long press, and a chip per field saying
  in how many samples it was read. `tryPattern` writes nothing. A `map:` field is listed and not read.
- **Fixing** is by pointing: select the words in a sample, and `anchorsFor` offers ways to find them
  again, cut from the sample itself and scored against every sample, best first, at most
  `ANCHORS_MOST`. A way can be used, added as another way, followed by a fallback, or turned into a
  condition of the match. There is still no field anywhere to type a pattern.
- **Saving** by the owner installs the rule at `proposed` (`setDeclaration`), so what it reads waits on
  Decide as rowsets, the kernel's holding tray, and the screen says how many of them were accepted
  ("7 of 10 accepted") until she presses "Trust it now", which reinstalls it at `exact`. Anybody else's
  save files a `pattern` proposal carrying the rule and its samples.

Not built: the rot suggestion above ("3 fields missing in the last 4 messages"). A pattern that stops
reading a field is not yet noticed by anything but the person reading its rows.

---

## 9 · The pack builder

### Route in: "export what I changed"

The record has a **baseline** — the declarations the account started with, plus every installed pack
pinned at its installed version. `Diff against baseline` produces a change list grouped by kind,
each item a checkbox with a one-line summary and an expandable diff.

**Selection is the authoring act.** Checked goes in; unchecked stays personal. And **dependency
closure is computed and visible** — checking a page auto-checks the registers it needs and tags them
`required by`. **You cannot ship a broken pack, because the closure is derived rather than trusted.**

### Scrub to inputs — the step that makes packs shareable

```
Found 4 things that are yours, not the pack's.

  ☑  notify goes to        Sam's phone     →  input  notify_to    (person)
  ☑  page filters on       project "bake"   →  input  project      (ref → projects)
  ☑  metric target         90%              →  input  target_rate  (percent, default 90)
  ☐  currency              EGP              →  keep as written
```

This is Home Assistant's blueprint `input:` mechanism, and the implementation details are what make
it safe:

| Detail | Why it matters |
|---|---|
| **Substitution swaps a whole node, never interpolates a string** | which is why an input can be a whole list of actions — and why it can never be spliced into the middle of a string |
| **Two validation gates** | at load, every `!input` used must be declared; at instantiation, every declared input must have a value or a default |
| Inputs may be **grouped into sections**, but the namespace stays **flat** | duplicate keys across sections are rejected |
| **Instance keys win over pack keys** on merge | — |
| **The selector drives the installer's UI** | from the same control vocabulary the rest of the product uses |

> Shipping the author's own project name, phone number and target is why most shared templates are
> unusable — and it is **invisible to the author, because in their record it works.**

### Versioning is computed, not chosen

| Change | Bump |
|---|---|
| field removed, type narrowed, register removed, input added without a default | **major** |
| register/page/field/rule added, input with a default added | **minor** |
| label, copy, tone, `empty:`, note only | **patch** |

**The version field is read-only**, with a `why 1.2.0?` link naming the classifying change. *Nobody
chooses semver correctly; a tool that computes it removes the problem rather than documenting it.*

### Publish

`Validate → Preview as installer → Publish`

**Validate** runs the install-time checks locally *plus a fresh-account install test* — install into
an empty scratch record and screenshot every page provided. Failures are cards with `Fix` buttons,
never a log.

**Preview as installer** shows the *exact* diff a stranger will see, inputs unfilled. **The
highest-value screen in the flow**, because authors ship broken packs precisely because they never
look at their pack from outside their own record.

**Publish** writes a YAML file, and **the file is the artifact**: download, copy an immutable
per-version link, or push to git with a generated README carrying the validation screenshots. For an
open-source self-hostable product the registry is a convenience and never the source of truth —
install accepts URL, git ref, or **paste**.

### The install side, and the thing Home Assistant gets wrong

Home Assistant blueprints have **no version pin**: *"if the blueprint is updated, all automations
using it pick up the change the next time Home Assistant reloads them."* Its lead maintainer's
justification for having no update engine is the tell: *"We don't know if the update will break
stuff. There is no guarantee the new Blueprint is compatible with the existing automations."* **That
is an admission the model cannot express compatibility** — and its Blueprint Exchange is the
receipt, with published blueprints shipping breaking changes requiring reconfiguration. And "take
control" is explicitly one-way: *"You won't be able to convert this back into a blueprint."*

**So, five rules:**

1. **Instances pin the pack version**, and record the input-schema hash they were authored against.
2. **Updates arrive as a diff-and-confirm**, naming inputs added, removed and retyped.
3. **Bulk update from day one, with multi-select.** Its absence is a top complaint.
4. **Unpack is reversible.** Keep the pack ref and input map alongside the expanded declarations, so
   "take control" is a fork you can re-link, not a door that locks.
5. **Uninstall asks about data separately from structure:** *"Keep the 41 rows in invoices? [Keep as
   an archive] [Delete]"*

And borrow Home Assistant's deprecation discipline (Home Assistant ADR-0021): a deprecation runs **≥6 months**; if a
migration is possible it is **required**; and **a failed migration must raise a visible issue saying
what happened and what to do** — not a silent skip.

### As built (September 28th 2026)

There is no baseline diff and no checkbox list yet. Settings' "Export the way you work" downloads every
list, page, metric and rule without a row, but as an export file, not a pack
(`apps/web/src/routes/settings/[area]/areas/Export.svelte`). What is built is three smaller routes to
a pack or a use case:

- **A page shared as a template.** A page's menu has "Share as a template" (`apps/web/src/lib/ui/ShareMenu.svelte`),
  which makes a pack of that page alone (`apps/web/src/lib/market/template.ts`). It goes out as the
  record stores it, never with its rows. **Scrubbing to inputs is automatic and narrow:** every literal
  in a filter that names something of this record (a row, a person, or a project on its scope field)
  becomes a text setting read back as `{{config:<key>}}`, its default the literal, so the pack installs
  and draws as it does here and whoever installs it picks their own at `/packs/<id>`. One literal used
  in three filters is one setting. `requires` names the lists the page reads, on the page and, on the
  manifest, the installed packs holding them. The sheet shows what the pack adds and calls out to and
  the page's headings as drawn now, then Download or Publish.
- **A use case shared.** `/packs/share` writes the file with the record (`exportUseCase`, which writes
  nothing), says what it changes against the version it counts on from, draws it as Browse would offer
  it, and has Download and "Publish to the Kennel" (`apps/web/src/lib/market/publish.ts`).
- **An add-on written by hand**, with the terminal: `braindog pack new`, `check` (the install-time
  checks in a scratch record, plus a warning on any manifest key outside `MANIFEST_KEYS`), `test` (the
  rows in its `.test.json` against its expectations), `preview` (a scratch BrainDog serving it) and
  `publish` (`apps/cli/src/catalogue.ts`, `scratch.ts`, `kennel.ts`). `brain.dog/build` walks it
  through (`apps/site/src/routes/build/`).

**Versioning is computed, as the table says, and enforced where a version is published**, not chosen
from a read-only field. `changesBetween` in `packages/declare/src/catalogue.ts` classifies a change:
taking away a list, a page, a module or a field a record may hold rows in is major; adding a
declaration, a module or a host it calls out to is minor; anything else, a changed page or rule or
only words, is a patch. Publishing a
version bumped less than its changes need is refused with the version to use instead, in a folder
and at the Kennel alike, and `braindog pack diff` and `usecase diff` say the least bump before
anything is sent. `/packs/share` offers the next patch or minor after the version last shared.

**Publish** sends the file to the Kennel as the signed-in person, and the answer is "listed" for a
trusted publisher or "waiting for review" otherwise ([14-KENNEL](14-KENNEL-AND-COMMUNITY.md) §1). The
file is still the artefact, and installing still takes an address, a git ref, a file or a paste
([04-PACKS](04-PACKS.md) §3).

**The install side**: an installed pack pins its version, and an update is the same plan an install
is, drawn on one plan sheet with every setting kept or reset said (`apps/web/src/lib/market/PlanSheet.svelte`).
"Update all" at `/packs` reads every plan first, shows them on the one sheet, and installs them in
order on one press (`apps/web/src/routes/packs/+page.svelte`). Uninstalling keeps every row
([04-PACKS](04-PACKS.md) §4); the "keep or delete the rows" question and "take control" are not built.

---

## 10 · Progressive disclosure

| Rung | Believes they are… | Surfaces | Door up |
|---|---|---|---|
| **R0** | adding a row | register list, row form, search | — |
| **R1** | tidying | reorder, sort, save-a-view, pin | `+ Add field` appears on a register you own |
| **R2** | adding one thing | field/block/rule adders, predicate namer | a third R2 action unlocks `New page`, `New register` |
| **R3** | building | page, register, ingest, theme, dialect, query, block editors | a third local declaration reveals `Make a pack` |
| **R4** | shipping | pack builder, publisher, validator | — |

R1 is the rung most users will live on forever: same UI for a beginner and an expert, no mode, no
publish step, cheap enough to be disposable.

### Six mechanisms

1. **No "advanced mode" in settings.** The ladder is driven by what you touch. One preference exists
   — `Author tools`, off by default — for people who already know.
2. **Escalation is in-context, always the last item in a picker, and nowhere else.** The field-type
   grid has no escape hatch because the type list is closed. **A fake escape hatch that opens a
   dialog saying "not possible" is worse than none.**
3. **The pack builder is invisible until it has something to export.** A menu item that opens an
   empty screen teaches people the tool is empty.
4. **A wizard may create; it may never be the only way to change.** Register creation runs a 3-step
   wizard *once*; editing it is the plain two-pane editor forever after. **Experts fight wizards
   because wizards reappear on edit** — that is the actual complaint.
5. **The palette is the expert's ladder-skip.** `page: renewals → text` lands directly in the text
   lens of any declaration.
6. **Keep the cheap deterministic path, always.** This is the hardest-won lesson in the survey, from
   Retool's 2026 AI-only builder — which produced the sharpest backlash in the dataset not because
   the AI is bad but because **removing the cheap path made every small change expensive**:
   pay-per-edit credits (*"I ran out of credits so I can't have the agent resolve it for me"*), no
   non-AI editing path, no diff before publish. The constraint is one user's sentence: *"The classic
   builder worked well because it served both non-developers and developers: you could use
   drag-and-drop for speed, then add custom logic only where necessary."*

**AI is a rung-skipper that does not teach a different tool.** `Describe it` exists on every surface
and always writes into *the current rung's controls*. It never opens a surface the user has not seen,
and never replaces a control with a chat box.

---

## 11 · Safety

**A draft layer.** Every authoring surface writes to a per-account draft overlay keyed by
declaration id; reads resolve draft-over-live **for the author only**; drafted pages carry a `●` in
nav. `Discard` is one click and total.

**Nothing applies without a diff, and the diff states its blast radius:**

```
Publish Renewals
  page renewals     NEW
  register domains  +1 saved predicate ("overdue")
  Affects 2 pages, 1 rule, 1 digest.               [ See ▸ ]
```

That line comes from the dependency graph. It is the only sentence most people read, so it must be
the true one.

### The dependency index ships BEFORE the reuse feature

Every product surveyed has a coupling that leaked, and in every case the missing artifact was an
index:

| Product | What leaked |
|---|---|
| **Airtable** | record-detail pages silently shared across interfaces — *"I see it replicated into ALL existing interfaces"* — and a real user **exposed data to the wrong audience** |
| **Grafana** | library panels corrupted by a schema change; a missing variable writes `panel-NaN` and makes the panel uneditable |
| **Metabase** | downstream-break warnings exist and are **paywalled**, which is exactly backwards. The ask names the gap: *"Changing one requires knowing exactly where it's used, but Metabase doesn't provide an easy way to see all dashboards linked to a question"* |

So: a schema-review surface with search and a **filter by dependency class** — show me every field
used by pages / rules / metrics / ingests / digests / packs — plus `Find usages` on every
declaration, which is a tree walk because references are structured nodes.

### Undo is the primary safety story

Every applied change is one entry in a **Changes** log: declaration id, before, after, who, when,
and source (`you` / `agent` / `pack invoices-egypt 1.2.0`). Revert is one click and is itself a
logged change. Declarations are small text objects — **keep every version forever.**

> **This replaces confirm dialogs; it does not supplement them.** Confirm dialogs train people to
> click through. A reliable undo does not, and it is the only mechanism that survives an agent making
> a mistake at 3am.

### Notes are first-class fields, not comments

Home Assistant 2026.6 added a notes field to every trigger, condition and action, and — the
structural part — **notes travel with the automation when you duplicate, export, or share it.**
Airtable formulas **still have no comments after six years**, and the community's documented
workaround is abusing a truthy string literal as a pseudo-comment.

**Make notes a field, not a YAML comment.** They then survive copy, export and pack-ification because
they are data.

### The structural guards

Enforced at write time, identically for UI, API and MCP (A12):

| Guard | Presented as |
|---|---|
| field keys immutable | rename is a migration with a diff |
| type change | refused in v1 — `FIELD_TYPE_CHANGED`, retire and add ([04-PACKS](04-PACKS.md) §5); the conversion preview, every unconvertible row resolved, is authoring-tier scope |
| delete while referenced | blocked; referents named and linked |
| index budget 8, field cap 64 | **meters that fill; the control disables at the cap** |
| predicate depth 3, blocks per page 24 — the caps table of [02-DATA-MODEL](02-DATA-MODEL.md) §5 | counters on the `+` buttons, greyed at the limit |
| `secret` never holds a key | write refused |
| theme contrast | refused, with `Fix and install` |
| closed-list membership | **the control cannot express a non-member** |

**Caps are counters, not discoveries.** A user who learns about the 8-index budget by hitting an
error has been failed.

And one line that matters more than all of them for a self-hostable product: **`Export everything`**
produces the YAML of every declaration plus the data, as one button. It should never be a support
request.

---

## 12 · The ten anti-patterns

| # | Failure | Countermeasure |
|---|---|---|
| **1** | **The config UI cannot express what the format can** — and the mirror, the UI expressing what the format cannot. Real instances: **Notion permits 3 levels of filter nesting and its own API caps it at 2**; n8n's Filter node forbids mixing AND and OR; Airtable's automation conditions cannot nest at all | generate every form from the parser's schema (A7); a CI test enumerating every grammar node **and** every control; **per-node raw fallback**; a corpus test over every live declaration and every published pack; and when a construct repeatedly falls to the raw row, **extend the control vocabulary** |
| **2** | **Two sources of truth for one artifact.** Grafana is the case study: `allowUiUpdates: false` is a dead end whose exit is copy-paste-by-hand; `true` means the provisioner overwrites you. Its own verdict: *"Users see one dashboard. Implementers maintain several coordinated pipelines"* | **one model.** Text is a lens, not a copy. One canonical printer, deterministic and idempotent, with round-trip property tests. **The word "sync" does not appear in the product** — if it would, the architecture is wrong |
| **3** | **The one-way door.** Every product surveyed has one and regrets it: Metabase GUI→SQL (*"Metabase cannot parse SQL"* — unfixable by construction), Home Assistant "take control", Grafana schema v2 (*"can't be migrated back"*) | put the boundary between *structured* and *opaque* as late as possible. If an advanced tier is needed, make it a **richer structured language**, not a blob. If an escape hatch is unavoidable, **wrap** the opaque thing rather than replacing the structured one |
| **4** | **Silent semantic change, and lossy conversion without a preview** | A9: **refuse and say why, never approximate.** The only permitted rewrite provably preserves meaning. Every data-touching change is a preview with per-row outcomes that must be resolved |
| **5** | **AI without a reviewable diff — or AI as the only path** | AI writes into visible controls (A10); **approval per item, top to bottom**; `3/3` evidence rather than a score; live counts before arming; dry run; holding tray; and rule 6 of §10 |
| **6** | **A preview that lies** — or no per-step preview, so the user cannot see where intent diverged | one renderer, lint-enforced (A3); real data by default, seeded shapes otherwise; **per-step preview** and **mute-in-place** on every pipeline; visual regression over the full specimen |
| **7** | **Reuse without a dependency index** | **ship the index before the reuse feature.** `Find usages` everywhere; version-pinned derived kinds; instance counts visible wherever reuse is offered |
| **8** | **The nested-boolean cliff** — either one level only, or depth-5 trees nobody can read a week later | depth cap 3, **greyed at the limit**; identity-preserving flattening; `Unwrap` everywhere; word quantifiers; live count, `Nearly matched`, relax chips; **named composition instead of depth 4** |
| **9** | **Pack rot** — the author's phone number shipped, unpinned inheritance, no changelog, no bulk update, ids that move | scrub-to-inputs; computed semver; version pinning plus an input-schema hash; diff-and-confirm; bulk update from day one; fresh-account validation; immutable published versions; ids are stable forever and a rename is refused (`ID_RENAMED`, [04-PACKS](04-PACKS.md) §5) |
| **10** | **The rule storm** — 400 firings overnight. Erodes trust in automation faster than any bug | dry run over 30 days with counts; **hard refusal above 20 notifications** without a confirmation naming the number; per-rule rate cap; explicit order with `stop`; the rule trace on any row |

**Three honourable mentions.** **Empty first-run** (countermeasure: seeds everywhere, real-data
previews, the pack builder hidden until it has something to export). **Role sprawl** — 200 theme
roles nobody understands (countermeasure: the role list is closed, each role has a four-word job,
and adding one is a change to the app). **Comments as an afterthought** (countermeasure: §11).

---

## 13 · Open questions, and what would settle each

| Question | The test |
|---|---|
| Do generated predicate candidates cover enough real page-building, or does everyone hit `Something else…` immediately? | instrument the picker. Share of blocks whose predicate came from a candidate. **Below 60%, the generator is too weak** and needs field-*pair* candidates (`unpaid and overdue`), not single-field ones |
| Header quantifier + passive echo, or between-row selectors? | five-task test, 8 non-programmers: **read a 3-condition mixed tree aloud**, then edit it. Measure read-accuracy and edit-error, **not preference** — preference will pick between-row selectors; accuracy is what matters |
| Do seeded synthetic rows in the block picker help or mislead? | A/B real-data-only vs seeded on a record with an empty register. Metric: insert-then-delete-within-30s |
| Is depth 3 right? | parse every predicate the AI writes over 60 days. If >2% need depth 4, the answer is **named composition**, not a higher cap |
| Do the extractors cover real invoice and renewal email without regex? | **50 real messages across 10 vendors**, closed set only. If it fails, the right addition is more anchor *kinds* (table cell, label-adjacent, nth line), **not regex** |
| Does the block editor need to exist in v1? | ship `Save as a kind` only and count requests. If the built-ins plus derived kinds cover the first 20 published packs, the full editor is v2 |
| Should a pack be able to add theme roles? | almost certainly no. The test: if three published themes want a role the app does not draw, **the app** is missing a role |
| Does an English restatement of the predicate reduce query errors, or is it decoration? | show it to half of new authors. Measure predicates edited within 5 minutes of first save |

---

*Next: [23-ASSISTANT-UI](23-ASSISTANT-UI.md).*
