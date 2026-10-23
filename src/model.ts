import type { Dataset, Option, Topic } from "./types";

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function normalize(raw: unknown): Dataset {
  if (!raw || typeof raw !== "object") throw new Error("shopping.json is not an object");
  const data = raw as Dataset;
  if (!data.meta || !Array.isArray(data.topics) || !Array.isArray(data.preferences)) {
    throw new Error("shopping.json is missing meta, topics, or preferences");
  }
  for (const topic of data.topics) {
    topic.quotes = strings(topic.quotes);
    topic.findings = strings(topic.findings);
    topic.tags = strings(topic.tags);
    topic.nextSteps = strings(topic.nextSteps);
    topic.sources = strings(topic.sources);
    topic.options = Array.isArray(topic.options) ? topic.options : [];
    topic.statusDetail = topic.statusDetail ?? null;
    topic.summary = topic.summary ?? "";
    topic.decision = topic.decision ?? "";
  }
  return data;
}

export function displayStatus(topic: Topic): string {
  if (topic.status === "dropped" && topic.statusDetail === "postponed") return "postponed";
  return topic.status;
}

export function picks(topic: Topic): Option[] {
  return topic.options.filter((option) => option.isPick);
}

export function pickAmount(topic: Topic): number | null {
  for (const option of picks(topic)) {
    if (option.priceGross != null) return option.priceGross;
    if (option.vatDeductible === true && option.priceNet != null) return option.priceNet;
  }
  return null;
}

export interface Filters {
  q: string;
  status: string;
  category: string;
  sort: string;
}

const SORTS = new Set(["date-desc", "date-asc", "price-desc", "price-asc"]);

export function readFilters(params: URLSearchParams): Filters {
  const sort = params.get("sort") || "date-desc";
  return {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    category: params.get("category") ?? "",
    sort: SORTS.has(sort) ? sort : "date-desc",
  };
}

export function filtersDirty(filters: Filters): boolean {
  return Boolean(filters.q || filters.status || filters.category || filters.sort !== "date-desc");
}

export function matchesQuery(topic: Topic, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("pl");
  if (!needle) return true;
  const parts = [
    topic.title,
    topic.summary,
    topic.decision,
    topic.category,
    displayStatus(topic),
    ...topic.tags,
    ...topic.quotes,
    ...topic.findings,
    ...topic.nextSteps,
    ...topic.sources,
    ...topic.options.flatMap((option) => [option.name, option.shop, option.notes, option.url, option.currency]),
  ];
  return parts.some((part) => (part ?? "").toLocaleLowerCase("pl").includes(needle));
}

export function filterTopics(topics: Topic[], filters: Filters): Topic[] {
  return topics.filter((topic) => {
    if (filters.status && displayStatus(topic) !== filters.status) return false;
    if (filters.category && topic.category !== filters.category) return false;
    return matchesQuery(topic, filters.q);
  });
}

export function sortTopics(topics: Topic[], sort: string): Topic[] {
  const copy = [...topics];
  copy.sort((a, b) => {
    if (sort === "date-asc" || sort === "date-desc") {
      const byDate = a.firstDiscussed.localeCompare(b.firstDiscussed);
      const directed = sort === "date-asc" ? byDate : -byDate;
      if (directed) return directed;
      return a.title.localeCompare(b.title, "en");
    }
    const priceA = pickAmount(a);
    const priceB = pickAmount(b);
    if (priceA == null && priceB == null) return a.title.localeCompare(b.title, "en");
    if (priceA == null) return 1;
    if (priceB == null) return -1;
    const byPrice = sort === "price-asc" ? priceA - priceB : priceB - priceA;
    if (byPrice) return byPrice;
    return a.title.localeCompare(b.title, "en");
  });
  return copy;
}

export function categories(topics: Topic[]): string[] {
  return [...new Set(topics.map((topic) => topic.category))].sort((a, b) => a.localeCompare(b, "en"));
}

export function decisionGroups(topics: Topic[]): { date: string; topics: Topic[] }[] {
  const dates = [...new Set(topics.map((topic) => topic.firstDiscussed))].sort((a, b) => b.localeCompare(a));
  return dates.map((date) => ({
    date,
    topics: topics.filter((topic) => topic.firstDiscussed === date),
  }));
}

export function linkedOptionCount(topics: Topic[]): number {
  return topics.reduce(
    (sum, topic) => sum + topic.options.filter((option) => option.url.trim().length > 0).length,
    0,
  );
}

export function optionCount(topics: Topic[]): number {
  return topics.reduce((sum, topic) => sum + topic.options.length, 0);
}

export function openStepCount(topics: Topic[]): number {
  return topics.reduce((sum, topic) => sum + topic.nextSteps.length, 0);
}
