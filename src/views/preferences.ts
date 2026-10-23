import { h } from "../dom";
import type { Dataset } from "../types";
import { linkify } from "./bits";

export function renderPreferences(data: Dataset): HTMLElement {
  const vatPercent = Math.round(data.meta.vatRate * 100);
  return h(
    "div",
    { class: "page" },
    h("header", { class: "page-head" },
      h("h1", null, "Preferences"),
      h(
        "p",
        { class: "lede" },
        `${data.preferences.length} standing rules. A recommendation should follow these before the option prices.`,
      ),
    ),
    h(
      "ol",
      { class: "rules" },
      data.preferences.map((preference, index) =>
        h(
          "li",
          { class: "rule", id: preference.id },
          h("span", { class: "rule-no" }, String(index + 1).padStart(2, "0")),
          h(
            "div",
            null,
            h("div", { class: "rule-id" }, preference.id),
            h("p", { class: "rule-text" }, preference.rule),
            preference.quote ? h("blockquote", null, h("p", null, preference.quote)) : null,
            h("p", { class: "rule-source" }, preference.source),
          ),
        ),
      ),
    ),
    h(
      "section",
      { class: "panel method" },
      h("h2", null, "How prices and links were recorded"),
      h("p", null, data.meta.netPriceRule),
      h("p", null, `VAT rate used when a net price is filled in: ${vatPercent}%.`),
      h("p", null, data.meta.urlRule),
      data.meta.supplement ? h("p", null, data.meta.supplement) : null,
    ),
    h(
      "section",
      { class: "panel method" },
      h("h2", null, "Where the notes came from"),
      h(
        "ul",
        { class: "source-list" },
        Object.entries(data.meta.sources).map(([name, detail]) =>
          h("li", null, h("strong", null, name), " — ", ...linkify(detail)),
        ),
      ),
    ),
  );
}
