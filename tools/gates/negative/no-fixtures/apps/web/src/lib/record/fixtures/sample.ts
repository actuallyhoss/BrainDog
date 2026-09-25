/* The fixture itself reads the seed's root, which is what it is for: this is not a finding. */
import { ROWS as SEED } from '@braindog/seed';

export const ROWS: Record<string, unknown[]> = { obligations: [...(SEED.obligations ?? [])] };
