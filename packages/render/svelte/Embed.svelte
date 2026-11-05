<!--
  `embed`: a video, a design or a map from one of `EMBED_PROVIDERS`, drawn as a facade (its title, whose it is, a Load
  button and a link to the original), sized by `data-aspect` (`src/embed.ts`). `embed` in `src/html.ts` is this file's
  twin: the same tree less the Load button, which is state in this component and has no place in a copy with no script.

  THE FRAME IS PUT ON THE PAGE BY A PRESS AND BY NOTHING ELSE. A page that framed every embed as it opened would tell
  each provider who is reading before anybody chose to watch anything, so the facade is what draws first, on every
  surface, and the frame it becomes is sandboxed, sends no referrer and is pointed at the provider's own embed address
  (`embedOf`), never at what was typed.

  The pressed state is held by the frame's address, so another embed drawn in this component's place, as a page redraws
  under it, starts as a facade again rather than inheriting a press made on a different video.
-->
<script lang="ts">
  import { hrefFor, inline, text, type Block, type RenderOptions } from '../src/index.ts';
  import { EMBED_HOLD_PATH, EMBED_NONE, embedLoad, embedOpen, embedPlan } from '../src/embed.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const plan = $derived(embedPlan(block.rows));
  let loaded = $state<string | null>(null);
  let frame = $state<HTMLIFrameElement | undefined>();
  const title = $derived(plan ? text(inline(plan.title, opts)) || plan.provider.name : '');

  /* THE FRAME SAYS IT IS READY FROM ITS OWN WINDOW, AND IS TOLD WHAT TO HOLD, ON THIS ORIGIN ALONE. */
  $effect(() => {
    if (loaded === null || !frame) return;
    const src = loaded;
    const named = title;
    const listen = (e: MessageEvent) => {
      if (e.source !== frame?.contentWindow || (e.data as { braindog?: unknown } | null)?.braindog !== 'ready') return;
      frame.contentWindow?.postMessage({ braindog: 'hold', kind: 'embed', src, title: named }, location.origin);
    };
    addEventListener('message', listen);
    return () => removeEventListener('message', listen);
  });
</script>

{#if !plan}
  <p class="embed-empty">{EMBED_NONE}</p>
{:else}
  <div class="embed" data-provider={plan.provider.id} data-aspect={plan.aspect}>
    {#if loaded === plan.src}
      <iframe
        bind:this={frame}
        class="embed-frame"
        src={EMBED_HOLD_PATH}
        {title}
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        referrerpolicy="no-referrer"
        loading="lazy"
        allow="fullscreen; picture-in-picture"
      ></iframe>
    {:else}
      <div class="embed-facade">
        {#if plan.title}<p class="embed-title"><Text nodes={inline(plan.title, opts)} {opts} /></p>{/if}
        <p class="embed-from">{plan.provider.name}</p>
        <button type="button" class="embed-load" onclick={() => (loaded = plan?.src ?? null)}>{embedLoad(plan.provider.name)}</button>
      </div>
    {/if}
    <a class="embed-open" href={hrefFor(opts, plan.url)} rel="noreferrer">{embedOpen(plan.provider.name)}</a>
  </div>
{/if}
