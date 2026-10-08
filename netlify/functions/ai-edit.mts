import { handleAiEditHttp } from "../../src/engine/aiEdit/claude";

// Production twin of the dev-server endpoint in vite.config.ts. Set ANTHROPIC_API_KEY (and,
// for a public site, AI_ACCESS_CODE) in the Netlify site's environment variables.
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const body = await req.json().catch(() => null);
  const { status, json } = await handleAiEditHttp(
    body,
    { apiKey: process.env.ANTHROPIC_API_KEY, accessCode: process.env.AI_ACCESS_CODE },
    req.headers.get("x-access-code")
  );
  return Response.json(json, { status });
};

export const config = { path: "/api/ai-edit" };
