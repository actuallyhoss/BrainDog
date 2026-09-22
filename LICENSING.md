# Licensing

Two licences, by path.

| Path | Licence | SPDX |
|---|---|---|
| everything not listed below | Apache License 2.0, the root `LICENSE` | `Apache-2.0` |
| `packages/render/**` | MIT, `packages/render/LICENSE` | `MIT` |

## Why two

**Apache-2.0 for the product.** Permissive, with an explicit patent grant and a trademark clause,
both of which matter for a product with a company behind it and neither of which costs an adopter
anything. The business is the hosted record and the data in it, not the source, so the licence has
no work to do beyond getting out of the way.

**MIT for `packages/render`.** The block dialect is meant to be embedded anywhere, including in code
that is not open at all, and MIT asks nothing of whoever embeds it. It is published to npm as
`braindog-render` and carries an SPDX header on every source file.

Nothing under `packages/render` may import from any other package in this repository.
`tools/gates/graph.mjs` asserts it: `render` has in-degree 0 in the package graph, so any dependency
it acquires is a finding.

**Third-party path data.** `packages/render/src/glyphs/core.ts` and `set.ts` carry icon path data from
Lucide (https://lucide.dev), ISC License, Copyright (c) 2026 Lucide Icons and Contributors, including a
few glyphs from Feather, MIT, Copyright (c) 2013-present Cole Bemis. The full notices are in
`packages/render/src/glyphs/NOTICE`.

## Applying the notice

Source files under `packages/render` carry `// SPDX-License-Identifier: MIT`. Everything else is
covered by the root `LICENSE` and needs no per-file header. If you add one, it reads:

```
// SPDX-License-Identifier: Apache-2.0
```
