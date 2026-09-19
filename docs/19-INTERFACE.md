# 19 · Interface architecture

Screens, navigation, the keyboard model, URLs and states. The visual system is
[13-UI](13-UI.md); authoring tools are [21-AUTHORING](21-AUTHORING.md).

---

## 1 · The two-altitude problem, stated once

Everything downstream falls out of one observation. BrainDog has exactly two kinds of surface:

| | **Register** | **Declared page** |
|---|---|---|
| What it is | one typed collection, all of it | many bound queries, arranged |
| Authored by | a `register` declaration | a `page` row |
| Density | 500 rows × 8 columns, one line each | 6 blocks, each a shape |
| Answers | *"what is in here?"* | *"what is my situation?"* |
| Fails by | being unusable at scale | being unreadable at a glance |

They are **the same data at two altitudes**, and the IA is the pair of ladders between them:

- **Down** (page → register): every block header names its source. Focus a block, press `o`, and
  the register opens **pre-filtered to that block's `where:`**. Stripe's *Inspect object* does this
  — it *follows* the curated view rather than replacing it.
- **Up** (register → page): filter a register, `⌥V` names the filter as a saved view — a named
  predicate; `order` stays URL state — and `⌥B` binds that view as a block on any page. Both write
  through `setDeclaration`, so both are the owner's ([02-DATA-MODEL](02-DATA-MODEL.md) §5). Linear's
  ladder — an ad-hoc filter becomes a first-class named object in one keystroke, because **the URL
  is the serialisation**.

Nothing else in this document may break those two keystrokes.

---

## 2 · Screen inventory

**The spine is native code and is never pack-controlled. Everything under "declared" is data.**

### The spine — present in every record, useful on day one

| Screen | Address | Job |
|---|---|---|
| Record home | `/` | What needs you, and what changed while you were away |
| **Palette** | overlay, `⌘K` | The one command surface. Never a page. **Spark** is its fallback row when a model is configured — Spark names the assistant, never the palette |
| Decide | `/decide` | Every open question, ranked by cost of being wrong (§8 risk 6), dearest first, with the band named on each card and on its gate. On a live record the list is the record's open suggestions, read through the client's `governance` call, and an answer is sent with `decide` once its reason is written; with no record behind the host (`UNREACHABLE` or `UNAUTHORIZED`) it draws the sample questions, and any other refusal draws the record's own fix. A `rowset` proposal that updates rows shows each changed field on its card: the render package's diff for a document or long text, and before and after for the rest, drawn the same way from the record's rows or the sample's, whether the proposal names a row by its spoken id or by its internal id. A row it would create is drawn as it was. **Decided** names each decision's option by its label, from the suggestion it settled |
| The gate | `/decide/SG23` | One question, its options, one decider, a mandatory reason. On a live record the question is read by its id through `governance`, and choosing or parking it calls `decide` with the reason; a refusal stays under the button in the record's own words. A `rowset` proposal that updates rows draws **What changes** above the options, field by field, as its card does. A `change` that calls out draws **Calls other services** above the options, the same lines as the Packs diff and the estimate, with one sentence saying accepting approves them and declining runs none; Accept and Decline are that approval. A suggestion no longer open is drawn settled: the option chosen, who decided, when, and the reason, from the decision that settled it. The record keeps no link between the two rows, so the decision is found as the one that recorded an option the suggestion offers, after it opened, oldest first |
| Inbox | `/inbox` | Raw arrivals that matched no pattern, with arrival times |
| Search | `/search?q=` | The structured fallback when the palette's ranked list was not enough |
| Vault | `/vault` | Keys, in three sections in this order. **A request is waiting**, drawn only while one is: pending vault grants by label, with their project or Global and their days (thirty for a project, seven for global), approved through the same six-digit entry and `deviceApprove` Settings uses. **Keys**: the credentials index with a scope chip, sealed or index only, how many times each was opened and when last. **Machines that may open keys**: active vault grants, with Revoke. Never a value, a code or a handle. An agent adds a key with `braindog keys put` and uses one only through `braindog keys exec <label> -- <command>`. The demo draws sample rows under the sentence that it has no account |
| Packs | `/packs` · `/packs/browse` · `/packs/<id>` | Installed · the Kennel · one pack's settings. Every installed card links to **Settings**. `/packs/<id>` is a form generated from `packConfig`: text and money in a field (money's currency printed beside it, from the setting's value or default, and checked for its decimal places), an enum of up to four values as a segmented choice and a longer one as a select, bool as a switch, day as a date, duration as a whole number and a unit. **Save** sends `setPackConfig` with only the values that moved; **Reset** sends `null` for one setting. It says once that a change takes effect the next time the add-on is installed or updated. A pack that calls other services lists each scheduled action in its diff under **Calls other services**, one line each: what it does, the host, how often, the key by label and the fields it sends, then one sentence of the runs a month they add against the hosted 15,000, or with no limit on a self-host, and one sentence that installing asks once and none of them runs until then. **Install** on such a pack opens its plan and says it would ask once to approve those calls; the demo saves nothing and says so. `installPack` takes the plan's `approve` lines in the same press. An add-on with no settings draws no settings section. A refusal naming a setting is drawn beside it and any other under Save; `NEEDS_BROWSER_SESSION` and `FORBIDDEN` also offer **Sign in again**, as Settings, agents does, and send the same values once signed in. The demo draws sample settings for Money and says nothing was saved |
| Settings | `/settings/<area>` | identity · **recovery** · **people & sharing** · agents · ingest · theme · keyboard · **navigation** · notifications · backups · billing · export. **`recovery` and `people & sharing` were missing from an earlier draft** — the first left a passkey-primary product with no designed way back in, and the second left [20-COLLABORATION](20-COLLABORATION.md)'s 5-person × 14-register access matrix with no screen anywhere in 24 documents. `navigation` was missing too: it holds the *Suggest new pages* switch that [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §4 places there. `agents` is three sections, in this order. **Approve a machine** is the six-digit field, the `verification_uri` of every device flow, where a device code or an **operation grant** (one named operation, ten minutes) is approved with `deviceApprove`; a sign-in older than fifteen minutes is sent to sign in again. **Machines** lists `listDevices` by label, what each may reach and when it was last seen, revoked by handle and never showing a code. **Tokens** lists `listTokens` with Revoke, and *Connect an agent* mints a ninety-day write token whose bearer is shown once beside `braindog login <origin>` and the `claude mcp add-json` line. When the agents add-on is not installed, the same *What this adds* plan the Packs screen draws follows it, from `planPack`; with the same **Calls other services** lines and estimate; Install sends that plan's `planHash` to `installPack`, and Not now changes nothing. The approval and Revoke are the functions `/vault` calls. The demo draws sample rows and approves nothing ([12-SECURITY](12-SECURITY.md) §3, §6.1). `export` ends in the danger area: **Delete this record** — `deleteRecord`, re-authentication, the slug typed to confirm ([02-DATA-MODEL](02-DATA-MODEL.md) §9) |
| Usage | `/usage` | Scheduled actions this month: runs, requests, bytes and failures per project and per action, as lists without boxes, and one `bar` per week. It reads `GET /account/usage` for this month first; on a plan with a limit it draws a `gauge` of runs against the allowance, the day it starts again, and, when the plan held a run, that actions are waiting until then. A 404, or no host, falls back to the record's `actions` read, which says nothing about limits. No record (`UNREACHABLE` or `UNAUTHORIZED`) draws the sample; a record with neither read says it does not report usage yet; any other refusal is the record's own sentence. A held action on "Runs on" links here |
| Onboarding | `/start` | Pack selection, then one capture. **Not a tour** |
| Audit | `/audit` | Every write, by whom, against which version |
| **Job** | `/jobs/<id>` | A tier-C run: the route opens the palette in job mode over the shell — never a page. The view polls `jobEvents({ id, after })`; the list is `listJobs` ([23-ASSISTANT-UI](23-ASSISTANT-UI.md) §3.1) |

### Register surfaces — one pair per installed register

| Screen | Address |
|---|---|
| Register list | `/r/obligations` |
| Entry detail | `/r/obligations/7` |
| **Entry peek** | `/r/obligations?row=7` — a 480px drawer, list still visible, for triage. Opened with `p` |
| Saved view | `/v/obligations.overdue` — a register's named predicate ([02-DATA-MODEL](02-DATA-MODEL.md) §5), never a free-form slug |

### Declared surfaces — zero on day one, *n* after packs

| Screen | Address |
|---|---|
| Declared page | `/p/money` · on a project page, under **Runs on**, the project's scheduled actions from the record's `actions` read, then the ones for every project faintly: each with its name, this month's runs, what it does to which host, how often, the key by label, and one sentence (last and next run, retrying, nothing saved, waiting until next month with **See usage**, or paused and why). A paused action offers **Resume**, which sends `resumeAction`; `NEEDS_BROWSER_SESSION` and `FORBIDDEN` also offer **Sign in again**, as Settings, agents does, and resume once signed in. No record draws the sample, whose Kiln key was refused; a record without the read draws no list; any other refusal is its sentence |
| Page source | `/p/money?src=1` — the declaration as diffable text |
| Block focus | `/p/money#b-4` — addressable, shareable, and what an agent quotes |
| Shared page | `/s/<token>` — signed, read-only, **and a landing page** |

---

## 3 · Navigation: a sidebar, and the spine/body split

**A left sidebar above 900 px; a bottom tab bar plus a sheet below it. Rows become cards by default
below 640 px, and size follows the pointer, never the width. Not a top nav **by default**. Not
palette-first.**

A top nav cannot hold a **variable-length, sectioned, reorderable** list — and BrainDog's nav is a
query over `page` rows. A freelancer has four entries; a studio with five packs has eighteen across
six sections. The moment a horizontal strip needs a "More" dropdown, the thing that varies per
customer is the thing that is hidden.

### A shape is a choice, and the sidebar is the default

The paragraph above defeats a top nav as the **default**. It does not defeat one as a **choice**
somebody makes about their own record, and the difference between those two is the whole design.
A nav of four entries in one section on a wide screen is not the nav that argument is about.

| Shape | What it is | Suits |
|---|---|---|
| **Rail** | the left sidebar above, sectioned and arrangeable | the default, and every record with sections |
| **Rail, collapsed** | icons only, names on hover and on focus, full names when it opens | somebody who wants the width back and knows the icons |
| **Top bar** | one horizontal strip, spine then declared entries, overflow into More | a small nav, a wide screen, a person who wants vertical space |
| **Menu** | no persistent nav: one button opens the whole sectioned list as a sheet | the smallest chrome, and anybody who lives in the palette |
| **Tab bar** | the phone shape, spine plus a sheet | below 900 px, where it is not a choice |

Three conditions keep this from being a way to smuggle the rejected default back in.

**The top bar is offered, never defaulted, and it is honest about what it hides.** It states how
many entries sit behind More rather than quietly swallowing them, which is the precise failure the
paragraph above names.

**Below 900 px the tab bar stays, whatever the shape says.** A choice that lets somebody put an
eighteen-entry top bar on a phone is a choice to break their phone.

**The shape follows the person, so it is the record's, not the cookie's** (§5). Whether the rail is
collapsed is per-device in `bd_pref`, because a wide monitor and a laptop honestly want different
answers to that one.

And the design agent **recommends** a shape rather than applying one. It reads what the record
actually has: how many declared pages, how many sections, how many were opened in the last sixty
days, whether the nav has been arranged by hand. It answers with one shape and one sentence of why,
in the holding pen the third rule below already defines: never applied, one click to accept,
Dismiss terminal, and it never writes nav order. It never recommends a shape it cannot justify from
the record, because a recommendation with no reason is an advertisement.

Palette-first is a documented failure, not a style: it inverts recognition over recall, and the
same heuristic set says the quiet part — shortcuts are *"hidden from novice users."* A palette is an
accelerator **over** visible navigation, never a substitute.

```
┌─ SPINE ────────── native. fixed order. no pack may add, reorder or badge it
│  ◇ Home                     g h
│  ◆ Decide            3      g d
│  ▤ Inbox            12      g i
│
├─ YOUR NAV ─────── declared. sections and order from page rows, overridden by the user
│  MONEY
│    Ledger                   g 1
│    Owed to you              g 2
│  ESTATE
│    Domains                  g 3
│  ▸ 2 new pages from estate — review        ← a holding pen. Nothing was placed
│
└─ FOOT ─────────── native
   ⌕ Search · ⧉ Packs · ⚿ Vault · ⚙ Settings
```

### Three rules that stop an ecosystem rearranging your nav

**1 · The spine is not extensible.** Home, Decide and Inbox are the three surfaces whose absence
would make this a different product.

**2 · A pack declares content and identity — never position or visibility.** This is Chrome's line,
stated most plainly of anyone: extension actions are **unpinned by default**, and `isOnToolbar` is
exposed to the extension **read-only**. There is no `default_area` and no auto-pin. Raycast's
equivalent is per-command `disabledByDefault`. Obsidian goes further and forbids a plugin from even
*offering* a competing control.

**3 · Position lives in a per-user store keyed by page id, and it wins.** The store is the
record's — nav order, hidden pages, pins, dismissals and the *Suggest new pages* switch must survive a
change of device, so none of them is a cookie (§5).

| Event | What happens to nav |
|---|---|
| First install | pages placed from the pack's suggestion, in a section named for the pack. A summary line — not a modal |
| Update **adds** a page | lands **hidden**, one line in the footer: *"2 new pages from estate — review."* **Nothing moves** |
| Update **changes** an existing page's `nav` | **ignored entirely.** The diff is visible on the pack's page |
| User hides then re-shows | returns to its **stored order** — never to the end of the list |

That last row is a bug fixed in advance. Backstage documents it verbatim: *"when an extension is
toggled from disabled to enabled through configuration it resets the ordering of the extension,
pushing it to the end of the list."* Store position independently of enablement and it cannot
happen.

### Reorder must not require a mouse

WCAG 2.2 SC 2.5.7 requires it, and its own worked example is a sortable list with *"adjacent
controls for moving the element up or down."* So: pointer drag; `⌥↑`/`⌥↓` to move the focused item;
and **Move up / Move down / Move to top / Hide** in the context menu, reachable by `ContextMenu` or
`⇧F10`.

### On a phone

The declared nav cannot be a tab bar — it varies in length and the user reorders it. So **the tab
bar carries the spine and a sheet carries the data**: Home · Decide · Inbox · More, with the palette
as a *header* button rather than a fifth tab. A command surface in a tab slot looks like another
place to go.

**The gate is a first-class phone surface, not a degraded one** — full-screen sheet, options as
stacked cards, the reason field above the fold. Decisions get made from a phone.

---

## 4 · The keyboard model

### The one architectural decision that makes single letters legal

A keyboard-first app with single-letter row verbs is a WCAG 2.2 SC 2.1.4 problem *by construction*.
The criterion admits exactly three remedies — turn off, remap, or **active only when the component
has focus**. BrainDog ships all three, and the third is structural:

> **Every bare single-letter shortcut lives inside a focused `role="grid"`. The only
> document-level bare keys are `g`, `/` and `?`.**

This buys two things at once:

- It satisfies 2.1.4's focus exception with no settings toggle.
- **It solves the screen-reader collision mechanically.** NVDA and JAWS reserve nearly the whole
  alphabet as browse-mode quick-nav keys — H headings, T tables, B buttons, F forms, K links, L
  lists, 1–6 heading levels — but a **composite widget flips them into focus mode**, which is *"the
  mode where the 'H' key puts the letter H in a text box."* A grid is therefore the only place bare
  letters are safe, and it is exactly where they are wanted.

And a `grid` rather than a `table` for a second reason from the APG: a table is static, so *"each
widget contained in a table is a separate stop in the page tab sequence"*; a grid is composite, so
*"only one of the focusable elements … is included in the page tab sequence."* At 500 rows × 8
columns that is the difference between **one tab stop and four thousand**.

Plus, in Settings → Keyboard: a single **`Character keys: off`** flag that disables the entire
bare-letter namespace while leaving every modifier chord working (GitHub's checkbox — the only
shipped 2.1.4 conformance mechanism found across eleven precedents), and per-binding remap from the
same `?` sheet that documents it. Both are cheap **only if the keymap is a registry the dispatcher
consults**. No screen may bind a key outside it.

### Global

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open the palette. Also bound from inside a text field |
| `/` | Open the palette with the cursor in the query. A **co-equal opener**, which is also the mitigation for `⌘K` being contested in Firefox |
| `g` *then* key | Go to. A sequence, not a chord: 1 s window, visible pending hint |
| `⌘\` | Toggle sidebar |
| `⌘Z` | Undo the last write |
| `⌘↵` | Commit the primary action of whatever is open. **The only commit chord in the app** |
| `Esc` | Close the topmost layer — **one layer per press**, and it stops rather than falling through |
| `?` | The keymap sheet, read from the registry. **`?` is help. It is never "ask the assistant."** |
| `ContextMenu` / `⇧F10` | Row or block menu |

`g h` `g d` `g i` `g s` `g v` `g p` `g ,` → Home · Decide · Inbox · Search · Vault · Packs ·
Settings. And **`g 1`…`g 9` target the 1st–9th item of *your* nav, in *your* order** — so a pack
cannot steal muscle memory, because the chord addresses a position the user controls rather than a
name the pack chose. The sidebar prints the digit beside each of the first nine items, so the chord
is discoverable by looking at the thing it operates.

### Inside a focused register grid

`j`/`↓` `k`/`↑` rows · `←` `→` columns · `Home`/`End` row ends · `⌘Home`/`⌘End` register ends ·
`PageUp`/`PageDown` a viewport · `↵` open · **`p` peek** · `x` select (`⇧x` extends, `⌘a` all) ·
`e` or `F2` edit in place · `n` new · `f` filter · `v` display options · `y` copy id (`⇧Y` copies
the link) · `o` open the related register · `Delete` delete, with an Undo toast.

> **`Space` is listed as *peek* above and as *never bind* in the collision list below, and both were
> in an earlier draft.** Resolved in favour of the collision list: **`Space` scrolls, always.** Peek
> moves to **`p`**, and the trailing chevron on every row carries `p` in its tooltip. Taking the
> page-scroll key inside a 500-row grid is exactly the kind of collision that makes a keyboard-first
> app feel broken to someone who did not read the keymap.

Note what is **absent**: no bare-letter destructive verb. Deletion is `Delete` — the key whose name
is what it does — and it is undoable.

**Peek needs a visible affordance.** Linear's Peek is genuinely good and its own docs admit the
flaw: *"Peek can only be launched with the keyboard shortcut."* Users do not press `?` to discover
what they do not know exists. So every row carries a peek chevron at its trailing edge on hover and
focus, and the chevron's tooltip says `p`.

### On a declared page

`j` `k` move between **blocks** (the focus ring is on the block) · `↵` enter the block, focus its
first row · `Esc` leave it · **`o` open the block's source register pre-filtered to its `where:`** ·
`y` copy a link to the block · **`E` (shift) open the declaration** — *not bare `e`*, which means *edit in place* inside a grid. Page focus starts on a block, so bare `e` there would have opened source code on the first press, which is exactly the scope-dependent-meaning failure §7 refuses from GitHub.

### At the gate — deliberately slower than every precedent

| Key | Action |
|---|---|
| `1`–`9` | **Highlight** an option. Does **not** choose it |
| `↵` | Open the commit step. **Focus moves to the empty, required reason field** |
| `⌘↵` | Commit — only from inside the reason field, only with content |
| `d` | Defer: requires a reason and a wake date |
| `Esc` | Leave. The question stays open. Leaving costs nothing |

**No single keystroke ever commits a decision.** Linear binds `1` accept / `3` decline — correct
for triaging an issue, wrong for an immutable row with a named decider. And **the recommendation is
displayed, never pre-selected**: if it were highlighted on open, `↵ ↵ ⌘↵` would rubber-stamp the
machine's answer with a reason typed under its influence.

### The palette — one surface, two modes, one grammar

`⌘K` opens the palette in *filter* mode. A query matching nothing falls through to a **fallback
row** — *"Ask Spark: <your text>"*, present only when a model is configured — which swaps the body for
**one proposal with its verbs** — never a transcript ([23-ASSISTANT-UI](23-ASSISTANT-UI.md) §3;
nothing accumulates) — while the header, footer, focus trap and every keystroke stay identical. A tier-C
*job* opened from the palette is the one body that is a transcript — of a run, never of a conversation
([23-ASSISTANT-UI](23-ASSISTANT-UI.md) §3.1).
Raycast's *fallback command* mechanism, and the right way to give an assistant an escape hatch. An
earlier draft called the whole surface *Spark* and gave the fallback a transcript; the palette is the
surface, Spark is the row.

Prefixes, and **they work in every mode**: `>` commands · `#` records · `@` people · `/` pages and
registers · none = everything, ranked. And **a bare spoken id resolves directly** — `D41`, `SG23`,
`LN7` — because ids in this product are said out loud and must be typeable exactly as heard. The one
exception is the display default `#`: `#125` never resolves bare, because every register has a `#1`;
type `tasks#125` ([34-GRAMMARS](34-GRAMMARS.md) §4).

`⇥` **completes the query and nothing else.** Raycast rebinds `⇥` to "abandon the query and submit
to AI", unconditionally, even with no text typed — in a search input `⇥` universally means
*complete*, and losing a half-typed query to a chat is a real cost.

Two anti-precedents refused outright: **GitHub's palette has one grammar per mode** (`>` `#` `@` `/`
are inert in command mode, and `⌘⇧K` fast-paths you *into* that mode) — so BrainDog has **no
separate command mode and no second opener**.

**Every palette row prints its key binding on its trailing edge.** This is the highest-leverage
single component in the spec. Superhuman's own words: *"If you don't know a shortcut, just hit
Cmd+K … type in what you want to do. You can see the shortcut for next time."* The palette becomes
the shortcut teacher, the slow path and the fast path are the same list, and there is no cheat
sheet to keep in sync.

### Collisions, concretely

Never bind: `⌘/Ctrl` + `T N W L D P S F G O H J R`, `+Shift+` `N W B O J R Delete`, `⌘/Ctrl+1`–`9`,
`Alt+←/→`, `F1`–`F12`, bare `Space`/`PageDown` for scrolling. Chrome's own extension API is the
honest proxy for what is contestable at all: *"Extension command shortcuts must include either Ctrl
or Alt"*, and *"certain operating system and Chrome shortcuts always take priority … and cannot be
overridden."*

Expose bindings with `aria-keyshortcuts` — but **never as the only exposure**, because AT support is
patchy. The visible `<kbd>` in menus and palette rows plus the `?` sheet are primary.

**One rule that must not be relaxed: never while typing.** One `typing()` test, in the registry,
and no screen implements its own.


### Five mechanics from the predecessor's shell

| | |
|---|---|
| **The toast is armed at 380 ms** | its action button takes no pointer for the first 380 ms, so a mis-tap on something that was just replaced by a toast cannot fire the undo. Undo is pushed **after** the write lands, from the server's returned row — a refused write pushes nothing. Cap sixty |
| **The overlay counts** | `overlays.depth` is a counter, not a boolean, so two overlays closing in the wrong order do not unlock early. `covered()` silences every *unmodified* key, so a modified chord still runs under an open layer and *close* is the `<dialog>`’s own, and the virtual keyboard's height is read from `visualViewport` into `--kb` so a sheet's body is `88dvh − var(--kb)` and the active field scrolls into view |
| **The `g` prefix is armed for one second**, then expires | `g w` is a chord, not a mode. The hint is a `role="status"` line hidden under a coarse pointer |
| **Every plot has a list twin** | the calendar's timeline is bespoke and a screen reader cannot walk a plot. Its month list is the accessible twin — *the list is the essential; the plot is the view* — and a test asserts the list holds at least every event the plot draws — a CI row in [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6 |
| **"Match the system" must stay reachable** | the predecessor's theme has three states and a one-way UI: once a person chooses light or dark, only clearing local storage restores *system*. The theme control is a **three-way segment**, not a toggle offering the opposite |

And on the command palette, which the predecessor's own inventory marks as its **highest bloat
risk**: keep the destinations, the verbs and the objects; the recent-history group, the measured
pill-to-bar bloom and the wide multi-column layout are the first things to leave out for a new
user. Spark's fallback row is absent entirely without a model; **the palette itself is present
whenever the record has one register** — it is how the keyboard reaches everything, not a model
feature.

---

## 5 · URLs

### Real paths, not the hash

One requirement settles it: tier-1 shared page links (`/s/<token>`) are **also landing pages**. A
fragment never reaches the server, so a hash-routed share link can have no server-side token check,
no preview and no crawlable title.

**The drift countermeasure, named so it cannot recur:** one catch-all route to the shell and **no
hand-maintained path list anywhere.** `/api/*` is matched first. If a future change requires
enumerating app paths in two files, that change is wrong.

`/<ID>` is resolved by the shell, not a server 302 — no server renders a request
([22-FRONTEND](22-FRONTEND.md) §2): `[id]/+page.svelte` reads a question (`SG`, `D`) through `governance`
as Decide does and a row through `get({ spoken })`, and `replaceState`s to the canonical address
([50-SPEC-WEB](50-SPEC-WEB.md) §2.2). It reads the sample only when no record answers (`UNREACHABLE` or
`UNAUTHORIZED`). `brain.dog/D41` is a sentence one
person can say to another and a string an agent can emit with no lookup. One resolver, and it is the
cheapest legibility win available.

### What goes where

| State | Home | Why |
|---|---|---|
| Register, record id, page slug | **path** | it is the resource |
| Filters, query, group, sort | **query params**, legible, defaults omitted | it defines *which rows you are looking at* → must be shareable |
| Focused row | `?row=7` | deep-linking a paged list needs a **stable key, never an index** |
| Scheme, text size, density, visible columns, widths, sidebar collapse | the **`bd_pref` cookie** — per device, applied by a hashed one-statement inline script before first paint ([50-SPEC-WEB](50-SPEC-WEB.md) §4.7) | it is about *your eyes*, not the data. Nav position, hidden pages, dismissals and the *Suggest new pages* switch are **the record's** (§3), because they must follow the person to the next device |
| Expanded groups, open drawers, unsaved text | component state | if replaying the URL in a fresh tab should not reproduce it, it is not URL state |
| Saved views | a **server row with a short id** | a named permissioned artifact — the URL carries an id, not 2 KB of predicate |

This split is Linear's, and Linear states both halves: filters are *"reflected in the browser URL…
you can copy the browser address to share the filtered view"*, while *"view options, quick filters
and Insights filters aren't included."*

Rules: **2 KB budget** for a shareable URL (it pastes into chat without wrapping); `pushState` for
discrete intent so Back undoes a filter, throttled `replaceState` for typing (it *"can throw a
SecurityError … if called too frequently"*); `scroll-margin-block-start` equal to the sticky header
on every anchor, or `#b-4` scrolls the block underneath it; **ids are opaque — never parse them**;
and **unguessable ≠ authorised** — RFC 9562 is explicit that UUIDv7 *"MUST NOT be used as security
capabilities."* Every query is scoped to the caller's record. `/s/<token>` is the only capability
URL, and it is signed, scoped to one page and terminally revocable.

**`/vault` carries nothing in its query, ever.** A credential id in the address is an entry in
browser history and in URL-bar autocomplete.

**Three share intents, three controls** (Grafana separates them and is right): *link* (live data,
current filters) · *snapshot* (frozen, timestamped, sensitive fields removed, with an expiry) ·
*export* (the declaration as text). And when a recipient lacks access, show **Request access**
rather than a 404.

---

## 6 · States

### Loading

| Wait | Drawn |
|---|---|
| 0–200 ms | **nothing** |
| 200 ms – 10 s | the **silhouette** of the screen the address bar already names |
| > 10 s | a determinate indicator, and the ability to leave |
| any action > 50 ms | immediate local feedback, always |

The 50 ms rule is RAIL's and it is the one to state: *"For actions that take longer than 50 ms to
complete, always provide feedback."*

**Be honest that the widely-repeated "no skeleton under 200 ms" rule has no primary source.** The
nearest citable threshold is NN/g's, and it is one second: *"Skip skeletons if the page loads in
under 1 second."* 200 ms is defensible here only because it will be measured against this app's own
p50 — and that measurement is owed.

**Skeleton for a known layout, spinner for a single action, progress for measurable work.** Never a
frame-only skeleton (header and footer, no content shape) — it is a distinct documented failure that
risks abandonment. Never a skeleton on a toast, a menu item, a modal or a button.

**Per-block boundaries on a declared page.** A single boundary for six blocks reveals atomically:
*"even if only one of these components suspends … all of them together will be replaced by the
loading indicator."* And `aria-busy="true"` on the region being filled, `aria-live="polite"` on the
destination — **not on the skeleton**, which is decorative — and `aria-busy` must be set back.

### Empty — the section that decides whether the product lives

**Five named states.** Collapsing them into one *"Nothing here yet"* is the failure.

| State | When | The one action |
|---|---|---|
| `no-data-yet` | first run | **Add one** · **Ask Spark** (absent without a model) · *Show me an example* |
| `no-results` | a filter matched nothing — **quote the query verbatim** | Clear filters |
| `cleared` | everything is done. State it positively | **none — do not manufacture work** |
| `no-permission` | a collaborator lacks access | **Request access** |
| `error` | it failed. Say what, once | Try again + a copyable request id |

Copy rules: be **specific about what will be here** when data is there; CTA labels are **Verb +
Noun**, never "Get Started"; the CTA is a real button or link so it joins the tab order; and no
flippant language, especially in an error.

### The canonical first run — and it must work with no model and no packs

**An earlier draft specified the first screen three incompatible ways** across this file,
[06-PAGES](06-PAGES.md) §4 and [13-UI](13-UI.md) §5.1 — one of them putting an autofocused text
field on the same screen as a checkbox list, and one of them making *"the product's core loop"* a
capture field whose typed rows come from **Spark, which [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §2
cuts from v1 and §3 makes absent on every self-host.** A first run that depends on an absent
component is not a first run. This section is now the only specification of it.

*(Amended September 15th 2026 for `DIRECTION.md` §9: one turn precedes screen 1, "Who are you?",
answered in a sentence, deterministic like the screen below, and written directly as the person's own
row in People, with no diff to approve. It is a different question from screen 1's, which stays about
the business, so the two are not merged into one field. `loop/research-modular.md` §2 has the flow.)*

*(Built September 15th 2026. `/start` opens on "Who are you?": one field with the caret in it and four
chips that append words. A quarter of a second after typing stops it says what it heard, "Got it,
you're Sam.", with an edit button, and screen 1 appears under it. Adding screen 1's row also meets
the person: `meet({ name, email, where: 'onboarding' })` on a live record, or a waiting People row
marked *Not saved* on the demo. With People off the name is still said back, no row is written, and
nothing reports that as a failure.)*

*(Built September 15th 2026, turn 2, from `loop/research-modules.md` §5. Under "Who are you?" the
screen asks "What's your business?", answered in a sentence and read by keyword and pattern rules with
no model (`apps/web/src/lib/shape.ts`). As typing pauses, two columns say what was heard and what the
record will hold. **Make my record** turns on the first-party lists the sentence names, with Projects
whenever another list points at it and People whenever turn 1 heard a name; writes only the rows the
sentence fills, so an invoice needs an amount typed with its currency and a day; and meets the person
from turn 1 in the same press. A sentence in another language is declined, not guessed at. Screen 1
below is kept one press away, as "Start from a list instead".)*

*(Amended September 15th 2026. On a live record, a first-party list the sentence names and the record
lacks is now added, not only named: its own pack document is planned and installed with that plan's
hash, every list after the ones it points at (Projects first, and People before Money, since an
invoice is to somebody), and its example rows arrive marked `example`. A list whose plan or install is
refused is said in one sentence, "Money was not added: ...", and nothing is made in it. The demo holds
every first-party list already, so it is unchanged.)*

**Screen 1 — one row, typed by hand.** Not pack selection, not a capture box, not a dashboard.

```
   What do you want to stop forgetting?

   ○ Something I owe, or am owed          → obligations
   ○ A domain or a subscription renewing  → services
   ○ A decision I keep re-making          → decisions

   ─────────────────────────────────────────────────────────────
   A record holds typed rows. Pick one kind and add a real one —
   you can add the rest later, and delete this one.
```

One choice installs **one** register, and lands the user in **the row form for it**, focused, with a
real due date pre-filled to a plausible value they can overwrite. **Their first act is typing one
true fact about their own business**, and it takes under thirty seconds.

Three properties that matter:

1. **No pack vocabulary on screen one.** The word *pack* does not appear until the user goes looking
   for a second register. `register` is defined in place, in one clause, the first time it is used —
   see §9.
2. **No model, no agent, no MCP required.** Everything above works on a fresh self-host with no
   endpoint configured.
3. **Nothing to approve.** Selecting a *pack* means reading an install diff written in the language
   of metrics and nav order ([04-PACKS](04-PACKS.md) §3), and asking a brand-new user to approve
   four schema reviews before they have seen one of their own rows is worse than a tour.

**Screen 2 — the register, with their one row in it, and the second choice offered inline.** Pack
selection lives *here*, after there is something to compare against, and it is optional forever.

**And what happens if they pick nothing:** there is no such state. Screen 1 has no skip, because a
record with zero registers has no legal screen — a defect an earlier draft left open.

**Then, the four mechanisms that survive** — and *survive* is literal: a fifth was written here and
is now deleted, because it was the capture-first onboarding this section's own preamble rejects.
It read *"the first screen after pack selection is a capture… Spark proposes typed rows"*, which is
the mechanism that **depends on a component v1 does not ship and self-host does not have.** It was
listed as surviving in the same section that deleted it:

1. **Onboarding is pack selection, not a tour.** Tutorials *"interrupt users who are attempting to
   do something else … don't tend to be memorable, and they also don't result in better task
   performance"* — the paradox of the active user. `/start` is a choice screen.
2. **Every pack register ships exactly one worked example row, marked `example`** — the value
   `example` in the register's declared `tags` field, so the mark is data and travels
   ([02-DATA-MODEL](02-DATA-MODEL.md) §1; [04-PACKS](04-PACKS.md) §2) — visibly chipped, and
   removable record-wide in one undoable action.

   **It is excluded from digests and notifications, and NOT from the metrics on the page it sits
   on.** An earlier draft excluded it from everything, which produced the incoherent first screen
   with data on it: a money page reading `Due in 30 days · EGP 0 · target ≤ 5,000,000` **directly
   above a table containing one obligation due in 30 days.** Two individually-correct rules, one
   page that looks broken at the exact moment it is supposed to teach.

   So: a metric counts example rows and **says so** — `EGP 5,000 · includes 1 example` — and
   clearing the examples updates it. Nothing scheduled or notified ever counts them, because a
   reminder about a fake obligation is a different and worse failure.
3. **Every empty register offers the agent route**, because the buyer already has agents:

   ```
   Nothing in Domains yet.
   Domains hold a renewal date, a registrar and a cost, so the record can tell you
   what's due in October.

     [ Add one ]   [ Ask Spark to find them ]

     Or from any session:  "read my brain, then add every domain I own with its renewal date"
   ```

   That third line is the unlock: it turns an empty register into a one-sentence prompt for a tool
   the customer is already running. The middle button, *Ask Spark to find them*, is **absent without a
   model** ([23-ASSISTANT-UI](23-ASSISTANT-UI.md) §8); the other two lines are what a fresh self-host
   shows.
4. **Home, in an empty record, shows what it becomes — once**, dimmed, labelled *"This is what Home
   looks like with your data in it"*, dismissed forever on one click. Marked **"example"**, never
   with a sparkle badge: across 13 experiments *"participants trusted people and organizations less
   when their use of AI was disclosed"*, so the badge imposes the cost without buying anything.

### Error, and partial failure

- **One error boundary per block.** Six queries, six independent failures; one broken query never
  blanks a page.
- **A block-level failure announces with `role="status"`, not `role="alert"`.** Ten simultaneous
  assertive announcements is a denial of service on a screen-reader user. Reserve one `alert` for an
  aggregated summary: *"3 blocks failed to load."*
- **Show the failure on attempt one.** A default of three silent retries with backoff means the
  block appears to hang for seconds. Retry once, then render the error with a visible retry.
- **A copyable request id**, always. The client mints an `X-Request-Id` on every call, the host echoes
  and logs it, and that id is what the `error` state shows ([33-CONTRACTS](33-CONTRACTS.md) §4). One
  sentence in the house voice — never a stack trace.

### Offline and stale

- **Never disable features on `navigator.onLine`.** A LAN with no internet reports online; a VPN
  can break the check. MDN: use it *"only to provide hints."* A failed write is the real signal.
- **The offline chip must not cry wolf.** Show it only when offline **and not revalidating** — a
  chip that appears and withdraws on every open is a chip nobody believes the day it is true.
- **Staleness is a timestamp, not a vibe.** A machine-readable ISO `datetime`, relative rendering,
  absolute on hover, and a threshold at which relative flips to absolute. Every block that renders a
  query result carries one.
- **A surface showing nothing must never be indistinguishable from a surface with nothing to
  show.** This is what Stripe's manual *Refresh logs* gets wrong: you fire a request, see nothing,
  and cannot tell "never called" from "list is stale."
- **Do not build a conflict-resolution UI first.** From a team that built several: *"we found that
  users surprisingly rarely encounter conflicts … and that generic resolution mechanisms work
  well."* Compare-and-set on version, re-read, re-present.

### Partial — a declared page where one block has no data

BrainDog's most common state. **Do not hide the empty blocks** — the page's shape is information,
and a page that silently shrinks teaches that blocks come and go. Each empty block renders a *tight*
empty state inside its own frame: one line naming what belongs there, and the register link.
Centring one line in a row of left-aligned ones is worse than not marking it at all.


### The read mark, and *For You*

The predecessor's opening screen answers two questions with no filter: *what needs you* (a due date
that has arrived, an urgent row, an open question) and **what happened while you were not looking**.
The second half depends on one small piece of design that is easy to get wrong:

> **The read mark is one value per person, written with `MAX()` only, and stored outside the
> record's rows.** So a late device can never move it back, and *reading* the record is never a
> *write* to the record — which is what would make every open a compare-and-swap.

`whatsNew()` defaults to it; `boot()` carries the rows since it, capped at sixty with `sinceCapped`
set honestly. The predecessor shipped this and then found its own bug: *"For You had never once drawn
its second half, because the read mark was a closed loop"* — the screen advanced the mark on open,
then asked for everything since it. **The mark advances when the person leaves the screen, never when
it opens.**

### Screenshot mode

A display mode for sharing a screen of a record that holds money and credentials: under
`html[data-shot]`, every figure and every string the record holds is plated and blurred, and the
chrome stays legible. Two properties make it real, and both are tests:

1. **The allow-list is provenance, not pattern.** Only literals a developer typed into source are
   legible. A label built by concatenation at runtime blurs — which is why a toggle's two states are
   two full literals, and why a placeholder must never name a real payee. Pattern-based redaction let
   *"GREEN MARKET"* through once. The list is built, never maintained: `scripts/allow.mjs` collects
   `copy.ts` values, template text nodes and `Kbd` names into a committed `allow.json`, and a gate
   asserts it is exact ([50-SPEC-WEB](50-SPEC-WEB.md) §4.5; [32-PARITY](32-PARITY.md) §9.1).
2. **Layout is byte-identical off → on** — element boxes and page height — and **pixel readback**
   proves that redacted digits re-photographed as `0` and as `8` are identical.

### Save state is announced

The predecessor's save-state dot is `aria-hidden`: saving, saved and reloaded never reach a screen
reader; only failure does, via the toast. **Here, `saved` and `reloaded` reach a polite live region.**
A person who cannot see the dot still needs to know the write landed.

---

## 7 · Precedent — one mechanism to take, one to refuse

| Product | Take | Refuse |
|---|---|---|
| **Linear** | the **promotion ladder** with the URL as its serialisation: filter → URL → named view with an owner and a share link. One object at three levels of permanence, no "save this search" dialog | an interaction *mode* whose only entry point is an unlabelled keypress (*"Peek can only be launched with the keyboard shortcut"*) |
| **Notion** | the record layout as a named module tree: pinned properties, groups, a collapsible details panel — one schema, a glance and a dossier | **layout scoped to the schema, not the view** — *"a page layout will apply to all pages in the database"*, while filter/sort/group are per-view. BrainDog binds layout to the view |
| **Airtable** | the **builder-fixed / user-grantable split**: hard filters the end user cannot change, plus a panel enumerating every end-user power as an individual toggle | the interface as a parallel artifact with a **Publish** step — draft and live diverge until somebody remembers, and the interface holds its own copy of the field list |
| **Obsidian Bases** | the five-key declarative view document — `filters`, `formulas`, `properties`, `summaries`, `views` — with **computed columns and renames living in the view**, not the data | **vault-global property typing**: one property *name* → one type everywhere. Type is scoped to the register, never to the identifier string |
| **Raycast** | `disabledByDefault` per command + strict-prefix aliases that outrank fuzzy matching. **The only verified mechanism that keeps a growing action index from rotting** | rebinding `⇥` to "submit to AI" |
| **Superhuman** | **the palette row prints its own binding**, so the palette trains its own obsolescence | a large unmodified single-character namespace with no off switch — and `?` bound to something other than help |
| **Stripe** | fold the environment switch into the account picker; **degrade capability instead of hiding it** (*"Shell is read-only in live mode"*); encode the environment in the identifier (`sk_test_`) | a logs pane needing a manual **Refresh logs** click |
| **Retool** | serialise config-driven UI to reviewable text with **position in a separate file from logic**, so moving a card and changing its behaviour produce distinguishable diffs | a reuse primitive whose only return channel is string-typed, with one global live version |
| **Vercel** | one canonical identity token per object, rendered on **every** surface that references it | chrome whose activation, visibility and position are all per-user — *"click the thing at the bottom-left"* stops being sayable. **Personalise content, never whether a control exists** |
| **GitHub** | the **Character keys** off switch, and a remappable palette key | scope-dependent meaning for the same key. A key's meaning should be a function of the **object type in focus**, not the page you happen to be on |

**Two failures every one of them shares, and BrainDog can skip both:** layout scoped to the schema
rather than the view, and a **publish or refresh boundary** between the config and reality. If the
view *is* the data, there is nothing to publish and nothing to drift.

---

## 8 · The ten ways this interface most plausibly goes wrong

Ranked by probability × cost. Each with its countermeasure.

| # | Failure | Countermeasure |
|---|---|---|
| **1** | **The record stays empty** and the app reads as a filing cabinet with no files — an empty *typed* register is less legible than an empty notes app, because the columns advertise what you have not done | all four mechanisms in §6: pack selection as onboarding, one `example` row per register counted by its page's metrics and by nothing scheduled, the paste-ready agent prompt, the dismissible preview |
| **2** | **Packs turn the sidebar into a junk drawer** | the native spine; `nav` read once at install and never re-read; position in a per-user store; updates land hidden in a holding pen; re-showing restores stored order; `g 1`–`g 9` target positions |
| **3** | **Spark becomes the only way to do anything** | every Spark output has a deterministic route to the same result and shows it ([23-ASSISTANT-UI](23-ASSISTANT-UI.md) §13); palette rows print their bindings; the `?` sheet reads the registry so it cannot drift; **no mode is reachable only by keystroke** |
| **4** | **Twenty-nine block kinds become twenty-nine ways to look bad**, and agents write prose into drawn blocks | the eight-primitive layer; the visible-fence degradation rule at render (never a write refusal — [13-UI](13-UI.md) §4.1); fixed column positions per kind ([34-GRAMMARS](34-GRAMMARS.md) §2.2) |
| **5** | **Single letters collide with screen readers and speech input** | bare letters only inside a focused grid; `Character keys: off`; per-binding remap; no destructive verb on a bare letter |
| **6** | **The gate becomes a rubber stamp** and the differentiator evaporates | two deliberate acts plus a mandatory reason in an empty field; the recommendation never pre-selected; the third verb (`Defer` with a reason and a date) kept; the queue ranked by cost of being wrong — a band the record **computes** from what accepting the proposal would do (`packages/kernel/src/weigh.ts`), never a field its proposer fills in, because a queue ranked by self-declared importance is a queue in which everything is urgent by the second week. Four bands, worst first: `undo` (changes rows somebody has, replaces a declaration, turns a pack off), `shape` (a pack, its settings, a page), `rows` (adds rows, or a rule that will), `call` (a judgement with nothing attached). Within a band, oldest first |
| **7** | **Spark proposes so much that Decide and Inbox become spam folders** | a hard cap on open suggestions per register, new ones **displacing the lowest-ranked rather than appending**; suggestions expire and self-close with a recorded reason; every proposal must attach the rows it read, and one with none is refused at write time; the count of open questions is a metric on Home **with a target** |
| **8** | **Density fights the phone** | density switches on **pointer, not width**. Targets are designed at 44 × 44 CSS px (SC 2.5.5 AAA, by choice — SC 2.5.8 AA's 24 × 24 is the legal floor) through an invisible hit box; CI measures every control under a coarse pointer, counting `::before`/`::after`, and fails below 43.5 × 43.5 on either axis. A register collapses to the `rows` primitive with its three declared `mobile:` fields — **a declaration, not a media query** |
| **9** | **The URL stops being the state**, killing the tier-1 growth mechanism | Linear's split, enforced; a 2 KB budget past which a view is persisted; one catch-all route and no path list in two files |
| **10** | **A pack update and a user's edits fight, and one silently loses** | **fork per block, never per page** — Grafana's library-panel model is the only *granular* answer found: blocks are linked by default and propagate; editing one unlinks just that block, badges it, and keeps the pack's newer version available as a visible diff. Whole-page take-control is reserved for Home, with Home Assistant's honesty that it is irreversible |

**Just outside the ten, and worth carrying:** the Vault teaching people to store secrets carelessly.
The countermeasure is in [12-SECURITY](12-SECURITY.md) §6 and must not be relaxed — no agent tool
returns a secret, reveal is deliberate and audited, and *the backup benefit and the exfiltration
path are the same object.*

---

## 9 · The vocabulary problem, and the cheapest fix in the design

**This product invents about twenty-five words, and three separate documents forbid explaining
anything** — [21-AUTHORING](21-AUTHORING.md) §1 bans internal metrics on controls,
[23-ASSISTANT-UI](23-ASSISTANT-UI.md) §7 says *"never write a sentence explaining the interface"*,
and §4 above reserves `?` for the keymap. Meanwhile
[17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q2 quotes the exact diagnosis that killed a comparable
product — *"too different, with too many new things to learn, for too little reward"* — and applies
it only to the assistant.

**Applied to the vocabulary, it is the largest unmanaged risk in the interface.** So:

### The rule: one clause, on first use, in place

Eight nouns are load-bearing and get a definition **the first time they appear on a screen** — not a
tooltip, not a tour, not a glossary the user must find. One clause, in the sentence that needs it,
and never again.

| Word | The clause |
|---|---|
| **register** | *a typed collection — obligations, domains, people* |
| **row** | *one thing in a register. It has a number you can say: #125* |
| **pack** | *a file that adds registers and pages. Readable text; nothing runs* |
| **page** | *a screen made of blocks. It is a row, so you can change it* |
| **block** | *one thing on a page — a table, a figure, a note* |
| **tone** | *what a value means: good, watch, wrong, note* |
| **target** | *what good looks like for this number* |
| **window** | *what to compare it against* |

### And the words that must never reach a user

These are internal vocabulary. Where a draft leaked them into UI copy, that is a defect:

`predicate` (say **filter**) · `declaration` (say the thing's own name — *page*, *register*) ·
`projection` (say **columns**) · `ceiling`/`scope` (say **what they can see**) ·
`extractor`/`combinator` (say **how to find it**) · `primitive` (never shown; it is a version
number) · `key` (say **field**) · `required key` (say the field's label).

### One more: `grant` currently names three unrelated things

[02-DATA-MODEL](02-DATA-MODEL.md) uses it for **a credential**,
[20-COLLABORATION](20-COLLABORATION.md) for **a person's permission** (whose table is `member`, not
`grant` — [30-BLUEPRINT](30-BLUEPRINT.md) §1), and `grant.read` for **a decryption event**. All three
surface in the UI. Renamed:

| Was | Is |
|---|---|
| `grant` (credential vault row) | **`credential`** — and *"credential opened"* for the event. **Not `key`**, which this same table bans because it means a JSON key. And it is a *display* rename only: `grant` and `grant.read` stay in the schema, the API and the `.brain`, because renaming a column to improve a label is how a spoken id stops resolving |
| `member` (person × register × level) | **`access`** — and `access.grant` / `access.revoke` for the events ([30-BLUEPRINT](30-BLUEPRINT.md) §2); an earlier draft wrote `access.changed`, which is not among the forty kinds |

---

---

*Next: [21-AUTHORING](21-AUTHORING.md).*
