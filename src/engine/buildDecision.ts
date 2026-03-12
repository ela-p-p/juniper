import { randomUUID } from "crypto";
import {
  DecisionError,
  FinancingDecisionResponse,
  FinancingRequest,
  PartnerConfig,
  PaymentFrequency,
} from "../types.js";
import { evaluateRules } from "./evaluateRules.js";
import { calculateInstallments, getInstallmentCount } from "./installments.js";

const frequencyIntervalMonths: Record<PaymentFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildFinancingDecision(
  request: FinancingRequest,
  partnerConfig: PartnerConfig,
): FinancingDecisionResponse {
  const totalStart = performance.now();

  const termMonths = request.termMonths ?? partnerConfig.defaults.termMonths;
  const paymentFrequency =
    request.paymentFrequency ?? partnerConfig.defaults.paymentFrequency;

  const effectiveRequest: FinancingRequest & {
    termMonths: number;
    paymentFrequency: PaymentFrequency;
  } = {
    ...request,
    termMonths,
    paymentFrequency,
  };

  const errors: DecisionError[] = [];
  const interval = frequencyIntervalMonths[paymentFrequency];
  if (termMonths % interval !== 0) {
    errors.push({
      code: "TERM_FREQUENCY_MISMATCH",
      message: "termMonths must be divisible by selected paymentFrequency interval",
      field: "termMonths",
      actualValue: termMonths,
      expectedCondition: `termMonths % ${interval} == 0`,
    });
  }

  const ruleStart = performance.now();
  const ruleErrors = evaluateRules(effectiveRequest, partnerConfig.rules);
  const ruleEvaluationMs = round2(performance.now() - ruleStart);

  errors.push(...ruleErrors);

  if (errors.length > 0) {
    return {
      decisionId: randomUUID(),
      partnerId: partnerConfig.partnerId,
      financeable: false,
      errors,
      timingMs: {
        total: round2(performance.now() - totalStart),
        ruleEvaluation: ruleEvaluationMs,
        installmentCalculation: 0,
      },
    };
  }

  const installmentStart = performance.now();
  const installments = calculateInstallments(
    effectiveRequest.amount,
    effectiveRequest.termMonths,
    effectiveRequest.paymentFrequency,
  );
  const installmentCalculationMs = round2(performance.now() - installmentStart);

  return {
    decisionId: randomUUID(),
    partnerId: partnerConfig.partnerId,
    financeable: true,
    summary: {
      amountFinanced: round2(effectiveRequest.amount),
      currency: effectiveRequest.currency,
      termMonths: effectiveRequest.termMonths,
      paymentFrequency: effectiveRequest.paymentFrequency,
      installmentCount: getInstallmentCount(
        effectiveRequest.termMonths,
        effectiveRequest.paymentFrequency,
      ),
      installmentAmount: installments[0]?.dueAmount ?? 0,
    },
    installments,
    errors: [],
    timingMs: {
      total: round2(performance.now() - totalStart),
      ruleEvaluation: ruleEvaluationMs,
      installmentCalculation: installmentCalculationMs,
    },
  };
}
