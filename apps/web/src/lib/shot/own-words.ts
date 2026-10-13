/**
 * Screenshot mode: the set of texts that are the product's own.
 *
 * `plate.ts` plates every text that is not in a set it is handed, and this is how the set is made:
 * out of the copy files, at build time. A sentence typed whole is a member. A sentence with a hole
 * is not, since what fills the hole is a record's.
 *
 * IT READS THE SOURCE AND NEVER RUNS IT. Half the copy is functions, and a function's sentences are
 * not in any value an import could hand back, so the texts are taken from the syntax. TypeScript's
 * own parser does the reading: a quote in a comment or in a pattern is not a sentence, and a hand
 * lexer would have to learn that one case at a time.
 *
 * EVERY DOUBT IS SETTLED TOWARDS PLATING. A text left out of the set is covered in a picture, which
 * costs a reader one label. A text wrongly let in is a record's word shown. So the name of a file, a
 * key, a type, and anything typed inside a template's hole stay out.
 *
 * THIS IS A BUILD'S MODULE: `vite.config.ts` imports it and no screen does, so the parser is never
 * in a bundle.
 */

import ts from 'typescript';

/** A literal that names something in the code and is never drawn: a file, a key, a type. */
function named(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent)) return true;
  if (ts.isElementAccessExpression(parent)) return parent.argumentExpression === node;
  if (ts.isCallExpression(parent)) return parent.expression.kind === ts.SyntaxKind.ImportKeyword;
  if (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent))
    return parent.name === node;
  return ts.isPropertyDeclaration(parent) || ts.isEnumMember(parent) ? parent.name === node : false;
}

/**
 * The product's own words in these sources, each the text of one TypeScript file.
 *
 * A member is a string literal, or a template with no hole, trimmed; one that is only white space
 * is no member. A template with a hole contributes nothing, and neither does a literal typed inside
 * the hole: `${n === 1 ? 'task' : 'tasks'}` is drawn only as part of a sentence a record finished.
 * A source that is not a string is passed over.
 */
export function ownWordsOf(sources: readonly unknown[]): Set<string> {
  const own = new Set<string>();
  const walk = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node) || ts.isTaggedTemplateExpression(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text.trim();
      if (text !== '' && !named(node)) own.add(text);
      return;
    }
    ts.forEachChild(node, walk);
  };
  for (const source of sources) {
    if (typeof source !== 'string') continue;
    walk(ts.createSourceFile('copy.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS));
  }
  return own;
}
