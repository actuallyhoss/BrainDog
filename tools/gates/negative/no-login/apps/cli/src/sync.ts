/** The two refusal lists the gate allows, by name: naming a login here is refusing it, and no finding. */
const SIGN_IN_FILE = /^(?:\.?credentials\.json|auth\.json|\.netrc)$/i;

const SIGN_INS = { profile: '.credentials.json', codex: 'auth.json' } as const;

export const refused = (name: string): boolean => SIGN_IN_FILE.test(name) || Object.values(SIGN_INS).includes(name as never);
