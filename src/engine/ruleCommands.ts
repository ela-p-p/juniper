import { RuleOperator } from "../types.js";

const commandAliases: Record<string, RuleOperator> = {
  eq: "eq",
  equals: "eq",
  equal: "eq",
  neq: "neq",
  "not equals": "neq",
  "not equal": "neq",
  gt: "gt",
  "greater than": "gt",
  gte: "gte",
  "greater than or equal": "gte",
  lt: "lt",
  "less than": "lt",
  lte: "lte",
  "less than or equal": "lte",
  in: "in",
  "one of": "in",
  "in list": "in",
  exists: "exists",
};

export function normalizeRuleCommand(command: string): RuleOperator | undefined {
  const normalized = command
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  return commandAliases[normalized];
}
