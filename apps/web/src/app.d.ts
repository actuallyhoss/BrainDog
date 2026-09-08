

/**
 * Which record this build shows — substituted by `vite.config.ts` at build time.
 *
 * `''` is the shipped one. `data.ts` is the only file that reads it, and the constant folds away in
 * every build, so there is no runtime switch and nothing to reach from a console.
 */
declare const __BRAINDOG_VARIANT__: string;
