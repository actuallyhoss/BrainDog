/**
 * Prerendered, all of it, and `ssr` stays ON — which is the difference from the record app.
 *
 * The app is `ssr = false` because it renders a database that changes while you are looking at it,
 * so there is nothing true to put in the HTML at build time. This site renders sentences that change
 * when somebody edits this repository, so every page is finished HTML on disk and readable with
 * scripting off. A landing page's first job is to arrive.
 */
export const prerender = true;
export const ssr = true;
