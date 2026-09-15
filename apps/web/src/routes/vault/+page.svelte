<!--
  Keys: who is asking to open them, what they are, and which machines may.

  THREE SECTIONS, IN THE ORDER OF URGENCY, as the old tool's Access screen asks it. A request waiting for
  its six digits is time-boxed, so it leads, and it is drawn only while there is one. Then the Keys
  index, then the machines holding a vault grant, each with Revoke.

  NEVER A VALUE, A CODE OR A HANDLE. A key row says whether a value is sealed, how often it was opened
  and when; the six digits are typed here and never printed; a machine is named by its label.

  THE APPROVAL IS SETTINGS', NOT A COPY OF IT. `record/vault.ts` holds the one `approve`, the one
  `answerLine` and the one `reprove`, and `/settings/agents` calls the same three.

  `/vault` carries NOTHING in its query string, ever. A credential id in the address is an entry in
  browser history and in URL-bar autocomplete (19 §5).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import { since, relative } from 'braindog-render';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { NOW, VAULT } from '$lib/record/api.ts';
  import { VAULT_GRANTS, VAULT_OPENED } from '$lib/record/data.ts';
  import { CODE_DIGITS, noRecord, type Answer, type DeviceRow } from '$lib/record/device.ts';
  import {
    answerLine, approve, asks, daysFor, holders, keysOf, namesOf, reprove, revoke, sampleGrants, sampleKeys, sampleNames,
    scopeName, words, type GrantState, type KeyRow,
  } from '$lib/record/vault.ts';
  import { read } from '$lib/data/record.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  /** Where the rows came from: the record, the sample on a host with no record, or a record that said no. */
  let from = $state<'reading' | 'live' | 'sample' | 'refused'>('reading');
  let refusal = $state('');
  let machines = $state<DeviceRow[]>([]);
  let keys = $state<KeyRow[]>([]);
  let names = $state(new Map<string, string>());
  let client: ReturnType<typeof createClient> | null = null;

  const waiting = $derived(asks(machines));
  const holding = $derived(holders(machines));
  const now = () => (from === 'sample' ? NOW : Date.now());

  onMount(() => {
    void read(async () => {
      client = createClient({ base: location.origin });
      const listed = await client.listDevices();
      if (!listed.ok) {
        const said = 'refusal' in listed ? listed.refusal : { code: 'VERSION_STALE', fix: '' };
        if (noRecord(said.code)) {
          machines = sampleGrants(VAULT_GRANTS);
          keys = sampleKeys(VAULT, VAULT_OPENED);
          names = sampleNames(VAULT_GRANTS, VAULT_OPENED);
          from = 'sample';
          return true;
        }
        refusal = said.fix;
        from = 'refused';
        return false;
      }
      /* A record without the agents pack has no Keys register, and its refusal is an empty index. */
      const [projects, credentials, grants] = await Promise.all([
        client.list({ register: 'things', limit: 200 }),
        client.list({ register: 'credentials', limit: 200 }),
        client.listGrants(),
      ]);
      type Row = { id: string; fields: Record<string, unknown>; state: string | null };
      names = projects.ok ? namesOf(projects.value.rows as Row[]) : new Map();
      keys = credentials.ok ? keysOf(credentials.value.rows as Row[], grants.ok ? (grants.value as GrantState[]) : [], names) : [];
      machines = listed.value;
      from = 'live';
      return true;
    });
  });
  $effect(() => drew('ready'));

  /* ── the code ── */
  let typed = $state('');
  let approving = $state(false);
  let answer = $state<Answer | null>(null);
  let reproving = $state(false);
  const said = $derived(answerLine(answer));

  function retype(value: string) {
    typed = value;
    answer = null;
  }

  async function tryCode(e?: SubmitEvent) {
    e?.preventDefault();
    if (approving) return;
    approving = true;
    const at = opened();
    answer = await approve(typed, from === 'live' ? client : null);
    closed(true, at);
    approving = false;
    /* THE CODE STAYS IN THE FIELD ON A REFUSAL: six digits with one wrong is a thing to correct. */
    if (answer.kind === 'approved' && client) {
      typed = '';
      const again = await client.listDevices();
      if (again.ok) machines = again.value;
    }
  }

  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await tryCode();
  }

  async function revokeRow(row: DeviceRow) {
    if (from !== 'live' || !client) {
      toasts.push(copy.notOnDemo, { intent: 'warn' });
      return;
    }
    const at = opened();
    const out = await revoke(client, machines, row.handle);
    closed(true, at);
    if (out.ok) machines = out.rows;
    else toasts.push(out.fix, { intent: 'warn' });
  }
</script>

<svelte:head><title>{titleOf(copy.vault)}</title></svelte:head>

<PageHead icon="vault" title={copy.vault} />

<div class="page">
  {#if from === 'sample'}<p class="demo" role="note">{copy.notOnDemo}</p>{/if}

  {#if from === 'refused'}
    <Empty kind="error" title={refusal} />
  {:else}
    {#if waiting.length}
      <Section title={words.waiting} count={waiting.length}>
        <ul class="whos">
          {#each waiting as d (d.handle)}
            <li class="who" data-intent="warn">
              <div class="who-head">
                <Icon name="key" size="s" />
                <span class="who-name">{d.label ?? copy.unnamedMachine}</span>
                <Chip label={scopeName(d.scope, names)} />
                <span class="who-detail">{words.days(daysFor(d.scope))}</span>
              </div>
            </li>
          {/each}
        </ul>

        <form class="code-form" onsubmit={tryCode} novalidate>
          <label class="code-label" for="vault-code">{copy.codeLabel}</label>
          <div class="code-row">
            <div class="field field-lg">
              <input
                class="field-input code-input"
                id="vault-code"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                autocapitalize="off"
                spellcheck="false"
                placeholder={'0'.repeat(CODE_DIGITS)}
                value={typed}
                oninput={(e) => retype((e.currentTarget as HTMLInputElement).value)}
                aria-describedby="vault-code-said"
                aria-invalid={said?.tone === 'bad' ? 'true' : undefined}
              />
            </div>
            <Button weight="primary" type="submit" disabled={approving}>{copy.codeGo}</Button>
          </div>
          <p class="code-said" id="vault-code-said" role="status" data-intent={said?.tone}>{said?.line ?? ''}</p>
          {#if answer?.kind === 'signin'}
            <div class="row-actions">
              <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
            </div>
          {/if}
        </form>
      </Section>
    {/if}

    <Section title={words.keys} count={keys.length}>
      {#if from !== 'reading' && keys.length === 0}
        <Empty kind="no-data-yet" title={words.noKeys} body={words.noKeysHow} />
      {/if}
      <ul class="whos">
        {#each keys as k (k.id)}
          <li class="who">
            <div class="who-head">
              <Icon name="key" size="s" />
              <span class="who-name">{k.label}</span>
              <Chip label={k.project ?? words.global} />
              <span class="who-detail">
                {k.sealed ? words.sealed : words.indexOnly}{#if k.sealed}{' · '}{words.opened(k.opened)}{#if k.lastOpened}{', '}{words.lastOpened(since(k.lastOpened, now()))}{/if}{/if}
              </span>
            </div>
            {#if k.opens}<p class="who-why">{k.opens}</p>{/if}
          </li>
        {/each}
      </ul>
    </Section>

    <Section title={words.mayOpen} count={holding.length}>
      {#if from !== 'reading' && holding.length === 0}
        <Empty kind="no-data-yet" title={words.noMachines} />
      {/if}
      <ul class="whos">
        {#each holding as d (d.handle)}
          <li class="who">
            <div class="who-head">
              <Icon name="session" size="s" />
              <span class="who-name">{d.label ?? copy.unnamedMachine}</span>
              <Chip label={scopeName(d.scope, names)} />
              <span class="who-detail">
                {d.last_used ? copy.usedWhen(since(d.last_used, now())) : copy.neverUsed} · {copy.endsWhen(relative(d.expires.slice(0, 10), now()))}
              </span>
              <span class="who-do">
                <Button weight="bare" tone="bad" onclick={() => void revokeRow(d)}>{copy.revokeKey}</Button>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </Section>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1000px;
  }

  .demo {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  /* The rows are Settings' rows: unboxed, a hairline between them, the controls at the end of the line. */
  .whos {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block: var(--sp-3);
  }

  .who + .who {
    border-block-start: 1px solid var(--line);
  }

  .who-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .who-name {
    color: var(--ink);
    font-weight: 600;
  }

  .who-detail {
    flex: 1 1 24ch;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .who-do {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .who-why {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .code-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .code-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .code-input {
    flex: 0 1 12ch;
    font-size: var(--t-md);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.18em;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
