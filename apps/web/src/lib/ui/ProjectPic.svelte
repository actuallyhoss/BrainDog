<!--
  A project's picture, its logo, small and inline before its name, where a line of words names the project: the Agents
  page's conversations ("Claude · Portage") and recent runs, and an agent's question in Needs you. The picture the sidebar
  draws the project by (`pictureNow`: what this tab just wrote first, else the row's). Nothing where it holds none or the
  picture will not load, since its name is written beside it: a letter there would only say the name's first letter
  again.

  Decoration: hidden from a screen reader, which reads the name.
-->
<script lang="ts">
  import { pictureSrc } from '$lib/picture/picture.ts';
  import { pictureNow } from '$lib/picture/pictures.svelte.ts';

  let { project }: { project: { key: string; picture?: string | null | undefined } | null | undefined } = $props();

  /* THE PICTURE THAT WOULD NOT LOAD, so the name stands alone rather than beside a broken image. */
  let failed = $state<string | null>(null);
  const shown = $derived.by(() => {
    const sha = project ? pictureNow(project.key, project.picture ?? null) : null;
    return sha !== null && sha !== failed ? sha : null;
  });
</script>

{#if shown}<img class="project-pic" src={pictureSrc(shown)} alt="" aria-hidden="true" width="14" height="14" loading="lazy" decoding="async" onerror={() => (failed = shown)} />{/if}

<style>
  /* 14 SQUARE ON THE LINE'S MIDDLE, rounded as the sidebar's mark is, a step before the name. */
  .project-pic {
    display: inline-block;
    inline-size: 14px;
    block-size: 14px;
    margin-inline-end: 4px;
    border-radius: 4px;
    object-fit: cover;
    vertical-align: -2px;
  }
</style>
