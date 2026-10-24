import { authorize, type AuthEnv, type AuthResult } from "./auth.ts";
import { handleContinue, type ContinueEnv } from "./continue.ts";
import { handleData, isWriteRequest, type DataEnv } from "./data.ts";
import type { JWTVerifyGetKey } from "jose";

export interface Env extends AuthEnv, ContinueEnv, DataEnv {
  ASSETS: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function handle(request: Request, env: Env, getKey?: JWTVerifyGetKey): Promise<Response> {
  const result = await authorize(request, env, getKey);
  if (!result.ok) return text(result.message, result.status);
  const url = new URL(request.url);
  if (isWriteRequest(request, url.pathname) || (request.method === "GET" && url.pathname === "/api/data")) {
    return handleData(request, env, result as Extract<AuthResult, { ok: true }>);
  }
  if (result.kind === "service") return text("Forbidden", 403);
  if (url.pathname === "/api/continue") return handleContinue(request, env);
  if (url.pathname.startsWith("/api/")) return text("Method not allowed", 405);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
