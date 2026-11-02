<!--
  The app's own window round a drawing of it, as the app draws its frame on 1 November: the rail on the left in
  `--nav` (white in light, the crimson #2E0C18 in dark) with BrainDog's mark, the places and Maya's projects, and the
  bar across the work with the page's name, the search, the bell and her face. Under 640 wide it is the app's phone:
  the bar on top and the tab bar along the foot, and the work clipped between them.

  THE FRAME IS A PICTURE AND SAYS SO: the rail and the bars are hidden from a screen reader, the figure is named
  (`frame.label`), and what is inside (`children`) is real: tiles with their headings, and answers that work. The rail's
  count on Needs you is the desk's own (`desk/needs.svelte.ts`), so answering one in the work moves it.

  IT FITS WHAT HOLDS IT, not the window: a container query on its own width draws the rail at full width from 1,000,
  as icons from 640, and the phone under that, so the same drawing is right in the hero and in a narrow column.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import Mark from '../Mark.svelte';
  import { PROJECTS, PROJECT_ORDER, slotVars } from '../demo/maya.ts';
  import { needs } from '../desk/needs.svelte.ts';
  import { frame as f } from '../copy/product.ts';
  import type { IconName } from '../icons.ts';

  let { place, label = f.label, children }: { place: string; label?: string; children: Snippet } = $props();

  const count = $derived(needs.open.length);
  const icon = (name: string): IconName => name as IconName;
</script>

<figure class="win shot" aria-label={label}>
  <div class="frame">
    <aside class="rail" aria-hidden="true">
      <p class="rail-brand"><Mark height={18} /><span>{f.brand}</span></p>
      <ul class="places">
        {#each f.places as p (p.label)}
          <li class:on={'on' in p && p.on}>
            <Icon name={icon(p.icon)} />
            <span class="cap">{p.label}</span>
            {#if 'count' in p && count > 0}<span class="count num">{count}</span>{/if}
            {#if 'live' in p}<span class="dot live"></span>{/if}
            {#if 'n' in p}<span class="n num">{p.n}</span>{/if}
          </li>
        {/each}
      </ul>
      <p class="rail-head"><span class="cap">{f.projects}</span><span class="n cap">{f.inPlay}</span></p>
      <ul class="places">
        {#each PROJECT_ORDER as id (id)}
          {@const p = PROJECTS[id]}
          <li style={slotVars(p.slot)}>
            <span class="pwell"><Icon name={p.icon} size="s" /></span>
            <span class="cap">{p.name}</span>
            {#if id === 'northbound'}<span class="late-n cap">1 late</span>{/if}
          </li>
        {/each}
      </ul>
      <ul class="places foot">
        {#each f.foot as p (p.label)}
          <li><Icon name={icon(p.icon)} /><span class="cap">{p.label}</span></li>
        {/each}
      </ul>
    </aside>

    <div class="work">
      <div class="topbar" aria-hidden="true">
        <span class="where">{place}</span>
        <span class="search"><Icon name="search" /><span class="cap">{f.search}</span><span class="kbd">{f.searchKey}</span></span>
        <span class="bell"><Icon name="bell" /><b class="num">{f.bell}</b></span>
        <span class="face">{f.face}</span>
      </div>
      <div class="phonebar" aria-hidden="true">
        <Mark height={20} />
        <span class="where">{place}</span>
        <span class="icons"><Icon name="search" size="l" /><span class="bell"><Icon name="bell" size="l" /><b class="num">{f.bell}</b></span><span class="face">{f.face}</span></span>
      </div>
      <div class="desk">
        {@render children()}
      </div>
      <div class="tabbar" aria-hidden="true">
        {#each f.tabs as t (t.label)}
          <span class="tab" class:on={'on' in t && t.on}>
            <span class="tab-icon"><Icon name={icon(t.icon)} size="l" />{#if 'count' in t && count > 0}<b class="num">{count}</b>{/if}{#if 'live' in t}<span class="dot live"></span>{/if}</span>
            {t.label}
          </span>
        {/each}
      </div>
    </div>
  </div>
</figure>

<style>
  .win {
    container: win / inline-size;
    margin: 0;
  }

  /* THE WINDOW: the app's frame, its edge the one 1px line the design system gives what floats, and no shadow. */
  .frame {
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr);
    overflow: hidden;
    background: var(--board);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  /* ── The rail ─────────────────────────────────────────────────────────── */

  .rail {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: 0 var(--sp-2) var(--sp-3);
    background: var(--nav);
    border-inline-end: 1px solid var(--rule);
  }

  .rail-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    block-size: 55px;
    margin: 0 calc(-1 * var(--sp-2)) var(--sp-1);
    padding-inline: 16px;
    border-block-end: 1px solid var(--rule);
    color: var(--ink);
    font: 600 16px/1 var(--font-display);
    letter-spacing: -0.02em;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .places li {
    display: flex;
    align-items: center;
    gap: 10px;
    block-size: 30px;
    padding-inline: 10px;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: 500;
    white-space: nowrap;
  }

  .places li :global(svg) {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    color: var(--ink-3);
  }

  .places li.on {
    background: var(--nav-selected);
    color: var(--ink);
    font-weight: 600;
  }

  .places li.on :global(svg) {
    color: var(--ink);
  }

  .cap {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .count {
    display: inline-grid;
    place-items: center;
    min-inline-size: 18px;
    block-size: 18px;
    margin-inline-start: auto;
    padding-inline: 5px;
    border-radius: var(--r-round);
    background: var(--red-fill);
    color: var(--on-red);
    font-size: 11px;
    font-weight: 600;
  }

  .n {
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
  }

  .dot.live + .n {
    margin-inline-start: 6px;
  }

  .places li .dot.live {
    margin-inline-start: auto;
  }

  .rail-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: var(--sp-3) 0 0;
    padding-inline: 10px;
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: 600;
  }

  .rail-head .n {
    margin-inline-start: 0;
  }

  .pwell {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    border-radius: 6px;
    background: var(--ph-tint);
  }

  .pwell :global(svg) {
    inline-size: 12px !important;
    block-size: 12px !important;
    color: var(--ph) !important;
  }

  .late-n {
    margin-inline-start: auto;
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .foot {
    margin-block-start: auto;
    padding-block-start: var(--sp-2);
    border-block-start: 1px solid var(--rule);
  }

  /* ── The bar ──────────────────────────────────────────────────────────── */

  .work {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    block-size: 55px;
    padding-inline: 24px 16px;
    background: var(--nav);
    border-block-end: 1px solid var(--rule);
  }

  .where {
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    inline-size: min(300px, 40%);
    block-size: 34px;
    margin-inline-start: auto;
    padding-inline: 10px 8px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
  }

  .search :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }

  .search .kbd {
    margin-inline-start: auto;
    background: var(--tile);
  }

  .bell {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    color: var(--ink-2);
  }

  .bell :global(svg) {
    inline-size: 18px;
    block-size: 18px;
  }

  .bell b {
    position: absolute;
    inset-block-start: 1px;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    min-inline-size: 16px;
    block-size: 16px;
    padding-inline: 4px;
    border-radius: var(--r-round);
    background: var(--ink);
    color: var(--tile);
    font-size: 10px;
    font-weight: 600;
  }

  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-round);
    background: var(--cat-violet-tint);
    color: var(--cat-violet);
    font-size: var(--fs-ctl);
    font-weight: 600;
  }

  /* ── The work ─────────────────────────────────────────────────────────── */

  .desk {
    container: desk / inline-size;
    flex: 1;
    min-inline-size: 0;
    padding: 20px 24px 24px;
  }

  .phonebar,
  .tabbar {
    display: none;
  }

  /* ── Narrower: the rail as icons ──────────────────────────────────────── */

  @container win (width < 1000px) {
    .frame {
      grid-template-columns: 60px minmax(0, 1fr);
    }

    .rail {
      align-items: center;
    }

    .rail-brand {
      justify-content: center;
      inline-size: calc(100% + 2 * var(--sp-2));
      padding: 0;
    }

    .rail-brand span,
    .rail .cap,
    .rail .n,
    .rail .count,
    .rail .dot,
    .rail .late-n {
      display: none;
    }

    .places li {
      justify-content: center;
      inline-size: 40px;
      padding: 0;
    }

    .rail-head {
      block-size: 1px;
      margin: var(--sp-2) 0;
      padding: 0;
      background: var(--rule);
      inline-size: 32px;
    }

    .search {
      inline-size: 34px;
      padding: 0;
      justify-content: center;
    }

    .search .cap,
    .search .kbd {
      display: none;
    }
  }

  /* ── A phone: the app's phone frame ───────────────────────────────────── */

  @container win (width < 640px) {
    .frame {
      grid-template-columns: minmax(0, 1fr);
      block-size: 600px;
    }

    .rail,
    .topbar {
      display: none;
    }

    .work {
      position: relative;
      overflow: hidden;
    }

    .phonebar {
      display: flex;
      align-items: center;
      gap: 10px;
      block-size: 52px;
      padding-inline: 14px 10px;
      background: var(--nav);
      border-block-end: 1px solid var(--rule);
    }

    .phonebar .icons {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-inline-start: auto;
      color: var(--ink-2);
    }

    .phonebar .face {
      inline-size: 30px;
      block-size: 30px;
    }

    .desk {
      overflow: hidden;
      padding: 14px 12px 76px;
    }

    .tabbar {
      position: absolute;
      inset-inline: 0;
      inset-block-end: 0;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      block-size: 60px;
      background: var(--nav);
      border-block-start: 1px solid var(--rule);
    }

    .tab {
      display: grid;
      place-items: center;
      align-content: center;
      gap: 3px;
      color: var(--ink-3);
      font-size: 11px;
      font-weight: 500;
    }

    .tab.on {
      color: var(--ink);
    }

    .tab-icon {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 44px;
      block-size: 26px;
      border-radius: var(--r-ctl);
    }

    .tab.on .tab-icon {
      background: var(--nav-selected);
    }

    .tab-icon b {
      position: absolute;
      inset-block-start: -4px;
      inset-inline-end: 4px;
      display: grid;
      place-items: center;
      min-inline-size: 16px;
      block-size: 16px;
      padding-inline: 4px;
      border-radius: var(--r-round);
      background: var(--red-fill);
      color: var(--on-red);
      font-size: 10px;
      font-weight: 600;
    }

    .tab-icon .dot {
      position: absolute;
      inset-block-start: 0;
      inset-inline-end: 8px;
    }
  }
</style>
