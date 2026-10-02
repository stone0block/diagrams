import { BRAND } from "./brand.ts";

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

type PageOptions = { title: string; body: string; scripts?: string[] };

function page({ title, body, scripts = [] }: PageOptions): string {
  const scriptTags = scripts.map((src) => `<script src="${src}"></script>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="top"><a class="brand" href="/">${escapeHtml(BRAND)}</a></header>
<main>
${body}
</main>
${scriptTags}
</body>
</html>`;
}

export function viewerPage(diagram: { title: string; code: string }): string {
  const title = escapeHtml(diagram.title);
  return page({
    title: `${diagram.title} · ${BRAND}`,
    body: `<h1>${title}</h1>
<div class="card"><div id="diagram" aria-label="${title}"><p class="muted">Drawing the diagram…</p></div></div>
<noscript><p class="notice">JavaScript is needed to draw the diagram. The Mermaid code is below.</p></noscript>
<div id="error" class="notice error" hidden></div>
<details class="code" id="code-block">
<summary>Mermaid code</summary>
<button type="button" id="copy">Copy code</button>
<pre id="code">${escapeHtml(diagram.code)}</pre>
</details>`,
    scripts: ["/vendor/mermaid.min.js", "/viewer.js"],
  });
}

export function notFoundPage(): string {
  return page({
    title: `Diagram not found · ${BRAND}`,
    body: `<h1>Diagram not found</h1>
<p>This link does not lead to a saved diagram. It may be mistyped or the diagram may have been removed.</p>`,
  });
}

// Placeholder until the landing page is written (Stage 5). Not indexed (see the robots meta in page()).
export function landingPage(): string {
  return page({
    title: BRAND,
    body: `<h1>Diagram links for Claude</h1>
<p>Ask Claude for a flowchart, sequence diagram, ER diagram or mind map. The diagram is saved and Claude gives you a link to a page that draws it.</p>
<p class="muted">Work in progress. The plugin is not published yet.</p>`,
  });
}
