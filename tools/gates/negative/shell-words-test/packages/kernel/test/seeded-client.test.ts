import { kernel } from '../src/index.ts';

/* A test may hand a record a use case: `payroll` is a tracked word, and tests are out of its reading. */
export const payrollRun = { kernel, label: 'Payroll for March' };

/* It may not name a client, and the planted list bans this invented one by its hash alone. */
export const client = { kernel, slug: 'zephyrine-co' };
