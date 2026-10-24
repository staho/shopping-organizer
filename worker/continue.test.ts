import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import worker from "./index.ts";
import { handleContinue } from "./continue.ts";

const TEAM = "https://example.cloudflareaccess.com";
const AUD = "aud-tag-for-tests";
const TOPIC = "studio-headphones";

async function accessToken(): Promise<{ token: string; getKey: JWTVerifyGetKey }> {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(pair.publicKey);
  jwk.alg = "RS256";
  jwk.kid = "continue-test";
  const token = await new SignJWT({ email: "reader@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "continue-test" })
    .setIssuer(TEAM)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(pair.privateKey);
  return { token, getKey: createLocalJWKSet({ keys: [jwk] }) };
}

function post(body: unknown, headers: HeadersInit = {}, ip = "test-client"): Request {
  return new Request("https://shopping-organizer.staho.dev/api/continue", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...headers },
    body: JSON.stringify(body),
  });
}

test("missing webhook secrets return 503", async () => {
  const response = await handleContinue(post({ topicId: TOPIC, note: "hi" }, {}, "missing-secrets"), {});
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "not configured");

  const onlyUrl = await handleContinue(post({ topicId: TOPIC }, {}, "only-url"), {
    GROK_WEBHOOK_URL: "https://webhook.test/hook",
  });
  assert.equal(onlyUrl.status, 503);
});

test("unknown topic returns 404", async () => {
  const response = await handleContinue(
    post({ topicId: "not-a-topic", note: "hello", topic: { title: "forged" } }, {}, "unknown-topic"),
    { GROK_WEBHOOK_URL: "https://webhook.test/hook", GROK_WEBHOOK_KEY: "secret-key" },
    { fetch: async () => new Response("no", { status: 200 }) },
  );
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Topic not found");
});

test("production rejects /api/continue without an Access JWT", async () => {
  const response = await worker.fetch(post({ topicId: TOPIC, note: "hi" }, {}, "no-jwt"), {
    ENVIRONMENT: "production",
    TEAM_DOMAIN: TEAM,
    POLICY_AUD: AUD,
    GROK_WEBHOOK_URL: "https://webhook.test/hook",
    GROK_WEBHOOK_KEY: "secret-key",
    ASSETS: { fetch: async () => new Response("asset") },
  });
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "Forbidden");
});

test("webhook payload uses the bundled topic and the configured header", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const response = await handleContinue(
    post({ topicId: TOPIC, note: "Ask about the return window", topic: { title: "forged title" } }, {}, "payload"),
    {
      GROK_WEBHOOK_URL: "https://webhook.test/hook",
      GROK_WEBHOOK_KEY: "secret-key",
    },
    {
      now: () => Date.parse("2026-10-24T12:00:00.000Z"),
      hits: new Map(),
      fetch: async (input, init) => {
        seen.push({ url: String(input), init: init ?? {} });
        return new Response("accepted", { status: 202 });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "Sent");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url, "https://webhook.test/hook");
  const headers = new Headers(seen[0]?.init.headers);
  assert.equal(headers.get("authorization"), "Bearer secret-key");
  assert.equal(headers.get("content-type"), "application/json");
  const payload = JSON.parse(String(seen[0]?.init.body));
  assert.equal(payload.source, "shopping-organizer");
  assert.equal(payload.topicId, TOPIC);
  assert.equal(payload.title, "Closed studio headphones");
  assert.equal(payload.status, "decided to buy");
  assert.equal(payload.url, "https://shopping-organizer.staho.dev/topic/studio-headphones");
  assert.equal(payload.note, "Ask about the return window");
  assert.equal(payload.sentAt, "2026-10-24T12:00:00.000Z");
  assert.equal(payload.topic.id, TOPIC);
  assert.equal(payload.topic.title, "Closed studio headphones");
  assert.notEqual(payload.topic.title, "forged title");
  assert.equal(payload.topic.options.length > 0, true);
});

test("GROK_WEBHOOK_AUTH is the Authorization value and ignores the key", async () => {
  let authorization: string | null = null;
  let custom: string | null = null;
  const response = await handleContinue(
    post({ topicId: TOPIC }, {}, "verbatim-auth"),
    {
      GROK_WEBHOOK_URL: "https://webhook.test/hook",
      GROK_WEBHOOK_KEY: "secret-key",
      GROK_WEBHOOK_KEY_HEADER: "X-Grok-Key",
      GROK_WEBHOOK_AUTH: "Bearer panel-ready-value",
    },
    {
      hits: new Map(),
      fetch: async (_input, init) => {
        const headers = new Headers(init?.headers);
        authorization = headers.get("authorization");
        custom = headers.get("x-grok-key");
        return new Response(null, { status: 204 });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(authorization, "Bearer panel-ready-value");
  assert.equal(custom, null);
});

test("GROK_WEBHOOK_AUTH is enough without a webhook key", async () => {
  let authorization: string | null = null;
  const response = await handleContinue(
    post({ topicId: TOPIC }, {}, "auth-without-key"),
    {
      GROK_WEBHOOK_URL: "https://webhook.test/hook",
      GROK_WEBHOOK_AUTH: "panel-ready-value",
    },
    {
      hits: new Map(),
      fetch: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization");
        return new Response(null, { status: 204 });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(authorization, "panel-ready-value");
});

test("a blank GROK_WEBHOOK_AUTH falls back to the key header", async () => {
  let authorization: string | null = null;
  const response = await handleContinue(
    post({ topicId: TOPIC }, {}, "blank-auth"),
    {
      GROK_WEBHOOK_URL: "https://webhook.test/hook",
      GROK_WEBHOOK_KEY: "secret-key",
      GROK_WEBHOOK_AUTH: "   ",
    },
    {
      hits: new Map(),
      fetch: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization");
        return new Response(null, { status: 204 });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(authorization, "Bearer secret-key");
});

test("an Authorization value with a line break is not configured", async () => {
  let called = false;
  const response = await handleContinue(
    post({ topicId: TOPIC }, {}, "bad-auth"),
    {
      GROK_WEBHOOK_URL: "https://webhook.test/hook",
      GROK_WEBHOOK_AUTH: "Bearer abc\nX-Injected: 1",
      GROK_WEBHOOK_KEY: "secret-key",
    },
    {
      hits: new Map(),
      fetch: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    },
  );
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "not configured");
  assert.equal(called, false);
});

test("a custom key header sends the raw key", async () => {
  let header: string | null = null;
  const response = await handleContinue(
    post({ topicId: TOPIC }, {}, "custom-header"),
    {
      GROK_WEBHOOK_URL: "https://webhook.test/hook",
      GROK_WEBHOOK_KEY: "secret-key",
      GROK_WEBHOOK_KEY_HEADER: "X-Grok-Key",
    },
    {
      hits: new Map(),
      fetch: async (_input, init) => {
        header = new Headers(init?.headers).get("x-grok-key");
        return new Response(null, { status: 204 });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(header, "secret-key");
});

function memoryKv(initial: unknown): { get(key: string, type?: "json"): Promise<unknown>; put(key: string, value: string): Promise<void> } {
  let raw = initial === undefined ? null : JSON.stringify(initial);
  return {
    async get(key, type) {
      if (key !== "dataset" || raw == null) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(_key, value) {
      raw = value;
    },
  };
}

test("continue uses the KV topic and ignores the bundled sample", async () => {
  let title = "";
  const response = await handleContinue(
    post({ topicId: TOPIC, note: "" }, {}, "kv-topic"),
    {
      GROK_WEBHOOK_URL: "https://webhook.test/hook",
      GROK_WEBHOOK_KEY: "secret-key",
      SHOPPING: memoryKv({
        topics: [{ id: TOPIC, title: "KV headphones", status: "considering", options: [] }],
      }),
    },
    {
      hits: new Map(),
      fetch: async (_input, init) => {
        title = JSON.parse(String(init?.body)).title;
        return new Response(null, { status: 204 });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(title, "KV headphones");
});

test("continue does not fall back to the sample when KV has no such topic", async () => {
  let called = false;
  const response = await handleContinue(
    post({ topicId: TOPIC }, {}, "kv-missing-topic"),
    {
      GROK_WEBHOOK_URL: "https://webhook.test/hook",
      GROK_WEBHOOK_KEY: "secret-key",
      SHOPPING: memoryKv({ topics: [] }),
    },
    {
      hits: new Map(),
      fetch: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    },
  );
  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test("test environment still requires Basic Auth before the webhook", async () => {
  const env = {
    ENVIRONMENT: "test",
    BASIC_AUTH_USER: "reader",
    BASIC_AUTH_PASS: "correct horse",
    GROK_WEBHOOK_URL: "https://webhook.test/hook",
    GROK_WEBHOOK_KEY: "secret-key",
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const missing = await worker.fetch(post({ topicId: TOPIC }, {}, "basic-missing"), env);
  assert.equal(missing.status, 401);

  const { token } = await accessToken();
  const withJwtOnly = await worker.fetch(
    post({ topicId: TOPIC }, { "cf-access-jwt-assertion": token }, "jwt-not-basic"),
    env,
  );
  assert.equal(withJwtOnly.status, 401);

  const allowed = await worker.fetch(
    post({ topicId: "missing" }, { authorization: `Basic ${btoa("reader:correct horse")}` }, "basic-ok"),
    env,
  );
  assert.equal(allowed.status, 404);
});
