# Juniper

Applied Pay Senior Software Engineer technical challenge POC.

This project implements a configurable financing rules API in Node.js + TypeScript.

## Architecture Diagram

See docs/architecture.md.

## Techincal Documentation

Starting point of my development process. Breakdown feature into technical parts.

see docs/technical-design.dm

## What It Does

- Evaluates policy payment financing eligibility per partner
- Returns rule-based validation reasons when not financeable
- Returns installment schedule when financeable
- Supports partner-specific configurable rules and dynamic top-level request fields
- Logs response times in milliseconds to console
- Uses in-memory configuration only (no database, data resets on restart)

## Tech Stack

- Node.js
- TypeScript
- Fastify
- Zod

## Run Locally

1. Install dependencies

```bash
npm install
```

2. Start in dev mode

```bash
npm run dev
```

3. Build

```bash
npm run build
```

4. Run built app

```bash
npm run start
```

5. Run lint checks

```bash
npm run lint
```

Default server URL: http://localhost:3000

## Pre-commit Linting

- Husky is configured with a pre-commit hook.
- Every commit runs `npm run lint` and blocks the commit if lint fails.
- After pulling changes, run `npm install` to ensure hooks are installed via the prepare script.

## API Endpoints

- GET /health
- GET /v1/partners/:partnerId/schema
- GET /v1/partners/:partnerId/ruleset
- PUT /v1/partners/:partnerId/ruleset
- POST /v1/partners/:partnerId/financing-decisions

## Rule Model

Rules use one condition shape only:

```json
{
  "someField": {
    "command": "one of",
    "value": ["A", "B"]
  }
}
```

Supported commands:

- eq, neq, gt, gte, lt, lte, in, exists
- equals, greater than, less than, one of, and related aliases

Rule evaluation semantics:

- Every rule is required
- If a rule condition evaluates to false, that rule returns an error
- Rules are evaluated in configured order
- Error defaults are generated when rules are added (if user does not supply an error block)

## Decision Request Shape

Base fields:

- amount (number > 0)
- currency (string)
- policyType (string)
- paymentMethod (string)
- termMonths (optional positive integer)
- paymentFrequency (optional: MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL)

Partner-specific fields:

- Send custom partner fields directly at top level
- Example: inputAmountLimit, policyEndDate
- GET /v1/partners/:partnerId/schema returns ruleInputs so partners can see newly required fields

## Sample Decision Requests

Pass example:

```bash
curl -X POST http://localhost:3000/v1/partners/agency-a/financing-decisions \
  -H "content-type: application/json" \
  -d '{
    "amount": 90000,
    "currency": "USD",
    "policyType": "HOTEL",
    "paymentMethod": "GOOGLE_WALLET",
    "inputAmountLimit": 100000
  }'
```

Fail example (amount exceeds inputAmountLimit):

```bash
curl -X POST http://localhost:3000/v1/partners/agency-a/financing-decisions \
  -H "content-type: application/json" \
  -d '{
    "amount": 120000,
    "currency": "USD",
    "policyType": "HOTEL",
    "paymentMethod": "GOOGLE_WALLET",
    "inputAmountLimit": 100000
  }'
```

Expected behavior: financeable false with AMOUNT_CAP_EXCEEDED.

## Updating Rulesets

PUT /v1/partners/:partnerId/ruleset appends new rules to in-memory partner rules.

You can send compact rule input:

```json
{
  "partnerId": "agency-a",
  "rules": [
    {
      "field": "country",
      "command": "one of",
      "value": ["Canada", "United States"]
    }
  ]
}
```

The API normalizes compact input into full stored rule blocks (id, description, condition, error).

If a list-match rule is added (for example country one of [Canada, United States]),
the schema endpoint will include that field in ruleInputs with allowedValues so the
partner request can provide a matching value.

## Limits of Config-Only Rule Model

- New operator semantics may require code updates
- External dependency checks (credit, sanctions, etc.) require integration code
- Stateful rules across requests are out of scope without persistence



