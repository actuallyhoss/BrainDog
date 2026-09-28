/**
 * Every registered kind's stylesheet (`kinds/<kind>.css`), loaded with the screens that draw blocks.
 *
 * NOT IMPORTED BY A KIND'S OWN MODULE, though that is where a stylesheet would be looked for first: a kind module is
 * loaded by `blocks.ts`, which the app's tests load in plain Node, and Node cannot import a stylesheet. So the
 * stylesheets are gathered here, by a pattern rather than a list, and a new kind's `.css` arrives without a line in
 * any file. `PageView.svelte` imports this, and Home mounts `PageView` directly, so the rules cost only the screens
 * that draw a block.
 *
 * ONLY A `.svelte` FILE IMPORTS THIS. `import.meta.glob` is the bundler's and is not there in Node, so a test or a
 * plain module that imported it would throw at load.
 *
 * A kind's rules sit inside `@layer components`, as `blocks.css` does, and follow its one rule: no colour is written,
 * every value is a role a theme maps.
 */

import.meta.glob('./*.css', { eager: true });

/* A MODULE AND NOT A SCRIPT, which `import.meta` needs: this file exports nothing else. */
export {};
