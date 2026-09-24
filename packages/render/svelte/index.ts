/**
 * `braindog-render/svelte` — the same thirty-three kinds, drawn as components.
 *
 * This subpath ships NO stylesheet. The markup contract is the whole of what a host draws against:
 * every block is one `<figure>` carrying its kind, its primitive and its tone as data attributes,
 * with the heading as its `<figcaption>`, and a cell is a `<span>` named for the cell it is
 * (05 §7.7). The host supplies the tokens and the rules; the package supplies the shape.
 *
 * `svelte` is an optional peer, so the root of the package stays framework-free.
 */

export { default as Document } from './Document.svelte';
export { default as Block } from './Block.svelte';
export { default as Markdown } from './Markdown.svelte';
export { default as Degraded } from './Degraded.svelte';
export { default as Text } from './Text.svelte';

export type { Column, OnCapture, TableRow } from './types.ts';

export { default as Panel } from './p/Panel.svelte';
export { default as Grid } from './p/Grid.svelte';
export { default as Rows } from './p/Rows.svelte';
export { default as Proportional } from './p/Proportional.svelte';
export { default as Inline } from './p/Inline.svelte';
export { default as List } from './p/List.svelte';
export { default as Table } from './p/Table.svelte';
export { default as CapLine } from './p/CapLine.svelte';
export { default as Cards } from './Cards.svelte';
export { default as Section } from './Section.svelte';
export { default as Feed } from './Feed.svelte';
export { default as Agents } from './Agents.svelte';
export { default as Diff } from './Diff.svelte';
export { default as Split } from './Split.svelte';
export { default as Bridge } from './Bridge.svelte';
export { default as Series } from './Series.svelte';
export { default as Lines } from './Lines.svelte';
export { default as Progress } from './Progress.svelte';
export { default as Forecast } from './Forecast.svelte';
export { default as Capture } from './Capture.svelte';

/* Which body a list draws, as a fact both layers read — `Table` chooses between its own two, and a
   host chooses between this component and its own card list. Two subscriptions could disagree for a
   paint; see the module for the 54,786 hidden nodes that argument is about. */
export { rowsAsCards } from './cards.svelte.ts';
export { default as Media } from './p/Media.svelte';
