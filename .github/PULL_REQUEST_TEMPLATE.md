<!--
The title of this pull request becomes the squashed commit: one plain sentence of at most 72
characters, with no prefix and no trailing full stop. "Every list pages its rows", not "fix: paging".
Read CONTRIBUTING.md before filling this in.
-->

## What was wrong

<!--
The defect, with a number attached where one exists. What the code actually did, and why that is a
real defect rather than a cosmetic one. If this adds something that never existed, say what was
impossible without it.
-->

## What the document says

<!--
The citation, by number and section — `13 §4.3`, `04 §5`, ADR-060 — and the sentence quoted where
the wording is the point. If code and document disagreed, say which one this change fixed.
If no document covers this, say so plainly rather than leaving the section empty.
-->

## What this does about it

<!-- The fix, and the rejected alternative if there was one worth naming. -->

## What now catches it

<!--
The test or gate, by name, and what it asserts. If this change adds a gate, name its negative
fixture. If nothing catches it, say so — that is a finding, not an omission to hide.
-->

---

## Checks

- [ ] `pnpm typecheck` green
- [ ] `pnpm test` green — **N tests**
- [ ] `pnpm gates` green, no skips
- [ ] Every new assertion was **broken on purpose** after it went green, and went red.

## The rules this repository actually enforces

- [ ] **Clean room.** Nothing here is ported, adapted or remembered from the predecessor codebase.
      The `clean-room` gate passing is not evidence of this; my word is.
- [ ] No new **runtime dependency**, or one added with an ADR arguing for it.
- [ ] No `node:` or `cloudflare:` import, `process.`, `Buffer`, `__dirname` or bare `fetch(` under
      `packages/*/src`.
- [ ] No colour, font or spacing literal outside the theme.
- [ ] Any closed list I touched is still equal across every source that holds it.
- [ ] No token reaches a method group it did not reach before.
- [ ] No plaintext credential reaches a log, a telemetry blob, a push payload or a prompt.
- [ ] Comments explain **why**, cite the document that settles it, and name the defect in the past
      tense. Any deliberate ceiling is a `ponytail:` line.

## If this touches security

<!-- Delete this section if it does not. -->

- [ ] I have read the scope section of [SECURITY.md](../blob/master/SECURITY.md) and this is a
      hardening change, not a fix for an unreported vulnerability. **A fix for an unreported
      vulnerability does not arrive as a public pull request** — report it privately first.
- [ ] Which class: key handling · operation grants · export/import integrity · the agent surface ·
      plugin installation · cross-record isolation · application security.

## Screenshots

<!--
Artefacts for a human, never an assertion. Attach freely; do not add a pixel diff — rendering varies
with the host OS, version, settings, hardware and power source, so a pixel diff fails on whitespace
and passes on layout bugs.
-->
