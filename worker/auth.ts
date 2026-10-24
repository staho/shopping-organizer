import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AuthEnv {
  /** Exactly `test` enables Basic Auth. Any other value, including unset, is production. */
  ENVIRONMENT?: string;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  BASIC_AUTH_USER?: string;
  BASIC_AUTH_PASS?: string;
}

export type AuthResult =
  | { ok: true; kind: "user" | "service" | "test" }
  | { ok: false; status: 401 | 403 | 500; message: string; headers?: HeadersInit };

const jwksByTeam = new Map<string, JWTVerifyGetKey>();

function filled(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function teamDomain(value: string): string {
  return value.replace(/\/+$/, "");
}

function remoteJwks(team: string): JWTVerifyGetKey {
  const cached = jwksByTeam.get(team);
  if (cached) return cached;
  const keys = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
  jwksByTeam.set(team, keys);
  return keys;
}

function timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(left, right);
  }
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export async function sameSecret(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqual(providedHash, expectedHash);
}

function decodeBasic(header: string | null): { user: string; pass: string } {
  if (!header) return { user: "", pass: "" };
  const space = header.indexOf(" ");
  if (space <= 0) return { user: "", pass: "" };
  const scheme = header.slice(0, space);
  const encoded = header.slice(space + 1).trim();
  if (scheme.toLowerCase() !== "basic" || !encoded) return { user: "", pass: "" };
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const colon = decoded.indexOf(":");
    if (colon < 0) return { user: decoded, pass: "" };
    return { user: decoded.slice(0, colon), pass: decoded.slice(colon + 1) };
  } catch {
    return { user: "", pass: "" };
  }
}

const PLAIN = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" };

function forbidden(message: string): AuthResult {
  return { ok: false, status: 403, message, headers: PLAIN };
}

function misconfigured(): AuthResult {
  return { ok: false, status: 500, message: "Access is not configured", headers: PLAIN };
}

/** Production unless ENVIRONMENT is exactly `test` (after trim). */
export function authMode(env: AuthEnv): "production" | "test" {
  return filled(env.ENVIRONMENT) === "test" ? "test" : "production";
}

function unauthorized(): AuthResult {
  return {
    ok: false,
    status: 401,
    message: "Authentication required",
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "www-authenticate": 'Basic realm="Kamil\'s list", charset="UTF-8"',
    },
  };
}

function identityKind(payload: { email?: unknown }): "user" | "service" {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (email && !email.startsWith("non_identity@")) return "user";
  return "service";
}

async function accessJwt(
  request: Request,
  team: string,
  audience: string,
  getKey: JWTVerifyGetKey,
): Promise<AuthResult> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return forbidden("Forbidden");
  try {
    const verified = await jwtVerify(token, getKey, { issuer: team, audience });
    return { ok: true, kind: identityKind(verified.payload as { email?: unknown }) };
  } catch {
    return forbidden("Forbidden");
  }
}

async function basicAuth(request: Request, user: string, pass: string): Promise<AuthResult> {
  const provided = decodeBasic(request.headers.get("authorization"));
  const userOk = await sameSecret(provided.user, user);
  const passOk = await sameSecret(provided.pass, pass);
  if (!userOk || !passOk) return unauthorized();
  return { ok: true, kind: "test" };
}

async function authorizeTest(request: Request, env: AuthEnv): Promise<AuthResult> {
  const user = filled(env.BASIC_AUTH_USER);
  const pass = filled(env.BASIC_AUTH_PASS);
  if (!user && !pass) return { ok: true, kind: "test" };
  if (!user || !pass) return unauthorized();
  const result = await basicAuth(request, user, pass);
  if (!result.ok) return result;
  return { ok: true, kind: "test" };
}

async function authorizeProduction(
  request: Request,
  env: AuthEnv,
  getKey?: JWTVerifyGetKey,
): Promise<AuthResult> {
  const team = filled(env.TEAM_DOMAIN);
  const audience = filled(env.POLICY_AUD);
  if (!team || !audience) return misconfigured();
  const issuer = teamDomain(team);
  return accessJwt(request, issuer, audience, getKey ?? remoteJwks(issuer));
}

export async function authorize(
  request: Request,
  env: AuthEnv,
  getKey?: JWTVerifyGetKey,
): Promise<AuthResult> {
  if (authMode(env) === "test") return authorizeTest(request, env);
  return authorizeProduction(request, env, getKey);
}
