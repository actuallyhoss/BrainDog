<!--
  Settings > Sessions: every browser this person is signed in on, this one first, and the one press that ends the rest.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { sessions, signOutEverywhere, type SessionInfo } from '$lib/auth.ts';
  import { since } from 'braindog-render';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* WHO IS SIGNED IN IS THE HOST'S ANSWER, shared with Identity and Recovery (`settings-state.svelte.ts`). A session is
     only listed for somebody who has one, so nothing is asked until the host has said who that is. */
  const s = settingsState(() => shell);
  const me = $derived(s.hostAuth?.me ?? null);

  let rows = $state.raw<SessionInfo[] | null>(null);
  let unread = $state(false);
  let ending = $state(false);
  let said = $state<string | null>(null);

  /* THIS BROWSER FIRST, THEN THE REST BY WHEN THEY WERE LAST USED, because the one a person is sure of is their own and
     the one they are looking for is usually the most recent stranger. */
  const ordered = $derived(
    rows === null ? null : [...rows].sort((a, b) => Number(b.current) - Number(a.current) || b.activeAt - a.activeAt),
  );
  const others = $derived(ordered?.filter((r) => !r.current).length ?? 0);

  async function list(): Promise<void> {
    const at = opened();
    const out = await sessions();
    closed(true, at);
    rows = out.ok ? out.value : null;
    unread = !out.ok;
  }

  /* READ ON ARRIVING. `untrack` for the reason the Ingest area gives: `opened()` reads and writes the same state, so an
     effect that called it tracked would loop. The host is asked who is signed in first when no area has asked yet. */
  $effect(() => {
    untrack(() => {
      void (async () => {
        if (s.hostAuth === null) await s.readSignIn();
        if (s.hostAuth?.me) await list();
      })();
    });
  });

  async function endOthers() {
    if (ending) return;
    ending = true;
    said = null;
    const at = opened();
    const out = await signOutEverywhere('this');
    closed(true, at);
    ending = false;
    if (!out.ok) {
      toasts.push(copy.sessionsFailed, { intent: 'warn' });
      return;
    }
    /* SAID ONLY ONCE THE HOST HAS COUNTED WHAT IT ENDED, and the list is read again so it shows what is true now. */
    said = copy.sessionsEnded(out.value);
    await list();
  }

  const when = (ms: number): string => since(new Date(ms).toISOString());
</script>

<Section title={copy.sessions} count={ordered?.length ?? 0}>
  <p class="hint">{copy.sessionsHow}</p>
  {#if me === null}
    {#if s.hostAuth !== null}<Empty kind="no-data-yet" compact title={copy.sessionsSignedOut} />{/if}
  {:else if unread}
    <p class="hint">{copy.sessionsUnread}</p>
  {:else if ordered}
    <ul class="sessions">
      {#each ordered as r (r.ref)}
        <li class="session" data-current={r.current ? '' : undefined}>
          <span class="session-glyph"><Icon name={r.current ? 'check' : 'lock'} size="s" /></span>
          <span class="session-main">
            <span class="session-title">{r.current ? copy.sessionThis : copy.sessionOther}</span>
            <span class="session-detail">{copy.sessionWhen(when(r.authedAt), when(r.activeAt))}</span>
          </span>
        </li>
      {/each}
    </ul>
    {#if others === 0}
      <p class="hint">{copy.sessionsNoneElse}</p>
    {:else}
      <div class="row-actions">
        <Button tone="bad" onclick={endOthers} aria-busy={ending} disabled={ending}
          >{ending ? copy.sessionsEnding : copy.sessionsEndOthers}</Button
        >
      </div>
    {/if}
  {/if}
  {#if said}<p class="hint" role="status">{said}</p>{/if}
</Section>

<style>
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .sessions {
    display: grid;
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .session {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    border-block-end: 1px solid var(--line-soft);
  }

  .session-glyph {
    flex: none;
    color: var(--dim);
  }

  /* THE DETAIL WRAPS UNDER THE TITLE, never beside it, so at 390 the two dates read as one line under "Another
     browser" rather than a column squeezed to the right. */
  .session-main {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .session-title {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
  }

  .session[data-current] .session-title {
    font-weight: 600;
  }

  .session-detail {
    overflow-wrap: anywhere;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* ON A PHONE THE BUTTON IS A FULL-WIDTH ROW AT THE TOUCH HEIGHT. */
  @media (width < 640px) {
    .row-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .row-actions :global(.btn) {
      justify-content: center;
      min-block-size: 44px;
    }
  }
</style>
