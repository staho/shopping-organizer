# Kamil's list

Shopping organizer with a fictional sample list, so the site can be opened without Cloudflare Access. Each topic has a summary, quotes, a decision, options with prices and links, and the standing rules a recommendation should follow.

The site is a static Vite app. All of the notes live in one file, [`data/shopping.json`](data/shopping.json). Edit that file, then refresh (dev) or rebuild (deploy).

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Other commands:

```bash
npm run validate   # check shopping.json against the schema rules below
npm run build      # validate, typecheck, and write dist/
npm run preview    # serve dist/ on the same port
```

`npm run dev` reads `data/shopping.json` from disk on each refresh (`/shopping.json`). A production build copies that file into `dist/` as-is.

## Update the data

Edit `data/shopping.json` only. The file in git is sample data: shops, prices, quotes, and links are fictional, and every URL is on `example.com` or empty. Leave `url` as `""` when a row has no link. Set `priceNet` only when `vatDeductible` is `true`, and then it must be `priceGross / 1.23` rounded half-up to 0.01 PLN. Do not put a real personal list in this file unless the hostname is behind Cloudflare Access.

After editing:

```bash
npm run validate
```

With the dev server running, refresh the browser. For a deploy, run `npm run build` again.

`scripts/validate.mjs` checks the shape, the VAT rule, and a handful of anchored sample URLs (headphones, espresso, monitor, bookshelf speakers, and the north storage unit). If you deliberately remove one of those rows, delete its URL from the `anchors` list in that script too.

## Screens

- **Overview** — one card per topic: status, category, date, the pick and its price, and counts. Filter by status or category, search, and sort by date or pick price.
- **Topic** — summary, decision, quotes, findings, an options table, and open next steps. The pick row is highlighted. Net is shown only for VAT-deductible rows. A missing URL is the text “No link”, not a dead button.
- **Decisions** — the same topics as a log, newest day first.
- **Preferences** — the standing shopping rules, plus how prices and links were recorded.

The UI follows the system light/dark setting until you use the theme button, which stores the choice in this browser.

Postponed projects are stored as `"status": "dropped"` with `"statusDetail": "postponed"`. The app shows those as **Postponed**, separate from **Dropped**.

Prices use Polish grouping and a decimal comma: `1 369 zł`, `1 113,01 zł`. Rent is marked `/mo`, `/day`, or `/h`. The paper-cone driver is shown in euros.

## Schema

`data/shopping.json` is one object:

```json
{
  "meta": {},
  "preferences": [],
  "topics": []
}
```

### `meta`

| Field | Type | Meaning |
| --- | --- | --- |
| `title` | string | Dataset title |
| `generated` | string | ISO timestamp of the extract |
| `timezone` | string | `Europe/Warsaw` |
| `currencyDefault` | string | `PLN` |
| `vatRate` | number | `0.23` |
| `netPriceRule` | string | When a net price is allowed |
| `urlRule` | string | When a URL is allowed |
| `statusValues` | string[] | Allowed `topic.status` values |
| `sources` | object | Chat names to a short description |
| `supplemented` | string | Date the 23 Oct shop/garage supplement was merged |
| `supplement` | string | What that merge did |

`statusValues`: `considering`, `recommended pick`, `decided to buy`, `just looking`, `dropped`, `bought`, `in progress`.

### `preferences[]`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable slug |
| `rule` | string | The rule itself |
| `quote` | string, optional | His wording, when there is one |
| `source` | string | Where the rule was recorded |

### `topics[]`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | URL slug, lowercase letters, digits, hyphens |
| `title` | string | Card and page title |
| `category` | string | Filter group, free text |
| `status` | string | One of `meta.statusValues` |
| `statusDetail` | string or null | `postponed` when a dropped topic was only paused |
| `firstDiscussed` | string | `YYYY-MM-DD` |
| `summary` | string | What the question was |
| `decision` | string | The call that was written down |
| `quotes` | string[] | His words, verbatim |
| `findings` | string[] | Short factual notes |
| `tags` | string[] | Extra labels |
| `options` | object[] | Shops and listings |
| `nextSteps` | string[] | Still open. The app does not store checkmarks |
| `sources` | string[] | Which chat the topic came from |

### `options[]`

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Listing name. The same name can appear twice if the shop differs |
| `priceGross` | number or null | Sticker price. Null when it was never stated |
| `priceNet` | number or null | Company price. Null unless `vatDeductible` is true |
| `currency` | string | `PLN` or `EUR` |
| `shop` | string | Shop or listing site. `""` if unknown |
| `url` | string | Absolute `http(s)` URL, or `""` |
| `urlSource` | string or null | `sample` for the fictional links, or `transcript` / `research-cache` if you later record a real capture. Null when `url` is empty |
| `vatDeductible` | boolean or null | True only for a new item from an official or major shop that can issue a faktura VAT. False when it is known not to qualify (used, private, margin scheme). Null when it was not established |
| `notes` | string | Extra detail. May be empty |
| `isPick` | boolean | Highlight this row. A topic can have more than one pick |
| `pricePeriod` | `month`, `day`, `hour`, or omitted | Set for rent. Omit for a one-off purchase |
| `listingKind` | `rent`, `buy`, or omitted | Storage listings only. The topic page groups by this |

Example option:

```json
{
  "name": "Plainview 32 4K",
  "priceGross": 1369,
  "priceNet": 1113.01,
  "currency": "PLN",
  "shop": "Sample Displays",
  "url": "https://example.com/shop/plainview-32",
  "urlSource": "sample",
  "vatDeductible": true,
  "notes": "Monitor pick. Same price at a second sample shop.",
  "isPick": true
}
```

## Deploy to Cloudflare

This repo is ready to deploy as a static site and has not been deployed.

Build first. Wrangler publishes the `dist/` directory from [`wrangler.jsonc`](wrangler.jsonc) as a Workers static-assets site, with `not_found_handling: single-page-application` so `/topic/...`, `/decisions`, and `/preferences` resolve on refresh.

```bash
npm install
npm run build
npx wrangler login
npx wrangler deploy
```

`npx wrangler dev` (after a build) previews that same asset config locally.

### Cloudflare Pages

The build also writes `dist/_redirects` (`/* /index.html 200`). A Pages project can use build command `npm run build` and output directory `dist`.

Deploy at the root of the hostname. Asset paths are absolute.

### Privacy

This checkout is sample data: fictional shops, prices, and quotes, with links only on `example.com`. It has no passwords, tokens, or payment details. `noindex` in the HTML is not access control.

If you replace `data/shopping.json` with a real list, put the hostname behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/) (Zero Trust → Access → Applications) before anyone else can open it. Do not push any commit from before the sample-data replacement. Those commits still contain the personal extract.

## Data notes

The committed dataset is a sample, written because this environment is not logged into Wrangler and a public URL would have no access gate.

- Statuses in the sample: decided to buy, recommended pick, considering, just looking, in progress, postponed (`dropped` plus `statusDetail: postponed`), dropped, and bought.
- Storage listings are rent (month, day, or hour) or sale. They are private classifieds in the fiction, so there is no net price.
- The paper-cone driver is priced in euros, per piece.
- Some rows have an empty `url` and show “No link”. One mini-PC row has no price.
- The same product name can appear at two shops. Match on name and shop together.
- Net prices are `gross / 1.23`, half-up to 0.01 PLN, and only where `vatDeductible` is true.
