# Licensing

Two licences, by path. The Grafana layout ([docs/31-STACK.md](docs/31-STACK.md) §4, ADR-041).

| Path | Licence | SPDX |
|---|---|---|
| everything not listed below | GNU Affero General Public License v3.0 only — the root `LICENSE` | `AGPL-3.0-only` |
| `packages/render/**` | MIT — `packages/render/LICENSE` | `MIT` |

`packages/render` is published to npm as `braindog-render` and carries an SPDX header on every source file.
Nothing under `packages/render` may import from any other package in this repository; a CI gate asserts the
built artefact contains no `@braindog/` or `../../` reference.
