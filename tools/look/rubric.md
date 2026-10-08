# Reading a look

What the reading agent checks on every picture of a look, and how it writes `read.json` (the shape is
`read.schema.json`). The loop's integrator reads the same pictures again and signs. Those two readings are DIRECTION
36's "looked at by an agent" and "by the loop".

## Before the pictures

1. Open `said.json`. Note the source and whether it counts as seen (`look.seen`): the seed and the lived record never do.
2. Read `missing` and `cannot`. Each is a screen of the set that was not drawn. Copy every one into `notDrawn` with its
   reason. A screen that was not drawn is not seen. It never passes.
3. Read each line of `shots` for what is already counted: `settled` other than `ready` or `empty`, `waited.busy` still
   busy, `overflowPx` above 1, `writesBlocked` above 0, `consoleErrors`, `failedRequests`, and anything under `raw`.
   Each of those is a fault before a picture is opened. Find it on the picture and quote it.
4. Open the sheet of each theme (`sheet-<set>-light.png`, `sheet-<set>-dark.png`), then each first screen
   (`<screen>-<width>-<theme>.png`) and, where the first screen cuts something off, its `-full.png`.

## The checks, on every screen

Every answer names the images it was read from, by file name, and quotes what is on them. "Looks fine" is not an
answer. Say what is there.

| Check | Passes when |
|---|---|
| `board` | One flat board. Every block is a tile: flat, opaque, no border, no shadow, radius 16, on a flat board colour. Nothing floats on the board but the page header. No glass, no gradients, no floating cards. The rail is the board's flat left column, not a card. |
| `header` | The page's name at 28px with its icon and one headline sentence at 17px under it, in body colour. No hero card, no 40px sentence, no card around the header. |
| `accent` | One red working accent (DIRECTION 42) for selection, primary buttons, links and charts. No blue left from before. No second accent. Status shows as a small dot and a word, never a fill across a whole line. |
| `late` | Anything late or needing the person takes the deeper red and also carries a mark or a word ("Late", "Needs you", a count). Colour alone fails, and it fails in both themes. |
| `buttons` | Buttons are rectangles, radius 8. Pills (fully round) only for counts. No dashed chips for empty fields. |
| `type` | Body text 15px or more, meta 13px, weights 400 to 600, Geist, tabular figures for money. Nothing grey on grey. |
| `width` | Full width with fluid gutters at 1512 and 1728. No narrow centred column with empty space beside it. At 390, one column, 12 to 16px gutters, nothing sideways. |
| `chart` | A chart is drawn only with at least three points and only when it says something. Otherwise the tile shows the number. No wall of charts. |
| `raw` | No raw id (a ULID, `tools#8`, `S731`), no raw time (`2026-10-06T19:07:01.610Z`), no placeholder (`{{revenue.monthly}}`), no `undefined`, `NaN` or `null`, no file path or host name. An agent's handle may sit beside its name, never alone. |
| `words` | Plain words that name their own things. No "row", "list item" or "entity" on screen. No em dash. |
| `agree` | Two numbers that should agree do: the headline against the list under it, a count in the rail against the page, Decide's count against Today's line. Quote both. |
| `cut` | Nothing is cut off, overlapping or clipped at any width: titles, figures, buttons, the last line of a list against the bottom bar. |
| `empty` | Nothing is empty that the record has data for. A blank tile, an empty chart, a "nothing here" over a list `said.json` says holds things, or a loading shape still on screen all fail. |
| `phone` | The phone shows the same facts as the laptop: the same headline, the same counts, the same first things. Less room is fine. Different facts are not. |
| `template` | No AI-template look: no two-tone headings, chip clouds, glows or grids of feature cards. Fewer things on screen, not more. |
| `theme` | Light and dark are both readable and both the board. Where `schemeKept` is on a line, the record keeps the other scheme; say so and judge the picture as drawn. |

A check that cannot be judged on a screen (no chart drawn, for `chart`) is `n/a`. A check that cannot be judged
because the picture is unclear is `cannot-tell`, with the reason, and it does not pass.

## Writing `read.json`

- One entry in `screens` for every screen drawn, with every check above and the images each was read from.
- Every fault also goes in `faults`, with the screen, the check, the images, what is wrong in one plain sentence, and
  how much it costs: `blocks` (wrong or unreadable facts, a screen that did not draw), `hurts` (the direction broken
  where a person sees it), or `polish`.
- The look passes only when every screen passes every check, nothing is in `notDrawn`, and `look.seen` is true. On the
  seed or the lived record it can be clean and still not count as seen.
- Name things by what the person calls them (Money, Crumb.gg), never by a key or an id.
