import { h } from "./dom";
import { moonIcon, sunIcon } from "./icons";
import { formatDate } from "./format";
import type { Dataset } from "./types";

export type RouteName = "overview" | "decisions" | "preferences" | "topic" | "not-found";

const THEME_KEY = "kamil-list-theme";

export function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function paintTheme(theme: "light" | "dark", persist = false): void {
  document.documentElement.dataset.theme = theme;
  if (persist) localStorage.setItem(THEME_KEY, theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#12110f" : "#f3efe6");
}

export function renderShell(
  active: RouteName,
  main: HTMLElement,
  data: Dataset | null,
  onTheme: () => void,
  stored = false,
): HTMLElement {
  const theme = currentTheme();
  const toDark = theme === "light";
  const themeButton = h(
    "button",
    {
      class: "theme-btn",
      type: "button",
      "aria-label": toDark ? "Switch to dark theme" : "Switch to light theme",
    },
    toDark ? moonIcon() : sunIcon(),
    h("span", null, toDark ? "Dark" : "Light"),
  ) as HTMLButtonElement;
  themeButton.addEventListener("click", onTheme);

  const compiled = data ? formatDate(stored && data.meta.updatedAt ? data.meta.updatedAt : data.meta.generated) : null;
  const zone = data?.meta.timezone;

  return h(
    "div",
    { class: "app" },
    h("a", { class: "skip", href: "#main" }, "Skip to content"),
    h(
      "div",
      { class: "topbar" },
      h(
        "div",
        { class: "wrap topbar-inner" },
        h(
          "a",
          { class: "brand", href: "/" },
          h("span", { class: "mark", "aria-hidden": "true" }, "K"),
          h("span", null,
            h("span", { class: "brand-name" }, "Kamil's list"),
            h("span", { class: "brand-sub" }, stored ? "Shopping notes" : "Sample shopping notes"),
          ),
        ),
        h(
          "nav",
          { "aria-label": "Sections" },
          navLink("Overview", "/", active === "overview"),
          navLink("Decisions", "/decisions", active === "decisions"),
          navLink("Preferences", "/preferences", active === "preferences"),
        ),
        themeButton,
      ),
    ),
    h("main", { id: "main", class: "wrap", tabindex: "-1" }, main),
    h(
      "footer",
      { class: "site-foot" },
      h(
        "div",
        { class: "wrap" },
        h(
          "p",
          null,
          stored
            ? "Stored list. Not a shop."
            : "Sample notes. Not a shop, and not a real purchase list.",
        ),
        h(
          "p",
          null,
          stored
            ? `Updated ${compiled ?? "recently"}${zone ? `, ${zone}` : ""}.`
            : compiled
              ? `Compiled ${compiled}${zone ? `, ${zone}` : ""}. The sample file is for local development.`
              : "The sample file is for local development.",
        ),
      ),
    ),
  );
}

function navLink(label: string, href: string, current: boolean): HTMLAnchorElement {
  return h("a", { href, ...(current ? { "aria-current": "page" } : {}) }, label) as HTMLAnchorElement;
}

export function messagePage(title: string, body: string): HTMLElement {
  return h("div", { class: "page" }, h("div", { class: "empty" }, h("h1", null, title), h("p", null, body)));
}
