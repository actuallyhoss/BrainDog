/**
 * THE FOUNDERS' PAGE SHIPS NO SCRIPT (F17). It is finished HTML: three drawings of the example's record, a link and the
 * early access strip, none of which answers a tap. Hydrating it fetched some thirty chunks and ran the record's
 * renderer a second time on a phone, for nothing a visitor sees, and held Lighthouse's mobile performance under 95.
 * The header's menu is a native disclosure without script (`+layout.svelte`), and every link loads its page.
 */
export const csr = false;
