import type { Topic } from "../src/types.ts";
import { loadDataset, type StoreEnv } from "./store.ts";
const PUBLIC_ORIGIN = "https://shopping-organizer.staho.dev";
const MAX_NOTE = 4000;
const MAX_BODY = 16_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 8;

export interface ContinueEnv extends StoreEnv {
  GROK_WEBHOOK_URL?: string;
  GROK_WEBHOOK_KEY?: string;
  /**
   * Full Authorization header value from the receiver.
   * When set, this is sent verbatim and the key header is not used.
   */
  GROK_WEBHOOK_AUTH?: string;
  /** Header that carries the key. `Authorization` sends `Bearer <key>`. Any other name sends the raw key. */
  GROK_WEBHOOK_KEY_HEADER?: string;
}

export interface ContinueDeps {
  fetch?: typeof fetch;
  now?: () => number;
  hits?: Map<string, number[]>;
}

const hits = new Map<string, number[]>();

function filled(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function topicStatus(topic: Topic): string {
  if (topic.status === "dropped" && topic.statusDetail === "postponed") return "postponed";
  return topic.status;
}

function headerValueOk(value: string): boolean {
  return !/[\u0000-\u001F\u007F]/.test(value);
}

function webhookConfig(env: ContinueEnv): { url: string; header: string; value: string } | null {
  const url = filled(env.GROK_WEBHOOK_URL);
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const auth = filled(env.GROK_WEBHOOK_AUTH);
  if (auth) {
    if (!headerValueOk(auth)) return null;
    return { url, header: "Authorization", value: auth };
  }

  const key = filled(env.GROK_WEBHOOK_KEY);
  if (!key) return null;
  const header = filled(env.GROK_WEBHOOK_KEY_HEADER) ?? "Authorization";
  if (!/^[\w!#$%&'*+.^`|~-]+$/.test(header)) return null;
  if (["content-type", "content-length", "host", "connection"].includes(header.toLowerCase())) return null;
  const value = header.toLowerCase() === "authorization" ? `Bearer ${key}` : key;
  if (!headerValueOk(value)) return null;
  return { url, header, value };
}

function limited(ip: string, now: number, store: Map<string, number[]>): boolean {
  const recent = (store.get(ip) ?? []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    store.set(ip, recent);
    return true;
  }
  recent.push(now);
  store.set(ip, recent);
  return false;
}

export function continuePayload(topic: Topic, note: string, sentAt: string): Record<string, unknown> {
  return {
    source: "shopping-organizer",
    topicId: topic.id,
    title: topic.title,
    status: topicStatus(topic),
    url: `${PUBLIC_ORIGIN}/topic/${encodeURIComponent(topic.id)}`,
    note,
    topic,
    sentAt,
  };
}

export async function handleContinue(
  request: Request,
  env: ContinueEnv,
  deps: ContinueDeps = {},
): Promise<Response> {
  if (request.method !== "POST") return text("Method not allowed", 405);

  const config = webhookConfig(env);
  if (!config) return text("not configured", 503);

  const now = deps.now?.() ?? Date.now();
  const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  if (limited(ip, now, deps.hits ?? hits)) return text("Too many requests", 429);

  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY) return text("Request is too large", 413);

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return text("Bad request", 400);
  }
  if (rawBody.length > MAX_BODY) return text("Request is too large", 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return text("Bad request", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return text("Bad request", 400);
  const body = parsed as { topicId?: unknown; note?: unknown };
  if (typeof body.topicId !== "string" || !body.topicId.trim()) return text("Bad request", 400);
  const note = body.note == null ? "" : body.note;
  if (typeof note !== "string") return text("Bad request", 400);
  if (note.length > MAX_NOTE) return text("Note is too long", 400);

  const dataset = await loadDataset(env);
  const topic = dataset?.topics.find((item) => item.id === body.topicId);
  if (!topic) return text("Topic not found", 404);

  const sentAt = new Date(now).toISOString();
  const payload = continuePayload(topic, note, sentAt);
  const headers = new Headers({ "content-type": "application/json" });
  headers.set(config.header, config.value);

  const fetchImpl = deps.fetch ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchImpl(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return text("Could not reach Grok Bot", 502);
  }
  await upstream.body?.cancel().catch(() => undefined);
  if (!upstream.ok) return text("Could not reach Grok Bot", 502);
  return text("Sent", 200);
}
