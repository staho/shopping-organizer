import type { Option } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const STATUS_ORDER = [
  "decided to buy",
  "recommended pick",
  "considering",
  "just looking",
  "in progress",
  "postponed",
  "dropped",
  "bought",
] as const;

const STATUS_LABELS: Record<string, string> = {
  "decided to buy": "Decided to buy",
  "recommended pick": "Recommended pick",
  considering: "Considering",
  "just looking": "Just looking",
  "in progress": "In progress",
  postponed: "Postponed",
  dropped: "Dropped",
  bought: "Bought",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatDate(iso: string): string {
  const day = iso.slice(0, 10);
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return `${date} ${MONTHS[month - 1]} ${year}`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function formatAmount(amount: number): string {
  const negative = amount < 0;
  const cents = Math.round((Math.abs(amount) + Number.EPSILON) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const body = frac === 0 ? grouped : `${grouped},${frac.toString().padStart(2, "0")}`;
  return negative ? `−${body}` : body;
}

function currencyUnit(currency: string | null | undefined): string {
  if (!currency || currency === "PLN") return "zł";
  if (currency === "EUR") return "€";
  return currency;
}

function periodSuffix(period: string | null | undefined): string {
  if (period === "month") return "/mo";
  if (period === "day") return "/day";
  if (period === "hour") return "/h";
  return "";
}

export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
  period?: string | null,
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return `${formatAmount(amount)}\u00a0${currencyUnit(currency)}${periodSuffix(period)}`;
}

export function formatGross(option: Option): string {
  if (option.priceGross == null) return "—";
  return formatMoney(option.priceGross, option.currency, option.pricePeriod);
}

export function formatNet(option: Option): string {
  if (option.vatDeductible !== true || option.priceNet == null) return "—";
  return formatMoney(option.priceNet, option.currency, option.pricePeriod);
}

export function formatPickPrice(option: Option): string {
  if (option.priceGross != null) return formatGross(option);
  if (option.vatDeductible === true && option.priceNet != null) {
    return `${formatNet(option)} net`;
  }
  return "—";
}

export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function urlSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source === "transcript") return "From chat";
  if (source === "research-cache") return "Research notes";
  return source;
}

export function topicPath(id: string): string {
  return `/topic/${encodeURIComponent(id)}`;
}
