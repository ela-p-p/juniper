import { normalizeRuleCommand } from "../engine/ruleCommands.js";
import { BusinessRule, DecisionError } from "../types.js";

export interface RulesetValidationIssue {
  path: string;
  message: string;
}

const reservedRuleKeys = new Set([
  "id",
  "description",
  "condition",
  "error",
  "field",
  "command",
  "value",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "rule";
}

function getPrimaryConditionField(condition: unknown): string | undefined {
  if (!isRecord(condition)) {
    return undefined;
  }

  return Object.keys(condition)[0];
}

function getPrimaryConditionCommand(condition: unknown): string | undefined {
  if (!isRecord(condition)) {
    return undefined;
  }

  const genericExpression = Object.values(condition)[0];
  if (!isRecord(genericExpression) || typeof genericExpression.command !== "string") {
    return undefined;
  }

  return genericExpression.command;
}

function extractCondition(ruleCandidate: Record<string, unknown>): unknown | undefined {
  if (ruleCandidate.condition !== undefined) {
    if (!isRecord(ruleCandidate.condition)) {
      return undefined;
    }
    return ruleCandidate.condition;
  }

  if (
    typeof ruleCandidate.field === "string" &&
    typeof ruleCandidate.command === "string"
  ) {
    return {
      [ruleCandidate.field]: {
        command: ruleCandidate.command,
        value: ruleCandidate.value,
      },
    };
  }

  const genericEntries = Object.entries(ruleCandidate).filter(
    ([key]) => !reservedRuleKeys.has(key),
  );
  if (genericEntries.length === 0) {
    return undefined;
  }

  const isGenericCondition = genericEntries.every(([, value]) => {
    return isRecord(value) && typeof value.command === "string";
  });

  if (!isGenericCondition) {
    return undefined;
  }

  return Object.fromEntries(genericEntries);
}

function buildRuleError(
  ruleCandidate: Record<string, unknown>,
  field: string,
  command: string,
): DecisionError {
  const inputError = isRecord(ruleCandidate.error) ? ruleCandidate.error : {};

  return {
    code:
      typeof inputError.code === "string"
        ? inputError.code
        : "RULE_REQUIRED_CHECK_FAILED",
    message:
      typeof inputError.message === "string"
        ? inputError.message
        : "Required rule check failed",
    field: typeof inputError.field === "string" ? inputError.field : field,
    expectedCondition:
      typeof inputError.expectedCondition === "string"
        ? inputError.expectedCondition
        : `${field} ${command}`,
  };
}

function buildRuleBlock(
  ruleCandidate: Record<string, unknown>,
  condition: unknown,
  uniqueSuffix: string,
): BusinessRule {
  const field = getPrimaryConditionField(condition) ?? "rule";
  const command = getPrimaryConditionCommand(condition) ?? "check";
  const generatedId = `rule-${slugify(field)}-${slugify(command)}-${uniqueSuffix}`;

  return {
    id:
      typeof ruleCandidate.id === "string" && ruleCandidate.id.trim().length > 0
        ? ruleCandidate.id
        : generatedId,
    description:
      typeof ruleCandidate.description === "string" && ruleCandidate.description.trim().length > 0
        ? ruleCandidate.description
        : `Require ${field} ${command}`,
    condition: condition as BusinessRule["condition"],
    error: buildRuleError(ruleCandidate, field, command),
  };
}

function validateConditionCommands(
  condition: unknown,
  path: string,
  issues: RulesetValidationIssue[],
): void {
  if (!isRecord(condition)) {
    issues.push({
      path,
      message: "Condition must be an object",
    });
    return;
  }

  const entries = Object.entries(condition);
  if (entries.length === 0) {
    issues.push({
      path,
      message: "Generic condition cannot be empty",
    });
    return;
  }

  entries.forEach(([factPath, expression]) => {
    const expressionPath = `${path}.${factPath}`;
    if (!isRecord(expression)) {
      issues.push({
        path: expressionPath,
        message: "Rule expression must be an object with command and value",
      });
      return;
    }

    if (typeof expression.command !== "string") {
      issues.push({
        path: `${expressionPath}.command`,
        message: "command must be a string",
      });
      return;
    }

    if (!normalizeRuleCommand(expression.command)) {
      issues.push({
        path: `${expressionPath}.command`,
        message:
          "Unsupported command. Use eq/neq/gt/gte/lt/lte/in/exists or aliases like equals, greater than, one of",
      });
      return;
    }

    const normalizedCommand = normalizeRuleCommand(expression.command);
    if (normalizedCommand === "in" && !Array.isArray(expression.value)) {
      issues.push({
        path: `${expressionPath}.value`,
        message: "value must be an array when command is one of/in",
      });
    }
  });
}

export function normalizeIncomingRules(
  incomingRules: Record<string, unknown>[],
): { normalizedRules: BusinessRule[]; issues: RulesetValidationIssue[] } {
  const issues: RulesetValidationIssue[] = [];
  const normalizedRules: BusinessRule[] = [];

  incomingRules.forEach((rule, index) => {
    const condition = extractCondition(rule);
    if (condition === undefined) {
      issues.push({
        path: `rules[${index}]`,
        message:
          "Rule must include condition, field+command+value, or generic command map",
      });
      return;
    }

    const conditionPath = rule.condition !== undefined
      ? `rules[${index}].condition`
      : `rules[${index}]`;
    const conditionIssues: RulesetValidationIssue[] = [];
    validateConditionCommands(condition, conditionPath, conditionIssues);
    if (conditionIssues.length > 0) {
      issues.push(...conditionIssues);
      return;
    }

    normalizedRules.push(
      buildRuleBlock(rule, condition, `${Date.now()}-${index}`),
    );
  });

  return {
    normalizedRules,
    issues: [],
  };
}
