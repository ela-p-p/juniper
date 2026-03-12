import { PartnerConfig } from "../types.js";

export const partnerConfigs = new Map<string, PartnerConfig>([
  [
    "agency-a",
    {
      partnerId: "agency-a",
      name: "Agency A",
      defaults: {
        termMonths: 12,
        paymentFrequency: "MONTHLY",
      },
      rules: [
        {
          id: "require-payment-method-allowed-list",
          description: "Payment method must be one of the allowed methods",
          condition: {
            paymentMethod: {
              command: "one of",
              value: ["GOOGLE_WALLET", "CREDIT_CARD", "ACH"],
            },
          },
          error: {
            code: "PAYMENT_METHOD_NOT_ALLOWED",
            message: "Payment method is not allowed",
            field: "paymentMethod",
            expectedCondition: "paymentMethod one of [GOOGLE_WALLET, CREDIT_CARD, ACH]",
          },
        },
        {
          id: "require-policy-type-allowed-list",
          description: "Policy type must be one of the allowed policy types",
          condition: {
            policyType: {
              command: "one of",
              value: ["HOTEL", "AUTO", "HOME"],
            },
          },
          error: {
            code: "POLICY_TYPE_NOT_ALLOWED",
            message: "Policy type is not allowed",
            field: "policyType",
            expectedCondition: "policyType one of [HOTEL, AUTO, HOME]",
          },
        },
        {
          id: "require-amount-lte-input-amount",
          description: "Amount must be less than or equal to input amount limit",
          condition: {
            amount: {
              command: "less than or equal",
              value: { fact: "inputAmountLimit" },
            },
          },
          error: {
            code: "AMOUNT_CAP_EXCEEDED",
            message: "Amount exceeds partner cap",
            field: "amount",
            expectedCondition: "amount <= inputAmountLimit",
          },
        },
      ],
    },
  ],
  [
    "agency-b",
    {
      partnerId: "agency-b",
      name: "Agency B",
      defaults: {
        termMonths: 12,
        paymentFrequency: "MONTHLY",
      },
      rules: [
        {
          id: "require-non-cash-payment",
          description: "Cash payment method is excluded from financing",
          condition: {
            paymentMethod: { command: "not equals", value: "CASH" },
          },
          error: {
            code: "PAYMENT_METHOD_NOT_ALLOWED",
            message: "CASH payments are not financeable",
            field: "paymentMethod",
            expectedCondition: "paymentMethod != CASH",
          },
        },
      ],
    },
  ],
]);

export function getPartnerConfig(partnerId: string): PartnerConfig | undefined {
  return partnerConfigs.get(partnerId);
}
