/**
 * The planted command of `negative/first-screen/`: it prints what the real one prints, in the real one's shape, and
 * walks nobody. As Mariam the rail holds a place with nothing in it, which is one red check and exit 1; as anyone else
 * every check is green and it leaves with 0. The gate is `tools/gates/first-screen.mjs`, run with this tree as its root.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[process.argv.indexOf('--as') + 1];
const name = JSON.parse(readFileSync(file, 'utf8')).name;
const red = name === 'Mariam';

console.log(`/app/ at 1440 wide (the rail and Today, just kept, before anything was told), as ${name}`);
console.log('  no-tour: green. no tour, checklist or sample entries');
console.log(red ? '  rail-has-rows: red. the rail holds Money, and Money holds nothing yet' : '  rail-has-rows: green. the rail holds no place besides Today, Decide and People');
console.log('  pages-line: green. "New page" once, under the rail\'s own "Pages"');
console.log(`3 checks: ${red ? 2 : 3} green, ${red ? 1 : 0} red, 0 not seen, 0 that do not apply. Exit code ${red ? 1 : 0}.`);
process.exitCode = red ? 1 : 0;
