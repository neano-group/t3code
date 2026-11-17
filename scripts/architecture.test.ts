import { describe, expect, it } from "vite-plus/test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildGraph, extractImports, renderGraph } from "./architecture";

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
  it("skips deleted files and directories redirected outside the repository", () => {
    const temp = mkdtempSync(path.join(tmpdir(), "neano-map-"));
    const root = path.join(temp, "repo");
    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "deleted.ts"), "export {}");
      writeFileSync(path.join(root, "src/file.ts"), "export {}");
      execFileSync("git", ["init", root]);
      execFileSync("git", ["-C", root, "add", "."]);
      rmSync(path.join(root, "deleted.ts"));
      rmSync(path.join(root, "src"), { recursive: true });
      mkdirSync(path.join(temp, "external"));
      writeFileSync(path.join(temp, "external/file.ts"), "import './secret'");
      symlinkSync(path.join(temp, "external"), path.join(root, "src"));
      const graph = buildGraph(root);
      expect(graph.skipped).toBe(2);
      expect(graph.edges).toEqual([]);
      expect(graph.unresolved).toBe(0);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
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
