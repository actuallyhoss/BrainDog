# 50 · `apps/web` — specification

The browser client of the record: the spine screens of [19-INTERFACE](19-INTERFACE.md) §2 as native code, every
register as a dense grid, every declared page through one recursive interpreter, the palette, the keyboard model,
and the accessibility bar of [13-UI](13-UI.md) §7 measured rather than asserted. Derives from
[22-FRONTEND](22-FRONTEND.md) · 19 · 13 · [06-PAGES](06-PAGES.md) · [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) ·
[23-ASSISTANT-UI](23-ASSISTANT-UI.md), with [05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §1,
[28-THEMING](28-THEMING.md) §5, [33-CONTRACTS](33-CONTRACTS.md) §2 and §4, [20-COLLABORATION](20-COLLABORATION.md)
§6, [32-PARITY](32-PARITY.md) §9 and [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6.

> Clean room. Nothing here is ported; the predecessor's screens were traced into 32 and its code was not read.

---

## 1 · Purpose and boundary

**Does.** Renders the record for a person: a static shell both hosts serve as assets, hydrated in the browser, one
interpreter over the eight primitives for every block kind including kinds a pack invented after the
bundle shipped (22 §3), the `role="grid"` register table (13 §7), the palette (19 §4), live updates over `/ws`
(22 §5), the five empty states (19 §6), screenshot mode (32 §9.1), and the phone (13 §10). It is a client of the
same API the agents use ([ADR-018](16-DECISIONS.md)): every call is `POST /api/<method>` or one of the four GET
aliases of 33 §4, with the session cookie and nothing else.

**Refuses.** Per-page code (22 §2 constraint 1). A colour, a font or a spacing literal outside `app.css` (22 §7).
A bearer token — the app never holds one, so `NEEDS_BROWSER_SESSION` cannot arise here (30 §5). Parsing theme CSS —
it applies text the server generated (28 §5). A second renderer — the eight primitives and the sixteen kinds are
imported, never copied (31 §2). A client-side query engine or a cache of register rows (22 §6). Record data over
the WebSocket (22 §5). Committing a decision in one keystroke (19 §4). Explaining the interface (23 §7).

**Imports.** Runtime: `svelte`, `braindog-render` (spec 36) and `braindog-render/svelte` — the subpath 36 leaves to
stage 3 and **this spec specifies** (§2.7) — `@braindog/where` (the root: parse · print · validate · evaluate — never
`@braindog/where/sql`), `@braindog/declare` (declaration schemas for generated forms and the YAML text lens). Dev:
`@braindog/fixtures`, and `@braindog/theme` for one build script (§5.7). Never `ports`, `kernel`, `record`, `mcp`,
`spark`, or another app — the total order of 31 §2 puts `web` at 13 with runtime edges to 1, 3 and 7 only.

**Runs.** SvelteKit 2.70.3 / Svelte 5.57.0 as a **static shell**: `adapter-static` with `fallback: 'index.html'` and
`ssr = false`. One `build/` directory is the Worker's `ASSETS` binding (51 §7, `not_found_handling:
'single-page-application'`) and the self-host's disk root (22 §9). No request is ever rendered on a server — §13 D1.
Licence `Apache-2.0`.

---

## 2 · Public API

An app's public surface is what its two hosts import, the addresses people and agents type, and the modules its own
screens share. All four are stated; nothing else is importable.

### 2.1 · The artefact the hosts serve

```
apps/web/build/                  the one artefact; nothing under it is imported by code (51 §1)
  index.html                     the shell and the SPA fallback — Cache-Control: no-cache, ETag = its bytes
  _app/version.json              the build id the deploy-parity gate compares (33 §8, 51 §5.10)
  _app/immutable/**              hashed, immutable: entry chunks · editor chunk · allow chunk · theme.<hash>.css
                                 · latin.woff2 · arabic.woff2 · icons.svg
  sw.js                          the service worker (§5.12)
```

The Worker answers the routes of 33 §4 and lets `ASSETS` serve everything else, with `index.html` for any path that
is not a file (51 A16); the self-host serves the same directory from disk with the same headers (22 §9). Neither
host holds a path list: `src/routes/**` is the only one (19 §5). `@braindog/web` is `private: true` and has no
`exports` map.

### 2.2 · The route tree

```
src/routes/
  +layout.svelte              the shell: skip link → #main · Sidebar ≥ 900 px / TabBar < 900 px · Palette · Toast · live region
  +layout.ts                  ssr = false · boot() and GET /api/version once per load, in parallel · the record switcher
  +error.svelte               Empty · error
  +page.svelte                /                        Home — For You (20 §6)
  decide/+page.svelte         /decide                  open questions, ranked by cost of delay
  decide/[id]/+page.svelte    /decide/SG23             the gate (20 §3)
  inbox/+page.svelte          /inbox                   raw arrivals that matched no pattern
  search/+page.svelte         /search?q=               the structured fallback
  vault/+page.svelte          /vault                   what each key opens · never a query string
  packs/+page.svelte          /packs · /packs/browse · /packs/[id]     installed · the Kennel · one pack with its diff
  settings/[area]/+page.svelte /settings/<area>        area ∈ the twelve of 19 §2; anything else → 404
  start/+page.svelte          /start                   one row, typed by hand (19 §6)
  audit/+page.svelte          /audit                   every write, by whom, against which version
  r/[register]/+page.svelte   /r/obligations           the register grid · ?row=7 peeks · ?f= ?q= ?sort= filters
  r/[register]/[seq]/+page.svelte  /r/obligations/7    entry detail
  v/[view]/+page.svelte       /v/obligations.overdue   a named predicate (34 §1.7) · order in the URL
  p/[slug]/+page.svelte       /p/money · ?src=1 · #b-4 declared page · its declaration as text · block focus
  jobs/[id]/+page.svelte      /jobs/<id>               the return address of a tier-C run (23 §3.1)
  s/[token]/+page.svelte      /s/<token>               a shared page: page(slug) with `Authorization: Share <token>` (51 §5.6); no nav, no palette
  [id]/+page.svelte           /D41 · /SG23 · /tasks#7  the spoken-id resolver: get({ spoken }) → replaceState to the canonical address (51 D19)
```

Twenty-one route files, counted. The hosts enumerate none of them; an unknown path reaches `+error.svelte` (19 §5).

### 2.3 · Components

| Component | File | Does | From |
|---|---|---|---|
| `Block` | `braindog-render/svelte` (§2.7) | one drawn block: dispatches on `KINDS[kind].primitive` to one of the eight primitive components | 05 §1, 22 §3 |
| `Document` | `braindog-render/svelte` (§2.7) | a `document` field: `parse()` segments → markdown, `Block`s, degraded fences | 05 §3, 34 §2 |
| `Table` | `braindog-render/svelte` (§2.7) | the page-only `table` kind and the register grid's body: declared tracks, rowgroups, `role="grid"` | 13 §4.2, 22 §4 |
| the sixteen kinds | `KINDS` from `braindog-render` | a `KindSpec` table, not components; a page block becomes a `Block` segment through `toBlock()` (§5.1) | 36 §4 |
| `Page` | `lib/page/Page.svelte` | `page(slug)` → header → blocks in declaration order, one boundary each, `empty` iff zero rows | 06 §1, 19 §6 |
| `Grid` | `lib/grid/Grid.svelte` | the register screen: header · filters · keyset pages · selection · inline edit; draws rows only through `Table` | 13 §4.2, 22 §4 |
| `Palette` | `lib/palette/Palette.svelte` | `<dialog>` combobox; filter mode; the Spark row; the job body | 19 §4, 23 §3 |
| `JobView` | `lib/job/JobView.svelte` | one row per tool call; folds name both lengths; leave-and-return | 23 §3.1 |
| `Sheet` | `lib/ui/Sheet.svelte` | `<dialog>` drawer 480 px / full-screen sheet on a phone; `88dvh − var(--kb)` | 19 §2, §4 |
| `Toast` | `lib/ui/Toast.svelte` | armed at 380 ms; undo after the write lands; cap sixty; `role="status"` | 19 §4 |
| `Empty` | `lib/ui/Empty.svelte` | one shape, five kinds (§4.3); an unknown prop is a type error | 19 §6, 32 §10 |
| `Field` | `lib/ui/Field.svelte` | one control per value type from `schema()`; visible label; the refusal sentence beside it | 06 §8 |
| `ThemeSwitch` | `lib/ui/ThemeSwitch.svelte` | a three-way segment Light · System · Dark — System always reachable | 19 §4 |
| `ScreenshotMode` | `lib/a11y/Shot.svelte` | toggles `html[data-shot]`; plates every text node not in the allow-list | 32 §9.1 |
| `Sidebar` · `TabBar` · `Kbd` · `Dialect` | `lib/ui/*`, `lib/editor/Dialect.svelte` | nav (19 §3) · the printed binding · the textarea editor with live preview (22 §8) | |

### 2.4 · Stores — module state in `.svelte.ts`

| Store | Type | Invariant |
|---|---|---|
| `version` | `{ record: number }` | only ever rises: `record = max(record, r.version)` on every `Result` and every socket frame |
| `overlay` | `Map<RowKey, Pending>` — `Pending = { patch, op_id, base: number }` | a key is present from send until `applied` or `conflict`; a `refused` keeps it |
| `live` | `{ state: 'open' \| 'polling' \| 'offline'; since: number; spark: boolean }` | `offline` only after a failed write or a failed poll, never from `navigator.onLine` alone (19 §6); `spark` is `GET /api/version`'s word (46 §5.1), `false` until read |
| `palette` | `{ open, mode: 'filter' \| 'spark' \| 'job', q, cursor, job?: JobId, ask?: string }` | `mode: 'spark'` is unreachable while `live.spark === false` |
| `jobs` | `Map<JobId, { job: Job; events: JobEvent[]; after: number }>` | module state owned by no component, so closing the palette stops nothing; `after` is monotonic |
| `overlaid` | `number` | a counter, never a boolean; `> 0` silences every hotkey except close and locks scroll |
| `prefs` | `Prefs` (§4.7) | mirrored to the `bd_pref` cookie on every change |
| `toasts` | `Toast[]`, ≤ 60 | an undo entry exists only for an `applied` write, built from the returned row |
| `keys` | the registry (§4.2) | no screen binds a key outside it; `?` reads it |

### 2.5 · The API client — `lib/data/call.ts`

```ts
export type Result<T> =
  | { ok: true;  value: T; version: number }
  | { ok: false; refusals: Refusal[] }                                      // 422 · 401 · 403 · 503
  | { ok: false; conflict: { version: number; current: Entry; actor: string } };   // 409
export type Refusal = { code: RefusalCode; at: string; found?: unknown; wanted?: string; fix: string };

/** POST /api/<method>. Cookie auth only. Throws Unreachable (name 'Unreachable', rid) on a transport failure;
 *  never throws on a Result. Every call carries X-Request-Id: rid. */
export function call<M extends keyof Api>(method: M, args: Api[M]['args'],
  opts?: { signal?: AbortSignal; keepalive?: boolean }): Promise<Result<Api[M]['value']>>;

export function opId(): string;                  // crypto.randomUUID() — unique is the whole contract (33 §2)
export function rid(): string;                   // 10 base32 chars from crypto.getRandomValues

/** The optimistic write path of §5.3. Resolves when the overlay is settled. */
export function write(args: { register: string; seq?: number; patch: Fields; base?: number },
  onRefused: (r: Refusal[]) => void, onConflict: (c: Conflict, mine: Fields) => void): Promise<Result<Entry>>;
```

`Api` is a type map over the DATA and READ+ methods of 33 §2 plus the browser-session groups VAULT, JOBS and ADMIN
of 30 §5; INTERNAL methods have no entry.

### 2.6 · What this app assumes of the packages it imports

The audit's interface lens checks these against specs 36, 38, 42 and 45. Each is a decision in §13 where the design
documents did not state it.

```ts
// braindog-render (root) — as 36 §2 exports it; the app uses exactly these
parse(markdown: string): Segment[]            // total: never throws; Segment = Markdown | Block | Degraded (36 §4)
toHTML(segments, opts?: RenderOptions): string // the parity oracle of §9; RenderOptions = { resolve?, link?, now? }
PRIMITIVES_VERSION: 1 · PRIMITIVES · KINDS: Record<Kind, KindSpec>   // KindSpec = { primitive, cells, tone, rows?, ordered?, hole?, pageOnly? }
types Segment Markdown Block Degraded Row Inline Kind KindSpec Primitive Tone RenderOptions LinkRef

// @braindog/where (root)                                    spec 38
parse(json: unknown): Tree · print(t: Tree): string /* RFC 8785 */ · validate(t, schema: RegisterDecl): Refusal[]
evaluate(leaf: Leaf, value: Value, ctx: { now: number; tz: string }): boolean      // tone_when · when, client-side

// @braindog/declare                                         spec 42
toYaml(decl: Declaration): string · fromYaml(text: string): Declaration | Refusal[] · schemas: Record<DeclKind, StandardSchema>

// the record over HTTP (33 §2)                              spec 45 — the shapes this app renders
GET  /api/version → { version, spark: boolean }             // 46 §5.1; the polling fallback and the Spark switch
boot() → { index, sessions, suggestions, whatsNew, sinceCapped, theme: { id, version, css },
           me: { person, level, owner: boolean, records: { slug, name }[] } }        // records → /auth/switch/<slug> (51 D4)
page(slug) → { page: PageDecl, blocks: { rows: Entry[], total: number, drawn: boolean, stale_at: string }[],
               kinds: KindTable, values: Record<Path, Value | null> }               // `when:` and every {{path}} resolved server-side
listJobs({ id?, after? }) → { jobs: Job[], events: JobEvent[] }                     // events with seq > after; [] when job.seq ≤ after; owner (46 §5.2)

// Spark, registered only when SPARK_ENDPOINT is set (46 §5.2)
GET  /api/spark/status · POST /api/spark/read { question } → Reading · POST /api/spark/propose { question, ask_id } → Proposal
POST /api/spark/pattern { samples }                          // the raw-inbox row's one affordance (23 §3)
```

### 2.7 · The `braindog-render/svelte` subpath — specified here, built in `packages/render`

36 §1 says of it only *"stage 3; consumes the same `Segment[]`; held to the parity test"*. Stage 3 is this spec, so
the subpath is decided here and lives at `packages/render/svelte/`, MIT, with `svelte` as an optional peer (31 §2).

```
packages/render/svelte/
  index.ts          export { Document, Block, Table } and the eight primitive components
  Document.svelte   props { src: string; opts?: RenderOptions }   → parse(src) → <Markdown> | <Block> | <Degraded>
  Block.svelte      props { block: Block; opts? }                 → <figure class="block…" data-kind data-primitive> then the
                    component for KINDS[block.kind].primitive — the same skeleton, classes and attributes as 36 §5.9, so the
                    accessibility trees are equal by construction
  Markdown.svelte   the 36 §5.7 subset, rendered as elements — no {@html}, ever
  Degraded.svelte   the fence with its fix line above (36 §5.9's degraded row)
  p/Panel.svelte p/Grid.svelte p/Rows.svelte p/Proportional.svelte p/Inline.svelte p/List.svelte p/Table.svelte p/Media.svelte
```

Rules: a primitive component owns the markup 36 §5.9 assigns to its kinds and reads only semantic tokens; `Inline`
runs render through one `Text.svelte` that mirrors 36 §5.5 (paths, typed forms, evidence, links with the same
`href` filter); `--cells` and `--magnitude` are the only inline `style` values, formatted by the same two-decimal
rule; nothing is rendered from a string of HTML. The parity gate (§9 `a11y-tree`) is what makes two renderers one.

**`Table`** is the one component with behaviour, because it is the register grid's body and the page-only kind:

```ts
props  { columns: Column[]; rows: Entry[]; total: number /* aria-rowcount, -1 unknown */; cap?: number;
         sort?: { field, dir }; focus?: { row: RowKey; col: number }; selected?: Set<RowKey>; edit?: { row; col } }
events { activate(row) · focus(row, col) · sort(field) · cell(row, col) /* e / F2 */ · more() /* the sentinel */ }
emits  role="region" tabindex="0" aria-label › role="grid" aria-rowcount aria-colcount › rowgroups of 100 under
       content-visibility: auto with contain-intrinsic-size › role="row" aria-rowindex › gridcell / columnheader aria-sort;
       one --cols track list on the grid root; header and body rows both read it; the roving tabindex of §4.2
```

A page `table` block never becomes a `Block` (36 §4 invariant 2); `lib/page/blocks.ts` builds `Table` props from
`columns:` and the fetched rows, and turns every other page block into a `Block` segment — `stat` cells and metric
`values` into `label · figure · note · tone` rows, `note` `body` into `body`, and so on — so a declared page and a
write-up take one code path from the first `<figure>` down.

---

## 3 · Files

The one place the eight-file rule of 35 §2 yields: eleven spine screens are eleven files, and each is one screen.

```
apps/web/
├── package.json · svelte.config.js (adapter-static, fallback index.html) · vite.config.ts · tsconfig.json · .stylelintrc.json · playwright.config.ts
├── scripts/  allow.mjs (§4.5, ~60 lines) · theme.mjs (house.css from @braindog/theme, ~20) · spring.mjs (linear() stops, ζ 0.7467 ω 6.56, ~20)
├── src/
│   ├── app.html                 <meta name="color-scheme" content="light dark"> first · the one-statement prefs script (§4.7) · theme.css link
│   ├── app.css                  @layer tokens, theme, a11y, components; · tokens · a11y (focus ring, forced-colors, targets)
│   ├── theme/house.css          GENERATED by scripts/theme.mjs, committed, gated for exactness — the four blocks of §5.7 step 2
│   ├── sw.ts                    precache the shell by hash · stale-while-revalidate on /api/pages/* · nothing else (~60)
│   ├── routes/                  21 files — §2.2; +layout.ts is the boot sequence of §5.13
│   └── lib/
│       ├── copy.ts              every UI literal, `as const` — the allow-list's first source; no other file holds copy
│       ├── start.ts             the two register declarations /start may install, verbatim from the first-party packs
│       ├── data/   call.ts · write.ts · live.ts · url.ts · prefs.ts · outbox.ts · api.d.ts        7
│       ├── a11y/   keys.ts · shot.ts · Shot.svelte · allow.json (generated) · announce.ts       5
│       ├── palette/ Palette.svelte · parse.ts · rows.ts                                          3
│       ├── grid/   Grid.svelte · Header.svelte · Filters.svelte · columns.ts                     4
│       ├── page/   Page.svelte · blocks.ts (toBlock: a page block → a Block segment or Table props)   2
│       ├── job/    JobView.svelte                                                                1
│       ├── editor/ Dialect.svelte                                                                1
│       ├── ui/     Sidebar · TabBar · Sheet · Toast · Empty · Field · ThemeSwitch · Kbd · icons.svg   9
│       ├── primitives/          DOES NOT EXIST — the eight are braindog-render/svelte's (§2.7); a copy is the second renderer 31 §2 warns of
│       └── kinds/               DOES NOT EXIST — the sixteen are KINDS in braindog-render (36 §4)
└── test/   env.ts (HOST, PORT — the one module every spec imports) · unit/*.test.ts (12) · e2e/*.spec.ts (16) · fixtures → @braindog/fixtures

packages/render/svelte/          specified in §2.7, MIT, SPDX header on every file (31 §4)
  index.ts · Document.svelte · Block.svelte · Markdown.svelte · Degraded.svelte · Text.svelte · p/{Panel,Grid,Rows,Proportional,Inline,List,Table,Media}.svelte   14
```

About 60 source files in the app and 14 in the subpath. `copy.ts` is load-bearing twice: it is the only place a
sentence is typed, so the no-over-explaining rule (23 §7) is reviewable in one file, and it is the first input of
the allow-list.

---

## 4 · Data structures

### 4.1 · The client state model

| Datum | Where | Sentence a test can check |
|---|---|---|
| `record_version` | `version.record` | equals `MAX(event.rowid)` the server last reported; never decreases in a session |
| per-row `version` | on every `Entry` | the compare-and-set value sent with `update`; a row re-read after `conflict` carries the newer one |
| the overlay | `overlay` | reads render `merge(canonical, pending)`; a refused write's typed value is still on screen |
| the read mark | server, `member.seen_at` | advanced by `markRead({ upTo })` **on leaving Home**, never on opening it (19 §6); `upTo` = the highest `event.rowid` drawn |
| `since` | Home only | `whatsNew` rows since the mark, ≤ 60, with `sinceCapped` drawn as *and more* when true |
| a draft | component state | seeded when a Sheet opens, never from a dependency (22 §7); survives its screen's load |

### 4.2 · The keyboard model

`lib/a11y/keys.ts` is a registry the one dispatcher consults; no screen adds a listener of its own.

```ts
type Scope = 'document' | 'grid' | 'page' | 'gate' | 'palette' | 'nav';
type Binding = { id: string; scope: Scope; key: string; label: keyof typeof copy; bare: boolean;
                 when?: () => boolean; run: (e: KeyboardEvent) => void };
export function bind(b: Binding): void;            // a duplicate (scope, key) throws at module load
export function typing(): boolean;                 // the ONE test: activeElement is input, textarea, [contenteditable]
export function sheet(): Binding[];                // what `?` draws, with remaps applied
```

Dispatch order on `keydown`: `overlaid() > 0` → only `Esc` and the palette's own scope · `typing()` → only chords
with `⌘`/`Ctrl` and `Esc` · a `g` armed within 1,000 ms → the go-to table · the focused scope → `document`.
`Character keys: off` (Settings → keyboard) drops every `bare: true` binding. Remaps live in `prefs.keys`.

| Scope | Key | Action |
|---|---|---|
| document | `⌘K` / `Ctrl+K` | open the palette, also from inside a text field |
| document | `/` | open the palette with the caret in the query |
| document | `g` then `h d i s v p ,` | Home · Decide · Inbox · Search · Vault · Packs · Settings — armed 1 s, hint `role="status"`, hidden under a coarse pointer |
| document | `g` then `1`–`9` | the nth item of **your** nav in **your** order; the digit is printed beside the item |
| document | `⌘\` | toggle the sidebar |
| document | `⌘Z` | undo the last write from the toast stack |
| document | `⌘↵` | commit the primary action of the open layer — the only commit chord |
| document | `Esc` | close the topmost layer, one per press, never falling through |
| document | `?` | the keymap sheet from `sheet()` — help, never the assistant |
| document | `ContextMenu` / `⇧F10` | the row or block menu |
| grid | `j` `↓` · `k` `↑` | row down · row up, keeping the column |
| grid | `←` `→` | column; inverted on the inline axis under `dir="rtl"` |
| grid | `Home` `End` · `⌘Home` `⌘End` | row ends · register ends |
| grid | `PageUp` `PageDown` | a viewport |
| grid | `↵` · `p` | open the row · peek (`?row=`); the trailing chevron's tooltip says `p` |
| grid | `x` · `⇧x` · `⌘a` | select · extend · all loaded |
| grid | `e` / `F2` | edit the focused cell in place |
| grid | `n` · `f` · `v` | new · filter · display options |
| grid | `y` · `⇧Y` | copy the spoken id · copy the link |
| grid | `o` | open the related register |
| grid | `Delete` | delete, with an undo toast — the only destructive key, and not a letter |
| grid | `⌥V` · `⌥B` | save the filter as a view · bind the view as a block — present only for `owner` (§5.2 step 9) |
| page | `j` `k` · `↵` · `Esc` | block down · up · enter the block's first row · leave it |
| page | `o` · `y` · `⇧E` | open the source register pre-filtered to the block's `where:` · copy the block link · open the declaration |
| gate | `1`–`9` · `↵` · `⌘↵` · `d` · `Esc` | highlight · open the commit step, focus the empty reason · commit from the reason with content · defer · leave |
| palette | `↑` `↓` · `↵` · `⇥` · `Esc` | move · run · **complete the query and nothing else** · close; in job mode back to the launcher first, and not while the caret is in the prompt |
| nav | `⌥↑` `⌥↓` · menu | move the focused item · Move up / Move down / Move to top / Hide · Promote / Rename / Pin / Dismiss / Never suggest here |

Never bound, asserted by a unit test over the registry: `⌘/Ctrl` + `T N W L D P S F G O H J R`, `⌘⇧` +
`N W B O J R Delete`, `⌘/Ctrl+1`–`9`, `Alt+←/→`, `F1`–`F12`, bare `Space` and `PageDown` for anything but scrolling.
Every bound row carries `aria-keyshortcuts`, and the `<kbd>` in the palette row and the `?` sheet are the primary
exposure (19 §4). `Space` scrolls, always.

**The `role="grid"` contract**, one checklist the `grid-contract` gate walks: a labelled `role="region"` with
`tabindex="0"` wraps the grid · `role="grid"` carries `aria-rowcount` (`-1` while a filtered total is unknown) and
`aria-colcount` · every chunk is `role="rowgroup"` · every row `role="row"` with `aria-rowindex` · every cell
`role="gridcell"`, headers `role="columnheader"` with `aria-sort` · exactly one cell has `tabindex="0"`, every other
cell `-1` (roving) · the focused cell's bounding box is where the focus band is drawn · `scroll-padding-block` equals
`--sticky` so 2.4.11 holds.

### 4.3 · The empty-state contract

```ts
type Empty = { kind: 'no-data-yet' | 'no-results' | 'cleared' | 'no-permission' | 'error';
               title: string; body?: string; query?: string; rid?: string;
               actions: { label: string; run: () => void }[] };     // Verb + Noun labels; real buttons, in the tab order
```

`kind` is decided by one function, never by a screen: `N === 0` → `no-data-yet` · `403 FORBIDDEN` →
`no-permission` · `Unreachable` or a 503 → `error` · zero rows under a **person-typed** filter → `no-results`
(the query quoted verbatim) · zero rows under a **declared** predicate with `N > 0` → `cleared`, whose title is the
block's mandatory `empty:` string (06 §1). Copy is §6. `cleared` has no action — nobody manufactures work.

### 4.4 · Tokens the app declares — `app.css`, `@layer tokens`

A component may read only these and the semantic colour roles of 13 §2.1; Stylelint's `declaration-strict-value`
and `value-no-unknown-custom-properties` enforce it (22 §7 gate 1).

| Property | Value | From |
|---|---|---|
| `--t-xs … --t-3xl` | 12 · 13 · 15 · 17 · 20 · 24 · 28 · 34 px | 13 §7 |
| `--text` | `--t-sm` / `--t-base` / `--t-md` by `html[data-text=sm\|base\|md]` — the reader's Text setting | 13 §7 |
| `--row-h` | 28 / 32 / 36 px by `html[data-density=compact\|comfortable\|roomy]` | 13 §4.2 |
| `--ctl-h` | 32 px; **44 px under `(pointer: coarse)`** — width never changes it | 18 §6 |
| `--tap` | 44 px — the invisible hit box: `::before { inset: min(0px, calc((100% - var(--tap)) / 2)) }` | 13 §7 |
| `--measure` | 72ch — paragraphs, lists, `note`; never a table | 13 §4.1 |
| `--d-press --d-release --d-state --d-move --d-enter --d-exit` | 90 · 180 · 180 · 240 · 280 · 160 ms; every one **1 ms** under `prefers-reduced-motion: reduce` | 13 §9 |
| `--ease-spring` | `linear(…)` from `scripts/spring.mjs`, ζ 0.7467 ω 6.56 — analytic overshoot e^(−πζ/√(1−ζ²)) = 1.029; last stop forced to exactly 1 | 13 §9 |
| `--kb` | the virtual keyboard: `innerHeight − visualViewport.height`, px | 19 §4 |
| `--z-sheet --z-palette --z-toast --z-hint` | 10 · 20 · 30 · 40 — every positive `z-index` is one of these | 22 §7 |
| `--icon-s --icon-m --icon-l --icon-xl` | 12 · 16 · 20 · 24 px — the four names | 22 §7 |
| `--sticky` | the header's height, read once; `scroll-padding-block` and every anchor's `scroll-margin-block-start` | 13 §7, 19 §5 |
| `@property --ink … --focus-out` | `syntax: "<color>"; inherits: true` on each semantic role — a malformed installed token fails loudly | 28 §2.3 |

`@layer a11y` holds the two-tone `:focus-visible` ring, the `forced-colors` block of 28 §2.5 verbatim, the target
floor and `prefers-reduced-motion`. A theme emits into `@layer theme`, which is earlier, so it cannot reach them.
Physical properties are banned by `property-disallowed-list` from the first commit (22 §7).

### 4.5 · The screenshot allow-list — provenance, built at compile time

**Legible** under `html[data-shot]`: a text node whose trimmed string a developer typed into source. **Everything
else is plated.** The allow-list is built, never curated:

1. `scripts/allow.mjs` reads `src/lib/copy.ts` and takes every string value of the `as const` object.
2. It parses every `src/**/*.svelte` with `svelte/compiler`'s `parse` and takes every static `Text` node of a
   template, trimmed, dropping the empty string. An expression (`{name}`, `{n} of {N}`) contributes nothing — which
   is why a label built by concatenation blurs, and why a toggle's two states are two literals in `copy.ts`.
3. It adds the key names the `Kbd` component prints.
4. It writes the sorted, de-duplicated set to `src/lib/a11y/allow.json`.
5. CI reruns it and fails on a byte difference — the same exactness gate as `telemetry-allowlist` (33 §8).

`allow.json` is a **separate chunk**, imported on the first toggle; it is outside the entry-chunk budget like the
editor chunk (22 §9). Runtime mechanics are §5.8.

### 4.6 · URL state — `lib/data/url.ts`

```
?f=<field>:<op>:<value>[,<value>…]     one leaf of a flat all: — repeatable        f=state:in:open,part  f=due:before:+30d
?q=<phrase>                             the register-wide `matches` leaf
?w=<JCS JSON>                           any tree the flat form cannot carry (a block's where: with any:/none:)
?sort=<field>:asc|desc                  the order; defaults omitted
?row=<seq>                              the peeked row — a stable key, never an index
```

`encode(tree, order)` emits `f=`/`q=` when the tree is a root `all:` of leaves (or one leaf), else `w=`; `decode`
accepts both and returns `{ tree, order }` through `where.parse`. `pushState` for a discrete change, throttled
`replaceState` for typing (19 §5). A URL over 2,048 bytes is not produced: the filter is offered as a saved view
instead.

### 4.7 · Preferences — the `bd_pref` cookie

```ts
type Prefs = { scheme?: 'light' | 'dark';            // absent = system (the three-way segment)
               text: 'sm' | 'base' | 'md'; density: 'compact' | 'comfortable' | 'roomy';
               sidebar: boolean; nav: { order: PageId[]; hidden: PageId[]; pinned: PageId[] };
               columns: Record<Register, string[]>; keys: Record<string, string>; chars: boolean;
               previewDismissed: boolean; suggestPages: boolean };
```

JSON, `SameSite=Lax`, one year, not `HttpOnly`, ≤ 2 KB. A one-statement inline script at the top of `app.html` —
static bytes, so its SHA-256 is the one hash in the hosts' `script-src` — reads it and sets `data-scheme`,
`data-text` and `data-density` on `<html>` before first paint; a static shell has no server to do it (28 §5
mechanism 2, amended in §13 D1). Per device — §10.

---

## 5 · Algorithms

### 5.1 · Rendering a declared page — `Page.svelte`

1. `+page.svelte` calls `call('page', slug)` — **one request**, never one per block (22 §5); on a cold load it
   runs in parallel with `boot()` (§5.13), so a page costs one round trip after the shell.
2. The header derives from the result (29 §5): title `page.title` else `register.name`, never an id; count
   `n` or `n of N · includes k example`; the primary action `New {one}` if `me.level ≥ write` and the register has no
   `secret` field, `Export` if read-only; filters from `page.filters`/`header.filters`; the three state chips.
3. For each block in declaration order: `drawn === false` (the server evaluated `when:`) → skip; else
   `toBlock(block, rows, values)` → a `Block` segment of 36 §4 — or, for the page-only `table` kind, `Table` props —
   rendered through `<Block>` / `<Table>` inside its own
   `<svelte:boundary>` and `<section aria-labelledby>`; the failure branch renders `Empty · error` with
   `role="status"`, and the page counts failures for one aggregate `role="alert"` (19 §6).
4. A block whose `rows.length === 0` renders its `empty:` string in a tight frame in the block's own position —
   never hidden, never centred (19 §6 *Partial*). `values` resolves every `{{path}}` in it; a missing value is `—`.
5. Column `tone_when` and cell tones are evaluated per row with `where.evaluate(leaf, value, { now, tz })`; an
   intent reaches the DOM only as `data-intent` plus its glyph (13 §2.3).
6. Every block carries `id="b-<n>"`, `scroll-margin-block-start: var(--sticky)`, and its source name in the header;
   `o` navigates to `/r/<register>?…` with `encode(block.where, block.order)`; `⇧E` to `?src=1`, which renders
   `declare.toYaml(page)` in a `<pre>`.
7. Streaming is not used; a page renders in under 2.12 ms (22 §5). `ponytail:` stream at block granularity when a
   block's projected rows exceed ~200 and the buffered TTFB is measured worse.

### 5.2 · The register grid — `Grid.svelte`

1. On mount: `schema(register)` (cached per session, invalidated by a socket frame naming `register.<id>`), then
   `list({ register, where, order, limit: 200 })` — 200 is the API's ceiling (33 §2), so paging is keyset by
   construction.
2. Columns: `columns.ts` builds the default projection — `seq`, the `title` field, the `mobile:` fields, `state`,
   then indexed fields, capped at **10** (13 §4.2) — or the projection saved in `prefs.columns[register]`. Width per
   type: `seq 6ch` · `money 14ch` · `day 11ch` · `instant 20ch` · `int decimal duration 10ch` · `enum 12ch` · `bool 5ch`
   · `text ref minmax(12ch, 1fr)`; quantities, dates and counts align `end`, text and refs `start`. The list becomes
   one `--cols` custom property on the grid root; header and body rows read the same variable, and font weight is set
   on cell **content**, never on an element that resolves tracks — the 4 px stagger of 22 §10 cannot recur.
3. Rows go to `Table` (§2.7) in rowgroups of 100 with `content-visibility: auto` and
   `contain-intrinsic-size: auto <100 × var(--row-h)>`; the header row and the first column are `position: sticky`.
4. A sentinel after the last chunk, watched by an `IntersectionObserver`, fetches the next page while `cursor` is
   non-null and `rows.length < 2,000`. At 2,000 the cap line replaces the sentinel: *Showing 2,000 of {N} — narrow the
   filter or export* (22 §4). `aria-rowcount` is `N` from `index` when unfiltered, `-1` while filtered and paging,
   the exact count once `cursor` is null.
5. Sort: a header click or `aria-sort` toggle. If `cursor === null` the loaded rows sort client-side inside a
   keyed `{#each}` (1.9 ms at 5,000 rows, 22 §4); otherwise the order changes the keyset, so the grid refetches page
   1 with the new `order`. The URL carries `sort=`.
6. Filter: `Filters.svelte` offers **indexed fields only**, declaration order, at most eight — `enum` → chips,
   `bool` → toggle, `ref` → picker, `day` → range, text → the search box as `matches` (29 §5). Each control writes
   one leaf into a flat `all:`; `url.encode` serialises it; a change refetches page 1. `Matches n of N` is exact
   when `cursor === null`, else `200+ of N`.
7. Peek: `p` or the chevron sets `?row=<seq>` with `pushState` and opens a 480 px `Sheet` with the entry; the grid
   stays visible and keeps focus on return.
8. Inline edit: `e`/`F2` swaps the focused cell for a `Field`; `↵` or blur calls `write()` (§5.3); `Esc` restores.
   Under `live.state === 'offline'` the swap does not happen and one line appears: *Offline. New records only.*
9. `⌥V` (owner only): prompt for a name → `setDeclaration({ kind: 'register', id, body: { …decl, predicates:
   { …, [name]: tree } } })`; the grid navigates to `/v/<register>.<name>?sort=…`. `⌥B`: pick a page → the same call
   on the page, appending `{ kind: 'table', source, where: { predicate: name }, order, columns, empty: copy.viewEmpty }`.
   The view's `order` is URL state; a named predicate is the whole saved object (34 §1.7).
10. Below 640 px the default body is the `Rows` primitive component — two-line cards over the register's three `mobile:`
    fields (13 §10), the table one `v` away. Fields shown come from the declaration, never from a media query.

### 5.3 · Writes — `lib/data/write.ts`

1. `op_id = opId()`; `key = register + '/' + (seq ?? op_id)`; `overlay.set(key, { patch, op_id, base })`. The
   screen re-renders from `merge(canonical, pending)` at once.
2. `call('update', { register, seq, patch, version: base, op_id })` — or `create` when there is no `seq`.
3. `applied` → `overlay.delete(key)`; the canonical row is replaced by `value`; `version.record` rises; a toast
   with **Undo** is pushed from the returned row and armed for 380 ms; *saved* reaches the polite live region.
4. `refused` → the overlay **stays**; each `Refusal.fix` renders beside the field named by the last segment of
   `at`; a refusal naming no field, or more than one refusal, also renders in the form's summary (06 §8). Nothing
   rolls back silently (22 §5).
5. `conflict` → `overlay.delete(key)`; the canonical row becomes `conflict.current`; then **one** automatic
   re-apply if every patched field is unchanged between `base` row and `current` (the other actor touched other
   fields): resend with `version: conflict.version` and the **same** `op_id` — no event was written, so it is not a
   replay. Otherwise, or on a second `conflict`, the field shows *{actor} changed this: {theirs}* with **Keep mine**
   / **Take theirs** and the human chooses (19 §6, 22 §6).
6. `Unreachable` → for a `create`: the call is appended to the outbox (§5.12) and the row stays in the overlay
   marked *queued*; for an `update`: the overlay stays, the field is marked, `live.state = 'offline'`.
7. `⌘Z` replays the toast's inverse patch through the same path with a fresh `op_id`.

### 5.4 · Live updates — `lib/data/live.ts`

1. After hydration, open `wss://<host>/ws` (cookie auth). A frame is `{ version, registers }` — a version and the
   ids of what changed since the last frame (51 §5.7); never rows (22 §5).
2. On a frame: `version.record = max(...)`; a `Page` refetches when any block's source is in `registers`; a `Grid`
   refetches page 1 when its register is in `registers` and, if more than one page was loaded, marks itself
   `data-stale` with a **Refresh** control; Home refetches `whatsNew`; an id of the form `kind.id` — a declaration —
   drops the cached `schema` for `register.<id>` and refetches `boot()` for `theme.<id>` and `page.<id>` (§5.7), once
   45's `changed()` reports declaration writes; until it does, a theme or page change is seen on the next load.
3. On `close`: reconnect after `5,000 + random(0, 25,000)` ms (22 §5). Two consecutive failures → `live.state =
   'polling'`: `GET /api/version` every 15 s — its `version` drives step 2 with `registers` unknown, so a `Page` and
   a `Grid` refetch on any rise — and one socket attempt every 5 minutes.
4. `document.visibilityState === 'hidden'` pauses both the poll and the reconnect; `visible` fetches `/api/version`
   once and resumes. Nothing polls when nothing is live.
5. A frame never overwrites a field with an overlay entry.

### 5.5 · The palette — `Palette.svelte`, `parse.ts`, `rows.ts`

1. `<dialog>`, the combobox pattern, `overlaid++` on open, `lockScroll()`; the input accepts typing from the first
   frame; the result count is a `role="status"` debounced 250 ms (13 §7).
2. `parse(q)` → `{ prefix: '>' | '#' | '@' | '/' | null, spoken?: { prefix, n } | { register, seq }, text }`
   using 34 §4's two regexes. `D41` resolves directly; `tasks#125` resolves; `#125` is plain text and **never
   resolves bare**.
3. `rows.ts` ranks: exact spoken id · strict-prefix aliases of commands and destinations (Raycast's rule, 19 §7) ·
   the registry's commands (`>`) · rows from `search({ q, limit: 12 })` (`#`) · people (`@`) · pages and registers
   from `boot.index` (`/`) · everything, ranked, with no prefix. Every row prints its binding on the trailing edge
   through `Kbd`. No recent-history group, no multi-column layout (19 §4).
4. `⇥` completes the top row's label into the input. `↵` runs the row: `goto`, a command's `run`, or a write.
5. **The Spark row.** Opening the palette while `live.spark` fires `GET /api/spark/status` — the warm-up, free
   (46 §5.2). When `live.spark` and the query matches no place, the last row reads *Ask Spark: {text}*. Running it
   sets `mode: 'spark'` and draws 23 §7's two passes: `POST /api/spark/read { question }` → a `Reading` — the drafted
   predicate shown **before** the rows, editable and saveable as a view (23 §10), the rows drawn by code through
   `Table`, then the silhouette of a proposal; then `POST /api/spark/propose { question, ask_id }` → one `Proposal`:
   `text` through `Document`, its `verbs` at its foot, `model` in the footer, the *What Spark read* fold from `read`
   whose last line is always *grant — refused* (23 §6). A `PROPOSAL_*` refusal leaves pass 1 on screen with the `fix`
   beneath it. Nothing accumulates; `Esc` stops and keeps the text; a closed panel is not a cancellation. Without a
   model the row, the status call and every *Ask Spark* button do not exist — **absent, not disabled** (23 §8).
6. Below 640 px the palette is full-screen; the launcher is a header button, not a tab (13 §10).

### 5.6 · The job view — `JobView.svelte` and the `jobs` store

1. A job opens from the palette (`> Run …` → `createJob({ kind, args })`) or from `/jobs/<id>`, which renders the
   current shell and opens the palette in `mode: 'job'`. The header's search field is gone in this mode; the prompt
   is a textarea in the body (23 §3.1).
2. The store polls `listJobs({ id, after })` every 700 ms **while the job is live** — `after` is the highest `seq`
   held, the reply is empty when `job.seq` has not moved, one indexed read (26 §5) — and stops on a terminal status.
   Job events never ride the socket, which carries no data (22 §5); an earlier draft of 23 §3.1 had them there.
   `listJobs` answers the owner only (46 §5.2), so the palette offers *Run …* to the owner only.
3. Rendering: `start` draws nothing of its own — the header reads model and repo through it; a `tool` event and
   its `out` are **one row**; a result over 2,000 characters folds and the fold reads *2,000 of {length} characters*;
   a one-line result is never folded; `ok: false` puts the word *failed* on the row; the header derives its status
   line from the last event: *Running {tool input} · {elapsed} · Stop*.
4. `Stop` → `cancelJob({ id })`; the transcript stays. Closing the palette stops nothing; the launcher shows a dot
   while any job is live. `Esc` in job mode returns to the launcher; a second `Esc` closes; neither while the caret is
   in the prompt.
5. `lost` is drawn, never stored: a `claimed` job past `lease_until` reads *your machine has not reported for
   {ago}* (26 §5).

### 5.7 · Theme runtime — `app.html`, `src/theme/house.css`, `lib/data/prefs.ts`

1. First paint: `app.html` opens `<head>` with `<meta name="color-scheme" content="light dark">`, then the
   one-statement prefs script (§4.7), then `<link rel="stylesheet" href="…/theme.<hash>.css">` — the **house** theme,
   generated at build time by `scripts/theme.mjs` from `@braindog/theme` into `src/theme/house.css` (committed, gated
   for exactness like `allow.json`). `lang` and `dir` are set from `boot.index.locale` on hydration; `dir="rtl"` for `ar`.
2. The theme text carries four blocks: the theme under `html[data-scheme=light]`, `html[data-scheme=dark]` and
   `@media (prefers-color-scheme: dark) { html:not([data-scheme]) … }`, plus the shipped high-contrast theme under
   `@media (prefers-contrast: more)` and `html[data-theme=hc]` — scheme and contrast switches are attribute flips with
   no fetch (28 §2.5). All of it sits in `@layer theme`.
3. After `boot()`: if `boot.theme.id` or `boot.theme.version` differs from the built house theme,
   `const sheet = new CSSStyleSheet(); sheet.replaceSync(boot.theme.css); document.adoptedStyleSheets = [sheet]` —
   its `@layer theme` rules follow the linked file's in the same layer and win. A record with an installed theme
   paints house for the frames before `boot()` returns — §10.
4. A later change — an install, a switch to another installed theme, a frame naming `theme.<id>` — refetches
   `boot()` and calls `replaceSync` again: one style recalc, no reflow of the token layer (22 §7).
5. Before `replaceSync`, refuse text containing `url(`, `@import`, `expression(` or `\` — keep the previous sheet and
   log the code only. The generator already re-serialises every value (28 §4.4 O, P); this is the client's one
   defensive line.
6. There is no document ETag over record state: the shell is static (`no-cache`, ETag of its bytes) and `/api/*` is
   `no-store`; 22 §9's `{ page.version, record_version, theme.version, scheme, renderer.version }` key has nothing to
   key — §13 D1.

### 5.8 · Screenshot mode — `lib/a11y/shot.ts`

1. The palette command *Screenshot mode on* / *Screenshot mode off* — two literals — toggles `data-shot` on
   `<html>` and imports `allow.json` on first use.
2. On: a `TreeWalker` over `document.body` text nodes, skipping whitespace-only nodes and `script`/`style`; a node
   whose trimmed text is **not** in the set is wrapped in `<span class="shot">`. The span is inline, without padding
   or border, so no element box moves.
3. `.shot` is `color: transparent; background: var(--dim); border-radius: 2px; filter: blur(2px)` — a plate. Digits
   are already tabular (13 §3.2), so a plated `0` and a plated `8` occupy identical boxes and paint identical pixels:
   the readback test of 32 §9.1 is satisfied by construction, not by blur strength.
4. A `MutationObserver` (`childList`, `characterData`, `subtree`) plates nodes that arrive while the mode is on; a
   node inside `.shot` is skipped.
5. Off: every `.shot` is unwrapped and the observer disconnected.
6. `/vault` renders `Empty` with one line — *Screenshot mode is on.* — and nothing else while `data-shot` is set;
   the index is absent, not blurred (12 §8).
7. Chrome stays legible because chrome is literals; the Sidebar's page titles are record data and plate.

### 5.9 · The phone

1. Layout switches at 900 px: the Sidebar becomes a TabBar carrying Home · Decide · Inbox · More; More opens a
   `Sheet` with the declared nav in the user's order; the palette is a header button (19 §3).
2. Size switches on pointer: `(pointer: coarse)` sets `--ctl-h: 44px`; width never does (18 §6).
3. The register body defaults to `rows` cards over the three `mobile:` fields below 640 px (§5.2 step 10).
4. A `Sheet` reads `visualViewport` on `resize` into `--kb`; its body is `88dvh − var(--kb)`; the active field
   scrolls into view; safe-area insets are paid once, on the fixed elements only (13 §10).
5. The gate is a full-screen sheet with options as stacked cards and the reason field above the fold (19 §3).

### 5.10 · For You and the read mark

1. `/` renders from `boot`: open questions with their cost-of-delay rank, then *since you were away* — the
   `whatsNew` rows, capped at 60 with *and more* when `sinceCapped`.
2. In an empty record Home draws its dimmed preview once, labelled *This is what Home looks like with your data
   in it*, marked *example*; one click sets `prefs.previewDismissed` (19 §6).
3. `beforeNavigate` away from `/`, and `visibilitychange → hidden` while on it, call
   `markRead({ upTo: maxRowidDrawn })` with `keepalive: true`. Opening never advances the mark (19 §6).

### 5.11 · The dialect editor — `Dialect.svelte`, Tier 1

1. The read view **is** the renderer: `<Document src>` from `braindog-render/svelte`; `parse()` returns segments with
   `[start, end)` offsets into the raw string, and the blank lines between segments belong to nobody (21 §7).
2. Clicking a segment swaps **that segment only** for a `<textarea spellcheck="false">` sized to its lines; the
   preview beneath it re-renders the segment through the same interpreter, debounced 120 ms, parse budget 16 ms on
   the main thread (22 §8).
3. Commit splices `[start, end)` and writes the whole `document` field through §5.3; `Esc` discards the segment's
   edit. A malformed block renders as its fence with the reason above it and a **Fix** control that reopens the
   segment (21 §7); the preview never blanks because `parse()` never throws.
4. `ponytail:` per-kind forms (Glyph picker, the 4-way tone segment, `bar` drawing live) and CodeMirror Tier 2 are
   authoring-tier scope; add them after the CSS Custom Highlight spike of 22 §8, never to the entry chunk.

### 5.12 · Offline — `sw.ts` and `lib/data/outbox.ts`

1. The service worker precaches the shell by content hash on install and serves `/api/pages/*` stale-while-revalidate,
   passing the stale body's `version` through so the header's staleness chip is honest. It caches nothing else — not
   `list`, not `search` (22 §6).
2. The outbox is `localStorage['bd_outbox']`: `create` calls that failed `Unreachable`, ≤ 100, with their `op_id`.
   It drains on `online`, on boot and after a successful write, in order; a `refused` reply removes the entry and
   toasts the `fix`; a replayed `op_id` returns the original result, so a drain cannot double-write (33 §2).
3. Offline edits are disabled at the point of typing (§5.2 step 8). The one exception is a `document` draft: kept
   locally under its row key and, on a version mismatch, shown beside the current text for the human to choose (22 §6).
4. The offline chip appears only while `live.state === 'offline'` and no revalidation is in flight (19 §6).

### 5.13 · Boot — `+layout.ts`

1. `export const ssr = false`; the shell mounts its silhouette (`<main aria-busy="true">`) before any call returns.
2. Fire `boot()`, `GET /api/version` and the route's own call **in parallel**; a page therefore costs one round trip
   after the shell. `UNAUTHORIZED` from any of them → `location.assign('/signin?next=' + path)`. `/signin` goes on to `next` only when it is a path on this origin (`safeNext` in `packages/host/src/auth.ts`: no `//`, no backslash, no scheme, nothing that decodes to one), else to `/`.
3. `live.spark = version.spark`; `version.record = max(boot.version, version.version)`; `aria-busy` is set back.
4. `me.records` draws the record switcher as links to `GET /auth/switch/<slug>` — the record is on the session row, and moving it is the host's
   (51 D4); the app never reads or sends it.
5. Register `sw.js`; open the socket (§5.4); apply `boot.theme` (§5.7 step 3).
6. `/s/<token>` skips steps 2–5: it calls `page(slug)` once with `Authorization: Share <token>` — the header 51 §5.6
   names — and renders `Page` with `me.level = 'read'`, no nav and no palette.

---

## 6 · Refusals and errors

The app raises no refusal code of its own; it renders the server's. The one thing it throws is `Unreachable`.

| Received | Rendered |
|---|---|
| `ok` | the overlay entry is dropped; *saved* to the polite live region; an Undo toast |
| `refusals` (422) | each `fix` verbatim, next to its field; also in the summary when >1 or unplaced. Never a toast — a blocking error must be read (13 §6) |
| `conflict` (409) | after the rule of §5.3 step 5: either silent re-apply, or *{actor} changed this: {theirs}* with **Keep mine** / **Take theirs**; a toast *Reloaded — {actor} changed this row* |
| `UNAUTHORIZED` (401) | redirect to `/signin?next=<path>`; nothing else is said |
| `FORBIDDEN` (403) | the `no-permission` state |
| `NEEDS_BROWSER_SESSION` (403) | cannot occur: the app never sends a bearer. If seen, it is rendered as `error` with its `fix`, and it is a bug in a host |
| `SCHEMA_MISMATCH` · `SCHEMA_NEWER` (503) | a full-screen `error`: *The record is being updated. Try again in a minute.* |
| `VERSION_STALE` | is the `conflict` shape; never shown as a code |
| `DIALECT_ARITY` · `DIALECT_KIND_UNKNOWN` | not refusals — the renderer's visible fence with its line above (30 §6) |
| `Unreachable` | `error` for a read; the outbox for a `create`; the marked field for an `update` |
| `PROPOSAL_UNCITED` · `PROPOSAL_NO_ROWS` · `PROPOSAL_SCHEMA` (46 §6) | the palette keeps pass 1 — the rows were the answer — and prints the `fix` where the proposal would have been |

**The five empty states — copy** (13 §5.2, 19 §6). `{Name}` is `register.name`, `{one}` is `register.one` else
*row*, `{a} {b} {c}` are the `mobile:` field ids with `_` as a space.

| Kind | Title | Body | Actions |
|---|---|---|---|
| `no-data-yet` | *Nothing in {Name} yet.* | *{Name} holds {a}, {b} and {c}.* · *An agent with your token can add them.* · *From any session: “read my record, then add every {Name} you find.”* (copyable) | **Add {one}** · **Ask Spark to find them** (only when `live.spark`) · **Show me an example** (only for a `/start` register) |
| `no-results` | *{N} rows, none matching “{query}”.* | — | **Clear filters** |
| `cleared` | the block's `empty:`; a view or register: *Nothing outstanding.* | *The last one was {ago}.* when the register has a terminal state and a row | none |
| `no-permission` | *You can't see {Name}.* | *{owner} holds access.* | **Request access** → `propose({ question: 'Grant {me} access to {Name}?', body_kind: 'options', … })` |
| `error` | *Couldn't load {what}.* | *Request {rid}* — copyable | **Try again** |

Other fixed sentences, all in `copy.ts`: *Offline. New records only.* · *Showing 2,000 of {N} — narrow the filter or
export.* · *Screenshot mode is on.* · *Stopped.* · *1 suggested page.* (the holding-pen `role="status"`, counter
only — 29 §7) · *That will not mean anything in six weeks. Keep it anyway?* (the reason nudge, once, never a block —
20 §3).

---

## 7 · Performance budget

| Metric | Budget | Measured how |
|---|---|---|
| Entry JS, brotli | **≤ 30 KB** — the interpreter was 19.3 (22 §1); SvelteKit's client runtime is inside this number, and §10 names the fallback if it does not fit | `bundle` gate: brotli of every chunk reachable from the entry |
| Main CSS, brotli | ≤ 12 KB | `bundle` gate over `app.css` + component CSS (`css: 'external'`) |
| Editor and allow-list chunks | editor ≤ 80 KB gzip; both **unreachable from the entry chunk** | `bundle` gate walks the import graph of the build manifest |
| Fonts | ≤ 45 KB total, exactly 2 files (`latin.woff2`, `arabic.woff2`), one `wght` axis each, `unicode-range` split, `font-display: swap`; mono is the system stack | `bundle` gate; an English-only fixture makes one font request |
| The shell `index.html`, brotli | ≤ 25 KB (22 §9's *first page HTML*); it carries no record state, so it is a few KB | `bundle` gate over `build/index.html` |
| Silhouette after the entry executes | ≤ 200 ms at 390 × 844, 4× throttle, warm SW cache — the *nothing* window of 19 §6; a first visit is blank until the entry loads | Playwright: navigation → `main[aria-busy]` painted |
| LCP p75 | ≤ 1.2 s | Playwright `web-vitals` on the 500-row fixture at 4× CPU throttle, 390 × 844 |
| INP p75 | ≤ 100 ms, gated on LoAF `blockingDuration` — never Lighthouse's node count | `PerformanceObserver('long-animation-frame')` in the harness; the real-device ADB trace is the named experiment of 22 §10 |
| CLS | ≤ 0.02 — every box reserved: `contain-intrinsic-size`, `--row-h`, dimensions on media | Playwright layout-shift observer over the matrix |
| Grid build, 2,000 rows (the DOM cap) | ≤ 60 ms desktop · ≤ 400 ms at 4× throttle — 22 §4 measured 53 / 363 for chunked CV | `performance.measure` around the last chunk's insertion |
| Grid scroll, 2,000 rows | zero LoAF entries > 50 ms in the harness; comparative only until the ADB trace exists (22 §10) | `grid-contract` spec |
| Client sort, all loaded | ≤ 5 ms at 2,000 rows (1.9 measured at 5,000) | unit timer, informational |
| Palette open → first paint | ≤ 50 ms; the RAIL feedback rule | `performance.measure` |
| Motion | every duration ≤ 300 ms; spring ends at 1, peaks ≤ 1.05 | `motion` gate samples `--ease-spring` |
| Worker startup | the app ships no server module, so it costs the Worker's 200 ms budget nothing (22 §9) | spec 51's startup gate |

A size budget that only warns is exceeded; every row fails CI.

---

## 8 · Security

| Boundary | Control |
|---|---|
| Colour | no component names a colour: Stylelint (gate 1), the colour grep over TS and inline SVG (gate 2), the rendered-DOM gate asserting every computed colour is a token value or an identity `oklch(L C h)` **in sRGB** (gate 3), the contrast gate over `pairs.json` (gate 4) — 22 §7. No icon accepts a `color` prop; the sprite is `currentColor` |
| Theme text | generated server-side, re-serialised from a typed parse (28 §4.4); applied by `replaceSync`, never parsed from markup, so no `unsafe-inline`; the client refuses `url(` `@import` `expression(` `\`; `@layer theme` precedes `@layer a11y`, so a theme cannot remove the focus ring |
| Screenshot mode | the allow-list is compile-time provenance; the default is plate; the vault is absent. It is a **display** mode for a shoulder, not a redaction of the payload — the words stay in the DOM (32 §10) |
| Links from content | `https:`, `mailto:`, `#anchor` and same-origin paths render as links; everything else is text — in `render` for documents and in `rows.ts` for palette results (12 §8, 04 §7) |
| Auth | cookie only; the app never mints, stores or sends a bearer; the one session cookie, `__Host-bd_s`, is the host's and `HttpOnly`, and names the record through its session row (51 D4, amended); `Authorization: Share <token>` on `/s/<token>` and `X-Request-Id` are the only headers the app ever sets; `/vault` strips any query string on load and never writes one (19 §5); `openGrant` is a POST whose plaintext is shown once and held in no store |
| CSP | the hosts' header (51); this app's only inline script is the one-statement prefs reader, whose SHA-256 the hosts allow; the theme is a linked file or a constructed sheet, never an inline `<style>`; no third-party origin |
| Injection | one renderer, one escape function (spec 36); the quarantine frame of 23 §9 never calls the markdown renderer on `inbox_raw` |
| Secrets | a `secret` field renders its grant's label; a `grant.*` event's note is drawn as id and kind; the app logs nothing to the console in production and shows only a code and a `rid` on failure (12 §8) |
| Screens that decide | no single keystroke commits a decision; the recommendation is never pre-selected; no bulk accept across untrusted-derived proposals (19 §4, 23 §9) |

---

## 9 · Tests and gates

**Unit — `node --test` over `.ts`, no framework, `test/unit/*.test.ts`.** Svelte components are never unit-tested;
they are measured in a browser.

| Test | Input → expected |
|---|---|
| `op_id` replay | the same `create` sent twice through `call` against a fake fetch that stores by `op_id` → one recorded body; the second `Result` deep-equals the first |
| 409, disjoint fields | base `{ due, amount }`, patch `{ due }`, `conflict.current` differs only in `amount` → exactly one resend, `version = conflict.version`, same `op_id`, overlay cleared |
| 409, overlapping | patch `{ due }`, `current.due` changed → no resend; `onConflict('due', mine, theirs, actor)` called once |
| 422 keeps the overlay | `REQUIRED_MISSING` at `fields.due` → the overlay entry is still present; the refusal is placed on `due` |
| version store | `Result`s arriving with versions 40, 42, 41 → `version.record === 42` |
| palette parser | `>theme` → `{ prefix: '>', text: 'theme' }` · `D41` → `{ spoken: { prefix: 'D', n: 41 } }` · `tasks#125` → `{ spoken: { register: 'tasks', seq: 125 } }` · `#125` → `{ text: '#125' }`, no `spoken` · `/money` → `{ prefix: '/' }` |
| URL codec | flat `all:` of three leaves ↔ `f=` ×3, `print(parse(decode(encode(t)))) === print(t)`; a tree with `any:` → `w=` and the same identity |
| keys registry | `typing()` true → bare `j` not dispatched, `⌘K` dispatched; `g` then 1,200 ms then `h` → no navigation; `g h` in 400 ms → `/`; the never-bind list finds no binding; a duplicate `bind` throws |
| allow extraction | a fixture `.svelte` with `<span>Save</span>{name}` and `copy.ts` with `cancel: 'Cancel'` → the set is exactly `['Cancel', 'Save']` |
| outbox drain | two queued creates, the first replied `refused` → it is removed and its `fix` surfaced; the second is sent; order preserved |
| `toBlock` | a page `stat` block with two `cells` and their `values` → a `Block` with `kind: 'stat'` and two rows of `label · figure · note` cells; a `table` block → `Table` props and never a `Block` (36 §4 invariant 2) |
| resolver | `/D41` → exactly one `get({ spoken: 'D41' })`, then `replaceState('/decide/D41')`; `/#125` → the `error` state and no call (34 §4: `#` never resolves bare) |

**Rendered box — Playwright 1.62.1 + axe-core 4.13.0, `test/e2e/*.spec.ts`, against `braindog dev` (33 §5) with the
fixture `.brain` materialised through the write path.** Every gate runs the matrix of 22 §10: the 8 fixtures — empty
register · 12 rows · 500 rows · 5,000 rows · mixed currencies · a long write-up with inline blocks · a third-party
pack kind · a deliberately unknown primitive — × widths 390 · 768 · 1024 · 1440 × schemes light · dark × directions
`ltr` · `rtl` = **128 configurations**. Host and port come from `test/env.ts` only.

| Gate (33 §8) | Asserts |
|---|---|
| `targets` | under `pointer: coarse`, every control's hit box counting `::before`/`::after` ≥ 43.5 × 43.5 on **both** axes |
| `row-centre` | every child of a row shares a vertical centre within 1.5 px |
| `field-height` | every field is exactly one height per pointer size; 32 fine, 44 coarse, at all four widths |
| `contrast` | every pair in `pairs.json` ≥ 4.5:1 text, ≥ 3:1 `edge` and focus; the identity accents ≥ 3:1 on every surface; axe-core reports zero violations |
| `focus` | no `outline: none` in first-party CSS; the two-tone ring is visible on every surface; `activeElement`'s bounding box is the row it looks like after `j` — and after `←`/`→` under `rtl` the inline axis inverts, the block axis does not |
| `screenshot-mode` | element boxes and page height byte-identical off → on; the 500-row fixture rendered with every digit `0` and again with `8` gives identical pixels under `data-shot`; `/vault` renders no `opens` and no grant row |
| `motion` | `--ease-spring` sampled at 1,000 points: last value 1, max ≤ 1.05; no duration token > 300 ms; under `prefers-reduced-motion` every duration is 1 ms and every state still changes something |
| `bundle` | the §7 rows |
| `a11y-tree` | for every fixture block and the degraded fence, the accessibility tree of `<Block>`/`<Table>` equals that of `toHTML`'s markup parsed by the browser, and the `--cells` and `--cols` values are equal — 36 §9's stage-3 row |
| `shell` | `/r/obligations` requested directly answers `index.html` (the SPA fallback) and the grid renders; `/_app/version.json` exists and equals the build's |
| `grid-contract` | the §4.2 checklist; `aria-rowcount` = N or −1 by rule; DOM rows = `min(rows, 2,000)`; the cap line at 2,000; header cell widths === body cell widths exactly; no phantom tracks and an empty tail < 2 px on every grid and flex container (22 §10's assertion) |
| `page-render` | every declared block appears once, in order; each `empty:` string appears **iff** its query returned zero rows; a failed block renders `role="status"` and the page one `role="alert"`; the unknown-primitive fixture renders *Block "…" needs a newer client.* |
| `draft-survives-load` | type into a Sheet, then release the gated `schema` load → the typed text is still there; removing the seed guard makes it fail |
| `no-model` | with `SPARK_ENDPOINT` unset every spec passes and no element's text contains *Spark* |
| `job-view` | one row per tool call; a fold names both lengths; a one-line result is unfolded; `after=` is monotonic and reaches a non-zero value; events received after the panel closes > before; no request while no job is live |
| `keys-sheet` | the `?` sheet lists exactly the registry; every palette row's printed `<kbd>` matches its binding; nav destinations equal the drawn nav |

**Explicitly not a gate:** HTML snapshots and full-page pixel diffs; screenshots are artefacts on failure (22 §10).

---

## 10 · Deliberate ceilings

- `ponytail:` SvelteKit's client runtime ships inside the 30 KB entry; if the `bundle` gate fails on it, the recorded
  path is `hydrate()` from `svelte` plus a 60-line router in `lib/router.ts` with the route files as a table — never a
  bigger budget.
- `ponytail:` the shell links the house theme; a record with an installed theme paints house until `boot()` returns —
  prerender a per-record shell only if that frame is ever seen in a trace.
- `ponytail:` `/s/<token>`'s title and preview are client-rendered; per-token prerendering when a shared page must read
  as a landing page to a crawler (19 §5).
- `ponytail:` no DOM virtualisation — keyset pages of 200 into a chunked grid capped at 2,000 rows; add windowing
  when the real-device LoAF trace over the 2,000-row page exceeds the frame budget (13 §4.3's medium confidence).
- `ponytail:` the grid's filter is a flat `all:` of leaves; groups, `any:`/`none:` and the four-surface query
  builder of 21 §4 are authoring-tier; a nested tree still round-trips through `w=`.
- `ponytail:` a filtered count is `200+ of N` until the last page — add `total` to `list`'s reply when it matters.
- `ponytail:` preferences are a per-device cookie — move to a `member('*')` column and a `setPref` method when a
  second device disagrees about nav order.
- `ponytail:` the outbox is `localStorage`, drained by the page — IndexedDB and Background Sync when drains must
  happen with the tab closed.
- `ponytail:` the dialect editor is a per-segment textarea — per-kind forms and CodeMirror after the Custom Highlight
  spike (22 §8, 21 §7).
- `ponytail:` field labels are ids with `_` as a space — a `label:` key on the field declaration when a pack needs
  a different word (02 §5 has none today).
- `ponytail:` nav reorder by pointer uses the native HTML drag-and-drop API — no touch drag; a phone reorders through
  the `⇧F10` menu, which 19 §3 requires anyway.
- `ponytail:` on a socket frame a multi-page grid refetches page 1 and marks the rest stale — refetch every loaded
  page if the *Refresh* control is pressed more than the log suggests people tolerate.
- `ponytail:` one reconnect policy (5–30 s jitter, then 15 s polling) — no backoff ladder until a deploy storm is
  observed.
- `ponytail:` the two-agents collision row is drawn; `Compare` is not built (23 §12).
- `ponytail:` `/start` embeds two register declarations copied verbatim from the first-party packs — a `installPack`
  of a one-register pack when the installer can adopt an identical declaration (§13).
- `ponytail:` the shared page `/s/<token>` reuses `Page` with `me.level = read` — snapshot and export share intents
  (19 §5) arrive with collaboration tier 1.

---

## 11 · Dependencies

| Kind | Package | Version | Note |
|---|---|---|---|
| runtime | `svelte` | 5.57.0 | the only runtime dependency of any app or package besides the Worker's two (35 §2) |
| workspace | `braindog-render` · `@braindog/where` · `@braindog/declare` | `workspace:*` | `render` also on npm; internal names fail loudly under `linkWorkspacePackages: false` |
| dev, workspace | `@braindog/fixtures` | `workspace:*` | the eight reference pages |
| dev | `@sveltejs/kit` | 2.70.3 | 31 §3 |
| dev | `@sveltejs/adapter-static` · `@sveltejs/vite-plugin-svelte` · `vite` | the releases compatible with Kit 2.70.3 on 2026-09-02, pinned exactly in `package.json` at first install | 31 §3 does not carry them — §13 |
| dev, workspace | `@braindog/theme` | `workspace:*` | `scripts/theme.mjs` only — a build-time edge, §13 D18 |
| dev | `typescript` · `svelte-check` | 6.0.3 · current | type-check only; `svelte-check` for `.svelte` |
| dev | `@playwright/test` · `axe-core` | 1.62.1 · 4.13.0 | 31 §3 |
| dev | `stylelint` + `stylelint-declaration-strict-value` + `stylelint-value-no-unknown-custom-properties` | pinned at first install | the three rules of 22 §7 gate 1 and `property-disallowed-list` |
| dev | `web-vitals` | current | LCP/INP/CLS in the harness only |

No table library, no icon library, no date library (`Intl` throughout — 13 §8), no state library, no CSS framework,
no CodeMirror in the entry graph.

---

## 12 · Build order

**Before this:** spec 36 (`render`'s root — the subpath of §2.7 is built as stage 1 here), spec 38 (`where` root),
spec 42 (`declare` schemas and YAML), spec 40 (fixtures), spec 39 (`theme`, for `scripts/theme.mjs`), and a running
host — spec 49's self-host with spec 45's `boot`, `page`, `list`, `schema`, `markRead` and `listJobs` behind it — for
every e2e gate.

**Stages inside this spec, from 22 §11, in order:** 0 tokens and `app.css` with the four CSS gates on day one
(stage 2 of 22 §11 is pulled first here because every component written before the gates exists must be re-audited)
· 1 the shell, `+layout.ts`, the `braindog-render/svelte` subpath with its parity gate, `Page` over the 12-row
fixture · 2 `Grid` over `Table`, `--cols`, chunks, keyset pages, the cap · 3 writes, refusals, 409, the socket and its fallback · 4 nav,
palette, the registry, 390 px, RTL · 5 `Dialect` Tier 1 · 6 `sw.ts` and the outbox · 7 screenshot mode and the
job view.

**Unblocks:** spec 51 (`ASSETS` binds `apps/web/build`; `deploy-parity` reads `index.html` and
`_app/version.json`), spec 49 (the self-host serves the same directory), spec 52 (the Playwright rows are this
spec's §9), and 36 §9's stage-3 parity row.

---

## 13 · Decisions taken here

| # | Decision | Amend |
|---|---|---|
| 1 | **A static shell; no server renders a request.** SvelteKit builds `build/` once; both hosts serve it unchanged and answer `index.html` for any non-file path (51 A16, D4). `svelte/server`'s `render()` is used by the `a11y-tree` parity gate only. Chosen because 51 already fixes the Worker as never importing or rewriting the shell, and because it deletes the handler, the nonce plumbing, the document ETag and the adapter split | 22 §2 constraint 2 (*the app's only SSR entry* → *the parity test's*); 22 §9 (ETag row → the shell's bytes; `/api/*` `no-store`); 28 §5 mechanism 2 (server-side attribute → the hashed one-statement script) and 3 (SSR head → the linked house theme, then `boot`); 31 §8 (`entry-ssr.ts` → `+layout.ts`); 31 §2 row 14–15 (the edge to `web` is the asset directory); ADR-045 keeps Svelte 5 + SvelteKit 2 |
| 2 | **Adapter: `adapter-static`**, `fallback: 'index.html'`, `ssr = false`, one build for both hosts; `build/` is 33 §7's `assets.directory` | 22 §9 *differs in exactly three ways* → two: assets from disk, the storage adapter; 31 §3 pins `adapter-static` |
| 3 | **Grid strategy.** No virtualisation; 200-row keyset pages into rowgroups of 100 under `content-visibility`; DOM cap 2,000 with the cap line; `aria-rowcount` `-1` while a filtered total is unknown; sort client-side only when fully loaded | 13 §4.3 (*virtualise above 2,000* → *cap at 2,000, keyset beyond*); 22 §4's last row |
| 4 | **The allow-list build.** `scripts/allow.mjs` = `copy.ts` values ∪ template `Text` nodes ∪ `Kbd` names → committed `allow.json`, gated for exactness, loaded on first toggle, outside the entry budget; plating is a transparent-text plate on an inline span | 19 §6 and 32 §9.1 state the build step |
| 5 | **Socket policy.** Reconnect at 5–30 s jitter; two failures → 15 s `/api/version` polling plus one socket attempt per 5 min; a hidden tab pauses both; the frame is 51's `{ version, registers }` and nothing else; job events are **polled** every 700 ms while a job is live | 22 §5 (the fallback's cadence); 23 §3.1 (*over the WebSocket* → polled; `GET /api/jobEvents` → `listJobs({ id, after })`) |
| 6 | **Preferences are the `bd_pref` cookie**, applied by a hashed one-statement inline script before first paint; per device | 28 §5 *preference row* → *preference cookie*; 19 §5's store row names it |
| 7 | **The shapes this app renders.** `boot()` carries `theme { id, version, css }` and `me { person, level, owner, records }`; `page()` returns `blocks[].{ rows, total, drawn, stale_at }`, `kinds` and pre-resolved `values`; `listJobs` takes `after`; Spark presence is `GET /api/version`'s `spark` (46 §5.1), not a `boot` field | 33 §2 and spec 45; 22 §5's `{ page, rows, version, etag }` shape |
| 8 | **A saved view is a named predicate**; `order` is URL state; `⌥V`/`⌥B` write through `setDeclaration`, so they exist for `owner` only | 19 §1 and 02 §5 say so; 34 §1.7 unchanged |
| 9 | **409 re-apply rule.** One automatic resend with the same `op_id` when the other actor's change is disjoint from the patch; otherwise re-present both values | 22 §5's *re-read, re-apply* row states the condition |
| 10 | **`braindog-render/svelte` is specified here** (§2.7): fourteen files under `packages/render/svelte/`, MIT, mirroring 36 §5.9's markup so the parity gate holds by construction; `Table` is the one component with behaviour | 36 §1 and §13 point their stage-3 rows at this spec; 31 §2 unchanged |
| 11 | **A client-minted `X-Request-Id`** on every call is the copyable id of the `error` state; hosts log it | 33 §4; 19 §6's *copyable request id* names its source |
| 12 | **`/jobs/<id>` is a route** that opens the palette in job mode over the shell — the way back to a run you walked away from | 19 §2's address table gains the row |
| 13 | **`/start` installs one register by `setDeclaration`** with the first-party pack's declaration verbatim (`pack:` stamped); the later pack install must treat an identical-checksum declaration as *already present, unchanged* | 04 §3's diff gains that line; spec 42's planner |
| 14 | **The default register projection** is `seq · title · mobile · state · indexed`, ≤ 10 columns, with the per-type widths of §5.2 step 2 | 29 §5's *default projection* is defined here; 13 §4.2 unchanged |
| 15 | **Layout switches at 900 px and 640 px, size on pointer only.** Sidebar → tab bar at 900; cards by default below 640 | 19 §3 has 900; 13 §10 gains 640 |
| 16 | **UI copy lives in one file, `copy.ts`**; refusal sentences are the server's `fix`, never rewritten | 13 §6, 23 §7 |
| 17 | **`/<ID>` is resolved by the shell** — `[id]/+page.svelte` calls `get({ spoken })` and `replaceState`s to the canonical address; there is no server 302 | 33 §4's `/<ID>` row and 19 §5, as 51 D19 already asks |
| 18 | **The house theme is built into the shell** by `scripts/theme.mjs` from `@braindog/theme`, committed as `src/theme/house.css` and gated for exactness; an installed theme arrives with `boot()` | 31 §2 row 13 gains a dev-time edge to `theme` (4); 28 §5 mechanism 3 names the file |

---

## 14 · Done when

- [ ] The eight fixture pages render through `Page` and every gate of §9 passes over all 128 configurations.
- [ ] `bundle`: entry JS ≤ 30 KB and CSS ≤ 12 KB brotli; fonts two files ≤ 45 KB; the editor and allow-list chunks unreachable from the entry.
- [ ] The 5,000-row fixture shows 2,000 rows, the cap line, `aria-rowcount` 5,000, and header widths equal to body widths exactly.
- [ ] A write refused at `fields.due` keeps the typed value on screen with the `fix` beside the field; a 409 on a disjoint field lands without a prompt; a 409 on the same field asks.
- [ ] Pulling the socket produces polling within 60 s; a frame naming a page's register refetches exactly one `page()`.
- [ ] `?` lists the registry; every palette row prints its key; `Character keys: off` silences every bare letter and no chord; `Space` scrolls in a 500-row grid.
- [ ] Screenshot mode: boxes and page height identical off → on; digits `0` and `8` pixel-identical; `/vault` absent.
- [ ] `SPARK_ENDPOINT` unset: every spec green, the word *Spark* nowhere in the DOM.
- [ ] Leaving Home advances `member.seen_at`; opening it does not.
- [ ] Both hosts serve `build/` unchanged: `/r/obligations` on either answers `index.html` and renders the grid; `deploy-parity` matches `/` and `/_app/version.json`.
- [ ] The `a11y-tree` parity gate is green for all sixteen kinds and the degraded fence — 36 §9's stage-3 row.
- [ ] `node --test` runs the twelve unit tests in under a second; every `ponytail:` line of §10 is a comment at its call site.
- [ ] Every row of §13 is applied to its design document in the same revision.

---

*Previous: [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md). Next: [51-SPEC-WORKER](51-SPEC-WORKER.md).*
