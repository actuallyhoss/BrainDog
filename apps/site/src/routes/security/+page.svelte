<!--
  Security: how a record is kept, one fact to a line, and how to report a weakness.

  EVERY FACT NAMES ITS SOURCE in a comment beside it in `copy/trust.ts`, and says only what is built.
  A fact that stops being true is fixed there, where the file it rests on is named.

  THE REPORTING ADDRESS IS THE SUPPORT ADDRESS, `SUPPORT_EMAIL`, which stays empty until the owner
  routes it to an inbox (decisions.md item 14); until then the last part says when it arrives, and
  `/.well-known/security.txt`, whose `Contact` is required, is not served at all.
-->
<script lang="ts">
  import { SUPPORT_EMAIL } from '$lib/links.ts';
  import { trust } from '$lib/copy/trust.ts';
  import Parts, { type Part } from '../legal/Parts.svelte';

  const s = trust.security;

  /* Widened on purpose: the constant is a literal, and the page is written for both of its values. */
  const address: string = SUPPORT_EMAIL;

  const parts: Part[] = [
    { id: 'kept-title', title: s.kept.title, lines: s.kept.facts },
    address === ''
      ? { id: 'report-title', title: s.report.title, body: [s.report.pending] }
      : { id: 'report-title', title: s.report.title, body: [s.report.body], links: [{ label: address, href: `mailto:${address}` }] },
  ];
</script>

<svelte:head>
  <title>{s.meta.title}</title>
  <meta name="description" content={s.meta.description} />
  <link rel="canonical" href="https://brain.dog/security" />
  <meta property="og:url" content="https://brain.dog/security" />
  <meta property="og:title" content={s.meta.title} />
  <meta property="og:description" content={s.meta.description} />
</svelte:head>

<Parts title={s.title} lede={s.lede} {parts} />
