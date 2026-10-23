export type Child = Node | string | number | null | false | undefined | Child[];

export function h<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  props?: Record<string, string | null | undefined | false> | null,
  ...children: Child[]
): HTMLElementTagNameMap[T] {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else node.setAttribute(key, value);
    }
  }
  append(node, children);
  return node;
}

export function append(node: Node, children: Child[]): void {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      append(node, child);
      continue;
    }
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function svg(markup: string): SVGElement {
  const host = document.createElement("div");
  host.innerHTML = markup.trim();
  const el = host.querySelector("svg");
  if (!el) throw new Error("Icon markup is missing an svg element");
  return el;
}
