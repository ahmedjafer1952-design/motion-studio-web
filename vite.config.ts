import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage } from "node:http";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * Serves POST /api/ai-edit during `npm run dev`, using ANTHROPIC_API_KEY from `.env.local`.
 * The key stays in this Node process and is never sent to the browser.
 * (In production the same handler runs as netlify/functions/ai-edit.mts.)
 */
function claudeEditDevApi(env: Record<string, string>): Plugin {
  return {
    name: "claude-edit-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/ai-edit", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const { handleAiEditHttp } = await server.ssrLoadModule("/src/engine/aiEdit/claude.ts");
        let body: unknown = null;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          // validated (and rejected) by the handler
        }
        const code = req.headers["x-access-code"];
        const { status, json } = await handleAiEditHttp(
          body,
          { apiKey: env.ANTHROPIC_API_KEY, accessCode: env.AI_ACCESS_CODE },
          typeof code === "string" ? code : null
        );
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(json));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // "" prefix = load every variable, but only into this Node process (not the client bundle).
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), claudeEditDevApi(env)],
    worker: { format: "es" as const },
  };
});
