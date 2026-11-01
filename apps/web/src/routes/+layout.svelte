<!--
  THE ROOT LAYOUT: the skin every screen draws on, and one of two frames round the screen.

  THE APP'S FRAME (`$lib/shell/AppFrame.svelte`) for every screen of a record, handed over by the root load, which asks
  for it beside `boot` (`+layout.ts`). THE LIGHT FRAME (`$lib/shell/LightFrame.svelte`) for sign-in and sign-up
  (`$lib/shell/light.ts`): a skip link and one scrolling surface, and nothing of the shell. The app's frame was this file
  until 30 Oct, so a stranger's sign-in waited for the rail, the palette's way in and the record's readers before it
  drew a field (first hour audit, E14). Both frames are handed over by the root load and neither is imported here, so a
  screen fetches only the frame it draws.
-->
<script lang="ts">
  import { applyInset } from '$lib/shell.ts';
  /* The page's name on a real move only; Kit's own announcer also spoke after a write's invalidate (AI1). */
  import RouteSay from '$lib/shell/RouteSay.svelte';
  /* Title-bar room for the Mac app: sets --shell-inset once, 0 in a browser. Here, so sign-in in the Mac app has it too. */
  applyInset();
  /* The shared skin first: `tokens.css` opens with the `@layer` statement, so the layer ORDER — and
     with it the rule that no installed theme can reach the a11y layer — is established before any
     other stylesheet is parsed. */
  import '@braindog/skin/tokens.css';
  /* AND THE PALETTE THIS BUILD IS FOR, which `tokens.css` used to `@import` on everybody's behalf.
     `BRAINDOG_ENV` aliases this specifier, so an alpha build resolves it to `alpha.css` and ships
     one palette rather than two — 28 §4. */
  import '@braindog/skin/house.css';
  import '@braindog/skin/base.css';
  import '@braindog/skin/a11y.css';

  /* ALL OF THEM, IN THE ORDER THEY ALWAYS HAD, FOR BOTH FRAMES. They share the `components` layer, where the later sheet
     wins a tie, so a sheet left to the app's frame would load after the rest and could win where it used to lose. */
  import '../app.css';
  import '@braindog/skin/blocks.css';
  import '$lib/ui/rows.css';
  import '$lib/ui/controls.css';
  /* THE UI PASS OF 1 NOV: the head row every page shares, and the motion every shared control gets for free. */
  import '$lib/ui/head-row.css';
  import '$lib/motion/motion.css';

  let { data, children } = $props();
</script>

{#if data.frame}
  <data.frame {data} {children} />
{:else if data.light}
  <data.light {children} />
{/if}
<RouteSay />
