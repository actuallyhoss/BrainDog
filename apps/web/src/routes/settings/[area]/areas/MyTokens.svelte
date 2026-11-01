<!--
  Settings > Agents, for a member who is not an owner: keys for their own agent (`docs/20-COLLABORATION.md` §2,
  tier 0).

  WHY THIS IS HERE. An "Adds only" colleague cannot open the rest of the app, since every screen reads first, and an
  agent adding through MCP is the one way in their level was made for. Accepting an invitation that gives only that
  opens this screen (`invite/+page.svelte`), and the refusal every other screen gives her names it, so this is where
  she makes the key. The owner sees every key, hers included, in his own Connected list.

  UNDER A NEW KEY, THE LINE TO PASTE INTO AN AGENT, beside the key and its header as the owner's connect sheet prints
  them, so whoever made it can say in one line what to do with it.

  THE RECORD CAPS EACH KEY BY ITS PERSON'S LEVELS AT EVERY CALL, so the scope chosen here is a ceiling and never a
  grant, and the screen does not repeat the ladder: it prints what the record answers.

  THE BEARER LIVES IN `minted` AND NOWHERE ELSE, until Done or leaving the area, which unmounts this component.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn } from '$lib/motion';
  import { settle } from '$lib/ui/motion.ts';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import { LABEL_MAX, TOKEN_DAYS, connectLines, headerLine } from '$lib/record/device.ts';
  import { wrote } from '$lib/record/settings-write.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { bareOrigin } from '../settings-state.svelte.ts';
  import { createClient, type TokenRow } from '@braindog/client';
  import { TONES, relative, since } from 'braindog-render';
  import Tile from '$lib/ui/Tile.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { OWN_SCOPES, SCOPE_WORDS, standingOnly, words, type OwnScope } from './my-tokens.ts';

  let client: ReturnType<typeof createClient> | null = null;
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase() }));

  async function listed(): Promise<Result<TokenRow[]>> {
    const out = await clientOf().ownTokens();
    return out.ok ? { ok: true, value: standingOnly(out.value) } : out;
  }

  const held = read(() => `own-tokens:${apiBase()}`, listed, { empty: (rows) => rows.length === 0 });
  const rows = $derived(held.value ?? []);

  let name = $state('');
  /* THE WIDEST BY DEFAULT, because the colleague this screen is for adds rows, and "Adds only" needs `write` to add:
     the record takes it down to what they hold. */
  let scope = $state<OwnScope>('write');
  let minting = $state(false);
  let refusal = $state('');
  let minted = $state<{ bearer: string } | null>(null);
  /* ONE REVOKE AT A TIME, so a double press sends one. */
  let revoking = $state<string | null>(null);

  async function make(e: SubmitEvent) {
    e.preventDefault();
    if (minting) return;
    minting = true;
    refusal = '';
    const busy = opened();
    const label = name.trim().slice(0, LABEL_MAX);
    const out = wrote(await clientOf().createOwnToken({ scope, days: TOKEN_DAYS, ...(label === '' ? {} : { name: label }) }));
    closed(true, busy);
    minting = false;
    if (!out.ok) {
      refusal = out.fix;
      return;
    }
    minted = { bearer: out.value.bearer };
    name = '';
    await held.reread();
  }

  async function revokeOne(t: TokenRow) {
    if (revoking !== null) return;
    revoking = t.id;
    const busy = opened();
    const out = wrote(await clientOf().revokeOwnToken({ id: t.id }));
    closed(true, busy);
    if (!out.ok) toasts.push(out.fix, { intent: 'warn' });
    await held.reread();
    revoking = null;
  }

  /** The facts under a key's name: what it may do, when it was last used, and when it ends. */
  function factsOf(t: TokenRow, nowMs: number): string[] {
    if (t.ended_by === 'operator') return [copy.endedByOperator];
    const facts: string[] = [copy.keyCan[t.scope] ?? t.scope];
    facts.push(t.last_used_at ? copy.usedWhen(since(t.last_used_at, nowMs)) : copy.neverUsed);
    if (t.expires_at) facts.push(copy.endsWhen(relative(t.expires_at.slice(0, 10), nowMs)));
    return facts;
  }

  /**
   * The line that connects an agent with this key: Claude Code's own command for the record's MCP address, as the
   * owner's sheet prints it, with the key's header beside it. Built only inside the one reveal, so the key is never
   * written anywhere else, and gone with it on Done.
   */
  const agentLine = (bearer: string): string => `${connectLines(bareOrigin()).claude} --header "${headerLine(bearer)}"`;

  /* A LINE IS COPIED WITH ITS OWN SENTENCE, and the line is never quoted in the toast: the key is one of them. */
  const put = (line: string, said: string): void => void clipboard.put(line, line, said);
</script>

<Tile icon="key" class="section" data-surface="tile" title={words.title}>
  <div class="section-body">
    <p class="mine-why">{words.why}</p>
    {#if minted}
      {@const bearer = minted.bearer}
      <div class="mine-minted" role="status">
        <p class="mine-step">{copy.tokenOnce}</p>
        <p class="mine-step">{words.agentStep}</p>
        <div class="mine-line">
          <code class="mine-code">{agentLine(bearer)}</code>
          <Button weight="primary" onclick={() => put(agentLine(bearer), copy.lineCopied)}>{words.copyAgentLine}</Button>
        </div>
        <div class="mine-line">
          <code class="mine-code">{bearer}</code>
          <Button weight="quiet" onclick={() => put(bearer, copy.keyCopied)}>{copy.copyKey}</Button>
        </div>
        <p class="mine-step">{copy.doorKeyHeader}</p>
        <div class="mine-line">
          <code class="mine-code">{headerLine(bearer)}</code>
          <Button weight="quiet" onclick={() => put(headerLine(bearer), copy.lineCopied)}>{copy.copyHeader}</Button>
        </div>
        <div class="mine-done">
          <Button weight="bare" onclick={() => (minted = null)}>{copy.connectDone}</Button>
        </div>
      </div>
    {:else}
      <form class="mine-form field-row" onsubmit={make}>
        <label class="field-row-label" for="own-key-name">{words.nameLabel}</label>
        <div class="field-row-controls">
          <div class="field">
            <input class="field-input" id="own-key-name" type="text" autocomplete="off" maxlength={LABEL_MAX} bind:value={name} aria-describedby="own-key-said" />
          </div>
          <Button type="submit" disabled={minting}>{words.make}</Button>
        </div>
        <p class="setting-help">{words.nameHelp}</p>
        <Segmented role="group" aria-label={words.scopeLabel}>
          {#each OWN_SCOPES as s (s)}
            <button type="button" class="segment" aria-pressed={scope === s} data-on={scope === s ? '' : undefined} onclick={() => (scope = s)}>{SCOPE_WORDS[s]}</button>
          {/each}
        </Segmented>
        <p class="mine-said" id="own-key-said" role="status" data-intent={refusal ? 'bad' : undefined}>
          {#if refusal}<span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {refusal}{/if}
        </p>
      </form>
    {/if}
  </div>
</Tile>

<Tile icon="key" class="section" data-surface="tile" title={words.mine} count={rows.length || undefined}>
  <div class="section-body">
    {#if held.state === 'waiting' || held.state === 'refused' || held.state === 'offline'}
      <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
    {:else if rows.length === 0}
      <Empty kind="no-data-yet" compact title={words.none} body={words.noneWhy} />
    {:else}
      {@const nowMs = Date.now()}
      <ul class="mine-list">
        {#each rows as t (t.id)}
          <li class="mine-card" in:lineIn out:dismiss animate:flip={settle()}>
            <IconWell name="key" size="l" />
            <div class="mine-main">
              <span class="mine-name" dir="auto">{t.label ?? words.unnamed}</span>
              <span class="mine-facts">
                {#each factsOf(t, nowMs) as fact}<span>{fact}</span>{/each}
              </span>
            </div>
            <span class="mine-do">
              <Button weight="bare" tone="bad" disabled={revoking !== null} onclick={() => void revokeOne(t)}>{copy.revokeKey}</Button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Tile>

<style>
  .mine-why,
  .mine-step {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    max-inline-size: var(--measure);
  }

  .mine-form,
  .mine-minted {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .mine-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  /* A BEARER IS ONE LONG WORD, so it wraps anywhere rather than pushing the page sideways at 390. */
  .mine-code {
    flex: 1 1 16ch;
    min-inline-size: 0;
    overflow-wrap: anywhere;
    font-size: var(--fs-meta);
  }

  .mine-said {
    margin: 0;
    min-block-size: 1lh;
    font-size: var(--fs-meta);
  }

  .mine-said[data-intent='bad'] {
    color: var(--red);
  }

  /* ROWS ON THE GROUND WITH A HAIRLINE BETWEEN THEM, each led by its key's well, as the owner's Connected
     list draws its keys. The hairline runs from the words' edge. */
  .mine-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  .mine-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .mine-card + .mine-card::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: calc(var(--well-l) + var(--sp-3)) 0;
    block-size: 1px;
    background: var(--rule);
  }

  .mine-main {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-inline-size: 0;
  }

  .mine-name {
    overflow: hidden;
    font-size: var(--fs-body);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mine-facts {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* REVOKE KEEPS A THUMB'S TARGET: the button's own height is `--ctl-h`, 44px with a coarse pointer, and the column
     never shrinks under it. */
  .mine-do {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    min-block-size: var(--ctl-h);
  }

  /* ON A PHONE THE ROW WRAPS: the well, the name and its facts on the first line, Revoke under them from the name's
     edge. */
  @media (width < 640px) {
    .mine-card {
      flex-wrap: wrap;
    }

    .mine-main {
      flex-basis: calc(100% - var(--well-l) - var(--sp-3));
    }

    .mine-do {
      margin-inline-start: calc(var(--well-l) + var(--sp-3));
    }
  }
</style>
