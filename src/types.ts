export interface Option {
  name: string;
  priceGross: number | null;
  priceNet: number | null;
  currency: string;
  shop: string;
  url: string;
  urlSource: string | null;
  vatDeductible: boolean | null;
  notes: string;
  isPick: boolean;
  pricePeriod?: "month" | "day" | "hour" | null;
  listingKind?: "rent" | "buy" | null;
}

export interface Topic {
  id: string;
  title: string;
  category: string;
  status: string;
  statusDetail: string | null;
  firstDiscussed: string;
  summary: string;
  decision: string;
  findings: string[];
  quotes: string[];
  tags: string[];
  options: Option[];
  nextSteps: string[];
  sources: string[];
}

export interface Preference {
  id: string;
  rule: string;
  quote?: string;
  source: string;
}

export interface DatasetMeta {
  title: string;
  generated: string;
  timezone: string;
  currencyDefault: string;
  vatRate: number;
  netPriceRule: string;
  urlRule: string;
  statusValues: string[];
  sources: Record<string, string>;
  supplemented?: string;
  supplement?: string;
  updatedAt?: string;
}

export interface Dataset {
  meta: DatasetMeta;
  preferences: Preference[];
  topics: Topic[];
}
