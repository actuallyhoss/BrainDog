<!--
  A shared page: signed, read-only, and A LANDING PAGE.

  That one requirement settles the whole routing question. A fragment never reaches the server, so a
  hash-routed share link can have no server-side token check, no preview and no crawlable title —
  which is why the app uses real paths and one catch-all route (19 §5).

  It renders `page(slug)` with `Authorization: Share <token>`, at `me.level = read`, with NO NAV AND
  NO PALETTE: a capability URL must not imply there is a record behind it. And unguessable is not
  authorised — RFC 9562 is explicit that UUIDv7 MUST NOT be used as a security capability. This is
  the ONE capability URL in the product, and it is signed, scoped to one page, and terminally
  revocable.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { titleOf } from '$lib/title.ts';
  import { Block, Degraded, Table } from 'braindog-render/svelte';
  import { page as state } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { NOW, REGISTERS, heldBy, page as readPage, values } from '$lib/record/api.ts';
  import { draw } from '$lib/record/blocks.ts';
  import Mark from '$lib/ui/Mark.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { drew } from '../../../lib/ui/screen.svelte.ts';

  /**
   * What this token opens — and `null` when it opens nothing.
   *
   * IT IGNORED THE TOKEN ENTIRELY. `readPage('money')` was a module-level constant, so every token
   * in the world rendered the Money page, and the token appeared only as eight cosmetic characters
   * in the byline. On the one capability URL in the product: the string IS the permission, and the
   * screen was not reading it.
   *
   * AND THE REVOKED STATE COULD NEVER DRAW. `money` always resolves, so `{#if !result}` was
   * unreachable — which made it the only use in the app of the empty state's `no-permission` kind,
   * and of a `Request access` button no reader could ever see. A share that has been closed is the
   * ordinary end of a share's life, so it is the state this screen most needs to get right.
   */
  const SHARES: Record<string, string> = { '9f2a7c41d8b3': 'money' };
  const result = $derived.by(() => {
    const slug = SHARES[state.params.token ?? ''];
    return slug ? readPage(slug) : null;
  });
  const resolved = values();
  /* NOW IS THE RECORD'S CLOCK, not the browser's. `inline` defaults it to `Date.now()`, so every
     `{{ago:}}` in prose was formatted against the wall clock while every other date on the screen
     came from `NOW` — the Money page said an invoice was 6w overdue and the Home page said 5w, for
     the same row, two clicks apart. In production that reads differently on two devices and drifts
     a day further every day. */
  const opts = { resolve: (path: string) => resolved[path] ?? null, now: NOW };

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf('Shared')}</title></svelte:head>

<div class="shared">
  <header class="bar">
    <a class="brand" href="/">
      <Mark height={22} />
      <span class="wordmark">{copy.product}</span>
    </a>
    <span class="chip">Shared · read only</span>
  </header>

  {#if !result}
    <Empty kind="no-permission" heading title="This link has been revoked." body="Whoever shared it can send a new one.">
      {#snippet actions()}<Button onclick={() => toasts.push(copy.notWritten('Whoever shared this would be asked'), { intent: 'warn' })}>{copy.requestAccess}</Button>{/snippet}
    </Empty>
  {:else}
    <!-- A `<div>`, NOT A SECOND `<main>`. The layout's bare branch already wraps this route in
         `<main id="main">`, so this put a main landmark inside a main landmark and gave the document
         two of them with no accessible name to tell them apart — three axe violations on the one
         surface a non-user ever sees, on the only route neither browser gate had ever visited. -->
    <div class="body">
      <h1 class="title">{result.page.title}</h1>
      <p class="from">Shared from The Studio</p>
      <!-- AND IT IS AN EXAMPLE, WHICHEVER TOKEN OPENED IT.

           A share token resolves against a map written into this file, and the page it names is the
           built-in one: there is no record-side read for a share, no scheme that authorises one, and
           nothing that turns a token into a record's page. So these blocks are the same blocks for
           every reader, and this is the one surface reached by somebody with no account, no rail and
           no other screen to compare them against. The byline above says who shared it, which is the
           sentence that makes them read as somebody's figures, so the correction goes directly under
           it. Unconditional, because there is no reading of this screen where the rows are a
           record's. -->
      <p class="example" role="note">{copy.exampleShared}</p>

      {#each result.blocks as block}
        {#if block.drawn}
          <!-- THE SAME FIVE STATES A READER GETS ANYWHERE ELSE. This called `draw(block)` with no
               second argument, so `no-data-yet` was structurally impossible here whatever the
               precedence inside it: a shared page could only ever say "your filter matched nothing"
               about a list that had never held a row. `19 §6` is about telling a reader which fact
               is true, and a reader with no account is not owed less of the truth than one with.

               NO `href`. The action is the half this surface cannot offer — it is read-only, scoped
               to one page, and there is no list to open — so the state comes without one rather than
               with a button that goes nowhere. -->
          {@const held = block.register ? REGISTERS[block.register] : undefined}
          {@const drawn = draw(
            block,
            held
              ? { rows: heldBy(block.register!), name: held.name, ...(held.holds ? { holds: held.holds } : {}) }
              : undefined,
          )}
          <section class="block-slot">
            <!-- A BLOCK WITH NO AUTHORED `heading:` PRINTED ITS DIALECT ID: `spec`, `chips`, `gauge`,
                 `params`, `tree`. `kindNames` exists for this and says why in its own header — an id is
                 what an agent writes into a declaration, a name is what a person reads — and the two
                 screens where a READER rather than an author is looking were the two that skipped it. -->
            <h2 class="block-name">{block.heading ?? copy.kindNames[block.kind] ?? block.kind}</h2>
            <!-- EVERY kind, through the same conversion the page route uses. This branch used to
                 read `{:else if block.metrics}`, so a `note` or a `bar` on a shared page drew its
                 heading and then nothing — a section title over an empty body, which tells the
                 reader something is there and then shows them it is not. -->
            {#if drawn.refusal}
              <Empty compact kind={drawn.refusal.kind} title={drawn.refusal.title} body={drawn.refusal.body} lines={drawn.refusal.lines} />
            {:else if block.kind === 'table'}
              <Table columns={block.columns} rows={block.rows} total={block.total} label={block.heading} />
            {:else}
              {#each drawn.segments as segment}
                {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'degraded'}<Degraded {segment} />{/if}
              {/each}
            {/if}

            <!-- AND IT SAYS IT IS A SLICE HERE TOO, WITHOUT THE WAY OUT.

                 A shared link is the one surface read by somebody who has no account, no rail and no
                 register to open — which makes an unannounced cut worse here than anywhere, not
                 better: the reader cannot notice the list is short by comparing it against anything.
                 They get the two numbers and no link, because there is nowhere they may go. -->
            {#if !drawn.refusal && block.total > block.shown}
              <p class="block-slice" role="status">
                {block.source === 'forecast.runway'
                  ? copy.ofWhichWalked(block.shown, block.total, block.horizon ?? 180)
                  : copy.ofWhichDrawn(block.shown, block.total)}
              </p>
            {/if}
          </section>
        {/if}
      {/each}
    </div>

    <footer class="foot">
      A read-only view of one page. The link is signed, scoped to this page, and can be revoked.
    </footer>
  {/if}
</div>

<style>
  /* THREE FIGURES ACROSS A PHONE IS THREE FIGURES OVER EACH OTHER.

     `/p/<slug>` restacks a `stat` block's cells to one column under 640px and this page, rendering
     the identical `.block-slot`, carried no media query at all. Measured on the shared money page at
     390: the figure box is 95px and `GBP 28,320.00` is 109px of text with `overflow: visible`, so it
     printed over `GBP 26,690.00`, which printed over `GBP 10,540.00`. On `/p/money` at the same
     width the same box is 324px.

     `13 §4.2` — a truncated figure is not shortened, it is wrong — and overlapped is worse than
     truncated, because it reads as a number rather than as damage. This is also the one surface
     somebody sends to an accountant, who opens it on a phone. */
  @media (width < 640px) {
    .block-slot :global(.grid) {
      grid-template-columns: minmax(0, 1fr);
    }

    .block-slot :global(.cell + .cell) {
      border-inline-start: 0;
      border-block-start: 1px solid var(--line);
    }
  }

  .block-slice {
    margin: 0;
    padding-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .shared {
    max-inline-size: 1000px;
    margin-inline: auto;
    padding: var(--sp-5);
  }

  /* No rule under the bar: the space before the title is what separates the two. */
  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  /* 114x26 on a phone. It is a link out of a SHARED page — the one screen somebody arrives at from
     a message, on a device they are holding — so it is the first target a stranger to this product
     ever tries. `13 §7`'s 44 on both axes. */
  .brand {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    gap: 9px;
    text-decoration: none;
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.022em;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    margin-inline-start: auto;
    padding: 2px var(--sp-3);
    background: var(--sunk);
    border-radius: var(--r-pill);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding-block: var(--sp-5);
  }

  .title {
    font-size: var(--t-2xl);
    letter-spacing: -0.028em;
  }

  .from {
    margin-block-start: calc(var(--sp-5) * -1 + var(--sp-1));
    color: var(--dim);
    font-size: var(--t-ui);
  }

  /* Directly under the byline it corrects, in the ink a note takes. It is not an alarm: the page is
     doing what it was built to do, and this is the sentence that says which page it is. */
  .example {
    margin-block-start: calc(var(--sp-5) * -1 + var(--sp-2));
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .block-name {
    margin-block-end: var(--sp-2);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .foot {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
