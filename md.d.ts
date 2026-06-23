// Markdown files imported as raw strings (see the webpack rule in next.config.js).
declare module "*.md" {
  const content: string;
  export default content;
}
