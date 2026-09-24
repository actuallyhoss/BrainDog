/**
 * People AS IT SHIPPED BEFORE 2.0.0, with `registrar` on `role`, for the tests that start from a record whose rows hold it.
 *
 * THESE TESTS USED `registrar` AS THE VALUE AN UPDATE TAKES AWAY, and built the update by filtering it out of the
 * first-party document. People 2.0.0 took it out of the shipped document itself (M3 B9, `814ca32c`), so the record they
 * started from no longer offered it and every create of a registrar row was `ENUM_VALUE_UNKNOWN` (CI 35938679271). The
 * record they measure is one made before that update, so this is the document it was made under: the shipped one with
 * the value put back where 1.0.0 declared it, between `accountant` and `collaborator`.
 */
import { firstPartyDocument } from '../../seed/src/index.ts';

type Field = { id: string; values?: string[]; [k: string]: unknown };
type Doc = { version: string; declarations: Record<string, unknown>[]; [k: string]: unknown };

export const PEOPLE_1_0_0_ROLES = ['client', 'contractor', 'accountant', 'registrar', 'collaborator', 'other'];

/** The first-party People document as 1.0.0 declared it: `registrar` on `role`. */
export function peopleBefore(): Doc {
  const d = structuredClone(firstPartyDocument('people')) as unknown as Doc;
  d.version = '1.0.0';
  d.declarations = d.declarations.map((x) =>
    x.register === 'people' && Array.isArray(x.fields)
      ? { ...x, fields: (x.fields as Field[]).map((f) => (f.id === 'role' ? { ...f, values: [...PEOPLE_1_0_0_ROLES] } : f)) }
      : x,
  );
  return d;
}
