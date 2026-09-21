<!--
  Keys: who is asking to open them, what they are, and which machines may.

  THREE SECTIONS, IN THE ORDER OF URGENCY, as the old tool's Access screen asks it. A request waiting for
  its six digits is time-boxed, so it leads, and it is drawn only while there is one. Then the Keys
  index, then the machines holding a vault grant, each with Revoke.

  NEVER A VALUE, A CODE OR A HANDLE. A key row says whether a value is sealed, how often it was opened
  and when; the six digits are typed here and never printed; a machine is named by its label.

  THE APPROVAL IS SETTINGS', NOT A COPY OF IT. `record/vault.ts` holds the one `approve`, the one
  `answerLine` and the one `reprove`, and `/settings/agents` calls the same three.

  THE INDEX AND THE MACHINES HAVE TWO DIFFERENT CEILINGS, AND THAT IS THE DECISION. What the registers
  index is what a key OPENS and never the key, and a credential never goes in the record, so reading
  the index is not reading a secret: a colleague at `read` may have it, and `/r/credentials` already
  gives it to them. Who may open keys, and the acts on this screen, stay owner-only. Refusing one of
  those two is not an answer about the other, and this screen used to draw the first refusal it got
  as the whole page. `said.ts` holds what the record said and what is drawn from it.

  `/vault` carries NOTHING in its query string, ever. A credential id in the address is an entry in
  browser history and in URL-bar autocomplete (19 §5).
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import { since, relative } from 'braindog-render';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { NOW, VAULT } from '$lib/record/api.ts';
  import { VAULT_GRANTS, VAULT_OPENED } from '$lib/record/data.ts';
  import { CODE_DIGITS, noRecord, type Answer, type DeviceRow } from '$lib/record/device.ts';
  import {
    answerLine, approve, asks, daysFor, holders, keysOf, namesOf, reconnectOf, reprove, revoke, sampleGrants, sampleKeys, sampleNames,
    scopeName, words, type GrantState, type KeyRow,
  } from '$lib/record/vault.ts';
  import { words as actionWords } from '$lib/record/actions.ts';
  import { read } from '$lib/data/record.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { countSaid, machinesTellOf, mayAct, saidOf, tellOf, words as tells, type Said } from './said.ts';

  /** Where the rows came from: the record, or the sample on a host with no record. */
  let from = $state<'reading' | 'live' | 'sample'>('reading');
  let machines = $state<DeviceRow[]>([]);
  let keys = $state<KeyRow[]>([]);
  let names = $state(new Map<string, string>());
  let client: ReturnType<typeof createClient> | null = null;

  /**
   * WHAT THE RECORD SAID TO THREE OF THE FOUR READS, kept rather than dropped.
   *
   * A fresh self-host answers `REGISTER_UNKNOWN` to both lists and this screen drew "No keys yet."
   * over them; a colleague at `read` is refused the machines and this screen drew that one sentence
   * as the whole page, although the same person may read the Keys index on `/r/credentials`.
   * `said.ts` has the measurements and the reasoning.
   *
   * THE FOURTH READ, `things`, IS THE ONE WITH NOTHING TO SAY, so it is not kept: a project the
   * record would not name is drawn as the chip "A project" by `scopeName` and `keysOf`, which is
   * already this screen declining to guess, and a second sentence about it would say no more.
   */
  let devices = $state<Said>({ kind: 'held' });
  let index = $state<Said>({ kind: 'held' });
  let counted = $state<Said>({ kind: 'held' });

  const waiting = $derived(asks(machines));
  const holding = $derived(holders(machines));
  const now = () => (from === 'sample' ? NOW : Date.now());
  /**
   * Adding, replacing, revealing, retiring and approving: the acts, which the machines read stands for.
   *
   * THE SAMPLE KEEPS ITS CONTROLS. It is the record a stranger presses things on, and every one of them
   * answers with `copy.notOnDemo`, which is a sentence rather than a missing button.
   */
  const acts = $derived(from === 'sample' || (from === 'live' && mayAct(devices)));
  /**
   * The sentence for an act that is not this person's: the record's own where there is one, the demo's otherwise.
   *
   * THE INDEX'S REFUSAL IS ASKED SECOND, because an owner refused nothing is still refused a key form
   * over a register the record does not hold, and `devices` has no sentence about that half.
   */
  const cannot = (): string => (devices.kind !== 'held' ? devices.fix : index.kind !== 'held' ? index.fix : copy.notOnDemo);
  const indexTell = $derived(tellOf(index));
  const machinesTell = $derived(machinesTellOf(devices));
  /** Whether `listGrants` answered, so a row may say how often it was opened rather than guessing never. */
  const counts = $derived(counted.kind === 'held');

  onMount(() => {
    void read(async () => {
      client = createClient({ base: location.origin });
      const listed = await client.listDevices();
      /* NO RECORD BEHIND THE SCREEN AT ALL is the one answer that replaces the page, because there is
         nothing else to ask. Every other refusal is about one half of this screen and is said there. */
      if (!listed.ok && 'refusal' in listed && noRecord(listed.refusal.code)) {
        machines = sampleGrants(VAULT_GRANTS);
        keys = sampleKeys(VAULT, VAULT_OPENED);
        names = sampleNames(VAULT_GRANTS, VAULT_OPENED);
        from = 'sample';
        return true;
      }
      /**
       * THE INDEX IS READ WHATEVER THE MACHINES SAID. `listDevices` is about who may open keys and is
       * owner-only; the Keys index is about what a key OPENS, which is ordinary metadata a reader may
       * have, and `/r/credentials` already draws it to them. Refusing one is not an answer about the other.
       */
      devices = saidOf(listed);
      if (listed.ok) machines = listed.value;
      /* A record without the agents pack has no Keys register, and it says so rather than answering an empty index. */
      const [projects, credentials, grants] = await Promise.all([
        client.list({ register: 'things', limit: 200 }),
        client.list({ register: 'credentials', limit: 200 }),
        client.listGrants(),
      ]);
      type Row = { id: string; fields: Record<string, unknown>; state: string | null };
      index = saidOf(credentials);
      counted = saidOf(grants);
      /* A RECORD WITH NO PROJECTS LIST NAMES NO PROJECT, and the chips say "A project" where a scope
         points at one this screen cannot name, which is this screen saying where the record said nothing. */
      names = projects.ok ? namesOf(projects.value.rows as Row[]) : new Map();
      keys = credentials.ok ? keysOf(credentials.value.rows as Row[], grants.ok ? (grants.value as GrantState[]) : [], names) : [];
      from = 'live';
      reconnect();
      /* The screen has an answer if either half answered; a screen refused both halves is a refused screen. */
      return devices.kind === 'held' || index.kind === 'held';
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
    if (!acts || from !== 'live' || !client) {
      toasts.push(cannot(), { intent: 'warn' });
      return;
    }
    const at = opened();
    const out = await revoke(client, machines, row.handle);
    closed(true, at);
    if (out.ok) machines = out.rows;
    else toasts.push(out.fix, { intent: 'warn' });
  }
  /**
   * A KEY OUT OF SERVICE. `revokeGrant` is VAULT, so this reaches the record only from a browser session proved in
   * the last fifteen minutes; the bytes are destroyed and the row stays, because what it opened is a fact.
   *
   * THE INDEX IS READ AGAIN rather than patched here, so the line a person reads is the record and not a guess.
   */
  async function retireKey(k: KeyRow) {
    if (!acts || from !== 'live' || !client || !k.grant) {
      toasts.push(cannot(), { intent: 'warn' });
      return;
    }
    const at = opened();
    const out = await client.revokeGrant({ id: k.grant });
    closed(true, at);
    if (!out.ok) {
      toasts.push('refusal' in out ? out.refusal.fix : copy.writeRaced, { intent: 'warn' });
      return;
    }
    toasts.push(copy.keyRevoked(k.label), { intent: 'good' });
    await reread();
  }

  /** The index, read again from the record rather than patched here, so the line a person reads is the record. */
  async function reread() {
    if (!client) return;
    const [credentials, grants] = await Promise.all([client.list({ register: 'credentials', limit: 200 }), client.listGrants()]);
    type Row = { id: string; fields: Record<string, unknown>; state: string | null };
    if (credentials.ok) keys = keysOf(credentials.value.rows as Row[], grants.ok ? (grants.value as GrantState[]) : [], names);
  }

  /* ── putting a key in, and reading one back ── */

  /**
   * THE TWO DOORS THIS SECTION USES ARE NOT RECORD METHODS. `/api/keys/put` and `/api/keys/open` are a step on
   * the host in front of the record: this page sends a value once, the host seals it with its own key store, and
   * the record is handed sealed bytes and never a credential (ADR-062). They take a browser session, refuse every
   * bearer, and want an owner whose last sign-in is under fifteen minutes old, which is the record's own rule.
   */
  let sheet = $state<{ mode: 'add' } | { mode: 'replace'; row: KeyRow } | null>(null);
  const blank = () => ({ label: '', opens: '', kind: 'api_token', project: '', value: '' });
  let form = $state(blank());
  let saving = $state(false);
  let sheetSaid = $state('');
  const sheetTitle = $derived(sheet === null ? words.addKey : sheet.mode === 'replace' ? words.replaceTitle(sheet.row.label) : words.addKey);
  const sheetHint = $derived(sheet?.mode === 'replace' ? words.valueAgain : words.valueHint);

  /**
   * THE ONE KEY ON THE SCREEN, and the two timers that take it away: it hides itself after thirty seconds, and a
   * copy leaves the clipboard a minute later (`12 §6` rule 2). Only one is ever shown, so revealing a second puts
   * the first away rather than leaving two of them on the page.
   */
  const HIDE_S = 30;
  const CLIP_MS = 60_000;
  let shown = $state<{ id: string; label: string; value: string; left: number } | null>(null);
  let revealing = $state('');
  let ticker: ReturnType<typeof setInterval> | null = null;
  let clipboard: ReturnType<typeof setTimeout> | null = null;

  function forget() {
    if (ticker) clearInterval(ticker);
    ticker = null;
    shown = null;
  }

  /* AND LEAVING THE SCREEN PUTS IT AWAY. A route change destroys this component, and a timer still holding the
     last value would be a value alive in a tab nobody is looking at. */
  onDestroy(() => {
    forget();
    if (clipboard) clearTimeout(clipboard);
  });

  const shut = () => {
    sheet = null;
    resumeAfter = null;
  };

  /**
   * AND THE BUTTON IS NOT THE ONLY DOOR INTO THIS SHEET. `reconnect()` below calls it straight from the
   * address, and `reconnectOf` hands back `{ mode: 'add' }` for any label the index does not hold,
   * which on an index that came back absent or refused is EVERY label: the Add button is drawn only
   * where `index.kind === 'held'`, and this path walked round it into an eight-field sheet whose save
   * the record would refuse. The guard is here as well as on the button, so both doors answer alike.
   */
  function openAdd() {
    if (!acts || from !== 'live' || !client || index.kind !== 'held') {
      toasts.push(cannot(), { intent: 'warn' });
      return;
    }
    sheetSaid = '';
    form = blank();
    sheet = { mode: 'add' };
  }

  /**
   * A PAUSED ACTION'S "Reconnect key" LANDS HERE, on the sheet for the key it named: Replace when the vault holds it, Add with
   * the name filled in when it does not. The action it came from is resumed once the key is saved, so the row that said
   * "Reconnect the key and it runs again" is true after one save rather than a save and a trip back to press Resume.
   */
  let resumeAfter: string | null = null;
  function reconnect() {
    const asked = reconnectOf(new URL(location.href).searchParams, keys);
    if (!asked) return;
    resumeAfter = asked.then;
    if (asked.mode === 'replace') return openReplace(asked.row);
    openAdd();
    form = { ...blank(), label: asked.label };
  }

  function openReplace(row: KeyRow) {
    if (!acts || from !== 'live' || !client) {
      toasts.push(cannot(), { intent: 'warn' });
      return;
    }
    sheetSaid = '';
    form = blank();
    sheet = { mode: 'replace', row };
  }

  /**
   * A KEY PUT IN, OR ONE ROW'S VALUE REPLACED.
   *
   * THE RECORD'S OWN SENTENCE IS SHOWN IN THE SHEET rather than as a toast, because what it is about is a field
   * that is still on the screen, and a sheet that closes on a refusal is a sheet that throws away the typing.
   */
  async function saveKey(e?: SubmitEvent) {
    e?.preventDefault();
    if (sheet === null || saving) return;
    if (!acts || from !== 'live' || !client) {
      toasts.push(cannot(), { intent: 'warn' });
      return;
    }
    const mode = sheet.mode;
    saving = true;
    sheetSaid = '';
    const at = opened();
    const out = await client.putKey(
      sheet.mode === 'add'
        ? { label: form.label, opens: form.opens, kind: form.kind, value: form.value, ...(form.project === '' ? {} : { project: form.project }) }
        : { label: sheet.row.label, opens: sheet.row.opens, credential: sheet.row.id, value: form.value },
    );
    closed(true, at);
    saving = false;
    if (!out.ok) {
      sheetSaid = 'refusal' in out ? out.refusal.fix : copy.writeRaced;
      return;
    }
    toasts.push(mode === 'add' ? words.keyAdded(out.value.label) : words.keyReplaced(out.value.label), { intent: 'good' });
    form = blank();
    sheet = null;
    await reread();
    if (resumeAfter !== null) {
      const ingest = resumeAfter;
      resumeAfter = null;
      const back = await client.call('resumeAction', { ingest });
      if (back.ok) toasts.push(actionWords.resumed(ingest), { intent: 'good' });
      else toasts.push('refusal' in back ? back.refusal.fix : copy.writeRaced, { intent: 'warn' });
    }
  }

  /**
   * ONE KEY, READ BACK ONCE. The record counts it as a `grant.read`, so revealing is an act and not an address:
   * nothing here is reachable by a URL, nothing is written into the query string, and nothing is kept.
   */
  async function revealKey(k: KeyRow) {
    if (!acts || from !== 'live' || !client) {
      toasts.push(cannot(), { intent: 'warn' });
      return;
    }
    if (revealing !== '') return;
    revealing = k.id;
    const at = opened();
    const out = await client.openKey({ credential: k.id });
    closed(true, at);
    revealing = '';
    if (!out.ok) {
      toasts.push('refusal' in out ? out.refusal.fix : copy.writeRaced, { intent: 'warn' });
      return;
    }
    forget();
    shown = { id: k.id, label: out.value.label, value: out.value.value, left: HIDE_S };
    ticker = setInterval(() => {
      if (shown === null) return;
      const left = shown.left - 1;
      if (left <= 0) forget();
      else shown = { ...shown, left };
    }, 1000);
  }

  /** A copy, and the clipboard cleared a minute later whatever is on the screen by then (`12 §6` rule 2). */
  async function copyShown() {
    if (shown === null) return;
    try {
      await navigator.clipboard.writeText(shown.value);
    } catch {
      /* A browser that will not write to the clipboard says so by doing nothing, and the value is still on screen. */
      return;
    }
    toasts.push(words.copied, { intent: 'good' });
    if (clipboard) clearTimeout(clipboard);
    clipboard = setTimeout(() => void navigator.clipboard.writeText('').catch(() => undefined), CLIP_MS);
  }
</script>

<svelte:head><title>{titleOf(copy.vault)}</title></svelte:head>

<PageHead icon="vault" title={copy.vault} />

<div class="page">
  {#if from === 'sample'}<p class="demo" role="note">{copy.notOnDemo}</p>{/if}

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
    {#if indexTell}
      <!--
        WHAT THE RECORD SAID, RATHER THAN "No keys yet." OVER IT. A record with no Keys register and a
        record that will not hand the index over are two different states, and both used to be drawn as
        the third, an index that came back empty.
      -->
      <Empty kind={indexTell.kind} title={indexTell.title} body={indexTell.body}>
        {#snippet actions()}
          {#if index.kind === 'absent'}<Button weight="primary" href="/packs">{tells.browse}</Button>{/if}
        {/snippet}
      </Empty>
    {:else if from !== 'reading' && keys.length === 0}
      <Empty kind="no-data-yet" title={words.noKeys} body={words.noKeysHow} />
    {/if}
    <!-- AND NO FORM OVER A LIST THAT IS NOT THERE: an eight-field sheet whose save the record would refuse. -->
    {#if from !== 'reading' && acts && index.kind === 'held'}
      <div class="row-actions">
        <Button weight="primary" onclick={openAdd}>{words.addKey}</Button>
      </div>
    {/if}
    <ul class="whos">
      {#each keys as k (k.id)}
        <li class="who">
          <div class="who-head">
            <Icon name="key" size="s" />
            <span class="who-name">{k.label}</span>
            <Chip label={k.project ?? words.global} />
            <span class="who-detail">
              {k.sealed ? words.sealed : words.indexOnly}{#if k.sealed}{' · '}{counts ? words.opened(k.opened) : countSaid(counted)}{#if counts && k.lastOpened}{', '}{words.lastOpened(since(k.lastOpened, now()))}{/if}{/if}
            </span>
          </div>
          {#if k.opens}<p class="who-why">{k.opens}</p>{/if}
          {#if shown && shown.id === k.id}
            <!--
              THE ONE PLACE A VALUE IS DRAWN. It goes by itself, the countdown says when, and nothing puts it in
              the address, in the page title or in a toast.
            -->
            <div class="shown">
              <output class="shown-value" for={`key-${k.id}`}>{shown.value}</output>
              <div class="who-do">
                <Button weight="quiet" onclick={() => void copyShown()}>{words.copyValue}</Button>
                <Button weight="bare" onclick={forget}>{words.hide}</Button>
                <span class="who-detail">{words.hidesIn(shown.left)}</span>
              </div>
            </div>
          {/if}
          <div class="who-do">
            {#if acts && k.grant && k.sealed}
              <!-- ONLY WHERE THERE IS SOMETHING SEALED TO OPEN: an index row points at no grant. -->
              <Button weight="quiet" disabled={revealing === k.id} onclick={() => void revealKey(k)}>
                {revealing === k.id ? words.revealing : words.reveal}
              </Button>
            {/if}
            {#if acts}<Button weight="quiet" onclick={() => openReplace(k)}>{words.replace}</Button>{/if}
            {#if acts && k.grant && k.sealed}
              <Button weight="bare" tone="bad" onclick={() => void retireKey(k)}>{copy.revokeKey}</Button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </Section>

  <Section title={words.mayOpen} count={holding.length}>
    {#if machinesTell}
      <!-- THE HALF THAT IS OWNER-ONLY SAYS SO IN THE RECORD'S WORDS, and it no longer takes the page with it. -->
      <Empty kind={machinesTell.kind} title={machinesTell.title} body={machinesTell.body} />
    {:else if from !== 'reading' && holding.length === 0}
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
            {#if acts}
              <span class="who-do">
                <Button weight="bare" tone="bad" onclick={() => void revokeRow(d)}>{copy.revokeKey}</Button>
              </span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </Section>

  <Sheet open={sheet !== null} title={sheetTitle} subtitle={sheetHint} onclose={shut}>
    <form class="key-form" id="key-form" onsubmit={saveKey} novalidate>
      {#if sheet?.mode === 'add'}
        <label class="field-label" for="key-label">{words.nameField}</label>
        <div class="field"><input class="field-input" id="key-label" type="text" autocomplete="off" bind:value={form.label} /></div>
        <p class="field-hint">{words.nameHint}</p>

        <label class="field-label" for="key-opens">{words.opensAsk}</label>
        <div class="field"><input class="field-input" id="key-opens" type="text" autocomplete="off" bind:value={form.opens} /></div>
        <p class="field-hint">{words.opensHint}</p>

        <label class="field-label" for="key-kind">{words.kindField}</label>
        <div class="field">
          <select class="field-input" id="key-kind" bind:value={form.kind}>
            {#each words.kinds as kind (kind.id)}<option value={kind.id}>{kind.name}</option>{/each}
          </select>
        </div>

        <!--
          ONLY WHERE THERE IS A PROJECT TO PICK. On a record with no projects list the record refuses
          that read, and this select then offered one option, "No project", which is a control that
          cannot change anything.
        -->
        {#if names.size > 0}
          <label class="field-label" for="key-project">{words.projectField}</label>
          <div class="field">
            <select class="field-input" id="key-project" bind:value={form.project}>
              <option value="">{words.projectNone}</option>
              {#each [...names] as [id, name] (id)}<option value={id}>{name}</option>{/each}
            </select>
          </div>
        {/if}
      {/if}

      <label class="field-label" for="key-value">{words.valueField}</label>
      <!-- A PASSWORD FIELD, so it is not drawn while it is typed and no browser offers to remember it. -->
      <div class="field">
        <input class="field-input" id="key-value" type="password" autocomplete="off" spellcheck="false" bind:value={form.value} />
      </div>
      {#if sheetSaid}<p class="code-said" data-intent="bad" role="status">{sheetSaid}</p>{/if}
    </form>
    {#snippet footer()}
      <Button weight="quiet" onclick={shut}>{words.cancel}</Button>
      <Button weight="primary" type="submit" form="key-form" disabled={saving}>{saving ? words.saving : words.save}</Button>
    {/snippet}
  </Sheet>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
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

  /* A KEY IS ONE ROW WITH ITS ACTIONS AT THE END. It was four stacked lines, the name, what it
     opens, and a row of buttons under both, so six keys filled two screens. The name line and what
     it opens stack on the left; the actions sit at the trailing edge, centred on both. */
  .who {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px var(--sp-4);
    padding-block: var(--sp-3);
  }

  .who > :not(.who-do) {
    grid-column: 1;
  }

  .who > .who-do {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .who > .shown {
    grid-column: 1 / -1;
    margin-block: var(--sp-2);
  }

  /* ON A PHONE THE ACTIONS STAY AT THE END and sit level with the name, so a key is still one block
     beside its button rather than a button on a line of its own. */
  @media (width < 640px) {
    .who {
      align-items: start;
      column-gap: var(--sp-3);
    }

    .who > .who-do {
      grid-row: 1 / span 3;
      flex-direction: column;
      align-items: stretch;
    }
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
    flex: 1 1 auto;
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

  /* THE BUTTON IS THE FIELD'S HEIGHT, so the two read as one control and not a tall box beside a
     short one. */
  .code-row :global(.btn) {
    min-block-size: var(--tap);
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

  /* The revealed value: its own block, monospaced, wrapping rather than scrolling, and never truncated. */
  .shown {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--s2);
  }

  .shown-value {
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
    user-select: all;
  }

  .key-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .field-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .field-hint {
    margin: 0 0 var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
