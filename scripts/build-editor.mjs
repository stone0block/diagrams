// Bundles the editor (Excalidraw + mermaid-to-excalidraw) into public/editor so the site serves
// every script, style and font itself (strict CSP: no third-party hosts).
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "editor");
const excalidraw = join(root, "node_modules", "@excalidraw", "excalidraw");

// Excalidraw appends a CDN address (esm.sh) to every font it loads, as a fallback. We serve the fonts
// ourselves and the CSP forbids other hosts, so point the fallback at our own copy instead. Pinned to the
// installed version: if the pattern is gone after an upgrade, fail the build rather than ship a CDN call.
let patched = 0;
const selfHostedFonts = {
  name: "self-hosted-excalidraw-fonts",
  setup(b) {
    b.onLoad({ filter: /@excalidraw[\\/]excalidraw[\\/]dist[\\/]prod[\\/].*\.js$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      if (!source.includes("https://esm.sh/")) return undefined;
      const contents = source.replace(
        /`https:\/\/esm\.sh\/\$\{[\s\S]*?\}\/dist\/prod\/`/,
        "`${location.origin}/editor/`",
      );
      if (contents === source) throw new Error(`esm.sh font fallback not found in ${path}`);
      patched++;
      return { contents, loader: "js" };
    });
    b.onEnd(() => {
      if (patched === 0) throw new Error("esm.sh font fallback patch did not apply");
    });
  },
};

// mermaid-to-excalidraw 2.2.2 finds blocks in Mermaid's picture by their ids, but the Mermaid it installs
// (11.17) puts the id of the picture in front of every id. Without this patch ER and class diagrams and
// every flowchart with a subgraph fail to convert and arrive as one image. The patch takes that prefix
// off before the converter looks, and puts the untouched picture back if it has to fall back to an image.
// If a line is gone after an upgrade, fail the build and check whether the patch is still needed.
const MERMAID_ID_PATCHES = [
  [
    "svgContainer.innerHTML = svg;",
    "svgContainer.innerHTML = svg;\n" +
      "svgContainer.querySelectorAll(`[id^=\"${renderId}-\"]`).forEach((el) => { el.id = el.id.slice(renderId.length + 1); });",
    1,
  ],
  [
    "data = convertSvgToGraphImage(svgContainer);",
    "svgContainer.innerHTML = svg; data = convertSvgToGraphImage(svgContainer);",
    2,
  ],
];
const mermaidIds = {
  name: "mermaid-ids-without-prefix",
  setup(b) {
    b.onLoad({ filter: /mermaid-to-excalidraw[\\/]dist[\\/]parseMermaid\.js$/ }, async ({ path }) => {
      let contents = await readFile(path, "utf8");
      for (const [before, after, times] of MERMAID_ID_PATCHES) {
        if (contents.split(before).length - 1 !== times) throw new Error(`"${before}" not found ${times}x in ${path}`);
        contents = contents.replaceAll(before, after);
      }
      return { contents, loader: "js" };
    });
  },
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await build({
  entryPoints: { editor: join(root, "editor", "main.tsx") },
  outdir: out,
  bundle: true,
  format: "esm",
  splitting: true, // Mermaid loads its diagram types on demand
  minify: true,
  target: ["es2022"],
  jsx: "automatic",
  chunkNames: "chunks/[name]-[hash]",
  legalComments: "linked",
  conditions: ["production"],
  // index.css points at ./fonts/...woff2; those files are copied below to the same relative place.
  external: ["*.woff2"],
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.IS_PREACT": '"false"',
  },
  plugins: [selfHostedFonts, mermaidIds],
  logLevel: "info",
});

// Excalidraw loads its fonts at runtime from EXCALIDRAW_ASSET_PATH (see editor/config.ts).
await cp(join(excalidraw, "dist", "prod", "fonts"), join(out, "fonts"), { recursive: true });
// MIT requires the copyright and permission notice to travel with the code. The Excalidraw npm package ships
// without its LICENSE file, so a copy of the upstream one is kept in third-party/.
const nm = join(root, "node_modules");
const notices = [
  ["Excalidraw", join(root, "third-party", "excalidraw.LICENSE")],
  ["@excalidraw/mermaid-to-excalidraw", join(nm, "@excalidraw", "mermaid-to-excalidraw", "LICENSE")],
  ["Mermaid", join(nm, "@excalidraw", "mermaid-to-excalidraw", "node_modules", "mermaid", "LICENSE")],
  ["React", join(nm, "react", "LICENSE")],
  ["React DOM", join(nm, "react-dom", "LICENSE")],
];
const parts = ["Open-source software used by the diagram editor on this site.\n"];
for (const [name, file] of notices) parts.push(`\n==== ${name} ====\n\n${(await readFile(file, "utf8")).trim()}\n`);
parts.push(
  "\n==== Other bundled packages ====\n\nThe editor bundle also contains other open-source packages; their license notices are in editor.js.LEGAL.txt.\nFonts shipped with Excalidraw are served from /editor/fonts/ under their own licenses (see the Excalidraw repository).\n",
);
await writeFile(join(out, "licenses.txt"), parts.join(""));

console.log("editor bundle written to public/editor");
