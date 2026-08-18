/**
 * Allow `?raw` imports of CSS files in specs. Vitest + esbuild resolve
 * `?raw` to the file's source text as a default-exported string. This is
 * used by design-system specs to assert on the canonical token values
 * declared in tokens.css without spinning up a DOM. CSS syntactic validity
 * is proven separately by the dev build.
 */
declare module '*.css?raw' {
  const content: string;
  export default content;
}
