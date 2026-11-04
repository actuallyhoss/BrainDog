<!--
  The Share sheet for sharing on (the manage rung): somebody who manages part of the record passes it
  on to somebody else here, at View, Comment or Edit, all of it or one list it reaches, and never past their own share.
  The same sheet, rows and sentence the Share sheet draws (`ShareSheet.svelte`), with four fields instead of six:
  From (their own share, by its sentence, when they hold more than one), With, Can and What.

  THE SENTENCE SAYS IT BEFORE IT IS SENT: "Sam can edit tasks in Kiln until 19 Nov. Ends when yours does." It is drawn
  from what the browser holds (`onward.ts`), and the record's own sentence is the one said once it keeps it. A refusal
  is said in the record's own words, under the sentence.

  A PERSON'S, NEVER THEIR AGENT'S, and never while the record is seen as somebody: the record refuses `shareOnward` to
  a key, and the screen draws it only for the person whose share lets them share on (`myShares`, `onward`).
-->
<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { confirmInline } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { seeingAs } from './see-as.svelte.ts';
  import { listsOffered, onwardPeople, onwardReady, onwardSentence, onwardStart, onwardTarget, parentTarget, ONWARD_RUNGS, type Named, type OnwardPick } from './onward.ts';
  import { asksConfirm, sheetApi } from './sheet-api.ts';
  import { SHARED_EVENT, type MyShare } from './sharing.ts';

  let {
    open = $bindable(false),
    mine,
    from,
  }: {
    open?: boolean | undefined;
    /** The caller's shares they may share on now (`onwardOf`). */
    mine: readonly MyShare[];
    /** The share it opens on; absent, the first. */
    from?: string | undefined;
  } = $props();

  const shell = $derived(page.data as unknown as Shell);
  const me = $derived(String(shell.me?.person ?? ''));
  const decls = REGISTERS as unknown as Readonly<Record<string, { name: string } | undefined>>;
  const uid = $props.id();

  let api: ReturnType<typeof sheetApi> | null = null;
  const ask = () => (api ??= sheetApi(apiBase()));

  let now = $state(recordNow());
  let p = $state<OnwardPick>(onwardStart(untrack(() => from ?? mine[0]?.id ?? '')));
  let listed = $state<Named[]>([]);
  let busy = $state(false);
  let problem = $state<string | null>(null);
  let confirming = $state(false);

  /* EVERY OPENING STARTS AFRESH, on the share it was opened on, and reads who is here then. */
  function opened() {
    now = recordNow();
    p = onwardStart(from ?? mine[0]?.id ?? '');
    problem = null;
    confirming = false;
    /* WHO THE CALLER CAN LIST, for a record whose `myShares` does not say who a share may go on to. */
    if (mine.some((m) => m.to === undefined)) void ask().people(me).then((got) => (listed = got.map((x) => ({ id: x.id, name: x.name }))));
  }
  let was = false;
  $effect(() => {
    if (open && !was) opened();
    was = open;
  });

  const parent = $derived(mine.find((m) => m.id === p.from) ?? null);
  const subject = $derived(parent?.subject ?? copy.shareOnwardYours);
  const people = $derived(parent ? onwardPeople(parent, listed, me) : []);
  const lists = $derived(parent ? listsOffered(parent) : []);
  const listName = (id: string): string | undefined => decls[id]?.name;
  const sentence = $derived(parent ? onwardSentence(parent, p, now, listName) : '');
  const canSend = $derived(parent !== null && onwardReady(p, me) && !busy);

  function pickFrom(id: string) {
    p = { ...onwardStart(id), to: p.to, can: p.can };
    problem = null;
  }

  async function send() {
    if (!canSend || parent === null || p.to === null) return;
    busy = true;
    problem = null;
    const what = onwardTarget(parentTarget(parent), p.list);
    const out = await ask().onward({ from: parent.id, who: p.to.id, can: p.can, what });
    busy = false;
    if (!out.ok) {
      if (asksConfirm(out)) confirming = true;
      else problem = out.fix;
      return;
    }
    confirming = false;
    toasts.push(out.value.sentence ? `${out.value.sentence} ${copy.shareOnwardEnds}` : sentence);
    dispatchEvent(new CustomEvent(SHARED_EVENT, { detail: { ids: [out.value.id] } }));
    open = false;
  }

  async function confirm() {
    busy = true;
    const proved = await confirmInline().catch(() => false);
    busy = false;
    if (!proved) {
      problem = copy.shareConfirmFailed;
      return;
    }
    confirming = false;
    await send();
  }
</script>

{#if seeingAs() === null && mine.length > 0}
  <Sheet bind:open title={copy.shareOnwardTitle(subject)}>
    <div class="share">
      <!-- FROM: their own share, by its sentence, when they manage more than one thing. -->
      {#if mine.length > 1}
        <div class="share-row">
          <label class="share-label" for="{uid}-from">{copy.shareOnwardFrom}</label>
          <div class="share-control">
            <select id="{uid}-from" class="share-select" value={p.from} onchange={(e) => pickFrom(e.currentTarget.value)}>
              {#each mine as m (m.id)}<option value={m.id}>{m.sentence}</option>{/each}
            </select>
          </div>
        </div>
      {/if}

      <!-- WITH: somebody already on the record, by name. -->
      <div class="share-row">
        <span class="share-label" id="{uid}-with">{copy.shareWithLabel}</span>
        <div class="share-control">
          {#if p.to}
            <div class="share-who">
              <Face name={p.to.name} size="s" kind="person" />
              <span class="share-who-name">{p.to.name}</span>
              <button type="button" class="share-x tap" aria-label={copy.shareWithChange(p.to.name)} title={copy.shareWithChange(p.to.name)} onclick={() => (p = { ...p, to: null })}
                ><Icon name="close" size="s" /></button
              >
            </div>
          {:else if people.length === 0}
            <p class="share-fixed">{copy.shareOnwardNobody}</p>
          {:else}
            <ul class="share-offers" aria-label={copy.shareOnwardPick}>
              {#each people as x (x.id)}
                <li><button type="button" class="share-offer" onclick={() => ((p = { ...p, to: x }), (problem = null))}><Face name={x.name} size="s" kind="person" /><span>{x.name}</span></button></li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <!-- CAN: three rungs, never Manage. -->
      <div class="share-row">
        <span class="share-label" id="{uid}-can">{copy.shareCanLabel}</span>
        <div class="share-control">
          <Segmented role="group" aria-labelledby="{uid}-can" aria-describedby="{uid}-can-said">
            {#each ONWARD_RUNGS as r (r)}
              <button type="button" class="segment" data-on={p.can === r ? '' : undefined} aria-pressed={p.can === r ? 'true' : 'false'} onclick={() => (p = { ...p, can: r })}
                >{copy.shareRungs[r]}</button
              >
            {/each}
          </Segmented>
          <p class="share-hint" id="{uid}-can-said">{copy.shareOnwardRungs}</p>
        </div>
      </div>

      <!-- WHAT: all of their share, or one list it reaches whole. -->
      <div class="share-row">
        <label class="share-label" for="{uid}-what">{copy.shareWhatLabel}</label>
        <div class="share-control">
          {#if lists.length === 0}
            <p class="share-fixed" id="{uid}-what">{copy.shareOnwardAll(subject)}</p>
          {:else}
            <select id="{uid}-what" class="share-select" value={p.list ?? ''} onchange={(e) => (p = { ...p, list: e.currentTarget.value || null })}>
              <option value="">{copy.shareOnwardAll(subject)}</option>
              {#each lists as l (l.id)}<option value={l.id}>{listName(l.id) ?? l.name}</option>{/each}
            </select>
          {/if}
        </div>
      </div>

      <!-- THE SHARE SAID BACK, and that it ends with theirs. -->
      <div class="share-preview" aria-live="polite">
        {#if sentence}<p class="share-said">{sentence}</p>{/if}
        <p class="share-copy">{copy.shareCopyLine}</p>
        {#if problem}<p class="share-said share-refused" role="alert">{problem}</p>{/if}
        {#if confirming}
          <div class="share-confirm">
            <p class="share-count">{copy.shareConfirmWhy}</p>
            <Button weight="primary" disabled={busy} onclick={() => void confirm()}><Icon name="key" size="s" />{copy.shareConfirm}</Button>
          </div>
        {/if}
      </div>
    </div>

    {#snippet footer()}
      <Button weight="primary" disabled={!canSend || confirming} aria-busy={busy} onclick={() => void send()}>{busy ? copy.shareSending : copy.shareSend}</Button>
    {/snippet}
  </Sheet>
{/if}

<style>
  /* THE SHARE SHEET'S OWN ROWS (`ShareSheet.svelte`): a label beside its control from 640 up, over it on a phone. */
  .share {
    display: grid;
    gap: var(--sp-4);
  }

  .share-row {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
  }

  .share-label {
    padding-block-start: calc(10px * var(--dense, 1));
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .share-control {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  @media (width < 640px) {
    .share-row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-1);
    }

    .share-label {
      padding-block-start: 0;
    }
  }

  .share-who {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 40px;
  }

  .share-who-name {
    flex: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
    font-weight: 500;
  }

  .share-x {
    display: inline-grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    cursor: pointer;
  }

  .share-offers {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .share-offer {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    text-align: start;
    cursor: pointer;
  }

  .share-offer:hover,
  .share-offer:focus-visible,
  .share-x:hover,
  .share-x:focus-visible {
    background: var(--hover);
  }

  .share-fixed {
    margin: 0;
    padding-block: calc(10px * var(--dense, 1));
    color: var(--ink-2);
    font-size: var(--fs-ctl);
  }

  .share-hint {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .share-select {
    inline-size: 100%;
    min-inline-size: 0;
  }

  .share-preview {
    display: grid;
    gap: var(--sp-1);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .share-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lh-body);
  }

  .share-refused {
    color: var(--red);
  }

  .share-count,
  .share-copy {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    line-height: var(--lh-body);
  }

  .share-copy {
    color: var(--ink-3);
  }

  .share-confirm {
    display: grid;
    justify-items: start;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  @media (pointer: coarse) {
    .share-select {
      min-block-size: var(--tap);
    }
  }
</style>
