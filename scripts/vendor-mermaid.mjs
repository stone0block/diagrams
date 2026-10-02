// Copies the Mermaid browser bundle from node_modules into public/vendor so the site
// serves it itself (strict CSP: no third-party script hosts).
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "mermaid", "dist");
const out = join(root, "public", "vendor");

await mkdir(out, { recursive: true });
await cp(join(dist, "mermaid.min.js"), join(out, "mermaid.min.js"));
await cp(join(root, "node_modules", "mermaid", "LICENSE"), join(out, "mermaid.LICENSE"));
console.log("mermaid bundle copied to public/vendor");
