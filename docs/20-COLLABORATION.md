# 20 · Collaboration

Cloud Team is **$29/mo for up to five people on ONE record** — priced per record, not per seat.
This document is what that buys, and why it is not "multiplayer".

The strategic frame is settled and not re-litigated here: **real-time co-editing is not the pitch
and is not built this year.** Competitors collaborate on *code* artefacts — sessions, diffs,
plans, bugs. None of them is a typed record with doors in and out, schedules, pages and a Keychain
that a team and its agents shape to whatever the business runs; a money ledger, a domain register
and a credential index are examples of what a team builds on it, not the pitch. The differentiated thing is that shared typed
**business** record, and the differentiated *feature* is the shared **decision**.

---

## 1 · The permission model — three layers, and only one of them is stored

This settles [Q4 in 17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md). The answer arrived by collapsing the
question rather than choosing a side: grants and pages are not alternatives, they sit at different
layers.

| Layer | What it is | Stored? | Cardinality |
|---|---|---|---|
| **Ceiling** | a person's `member` rows: register × level ([30-BLUEPRINT](30-BLUEPRINT.md) §1) | **yes, materialised** | 5 people × ~14 registers |
| **Scope** | a rule over the record's own typed fields — `where: { field: entity, in: [driftwood] }` | yes, as rules | O(rules), **not O(rows)** |
| **Projection** | every page and every share link: `pick<fields> + where<predicate>` | it *is* the page | unbounded, and free |

> **A projection can only narrow. Never widen.**

Airtable proves the invariant in production: an interface-only collaborator "can view and interact
with published interfaces **without having access to the underlying base**", and base permissions
"extend to and be respected in interfaces as well" — a read-only user "can't edit or modify a
base's records through an interface."

Three consequences, and the first is worth a lot:

1. **The page engine cannot escalate anyone.** When a page becomes a row
   ([06-PAGES](06-PAGES.md)), it is a projection — so Phase B does not touch the permission model.
   Audit the ceiling once; every page is checkable against it mechanically. **Build grants in
   Phase A and the page engine inherits the property for free.**
2. **A share link and a logged-in read are the same mechanism** — a share link is a projection with
   an *empty* ceiling. One code path, not two: the recipient is the `share` kind of the one
   `CallContext`, whose principal has six kinds — `person` · `token` · `runner` · `share` · `system` ·
   `slash` — and `runner` and `share` are kinds, never fields beside it ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §2).
3. **The projection is type-level, not a policy engine.** `pick + where` is checkable. An
   interpreted rule set is not.

### The scope layer, and why a rule beats a row

Notion shipped row permission rules keyed on a Person property in September 2025 — *"whoever is in
the `Owner` property gets `Can edit`"* — with one order-independent conflict rule: *"If someone
matches multiple rules, the highest level of access applies."*

The argument for BrainDog is stronger than convenience:

> A rule collapses the permission log from **O(rows) to O(rules)**, and it makes historical access
> **replayable**. Effective access is `f(rule version, record fields at time T)`, and both of those
> are already in the append-only log. *"Who could see this row on 12 March?"* becomes pure
> computation — no ACL snapshots, no parallel history table. A materialised per-row ACL cannot
> answer that question without duplicating its own history.

The fields this needs — `entity`, `assignee`, `actor` — already exist, and the predicate is the
same `where:` grammar every consumer in [02-DATA-MODEL](02-DATA-MODEL.md) §6 uses.

**As built (kernel migration 19).** A list grant carries at most one rule: `member.row_where`, one `where`
([34-GRAMMARS](34-GRAMMARS.md) §1) held as JSON text beside the level it narrows. NULL is every row, which is what
every grant meant before; the `'*'` row never holds one, since a rule is about one list's fields. The owner sets it
with `invite({ …, registers, wheres })`, where `wheres` maps a list the same invitation gives to its rule; a list sent
without one is every row again, because an invitation is the whole of what somebody holds. `invite` reads each rule
against its list before storing it and refuses one it cannot read. Each change is its own event on the member row:
`access.grant` when a list is narrowed or its rule changes, `access.revoke` when the rule comes off, with
`field: '<list>#where'` and the rule's JSON text in `from_v` and `to_v`, so "who could see what, when" is still read
from the log. `members()` answers the rules as `wheres`, in the shape `invite` takes them.

The record's `access(person)` answers `wheres` beside `levels`, and both hosts copy it into the call's context wherever
they copy `levels` (`CallContext.wheres`). Every row read narrows by it: `list`, `get`, `search`, `history`, blocks,
question rowsets, MCP and Slash. The kernel's `list(q, grant)` and `count(register, grant)` take the caller's rule on
that list and AND it with the caller's own `where`, so a page, its cursor and its `matched` come from one clause and a
narrowed member is never told how many rows they cannot see. A figure over a narrowed list is withheld for that member,
since a sum over rows they cannot see says what those rows hold. A rule the record cannot read reaches no row: it fails
closed, and the member sees an empty list rather than the rows the owner kept from them.

This is Notion's shape with one rule per grant rather than several with a highest-wins merge. A person who needs two
slices of one list is one rule with an `any:`, which keeps "what can she see" a single predicate a person can read.

### The five levels

| Level | Can |
|---|---|
| `read` | see what the projection shows |
| **`append`** | **`create`, `propose` and `log` — and no read.** The conservative half: an appender sees nothing, not even what it filed, unless a `read` grant on that register says so ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.1). Held on the whole record, it adds to every list but the owner-only ones (below) |
| `write` | create, edit, and change state on granted registers |
| **`decide`** | **settle a question: pick an option and record the binding reason** |
| **`owner`** | everything `decide` can, plus the sixteen ADMIN methods of [30-BLUEPRINT](30-BLUEPRINT.md) §5 — packs, declarations, rules, tokens, devices, invitations, export, import, snapshot, erase, restore, and deleting the record — and the Keychain (the KEYCHAIN group, owner-only by default). At least one per record; **never held by a token or a share link**, which is why there is no `admin` token scope ([ADR-060](16-DECISIONS.md)); a bearer reaches one ADMIN method only through an **operation grant** the owner approved in the browser, once, within ten minutes ([12-SECURITY](12-SECURITY.md) §3). *An earlier draft counted four* |

The five are the `member` table's `level` CHECK ([30-BLUEPRINT](30-BLUEPRINT.md) §1). A transition may
name the level it needs — `transitions: { proposed: { to: [active], by: decide } }`
([02-DATA-MODEL](02-DATA-MODEL.md) §5); `by:` takes a person level, and a token never satisfies
`decide` or `owner`.

`append` is taken from Notion's `Can create` — *"can create new pages within the database, but
can't view or edit existing pages they haven't been individually granted access to."* It is the
natural role for an append-only system and the correct shape for a contractor: file a task,
comment, propose an option, and read only what a separate `read` grant gives. It is also far cheaper
than a filtered read.

**What is built for each level** (`guard`, `scoped` and `wholeRecord` in `packages/record/src/index.ts`):

- **Owner-only lists.** Keys, People (the list declaring the `meets` role, or the list `people`
  where none declares it) and any list declaring `owner_only: true`
  ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.4) are the owner's. A record-wide `append` does not
  reach them: that colleague is refused in one sentence naming the list, and adds everywhere else.
  A grant naming the list does reach it, and `read`, `write` and `decide` are unchanged.
- **A record-wide appender with a `read` grant opens the app.** A read that names no list (`boot`,
  `search`, `pages` and the rest) is admitted when the record-wide level or any one grant reaches
  it, and its answer holds only the lists the caller may read. So `append` on the record and `read`
  on Tasks opens on Tasks, where before `boot` refused it.
- **Reading the record as a whole needs a level that reads.** A caller at `append` is never
  treated as reading the whole record, whatever its ceiling, so the log's lines about the record
  itself and the inbox do not reach it.
- **A level on one list is `read`, `append` or `write`.** Answering a question is for somebody
  invited to the whole record, whatever the question is about, so a list's own `decide` or `owner`
  answers nothing more than `write` does, and the People screen offers the three.
- **What `boot` says.** `me.levels` is the level the caller holds on each list it holds, with the
  owner-only lists left out for a record-wide appender; the app asks it through one helper,
  `may(shell, need, list?)` (`apps/web/src/lib/record/may.ts`), and prints what the record answers.
  `counts.inbox` goes to an owner and to a token an owner gave the `inbox` reach, as `inbox` itself
  does, and is `null` for anybody else.

**What a person reads (2 Nov).** The app says the five levels in one set of words, everywhere access is given:
Owner, Can decide (an Admin, where a sentence needs a noun), Can edit, Can add and Can view, each with one line of what
it lets them do and one of what it does not (`apps/web/src/lib/sharing/roles.ts`). A list's own level uses the same
three words, and a share's rungs (View, Comment, Edit, Manage) each carry a line too. Settings > Who can do what
(`/settings/roles`) lays the roles side by side, thirteen things by five roles, and a colleague's first Today says once
the role they joined with. The words describe the ladder; they decide nothing.

**Handing ownership over (2 Nov).** An owner presses Make owner on a colleague's row. One confirmed write, with the
app's reauth when the sign-in is stale and the session's proof time checked on the server: the record's `handOver`
makes the colleague an owner and the caller Can decide, in one transaction, with two access events saying why. It is
in `NEVER_BYPASS`, so no token reaches it, switch on or off. The old owner's tokens drop to Can decide at once, since a
token's level follows its person, and the links he made stop opening. Who pays (the Directory's `dir_record.owner`)
does not move; that is the owner's call still to make.

**`decide` is a level none of the four surveyed products has.** Verified across Notion's six
levels, Airtable's five, Retool's three and Linear's role set: not one has a permission meaning
*"this person settles questions."* That is one line in the pitch, because the fourth verb *is* the
product.

### No layers, no `max()`, no deny lattice

All four products resolve permissions by union and none has a deny:

| Product | Verbatim |
|---|---|
| Notion | *"Notion respects the broadest level of access."* |
| Retool | *"Permissions are always additive… users always receive the most permissive level they have across all sources"* — and even its 2026 access policies *"operate by granting access, not denying access."* |
| Airtable | *"User's highest access level causes them to be billable."* |

Four independent teams converging is a signal that deny rules are hard to ship. **But every one of
them then needed Enterprise-only tooling to make `max()` legible** — Notion's Compliance Admin,
Retool's *View by: Object / View by: Role* tab, Airtable's admin panel. *If a permission model
needs a bespoke viewer to be legible, the model is too complex — and a solo product will never
build that viewer.*

And there is a sharper, disqualifying reason for a record whose premise is an append-only log:

> Under `max()`, a broader grant **silently widens** a narrower one. Notion's own example: `Can
> view` on a page becomes `Full access` because of a workspace-wide grant. **Nothing changed on the
> row, so an append-only log emits no event for the row whose exposure just widened.**

**The fix is to remove a layer, not to add a deny lattice.**

> **`member` rows are materialised per person. There is no "everyone" layer** — with two to five
> people that layer is four rows, so write the four rows. When a preset changes, the rows are
> **rewritten**, and every rewrite emits `access.grant` or `access.revoke` — the person id in
> `target`, `target_kind 'member'`, the **register in `field`**, the levels in `from_v`/`to_v`, `why`
> in `note` ([30-BLUEPRINT](30-BLUEPRINT.md) §2; the shape is
> [45-SPEC-RECORD](45-SPEC-RECORD.md) §5.6's). *An earlier draft emitted `access.changed`, which the
> forty-kind CHECK does not admit — and a later one put `{ person, register }` together in `target`,
> which is amended here: the row that changed is a `member` row, not a person, so `target_kind` names
> the table, `target` names the row it hangs off and `field` names the register. Three columns the
> DDL already has, doing what they are for. A pair packed into one string leaves `event_target`'s
> index nothing to seek on and makes "what did they hold on obligations" a query somebody has to
> parse a string for.*

| Property | Consequence |
|---|---|
| `max()` never arises | there is nothing to compose |
| Person-level is authoritative **in both directions** | which is how shared-vault products already behave |
| **Every widening is an event** — including one caused by a *rule* change rather than a row change | precisely the event a `max()` lattice structurally cannot produce |
| The one true deny is **structural** | the ADMIN and KEYCHAIN groups of the record's RPC surface ([30-BLUEPRINT](30-BLUEPRINT.md) §5), refused inside the object at the RPC boundary, before step 1 of the write path — never in the Worker's router, which the CLI can be pointed around. A deny at the RPC boundary cannot be widened by any grant, rule or future page; an operation grant does not widen it either — it admits one bearer to one named ADMIN operation, once, and the record checks the reach itself |

### Four things to refuse, each with a documented precedent

| Refuse | Precedent |
|---|---|
| **Any implicit grant to future objects** | Retool's folder inheritance grants to *"objects added later"*, and object roles with `Apply universally` cover *"all current and future objects of that type."* A row you add next month is already shared and nothing told you. **BrainDog's default: a new register, entity or page is private until granted** |
| **Sending a value the projection excludes** | Airtable, openly: on public interface pages *"field values that are used for charts are sent to a client… you could see the individual values for each deal"*, and *"conditionally hidden field values on record detail pages can always be accessed."* **Filter server-side, always. Blur is not redaction** |
| **Schema mutation inside a projection** | Airtable's real escalation hole: *"An interface-only editor can add new options to a single select field from within an interface, even without base-level access."* In BrainDog a contractor must never create a register, an entity, a category or a tier — that is **schema wearing the clothes of data** |
| **Fail-open evaluation** | Retool gets this right and it is worth copying: *"Retool blocks a query rather than running it unfiltered when an embedded expression cannot be evaluated."* A `where:` that cannot resolve at read time returns **nothing**, never everything |

Notion's `Can edit content` is worth naming as the good version of the third row: it exists
*specifically* to separate data from schema, explicitly forbidding *"adding or removing a property,
or changing a property's type"* and *"creating or changing views."*

### The defaults taken on 8 October, each reversible with a word

The questions only the maintainer could answer were put and never answered.
On 8 October every answer was taken at its default: each one below was taken on **8 October 2026** and is
**the owner's to reverse with a word**. Each is what the code already does, except the
last, so writing them down changes nothing in the product; each names the line that holds it, and reversing one is
the job named beside it.

| Question | Taken | Held by | If it is reversed |
|---|---|---|---|
| A project's lanes: four or five | **Four**: Building, Earning, Parked, Finished (stored `building`, `earning`, `parked`, `retired`) | `packages/seed/src/modules/portfolio.ts:170-178`, the `lane` field; the projects in play are filtered on two of them at `packages/seed/src/usecases/personal.ts:590`; held by `packages/seed/test/portfolio-lanes.test.ts` | Five (Earning, Shipping, Exploring, Maintain, Retired): the lane field gains `exploring` and `maintain`, shows `building` as Shipping and `retired` as Retired, keeps the stored values, and needs a ruling on where `parked` goes, since the five do not name it; Portfolio's version moves |
| Share links in production | **Taken Off on 8 October, and since switched on.** The routes of `packages/host/src/routes/shares.ts` are in the table (`SHARES` in `packages/host/src/routes/index.ts`), and a host can still switch read-only links off, where Share says so | `packages/host/src/routes/index.ts` | Off: the spread line comes out again |
| Who accepts a suggested change | **Any member who may decide accepts a change to a list or a page. Only an owner accepts an add-on, a setting, an arrangement, or anything that runs unattended** | `packages/record/src/index.ts:9349-9369`, the accept path of `decide`: `pack`, `settings` and `arrange` are held to the owner, then `runsUnattended`; held by `packages/record/test/accept-unattended.test.ts` and `accept-rule-level.test.ts` | Owner only: `change` joins the kinds held to the owner, and `accept-unattended.test.ts` gains the case |
| Whose reach an automation runs with | **Its maker's, as they are now.** Its maker is whoever put its live version in; while they are an owner it runs as the record does, held to a colleague's lens once they are not, and stopped, saying why, once they reach nothing | `makerOf` in `packages/kernel/src/index.ts`, read at every firing and every turn of a run; held by `packages/record/test/automation-maker-lens.test.ts` | The owner's reach always: `makerOf` answers `null` for everybody |
| The levels an invitation offers on one list | **Can view, Can add and Can edit. Never Can decide or Owner** | `LIST_LEVELS` at `apps/web/src/lib/record/may.ts:38`; the record does not honour either on one list (above, *A level on one list*) | Offering Decides on one list is a new requirement, since the record would have to honour it first |
| A colleague who cannot read People | **Reads "Someone on this record"** for every other member | `namesFor` at `packages/record/src/index.ts:6388-6394`: the owner, and a member who may read People while the People module is on, are told names; nobody else is | Names for everyone: `namesFor` admits every member |
| Services on a founder's record | **Installed only when the founder's words point at it** (domains, hosting, renewals), **otherwise offered at its first renewal**, because a first run must be "not overwhelming" | Not yet: a founder's use case installs Estate, and with it Services, on day 0 today (`modules` at `packages/seed/src/usecases/founder.ts:275`). A later change builds the default | Every founder on day 0: the default keeps Services among what a founder's use case cannot stand without |

What one record gets, every record gets: none of these is read from one person's record, and each is
the default on every record until it is reversed.

---

## 2 · The tiers

| Tier | What | Cost |
|---|---|---|
| **0 · A collaborator's own agent** | they write through an agent token of their own. Any member mints one from Settings > Agents in a sign-in proved in the last fifteen minutes (`createOwnToken`, then `ownTokens` and `revokeOwnToken`, all DATA, a person in a browser and never a token); it writes as them and is capped by their own levels at every call, so an "Adds only" colleague, who cannot open the app, adds rows through MCP. She makes her agent's key in the app, on the one screen Accept opens for her (Settings, Agents), and her first read says so: the record's refusal names that screen, and Home draws its one button under the sentence. The owner's `listTokens` names whose each token is, and `revokeToken` ends any of them | ~0d |
| **1 · Shared read-only links** | a signed token per page. **Every shared page is also a landing page** | ~1d |
| **2 · A second person with a login** | largely absorbed by Phase A's auth-for-strangers work — the invitation flow is [12-SECURITY](12-SECURITY.md) §3, and it is two methods: `invite({ email, levels })`, ADMIN, the owner mints the link; `acceptInvite`, INTERNAL, the host calls at acceptance with the Directory's verified person, and that writes the `member` rows and their `access.grant` events ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.6, §5.11). *An earlier draft had one method doing both.* Since 2 Nov the host mails the invitation at once (`POST /auth/invite` with `send: true`, a signed-in session required), naming the inviter and the role, and for an address new to the host the proof rides in the same mail, so one mail and one Join is enough. Copy link stays. A join's side effects are signed by the record (`system`), never by the joiner | ~4d |
| **3 · Collaborate on decisions** | comments, and the gate itself | ~3d |
| 4 · Real-time co-editing | **not this year.** ~15–20d plus permanent maintenance | — |

### Tier 1, and the two corrections that matter

Airtable's share links are the reference, and two things commonly believed about them are false:

- **Domain restriction only.** *"Individual email allowlists are not supported — it's not possible
  to restrict a shared view link to specific individual email addresses."* So BrainDog must **not
  promise a per-person share link**. If a share must reach one named person, that is tier 2.
- **Their "disable" is a pause, not a revocation.** *"If someone chooses to re-enable the link… the
  same URL will be preserved unless 'Generate new link' is clicked."* So in BrainDog **revocation
  is terminal**: a revoked share is never reactivated, and re-sharing mints a new id. One boolean,
  and it is the difference between revocation and a pause.

The token itself is signed under a key derived from the root KEK and carries its `kek_id`; an invalid or
revoked token is a **404**, never a 401 — to that caller the page does not exist
([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.6).

And one leak precedent to design against: Notion's published pages carry their children —
*"Subpages are also published by default, along with any of their subpages"* — and both escape
hatches fail **open**. BrainDog's rule is **one object, one level deep**, enforced *in the
projection* rather than trusted.

---

## 3 · The decision gate

The product's differentiator, so it gets the most care. The mechanism: anyone — human or agent —
proposes **options**; **one named person** decides; it becomes an immutable numbered row with a
**mandatory reason**.

### One decision, never a staircase

The warning is in [ADR-009](16-DECISIONS.md) and it has a corpse: GitHub's Copilot Workspace staged
every task through five separately-generated, separately-approvable artefacts, walked it back in
its own final changelog, and was then deprecated outright. **If a proposal needs three approvals to
land, the design is wrong.**

### The surface

```
┌────────────────────────────────────────────────────────────────────────────┐
│ SG23  Which competitive mode does the game ship?          proposed by      │
│                                                            claude · 6d ago │
├──────────────────────┬──────────────────────┬──────────────────────────────┤
│ The Same Oven        │ Nailed It            │ Relay chain                  │
│ ──────────────────── │ ──────────────────── │ ─────────────────────────    │
│ render load   none   │ a cake per player    │ low                          │
│ already built  ~80%  │ new minigame         │ new minigame                 │
│ ships before Q7 ✓    │ ✗                    │ ✗                            │
│ ▸ 4 rows of evidence │ ▸ 3 rows             │ ▸ 2 rows                     │
├──────────────────────┴──────────────────────┴──────────────────────────────┤
│  Because ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  required       │
│  Zero render load, and mastery is already 80% built.                       │
│                                                                            │
│  [ Decide: The Same Oven ]   Defer with a date   Dismiss                   │
└────────────────────────────────────────────────────────────────────────────┘
```

Six rules, each earned:

1. **Options are columns, compared on the same rows.** Not three paragraphs. The comparison axes
   come from the proposal, and an option missing an axis renders as blank — never as a dash that
   reads like a value.
2. **Evidence is one click, collapsed by default.** `▸ 4 rows of evidence` expands to the actual
   rows in the record. A recommendation you cannot audit is an opinion.
3. **The agent may recommend, and the recommendation is a *label*, not an order.** One option may
   carry a `recommended` chip with its one-line reason. It never pre-selects, and there is no
   "accept all".
4. **The reason field is required and it is the *first* thing focused** after a choice, not a
   modal afterthought. Its placeholder is a question — *"Because…"* — because an empty box invites
   "ok". A light question a rule or Slash opened is the exception, and takes one press (below).
5. **Three verbs, and the third is not "ignore".** Decide · **Defer with a date and a reason** ·
   Dismiss. A deferred question wakes on its date **with the reason shown first**.
6. **A decision is immutable.** Superseding writes a new row pointing at the old one. There is no
   edit, and no delete.

### And the order they arrive in is not the order they were asked

A queue sorted by recency teaches one habit: clear the top. So the queue is ranked by **what it
would cost to get each one wrong**, dearest first, oldest first within a band.

The band is **computed, never declared** — from what accepting the proposal would do, which the
proposal already says. A field the proposer fills in would be a field the party with an interest in
being read first controls, and by the second week everything is urgent.

Four bands, worst first: `undo` changes rows somebody already has, replaces a declaration, or turns
a pack off; `shape` installs or configures a pack, or adds a page; `rows` adds rows, or a rule that
will; `call` is a judgement with nothing attached. A judgement ranks last because pressing the other
button tomorrow undoes it, and does not undo a write.

The card names its band in a word and says nothing else about it. Why a proposal is expensive is in
its own reason, written by whoever opened it.

### The reason must be worth having

The failure mode is a required field filled with "ok". Three cheap countermeasures:

- The prompt is a **sentence stem**, not a label.
- **Under ~15 characters, ask once**: *"That will not mean anything in six weeks. Keep it anyway?"* —
  a nudge, never a block. A validator that refuses short reasons produces "okokokokokok".
- **The reason is what renders**, everywhere the decision is cited. When it is the visible artefact
  rather than an audit field, it gets written properly.

### A light question takes one press

The one place the reason is not asked. A question **a rule or Slash opened** whose band is **`call`**
(a judgement with nothing attached, so answering it changes no row, declaration, access or money)
is answered by pressing the option, and nothing more. Those two open many small questions on their
own, and asking a sentence for each one is how a required field fills with "ok". Pressing the other
button tomorrow undoes it, which is what makes it light.

Both facts are the record's, never the proposer's: the band is computed from the body, and the
opener is the row's own signer. A question a person or an agent opened still asks why, and so does
every question in any other band. The decision still carries a sentence, because the reason is what
renders: the chosen option's own *because*, marked as the option's and not the decider's, or a plain
line saying it was answered in one press (`govern.ts` `oneAnswer`). A reason typed anyway is kept.

### Deferral beats quarantine, and this is why

Linear's Triage is the industry's answer and it is the wrong one at this size. Every documented
source of a Triage item is *external*: integrations, non-team members, support tools. **It exists
because a team receives work from people who are not on it.** At five people everyone is on the
team, so it is **a gate with no outside** — and Linear gates it behind Business and Enterprise,
which is its own vendor declining to price it for small teams.

Worse, its snooze hides an item from the *shared* queue (*"hidden from other users by default"*)
while Triage items are already *"excluded from views by default"* — so an item can be off the
boards and out of the only queue that would surface it, with nobody having decided to drop it.

BrainDog's `defer` is strictly better and it is worth recording why: it is on a **shared**
question, it takes a **compulsory reason**, it carries a **wake date**, and the reason is shown
**first** when it wakes.

**One thing to take from Triage:** merge reparents children. Marking a suggestion a duplicate must
move its comments and contributors onto the canonical one. That is the part that is genuinely
painful to retrofit.

---

## 4 · Status exists only as a property of a dated, authored update

The best mechanism in this research pass, and it fixes a defect the prior record demonstrably has:
a project's outlook is a **mutable string with no author and no date**. Read it and you cannot tell
a project verified healthy on Friday from one that has said the same thing since March.

Linear's Project Updates solve it in four parts, and the fourth is the one everybody omits:

1. **Health is never a standalone field.** It exists only as a required property of an update —
   *"select a health indicator — On track, At risk, or Off track."* You cannot post prose without a
   health, and you cannot have a health without prose, an author and a date.
2. **The current value is derived from the newest row**, not stored. Linear explicitly refused to
   compute it: *"project progress is not something that can be predicted based on quantitative data
   alone. It needs qualitative input from the project team."*
3. **Absence renders as its own value** — *"Update Missing"* — chased by reminders with follow-up
   nudges.
4. **"No update expected" is a *separate* value from "Update Missing"**, driven by a schedule option
   and by non-active status.

> **Point 4 is what keeps the mechanism alive.** Without it, finished and dormant projects pile into
> the Missing bucket, the bucket becomes noise, and the reminder is dead inside a month.

```
updates                      -- a register. No ninth kind.
  seq          rendered "U18"
  target       ref → entity | track
  health       on_track | at_risk | off_track        NOT NULL
  body         document                              NOT NULL
  person       actor                                 NOT NULL
  created      instant                               NOT NULL
  supersedes   ref → updates                         -- corrections are new rows

derived:  health         = newest row's health
          health_as_of   = newest row's created
          update_state   = current | missing | not_expected
```

**Why this is the right shape here and not merely a nice idea:** it makes the append-only log the
*actual storage* for state rather than an audit artefact bolted beside it. A mutable column plus a
trail of changes to it is two systems that can disagree. An update row read as "latest" is one.

**And improve on Linear in exactly one place.** Linear lets an author edit a published update via a
hover pencil and delete it from a `…` menu — precisely the affordance an append-only design exists
to remove. Corrections are new rows with `supersedes`.

**Authorship: seeded, then open.** The owner posts the first update; anyone may post subsequent
ones. Reminders fire only where there is an owner — no owner means no nag, rather than a nag to
nobody.

**One adjacent steal, and it is a real data-model addition.** Linear's dates accept **variable
precision** — year, half-year, quarter, month, or exact day. *A quarter is a legal value rather than
a lie encoded as the 15th of the middle month.* So the `day` type carries a `precision`, and a
target of `2027-Q3` renders as `Q3 2027` rather than a false date. This applies to roadmap targets,
option deadlines and deferral wake dates.

---

## 5 · Comments

| Rule | Why |
|---|---|
| On an **entry**, a **decision** and a **suggestion**. Nothing else | comments on a comment are a forum |
| **One level of threading.** No nesting | depth is how a discussion becomes unsearchable |
| Resolvable, with the resolution recorded | see §7 |
| Comments are **searched** with everything else, and only by whoever may see what they are on | a comment nobody can search is a second, worse record |
| A comment never carries state a field should carry | *"I think this is done"* in a comment on a row with a `state` field is a defect in the register, not a feature of comments |

**What is built.** A comment is a `note` event on the thing it is about, not a row: no table, no
event kind and no refusal code were added for it. Its target is the row (`entry:<id>`), the
question (`suggestion:<id>`) or the decision (`decision:<id>`); `field` is `comment`, or
`reply:<id>` for a reply, which names the comment that opened the thread; the words are in `note`,
at most 280 characters; and `to_v` stays NULL, because a decision's note that carries a `to_v` is
read as what was applied when it was accepted. A resolution is a `note` on `event:<id>` with
`field: 'resolve'`, one of `addressed`, `wont-fix` or `incorrect` in `to_v` and the reason in
`note`; the newest one is how the comment stands, and every one stays in the log. Being events,
comments travel in an export and are reached by an erasure's event pass.

| Method | Group | Who |
|---|---|---|
| `comments({ on })` answers `{ id, by, at, body, reply_to, resolved }[]`, oldest first | READ+ | whoever may see the thing |
| `comment({ on, body, reply_to? })` answers `{ id }` | DATA | whoever may see the thing, a Reads colleague included; a token needs `propose` |
| `resolveComment({ id, as, why })` answers `{ id, resolved }` | DATA | the comment's author, or whoever may change the thing: `write` on a row's list, `decide` for a question or a decision |

`on` is a row's spoken id (`tasks#3`), `suggestion:<id>` or `decision:<id>`, and a question or a
decision may be named by the handle the record hands a caller who does not read every list.
**A thing the caller cannot see has no comments**: every method answers it in the sentence a thing
that is not there gets, `search` answers only the comments on things she sees, and the line a
resolution writes in the log goes only to whoever sees what the comment is on. One thing holds at
most `THREAD_MOST` comments and replies. A search reads comments among the newest
`COMMENT_SEARCH_EVENTS` events of the log, because the log has no index on a comment's words; an
older comment is still read whole in its thread. The kernel's half is `packages/kernel/src/api/comments.ts`;
the record's is `packages/record/src/methods/comments.ts`.

**Mentions (built 2 Nov).** A comment that names somebody with @, by whole or first name, on a row, a question or
a decision (written to its question's thread), tells that person: a line under For you in their bell, and a ring on
their phone through `kernel.tellColleague` (§7). The name match is one function for rows and questions (`namedIn` in
`packages/record/src/methods/comments.ts`). Nobody is told about a thing they cannot see: each named person's own
context is made from `kernel.access(person)`, and the row's lens or the question's sight check must answer for them, or
nothing rings. The writer is never told about their own comment. A tap on a question's ring opens `/decide/<id>/thread`.
Subscriptions are not built: a mention tells the person once, and enrols them in nothing. The paragraph below is the
design subscriptions will follow.

**Subscription is thread-level or record-level, and the distinction is precise.** From Linear: an
@mention **in the body** subscribes you to the record; an @mention **in a comment thread**
subscribes you to *the thread only*. Being pulled into one conversation must not silently enrol
you in a record's entire future.

---

## 6 · Presence without real-time

What is worth building, and what is theatre.

| Worth it | Theatre |
|---|---|
| **"Who touched this, when"** — free, from the provenance already on every row | live cursors |
| **`actor` on every write** — `sam` · `agent:claude` · `rule:renewal-30d` — so a change is attributable | typing indicators |
| An **activity feed** scoped to what your ceiling permits | avatar stacks on a business record |
| **Read marks on decisions** — who has seen the thing that binds them | "currently viewing" — and the mark itself is a column on `member`, `seen_at`, written with `MAX()` only, by `markRead` — a person principal's call, never a token's — and never an entry row, so a read is never a write ([30-BLUEPRINT](30-BLUEPRINT.md) §1) |
| **A held-question count**, so a cap is visible rather than silent | — |

**Who else is here (built 2 Nov), on the poll that already ran.** Every open tab asks `version` every 1.5 to 6 s; it now
sends `at`, the page's path, and the record answers `here`: the names of the other people on that path in the last 30
s. They are kept in a Map in the record object's memory: no row, no log line, no socket and no new door, and gone when
the object sleeps. Only people, only others, and only names the reader may already know (`namesFor`). A reader held to
some lists is here, and hears who is, only on a row or page they can read, so presence never tells a contractor which
hidden row the owner is on. The app draws up to three 20px faces before the bell, "+n" past them, and the names in the
label ("Mira Chen and Sam Okafor are here too"). This is the "currently viewing" of the table above in its cheapest
form, kept because it costs nothing new; live cursors and typing indicators stay theatre.

**Two people on one row (2 Nov).** An open row reads itself again in place when the poll's version moves (row,
history, links, comments), and waits while a field is open. A save that meets `conflict` over a field the other person
did not touch is sent again at the new version and lands; one over the same field keeps the box open with the typed
words and says "Somebody else changed this while you typed. Save again to put yours in its place, or Cancel to keep
theirs."

### Multiple people, each running multiple agents

The realistic 2026 shape, and the one nobody else has to solve: two humans with three agents each,
all writing to one record.

| Problem | Mechanism |
|---|---|
| Who did this? | `actor` distinguishes a human from Claude from Codex from a rule. No vendor's memory store gives you this |
| Two agents building opposite things | the **open suggestion** is the interlock. An agent that starts work on a question with an open suggestion is told so by `record_index`, before it plans |
| An agent acting on a stale decision | a decision carries its supersession chain; citing a superseded `D`-id renders struck |
| **An agent outliving its human** | **the revocation cascade** — see below |

**The agent token's authority is capped by a named human's, and fails closed when theirs lapses.**
From Notion's Custom Agents: *"Each connected resource must have at least one Agent editor that has
access to that resource… If all editors lose access to a resource, the agent stops running."*

So: a token's effective scope is `token.scope ∩ owner.grants`, and **suspending a person suspends
their tokens in the same statement** — not by a nightly job. And because every `session` row carries
`token_id`, a token's writes are one query: revoke it and everything it did is one list, not a search
([02-DATA-MODEL](02-DATA-MODEL.md) §1). And the token-minting screen says the
quiet part out loud, in Notion's spirit: *when you share an agent token, you are giving it
everything you can see.*

---

## 7 · Notifications between people

Everything in [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) applies. Three additions specific to more
than one person:

**1 · Suppress across channels using the read mark.** Linear sends an email digest *"only if you
haven't already read the Linear inbox notification."* BrainDog has a read mark, so the emailed or
pushed digest omits anything already seen in-app. One join, no new state — and it is the cheapest
possible answer to *"the digest told me something I already knew"*, which is how digests get
filtered to a folder.

**2 · Name every cap.** Linear retains *"up to 2,000 open notifications… when this limit is
exceeded, notifications are automatically archived"* — and does not support archiving manually. A
cap that evicts silently is a hole. Every cap in BrainDog says what it held back.

**Phones ring for colleagues (built 2 Nov).** `kernel.tellColleague` rings one person's own phones
(`personPushSubs` in `push.ts`) when a row is handed to them, when a comment @mentions them (§5), and, for the inviter,
when somebody joins from their invitation. The push carries no content (`{ sub, cause, open, kind }`), never rings the
person who did it, nor anybody who no longer reaches the record or cannot see the row, once per cause, inside the
record's quiet hours, and at most six an hour per person. Its kind is `people`, with its own switch in Settings >
Notifications. A member held to some lists cannot hold a phone (`subscribePush` refuses), so no narrowed reader is
rung. Mail for a mention is not built.

**3 · Resolution reasons, from GitHub.** Closing a suggestion or a comment records **why**:
*Addressed · Won't fix · Incorrect*. GitHub's own rationale — *"selecting one of these options
provides valuable feedback to the product team"* — applies directly: it is the cheapest instrument
for learning which proposals were noise, and it is three radio buttons.

---

## 8 · The audit log needs per-field redaction

A correctness problem, not a feature. The log stores old and new **values**, and that table travels
in exports, in backups, and in shared pages. **Read-time filtering does not help with any of
those.**

Retool has the answer and it is one array: an advanced setting labelled **`Disable logging for`**
names sensitive parameters, and *"values hidden this way display as
`--blacklisted-by-developer--` in audit logs."* The existence of that opt-out is proof that
everything else is captured.

> **BrainDog's version: a per-field redaction list, by type and by option.** `secret` and `money`
> fields are on it always; any other field joins it with `redact: true` on its declaration
> ([02-DATA-MODEL](02-DATA-MODEL.md) §5). A write to one logs **the fact and the field**, with
> `from_v`/`to_v` set to the literal `--redacted--` at write time — and inside a `create` row's `to_v`,
> which is the whole row's JSON, the redacted field's value is that same string. Fully auditable — who, when, which field — and the
> number is not in the backup, the export, or a shared page. A value removed *later* by an erasure is
> `--erased--`, and `NULL` means only that there was no prior value ([02-DATA-MODEL](02-DATA-MODEL.md)
> §10) — the three are never confused. One family is redacted by *shape* rather than by field: a `grant.*`
> event's `note` carries the grant id and `kind`, never `label` or `opens` — [12-SECURITY](12-SECURITY.md) §8.

The general law: **log-everything and log-nothing are both wrong; a per-operation redaction list is
the resolution.**

Three more requirements while there:

| Requirement | Precedent |
|---|---|
| **A closed, enumerated event vocabulary in one place** | Retool publishes ~120 event types on a single reference page. Free-text event kinds drift — and a log whose vocabulary drifts is not queryable five years later |
| **`target_kind` on every row** | from Airtable's tuple. Without it, a task, a decision and a domain event about the same entity are indistinguishable without parsing |
| **Export and decryption are themselves events** | Linear: *"this export action is recorded in the audit log."* Retool logs revealing a connection string, because **reaching the credential is the exceptional act** |

**And the split to avoid:** Airtable's audit log *"does not reflect changes to contents of cell
values"* — cell-level capture is a separate, sales-gated API. Notion logs *"Page property edited"*
with no before or after. Only Retool logs the data plane at all, and it needed redaction to make
that safe. BrainDog logs the data plane by design, which is the harder and better half; the
redaction list is what makes it safe at rest.

---

## 9 · A fourth proof for the pitch

Three of the four products surveyed have a **mutable history**:

| Product | Evidence |
|---|---|
| **Airtable** | owners can hide history *and destroy it* — `Clear revision history` → *"unavailable immediately… and cannot be retrieved."* Meanwhile the durable audit log *"does not reflect changes to contents of cell values"* |
| **Linear** | published project updates are author-editable and deletable |
| **Retool** | append-only is never asserted; self-hosted, you own the table |
| **Notion** | version-history mechanics undocumented — both help pages 404 |

The actor with the most incentive to erase evidence is precisely the actor authorised to erase it,
irreversibly.

> ### **A history that cannot be edited — including by you.**

That is already true of this design ([02-DATA-MODEL](02-DATA-MODEL.md) §8: `event` is append-only
and has no foreign key to `entry`, so deleting a row cannot delete its history). It costs nothing
to claim, no competitor claims it, and for a record holding money and credentials it is the same
*checkable* trust argument that published source plus a complete self-host makes.

**And it is structural rather than aspirational, which is the part that makes it believable.** The
credential boundary is what makes an audit log true — *an audit log you can bypass is decoration.*
Here there is one write path: the record object is the only thing that can write, it makes no
outbound calls, and the event is written inside the same transaction as the change. Completeness is
a property of the architecture, not of anyone's discipline.

---

## 10 · Cost

| Item | Days |
|---|---|
| Tier 0 — scoped agent tokens | 0 (in Phase A) |
| Tier 1 — signed share links, terminal revocation, one-level projection | 1 |
| Tier 2 — a second login, materialised `member` rows, `access.grant`/`access.revoke` | 2.5 |
| Tier 3 — comments, the decision gate UI, resolution reasons | 3 |
| `updates` register + derived health + two silence states + reminders | 1 |
| Per-field audit redaction + closed event enum + `target_kind` | 0.5 |
| Token revocation cascade + variable-precision dates | 0.25 |
| **Total** | **~8.25** |

Against the ~7 days budgeted in [15-ROADMAP](15-ROADMAP.md) B8. The overrun is the `updates`
register and the audit redaction, and both are **correctness** rather than collaboration — the
redaction list in particular should move into Phase A, because it changes what a backup contains.

---

*Next: [21-AUTHORING](21-AUTHORING.md).*
