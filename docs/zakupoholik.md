# Zakupoholik write API

The shopping list lives in Workers KV. This page describes how the bot updates it. Examples use fictional data. Do not put a real list in git, Actions logs, or the built site.

The hostname is behind Cloudflare Access. Browser pages and `GET /api/data` still require Kamil's email login. A service token is not accepted for those reads.

Writes need both of these, on every call:

- Access service token headers `CF-Access-Client-Id` and `CF-Access-Client-Secret`
- `Authorization: Bearer <ORGANIZER_UPDATE_KEY>`

`ORGANIZER_UPDATE_KEY` is a GitHub Actions secret. The deploy uploads it to the Worker only when it is set. Until then, writes return `503 not configured`. The service token is named `Zakupoholik`. Access applies that token to the hostname, and the Worker accepts it only on the write routes below. `GET /api/data` and the UI still require the email login.

If the deploy log says the service token was created, its client secret was not stored. Roll the token in Zero Trust (**Access controls → Service credentials → Service Tokens**) and copy the new client id and client secret. If the log says the token list returned HTTP 403, add **Access: Service Tokens Edit** to `CLOUDFLARE_API_TOKEN` and re-run Deploy, or create the token in that same dashboard page and re-run so the Service Auth policy can attach to it.

## Replace the whole list

`PUT /api/data`

The body is the dataset: `meta`, `preferences`, and `topics`, in the same shape as `data/shopping.json`. The Worker sets `meta.updatedAt`. A successful response is small:

```json
{ "ok": true, "updatedAt": "2026-10-24T13:00:00.000Z", "topics": 1 }
```

```bash
curl -sS -X PUT "https://shopping-organizer.staho.dev/api/data" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ORGANIZER_UPDATE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @dataset.json
```

`dataset.json` for a dry run:

```json
{
  "meta": {
    "title": "Fictional list",
    "generated": "2026-10-24",
    "timezone": "Europe/Warsaw",
    "currencyDefault": "PLN",
    "vatRate": 0.23,
    "netPriceRule": "gross / 1.23 when VAT is deductible",
    "urlRule": "absolute http(s) only",
    "statusValues": ["considering", "decided to buy", "dropped"],
    "sources": { "chat": "conversation" }
  },
  "preferences": [
    { "id": "quiet", "rule": "Prefer quiet options", "source": "chat" }
  ],
  "topics": [
    {
      "id": "studio-headphones",
      "title": "Closed studio headphones",
      "category": "Audio",
      "status": "considering",
      "statusDetail": null,
      "firstDiscussed": "2026-10-01",
      "summary": "A fictional pair for the example.",
      "decision": "Still looking.",
      "findings": [],
      "quotes": [],
      "tags": ["audio"],
      "options": [],
      "nextSteps": [],
      "sources": []
    }
  ]
}
```

## Upsert one topic

`PUT /api/topics/<id>`

The path id and `topic.id` must match. The topic is inserted or replaced. The rest of the stored list is kept. This returns 409 until `PUT /api/data` has stored a dataset.

```bash
curl -sS -X PUT "https://shopping-organizer.staho.dev/api/topics/studio-headphones" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ORGANIZER_UPDATE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @topic.json
```

Success:

```json
{ "ok": true, "updatedAt": "2026-10-24T13:05:00.000Z", "topicId": "studio-headphones" }
```

## Delete one topic

`DELETE /api/topics/<id>`

```bash
curl -sS -X DELETE "https://shopping-organizer.staho.dev/api/topics/studio-headphones" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ORGANIZER_UPDATE_KEY"
```

Unknown ids return 404. A missing dataset returns 409.

## Read the list

`GET /api/data` is for the signed-in browser. It returns the stored JSON, or 404 `{"error":"No dataset stored"}` when KV is empty. The bot does not need this route to push an update.
