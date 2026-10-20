

/**
 * Which deployment this build is for, and which flags are on in it.
 *
 * Both are `define`d by `vite.config.ts` and both fold to a constant at build time, which is the
 * point: an environment that is decided at run time is an environment whose wrong palette is in the
 * bytes, and a flag read from a variable is a flag no gate can count the call sites of.
 *
 * `''` in the shipped build, and every read is written to survive that — a `define` that is absent
 * in a plain `vite dev` must not throw, so each is tested with `typeof` before use.
 */
declare const __BRAINDOG_ENV__: string;
declare const __BRAINDOG_FLAGS__: string;
/** Kit's build name, which it `define`s for `$app/environment`'s `version`; read directly by `lib/data/local-tab.ts`. */
declare const __SVELTEKIT_APP_VERSION__: string;

/**
 * The product's own words, made at build time out of the copy files by the `braindog:own-words` plugin of
 * `vite.config.ts` (`src/lib/shot/own-words.ts`). Screenshot mode hands the set to `src/lib/shot/plate.ts`, which
 * plates every text not in it. About 39 KB of source, so whoever mounts the mode imports it only when the mode goes
 * on (`await import('virtual:own-words')`), which keeps it out of the entry.
 */
declare module 'virtual:own-words' {
  const own: ReadonlySet<string>;
  export default own;
}
