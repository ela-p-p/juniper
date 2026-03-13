# Juniper API Reference

## Base URL

- Local: http://localhost:3000

## Conventions

- Content type: application/json
- Authentication: none in this POC
- Partner configuration is in-memory and resets on restart

## Endpoints

### GET /health

Purpose:
- Service liveness check.

Response 200:

```json
{
  "status": "ok",
  "service": "juniper"
}
```

### GET /v1/partners/:partnerId/schema

Purpose:
- Returns request defaults, base request fields, and rule-derived inputs for the partner.

Path params:
- partnerId: string

Response 200 example:

```json
{
  "partnerId": "agency-a",
  "defaults": {
    "termMonths": 12,
    "paymentFrequency": "MONTHLY"
  },
  "baseRequestFields": {
    "amount": "number > 0",
    "currency": "string",
    "policyType": "string",
    "paymentMethod": "string",
    "termMonths": "number (optional)",
    "paymentFrequency": "MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL (optional)",
    "additionalFields": "any additional top-level partner fields (optional)"
  },
  "ruleInputs": [
    {
      "field": "paymentMethod",
      "command": "one of",
      "allowedValues": ["GOOGLE_WALLET", "CREDIT_CARD", "ACH"]
    },
    {
      "field": "policyType",
      "command": "one of",
      "allowedValues": ["HOTEL", "AUTO", "HOME"]
    },
    {
      "field": "amount",
      "command": "less than or equal"
    }
  ]
}
```

Response 404:

```json
{
  "message": "Unknown partnerId"
}
```

### GET /v1/partners/:partnerId/ruleset

Purpose:
- Returns the active in-memory ruleset for a partner.

Path params:
- partnerId: string

Response 200 example:

```json
{
  "partnerId": "agency-a",
  "name": "Agency A",
  "defaults": {
    "termMonths": 12,
    "paymentFrequency": "MONTHLY"
  },
  "rules": [
    {
      "id": "require-payment-method-allowed-list",
      "description": "Payment method must be one of the allowed methods",
      "condition": {
        "paymentMethod": {
          "command": "one of",
          "value": ["GOOGLE_WALLET", "CREDIT_CARD", "ACH"]
        }
      },
      "error": {
        "code": "PAYMENT_METHOD_NOT_ALLOWED",
        "message": "Payment method is not allowed",
        "field": "paymentMethod",
        "expectedCondition": "paymentMethod one of [GOOGLE_WALLET, CREDIT_CARD, ACH]"
      }
    }
  ]
}
```

Response 404:

```json
{
  "message": "Unknown partnerId"
}
```

### PUT /v1/partners/:partnerId/ruleset

Purpose:
- Appends new rules to the in-memory ruleset for the specified partner.

Path params:
- partnerId: string

Request body shape:

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

Supported incoming rule formats:
- Full form with condition
- Compact form with field + command + value
- Generic condition map form

Example full form:

```json
{
  "id": "country-check",
  "description": "Country must be allowed",
  "condition": {
    "country": {
      "command": "one of",
      "value": ["Canada", "United States"]
    }
  },
  "error": {
    "code": "COUNTRY_NOT_ALLOWED",
    "message": "Country is not allowed",
    "field": "country",
    "expectedCondition": "country one of [Canada, United States]"
  }
}
```

Response 200:

```json
{
  "message": "Rules appended in-memory",
  "partnerId": "agency-a",
  "totalRules": 4,
  "appendedRules": 1
}
```

Response 400 examples:

```json
{
  "message": "payload.partnerId must match :partnerId"
}
```

```json
{
  "message": "Invalid ruleset payload",
  "errors": [
    {
      "path": "rules.0.field",
      "message": "Invalid input"
    }
  ]
}
```

```json
{
  "message": "Invalid ruleset commands",
  "errors": [
    {
      "path": "rules[0].country.command",
      "message": "Unsupported command. Use eq/neq/gt/gte/lt/lte/in/exists or aliases like equals, greater than, one of"
    }
  ]
}
```

Response 404:

```json
{
  "message": "Unknown partnerId"
}
```

### POST /v1/partners/:partnerId/financing-decisions

Purpose:
- Evaluates request data against partner rules and returns financeable result.

Path params:
- partnerId: string

Required request body fields:
- amount: number > 0
- currency: string
- policyType: string
- paymentMethod: string

Optional request body fields:
- termMonths: positive integer
- paymentFrequency: MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL
- Additional top-level partner fields (for example inputAmountLimit)

Request example:

```json
{
  "amount": 90000,
  "currency": "USD",
  "policyType": "HOTEL",
  "paymentMethod": "GOOGLE_WALLET",
  "inputAmountLimit": 100000
}
```

Response 200 (financeable true) example:

```json
{
  "decisionId": "56d1e3d5-bf91-45ea-8eea-b3d29de6f8bc",
  "partnerId": "agency-a",
  "financeable": true,
  "summary": {
    "amountFinanced": 90000,
    "currency": "USD",
    "termMonths": 12,
    "paymentFrequency": "MONTHLY",
    "installmentCount": 12,
    "installmentAmount": 7500
  },
  "installments": [
    {
      "dueNumber": 1,
      "dueAmount": 7500,
      "dueEveryMonths": 1
    }
  ],
  "errors": [],
  "timingMs": {
    "total": 1.23,
    "ruleEvaluation": 0.12,
    "installmentCalculation": 0.04
  }
}
```

Response 200 (financeable false) example:

```json
{
  "decisionId": "3e90240b-30f7-472a-b2f8-6f44e5c1d452",
  "partnerId": "agency-a",
  "financeable": false,
  "errors": [
    {
      "code": "AMOUNT_CAP_EXCEEDED",
      "message": "Amount exceeds partner cap",
      "field": "amount",
      "actualValue": 120000,
      "expectedCondition": "amount <= inputAmountLimit"
    }
  ],
  "timingMs": {
    "total": 0.91,
    "ruleEvaluation": 0.08,
    "installmentCalculation": 0
  }
}
```

Response 400 validation example:

```json
{
  "partnerId": "agency-a",
  "financeable": false,
  "errors": [
    {
      "code": "INVALID_REQUEST",
      "message": "Expected number, received string",
      "field": "amount"
    }
  ]
}
```

Response 404:

```json
{
  "message": "Unknown partnerId"
}
```
