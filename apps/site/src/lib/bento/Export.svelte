<!--
  Export: every register and the whole history, into one file.

  `.dog` is the record's own format, one SQLite database (`docs/03-DOG-FORMAT.md`). The file card
  names no size and no date, because the demo has not been exported and a drawing does not guess.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icons.ts';
  import { site } from '../copy.ts';

  const c = site.bento.export;
  const GLYPHS: IconName[] = ['money', 'rows', 'people', 'thing', 'history'];
</script>

<div class="exp" aria-hidden="true">
  <ul class="parts">
    {#each c.parts as part, i}
      <li class="part" style="--i: {i}"><Icon name={GLYPHS[i] ?? 'rows'} size="s" />{part}</li>
    {/each}
  </ul>

  <span class="into"><Icon name="download" /></span>

  <div class="file">
    <span class="file-glyph"><Icon name="doc" /></span>
    <span class="file-main">
      <span class="file-name">{c.file}<span class="ext">{c.ext}</span></span>
      <span class="file-what">{c.what}</span>
    </span>
    <span class="fill"><span class="bar"></span></span>
  </div>
</div>

<style>
  .exp {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    font-size: var(--t-sm);
  }

  .parts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .part {
    --i: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding-block: 4px;
    padding-inline: 8px 10px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .into {
    display: grid;
    color: var(--accent-text);
  }

  .file {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: min(100%, 260px);
    overflow: hidden;
    padding-block: var(--sp-3) calc(var(--sp-3) + 3px);
    padding-inline: var(--sp-3) var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--accent);
    border-radius: var(--r-md);
    box-shadow: var(--e2);
  }

  .file-glyph {
    display: grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    background: var(--accent-wash);
    border-radius: var(--r-sm);
    color: var(--accent-text);
  }

  .file-main {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .file-name {
    color: var(--ink);
    font-weight: 600;
  }

  .ext {
    color: var(--accent-text);
    font-family: var(--font-id);
  }

  .file-what {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .fill {
    position: absolute;
    inset-block-end: 0;
    inset-inline: 0;
    block-size: 3px;
    background: var(--hover-wash);
  }

  .bar {
    display: block;
    block-size: 100%;
    background: var(--accent);
    transform-origin: 0 50%;
  }

  .bar:dir(rtl) {
    transform-origin: 100% 50%;
  }

  @media (prefers-reduced-motion: no-preference) {
    .part {
      animation: absorb 10s var(--ease-out) calc(0.3s * var(--i)) infinite both;
    }

    .bar {
      animation: fill 10s var(--ease-out) infinite both;
    }
  }

  /* Each part drops into the file in turn, then comes back while the file stays full. */
  @keyframes absorb {
    0%,
    12% {
      opacity: 1;
      transform: none;
    }

    24% {
      opacity: 0;
      transform: translateY(34px) scale(0.8);
    }

    80% {
      opacity: 0;
      transform: translateY(-6px);
    }

    90%,
    100% {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes fill {
    0%,
    14% {
      transform: scaleX(0);
    }

    42%,
    100% {
      transform: none;
    }
  }
</style>
