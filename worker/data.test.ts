import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { handle } from "./index.ts";
import type { ShoppingKV } from "./store.ts";

const TEAM = "https://example.cloudflareaccess.com";
const AUD = "aud-tag-for-tests";
const KEY = "update-key";

function memoryKv(initial?: unknown): ShoppingKV & { raw(): string | null } {
  let stored = initial === undefined ? null : JSON.stringify(initial);
  return {
    async get(key, type) {
      if (key !== "dataset" || stored == null) return null;
      return type === "json" ? JSON.parse(stored) : stored;
    },
    async put(_key, value) {
      stored = value;
    },
    raw: () => stored,
  };
}

async function keys(): Promise<{ privateKey: CryptoKey; getKey: JWTVerifyGetKey }> {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(pair.publicKey);
  jwk.alg = "RS256";
  jwk.kid = "data-test";
  return { privateKey: pair.privateKey, getKey: createLocalJWKSet({ keys: [jwk] }) };
}

async function jwt(privateKey: CryptoKey, claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "data-test" })
    .setIssuer(TEAM)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(privateKey);
}

function dataset() {
  return {
    meta: {
      title: "Fictional list",
      generated: "2026-10-01",
      timezone: "Europe/Warsaw",
      currencyDefault: "PLN",
      vatRate: 0.23,
      netPriceRule: "gross / 1.23",
      urlRule: "https only",
      statusValues: ["considering", "dropped"],
      sources: { chat: "conversation" },
    },
    preferences: [{ id: "quiet", rule: "Prefer quiet options", source: "chat" }],
    topics: [
      {
        id: "studio-headphones",
        title: "Closed studio headphones",
        category: "Audio",
        status: "considering",
        statusDetail: null,
        firstDiscussed: "2026-10-01",
        summary: "A fictional pair.",
        decision: "Still looking.",
        findings: [],
        quotes: [],
        tags: [],
        options: [],
        nextSteps: [],
        sources: [],
      },
    ],
  };
}

function topic(id: string, title: string) {
  return {
    id,
    title,
    category: "Audio",
    status: "considering",
    statusDetail: null,
    firstDiscussed: "2026-10-02",
    summary: "Fictional.",
    decision: "None yet.",
    findings: [],
    quotes: [],
    tags: [],
    options: [],
    nextSteps: [],
    sources: [],
  };
}

function call(
  method: string,
  path: string,
  body: unknown,
  headers: HeadersInit,
  kv: ShoppingKV,
  getKey: JWTVerifyGetKey,
) {
  return handle(
    new Request(`https://shopping-organizer.staho.dev${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    {
      ENVIRONMENT: "production",
      TEAM_DOMAIN: TEAM,
      POLICY_AUD: AUD,
      ORGANIZER_UPDATE_KEY: KEY,
      SHOPPING: kv,
      ASSETS: { fetch: async () => new Response("asset") },
    },
    getKey,
  );
}

test("GET /api/data requires a user Access JWT and reads KV", async () => {
  const { privateKey, getKey } = await keys();
  const kv = memoryKv(dataset());
  const missing = await call("GET", "/api/data", undefined, {}, kv, getKey);
  assert.equal(missing.status, 403);

  const service = await call(
    "GET",
    "/api/data",
    undefined,
    { "cf-access-jwt-assertion": await jwt(privateKey, { common_name: "Zakupoholik" }) },
    kv,
    getKey,
  );
  assert.equal(service.status, 403);

  const user = await call(
    "GET",
    "/api/data",
    undefined,
    { "cf-access-jwt-assertion": await jwt(privateKey, { email: "reader@example.com" }) },
    kv,
    getKey,
  );
  assert.equal(user.status, 200);
  const body = await user.json();
  assert.equal(body.topics[0].title, "Closed studio headphones");
  assert.equal(body.meta.title, "Fictional list");
});

test("writes reject a browser user and a service token without the update key", async () => {
  const { privateKey, getKey } = await keys();
  const kv = memoryKv(dataset());
  const user = await jwt(privateKey, { email: "reader@example.com" });
  const service = await jwt(privateKey, { common_name: "Zakupoholik" });

  const noJwt = await call("PUT", "/api/data", dataset(), {}, kv, getKey);
  assert.equal(noJwt.status, 403);

  const browser = await call(
    "PUT",
    "/api/data",
    dataset(),
    { "cf-access-jwt-assertion": user, authorization: `Bearer ${KEY}` },
    kv,
    getKey,
  );
  assert.equal(browser.status, 403);

  const noKey = await call(
    "PUT",
    "/api/topics/studio-headphones",
    topic("studio-headphones", "Renamed"),
    { "cf-access-jwt-assertion": service },
    kv,
    getKey,
  );
  assert.equal(noKey.status, 401);

  const wrong = await call(
    "DELETE",
    "/api/topics/studio-headphones",
    undefined,
    { "cf-access-jwt-assertion": service, authorization: "Bearer nope" },
    kv,
    getKey,
  );
  assert.equal(wrong.status, 401);
  assert.equal(kv.raw()?.includes("Closed studio headphones"), true);
});

test("service token plus bearer key replaces, upserts, and deletes one topic", async () => {
  const { privateKey, getKey } = await keys();
  const kv = memoryKv();
  const service = await jwt(privateKey, { common_name: "Zakupoholik" });
  const headers = { "cf-access-jwt-assertion": service, authorization: `Bearer ${KEY}` };

  const empty = await call("PUT", "/api/topics/kettle", topic("kettle", "Kettle"), headers, kv, getKey);
  assert.equal(empty.status, 409);

  const seeded = await call("PUT", "/api/data", dataset(), headers, kv, getKey);
  assert.equal(seeded.status, 200);
  const seedBody = await seeded.json();
  assert.equal(seedBody.ok, true);
  assert.equal(seedBody.topics, 1);
  assert.match(seedBody.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const invalid = await call("PUT", "/api/data", { topics: [] }, headers, kv, getKey);
  assert.equal(invalid.status, 400);

  const upsert = await call(
    "PUT",
    "/api/topics/kettle",
    topic("kettle", "Compact kettle"),
    headers,
    kv,
    getKey,
  );
  assert.equal(upsert.status, 200);
  const stored = JSON.parse(kv.raw() ?? "{}");
  assert.equal(stored.topics.length, 2);
  assert.equal(stored.topics.find((item: { id: string }) => item.id === "kettle").title, "Compact kettle");
  assert.equal(stored.meta.updatedAt, (await upsert.json()).updatedAt);

  const mismatch = await call("PUT", "/api/topics/kettle", topic("other", "Nope"), headers, kv, getKey);
  assert.equal(mismatch.status, 400);

  const removed = await call("DELETE", "/api/topics/kettle", undefined, headers, kv, getKey);
  assert.equal(removed.status, 200);
  const after = JSON.parse(kv.raw() ?? "{}");
  assert.equal(after.topics.some((item: { id: string }) => item.id === "kettle"), false);

  const missing = await call("DELETE", "/api/topics/kettle", undefined, headers, kv, getKey);
  assert.equal(missing.status, 404);
});

test("writes return 503 when the update key is not configured", async () => {
  const { privateKey, getKey } = await keys();
  const response = await handle(
    new Request("https://shopping-organizer.staho.dev/api/data", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "cf-access-jwt-assertion": await jwt(privateKey, { common_name: "Zakupoholik" }),
        authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify(dataset()),
    }),
    {
      ENVIRONMENT: "production",
      TEAM_DOMAIN: TEAM,
      POLICY_AUD: AUD,
      SHOPPING: memoryKv(),
      ASSETS: { fetch: async () => new Response("asset") },
    },
    getKey,
  );
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "not configured");
});

test("an empty KV dataset is not replaced with the sample", async () => {
  const { privateKey, getKey } = await keys();
  const response = await call(
    "GET",
    "/api/data",
    undefined,
    { "cf-access-jwt-assertion": await jwt(privateKey, { email: "reader@example.com" }) },
    memoryKv(),
    getKey,
  );
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "No dataset stored");
});
