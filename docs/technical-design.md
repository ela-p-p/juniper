# Juniper Technical Design (POC)

## 1. Purpose

This document describes the technical design of the Juniper proof of concept, based on the Applied Pay take-home assignment.

The goal of this POC is to provide partner-configurable financing rules over REST APIs, without requiring code changes for most rule additions.

## 2. Problem Summary

Partners need to determine whether an insurance-related payment is financeable.

Given request data (amount, policy/payment fields, and partner-specific fields), the API must:

- Evaluate business rules for a specific partner
- Return financeable false with rule errors when validation fails
- Return financing summary and installment schedule when validation passes

## 3. Scope and Non-Goals

### In scope

- REST APIs for schema, ruleset retrieval/update, and financing decision
- In-memory partner config and rules
- Config-driven rule behavior per partner
- Runtime performance instrumentation (milliseconds)

### Out of scope

- Database persistence
- Cross-request stateful logic
- External integrations (credit, sanctions, fraud, etc.)
- Authentication and authorization

## 4. Design Assumptions

- If termMonths is missing, default term is 12 months.
- If paymentFrequency is missing, default is MONTHLY.
- Partner-specific fields are sent as top-level JSON properties in the decision request.
- Rules are required checks. If any rule condition evaluates to false, financeable is false.
- Partner updates to mandatory fields do not require backward compatibility.

## 5. High-Level Architecture

Architecture diagram is in [docs/architecture.md](docs/architecture.md).

Core components:

- Service built using Fastify REST API
- Request validator (Zod) for all endpoints
    - valid: go to Rule engine
    - invalid: return schema error
- Rule engine:
    - evaluate new rules by normalizing and validating 
        - valid: append new rules
        - invalid: return schema error
    - get financing eligibility 
        - valid: installment calculator
        - invalid: return failed ruleset error
- In-memory partner config registry
- Timing instrumentation in request lifecycle and decision pipeline

## 6. Data Model

Main types live in [src/types.ts](src/types.ts).

### FinancingRequest

Base fields:

- amount: number
- currency: string
- policyType: string
- paymentMethod: string
- termMonths?: number
- paymentFrequency?: MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL

Dynamic fields:

- Allowed at top-level via index signature
- Example: inputAmountLimit, policyEndDate

### BusinessRule

- id: string
- description: string
- condition: GenericRuleCondition
- error: DecisionError

### GenericRuleCondition

Single supported condition shape:

- Record from field name to expression object
- Expression object: command + optional value

Example:

```json
{
  "paymentMethod": {
    "command": "one of",
    "value": ["GOOGLE_WALLET", "CREDIT_CARD", "ACH"]
  }
}
```

## 7. Rule Engine Design

Implementation: [src/engine/evaluateRules.ts](src/engine/evaluateRules.ts)

### Rule semantics

- Every rule is required.
- Rule passes when condition evaluates true.
- Rule fails when condition evaluates false.
- Each failed rule contributes one DecisionError to response.

### Condition evaluation

- Supported commands map to operators via alias normalization.
- Supported operator set: eq, neq, gt, gte, lt, lte, in, exists.
- Aliases are supported (for example equals, one of, greater than).
- gt/gte/lt/lte are numeric-only comparisons.

### Value resolution

- Literal value comparisons are supported.
- Fact references are supported in rule value:

```json
{ "fact": "inputAmountLimit" }
```

- Compatibility alias: if condition path starts with attributes., engine resolves the same field without attributes. prefix.

## 8. Ruleset Update Flow

Implementation: [src/routes/partnerRoutes.ts](src/routes/partnerRoutes.ts)

Endpoint:

- PUT /v1/partners/:partnerId/ruleset

Behavior:

1. Validate path params.
2. Validate payload shape with Zod.
3. Ensure payload.partnerId matches route partnerId.
4. Normalize incoming rules to full rule blocks.
5. Validate rule commands and condition shape.
6. Generate default error block when missing.
7. Append normalized rules to in-memory partner rules.

### Supported incoming rule formats

- Full form with condition
- Compact form with field + command + value
- Generic command map form

### Normalized rule guarantees

After ingestion, every stored rule has:

- id
- description
- condition
- error

This allows financing evaluation to be simple and deterministic.

## 9. Financing Decision Flow

Implementation: [src/engine/buildDecision.ts](src/engine/buildDecision.ts)

1. Start total timer.
2. Apply default termMonths and paymentFrequency from partner defaults when missing.
3. Validate term/frequency divisibility (for example 12 months with quarterly is valid; 10 months with quarterly is invalid).
4. Evaluate rules and collect errors.
5. If any errors exist, return financeable false with timing.
6. If no errors, calculate installments and return financeable true with summary + schedule.

Installment logic implementation:

- [src/engine/installments.ts](src/engine/installments.ts)

Installment rounding behavior:

- Uses two-decimal rounding
- Last installment adjusts to preserve total principal

## 10. Request Validation Strategy

Implementation: [src/engine/validateRequest.ts](src/engine/validateRequest.ts)

- Zod validates base required fields and optional term/frequency.
- Schema uses passthrough mode, allowing dynamic top-level fields.
- Unknown top-level fields are preserved and forwarded to rule evaluation.

## 11. API Surface

Implementation: [src/routes/partnerRoutes.ts](src/routes/partnerRoutes.ts)

### GET /health

- Basic service liveness response.

### GET /v1/partners/:partnerId/schema

- Returns base request fields and partner defaults.

### GET /v1/partners/:partnerId/ruleset

- Returns current in-memory ruleset for partner.

### PUT /v1/partners/:partnerId/ruleset

- Appends rules to in-memory ruleset after validation/normalization.
- Returns totalRules and appendedRules.

### POST /v1/partners/:partnerId/financing-decisions

- Validates request
- Evaluates rules
- Returns either:
  - financeable false with errors
  - financeable true with summary and installments

## 12. Performance Instrumentation

- HTTP response timing is logged in Fastify hooks (milliseconds).
- Decision response includes:
  - total
  - ruleEvaluation
  - installmentCalculation

Server hooks and logging implementation: [src/server.ts](src/server.ts)

## 13. Configurability and Extensibility

### What is configurable via partner config only

- Partner defaults (termMonths, paymentFrequency)
- Rules and rule error messages
- Allowed values and thresholds through rule value config
- New partner-specific request fields (as top-level request properties)

### What still requires code changes

- New operator semantics beyond current operator set
- More complex boolean expression trees (AND/OR/NOT nesting is not in current model)
- Date-specific operator semantics
- External dependency checks

## 14. Requirement Coverage

Functional and technical requirements from the assignment are satisfied as follows:

- RESTful API endpoints implemented for schema, ruleset read/update, and decisions.
- Rule engine is partner-configurable and in-memory.
- Most rule additions are config-only (no code change needed).
- Financing decision returns errors or installment details depending on eligibility.
- Default term/frequency behavior implemented with request override support.
- Response-time instrumentation is present in logs and decision payload.
- No data persistence across restarts.

## 15. Known POC Risks

- No auth means endpoints are open in this POC.
- In-memory ruleset updates are process-local and non-durable.
- Concurrent writes are not coordinated across instances.
- Rule condition model intentionally favors simplicity over complex logic expressiveness.

## 16. Suggested Next Steps (Production Hardening)

- Add authentication/authorization and partner scoping.
- Persist partner rulesets in a durable datastore.
- Add idempotency and optimistic concurrency for ruleset updates.
- Add audit trail for rule changes.
- Add integration test suite and contract tests.
- Add richer rule expression grammar only if needed by product requirements.
