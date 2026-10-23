import { h } from "../dom";
import { formatDate, topicPath } from "../format";
import { decisionGroups, displayStatus } from "../model";
import type { Dataset } from "../types";
import { statusBadge } from "./bits";

export function renderDecisions(data: Dataset): HTMLElement {
  const groups = decisionGroups(data.topics);
  return h(
    "div",
    { class: "page" },
    h("header", { class: "page-head" },
      h("h1", null, "Decisions"),
      h(
        "p",
        { class: "lede" },
        "What was written down, newest day first. The italic line is his. The sentence under the title is the call from the notes.",
      ),
    ),
    h(
      "div",
      { class: "timeline" },
      groups.map((group) =>
        h(
          "section",
          { class: "day" },
          h("h2", null, formatDate(group.date)),
          h(
            "div",
            { class: "day-entries" },
            group.topics.map((topic) =>
              h(
                "a",
                { class: "entry", href: topicPath(topic.id) },
                h("div", { class: "entry-top" },
                  h("h3", null, topic.title),
                  statusBadge(displayStatus(topic)),
                ),
                topic.decision ? h("p", { class: "entry-decision" }, topic.decision) : null,
                topic.quotes[0] ? h("p", { class: "entry-quote" }, topic.quotes[0]) : null,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
