import { createMcpHandler } from "agents/mcp/server";
import { isValidId } from "./id.ts";
import { createServer } from "./mcp.ts";
import { landingPage, notFoundPage, viewerPage } from "./pages.ts";
import { getDiagram } from "./store.ts";

// Diagram code is untrusted input. Scripts only from our own origin, so even if markup slipped through
// Mermaid's strict mode, inline script and event handlers would not run. Mermaid writes inline styles.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": CSP,
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/mcp") {
      const baseUrl = (env.PUBLIC_BASE_URL || url.origin).replace(/\/+$/, "");
      return createMcpHandler(() => createServer(env, baseUrl))(request, env, ctx);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }

    if (path === "/healthz") return new Response("ok");
    if (path === "/") return html(landingPage());

    const match = /^\/d\/([^/]+)$/.exec(path);
    if (match) {
      const id = match[1];
      const diagram = isValidId(id) ? await getDiagram(env.DB, id) : null;
      return diagram ? html(viewerPage(diagram)) : html(notFoundPage(), 404);
    }

    return html(notFoundPage(), 404);
  },
} satisfies ExportedHandler<Env>;
