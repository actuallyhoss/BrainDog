/**
 * The app's config with one or both flips of the one-domain move taken back out, built in memory for the tests.
 *
 * THE SHAPE BEFORE A FLIP IS WHAT A ROLLBACK OF THAT FLIP LANDS ON, SO ITS CHECKS OUTLIVE THE PUSH THAT RETIRED IT.
 * A faulty flip is undone with `wrangler rollback` of the app and a `git revert`, which puts these vars back behind the
 * same site binding. The smoke step and `provision-check` still carry a
 * branch for that shape (the public host is the Worker's own Custom Domain, and its old `/app` page loads are sent to its root on
 * the same name), and once B2 moved production's vars into `wrangler.jsonc` nothing in the file reached that branch:
 * with push 4's vars in place, eight of the scripts' tests that asked the file for production's pre-flip answers
 * failed. Written here, the branch stays tested for the day a revert needs it.
 *
 * TWO VARS PER ENVIRONMENT AND NOTHING ELSE, because a flip is two vars and no route (`test/wrangler-routes.test.ts`
 * holds the file to that). Applied with `applyPush`, so a key the file stops having is refused rather than added.
 */

import { applyPush } from './provision-check.mjs';

/** Each environment's two vars as push A deployed them: the Worker on its own name, and no old name yet. */
export const BEFORE_FLIP = Object.freeze({
  production: Object.freeze({ PUBLIC_HOST: 'app.brain.dog', LEGACY_HOSTS: '' }),
  alpha: Object.freeze({ PUBLIC_HOST: 'app.alpha.brain.dog', LEGACY_HOSTS: '' }),
});

/**
 * Each environment's two vars as the one-domain move left them (push B2): the Worker's public host the shared name,
 * and the app's own name a legacy host. The file went back to the app's own name after it (push C), so this shape is
 * the one a later move to the shared name would land on, and the checks still carry a branch for it.
 */
export const AFTER_FLIP = Object.freeze({
  production: Object.freeze({ PUBLIC_HOST: 'brain.dog', LEGACY_HOSTS: 'app.brain.dog' }),
  alpha: Object.freeze({ PUBLIC_HOST: 'alpha.brain.dog', LEGACY_HOSTS: 'app.alpha.brain.dog' }),
});

/** `config` with the flips of `envs` put in, the shared name public. A copy; the config handed in is not touched. */
export const flipped = (config, envs = Object.keys(AFTER_FLIP)) =>
  applyPush(config, Object.fromEntries(envs.map((env) => [env, { vars: { ...AFTER_FLIP[env] } }])));

/**
 * `config` with the flips of `envs` taken out: `['production']` is B1, push 4 rolled back, and both is push A. A copy;
 * the config handed in is not touched.
 */
export const unflipped = (config, envs = Object.keys(BEFORE_FLIP)) =>
  applyPush(config, Object.fromEntries(envs.map((env) => [env, { vars: { ...BEFORE_FLIP[env] } }])));
