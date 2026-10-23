import { svg } from "./dom";

export function sunIcon(): SVGElement {
  return svg(`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="12" cy="12" r="4"></circle>
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"></path>
  </svg>`);
}

export function moonIcon(): SVGElement {
  return svg(`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"></path>
  </svg>`);
}

export function externalIcon(): SVGElement {
  return svg(`<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 3.5H3.5v9h9V10"></path>
    <path d="M8.5 3.5H12.5V7.5"></path>
    <path d="M12.5 3.5 7 9"></path>
  </svg>`);
}
