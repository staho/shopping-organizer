import { authorize, type AuthEnv } from "./auth.ts";
import { handleContinue, type ContinueEnv } from "./continue.ts";

export interface Env extends AuthEnv, ContinueEnv {
  ASSETS: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const result = await authorize(request, env);
    if (!result.ok) {
      return new Response(result.message, { status: result.status, headers: result.headers });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/continue") return handleContinue(request, env);
    return env.ASSETS.fetch(request);
  },
};
