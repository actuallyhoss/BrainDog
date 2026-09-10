<!--
  The home screen of the sample record, laid out rather than photographed.

  IT REPLACED THE HERO SCREENSHOT, and that screenshot was the large empty frame on the first
  screen of the site. It was a 2880px PNG in a frame that reserves its space and paints nothing
  until the bytes arrive and decode, so on a slow load, and in any capture that does not wait for
  images, the first thing a stranger saw under the headline was a bordered rectangle with nothing
  in it. Once it did arrive it was a photograph of the old cream and brick palette, under a page
  that no longer wears it.

  WHY A DRAWING IS ALLOWED HERE, when the page's rule is that product shots are the real app: the
  reason `Fields.svelte` gives. Nothing in it is invented. Every label, figure and sentence is read
  off `static/shots/home-light.png`, the app's home screen on the synthetic record the demo opens,
  and the words live in `copy.ts` with the rest. What the drawing adds is that it is laid out, not
  scaled, so the type is the size the type is on a phone, it paints with the first byte of HTML,
  and it wears whichever palette the tokens say.

  `role="img"` with the old screenshot's alt text, so a screen reader is told what it shows once
  rather than walked through a sidebar that does nothing.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Hue, IconName } from './icons.ts';
  import { site } from './copy.ts';

  const p = site.preview;

  /* The rail's glyphs and the projects' colours, in the order `copy.ts` lists them. */
  const NAV: IconName[] = ['home', 'decide', 'inbox'];
  const HUES: Hue[] = ['info', 'accent', 'earn'];
</script>

<div class="preview" role="img" aria-label={p.label}>
  <div class="win">
    <div class="side">
      <p class="org"><span class="org-mark">{p.initial}</span>{p.record}</p>
      <ul class="nav">
        {#each p.nav as item, i}
          <li class:on={i === 0}>
            <Icon name={NAV[i] ?? 'home'} />
            <span class="nav-name">{item.name}</span>
            {#if item.count}<span class="count num">{item.count}</span>{/if}
          </li>
        {/each}
      </ul>

      <p class="side-h">{p.projectsTitle}</p>
      <ul class="nav">
        {#each p.projects as name, i}
          <li>
            <span class="glyph glyph-sm" data-hue={HUES[i] ?? 'accent'}><Icon name="thing" size="s" /></span>
            <span class="nav-name">{name}</span>
          </li>
        {/each}
      </ul>

      <p class="side-h">{p.threadsTitle}</p>
      <ul class="nav">
        {#each p.threads as name}
          <li><Icon name="rows" /><span class="nav-name">{name}</span></li>
        {/each}
      </ul>
    </div>

    <div class="main">
      <div class="head">
        <p class="date">{p.date}</p>
        <p class="pending"><span class="num">{p.pending.count}</span> {p.pending.label}</p>
      </div>

      <p class="h">{p.nowTitle}</p>
      <ul class="figs">
        {#each p.figures as fig}
          <li class="fig">
            <span class="fig-label">{fig.label}<span class="warn"><Icon name="alert" size="s" /></span></span>
            <span class="fig-value num">{fig.value}</span>
            <span class="fig-note">{fig.note}</span>
          </li>
        {/each}
      </ul>

      <div class="lower">
        <div>
          <p class="h">{p.needsTitle}</p>
          <ul class="needs">
            {#each p.needs as need}
              <li class="need">
                <span class="ask"><Icon name="ask" size="s" /></span>
                <span class="need-copy">
                  <span class="need-title">{need.title}</span>
                  <span class="need-rec">{p.recommends} <b>{need.recommends}</b></span>
                </span>
                <span class="age">{need.age}</span>
              </li>
            {/each}
          </ul>
        </div>

        <div class="away">
          <p class="h">{p.awayTitle}</p>
          <ul class="feed">
            {#each p.away as item}
              <li class="event">
                <span class="face" aria-hidden="true">{item.who.charAt(0).toUpperCase()}</span>
                <span class="who">{item.who.charAt(0).toUpperCase() + item.who.slice(1)}</span>
                <span class="age">{item.age}</span>
                <span class="what">{item.what}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .preview {
    position: relative;
    isolation: isolate;
  }

  /* A soft pool of the accent behind the window: the one place on the page that is lit rather than
     flat. Inset from both edges, so it can never push the document sideways. */
  .preview::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset-block: -14% 35%;
    inset-inline: 6%;
    background: radial-gradient(closest-side, var(--accent-wash), transparent);
  }

  .win {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--e3);
    color: var(--ink);
    font-size: var(--t-sm);
    line-height: 1.45;
    text-align: start;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .side {
    display: none;
    flex-direction: column;
    gap: var(--sp-1);
    padding-block: var(--sp-4);
    padding-inline: var(--sp-3);
    background: var(--bg);
    border-inline-end: 1px solid var(--line);
  }

  .org {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-block: var(--sp-1) var(--sp-3);
    padding-inline: var(--sp-2);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .org-mark {
    display: inline-grid;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    background: var(--accent-wash);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-size: var(--t-xs);
    font-weight: 700;
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-block: 6px;
    padding-inline: var(--sp-2);
    border-radius: var(--r-sm);
    color: var(--ink2);
  }

  .nav li.on {
    background: var(--hover-wash);
    color: var(--ink);
    font-weight: 500;
  }

  .nav-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .side-h {
    margin-block-start: var(--sp-4);
    padding-block-end: var(--sp-1);
    padding-inline: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .glyph-sm {
    inline-size: 22px;
    block-size: 22px;
    border-radius: var(--r-sm);
  }

  .main {
    min-inline-size: 0;
    padding-block: var(--sp-5) var(--sp-6);
    padding-inline: var(--sp-6);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    padding-block-end: var(--sp-4);
    border-block-end: 1px solid var(--line);
  }

  .date {
    font-family: var(--font-display);
    font-size: var(--t-xl);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .pending {
    padding-block: var(--sp-1);
    padding-inline: 10px;
    background: var(--hover-wash);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .pending .num {
    color: var(--ink);
    font-weight: 700;
  }

  .h {
    margin-block: var(--sp-5) var(--sp-3);
    color: var(--ink2);
    font-weight: 600;
  }

  .figs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-3);
  }

  .fig {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
    padding-block: var(--sp-3);
    padding-inline: var(--sp-4);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .fig-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .warn {
    color: var(--warn);
  }

  .fig-value {
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .fig-note {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .lower {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0 var(--sp-6);
  }

  .needs {
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .need {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    padding-inline: var(--sp-4);
  }

  .need + .need {
    border-block-start: 1px solid var(--line);
  }

  .need-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .need-title {
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .need-rec {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .need-rec b {
    color: var(--ink2);
    font-weight: 600;
  }

  .age {
    color: var(--dim);
    font-size: var(--t-xs);
    white-space: nowrap;
  }

  .away {
    display: none;
  }

  .event {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 2px var(--sp-3);
    padding-block: 10px;
  }

  .event + .event {
    border-block-start: 1px solid var(--line);
  }

  /* A face and a name, the way the app's feed draws a writer now, rather than a name in the
     identifier face. */
  .face {
    display: grid;
    grid-row: 1 / span 2;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    background: var(--hover-wash);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .who {
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .ask {
    display: grid;
    place-items: center;
    color: var(--accent-text);
  }

  .what {
    grid-column: 2 / -1;
    color: var(--ink2);
  }

  /* The rail and the feed only where there is room for them to be themselves. */
  @media (width >= 1000px) {
    .win {
      grid-template-columns: 208px minmax(0, 1fr);
    }

    .side {
      display: flex;
    }

    .lower {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    }

    .away {
      display: block;
    }
  }

  /**
   * ON A PHONE IT IS THE PHONE'S HOME SCREEN, not the laptop's shrunk. The three figures become one
   * card of three lines, which is how the app itself stacks them, and the list shows two items: the
   * point is what the screen is, and a third question is a third of a screen of scrolling.
   */
  @media (width < 640px) {
    .main {
      padding: var(--sp-4);
    }

    .date {
      font-size: var(--t-lg);
    }

    .figs {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      background: var(--s2);
      border: 1px solid var(--line);
      border-radius: var(--r-md);
    }

    .fig {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      column-gap: var(--sp-3);
      padding-block: 10px;
      padding-inline: var(--sp-3);
      background: none;
      border: 0;
      border-radius: 0;
    }

    .fig + .fig {
      border-block-start: 1px solid var(--line);
    }

    .fig-value {
      font-size: var(--t-md);
    }

    .fig-note {
      display: none;
    }

    .need {
      padding: var(--sp-3);
    }

    .need:nth-child(n + 3) {
      display: none;
    }
  }
</style>
