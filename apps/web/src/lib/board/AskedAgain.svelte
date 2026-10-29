<!--
  Under Slash's answer: "You've asked this 3 times", and Add to Today (widgets plan §6.3, signal S1).

  WHEN A QUESTION HAS BEEN ASKED ON THREE DAYS IN THIRTY and a widget answers it, the record offers that widget
  (`widget-signals.ts`). This line shows the offer where the question was just asked again, with the count, and one press
  opens it in the widget sheet on Today, drawn on his own data, to add or not. Nothing is added from here.

  ASKED ONLY WHEN AN ANSWER IS ON SCREEN, at most every five minutes (`offersNow`), and drawn only when an offer matches
  the question's words (`askedWidget`, the record's own rule), so most answers carry nothing here.
-->
<script lang="ts">
  import { askedWidget, type WidgetOffer } from 'braindog-render';
  import { apiBase, at as inApp } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { askedSaid, offersNow, sheetHref } from './offer.svelte.ts';

  let { asked }: { asked: string } = $props();

  let offer = $state<WidgetOffer | null>(null);

  $effect(() => {
    const widget = askedWidget(asked);
    offer = null;
    if (widget === null) return;
    let current = true;
    void offersNow(apiBase()).then((all) => {
      if (current) offer = all.find((o) => o.widget === widget && o.signal === 'S1') ?? null;
    });
    return () => {
      current = false;
    };
  });
</script>

{#if offer}
  {@const said = askedSaid(offer)}
  <a class="aa" href={sheetHref(inApp('/'), offer.key)} data-sveltekit-noscroll>
    <Icon name="plus" size="s" />
    <span class="aa-do">Add {offer.title} to Today</span>
    {#if said}<span class="aa-why">{said}</span>{/if}
  </a>
{/if}

<style>
  .aa {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-block-start: 8px;
    padding: 6px 10px;
    border: 1px dashed var(--rule-strong);
    border-radius: 10px;
    color: var(--ink);
    font-size: var(--fs-meta);
    text-decoration: none;
  }

  .aa:hover {
    background: var(--hover);
  }

  .aa-do {
    font-weight: var(--fw-semi);
  }

  .aa-why {
    color: var(--ink-3);
  }
</style>
