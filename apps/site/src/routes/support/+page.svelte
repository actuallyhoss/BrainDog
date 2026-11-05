<!--
  Support: where to get help, and what to put in a report.

  EVERY CHANNEL HERE IS ONE THAT IS READ. The address is `SUPPORT_EMAIL`, which stays empty until the
  owner routes it to an inbox, and while it is empty the page says when it
  arrives instead of printing an address nobody reads. GitHub's Issues answer 404
  while the repository is private, so they are listed only once `LAUNCH.repo` is on, last and the board's whole
  width, so the address and the checklist beside it stay a pair.

  THE ADDRESS IS THE PAGE'S FIRST LINE (plan F23), on the head under its one line, not after the cards.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { LAUNCH } from '$lib/launch.ts';
  import { SOURCE, SUPPORT_EMAIL } from '$lib/links.ts';
  import { trust } from '$lib/copy/trust.ts';
  import Icon from '$lib/Icon.svelte';
  import Parts, { type Part } from '../legal/Parts.svelte';

  const s = trust.support;

  /* Widened on purpose: the constant is a literal, and the page is written for both of its values. */
  const address: string = SUPPORT_EMAIL;
  const repo: string | null = LAUNCH.repo ? SOURCE : null;

  const parts: Part[] = [
    address === ''
      ? { id: 'mail-title', title: s.mail.title, glyph: 'mail', span: 5, body: [s.mail.pending] }
      : { id: 'mail-title', title: s.mail.title, glyph: 'mail', span: 5, body: [s.mail.body] },
    { id: 'report-title', title: s.report.title, glyph: 'file', span: 7, lines: s.report.items },
    ...(repo === null
      ? []
      : [
          {
            id: 'github-title',
            title: s.github.title,
            glyph: 'code' as const,
            body: [s.github.body],
            links: [
              { label: s.github.issues, href: `${repo}/issues` },
            ],
          },
        ]),
  ];
</script>

<Seo title={s.meta.title} description={s.meta.description} path="/support" />
{#snippet head()}
  {#if address !== ''}<p class="write"><a class="btn ghost" href="mailto:{address}"><Icon name="mail" size="m" />{address}</a></p>{/if}
{/snippet}
<Parts title={s.title} lede={s.lede} {parts} {head} />

<style>
  .write {
    margin: 32px 0 0;
  }
</style>
