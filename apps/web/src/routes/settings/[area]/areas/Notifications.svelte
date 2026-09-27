<!--
  Settings > Notifications: when this product interrupts, and whether this device is rung.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Section from '$lib/ui/Section.svelte';
  import PushToggle from '$lib/ui/PushToggle.svelte';
  import type { AreaProps } from '../settings-state.svelte.ts';

  /* EVERY AREA TAKES THE SAME PROPS. This one reports what the product does and reads none of them. */
  let props: AreaProps = $props();
</script>

<!--
  `09` SPECIFIES A COMPLETE MECHANISM WITH ZERO USER-CONFIGURABLE SETTINGS. Every constant is
  hard-coded, digests are pack declarations, no kernel table holds a preference and none of the
  sixty-four methods writes one. So this screen REPORTS rather than offers, and a row of
  toggles here would be four controls that write nothing, which is the failure this whole
  session has been removing.

  Muting is turned off at the source: edit or retire the rule that raises it. The one switch
  below is Web Push for this device (W58-4), which is kept by the browser and the record, not a
  preference over what interrupts.
-->
<Section title={copy.whenWeInterrupt}>
  <p class="hint">{copy.batchByDefault}</p>
  <ul class="facts">
    <li><span class="fact-key">{copy.quietHours}</span><span class="fact-value">{copy.quietHoursAre}</span></li>
    <li><span class="fact-key">{copy.urgentKinds}</span><span class="fact-value">{copy.urgentKindsAre}</span></li>
    <li><span class="fact-key">{copy.interruptCap}</span><span class="fact-value">{copy.interruptCapIs}</span></li>
    <li><span class="fact-key">{copy.unreadCount}</span><span class="fact-value">{copy.unreadCountIs}</span></li>
  </ul>
  <p class="hint">{copy.muteAtSource}</p>
</Section>
<!-- THE ONE CONTROL ON THIS SCREEN, AND IT IS ABOUT THE DEVICE, NOT THE RECORD. The facts above are still the
     record's and still have no switch; this says whether this browser is rung when one of them interrupts. It
     draws nothing until the host hands it a key, so on a host without one this screen is as it was. -->
<PushToggle />

<style>
  /* A short list of stated facts, for the areas that REPORT rather than offer. Two columns so
     the label and the value line up down the page; it wraps to one below 520px. */
  .facts {
    display: grid;
    grid-template-columns: minmax(12ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .facts li {
    display: contents;
  }

  .fact-key {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fact-value {
    color: var(--ink2);
  }

  @media (width < 520px) {
    .facts {
      grid-template-columns: minmax(0, 1fr);
      gap: 0 0;
    }

    /* The label over its value. As a block the two spans ran together into one line. */
    .facts li {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
      margin-block-end: var(--sp-2);
    }
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }
</style>
