# Boards

A board is the picture of one screen that he says yes to before the screen is built or restyled (EXP-A01). Boards
are drawn by the product's own renderer, from a record, by `tools/look/board.mjs`, so there is no second frame to
drift from the real one and every count on a board is computed. The hand-drawn boards in `loop/design/` are retired.

## One folder a board

`design/boards/<board>/` holds:

| File | Kept by | What it is |
|---|---|---|
| `page.dog` | the board's author, optional | A page, in the page source format (`docs/06-PAGES.md` section 1), installed on the copy of the record through the public write path (`setDeclaration`) and drawn at `/p/<page>`. A board with no page draws the screens `checks.json` names. |
| `skin.css` | the board's author, optional | What changes in the look: a sheet put after the product's own sheets on every picture. A board with no `skin.css` draws the screen as it stands. |
| `checks.json` | the board's author | The screen's checks, read by EXP-E04's gate and printed on the sheet. Shape below. |
| `paths.json` | the board's author | The source files this board governs, as a list of globs (`packages/skin/**`). A board folder is never governed: its own files are held as drawn. |
| `yes.json` | `board.mjs --yes` only | His yes: his words and the hashes of what he saw. Never written by hand. |
| `variants/<id>.css`, `variants/<id>.dog` | the board's author, optional | An open choice: a patch drawn beside the base, so a choice is two pictures of one board. A `.css` variant is put after `skin.css`; a `.dog` variant is a whole page that stands in for `page.dog`. |
| `stand-ins/<id>.json` | the board's author, optional | A block the renderer cannot draw yet: `{ "name", "needs", "span" }`. It is drawn on the page as a plain note in its place, outlined dashed on the sheet, and listed. The list is the order book for the pages area. |

### `checks.json`

```json
{
  "board": "frame",
  "title": "The frame",
  "screens": ["today"],
  "source": "lived",
  "checks": [{ "id": "one-board", "says": "Every block is a flat tile on one board.", "by": "eye" }]
}
```

`screens` are keys of `tools/look/screens.mjs` (`today`, `decide`, `question`, `work`, `money`, `project`, `list`,
`row`, `people`, `projects`, `agents`), drawn as the record picks them. `source` is the record the board draws when
`--source` is not given: `lived` unless the screen has no data on the lived record (Jobs), which names `shape:<path>`.
`by` is `eye` for a check a person makes on the picture, or `gate:<name>` for one a gate already holds.

### `yes.json`

```json
{
  "board": "frame",
  "units": ["EXP-A01", "EXP-A02"],
  "said": "the words of the yes, or the decision that takes it",
  "taken": { "on": "2026-10-08", "from": "DIRECTION 42" },
  "seen": false,
  "images": { "candidate/board-frame-390-light.png": "<sha256>" },
  "widths": [390, 1440, 1512, 1728],
  "themes": ["light", "dark"],
  "commit": "<the commit the pictures were drawn at>",
  "paths": { "packages/skin/house.css": "<sha256>" },
  "drawn": { "page.dog": "<sha256>" }
}
```

`board` and `units` are what the planner counts (`loop/tools/plan.mjs`). `seen` is true once the pictures have been
looked at and false while the yes is one taken without them. `paths` holds each governed file's hash, and `drawn` each of
the board's own files' hash, as they were when the pictures were drawn. This is the area's one sign-off file: parts
C, D and E write here, never to a file of their own.

## Drawing a board

```
node tools/look/board.mjs <board> [--source lived|seed|file:<path>|shape:<path>] [--out <folder>]
node tools/look/board-sheet.mjs <drawing folder>
node tools/look/board.mjs <board> --yes "<the words of the yes>" --from <drawing folder> [--taken "DIRECTION 42"] [--seen] [--units EXP-A01,EXP-A02]
```

The board is drawn at 390, 1440, 1512 and 1728, light and dark, on a copy of the record; it never draws `live`.
`--source shape:<path>` draws a shape copy (a record with its values scrambled, made by `braindog export --shape`), opened by the look's file source; until PRF-A13 job 5 is in, it says it waits for it. Each drawing
writes `drawing.json` beside its pictures, and `--yes` copies its hashes into `yes.json` only while the board and its
governed files are still as they were drawn.

## The gate

`tools/gates/board-yes.mjs` reads every board, by hashes and never by dates. A board with a `yes.json` holds, whether
or not it has been seen yet: a governed file that changed since the yes, a board file edited after it, or a yes taken
at fewer widths or themes or naming fewer pictures than it was taken at, is red with
"this screen has no board with a yes". A board with no `yes.json` governs nothing yet, so the gate tightens
board by board. To change a governed screen: change the board, draw it, show the sheet, take its yes.
