<!--
  `/add/contacts`: People › Import. One contacts file (a CSV or a vCard), what it will add, and one press that adds it.

  NOTHING IS WRITTEN UNTIL THE ONE PRESS. The file is read on this device (`lib/people/contacts.ts`), held against who
  the BrainDog keeps: anybody whose email is here already is skipped, and an organisation kept by that name is the one
  they are with. The press adds the new organisations first, then the people, each linked to theirs.

  THEN ONE QUESTION TIDIES WHAT IT LEFT (`tidyOf`), as the agents' after-an-import skill does: names in capitals, the
  new organisations' websites from their emails, and the new ones as clients where the BrainDog marks clients. Yes does
  all of it; Not now leaves it.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { apiBase, at } from '$lib/at.ts';
  import { walkRows } from '$lib/data/ref-rows.ts';
  import { BYTES_MOST } from '$lib/start/export.ts';
  import { listed, personFields, planOf, readContacts, tidyOf, words, type Contact, type HeldOrg, type HeldPerson, type Tidy, type Wrote } from '$lib/people/contacts.ts';
  import Button from '$lib/ui/Button.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { titleOf } from '$lib/title.ts';

  const base = $derived(apiBase(page.url));
  const home = $derived(at('/p/people', page.url.pathname));

  /* ── who is here already ── */
  let held = $state.raw<{ people: HeldPerson[]; orgs: HeldOrg[] } | null>(null);
  let heldFailed = $state(false);
  async function readHeld(): Promise<void> {
    const client = createClient({ base });
    const [people, orgs] = await Promise.all([walkRows(client, 'people'), walkRows(client, 'organisations')]);
    if (people === null) {
      heldFailed = true;
      held = { people: [], orgs: [] };
      return;
    }
    const text = (v: unknown): string => (typeof v === 'string' ? v : '');
    held = {
      people: people.flatMap((r) =>
        typeof r.seq === 'number'
          ? [
              {
                seq: r.seq,
                name: text(r.fields['name']),
                emails: [text(r.fields['email']), ...(Array.isArray(r.fields['keys']) ? r.fields['keys'] : []).map(text).filter((k) => k.startsWith('email:')).map((k) => k.slice(6))].filter((e) => e !== ''),
              },
            ]
          : [],
      ),
      orgs: (orgs ?? []).flatMap((r) =>
        typeof r.seq === 'number' && text(r.fields['name']) !== ''
          ? [{ seq: r.seq, name: text(r.fields['name']), kind: text(r.fields['kind']) || null, domain: text(r.fields['domain']) || null }]
          : [],
      ),
    };
  }
  $effect(() => {
    if (base) void readHeld();
  });

  /* ── the file ── */
  let file = $state('');
  let contacts = $state.raw<Contact[] | null>(null);
  let unnamed = $state(0);
  let why = $state<string | null>(null);
  let dragging = $state(false);

  async function pick(f: File | undefined): Promise<void> {
    if (!f) return;
    if (f.size > BYTES_MOST) {
      why = `That file is more than ${BYTES_MOST / (1024 * 1024)} MB.`;
      return;
    }
    const got = readContacts(f.name, await f.text());
    if ('why' in got) {
      why = got.why;
      return;
    }
    why = null;
    file = f.name;
    contacts = got.contacts;
    unnamed = got.unnamed;
    result = null;
    tidy = null;
    tidyDone = null;
  }

  function ondrop(e: DragEvent): void {
    e.preventDefault();
    dragging = false;
    void pick(e.dataTransfer?.files?.[0]);
  }

  function again(): void {
    contacts = null;
    why = null;
    result = null;
    tidy = null;
    tidyDone = null;
    void readHeld();
  }

  const plan = $derived(contacts && held ? planOf(contacts, held) : null);
  const SHOWN = 50;
  const orgNew = $derived(new Set(plan?.orgs.map((o) => o.key) ?? []));

  /* ── the press ── */
  let adding = $state<{ done: number; of: number } | null>(null);
  let result = $state<{ people: number; orgs: number; missed: number; why: string } | null>(null);

  /** Rows sent in eights, as a capture takes them, each eight one batch. The numbers made, in order, or `null` for a refusal. */
  async function inEights(rows: { register: string; fields: Record<string, unknown> }[], progress: (n: number) => void): Promise<{ made: (number | null)[]; why: string }> {
    const client = createClient({ base });
    const made: (number | null)[] = [];
    let said = '';
    for (let i = 0; i < rows.length; i += 8) {
      const these = rows.slice(i, i + 8);
      const out = await client.capture({ rows: these }).catch(() => null);
      if (out?.ok) made.push(...out.value.made.map((m) => m.seq));
      else {
        made.push(...these.map(() => null));
        const fix = (out as { refusal?: { fix?: string } } | null)?.refusal?.fix;
        if (said === '' && fix) said = fix;
      }
      progress(made.length);
    }
    return { made, why: said };
  }

  async function add(): Promise<void> {
    const p = plan;
    if (!p || p.people.length === 0 || adding || !held) return;
    const of = p.orgs.length + p.people.length;
    adding = { done: 0, of };
    const orgsOut = await inEights(
      p.orgs.map((o) => ({ register: 'organisations', fields: { name: o.name } })),
      (n) => (adding = { done: n, of }),
    );
    const orgSeq = new Map<string, number>();
    p.orgs.forEach((o, i) => {
      const s = orgsOut.made[i];
      if (typeof s === 'number') orgSeq.set(o.key, s);
    });
    for (const [k, o] of p.heldOrgs) orgSeq.set(k, o.seq);
    const peopleOut = await inEights(
      p.people.map((c) => {
        const s = c.orgKey === '' ? undefined : orgSeq.get(c.orgKey);
        return { register: 'people', fields: personFields(c, s === undefined ? null : `organisations#${s}`) };
      }),
      (n) => (adding = { done: p.orgs.length + n, of }),
    );
    adding = null;
    const wrote: Wrote = {
      people: p.people.flatMap((c, i) => (typeof peopleOut.made[i] === 'number' ? [{ seq: peopleOut.made[i]!, name: c.name }] : [])),
      orgs: p.orgs.flatMap((o, i) => (typeof orgsOut.made[i] === 'number' ? [{ seq: orgsOut.made[i]!, name: o.name, domain: o.domain }] : [])),
    };
    result = {
      people: wrote.people.length,
      orgs: wrote.orgs.length,
      missed: of - wrote.people.length - wrote.orgs.length,
      why: orgsOut.why || peopleOut.why,
    };
    tidy = tidyOf(wrote, held);
  }

  /* ── the one tidy question ── */
  let tidy = $state.raw<Tidy | null>(null);
  let tidying = $state(false);
  let tidyDone = $state<string | null>(null);

  async function tidyYes(): Promise<void> {
    const t = tidy;
    if (!t || tidying) return;
    tidying = true;
    const client = createClient({ base });
    let missed = 0;
    for (const c of t.changes) {
      const out = await client.update({ register: c.register, seq: c.seq, patch: c.patch }).catch(() => null);
      if (!(out as { ok?: boolean } | null)?.ok) missed++;
    }
    tidying = false;
    tidy = null;
    tidyDone = missed === 0 ? words.tidied : `${words.tidied} ${words.missed(missed)}`;
  }

  function tidyNo(): void {
    tidy = null;
    tidyDone = words.tidyLeft;
  }
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<PageHead icon="upload" title={words.title} sentence={words.sentence} kicker={words.kicker} back={home} />
<div class="ct-page">
  {#if result}
    <div class="ct-done" role="status">
      <h2>{words.added(result.people, result.orgs)}</h2>
      {#if result.missed > 0}<p class="ct-warn">{words.missed(result.missed)} {result.why}</p>{/if}
      {#if tidy}
        <section class="ct-tidy" aria-labelledby="ct-tidy-q">
          <h3 id="ct-tidy-q">{words.tidyAsk}</h3>
          <ul>
            {#each tidy.lines as line (line)}<li>{line}</li>{/each}
          </ul>
          <div class="ct-actions">
            <Button weight="primary" disabled={tidying} onclick={() => void tidyYes()}>{words.tidyYes}</Button>
            <Button weight="quiet" disabled={tidying} onclick={tidyNo}>{words.tidyNo}</Button>
          </div>
        </section>
      {:else if tidyDone}
        <p class="ct-quiet">{tidyDone}</p>
      {/if}
      <div class="ct-actions">
        <Button weight={tidy ? 'quiet' : 'primary'} href={home}>{words.back}</Button>
        <Button weight="quiet" onclick={again}>{words.again}</Button>
      </div>
    </div>
  {:else if contacts === null}
    <section class="ct-step" aria-labelledby="ct-file">
      <h2 class="ct-label" id="ct-file">{words.file}</h2>
      <label
        class="ct-drop"
        data-over={dragging ? '' : undefined}
        ondragover={(e) => {
          e.preventDefault();
          dragging = true;
        }}
        ondragleave={() => (dragging = false)}
        {ondrop}
      >
        <span>{words.drop}</span>
        <input class="ct-file" type="file" accept=".csv,.vcf,.vcard,.txt,text/csv,text/vcard,text/x-vcard" onchange={(e) => void pick(e.currentTarget.files?.[0])} />
      </label>
      {#if why}<p class="ct-warn" role="alert">{why}</p>{/if}
    </section>
  {:else}
    <section class="ct-step" aria-labelledby="ct-preview">
      <div class="ct-row">
        <h2 class="ct-label" id="ct-preview">{words.preview} <span class="ct-quiet">{file}</span></h2>
        <Button weight="quiet" size="sm" onclick={again}>{words.other}</Button>
      </div>
      {#if !plan}
        <p class="ct-quiet">Checking who is here already.</p>
      {:else}
        <p class="ct-sum" aria-live="polite">
          <strong>{words.people(plan.people.length)}{#if plan.orgs.length > 0}, {words.orgs(plan.orgs.length)}{/if}</strong>{#if plan.skipped.length > 0}<span class="ct-quiet"
              >{` · ${words.skipped(plan.skipped.length)}`}</span
            >{/if}{#if unnamed > 0}<span class="ct-quiet">{` · ${words.unnamed(unnamed)}`}</span>{/if}
        </p>
        {#if plan.orgs.length > 0}<p class="ct-quiet">New organisations: {listed(plan.orgs.map((o) => o.name))}.</p>{/if}
        {#if heldFailed}<p class="ct-warn">People could not be read, so nobody is marked as already here.</p>{/if}
        <div class="ct-table-wrap">
          <table class="ct-table">
            <thead>
              <tr><th scope="col">{words.columns.name}</th><th scope="col">{words.columns.org}</th><th scope="col">{words.columns.email}</th><th scope="col">{words.columns.phone}</th></tr>
            </thead>
            <tbody>
              {#each plan.people.slice(0, SHOWN) as c, i (i)}
                <tr>
                  <td class="ct-name">{c.name}</td>
                  <td>{c.org}{#if c.org && orgNew.has(c.orgKey)}<span class="ct-tag">{words.newOrg}</span>{/if}</td>
                  <td class="ct-wrap">{c.emails.join(', ')}</td>
                  <td class="ct-nowrap">{c.phones.join(', ')}</td>
                </tr>
              {/each}
              {#each plan.skipped.slice(0, Math.max(0, SHOWN - plan.people.length)) as c, i ('s' + i)}
                <tr data-already="">
                  <td class="ct-name">{c.name}<span class="ct-tag">{words.already}</span></td>
                  <td>{c.org}</td>
                  <td class="ct-wrap">{c.emails.join(', ')}</td>
                  <td class="ct-nowrap">{c.phones.join(', ')}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if plan.people.length + plan.skipped.length > SHOWN}<p class="ct-quiet">{words.more(plan.people.length + plan.skipped.length - SHOWN)}</p>{/if}
        <div class="ct-actions">
          {#if plan.people.length === 0}
            <p class="ct-quiet">{words.nothingNew}</p>
          {:else}
            <Button weight="primary" disabled={adding !== null} onclick={() => void add()}>
              {adding ? words.adding(adding.done, adding.of) : words.add(plan.people.length, plan.orgs.length)}
            </Button>
          {/if}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .ct-page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .ct-step,
  .ct-done,
  .ct-tidy {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .ct-done {
    max-inline-size: 40rem;
  }

  .ct-done h2,
  .ct-tidy h3 {
    margin: 0;
  }

  .ct-tidy h3 {
    font-size: var(--fs-body);
    font-weight: 600;
  }

  /* THE ONE QUESTION: a plain bordered tile, its lines a short list. */
  .ct-tidy {
    padding: var(--sp-4);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
  }

  .ct-tidy ul {
    margin: 0;
    padding-inline-start: var(--sp-5);
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .ct-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .ct-label {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .ct-quiet {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
  }

  p.ct-quiet,
  .ct-sum {
    margin: 0;
  }

  .ct-sum {
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .ct-warn {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  .ct-drop {
    position: relative;
    display: grid;
    place-items: center;
    min-block-size: 120px;
    padding: var(--sp-5);
    border: 1px dashed var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink-2);
    font-size: var(--fs-body);
    text-align: center;
    cursor: pointer;
  }

  .ct-drop[data-over] {
    border-color: var(--focus);
    background: var(--tile-2);
  }

  .ct-drop:focus-within {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .ct-file {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .ct-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
  }

  .ct-table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--fs-body);
  }

  .ct-table th {
    padding: var(--sp-2) var(--sp-3);
    border-block-end: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    text-align: start;
  }

  .ct-table td {
    padding: var(--sp-2) var(--sp-3);
    border-block-end: 1px solid var(--rule);
    color: var(--ink);
    vertical-align: baseline;
  }

  .ct-table tr:last-child td {
    border-block-end: 0;
  }

  .ct-table tr[data-already] td {
    color: var(--ink-3);
  }

  .ct-name {
    font-weight: 500;
  }

  .ct-wrap {
    overflow-wrap: anywhere;
  }

  .ct-nowrap {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .ct-tag {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .ct-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }
</style>
