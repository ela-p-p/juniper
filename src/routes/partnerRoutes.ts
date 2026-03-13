import { FastifyInstance } from "fastify";
import { getPartnerConfig, partnerConfigs } from "../config/partners.js";
import { buildFinancingDecision } from "../engine/buildDecision.js";
import { validateFinancingRequest } from "../engine/validateRequest.js";
import { pathParamsSchema, rulesetAppendPayloadSchema } from "../partners/partnerSchemas.js";
import { getRuleInputSpecs } from "../partners/ruleInputSpecs.js";
import { normalizeIncomingRules } from "../partners/rulesetNormalization.js";
import { PartnerConfig } from "../types.js";

export async function registerPartnerRoutes(app: FastifyInstance): Promise<void> {
  // API: Returns request defaults, base fields, and rule-derived input hints for a partner.
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

  // API: Returns the active in-memory ruleset and defaults for a partner.
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

  // API: Validates and appends new rules into the in-memory partner ruleset.
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

  // API: Evaluates financing eligibility and returns either decline errors or installment terms.
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
