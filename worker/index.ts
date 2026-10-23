import { authorize, type AuthEnv } from "./auth";

export interface Env extends AuthEnv {
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
    return env.ASSETS.fetch(request);
  },
};
