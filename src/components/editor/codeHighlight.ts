/**
 * Theme-aware code highlighting style shared by:
 *  - Crepe code blocks (WYSIWYG mode)
 *  - the CodeMirror 6 source editor
 *
 * Crepe's default code-block theme is One Dark — its bright token colors are
 * made for dark backgrounds and are nearly unreadable on the light #F5F5F5
 * fill. We REPLACE the default theme (defaultsDeep lets featureConfigs win)
 * with a theme-aware highlight style: colors are CSS variables flipped by the
 * .dark class (GitHub Light in light mode, One Dark in dark mode).
 */
import { HighlightStyle } from "@codemirror/language";
import { tags as cmTags } from "@lezer/highlight";

export const znCodeHighlightStyle = HighlightStyle.define([
  { tag: [cmTags.keyword, cmTags.controlKeyword, cmTags.operatorKeyword, cmTags.moduleKeyword, cmTags.modifier], color: "var(--zn-code-keyword)" },
  { tag: [cmTags.string, cmTags.special(cmTags.string), cmTags.character, cmTags.url], color: "var(--zn-code-string)" },
  { tag: [cmTags.comment, cmTags.lineComment, cmTags.blockComment, cmTags.docComment], color: "var(--zn-code-comment)", fontStyle: "italic" },
  { tag: [cmTags.number, cmTags.integer, cmTags.float, cmTags.bool, cmTags.null, cmTags.atom], color: "var(--zn-code-constant)" },
  { tag: [cmTags.function(cmTags.variableName), cmTags.function(cmTags.propertyName), cmTags.definition(cmTags.function(cmTags.variableName))], color: "var(--zn-code-function)" },
  { tag: [cmTags.typeName, cmTags.className, cmTags.namespace, cmTags.tagName], color: "var(--zn-code-type)" },
  { tag: [cmTags.variableName, cmTags.propertyName, cmTags.attributeName, cmTags.definition(cmTags.variableName)], color: "var(--zn-code-ident)" },
  { tag: [cmTags.regexp], color: "var(--zn-code-string)" },
  { tag: [cmTags.meta, cmTags.processingInstruction], color: "var(--zn-code-comment)" },
  { tag: [cmTags.operator, cmTags.punctuation, cmTags.bracket, cmTags.separator], color: "var(--zn-code-punct)" },
]);
