import { z } from "zod";
import { DecisionError, FinancingRequest } from "../types.js";

const baseSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(1),
  policyType: z.string().min(1),
  paymentMethod: z.string().min(1),
  termMonths: z.number().int().positive().optional(),
  paymentFrequency: z
    .enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"])
    .optional(),
}).passthrough();

const coreRequestFields = new Set([
  "amount",
  "currency",
  "policyType",
  "paymentMethod",
  "termMonths",
  "paymentFrequency",
]);

export function validateFinancingRequest(
  payload: unknown,
):
  | { ok: true; value: FinancingRequest }
  | { ok: false; errors: DecisionError[] } {
  const parsed = baseSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        code: "INVALID_REQUEST",
        message: issue.message,
        field: issue.path.join("."),
      })),
    };
  }

  const request = parsed.data as FinancingRequest & Record<string, unknown>;
  const additionalTopLevelFields = Object.fromEntries(
    Object.entries(request).filter(([key]) => !coreRequestFields.has(key)),
  );

  return {
    ok: true,
    value: {
      amount: request.amount,
      currency: request.currency,
      policyType: request.policyType,
      paymentMethod: request.paymentMethod,
      termMonths: request.termMonths,
      paymentFrequency: request.paymentFrequency,
      ...additionalTopLevelFields,
    },
  };
}
