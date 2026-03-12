import {
  BusinessRule,
  Condition,
  DecisionError,
  FinancingRequest,
  RuleOperator,
} from "../types.js";
import { normalizeRuleCommand } from "./ruleCommands.js";

type NormalizedRuleEvaluationRequest = FinancingRequest & {
  termMonths: number;
  paymentFrequency: Exclude<FinancingRequest["paymentFrequency"], undefined>;
};

function getFactValue(request: NormalizedRuleEvaluationRequest, factPath: string): unknown {
  const source = request as Record<string, unknown>;

  const segments = factPath.split(".");
  let cursor: unknown = source;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function resolveFactValue(request: NormalizedRuleEvaluationRequest, factPath: string): unknown {
  const value = getFactValue(request, factPath);
  if (value !== undefined) {
    return value;
  }

  if (factPath.startsWith("attributes.")) {
    return getFactValue(request, factPath.slice("attributes.".length));
  }

  return undefined;
}

function isFactReference(value: unknown): value is { fact: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "fact" in value &&
    typeof (value as { fact?: unknown }).fact === "string"
  );
}

function resolveExpectedValue(
  request: NormalizedRuleEvaluationRequest,
  expectedValue: unknown,
): unknown {
  if (!isFactReference(expectedValue)) {
    return expectedValue;
  }

  return resolveFactValue(request, expectedValue.fact);
}

function evaluateAtomic(actualValue: unknown, operator: RuleOperator, expectedValue?: unknown): boolean {
  switch (operator) {
    case "eq":
      if (Array.isArray(expectedValue)) {
        return expectedValue.includes(actualValue as never);
      }
      return actualValue === expectedValue;
    case "neq":
      if (Array.isArray(expectedValue)) {
        return !expectedValue.includes(actualValue as never);
      }
      return actualValue !== expectedValue;
    case "gt":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue > expectedValue
        : false;
    case "gte":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue >= expectedValue
        : false;
    case "lt":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue < expectedValue
        : false;
    case "lte":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue <= expectedValue
        : false;
    case "in":
      return Array.isArray(expectedValue) ? expectedValue.includes(actualValue as never) : false;
    case "exists":
      return actualValue !== undefined && actualValue !== null;
    default:
      return false;
  }
}

function evaluateGenericCondition(request: NormalizedRuleEvaluationRequest, condition: Condition): boolean {
  return Object.entries(condition).every(([factPath, expression]) => {
    if (
      typeof expression !== "object" ||
      expression === null ||
      !("command" in expression) ||
      typeof (expression as { command?: unknown }).command !== "string"
    ) {
      return false;
    }

    const ruleExpression = expression as { command: string; value?: unknown };
    const operator = normalizeRuleCommand(ruleExpression.command);
    if (!operator) {
      return false;
    }

    const actualValue = resolveFactValue(request, factPath);
    const expectedValue = resolveExpectedValue(request, ruleExpression.value);
    return evaluateAtomic(actualValue, operator, expectedValue);
  });
}

export function evaluateCondition(
  request: NormalizedRuleEvaluationRequest,
  condition: Condition,
): boolean {
  return evaluateGenericCondition(request, condition);
}

export function evaluateRules(
  request: NormalizedRuleEvaluationRequest,
  rules: BusinessRule[],
): DecisionError[] {
  const errors: DecisionError[] = [];

  for (const rule of rules) {
    const matched = evaluateCondition(request, rule.condition);
    if (matched) {
      continue;
    }

    const actualValue =
      rule.error.field !== undefined
        ? resolveFactValue(request, rule.error.field)
        : undefined;

    errors.push({
      ...rule.error,
      actualValue,
    });
  }

  return errors;
}
