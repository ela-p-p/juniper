import { InstallmentEntry, PaymentFrequency } from "../types.js";

const frequencyToIntervalMonths: Record<PaymentFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateInstallments(
  amount: number,
  termMonths: number,
  paymentFrequency: PaymentFrequency,
): InstallmentEntry[] {
  const interval = frequencyToIntervalMonths[paymentFrequency];
  const installmentCount = termMonths / interval;
  const baseInstallment = round2(amount / installmentCount);

  const installments: InstallmentEntry[] = [];
  for (let dueNumber = 1; dueNumber <= installmentCount; dueNumber++) {
    const dueAmount =
      dueNumber === installmentCount
        ? round2(amount - baseInstallment * (installmentCount - 1))
        : baseInstallment;

    installments.push({
      dueNumber,
      dueAmount,
      dueEveryMonths: interval,
    });
  }

  return installments;
}

export function getInstallmentCount(
  termMonths: number,
  paymentFrequency: PaymentFrequency,
): number {
  return termMonths / frequencyToIntervalMonths[paymentFrequency];
}
