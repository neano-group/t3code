import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript-legacy";

export function extractImports(filename: string, source: string) {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...new Set(imports)];
}

export function buildGraph(root: string) {
  const files = execFileSync("git", ["-C", root, "ls-files", "-z"], {
    maxBuffer: 20 * 1024 * 1024,
  })
    .toString()
    .split("\0")
    .filter(
      (file) =>
        /\.[cm]?[jt]sx?$/.test(file) &&
        !/(^|\/)(\.repos|node_modules|dist|vendor)\//.test(file),
    );
  const fileSet = new Set(files);
  const nodes = files.map((id) => ({
    id,
    group: id.split("/").slice(0, 2).join("/"),
  }));
  const edges: { source: string; target: string }[] = [];
  let unresolved = 0;
  let skipped = 0;
  for (const filename of files) {
    const absolute = path.resolve(root, filename);
    // Git tracks symlinks; never follow one outside the selected repository.
    const { lstatSync } = process.getBuiltinModule("node:fs");
    if (
      !lstatSync(absolute).isFile() ||
      lstatSync(absolute).size > 1024 * 1024
    ) {
      skipped++;
      continue;
    }
    for (const specifier of extractImports(
      filename,
      readFileSync(absolute, "utf8"),
    )) {
      if (!specifier.startsWith(".")) {
        unresolved++;
        continue;
      }
      const base = path.posix.normalize(
        path.posix.join(path.posix.dirname(filename), specifier),
      );
      const candidates = [
        base,
        ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].map(
          (ext) => base + ext,
        ),
        ...[".ts", ".tsx", ".js", ".jsx"].map((ext) => base + "/index" + ext),
        base.replace(/\.js$/, ".ts"),
        base.replace(/\.js$/, ".tsx"),
      ];
      const target = candidates.find((candidate) => fileSet.has(candidate));
      if (target) edges.push({ source: filename, target });
      else unresolved++;
    }
  }
  return { nodes, edges, unresolved, skipped };
}

export function renderGraph(graph: ReturnType<typeof buildGraph>) {
  const data = JSON.stringify(graph).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Neano Architecture</title>
<style>body{margin:0;background:#101719;color:#dfebe8;font:14px system-ui}header{padding:22px;border-bottom:1px solid #34413e;display:flex;gap:18px;align-items:center}h1{font-size:20px;margin:0}input,button{font:inherit;background:#22332e;color:inherit;border:1px solid #526b61;border-radius:6px;padding:9px}main{display:grid;grid-template-columns:1fr 340px;height:calc(100vh - 90px)}#canvas{overflow:auto}svg{display:block}aside{padding:22px;overflow:auto;border-left:1px solid #34413e}a{display:block;color:#9fdbc1;overflow-wrap:anywhere;padding:5px 0}p{color:#adc0b8;line-height:1.6}svg text{fill:#dfebe8;font:12px system-ui}svg rect{fill:#22332e;stroke:#526b61;rx:8}svg g{cursor:pointer}svg g:focus rect{stroke:#fff;stroke-width:3}svg line{stroke:#6db698;stroke-opacity:.45}#status{padding:10px 22px;color:#adc0b8}@media(max-width:700px){main{grid-template-columns:1fr}aside{border-top:1px solid #34413e}header{flex-wrap:wrap}}</style>
<header><h1>Neano / Architecture</h1><input id="search" aria-label="Search files" placeholder="Filter files…"><button id="out" aria-label="Zoom out">−</button><button id="in" aria-label="Zoom in">+</button><button id="reset">Overview</button></header><div id="status"></div><main><div id="canvas"><svg id="map" aria-label="Dependency map"></svg></div><aside id="detail"><h2>Explore your code</h2><p>Select a file to inspect its imports and callers. Search narrows the map; selecting a file shows its immediate neighborhood.</p><p>Snapshot of Git-tracked JavaScript and TypeScript. Only resolved relative imports are connected. Package imports and aliases are counted as unresolved; this is not a complete call graph.</p></aside></main>
<script type="module">const graph=${data};const svg=document.querySelector('#map'), search=document.querySelector('#search'), detail=document.querySelector('#detail');const ns='http://www.w3.org/2000/svg';let selected=null,zoom=1;function element(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text)e.textContent=text;return e}function choose(id){selected=id;detail.replaceChildren();const h=document.createElement('h2');h.textContent=id;detail.append(h);for(const [label,items] of [['Imports',graph.edges.filter(e=>e.source===id).map(e=>e.target)],['Imported by',graph.edges.filter(e=>e.target===id).map(e=>e.source)]]){const h=document.createElement('h3');h.textContent=label+' ('+items.length+')';detail.append(h);for(const item of items){const a=document.createElement('a');a.href='#';a.textContent=item;a.onclick=e=>{e.preventDefault();choose(item)};detail.append(a)}}draw()}function draw(){let nodes=graph.nodes.filter(n=>n.id.toLowerCase().includes(search.value.toLowerCase()));if(selected){const ids=new Set([selected,...graph.edges.filter(e=>e.source===selected||e.target===selected).flatMap(e=>[e.source,e.target])]);nodes=nodes.filter(n=>ids.has(n.id))}nodes=nodes.slice(0,180);const positions=new Map(nodes.map((n,i)=>[n.id,{x:30+(i%3)*330,y:30+Math.floor(i/3)*85}]));svg.replaceChildren();svg.setAttribute('width',1020*zoom);svg.setAttribute('height',Math.max(500,Math.ceil(nodes.length/3)*85+50)*zoom);svg.setAttribute('viewBox','0 0 1020 '+Math.max(500,Math.ceil(nodes.length/3)*85+50));for(const edge of graph.edges){const a=positions.get(edge.source),b=positions.get(edge.target);if(a&&b)svg.append(element('line',{x1:a.x+145,y1:a.y+25,x2:b.x+145,y2:b.y+25}))}for(const node of nodes){const p=positions.get(node.id),g=element('g',{tabindex:0,role:'button','aria-label':node.id});g.append(element('rect',{x:p.x,y:p.y,width:290,height:55}),element('text',{x:p.x+12,y:p.y+23},node.id.split('/').pop()),element('text',{x:p.x+12,y:p.y+43},node.group));g.onclick=()=>choose(node.id);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(node.id)}};svg.append(g)}document.querySelector('#status').textContent=graph.nodes.length+' files · '+graph.edges.length+' resolved connections · '+graph.unresolved+' unresolved/package imports · '+graph.skipped+' skipped files · showing '+nodes.length+' (limit 180; search to narrow)'}search.oninput=draw;document.querySelector('#in').onclick=()=>{zoom=Math.min(2,zoom+.2);draw()};document.querySelector('#out').onclick=()=>{zoom=Math.max(.4,zoom-.2);draw()};document.querySelector('#reset').onclick=()=>{selected=null;search.value='';zoom=1;draw()};draw();</script></html>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const root = path.resolve(process.argv[2] ?? ".");
  const output = path.resolve(process.argv[3] ?? ".t3/architecture.html");
  const graph = buildGraph(root);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, renderGraph(graph));
  console.log(
    `Architecture: ${output} (${graph.nodes.length} files, ${graph.edges.length} connections)`,
  );
}
