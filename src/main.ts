import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/500-italic.css";
import "./styles.css";

import { installContinueDialog } from "./continue";
import { currentTheme, messagePage, paintTheme, renderShell, type RouteName } from "./shell";
import { normalize } from "./model";
import type { Dataset } from "./types";
import { renderOverview } from "./views/overview";
import { renderTopic } from "./views/topic";
import { renderDecisions } from "./views/decisions";
import { renderPreferences } from "./views/preferences";

type Route =
  | { name: "overview" }
  | { name: "decisions" }
  | { name: "preferences" }
  | { name: "topic"; id: string }
  | { name: "not-found" };

let dataset: Dataset | null = null;
let lastPath = "";

function parseRoute(pathname: string): Route {
  let parts: string[];
  try {
    parts = pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return { name: "not-found" };
  }
  if (parts.length === 0) return { name: "overview" };
  if (parts[0] === "decisions" && parts.length === 1) return { name: "decisions" };
  if (parts[0] === "preferences" && parts.length === 1) return { name: "preferences" };
  if (parts[0] === "topic" && parts.length === 2 && parts[1]) return { name: "topic", id: parts[1] };
  return { name: "not-found" };
}

function routeName(route: Route): RouteName {
  return route.name;
}

function pageTitle(route: Route, data: Dataset | null): string {
  if (!data) return "Kamil's list";
  if (route.name === "overview") return "Overview · Kamil's list";
  if (route.name === "decisions") return "Decisions · Kamil's list";
  if (route.name === "preferences") return "Preferences · Kamil's list";
  if (route.name === "topic") {
    const topic = data.topics.find((item) => item.id === route.id);
    return topic ? `${topic.title} · Kamil's list` : "Not found · Kamil's list";
  }
  return "Not found · Kamil's list";
}

function renderPage(route: Route, data: Dataset): HTMLElement {
  const params = new URLSearchParams(location.search);
  if (route.name === "overview") {
    return renderOverview(data, params, (next) => {
      const search = next.toString();
      history.replaceState(null, "", search ? `/?${search}` : "/");
      render();
    });
  }
  if (route.name === "decisions") return renderDecisions(data);
  if (route.name === "preferences") return renderPreferences(data);
  if (route.name === "topic") return renderTopic(data.topics.find((topic) => topic.id === route.id), route.id);
  return messagePage("Page not on the list", "That address doesn’t match Overview, a topic, Decisions, or Preferences.");
}

function render(): void {
  const root = document.getElementById("app");
  if (!root) return;
  const active = document.activeElement;
  const caret =
    active instanceof HTMLInputElement && active.id === "q"
      ? { start: active.selectionStart ?? 0, end: active.selectionEnd ?? 0 }
      : null;
  const pathChanged = location.pathname !== lastPath;
  lastPath = location.pathname;
  const route = parseRoute(location.pathname);
  document.title = pageTitle(route, dataset);

  let main: HTMLElement;
  if (!dataset) {
    main = messagePage("The list didn’t load", "shopping.json should be served from the site root. Check data/shopping.json and refresh.");
  } else {
    main = renderPage(route, dataset);
  }

  root.replaceChildren(
    renderShell(routeName(route), main, dataset, () => {
      paintTheme(currentTheme() === "dark" ? "light" : "dark", true);
      render();
    }),
  );

  if (caret) {
    const input = document.getElementById("q");
    if (input instanceof HTMLInputElement) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(caret.start, caret.end);
    }
  } else if (pathChanged) {
    window.scrollTo(0, 0);
  }
}

function onClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element | null)?.closest("a");
  if (!anchor) return;
  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#")) return;
  if (anchor.target && anchor.target !== "_self") return;
  const url = new URL(anchor.href, location.origin);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  if (url.pathname === location.pathname && url.search === location.search) {
    render();
    return;
  }
  history.pushState(null, "", `${url.pathname}${url.search}`);
  render();
}

async function boot(): Promise<void> {
  installContinueDialog();
  document.addEventListener("click", onClick);
  window.addEventListener("popstate", () => render());
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", (event) => {
    if (localStorage.getItem("kamil-list-theme")) return;
    paintTheme(event.matches ? "dark" : "light");
    render();
  });

  try {
    const response = await fetch("/shopping.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    dataset = normalize(await response.json());
  } catch (error) {
    console.error(error);
    dataset = null;
  }
  render();
}

void boot();
