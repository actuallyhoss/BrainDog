/**
 * `POST /api/step`: one first-run step a signed-in browser took, counted once a record (LAUNCH 106, the funnel 103 set up).
 *
 * THE APP SENDS IT, from a session only: `{ step }` and nothing else, and the record is the session's own, never a field
 * of the body. It rides the same switch as the visit counter: with `COUNT_VISITS` off nothing is read and nothing is
 * kept. It always answers 204, so the answer tells a caller nothing about whether a step was new or counting is on.
 *
 * WHAT IT NEVER TAKES: a record, a name, a project, a question or any content. The Directory keeps the record's own id
 * against the step's name and the day, and `telemetry.ts` never sees either.
 *
 * ITS OWN FILE, FREE OF `cloudflare:`, so every decision runs in a test over fakes; `index.ts` mounts it.
 */

import { STEPS, type Step } from '@braindog/record/directory';

import { NOSNIFF } from './files.ts';

export { STEPS, type Step };

/** The most of a body this door reads: `{ step }` with room to spare. */
export const STEP_BODY_MAX = 256;

/** `/api/step`, asked of a path already moved to the root. */
export const servesStep = (pathname: string): boolean => /^\/+api\/+step\/*$/.test(pathname);

export type StepDeps = {
  /** `COUNT_VISITS` is `yes`. Unset, empty or anything else is off. */
  on: boolean;
  /** The signed-in session's record, or `null` for any other door. */
  record: string | null;
  /** The Directory's `step.mark`. */
  mark: (call: { flow: 'step.mark'; record: string; step: Step }) => Promise<unknown>;
};

const NOTHING = (): Response => new Response(null, { status: 204, headers: [['cache-control', 'no-store'], ...NOSNIFF] });

/** `POST /api/step`, in order: on, method, session, body, list, mark. Every way out is the same 204. */
export async function stepDoor(request: Request, deps: StepDeps): Promise<Response> {
  if (!deps.on || request.method !== 'POST' || deps.record === null) return NOTHING();
  if (Number(request.headers.get('content-length') ?? '0') > STEP_BODY_MAX) return NOTHING();
  let body: unknown = null;
  try {
    body = JSON.parse((await request.text()).slice(0, STEP_BODY_MAX));
  } catch {
    return NOTHING();
  }
  const said = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as { step?: unknown }).step : undefined;
  const step = STEPS.find((s) => s === said);
  if (step === undefined) return NOTHING();
  try {
    await deps.mark({ flow: 'step.mark', record: deps.record, step });
  } catch {
    /* A STEP THAT FAILED IS ONE NOT COUNTED; a line a step would be noise. */
  }
  return NOTHING();
}
