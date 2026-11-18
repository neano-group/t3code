// @effect-diagnostics nodeBuiltinImport:off - Exercises real Git worktrees and symlinks in a temporary directory.
import { describe, expect, it } from "vite-plus/test";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { buildGraph, extractImports, renderGraph } from "./architecture.ts";

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
    const temp = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "neano-map-"));
    const root = NodePath.join(temp, "repo");
    try {
      NodeFS.mkdirSync(NodePath.join(root, "src"), { recursive: true });
      NodeFS.writeFileSync(NodePath.join(root, "deleted.ts"), "export {}");
      NodeFS.writeFileSync(NodePath.join(root, "src/file.ts"), "export {}");
      NodeChildProcess.execFileSync("git", ["init", root]);
      NodeChildProcess.execFileSync("git", ["-C", root, "add", "."]);
      NodeFS.rmSync(NodePath.join(root, "deleted.ts"));
      NodeFS.rmSync(NodePath.join(root, "src"), { recursive: true });
      NodeFS.mkdirSync(NodePath.join(temp, "external"));
      NodeFS.writeFileSync(NodePath.join(temp, "external/file.ts"), "import './secret'");
      NodeFS.symlinkSync(NodePath.join(temp, "external"), NodePath.join(root, "src"));
      const graph = buildGraph(root);
      expect(graph.skipped).toBe(2);
      expect(graph.edges).toEqual([]);
      expect(graph.unresolved).toBe(0);
    } finally {
      NodeFS.rmSync(temp, { recursive: true, force: true });
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
