<!--
  Settings > Sessions: every browser and BrainDog app this person is signed in on, this one first, a press on each of
  the others that ends that one, and the one press that ends the rest.
  Under them, what this browser keeps of the record to draw at once and read offline (`lib/data/local.ts`), its size,
  and the one press that forgets it.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn } from '$lib/motion';
  import { settle } from '$lib/ui/motion.ts';
  import { copy } from '$lib/copy.ts';
  import { endSession, sessions, signOutEverywhere, type SessionInfo } from '$lib/auth.ts';
  import { since } from 'braindog-render';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import { forgetLocal, localSize } from '$lib/data/local-tab.ts';

  /* `bare` (G4): inside Signing in's You tile, under a small heading, not a tile of its own. */
  let { shell, bare = false }: AreaProps & { bare?: boolean } = $props();

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

  /* ── one session at a time ──
     A BRAINDOG APP NAMES ITS OWN SESSION ("iPhone, BrainDog app"), so a row says the device where the host has one, and
     a browser stays "This browser" or "Another browser", which is all a browser's session can say about itself. The
     words are this area's, as the kept-copy words below are. */
  const oneWords = {
    end: 'Sign out',
    endName: (name: string) => `Sign out ${name}`,
    ended: (name: string) => `${name} is signed out.`,
    stale: 'That one had already ended or changed since the list was read, so the list is read again.',
  } as const;
  const nameOf = (r: SessionInfo): string => r.device ?? (r.current ? copy.sessionThis : copy.sessionOther);
  /* AND WEARS THE DEVICE'S GLYPH: the phone for the iPhone app, the laptop for the Mac app, the screen for a browser. The
     label is the app's own ("iPhone, BrainDog app", `Session.deviceLabel`), so its first word says which. */
  const glyphOf = (r: SessionInfo): 'smartphone' | 'laptop' | 'monitor' =>
    r.device === undefined || r.device === null ? 'monitor' : /^(iPhone|iPad)\b/u.test(r.device) ? 'smartphone' : /^Mac\b/u.test(r.device) ? 'laptop' : 'monitor';
  let endingRef = $state<string | null>(null);

  async function endOne(r: SessionInfo) {
    if (endingRef !== null) return;
    endingRef = r.ref;
    said = null;
    const at = opened();
    const out = await endSession(r.ref);
    closed(true, at);
    endingRef = null;
    if (out.ok) said = oneWords.ended(r.device ?? copy.sessionOther);
    else if (out.kind === 'refused') said = oneWords.stale;
    else {
      toasts.push(copy.sessionsFailed, { intent: 'warn' });
      return;
    }
    /* THE LIST AS THE HOST HAS IT NOW, whichever way the press went: what ended is gone, and a row that rotated is back
       under the reference it has now. */
    await list();
  }

  /* ── what this browser keeps ── */
  const keptWords = {
    title: 'Kept on this device',
    held: (size: string) => `About ${size} of what you read here is kept on this device, so screens draw at once and you can read offline.`,
    forget: "Forget this device's copy",
    forgetting: 'Forgetting…',
    forgot: 'Forgotten. It is kept again the next time you open the record online.',
  } as const;
  const sized = (bytes: number): string =>
    bytes < 1024 ? 'under 1 KB' : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  let kept = $state<{ answers: number; bytes: number } | null>(null);
  let forgetting = $state(false);
  let forgot = $state(false);
  $effect(() => {
    untrack(() => void localSize().then((n) => (kept = n)));
  });
  async function forget() {
    if (forgetting) return;
    forgetting = true;
    await forgetLocal();
    kept = await localSize();
    forgetting = false;
    forgot = true;
  }
</script>

{#snippet body()}
    <!-- WHAT SIGNING OUT DOES, only where there is somebody signed in to do it. -->
    {#if me !== null}<p class="hint">{copy.sessionsHow}</p>{/if}
    {#if me === null}
      {#if s.hostAuth !== null}<Empty kind="no-data-yet" compact title={copy.sessionsSignedOut} />{/if}
    {:else if unread}
      <p class="hint">{copy.sessionsUnread}</p>
    {:else if ordered}
      <!-- EACH BROWSER AS A ROW ON THE GROUND: this one's well is ink, the product's "here", as the rail's current place
           is; the others are the plain well. -->
      <ul class="ledger ledger-lead sessions">
        {#each ordered as r (r.ref)}
          <li class="session" data-current={r.current ? '' : undefined} in:lineIn out:dismiss animate:flip={settle()}>
            <div class="line line-tall">
              <span class="line-mark"><IconWell name={glyphOf(r)} size="l" tone={r.current ? 'ink' : undefined} /></span>
              <span class="line-main">
                <span class="line-title session-title">{nameOf(r)}</span>
                <span class="line-detail session-detail">{copy.sessionWhen(when(r.authedAt), when(r.activeAt))}</span>
              </span>
              <span class="line-amount"></span>
              <!-- EVERY ROW BUT THIS ONE ENDS ON ITS OWN, as a passkey is removed on its own row. This one is signed out
                   from the account menu. -->
              <span class="line-when">
                {#if !r.current}
                  <Button
                    weight="bare"
                    tone="bad"
                    aria-label={oneWords.endName(nameOf(r))}
                    aria-busy={endingRef === r.ref}
                    disabled={endingRef !== null || ending}
                    onclick={() => endOne(r)}>{oneWords.end}</Button
                  >
                {/if}
              </span>
            </div>
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
{/snippet}
{#if bare}
  <section class="bare-sessions" aria-labelledby="sessions-h">
    <h3 class="bare-h" id="sessions-h">{copy.sessions}</h3>
    {@render body()}
  </section>
{:else}
<Tile icon="monitor" class="section" data-surface="tile" title={copy.sessions} count={(ordered?.length ?? 0) || undefined}>
  <div class="section-body">{@render body()}</div>
</Tile>
{/if}

<!-- ONLY ONCE SOMETHING IS KEPT: a card saying nothing was kept here was a
     card with nothing in it to act on. Just forgotten, it says so once. -->
{#if forgot || (kept !== null && kept.answers > 0)}
<Tile icon="download" class="section" data-surface="tile" title={keptWords.title}>
  <div class="section-body">
    {#if forgot}
      <p class="hint" role="status">{keptWords.forgot}</p>
    {:else if kept !== null}
      <p class="hint">{keptWords.held(sized(kept.bytes))}</p>
      <div class="row-actions">
        <Button tone="bad" onclick={forget} aria-busy={forgetting} disabled={forgetting}>{forgetting ? keptWords.forgetting : keptWords.forget}</Button>
      </div>
    {/if}
  </div>
</Tile>
{/if}

<style>
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .sessions {
    margin-block-end: var(--sp-3);
  }

  .session[data-current] .session-title {
    font-weight: 600;
  }

  /* THE TWO DATES WRAP UNDER THE TITLE rather than cut, so at 390 both are read whole under "Another browser". */
  .session-detail {
    overflow-wrap: anywhere;
    white-space: normal;
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

  .bare-sessions {
    margin-block-start: var(--sp-4);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .bare-h {
    margin: 0 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
  }
</style>
