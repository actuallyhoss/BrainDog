<!--
  Sharing one money account, a household view: "Share this account" and the sheet it opens (`part="button"`), and the
  line under the account's head that says who it is shared with, each with Stop (`part="line"`). The account page draws
  each once; the two talk by the window's `braindog:shared` event, so the line reads again when the sheet keeps a share.

  THE SHEET IS SMALL ON PURPOSE: who (somebody on the record or an email) and View or Edit. What they see is said in one
  line and never chosen: the account, every line on it, and the names those lines need (`account-share.ts`). An email
  gets the link that joins them, shown once. A share the record asks to confirm is confirmed with a passkey in the
  sheet, and sent again, as the Share sheet does.

  ONLY WHERE IT CAN SHARE, and never while the record is seen as somebody: the account page draws it for an owner or an
  Admin (`sharable` in `PageView.svelte`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { apiBase } from '$lib/at.ts';
  import { confirmInline } from '$lib/auth.ts';
  import { put } from '$lib/clipboard.ts';
  import { copy } from '$lib/copy.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { inviteLink } from '$lib/record/settings-write.ts';
  import { SHARED_EVENT } from '$lib/sharing/sharing.ts';
  import { asksConfirm, sheetApi, type Here, type SheetApi } from '$lib/sharing/sheet-api.ts';
  import { isEmail } from '$lib/sharing/share-state.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { accountShareApi, accountShares, shareListsOf, type Holder, type Rung, type ShareLists, type Who } from './account-share.ts';

  /*
   * `part="sheet"` IS THE SHEET WITHOUT A BUTTON, opened each time `ask` goes up (audit of 30 October, 19): the account
   * page's Share and "Share this account" stood side by side, so the page's one Share offers this as its first choice.
   */
  let { part, seq, name, ask = 0 }: { part: 'button' | 'line' | 'sheet'; seq: number; name: string; ask?: number } = $props();

  const uid = $props.id();
  const shell = $derived(page.data as unknown as Shell);
  let api: SheetApi | null = null;
  let mine: ReturnType<typeof accountShareApi> | null = null;
  const sheet = () => (api ??= sheetApi(apiBase()));
  /* THE LISTS THE SHARE REACHES INTO, read off the declarations the tab asks beside `boot` (`shareListsOf`), never by
     name. A record that keeps no ledger shares nothing from here. */
  let reach: Promise<ShareLists | null> | null = null;
  const listsHere = () =>
    (reach ??= import('./read.ts').then((m) => m.declarations(apiBase(), (page.data as { lists?: { id: string; kernel?: true }[] }).lists ?? [])).then(shareListsOf));
  const money = async () => {
    if (mine) return mine;
    const lists = await listsHere();
    return lists ? (mine = accountShareApi(apiBase(), lists)) : null;
  };

  /* ── the line: who holds it ── */
  let holders = $state<Holder[]>([]);
  let account = $state<{ id: string; book: string | null } | null>(null);
  async function readHolders() {
    const m = await money();
    if (!m) return;
    account ??= await m.account(seq);
    holders = account ? await m.holders(account.id) : [];
  }
  /* THE READ IS UNTRACKED: `readHolders` reads and writes `account` before its first await, and a tracked read of it
     here ran the effect again on its own write, for ever, and hung every account page. Only `part` and `seq` rerun it. */
  $effect(() => {
    if (part !== 'line') return;
    void seq;
    untrack(() => {
      account = null;
      void readHolders();
    });
    const again = () => void readHolders();
    addEventListener(SHARED_EVENT, again);
    return () => removeEventListener(SHARED_EVENT, again);
  });
  let stopping = $state<string | null>(null);
  async function stop(h: Holder) {
    stopping = h.ids[0] ?? null;
    const m = await money();
    if (!m) {
      stopping = null;
      return;
    }
    const out = await m.stop(h.ids);
    stopping = null;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    toasts.push(copy.accountShareStopped(h.who));
    await readHolders();
  }

  /* ── the sheet ── */
  let open = $state(false);
  let typed = $state('');
  let people = $state<Here[]>([]);
  let chosen = $state<{ who: Who; said: string } | null>(null);
  let can = $state<Rung>('view');
  let busy = $state(false);
  let problem = $state<string | null>(null);
  let confirming = $state(false);
  let link = $state<{ email: string; href: string } | null>(null);

  /* ASKED FROM THE PAGE'S SHARE, each press once. */
  let asked = 0;
  $effect(() => {
    const n = ask;
    if (part === 'sheet' && n > asked) {
      asked = n;
      untrack(opened);
    }
  });

  function opened() {
    typed = '';
    chosen = null;
    can = 'view';
    problem = null;
    confirming = false;
    link = null;
    open = true;
    void sheet()
      .people(String(shell.me?.person ?? ''))
      .then((got) => (people = got));
  }

  const needle = $derived(typed.trim().toLowerCase());
  const offered = $derived(needle === '' ? people : people.filter((p) => p.name.toLowerCase().includes(needle) || (p.email ?? '').toLowerCase().includes(needle)));
  const emailOffered = $derived(isEmail(typed) && !people.some((p) => (p.email ?? '').toLowerCase() === needle) ? needle : null);

  async function send() {
    if (!chosen || busy) return;
    busy = true;
    problem = null;
    const m = await money();
    const lists = await listsHere();
    const at = m ? await m.account(seq) : null;
    if (!m || !lists || !at) {
      busy = false;
      problem = copy.accountShareMissing;
      return;
    }
    const payees = await m.payees(at.id);
    const shares = accountShares({ who: chosen.who, account: at.id, can, book: at.book, payees, lists });
    const out = await sheet().send(shares, null);
    if (!out.ok) {
      busy = false;
      if (asksConfirm(out)) confirming = true;
      else problem = out.fix;
      return;
    }
    confirming = false;
    toasts.push(copy.accountShareSent(name, chosen.said));
    dispatchEvent(new CustomEvent(SHARED_EVENT, { detail: { ids: out.value.ids } }));
    if (chosen.who.kind === 'email') {
      const email = chosen.who.id;
      const made = await sheet().invite(email);
      busy = false;
      if (made.ok) {
        link = { email, href: inviteLink(location.origin, made.value) };
        return;
      }
      toasts.push(copy.shareLinkMissed(email), { intent: 'warn' });
    }
    busy = false;
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

{#if part === 'button' || part === 'sheet'}
  {#if part === 'button'}<Button onclick={opened}><Icon name="user-plus" size="s" />{copy.accountShareOpen}</Button>{/if}
  <Sheet bind:open title={copy.accountShareTitle(name)} fit>
    {#if link}
      <!-- THE LINK IS SHOWN ONCE: the record keeps only its hash. -->
      <div class="acct-share">
        <p class="acct-said">{copy.shareLinkSaid(link.email)}</p>
        <label class="field-label" for="{uid}-link">{copy.shareLinkLabel}</label>
        <span class="field"><input id="{uid}-link" class="field-input" readonly value={link.href} /></span>
        <div class="acct-acts">
          <Button weight="primary" onclick={() => void put(link?.href ?? '', copy.shareLinkCopy, copy.shareLinkCopied)}><Icon name="copy" size="s" />{copy.shareLinkCopy}</Button>
          <Button onclick={() => (open = false)}>{copy.done}</Button>
        </div>
      </div>
    {:else}
      <div class="acct-share">
        <p class="acct-said">{copy.accountShareSaid}</p>

        <span class="field-label" id="{uid}-who">{copy.accountShareWho}</span>
        {#if chosen}
          <div class="acct-who">
            <Face name={chosen.said} size="s" kind="person" />
            <span class="acct-who-name">{chosen.said}</span>
            <button type="button" class="acct-x tap" aria-label={copy.shareWithChange(chosen.said)} onclick={() => (chosen = null)}><Icon name="close" size="s" /></button>
          </div>
        {:else}
          <span class="field">
            <input
              class="field-input"
              type="text"
              inputmode="email"
              autocomplete="off"
              aria-labelledby="{uid}-who"
              placeholder={copy.shareWithHint}
              bind:value={typed}
              onkeydown={(e) => {
                if (e.key === 'Enter' && emailOffered) {
                  e.preventDefault();
                  chosen = { who: { kind: 'email', id: emailOffered }, said: emailOffered };
                }
              }}
            />
          </span>
          <ul class="acct-offers" aria-labelledby="{uid}-who">
            {#if emailOffered}
              <li>
                <button type="button" class="acct-offer" onclick={() => (chosen = { who: { kind: 'email', id: emailOffered ?? '' }, said: emailOffered ?? '' })}
                  ><Icon name="plus" size="s" /><span>{copy.shareWithInvite(emailOffered)}</span></button
                >
              </li>
            {/if}
            {#each offered.slice(0, 6) as p (p.id)}
              <li>
                <button type="button" class="acct-offer" onclick={() => (chosen = { who: { kind: 'person', id: p.id }, said: p.name })}
                  ><Face name={p.name} size="s" kind="person" /><span>{p.name}</span></button
                >
              </li>
            {/each}
          </ul>
        {/if}

        <span class="field-label" id="{uid}-can">{copy.accountShareCan}</span>
        <Segmented role="group" aria-labelledby="{uid}-can">
          {#each [['view', copy.accountShareView], ['edit', copy.accountShareEdit]] as const as [r, said] (r)}
            <button type="button" class="segment" data-on={can === r ? '' : undefined} aria-pressed={can === r ? 'true' : 'false'} onclick={() => (can = r)}>{said}</button>
          {/each}
        </Segmented>
        {#if can === 'edit'}<p class="acct-note">{copy.accountShareEditSaid}</p>{/if}

        {#if problem}<p class="acct-problem" role="alert">{problem}</p>{/if}
        {#if confirming}
          <Button weight="primary" disabled={busy} onclick={() => void confirm()}><Icon name="key" size="s" />{copy.shareConfirm}</Button>
        {:else}
          <Button weight="primary" disabled={!chosen || busy} aria-busy={busy} onclick={() => void send()}>{copy.accountShareSend}</Button>
        {/if}
      </div>
    {/if}
  </Sheet>
{:else if holders.length > 0}
  <p class="acct-holders">
    <span class="acct-holders-head">{copy.accountSharedWith}</span>
    {#each holders as h, i (h.ids[0])}
      <span class="acct-holder"
        >{copy.accountSharedCan(h.who, h.edit)}<button
          type="button"
          class="acct-stop tap"
          aria-label={copy.accountShareStopSaid(h.who)}
          disabled={stopping !== null}
          onclick={() => void stop(h)}>{copy.accountShareStop}</button
        >{#if i < holders.length - 1}<span aria-hidden="true">{' · '}</span>{/if}</span
      >
    {/each}
  </p>
{/if}

<style>
  .acct-share {
    display: grid;
    gap: var(--sp-3);
  }
  /* EACH QUESTION STANDS APART FROM THE ONE ABOVE IT, "With" and "They can" as the Share sheet sets them, not run on
     under the sentence; and the choice keeps its own width. */
  .acct-share > :global(.field-label) {
    margin-block-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }
  .acct-share > :global(.segmented) {
    justify-self: start;
  }
  .acct-share > :global(.button:last-child),
  .acct-share > :global(button:last-child) {
    margin-block-start: 8px;
  }
  .acct-said,
  .acct-note {
    margin: 0;
    color: var(--ink-2);
  }
  .acct-note {
    font-size: 0.875em;
  }
  .acct-problem {
    margin: 0;
    color: var(--red);
  }
  .acct-acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .acct-who {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .acct-who-name {
    flex: 1;
    min-width: 0;
  }
  .acct-x,
  .acct-stop {
    border: 0;
    background: none;
    color: var(--ink-2);
    cursor: pointer;
  }
  .acct-stop {
    margin-inline-start: var(--sp-2);
    text-decoration: underline;
    font: inherit;
  }
  .acct-offers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .acct-offer {
    display: flex;
    align-items: center;
    gap: var(--gap-glyph);
    width: 100%;
    min-height: var(--row-h);
    border: 0;
    background: none;
    color: var(--ink);
    text-align: start;
    cursor: pointer;
    border-radius: var(--r-ctl);
    padding: var(--sp-1) var(--sp-2);
  }
  .acct-offer:hover {
    background: var(--hover, color-mix(in oklab, var(--ink) 6%, transparent));
  }
  /* IN THE PAGE'S COLUMN, level with the filters and tiles under it, not out at the edge of the screen. */
  .acct-holders {
    margin: var(--sp-1) var(--gutter, 16px) 0;
    justify-self: start;
    inline-size: fit-content;
    max-inline-size: calc(100% - 2 * var(--gutter, 16px));
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--r-ctl, 8px);
    background: var(--tile-2, color-mix(in oklab, var(--ink) 4%, transparent));
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-2);
    align-items: baseline;
    color: var(--ink-2);
    font-size: 0.875em;
    line-height: var(--lead-ui);
  }
  .acct-holders-head {
    color: var(--ink-3);
  }
  .acct-holder {
    display: inline-flex;
    align-items: baseline;
    gap: var(--sp-1);
  }
</style>
