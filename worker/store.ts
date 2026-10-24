import raw from "../data/shopping.json" with { type: "json" };
import type { Dataset, DatasetMeta, Preference, Topic } from "../src/types.ts";

const SAMPLE = raw as Dataset;
export const DATASET_KEY = "dataset";

export interface ShoppingKV {
  get(key: string, type?: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

export interface StoreEnv {
  SHOPPING?: ShoppingKV;
}

export async function loadDataset(env: StoreEnv): Promise<Dataset | null> {
  if (!env.SHOPPING) return SAMPLE;
  const stored = await env.SHOPPING.get(DATASET_KEY, "json");
  if (!stored || typeof stored !== "object") return null;
  return stored as Dataset;
}

export async function saveDataset(env: StoreEnv, dataset: Dataset): Promise<void> {
  if (!env.SHOPPING) throw new Error("KV binding SHOPPING is not configured");
  await env.SHOPPING.put(DATASET_KEY, JSON.stringify(dataset));
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function topicIdOk(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(id);
}

export function validateTopic(topic: unknown, statuses: Set<string>, issues: string[]): topic is Topic {
  if (!topic || typeof topic !== "object" || Array.isArray(topic)) {
    issues.push("topic must be an object");
    return false;
  }
  const item = topic as Topic;
  const id = typeof item.id === "string" && topicIdOk(item.id) ? item.id : "";
  if (!id) issues.push("topic id must be a lowercase slug");
  const label = id || "topic";
  for (const key of ["title", "category", "status", "summary", "decision", "firstDiscussed"] as const) {
    if (typeof item[key] !== "string" || !item[key]) issues.push(`${label} missing ${key}`);
  }
  if (typeof item.firstDiscussed === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(item.firstDiscussed)) {
    issues.push(`${label} bad date`);
  }
  if (typeof item.status === "string" && statuses.size && !statuses.has(item.status)) {
    issues.push(`${label} status is not in meta.statusValues`);
  }
  if (item.statusDetail != null && typeof item.statusDetail !== "string") {
    issues.push(`${label} statusDetail must be a string or null`);
  }
  for (const key of ["quotes", "findings", "tags", "nextSteps", "sources"] as const) {
    if (!stringArray(item[key])) issues.push(`${label}.${key} must be an array of strings`);
    else if (item[key].length > 100) issues.push(`${label}.${key} is too long`);
  }
  if (!Array.isArray(item.options)) {
    issues.push(`${label} options must be an array`);
    return issues.length === 0;
  }
  if (item.options.length > 80) issues.push(`${label} has too many options`);
  for (const option of item.options) {
    if (!option || typeof option !== "object") {
      issues.push(`${label} option must be an object`);
      continue;
    }
    const name = typeof option.name === "string" && option.name ? option.name : "";
    const where = name ? `${label} / ${name}` : `${label} option`;
    if (!name) issues.push(`${where} missing name`);
    if (!isNumberOrNull(option.priceGross) || !isNumberOrNull(option.priceNet)) {
      issues.push(`${where} prices must be numbers or null`);
    }
    if (typeof option.currency !== "string" || typeof option.shop !== "string" || typeof option.notes !== "string") {
      issues.push(`${where} currency, shop, and notes must be strings`);
    }
    if (typeof option.url !== "string") issues.push(`${where} url must be a string`);
    else if (option.url && !/^https?:\/\/\S+$/.test(option.url)) issues.push(`${where} url is not an absolute http(s) URL`);
    if (option.urlSource != null && typeof option.urlSource !== "string") {
      issues.push(`${where} urlSource must be a string or null`);
    }
    if (![true, false, null].includes(option.vatDeductible)) {
      issues.push(`${where} vatDeductible must be true, false, or null`);
    }
    if (typeof option.isPick !== "boolean") issues.push(`${where} isPick must be boolean`);
    if (option.pricePeriod != null && !["month", "day", "hour"].includes(option.pricePeriod)) {
      issues.push(`${where} bad pricePeriod`);
    }
    if (option.listingKind != null && !["rent", "buy"].includes(option.listingKind)) {
      issues.push(`${where} bad listingKind`);
    }
  }
  return issues.length === 0;
}

function validateMeta(meta: unknown, issues: string[]): meta is DatasetMeta {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    issues.push("meta must be an object");
    return false;
  }
  const item = meta as DatasetMeta;
  for (const key of ["title", "generated", "timezone", "currencyDefault", "netPriceRule", "urlRule"] as const) {
    if (typeof item[key] !== "string" || !item[key]) issues.push(`meta.${key} must be a string`);
  }
  if (typeof item.vatRate !== "number" || !Number.isFinite(item.vatRate)) issues.push("meta.vatRate must be a number");
  if (!stringArray(item.statusValues) || item.statusValues.length === 0) {
    issues.push("meta.statusValues must be a non-empty array of strings");
  }
  if (!item.sources || typeof item.sources !== "object" || Array.isArray(item.sources)) {
    issues.push("meta.sources must be an object");
  } else if (Object.values(item.sources).some((value) => typeof value !== "string")) {
    issues.push("meta.sources values must be strings");
  }
  for (const key of ["supplemented", "supplement", "updatedAt"] as const) {
    if (item[key] != null && typeof item[key] !== "string") issues.push(`meta.${key} must be a string`);
  }
  return issues.length === 0;
}

function validatePreference(preference: unknown, issues: string[]): preference is Preference {
  if (!preference || typeof preference !== "object") {
    issues.push("preference must be an object");
    return false;
  }
  const item = preference as Preference;
  if (typeof item.id !== "string" || !item.id) issues.push("preference missing id");
  if (typeof item.rule !== "string" || !item.rule) issues.push("preference missing rule");
  if (typeof item.source !== "string" || !item.source) issues.push("preference missing source");
  if (item.quote != null && typeof item.quote !== "string") issues.push("preference quote must be a string");
  return true;
}

export function validateDataset(input: unknown): { dataset: Dataset; issues: string[] } | { dataset: null; issues: string[] } {
  const issues: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { dataset: null, issues: ["body must be a dataset object"] };
  }
  const data = input as Dataset;
  if (!validateMeta(data.meta, issues) || !Array.isArray(data.topics) || !Array.isArray(data.preferences)) {
    if (!Array.isArray(data.topics)) issues.push("topics must be an array");
    if (!Array.isArray(data.preferences)) issues.push("preferences must be an array");
    return { dataset: null, issues };
  }
  if (data.topics.length > 200) issues.push("too many topics");
  if (data.preferences.length > 100) issues.push("too many preferences");
  const statuses = new Set(data.meta.statusValues);
  const topicIds = new Set<string>();
  for (const topic of data.topics) {
    const before = issues.length;
    validateTopic(topic, statuses, issues);
    if (issues.length === before && topicIds.has(topic.id)) issues.push(`duplicate topic id ${topic.id}`);
    if (typeof topic.id === "string") topicIds.add(topic.id);
  }
  const preferenceIds = new Set<string>();
  for (const preference of data.preferences) {
    validatePreference(preference, issues);
    if (preference && typeof preference === "object" && typeof preference.id === "string") {
      if (preferenceIds.has(preference.id)) issues.push(`duplicate preference id ${preference.id}`);
      preferenceIds.add(preference.id);
    }
  }
  if (issues.length) return { dataset: null, issues };
  return { dataset: data, issues: [] };
}

export function stamp(dataset: Dataset, updatedAt: string): Dataset {
  return { ...dataset, meta: { ...dataset.meta, updatedAt } };
}
