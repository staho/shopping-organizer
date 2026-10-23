import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../data/shopping.json", import.meta.url), "utf8"));
const errors = [];

function fail(message) {
  errors.push(message);
}

function isNumberOrNull(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function toCents(value) {
  const [whole, frac = "00"] = value.toFixed(2).split(".");
  return BigInt(whole) * 100n + BigInt(frac);
}

function expectedNet(gross) {
  const cents = toCents(gross);
  const numerator = cents * 100n;
  const denominator = 123n;
  let quote = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) quote += 1n;
  return Number(quote) / 100;
}

if (!data.meta || !Array.isArray(data.topics) || !Array.isArray(data.preferences)) {
  fail("root must contain meta, topics, and preferences");
}

const statuses = new Set(data.meta?.statusValues ?? []);
const topicIds = new Set();
const preferenceIds = new Set();

for (const preference of data.preferences ?? []) {
  if (!preference.id || !preference.rule || !preference.source) {
    fail(`preference missing id, rule, or source: ${JSON.stringify(preference?.id)}`);
  }
  if (preferenceIds.has(preference.id)) fail(`duplicate preference id ${preference.id}`);
  preferenceIds.add(preference.id);
}

for (const topic of data.topics ?? []) {
  if (!topic.id || !/^[a-z0-9][a-z0-9-]*$/.test(topic.id)) fail(`bad topic id ${topic.id}`);
  if (topicIds.has(topic.id)) fail(`duplicate topic id ${topic.id}`);
  topicIds.add(topic.id);
  for (const key of ["title", "category", "status", "summary", "decision", "firstDiscussed"]) {
    if (typeof topic[key] !== "string" || !topic[key]) fail(`${topic.id} missing ${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(topic.firstDiscussed ?? "")) fail(`${topic.id} bad date`);
  if (!statuses.has(topic.status)) fail(`${topic.id} status ${topic.status} is not in meta.statusValues`);
  if (topic.statusDetail != null && typeof topic.statusDetail !== "string") {
    fail(`${topic.id} statusDetail must be a string or null`);
  }
  for (const key of ["quotes", "findings", "tags", "nextSteps", "sources"]) {
    if (!Array.isArray(topic[key]) || topic[key].some((item) => typeof item !== "string")) {
      fail(`${topic.id}.${key} must be an array of strings`);
    }
  }
  if (!Array.isArray(topic.options)) fail(`${topic.id} options must be an array`);

  for (const option of topic.options ?? []) {
    const where = `${topic.id} / ${option.name}`;
    if (typeof option.name !== "string" || !option.name) fail(`${where} missing name`);
    if (!isNumberOrNull(option.priceGross) || !isNumberOrNull(option.priceNet)) {
      fail(`${where} prices must be numbers or null`);
    }
    if (typeof option.currency !== "string" || typeof option.shop !== "string" || typeof option.notes !== "string") {
      fail(`${where} currency, shop, and notes must be strings`);
    }
    if (typeof option.url !== "string") fail(`${where} url must be a string`);
    if (option.url && !/^https?:\/\/\S+$/.test(option.url)) fail(`${where} url is not an absolute http(s) URL`);
    if (!option.url && option.urlSource) fail(`${where} has urlSource without a url`);
    if (option.urlSource != null && typeof option.urlSource !== "string") fail(`${where} urlSource must be a string or null`);
    if (![true, false, null].includes(option.vatDeductible)) fail(`${where} vatDeductible must be true, false, or null`);
    if (typeof option.isPick !== "boolean") fail(`${where} isPick must be boolean`);
    if (option.vatDeductible !== true && option.priceNet != null) {
      fail(`${where} has a net price but VAT is not deductible`);
    }
    if (
      option.vatDeductible === true &&
      option.currency === "PLN" &&
      option.priceGross != null &&
      option.priceNet != null
    ) {
      const expected = expectedNet(option.priceGross);
      if (Math.abs(expected - option.priceNet) > 0.02) {
        fail(`${where} net ${option.priceNet} is not gross/1.23 (expected ${expected})`);
      }
    }
    if (option.pricePeriod != null && !["month", "day", "hour"].includes(option.pricePeriod)) {
      fail(`${where} bad pricePeriod`);
    }
    if (option.listingKind != null && !["rent", "buy"].includes(option.listingKind)) {
      fail(`${where} bad listingKind`);
    }
  }
}

const rents = (data.topics ?? []).reduce(
  (sum, topic) => sum + topic.options.filter((option) => option.listingKind === "rent").length,
  0,
);
const sales = (data.topics ?? []).reduce(
  (sum, topic) => sum + topic.options.filter((option) => option.listingKind === "buy").length,
  0,
);
if (rents < 1 || sales < 1) fail("dataset needs both rent and sale listings");

const anchors = [
  "https://example.com/shop/kettle-steam-compact",
  "https://example.com/shop/plainview-32",
  "https://example.com/shop/northwind-nc-700",
  "https://example.com/listings/north-unit",
  "https://example.com/shop/birch-mini",
];
const urls = new Set((data.topics ?? []).flatMap((topic) => topic.options.map((option) => option.url)));
for (const url of anchors) {
  if (!urls.has(url)) fail(`missing anchored URL ${url}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const optionCount = (data.topics ?? []).reduce((sum, topic) => sum + topic.options.length, 0);
const linkCount = [...urls].filter(Boolean).length;
console.log(`ok: ${data.topics.length} topics, ${optionCount} options, ${linkCount} links, ${data.preferences.length} preferences`);
