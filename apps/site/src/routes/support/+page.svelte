<!--
  Support: where to get help, and what to put in a report.

  EVERY CHANNEL HERE IS ONE THAT IS READ. The address is `SUPPORT_EMAIL`, which stays empty until the
  owner routes it to an inbox, and while it is empty the page says when it
  arrives instead of printing an address nobody reads. GitHub's Issues and Discussions answer 404
  while the repository is private, so they are listed only once `LAUNCH.repo` is on.
-->
<script lang="ts">
  import { LAUNCH } from '$lib/launch.ts';
  import { SOURCE, SUPPORT_EMAIL } from '$lib/links.ts';
  import { trust } from '$lib/copy/trust.ts';
  import Parts, { type Part } from '../legal/Parts.svelte';

  const s = trust.support;

  /* Widened on purpose: the constant is a literal, and the page is written for both of its values. */
  const address: string = SUPPORT_EMAIL;
  const repo: string | null = LAUNCH.repo ? SOURCE : null;

  const parts: Part[] = [
    address === ''
      ? { id: 'mail-title', title: s.mail.title, glyph: 'mail', span: 5, body: [s.mail.pending] }
      : { id: 'mail-title', title: s.mail.title, glyph: 'mail', span: 5, body: [s.mail.body], action: { label: address, href: `mailto:${address}` } },
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
              { label: s.github.discussions, href: `${repo}/discussions` },
            ],
          },
        ]),
    { id: 'report-title', title: s.report.title, glyph: 'file', span: 7, lines: s.report.items },
  ];
</script>

<svelte:head>
  <title>{s.meta.title}</title>
  <meta name="description" content={s.meta.description} />
  <link rel="canonical" href="https://brain.dog/support" />
  <meta property="og:url" content="https://brain.dog/support" />
  <meta property="og:title" content={s.meta.title} />
  <meta property="og:description" content={s.meta.description} />
</svelte:head>

<Parts title={s.title} lede={s.lede} {parts} />
