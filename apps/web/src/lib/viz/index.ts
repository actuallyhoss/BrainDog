/**
 * The chart primitives (SYSTEM §7, §12.2): SVG drawn from the record's data, coloured only through
 * tokens, each sized to its box and each read aloud as a sentence built from its data.
 *
 * They draw the mark and its direct labels; the tile around a chart, its figure and its one written
 * reading line are the caller's (`Tile`, SYSTEM §6). Which chart answers which question:
 *
 *   a trend                 `Sparkline` (or `Bars`)
 *   part of a whole         `Stacked`, `Ring`, `Waffle`
 *   progress                `Segments`, `Ring`
 *   time and overlap        `Swimlanes`
 *   intensity over time     `HeatGrid`
 *   two periods             `Bars` with `paired`
 *   dates                   `WeekStrip`
 *
 * EVERY CHART TAKES `subject` AND `summary`. `subject` names what is measured and leads the sentence
 * built from the data ("acme.example takings a day, 9 weeks, from 138 to 96, low 95"); `summary` replaces
 * that sentence outright when a screen can say it better.
 *
 * A `tone` is a name (`ink`, the greys `g1` to `g4`, `danger`, `earn`, `warn`, `live`) or a project's
 * own colour string, which is set inline as `--c` (`shared.ts`).
 */

export { default as Bars } from './Bars.svelte';
export { default as HeatGrid } from './HeatGrid.svelte';
export { default as Ring } from './Ring.svelte';
export { default as Segments } from './Segments.svelte';
export { default as Sparkline } from './Sparkline.svelte';
export { default as Stacked } from './Stacked.svelte';
export { default as Swimlanes } from './Swimlanes.svelte';
export { default as Waffle } from './Waffle.svelte';
export { default as WeekStrip } from './WeekStrip.svelte';

export type { NamedTone, Tone } from './shared.ts';
export type { SparkMark } from './sparkline.ts';
export type { Lane, LaneMark, Span } from './swimlanes.ts';
export type { WeekDay, WeekItem } from './weekstrip.ts';
