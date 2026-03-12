import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPartnerConfig, partnerConfigs } from "../config/partners.js";
import { buildFinancingDecision } from "../engine/buildDecision.js";
import { normalizeRuleCommand } from "../engine/ruleCommands.js";
import { validateFinancingRequest } from "../engine/validateRequest.js";
import { BusinessRule, DecisionError, PartnerConfig } from "../types.js";

const pathParamsSchema = z.object({
  partnerId: z.string().min(1),
});

const rulesetAppendPayloadSchema = z.object({
  partnerId: z.string().min(1),
  rules: z.array(z.record(z.string(), z.unknown())),
});

interface RulesetValidationIssue {
  path: string;
  message: string;
}

interface RuleInputSpec {
  field: string;
  command: string;
  allowedValues?: unknown[];
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

function getRuleInputSpecs(partner: PartnerConfig): RuleInputSpec[] {
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

function normalizeIncomingRules(
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

export async function registerPartnerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/partners/:partnerId/schema", async (request, reply) => {
    const params = pathParamsSchema.parse(request.params);
    const partner = getPartnerConfig(params.partnerId);

    if (!partner) {
      return reply.code(404).send({ message: "Unknown partnerId" });
    }

    return {
      partnerId: partner.partnerId,
      defaults: partner.defaults,
      baseRequestFields: {
        amount: "number > 0",
        currency: "string",
        policyType: "string",
        paymentMethod: "string",
        termMonths: "number (optional)",
        paymentFrequency: "MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL (optional)",
        additionalFields: "any additional top-level partner fields (optional)",
      },
      ruleInputs: getRuleInputSpecs(partner),
    };
  });

  app.get("/v1/partners/:partnerId/ruleset", async (request, reply) => {
    const params = pathParamsSchema.parse(request.params);
    const partner = getPartnerConfig(params.partnerId);

    if (!partner) {
      return reply.code(404).send({ message: "Unknown partnerId" });
    }

    return {
      partnerId: partner.partnerId,
      name: partner.name,
      defaults: partner.defaults,
      rules: partner.rules,
    };
  });

  app.put("/v1/partners/:partnerId/ruleset", async (request, reply) => {
    const params = pathParamsSchema.parse(request.params);
    const payloadResult = rulesetAppendPayloadSchema.safeParse(request.body);
    const existing = getPartnerConfig(params.partnerId);

    if (!existing) {
      return reply.code(404).send({ message: "Unknown partnerId" });
    }

    if (!payloadResult.success) {
      return reply.code(400).send({
        message: "Invalid ruleset payload",
        errors: payloadResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const payload = payloadResult.data;

    if (payload.partnerId !== params.partnerId) {
      return reply.code(400).send({
        message: "payload.partnerId must match :partnerId",
      });
    }

    const { normalizedRules, issues } = normalizeIncomingRules(payload.rules);
    if (issues.length > 0) {
      return reply.code(400).send({
        message: "Invalid ruleset commands",
        errors: issues,
      });
    }

    const updatedPartner: PartnerConfig = {
      ...existing,
      rules: [...existing.rules, ...normalizedRules],
    };

    partnerConfigs.set(params.partnerId, updatedPartner);
    return {
      message: "Rules appended in-memory",
      partnerId: params.partnerId,
      totalRules: updatedPartner.rules.length,
      appendedRules: normalizedRules.length,
    };
  });

  app.post("/v1/partners/:partnerId/financing-decisions", async (request, reply) => {
    const params = pathParamsSchema.parse(request.params);
    const partner = getPartnerConfig(params.partnerId);

    if (!partner) {
      return reply.code(404).send({ message: "Unknown partnerId" });
    }

    const validation = validateFinancingRequest(request.body);
    if (!validation.ok) {
      return reply.code(400).send({
        partnerId: partner.partnerId,
        financeable: false,
        errors: validation.errors,
      });
    }

    const decision = buildFinancingDecision(validation.value, partner);
    app.log.info(
      {
        event: "financing.decision",
        partnerId: decision.partnerId,
        financeable: decision.financeable,
        totalMs: decision.timingMs.total,
        ruleMs: decision.timingMs.ruleEvaluation,
        installmentMs: decision.timingMs.installmentCalculation,
      },
      "Processed financing decision",
    );

    return reply.code(200).send(decision);
  });
}
