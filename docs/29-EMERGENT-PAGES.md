# 29 · Pages and headers created as you go

> *"I need to make sure that the page headers are created as you go."*

[06-PAGES](06-PAGES.md) declares pages up front, in a pack. This document is about the other half:
structure that **appears as the record fills**, rather than sitting on day one as empty scaffolding.

The ask is satisfiable in full. But the research turned up something that changes *how*, and it is
worth leading with.

---

## 1 · The uncomfortable finding

I went looking for products that create navigation from data volume. **Essentially none do.**

| Product | What actually happens | Auto-creates nav? |
|---|---|---|
| **Notion** | an inline database appears in the sidebar as a subpage of its container — automatic by *containment*, not volume. Views are always user-created | no |
| **Airtable** | fields created inline while typing, types detected on paste. Interfaces are manual — except Omni and Cobuilder, which generate **from a prompt** | no — on request |
| **Linear** | filters are ad-hoc; a filter becomes a view by an explicit *New view*; a view reaches the sidebar **only by favouriting** | no |
| **Obsidian Bases / Dataview** | a `.base` is a note the user creates; neither touches navigation | no |
| **Coda** | pages, tables and views all user-created | no |
| **Retool** | generates an app from a table — a one-shot scaffold, **on request** | no — on request |
| **Basecamp** | per-project tool toggles via *Set up tools*. Explicit, and the change is shared | no — opt-in |
| **Metabase X-rays** | **auto-generates a whole dashboard from a table's field types** — and lands it in a separate *"Automatically generated dashboards"* collection, real only when the user clicks Save | **proposes, does not place** |

### The evidence against automatic navigation is measured, and it is old

**Findlater & McGrenere, CHI 2004** — a controlled study, 27 subjects, three split-menu conditions:

| Condition | Result |
|---|---|
| **Static** — the 4 most-used items pinned | **fastest** |
| **Adaptive** — the system promotes 2 frequent + 2 recent | slowest |
| **Adaptable** — the user promotes items themselves | ≈ static, **except** when it ran first, where it was as slow as adaptive |

Three conclusions, and the third is the subtle one: the system must not reorder; a user-arranged nav
costs nothing in speed; and **there is a learning cost to arranging**, so the default must already
be good and promotion must be one click rather than a configuration session.

**Microsoft shipped the other thing and withdrew it.** Personalized Menus hid infrequently-used
commands and promoted by usage, from Office 2000. Jensen Harris announced the reversal on
**2006-01-20** — *"we have officially flipped the switch to turn off Personalized Menus by default
for all apps in all future builds of Office 12."* The stated reasons:

| Reason | Consequence here |
|---|---|
| *"the menu may change in complex and unpredictable ways with new items appearing and underused items disappearing for no visible reason"* | nothing appears or vanishes without a user action |
| *"menu items could be found at different distances down the menu each time"* | promotion appends to a section end. It never inserts mid-list |
| **feature discovery got *worse*** — *"when Adaptive Menus failed to catch on, Office had a problem — people weren't finding and using the new features"* | **the counter-intuitive one.** Hiding things to reduce clutter *reduced* discovery. This is the argument against auto-hiding a stale entry |

No telemetry was ever published — a commenter asked for the disable rate and got no answer. So this
is strong qualitative precedent **from the team that shipped it and measured it internally**, not a
public dataset. It is treated as such.

**Normative backing:** WCAG 2.2 **SC 3.2.3 Consistent Navigation (AA)** — *"Navigational mechanisms
that are repeated on multiple pages … occur in the same relative order each time."*

### And two beliefs worth discarding

**The "seven items" fear is a myth.** NN/g is explicit: *"It's a common misconception that limited
short-term memory implies that menus should be similarly limited to 7 items… users don't have to
memorize the full list. The entire idea of a menu is to rely on recognition rather than recall."*
**A forty-entry nav is not bad because forty exceeds seven. It is bad because it is unsectioned,
unranked and unstable** — three fixable properties, and the fix is not a cap.

**Notion's sidebar graveyard is not this problem.** The critiques describe stale docs and ghost-town
sidebars — a *lifecycle* failure of unbounded **user-created** pages, not of automatic creation.
Reassuring, and worth saying: the feature proposed here is not the one that did that.

**For emergent structure itself there is no measured evidence at all.** Progressive disclosure is
real and useful, but Nielsen's article on it contains no quantitative findings, and it is about
*deferring* options rather than *creating* them.

---

## 2 · The design: propose, do not place

> **The emergent thing is the PAGE. The header is DERIVED. The nav entry is a PROMOTION.**

Metabase's split is the only shipped design that gets both halves right — generate freely into a
quarantine, become real on one click. **And BrainDog already has the quarantine**:
[19-INTERFACE](19-INTERFACE.md) §3's holding pen, *"2 new pages from estate — review · Nothing was
placed."*

So the ask is met in full without a single nav entry ever appearing unasked.

| Tier | Exists when | In nav? | Who decides |
|---|---|---|---|
| **Derived** | a register exists | already — `/r/<id>` is a spine surface | nobody |
| **Proposed** | a trigger fires | **no** — one line in the holding pen | the system proposes |
| **Placed** | the user promotes, or a pack declares it | yes | **the user, always** |

Movement is forward-only and needs a user action. That single rule is what makes the whole feature
safe:

> **The system never writes nav order after first install.**

---

## 3 · The triggers

| # | Fires when | Threshold | Produces | Evidence |
|---|---|---|---|---|
| **T1** | the first row is written to a register with no placed page | **1 row** | a proposed page: derived header, one `table`, one `stat` if a numeric field exists | **strong.** [06-PAGES](06-PAGES.md) §1 already requires *"a page cannot appear without its data"*. One real row is exactly when a screen stops being scaffolding |
| **T2** | a saved view is opened repeatedly | **5 opens / 14 days** | a proposed nav entry for the view | **weak — chosen.** Mirrors Linear's favourite-to-promote |
| **T3** | the same `where:` is **re-typed**, not re-opened | **3 times / 30 days** | a proposed **saved view**, not a page | **weak — chosen, but the most defensible.** The user literally retyped the filter; `⌥V` already names one. The trigger offers a keystroke they did not know existed |
| **T4** | a register crosses the scannability boundary | **300 rows** | a proposed **grouping** on the highest-cardinality indexed enum, **inside the existing page** | **medium** — reuses [22-FRONTEND](22-FRONTEND.md) §4's *measured* render-strategy boundary rather than inventing a number |
| **T5** | a field is non-empty on ≥80% of rows | 80%, min **20 rows** | a proposed column in the default projection; a filter chip if indexed | **weak — chosen.** 20 is the floor at which a percentage means anything |
| **T6** | a metric exists whose `source` is this register | **1 metric** | a `stat` cell in the header's figure row | **strong.** [08-METRICS](08-METRICS-AND-ANALYTICS.md) refuses a metric without `target` and `window`, so if one exists somebody said this number matters |

Every weak threshold carries an instrument and a kill criterion: **log promotions, and at 90 days,
if fewer than 40% of a trigger's proposals are accepted, the trigger or its number is wrong.**

### Explicitly not triggers

| Rejected | Why |
|---|---|
| row count crossing 10 / 50 / 100 | arbitrary, and it makes the product a function of how busy your month was. Two people doing identical work get different apps |
| time since install | rewards nothing the user did |
| **how often you visit a page** | **this is Office Personalized Menus.** Measured, shipped, withdrawn |
| anything that **removes** a placed entry | Office's third finding: hiding reduced discovery |

---

## 4 · Stopping it, and the two failure modes

All verbs in one context menu, reachable by `⇧F10` — [19-INTERFACE](19-INTERFACE.md) §3 already
requires that for **SC 2.5.7 Dragging Movements (AA)**.

| Verb | Effect |
|---|---|
| **Promote** | proposal → placed, **at the end of its section**, never inserted mid-list |
| **Rename** | the display label only. **Never the id** — a spoken id is stable forever, and `#125` in a note must keep resolving |
| **Pin** | above the section separator, in the user's order |
| **Dismiss** | discarded, **and that trigger is disabled for that register permanently** |
| **Never suggest here** | disables every trigger for that register |
| **Settings → Navigation → Suggest new pages: off** | one global switch, the same shape as `Character keys: off` |

> **Dismiss must be terminal.** A proposal that returns is worse than one that never appeared: it
> teaches that dismissing does nothing, which is how a holding pen becomes a badge nobody reads.

### (a) Nav that reshuffles, so muscle memory never forms

| Guard | Already existed? |
|---|---|
| the system never writes nav order after install | **new — this is the rule** |
| proposals land in the holding pen; nothing moves | yes |
| promotion appends to a section end | **new** |
| re-showing a hidden item restores its **stored** order, not the end | yes — the Backstage bug, fixed in advance |
| `g 1`–`g 9` address **positions in the user's order**, not names | yes |
| the spine — Home, Decide, Inbox — is never extensible | yes |

The `g`-chord design is the strongest protection here and it was built for the *pack* problem. It
generalises for free: **even a promotion cannot steal a chord, because the chord addresses a
position the user controls.**

### (b) Nav that grows to forty entries

Not a memory-limit problem. Four mechanisms, in the order they bite:

| # | Mechanism |
|---|---|
| 1 | **Sections**, already the model. Forty entries in six sections is a directory; forty flat is a junk drawer |
| 2 | **A soft cap at 12 placed entries.** On the 13th promotion the dialog names the entry not opened in 60 days and offers to hide it. **It never hides anything itself.** 12 is *chosen* — roughly where a 900px sidebar starts scrolling. Instrument: sidebar scroll events |
| 3 | **A hard cap of 24 proposals** in the holding pen; new ones **displace the lowest-ranked rather than appending**, reusing the mechanism [19-INTERFACE](19-INTERFACE.md) §8 already specifies for suggestions |
| 4 | **The command palette.** Above ~12 entries, recognition-scanning loses to typing, and every nav target is already reachable by `⌘K` |

**And one thing nobody asks for: never propose removal, but always surface staleness.** A placed
page whose register has had no write in 180 days gets a dim `·` and a line in Settings → Navigation.
Not hidden, not badged, not moved. Notion's graveyard is a lifecycle problem, and Office proved that
hiding to declutter destroys discovery. **Visibility, not automation.**

---

## 5 · Header derivation

A header carries **title · count · primary action · filters · state.** All of it derives from the
register declaration.

| Element | Rule | Note |
|---|---|---|
| **Title** | `page.title`, else `register.name` | **never `register.id`.** `obligations` is an identifier, not a title. Absent `name`, the validator refuses at install |
| **Subtitle** | omitted — unless bound to a saved view, where it is the view's name, which the user typed | never generated prose |
| **Count** | `n` unfiltered, **`n of N`** filtered, and it includes example rows **and says so**: `12 of 40 · includes 1 example` | silently excluding example rows reproduces [19-INTERFACE](19-INTERFACE.md) §6's exact bug — a figure reading zero directly above a table with a row in it |
| **Primary action** | `New {register.one}`, bound to `n`, iff the caller can write | **`one:` is the register's singular, from [02-DATA-MODEL](02-DATA-MODEL.md) §5.** Do **not** singularise algorithmically: English heuristics fail on `people`, `fx`, `series`, and this product ships Arabic, where the rule is not a suffix. Ask for the word; warn if absent; fall back to `New row` |
| | **no primary action** if the register contains a `secret` field | reveal is deliberate and audited. A header button is not deliberate |
| | **`Export`** if the register is read-only to this caller | degrade capability rather than hiding it |
| **Filters** | **indexed fields only**, declaration order, capped at 8. `enum`→chips · `bool`→toggle · `ref`→picker · `day`→range · text→the search box (`matches:`, FTS5 over the register's `search:` fields) | **a non-indexed field never becomes a header filter.** A filter that table-scans is a filter that times out on the 500-row page it was added for — refused at render, not styled away |
| **Sort** | the page's `order:`, else the first indexed date descending, else `seq` descending | quantities and dates align end; text and refs align start |
| **State** | always three: **staleness** (machine-readable `datetime`, relative rendering, absolute on hover), the **offline chip** shown only when offline *and not revalidating*, and the **provisional count** when above zero | *"a surface showing nothing must never be indistinguishable from a surface with nothing to show"* |
| **Figures** | one `stat` per metric whose `source` is this register, capped at 3, each rendering value · target · window | a metric without a target cannot reach a header, because it cannot exist |

### What T1 writes

An emergent page is a **normal page row** — which is what makes it editable, diffable and
shareable. **`origin`, `derived_from`, `placed` and `header:` are the new page keys**
([06-PAGES](06-PAGES.md) §1.1), and `origin` is what makes §6 solvable. *An earlier draft said `origin`
was the only new field while the example below introduced three more.*

```yaml
page: domains
title: Domains                     # register.name
origin: derived                    # derived | person | pack
derived_from: register.domains
placed: false                      # in the holding pen, not in nav
requires: [register.domains]

header:
  count:  { source: register.domains }
  action: { kind: new, label: "New domain" }     # register.one: domain
  filters:                                        # indexed fields only
    - { field: registrar, control: chips }
    - { field: renews,    control: range }
  search: [name, notes]                           # register.search
  state:  [stale, offline, provisional]

blocks:
  - kind: stat                                    # T6
    heading: Renewals
    cells: [{ metric: renewals-90d, label: Due in 90 days }]
  - kind: table
    source: register.domains
    columns:                                      # T5 fills this over time
      - { field: name,      label: Domain, link: true }
      - { field: renews,    label: Renews, align: end,
          tone_when: { before: "+30d", tone: warn } }
    order: [{ field: renews, dir: asc }]
    empty: "Nothing recorded yet."      # "n hidden by the filter" is the block's own line when a filter hides rows
    limit: 50
```

Every rule reads only from declarations that already exist. **No new schema, and no inference from
row content.**

---

## 6 · When they conflict

> **User > pack > derived. Always, with no exceptions.**

| Conflict | Winner | What the user sees |
|---|---|---|
| the user dragged the nav; a pack update changes `nav:` | **user** | nothing moves. The diff is visible on the pack's page |
| a pack declares `page.domains`; T1 had proposed one **the user never reviewed** | **pack**, and the proposal is withdrawn **silently** | one line in the install diff. Silent is right — nothing of theirs is lost |
| a pack declares `page.domains`; the user had already **promoted** the derived one | **the user's page keeps its slot; the pack's lands in the holding pen** | `estate has its own Domains page — compare · replace · keep mine.` **Three buttons, no default** |
| the user edits a derived page | it becomes `origin: person` and stops re-deriving | badge: `Yours` |
| the user edits a **pack** page | **fork per block, never per page.** The edited block unlinks and badges; the rest keep receiving updates | the pack's newer version stays available as a visible diff |
| two packs both provide `page.domains` | **refuse the install** | the existing conflict refusal, naming both packs |
| a pack is uninstalled and its register goes too | both pages leave nav | *a page cannot appear without its data* |
| a pack is uninstalled but the **register stays** | the pack page leaves; **T1 re-proposes** | `Domains lost its page when estate was removed — a basic one is ready.` |

### The rule that makes it legible

**A page's origin is visible on the page, in one word, always.** `Derived` · `From estate` ·
`Yours`. Not a tooltip, not a settings screen. It is the only way anybody can answer *"why is this
here, and who can change it?"* — and config-driven UI dies precisely when position and behaviour are
indistinguishable in a diff.

---

## 7 · Accessibility of a UI that changes shape

WCAG 2.2, W3C Recommendation 2024-12-12. Levels verified: **2.4.6 is AA**, **2.4.10 is AAA**,
**3.2.6 Consistent Help is A**.

| Concern | Criterion | Rule |
|---|---|---|
| nav order must be stable | **3.2.3 Consistent Navigation (AA)** | the system never reorders; promotion appends. **This SC is the normative reason for the whole propose-don't-place design, and it belongs in the code comment** |
| same thing, same name | **3.2.4 Consistent Identification (AA)** | a derived page and a pack page for one register must not both be "Domains". On conflict the pack's is `Domains (estate)` until resolved |
| a new region must be findable | **1.3.1 (A)**, **2.4.6 (AA)** | every emergent section is a `<section>` with `aria-labelledby` on a real heading. The holding pen is `<nav aria-label="Suggested pages">` — **a second nav landmark needs a unique accessible name or the landmark list is useless** |
| announcing a proposal | **4.1.3 Status Messages (AA)** | `role="status"`, **debounced**, on the **counter only**. Never `role="alert"` — a proposal is not urgent, and ten assertive announcements is a denial of service on a screen-reader user |
| never `aria-live` on the nav container | — | it announces the entire navigation on every change |
| focus must not move | **3.2.5 (AAA)**, met by choice | a proposal never moves focus, never opens a dialog, never steals the caret. If focus is in a form, nothing renders until blur |
| focus must survive a nav change | **2.4.11 Focus Not Obscured (AA)** | **if focus is inside the nav when the nav changes, focus stays on the same *element*, not the same index.** Key the focus store by page id, never by position — the same bug as the ordering one |
| skip links with a dynamic nav | **2.4.1 Bypass Blocks (A)** | one skip link, one static `#main` target, always present. It must **not** enumerate sections: *a bypass mechanism that changes shape is not a bypass mechanism* |
| landmarks | 1.3.1 | three `nav` landmarks is fine; three **unlabelled** ones is not |
| reorder without a mouse | **2.5.7 Dragging Movements (AA)** | `⌥↑`/`⌥↓` plus Move up / Move down / Move to top / Hide |
| target size | **2.5.8 (AA)**; 2.5.5 (AAA) by choice | Targets are designed at 44 × 44 CSS px (SC 2.5.5 AAA, by choice — SC 2.5.8 AA's 24 × 24 is the legal floor) through an invisible hit box; CI measures every control under a coarse pointer, counting `::before`/`::after`, and fails below 43.5 × 43.5 on either axis. The promote/dismiss controls are the easy place to fail — a 20px chevron in a 28 px compact row; a control grown only in height measures 38×44 and fails |
| the announcement text | — | *"1 suggested page."* **Not** *"Domains was suggested because you added 1 row and the register has an indexed date field."* A control gets a label and what to do — never the reasoning or an internal metric |

---

## 8 · What is refused

| Refused | Why |
|---|---|
| **auto-placing anything in nav** | Findlater & McGrenere measured static faster than adaptive; Microsoft shipped it and withdrew it; WCAG 3.2.3 AA is normative against it |
| **auto-hiding or auto-removing a placed entry** | Office's second finding — hiding to declutter *reduced* feature discovery. Surface staleness; never act on it |
| **a proposal that returns after Dismiss** | teaches that dismissing does nothing |
| **algorithmic singularisation for "New X"** | English heuristics fail, and the product ships Arabic. Ask for the word |
| **header filters on non-indexed fields** | a filter that table-scans times out on the page it was added for |
| **`aria-live` on the nav container** | announces the whole navigation on every change |
| **a skip link that enumerates emergent sections** | a bypass mechanism that changes shape is not one |

---

## 9 · Confidence, stated because most of these numbers are chosen

| Claim | Status |
|---|---|
| T2 (5/14d), T3 (3/30d), T5 (80% / 20 rows) | **low — chosen.** Each has an instrument and a kill criterion |
| the soft cap of 12 placed entries | **low** — derived from sidebar height, not measured |
| T4 at 300 rows | **medium** — reuses a *measured* boundary |
| T1 and T6 | **strong** — both follow from rules the corpus already enforces |
| Findlater & McGrenere effect sizes | **not retrieved.** Design, 27 subjects and the direction of every result confirmed; millisecond deltas were not |
| Microsoft Personalized Menus telemetry | **none published.** Strong qualitative precedent from the shipping team, not a dataset |
| Notion sprawl critiques | **anecdotal** — blog posts, no study |
| progressive disclosure | widely believed; the canonical article contains **no quantitative data** |

---

*Next: [15-ROADMAP](15-ROADMAP.md) — what all of this costs.*
