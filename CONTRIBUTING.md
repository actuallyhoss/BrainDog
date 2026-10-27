# Contributing

Read this before you write anything. Most of it is not the usual formalities — the clean-room rule
and the house style are load-bearing, and a pull request that ignores them is rejected on sight
rather than reviewed.

**The design is the source of truth.** [`docs/`](docs/) is 54 numbered documents and they decide what
BrainDog is. Code that disagrees with them is a defect in one of the two, and the change fixes one
and says which. Do not design in a pull request: if you think a document is
wrong, amend the document in the same change and argue it there.

---

## Before you open anything

| You want to | Do this |
|---|---|
| Report a defect | [Bug report](../../issues/new?template=bug.yml). Say what you expected, what happened, and which document says so |
| Propose a feature | [Feature request](../../issues/new?template=feature.yml). It must cite the document it belongs in, or argue for a new section |
| Report a vulnerability | **Not an issue.** [`SECURITY.md`](SECURITY.md) |
| Ask a question | A discussion, not an issue |
| Send a large change | Open an issue first. There is one maintainer, and an unreviewed 2,000-line branch is a week nobody has |

---

## Building

Toolchain, pinned ([ADR-039](docs/16-DECISIONS.md)):

- **Node 24.13.0.** Not 22, not 25. Node 24 strips TypeScript types, which is why there is no build
  step for most packages and why tests are `node --test` over `.ts` source.
- **pnpm 11.25.0, via corepack.** The `packageManager` field pins the exact version and its hash.
- **TypeScript 6.0.3, type-check only.** `tsc` never emits.

```sh
corepack enable
pnpm install --frozen-lockfile
```

`--frozen-lockfile` is not optional, in CI or locally. `pnpm-workspace.yaml` also sets
`minimumReleaseAge: 1440`, so **a package published less than 24 hours ago will not resolve** — that
is deliberate supply-chain quarantine, not a broken install.

### The commands

| Command | Runs |
|---|---|
| `pnpm typecheck` | `tsc -b` over every package and app, under `exactOptionalPropertyTypes` and `erasableSyntaxOnly` |
| `pnpm test` | every package's `node --test` over `.ts` source, one workspace at a time |
| `pnpm gates` | every gate, in registry order, from the repository root (`pnpm gates -- --list` prints them) |
| `pnpm dev` | the web app at `http://localhost:5183` |
| `pnpm build` | every package and app that has a build |
| `pnpm shots` | screenshots of every route, both schemes, into `apps/web/shots/` |

**Do not run `pnpm gates` and a dev server at once** — `layout` and `a11y` drive a real browser and
bind a port.

A full gate run takes about half an hour, most of it `layout` and `a11y`. Run one gate with
`pnpm gates -- --only <name>`, or directly with `node tools/gates/<name>.mjs`, while you iterate.

### What CI runs

`.github/workflows/ci.yml` runs on every push and pull request to `master`, on GitHub's hosted
runners and with no secrets: the typecheck and tests in four legs, every gate that needs no build,
and the app, site and CLI builds with every gate that reads them. The two browser gates, `layout`
and `a11y`, run in `gates.yml`, which a maintainer starts by hand; label a pull request `full-gates`
to ask for them and for the Windows leg.

---

## The gates

Every change lands with `pnpm test` and `pnpm gates` green. The table is the core of the list;
`tools/gates/run.mjs` registers every gate and argues the order, and its comments are the
specification.

| # | Gate | Holds |
|---:|---|---|
| 1 | `typecheck` | first, because a type error invalidates every gate under it |
| 2 | `self-test` | **the gates' own test.** Runs each gate against a seeded violation in `tools/gates/negative/<gate>/` and is red when one of them passes it. A gate that has never failed is a gate that may not work |
| 3 | `clean-room` | no predecessor identifier anywhere in the tree — see below |
| 4 | `stack` | the banned surface: no `node:`, `cloudflare:`, `process.`, `Buffer`, `__dirname` or bare `fetch(` under `packages/*/src` |
| 5 | `secret-grep` | a credential never reaches a log, a telemetry blob, a push payload or a prompt |
| 6 | `event-kinds` | the forty event kinds agree across the migration's `CHECK`, `30 §1`, `30 §2`'s table and its prose, and `EVENT_KINDS` |
| 7 | `router-groups` | every route has a group; no INTERNAL method is routable; VAULT is cookie-only; ADMIN admits no token principal |
| 8 | `closed-lists` | the other twenty-two closed lists of `34 §6` agree with their owners |
| 9 | `refusals` | the ninety-nine refusal codes, their counting sentence and the exported array give one answer |
| 10 | `no-declarations-in-kernel` | the kernel declares exactly one register, `register.session` |
| 11 | `css-rules` | the twelve CSS rules of `52 §5.2`, plus the dead-class report |
| 12 | `colour-grep` | no colour literal outside the theme |
| 13 | `dead-copy` | every sentence in the copy file is rendered somewhere |
| 14 | `theme` | the generated theme is byte-identical to the committed one |
| 15 | `bundle` | the entry and font budgets, over a real build |
| 16 | `prefs` | every preference moves pixels. The Text setting shipped inert for the life of the build because no gate had ever asked |
| 17 | `keys` | every binding the `?` sheet prints does something, and a binding with no recipe is red |
| 18 | `layout` | every route, on a phone: no clipping, no sideways scroll, no target under 44px on a coarse pointer |
| 19 | `a11y` | every interactive state across both apps |

**Exit 3 is a skip, and a skip is not a pass.** `bundle`, `layout` and `a11y` need a build; without
one they report and exit 3 so `pnpm gates` is still useful on a fresh checkout. Under `CI=true` a
skip is red, because CI builds first.

**A new gate needs a negative fixture.** `tools/gates/negative/<gate>/` holds one seeded violation,
and `self-test` asserts the gate goes red on it, with the right `what` and the right `where`. A gate
without one does not count as a gate.

---

## The clean-room rule

**Nothing is ported from the predecessor codebase.** Not a file, not a function, not a name, not a
comment. Nobody building BrainDog reads the predecessor's code; the design documents are the only
source, and every part is designed on its own merits. The predecessor's *behaviours* were traced into
[`docs/32-PARITY.md`](docs/32-PARITY.md); its *code* stays where it is.

`tools/gates/clean-room.mjs` enforces it by grepping every text file, `docs/` and the gates
themselves excepted, for the identifiers in its `TRIPWIRES` list, case-insensitive. **It is a tripwire, not a proof.** The proof is the rule. Passing the gate is not
evidence you followed it, and an empty list is red, because a tripwire nobody maintains reports "no
findings" over a repository nobody checked.

The list is maintained by the maintainer alone. Do not add to it, do not remove from it, and do not
work around a hit by renaming — a hit means you read something you should not have.

If you have worked on the predecessor, say so in your pull request. It does not disqualify you; it
changes what review looks for.

---

## House style: the comments

This is the most unusual convention in the repository and the one most worth getting right. In
`packages/kernel/src` there are roughly four hundred block comments against eight line comments, and
about 28% of `index.ts` is prose. That is intended.

**The form.** Block comments (`/* … */`), not `//`. Three positions and no others:

1. **A file header block on every file** — 10 to 45 lines. What the module is for, then the one or
   two design invariants that are load-bearing. A gate's header carries its invocation line as an
   indented code line under the first sentence.
2. **A doc block above an exported const, type or function** — the same shape, shorter.
3. **A block immediately above the statement it defends**, indented to the code, wrapped at about
   100 columns, continuation lines aligned under the opening text.

**The opening move.** A capitalised topic clause that states the rule or the defect, then the
argument:

```js
/* AN EMPTY LIST IS RED. A tripwire list that somebody empties to make the gate quiet is a gate that
   reports "no predecessor identifiers" over a repository nobody checked — the same shape as every
   other gate in this directory that passed by examining nothing. */
```

**What goes in one.** Not what the code does — why it is this and not the obvious thing:

- **The defect that existed, in the past tense, with a number attached.** This is the single most
  distinctive trait. `"39 emitted, 60 by nothing, 22 outside the registry"`. `"0 of 182 elements
  moved on Home"`. If a comment describes a fix and never says what going wrong looked like, it is
  not finished.
- **A citation of the document that settles it**, by number and section, in backticks — `` `30 §6` ``,
  `` `04 §5` ``, `` `52 §5.2` `` — and the sentence quoted verbatim where the wording is the point.
  There are over two hundred of these in `tools/gates` and `packages/kernel/src`.
- **The rejected alternative and why**, where one was rejected. "`now` AND NOT `now + every`,
  because …".
- **The scope limit, stated**, where a check is deliberately partial. A check that pretends to cover
  something it does not is the exact failure the gates exist to catch.

```js
/* TWO OR IT IS NOT A CHOICE. One option is an announcement wearing a question mark, and a gate
   that accepts one teaches people that answering is a formality. */
```

**`ponytail:` marks a deliberate ceiling.** The build mode is *ponytail* — standard library before
dependencies, fewest files, no unrequested abstraction — and every simplification that leaves a
ceiling is named in a `ponytail:` line so it is a decision rather than an oversight.

**There are no `TODO`, `FIXME` or `HACK` markers**, anywhere. Zero in the kernel. If it is deferred,
it is a `ponytail:` line with a reason, or an issue with the file and line it was
reproduced at. If it is broken, it is a test.

---

## House style: the tests

Three rules, and they are enforced at review:

1. **Name a test after the failure it prevents**, not the function it covers. `'a 130-value not_in
   compiled to one IN of 130 params (was TOO_MANY_PARAMS)'`, not `'compiles not_in'`. **A regression
   test carries the old wrong number in its name**, so a reviewer sees what it protects.
2. **Assert on something only the real branch produces.** `rows >= 4`, a mark per row,
   `aria-rowcount === page.expect.rows` — never `childElementCount > 0`. A test whose first assertion
   could pass on the error path is rejected. Three tests on this tree have shipped asserting the
   defect they were named for.
3. **Break it on purpose after it goes green.** Change the line the test is about and watch it go
   red. If it does not, the test is decoration. Mutating a file and counting survivors is a good
   habit — but a mutation score is a claim about the mutations somebody thought of, never a property
   of the tests, so do not quote one as if it were coverage.

---

## Commit messages

One commit is one plain sentence and nothing else. The `commits` gate holds every commit a push to
`master` carries to it:

- a subject of at most 72 characters, one sentence, sentence case, no trailing full stop;
- no body, no trailer of any kind (`Co-Authored-By:`, `Signed-off-by:`), no URL, no em dash;
- no merge commits: `master` is linear.

```
Money reads ages and currencies on the payments page
Opening a form puts the caret on its first field
```

Pull requests are squash-merged, so the commits inside one are yours to shape; the pull request's
title becomes the commit, and it follows the same rules. The reasoning a longer message would carry
belongs in the pull request description and, where it outlives the change, in a comment beside the
code.

---

## Pull requests

- **Branch from `master`.** There is no develop branch.
- **One defect class per pull request.** Several findings of the same shape in one change is normal
  and good; two unrelated changes is two pull requests.
- `pnpm typecheck`, `pnpm test` and `pnpm gates` green before you open it. Say so in the description,
  with the counts.
- Fill in [the template](.github/PULL_REQUEST_TEMPLATE.md). The clean-room line and the
  document-citation line are not decoration.
- Screenshots are **artefacts for a human, never an assertion**. Attach them freely; do not add a
  pixel diff.

### Things that will be sent back

- A new **runtime dependency**. They are enumerated in [ADR-046](docs/16-DECISIONS.md) — `valibot` in
  `declare`, one YAML parser on the CLI and self-host paths — and adding one needs an ADR, not a
  line in `package.json`.
- A `node:` or `cloudflare:` import, `process.`, `Buffer` or a bare `fetch(` under `packages/*/src`.
  `packages/record` refuses `fetch(` unconditionally: the record makes no outbound calls, and that is
  a security control as well as a correctness one ([ADR-002](docs/16-DECISIONS.md)).
- A colour, font or spacing literal outside the theme.
- A ninth declaration kind. The list of eight is closed, and the closure is what makes the security
  argument in `04 §7` an enumeration.
- A declaration in the kernel. The kernel declares one register, `register.session`
  ([ADR-026](docs/16-DECISIONS.md)).
- A new closed list that no gate compares against its owner.
- Anything that widens a token's reach. There is no admin scope, ever
  ([ADR-060](docs/16-DECISIONS.md)).

---

## Licensing

Two licences, by path ([`LICENSING.md`](LICENSING.md), [ADR-041](docs/16-DECISIONS.md)):

| Path | Licence |
|---|---|
| everything not listed below | **Apache-2.0**, the root `LICENSE` |
| `packages/render/**` | **MIT** — `packages/render/LICENSE`, and an SPDX header on the first line of every source file |

By opening a pull request you agree your contribution is licensed under the licence of the path it
touches. Nothing under `packages/render` may import from another package in this repository; a gate
asserts the built artefact contains no `@braindog/` or `../../` reference.

---

## Code of conduct

[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) applies to every space this project uses.
