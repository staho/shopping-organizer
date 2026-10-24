import { sameSecret, type AuthResult } from "./auth.ts";
import {
  loadDataset,
  saveDataset,
  stamp,
  validateDataset,
  validateTopic,
  type StoreEnv,
} from "./store.ts";
import type { Dataset, Topic } from "../src/types.ts";

const MAX_DATASET_BYTES = 1_000_000;
const MAX_TOPIC_BYTES = 100_000;

export interface DataEnv extends StoreEnv {
  ORGANIZER_UPDATE_KEY?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function filled(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function topicIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/topics\/([^/]+)$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function isWriteRequest(request: Request, pathname: string): boolean {
  if (request.method === "PUT" && pathname === "/api/data") return true;
  if ((request.method === "PUT" || request.method === "DELETE") && topicIdFromPath(pathname)) return true;
  return false;
}

async function presentedKey(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.slice(0, 7).toLowerCase() === "bearer ") return authorization.slice(7).trim();
  return request.headers.get("x-organizer-key")?.trim() ?? "";
}

async function requireUpdateKey(request: Request, env: DataEnv): Promise<Response | null> {
  const expected = filled(env.ORGANIZER_UPDATE_KEY);
  if (!expected) return text("not configured", 503);
  const provided = await presentedKey(request);
  if (!provided || !(await sameSecret(provided, expected))) return text("Unauthorized", 401);
  return null;
}

async function readBody(request: Request, limit: number): Promise<{ text: string } | Response> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > limit) return text("Request is too large", 413);
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return text("Bad request", 400);
  }
  if (raw.length > limit) return text("Request is too large", 413);
  return { text: raw };
}

export async function handleData(
  request: Request,
  env: DataEnv,
  auth: Extract<AuthResult, { ok: true }>,
  now = Date.now(),
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/api/data") {
    if (auth.kind === "service") return text("Forbidden", 403);
    if (!env.SHOPPING) return json({ error: "Data store is not configured" }, 500);
    const dataset = await loadDataset(env);
    if (!dataset) return json({ error: "No dataset stored" }, 404);
    return json(dataset, 200);
  }

  if (!isWriteRequest(request, pathname)) return text("Method not allowed", 405);
  if (auth.kind === "user") return text("Forbidden", 403);
  const denied = await requireUpdateKey(request, env);
  if (denied) return denied;
  if (!env.SHOPPING) return text("Data store is not configured", 500);

  const updatedAt = new Date(now).toISOString();

  if (request.method === "PUT" && pathname === "/api/data") {
    const body = await readBody(request, MAX_DATASET_BYTES);
    if (body instanceof Response) return body;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      return text("Bad request", 400);
    }
    const validated = validateDataset(parsed);
    if (!validated.dataset) return json({ error: "Invalid dataset", issues: validated.issues.slice(0, 20) }, 400);
    const stored = stamp(validated.dataset, updatedAt);
    await saveDataset(env, stored);
    return json({ ok: true, updatedAt, topics: stored.topics.length }, 200);
  }

  const topicId = topicIdFromPath(pathname);
  if (!topicId) return text("Bad request", 400);
  const current = await loadDataset(env);
  if (!current) return json({ error: "No dataset stored" }, 409);

  if (request.method === "DELETE") {
    if (!current.topics.some((topic) => topic.id === topicId)) return text("Topic not found", 404);
    const stored = stamp(
      { ...current, topics: current.topics.filter((topic) => topic.id !== topicId) },
      updatedAt,
    );
    await saveDataset(env, stored);
    return json({ ok: true, updatedAt, topicId }, 200);
  }

  const body = await readBody(request, MAX_TOPIC_BYTES);
  if (body instanceof Response) return body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return text("Bad request", 400);
  }
  const issues: string[] = [];
  const statuses = new Set(current.meta?.statusValues ?? []);
  if (!validateTopic(parsed, statuses, issues)) return json({ error: "Invalid topic", issues: issues.slice(0, 20) }, 400);
  const topic = parsed as Topic;
  if (topic.id !== topicId) return text("Topic id does not match the URL", 400);
  const topics = current.topics.some((item) => item.id === topic.id)
    ? current.topics.map((item) => (item.id === topic.id ? topic : item))
    : [...current.topics, topic];
  const stored: Dataset = stamp({ ...current, topics }, updatedAt);
  await saveDataset(env, stored);
  return json({ ok: true, updatedAt, topicId: topic.id }, 200);
}
