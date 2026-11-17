import { describe, expect, it } from "vite-plus/test";
import { extractImports, renderGraph } from "./architecture";

describe("architecture", () => {
  it("extracts real module references without matching comments or string contents", () => {
    expect(
      extractImports(
        "test.ts",
        `// import './fake'
const text = "import './also-fake'";
import type { A } from './types';
export { B } from './other';
import('./lazy'); require('./legacy'); import(variable);`,
      ),
    ).toEqual(["./types", "./other", "./lazy", "./legacy"]);
  });
  it("escapes repository filenames before embedding data into HTML", () => {
    const html = renderGraph({
      nodes: [{ id: "</script><script>alert(1)</script>", group: "test" }],
      edges: [],
      unresolved: 0,
      skipped: 0,
    });
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script>");
  });
});
