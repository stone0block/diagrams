import { BRAND } from "./brand.ts";

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Every picture on the site is drawn here by hand as inline SVG: no icon sets, no images from other products.
const MARK = `<svg class="mark" viewBox="0 0 28 28" aria-hidden="true"><rect class="mark-bg" width="28" height="28" rx="7"/><rect class="mark-line" x="6.5" y="6.5" width="7" height="7" rx="1.5"/><path class="mark-line" d="M10 13.5v2.5a2 2 0 0 0 2 2h3"/><path class="mark-dot" d="M18.5 14.2l3.8 3.8-3.8 3.8-3.8-3.8z"/></svg>`;

const icon = (paths: string) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  blocks: icon(`<rect x="3" y="4" width="8" height="6" rx="1.5"/><rect x="13" y="14" width="8" height="6" rx="1.5"/><path d="M7 10v5a2 2 0 0 0 2 2h4"/>`),
  link: icon(`<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a4 4 0 0 1 4 4v5.5"/>`),
  device: icon(`<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2.5 19.5h19M9.5 11l1.8 1.8 3.4-3.6"/>`),
  download: icon(`<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19.5h14"/>`),
  code: icon(`<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14"/>`),
  reset: icon(`<path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4M4.5 4.5v4.6h4.6"/>`),
};

type PageOptions = { title: string; body: string };

function page({ title, body }: PageOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header"><div class="wrap">
<a class="brand" href="/">${MARK}<span>${escapeHtml(BRAND)}</span></a>
<nav class="site-nav" aria-label="Sections">
<a href="/#how">How it works</a>
<a href="/#types">Diagram types</a>
<a href="/#faq">FAQ</a>
</nav>
<a class="btn" href="/#try">Try the canvas</a>
</div></header>
<main>
${body}
</main>
<footer class="site-footer"><div class="wrap">
<a class="brand" href="/">${MARK}<span>${escapeHtml(BRAND)}</span></a>
<nav aria-label="Footer">
<a href="/#how">How it works</a>
<a href="/#try">Try the canvas</a>
<a href="/#faq">FAQ</a>
<a href="/editor/licenses.txt">Open-source licenses</a>
</nav>
<p class="credit">The canvas is built with Excalidraw and Mermaid, both open source under the MIT license.</p>
</div></footer>
</body>
</html>`;
}

// The diagram page is the editor: the browser turns the Mermaid code into Excalidraw shapes (editor/main.tsx).
// Title, id and code are untrusted text: escaped here, read back from the DOM by the script.
export function editorPage(id: string, diagram: { title: string; code: string }): string {
  const title = escapeHtml(diagram.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} · ${escapeHtml(BRAND)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/editor/editor.css">
</head>
<body class="editor">
<div id="app" data-id="${escapeHtml(id)}" data-title="${title}" data-brand="${escapeHtml(BRAND)}"></div>
<pre id="code" hidden>${escapeHtml(diagram.code)}</pre>
<noscript>
<main class="wrap plain">
<h1>${title}</h1>
<p class="notice">JavaScript is needed to draw and edit the diagram. The Mermaid code is below.</p>
<pre>${escapeHtml(diagram.code)}</pre>
</main>
</noscript>
<script src="/editor-config.js"></script>
<script type="module" src="/editor/editor.js"></script>
</body>
</html>`;
}

export function notFoundPage(): string {
  return page({
    title: `Diagram not found · ${BRAND}`,
    body: `<div class="wrap lone">
<svg viewBox="0 0 168 72" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
<rect x="1" y="20" width="52" height="32" rx="6"/>
<path d="M53 36h18M97 36h14" stroke-dasharray="1 6"/>
<path d="M78 29l12 14M90 29L78 43"/>
<rect x="115" y="20" width="52" height="32" rx="6" stroke-dasharray="5 5"/>
</svg>
<h1>Diagram not found</h1>
<p>This link does not lead to a saved diagram. It may be mistyped, or the diagram may have been removed.</p>
<div class="cta"><a class="btn primary lg" href="/">Go to the home page</a></div>
</div>`,
  });
}

// Samples for the "try" form and the demo page. Each one opens as editable blocks on the canvas.
export const EXAMPLES = {
  flowchart: {
    label: "Flowchart",
    code: `flowchart TD
  A([New ticket]) --> B{Known issue?}
  B -->|yes| C[Send saved reply]
  B -->|no| D[Assign to agent]
  C --> E([Resolved])
  D --> E`,
  },
  sequence: {
    label: "Sequence",
    code: `sequenceDiagram
  participant U as User
  participant A as App
  participant S as Server
  U->>A: Enter email and password
  A->>S: POST /login
  S-->>A: Session token
  A-->>U: Show dashboard`,
  },
  er: {
    label: "ER diagram",
    code: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : "appears in"
  CUSTOMER {
    int id
    string email
  }
  ORDER {
    int id
    date created_at
  }`,
  },
  class: {
    label: "Class",
    code: `classDiagram
  class Document {
    +String title
    +save()
  }
  class Diagram {
    +String code
    +export(format)
  }
  class Editor {
    +open(document)
  }
  Document <|-- Diagram
  Editor --> Document : edits`,
  },
  state: {
    label: "State",
    code: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review : submit
  Review --> Draft : request changes
  Review --> Published : approve
  Published --> [*]`,
  },
} as const;

export type ExampleKey = keyof typeof EXAMPLES;
export const isExampleKey = (key: string | null): key is ExampleKey => key !== null && Object.hasOwn(EXAMPLES, key);

// The sample diagram behind "Open a sample diagram": the editor page without a database record.
export const DEMO = { title: "Support ticket flow", code: EXAMPLES.flowchart.code };

// The hero picture mirrors the demo diagram above.
const HERO_ART = `<svg class="art" viewBox="0 0 520 392" role="img" aria-label="A support ticket flowchart on the canvas, with one block selected">
<defs><marker id="ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path class="ah" d="M1.5 1.5L8.5 5l-7 3.5"/></marker></defs>
<g class="edge" marker-end="url(#ah)">
<path d="M260 68v23"/>
<path d="M174 138h-37a12 12 0 0 0-12 12v81"/>
<path d="M346 138h37a12 12 0 0 1 12 12v81"/>
<path d="M125 280v62a12 12 0 0 0 12 12h57"/>
<path d="M395 280v62a12 12 0 0 1-12 12h-57"/>
</g>
<rect class="n green" x="190" y="24" width="140" height="44" rx="22"/><text x="260" y="46">New ticket</text>
<path class="n amber" d="M260 92l86 46-86 46-86-46z"/><text x="260" y="138">Known issue?</text>
<rect class="n" x="40" y="232" width="170" height="48" rx="6"/><text x="125" y="256">Send saved reply</text>
<rect class="n" x="310" y="232" width="170" height="48" rx="6"/><text x="395" y="256">Assign to agent</text>
<rect class="n green" x="195" y="332" width="130" height="44" rx="22"/><text x="260" y="354">Resolved</text>
<g class="lbl"><rect x="107" y="178" width="36" height="20" rx="10"/><text x="125" y="188">yes</text><rect x="379" y="178" width="32" height="20" rx="10"/><text x="395" y="188">no</text></g>
<rect class="sel" x="303" y="225" width="184" height="62"/>
<rect class="handle" x="299" y="221" width="8" height="8" rx="2"/><rect class="handle" x="483" y="221" width="8" height="8" rx="2"/><rect class="handle" x="299" y="283" width="8" height="8" rx="2"/><rect class="handle" x="483" y="283" width="8" height="8" rx="2"/>
<path class="cursor" d="M452 266l3.5 17 4.2-6.2 7.3-1.6z"/>
<g class="tip"><rect x="424" y="300" width="90" height="24" rx="7"/><text x="469" y="312">Drag to move</text></g>
</svg>`;

const TYPE_CARDS = [
  {
    name: "Flowchart",
    use: "Processes and decisions",
    art: `<rect class="f" x="2" y="3" width="24" height="13" rx="6.5"/><path class="a" d="M54 2l14 8-14 8-14-8z"/><rect x="42" y="30" width="24" height="13" rx="2"/><path d="M26 9.5h13M54 18v11"/>`,
  },
  {
    name: "Sequence diagram",
    use: "Who calls whom, in order",
    art: `<rect class="f" x="4" y="2" width="22" height="10" rx="2"/><rect class="f" x="46" y="2" width="22" height="10" rx="2"/><path d="M15 12v31M57 12v31" stroke-dasharray="3 3"/><path d="M15 21h41m-4-3l4 3-4 3M57 33H16m4-3l-4 3 4 3"/>`,
  },
  {
    name: "Class diagram",
    use: "Classes and their relations",
    art: `<rect x="2" y="2" width="30" height="30" rx="2"/><path class="f" d="M2 4a2 2 0 0 1 2-2h26a2 2 0 0 1 2 2v6H2z"/><path d="M2 10h30M2 21h30"/><rect x="46" y="24" width="24" height="19" rx="2"/><path d="M46 31h24M32 17h26v7"/>`,
  },
  {
    name: "ER diagram",
    use: "Tables and data models",
    art: `<rect x="2" y="8" width="24" height="29" rx="2"/><path class="f" d="M2 10a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v6H2z"/><path d="M2 16h24M2 26.5h24"/><rect x="46" y="8" width="24" height="29" rx="2"/><path class="a" d="M46 10a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v6H46z"/><path d="M46 16h24M46 26.5h24M26 22h20M40 22l6-5M40 22l6 5M30 19v6"/>`,
  },
  {
    name: "State diagram",
    use: "States and transitions",
    art: `<circle class="k" cx="7" cy="12" r="4.5"/><rect class="f" x="24" y="4" width="26" height="16" rx="8"/><rect class="a" x="42" y="29" width="28" height="14" rx="7"/><path d="M11.5 12H23M44 20l9 8.5"/>`,
  },
];

const FAQ = [
  [
    "Do I need an account?",
    "No. A diagram link opens without sign-in, and so does the canvas on this page.",
  ],
  [
    "Who can see my diagram?",
    "Anyone who has the link. Links are random and hard to guess, and diagram pages are hidden from search engines. Still, do not put passwords or other secrets into a diagram.",
  ],
  [
    "Where are my edits saved?",
    "In your browser, on this device. They are not uploaded, so they will not appear on another device or in another browser. The original diagram stays available: “Start over” brings it back.",
  ],
  [
    "What does the service store?",
    "The Mermaid code of the diagram, its title and the time it was saved. Nothing else from your conversation with Claude.",
  ],
  [
    "Which diagrams can I edit block by block?",
    "Flowcharts, sequence, class, ER and state diagrams open as separate shapes and arrows. Other Mermaid types, such as mind maps, Gantt charts and pie charts, open as one picture that you can annotate and draw around.",
  ],
  [
    "What do I get when I export?",
    `A PNG picture or an SVG vector file of the whole canvas, including your edits. Exported files carry a small “Made with ${escapeHtml(BRAND)}” mark below the diagram.`,
  ],
  [
    "How do I use it with Claude?",
    "The plugin for Claude is not published yet. Until it is, paste Mermaid code into the form on this page: it opens on the same canvas.",
  ],
];

// Not indexed yet (see the robots meta in page()): the name and the domain are still working ones.
// The form lets a person open the canvas without Claude: it saves the code like save_diagram does.
export function landingPage(form: { code?: string; error?: string; example?: ExampleKey } = {}): string {
  const example = form.example ?? "flowchart";
  const typed = form.code !== undefined;
  const code = form.code ?? EXAMPLES[example].code;
  const error = form.error ? `<div class="notice error" role="alert"><p>${escapeHtml(form.error)}</p></div>` : "";
  const tabs = (Object.keys(EXAMPLES) as ExampleKey[])
    .map((key) => {
      const current = !typed && key === example ? ` aria-current="true"` : "";
      return `<a href="/?example=${key}#try"${current}>${EXAMPLES[key].label}</a>`;
    })
    .join("\n");
  const types = TYPE_CARDS.map(
    (t) => `<div class="type">
<svg viewBox="0 0 72 45" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${t.art}</svg>
<h3>${t.name}</h3>
<p>${t.use}</p>
</div>`,
  ).join("\n");
  const faq = FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("\n");
  const brand = escapeHtml(BRAND);

  return page({
    title: `${BRAND}: editable diagrams from Claude`,
    body: `<section class="hero"><div class="wrap">
<p class="pill">Plugin for Claude · not published yet</p>
<h1>Diagrams from Claude, on a canvas <em>you can edit</em></h1>
<p class="lead">Ask Claude for a flowchart, a sequence diagram or a data model. You get a link. Open it, move things around and download a PNG or SVG.</p>
<div class="cta">
<a class="btn primary lg" href="/demo">Open a sample diagram</a>
<a class="btn lg" href="#try">Paste your own Mermaid</a>
</div>
<p class="hero-note">No account needed. Edits stay in your browser.</p>

<div class="window">
<div class="chat" aria-hidden="true">
<div class="pane-label"><strong>Chat with Claude</strong></div>
<div class="chat-body">
<p class="bubble me">Draw a flowchart of how we handle a support ticket</p>
<div class="bubble bot">
<span class="who">Claude</span>
<p>Here is the flowchart. Open the link to edit or export it.</p>
<pre>flowchart TD
  A([New ticket]) --&gt; B{Known issue?}
  B --&gt;|yes| C[Send saved reply]
  B --&gt;|no| D[Assign to agent]
  …</pre>
<div class="linkchip">${MARK}${escapeHtml(DEMO.title)}<span>Open ↗</span></div>
</div>
</div>
</div>
<div class="board">
<div class="pane-label" aria-hidden="true">${MARK}<strong>${escapeHtml(DEMO.title)}</strong><span class="saved">Saved in this browser</span><span class="btn primary">Export</span></div>
<div class="board-canvas">${HERO_ART}</div>
</div>
</div>
</div></section>

<section class="section" id="how"><div class="wrap">
<div class="section-head">
<p class="eyebrow">How it works</p>
<h2>From a sentence to a finished diagram</h2>
</div>
<ol class="steps">
<li class="step"><span class="num">01</span><h3>Ask Claude</h3><p>Describe the process, the system or the data in plain words. Claude writes the diagram as Mermaid code.</p><p class="say">“Draw our signup flow as a flowchart”</p></li>
<li class="step"><span class="num">02</span><h3>Open the link</h3><p>Claude saves the diagram and replies with a link. It opens on a canvas in your browser, with no sign-in.</p></li>
<li class="step"><span class="num">03</span><h3>Edit and export</h3><p>Drag blocks, rename them, add your own shapes and notes. Then download the result as PNG or SVG.</p></li>
</ol>
</div></section>

<section class="section" id="canvas"><div class="wrap">
<div class="section-head">
<p class="eyebrow">The canvas</p>
<h2>A diagram you can keep working on</h2>
<p>Claude gets the structure right. The finishing touches, such as layout, wording and emphasis, are quicker to do by hand.</p>
</div>
<div class="features">
<div class="feature">${ICONS.blocks}<h3>Real blocks, not a picture</h3><p>Every box and arrow is a separate shape. Move it, resize it, recolor it or change its text.</p></div>
<div class="feature">${ICONS.link}<h3>Arrows stay attached</h3><p>Drag a block and its connections follow, so the diagram keeps its meaning while you tidy it up.</p></div>
<div class="feature">${ICONS.device}<h3>Edits stay with you</h3><p>Changes are saved in your browser as you go. They are not uploaded anywhere.</p></div>
<div class="feature">${ICONS.download}<h3>PNG and SVG export</h3><p>A picture for docs and slides, or a vector that stays sharp at any size.</p></div>
<div class="feature">${ICONS.code}<h3>The code is always there</h3><p>See and copy the original Mermaid code whenever you need it elsewhere.</p></div>
<div class="feature">${ICONS.reset}<h3>Start over in one click</h3><p>Went too far? Bring back the diagram exactly as Claude made it.</p></div>
</div>
</div></section>

<section class="section" id="types"><div class="wrap">
<div class="section-head">
<p class="eyebrow">Diagram types</p>
<h2>Five kinds open as editable blocks</h2>
</div>
<div class="types">
${types}
</div>
<p class="types-note"><strong>Other Mermaid diagrams</strong>, such as mind maps, Gantt charts, timelines and pie charts, open as one picture. You can still annotate it, draw around it and export it.</p>
</div></section>

<section class="section" id="try"><div class="wrap">
<div class="section-head">
<p class="eyebrow">Try it</p>
<h2>Paste Mermaid code, open it on the canvas</h2>
<p>Pick a sample or paste your own code. It is saved the same way Claude saves a diagram, and you get a link to it.</p>
</div>
<form class="try" method="post" action="/new">
<div class="tabs">
${tabs}
</div>
${error}
<textarea name="code" rows="11" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Mermaid code"${form.error ? " autofocus" : ""}>${escapeHtml(code)}</textarea>
<div class="try-bar">
<p>The code is stored on ${brand} so the link can open it. Anyone with the link can view it.</p>
<button class="btn primary" type="submit">Open on canvas</button>
</div>
</form>
</div></section>

<section class="section" id="faq"><div class="wrap">
<div class="section-head">
<p class="eyebrow">FAQ</p>
<h2>Good to know</h2>
</div>
<div class="faq">
${faq}
</div>
</div></section>`,
  });
}
