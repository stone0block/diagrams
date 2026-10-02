// Input checks for save_diagram. Pure functions, no platform APIs, so they run under `node --test`.

export const MAX_CODE_CHARS = 50_000;
export const MAX_TITLE_CHARS = 200;
export const DEFAULT_TITLE = "Untitled diagram";

// First word of a diagram, as Mermaid expects it (case-sensitive).
export const DIAGRAM_TYPES = [
  "flowchart",
  "flowchart-elk",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "classDiagram-v2",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "quadrantChart",
  "requirementDiagram",
  "gitGraph",
  "mindmap",
  "timeline",
  "sankey",
  "sankey-beta",
  "xychart",
  "xychart-beta",
  "block",
  "block-beta",
  "packet",
  "packet-beta",
  "architecture",
  "architecture-beta",
  "kanban",
  "radar",
  "radar-beta",
  "treemap",
  "treemap-beta",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
];

export type Validated =
  | { ok: true; code: string; title: string }
  | { ok: false; error: string };

/** First keyword of the diagram, skipping front matter, directives, comments and blank lines. */
export function firstKeyword(code: string): string | null {
  let text = code.replace(/^﻿/, "");
  text = text.replace(/^\s*---[ \t]*\n[\s\S]*?\n---[ \t]*(\n|$)/, "");
  text = text.replace(/%%\{[\s\S]*?\}%%/g, "");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;
    const match = /^([A-Za-z][A-Za-z0-9-]*)/.exec(line);
    return match ? match[1] : "";
  }
  return null;
}

export function validateDiagram(codeInput: unknown, titleInput: unknown): Validated {
  if (typeof codeInput !== "string" || codeInput.trim() === "") {
    return {
      ok: false,
      error:
        "mermaid_code is empty. Pass the diagram source starting with the diagram type, for example:\nflowchart TD\n  A[Start] --> B[End]",
    };
  }
  const code = codeInput.replace(/\r\n?/g, "\n").trim();
  if (code.length > MAX_CODE_CHARS) {
    return {
      ok: false,
      error: `mermaid_code is ${code.length} characters long, the limit is ${MAX_CODE_CHARS}. Split the diagram into several smaller ones or remove detail.`,
    };
  }

  const keyword = firstKeyword(code);
  if (keyword === null || !DIAGRAM_TYPES.includes(keyword)) {
    const found = keyword ? `"${keyword.slice(0, 40)}"` : "no diagram type";
    return {
      ok: false,
      error: `The diagram must start with a Mermaid diagram type (found ${found}). Supported types: ${DIAGRAM_TYPES.join(", ")}.`,
    };
  }

  let title = DEFAULT_TITLE;
  if (typeof titleInput === "string") {
    const cleaned = titleInput.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length > MAX_TITLE_CHARS) {
      return {
        ok: false,
        error: `title is ${cleaned.length} characters long, the limit is ${MAX_TITLE_CHARS}. Use a shorter title.`,
      };
    }
    if (cleaned !== "") title = cleaned;
  }

  return { ok: true, code, title };
}
