import { createMcpHandler } from "agents/mcp/server";
import { isValidId } from "./id.ts";
import { createServer } from "./mcp.ts";
import { DEMO, editorPage, isExampleKey, landingPage, notFoundPage } from "./pages.ts";
import { getDiagram, saveDiagram } from "./store.ts";
import { validateDiagram } from "./validate.ts";

// Diagram code is untrusted input. Scripts only from our own origin, so even if markup slipped through
// Mermaid's strict mode, inline script and event handlers would not run. Mermaid writes inline styles.
const BASE_CSP = {
  "default-src": "'none'",
  "script-src": "'self'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data:",
  "font-src": "'self' data:",
  "connect-src": "'self'",
  "base-uri": "'none'",
  "form-action": "'none'",
  "frame-ancestors": "'none'",
};

const toHeader = (policy: Record<string, string>) =>
  Object.entries(policy)
    .map(([name, value]) => `${name} ${value}`)
    .join("; ");

// The editor (Excalidraw) subsets fonts for export with WebAssembly in a worker and reads images from
// data: and blob: URLs. Still no external hosts and no inline script.
const CSP = toHeader(BASE_CSP);
// The landing page has a form that posts to our own origin.
const FORM_CSP = toHeader({ ...BASE_CSP, "form-action": "'self'" });
const EDITOR_CSP = toHeader({
  ...BASE_CSP,
  "script-src": "'self' 'wasm-unsafe-eval'",
  "worker-src": "'self' blob:",
  "img-src": "'self' data: blob:",
  "connect-src": "'self' data: blob:",
});

function html(body: string, status = 200, csp = CSP): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}

// The landing form: same checks and storage as save_diagram, then a redirect to the canvas page.
const MAX_FORM_BYTES = 400_000;
const FORM_SAVE_ERRORS = {
  daily_limit: "The service has reached its limit of saved diagrams for today. Try again tomorrow.",
  storage: "The diagram could not be stored because of a service error. Try again in a moment.",
};

async function openFromForm(request: Request, env: Env): Promise<Response> {
  let code = "";
  if (Number(request.headers.get("content-length") ?? 0) <= MAX_FORM_BYTES) {
    try {
      const value = (await request.formData()).get("code");
      if (typeof value === "string") code = value;
    } catch {
      // Not a form: treated as empty code below.
    }
  }

  const checked = validateDiagram(code, undefined);
  if (!checked.ok) return html(landingPage({ code, error: checked.error }), 400, FORM_CSP);

  const saved = await saveDiagram(env.DB, { title: checked.title, code: checked.code });
  if (!saved.ok) return html(landingPage({ code, error: FORM_SAVE_ERRORS[saved.reason] }), 503, FORM_CSP);

  return new Response(null, { status: 303, headers: { location: `/d/${saved.id}`, "cache-control": "no-store" } });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/mcp") {
      const baseUrl = (env.PUBLIC_BASE_URL || url.origin).replace(/\/+$/, "");
      return createMcpHandler(() => createServer(env, baseUrl))(request, env, ctx);
    }

    if (path === "/new" && request.method === "POST") return openFromForm(request, env);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }

    if (path === "/healthz") return new Response("ok");
    if (path === "/") {
      // The sample tabs of the form are plain links (?example=sequence): no script on the landing page.
      const example = url.searchParams.get("example");
      return html(landingPage(isExampleKey(example) ? { example } : {}), 200, FORM_CSP);
    }
    // A sample diagram that is not in the database. Its edits are kept in the browser like any other.
    if (path === "/demo") return html(editorPage("demo", DEMO), 200, EDITOR_CSP);

    const match = /^\/d\/([^/]+)$/.exec(path);
    if (match) {
      const id = match[1];
      const diagram = isValidId(id) ? await getDiagram(env.DB, id) : null;
      return diagram ? html(editorPage(id, diagram), 200, EDITOR_CSP) : html(notFoundPage(), 404);
    }

    return html(notFoundPage(), 404);
  },
} satisfies ExportedHandler<Env>;
