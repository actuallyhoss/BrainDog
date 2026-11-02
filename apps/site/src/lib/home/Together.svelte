<!--
  The together band: "Bring in the people you work with." (2 November, when working together shipped). Three tiles
  on the who band's pattern: the roles in the app's own words with Make owner, an @ mention that rings a colleague's
  phone and the faces of who else is here, and a read-only link to one page with money left off. Under them, one line
  for the contacts import and the way on to the sharing docs.

  Every word is `copy/home.ts`'s `together`; the names are Maya's people (`lib/demo/maya.ts`). Nothing here needs a
  script: it is three drawings and a link.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';
  import { FOUNDER, PEOPLE, PROJECTS } from '$lib/demo/maya.ts';

  const t = home.together;
  const ROLES = [
    { who: PEOPLE.dana, role: 'Can edit' },
    { who: PEOPLE.leo, role: 'Can add' },
    { who: PEOPLE.sam, role: `Can view, ${PROJECTS.northbound.name} only` },
  ];
  const LINK_ICONS = ['link', 'clock', 'eye'] as const;
</script>

<section class="band band--together" aria-labelledby="together-title">
  <div class="wrap reveal">
    <div class="cols head">
      <h2 id="together-title" class="band-h2 c7">{t.title}</h2>
      <p class="band-say c5">{t.say}</p>
    </div>
    <div class="cols trio">
      <article class="ftile c4 violet">
        <span class="fwell"><Icon name="users" /></span>
        <h3>{t.roles.title}</h3>
        <p class="say">{t.roles.say}</p>
        <div class="draw" aria-hidden="true">
          <p class="row"><span class="face me">{FOUNDER.initials}</span><span>{FOUNDER.name}</span><span class="role">Owner</span></p>
          {#each ROLES as r (r.who.name)}
            <p class="row"><span class="face">{r.who.initials}</span><span>{r.who.name}</span><span class="role">{r.role}</span></p>
          {/each}
        </div>
      </article>

      <article class="ftile c4 pink">
        <span class="fwell"><Icon name="bell" /></span>
        <h3>{t.mention.title}</h3>
        <p class="say">{t.mention.say}</p>
        <div class="draw" aria-hidden="true">
          <p class="here"><span class="face me">{FOUNDER.initials}</span><span class="face">{PEOPLE.dana.initials}</span><span class="here-say">Here now</span></p>
          <p class="comment"><b class="at">@{PEOPLE.dana.name}</b> {t.mention.comment}</p>
        </div>
      </article>

      <article class="ftile c4 teal">
        <span class="fwell"><Icon name="link" /></span>
        <h3>{t.link.title}</h3>
        <p class="say">{t.link.say}</p>
        <div class="draw" aria-hidden="true">
          {#each t.link.rows as row, i (row)}
            <p class="row link"><Icon name={LINK_ICONS[i] ?? 'link'} size="s" /><span>{row}</span></p>
          {/each}
        </div>
      </article>
    </div>
    <p class="also">{t.imports}</p>
    <p class="on"><a class="onward" href={t.href}>{t.link2}<Icon name="arrow-right" size="s" /></a></p>
  </div>
</section>

<style>
  .head {
    align-items: end;
  }

  .head .band-say {
    margin: 0;
  }

  .trio {
    margin-block-start: var(--head-gap);
  }

  .ftile {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-inline-size: 0;
    background: var(--band-slash-tile);
    color: var(--ink);
  }

  .violet {
    --well: var(--cat-violet-tint, color-mix(in srgb, var(--ink) 8%, transparent));
    --well-ink: var(--cat-violet, var(--ink));
  }

  .pink {
    --well: var(--cat-pink-tint, color-mix(in srgb, var(--ink) 8%, transparent));
    --well-ink: var(--cat-pink, var(--ink));
  }

  .teal {
    --well: var(--cat-teal-tint, color-mix(in srgb, var(--ink) 8%, transparent));
    --well-ink: var(--cat-teal, var(--ink));
  }

  .fwell {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: 8px;
    background: var(--well);
    color: var(--well-ink);
  }

  .fwell :global(.icon) {
    inline-size: 20px;
    block-size: 20px;
  }

  h3 {
    margin-block-start: 6px;
    font-size: var(--t-card);
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .say {
    margin: 0;
    font-size: var(--t-text);
    line-height: 1.55;
    color: var(--ink2);
    text-wrap: pretty;
  }

  .draw {
    margin-block-start: auto;
    padding-block-start: 8px;
  }

  .draw p {
    margin: 0;
  }

  /* A PERSON OR A LINE OF THE LINK, as the app's lists draw a row: a hairline over each but the first. */
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-block-start: 1px solid var(--rule, color-mix(in srgb, var(--ink) 10%, transparent));
    color: var(--ink);
    font-size: var(--t-site-14);
  }

  .row:first-child {
    border-block-start: 0;
  }

  .row.link {
    grid-template-columns: auto minmax(0, 1fr);
    color: var(--ink2);
  }

  .role {
    color: var(--ink2);
    white-space: nowrap;
  }

  .face {
    display: inline-grid;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink) 10%, transparent);
    color: var(--ink);
    font-size: 10px;
    font-weight: 600;
  }

  .face.me {
    background: var(--ink);
    color: var(--band-slash-tile);
  }

  .here {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--ink2);
    font-size: var(--t-site-14);
  }

  .here-say {
    margin-inline-start: 6px;
  }

  .comment {
    margin-block-start: 10px !important;
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    color: var(--ink);
    font-size: var(--t-site-14);
    line-height: 1.5;
  }

  .at {
    font-weight: 600;
  }

  .also {
    margin: 24px 0 0;
    color: var(--ink2);
    font-size: var(--t-text);
  }

  .on {
    margin: 12px 0 0;
  }

  @media (max-width: 760px) {
    .draw {
      display: none;
    }

    .trio {
      gap: 8px;
    }
  }
</style>
