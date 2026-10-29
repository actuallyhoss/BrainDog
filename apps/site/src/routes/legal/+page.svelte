<!--
  Legal: the index of what BrainDog is published under.

  THE LICENCE LIVES HERE AND IN THE READMES, not on the marketing pages. A licence is a disclaimer
  somebody looks up, not a selling point somebody is sold, so the pages that sell say "open source"
  and point at the code, and this page says which licence and what it does not promise.

  NO INVENTED TERMS. The Terms of Service, the Privacy Policy and the processors are the owner's texts
  in `apps/site/legal/`. Until `LAUNCH.legal` says they are in force, this page says so in one sentence
  and links none of them; after it, it lists the three, each at `/legal/<name>`.

  The page is the night head and a board of two tiles, the licence beside the terms, with the prose at a 68ch
  reading measure inside them (`Parts.svelte`).
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { site } from '$lib/copy.ts';
  import { LAUNCH } from '$lib/launch.ts';
  import { trust } from '$lib/copy/trust.ts';
  import Parts, { type Part } from './Parts.svelte';

  const l = trust.legal;

  const parts: Part[] = [
    { id: 'licence-title', title: l.licence.title, glyph: 'code', span: 7, body: l.licence.body, links: LAUNCH.repo ? l.licence.links : [] },
    LAUNCH.legal
      ? {
          id: 'terms-title',
          title: l.terms.title,
          glyph: 'file',
          span: 5,
          body: [l.terms.live],
          links: [
            { label: l.texts.terms.title, href: '/legal/terms' },
            { label: l.texts.privacy.title, href: '/legal/privacy' },
            { label: l.texts.processing.title, href: '/legal/processing' },
          ],
        }
      : { id: 'terms-title', title: l.terms.title, glyph: 'file', span: 5, body: [l.terms.body] },
  ];
</script>

<Seo title={site.meta.legal.title} description={site.meta.legal.description} path="/legal" />
<Parts title={l.title} lede={l.lede} {parts} />
