import { continueButton } from "../continue";
import { h } from "../dom";
import { formatDate, formatPickPrice, plural, statusLabel, STATUS_ORDER, topicPath } from "../format";
import {
  categories,
  displayStatus,
  filterTopics,
  filtersDirty,
  linkedOptionCount,
  openStepCount,
  optionCount,
  picks,
  readFilters,
  sortTopics,
  type Filters,
} from "../model";
import type { Dataset, Topic } from "../types";
import { statusBadge } from "./bits";

export function renderOverview(data: Dataset, params: URLSearchParams, onFilter: (next: URLSearchParams) => void): HTMLElement {
  const filters = readFilters(params);
  const matched = sortTopics(filterTopics(data.topics, filters), filters.sort);
  const earliest = [...data.topics].sort((a, b) => a.firstDiscussed.localeCompare(b.firstDiscussed))[0]?.firstDiscussed;
  const decided = data.topics.filter((topic) => displayStatus(topic) === "decided to buy").length;
  const links = linkedOptionCount(data.topics);
  const options = optionCount(data.topics);
  const steps = openStepCount(data.topics);

  const page = h(
    "div",
    { class: "page" },
    h("header", { class: "page-head" },
      h("h1", null, "Overview"),
      h(
        "p",
        { class: "lede" },
        earliest
          ? `${plural(data.topics.length, "topic", "topics")} since ${formatDate(earliest)}, with the current pick, the price, and what's still open.`
          : "No topics in shopping.json yet.",
      ),
    ),
    h("div", { class: "stats" },
      stat(String(data.topics.length), "Topics"),
      stat(String(decided), "Decided to buy"),
      stat(String(steps), steps === 1 ? "Open step" : "Open steps"),
      stat(String(links), "Options with a link", `of ${options}`),
    ),
    filterBar(data, filters, onFilter),
    h(
      "p",
      { class: "result-count", role: "status" },
      filtersDirty(filters)
        ? `Showing ${matched.length} of ${data.topics.length}`
        : plural(data.topics.length, "topic", "topics"),
    ),
    matched.length
      ? h("div", { class: "cards" }, matched.map((topic) => topicCard(topic)))
      : emptyState(onFilter),
    filters.sort.startsWith("price")
      ? h(
          "p",
          { class: "hint" },
          "Price sort uses the pick’s sticker price. Rents sort by the monthly, daily, or hourly amount printed on the card. Topics without a priced pick stay at the end.",
        )
      : null,
  );
  return page;
}

function stat(value: string, label: string, sub?: string): HTMLElement {
  return h(
    "div",
    { class: "stat" },
    h("div", { class: "stat-num" }, value),
    h("div", { class: "stat-label" }, label),
    sub ? h("div", { class: "stat-sub" }, sub) : null,
  );
}

function filterBar(data: Dataset, filters: Filters, onFilter: (next: URLSearchParams) => void): HTMLElement {
  const counts = new Map<string, number>();
  for (const topic of data.topics) {
    const status = displayStatus(topic);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  const search = h("input", {
    id: "q",
    type: "search",
    placeholder: "Search topics, shops, notes",
    autocomplete: "off",
    "aria-label": "Search topics, shops, and notes",
  }) as HTMLInputElement;
  search.value = filters.q;
  search.addEventListener("input", () => {
    const next = new URLSearchParams(currentParams(filters));
    if (search.value) next.set("q", search.value);
    else next.delete("q");
    onFilter(next);
  });

  const category = h("select", { id: "category" }) as HTMLSelectElement;
  category.append(new Option("All categories", ""));
  for (const name of categories(data.topics)) category.append(new Option(name, name));
  category.value = filters.category;
  category.addEventListener("change", () => {
    const next = new URLSearchParams(currentParams(filters));
    if (category.value) next.set("category", category.value);
    else next.delete("category");
    onFilter(next);
  });

  const sort = h("select", { id: "sort" }) as HTMLSelectElement;
  for (const [value, label] of [
    ["date-desc", "Newest"],
    ["date-asc", "Oldest"],
    ["price-desc", "Pick price: high"],
    ["price-asc", "Pick price: low"],
  ] as const) {
    sort.append(new Option(label, value));
  }
  sort.value = filters.sort;
  sort.addEventListener("change", () => {
    const next = new URLSearchParams(currentParams(filters));
    if (sort.value !== "date-desc") next.set("sort", sort.value);
    else next.delete("sort");
    onFilter(next);
  });

  const chips = h(
    "div",
    { class: "chips", role: "group", "aria-label": "Filter by status" },
    chip("All", "", filters.status, data.topics.length, (status) => setStatus(filters, status, onFilter)),
    STATUS_ORDER.filter((status) => (counts.get(status) ?? 0) > 0).map((status) =>
      chip(statusLabel(status), status, filters.status, counts.get(status) ?? 0, (value) => setStatus(filters, value, onFilter)),
    ),
  );

  const clear = h("button", { class: "text-btn", type: "button" }, "Clear") as HTMLButtonElement;
  clear.addEventListener("click", () => onFilter(new URLSearchParams()));

  return h(
    "div",
    { class: "filter-bar" },
    h("div", { class: "filters" },
      h("label", { class: "field search-field" }, h("span", null, "Search"), search),
      h("label", { class: "field" }, h("span", null, "Category"), category),
      h("label", { class: "field" }, h("span", null, "Sort"), sort),
      filtersDirty(filters) ? clear : null,
    ),
    chips,
  );
}

function currentParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  if (filters.sort !== "date-desc") params.set("sort", filters.sort);
  return params;
}

function setStatus(filters: Filters, status: string, onFilter: (next: URLSearchParams) => void): void {
  const next = currentParams(filters);
  if (status) next.set("status", status);
  else next.delete("status");
  onFilter(next);
}

function chip(
  label: string,
  value: string,
  active: string,
  count: number,
  onClick: (value: string) => void,
): HTMLButtonElement {
  const pressed = active === value;
  const button = h(
    "button",
    { class: "chip", type: "button", "aria-pressed": pressed ? "true" : "false" },
    label,
    h("span", { class: "chip-count" }, String(count)),
  ) as HTMLButtonElement;
  button.addEventListener("click", () => onClick(value));
  return button;
}

function topicCard(topic: Topic): HTMLElement {
  const chosen = picks(topic);
  const shown = chosen.slice(0, 2);
  const extra = chosen.length - shown.length;
  const links = topic.options.filter((option) => option.url.trim()).length;
  return h(
    "article",
    { class: "card" },
    h(
      "a",
      { class: "card-main", href: topicPath(topic.id) },
      h("div", { class: "card-kicker" },
        h("span", { class: "eyebrow" }, topic.category),
        h("time", { datetime: topic.firstDiscussed }, formatDate(topic.firstDiscussed)),
      ),
      h("h2", null, topic.title),
      h("div", { class: "badge-row" },
        statusBadge(displayStatus(topic)),
        topic.tags.map((tag) => h("span", { class: "tag" }, tag)),
      ),
      h("div", { class: "pick-block" },
        h("div", { class: "pick-kicker" }, chosen.length > 1 ? "Picks" : "Pick"),
        chosen.length
          ? [
              shown.map((option) =>
                h("div", { class: "pick-line" },
                  h("span", { class: "pick-name" }, option.name),
                  h("span", { class: "amt" }, formatPickPrice(option)),
                ),
              ),
              extra > 0 ? h("div", { class: "more" }, `+${extra} more`) : null,
            ]
          : h("p", { class: "muted" }, "No pick yet"),
      ),
      h(
        "p",
        { class: "card-foot" },
        `${plural(topic.options.length, "option", "options")} · ${plural(topic.nextSteps.length, "open step", "open steps")} · ${plural(links, "link", "links")}`,
      ),
    ),
    continueButton(topic.id, topic.title),
  );
}

function emptyState(onFilter: (next: URLSearchParams) => void): HTMLElement {
  const button = h("button", { class: "text-btn", type: "button" }, "Clear filters") as HTMLButtonElement;
  button.addEventListener("click", () => onFilter(new URLSearchParams()));
  return h(
    "div",
    { class: "empty" },
    h("h2", null, "Nothing matches"),
    h("p", null, "No topic has that status, category, or search text."),
    button,
  );
}
