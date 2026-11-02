<!--
  THE QUIET LINE AN ADD-ON'S PAGE SAYS WHEN IT BRINGS WIDGETS (widgets plan §6.5, batch W6): "Weather brings 2 widgets
  for Today: Weather and The week's weather. Add one", the link opening the widget sheet on Today. Nothing is placed by
  installing; this only says they are there. Drawn only for an add-on that is on and brings some, and it reads the
  record once, for this add-on alone (`widgetGallery` with `addon`).
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';

  let { pack, name, on = true, onread }: { pack: string; name: string; on?: boolean; /** Told once the widgets are read, landed or not, so a page can hold what is under the line. */ onread?: () => void } = $props();

  let titles = $state<string[]>([]);

  $effect(() => {
    const id = pack;
    if (!on) return void onread?.();
    void import('@braindog/client')
      .then(async ({ createClient }) => {
        const out = await createClient({ base: apiBase() }).call<{ widgets?: { title?: unknown }[] }>('widgetGallery', { addon: id });
        titles = out.ok && Array.isArray(out.value.widgets) ? out.value.widgets.flatMap((w) => (typeof w.title === 'string' ? [w.title] : [])) : [];
      })
      .catch(() => (titles = []))
      .finally(() => onread?.());
  });

  const and = (xs: readonly string[]): string => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
  const said = $derived(titles.length === 1 ? `${name} brings a widget for Today: ${titles[0]}.` : `${name} brings ${titles.length} widgets for Today: ${and(titles.slice(0, 4))}${titles.length > 4 ? ' and more' : ''}.`);
</script>

{#if on && titles.length > 0}
  <p class="sw-line">{said} <a href={at('/?widgets')}>Add one</a></p>
{/if}

<style>
  .sw-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 1.4;
  }

  .sw-line a {
    color: var(--ink);
    font-weight: var(--fw-semi);
  }
</style>
