# When a plugin will not install

A pack that cannot install is refused with one sentence saying what is wrong and what to do, and a code in capitals naming the kind of fault. `braindog addon check` says the same sentence a record would, so you meet each of these on your own machine first. This page lists them by where you meet them, each with its sentence.

Sentences in a code block are copied from what `braindog addon check` printed. The rest are written the way the code writes them, with the parts that change in angle brackets. The codes are the ones on this page.

## Reading the file

Before anything is installed, the file itself is read.

```code | A declaration that is not one of the kinds (PACK_MALFORMED)
A declaration begins with its kind: one of register, page, block, ingest, rule, metric, theme, digest, script, job. This one begins with widget.
```

```code | Example rows that are not a list, and too many of them (PACK_MALFORMED)
Seeds are a list of examples, at most 8 per register.
reading-list seeds items 9 times, and a list takes at most 8 example rows.
```

```code | A credential anywhere in the file (SECRET_IN_PACK)
This file holds what looks like a credential at seeds[0].fields.name. An add-on never carries one; take it out and publish it again.
```

```code | A name BrainDog keeps (PROVIDES_CONFLICT)
money-core is a name BrainDog keeps for its own modules and starters. Give this add-on another id.
This add-on declares a list called tasks, which belongs to BrainDog's Work module. Name the list something else.
```

```code | A dialect newer than the record (FORMAT_OUT_OF_RANGE, PRIMITIVES_OUT_OF_RANGE)
reading-list needs format 2 and this BrainDog is at 1. Update BrainDog.
reading-list needs primitives 9 and this BrainDog renders 1. Update BrainDog, or ask the author for a build against the primitives it renders.
```

- **`PACK_OVER_CAP`**, a file past the size a plugin may be: "This file is <n> KB, and an add-on is at most <n> KB. Ship fewer example rows, or split it."
- **`PACK_MALFORMED`**, a file that is not a plugin at all: "This is not an add-on file: it has no pack in it." A starter gets "This is a use-case file, not an add-on. Publish it as a use case."

## What it needs installed first

```code | A pack it needs, at a version the record does not have (OUT_OF_BOUNDS)
reading-list needs people >=1.0.0 <2.0.0, and this BrainDog has 2.2.0.
```

- **`DEPENDENCY_UNRESOLVED`**, a pack it needs is not installed: "<pack> requires <pack>: not installed. Install the pack that declares it first, or use --with-deps."
- On your own machine, `check` can install first only the packs BrainDog ships. For any other, it says so and stops: "It needs stripe, which is not one of BrainDog's modules, so a scratch BrainDog on this machine cannot hold it first."

## Lists

```code | Fields (FIELD_TYPE_UNKNOWN, FIELDS_OVER_CAP, INDEXES_OVER_CAP, STATE_NOT_ENUM)
items.price: type "currency" is not a field type BrainDog knows; did you mean 'money'?
items declares 74 fields. The ceiling is 64: a register with more than that is a database, not a register.
items: 9 indexed fields; the ceiling is 8.
items.state: state is a reserved id and is always an enum.
```

```code | Example rows on a list with no tags field (FIELD_UNKNOWN)
items has an example row and no tags field, so its examples could not be told from its real rows.
```

```code | A short name another list already uses (SEQ_PREFIX_TAKEN)
register.items: seq_prefix 'D' is taken by decisions. D, SG and S are the kernel's.
```

- **`SEARCH_FIELD_TYPE`**, a field search cannot read: "<list>.<field> is a secret, and search reads what a row says, never where its key is sealed."
- **`REQUIRED_WHEN_OP_UNSUPPORTED`**, a requirement that searches instead of comparing: "<list>.<field>'s required_when uses matches, which searches rather than compares. A requirement is one comparison on the row: use is."
- **`PROVIDES_CONFLICT`**, an extension laying a field a list already has: "<list> has a field called <field> already, and <pack> lays one of its own under that id. Two fields cannot share an id, so <pack> has to lay its field under another id."

## Pages and blocks

```code | A list nothing declares (REGISTER_UNRESOLVED)
reading-list points at the books list (page.reading-list.requires), which is not here and reading-list does not declare. Install the pack that declares books first, or declare it in reading-list.
```

```code | A kind of block nobody declares (KIND_UNKNOWN)
page.reading-list.blocks[0] draws block.risk-grid, and no installed pack declares it, so the page would open with a hole where the block should be. Install the pack that declares block.risk-grid first, or use a kind this build draws.
```

```code | A colour on a page (COLOUR_OUTSIDE_THEME)
page.reading-list sets blocks[0].tone to #E11D48. A page names an intent (good, warn, bad or info), and the theme names the colour.
page.reading-list sets colour to red. A page names an intent (good, warn, bad or info), and the theme names the colour.
```

```code | A key the documents describe and this build does not draw (NOT_IN_THIS_BUILD)
page.reading-list declares filters:, which the documents publish and this build draws nowhere. Take it off; a filter is a where: on each block for now.
```

```code | A kind of block with a number out of range (DECLARATION_INVALID)
block.risk-grid: cells is how many cells a row takes, a whole number from 1 to 8.
```

## Rules and figures

```code | Figures (METRIC_NEEDS_TARGET_OR_WINDOW, GROUP_BY_TWICE, DECLARATION_INVALID)
metric.open-items: a number with no target is decoration; a number with no comparison window cannot be acted on.
metric.by: group_by takes one field. Two dimensions is a report generator.
metric.open-items's format is null. A metric is money, int, decimal, pct, days, duration, day.
```

```code | Rules that could run away (REQUIRED_MISSING, CREATE_UNBOUNDED)
rule.spawn creates about a row and declares no once_per, so it would do it on every write of the row.
rule.spawn: create has no bound. A generator with no ceiling fills your BrainDog.
```

```code | A condition the words cannot say (MATCH_OP_UNSUPPORTED)
rule.longs cannot be read: name starts Re: starts is not something a filter can say. Write is, is not, before, after, on, has, lacks or contains.
```

```code | A step this build cannot run (NOT_IN_THIS_BUILD)
rule.pad_second_opinion asks Slash at steps[0], and no host in this build answers an automation's question to Slash. Ask a person with ask_person instead.
```

- **`CREATE_OVER_BOUND`**, a rule that could make more rows than its bound: "<rule>: <counts multiplied> = <n> exceeds bound <n>."
- **`CREATE_FOREIGN_REGISTER`**, a rule making rows in another pack's list: "<rule> writes register.<list>, declared by <pack>. A pack generates only into its own registers."
- **`GROUP_BY_CARDINALITY`**, a figure split by a field with too many values: "<metric>: group_by <field> has <n> possible values; the ceiling is <n>."
- **`RATIO_MIXED_SOURCE`**, a ratio of two different sets of rows: "<metric>: both operands must share one source and one predicate."

## Themes

```code | Colours a theme cannot build from (THEME_VALUE_INVALID)
theme.midnight.seed.accent: "#CF413ACC" carries an alpha. A role is opaque, or every contrast measured against it is measured against a colour that never ships.
theme.midnight.seed.accent "oklch(0.62 0.01 262)" is almost grey; there is no hue to build from. Pick a colour with some chroma in it.
```

- **`INTENT_INSEPARABLE`**, two of good, warn, bad and info too close in hue: "theme: <intent> and <intent> are <n>° of hue apart, and four intents need at least <n>°. Delta-E counts lightness, so a pale tint of a hue measures far from it and reads as the same colour."
- **`CONTRAST_FLOOR`** and **`THEME_LADDER_ORDER`**, a pair of roles below the contrast floor, or surfaces out of order, each with the role named.
- **`REMOTE_ASSET`**, a theme value that loads something from elsewhere: "<key>: <value> contains <what>. A theme sets token values and loads nothing from elsewhere."

## Settings

```code | A setting of a type a setting does not take (CONFIG_TYPE_UNSUPPORTED)
The setting shelf is a ref, and a setting never points at a list, so a pack cannot configure its way into one it did not declare. A setting is text, enum, bool, money, day, duration, number or list.
The setting token is a secret, and a manifest is a file people share, so a setting never holds a credential or a file. A setting is text, enum, bool, money, day, duration, number or list.
```

- **`PACK_MALFORMED`**, a setting's name: "<name> is not a setting name: lower-case letters, digits and underscores, at most 32."
- **`ENUM_VALUE_UNKNOWN`**, a value outside an enum's values: "The setting <name> is one of <values>, and <value> is not."
- **`FIELD_UNKNOWN`**, a placeholder for a setting nobody filled: "<declaration> reads the setting <name>, and a setting is filled only when its pack is planned and installed with a value for it."

## Scripts, jobs and calling out

```code | An address that is not written out in full (ACTION_HOST_COMPUTED)
script.fetcher's egress "https://api.example.com/v1" must be an origin written out in full: https:// and a host, with no path, no placeholder and nothing computed, so the install diff can print it.
```

```code | A schedule faster than the floor (ACTION_INTERVAL_TOO_SHORT)
rates may be fetched no more often than every fifteen minutes.
```

```code | A key that is not in the Keychain yet (REQUIRED_MISSING)
Add the key called "stripe" to the Keychain, then install.
```

```code | A job that would skip its permissions (DECLARATION_INVALID)
job.release-notes would skip the run's permissions, and no job skips them in this build. Use dontAsk, which runs only the tools it names.
```

- **`ACTION_NOT_HTTPS`**, an address that is not `https://`: "<ingest> calls <address>, and a scheduled action calls an https:// address only."

## Anything else: `DECLARATION_INVALID`

Every declaration's keys are a closed list, and a key that is missing, misspelt or holding the wrong shape is `DECLARATION_INVALID`, with the key named and what it should hold. Two of them, as printed:

```code | DECLARATION_INVALID
ingest.reading-feed.map[0].name's type is null, and a mapped field is one of text, int, decimal, money, day, instant, enum, bool, duration, url, email, document, json.
job.reading-notes's argument title says how long it may be, a whole number from 1 to 64.
```

## Upgrading a record

A new version is planned against what the record holds, so some refusals arrive only then.

- **`PLAN_STALE`**, what the plan would do changed after it was made: "What this would install changed after the plan was read, so nothing was installed. Read the plan again."
- **`FIELD_TYPE_CHANGED`**, a field's type changed under rows: "<list>.<field>: <old type> → <new type> changes a type, and <n> rows were written under the old one. Retire the field and add a new one."
- **`ID_RENAMED`**, an id changed: "<old id> → <new id> renames a spoken id, so <list>#<n> in a note would stop resolving."
- **`REQUIRED_ON_POPULATED`**, a field made required on a list with rows: "<list>.<field> is required and <n> rows have none. Give it a default, or fill those rows first."
- **`WOULD_ORPHAN`**, a version that retires a list still holding rows: "<pack> <upgrades or downgrades> away <list>, and there are <n> rows in it. Move them first."
- **`PROVIDES_CONFLICT`**, a declaration another pack owns: "<declaration> belongs to <pack>, and two packs cannot own one declaration."
- **`PACK_DISABLED`**, an upgrade of a pack that is turned off: "<pack> is disabled. Enable it first, then install or upgrade it."

## Publishing to the Kennel

The Kennel reads a submission the way a record installs one, and adds its own checks.

- **`ALREADY_KNOWN`**, a version already there: "<id> <version> is already in the Kennel, and a published version never changes. Submit this file as a later version."
- **`ALREADY_KNOWN`**, a version earlier than the latest: "<id> <latest> is already in the Kennel, so this file needs a later version than <version>."
- **`PACK_MALFORMED`**, a version number smaller than the change: "This version takes away a list, a page, a module or a field a record may hold rows in, which is a major change from <latest>. Publish it as <next major> or later, not <version>."
- **`PACK_MALFORMED`**, no title: "The Kennel lists a file under its title, and this one has none. Add a title and submit it again."
- **`PROVIDES_CONFLICT`**, an id somebody else published first: "<id> belongs to another publisher in the Kennel. Give this one another id."
- **`PROVIDES_CONFLICT`**, publishing as BrainDog: "BrainDog is the name BrainDog publishes its own under. Publish this one under your own name."
- **`SIGNATURE_INVALID`**, a later version signed by a different key: "Earlier versions of <id> are signed by key <key>, and this one by key <key>. Sign it with that key."
- **`SIGNATURE_INVALID`**, a revoked key: "Key <key> is revoked, so it signs nothing more. Sign with the key it rotated to."
- **`RATE_LIMITED`**, too many submissions in a day: "The Kennel takes <n> submissions a day from one publisher, and this would be one more. Submit it again tomorrow."
- **`PACK_OVER_CAP`**, a file too large for the Kennel: "This file is <n> KB, and the Kennel takes at most <n> KB. Ship fewer example rows, or split it."
- **`FORBIDDEN`**, a yank by somebody else: "Only whoever published <title>, or the operator, yanks a version of it."
- **`ALREADY_KNOWN`**, a second yank: "<title> <version> is already yanked."
