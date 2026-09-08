

/**
 * Which record this build shows — substituted by `vite.config.ts` at build time.
 *
 * `''` is the shipped one. `data.ts` is the only file that reads it, and the constant folds away in
 * every build, so there is no runtime switch and nothing to reach from a console.
 */
declare const __BRAINDOG_VARIANT__: string;

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
