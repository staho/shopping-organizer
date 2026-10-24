import { continueButton } from "../continue";
import { h, type Child } from "../dom";
import { formatDate, formatGross, formatNet, plural } from "../format";
import { displayStatus } from "../model";
import type { Option, Topic } from "../types";
import { linkButton, statusBadge } from "./bits";

export function renderTopic(topic: Topic | undefined, requestedId: string): HTMLElement {
  if (!topic) {
    return h(
      "div",
      { class: "page" },
      h("a", { class: "back", href: "/" }, "All topics"),
      h("div", { class: "empty" },
        h("h1", null, "Topic not on the list"),
        h("p", null, `Nothing in shopping.json uses the id “${requestedId}”.`),
      ),
    );
  }

  const anyVat = topic.options.some((option) => option.vatDeductible === true);
  const anyPeriod = topic.options.some((option) => option.pricePeriod);
  const links = topic.options.filter((option) => option.url.trim()).length;

  return h(
    "article",
    { class: "page topic" },
    h("a", { class: "back", href: "/" }, "All topics"),
    h("header", { class: "page-head" },
      h("p", { class: "eyebrow" }, `${topic.category} · ${formatDate(topic.firstDiscussed)}`),
      h("h1", null, topic.title),
      h("div", { class: "badge-row" },
        statusBadge(displayStatus(topic)),
        topic.tags.map((tag) => h("span", { class: "tag" }, tag)),
      ),
      continueButton(topic.id, topic.title),
    ),
    h("div", { class: "topic-layout" },
      panel("Summary", topic.summary ? h("p", { class: "prose" }, topic.summary) : h("p", { class: "muted" }, "No summary recorded.")),
      panel("Decision", topic.decision ? h("p", { class: "prose" }, topic.decision) : h("p", { class: "muted" }, "No decision recorded.")),
      panel(
        "Quotes",
        topic.quotes.length
          ? topic.quotes.map((quote) => h("blockquote", null, h("p", null, quote)))
          : h("p", { class: "muted" }, "No quote recorded."),
      ),
      panel(
        "Open next steps",
        topic.nextSteps.length
          ? h(
              "ol",
              { class: "steps" },
              topic.nextSteps.map((step) =>
                h("li", null, h("span", { class: "step-mark", "aria-hidden": "true" }), h("span", null, step)),
              ),
            )
          : h("p", { class: "muted" }, "No open steps."),
      ),
      panel(
        "Findings",
        topic.findings.length
          ? h(
              "ul",
              { class: "findings" },
              topic.findings.map((finding) => h("li", null, finding)),
            )
          : h("p", { class: "muted" }, "No findings recorded."),
      ),
      optionsPanel(topic, links, anyVat, anyPeriod),
    ),
    topic.sources.length
      ? h("p", { class: "sources" }, `Sources: ${topic.sources.join(" · ")}`)
      : null,
  );
}

function panel(title: string, ...body: Child[]): HTMLElement {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return h("section", { class: "panel", "data-panel": slug }, h("h2", null, title), body);
}

function optionsPanel(topic: Topic, links: number, anyVat: boolean, anyPeriod: boolean): HTMLElement {
  const body: (HTMLElement | string | null)[] = [];
  if (!topic.options.length) {
    body.push(h("p", { class: "muted" }, "No options recorded yet."));
  } else {
    body.push(
      h(
        "p",
        { class: "panel-note" },
        `${plural(topic.options.length, "option", "options")}, ${plural(links, "with a link", "with a link")}.`,
      ),
    );
    body.push(optionsTable(topic.options));
    body.push(
      h(
        "p",
        { class: "hint" },
        anyVat
          ? "Net is gross ÷ 1.23 and only shown where a company VAT invoice applies. Other rows stay blank on purpose."
          : "Net stays blank: none of these listings are marked as VAT-deductible.",
      ),
    );
    if (anyPeriod) {
      body.push(h("p", { class: "hint" }, "A /mo, /day, or /h price is rent, not a one-off purchase."));
    }
  }
  return panel("Options", body);
}

function optionsTable(options: Option[]): HTMLElement {
  const rows: HTMLElement[] = [];
  let lastKind: string | null = null;
  for (const option of options) {
    const kind = option.listingKind ?? null;
    if (kind && kind !== lastKind) {
      rows.push(
        h("tr", { class: "group" }, h("th", { colspan: "6", scope: "colgroup" }, kind === "rent" ? "Rent" : "For sale")),
      );
      lastKind = kind;
    }
    rows.push(optionRow(option));
  }

  return h(
    "div",
    { class: "table-scroll" },
    h(
      "table",
      { class: "options-table" },
      h("caption", { class: "sr-only" }, "Options"),
      h("thead", null,
        h("tr", null,
          h("th", { scope: "col" }, "Name"),
          h("th", { scope: "col" }, "Shop"),
          h("th", { class: "num", scope: "col" }, "Gross"),
          h("th", { class: "num", scope: "col" }, "Net"),
          h("th", { scope: "col" }, "Link"),
          h("th", { scope: "col" }, "Notes"),
        ),
      ),
      h("tbody", null, rows),
    ),
  );
}

function optionRow(option: Option): HTMLElement {
  return h(
    "tr",
    { class: option.isPick ? "is-pick" : undefined },
    h("td", { "data-label": "Name" },
      h("div", { class: "name" },
        option.isPick ? h("span", { class: "pick-tag" }, "Pick") : null,
        option.name,
      ),
    ),
    h("td", { "data-label": "Shop", class: "shop" }, option.shop.trim() ? option.shop : "—"),
    h("td", { "data-label": "Gross", class: "num" }, formatGross(option)),
    h("td", { "data-label": "Net", class: "num" }, formatNet(option)),
    h("td", { "data-label": "Link" }, linkButton(option)),
    h("td", { "data-label": "Notes", class: "notes" }, option.notes.trim() ? option.notes : "—"),
  );
}

