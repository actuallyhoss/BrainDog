/**
 * The first-run funnel from the app's side: seven named steps, each told to the Worker once (LAUNCH 106, on the
 * counter 103 built: `apps/worker/src/step.ts`).
 *
 * WHAT GOES IS THE STEP'S NAME AND NOTHING ELSE, to this origin, with the session cookie the Worker needs to know the
 * record. No project, question, line or agent name is ever in it. Under Global Privacy Control nothing is sent, as the
 * site's visit counter does. The Worker keeps the step once a record and sends nothing at all while `COUNT_VISITS` is
 * off, so this asks and the Worker decides. The browser asks once a step a tab and once a step a device (a mark in
 * local storage, which may be missing, and then the Worker's own once-a-record still holds).
 */

import { apiBase } from './at.ts';

/** The steps, as the Directory's `STEPS` names them. A test holds the two lists equal. */
export const STEPS = ['signed_up', 'saw_connect', 'copied_line', 'agent_connected', 'project_kept', 'needs_answered', 'came_back'] as const;
export type Step = (typeof STEPS)[number];

const told = new Set<Step>();
const KEY = 'bd.funnel';

/** The steps this device has told already, or none when storage will not say. */
function kept(): Step[] {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((s): s is Step => (STEPS as readonly unknown[]).includes(s)) : [];
  } catch {
    return [];
  }
}

/** Tell the Worker `step` happened. Never throws and never waits: a step lost is one not counted. */
export function step(name: Step, io: { fetch?: typeof fetch; base?: string } = {}): void {
  try {
    if (told.has(name) || (globalThis.navigator as { globalPrivacyControl?: boolean } | undefined)?.globalPrivacyControl === true) return;
    told.add(name);
    const done = kept();
    if (done.includes(name)) return;
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify([...done, name]));
    } catch {
      /* No storage: the Worker's once-a-record holds. */
    }
    const send = io.fetch ?? globalThis.fetch;
    void send(`${io.base ?? apiBase()}/api/step`, {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      body: JSON.stringify({ step: name }),
    }).catch(() => undefined);
  } catch {
    /* A funnel that could break a screen would cost more than it counts. */
  }
}

/**
 * The hook for a draft project's "Keep it", which does not exist yet (LAUNCH 106, "the agent's first session forms the
 * first project as a draft page"). The screen that keeps a draft calls this when the keep is written.
 */
export const projectKept = (): void => step('project_kept');
