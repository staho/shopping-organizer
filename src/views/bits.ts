import { h } from "../dom";
import { externalIcon } from "../icons";
import { safeUrl, statusLabel, urlSourceLabel } from "../format";
import type { Option } from "../types";

export function statusBadge(status: string): HTMLElement {
  return h(
    "span",
    { class: "badge", "data-status": status },
    h("span", { class: "dot", "aria-hidden": "true" }),
    statusLabel(status),
  );
}

export function linkButton(option: Option): HTMLElement {
  const href = safeUrl(option.url);
  if (!href) return h("span", { class: "no-link" }, "No link");
  const source = urlSourceLabel(option.urlSource);
  const anchor = h(
    "a",
    {
      class: "btn-link",
      href,
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": `Open listing: ${option.name}`,
    },
    "Open",
    externalIcon(),
  );
  return h("div", { class: "link-cell" }, anchor, source ? h("span", { class: "url-src" }, source) : null);
}

export function linkify(text: string): Node[] {
  const re = /https?:\/\/[^\s)]+/g;
  const nodes: Node[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(document.createTextNode(text.slice(last, index)));
    const url = match[0];
    nodes.push(
      h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, url),
    );
    last = index + url.length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  if (!nodes.length) nodes.push(document.createTextNode(text));
  return nodes;
}
