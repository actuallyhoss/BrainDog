<!--
  Approve a machine: the page a terminal prints (`verification_uri`, `packages/host/src/device.ts`). `braindog login`,
  `export`, `setup` and a runner each say "Open <this page> and enter 325 684", and this page is that box and nothing
  else, so the six digits are the first thing on the screen, focused, at every width.

  THE LOOK IS THE ENTRY SCREENS' (`signin/Entry.svelte`), as the consent screen beside it is: the lit ground, the brand at
  the top, and one sheet. In the sheet, the terminal's well and the one heading, the sentence saying what to type, the
  six boxes (`CodeForm.svelte` at its `lead` size), and under them who is waiting now, so he can see what he is about to
  approve before the sixth digit sends it.

  APPROVED, THE SHEET SAYS WHAT WAS APPROVED IN PLAIN WORDS: the command and the machine it ran on, what it can now do
  and for how long, and what happens next, which is nothing here: the terminal carries on by itself. Then how to undo it.

  OWNER ONLY. Approving is the owner's (`deviceApprove`), so anyone else is told who can, and given no field the record
  would refuse. A person not signed in never reaches this: the layout sends them to sign in and back (`signInFirst`).

  `/settings/agents` STILL TAKES A CODE, for a terminal that printed the old address and for the owner who goes there.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { waiting, type Answer, type DeviceRow } from '$lib/record/device.ts';
  import { titleOf } from '$lib/title.ts';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import CodeForm from '$lib/agents/CodeForm.svelte';
  import { approverOf } from '$lib/agents/code-form.ts';
  import { askerOf, canOf, minutesLeft } from '$lib/agents/approve.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Swap from '$lib/motion/Swap.svelte';
  import { arrive } from '$lib/motion';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Entry from '../../signin/Entry.svelte';
  import { ownsRecord } from '../../settings/levels.ts';

  type Approved = Extract<Answer, { kind: 'approved' }>;

  const shell = $derived(page.data as unknown as Shell);
  const owner = $derived(ownsRecord(shell.me));

  let client: ReturnType<typeof createClient> | null = null;
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase(), fetch: (url, init) => fetch(url, init) }));
  const approve = (typed: string) => approverOf(clientOf())(typed);

  /* ── who is waiting ─────────────────────────────────────────────────── */

  /* THE MACHINES WAITING NOW, read on arrival and every five seconds while the tab is in view, so a command run after
     the page opened shows up without a reload. `null` until the first answer, or where the record would not say. */
  let machines = $state<DeviceRow[] | null>(null);
  let now = $state(recordNow());

  async function look(first: boolean) {
    const busy = first ? opened() : null;
    const out = await clientOf().listDevices().catch(() => null);
    if (busy !== null) closed(true, busy);
    now = recordNow();
    if (out?.ok) machines = out.value;
  }

  $effect(() => {
    if (!owner) return;
    untrack(() => void look(true));
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible' && done === null) void look(false);
    }, 5_000);
    return () => clearInterval(tick);
  });

  const asking = $derived(machines === null ? [] : waiting(machines, now));

  /* ── approved ───────────────────────────────────────────────────────── */

  let done = $state<Approved | null>(null);
  let heading = $state<HTMLHeadingElement | undefined>();

  function approved(a: Approved) {
    done = a;
    void look(false);
  }

  /* THE HEADING TAKES FOCUS WHEN THE SHEET CHANGES, so a screen reader is told it was approved. */
  $effect(() => {
    if (done !== null) heading?.focus();
  });

  const title = $derived(done === null ? copy.approveTitle : copy.approvedTitle);
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>

<Entry>
  <!-- THE SIX DIGITS HAND OVER TO APPROVED IN PLACE (skills pass 2 Nov): the card faded down and up again over the exit's
       and the swap's steps, where it had switched in one frame, and the green tick arrives on the spring, the one moment
       here worth a beat. At once under reduced motion. -->
  <Swap key={done !== null}>
  <div class="approve">
    {#if done !== null}
      <header class="who">
        <span class="done-well" aria-hidden="true" in:arrive|global={{ rise: 0, from: 0.8 }}><Icon name="check" size="l" /></span>
        <h1 class="entry-title" tabindex="-1" bind:this={heading}>{copy.approvedTitle}</h1>
      </header>

      <dl class="facts">
        <div class="fact-pair">
          <dt class="fact-label">{copy.approvedWhat}</dt>
          <dd class="fact" dir="auto">{askerOf(done.label, done.reach)}</dd>
        </div>
        <div class="fact-pair">
          <dt class="fact-label">{copy.approvedCan}</dt>
          <dd class="fact">{canOf(done.reach, done.scope)}</dd>
        </div>
      </dl>

      <p class="next">
        <span class="next-mark" aria-hidden="true"><Icon name="session" size="m" /></span>
        <span>{copy.approvedNext}</span>
      </p>

      <div class="acts">
        <Button onclick={() => (done = null)}>{copy.approveAnother}</Button>
        <Button href="/">{copy.openBrainDog}</Button>
      </div>

      <p class="quiet">{copy.approvedUndo} <a class="quiet-link" href={at('/settings/agents')}>{copy.approvedUndoGo}</a>.</p>
    {:else}
      <header class="who">
        <h1 class="entry-title">{copy.approveTitle}</h1>
      </header>

      {#if !owner}
        <p class="entry-lede">{copy.codeNotOwner(shell.index.name || copy.product)}</p>
      {:else}
        <p class="entry-lede">{copy.codeLede}</p>
        <CodeForm id="user-code" size="lead" autofocus {approve} onapproved={approved} />

        <!-- ONLY WHEN A MACHINE WAITS: with none, the six boxes are the whole page and nothing says so twice. -->
        {#if machines !== null && asking.length > 0}
          <section class="asking" aria-labelledby="asking-title">
            <h2 class="fact-label" id="asking-title">{copy.codeWaitingTitle}</h2>
            <ul class="ask-rows">
              {#each asking as m (m.handle)}
                <li class="ask-row">
                  <IconWell name="monitor" size="l" />
                  <span class="ask-text">
                    <span class="ask-name" dir="auto">{askerOf(m.label, m.reach)}</span>
                    <span class="ask-line">{canOf(m.reach, m.scope)}</span>
                  </span>
                  <span class="ask-left">{copy.codeWaitingLeft(minutesLeft(m.expires, now))}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <p class="quiet safe">
          <span class="safe-mark" aria-hidden="true"><Icon name="lock" size="s" /></span>
          <span>{copy.codeSafe}</span>
        </p>
      {/if}
    {/if}
  </div>
  </Swap>
</Entry>

<style>
  /* THE COLUMN INSIDE THE ENTRY TILE: everything on one start edge, 20 apart. */
  .approve {
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-inline-size: 0;
  }

  /* THE HEADING ALONE ON ITS LINE, no well beside it. */
  .who {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .who :global(.entry-title) {
    min-inline-size: 0;
  }

  .who :global(.entry-title:focus) {
    /* focus-ok: the heading takes focus only by script, when the sheet turns to Approved, so a reader is told; it is
       never in the tab order, and a ring there would read as a control. */
    outline: none;
  }

  /* THE LEDE SITS CLOSER TO THE HEADING THAN THE BOXES DO TO IT. */
  .who + :global(.entry-lede) {
    margin-block-start: calc(-1 * var(--sp-2));
  }

  /* APPROVED: a round green well with its tick, the one place this page uses the good colour as a fill. */
  .done-well {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    background: var(--good-tint);
    border-radius: var(--r-ctl);
    color: var(--good);
  }

  /* A LABEL ABOVE ITS VALUE, in meta over the body, as on the consent screen. */
  .facts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: var(--sp-4);
    background: var(--tile-2);
    border-radius: var(--r-pop);
  }

  .fact-pair {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .fact-label {
    margin: 0;
    padding: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 18px;
  }

  .fact {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  /* WHAT HAPPENS NEXT, said once in the body ink, with the terminal's mark beside it. */
  .next {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
    text-wrap: pretty;
  }

  .next-mark,
  .safe-mark {
    display: inline-flex;
    flex: none;
    color: var(--ink-2);
  }

  .next-mark {
    padding-block-start: 3px;
  }

  .safe-mark {
    padding-block-start: 3px;
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .quiet {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-wrap: pretty;
  }

  .quiet-link {
    color: var(--ink-2);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .safe {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  /* WHO IS WAITING: rows the height of a row, each a machine and what it asks for. */
  .asking {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .ask-rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ask-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .ask-row + .ask-row {
    border-block-start: 1px solid var(--rule);
  }

  .ask-text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-inline-size: 0;
  }

  .ask-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: break-word;
  }

  .ask-line {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .ask-left {
    flex: none;
    align-self: flex-start;
    padding-block-start: 2px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    line-height: 18px;
  }

  /* ON A PHONE, ONE BUTTON TO A LINE AND THE WHOLE WIDTH. */
  @media (width < 640px) {
    .acts {
      flex-direction: column;
      align-items: stretch;
    }

    .acts :global(.btn) {
      inline-size: 100%;
      justify-content: center;
    }
  }
</style>
