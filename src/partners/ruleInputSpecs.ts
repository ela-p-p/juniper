import { normalizeRuleCommand } from "../engine/ruleCommands.js";
import { PartnerConfig } from "../types.js";

interface RuleInputSpec {
  field: string;
  command: string;
  allowedValues?: unknown[];
}

export function getRuleInputSpecs(partner: PartnerConfig): RuleInputSpec[] {
  const specs = new Map<string, RuleInputSpec>();

  for (const rule of partner.rules) {
    for (const [field, expression] of Object.entries(rule.condition)) {
      const normalizedCommand = normalizeRuleCommand(expression.command);
      const existing = specs.get(field);

      if (!existing) {
        specs.set(field, {
          field,
          command: expression.command,
          ...(normalizedCommand === "in" && Array.isArray(expression.value)
            ? { allowedValues: expression.value }
            : {}),
        });
        continue;
      }

      if (
        existing.allowedValues === undefined &&
        normalizedCommand === "in" &&
        Array.isArray(expression.value)
      ) {
        existing.allowedValues = expression.value;
      }
    }
  }

  return [...specs.values()];
}
