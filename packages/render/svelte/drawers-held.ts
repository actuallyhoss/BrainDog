/**
 * `#drawers` WHERE NOTHING SAYS OTHERWISE: every drawer `lazy.ts` names, imported as it always was, so each kind draws
 * in its block's first frame (the site's finished HTML, a block rendered to a string in a test). The app's build swaps
 * this for `drawers-fetched.ts`.
 */
import Forecast from './Forecast.svelte';
import Series from './Series.svelte';
import Lines from './Lines.svelte';
import Split from './Split.svelte';
import Bridge from './Bridge.svelte';
import Calendar from './Calendar.svelte';
import Form from './Form.svelte';
import Lanes from './Lanes.svelte';
import Gallery from './Gallery.svelte';
import Embed from './Embed.svelte';
import Inputs from './Inputs.svelte';
import Feed from './Feed.svelte';
import Agents from './Agents.svelte';
import type { Drawer, Drawers, LazyKind } from './lazy.ts';

export const held: Drawers['held'] = {
  forecast: Forecast,
  series: Series,
  lines: Lines,
  split: Split,
  bridge: Bridge,
  calendar: Calendar,
  form: Form,
  lanes: Lanes,
  gallery: Gallery,
  embed: Embed,
  inputs: Inputs,
  feed: Feed,
  agents: Agents,
} satisfies Record<LazyKind, Drawer>;

export const fetched: Drawers['fetched'] = {};
