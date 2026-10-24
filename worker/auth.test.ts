import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { authorize, sameSecret, type AuthResult } from "./auth.ts";

const TEAM = "https://example.cloudflareaccess.com";
const AUD = "aud-tag-for-tests";
const USER = "reader";
const PASS = "correct horse";

async function keys(): Promise<{ privateKey: CryptoKey; getKey: JWTVerifyGetKey }> {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(pair.publicKey);
  jwk.alg = "RS256";
  jwk.kid = "test-key";
  return { privateKey: pair.privateKey, getKey: createLocalJWKSet({ keys: [jwk] }) };
}

async function token(
  privateKey: CryptoKey,
  claims: { issuer?: string; audience?: string; exp?: number } = {},
): Promise<string> {
  const jwt = new SignJWT({ email: "reader@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(claims.issuer ?? TEAM)
    .setAudience(claims.audience ?? AUD)
    .setIssuedAt();
  if (claims.exp != null) jwt.setExpirationTime(claims.exp);
  else jwt.setExpirationTime("2h");
  return jwt.sign(privateKey);
}

function request(headers: HeadersInit = {}): Request {
  return new Request("https://list.example.com/", { headers });
}

function basicHeader(user = USER, pass = PASS): string {
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

function denied(result: AuthResult, status: 401 | 403 | 500): asserts result is Extract<AuthResult, { ok: false }> {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, status);
  const challenge = new Headers(result.headers).get("www-authenticate");
  if (status === 401) assert.match(challenge ?? "", /Basic/);
  else assert.equal(challenge, null);
}

test("sameSecret matches equal strings and rejects others", async () => {
  assert.equal(await sameSecret("desk", "desk"), true);
  assert.equal(await sameSecret("desk", "Desk"), false);
  assert.equal(await sameSecret("", "desk"), false);
});

test("production rejects Basic Auth credentials", async () => {
  const secrets = { BASIC_AUTH_USER: USER, BASIC_AUTH_PASS: PASS };
  const withPassword = request({ authorization: basicHeader() });

  const unset = await authorize(withPassword, secrets);
  denied(unset, 500);
  if (!unset.ok) assert.equal(unset.message, "Access is not configured");

  const production = await authorize(withPassword, { ENVIRONMENT: "production", ...secrets });
  denied(production, 500);

  const otherName = await authorize(withPassword, { ENVIRONMENT: "preview", ...secrets });
  denied(otherName, 500);

  const blankAccess = await authorize(withPassword, {
    ENVIRONMENT: "production",
    TEAM_DOMAIN: "  ",
    POLICY_AUD: "",
    ...secrets,
  });
  denied(blankAccess, 500);

  const partial = await authorize(withPassword, {
    ENVIRONMENT: "production",
    TEAM_DOMAIN: TEAM,
    ...secrets,
  });
  denied(partial, 500);

  const { privateKey, getKey } = await keys();
  const configured = { ENVIRONMENT: "production", TEAM_DOMAIN: `${TEAM}/`, POLICY_AUD: AUD, ...secrets };
  const noJwt = await authorize(withPassword, configured, getKey);
  denied(noJwt, 403);

  const withJwt = await authorize(
    request({
      authorization: basicHeader(),
      "cf-access-jwt-assertion": await token(privateKey),
    }),
    configured,
    getKey,
  );
  assert.deepEqual(withJwt, { ok: true, kind: "user" });
});

test("production fails closed when Access is not configured", async () => {
  const open = await authorize(request(), {});
  denied(open, 500);

  const blank = await authorize(request(), {
    TEAM_DOMAIN: "  ",
    POLICY_AUD: "",
    BASIC_AUTH_USER: "",
    BASIC_AUTH_PASS: "   ",
  });
  denied(blank, 500);
});

test("production Access requires a valid Cf-Access-Jwt-Assertion", async () => {
  const { privateKey, getKey } = await keys();
  const env = { ENVIRONMENT: "production", TEAM_DOMAIN: `${TEAM}/`, POLICY_AUD: AUD };
  const missing = await authorize(request(), env, getKey);
  denied(missing, 403);

  const bad = await authorize(request({ "cf-access-jwt-assertion": "not-a-jwt" }), env, getKey);
  denied(bad, 403);

  const wrongAud = await authorize(
    request({ "cf-access-jwt-assertion": await token(privateKey, { audience: "other" }) }),
    env,
    getKey,
  );
  denied(wrongAud, 403);

  const wrongIssuer = await authorize(
    request({ "cf-access-jwt-assertion": await token(privateKey, { issuer: "https://other.cloudflareaccess.com" }) }),
    env,
    getKey,
  );
  denied(wrongIssuer, 403);

  const expired = await authorize(
    request({ "cf-access-jwt-assertion": await token(privateKey, { exp: Math.floor(Date.now() / 1000) - 60 }) }),
    env,
    getKey,
  );
  denied(expired, 403);

  const ok = await authorize(
    request({ "cf-access-jwt-assertion": await token(privateKey) }),
    env,
    getKey,
  );
  assert.deepEqual(ok, { ok: true, kind: "user" });
});

test("Basic auth is accepted only when ENVIRONMENT is test", async () => {
  const env = { ENVIRONMENT: "test", BASIC_AUTH_USER: USER, BASIC_AUTH_PASS: PASS };
  const missing = await authorize(request(), env);
  denied(missing, 401);

  const wrong = await authorize(request({ authorization: basicHeader(USER, "nope") }), env);
  denied(wrong, 401);

  const swapped = await authorize(request({ authorization: basicHeader("other", PASS) }), env);
  denied(swapped, 401);

  const ok = await authorize(request({ authorization: basicHeader() }), env);
  assert.deepEqual(ok, { ok: true, kind: "test" });

  const onlyUser = await authorize(request({ authorization: basicHeader() }), {
    ENVIRONMENT: "test",
    BASIC_AUTH_USER: USER,
  });
  denied(onlyUser, 401);

  const neither = await authorize(request(), { ENVIRONMENT: "test", TEAM_DOMAIN: TEAM, POLICY_AUD: AUD });
  assert.deepEqual(neither, { ok: true, kind: "test" });

  const { privateKey, getKey } = await keys();
  const jwtWithoutPassword = await authorize(
    request({ "cf-access-jwt-assertion": await token(privateKey) }),
    env,
    getKey,
  );
  denied(jwtWithoutPassword, 401);
});
