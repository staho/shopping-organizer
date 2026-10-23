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

The site is a Worker in front of static assets. [`worker/index.ts`](worker/index.ts) runs on every request (`assets.run_worker_first`), then serves `dist/` through the `ASSETS` binding. `not_found_handling` is `single-page-application`, so `/topic/...`, `/decisions`, and `/preferences` still resolve.

`workers_dev` and `preview_urls` are both `false` on the top-level config, on `env.production`, and on `env.test`. There is no `*.workers.dev` URL and no version preview URL unless you turn those flags back on. A deploy needs a route or custom domain.

Nothing in this repo has been deployed.

`npm run build` validates the data, typechecks, runs the auth tests, and writes `dist/`.

### Production and test

The live site is Access only. The password gate exists only for a separate test Worker.

| Command | Config | `ENVIRONMENT` | Who can open it |
| --- | --- | --- | --- |
| `npx wrangler deploy` | top level | `production` | Cloudflare Access. A password is ignored. |
| `npx wrangler deploy --env production` | `env.production` | `production` | Same live script, `kamil-shopping-organizer`. |
| `npx wrangler deploy --env test` | `env.test` | `test` | HTTP Basic on `kamil-shopping-organizer-test`. |

`wrangler deploy` with no `--env` uses the top-level config. Wrangler warns when several environments exist and the flag is omitted. The top-level `ENVIRONMENT` is `production`, so that command stays fail-closed. Pass `--env production` for the live script. `env.production.name` is `kamil-shopping-organizer`, so that deploy publishes the same script. Without the name override Wrangler would publish `kamil-shopping-organizer-production`.

`vars` are not inherited. Put `TEAM_DOMAIN` and `POLICY_AUD` in the top-level `vars` and again in `env.production.vars`. Put the live route in both places too. Leave them off `env.test`.

```bash
npm install
npm run build
npx wrangler login
npx wrangler deploy --env production
```

### Local dev

`npm run dev` is Vite on `127.0.0.1:43123`. It does not run the Worker, so there is no Access login and no Basic prompt.

`npx wrangler dev` (after a build) runs the top-level Worker. That is production mode. Until `TEAM_DOMAIN` and `POLICY_AUD` are set, every request gets **500**. It does not ask for a password.

`npx wrangler dev --env test` is the password gate. Put the two secrets in `.dev.vars.test` (gitignored):

```
BASIC_AUTH_USER=reader
BASIC_AUTH_PASS=choose-a-password
```

If both are unset, `wrangler dev --env test` warns and the Worker serves the files so you can click around. `wrangler deploy --env test` refuses to publish until both secrets exist (`secrets.required`). Do not point that script at the live hostname.

### Gate

**Production** (`ENVIRONMENT` unset, `production`, or anything other than exactly `test`):

- Both `TEAM_DOMAIN` and `POLICY_AUD` must be set. If either is missing or blank, the Worker returns **500** `Access is not configured`. `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` are ignored, including when the password is correct. The response has no `WWW-Authenticate` header.
- When both Access vars are set, the Worker requires `Cf-Access-Jwt-Assertion` and checks it against `TEAM_DOMAIN/cdn-cgi/access/certs` (issuer and audience). Missing or invalid tokens get **403**. A trailing slash on `TEAM_DOMAIN` is ignored.

**Test** (`ENVIRONMENT` exactly `test`):

- Both Basic secrets set: SHA-256, then a constant-time compare. Failure is **401** with `WWW-Authenticate: Basic`. Both the user and the password are compared.
- Only one secret set: **401**.
- Neither secret set: the Worker serves the site. That is only for local `wrangler dev --env test`. Access vars are not a substitute for the password in this mode.

Access values are Worker vars, not secrets. Uncomment them in both `vars` blocks in [`wrangler.jsonc`](wrangler.jsonc) so the next deploy keeps them. The AUD tag identifies the Access application. The team domain is public.

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "TEAM_DOMAIN": "https://<team-name>.cloudflareaccess.com",
  "POLICY_AUD": "<application-audience-tag>"
}
```

Basic credentials are secrets on the **test** environment only. Wrangler prompts and does not store them in the repo:

```bash
npx wrangler secret put BASIC_AUTH_USER --env test
npx wrangler secret put BASIC_AUTH_PASS --env test
```

Do not set those secrets on the production script. The production Worker never reads them.

### Cloudflare Access

Access free covers a small number of users. You need a hostname on a zone in the same Cloudflare account (a Worker custom domain). The steps below match the Zero Trust dashboard as of October 2026.

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Zero Trust**. The first visit asks you to choose a team name. That name is the team domain: `https://<team-name>.cloudflareaccess.com`. It is also on **Zero Trust → Settings → Custom pages** (the team domain is shown in the dashboard URL and under the team name). Copy it into `TEAM_DOMAIN`, including `https://` and without a path.
2. **Zero Trust → Integrations → Identity providers**. **One-time PIN** is built in. Leave it enabled. Anyone who is not on the Allow policy does not get a code that works.
3. **Zero Trust → Access controls → Applications → Create new application**.
4. Choose **Self-hosted**, then **Add public hostname**. Pick the zone and the hostname that will serve this Worker (the same name you put in `routes`). Do not add the `workers.dev` host. That route is disabled in Wrangler.
5. Under **Access policies**, create a policy:
   - Policy name: `Allow me`
   - Action: **Allow**
   - Include rule: **Emails**, and enter your email address
6. Under identity providers for this application, enable **One-time PIN**. You can leave other providers off. Session duration can stay at the default (24 hours) unless you want a shorter one.
7. Select **Create**.
8. Open the application again (**Configure → Additional settings**) and copy **Application Audience (AUD) Tag** into `POLICY_AUD`. The tag stays the same until you delete the application.
9. Attach that hostname to the Worker: uncomment `routes` with `"custom_domain": true` in the top-level config and under `env.production`, fill `TEAM_DOMAIN` and `POLICY_AUD` in both `vars` blocks, then `npx wrangler deploy --env production`. In the dashboard this is **Workers & Pages → kamil-shopping-organizer → Domains & routes → Add → Custom domain**.
10. Open the hostname in a private window. Access should ask for your email, send a PIN, and only then load the list. A request without the `Cf-Access-Jwt-Assertion` header receives 403 from the Worker even if Access is later bypassed. Until the two Access vars are present, the Worker returns 500 and does not offer a password.

One-time PIN login: enter the allowed email, choose **Send login code**, paste the code from the mailbox. The message expires after about 10 minutes. The login page says a code was sent even when the email is not on the policy.

Docs: [self-hosted application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [validate the JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [one-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

### Cloudflare Pages

The build also writes `dist/_redirects` (`/* /index.html 200`). Pages does not run `worker/index.ts`, so it would publish the files with no gate. Use the Worker deploy above.

### Privacy

This checkout is sample data: fictional shops, prices, and quotes, with links only on `example.com`. It has no passwords, tokens, or payment details. `noindex` in the HTML is not access control.

If you replace `data/shopping.json` with a real list, deploy with `--env production` only after `TEAM_DOMAIN` and `POLICY_AUD` are set and the hostname is the Access application. The production Worker does not fall back to a password. Do not push any commit from before the sample-data replacement. Those commits still contain the personal extract. The public GitHub history is the sample only.

## Data notes

The committed dataset is a sample, written because this environment is not logged into Wrangler and a public URL would have no access gate.

- Statuses in the sample: decided to buy, recommended pick, considering, just looking, in progress, postponed (`dropped` plus `statusDetail: postponed`), dropped, and bought.
- Storage listings are rent (month, day, or hour) or sale. They are private classifieds in the fiction, so there is no net price.
- The paper-cone driver is priced in euros, per piece.
- Some rows have an empty `url` and show “No link”. One mini-PC row has no price.
- The same product name can appear at two shops. Match on name and shop together.
- Net prices are `gross / 1.23`, half-up to 0.01 PLN, and only where `vatDeductible` is true.
