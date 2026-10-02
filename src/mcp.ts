import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { saveDiagram } from "./store.ts";
import { MAX_CODE_CHARS, MAX_TITLE_CHARS, validateDiagram } from "./validate.ts";

const SAVE_ERRORS = {
  daily_limit:
    "The service has reached its limit of saved diagrams for today. Try again tomorrow, or show the Mermaid code without a link.",
  storage: "The diagram could not be stored because of a service error. Try again in a moment.",
};

// Tool text is factual: what it does, what it stores, the limits. No instructions to the model, no promotion.
export function createServer(env: Env, baseUrl: string): McpServer {
  const server = new McpServer({ name: "diagrams", version: "0.1.0" });

  server.registerTool(
    "save_diagram",
    {
      title: "Save diagram",
      description:
        "Saves a Mermaid diagram on the service and returns a link to a web page that draws it. " +
        "The service stores the diagram code and title; no account is needed. " +
        `Limits: code up to ${MAX_CODE_CHARS} characters, title up to ${MAX_TITLE_CHARS}. ` +
        "The code must start with a Mermaid diagram type such as flowchart, sequenceDiagram, classDiagram, " +
        "stateDiagram-v2, erDiagram, mindmap, timeline, gantt or pie.",
      inputSchema: z.object({
        mermaid_code: z.string().describe("Mermaid diagram source, beginning with the diagram type, e.g. 'flowchart TD'."),
        title: z.string().optional().describe("Short diagram title. Defaults to 'Untitled diagram'."),
      }),
      annotations: {
        title: "Save diagram",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ mermaid_code, title }) => {
      const checked = validateDiagram(mermaid_code, title);
      if (!checked.ok) return { isError: true, content: [{ type: "text", text: checked.error }] };

      const saved = await saveDiagram(env.DB, { title: checked.title, code: checked.code });
      if (!saved.ok) return { isError: true, content: [{ type: "text", text: SAVE_ERRORS[saved.reason] }] };

      return { content: [{ type: "text", text: `${baseUrl}/d/${saved.id}` }] };
    },
  );

  return server;
}
