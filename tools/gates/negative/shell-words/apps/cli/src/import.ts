/* THIS FILE HAS TO BE CALLED `import.ts`, because the entry it tests is that one path, so the file's
   name cannot carry `seeded` the way the others do. Every token below starts `seeded` instead, which
   puts the word on any finding line and so into the count `self-test` asserts: a gate that wrongly
   reported one of the allowed words here would change the number, not only the colour. */

/* THE THREE WORDS THE IMPORT COMMAND IS ALLOWED, and not findings: `hsbc` and `egypt` from the one
   bank pack it offers, `legacy` from the one source it reads. */
export const seededBankHsbcEgypt = 'seeded-legacy';

/* THE LEAKS. A product and a use case the import command has no reason to name, which the whole-file
   exemption read green on 23 September (`loop/research-batch-forty-four-audit.md` finding 5). */
export const seededPack = 'seeded-acme-payroll';

/* AND A WORD THE IMPORTER'S OTHER FILE IS ALLOWED AND THIS ONE IS NOT. `legacy.ts` reads `gold`
   off the export's holdings; `import.ts` has no such table, so the narrowing is per entry, not the
   union of every entry's words. */
export const seededGold = 1;
